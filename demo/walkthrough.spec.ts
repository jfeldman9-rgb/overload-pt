import { test, type Locator, type Page } from '@playwright/test';

/**
 * Scripted product walkthrough recorded as a video artifact. Deliberate pauses
 * keep it followable at normal playback speed; the assertions live in
 * tests/workout.spec.ts, tests/clinic.spec.ts, and tests/recording.spec.ts.
 */

const BEAT = 1400;

async function beat(page: Page, multiplier = 1) {
  await page.waitForTimeout(BEAT * multiplier);
}

/** Scroll an element into view gently enough to read on video. */
async function reveal(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await beat(page, 0.6);
}

test('product walkthrough', async ({ page }) => {
  test.setTimeout(300_000);

  await page.goto('/');
  await beat(page, 2);

  const nav = page.getByRole('navigation', { name: 'Main navigation' });

  // ── The ten-second chart review ───────────────────────────────────────
  await reveal(page, page.locator('.card').filter({ hasText: 'Peak pain' }).first());
  await beat(page, 3);

  await reveal(page, page.getByText('Objective'));
  await beat(page, 3);

  await reveal(page, page.getByText('Handoff — who changed what'));
  await beat(page, 2.5);

  // ── Backup status: honest about where the data is ─────────────────────
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await beat(page);
  await page.locator('.backupbar').click();
  await beat(page, 3);
  await page.getByRole('button', { name: 'Done' }).click();
  await beat(page);

  // ── Clinic roster: a colleague opens the shared chart ─────────────────
  await page.locator('.chartswitch').click();
  await beat(page, 2.5);
  await page.locator('.rosteritem').filter({ hasText: 'Priya N.' }).click();
  await beat(page, 2);
  await page.getByRole('button', { name: 'Done' }).click();
  await beat(page, 2);

  await page.locator('.chartswitch').click();
  await beat(page);
  await page.locator('.rosteritem').filter({ hasText: 'Dana R.' }).click();
  await beat(page);
  await page.getByRole('button', { name: 'Done' }).click();
  await beat(page);

  // ── Start the prescribed session ──────────────────────────────────────
  const startCard = page.locator('button.card', { hasText: 'Lower — Rehab Block A' }).first();
  await reveal(page, startCard);
  await beat(page);
  await startCard.click();
  await beat(page, 1.5);

  const goblet = page.locator('.exercise').filter({ hasText: 'Goblet Squat' });
  await reveal(page, goblet);
  await beat(page, 2);

  // ── Rest timer: complete set 1 and let the countdown run visibly ──────
  await goblet.getByRole('button', { name: 'Mark set 1 complete' }).click();
  await beat(page, 1);

  // Long unbroken pause so the countdown is unmistakably live.
  await page.waitForTimeout(8_000);

  await page.getByRole('button', { name: '+15s' }).click();
  await beat(page, 2.5);
  await page.getByRole('button', { name: '−15s' }).click();
  await beat(page, 2.5);

  await page.getByRole('button', { name: 'Skip rest' }).click();
  await beat(page, 1);

  // The rest actually taken is now recorded against set 1.
  await reveal(page, goblet.locator('.setrow').first());
  await beat(page, 2.5);

  // ── Log set 2 with the steppers ───────────────────────────────────────
  const row2 = goblet.locator('.setrow').nth(1);
  await row2.getByRole('button', { name: 'Increase Set 2 weight' }).click();
  await beat(page, 0.7);
  await row2.getByRole('button', { name: 'Increase Set 2 reps' }).click();
  await beat(page, 0.7);
  await row2.getByRole('button', { name: 'Increase Set 2 reps' }).click();
  await beat(page, 1.5);

  await goblet.getByRole('button', { name: 'Mark set 2 complete' }).click();
  await beat(page, 2);
  await page.getByRole('button', { name: 'Skip rest' }).click();
  await beat(page, 1.5);

  // ── Movement video: two dates, side by side ───────────────────────────
  await goblet.getByRole('button', { name: /Movement video for Goblet Squat/ }).click();
  await beat(page, 2.5);
  await page.getByRole('button', { name: '⇄ Compare' }).click();
  await beat(page, 3);
  await page.getByRole('button', { name: '0.5×' }).click();
  await beat(page, 1.5);
  await page.getByRole('button', { name: 'Play both' }).click();
  await beat(page, 2);
  await page.getByRole('button', { name: 'Pause both' }).click();
  await beat(page, 1);
  await page.getByRole('button', { name: '⏺ Record', exact: true }).click();
  await beat(page, 1.5);
  await page.getByRole('button', { name: /Open camera/ }).click();
  await beat(page, 2);
  await page.getByRole('button', { name: /^⏺ Record \(\d+s max\)$/ }).click();
  await beat(page, 2.5);
  await page.getByRole('button', { name: /Stop and review/ }).click();
  await beat(page, 2.5);
  await page.getByRole('button', { name: /Save clip to this exercise/ }).click();
  await beat(page, 2.5);
  await page.getByRole('button', { name: 'Done' }).click();
  await beat(page);

  // ── Voice note: dictate straight into the session note ────────────────
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await beat(page);
  await page.getByRole('button', { name: 'Dictate a session note' }).click();
  await beat(page, 2.5);
  await page.getByRole('button', { name: 'Start voice note' }).click();
  await beat(page, 3);
  await page.getByRole('button', { name: 'Stop voice note' }).click();
  await beat(page, 2);
  await page
    .getByLabel('Session note (editable)')
    .pressSequentially('Step-downs clean on both sides. Pain steady at 2 out of 10.', {
      delay: 28,
    });
  await beat(page, 2);
  await page.getByRole('button', { name: /Save note as/ }).click();
  await beat(page, 1.5);

  // ── Trainer approves a progression, which lands in the change log ─────
  await nav.getByRole('button', { name: 'Program' }).click();
  await beat(page, 1.5);

  const gobletRx = page.locator('.card').filter({ hasText: 'Goblet Squat' }).first();
  await reveal(page, gobletRx);
  await beat(page, 2.5);
  await gobletRx.getByRole('button', { name: /Approve/ }).click();
  await beat(page, 2.5);

  // ── Body metrics: log one, then read the trend ────────────────────────
  await nav.getByRole('button', { name: 'Body' }).click();
  await beat(page, 2);
  await page.getByRole('button', { name: '+ Log' }).click();
  await beat(page, 1.5);
  await page.getByLabel('Waist', { exact: true }).pressSequentially('33.4', { delay: 220 });
  await beat(page);
  await page.getByLabel('Body fat', { exact: true }).pressSequentially('21.6', { delay: 220 });
  await beat(page);
  await page.getByRole('button', { name: 'Calipers' }).click();
  await beat(page, 1.5);
  await page.getByRole('button', { name: 'Save measurements' }).click();
  await beat(page, 2.5);

  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy({ top: 260, behavior: 'smooth' }));
    await beat(page, 0.9);
  }
  await beat(page, 1.5);

  // ── History: volume, rest, composition, then the per-lift detail ──────
  await nav.getByRole('button', { name: 'History' }).click();
  await beat(page, 1.5);
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy({ top: 260, behavior: 'smooth' }));
    await beat(page, 0.9);
  }
  await beat(page, 1.5);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await beat(page);
  await page.getByRole('button', { name: 'Lifts' }).click();
  await beat(page, 1.5);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy({ top: 260, behavior: 'smooth' }));
    await beat(page, 0.9);
  }
  await beat(page, 1.5);

  await page.getByRole('button', { name: /Changes/ }).click();
  await beat(page, 3);

  // ── Client view: their own chart, without the clinical handoff ────────
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.getByRole('button', { name: 'Notes' }).click();
  await beat(page, 2.5);
  await page.getByRole('button', { name: 'Patient' }).click();
  await beat(page, 3);
});
