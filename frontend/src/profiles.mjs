import { isValidProgress, normalizeProgress } from './learning.mjs?v=9';
import { isValidResult, isValidRun, MAX_HISTORY, newestFirst } from './history.mjs?v=3';

export const PROFILE_STATE_KEY = 'puggern.profile-state';
export const PROFILE_STATE_VERSION = 1;
export const MAX_PROFILES = 10;
export const MAX_PROFILE_NAME_LENGTH = 40;
export const MAX_PROFILE_AVATAR_LENGTH = 8;

export function createRewards() {
  return { points: 0, bestStreak: 0, completedSets: 0 };
}

export function addRewards(rewards = createRewards(), earned) {
  return {
    points: Math.min(Number.MAX_SAFE_INTEGER, rewards.points + earned.points),
    bestStreak: Math.max(rewards.bestStreak, earned.bestStreak),
    completedSets: Math.min(Number.MAX_SAFE_INTEGER, rewards.completedSets + earned.completedSets),
  };
}

export function createProfileState(id = crypto.randomUUID()) {
  const profile = { id, name: 'Min profil', avatar: '', rewards: createRewards() };
  return {
    version: PROFILE_STATE_VERSION,
    activeProfileId: id,
    profiles: [profile],
    progress: { [id]: {} },
  };
}

function isValidProfileState(state) {
  if (
    state?.version !== PROFILE_STATE_VERSION ||
    !Array.isArray(state.profiles) ||
    state.profiles.length === 0 ||
    state.profiles.length > MAX_PROFILES ||
    new Set(state.profiles.map((profile) => profile?.id)).size !== state.profiles.length ||
    !state.profiles.every(
      (profile) =>
        profile &&
        typeof profile.id === 'string' &&
        profile.id.length > 0 &&
        typeof profile.name === 'string' &&
        profile.name.trim().length > 0 &&
        profile.name.length <= MAX_PROFILE_NAME_LENGTH &&
        typeof profile.avatar === 'string' &&
        profile.avatar.length <= MAX_PROFILE_AVATAR_LENGTH &&
        (profile.rewards === undefined ||
          (profile.rewards &&
            ['points', 'bestStreak', 'completedSets'].every(
              (key) => Number.isSafeInteger(profile.rewards[key]) && profile.rewards[key] >= 0,
            ))),
    ) ||
    !state.profiles.some((profile) => profile.id === state.activeProfileId) ||
    !state.progress ||
    typeof state.progress !== 'object' ||
    Array.isArray(state.progress)
  ) {
    return false;
  }

  const profileIds = new Set(state.profiles.map((profile) => profile.id));
  return Object.entries(state.progress).every(
    ([profileId, sets]) =>
      profileIds.has(profileId) &&
      sets &&
      typeof sets === 'object' &&
      !Array.isArray(sets) &&
      Object.values(sets).every(isValidProgress),
  );
}

function isValidRunPoints(runPoints, profileIds) {
  return (
    runPoints === undefined ||
    (runPoints &&
      typeof runPoints === 'object' &&
      !Array.isArray(runPoints) &&
      Object.entries(runPoints).every(
        ([profileId, runs]) =>
          profileIds.has(profileId) &&
          runs &&
          typeof runs === 'object' &&
          !Array.isArray(runs) &&
          Object.entries(runs).every(
            ([runId, points]) =>
              typeof runId === 'string' &&
              runId.length > 0 &&
              runId.length <= 128 &&
              Number.isSafeInteger(points) &&
              points > 0,
          ),
      ))
  );
}

export function loadProfileState(storage, warn = () => {}) {
  const stored = storage.getItem(PROFILE_STATE_KEY);
  if (!stored) return null;

  try {
    const state = JSON.parse(stored);
    if (!isValidProfileState(state)) return null;
    const normalized = {
      ...state,
      progress: Object.fromEntries(
        Object.entries(state.progress).map(([profileId, sets]) => [
          profileId,
          Object.fromEntries(
            Object.entries(sets).map(([setId, progress]) => {
              const next = normalizeProgress(progress);
              if (next.session.run !== undefined && !isValidRun(next.session.run)) {
                delete next.session.run;
                warn();
              }
              return [setId, next];
            }),
          ),
        ]),
      ),
    };
    if (
      state.runPoints !== undefined &&
      !isValidRunPoints(state.runPoints, new Set(state.profiles.map(({ id }) => id)))
    ) {
      warn();
      delete normalized.runPoints;
    }
    if (state.history !== undefined) {
      normalized.history = {};
      if (!state.history || typeof state.history !== 'object' || Array.isArray(state.history)) {
        warn();
      } else {
        const profileIds = new Set(state.profiles.map(({ id }) => id));
        if (Object.keys(state.history).some((id) => !profileIds.has(id))) warn();
        for (const profile of state.profiles) {
          const entries = state.history[profile.id];
          if (entries === undefined) continue;
          if (!Array.isArray(entries)) {
            warn();
            continue;
          }
          const ids = new Set();
          const valid = entries.slice(0, MAX_HISTORY).filter((result) => {
            if (!isValidResult(result) || ids.has(result.id)) {
              warn();
              return false;
            }
            ids.add(result.id);
            return true;
          });
          if (entries.length > MAX_HISTORY) warn();
          normalized.history[profile.id] = valid;
        }
      }
    }
    return normalized;
  } catch {
    return null;
  }
}

