import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import releasePlease from 'release-please';
import { check } from 'prettier';

const sourceConfig = JSON.parse(
  readFileSync(new URL('../../release-please-config.json', import.meta.url), 'utf8'),
);
const { Manifest, setLogger } = releasePlease;
setLogger({ info() {}, warn() {}, debug() {}, error() {} });

function fixture({ version = '0.0.0', initial = false, messages = [] } = {}) {
  const config = structuredClone(sourceConfig);
  if (initial) config.packages['.']['release-as'] = '0.1.0';
  else delete config.packages['.']['release-as'];
  const boundary = initial ? config['bootstrap-sha'] : 'b'.repeat(40);
  const files = new Map([
    ['release-please-config.json', JSON.stringify(config)],
    ['.release-please-manifest.json', JSON.stringify({ '.': version }) + '\n'],
    ['version.txt', `${version}\n`],
    [
      'frontend/src/app-version.mjs',
      `export const APP_VERSION = '${version}'; // x-release-please-version\n`,
    ],
    [
      'frontend/service-worker.js',
      `const APP_VERSION = '${version}'; // x-release-please-version\nconst SHELL_REVISION = '13';\n`,
    ],
  ]);
  const commits = [];
  let sequence = 0;
  const addCommit = (message, sha = (++sequence).toString(16).padStart(40, '0')) => {
    commits.unshift({ sha, message, files: ['frontend/index.html'] });
  };
  addCommit('feat: excluded historical feature', 'a'.repeat(40));
  addCommit('feat: excluded boundary feature', boundary);
  for (const message of messages) addCommit(message);
  const releases = initial
    ? []
    : [{ tagName: `v${version}`, name: `v${version}`, sha: boundary, notes: '' }];
  const pulls = [];
  const writes = { created: 0, updated: 0, published: 0 };
  const render = (updates) =>
    new Map(updates.map(({ path, updater }) => [path, updater.updateContent(files.get(path))]));
  const github = {
    repository: { owner: 'fixture', repo: 'application', defaultBranch: 'main' },
    async getFileJson(path, branch) {
      assert.equal(branch, 'main');
      assert.ok(files.has(path), `unexpected file request: ${path}`);
      return JSON.parse(files.get(path));
    },
    async *releaseIterator() {
      yield* releases;
    },
    async *tagIterator() {
      yield* releases.map(({ tagName, sha }) => ({ name: tagName, sha }));
    },
    async *mergeCommitIterator(branch) {
      assert.equal(branch, 'main');
      yield* commits;
    },
    async *pullRequestIterator(branch, status) {
      assert.equal(branch, 'main');
      yield* pulls.filter((pull) => pull.state === status);
    },
    async createPullRequest(pull, branch, message, updates) {
      assert.equal(branch, 'main');
      assert.equal(message, pull.title);
      writes.created++;
      const created = { ...pull, number: 1, state: 'OPEN', generated: render(updates) };
      pulls.push(created);
      return created;
    },
    async updatePullRequest(number, candidate, branch) {
      assert.equal(branch, 'main');
      writes.updated++;
      const existing = pulls.find((pull) => pull.number === number);
      Object.assign(existing, {
        title: candidate.title.toString(),
        body: candidate.body.toString(),
        generated: render(candidate.updates),
      });
      return existing;
    },
    async createRelease(candidate, options) {
      assert.equal(options.draft, false);
      assert.equal(options.prerelease, false);
      const tagName = candidate.tag.toString();
      assert.ok(!releases.some((release) => release.tagName === tagName), 'duplicate publication');
      const release = {
        tagName,
        name: candidate.name,
        sha: candidate.sha,
        notes: candidate.notes,
        url: `https://example.invalid/releases/tag/${tagName}`,
      };
      releases.unshift(release);
      writes.published++;
      return release;
    },
    async commentOnIssue(comment, number) {
      assert.equal(number, 1);
      assert.ok(comment.includes(releases[0].url));
    },
    async removeIssueLabels(labels, number) {
      const pull = pulls.find((pull) => pull.number === number);
      pull.labels = pull.labels.filter((label) => !labels.includes(label));
    },
    async addIssueLabels(labels, number) {
      pulls.find((pull) => pull.number === number).labels.push(...labels);
    },
  };
  return {
    files,
    pulls,
    releases,
    writes,
    addCommit,
    plan: () => Manifest.fromManifest(github, 'main'),
    merge() {
      const pull = pulls[0];
      pull.state = 'MERGED';
      pull.sha = 'c'.repeat(40);
      for (const [path, content] of pull.generated) files.set(path, content);
      commits.unshift({
        sha: pull.sha,
        message: pull.title,
        files: [...pull.generated.keys()],
        pullRequest: pull,
      });
    },
  };
}

