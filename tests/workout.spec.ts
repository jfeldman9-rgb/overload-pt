import { expect, test, type Page } from '@playwright/test';

/** Parse an "m:ss" clock into seconds. */
function toSeconds(text: string): number {
  const m = text.trim().match(/(\+?)(\d+):(\d{2})/);
  if (!m) throw new Error(`Not a clock value: "${text}"`);
  const value = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === '+' ? -value : value;
}

async function startLowerSession(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page
    .locator('button.card', { hasText: 'Lower — Rehab Block A' })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Goblet Squat' })).toBeVisible();
}

function gobletCard(page: Page) {
  return page.locator('.exercise').filter({ hasText: 'Goblet Squat' });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test('rest timer counts down in real time', async ({ page }) => {
  await startLowerSession(page);

  await gobletCard(page).getByRole('button', { name: 'Mark set 1 complete' }).click();

  const clock = page.locator('.timer-clock');
  await expect(clock).toBeVisible();

  const first = toSeconds(await clock.innerText());
  expect(first).toBeGreaterThan(80);

  await page.waitForTimeout(3200);
  const second = toSeconds(await clock.innerText());

  // The countdown must advance on its own, without any interaction.
  expect(second).toBeLessThanOrEqual(first - 2);
  expect(second).toBeGreaterThanOrEqual(first - 6);
});

test('+15s and -15s adjust the countdown by 15 seconds', async ({ page }) => {
  await startLowerSession(page);
  await gobletCard(page).getByRole('button', { name: 'Mark set 1 complete' }).click();

  const clock = page.locator('.timer-clock');
  await expect(clock).toBeVisible();

  const before = toSeconds(await clock.innerText());
  await page.getByRole('button', { name: '+15s' }).click();
  const afterPlus = toSeconds(await clock.innerText());
  expect(afterPlus - before).toBeGreaterThanOrEqual(14);
  expect(afterPlus - before).toBeLessThanOrEqual(16);

  await page.getByRole('button', { name: '−15s' }).click();
  const afterMinus = toSeconds(await clock.innerText());
  expect(afterPlus - afterMinus).toBeGreaterThanOrEqual(14);
  expect(afterPlus - afterMinus).toBeLessThanOrEqual(16);
});

test('timer counts up past zero instead of disappearing', async ({ page }) => {
  await startLowerSession(page);
  await gobletCard(page).getByRole('button', { name: 'Mark set 1 complete' }).click();

  const clock = page.locator('.timer-clock');
  // Drive the countdown to zero with the stepper rather than waiting 90s.
  for (let i = 0; i < 7; i++) {
    await page.getByRole('button', { name: '−15s' }).click();
  }

  await expect(page.locator('.timer.overdue')).toBeVisible();
  await expect(clock).toHaveText(/^\+/);
  await expect(page.getByText('Ready — go')).toBeVisible();
});

test('skipping rest records the measured rest on the set that preceded it', async ({ page }) => {
  await startLowerSession(page);
  const card = gobletCard(page);
  const restCell = card.locator('.setrow').first().locator('.restcell');

  await expect(restCell).toHaveText('90s');

  await card.getByRole('button', { name: 'Mark set 1 complete' }).click();
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: 'Skip rest' }).click();

  await expect(page.locator('.timer-clock')).toHaveCount(0);
  await expect(restCell).toHaveText(/0:0[1-9]/);
});

test('the running rest timer does not cover the bottom navigation', async ({ page }) => {
  await startLowerSession(page);
  await gobletCard(page).getByRole('button', { name: 'Mark set 1 complete' }).click();
  await expect(page.locator('.timer-clock')).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const navBox = await nav.boundingBox();
  const dockBox = await page.locator('.dock').boundingBox();
  if (!navBox || !dockBox) throw new Error('Expected both the nav and the dock to be laid out');

  // The dock must sit entirely above the tab bar, not on top of it.
  expect(dockBox.y + dockBox.height).toBeLessThanOrEqual(navBox.y + 1);

  // And every tab has to remain reachable while resting.
  await nav.getByRole('button', { name: 'Program' }).click();
  await expect(page.getByRole('heading', { name: 'Program' })).toBeVisible();
});

test('steppers change weight and reps on a set', async ({ page }) => {
  await startLowerSession(page);
  const row = gobletCard(page).locator('.setrow').nth(1);

  const weightInput = row.getByRole('spinbutton', { name: 'Set 2 weight' });
  const repsInput = row.getByRole('spinbutton', { name: 'Set 2 reps' });
  await expect(weightInput).toHaveValue('25');
  await expect(repsInput).toHaveValue('8');

  await row.getByRole('button', { name: 'Increase Set 2 weight' }).click();
  await row.getByRole('button', { name: 'Increase Set 2 reps' }).click();
  await row.getByRole('button', { name: 'Decrease Set 2 reps' }).click();
  await row.getByRole('button', { name: 'Increase Set 2 reps' }).click();

  await expect(weightInput).toHaveValue('30');
  await expect(repsInput).toHaveValue('9');
});

test('finishing a workout completes the session and clears the in-progress banner', async ({
  page,
}) => {
  await startLowerSession(page);
  await gobletCard(page).getByRole('button', { name: 'Mark set 1 complete' }).click();

  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.getByLabel(/Session note/).fill('Automated test note.');
  await page.getByRole('button', { name: 'Save and finish' }).click();

  // Lands on History with the session recorded as complete.
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Home' }).click();
  await expect(page.getByText('In progress')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resume' })).toHaveCount(0);
  await expect(page.getByText('Automated test note.')).toBeVisible();
});

test('approving a progression suggestion updates the prescription and logs the change', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('button', { name: 'Program' }).click();

  const goblet = page.locator('.card').filter({ hasText: 'Goblet Squat' }).first();
  await expect(goblet).toContainText('PROGRESSION SUGGESTED');
  await expect(goblet).toContainText('3 × 8–10 · 25 lb');

  await goblet.getByRole('button', { name: /Approve/ }).click();
  await expect(goblet).toContainText('3 × 8–10 · 30 lb');

  await nav.getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: /Changes/ }).click();
  const topChange = page.locator('.change').first();
  await expect(topChange).toContainText('Goblet Squat');
  await expect(topChange).toContainText('Target weight');
  await expect(topChange).toContainText('25');
  await expect(topChange).toContainText('30');
});

test('exercise search matches on alias', async ({ page }) => {
  await startLowerSession(page);
  await page.getByRole('button', { name: '+ Add exercise to this session' }).click();
  await page.getByLabel('Search exercises').fill('RDL');
  await expect(page.getByRole('button', { name: /^Romanian Deadlift/ })).toBeVisible();
});
