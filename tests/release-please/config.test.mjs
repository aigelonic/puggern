import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Ajv from 'ajv';
import { parse } from 'yaml';
import releasePlease from 'release-please';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const config = JSON.parse(read('release-please-config.json'));

test('configuration and manifest match the selected upstream schemas', () => {
  const ajv = new Ajv({ strict: false, formats: { 'uri-reference': true } });
  for (const [schema, value] of [
    [releasePlease.configSchema, config],
    [releasePlease.manifestSchema, JSON.parse(read('.release-please-manifest.json'))],
  ]) {
    const validate = ajv.compile(schema);
    assert.ok(validate(value), JSON.stringify(validate.errors));
  }
  assert.equal(releasePlease.VERSION, '17.6.0');
  assert.equal(
    config.$schema,
    'https://raw.githubusercontent.com/googleapis/release-please/v17.6.0/schemas/config.json',
  );
});

test('release workflow is main-only, serialized and least-privilege', () => {
  const workflow = parse(read('.github/workflows/release-please.yml'));
  assert.deepEqual(Object.keys(workflow.on).sort(), ['push', 'workflow_dispatch']);
  assert.deepEqual(workflow.on.push, { branches: ['main'] });
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(workflow.concurrency, {
    group: 'release-please-main',
    'cancel-in-progress': false,
  });
  assert.deepEqual(Object.keys(workflow.jobs), ['release']);
  const job = workflow.jobs.release;
  assert.equal(job.if, "github.ref == 'refs/heads/main'");
  assert.deepEqual(job.permissions, {
    contents: 'write',
    'pull-requests': 'write',
    issues: 'write',
  });
  assert.equal(job.steps.length, 1);
  assert.equal(
    job.steps[0].uses,
    'googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7',
  );
  assert.deepEqual(job.steps[0].with, {
    token: '${{ secrets.GITHUB_TOKEN }}',
    'target-branch': 'main',
    'config-file': 'release-please-config.json',
    'manifest-file': '.release-please-manifest.json',
  });
});

test('ordinary CI retains all required checks, reopen events and container coverage', () => {
  const ci = parse(read('.github/workflows/tests.yml'));
  assert.equal(ci.on.pull_request, null, 'unfiltered PR events include reopened');
  assert.deepEqual(ci.on.push, { branches: ['main'] });
  assert.deepEqual(ci.permissions, { contents: 'read' });
  assert.deepEqual(
    Object.values(ci.jobs).map((job) => job.name),
    [
      'Quality',
      'Unit',
      'Release planning',
      'E2E',
      'E2E production',
      'Tests',
      'Dependency security',
    ],
  );
  for (const [id, job] of Object.entries(ci.jobs)) {
    assert.equal(job.if, id === 'tests' ? 'always()' : undefined);
    assert.equal(job['runs-on'], 'ubuntu-latest');
    assert.ok(Object.values(job.permissions ?? {}).every((permission) => permission === 'read'));
  }
  const commands = ci.jobs['e2e-production'].steps.map((step) => step.run ?? '').join('\n');
  for (const expected of [
    'docker run -d --name puggern-test -p 127.0.0.1:8080:8080 puggern:test',
    'curl --fail --retry 10 --retry-all-errors --retry-delay 1 http://127.0.0.1:8080/healthz',
    'PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npm run test:e2e',
    'tests/e2e/modules.spec.mjs tests/e2e/profiles.spec.mjs tests/e2e/service-worker.spec.mjs tests/e2e/production-update.spec.mjs',
  ]) {
    assert.ok(commands.includes(expected), `missing existing or release check: ${expected}`);
  }
  const cleanup = ci.jobs['e2e-production'].steps.at(-1);
  assert.equal(cleanup.if, 'always()');
  assert.equal(cleanup.run, 'docker rm -f puggern-test || true');
  for (const [id, expected] of [
    ['quality', ['npm run lint', 'npm run format:check']],
    [
      'dependency-security',
      [
        'npm audit --audit-level=moderate',
        'npm audit --prefix tests/release-please --audit-level=moderate',
      ],
    ],
  ]) {
    const runs = ci.jobs[id].steps.map((step) => step.run);
    for (const command of expected) assert.ok(runs.includes(command));
  }
  const review = ci.jobs['dependency-security'].steps.at(-1);
  assert.equal(review.if, "github.event_name == 'pull_request'");
  assert.equal(review.uses, 'actions/dependency-review-action@v5');
  assert.equal(review.with['fail-on-severity'], 'moderate');
});

