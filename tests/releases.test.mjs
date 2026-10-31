import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { APP_VERSION, isValidAppVersion } from '../frontend/src/app-version.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const config = JSON.parse(read('release-please-config.json'));
const manifest = JSON.parse(read('.release-please-manifest.json'));
const pkg = config.packages['.'];

test('deployed version copies and generic markers agree with the release source', () => {
  assert.ok(isValidAppVersion(APP_VERSION));
  assert.equal(APP_VERSION, read('version.txt').trim());
  assert.equal(APP_VERSION, manifest['.']);
  assert.deepEqual(pkg['extra-files'], [
    { type: 'generic', path: 'frontend/src/app-version.mjs' },
    { type: 'generic', path: 'frontend/service-worker.js' },
  ]);
  for (const path of ['frontend/src/app-version.mjs', 'frontend/service-worker.js']) {
    const source = read(path);
    const declarations = source.matchAll(
      /^(?:export )?const APP_VERSION = '([^']+)'; \/\/ x-release-please-version$/gm,
    );
    assert.deepEqual(
      [...declarations].map((match) => match[1]),
      [APP_VERSION],
      path,
    );
    assert.equal(source.match(/x-release-please-version/g)?.length, 1, path);
  }
  assert.match(read('frontend/service-worker.js'), /^const SHELL_REVISION = '[1-9]\d*';$/m);
});

test('version validation accepts only bounded stable release identities', () => {
  for (const value of ['0.0.0', '0.1.0', '1.2.3', '100.200.300']) {
    assert.equal(isValidAppVersion(value), true, value);
  }
  for (const value of [
    null,
    undefined,
    123,
    {},
    '',
    '1.2',
    'v1.2.3',
    '01.2.3',
    '1.02.3',
    '1.2.03',
    '1.2.3-beta.1',
    '1.2.3+build',
    ' 1.2.3',
    '1.2.3\n',
    '1.2.3/../../other',
    'https://example.invalid/1.2.3',
    `${'1'.repeat(65)}.2.3`,
  ]) {
    assert.equal(isValidAppVersion(value), false, String(value));
  }
});

test('one simple application owns the version, manifest, changelog and v tags', () => {
  assert.deepEqual(Object.keys(config.packages), ['.']);
  assert.deepEqual(Object.keys(manifest), ['.']);
  assert.match(manifest['.'], /^\d+\.\d+\.\d+$/);
  assert.equal(read('version.txt'), `${manifest['.']}\n`);
  assert.equal(pkg['release-type'], 'simple');
  assert.equal(pkg['version-file'], 'version.txt');
  assert.equal(pkg['changelog-path'], 'CHANGELOG.md');
  assert.equal(pkg['include-component-in-tag'], false);
  assert.equal(pkg['include-v-in-tag'], true);
  assert.equal(pkg.draft, false);
  assert.equal(pkg.prerelease, false);
  assert.equal(pkg['bump-minor-pre-major'], true);
  assert.equal(pkg['bump-patch-for-minor-pre-major'], false);
  assert.equal(JSON.parse(read('package.json')).version, undefined);
  assert.equal(JSON.parse(read('package-lock.json')).packages[''].version, undefined);
});

test('first-release override is restricted to the unreleased seed', () => {
  assert.equal(config['bootstrap-sha'], '1cf401a8b93b6be048e66179f7683d8ffff9efa6');
  const assertOverrideState = (version, releaseAs) => {
    if (releaseAs === undefined) {
      assert.notEqual(version, '0.0.0', 'publish the first release before cleanup');
      return;
    }
    assert.equal(releaseAs, '0.1.0');
    assert.equal(version, '0.0.0', 'remove the first-release override');
  };
  assertOverrideState(manifest['.'], pkg['release-as']);
  assert.doesNotThrow(() => assertOverrideState('0.0.0', '0.1.0'));
  assert.throws(
    () => assertOverrideState('0.1.0', '0.1.0'),
    /remove the first-release override/,
    'a published 0.1.0 config must reject the obsolete override',
  );
});

test('release instructions cover setup, current-head CI, cleanup and recovery', () => {
  const docs = read('docs/releases.md').replace(/\s+/g, ' ');
  for (const required of [
    'Allow GitHub Actions to create and approve pull requests',
    'organization',
    'Quality',
    'Tests',
    'Dependency security',
    'close and reopen',
    'pull_request: reopened',
    'head SHA',
    'every subsequent bot update',
    'release-as',
    'Mandatory follow-up',
    'existing pending release PR',
    'Do not manually edit its title or body',
    'autorelease: pending',
    'BREAKING CHANGE:',
    'feat!',
    'Never delete or move a published tag',
    'disable **Release please**',
    'post-merge operational smoke test',
  ]) {
    assert.ok(docs.includes(required), `missing maintainer instruction: ${required}`);
  }
  assert.match(read('README.md'), /\]\(docs\/releases\.md\)/);
  assert.match(read('AGENTS.md'), /type: description.*type\(scope\): description/);
  assert.match(read('AGENTS.md'), /BREAKING CHANGE:/);
});
