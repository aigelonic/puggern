import {
  createSession,
  currentWord,
  loadProgress,
  MAX_WORD_LENGTH,
  MAX_WORDS_PER_SET,
  previewWordSet,
  PROGRESS_VERSION,
  submitAnswer,
  wordsForDirection,
} from './learning.mjs?v=6';
import {
  addRewards,
  createProfileState,
  createRewards,
  loadProfileState,
  MAX_PROFILE_AVATAR_LENGTH,
  MAX_PROFILE_NAME_LENGTH,
  MAX_PROFILES,
  PROFILE_STATE_KEY,
  saveProfileState,
} from './profiles.mjs?v=6';
import { loadWordSets, saveWordSets, MAX_WORD_SET_NAME_LENGTH } from './word-sets.mjs?v=6';

const status = document.querySelector('#connection-status');
const appError = document.querySelector('#app-error');
const setupView = document.querySelector('#setup-view');
const practiceView = document.querySelector('#practice-view');
const completeView = document.querySelector('#complete-view');
const wordSetForm = document.querySelector('#word-set-form');
const wordSetNameInput = document.querySelector('#word-set-name');
const wordSetInput = document.querySelector('#word-set');
const wordPreview = document.querySelector('#word-preview');
const setupError = document.querySelector('#setup-error');
const wordSetList = document.querySelector('#word-set-list');
const emptySets = document.querySelector('#empty-sets');
const profileSelect = document.querySelector('#profile-select');
const profileForm = document.querySelector('#profile-form');
const profileNameInput = document.querySelector('#profile-name');
const profileAvatarInput = document.querySelector('#profile-avatar');
const newProfileButton = document.querySelector('#new-profile-button');
const answerForm = document.querySelector('#answer-form');
const answerButton = answerForm.querySelector('button[type="submit"]');
const answerInput = document.querySelector('#answer');
const feedback = document.querySelector('#feedback');
const correctionAnnouncement = document.querySelector('#correction-announcement');
const correctionFeedback = document.querySelector('#correction-feedback');
const correctAnswer = document.querySelector('#correct-answer');
const correctionInstruction = document.querySelector('#correction-instruction');
const progressLabel = document.querySelector('#progress-label');
const prompt = document.querySelector('#prompt');
const answerLabel = document.querySelector('#answer-label');
const editorTitle = document.querySelector('#editor-title');
const archiveToggle = document.querySelector('#archive-toggle');
let wordSets = loadWordSets(window.localStorage);
let profileState = loadProfileState(window.localStorage);
let showArchived = false;
let editorSetId = null;
let editorRows = [];
let words = [];
let session = null;
let currentSetId = null;
let currentProfileId = null;
let unsavedProgress = false;
const pendingRewards = new Map();

function setAppError(message, source = 'app') {
  appError.textContent = message;
  appError.hidden = !message;
  appError.dataset.source = source;
}

async function withProfileStateLock(operation) {
  if (navigator.locks?.request) {
    return navigator.locks.request(PROFILE_STATE_KEY, operation);
  }
  return operation();
}

async function initializeProfileState() {
  try {
    await withProfileStateLock(() => {
      profileState = loadProfileState(window.localStorage);
      if (profileState) return;

      profileState = createProfileState();
      const legacyProgress = loadProgress(window.localStorage);
      const matchingSet = legacyProgress
        ? wordSets.find(
            (set) =>
              JSON.stringify(wordsForDirection(set.words, set.direction)) ===
              JSON.stringify(legacyProgress.words),
          )
        : null;
      if (matchingSet) {
        profileState.progress[profileState.activeProfileId][matchingSet.id] = legacyProgress;
      }
      try {
        saveProfileState(window.localStorage, profileState);
        if (matchingSet) window.localStorage.removeItem('puggern.progress');
      } catch (error) {
        setAppError(`Kunne ikke lagre profiler og øving: ${error.message}`);
      }
    });
  } catch (error) {
    setAppError(`Kunne ikke laste profiler og øving: ${error.message}`);
  }
}

await initializeProfileState();

