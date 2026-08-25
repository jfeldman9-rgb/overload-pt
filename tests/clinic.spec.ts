import { expect, test, type Page } from '@playwright/test';

function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Main navigation' });
}

async function openAsTrainer(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  await expect(page.locator('.chartswitch')).toContainText('Alex M.');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

/* ── Body metrics ───────────────────────────────────────────────────── */

test('logging a waist and body fat shows the value and its trend on Body and History', async ({
  page,
}) => {
  await openAsTrainer(page);
  await nav(page).getByRole('button', { name: 'Body' }).click();

  // Seeded history is already there, so the new reading has something to move against.
  await expect(page.getByText('Latest measurement')).toBeVisible();
  await page.getByRole('button', { name: '+ Log' }).click();

  await page.getByLabel('Waist', { exact: true }).fill('33.4');
  await page.getByLabel('Body fat', { exact: true }).fill('21.6');
  await page.getByRole('button', { name: 'Save measurements' }).click();

  // Tile shows the number the trainer just entered, with the week-over-week move.
  const waistTile = page.locator('.tile').filter({ hasText: 'Waist' }).first();
  await expect(waistTile).toContainText('33.4');
  await expect(waistTile).toContainText('-0.9');
  await expect(page.locator('.tile').filter({ hasText: 'BF%' }).first()).toContainText('21.6');

  // And a readable trend, not just the latest number.
  await page.locator('.picker-filters').getByRole('button', { name: 'Waist' }).click();
  await expect(page.getByRole('img', { name: /Waist trend/ })).toBeVisible();

  // The same reading is on the History surface, next to training volume.
  await nav(page).getByRole('button', { name: 'History' }).click();
  await expect(page.getByText('Composition')).toBeVisible();
  await expect(page.locator('.tile').filter({ hasText: 'Waist' }).first()).toContainText('33.4');
  await expect(page.getByRole('img', { name: /Waist trend/ }).first()).toBeVisible();
});

test('a caliper site and a DEXA figure survive a save', async ({ page }) => {
  await openAsTrainer(page);
  await nav(page).getByRole('button', { name: 'Body' }).click();
  await page.getByRole('button', { name: '+ Log' }).click();

  await page.getByRole('button', { name: 'Calipers' }).click();
  await page.getByLabel('Abdominal', { exact: true }).fill('16');
  await page.getByRole('button', { name: 'DEXA' }).click();
  await page.getByLabel('Legs lean', { exact: true }).fill('48.2');
  await page.getByRole('button', { name: 'Save measurements' }).click();

  await expect(page.locator('.metricrow').first()).toContainText('calipers 16mm');
  await expect(page.locator('.metricrow').first()).toContainText('DEXA');
  await expect(page.locator('.tile').filter({ hasText: 'Legs lean' })).toContainText('48.2');
});

/* ── Movement video ─────────────────────────────────────────────────── */

test('compare opens from an exercise in History with two dates side by side', async ({ page }) => {
  await openAsTrainer(page);
  await nav(page).getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Lifts' }).click();

  const goblet = page.locator('.card').filter({ hasText: 'Goblet Squat' }).first();
  await goblet.getByRole('button', { name: /Movement video/ }).click();

  const sheet = page.getByRole('dialog', { name: /Movement — Goblet Squat/ });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.clipcard')).toHaveCount(2);

  await sheet.getByRole('button', { name: '⇄ Compare' }).click();
  await expect(sheet.locator('.compare-panel')).toHaveCount(2);
  await expect(sheet.getByRole('button', { name: 'Play both' })).toBeVisible();

  // Defaults to the two most recent clips: newest in B, the one before it in A.
  const a = sheet.locator('.compare-panel').first();
  const b = sheet.locator('.compare-panel').last();
  await expect(a).toContainText('20 lb');
  await expect(b).toContainText('25 lb');

  // Speed control applies to the pair, for a slow-motion comparison.
  await sheet.getByRole('button', { name: '0.5×' }).click();
  await expect(sheet.getByRole('button', { name: '0.5×' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('the video control on a live session reaches the recorder and the compare view', async ({
  page,
}) => {
  await openAsTrainer(page);
  await page.locator('button.card', { hasText: 'Lower — Rehab Block A' }).first().click();
  await expect(page.getByRole('heading', { name: 'Goblet Squat' })).toBeVisible();

  const goblet = page.locator('.exercise').filter({ hasText: 'Goblet Squat' });
  await goblet.getByRole('button', { name: /Movement video for Goblet Squat/ }).click();

  const sheet = page.getByRole('dialog', { name: /Movement — Goblet Squat/ });
  await sheet.getByRole('button', { name: '⇄ Compare' }).click();
  await expect(sheet.locator('.compare-panel')).toHaveCount(2);

  // Camera is not available in the test browser; the recorder must say so
  // rather than leaving a dead button.
  await sheet.getByRole('button', { name: '⏺ Record' }).click();
  await expect(sheet.getByRole('button', { name: /Open camera/ })).toBeVisible();
});

test('an exercise with no clips shows an empty state instead of a broken compare', async ({
  page,
}) => {
  await openAsTrainer(page);
  await nav(page).getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Lifts' }).click();

  const bridge = page.locator('.card').filter({ hasText: 'Single-Leg Glute Bridge' }).first();
  await bridge.getByRole('button', { name: /Movement video \(0\)/ }).click();

  const sheet = page.getByRole('dialog', { name: /Movement — Single-Leg Glute Bridge/ });
  await expect(sheet).toContainText('No clips for Single-Leg Glute Bridge yet');
  await sheet.getByRole('button', { name: '⇄ Compare' }).click();
  await expect(sheet).toContainText('Record a clip first');
});

/* ── Backup ─────────────────────────────────────────────────────────── */

test('backup status renders and reports on-device only when no keys are set', async ({ page }) => {
  await openAsTrainer(page);

  const bar = page.locator('.backupbar');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('On this device');
  // With no cloud target, a pending count would imply an upload that is never
  // going to happen. The honest fact is when the device last saved.
  await expect(bar).not.toContainText('waiting');
  await expect(bar).not.toContainText('Synced');

  await bar.click();
  const sheet = page.getByRole('dialog', { name: 'Backup' });
  await expect(sheet).toContainText('IndexedDB');
  await expect(sheet).toContainText('Not configured');
  await expect(sheet).toContainText('nothing has left this device');
  await expect(sheet.getByRole('button', { name: /Export all charts/ })).toBeVisible();
  // Without keys there is no cloud to retry against, so no retry button is offered.
  await expect(sheet.getByRole('button', { name: /Retry cloud backup/ })).toHaveCount(0);
});

test('every change is queued for backup, not just the first', async ({ page }) => {
  await openAsTrainer(page);
  const bar = page.locator('.backupbar');

  await page.locator('button.card', { hasText: 'Lower — Rehab Block A' }).first().click();
  const goblet = page.locator('.exercise').filter({ hasText: 'Goblet Squat' });
  await goblet.getByRole('button', { name: 'Mark set 1 complete' }).click();

  // The line stays accurate: saved locally, at a time.
  await expect(bar).toContainText(/saved \d/);

  await bar.click();
  const sheet = page.getByRole('dialog', { name: 'Backup' });
  const queued = sheet.locator('.change');
  await expect(queued).not.toHaveCount(0);
  await expect(sheet).toContainText('Completed a set');
  const before = await queued.count();

  // A second, different kind of change adds to the queue rather than replacing it.
  await sheet.getByRole('button', { name: 'Done' }).click();
  await goblet.getByRole('button', { name: 'Increase Set 2 weight' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Body' }).click();
  await page.getByRole('button', { name: '+ Log' }).click();
  await page.getByLabel('Waist', { exact: true }).fill('33.9');
  await page.getByRole('button', { name: 'Save measurements' }).click();

  await bar.click();
  await expect(sheet).toContainText('Logged body metrics');
  expect(await sheet.locator('.change').count()).toBeGreaterThanOrEqual(before);
});

test('a client can only export their own chart', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Patient' }).click();

  await page.locator('.backupbar').click();
  const sheet = page.getByRole('dialog', { name: 'Backup' });

  // Export is scoped and says so; the clinic-wide export is a therapist action.
  await expect(sheet.getByRole('button', { name: 'Export your chart (JSON)' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Export all charts/ })).toHaveCount(0);
  await expect(sheet).toContainText('Other patients in the clinic are not included');

  // So is import: restoring a backup would replace every chart on the device.
  await expect(sheet.getByLabel('Charts (JSON)')).toHaveCount(0);
  await expect(sheet).toContainText('your therapist does that side');

  // Same scope in Settings, and no clinic-wide reset.
  await sheet.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('button', { name: 'Export your chart (JSON)' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Export all charts/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reset to demo data' })).toHaveCount(0);
});

test('the exported client chart carries no other patient', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Patient' }).click();
  await page.locator('.backupbar').click();

  const sheet = page.getByRole('dialog', { name: 'Backup' });
  const download = page.waitForEvent('download');
  await sheet.getByRole('button', { name: 'Export your chart (JSON)' }).click();
  const file = await download;

  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
    state: { clients: Array<{ name: string }> };
  };

  expect(payload.state.clients).toHaveLength(1);
  expect(payload.state.clients[0].name).toBe('Alex M.');
  expect(JSON.stringify(payload)).not.toContain('Marcus');
});

/* ── Clinic sharing ─────────────────────────────────────────────────── */

test('a second therapist can open the shared patient and sees the same chart', async ({ page }) => {
  await openAsTrainer(page);

  await page.locator('.chartswitch').click();
  const roster = page.getByRole('dialog', { name: 'Riverside Sports PT' });
  await expect(roster).toBeVisible();

  // Dana owns Alex and cannot open Priya's patient.
  await expect(roster.locator('.rostercard.locked')).toContainText('Marcus T.');

  await roster.getByRole('button', { name: /Priya N./ }).click();
  await expect(roster.locator('.rostercard.locked')).toHaveCount(0);
  await roster.getByRole('button', { name: 'Done' }).click();

  // Same chart, now attributed to the covering therapist.
  await expect(page.locator('.chartswitch')).toContainText('Priya N. · viewing Alex M.');
  await expect(page.getByText('shared from Dana R.')).toBeVisible();

  // The ten-second review is intact for the colleague: last visit, plan, handoff.
  await expect(page.getByText('Last visit')).toBeVisible();
  await expect(page.getByText('Handoff — who changed what')).toBeVisible();

  // And so is the history, the videos, and the measurements.
  await nav(page).getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Lifts' }).click();
  await expect(
    page
      .locator('.card')
      .filter({ hasText: 'Goblet Squat' })
      .first()
      .getByRole('button', { name: /Movement video \(2\)/ }),
  ).toBeVisible();

  await nav(page).getByRole('button', { name: 'Body' }).click();
  await expect(page.locator('.tile').filter({ hasText: 'Waist' }).first()).toBeVisible();
});

test('opening a colleague chart keeps sharing controls with the owner', async ({ page }) => {
  await openAsTrainer(page);
  await page.locator('.chartswitch').click();
  const roster = page.getByRole('dialog', { name: 'Riverside Sports PT' });

  // Dana owns Alex, so Dana holds the sharing switches.
  await expect(roster.getByLabel('Share Alex M. with clinic')).toBeChecked();

  await roster.getByRole('button', { name: /Priya N./ }).click();
  // Priya is only a reader on Alex's chart — no sharing switch for her.
  await expect(roster.getByLabel('Share Alex M. with clinic')).toHaveCount(0);
  await expect(roster.getByLabel('Share Marcus T. with clinic')).toHaveCount(1);
});

test('revoking clinic sharing locks the chart for the colleague and is audited', async ({
  page,
}) => {
  await openAsTrainer(page);
  await page.locator('.chartswitch').click();
  const roster = page.getByRole('dialog', { name: 'Riverside Sports PT' });

  await roster
    .getByLabel('Reason for a sharing change (recorded in the log)')
    .fill('Cover no longer needed.');
  await roster.getByLabel('Share Alex M. with clinic').uncheck();
  await roster.getByLabel('Share Alex M. with Priya N.').uncheck();
  await roster.getByRole('button', { name: 'Done' }).click();

  await nav(page).getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: /Changes/ }).click();
  const shareChanges = page.locator('.change').filter({ hasText: 'Cover no longer needed.' });
  await expect(shareChanges).toHaveCount(2);
  await expect(shareChanges.first()).toContainText('Access revoked');

  await page.locator('.chartswitch').click();
  await roster.getByRole('button', { name: /Priya N./ }).click();
  await expect(roster.locator('.rostercard.locked')).toContainText('Alex M.');
});

/* ── Client view and clinical notes ─────────────────────────────────── */

test('the patient view hides trainer-only notes', async ({ page }) => {
  await openAsTrainer(page);
  await nav(page).getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Notes' }).click();

  // The handoff note is clinical: visible to the therapist, flagged as such.
  await expect(page.getByText(/graft is 14 weeks out/)).toBeVisible();
  await expect(page.locator('.pill.danger', { hasText: 'Clinical' })).not.toHaveCount(0);

  await page.getByRole('button', { name: 'Patient' }).click();
  await page.getByRole('button', { name: 'Notes' }).click();

  await expect(page.getByText(/graft is 14 weeks out/)).toHaveCount(0);
  await expect(page.locator('.pill.danger', { hasText: 'Clinical' })).toHaveCount(0);
  // The patient still sees their own notes and their therapist's shared ones.
  await expect(page.getByText(/Best it has felt since the injury/)).toBeVisible();
});

test('no tab in the client view leaks another chart or a clinical note', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Patient' }).click();

  // Anything belonging to the other patient, or to the trainer-only handoff,
  // must be absent from every screen a client can reach.
  const forbidden = [
    'Marcus',
    'supraspinatus',
    'return to golf',
    'graft is 14 weeks out',
    'Priya',
  ];
  const nav = page.getByRole('navigation', { name: 'Main navigation' });

  for (const tab of ['Home', 'Program', 'History', 'Body', 'Settings'] as const) {
    await nav.getByRole('button', { name: tab }).click();
    const text = await page.locator('main.content').innerText();
    for (const needle of forbidden) {
      expect(text, `"${needle}" reachable on the ${tab} tab in the client view`).not.toContain(
        needle,
      );
    }
  }
});

test('a client is never served raw room audio unless they ask for it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Patient' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Notes' }).click();

  // The dictated note the therapist shared is readable as text.
  const dictated = page.locator('.ledger-item').filter({ hasText: 'Dictated' });
  await expect(dictated).toHaveCount(1);
  await expect(dictated).toContainText('Step-downs clean bilaterally');

  // Nothing audio-related is mounted or resolved until the client opts in.
  await expect(page.locator('audio')).toHaveCount(0);
  await expect(dictated).not.toContainText('saved without audio');
  await expect(dictated.getByRole('button', { name: /Play audio/ })).toBeVisible();

  // This seeded note carries no audio file, so opting in says so plainly
  // rather than presenting a dead player. The real-audio path is covered in
  // recording.spec.ts.
  await dictated.getByRole('button', { name: /Play audio/ }).click();
  await expect(dictated).toContainText('saved without audio');

  // And no clinical note came through with it.
  await expect(page.locator('.pill.danger', { hasText: 'Clinical' })).toHaveCount(0);
});

test('the patient view cannot browse other charts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Patient' }).click();
  await page.locator('.chartswitch').click();

  const sheet = page.getByRole('dialog', { name: 'Your chart' });
  await expect(sheet).toContainText('Alex M.');
  await expect(sheet).toContainText('are not visible from this view');
  await expect(sheet.getByText('Marcus T.')).toHaveCount(0);
});

