import { expect, test, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The export has to produce ONE file that other tools can open, because a
 * loop of downloads cannot leave an iPhone. These run against the fake
 * capture device so a real clip is in the bundle.
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

async function recordAClip(page: Page) {
  await page.locator('button.card', { hasText: 'Lower — Rehab Block A' }).first().click();
  const goblet = page.locator('.exercise').filter({ hasText: 'Goblet Squat' });
  await goblet.getByRole('button', { name: /Movement video for Goblet Squat/ }).click();
  const sheet = page.getByRole('dialog', { name: /Movement — Goblet Squat/ });
  await sheet.getByRole('button', { name: '⏺ Record', exact: true }).click();
  await sheet.getByRole('button', { name: /Open camera/ }).click();
  await sheet.getByRole('button', { name: /^⏺ Record \(\d+s max\)$/ }).click();
  await page.waitForTimeout(1600);
  await sheet.getByRole('button', { name: /Stop and review/ }).click();
  await sheet.getByRole('button', { name: /Save clip to this exercise/ }).click();
  await expect(sheet.locator('.clipcard')).toHaveCount(3);
  await sheet.getByRole('button', { name: 'Done' }).click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test('a prepared backup is one openable file that carries the recorded media', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  await recordAClip(page);

  await page.locator('.backupbar').click();
  const sheet = page.getByRole('dialog', { name: 'Backup' });

  // Preparing reports what is in the bundle before anything leaves.
  await sheet.getByRole('button', { name: /Prepare backup file/ }).click();
  await expect(sheet).toContainText(/overload-pt-clinic-\d{4}-\d{2}-\d{2}\.zip/);
  await expect(sheet).toContainText('2 charts · 1 media');
  await expect(sheet).not.toContainText('no bytes on this device');

  // Saving is a single download, not one per clip.
  const download = page.waitForEvent('download');
  await sheet.getByRole('button', { name: /Save file to this device/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^overload-pt-clinic-\d{4}-\d{2}-\d{2}\.zip$/);

  const dir = mkdtempSync(join(tmpdir(), 'overload-export-'));
  const path = join(dir, file.suggestedFilename());
  await file.saveAs(path);

  // Hand it to a tool that knows nothing about this app.
  const { execFileSync } = await import('node:child_process');
  const listing = execFileSync('python3', [
    '-c',
    `import zipfile,json,sys
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None, 'a CRC did not match'
names = z.namelist()
chart = json.loads(z.read('chart.json'))
media = [n for n in names if n.startswith('media/')]
clip_keys = [c['blobKey'] for cl in chart['state']['clients'] for c in cl['clips'] if c['blobKey']]
assert len(media) == len(clip_keys), (media, clip_keys)
assert all(any(k in m for m in media) for k in clip_keys)
sizes = [z.getinfo(m).file_size for m in media]
print(json.dumps({
  'clients': [c['name'] for c in chart['state']['clients']],
  'version': chart['version'],
  'media': media,
  'mediaBytes': sizes,
}))`,
    path,
  ]).toString();

  const report = JSON.parse(listing) as {
    clients: string[];
    version: number;
    media: string[];
    mediaBytes: number[];
  };
  expect(report.clients).toEqual(['Alex M.', 'Marcus T.']);
  expect(report.version).toBe(2);
  expect(report.media).toHaveLength(1);
  // The video bytes are really in there, not just a record of them.
  expect(report.mediaBytes[0]).toBeGreaterThan(1000);
});

test('a bundle imports back with its media intact', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  await recordAClip(page);

  // Take a backup that contains the clip.
  await page.locator('.backupbar').click();
  const sheet = page.getByRole('dialog', { name: 'Backup' });
  await sheet.getByRole('button', { name: /Prepare backup file/ }).click();
  const download = page.waitForEvent('download');
  await sheet.getByRole('button', { name: /Save file to this device/ }).click();
  const file = await download;
  const dir = mkdtempSync(join(tmpdir(), 'overload-import-'));
  const path = join(dir, file.suggestedFilename());
  await file.saveAs(path);

  // Wipe the device back to the seeded demo, which has no real clip.
  await sheet.getByRole('button', { name: 'Done' }).click();
  await nav(page).getByRole('button', { name: 'Settings' }).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Reset to demo data' }).click();
  await nav(page).getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Lifts' }).click();
  await expect(
    page
      .locator('.card')
      .filter({ hasText: 'Goblet Squat' })
      .first()
      .getByRole('button', { name: /Movement video \(2\)/ }),
  ).toBeVisible();

  // Restore from the single file.
  await page.locator('.backupbar').click();
  await sheet.getByLabel('Backup file (.zip or .json)').setInputFiles(path);
  await expect(sheet).toContainText('2 charts, 7 clip records, 1 media file restored');
  await sheet.getByRole('button', { name: 'Done' }).click();

  // The clip record is back, and so are its bytes: the video plays from IndexedDB.
  await page.getByRole('button', { name: 'Lifts' }).click();
  await page
    .locator('.card')
    .filter({ hasText: 'Goblet Squat' })
    .first()
    .getByRole('button', { name: /Movement video \(3\)/ })
    .click();
  const movement = page.getByRole('dialog', { name: /Movement — Goblet Squat/ });
  await movement.getByRole('button', { name: '⇄ Compare' }).click();
  await expect(movement.locator('.compare-panel').last().locator('video')).toHaveAttribute(
    'src',
    /^blob:/,
  );
});

test('a client bundle contains only their own chart and media', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  await recordAClip(page);

  await page.getByRole('button', { name: 'Patient' }).click();
  await page.locator('.backupbar').click();
  const sheet = page.getByRole('dialog', { name: 'Backup' });
  await sheet.getByRole('button', { name: /Prepare backup file/ }).click();
  await expect(sheet).toContainText('1 chart · 1 media');
  await expect(sheet).toContainText(/overload-pt-alex-m-\d{4}-\d{2}-\d{2}\.zip/);

  const download = page.waitForEvent('download');
  await sheet.getByRole('button', { name: /Save file to this device/ }).click();
  const file = await download;
  const dir = mkdtempSync(join(tmpdir(), 'overload-client-'));
  const path = join(dir, file.suggestedFilename());
  await file.saveAs(path);

  const { execFileSync } = await import('node:child_process');
  const out = execFileSync('python3', [
    '-c',
    `import zipfile,sys,json
z = zipfile.ZipFile(sys.argv[1])
raw = z.read('chart.json').decode()
chart = json.loads(raw)
print(json.dumps({
  'clients': [c['name'] for c in chart['state']['clients']],
  'mentionsOther': 'Marcus' in raw or 'supraspinatus' in raw,
}))`,
    path,
  ]).toString();

  const report = JSON.parse(out) as { clients: string[]; mentionsOther: boolean };
  expect(report.clients).toEqual(['Alex M.']);
  expect(report.mentionsOther).toBe(false);
});