async function persistProfileState(updateState, action, errorSource = 'app') {
  try {
    await withProfileStateLock(() => {
      const latestState = loadProfileState(window.localStorage) ?? profileState;
      const updatedState = updateState(latestState);
      const nextState = {
        ...updatedState,
        profiles: updatedState.profiles.map((profile) => {
          const earned = pendingRewards.get(profile.id);
          return earned ? { ...profile, rewards: addRewards(profile.rewards, earned) } : profile;
        }),
      };
      saveProfileState(window.localStorage, nextState);
      profileState = nextState;
      pendingRewards.clear();
    });
    setAppError('');
    renderProfiles();
    return true;
  } catch (error) {
    setAppError(`Kunne ikke ${action}: ${error.message}`, errorSource);
    return false;
  }
}

function activeProfileProgress() {
  return profileState.progress[profileState.activeProfileId] ?? {};
}

function renderProfiles() {
  profileSelect.replaceChildren();
  profileState.profiles.forEach((profile) => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.avatar ? `${profile.avatar} ${profile.name}` : profile.name;
    option.selected = profile.id === profileState.activeProfileId;
    profileSelect.append(option);
  });
  newProfileButton.disabled = profileState.profiles.length >= MAX_PROFILES;
  newProfileButton.title = newProfileButton.disabled
    ? `Du kan ha maksimalt ${MAX_PROFILES} profiler.`
    : '';
  const profile = profileState.profiles.find(({ id }) => id === profileState.activeProfileId);
  const rewards = profile.rewards ?? createRewards();
  document.querySelector('#profile-rewards').textContent =
    `${rewards.points} poeng totalt · Beste rekke: ${rewards.bestStreak} · ${rewards.completedSets} sett fullført`;
}

function updateConnectionStatus() {
  status.textContent = navigator.onLine
    ? 'Klar til øving, med eller uten nett'
    : 'Frakoblet · lagret på denne enheten';
}

function showView(view) {
  setupView.hidden = view !== setupView;
  practiceView.hidden = view !== practiceView;
  completeView.hidden = view !== completeView;
  if (view !== practiceView) correctionAnnouncement.textContent = '';
}

function showSetupError(message) {
  setupError.textContent = message;
  setupError.hidden = !message;
}

function settingsFromForm() {
  return {
    caseSensitive: document.querySelector('#case-sensitive').checked,
    accentSensitive: document.querySelector('#accent-sensitive').checked,
  };
}

async function persistProgress() {
  const progress = { version: PROGRESS_VERSION, session, words };
  const saved = await persistProfileState(
    (state) => ({
      ...state,
      progress: {
        ...state.progress,
        [currentProfileId]: {
          ...Object.fromEntries(
            Object.entries(state.progress[currentProfileId] ?? {}).filter(
              ([setId]) => setId !== currentSetId,
            ),
          ),
          [currentSetId]: progress,
        },
      },
    }),
    'lagre øvingsfremgangen',
  );
  unsavedProgress = !saved;
  const warning = document.querySelector('#progress-warning');
  warning.hidden = saved;
  if (!saved) {
    setAppError('');
    warning.textContent =
      'Fremgangen kunne ikke lagres på denne enheten. Du kan fortsette å øve, men fremgangen kan gå tapt når du laster siden på nytt.';
  }
  renderWordSets();
  return saved;
}

async function startSession(
  nextWords,
  nextSession,
  setId,
  profileId = profileState.activeProfileId,
) {
  words = nextWords;
  session = nextSession;
  currentSetId = setId;
  currentProfileId = profileId;
  await persistProgress();
  renderPractice();
}

async function startWordSet(set) {
  const practiceWords = wordsForDirection(set.words, set.direction);
  await startSession(
    practiceWords,
    createSession(practiceWords, Math.random, set.settings),
    set.id,
  );
}

async function continueWordSet(set) {
  const progress = wordSetProgress(set.id);
  if (!progress) return;
  await startSession(progress.words, progress.session, set.id);
}

function wordSetProgress(setId) {
  if (
    unsavedProgress &&
    currentProfileId === profileState.activeProfileId &&
    currentSetId === setId
  ) {
    return { words, session };
  }
  return activeProfileProgress()[setId];
}

