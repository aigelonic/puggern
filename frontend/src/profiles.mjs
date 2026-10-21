import { isValidProgress } from './learning.mjs';

export const PROFILE_STATE_KEY = 'puggern.profile-state';
export const PROFILE_STATE_VERSION = 1;
export const MAX_PROFILES = 10;
export const MAX_PROFILE_NAME_LENGTH = 40;
export const MAX_PROFILE_AVATAR_LENGTH = 8;

export function createProfileState(id = crypto.randomUUID()) {
  const profile = { id, name: 'Min profil', avatar: '' };
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
        profile.avatar.length <= MAX_PROFILE_AVATAR_LENGTH,
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

export function loadProfileState(storage) {
  const stored = storage.getItem(PROFILE_STATE_KEY);
  if (!stored) return null;

  try {
    const state = JSON.parse(stored);
    return isValidProfileState(state) ? state : null;
  } catch {
    return null;
  }
}

export function saveProfileState(storage, state) {
  storage.setItem(PROFILE_STATE_KEY, JSON.stringify(state));
}
