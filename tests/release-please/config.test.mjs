import assert from 'node:assert/strict';
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
    ['Quality', 'Tests', 'Dependency security'],
  );
  for (const job of Object.values(ci.jobs)) {
    assert.equal(job.if, undefined);
    assert.ok(Object.values(job.permissions ?? {}).every((permission) => permission === 'read'));
  }
  const commands = ci.jobs.tests.steps.map((step) => step.run ?? '').join('\n');
  for (const expected of [
    'npm test',
    'docker build -t puggern:test .',
    'docker run -d --name puggern-test -p 127.0.0.1:8080:8080 puggern:test',
    'PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npm run test:e2e',
    'tests/e2e/modules.spec.mjs tests/e2e/profiles.spec.mjs tests/e2e/service-worker.spec.mjs tests/e2e/production-update.spec.mjs',
    'node --test tests/release-please/*.test.mjs',
  ]) {
    assert.ok(commands.includes(expected), `missing existing or release check: ${expected}`);
  }
});
