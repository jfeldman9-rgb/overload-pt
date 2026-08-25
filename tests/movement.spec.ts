import { expect, test, type Page } from '@playwright/test';

/**
 * Filming a set and reviewing a movement across dates. Runs against the fake
 * capture device so the whole path is real, not stubbed.
 */
test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
  permissions: ['camera', 'microphone'],
});

function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Main navigation' });
}

function goblet(page: Page) {
  return page.locator('.exercise').filter({ hasText: 'Goblet Squat' });
}

async function startLower(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.locator('button.card', { hasText: 'Lower — Rehab Block A' }).first().click();
  await expect(page.getByRole('heading', { name: 'Goblet Squat' })).toBeVisible();
}

/** Record through the camera and save, from whatever sheet is already open. */
async function recordAndSave(page: Page) {
  const sheet = page.getByRole('dialog', { name: /Movement — Goblet Squat/ });
  await sheet.getByRole('button', { name: /Open camera/ }).click();
  await sheet.getByRole('button', { name: /^⏺ Record \(\d+s max\)$/ }).click();
  await page.waitForTimeout(1500);
  await sheet.getByRole('button', { name: /Stop and review/ }).click();
  await expect(sheet.getByLabel('Label')).not.toHaveValue('');
  const label = await sheet.getByLabel('Label').inputValue();
  await sheet.getByRole('button', { name: /Save clip to this exercise/ }).click();
  return label;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

/* ── Filming from the set row ───────────────────────────────────────── */

test('the set being worked offers an optional film control that is not required', async ({
  page,
}) => {
  await startLower(page);
  const card = goblet(page);

  // Set 1 is the set in hand, so it is the one offering film.
  await expect(card.getByRole('button', { name: 'Film set 1' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Film set 2' })).toHaveCount(0);
  await expect(card.getByText('optional')).toBeVisible();

  // The five columns are untouched: still SET | LB | REPS | REST | DONE.
  await expect(card.locator('.setgrid-head span')).toHaveText([
    'Set',
    'lb',
    'Reps',
    'Rest',
    'Done',
  ]);

  // And the set completes without ever filming.
  await card.getByRole('button', { name: 'Mark set 1 complete' }).click();
  await expect(card.locator('.setrow').first()).toHaveClass(/done/);
  await expect(page.locator('.timer-clock')).toBeVisible();

  // Film now follows the set in hand.
  await expect(card.getByRole('button', { name: 'Film set 2' })).toBeVisible();
});

test('filming a set attaches the clip to that set with its load and reps', async ({ page }) => {
  await startLower(page);
  const card = goblet(page);

  // Make set 2 distinguishable, then film it.
  const row2 = card.locator('.setrow').nth(1);
  await row2.getByRole('button', { name: 'Increase Set 2 weight' }).click();
  await card.getByRole('button', { name: 'Mark set 1 complete' }).click();
  await page.getByRole('button', { name: 'Skip rest' }).click();

  await card.getByRole('button', { name: 'Film set 2' }).click();
  const sheet = page.getByRole('dialog', { name: /Movement — Goblet Squat/ });
  // Opening from the row lands on the camera, not a list to navigate.
  await expect(sheet.getByRole('button', { name: /Open camera/ })).toBeVisible();
  const label = await recordAndSave(page);
  expect(label).toBe('Set 2 — 30 lb × 8');
  await sheet.getByRole('button', { name: 'Done' }).click();

  // The clip is on set 2's strip, and set 1 has none.
  const strip = card.locator('.setclip').filter({ hasText: 'on set 2' });
  await expect(strip).toContainText('1 clip on set 2');
  await expect(strip.locator('.setclip-thumb img')).toBeVisible();
  await expect(card.locator('.setclip').filter({ hasText: 'on set 1' })).toHaveCount(0);

  // Tapping the thumbnail opens the comparison for that lift.
  await strip.locator('.setclip-thumb').first().click();
  await expect(sheet.locator('.compare-panel')).toHaveCount(2);
});

test('a filmed set keeps its strip after it is completed', async ({ page }) => {
  await startLower(page);
  const card = goblet(page);

  await card.getByRole('button', { name: 'Film set 1' }).click();
  await recordAndSave(page);
  await page.getByRole('dialog', { name: /Movement — Goblet Squat/ })
    .getByRole('button', { name: 'Done' }).click();

  await card.getByRole('button', { name: 'Mark set 1 complete' }).click();
  // Set 1 is no longer the set in hand but still shows its film.
  await expect(card.locator('.setclip').filter({ hasText: 'on set 1' })).toBeVisible();
});

/* ── Movement review across dates ───────────────────────────────────── */

test('the movement review lists every clip of a lift by date and compares two', async ({
  page,
}) => {
  await startLower(page);

  // Add today's clip to the two the demo already has from earlier dates.
  await goblet(page).getByRole('button', { name: 'Film set 1' }).click();
  await recordAndSave(page);
  await page.getByRole('dialog', { name: /Movement — Goblet Squat/ })
    .getByRole('button', { name: 'Done' }).click();

  await nav(page).getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: /Movement \(\d+\)/ }).click();

  // Grouped by movement, newest first, with the number of dates on show.
  const squat = page.locator('.movementcard').filter({ hasText: 'Goblet Squat' });
  await expect(squat).toContainText('3 clips across 3 dates');
  await expect(squat.getByText('Compare')).toBeVisible();
  await expect(squat.locator('.movementthumb')).toHaveCount(3);

  await squat.click();
  const sheet = page.getByRole('dialog', { name: /Movement — Goblet Squat/ });

  // Every clip, dated, with its set and load spelled out.
  await expect(sheet.locator('.clipcard')).toHaveCount(3);
  await expect(sheet.locator('.clipcard').nth(1)).toContainText('Set 3 — 25 lb × 10');
  await expect(sheet.locator('.clipcard').nth(2)).toContainText('Set 3 — 20 lb × 8');

  // Two dates side by side, defaulting to the newest pair.
  await sheet.getByRole('button', { name: '⇄ Compare' }).click();
  await expect(sheet.locator('.compare-panel')).toHaveCount(2);
  await expect(sheet.getByRole('button', { name: 'Play both' })).toBeVisible();
  // The newest is real video; the older demo row is labelled as a placeholder.
  await expect(sheet.locator('.compare-panel').last().locator('video')).toHaveAttribute(
    'src',
    /^blob:/,
  );

  // And any other pair can be chosen by date.
  const options = await sheet.locator('#compare-left option').allInnerTexts();
  expect(options.filter((o) => o !== '— none —')).toHaveLength(3);
});

test('the movement review says what to do when nothing is filmed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();

  // Marcus has exactly one filmed lift, so his chart can be emptied.
  await page.locator('.chartswitch').click();
  const roster = page.getByRole('dialog', { name: 'Riverside Sports PT' });
  await roster.locator('.rosteritem').filter({ hasText: 'Priya N.' }).click();
  await roster.locator('.rosteropen').filter({ hasText: 'Marcus T.' }).click();

  await nav(page).getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Movement (1)' }).click();
  const only = page.locator('.movementcard');
  await expect(only).toHaveCount(1);
  await only.click();

  const sheet = page.getByRole('dialog', { name: /Movement —/ });
  await sheet.getByRole('button', { name: /Delete clip/ }).click();
  await expect(sheet).toContainText('No clips for');
  await sheet.getByRole('button', { name: 'Done' }).click();

  // Now genuinely empty, and it says how to film rather than just going blank.
  await expect(page.getByRole('button', { name: 'Movement (0)' })).toBeVisible();
  await expect(page.getByText('No movement clips yet.')).toBeVisible();
  await expect(page.getByText(/tap .*Film set.* under the set you are on/)).toBeVisible();
});

/* ── The client side ────────────────────────────────────────────────── */

test('a client sees their own filmed movements', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Patient' }).click();
  await nav(page).getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: /Movement \(\d+\)/ }).click();

  const squat = page.locator('.movementcard').filter({ hasText: 'Goblet Squat' });
  await expect(squat).toContainText('2 clips across 2 dates');
  await squat.click();
  await expect(
    page.getByRole('dialog', { name: /Movement — Goblet Squat/ }).locator('.clipcard'),
  ).toHaveCount(2);

  // Their own chart only — the other patient's filmed lift is not here.
  await expect(page.locator('main.content')).not.toContainText('Landmine Press');
});
