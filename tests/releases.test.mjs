import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const config = JSON.parse(read('release-please-config.json'));
const manifest = JSON.parse(read('.release-please-manifest.json'));
const pkg = config.packages['.'];

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

test('bootstrap and temporary override allow first release and later cleanup', () => {
  assert.equal(config['bootstrap-sha'], '1cf401a8b93b6be048e66179f7683d8ffff9efa6');
  if (pkg['release-as'] !== undefined) {
    assert.equal(pkg['release-as'], '0.1.0');
    assert.ok(['0.0.0', '0.1.0'].includes(manifest['.']), 'remove the first-release override');
  } else {
    assert.notEqual(manifest['.'], '0.0.0', 'publish the first release before cleanup');
  }
  const cleaned = structuredClone(config);
  delete cleaned.packages['.']['release-as'];
  assert.equal(cleaned.packages['.']['release-as'], undefined);
  assert.equal(cleaned['bootstrap-sha'], config['bootstrap-sha']);
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
