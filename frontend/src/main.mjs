import {
  createSession,
  currentWord,
  loadProgress,
  MAX_LANGUAGE_NAME_LENGTH,
  MAX_WORD_LENGTH,
  MAX_WORDS_PER_SET,
  previewWordSet,
  PROGRESS_VERSION,
  submitAnswer,
  wordsForExercise,
  wordsForDirection,
} from './learning.mjs?v=9';
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
} from './profiles.mjs?v=9';
import {
  loadWordSets,
  saveWordSets,
  MAX_WORD_SET_NAME_LENGTH,
  MAX_WORD_SETS,
} from './word-sets.mjs?v=10';
import { recordCreationAttempt, MIN_CREATION_FORM_TIME_MS } from './creation-guard.mjs?v=3';
import {
  SHARE_PARAM,
  MAX_SHARE_URL_LENGTH,
  createShareUrl,
  parseShareUrl,
} from './share-word-set.mjs?v=3';
import { answerFeedback, createPracticeEffects } from './practice-feedback.mjs?v=2';

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
const languageContextAnnouncement = document.querySelector('#language-context-announcement');
const correctionFeedback = document.querySelector('#correction-feedback');
const correctAnswer = document.querySelector('#correct-answer');
const correctionInstruction = document.querySelector('#correction-instruction');
const progressLabel = document.querySelector('#progress-label');
const prompt = document.querySelector('#prompt');
const hintLanguage = document.querySelector('#hint-language');
const answerLanguageInstruction = document.querySelector('#answer-language-instruction');
const answerLabel = document.querySelector('#answer-label');
const editorTitle = document.querySelector('#editor-title');
const archiveToggle = document.querySelector('#archive-toggle');
const newSetButton = document.querySelector('#new-set-button');
const setLimitHelp = document.querySelector('#set-limit-help');
const exerciseConfigDialog = document.querySelector('#exercise-config-dialog');
const exerciseConfigForm = document.querySelector('#exercise-config-form');
const shareStatus = document.querySelector('#share-status');
const shareError = document.querySelector('#share-error');
const shareLinkDialog = document.querySelector('#share-link-dialog');
const shareLinkInput = document.querySelector('#share-link-input');
const importButton = document.querySelector('#import-link-button');
const importDialog = document.querySelector('#import-link-dialog');
const importLinkForm = document.querySelector('#import-link-form');
const importLinkInput = document.querySelector('#import-link-input');
const importConfirmForm = document.querySelector('#import-confirm-form');
const importSaveButton = document.querySelector('#import-save-button');
const importPreview = document.querySelector('#import-preview');
const importError = document.querySelector('#import-error');
importLinkInput.maxLength = MAX_SHARE_URL_LENGTH;
const effects = createPracticeEffects({
  feedback,
  correction: correctionFeedback,
  progress: document.querySelector('#practice-progress'),
  celebration: document.querySelector('.celebration'),
  soundToggle: document.querySelector('#sound-toggle'),
});
let viewRevision = 0;
let wordSets = loadWordSets(window.localStorage);
let profileState = loadProfileState(window.localStorage);
let showArchived = false;
let editorSetId = null;
let editorRows = [];
let words = [];
let session = null;
let currentSetId = null;
let currentProfileId = null;
let lastRenderedPracticeCardId = null;
let pendingExerciseSet = null;
let pendingExerciseProfileId = null;
let exerciseConfigTrigger = null;
let unsavedProgress = false;
let shareLinkTrigger = null;
let importTrigger = null;
let importDraft = null;
let importSaving = false;
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

function repairStoredProfileState() {
  try {
    const stored = JSON.stringify(JSON.parse(window.localStorage.getItem(PROFILE_STATE_KEY)));
    if (stored !== JSON.stringify(profileState)) {
      saveProfileState(window.localStorage, profileState);
    }
  } catch (error) {
    setAppError(`Kunne ikke lagre profiler og øving: ${error.message}`);
  }
}

