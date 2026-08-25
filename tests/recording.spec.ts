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

test('a front-camera-only device still opens the camera', async ({ page }) => {
  // Filming a lift wants the rear camera, but a device that only has a front
  // one rejects the constraint outright instead of falling back.
  await page.addInitScript(() => {
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const calls: string[] = [];
    (window as unknown as { __calls: string[] }).__calls = calls;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: (constraints: MediaStreamConstraints) => {
          calls.push(JSON.stringify(constraints.video));
          if (typeof constraints.video === 'object' && 'facingMode' in constraints.video) {
            const error = new Error('OverconstrainedError');
            error.name = 'OverconstrainedError';
            return Promise.reject(error);
          }
          return real(constraints);
        },
      },
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
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

  // It retried without facingMode rather than reporting no camera.
  await expect(sheet.getByRole('button', { name: /^⏺ Record \(\d+s max\)$/ })).toBeVisible();
  const calls = await page.evaluate(() => (window as unknown as { __calls: string[] }).__calls);
  expect(calls).toHaveLength(2);
  expect(calls[0]).toContain('facingMode');
  expect(calls[1]).not.toContain('facingMode');
});

test('a browser that refuses simultaneous playback says so', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.locator('button.card', { hasText: 'Lower — Rehab Block A' }).first().click();

  const goblet = page.locator('.exercise').filter({ hasText: 'Goblet Squat' });
  await goblet.getByRole('button', { name: /Movement video for Goblet Squat/ }).click();
  const sheet = page.getByRole('dialog', { name: /Movement — Goblet Squat/ });

  // Record one real clip so a panel has a video element to refuse.
  await sheet.getByRole('button', { name: '⏺ Record', exact: true }).click();
  await sheet.getByRole('button', { name: /Open camera/ }).click();
  await sheet.getByRole('button', { name: /^⏺ Record \(\d+s max\)$/ }).click();
  await page.waitForTimeout(1600);
  await sheet.getByRole('button', { name: /Stop and review/ }).click();
  await sheet.getByRole('button', { name: /Save clip to this exercise/ }).click();

  // Safari style: a rejected play() with no error surfaced anywhere.
  await page.evaluate(() => {
    HTMLMediaElement.prototype.play = () => Promise.reject(new Error('NotAllowedError'));
  });

  await sheet.getByRole('button', { name: '⇄ Compare' }).click();
  await sheet.getByRole('button', { name: 'Play both' }).click();
  await expect(sheet).toContainText('use the controls on each clip');

  // Reset clears the warning rather than leaving it stuck on screen.
  await sheet.getByRole('button', { name: 'Reset' }).click();
  await expect(sheet).not.toContainText('use the controls on each clip');
});


/**
 * Reads the live state of the recorder's preview element. The bug this guards
 * against was invisible to every other test: recording reads the stream from a
 * ref, so clips saved correctly while the preview showed nothing at all.
 */
async function previewState(page: Page) {
  return page.evaluate(() => {
    const video = document.querySelector('.recorder-frame video') as HTMLVideoElement | null;
    if (!video) return { present: false } as const;
    const stream = video.srcObject as MediaStream | null;
    let frame = { min: -1, max: -1 };
    if (video.videoWidth > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, 32, 32);
      const data = ctx.getImageData(0, 0, 32, 32).data;
      let min = 255;
      let max = 0;
      for (let i = 0; i < data.length; i += 4) {
        const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
        min = Math.min(min, lum);
        max = Math.max(max, lum);
      }
      frame = { min: Math.round(min), max: Math.round(max) };
    }
    return {
      present: true,
      hasStream: Boolean(stream),
      liveVideoTracks: stream ? stream.getVideoTracks().filter((t) => t.readyState === 'live').length : 0,
      videoWidth: video.videoWidth,
      readyState: video.readyState,
      paused: video.paused,
      frame,
    } as const;
  });
}

test('granting the camera shows the camera, not a black frame', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.locator('button.card', { hasText: 'Lower — Rehab Block A' }).first().click();

  const goblet = page.locator('.exercise').filter({ hasText: 'Goblet Squat' });
  await goblet.getByRole('button', { name: /Movement video for Goblet Squat/ }).click();
  const sheet = page.getByRole('dialog', { name: /Movement — Goblet Squat/ });
  await sheet.getByRole('button', { name: '⏺ Record', exact: true }).click();
  await sheet.getByRole('button', { name: /Open camera/ }).click();

  // Permission is granted at this point, so the preview has to be showing.
  await expect(sheet.getByRole('button', { name: /^⏺ Record \(\d+s max\)$/ })).toBeVisible();
  await expect
    .poll(async () => (await previewState(page)).readyState ?? -1, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(2);

  const live = await previewState(page);
  expect(live.present).toBe(true);
  // The stream must reach the element that is actually in the document.
  expect(live.hasStream, 'the camera stream is attached to the preview').toBe(true);
  expect(live.liveVideoTracks).toBe(1);
  expect(live.videoWidth, 'the preview has real video dimensions').toBeGreaterThan(0);
  expect(live.paused, 'the preview is playing').toBe(false);
  // And it is painting something, not a uniform fill.
  expect(live.frame.max, 'the preview frame is not flat black').toBeGreaterThan(8);

  // The same element carries through into recording without being detached.
  await sheet.getByRole('button', { name: /^⏺ Record \(\d+s max\)$/ }).click();
  const recording = await previewState(page);
  expect(recording.hasStream).toBe(true);
  expect(recording.paused).toBe(false);
  expect(recording.videoWidth).toBeGreaterThan(0);

  await page.waitForTimeout(1500);
  await sheet.getByRole('button', { name: /Stop and review/ }).click();
  await sheet.getByRole('button', { name: /Save clip to this exercise/ }).click();
  await expect(sheet.locator('.clipcard')).toHaveCount(3);

  // The poster is grabbed from that preview, so a dead preview meant a black
  // thumbnail in every clip list.
  const poster = await page.evaluate(async () => {
    const img = document.querySelector('.clipcard .clipthumb img') as HTMLImageElement | null;
    if (!img) return { found: false, max: -1 };
    await img.decode().catch(() => undefined);
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 32, 32);
    const data = ctx.getImageData(0, 0, 32, 32).data;
    let max = 0;
    for (let i = 0; i < data.length; i += 4) {
      max = Math.max(max, (data[i] + data[i + 1] + data[i + 2]) / 3);
    }
    return { found: true, max: Math.round(max) };
  });
  expect(poster.found).toBe(true);
  expect(poster.max, 'the saved poster is a real frame, not a black fill').toBeGreaterThan(8);
});

test('retaking a clip brings the preview back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trainer' }).click();
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
  await sheet.getByRole('button', { name: /^⏺ Record \(\d+s max\)$/ }).click();
  await page.waitForTimeout(1200);
  await sheet.getByRole('button', { name: /Stop and review/ }).click();

  // Retake tears the preview down and reopens the camera on its own.
  await sheet.getByRole('button', { name: 'Retake' }).click();
  await expect
    .poll(async () => (await previewState(page)).readyState ?? -1, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(2);
  const again = await previewState(page);
  expect(again.hasStream).toBe(true);
  expect(again.paused).toBe(false);
  expect(again.frame.max).toBeGreaterThan(8);
});
