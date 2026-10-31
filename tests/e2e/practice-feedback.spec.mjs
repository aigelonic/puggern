import { expect, test } from '@playwright/test';
import { createProfileState } from '../../frontend/src/profiles.mjs';

async function start(page) {
  await page.goto('/');
  await page.evaluate((profile) => {
    const timestamp = new Date().toISOString();
    localStorage.setItem('puggern.profile-state', JSON.stringify(profile));
    localStorage.setItem(
      'puggern.word-sets',
      JSON.stringify({
        version: 1,
        sets: [
          {
            id: 'feedback-set',
            name: 'Dyr',
            words: [
              { id: 'a', prompt: 'hund', answer: 'dog' },
              { id: 'b', prompt: 'katt', answer: 'cat' },
            ],
            direction: 'prompt-to-answer',
            settings: { caseSensitive: false, accentSensitive: false },
            archived: false,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      }),
    );
  }, createProfileState('feedback-profile'));
  await page.reload();
  await page.getByRole('button', { name: 'Start øving', exact: true }).click();
  await page.locator('#exercise-order').selectOption('original');
  await page.getByRole('dialog').getByRole('button', { name: 'Start øving', exact: true }).click();
  await expect(page.locator('#answer')).toBeFocused();
}

async function answer(page, value) {
  await page.locator('#answer').fill(value);
  await page.locator('#answer').press('Enter');
  await expect(page.locator('#answer')).not.toHaveAttribute('readonly', '');
}

test('rewards answers, supports correction, celebrates once and restores quietly offline', async ({
  page,
  context,
}) => {
  await start(page);
  await answer(page, 'dog');
  await expect(page.locator('#feedback')).toContainText('«hund»');
  await expect(page.locator('.points-earned')).toHaveText('+10 poeng');
  await expect(page.locator('#practice-progress')).toHaveAttribute('data-effect', 'learned');
  await expect(page.locator('#prompt')).toHaveText('katt');
  await expect(page.locator('#answer')).toBeFocused();
  await answer(page, 'wrong');
  await expect(page.locator('#correction-feedback')).toHaveAttribute('data-effect', 'incorrect');
  await expect(page.locator('#correct-answer')).toHaveText('cat');
  await expect(page.locator('#practice-progress')).not.toHaveAttribute('data-effect');
  await expect(page.locator('.points-earned')).toHaveCount(0);
  await answer(page, 'cat');
  await expect(page.locator('#completion-heading')).toBeFocused();
  await expect(page.locator('.confetti')).toHaveCount(1);
  await expect(page.locator('.confetti i')).toHaveCount(24);
  await expect(page.locator('[data-effect="correct"]')).toHaveCount(0);
  await expect(page.locator('#completion-rewards')).toContainText('20 poeng');
  await expect(page.locator('.confetti')).toHaveCount(0);
  const saved = await page.evaluate(() => localStorage.getItem('puggern.profile-state'));
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
    }
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#completion-heading')).toBeVisible();
  await expect(page.locator('body')).toBeFocused();
  await expect(page.locator('.confetti')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('puggern.profile-state'))).toBe(saved);
  await page.locator('#completion-restart-button').click();
  await answer(page, 'dog');
  await answer(page, 'cat');
  await expect(page.locator('.confetti')).toHaveCount(1);
  await page.locator('#completion-sets-button').click();
  await expect(page.locator('.confetti')).toHaveCount(0);
});

test('changing reduced motion cancels moving effects and retains meaningful static feedback', async ({
  page,
}) => {
  await start(page);
  await answer(page, 'dog');
  await expect(page.locator('[data-effect="learned"]')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('[data-effect]')).toHaveCount(0);
  await expect(page.locator('#feedback')).toContainText('Bra jobbet');
  await answer(page, 'cat');
  await expect(page.locator('#completion-heading')).toBeFocused();
  await expect(page.locator('.confetti')).toHaveCount(0);
  await expect(page.locator('.celebration')).toContainText('🎉');
  await page.locator('#completion-restart-button').click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await answer(page, 'dog');
  await answer(page, 'cat');
  await expect(page.locator('.confetti')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.confetti')).toHaveCount(0);
});

test('rapid submissions replace effects; repeated mistakes and navigation leave no stale cues', async ({
  page,
}) => {
  await start(page);
  await answer(page, 'wrong');
  await answer(page, 'still wrong');
  await expect(page.locator('[data-effect="incorrect"]')).toHaveCount(1);
  await expect(page.locator('#correction-instruction')).toHaveText(
    'Skriv ordet én gang for å gå videre.',
  );
  await answer(page, 'dog');
  await expect(page.locator('[data-effect="correct"]')).toHaveCount(1);
  await expect(page.locator('#practice-progress')).toHaveAttribute('data-effect', 'learned');
  await expect(page.locator('.points-earned')).toHaveText('+10 poeng');
  await answer(page, 'wrong');
  await expect(page.locator('[data-effect="incorrect"]')).toHaveCount(1);
  await expect(page.locator('#practice-progress')).not.toHaveAttribute('data-effect');
  await page.locator('#back-button').click();
  await expect(page.locator('[data-effect]')).toHaveCount(0);
  await expect(page.locator('.confetti')).toHaveCount(0);
});

test('restarts answer and progress animations when a cue is repeated immediately', async ({
  page,
}) => {
  await start(page);
  const animationsRestarted = await page.evaluate(async () => {
    const { createPracticeEffects } = await import('/src/practice-feedback.mjs');
    const feedback = document.querySelector('#feedback');
    const progress = document.querySelector('#practice-progress');
    const effects = createPracticeEffects({
      feedback,
      correction: document.querySelector('#correction-feedback'),
      progress,
      celebration: document.querySelector('.celebration'),
      soundToggle: document.querySelector('#sound-toggle'),
    });
    const cue = { kind: 'correct', newlyLearned: true };
    effects.play(cue);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const firstAnimations = [feedback.getAnimations()[0], progress.getAnimations()[0]];
    effects.play(cue);
    const nextAnimations = [feedback.getAnimations()[0], progress.getAnimations()[0]];
    effects.cancel();
    return firstAnimations.every(Boolean) && nextAnimations.every(Boolean)
      ? nextAnimations.map((animation, index) => animation !== firstAnimations[index])
      : [];
  });
  expect(animationsRestarted).toEqual([true, true]);
});

test('sound is opt-in, bounded, replaceable and stops immediately when toggled off', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.soundEvents = [];
    window.AudioContext = class {
      state = 'running';
      currentTime = 0;
      destination = {};
      createGain() {
        return { gain: {}, connect() {}, disconnect() {} };
      }
      createOscillator() {
        return {
          frequency: {},
          connect() {},
          disconnect() {},
          start(time) {
            window.soundEvents.push(['start', time]);
          },
          stop(time) {
            window.soundEvents.push(['stop', time]);
          },
        };
      }
      close() {
        return Promise.resolve();
      }
    };
  });
  await start(page);
  await answer(page, 'wrong');
  expect(await page.evaluate(() => window.soundEvents)).toEqual([]);
  await page.getByRole('button', { name: 'Lydeffekter: av' }).click();
  await answer(page, 'dog');
  expect(
    await page.evaluate(() => window.soundEvents.filter(([kind]) => kind === 'start')),
  ).toHaveLength(2);
  await page.getByRole('button', { name: 'Lydeffekter: på' }).click();
  expect(await page.evaluate(() => window.soundEvents.at(-1))).toEqual(['stop', undefined]);
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'false');
});