function renderPractice(message = '', { announceCorrection = false } = {}) {
  const word = currentWord(session, words);
  if (!word) {
    finishSession();
    return;
  }

  const learnedCount = session.learned.length;
  const isCorrection = session.correction;
  progressLabel.textContent = `${learnedCount} av ${words.length} lært · ${session.queue.length} oppgaver igjen`;
  const progressBar = document.querySelector('#practice-progress');
  progressBar.max = words.length;
  progressBar.value = learnedCount;
  document.querySelector('#practice-rewards').textContent =
    `${session.points ?? 0} poeng · ${session.streak ?? 0} riktige på rad`;
  prompt.textContent = word.prompt;
  answerLabel.textContent = isCorrection ? 'Skriv ordet én gang' : 'Stavingen din';
  correctionFeedback.hidden = !isCorrection;
  correctAnswer.textContent = isCorrection ? word.answer : '';
  correctionInstruction.textContent = isCorrection
    ? 'Skriv ordet én gang, så kommer det tilbake senere.'
    : '';
  feedback.textContent = isCorrection ? '' : message;
  feedback.classList.toggle('error', false);
  if (isCorrection) {
    answerInput.setAttribute('aria-describedby', 'correction-feedback');
  } else {
    answerInput.removeAttribute('aria-describedby');
  }
  answerInput.value = '';
  showView(practiceView);
  correctionAnnouncement.textContent = isCorrection
    ? announceCorrection
      ? `Riktig stavemåte er ${word.answer}. Skriv ordet én gang, så kommer det tilbake senere.`
      : 'Rettelsen vises ved svarfeltet.'
    : '';
  answerInput.focus();
}

function finishSession() {
  document.querySelector('#completion-rewards').textContent =
    `${session.points ?? 0} poeng · Beste rekke: ${session.bestStreak ?? 0} riktige på rad`;
  const firstTryCount = session.learned.filter((id) => !session.mistakes[id]).length;
  document.querySelector('#completion-message').textContent =
    `Du lærte ${session.learned.length} øveoppføringer. ${firstTryCount} riktige på første forsøk.`;
  document.querySelector('#completion-practiced-count').textContent = String(
    session.learned.length,
  );
  document.querySelector('#completion-first-try-count').textContent = String(firstTryCount);

  const hardestWords = document.querySelector('#hardest-words');
  const wordsNeedingPractice = Object.entries(session.mistakes)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([id, count]) => ({ word: words.find((item) => item.id === id), count }))
    .filter(({ word }) => word);
  document.querySelector('#completion-extra-practice-count').textContent = String(
    wordsNeedingPractice.length,
  );
  hardestWords.replaceChildren();
  if (wordsNeedingPractice.length > 0) {
    wordsNeedingPractice.forEach(({ word, count }) => {
      const item = document.createElement('li');
      item.textContent = `${word.prompt} → ${word.answer} · ${count} feilsvar`;
      hardestWords.append(item);
    });
  } else {
    const item = document.createElement('li');
    item.textContent = 'Ingen ord trengte ekstra øving denne gangen.';
    hardestWords.append(item);
  }
  showView(completeView);
  document.querySelector('#completion-heading').focus();
}

function makeButton(label, action, className = 'button secondary') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
}

function updateWordSets(nextWordSets, action) {
  try {
    saveWordSets(window.localStorage, nextWordSets);
  } catch (error) {
    showSetupError(`Kunne ikke ${action} ordsettet: ${error.message}`);
    return false;
  }
  wordSets = nextWordSets;
  showSetupError('');
  renderWordSets();
  return true;
}