test('the share sheet is used when the browser supports sharing files', async ({ page }) => {
  // Stand in for iOS Safari, where an anchor download may only display the file.
  await page.addInitScript(() => {
    const shared: string[] = [];
    (window as unknown as { __shared: string[] }).__shared = shared;
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data: { files?: File[] }) => Array.isArray(data.files) && data.files.length > 0,
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: { files?: File[] }) => {
        for (const f of data.files ?? []) shared.push(`${f.name}:${f.type}:${f.size}`);
        return Promise.resolve();
      },
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.locator('.backupbar').click();
  const sheet = page.getByRole('dialog', { name: 'Backup' });

  await sheet.getByRole('button', { name: /Prepare backup file/ }).click();
  // The label and the hint change to match what will actually happen.
  await expect(sheet.getByRole('button', { name: /Share or save file…/ })).toBeVisible();
  await expect(sheet).toContainText('Save to Files');

  await sheet.getByRole('button', { name: /Share or save file…/ }).click();
  await expect(sheet).toContainText('Handed');

  const shared = await page.evaluate(() => (window as unknown as { __shared: string[] }).__shared);
  expect(shared).toHaveLength(1);
  expect(shared[0]).toMatch(/^overload-pt-clinic-[\d-]+\.zip:application\/zip:\d+$/);
});

