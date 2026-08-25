import { test, type Locator, type Page } from '@playwright/test';

/**
 * Scripted product walkthrough recorded as a video artifact. Deliberate pauses
 * keep it followable at normal playback speed; the assertions live in
 * tests/workout.spec.ts.
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
  test.setTimeout(180_000);

  await page.goto('/');
  await beat(page, 2);

  // ── Trainer opens the app: pinned note, then the full ledger ──────────
  await reveal(page, page.locator('.note-pinned'));
  await beat(page, 2.5);

  await page.getByRole('button', { name: /Open full notes ledger/ }).click();
  await beat(page, 1.5);

  const sheet = page.locator('.sheet-body');
  for (let i = 0; i < 4; i++) {
    await sheet.evaluate((el) => el.scrollBy({ top: 190, behavior: 'smooth' }));
    await beat(page, 0.9);
  }
  await beat(page, 1);
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
  await page.waitForTimeout(14_000);

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

  // ── Last-time comparison carried forward from the previous session ────
  await reveal(page, goblet.locator('.lastperf'));
  await beat(page, 2);

  // ── Exercise library search by alias ──────────────────────────────────
  const addBtn = page.getByRole('button', { name: '+ Add exercise to this session' });
  await reveal(page, addBtn);
  await addBtn.click();
  await beat(page, 1.2);
  await page.getByLabel('Search exercises').pressSequentially('RDL', { delay: 260 });
  await beat(page, 2.5);
  await page.getByRole('button', { name: 'Done' }).click();
  await beat(page, 1.2);

  // ── Trainer approves a progression, which lands in the change log ─────
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('button', { name: 'Program' }).click();
  await beat(page, 1.5);

  const gobletRx = page.locator('.card').filter({ hasText: 'Goblet Squat' }).first();
  await reveal(page, gobletRx);
  await beat(page, 2.5);
  await gobletRx.getByRole('button', { name: /Approve/ }).click();
  await beat(page, 2.5);

  await nav.getByRole('button', { name: 'History' }).click();
  await beat(page);
  await page.getByRole('button', { name: /Changes/ }).click();
  await beat(page, 3);

  // ── Overload trends ───────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Overload' }).click();
  await beat(page, 2);
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy({ top: 230, behavior: 'smooth' }));
    await beat(page, 1);
  }
  await beat(page, 2);
});
