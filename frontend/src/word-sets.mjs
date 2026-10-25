import { MAX_WORDS_PER_SET, MAX_WORD_LENGTH } from './learning.mjs?v=6';

export const WORD_SETS_KEY = 'puggern.word-sets';
export const WORD_SETS_VERSION = 1;
export const MAX_WORD_SET_NAME_LENGTH = 80;
export const MAX_WORD_SETS = 50;

function isValidWordSet(set) {
  return (
    set &&
    typeof set.id === 'string' &&
    set.id.length > 0 &&
    typeof set.name === 'string' &&
    set.name.trim().length > 0 &&
    set.name.length <= MAX_WORD_SET_NAME_LENGTH &&
    Array.isArray(set.words) &&
    set.words.length > 0 &&
    set.words.length <= MAX_WORDS_PER_SET &&
    new Set(set.words.map((word) => word?.id)).size === set.words.length &&
    set.words.every(
      (word) =>
        word &&
        typeof word.id === 'string' &&
        typeof word.prompt === 'string' &&
        word.prompt.trim().length > 0 &&
        word.prompt.length <= MAX_WORD_LENGTH &&
        typeof word.answer === 'string' &&
        word.answer.trim().length > 0 &&
        word.answer.length <= MAX_WORD_LENGTH,
    ) &&
    ['prompt-to-answer', 'answer-to-prompt', 'both'].includes(set.direction) &&
    typeof set.settings?.caseSensitive === 'boolean' &&
    typeof set.settings?.accentSensitive === 'boolean' &&
    typeof set.archived === 'boolean' &&
    typeof set.createdAt === 'string' &&
    typeof set.updatedAt === 'string'
  );
}

export function loadWordSets(storage) {
  const stored = storage.getItem(WORD_SETS_KEY);
  if (!stored) return [];

  try {
    const data = JSON.parse(stored);
    if (
      data.version !== WORD_SETS_VERSION ||
      !Array.isArray(data.sets) ||
      !data.sets.every(isValidWordSet) ||
      new Set(data.sets.map((set) => set.id)).size !== data.sets.length
    ) {
      return [];
    }
    return data.sets;
  } catch {
    return [];
  }
}

export function saveWordSets(storage, sets) {
  storage.setItem(WORD_SETS_KEY, JSON.stringify({ version: WORD_SETS_VERSION, sets }));
}
