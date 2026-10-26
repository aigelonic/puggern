export const MAX_HISTORY = 500;
export const HISTORY_PAGE_SIZE = 20;
export const TREND_SIZE = 10;

const counter = (value) => Number.isSafeInteger(value) && value >= 0;
const text = (value, limit) =>
  typeof value === 'string' && value.length > 0 && value.length <= limit;
const RUN_FIELDS = [
  'id',
  'setId',
  'setName',
  'comparisonKey',
  'directionMode',
  'orderMode',
  'caseSensitive',
  'accentSensitive',
];
const RESULT_FIELDS = [
  ...RUN_FIELDS,
  'completedAt',
  'points',
  'bestStreak',
  'practicedCount',
  'firstTryCount',
  'totalErrors',
  'extraPracticeCount',
];

export function isValidRun(run) {
  return validIdentity(run) && Object.keys(run).every((key) => RUN_FIELDS.includes(key));
}

function validIdentity(run) {
  return (
    run &&
    text(run.id, 128) &&
    text(run.setId, 128) &&
    text(run.setName, 80) &&
    typeof run.comparisonKey === 'string' &&
    /^[a-f0-9]{64}$/.test(run.comparisonKey) &&
    ['forward', 'reverse', 'mixed', 'unknown'].includes(run.directionMode) &&
    ['original', 'shuffled'].includes(run.orderMode) &&
    typeof run.caseSensitive === 'boolean' &&
    typeof run.accentSensitive === 'boolean'
  );
}

export function isValidResult(result) {
  return (
    validIdentity(result) &&
    Object.keys(result).every((key) => RESULT_FIELDS.includes(key)) &&
    typeof result.completedAt === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(result.completedAt) &&
    Number.isFinite(Date.parse(result.completedAt)) &&
    new Date(result.completedAt).toISOString() === result.completedAt &&
    [
      'points',
      'bestStreak',
      'practicedCount',
      'firstTryCount',
      'totalErrors',
      'extraPracticeCount',
    ].every((key) => counter(result[key])) &&
    result.practicedCount > 0 &&
    result.practicedCount <= 200 &&
    result.firstTryCount <= result.practicedCount &&
    result.extraPracticeCount <= 200 &&
    result.totalErrors >= result.extraPracticeCount
  );
}

export async function createRun(set, session, id = crypto.randomUUID(), { isolate = false } = {}) {
  const savedDirections = set.words.map(({ sourceDirection }) => sourceDirection);
  const legacyDirection =
    savedDirections.length &&
    savedDirections.every((direction) => ['forward', 'reverse'].includes(direction))
      ? new Set(savedDirections).size === 1
        ? savedDirections[0]
        : 'mixed'
      : 'unknown';
  const config = {
    directionMode: session.exerciseConfig?.directionMode ?? legacyDirection,
    orderMode: session.exerciseConfig?.orderMode ?? 'shuffled',
  };
  const settings = {
    caseSensitive: session.settings.caseSensitive ?? false,
    accentSensitive: session.settings.accentSensitive ?? false,
  };
  const identity = JSON.stringify([
    set.id,
    set.words.map(({ prompt, answer }) => [prompt, answer]),
    config.directionMode,
    config.orderMode,
    settings.caseSensitive,
    settings.accentSensitive,
    ...(isolate ? [`isolated-run:${id}`] : []),
  ]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  return {
    id,
    setId: set.id,
    setName: set.name,
    comparisonKey: Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join(''),
    ...config,
    ...settings,
  };
}

export function completedResult(session, completedAt = new Date().toISOString()) {
  if (session.queue.length || !isValidRun(session.run)) return null;
  const firstTryCount = session.learned.filter((id) => !session.mistakes[id]).length;
  const result = {
    ...session.run,
    completedAt,
    points: session.points ?? 0,
    bestStreak: session.bestStreak ?? 0,
    practicedCount: session.learned.length,
    firstTryCount,
    totalErrors: Object.values(session.mistakes).reduce((sum, count) => sum + count, 0),
    extraPracticeCount: Object.values(session.mistakes).filter((count) => count > 0).length,
  };
  if (!isValidResult(result)) throw new Error('Øvingsresultatet er ugyldig.');
  return result;
}

export function newestFirst(results) {
  const descending = (left, right) => (left === right ? 0 : left < right ? 1 : -1);
  return [...results].sort(
    (a, b) => descending(a.completedAt, b.completedAt) || descending(a.id, b.id),
  );
}

export function accuracy(result) {
  return result &&
    counter(result.firstTryCount) &&
    counter(result.practicedCount) &&
    result.practicedCount > 0 &&
    result.firstTryCount <= result.practicedCount
    ? (result.firstTryCount / result.practicedCount) * 100
    : 0;
}

export function variantTrend(history, comparisonKey) {
  const results = newestFirst(history.filter((result) => result.comparisonKey === comparisonKey));
  return {
    recent: results.slice(0, TREND_SIZE).reverse(),
    latest: results[0] ?? null,
    delta: results.length > 1 ? accuracy(results[0]) - accuracy(results[1]) : null,
    bestAccuracy: results.length ? Math.max(...results.map(accuracy)) : 0,
    bestStreak: results.length ? Math.max(...results.map((result) => result.bestStreak)) : 0,
  };
}

export function personalBestMessage(result, history) {
  const previous = history.filter(
    (item) => item.id !== result.id && item.comparisonKey === result.comparisonKey,
  );
  if (!previous.length) return 'Dette er utgangspunktet ditt for denne øvingsvarianten.';
  const records = [];
  if (accuracy(result) > Math.max(...previous.map(accuracy)))
    records.push('førsteforsøksnøyaktighet');
  if (result.bestStreak > Math.max(...previous.map((item) => item.bestStreak)))
    records.push('rekke');
  return records.length ? `Ny personlig rekord i lagret historikk: ${records.join(' og ')}!` : '';
}