export function saveProfileState(storage, state) {
  if (!isValidRunPoints(state.runPoints, new Set(state.profiles.map(({ id }) => id)))) {
    throw new Error('Øvingspoengsummene er ugyldige.');
  }
  if (state.history !== undefined) {
    if (
      !state.history ||
      typeof state.history !== 'object' ||
      Array.isArray(state.history) ||
      !Object.entries(state.history).every(
        ([id, results]) =>
          state.profiles.some((profile) => profile.id === id) &&
          Array.isArray(results) &&
          results.length <= MAX_HISTORY &&
          results.every(isValidResult) &&
          new Set(results.map((result) => result.id)).size === results.length,
      )
    ) {
      throw new Error('Øvingshistorikken er ugyldig.');
    }
  }
  if (
    Object.values(state.progress).some((sets) =>
      Object.values(sets).some(
        ({ session }) => session.run !== undefined && !isValidRun(session.run),
      ),
    )
  ) {
    throw new Error('Øvingsidentiteten er ugyldig.');
  }
  storage.setItem(PROFILE_STATE_KEY, JSON.stringify(state));
}

// Apply progress, history and rewards together to the latest state under the caller's lock.
export function applyRunUpdates(state, updates) {
  let next = state;
  for (const update of updates) {
    const { profileId, setId, result } = update;
    let { progress, earned } = update;
    const profile = next.profiles.find(({ id }) => id === profileId);
    if (!profile) throw new Error('Profilen som startet øvingen finnes ikke lenger.');
    const savedProgress = next.progress[profileId]?.[setId];
    if (update.resumeLegacy && savedProgress?.session.run) {
      progress = savedProgress;
      earned = createRewards();
    }
    const history = next.history?.[profileId] ?? [];
    if (history.some(({ id }) => id === progress.session.run.id)) continue;
    const saved = savedProgress?.session;
    const sameRun = saved?.run?.id === progress.session.run.id;
    if (sameRun && (saved.points ?? 0) > (progress.session.points ?? 0)) continue;
    const runId = progress.session.run.id;
    const recordedPoints = next.runPoints?.[profileId]?.[runId] ?? 0;
    const savedPoints = sameRun ? (saved.points ?? 0) : 0;
    const legacyBaseline =
      update.resumeLegacy && !savedProgress?.session.run ? (progress.session.points ?? 0) : 0;
    const creditedBefore = Math.max(recordedPoints, savedPoints, legacyBaseline);
    const runPoints = Math.max(creditedBefore, progress.session.points ?? 0);
    const rewards = {
      points: Math.min(earned.points, Math.max(0, runPoints - creditedBefore)),
      bestStreak: earned.bestStreak,
      completedSets: sameRun && saved.queue.length === 0 ? 0 : earned.completedSets,
    };
    const profileRunPoints = { ...(next.runPoints?.[profileId] ?? {}) };
    if (result) delete profileRunPoints[runId];
    else if (runPoints > 0) profileRunPoints[runId] = runPoints;
    const nextRunPoints = { ...(next.runPoints ?? {}) };
    if (Object.keys(profileRunPoints).length) nextRunPoints[profileId] = profileRunPoints;
    else delete nextRunPoints[profileId];
    const stateWithoutRunPoints = { ...next };
    delete stateWithoutRunPoints.runPoints;
    next = {
      ...(Object.keys(nextRunPoints).length
        ? { ...stateWithoutRunPoints, runPoints: nextRunPoints }
        : stateWithoutRunPoints),
      profiles: next.profiles.map((item) =>
        item.id === profileId ? { ...item, rewards: addRewards(item.rewards, rewards) } : item,
      ),
      progress: {
        ...next.progress,
        [profileId]: {
          ...Object.fromEntries(
            Object.entries(next.progress[profileId] ?? {}).filter(([id]) => id !== setId),
          ),
          [setId]: progress,
        },
      },
      ...(result
        ? {
            history: {
              ...next.history,
              [profileId]: newestFirst([...history, result]).slice(0, MAX_HISTORY),
            },
          }
        : {}),
    };
  }
  return next;
}
