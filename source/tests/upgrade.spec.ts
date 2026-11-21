import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createInitialData, createStarterPlans, localDate } from '../src/engine';
import type { AppData } from '../src/model';
import { EXERCISES } from '../src/model';

const output = process.env.GYM_PREVIEW_OUTPUT || path.resolve('test-results', 'upgrade-previews');
test.use({
  baseURL: 'http://127.0.0.1:5173',
  viewport: { width: 1440, height: 1000 },
  locale: 'en-GB',
  actionTimeout: 8000,
  navigationTimeout: 15000,
});
async function seed(page: Page) {
  const data: AppData = {
    ...createInitialData(),
    profile: {
      name: 'Alex',
      username: 'alex_form',
      avatar: { skin: 2, hair: 1, shirt: 0 },
      age: 30,
      weight: 75,
      height: 175,
      experience: 0,
      goal: 'fitness',
      daysPerWeek: 3,
      conditions: [],
    },
  };
  data.plans = createStarterPlans(data.profile!);
  data.plans[new Date().getDay()] = {
    title: 'Full body · strength',
    note: 'Leave two reps in reserve.',
    exercises: [
      { id: randomUUID(), exerciseId: 'goblet-squat', sets: 3, reps: 8, weight: 20, rest: 90 },
      { id: randomUUID(), exerciseId: 'bench-press', sets: 3, reps: 8, weight: 40, rest: 90 },
      { id: randomUUID(), exerciseId: 'cable-row', sets: 3, reps: 10, weight: 25, rest: 90 },
    ],
  };
  data.sessions = Array.from({ length: 8 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    return {
      id: randomUUID(),
      date: localDate(date),
      title: 'Strength foundations',
      duration: 600,
      note: 'Private coaching note',
      xp: 124,
      exercises: [
        {
          id: randomUUID(),
          exerciseId: 'bodyweight-squat',
          sets: [
            { reps: 15, weight: 0, done: true },
            { reps: 15, weight: 0, done: true },
          ],
        },
      ],
    };
  });
  await page.addInitScript((value) => {
    if (!localStorage.getItem('form-gym-data-v1'))
      localStorage.setItem('form-gym-data-v1', JSON.stringify(value));
  }, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  return data;
}
async function capture(page: Page, name: string) {
  await mkdir(output, { recursive: true });
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await document.fonts.ready;
  });
  await page.screenshot({ path: path.join(output, name), fullPage: true, animations: 'disabled' });
}
async function nav(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
}
test('language-first setup creates a saved username and character before training', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Choose your language' })).toBeVisible();
  await expect(page.locator('.language-choice')).toHaveCount(5);
  await nav(page, 'Continue');
  await expect(page.getByRole('heading', { name: 'Your character' })).toBeVisible();
  await page.getByRole('textbox', { name: /^Username/ }).fill('first_athlete');
  await page.getByRole('button', { name: 'Skin tone 3', exact: true }).click();
  await capture(page, 'FORM-character.png');
  await nav(page, 'Continue');
  await page.getByLabel(/^Name/).fill('Sam');
  await page.getByLabel(/^Age/).fill('30');
  await page.getByLabel(/^Years of training/).fill('2');
  await page.getByLabel(/^Weight/).fill('75');
  await page.getByLabel(/^Height/).fill('175');
  await nav(page, 'Continue');
  await page.locator('.conditions-disclosure summary').click();
  await expect(page.locator('.condition-grid label').last()).toHaveText('Hirschsprung disease');
  await page.getByRole('checkbox', { name: 'Hirschsprung disease', exact: true }).check();
  await nav(page, 'Continue');
  await nav(page, 'Start');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('form-gym-data-v1')!));
  expect(saved.profile.username).toBe('first_athlete');
  expect(saved.profile.avatar.skin).toBe(2);
  expect(saved.profile.conditions).toContain('hirschsprung');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
});
test('ranks use different colors and daily claims persist without duplicate XP', async ({
  page,
}) => {
  const data = await seed(page);
  await capture(page, 'FORM-preview.png');
  await page
    .locator('.quest-card')
    .first()
    .getByRole('button', { name: 'Claim XP', exact: true })
    .click();
  await expect(
    page.locator('.quest-card').first().getByRole('button', { name: 'Claimed', exact: true }),
  ).toBeDisabled();
  await page.reload();
  const xp = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('form-gym-data-v1')!);
    return (
      data.sessions.reduce((sum: number, s: any) => sum + s.xp, 0) + data.questClaims.length * 40
    );
  });
  expect(xp).toBe(data.sessions.length * 124 + 40);
  await page.locator('.rank-summary').click();
  await page.getByRole('tab', { name: 'Ranks', exact: true }).click();
  const colors = await page
    .locator('.rank-tile')
    .evaluateAll((items) =>
      items.map((item) => getComputedStyle(item).getPropertyValue('--rank-color')),
    );
  expect(new Set(colors).size).toBe(9);
  await capture(page, 'FORM-ranks.png');
});
test('library guides are offline, pause correctly and add exercises without replacing a plan', async ({
  page,
}) => {
  await seed(page);
  await nav(page, 'Exercise library');
  await expect(page.locator('.exercise-library-card')).toHaveCount(EXERCISES.length);
  await capture(page, 'FORM-library.png');
  await page.getByRole('textbox', { name: 'Search exercises' }).fill('Pull-up');
  await page
    .locator('.exercise-library-card')
    .filter({ has: page.getByRole('heading', { name: 'Pull-up', exact: true }) })
    .click();
  await expect(page.locator('.form-cues li')).toHaveCount(3);
  await expect(page.locator('.muscle-pair svg')).toHaveCount(2);
  await nav(page, 'Pause demonstration');
  const time = await page
    .locator('.exercise-demo > svg')
    .evaluate((svg: SVGSVGElement) => svg.getCurrentTime());
  await page.waitForTimeout(200);
  expect(
    await page
      .locator('.exercise-demo > svg')
      .evaluate((svg: SVGSVGElement) => svg.getCurrentTime()),
  ).toBeCloseTo(time, 1);
  await capture(page, 'FORM-exercise-guide.png');
  const original = await page.evaluate(
    (day) => JSON.parse(localStorage.getItem('form-gym-data-v1')!).plans[day].exercises.length,
    String(new Date().getDay()),
  );
  await nav(page, 'Add to my week');
  await page.getByRole('dialog').getByRole('button', { name: 'Add to my week' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (day) => JSON.parse(localStorage.getItem('form-gym-data-v1')!).plans[day].exercises.length,
        String(new Date().getDay()),
      ),
    )
    .toBe(original + 1);
  await page
    .context()
    .route('**/*', (route) =>
      route.request().url().startsWith('http://127.0.0.1:5173') ? route.continue() : route.abort(),
    );
  await page.reload();
  await nav(page, 'Exercise library');
  await expect(page.locator('.exercise-library-card')).toHaveCount(EXERCISES.length);
  await page.context().unroute('**/*');
});
test('mobile notes recover immediate typing, toggle checklists and undo deletion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page);
  await nav(page, 'Notes');
  await nav(page, 'New note');
  await page.locator('#note-title').fill('Training journal');
  await page.locator('#note-body').fill('Day one\n- [ ] mobility\n- [x] sleep');
  await page.reload();
  await nav(page, 'Notes');
  await page.locator('.note-item').filter({ hasText: 'Training journal' }).click();
  await expect(page.locator('#note-body')).toHaveValue('Day one\n- [ ] mobility\n- [x] sleep');
  await nav(page, 'Checklist');
  await page.getByRole('checkbox', { name: 'mobility', exact: true }).check();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('form-gym-data-v1')!).notes[0].body),
    )
    .toContain('- [x] mobility');
  await capture(page, 'FORM-notes-mobile.png');
  await page.getByRole('button', { name: 'Delete note', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await nav(page, 'Undo');
  await expect(page.locator('#note-title')).toHaveValue('Training journal');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('Android-size layout creates and restores local leader groups, with no fake invite', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page);
  await nav(page, 'Groups');
  await page.getByLabel('Group name', { exact: true }).fill('Weekend club');
  await nav(page, 'Create on this device');
  await expect(page.getByRole('heading', { name: 'Weekend club', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate invite', exact: true })).toHaveCount(0);
  await capture(page, 'FORM-mobile-group.png');
  await page.reload();
  await nav(page, 'Groups');
  await expect(page.getByRole('heading', { name: 'Weekend club', exact: true })).toBeVisible();
  await expect(page.locator('.group-status')).toContainText('Saved on this device');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('real accounts publish work to the global leaderboard and create shared mobile groups', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const child = spawn(
    process.execPath,
    [path.resolve('tests/ui-server.cjs'), path.join(tmpdir(), `form-ui-${randomUUID()}.json`)],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const url = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Test server did not start')), 10000);
    let value = '';
    child.stdout.on('data', (chunk) => {
      value += chunk.toString();
      if (value.includes('\n')) {
        clearTimeout(timeout);
        resolve(JSON.parse(value.trim()).url);
      }
    });
    child.once('error', reject);
  });
  try {
    await seed(page);
    await nav(page, 'Community account');
    await page.locator('.account-form-panel input[type=url]').fill(url);
    await page.getByRole('textbox', { name: /^Username/ }).fill('alex_ui');
    await page.locator('.account-form-panel input[type=password]').fill('test-password-for-ui');
    await page.locator('.account-form-panel > button').click();
    await expect(page.getByRole('heading', { name: '@alex_ui', exact: true })).toBeVisible();
    const other = await request.post(url + '/v1/auth/register', {
      data: {
        username: 'noa_ui',
        password: 'test-password-for-ui',
        avatar: { skin: 1, hair: 2, shirt: 1 },
        level: 'standard',
      },
    });
    const otherValue = await other.json();
    await request.post(url + '/v1/me/workouts', {
      headers: { Authorization: `Bearer ${otherValue.token}` },
      data: {
        sessions: [
          {
            clientId: randomUUID(),
            date: localDate(),
            durationMinutes: 10,
            exercises: [{ name: 'Push-up', exerciseId: 'push-up', sets: [{ reps: 10 }] }],
          },
        ],
      },
    });
    if (await page.locator('.recovery-card').count())
      await page
        .locator('.recovery-card')
        .getByRole('button', { name: 'Close', exact: true })
        .click();
    await page
      .getByRole('checkbox', { name: 'I want to share completed workout summaries', exact: true })
      .check();
    await nav(page, 'Share completed workouts');
    await expect(page.locator('.global-board > li')).toHaveCount(2);
    await expect(page.locator('.global-board > li').first()).toContainText('Foundation');
    await expect(page.locator('.global-board > li').first()).toContainText('240 Reps');
    await capture(page, 'FORM-global-leaderboard.png');
    await page.setViewportSize({ width: 375, height: 812 });
    await nav(page, 'Groups');
    await page.getByLabel('Group name', { exact: true }).fill('Online club');
    await page
      .locator('.group-form > .group-actions')
      .last()
      .getByRole('button', { name: 'Create group', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Online club', exact: true })).toBeVisible();
    await capture(page, 'FORM-groups.png');
    await page
      .context()
      .route('**/*', (route) =>
        route.request().url().startsWith('http://127.0.0.1:5173')
          ? route.continue()
          : route.abort(),
      );
    await page.reload();
    await nav(page, 'Community account');
    await expect(page.locator('.global-board > li')).toHaveCount(2);
    await page.context().unroute('**/*');
  } finally {
    child.kill();
  }
});
test('responsive themes, larger text and reduced motion retain readable usable layouts', async ({
  page,
}) => {
  await seed(page);
  for (const size of [
    { width: 375, height: 812 },
    { width: 812, height: 375 },
    { width: 768, height: 1024 },
    { width: 1440, height: 960 },
  ]) {
    await page.setViewportSize(size);
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await nav(page, 'Exercise library');
  await expect(page.locator('.page')).toHaveCSS('animation-name', 'none');
  await capture(page, 'FORM-mobile.png');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('form-gym-data-v1')!);
    data.settings.appearance = 'light';
    data.settings.largeText = true;
    localStorage.setItem('form-gym-data-v1', JSON.stringify(data));
  });
  await page.reload();
  await nav(page, 'Notes');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, 'FORM-light-notes.png');
});
