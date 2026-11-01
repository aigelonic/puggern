export function answerFeedback(previous, outcome, word) {
  if (!word || previous.queue.length === 0) return null;
  const kind = outcome.result;
  if (kind === 'complete') return { kind, message: 'Hurra! Du fullførte øvingen!' };
  if (kind === 'incorrect') return { kind, message: 'Ikke helt ennå – prøv igjen!' };
  const points = (outcome.session.points ?? 0) - (previous.points ?? 0);
  const newlyLearned =
    !previous.learned.includes(word.id) && outcome.session.learned.includes(word.id);
  return {
    kind,
    points,
    newlyLearned,
    message: `Riktig! Bra jobbet med «${word.prompt}»!${newlyLearned ? ' Nytt ord lært i denne runden.' : ''}`,
  };
}

export function createPracticeEffects({
  feedback,
  correction,
  progress,
  celebration,
  soundToggle,
}) {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let timer;
  let audio;
  const tones = new Set();
  const gains = new Set();

  function clearVisuals() {
    clearTimeout(timer);
    for (const element of [feedback, correction, progress, celebration]) {
      delete element.dataset.effect;
    }
    for (const element of [feedback, correction, progress, celebration]) {
      element.getBoundingClientRect();
    }
    celebration.querySelector('.confetti')?.remove();
  }

  function stopSound() {
    for (const tone of tones) {
      tone.onended = null;
      tone.stop();
      tone.disconnect();
    }
    tones.clear();
    for (const gain of gains) gain.disconnect();
    gains.clear();
  }

  function cancel() {
    clearVisuals();
    stopSound();
  }

  function prepareSound() {
    if (soundToggle.getAttribute('aria-pressed') !== 'true') return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      audio ??= new AudioContext();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
    } catch {
      // Sound is optional; unavailable audio must never interrupt practice.
    }
  }

  function playSound(kind) {
    if (!audio || audio.state !== 'running' || soundToggle.getAttribute('aria-pressed') !== 'true')
      return;
    const notes =
      kind === 'complete'
        ? [523, 659, 784, 1047]
        : kind === 'correct'
          ? [659, 880]
          : kind === 'incorrect'
            ? [392, 440]
            : [523];
    try {
      const gain = audio.createGain();
      gains.add(gain);
      gain.gain.value = 0.035;
      gain.connect(audio.destination);
      let remaining = notes.length;
      notes.forEach((frequency, index) => {
        const tone = audio.createOscillator();
        tone.type = 'sine';
        tone.frequency.value = frequency;
        tone.connect(gain);
        tones.add(tone);
        tone.onended = () => {
          tones.delete(tone);
          tone.disconnect();
          remaining -= 1;
          if (remaining === 0) {
            gain.disconnect();
            gains.delete(gain);
          }
        };
        const start = audio.currentTime + index * 0.09;
        tone.start(start);
        tone.stop(start + 0.08);
      });
    } catch {
      stopSound();
    }
  }

  function play(cue) {
    cancel();
    if (!cue) return;
    playSound(cue.kind);
    if (motion.matches) return;
    if (cue.kind === 'complete') {
      celebration.dataset.effect = 'complete';
      const confetti = document.createElement('span');
      confetti.className = 'confetti';
      confetti.setAttribute('aria-hidden', 'true');
      for (let index = 0; index < 24; index += 1) {
        const piece = document.createElement('i');
        piece.style.setProperty('--x', `${(index * 37) % 100}%`);
        piece.style.setProperty('--delay', `${(index % 4) * 45}ms`);
        piece.style.setProperty('--turn', `${index % 2 ? 240 : -240}deg`);
        confetti.append(piece);
      }
      celebration.append(confetti);
    } else {
      const target = cue.kind === 'incorrect' ? correction : feedback;
      target.dataset.effect = cue.kind;
      if (cue.newlyLearned) progress.dataset.effect = 'learned';
    }
    timer = setTimeout(clearVisuals, cue.kind === 'complete' ? 1600 : 600);
  }

  soundToggle.addEventListener('click', () => {
    const enabled = soundToggle.getAttribute('aria-pressed') !== 'true';
    soundToggle.setAttribute('aria-pressed', String(enabled));
    soundToggle.setAttribute('aria-label', enabled ? 'Lydeffekter: på' : 'Lydeffekter: av');
    soundToggle.querySelector('[aria-hidden="true"]').textContent = enabled ? '🔊' : '🔇';
    if (enabled) prepareSound();
    else stopSound();
  });
  motion.addEventListener('change', clearVisuals);
  window.addEventListener('pagehide', () => {
    cancel();
    audio?.close().catch(() => {});
    audio = undefined;
  });
  return { play, cancel, prepareSound };
}
