import { createSession, submitAnswer, wordsForExercise } from '../../../frontend/src/learning.mjs';
import { createProfileState } from '../../../frontend/src/profiles.mjs';

export function homeFixture({ count = 3, name = 'Ola', avatar = '🦊' } = {}) {
  const state = createProfileState('home-profile');
  Object.assign(state.profiles[0], { name, avatar });
  state.profiles.push({
    id: 'second-profile',
    name: 'Ada',
    avatar: '🐱',
    rewards: { points: 30, bestStreak: 2, completedSets: 1 },
  });
  state.progress['second-profile'] = {};
  const sets = Array.from({ length: count }, (_, index) => ({
    id: `home-set-${index}`,
    name: ['Dyreord', 'Farger', 'Frukt', 'På skolen', 'Ukedager'][index] ?? `Ordsett ${index + 1}`,
    words: [
      { id: '0', prompt: 'hund', answer: 'dog' },
      { id: '1', prompt: 'katt', answer: 'cat' },
    ],
    direction: 'prompt-to-answer',
    settings: { caseSensitive: false, accentSensitive: false },
    archived: false,
    createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-20T12:00:00.000Z',
  }));
  for (const index of [1, 0]) {
    const set = sets[index];
    if (!set) continue;
    const words = wordsForExercise(set.words, 'forward');
    let session = createSession(words, () => 0, set.settings, {
      directionMode: 'forward',
      orderMode: 'original',
    });
    session = submitAnswer(session, 'dog', words, set.settings).session;
    if (index === 1) session = submitAnswer(session, 'cat', words, set.settings).session;
    state.progress['home-profile'][set.id] = { version: 1, words, session };
  }
  return {
    'puggern.profile-state': JSON.stringify(state),
    'puggern.word-sets': JSON.stringify({ version: 1, sets }),
  };
}

export async function seedHome(page, options) {
  const data = homeFixture(options);
  await page.addInitScript((entries) => {
    if (!localStorage.getItem('puggern.profile-state')) {
      for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
    }
  }, data);
}
