import {
  createSession,
  currentWord,
  loadProgress,
  parseWordSet,
  PROGRESS_KEY,
  saveProgress,
  submitAnswer,
} from './learning.mjs';

const status = document.querySelector('#connection-status');
const setupView = document.querySelector('#setup-view');
const practiceView = document.querySelector('#practice-view');
const completeView = document.querySelector('#complete-view');
const wordSetForm = document.querySelector('#word-set-form');
const wordSetInput = document.querySelector('#word-set');
const setupError = document.querySelector('#setup-error');
const resumeButton = document.querySelector('#resume-button');
const answerForm = document.querySelector('#answer-form');
const answerInput = document.querySelector('#answer');
const feedback = document.querySelector('#feedback');
const progressLabel = document.querySelector('#progress-label');
const prompt = document.querySelector('#prompt');
const answerLabel = document.querySelector('#answer-label');
const savedProgress = loadProgress(window.localStorage);
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

function settingsFromForm() {
  return {
    caseSensitive: document.querySelector('#case-sensitive').checked,
    accentSensitive: document.querySelector('#accent-sensitive').checked,
  };
}

function persist() {
  saveProgress(window.localStorage, session, words);
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
  feedback.textContent = message || (session.correction
    ? `Riktig stavemåte er ${word.answer}. Skriv ordet én gang, så kommer det tilbake senere.`
    : '');
  feedback.classList.toggle('error', session.correction);
  answerInput.value = '';
  showView(practiceView);
  answerInput.focus();
}

function finishSession() {
  window.localStorage.removeItem(PROGRESS_KEY);
  document.querySelector('#completion-message').textContent = `Du øvde på ${words.length} ord.`;

  const hardestWords = document.querySelector('#hardest-words');
  hardestWords.replaceChildren();
  Object.entries(session.mistakes)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .forEach(([id, count]) => {
      const word = words.find((item) => item.id === id);
      if (!word) return;
      const item = document.createElement('li');
      item.textContent = `${word.answer} · ${count} forsøk`;
      hardestWords.append(item);
    });
  if (hardestWords.childElementCount === 0) {
    const item = document.createElement('li');
    item.textContent = 'Ingen vanskelige ord denne gangen.';
    hardestWords.append(item);
  }
  showView(completeView);
}

function startSession(nextWords, nextSession) {
  words = nextWords;
  session = nextSession;
  persist();
  renderPractice();
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
updateConnectionStatus();

resumeButton.hidden = !savedProgress;
resumeButton.addEventListener('click', () => startSession(savedProgress.words, savedProgress.session));

wordSetForm.addEventListener('submit', (event) => {
  event.preventDefault();
  setupError.hidden = true;
  try {
    const parsedWords = parseWordSet(wordSetInput.value);
    startSession(parsedWords, createSession(parsedWords, Math.random, settingsFromForm()));
  } catch (error) {
    setupError.textContent = error.message;
    setupError.hidden = false;
  }
});

answerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const outcome = submitAnswer(session, answerInput.value, words, session.settings);
  session = outcome.session;
  persist();

  if (outcome.result === 'incorrect') {
    const word = currentWord(session, words);
    renderPractice(`Riktig stavemåte er ${word.answer}. Skriv ordet én gang, så kommer det tilbake senere.`);
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
document.querySelector('#new-set-button').addEventListener('click', () => {
  resumeButton.hidden = true;
  showView(setupView);
  wordSetInput.focus();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}