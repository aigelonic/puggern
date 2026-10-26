import assert from 'node:assert/strict';
import test from 'node:test';
import { answerFeedback } from '../frontend/src/practice-feedback.mjs';
import { createSession, submitAnswer } from '../frontend/src/learning.mjs';

const words = [
  { id: 'a', prompt: 'hund', answer: 'dog' },
  { id: 'b', prompt: 'katt', answer: 'cat' },
];
const initial = () => createSession(words, Math.random, {}, { orderMode: 'original' });

test('correct feedback uses actual points delta and membership, not points as proof of learning', () => {
  const previous = initial();
  const outcome = submitAnswer(previous, 'dog', words);
  assert.deepEqual(answerFeedback(previous, outcome, words[0]), {
    kind: 'correct',
    points: 10,
    newlyLearned: true,
    message: 'Riktig! Bra jobbet med «hund»! Nytt ord lært i denne runden.',
  });
  const capped = { ...previous, points: Number.MAX_SAFE_INTEGER - 3 };
  assert.equal(answerFeedback(capped, submitAnswer(capped, 'dog', words), words[0]).points, 3);
});

test('mistakes never claim points and the correct retry is ordinary success feedback', () => {
  const previous = initial();
  const incorrect = submitAnswer(previous, 'wrong', words);
  assert.deepEqual(answerFeedback(previous, incorrect, words[0]), {
    kind: 'incorrect',
    message: 'Ikke helt ennå – prøv igjen!',
  });
  const repeated = submitAnswer(incorrect.session, 'still wrong', words);
  assert.equal(answerFeedback(incorrect.session, repeated, words[0]).kind, 'incorrect');
  const correction = submitAnswer(repeated.session, 'dog', words);
  assert.deepEqual(answerFeedback(repeated.session, correction, words[0]), {
    kind: 'correct',
    points: 10,
    newlyLearned: true,
    message: 'Riktig! Bra jobbet med «hund»! Nytt ord lært i denne runden.',
  });
});

test('live completion takes precedence over answer rewards, including after retries', () => {
  let previous = createSession([words[0]]);
  previous = submitAnswer(previous, 'wrong', words).session;
  previous = submitAnswer(previous, 'still wrong', words).session;
  const outcome = submitAnswer(previous, 'dog', words);
  assert.deepEqual(answerFeedback(previous, outcome, words[0]), {
    kind: 'complete',
    message: 'Hurra! Du fullførte øvingen!',
  });
  assert.equal(answerFeedback(outcome.session, outcome, null), null);
  assert.equal(answerFeedback(outcome.session, outcome, words[0]), null);
});