test('test jobs start independently and install only their own dependencies', () => {
  const ci = parse(read('.github/workflows/tests.yml'));
  for (const id of ['unit', 'release-planning', 'e2e', 'e2e-production']) {
    const job = ci.jobs[id];
    assert.equal(job.needs, undefined);
    const setup = job.steps.find((step) => step.uses?.startsWith('actions/setup-node@'));
    assert.equal(setup.with['node-version'], 24);
    assert.equal(setup.with.cache, 'npm');
    const runs = job.steps.map((step) => step.run ?? '');
    assert.ok(
      runs.includes(id === 'release-planning' ? 'npm ci --prefix tests/release-please' : 'npm ci'),
    );
    if (id === 'release-planning') {
      assert.equal(setup.with['cache-dependency-path'], 'tests/release-please/package-lock.json');
      assert.ok(runs.includes('node --test tests/release-please/*.test.mjs'));
      assert.ok(!runs.includes('npm ci'));
    } else {
      assert.ok(!runs.some((run) => run.includes('tests/release-please')));
    }
    if (id === 'unit' || id === 'release-planning') {
      assert.ok(!runs.some((run) => run.includes('playwright')));
      assert.ok(!job.steps.some((step) => step.uses?.startsWith('docker/')));
    }
  }
  assert.ok(ci.jobs.unit.steps.some((step) => step.run === 'npm run test:unit'));
  assert.ok(ci.jobs.e2e.steps.some((step) => step.run === 'npm run test:e2e'));
});

test('CI cancels only superseded PR runs and caches exact browser and Docker inputs', () => {
  const ci = parse(read('.github/workflows/tests.yml'));
  assert.deepEqual(ci.concurrency, {
    group: 'ci-${{ github.workflow }}-${{ github.ref }}',
    'cancel-in-progress': "${{ github.event_name == 'pull_request' }}",
  });
  for (const id of ['e2e', 'e2e-production']) {
    const steps = ci.jobs[id].steps;
    const version = steps.findIndex((step) => step.id === 'playwright');
    const cache = steps.findIndex((step) => step.uses?.startsWith('actions/cache@'));
    const install = steps.findIndex(
      (step) => step.run === 'npx playwright install --with-deps chromium',
    );
    assert.ok(version > steps.findIndex((step) => step.run === 'npm ci'));
    assert.match(steps[version].run, /require\('playwright\/package.json'\)\.version/);
    assert.match(steps[version].run, /GITHUB_OUTPUT/);
    assert.ok(cache > version && install > cache);
    assert.equal(steps[cache].with.path, '~/.cache/ms-playwright');
    assert.equal(
      steps[cache].with.key,
      "${{ runner.os }}-playwright-${{ steps.playwright.outputs.version }}-${{ hashFiles('package-lock.json') }}",
    );
    assert.equal(steps[cache].with['restore-keys'], undefined);
    assert.equal(
      steps[install].if,
      undefined,
      'system dependencies are installed even on cache hits',
    );
  }
  const steps = ci.jobs['e2e-production'].steps;
  const setup = steps.findIndex((step) => step.uses?.startsWith('docker/setup-buildx-action@'));
  const build = steps.findIndex((step) => step.uses?.startsWith('docker/build-push-action@'));
  assert.ok(setup >= 0 && build > setup);
  assert.deepEqual(steps[build].with, {
    context: '.',
    load: true,
    tags: 'puggern:test',
    'cache-from': 'type=gha,scope=e2e-production',
    'cache-to': 'type=gha,mode=max,scope=e2e-production',
  });
});

test('the stable Tests gate rejects failed, canceled and skipped dependencies', () => {
  const { tests } = parse(read('.github/workflows/tests.yml')).jobs;
  assert.deepEqual(tests.needs, ['unit', 'release-planning', 'e2e', 'e2e-production']);
  assert.equal(tests.if, 'always()');
  assert.equal(tests.steps.length, 1);
  const check = (results) => {
    const script = tests.steps[0].run.replace(
      /\$\{\{ needs\.([\w-]+)\.result \}\}/g,
      (_, id) => results[id],
    );
    return spawnSync('bash', ['-e', '-c', script]).status;
  };
  const success = Object.fromEntries(tests.needs.map((id) => [id, 'success']));
  assert.equal(check(success), 0);
  for (const id of tests.needs) {
    for (const result of ['failure', 'cancelled', 'skipped']) {
      assert.notEqual(check({ ...success, [id]: result }), 0, `${id}: ${result}`);
    }
  }
});
