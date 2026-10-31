import { MAX_LANGUAGE_NAME_LENGTH, MAX_WORD_LENGTH, MAX_WORDS_PER_SET } from './learning.mjs?v=10';
import { MAX_WORD_SET_NAME_LENGTH } from './word-sets.mjs?v=11';

export const SHARE_PARAM = 'share';
export const MAX_SHARE_URL_LENGTH = 8000;

function normalizedText(value, maxLength, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} må være tekst og kan ikke være tomt.`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new Error(`${label} kan ikke være lengre enn ${maxLength} tegn.`);
  }
  return text;
}

function normalizedLineText(value, maxLength, label) {
  const text = normalizedText(value, maxLength, label);
  if (/[\r\n]/.test(text)) {
    throw new Error(`${label} kan ikke inneholde linjeskift.`);
  }
  return text;
}

function normalizeSet(set) {
  if (!set || typeof set !== 'object' || Array.isArray(set)) {
    throw new Error('Lenken mangler et gyldig ordsett.');
  }
  const name = normalizedText(set.name, MAX_WORD_SET_NAME_LENGTH, 'Navnet');
  if (!Array.isArray(set.words) || set.words.length < 1 || set.words.length > MAX_WORDS_PER_SET) {
    throw new Error(`Ordsettet må inneholde mellom 1 og ${MAX_WORDS_PER_SET} ord.`);
  }
  const words = set.words.map((word, index) => ({
    id: String(index),
    prompt: normalizedLineText(word?.prompt, MAX_WORD_LENGTH, `Hint på linje ${index + 1}`),
    answer: normalizedLineText(word?.answer, MAX_WORD_LENGTH, `Svar på linje ${index + 1}`),
  }));
  if (!['prompt-to-answer', 'answer-to-prompt', 'both'].includes(set.direction)) {
    throw new Error('Ordsettet har en ugyldig quizretning.');
  }
  if (
    typeof set.settings?.caseSensitive !== 'boolean' ||
    typeof set.settings?.accentSensitive !== 'boolean'
  ) {
    throw new Error('Ordsettet må ha gyldige innstillinger for store bokstaver og aksenter.');
  }
  const languages = {};
  for (const [key, label] of [
    ['promptLanguage', 'Språket for hint'],
    ['answerLanguage', 'Språket for svar'],
  ]) {
    if (set[key] === undefined) continue;
    if (typeof set[key] !== 'string' || set[key].length > MAX_LANGUAGE_NAME_LENGTH) {
      throw new Error(`${label} må være tekst på maksimalt ${MAX_LANGUAGE_NAME_LENGTH} tegn.`);
    }
    const language = set[key].trim();
    if (language) languages[key] = language;
  }
  return {
    name,
    words,
    direction: set.direction,
    ...languages,
    settings: {
      caseSensitive: set.settings.caseSensitive,
      accentSensitive: set.settings.accentSensitive,
    },
  };
}

function encode(text) {
  const bytes = new TextEncoder().encode(text);
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function checkSize(length) {
  if (length > MAX_SHARE_URL_LENGTH) {
    throw new Error(
      'Lenken er for lang. Reduser antall ord eller tekstmengden i ordsettet og prøv igjen.',
    );
  }
}

export function createShareUrl(set, baseUrl) {
  const draft = normalizeSet(set);
  const content = {
    ...draft,
    words: draft.words.map(({ prompt, answer }) => ({ prompt, answer })),
  };
  const url = new URL(baseUrl);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Deling krever en vanlig http- eller https-lenke.');
  }
  url.search = '';
  url.hash = '';
  url.searchParams.set(
    SHARE_PARAM,
    encode(JSON.stringify({ v: 1, type: 'word-set-share', set: content })),
  );
  checkSize(url.href.length);
  return url.href;
}

export function parseShareUrl(input) {
  if (typeof input !== 'string') throw new Error('Lim inn en gyldig delingslenke.');
  const text = input.trim();
  checkSize(text.length);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error('Lim inn en fullstendig http- eller https-lenke.');
  }
  checkSize(url.href.length);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Lim inn en vanlig http- eller https-lenke.');
  }
  const values = url.searchParams.getAll(SHARE_PARAM);
  if (values.length !== 1 || !values[0]) {
    throw new Error('Lenken må inneholde ett delt ordsett (share).');
  }
  const encoded = values[0];
  let payload;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) throw new Error();
    const binary = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'));
    const json = new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    );
    if (encode(json) !== encoded) throw new Error();
    payload = JSON.parse(json);
  } catch {
    throw new Error('Delingslenken inneholder ugyldig koding eller JSON.');
  }
  if (payload?.v !== 1 || payload?.type !== 'word-set-share') {
    throw new Error('Denne typen eller versjonen av delingslenken støttes ikke.');
  }
  return normalizeSet(payload.set);
}