test('a dismissed share sheet does not claim the file was saved', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: () => {
        const error = new Error('cancelled');
        error.name = 'AbortError';
        return Promise.reject(error);
      },
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.locator('.backupbar').click();
  const sheet = page.getByRole('dialog', { name: 'Backup' });
  await sheet.getByRole('button', { name: /Prepare backup file/ }).click();
  await sheet.getByRole('button', { name: /Share or save file…/ }).click();

  await expect(sheet).toContainText('Save cancelled');
  await expect(sheet).not.toContainText('Handed');
  await expect(sheet).not.toContainText('Downloaded');
});

test('a compressed or unrelated file is refused with a readable reason', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.locator('.backupbar').click();
  const sheet = page.getByRole('dialog', { name: 'Backup' });

  const dir = mkdtempSync(join(tmpdir(), 'overload-bad-'));
  const { execFileSync } = await import('node:child_process');
  execFileSync('python3', [
    '-c',
    `import zipfile,sys,os
d = sys.argv[1]
with zipfile.ZipFile(os.path.join(d,'deflated.zip'),'w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('chart.json','{"a":1}'*400)
with zipfile.ZipFile(os.path.join(d,'nochart.zip'),'w',zipfile.ZIP_STORED) as z:
    z.writestr('readme.txt','not a backup')`,
    dir,
  ]);

  await sheet.getByLabel('Backup file (.zip or .json)').setInputFiles(join(dir, 'deflated.zip'));
  await expect(sheet).toContainText('is compressed');

  await sheet.getByLabel('Backup file (.zip or .json)').setInputFiles(join(dir, 'nochart.zip'));
  await expect(sheet).toContainText('no chart.json');
});

test('a backup with no charts is refused instead of blanking the app', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.locator('.backupbar').click();
  const sheet = page.getByRole('dialog', { name: 'Backup' });

  const crashes: string[] = [];
  page.on('pageerror', (e) => crashes.push(e.message));

  const dir = mkdtempSync(join(tmpdir(), 'overload-empty-'));
  const { writeFileSync } = await import('node:fs');

  // Structurally valid — clients IS an array — but there is nothing to render.
  const empty = join(dir, 'empty.json');
  writeFileSync(
    empty,
    JSON.stringify({
      state: {
        version: 2,
        clinicName: 'X',
        therapists: [],
        clients: [],
        role: 'trainer',
        actingTherapistId: 'a',
        activeClientId: 'b',
        settings: {},
        customExercises: [],
      },
    }),
  );
  await sheet.getByLabel('Backup file (.zip or .json)').setInputFiles(empty);
  await expect(sheet).toContainText('it contains no charts');

  // A chart missing the arrays the screens iterate is caught by name.
  const broken = join(dir, 'broken.json');
  writeFileSync(
    broken,
    JSON.stringify({
      state: {
        version: 2,
        clinicName: 'X',
        therapists: [{ id: 't', name: 'T', credential: '' }],
        clients: [{ id: 'c', name: 'Half A Chart', program: { days: [] }, sessions: [] }],
        role: 'trainer',
        actingTherapistId: 't',
        activeClientId: 'c',
        settings: {},
        customExercises: [],
      },
    }),
  );
  await sheet.getByLabel('Backup file (.zip or .json)').setInputFiles(broken);
  await expect(sheet).toContainText('Half A Chart is missing its notes');

  // The app is still alive and still on the real data.
  expect(crashes).toEqual([]);
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.chartswitch')).toContainText('Alex M.');
  await expect(page.getByText('Last visit')).toBeVisible();
});

test('importing restores the data without hijacking the view', async ({ page }) => {
  await page.goto('/');

  // A client exports their own chart, which carries role 'patient'.
  await page.getByRole('button', { name: 'Patient' }).click();
  await page.locator('.backupbar').click();
  const sheet = page.getByRole('dialog', { name: 'Backup' });
  const download = page.waitForEvent('download');
  await sheet.getByRole('button', { name: 'Your chart only, no media (JSON)' }).click();
  const file = await download;
  const dir = mkdtempSync(join(tmpdir(), 'overload-view-'));
  const path = join(dir, 'client.json');
  await file.saveAs(path);
  await sheet.getByRole('button', { name: 'Done' }).click();

  // A therapist restores it and must stay a therapist.
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.locator('.backupbar').click();
  await sheet.getByLabel('Backup file (.zip or .json)').setInputFiles(path);
  await expect(sheet).toContainText('1 charts');
  await sheet.getByRole('button', { name: 'Done' }).click();

  await expect(page.locator('.roleswitch button[aria-pressed="true"]')).toHaveText('Trainer');
  await expect(page.locator('.chartswitch')).toContainText('Dana R. · viewing Alex M.');
  await expect(page.getByRole('button', { name: 'Roster' })).toBeVisible();
});

