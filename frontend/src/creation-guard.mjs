export const CREATION_ATTEMPTS_KEY = 'puggern.creation-attempts';
export const MAX_CREATIONS_PER_WINDOW = 5;
export const CREATION_WINDOW_MS = 10 * 60 * 1000;
export const MIN_CREATION_FORM_TIME_MS = 250;

export function recordCreationAttempt(storage, now = Date.now()) {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new TypeError('Ugyldig tidspunkt for oppretting.');
  }

  const stored = storage.getItem(CREATION_ATTEMPTS_KEY);
  let attempts = [];
  if (stored !== null) {
    let parsed;
    try {
      parsed = JSON.parse(stored);
    } catch {
      throw new Error('Kunne ikke lese opprettingsbegrensningen fra nettleseren.');
    }
    if (!Array.isArray(parsed) || !parsed.every(Number.isSafeInteger)) {
      throw new Error('Ugyldig opprettingsbegrensning i nettleseren.');
    }
    attempts = parsed.filter(
      (timestamp) => timestamp <= now && now - timestamp < CREATION_WINDOW_MS,
    );
  }

  if (attempts.length >= MAX_CREATIONS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterMs: CREATION_WINDOW_MS - (now - attempts[0]),
    };
  }

  storage.setItem(CREATION_ATTEMPTS_KEY, JSON.stringify([...attempts, now]));
  return { allowed: true, retryAfterMs: 0 };
}
