import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './demo', outputDir: './demo-output', reporter: [['list']], timeout: 120_000,
  use: {
    baseURL: 'http://localhost:4173', browserName: 'chromium',
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
    permissions: ['camera', 'microphone'],
  },
  webServer: { command: 'npm run preview -- --port 4173', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 60_000 },
});