function renderWordSets() {
  wordSetList.replaceChildren();
  const visibleSets = wordSets
    .filter((set) => set.archived === showArchived)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  emptySets.hidden = visibleSets.length > 0;
  emptySets.textContent = showArchived
    ? 'Ingen arkiverte ordsett.'
    : 'Ingen ordsett ennå. Lag ditt første under.';
  archiveToggle.textContent = showArchived ? 'Vis aktive ordsett' : 'Vis arkiv';

  visibleSets.forEach((set) => {
    const item = document.createElement('li');
    item.className = 'word-set-item';
    const details = document.createElement('div');
    details.className = 'word-set-details';
    const name = document.createElement('h3');
    name.textContent = set.name;
    const summary = document.createElement('p');
    const progress = wordSetProgress(set.id);
    const progressSummary = !progress
      ? ''
      : progress.session.queue.length === 0
        ? ' · Fullført'
        : ` · ${progress.session.learned.length} lært`;
    summary.textContent = `${set.words.length} ord · ${
      {
        'prompt-to-answer': 'hint til svar',
        'answer-to-prompt': 'svar til hint',
        both: 'begge retninger',
      }[set.direction]
    }${progressSummary}`;
    details.append(name, summary);

    const actions = document.createElement('div');
    actions.className = 'set-actions';
    if (!set.archived) {
      if (progress && progress.session.queue.length > 0) {
        actions.append(
          makeButton('Fortsett øvingen', () => continueWordSet(set), 'button primary'),
        );
        actions.append(makeButton('Start på nytt', () => startWordSet(set)));
      } else if (progress) {
        actions.append(makeButton('Øv på nytt', () => startWordSet(set), 'button primary'));
      } else {
        actions.append(makeButton('Start øving', () => startWordSet(set), 'button primary'));
      }
      actions.append(makeButton('Rediger', () => openEditor(set)));
      actions.append(makeButton('Kopier', () => duplicateWordSet(set)));
      actions.append(makeButton('Arkiver', () => changeArchived(set, true)));
    } else {
      actions.append(makeButton('Gjenopprett', () => changeArchived(set, false)));
      actions.append(makeButton('Rediger', () => openEditor(set)));
    }
    actions.append(makeButton('Slett', () => deleteWordSet(set), 'button danger'));
    item.append(details, actions);
    wordSetList.append(item);
  });
}

function openEditor(set = null) {
  editorSetId = set?.id ?? null;
  editorTitle.textContent = set ? 'Rediger ordsett' : 'Nytt ordsett';
  wordSetNameInput.value = set?.name ?? '';
  wordSetInput.value =
    set?.words.map(({ prompt: clue, answer }) => `${clue}\t${answer}`).join('\n') ?? '';
  document.querySelector('#quiz-direction').value = set?.direction ?? 'prompt-to-answer';
  document.querySelector('#case-sensitive').checked = set?.settings.caseSensitive ?? false;
  document.querySelector('#accent-sensitive').checked = set?.settings.accentSensitive ?? false;
  showSetupError('');
  renderPreview();
  wordSetForm.hidden = false;
  wordSetNameInput.focus();
}

function previewEntryError(entry, index) {
  const promptText = entry.prompt.trim();
  const answerText = entry.answer.trim();
  if (entry.error?.startsWith('Linje')) return entry.error;
  if (!promptText || !answerText) {
    return entry.error ?? `Linje ${entry.lineNumber} må inneholde både et hint og et svar.`;
  }
  if (index >= MAX_WORDS_PER_SET)
    return `Et ordsett kan inneholde maksimalt ${MAX_WORDS_PER_SET} ord.`;
  if (promptText.length > MAX_WORD_LENGTH || answerText.length > MAX_WORD_LENGTH) {
    return `Hint og svar kan ikke være lengre enn ${MAX_WORD_LENGTH} tegn.`;
  }
  return null;
}

function renderPreview() {
  editorRows = previewWordSet(wordSetInput.value);
  wordPreview.replaceChildren();
  if (editorRows.length === 0) {
    const help = document.createElement('p');
    help.className = 'field-help';
    help.textContent = 'Forhåndsvisningen av hint og svar vises her.';
    wordPreview.append(help);
    return;
  }

  const heading = document.createElement('h3');
  heading.textContent = `Forhåndsvisning · ${editorRows.length} oppføringer`;
  wordPreview.append(heading);
  editorRows.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'preview-row';
    const promptField = document.createElement('input');
    promptField.type = 'text';
    promptField.value = entry.prompt;
    promptField.maxLength = MAX_WORD_LENGTH;
    promptField.setAttribute('aria-label', `Hint, linje ${entry.lineNumber}`);
    const answerField = document.createElement('input');
    answerField.type = 'text';
    answerField.value = entry.answer;
    answerField.maxLength = MAX_WORD_LENGTH;
    answerField.setAttribute('aria-label', `Svar, linje ${entry.lineNumber}`);
    const error = document.createElement('p');
    error.className = 'preview-error';
    row.append(promptField, answerField, error);

    const updateRow = (canRepair = false) => {
      entry.prompt = promptField.value;
      entry.answer = answerField.value;
      if (
        canRepair &&
        entry.prompt.trim() &&
        entry.answer.trim() &&
        entry.error?.startsWith('Linje')
      ) {
        entry.error = null;
      }
      if (canRepair) {
        const sourceLines = wordSetInput.value.split(/\r?\n/);
        sourceLines[entry.lineNumber - 1] = `${entry.prompt}\t${entry.answer}`;
        wordSetInput.value = sourceLines.join('\n');
      }
      const message = previewEntryError(entry, index);
      row.classList.toggle('invalid', Boolean(message));
      error.textContent = message ?? '';
    };
    promptField.addEventListener('input', () => updateRow(true));
    answerField.addEventListener('input', () => updateRow(true));
    updateRow();
    wordPreview.append(row);
  });
}