async function initializeProfileState() {
  try {
    await withProfileStateLock(() => {
      profileState = loadProfileState(window.localStorage);
      if (profileState) {
        repairStoredProfileState();
        return;
      }

      profileState = createProfileState();
      const legacyProgress = loadProgress(window.localStorage);
      const matchingSet = legacyProgress
        ? wordSets.find((set) =>
            sameWordContent(wordsForDirection(set.words, set.direction), legacyProgress.words),
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
  effects.cancel();
  viewRevision += 1;
  setupView.hidden = view !== setupView;
  practiceView.hidden = view !== practiceView;
  completeView.hidden = view !== completeView;
  if (view !== practiceView) correctionAnnouncement.textContent = '';
}

function showSetupError(message) {
  setupError.textContent = message;
  setupError.hidden = !message;
  if (message) setupError.scrollIntoView({ block: 'nearest' });
}

function showCreationError(form, message) {
  const error = form.querySelector('.creation-error');
  error.textContent = message;
  error.hidden = !message;
  if (message) error.scrollIntoView({ block: 'nearest' });
}

async function checkCreationForm(form) {
  const honeypot = form.querySelector('[name="website"]');
  if (honeypot.value) return 'Kunne ikke lagre. Sjekk feltene og prøv igjen.';

  const elapsed = Date.now() - Number(form.dataset.openedAt);
  if (!Number.isFinite(elapsed) || elapsed < MIN_CREATION_FORM_TIME_MS) {
    return 'Vent et lite øyeblikk før du lagrer.';
  }

  return checkCreationRate();
}

async function checkCreationRate() {
  const result = await recordCreationAttempt(window.localStorage);
  if (!result.allowed) {
    const seconds = Math.ceil(result.retryAfterMs / 1000);
    return `Du har lagret flere ting nettopp. Vent ${seconds} sekunder før du prøver igjen.`;
  }
  return null;
}

function settingsFromForm() {
  return {
    caseSensitive: document.querySelector('#case-sensitive').checked,
    accentSensitive: document.querySelector('#accent-sensitive').checked,
  };
}

function directionModeForSet(set) {
  return (
    {
      'prompt-to-answer': 'forward',
      'answer-to-prompt': 'reverse',
      both: 'mixed',
    }[set.direction] ?? 'forward'
  );
}

function sameWordContent(left, right) {
  return (
    left.length === right.length &&
    left.every(
      (word, index) =>
        word.id === right[index]?.id &&
        word.prompt === right[index]?.prompt &&
        word.answer === right[index]?.answer,
    )
  );
}

function languageMetadata(word, set, sourceDirection = word.sourceDirection) {
  if (!['forward', 'reverse'].includes(sourceDirection)) {
    return {
      ...word,
      hintLanguageLabel: 'Språk ikke angitt',
      answerLanguageInstruction: 'Svar på oversettelsen',
    };
  }
  const hintIsFirstColumn = sourceDirection === 'forward';
  const hintLanguage = hintIsFirstColumn ? set.promptLanguage : set.answerLanguage;
  const answerLanguage = hintIsFirstColumn ? set.answerLanguage : set.promptLanguage;
  return {
    ...word,
    sourceDirection,
    hintLanguageLabel: hintLanguage
      ? `Hint på ${hintLanguage}`
      : `Hint fra ${hintIsFirstColumn ? 'første' : 'andre'} kolonne`,
    answerLanguageInstruction: answerLanguage
      ? `Skriv på ${answerLanguage}`
      : `Svar fra ${hintIsFirstColumn ? 'andre' : 'første'} kolonne`,
  };
}

function createPracticeWords(set, directionMode) {
  return wordsForExercise(set.words, directionMode).map((word) => languageMetadata(word, set));
}

function recoverLegacyDirection(card, set, exerciseConfig) {
  if (['forward', 'reverse'].includes(card.sourceDirection)) return card.sourceDirection;
  if (exerciseConfig?.directionMode === 'forward') return 'forward';
  if (exerciseConfig?.directionMode === 'reverse') return 'reverse';

  const matches = new Set();
  for (const sourceWord of set.words) {
    const possibleIds = [
      [sourceWord.id, ['forward', 'reverse']],
      [`${sourceWord.id}:forward`, ['forward']],
      [`${sourceWord.id}:reverse`, ['reverse']],
    ];
    for (const [id, directions] of possibleIds) {
      if (card.id !== id) continue;
      if (
        directions.includes('forward') &&
        card.prompt === sourceWord.prompt &&
        card.answer === sourceWord.answer
      ) {
        matches.add('forward');
      }
      if (
        directions.includes('reverse') &&
        card.prompt === sourceWord.answer &&
        card.answer === sourceWord.prompt
      ) {
        matches.add('reverse');
      }
    }
  }
  return matches.size === 1 ? [...matches][0] : null;
}

function restorePracticeLanguageMetadata(progress, set) {
  return progress.words.map((word) => {
    if (word.hintLanguageLabel && word.answerLanguageInstruction) return word;
    const direction = recoverLegacyDirection(word, set, progress.session.exerciseConfig);
    return languageMetadata(word, set, direction);
  });
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
  effects.cancel();
  viewRevision += 1;
  words = nextWords;
  session = nextSession;
  currentSetId = setId;
  currentProfileId = profileId;
  lastRenderedPracticeCardId = null;
  languageContextAnnouncement.textContent = '';
  await persistProgress();
  renderPractice();
}

function openExerciseSetup(set) {
  const savedConfig = wordSetProgress(set.id)?.session.exerciseConfig;
  const directionMode = savedConfig?.directionMode ?? directionModeForSet(set);
  document.querySelector('#exercise-direction').value = directionMode;
  document.querySelector('#exercise-order').value = savedConfig?.orderMode ?? 'shuffled';
  document.querySelector('#exercise-config-title').textContent = `Start øving: ${set.name}`;
  exerciseConfigTrigger = document.activeElement;
  pendingExerciseSet = set;
  pendingExerciseProfileId = profileState.activeProfileId;
  exerciseConfigDialog.showModal();
}

async function startWordSet(set, exerciseConfig, profileId) {
  const practiceWords = createPracticeWords(set, exerciseConfig.directionMode);
  await startSession(
    practiceWords,
    createSession(practiceWords, Math.random, set.settings, exerciseConfig),
    set.id,
    profileId,
  );
}

async function continueWordSet(set) {
  const progress = wordSetProgress(set.id);
  if (!progress) return;
  await startSession(restorePracticeLanguageMetadata(progress, set), progress.session, set.id);
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

function renderPractice(message = '', { announceCorrection = false, points = 0, icon = '✓' } = {}) {
  const word = currentWord(session, words);
  if (!word) {
    finishSession();
    return;
  }

  const cardChanged = lastRenderedPracticeCardId !== null && lastRenderedPracticeCardId !== word.id;
  lastRenderedPracticeCardId = word.id;
  const learnedCount = session.learned.length;
  const isCorrection = session.correction;
  progressLabel.textContent = `${learnedCount} av ${words.length} lært · ${session.queue.length} oppgaver igjen`;
  const progressBar = document.querySelector('#practice-progress');
  progressBar.max = words.length;
  progressBar.value = learnedCount;
  document.querySelector('#practice-rewards').textContent =
    `${session.points ?? 0} poeng · ${session.streak ?? 0} riktige på rad`;
  prompt.textContent = word.prompt;
  hintLanguage.textContent = word.hintLanguageLabel ?? 'Språk ikke angitt';
  answerLanguageInstruction.textContent = word.answerLanguageInstruction ?? 'Svar på oversettelsen';
  if (cardChanged && document.activeElement === answerInput) {
    languageContextAnnouncement.textContent = `${hintLanguage.textContent}. ${answerLanguageInstruction.textContent}`;
  }
  answerLabel.textContent = isCorrection ? 'Skriv riktig svar' : 'Stavingen din';
  correctionFeedback.hidden = !isCorrection;
  correctAnswer.textContent = isCorrection ? word.answer : '';
  correctionInstruction.textContent = isCorrection ? 'Skriv riktig svar for å gå videre.' : '';
  feedback.textContent = isCorrection ? '' : message;
  if (!isCorrection && message) {
    const marker = document.createElement('span');
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = `${icon} `;
    feedback.prepend(marker);
    if (points > 0) {
      const badge = document.createElement('span');
      badge.className = 'points-earned';
      badge.textContent = `+${points} poeng`;
      feedback.append(' ', badge);
    }
  }
  feedback.classList.toggle('error', false);
  answerInput.setAttribute(
    'aria-describedby',
    [
      'hint-language',
      'answer-language-instruction',
      ...(isCorrection ? ['correction-feedback'] : []),
    ].join(' '),
  );
  answerInput.value = '';
  showView(practiceView);
  correctionAnnouncement.textContent = isCorrection
    ? announceCorrection
      ? `Riktig stavemåte er ${word.answer}. Skriv riktig svar for å gå videre.`
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

function restoreDialogFocus(trigger) {
  const target =
    trigger?.isConnected && !trigger.closest('[hidden]') && !trigger.disabled
      ? trigger
      : !setupView.hidden
        ? importButton
        : !practiceView.hidden
          ? document.querySelector('#back-button')
          : document.querySelector('#completion-heading');
  target.focus();
}

function showShareFeedback(message = '', error = '') {
  shareStatus.textContent = message;
  shareError.textContent = error;
  shareError.hidden = !error;
}

async function shareWordSet(set, trigger) {
  if (trigger.disabled) return;
  trigger.disabled = true;
  showShareFeedback();
  try {
    const url = createShareUrl(set, window.location.href);
    if (navigator.share) {
      try {
        await navigator.share({ title: set.name, url });
        showShareFeedback('Ordsettet er delt.');
        return;
      } catch (error) {
        if (error.name === 'AbortError') {
          showShareFeedback('Delingen ble avbrutt.');
          return;
        }
      }
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        showShareFeedback('Lenken er kopiert. Du kan lime den inn og dele den.');
        return;
      } catch {
        // Manuell kopiering fungerer også uten tilgang til utklippstavlen.
      }
    }
    shareLinkTrigger = trigger;
    shareLinkInput.value = url;
    shareLinkDialog.showModal();
    shareLinkInput.focus();
    shareLinkInput.select();
  } catch (error) {
    showShareFeedback('', `Kunne ikke dele ordsettet: ${error.message}`);
  } finally {
    trigger.disabled = false;
  }
}

function showImportError(message = '') {
  importError.textContent = message;
  importError.hidden = !message;
}

function openImportDialog(trigger = importButton) {
  importTrigger = trigger;
  importDraft = null;
  importLinkForm.reset();
  importConfirmForm.reset();
  importConfirmForm.dataset.openedAt = String(Date.now());
  importLinkForm.hidden = false;
  importConfirmForm.hidden = true;
  importPreview.replaceChildren();
  showImportError();
  importDialog.showModal();
  importLinkInput.focus();
}

function previewImport(input) {
  importDraft = null;
  importPreview.replaceChildren();
  showImportError();
  try {
    const draft = parseShareUrl(input);
    const title = document.createElement('h3');
    title.tabIndex = -1;
    title.textContent = draft.name;
    const summary = document.createElement('p');
    const direction = {
      'prompt-to-answer': 'Hint → svar',
      'answer-to-prompt': 'Svar → hint',
      both: 'Begge retninger',
    }[draft.direction];
    summary.textContent = `${draft.words.length} ord · Retning: ${direction}`;
    const settings = document.createElement('p');
    settings.textContent =
      `Skill mellom store og små bokstaver: ${draft.settings.caseSensitive ? 'Ja' : 'Nei'}. ` +
      `Ta hensyn til aksenter: ${draft.settings.accentSensitive ? 'Ja' : 'Nei'}.`;
    const help = document.createElement('p');
    help.textContent = 'De første fem oppføringene (hint → svar):';
    const rows = document.createElement('ol');
    draft.words.slice(0, 5).forEach((word) => {
      const row = document.createElement('li');
      row.textContent = `${word.prompt} → ${word.answer}`;
      rows.append(row);
    });
    importPreview.append(title, summary, settings, help, rows);
    importDraft = draft;
    importLinkForm.hidden = true;
    importConfirmForm.hidden = false;
    title.focus();
  } catch (error) {
    importLinkForm.hidden = false;
    importConfirmForm.hidden = true;
    showImportError(error.message);
    importLinkInput.focus();
  }
}

async function saveImportedWordSet() {
  if (importSaving || !importDraft) return;
  const draft = importDraft;
  const restoreSaveFocus = document.activeElement === importSaveButton;
  importSaving = true;
  importSaveButton.disabled = true;
  showImportError();
  try {
    if (loadWordSets(window.localStorage).length >= MAX_WORD_SETS) {
      showImportError(`Du kan ha maksimalt ${MAX_WORD_SETS} ordsett på denne enheten.`);
      return;
    }
    const guardError = await checkCreationForm(importConfirmForm);
    if (importDraft !== draft || !importDialog.open) return;
    if (guardError) {
      showImportError(guardError);
      return;
    }
    const latestSets = loadWordSets(window.localStorage);
    if (latestSets.length >= MAX_WORD_SETS) {
      showImportError(`Du kan ha maksimalt ${MAX_WORD_SETS} ordsett på denne enheten.`);
      return;
    }
    const now = new Date().toISOString();
    const set = {
      ...draft,
      id: crypto.randomUUID(),
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    const nextSets = [set, ...latestSets];
    saveWordSets(window.localStorage, nextSets);
    wordSets = nextSets;
    showArchived = false;
    showView(setupView);
    renderWordSets();
    importDialog.close();
    showShareFeedback('Ordsettet er importert som et nytt ordsett.');
  } catch (error) {
    if (importDraft === draft && importDialog.open) {
      showImportError(`Kunne ikke importere ordsettet: ${error.message}`);
    }
  } finally {
    importSaving = false;
    importSaveButton.disabled = false;
    if (
      restoreSaveFocus &&
      importDialog.open &&
      importDraft === draft &&
      document.activeElement === document.body
    ) {
      importSaveButton.focus();
    }
  }
}

function updateWordSets(nextWordSets, action) {
  if (nextWordSets.length > wordSets.length && nextWordSets.length > MAX_WORD_SETS) {
    showSetupError(`Du kan ha maksimalt ${MAX_WORD_SETS} ordsett på denne enheten.`);
    return false;
  }
  try {
    saveWordSets(window.localStorage, nextWordSets);
  } catch (error) {
    showSetupError(`Kunne ikke ${action} ordsettet: ${error.message}`);
    return false;
  }
  wordSets = nextWordSets;
  showSetupError('');
  showCreationError(wordSetForm, '');
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
  newSetButton.disabled = wordSets.length >= MAX_WORD_SETS;
  setLimitHelp.hidden = !newSetButton.disabled;
  newSetButton.title = newSetButton.disabled
    ? `Du kan ha maksimalt ${MAX_WORD_SETS} ordsett på denne enheten.`
    : '';

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
        actions.append(makeButton('Start på nytt', () => openExerciseSetup(set)));
      } else if (progress) {
        actions.append(makeButton('Øv på nytt', () => openExerciseSetup(set), 'button primary'));
      } else {
        actions.append(makeButton('Start øving', () => openExerciseSetup(set), 'button primary'));
      }
      actions.append(makeButton('Rediger', () => openEditor(set)));
      actions.append(makeButton('Kopier', () => duplicateWordSet(set)));
      actions.append(makeButton('Arkiver', () => changeArchived(set, true)));
    } else {
      actions.append(makeButton('Gjenopprett', () => changeArchived(set, false)));
      actions.append(makeButton('Rediger', () => openEditor(set)));
    }
    const shareButton = makeButton('Del', () => shareWordSet(set, shareButton));
    actions.append(shareButton);
    actions.append(makeButton('Slett', () => deleteWordSet(set), 'button danger'));
    item.append(details, actions);
    wordSetList.append(item);
  });
}

function openEditor(set = null) {
  editorSetId = set?.id ?? null;
  editorTitle.textContent = set ? 'Rediger ordsett' : 'Nytt ordsett';
  wordSetNameInput.value = set?.name ?? '';
  document.querySelector('#prompt-language').value = set?.promptLanguage ?? '';
  document.querySelector('#answer-language').value = set?.answerLanguage ?? '';
  wordSetInput.value =
    set?.words.map(({ prompt: clue, answer }) => `${clue}\t${answer}`).join('\n') ?? '';
  document.querySelector('#quiz-direction').value = set?.direction ?? 'prompt-to-answer';
  document.querySelector('#case-sensitive').checked = set?.settings.caseSensitive ?? false;
  document.querySelector('#accent-sensitive').checked = set?.settings.accentSensitive ?? false;
  showSetupError('');
  showCreationError(wordSetForm, '');
  wordSetForm.dataset.openedAt = String(Date.now());
  wordSetForm.querySelector('[name="website"]').value = '';
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

async function saveEditor(startAfterSave = false) {
  const previous = wordSets.find((set) => set.id === editorSetId);
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
  const promptLanguage = document.querySelector('#prompt-language').value.trim();
  const answerLanguage = document.querySelector('#answer-language').value.trim();
  if (
    promptLanguage.length > MAX_LANGUAGE_NAME_LENGTH ||
    answerLanguage.length > MAX_LANGUAGE_NAME_LENGTH
  ) {
    showSetupError(`Språknavn kan ikke være lengre enn ${MAX_LANGUAGE_NAME_LENGTH} tegn.`);
    const field =
      promptLanguage.length > MAX_LANGUAGE_NAME_LENGTH
        ? document.querySelector('#prompt-language')
        : document.querySelector('#answer-language');
    field.focus();
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
  if (!previous && wordSets.length >= MAX_WORD_SETS) {
    showSetupError(`Du kan ha maksimalt ${MAX_WORD_SETS} ordsett på denne enheten.`);
    return;
  }
  if (!previous) {
    try {
      const guardError = await checkCreationForm(wordSetForm);
      if (guardError) {
        showCreationError(wordSetForm, guardError);
        return;
      }
    } catch (error) {
      showCreationError(
        wordSetForm,
        `Kunne ikke kontrollere opprettingsbegrensningen: ${error.message}`,
      );
      return;
    }
    if (wordSets.length >= MAX_WORD_SETS) {
      showSetupError(`Du kan ha maksimalt ${MAX_WORD_SETS} ordsett på denne enheten.`);
      return;
    }
  }
  const now = new Date().toISOString();
  const set = {
    id: previous?.id ?? crypto.randomUUID(),
    name,
    words: editorRows.map(({ prompt: clue, answer }, index) => ({
      id: String(index),
      prompt: clue.trim(),
      answer: answer.trim(),
    })),
    ...(promptLanguage ? { promptLanguage } : {}),
    ...(answerLanguage ? { answerLanguage } : {}),
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
  showCreationError(wordSetForm, '');
  if (startAfterSave) openExerciseSetup(set);
}

function changeArchived(set, archived) {
  const now = new Date().toISOString();
  const nextWordSets = wordSets.map((item) =>
    item.id === set.id ? { ...item, archived, updatedAt: now } : item,
  );
  updateWordSets(nextWordSets, archived ? 'arkivere' : 'gjenopprette');
}

async function duplicateWordSet(set) {
  if (wordSets.length >= MAX_WORD_SETS) {
    showSetupError(`Du kan ha maksimalt ${MAX_WORD_SETS} ordsett på denne enheten.`);
    return;
  }
  try {
    const guardError = await checkCreationRate();
    if (guardError) {
      showSetupError(guardError);
      return;
    }
  } catch (error) {
    showSetupError(`Kunne ikke kontrollere opprettingsbegrensningen: ${error.message}`);
    return;
  }
  if (wordSets.length >= MAX_WORD_SETS) {
    showSetupError(`Du kan ha maksimalt ${MAX_WORD_SETS} ordsett på denne enheten.`);
    return;
  }
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
  effects.cancel();
  viewRevision += 1;
  const activeProfileId = profileSelect.value;
  if (await persistProfileState((state) => ({ ...state, activeProfileId }), 'bytte profil'))
    renderWordSets();
  else renderProfiles();
});
newProfileButton.addEventListener('click', () => {
  profileForm.dataset.openedAt = String(Date.now());
  profileForm.querySelector('[name="website"]').value = '';
  showCreationError(profileForm, '');
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
  try {
    const guardError = await checkCreationForm(profileForm);
    if (guardError) {
      showCreationError(profileForm, guardError);
      return;
    }
  } catch (error) {
    showCreationError(
      profileForm,
      `Kunne ikke kontrollere opprettingsbegrensningen: ${error.message}`,
    );
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
    showCreationError(profileForm, '');
  }
});

newSetButton.addEventListener('click', () => openEditor());
document.querySelector('#cancel-edit-button').addEventListener('click', () => {
  wordSetForm.hidden = true;
  showSetupError('');
  showCreationError(wordSetForm, '');
});
document.querySelector('#archive-toggle').addEventListener('click', () => {
  showArchived = !showArchived;
  renderWordSets();
});
wordSetInput.addEventListener('input', renderPreview);
wordSetForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await saveEditor();
});
document
  .querySelector('#save-and-start-button')
  .addEventListener('click', async () => await saveEditor(true));

answerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (answerButton.disabled) return;
  answerButton.disabled = true;
  answerInput.readOnly = true;
  effects.cancel();
  effects.prepareSound();
  const submissionRevision = viewRevision;
  try {
    const answeredWord = currentWord(session, words);
    const outcome = submitAnswer(session, answerInput.value, words, session.settings);
    const cue = answerFeedback(session, outcome, answeredWord);
    const earned = {
      points: (outcome.session.points ?? 0) - (session.points ?? 0),
      bestStreak: outcome.session.bestStreak ?? 0,
      completedSets: outcome.result === 'complete' && session.queue.length > 0 ? 1 : 0,
    };
    pendingRewards.set(currentProfileId, addRewards(pendingRewards.get(currentProfileId), earned));
    session = outcome.session;
    await persistProgress();
    if (submissionRevision !== viewRevision) return;

    if (outcome.result === 'incorrect') {
      renderPractice('', {
        announceCorrection: document.activeElement === answerInput,
      });
      effects.play(cue);
      return;
    }
    if (outcome.result === 'complete') {
      finishSession();
      effects.play(cue);
      return;
    }
    renderPractice(cue.message, { points: cue.points });
    effects.play(cue);
  } finally {
    answerButton.disabled = false;
    answerInput.readOnly = false;
  }
});

