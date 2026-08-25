import { test } from '@playwright/test';
const OUT = 'shots';
test('export UI at 390', async ({ page }) => {
  // Present as a browser that can share files, i.e. an iPhone.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d: { files?: File[] }) => Array.isArray(d.files) });
    Object.defineProperty(navigator, 'share', { configurable: true, value: () => Promise.resolve() });
  });
  await page.goto('/');
  await page.locator('.backupbar').click();
  const sheet = page.locator('.sheet-body');
  await sheet.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/export_before_prepare.png` });
  await page.getByRole('button', { name: /Prepare backup file/ }).click();
  await page.waitForTimeout(700);
  await sheet.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/export_after_prepare_ios.png` });
});