/* ── Voice notes ────────────────────────────────────────────────────── */

test('the voice note control is on a live session', async ({ page }) => {
  await openAsTrainer(page);
  await page.locator('button.card', { hasText: 'Lower — Rehab Block A' }).first().click();

  await expect(page.getByRole('button', { name: 'Dictate a session note' })).toBeVisible();
  await page
    .locator('.exercise')
    .filter({ hasText: 'Goblet Squat' })
    .getByRole('button', { name: /Dictate a note for Goblet Squat/ })
    .click();
  await expect(page.getByRole('dialog', { name: /Dictate — Goblet Squat/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start voice note' })).toBeVisible();
});

test('a dictated note still saves when the browser has no microphone', async ({ page }) => {
  // Stub the capture API away: losing audio or transcription must not lose the note.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  });

  await openAsTrainer(page);
  await page.locator('button.card', { hasText: 'Lower — Rehab Block A' }).first().click();
  await page.getByRole('button', { name: 'Dictate a session note' }).click();

  const sheet = page.getByRole('dialog', { name: 'Dictate a session note' });
  await sheet.getByRole('button', { name: 'Start voice note' }).click();
  await expect(sheet).toContainText('No microphone on this device');

  await sheet
    .getByLabel('Session note (editable)')
    .fill('Dictated at the plinth: step-downs clean on both sides.');
  await sheet.getByRole('button', { name: /Save note as Dana R./ }).click();

  await nav(page).getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Notes' }).click();
  const dictated = page.locator('.ledger-item').filter({ hasText: 'Dictated at the plinth' });
  await expect(dictated).toBeVisible();
  await expect(dictated.locator('.pill', { hasText: 'Dictated' })).toBeVisible();
});

test('a dictated note the therapist marks clinical stays out of the patient view', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  });

  await openAsTrainer(page);
  await page.locator('button.card', { hasText: 'Lower — Rehab Block A' }).first().click();
  await page.getByRole('button', { name: 'Dictate a session note' }).click();

  const sheet = page.getByRole('dialog', { name: 'Dictate a session note' });
  await sheet.getByRole('button', { name: 'Start voice note' }).click();
  await sheet.getByLabel('Session note (editable)').fill('Handoff only: watch the graft loading.');
  await sheet.getByLabel('Clinical handoff only').check();
  await sheet.getByRole('button', { name: /Save note as Dana R./ }).click();

  await nav(page).getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Notes' }).click();
  await expect(page.getByText('Handoff only: watch the graft loading.')).toBeVisible();

  await page.getByRole('button', { name: 'Patient' }).click();
  await page.getByRole('button', { name: 'Notes' }).click();
  await expect(page.getByText('Handoff only: watch the graft loading.')).toHaveCount(0);
});