test('a backup cannot open a chart the acting therapist may not see', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.locator('.backupbar').click();
  const sheet = page.getByRole('dialog', { name: 'Backup' });

  // Hand-built: activeClientId points at a chart that is not shared with the
  // acting therapist. Restoring must not put that chart on screen.
  const dir = mkdtempSync(join(tmpdir(), 'overload-perm-'));
  const { writeFileSync } = await import('node:fs');
  const chart = (id: string, name: string, therapistId: string, shared: boolean) => ({
    id,
    name,
    condition: 'test',
    therapistId,
    sharedTherapistIds: [],
    sharedWithClinic: shared,
    program: { id: `p_${id}`, name: 'P', days: [] },
    sessions: [],
    notes: [],
    audit: [],
    bodyMetrics: [],
    clips: [],
    voiceNotes: [],
    favorites: [],
    recentExercises: [],
  });
  const path = join(dir, 'crafted.json');
  writeFileSync(
    path,
    JSON.stringify({
      state: {
        version: 2,
        clinicName: 'Riverside Sports PT',
        therapists: [
          { id: 'th_dana', name: 'Dana R.', credential: 'DPT' },
          { id: 'th_priya', name: 'Priya N.', credential: 'DPT, OCS' },
        ],
        clients: [
          chart('cl_mine', 'Mine M.', 'th_dana', false),
          chart('cl_theirs', 'Private P.', 'th_priya', false),
        ],
        role: 'trainer',
        actingTherapistId: 'th_dana',
        activeClientId: 'cl_theirs',
        settings: { units: 'lb', lengthUnits: 'in', autoStartRest: true, restAlerts: true, clinicalFields: true, clipMaxSec: 25 },
        customExercises: [],
      },
    }),
  );

  await sheet.getByLabel('Backup file (.zip or .json)').setInputFiles(path);
  await expect(sheet).toContainText('2 charts');
  await sheet.getByRole('button', { name: 'Done' }).click();

  // Dana's own chart opened; the colleague's private one did not.
  await expect(page.locator('.chartswitch')).toContainText('viewing Mine M.');
  await expect(page.locator('main.content')).not.toContainText('Private P.');
  await page.locator('.chartswitch').click();
  await expect(page.locator('.rostercard.locked')).toContainText('Private P.');
});

test('the body metric sheet will not silently swallow a save with no date', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  await nav(page).getByRole('button', { name: 'Body' }).click();

  const before = await page.locator('.metricrow').count();
  await page.getByRole('button', { name: '+ Log' }).click();
  const sheet = page.getByRole('dialog', { name: 'Log body metrics' });

  await sheet.getByLabel('Waist', { exact: true }).fill('33.1');
  await expect(sheet.getByRole('button', { name: 'Save measurements' })).toBeEnabled();

  // Clearing the date used to leave Save looking live while doing nothing.
  await sheet.locator('#bm-date').fill('');
  await expect(sheet).toContainText('Pick a date before saving');
  await expect(sheet.getByRole('button', { name: 'Save measurements' })).toBeDisabled();

  // Putting a date back saves, and the reading is really there.
  await sheet.locator('#bm-date').fill('2026-08-24');
  await expect(sheet.getByRole('button', { name: 'Save measurements' })).toBeEnabled();
  await sheet.getByRole('button', { name: 'Save measurements' }).click();

  await expect(page.locator('.metricrow')).toHaveCount(before + 1);
  await expect(page.locator('.tile').filter({ hasText: 'Waist' }).first()).toContainText('33.1');
});
