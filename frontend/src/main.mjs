import {
  createSession,
  currentWord,
  loadProgress,
  MAX_WORD_LENGTH,
  MAX_WORDS_PER_SET,
  previewWordSet,
  saveProgress,
  submitAnswer,
  wordsForDirection,
} from './learning.mjs';
import { loadWordSets, saveWordSets, MAX_WORD_SET_NAME_LENGTH } from './word-sets.mjs';

const status = document.querySelector('#connection-status');
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
const resumeButton = document.querySelector('#resume-button');
const answerForm = document.querySelector('#answer-form');
const answerInput = document.querySelector('#answer');
const feedback = document.querySelector('#feedback');
const progressLabel = document.querySelector('#progress-label');
const prompt = document.querySelector('#prompt');
const answerLabel = document.querySelector('#answer-label');
const editorTitle = document.querySelector('#editor-title');
const archiveToggle = document.querySelector('#archive-toggle');
const savedProgress = loadProgress(window.localStorage);
let wordSets = loadWordSets(window.localStorage);
let showArchived = false;
let editorSetId = null;
let editorRows = [];
let words = [];
let session = null;

function updateConnectionStatus() {
  status.textContent = navigator.onLine
    ? 'Klar til øving, med eller uten nett'
    : 'Frakoblet · lagret på denne enheten';
}

function showView(view) {
  setupView.hidden = view !== setupView;
  practiceView.hidden = view !== practiceView;
  completeView.hidden = view !== completeView;
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

function persistProgress() {
  const warning = document.querySelector('#progress-warning');
  try {
    saveProgress(window.localStorage, session, words);
    warning.hidden = true;
    return true;
  } catch {
    warning.textContent =
      'Fremgangen kunne ikke lagres på denne enheten. Du kan fortsette å øve, men fremgangen kan gå tapt når du laster siden på nytt.';
    warning.hidden = false;
    resumeButton.hidden = true;
    return false;
  }
}

function startSession(nextWords, nextSession) {
  words = nextWords;
  session = nextSession;
  resumeButton.hidden = !persistProgress() || session.queue.length === 0;
  renderPractice();
}

function startWordSet(set) {
  const practiceWords = wordsForDirection(set.words, set.direction);
  startSession(practiceWords, createSession(practiceWords, Math.random, set.settings));
}

function renderPractice(message = '') {
  const word = currentWord(session, words);
  if (!word) {
    finishSession();
    return;
  }

  const learnedCount = session.learned.length;
  progressLabel.textContent = `${learnedCount} av ${words.length} lært · ${session.queue.length} oppgaver igjen`;
  prompt.textContent = word.prompt;
  answerLabel.textContent = session.correction ? 'Skriv ordet én gang' : 'Stavingen din';
  feedback.textContent =
    message ||
    (session.correction
      ? `Riktig stavemåte er ${word.answer}. Skriv ordet én gang, så kommer det tilbake senere.`
      : '');
  feedback.classList.toggle('error', session.correction);
  answerInput.value = '';
  showView(practiceView);
  answerInput.focus();
}

function finishSession() {
  resumeButton.hidden = true;
  const firstTryCount = session.learned.filter((id) => !session.mistakes[id]).length;
  document.querySelector('#completion-message').textContent =
    `Du lærte ${session.learned.length} øveoppføringer. ${firstTryCount} riktige på første forsøk.`;

  const hardestWords = document.querySelector('#hardest-words');
  hardestWords.replaceChildren();
  Object.entries(session.mistakes)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .forEach(([id, count]) => {
      const word = words.find((item) => item.id === id);
      if (!word) return;
      const item = document.createElement('li');
      item.textContent = `${word.prompt} → ${word.answer} · ${count} feilsvar`;
      hardestWords.append(item);
    });
  if (hardestWords.childElementCount === 0) {
    const item = document.createElement('li');
    item.textContent = 'Ingen vanskelige ord denne gangen.';
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
    summary.textContent = `${set.words.length} ord · ${
      {
        'prompt-to-answer': 'hint til svar',
        'answer-to-prompt': 'svar til hint',
        both: 'begge retninger',
      }[set.direction]
    }`;
    details.append(name, summary);

    const actions = document.createElement('div');
    actions.className = 'set-actions';
    if (!set.archived) {
      actions.append(makeButton('Start øving', () => startWordSet(set), 'button primary'));
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
  updateWordSets(
    wordSets.filter((item) => item.id !== set.id),
    'slette',
  );
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
updateConnectionStatus();
renderWordSets();
resumeButton.hidden = !savedProgress || savedProgress.session.queue.length === 0;
if (savedProgress?.session.queue.length === 0) {
  words = savedProgress.words;
  session = savedProgress.session;
  finishSession();
}
resumeButton.addEventListener('click', () => {
  const progress = loadProgress(window.localStorage);
  if (!progress) {
    resumeButton.hidden = true;
    return;
  }
  startSession(progress.words, progress.session);
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

answerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const outcome = submitAnswer(session, answerInput.value, words, session.settings);
  session = outcome.session;
  persistProgress();

  if (outcome.result === 'incorrect') {
    const word = currentWord(session, words);
    renderPractice(
      `Riktig stavemåte er ${word.answer}. Skriv ordet én gang, så kommer det tilbake senere.`,
    );
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
});

document.querySelector('#back-button').addEventListener('click', () => showView(setupView));
document.querySelector('#completion-restart-button').addEventListener('click', () => {
  startSession(words, createSession(words, Math.random, session.settings));
});
document.querySelector('#completion-sets-button').addEventListener('click', () => {
  showView(setupView);
  document.querySelector('#new-set-button').focus();
});
document.querySelector('#completion-new-set-button').addEventListener('click', () => {
  showView(setupView);
  openEditor();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
