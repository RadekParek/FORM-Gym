import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

test('desktop native appearance follows the app preference and rejects unknown values', async () => {
  test.setTimeout(45000);
  const directory = path.resolve('test-results', `appearance-profile-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const env = { ...process.env, GYM_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: path.resolve('node_modules/electron/dist/electron.exe'),
    args: ['.'],
    cwd: process.cwd(),
    env,
  });
  try {
    const page = await app.firstWindow();
    await expect.poll(() => page.evaluate(() => Boolean(window.gymAppearance))).toBe(true);
    expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');
    await page.evaluate(() => window.gymAppearance!.set('light'));
    expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('light');
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].getBackgroundColor(),
      ),
    ).toBe('#F7F7F4');
    await page.evaluate(() => window.gymAppearance!.set('dark'));
    expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].getBackgroundColor(),
      ),
    ).toBe('#111713');
    const invalid = await page.evaluate(async () => {
      try {
        await window.gymAppearance!.set('unknown' as 'dark');
        return false;
      } catch {
        return true;
      }
    });
    expect(invalid).toBe(true);
    expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');
  } finally {
    await app.close();
  }
});
