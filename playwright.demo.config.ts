import { defineConfig } from '@playwright/test';

/** Separate config so the recorded walkthrough never runs in the test suite. */
export default defineConfig({
  testDir: './demo',
  outputDir: './demo-output',
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    browserName: 'chromium',
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    video: { mode: 'on', size: { width: 430, height: 932 } },
    // Fake capture devices so the camera and microphone surfaces record
    // as they behave on a phone rather than as permission errors.
    permissions: ['camera', 'microphone'],
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  webServer: {
    command: 'npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
