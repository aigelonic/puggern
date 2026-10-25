export const PROGRESS_VERSION = 1;
export const PROGRESS_KEY = 'puggern.progress';
export const MAX_WORDS_PER_SET = 100;
export const MAX_WORD_LENGTH = 200;
export const POINTS_PER_CORRECT_ANSWER = 10;

export function previewWordSet(source) {
  if (typeof source !== 'string') {
    throw new TypeError('Ordsettet må være tekst.');
  }

  const lines = source.split(/\r?\n/);
  const entries = [];
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    let separator = '\t';
    if (!line.includes(separator)) {
      separator = line.includes(';') ? ';' : ' - ';
    }
    const separatorIndex = line.indexOf(separator);
    const prompt = separatorIndex < 1 ? '' : line.slice(0, separatorIndex).trim();
    const answer = separatorIndex < 1 ? '' : line.slice(separatorIndex + separator.length).trim();
    let error = null;

    if (
      separatorIndex < 1 ||
      !prompt ||
      !answer ||
      line.indexOf(separator, separatorIndex + separator.length) !== -1
    ) {
      error = `Linje ${index + 1} må inneholde et hint og et svar, atskilt med tab, semikolon eller « - ».`;
    } else if (entries.length >= MAX_WORDS_PER_SET) {
      error = `Et ordsett kan inneholde maksimalt ${MAX_WORDS_PER_SET} ord.`;
    } else if (prompt.length > MAX_WORD_LENGTH || answer.length > MAX_WORD_LENGTH) {
      error = `Hint og svar kan ikke være lengre enn ${MAX_WORD_LENGTH} tegn.`;
    }

    entries.push({
      id: String(entries.length),
      lineNumber: index + 1,
      prompt,
      answer,
      error,
    });
  });
  return entries;
}

export function parseWordSet(source) {
  const entries = previewWordSet(source);
  if (entries.length === 0) {
    throw new Error('Legg til minst ett hint og ett svar.');
  }
  const invalidEntry = entries.find(({ error }) => error);
  if (invalidEntry) throw new Error(invalidEntry.error);
  return entries.map(({ id, prompt, answer }) => ({ id, prompt, answer }));
}

export function wordsForDirection(words, direction = 'prompt-to-answer') {
  if (direction === 'prompt-to-answer') {
    return words.map((word) => ({ ...word }));
  }
  if (direction === 'answer-to-prompt') {
    return words.map(({ id, prompt, answer }) => ({ id, prompt: answer, answer: prompt }));
  }
  if (direction === 'both') {
    return words.flatMap(({ id, prompt, answer }) => [
      { id: `${id}:forward`, prompt, answer },
      { id: `${id}:reverse`, prompt: answer, answer: prompt },
    ]);
  }
  throw new TypeError('Velg en gyldig quizretning.');
}

export function normalizeAnswer(answer, { caseSensitive = false, accentSensitive = false } = {}) {
  let normalized = answer.trim();
  if (!caseSensitive) normalized = normalized.toLowerCase();
  if (!accentSensitive) {
    normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  return normalized;
}

export function answersMatch(answer, expected, settings) {
  return normalizeAnswer(answer, settings) === normalizeAnswer(expected, settings);
}

export function createSession(words, random = Math.random, settings = {}) {
  const queue = words.map(({ id }) => id);
  for (let index = queue.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [queue[index], queue[swapIndex]] = [queue[swapIndex], queue[index]];
  }

  return {
    queue,
    correction: false,
    learned: [],
    mistakes: {},
    settings,
    points: 0,
    streak: 0,
    bestStreak: 0,
  };
}

export function currentWord(session, words) {
  return words.find(({ id }) => id === session.queue[0]) ?? null;
}

export function submitAnswer(session, response, words, settings) {
  const word = currentWord(session, words);
  if (!word) return { session, result: 'complete' };

  const next = {
    ...session,
    queue: [...session.queue],
    learned: [...session.learned],
    mistakes: { ...session.mistakes },
    points: session.points ?? 0,
    streak: session.streak ?? 0,
    bestStreak: session.bestStreak ?? 0,
  };

  if (session.correction) {
    next.queue.shift();
    const delayedIndex = Math.min(2, next.queue.length);
    next.queue.splice(delayedIndex, 0, word.id);
    next.queue.push(word.id);
    next.correction = false;
    return { session: next, result: 'retry-scheduled' };
  }

  if (!answersMatch(response, word.answer, settings)) {
    next.correction = true;
    next.mistakes[word.id] = (next.mistakes[word.id] ?? 0) + 1;
    next.streak = 0;
    return { session: next, result: 'incorrect' };
  }

  next.queue.shift();
  next.points = Math.min(Number.MAX_SAFE_INTEGER, next.points + POINTS_PER_CORRECT_ANSWER);
  next.streak = Math.min(Number.MAX_SAFE_INTEGER, next.streak + 1);
  next.bestStreak = Math.max(next.bestStreak, next.streak);
  if (!next.learned.includes(word.id)) next.learned.push(word.id);
  return { session: next, result: next.queue.length ? 'correct' : 'complete' };
}

export function saveProgress(storage, session, words) {
  storage.setItem(PROGRESS_KEY, JSON.stringify({ version: PROGRESS_VERSION, session, words }));
}

export function loadProgress(storage) {
  const stored = storage.getItem(PROGRESS_KEY);
  if (!stored) return null;

  try {
    const progress = JSON.parse(stored);
    return isValidProgress(progress) ? progress : null;
  } catch {
    return null;
  }
}

export function isValidProgress(progress) {
  return (
    progress?.version === PROGRESS_VERSION &&
    Array.isArray(progress.words) &&
    progress.words.length > 0 &&
    progress.words.length <= MAX_WORDS_PER_SET * 2 &&
    new Set(progress.words.map((word) => word?.id)).size === progress.words.length &&
    progress.words.every(
      (word) =>
        word &&
        typeof word.id === 'string' &&
        word.id.length > 0 &&
        typeof word.prompt === 'string' &&
        word.prompt.length > 0 &&
        word.prompt.length <= MAX_WORD_LENGTH &&
        typeof word.answer === 'string' &&
        word.answer.length > 0 &&
        word.answer.length <= MAX_WORD_LENGTH,
    ) &&
    progress.session &&
    ['points', 'streak', 'bestStreak'].every(
      (key) =>
        progress.session[key] === undefined ||
        (Number.isSafeInteger(progress.session[key]) && progress.session[key] >= 0),
    ) &&
    Array.isArray(progress.session.queue) &&
    progress.session.queue.every((id) => progress.words.some((word) => word.id === id)) &&
    typeof progress.session.correction === 'boolean' &&
    Array.isArray(progress.session.learned) &&
    new Set(progress.session.learned).size === progress.session.learned.length &&
    progress.session.learned.every((id) => progress.words.some((word) => word.id === id)) &&
    progress.session.mistakes &&
    typeof progress.session.mistakes === 'object' &&
    !Array.isArray(progress.session.mistakes) &&
    Object.entries(progress.session.mistakes).every(
      ([id, count]) =>
        progress.words.some((word) => word.id === id) && Number.isInteger(count) && count >= 0,
    ) &&
    progress.session.settings &&
    typeof progress.session.settings === 'object' &&
    !Array.isArray(progress.session.settings) &&
    ['caseSensitive', 'accentSensitive'].every(
      (setting) =>
        progress.session.settings[setting] === undefined ||
        typeof progress.session.settings[setting] === 'boolean',
    )
  );
}
