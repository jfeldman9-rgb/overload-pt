import { expect, test, type Page } from '@playwright/test';

/**
 * These run against Chromium's fake capture devices, so the real
 * getUserMedia → MediaRecorder → IndexedDB path is exercised rather than
 * stubbed. Everything else about media is covered in clinic.spec.ts.
 */
test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
  permissions: ['camera', 'microphone'],
});

function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Main navigation' });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test('a recorded clip is stored against the exercise and lands in the compare list', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.locator('button.card', { hasText: 'Lower — Rehab Block A' }).first().click();

  const goblet = page.locator('.exercise').filter({ hasText: 'Goblet Squat' });
  await goblet.getByRole('button', { name: /Movement video for Goblet Squat/ }).click();

  const sheet = page.getByRole('dialog', { name: /Movement — Goblet Squat/ });
  await expect(sheet.locator('.clipcard')).toHaveCount(2);

  await sheet.getByRole('button', { name: '⏺ Record', exact: true }).click();
  await sheet.getByRole('button', { name: /Open camera/ }).click();
  await sheet.getByRole('button', { name: /^⏺ Record \(\d+s max\)$/ }).click();

  // Long enough for MediaRecorder to emit a chunk and for the poster grab.
  await page.waitForTimeout(1800);
  await sheet.getByRole('button', { name: /Stop and review/ }).click();

  await expect(sheet.getByRole('button', { name: /Save clip to this exercise/ })).toBeVisible();
  await expect(sheet.getByLabel('Label')).not.toHaveValue('');
  await sheet.getByLabel('What to look for').fill('Knee tracking on the way down.');
  await sheet.getByRole('button', { name: /Save clip to this exercise/ }).click();

  // Stored with a real byte size and a poster, not a placeholder.
  const newest = sheet.locator('.clipcard').first();
  await expect(sheet.locator('.clipcard')).toHaveCount(3);
  await expect(newest).toContainText('Knee tracking on the way down.');
  await expect(newest).toContainText('Dana R., DPT');
  await expect(newest).toContainText(/KB|MB/);
  await expect(newest.locator('.clipthumb img')).toBeVisible();

  // It is immediately comparable against the previous session.
  await sheet.getByRole('button', { name: '⇄ Compare' }).click();
  await expect(sheet.locator('.compare-panel').last().locator('video')).toBeVisible();

  // And it is queued for cloud backup alongside the chart change.
  await sheet.getByRole('button', { name: 'Done' }).click();
  await page.locator('.backupbar').click();
  await expect(page.getByRole('dialog', { name: 'Backup' })).toContainText(
    'Movement clip — Goblet Squat',
  );
});

test('a clip survives a reload, which means it really is in IndexedDB', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.locator('button.card', { hasText: 'Lower — Rehab Block A' }).first().click();

  const goblet = page.locator('.exercise').filter({ hasText: 'Goblet Squat' });
  await goblet.getByRole('button', { name: /Movement video for Goblet Squat/ }).click();
  const sheet = page.getByRole('dialog', { name: /Movement — Goblet Squat/ });

  await sheet.getByRole('button', { name: '⏺ Record', exact: true }).click();
  await sheet.getByRole('button', { name: /Open camera/ }).click();
  await sheet.getByRole('button', { name: /^⏺ Record \(\d+s max\)$/ }).click();
  await page.waitForTimeout(1800);
  await sheet.getByRole('button', { name: /Stop and review/ }).click();
  await sheet.getByRole('button', { name: /Save clip to this exercise/ }).click();
  await expect(sheet.locator('.clipcard')).toHaveCount(3);

  // Let the debounced IndexedDB write land before pulling the rug out.
  await page.waitForTimeout(500);
  await page.reload();
  await nav(page).getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Lifts' }).click();
  await page
    .locator('.card')
    .filter({ hasText: 'Goblet Squat' })
    .first()
    .getByRole('button', { name: /Movement video \(3\)/ })
    .click();

  const reopened = page.getByRole('dialog', { name: /Movement — Goblet Squat/ });
  await reopened.getByRole('button', { name: '⇄ Compare' }).click();
  await expect(reopened.locator('.compare-panel').last().locator('video')).toHaveAttribute(
    'src',
    /^blob:/,
  );
});

test('a dictated note keeps its audio and says when transcription is unavailable', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.locator('button.card', { hasText: 'Lower — Rehab Block A' }).first().click();
  await page.getByRole('button', { name: 'Dictate a session note' }).click();

  const sheet = page.getByRole('dialog', { name: 'Dictate a session note' });
  await sheet.getByRole('button', { name: 'Start voice note' }).click();
  await expect(sheet.getByText('● Recording')).toBeVisible();
  await page.waitForTimeout(1500);
  await sheet.getByRole('button', { name: 'Stop voice note' }).click();

  // The fake microphone says nothing, so the recogniser returns nothing. That
  // has to be stated, and the audio and the note must survive it.
  await expect(sheet.getByText(/No words came through the transcriber/)).toBeVisible();
  await expect(sheet.getByText('Room audio')).toBeVisible();
  await expect(sheet.locator('audio')).toBeVisible();

  await sheet
    .getByLabel('Session note (editable)')
    .fill('Typed because this browser cannot transcribe.');
  await sheet.getByRole('button', { name: /Save note as Dana R./ }).click();

  await nav(page).getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Notes' }).click();
  const note = page.locator('.ledger-item').filter({ hasText: 'Typed because this browser' });
  await expect(note).toContainText('Dictated');

  // Audio is opt-in even for the therapist who recorded it.
  await expect(note.locator('audio')).toHaveCount(0);
  await note.getByRole('button', { name: /Play audio/ }).click();
  await expect(note.locator('audio')).toBeVisible();
});

test('a client is not served the room audio of a shared note until they ask', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.locator('button.card', { hasText: 'Lower — Rehab Block A' }).first().click();
  await page.getByRole('button', { name: 'Dictate a session note' }).click();

  // A therapist records real audio and shares the note (not marked clinical).
  const sheet = page.getByRole('dialog', { name: 'Dictate a session note' });
  await sheet.getByRole('button', { name: 'Start voice note' }).click();
  await page.waitForTimeout(1500);
  await sheet.getByRole('button', { name: 'Stop voice note' }).click();
  await expect(sheet.getByText('Room audio')).toBeVisible();
  await sheet.getByLabel('Session note (editable)').fill('Quads firing well through range.');
  await sheet.getByRole('button', { name: /Save note as Dana R./ }).click();

  await page.getByRole('button', { name: 'Patient' }).click();
  await nav(page).getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Notes' }).click();

  const note = page.locator('.ledger-item').filter({ hasText: 'Quads firing well' });
  await expect(note).toBeVisible();
  // The cleaned text is readable; the recording of the room is not loaded.
  await expect(page.locator('audio')).toHaveCount(0);
  await note.getByRole('button', { name: /Play audio/ }).click();
  await expect(note.locator('audio')).toBeVisible();
});
