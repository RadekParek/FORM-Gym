import { test, expect, chromium, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';

const portable =
  process.env.GYM_TEST_PORTABLE || path.resolve(process.cwd(), '../build/GYM app.exe');
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
// Keep live application data outside Playwright's managed output, which other concurrent runs clear.
const profileDirectory = path.resolve(
  process.env.GYM_TEST_DATA_ROOT || path.join(tmpdir(), 'form-gym-qa'),
  `portable-profile-${randomUUID()}`,
);

async function launchPortable(
  port: number,
): Promise<{ process: ChildProcess; browser: Browser; page: Page }> {
  const env = { ...process.env, GYM_DATA_DIR: profileDirectory };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(portable, [`--remote-debugging-port=${port}`], {
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr?.on('data', (value) => {
    errors = `${errors}${value}`.slice(-8000);
  });
  child.on('error', (error) => {
    errors += error.message;
  });
  const deadline = Date.now() + 60000;
  let opened = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok && (await response.json()).webSocketDebuggerUrl) {
        opened = true;
        break;
      }
    } catch {
      /* The portable executable is still extracting and starting Electron. */
    }
    if (child.exitCode !== null && child.exitCode !== 0)
      throw new Error(`Portable launcher exited ${child.exitCode}: ${errors}`);
    await wait(2000);
  }
  if (!opened)
    throw new Error(
      `Portable executable did not expose its window in 60 seconds. PID ${child.pid}; ${errors}`,
    );
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  let page: Page | undefined;
  for (let attempt = 0; attempt < 30; attempt++) {
    page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => candidate.url().startsWith('gym://app/'));
    if (page) break;
    await wait(500);
  }
  if (!page) {
    await browser.close();
    throw new Error('Portable app did not navigate to its packaged gym://app/ page.');
  }
  return { process: child, browser, page };
}

async function closePortable(launched: {
  process: ChildProcess;
  browser: Browser;
  page: Page;
}): Promise<void> {
  if (!launched.page.isClosed()) await launched.page.close({ runBeforeUnload: true });
  await launched.browser.close();
  const deadline = Date.now() + 15000;
  while (launched.process.exitCode === null && Date.now() < deadline) await wait(500);
  if (launched.process.exitCode === null && launched.process.pid) {
    // Only this harness's launcher and its own descendants are eligible for cleanup.
    await new Promise<void>((resolve) => {
      const cleanup = spawn('taskkill', ['/PID', String(launched.process.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      cleanup.on('close', () => resolve());
      cleanup.on('error', () => resolve());
    });
  }
}

test('final portable executable opens, saves an isolated profile and restores it after restart', async () => {
  test.setTimeout(180000);
  await mkdir(profileDirectory, { recursive: true });
  let launched: Awaited<ReturnType<typeof launchPortable>> | undefined;
  try {
    launched = await launchPortable(9331);
    const page = launched.page;
    await expect(page).toHaveURL('gym://app/');
    await expect(page.getByRole('heading', { name: 'Choose your language' })).toBeVisible();
    await expect(page.locator('.language-choice')).toHaveCount(5);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('textbox', { name: /^Username/ }).fill('portable_qa');
    await page.locator('.onboarding-actions button[type=submit]').click();
    await page.getByLabel(/^Name/).fill('Portable QA');
    await page.getByLabel(/^Age/).fill('30');
    await page.getByLabel(/^Years of training/).fill('2');
    await page.getByLabel(/^Weight/).fill('75');
    await page.getByLabel(/^Height/).fill('175');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('.condition-grid label').last()).toHaveText('Hirschsprung disease');
    await page.locator('.conditions-disclosure summary').click();
    await page.getByRole('checkbox', { name: 'Hirschsprung disease', exact: true }).check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    await expect
      .poll(async () => {
        try {
          return JSON.parse(await readFile(path.join(profileDirectory, 'training.json'), 'utf8'))
            .profile.name;
        } catch {
          return null;
        }
      })
      .toBe('Portable QA');
    await page.screenshot({
      path: path.join(profileDirectory, 'portable-dashboard.png'),
      fullPage: true,
    });
    await closePortable(launched);
    launched = undefined;

    launched = await launchPortable(9332);
    await expect(launched.page.getByRole('heading', { name: 'Today' })).toBeVisible();
    await expect(launched.page.locator('.profile-mini')).toContainText('@portable_qa');
    const saved = JSON.parse(await readFile(path.join(profileDirectory, 'training.json'), 'utf8'));
    expect(saved.profile).toMatchObject({
      name: 'Portable QA',
      age: 30,
      weight: 75,
      height: 175,
      experience: 2,
      conditions: ['hirschsprung'],
    });
    expect(Object.values(saved.plans).filter((plan: any) => plan.exercises.length)).toHaveLength(3);
    console.log(`Verified final portable EXE using isolated data: ${profileDirectory}`);
  } finally {
    if (launched) await closePortable(launched);
  }
});