function saveEditor(startAfterSave = false) {
  const name = wordSetNameInput.value.trim();
  if (!name) {
    showSetupError('Skriv inn et navn på ordsettet.');
    wordSetNameInput.focus();
    return;
  }
  if (name.length > MAX_WORD_SET_NAME_LENGTH) {
    showSetupError(`Navnet kan ikke være lengre enn ${MAX_WORD_SET_NAME_LENGTH} tegn.`);
    wordSetNameInput.focus();
    return;
  }
  if (editorRows.length === 0) {
    showSetupError('Legg til minst ett hint og ett svar.');
    wordSetInput.focus();
    return;
  }
  const errors = editorRows.map(previewEntryError);
  if (errors.some(Boolean)) {
    showSetupError('Rett opp de markerte linjene før du lagrer ordsettet.');
    wordPreview.querySelector('.invalid input')?.focus();
    return;
  }

  const now = new Date().toISOString();
  const previous = wordSets.find((set) => set.id === editorSetId);
  const set = {
    id: previous?.id ?? crypto.randomUUID(),
    name,
    words: editorRows.map(({ prompt: clue, answer }, index) => ({
      id: String(index),
      prompt: clue.trim(),
      answer: answer.trim(),
    })),
    direction: document.querySelector('#quiz-direction').value,
    settings: settingsFromForm(),
    archived: previous?.archived ?? false,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
  const nextWordSets = previous
    ? wordSets.map((item) => (item.id === set.id ? set : item))
    : [set, ...wordSets];
  if (!updateWordSets(nextWordSets, 'lagre')) return;
  if (!previous) showArchived = false;
  renderWordSets();
  wordSetForm.hidden = true;
  showSetupError('');
  if (startAfterSave) startWordSet(set);
}

function changeArchived(set, archived) {
  const now = new Date().toISOString();
  const nextWordSets = wordSets.map((item) =>
    item.id === set.id ? { ...item, archived, updatedAt: now } : item,
  );
  updateWordSets(nextWordSets, archived ? 'arkivere' : 'gjenopprette');
}

function duplicateWordSet(set) {
  const now = new Date().toISOString();
  const copy = {
    ...set,
    id: crypto.randomUUID(),
    name: `${set.name} (kopi)`.slice(0, MAX_WORD_SET_NAME_LENGTH),
    words: set.words.map((word) => ({ ...word })),
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  updateWordSets([copy, ...wordSets], 'kopiere');
}

function deleteWordSet(set) {
  if (!window.confirm(`Slette ordsettet «${set.name}»?`)) return;
  if (
    !updateWordSets(
      wordSets.filter((item) => item.id !== set.id),
      'slette',
    )
  )
    return;
  persistProfileState(
    (state) => ({
      ...state,
      progress: Object.fromEntries(
        Object.entries(state.progress).map(([profileId, sets]) => {
          const remaining = { ...sets };
          delete remaining[set.id];
          return [profileId, remaining];
        }),
      ),
    }),
    'fjerne øvingsfremgangen',
  );
}

window.addEventListener('storage', (event) => {
  if (event.key !== PROFILE_STATE_KEY) return;
  const latestState = loadProfileState(window.localStorage);
  if (!latestState) return;
  profileState = latestState;
  renderProfiles();
  renderWordSets();
});

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
updateConnectionStatus();
renderProfiles();
renderWordSets();
const latestProgress = Object.entries(activeProfileProgress()).at(-1);
const [savedSetId, savedProgress] = latestProgress ?? [];
if (savedProgress?.session.queue.length === 0 && wordSets.some((set) => set.id === savedSetId)) {
  words = savedProgress.words;
  session = savedProgress.session;
  currentSetId = savedSetId;
  currentProfileId = profileState.activeProfileId;
  finishSession();
}
profileSelect.addEventListener('change', async () => {
  const activeProfileId = profileSelect.value;
  if (await persistProfileState((state) => ({ ...state, activeProfileId }), 'bytte profil'))
    renderWordSets();
  else renderProfiles();
});
newProfileButton.addEventListener('click', () => {
  profileForm.hidden = false;
  profileNameInput.focus();
});
document.querySelector('#cancel-profile-button').addEventListener('click', () => {
  profileForm.hidden = true;
  profileNameInput.value = '';
  profileAvatarInput.value = '';
  if (appError.dataset.source === 'profile') setAppError('');
  newProfileButton.focus();
});
profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = profileNameInput.value.trim();
  const avatar = profileAvatarInput.value.trim();
  if (!name) {
    setAppError('Skriv inn et profilnavn.', 'profile');
    profileNameInput.focus();
    return;
  }
  if (name.length > MAX_PROFILE_NAME_LENGTH || avatar.length > MAX_PROFILE_AVATAR_LENGTH) {
    setAppError('Profilnavnet eller emojien er for lang.', 'profile');
    return;
  }
  const profile = { id: crypto.randomUUID(), name, avatar, rewards: createRewards() };
  if (
    await persistProfileState(
      (state) => {
        if (state.profiles.length >= MAX_PROFILES) {
          throw new Error(`Du kan ha maksimalt ${MAX_PROFILES} profiler.`);
        }
        return {
          ...state,
          activeProfileId: profile.id,
          profiles: [...state.profiles, profile],
          progress: { ...state.progress, [profile.id]: {} },
        };
      },
      'lagre profilen',
      'profile',
    )
  ) {
    renderProfiles();
    renderWordSets();
    profileForm.hidden = true;
    profileNameInput.value = '';
    profileAvatarInput.value = '';
    profileSelect.focus();
  }
});