test('first release generates consistent files, tag, release name and notes without historical entries', async () => {
  const state = fixture({ initial: true, messages: ['feat(ci): adopt release-please'] });
  const [pull] = await (await state.plan()).createPullRequests();
  assert.equal(pull.number, 1);
  assert.deepEqual([...pull.generated.keys()].sort(), [
    '.release-please-manifest.json',
    'CHANGELOG.md',
    'frontend/service-worker.js',
    'frontend/src/app-version.mjs',
    'version.txt',
  ]);
  assert.equal(pull.generated.get('version.txt'), '0.1.0\n');
  assertVersionCopies(pull, '0.1.0');
  assert.deepEqual(JSON.parse(pull.generated.get('.release-please-manifest.json')), {
    '.': '0.1.0',
  });
  const changelog = pull.generated.get('CHANGELOG.md');
  assert.match(changelog, /0\.1\.0/);
  assert.match(changelog, /adopt release-please/);
  assert.doesNotMatch(changelog, /excluded/);
  assert.equal(
    await check(changelog, { parser: 'markdown' }),
    false,
    'generated formatting needs the narrow ignore',
  );
  assert.deepEqual(await (await state.plan()).createReleases(), [], 'an open PR must not publish');
  state.merge();
  const [candidate] = await (await state.plan()).buildReleases();
  assert.equal(candidate.tag.toString(), 'v0.1.0');
  assert.equal(candidate.name, 'v0.1.0');
  assert.equal(candidate.sha, state.pulls[0].sha);
  assert.ok(changelog.includes(candidate.notes.trim()));
  const [published] = await (await state.plan()).createReleases();
  assert.equal(published.version, '0.1.0');
  assert.equal(published.tagName, 'v0.1.0');
  assert.deepEqual(state.pulls[0].labels, ['autorelease: tagged']);
  assert.deepEqual(await (await state.plan()).createReleases(), []);
  assert.deepEqual(await (await state.plan()).createPullRequests(), []);
  assert.equal(state.writes.published, 1);
  const cleaned = JSON.parse(state.files.get('release-please-config.json'));
  delete cleaned.packages['.']['release-as'];
  state.files.set('release-please-config.json', JSON.stringify(cleaned));
  state.addCommit('fix: repair a post-release regression');
  const [next] = await (await state.plan()).buildPullRequests();
  assert.equal(next.version.toString(), '0.1.1');
});

for (const [version, message, expected] of [
  ['0.1.0', 'fix: repair a regression', '0.1.1'],
  ['0.1.0', 'feat: add practice mode', '0.2.0'],
  ['0.1.0', 'feat!: replace import format', '0.2.0'],
  ['0.1.0', 'fix: replace format\n\nBREAKING CHANGE: a header is required', '0.2.0'],
  ['1.2.3', 'feat!: replace import format', '2.0.0'],
  ['1.2.3', 'fix: repair a regression', '1.2.4'],
  ['1.2.3', 'feat: add practice mode', '1.3.0'],
]) {
  test(`after override cleanup ${version} + ${message.split('\n')[0]} produces ${expected}`, async () => {
    const state = fixture({ version, messages: [message] });
    const [pull] = await (await state.plan()).createPullRequests();
    assert.equal(pull.generated.get('version.txt'), `${expected}\n`);
    assertVersionCopies(pull, expected);
    assert.deepEqual(JSON.parse(pull.generated.get('.release-please-manifest.json')), {
      '.': expected,
    });
    state.merge();
    const [release] = await (await state.plan()).buildReleases();
    assert.equal(release.tag.toString(), `v${expected}`);
    assert.equal(release.name, `v${expected}`);
    assert.ok(pull.generated.get('CHANGELOG.md').includes(release.notes.trim()));
  });
}

function assertVersionCopies(pull, version) {
  assert.equal(
    pull.generated.get('frontend/src/app-version.mjs'),
    `export const APP_VERSION = '${version}'; // x-release-please-version\n`,
  );
  assert.equal(
    pull.generated.get('frontend/service-worker.js'),
    `const APP_VERSION = '${version}'; // x-release-please-version\nconst SHELL_REVISION = '13';\n`,
  );
}

test('maintenance alone does not open a release PR or publish', async () => {
  for (const initial of [true, false]) {
    const state = fixture({
      initial,
      version: initial ? '0.0.0' : '0.1.0',
      messages: [
        'docs: explain setup',
        'test: add coverage',
        'ci: update checks',
        'chore(deps): update tooling',
      ],
    });
    assert.deepEqual(await (await state.plan()).createPullRequests(), []);
    assert.deepEqual(await (await state.plan()).createReleases(), []);
    assert.deepEqual(state.writes, { created: 0, updated: 0, published: 0 });
  }
});

test('qualifying merges reuse the pending PR and unchanged reruns do not write', async () => {
  const state = fixture({ version: '0.1.0', messages: ['fix: repair a regression'] });
  const [first] = await (await state.plan()).createPullRequests();
  assert.equal(first.generated.get('version.txt'), '0.1.1\n');
  assert.deepEqual(await (await state.plan()).createPullRequests(), []);
  state.addCommit('feat: add practice mode');
  const [updated] = await (await state.plan()).createPullRequests();
  assert.equal(updated.number, first.number);
  assert.equal(updated.generated.get('version.txt'), '0.2.0\n');
  assert.match(updated.body, /repair a regression/);
  assert.match(updated.body, /add practice mode/);
  assert.deepEqual(updated.labels, ['autorelease: pending']);
  assert.deepEqual(await (await state.plan()).createPullRequests(), []);
  assert.deepEqual(await (await state.plan()).createReleases(), []);
  assert.equal(state.pulls.length, 1);
  assert.deepEqual(state.writes, { created: 1, updated: 1, published: 0 });
});