/* ── Chart review ───────────────────────────────────────────────────── */

test('the therapist home answers the ten-second questions', async ({ page }) => {
  await openAsTrainer(page);

  // Last visit with the numbers, the pain reading, and rest compliance.
  const lastVisit = page.locator('.card').filter({ hasText: 'Peak pain' }).first();
  await expect(lastVisit).toContainText('Volume');
  await expect(lastVisit).toContainText('Sets');
  await expect(page.getByText(/rest (on prescription|\d+% (long|short))/)).toBeVisible();

  // Red flags are stated either way, so silence is not ambiguous. Ordinary
  // post-session soreness must not be dressed up as a concern.
  await expect(page.getByText('Red flags')).toBeVisible();
  await expect(page.locator('.flag.clear')).toContainText('Nothing to act on');

  // Plan, progressions, objective measures, and the handoff trail.
  await expect(page.getByText("Today's plan")).toBeVisible();
  await expect(page.getByText(/Pending progressions \(\d+\)/)).toBeVisible();
  await expect(page.getByText('Objective')).toBeVisible();
  await expect(page.getByText(/lifts current/)).toBeVisible();
  await expect(page.getByText('Handoff — who changed what')).toBeVisible();
});

test('a flaring patient surfaces a red flag on the covering therapist home', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.locator('.chartswitch').click();

  const roster = page.getByRole('dialog', { name: 'Riverside Sports PT' });
  await roster.getByRole('button', { name: /Priya N./ }).click();
  await roster.locator('.rosteropen').filter({ hasText: 'Marcus T.' }).click();

  await expect(page.locator('.chartswitch')).toContainText('viewing Marcus T.');
  await expect(page.getByText('Red flags')).toBeVisible();
  await expect(page.locator('.flag.high')).toContainText(/Pain/);
});