document.querySelector('#back-button').addEventListener('click', () => {
  showView(setupView);
  renderWordSets();
});
function cancelExerciseSetup() {
  const focusTarget =
    exerciseConfigTrigger?.isConnected && !exerciseConfigTrigger.closest('[hidden]')
      ? exerciseConfigTrigger
      : newSetButton.disabled
        ? document.querySelector('#saved-sets-title')
        : newSetButton;
  pendingExerciseSet = null;
  pendingExerciseProfileId = null;
  exerciseConfigTrigger = null;
  exerciseConfigDialog.close();
  focusTarget.focus();
}

document.querySelector('#cancel-exercise-setup').addEventListener('click', cancelExerciseSetup);
exerciseConfigDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  cancelExerciseSetup();
});
exerciseConfigForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const set = pendingExerciseSet;
  const profileId = pendingExerciseProfileId;
  const exerciseConfig = {
    directionMode: document.querySelector('#exercise-direction').value,
    orderMode: document.querySelector('#exercise-order').value,
  };
  pendingExerciseSet = null;
  pendingExerciseProfileId = null;
  exerciseConfigTrigger = null;
  exerciseConfigDialog.close();
  if (set) await startWordSet(set, exerciseConfig, profileId);
});
document.querySelector('#completion-restart-button').addEventListener('click', () => {
  const set = wordSets.find(({ id }) => id === currentSetId);
  const exerciseConfig = session.exerciseConfig ?? {
    directionMode: set ? directionModeForSet(set) : 'forward',
    orderMode: 'shuffled',
  };
  const restartWords = set
    ? createPracticeWords(set, exerciseConfig.directionMode)
    : wordsForExercise(words, exerciseConfig.directionMode).map((word) =>
        languageMetadata(word, {}),
      );
  startSession(
    restartWords,
    createSession(restartWords, Math.random, session.settings, exerciseConfig),
    currentSetId,
    currentProfileId,
  );
});
document.querySelector('#completion-sets-button').addEventListener('click', () => {
  showView(setupView);
  renderWordSets();
  (newSetButton.disabled ? document.querySelector('#saved-sets-title') : newSetButton).focus();
});
document.querySelector('#completion-new-set-button').addEventListener('click', () => {
  showView(setupView);
  renderWordSets();
  openEditor();
});