document.querySelector('#new-set-button').addEventListener('click', () => openEditor());
document.querySelector('#cancel-edit-button').addEventListener('click', () => {
  wordSetForm.hidden = true;
  showSetupError('');
});
document.querySelector('#archive-toggle').addEventListener('click', () => {
  showArchived = !showArchived;
  renderWordSets();
});
wordSetInput.addEventListener('input', renderPreview);
wordSetForm.addEventListener('submit', (event) => {
  event.preventDefault();
  saveEditor();
});
document.querySelector('#save-and-start-button').addEventListener('click', () => saveEditor(true));

answerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (answerButton.disabled) return;
  answerButton.disabled = true;
  answerInput.readOnly = true;
  try {
    const outcome = submitAnswer(session, answerInput.value, words, session.settings);
    const earned = {
      points: (outcome.session.points ?? 0) - (session.points ?? 0),
      bestStreak: outcome.session.bestStreak ?? 0,
      completedSets: outcome.result === 'complete' && session.queue.length > 0 ? 1 : 0,
    };
    pendingRewards.set(currentProfileId, addRewards(pendingRewards.get(currentProfileId), earned));
    session = outcome.session;
    await persistProgress();

    if (outcome.result === 'incorrect') {
      renderPractice('', {
        announceCorrection: document.activeElement === answerInput,
      });
      return;
    }
    if (outcome.result === 'retry-scheduled') {
      renderPractice('Takk! Dette ordet kommer tilbake litt senere.');
      return;
    }
    if (outcome.result === 'complete') {
      finishSession();
      return;
    }
    renderPractice('Riktig! Fortsett slik.');
  } finally {
    answerButton.disabled = false;
    answerInput.readOnly = false;
  }
});

document.querySelector('#back-button').addEventListener('click', () => {
  showView(setupView);
  renderWordSets();
});
document.querySelector('#completion-restart-button').addEventListener('click', () => {
  startSession(
    words,
    createSession(words, Math.random, session.settings),
    currentSetId,
    currentProfileId,
  );
});
document.querySelector('#completion-sets-button').addEventListener('click', () => {
  showView(setupView);
  document.querySelector('#new-set-button').focus();
  renderWordSets();
});
document.querySelector('#completion-new-set-button').addEventListener('click', () => {
  showView(setupView);
  renderWordSets();
  openEditor();
});

if ('serviceWorker' in navigator) {
  const registerServiceWorker = () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  };
  if (document.readyState === 'complete') registerServiceWorker();
  else window.addEventListener('load', registerServiceWorker, { once: true });
}
