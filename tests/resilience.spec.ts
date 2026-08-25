import { expect, test, type Page } from '@playwright/test';

function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Main navigation' });
}

/** Read what the app actually put in IndexedDB, rather than trusting the UI. */
async function readStore(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('overload-pt', 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const read = (store: string, key?: string) =>
      new Promise<unknown>((res, rej) => {
        const s = db.transaction(store, 'readonly').objectStore(store);
        const req = key ? s.get(key) : s.getAll();
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
    const doc = (await read('docs', 'chart-state')) as { clients?: unknown[] } | undefined;
    const meta = (await read('docs', 'backup-meta')) as { lastLocalWriteAt?: string } | undefined;
    const outbox = (await read('outbox')) as Array<{ kind: string; summary: string }>;
    return {
      hasDoc: Boolean(doc),
      clients: doc?.clients?.length ?? 0,
      lastLocalWriteAt: meta?.lastLocalWriteAt ?? null,
      outbox: outbox.map((o) => `${o.kind}:${o.summary}`),
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

/* ── The seeded chart is durable from the first paint ───────────────── */

test('a fresh load writes the seeded chart to IndexedDB exactly once', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.chartswitch')).toContainText('Alex M.');
  await expect(page.locator('.backupbar')).toContainText(/saved \d/);

  const first = await readStore(page);
  expect(first.hasDoc).toBe(true);
  expect(first.clients).toBe(2);
  expect(first.lastLocalWriteAt).not.toBeNull();
  // One queued push for the chart that was just created, not one per render.
  expect(first.outbox).toEqual(['chart:Chart created']);

  // Reloading twice must not re-write or re-queue: the chart is already durable.
  await page.reload();
  await expect(page.locator('.chartswitch')).toContainText('Alex M.');
  await page.reload();
  await expect(page.locator('.chartswitch')).toContainText('Alex M.');

  const after = await readStore(page);
  expect(after.outbox).toEqual(first.outbox);
  expect(after.lastLocalWriteAt).toBe(first.lastLocalWriteAt);
  await expect(page.locator('.backupbar')).toContainText('On this device');
});

test('the status line never claims a cloud that is not configured', async ({ page }) => {
  await page.goto('/');
  const bar = page.locator('.backupbar');

  // No keys in this build, so these three words must never appear.
  for (const word of ['Synced', 'Queued for cloud', 'Backing up']) {
    await expect(bar).not.toContainText(word);
  }
  await expect(bar).toContainText('On this device');

  // A change keeps it accurate rather than flipping to a cloud state.
  await page.locator('button.card', { hasText: 'Lower — Rehab Block A' }).first().click();
  await page
    .locator('.exercise')
    .filter({ hasText: 'Goblet Squat' })
    .getByRole('button', { name: 'Mark set 1 complete' })
    .click();
  await expect(bar).toContainText('On this device');
  await expect(bar).toContainText(/saved \d/);
  await expect(bar).not.toContainText('Synced');
});

/* ── Capture blocked: fail honestly, save what you can ─────────────── */

/** What iOS Safari looks like over plain http: mediaDevices is simply gone. */
async function stubInsecureContext(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  });
}

test('an insecure page blames the connection, not the device', async ({ page }) => {
  await stubInsecureContext(page);
  await page.goto('/');
  await page.locator('button.card', { hasText: 'Lower — Rehab Block A' }).first().click();

  // Camera: the reason is named before the tap and again after it.
  await page
    .locator('.exercise')
    .filter({ hasText: 'Goblet Squat' })
    .getByRole('button', { name: /Movement video for Goblet Squat/ })
    .click();
  const movement = page.getByRole('dialog', { name: /Movement — Goblet Squat/ });
  await movement.getByRole('button', { name: '⏺ Record', exact: true }).click();
  await expect(movement).toContainText('needs a secure connection');
  await expect(movement).not.toContainText('No camera');
  await movement.getByRole('button', { name: /Open camera/ }).click();
  await expect(movement).toContainText('needs a secure connection');
  // Comparing clips recorded elsewhere still works.
  await expect(movement).toContainText('compare clips recorded elsewhere');
  await movement.getByRole('button', { name: 'Done' }).click();

  // Microphone: same honest reason, and the note still saves.
  await page.getByRole('button', { name: 'Dictate a session note' }).click();
  const voice = page.getByRole('dialog', { name: 'Dictate a session note' });
  await expect(voice).toContainText('needs a secure connection');
  await voice.getByRole('button', { name: 'Start voice note' }).click();
  await expect(voice).toContainText('needs a secure connection');
  await expect(voice).toContainText('Type the note instead');

  await voice.getByLabel('Session note (editable)').fill('Typed over http, still recorded.');
  await voice.getByRole('button', { name: /Save note as Dana R./ }).click();

  await nav(page).getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Notes' }).click();
  await expect(
    page.locator('.ledger-item').filter({ hasText: 'Typed over http, still recorded.' }),
  ).toBeVisible();
});

test('a denied camera says so, and a busy camera says something different', async ({ page }) => {
  await page.addInitScript(() => {
    const fail = (name: string) => () => {
      const error = new Error(name);
      error.name = name;
      return Promise.reject(error);
    };
    // Flip the failure mode on each call so both branches are exercised.
    let call = 0;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => (call++ === 0 ? fail('NotAllowedError')() : fail('NotReadableError')()),
      },
    });
  });
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Lifts' }).click();
  await page
    .locator('.card')
    .filter({ hasText: 'Goblet Squat' })
    .first()
    .getByRole('button', { name: /Movement video/ })
    .click();

  const sheet = page.getByRole('dialog', { name: /Movement — Goblet Squat/ });
  await sheet.getByRole('button', { name: '⏺ Record', exact: true }).click();
  await sheet.getByRole('button', { name: /Open camera/ }).click();
  await expect(sheet).toContainText('Camera access was denied');

  await sheet.getByRole('button', { name: 'Back to clips' }).click();
  await sheet.getByRole('button', { name: '⏺ Record', exact: true }).click();
  await sheet.getByRole('button', { name: /Open camera/ }).click();
  await expect(sheet).toContainText('camera is busy');
});