importButton.addEventListener('click', () => openImportDialog());
importLinkForm.addEventListener('submit', (event) => {
  event.preventDefault();
  previewImport(importLinkInput.value);
});
importConfirmForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await saveImportedWordSet();
});
document.querySelector('#cancel-import-button').addEventListener('click', () => {
  importDialog.close();
});
importDialog.addEventListener('close', () => {
  importDraft = null;
  importLinkForm.reset();
  importConfirmForm.reset();
  importPreview.replaceChildren();
  showImportError();
  restoreDialogFocus(importTrigger);
  importTrigger = null;
});
document.querySelector('#close-share-link-button').addEventListener('click', () => {
  shareLinkDialog.close();
});
shareLinkDialog.addEventListener('close', () => {
  shareLinkInput.value = '';
  restoreDialogFocus(shareLinkTrigger);
  shareLinkTrigger = null;
});

const incomingShareUrl = new URL(window.location.href);
if (incomingShareUrl.searchParams.has(SHARE_PARAM)) {
  const input = incomingShareUrl.href;
  incomingShareUrl.searchParams.delete(SHARE_PARAM);
  window.history.replaceState(
    window.history.state,
    '',
    `${incomingShareUrl.pathname}${incomingShareUrl.search}${incomingShareUrl.hash}`,
  );
  showView(setupView);
  openImportDialog();
  previewImport(input);
}

if ('serviceWorker' in navigator) {
  const registerServiceWorker = () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  };
  if (document.readyState === 'complete') registerServiceWorker();
  else window.addEventListener('load', registerServiceWorker, { once: true });
}
