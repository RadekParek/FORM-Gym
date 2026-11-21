import { expect, test, _electron, type ElectronApplication } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { parseBackup } from '../src/engine';
import { fetchGroupState, normalizeEndpoint, type GroupConnection } from '../src/groups';

async function hostPortOpen(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port: 47831 });
    const finish = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(700);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

test('packaged Windows profile and isolated LAN group host survive restart', async () => {
  test.setTimeout(90000);
  expect(
    await hostPortOpen(),
    'An existing host listener must be preserved; this test requires its own free port.',
  ).toBe(false);
  const dataDir = path.resolve(
    process.env.GYM_TEST_DATA_ROOT || path.join(tmpdir(), 'form-gym-qa'),
    `desktop-profile-${randomUUID()}`,
  );
  await mkdir(dataDir, { recursive: true });
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  env.GYM_DATA_DIR = dataDir;
  const sourceMode = process.env.GYM_TEST_SOURCE === '1';
  const executablePath =
    process.env.GYM_TEST_EXE ||
    (sourceMode
      ? path.resolve('node_modules', 'electron', 'dist', 'electron.exe')
      : path.resolve('..', 'build', 'win-unpacked', 'GYM app.exe'));
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  expect(manifest.main).toBe('electron/main.cjs');
  expect(manifest.build.appId).toBe('com.form.gym');
  let app: ElectronApplication | null = null;
  const launch = () =>
    _electron.launch({
      executablePath,
      env,
      args: sourceMode ? ['.'] : [],
      cwd: process.cwd(),
      timeout: 30000,
    });
  try {
    app = await launch();
    expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(dataDir);
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(!sourceMode);
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.waitForURL('gym://app/');
    await expect(page.getByRole('heading', { name: 'Choose your language' })).toBeVisible();
    expect(await hostPortOpen(), 'Opening the application must not start a group server.').toBe(
      false,
    );
    if (process.env.GYM_PREVIEW_DIR) {
      await mkdir(process.env.GYM_PREVIEW_DIR, { recursive: true });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: path.join(process.env.GYM_PREVIEW_DIR, 'FORM-onboarding.png'),
        animations: 'disabled',
      });
    }
    expect(
      await page.evaluate(() => ({
        secure: window.isSecureContext,
        subtle: typeof crypto.subtle?.digest,
        bridge: typeof window.gymStore?.write,
      })),
    ).toEqual({ secure: true, subtle: 'function', bridge: 'function' });
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('textbox', { name: /^Username/ }).fill('desktop_smoke');
    await page.locator('.onboarding-actions button[type=submit]').click();
    await page.getByLabel(/^Name/).fill('Desktop Smoke');
    await page.getByLabel(/^Age/).fill('30');
    await page.getByLabel(/^Weight/).fill('75');
    await page.getByLabel(/^Height/).fill('175');
    await page.getByLabel(/^Years of training/).fill('2');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.locator('.conditions-disclosure summary').click();
    await page.getByRole('checkbox', { name: 'Hirschsprung disease', exact: true }).check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    await expect(page.locator('.page')).toHaveCSS('opacity', '1');
    await page.evaluate(() => document.fonts.ready);
    if (process.env.GYM_PREVIEW_DIR)
      await page.screenshot({
        path: path.join(process.env.GYM_PREVIEW_DIR, 'FORM-preview.png'),
        animations: 'disabled',
      });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('sk');
    await expect(page.locator('html')).toHaveAttribute('lang', 'sk');
    await expect
      .poll(async () => {
        const raw = await page.evaluate(() => window.gymStore!.read());
        return raw ? parseBackup(raw).settings.language : null;
      })
      .toBe('sk');
    expect(errors).toEqual([]);
    const host = await page.evaluate(() => window.gymGroups!.host());
    expect(normalizeEndpoint(host.endpoint)).toBe(host.endpoint);
    expect(host.port).toBe(47831);
    const health = await fetch(`${host.endpoint}/v1/health`);
    expect(health.ok).toBe(true);
    expect((await health.json()).ok).toBe(true);
    const account = await fetch(`${host.endpoint}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'packaged_host_qa',
        password: 'isolated-test-password',
        avatar: { skin: 1, hair: 0, shirt: 0 },
        level: 'standard',
      }),
    });
    expect(account.status).toBe(201);
    expect((await account.json()).user.username).toBe('packaged_host_qa');
    const lanEndpoint =
      host.endpoints?.find((endpoint) => {
        const hostname = new URL(endpoint).hostname;
        return hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '[::1]';
      }) || host.endpoint;
    expect(
      new URL(lanEndpoint).hostname,
      'The renderer check must use a real non-loopback LAN endpoint.',
    ).not.toBe('127.0.0.1');
    expect(new URL(lanEndpoint).hostname).not.toBe('localhost');
    let membership: { groupId: string; memberId: string; token: string };
    try {
      const result = await page.evaluate(async (endpoint) => {
        const response = await fetch(`${endpoint}/v1/groups`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Packaged host check',
            displayName: 'Isolated coach',
            deviceId: crypto.randomUUID(),
          }),
        });
        return { status: response.status, data: await response.json() };
      }, lanEndpoint);
      expect(result.status).toBe(201);
      membership = result.data;
      expect(errors).toEqual([]);
    } catch (value) {
      throw new Error(
        `Renderer group request to ${lanEndpoint} failed: ${String(value)}\n${errors.join('\n')}`,
      );
    }
    const connection: GroupConnection = {
      endpoint: lanEndpoint,
      groupId: membership.groupId,
      memberId: membership.memberId,
      token: membership.token,
      name: 'Packaged host check',
    };
    expect((await fetchGroupState(connection))?.group.name).toBe('Packaged host check');
    const ownedProcess = app.process();
    // An immediate owned-process exit bypasses normal quit cleanup and proves completed writes survive it.
    await app.evaluate(({ app }) => {
      setTimeout(() => app.exit(0), 50);
    });
    await expect.poll(() => ownedProcess.exitCode, { timeout: 5000 }).not.toBeNull();
    app = null;
    await expect.poll(hostPortOpen, { timeout: 5000 }).toBe(false);
    const saved = parseBackup(await readFile(path.join(dataDir, 'training.json'), 'utf8'));
    expect(saved.profile?.name).toBe('Desktop Smoke');
    expect(saved.profile?.conditions).toEqual(['hirschsprung']);
    expect(saved.settings.language).toBe('sk');
    const personalData = JSON.parse(await readFile(path.join(dataDir, 'training.json'), 'utf8'));
    expect(personalData).not.toHaveProperty('groups');
    const groupData = JSON.parse(await readFile(path.join(dataDir, 'groups-server.json'), 'utf8'));
    expect(groupData.groups).toHaveLength(1);
    expect(groupData).not.toHaveProperty('profile');
    app = await launch();
    const restarted = await app.firstWindow();
    await restarted.waitForURL('gym://app/');
    await expect(restarted.getByRole('heading', { name: 'Dnes' })).toBeVisible();
    await expect(restarted.locator('.profile-mini')).toContainText('@desktop_smoke');
    expect(
      await hostPortOpen(),
      'Restarting must keep the server stopped until the host action.',
    ).toBe(false);
    const restoredHost = await restarted.evaluate(() => window.gymGroups!.host());
    expect(restoredHost.endpoint).toBe(host.endpoint);
    const restoredGroup = await fetchGroupState(connection);
    expect(restoredGroup?.group.name).toBe('Packaged host check');
    expect(restoredGroup?.members[0].displayName).toBe('Isolated coach');
    await app.close();
    app = null;
    await expect.poll(hostPortOpen, { timeout: 5000 }).toBe(false);
  } finally {
    if (app) await app.close();
  }
});
