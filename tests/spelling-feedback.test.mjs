import assert from 'node:assert/strict';
import test from 'node:test';
import { compareSpelling } from '../frontend/src/spelling-feedback.mjs';

const changed = (segments) => {
  let index = 0;
  const marked = [];
  for (const segment of segments) {
    for (const { segment: text } of new Intl.Segmenter(undefined, {
      granularity: 'grapheme',
    }).segment(segment.text)) {
      if (segment.changed) marked.push({ text, index });
      index += 1;
    }
  }
  return marked;
};

test('aligns substitutions, missing letters, extra letters, and adjacent transpositions', () => {
  const substitution = compareSpelling('aple', 'eple');
  assert.deepEqual(
    changed(substitution.responseSegments).map(({ index }) => index),
    [0],
  );
  assert.deepEqual(
    changed(substitution.expectedSegments).map(({ index }) => index),
    [0],
  );
  assert.equal(substitution.summary, 'Bytt «a» med «e» på plass 1.');

  const missing = compareSpelling('epe', 'eple');
  assert.deepEqual(changed(missing.responseSegments), []);
  assert.deepEqual(
    changed(missing.expectedSegments).map(({ index }) => index),
    [2],
  );
  assert.equal(missing.summary, 'Legg til «l» etter plass 2.');

  assert.equal(compareSpelling('eple', 'xeple').summary, 'Legg til «x» før plass 1.');
  assert.equal(compareSpelling('eple', 'eplex').summary, 'Legg til «x» etter plass 4.');

  const extra = compareSpelling('epple', 'eple');
  assert.deepEqual(
    changed(extra.responseSegments).map(({ index }) => index),
    [2],
  );
  assert.deepEqual(changed(extra.expectedSegments), []);
  assert.equal(extra.summary, 'Ta bort «p» på plass 3.');

  const transposed = compareSpelling('elpe', 'eple');
  assert.deepEqual(transposed.operations, [
    {
      type: 'transposition',
      responseSpan: { start: 1, end: 3 },
      expectedSpan: { start: 1, end: 3 },
    },
  ]);
  assert.equal(transposed.summary, 'Bytt rekkefølgen på «lp» på plass 2–3.');
});

test('localizes first and last substitutions and groups separated changes', () => {
  const first = compareSpelling('xple', 'eple');
  assert.deepEqual(
    changed(first.responseSegments).map(({ index }) => index),
    [0],
  );

  const last = compareSpelling('eplx', 'eple');
  assert.deepEqual(
    changed(last.expectedSegments).map(({ index }) => index),
    [3],
  );

  const separated = compareSpelling('axcd', 'ebcz');
  assert.deepEqual(separated.operations, [
    {
      type: 'substitution',
      responseSpan: { start: 0, end: 2 },
      expectedSpan: { start: 0, end: 2 },
    },
    {
      type: 'substitution',
      responseSpan: { start: 3, end: 4 },
      expectedSpan: { start: 3, end: 4 },
    },
  ]);
  assert.equal(separated.summary, 'Bytt «ax» med «eb» på plass 1–2. Bytt «d» med «z» på plass 4.');
});

test('handles empty, unrelated, punctuation, and multiword answers', () => {
  const empty = compareSpelling('', 'eple');
  assert.equal(empty.response, '');
  assert.equal(empty.summary, 'Legg til «eple» før plass 1.');
  assert.deepEqual(
    changed(empty.expectedSegments).map(({ index }) => index),
    [0, 1, 2, 3],
  );

  const unrelated = compareSpelling('xyz', 'abc');
  assert.equal(unrelated.operations.length, 1);
  assert.equal(unrelated.summary, 'Bytt «xyz» med «abc» på plass 1–3.');

  const punctuation = compareSpelling('ma-katt', 'ma katt');
  assert.equal(punctuation.summary, 'Bytt «-» med «mellomrom» på plass 3.');

  const multiword = compareSpelling('rød bil', 'rød b il');
  assert.equal(multiword.summary, 'Legg til «mellomrom» etter plass 5.');

  const nonBreakingSpace = compareSpelling('rød\u00a0bil', 'rød bil');
  assert.equal(nonBreakingSpace.canCompare, false);
  assert.equal(nonBreakingSpace.summary, 'Sammenlign stavemåtene for å finne forskjellen.');
});

test('respects case, accent, and trimmed-whitespace matching settings', () => {
  assert.equal(compareSpelling('Éple', 'eple').operations.length, 0);
  assert.equal(
    compareSpelling('Éple', 'eple', { caseSensitive: true, accentSensitive: false }).summary,
    'Bytt «É» med «e» på plass 1.',
  );
  assert.equal(
    compareSpelling('Éple', 'eple', { caseSensitive: false, accentSensitive: true }).summary,
    'Bytt «É» med «e» på plass 1.',
  );
  assert.equal(
    compareSpelling('Éple', 'eple', { caseSensitive: true, accentSensitive: true }).summary,
    'Bytt «É» med «e» på plass 1.',
  );

  const trimmed = compareSpelling('  aple\t', 'eple');
  assert.equal(trimmed.response, 'aple');
  assert.equal(trimmed.summary, 'Bytt «a» med «e» på plass 1.');
  assert.equal(compareSpelling('Éx', 'éy').summary, 'Bytt «x» med «y» på plass 2.');
});

test('uses exact existing normalization for precomposed and decomposed accents', () => {
  const accentInsensitive = compareSpelling('e\u0301x', 'éy');
  assert.equal(accentInsensitive.summary, 'Bytt «x» med «y» på plass 2.');

  const accentSensitive = compareSpelling('e\u0301x', 'éy', { accentSensitive: true });
  assert.equal(accentSensitive.operations.length, 1);
  assert.deepEqual(
    changed(accentSensitive.responseSegments).map(({ index }) => index),
    [0, 1],
  );
});

test('keeps combining sequences and surrogate-pair graphemes intact', () => {
  const combining = compareSpelling('e\u0301x', 'e\u0301y', { accentSensitive: true });
  assert.deepEqual(
    changed(combining.responseSegments).map(({ text }) => text),
    ['x'],
  );

  const emoji = compareSpelling('👩🏽‍🚀x', '👩🏽‍🚀y');
  assert.deepEqual(
    changed(emoji.responseSegments).map(({ text }) => text),
    ['x'],
  );
});

test('falls back to unmarked text when grapheme mapping is unavailable or unsafe', () => {
  const original = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
  try {
    Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined });
    const unavailable = compareSpelling('aple', 'eple');
    assert.equal(unavailable.canCompare, false);
    assert.deepEqual(unavailable.responseSegments, [{ text: 'aple', changed: false }]);
  } finally {
    Object.defineProperty(Intl, 'Segmenter', original);
  }

  const contextualCase = compareSpelling('ΟΣ', 'ΟΧ');
  assert.equal(contextualCase.canCompare, false);
  assert.equal(contextualCase.summary, 'Sammenlign stavemåtene for å finne forskjellen.');
});

test('bounds alignment to the existing maximum word length', () => {
  const response = `${'a'.repeat(199)}b`;
  const expected = `${'a'.repeat(199)}c`;
  const result = compareSpelling(response, expected);
  assert.equal(result.canCompare, true);
  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].responseSpan.start, 199);

  const oversized = compareSpelling(`${response}a`, expected);
  assert.equal(oversized.canCompare, false);
  assert.equal(oversized.summary, 'Sammenlign stavemåtene for å finne forskjellen.');
});

test('rejects non-string input without changing answer-matching semantics', () => {
  assert.throws(() => compareSpelling(null, 'word'), TypeError);
});
