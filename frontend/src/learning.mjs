export const PROGRESS_VERSION = 1;
export const PROGRESS_KEY = 'puggern.progress';

export function parseWordSet(source) {
  if (typeof source !== 'string') {
    throw new TypeError('Ordsettet må være tekst.');
  }

  const words = source.split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line }) => line.length > 0)
    .map(({ line, lineNumber }, index) => {
      const separator = line.indexOf('\t');
      if (separator < 1 || separator === line.length - 1 || line.indexOf('\t', separator + 1) !== -1) {
        throw new Error(`Linje ${lineNumber} må inneholde et hint og et svar, atskilt med én tabulator.`);
      }

      const prompt = line.slice(0, separator).trim();
      const answer = line.slice(separator + 1).trim();
      if (!prompt || !answer) {
        throw new Error(`Linje ${lineNumber} må inneholde både et hint og et svar.`);
      }

      return { id: String(index), prompt, answer };
    });

  if (words.length === 0) {
    throw new Error('Legg til minst ett hint og ett svar.');
  }

  return words;
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

  return { queue, correction: false, learned: [], mistakes: {}, settings };
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
    return { session: next, result: 'incorrect' };
  }

  next.queue.shift();
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
    if (progress.version !== PROGRESS_VERSION || !Array.isArray(progress.words)
      || progress.words.some((word) => typeof word.id !== 'string'
        || typeof word.prompt !== 'string' || typeof word.answer !== 'string')
      || !progress.session || !Array.isArray(progress.session.queue)
      || progress.session.queue.some((id) => !progress.words.some((word) => word.id === id))
      || typeof progress.session.correction !== 'boolean'
      || !Array.isArray(progress.session.learned) || !progress.session.mistakes
      || typeof progress.session.mistakes !== 'object') {
      return null;
    }
    return progress;
  } catch {
    return null;
  }
}