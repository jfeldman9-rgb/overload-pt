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
