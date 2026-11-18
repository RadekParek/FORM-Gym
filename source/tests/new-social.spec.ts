import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createInitialData, calculateSessionXp, localDate } from '../src/engine';
import type { AppData, Session } from '../src/model';
import type { GroupState, GroupStore } from '../src/groups';

const loadModule = createRequire(path.resolve('package.json'));
const { createGroupServer } = loadModule('./electron/groups-server.cjs');
const baseURL = 'http://127.0.0.1:5173';
const output = process.env.GYM_PREVIEW_OUTPUT || path.resolve('test-results', 'previews');
const dataKey = 'form-gym-data-v1';
const groupsKey = 'form-gym-groups-v1';

test.use({
  baseURL,
  viewport: { width: 1440, height: 960 },
  locale: 'en-GB',
  actionTimeout: 10000,
});

function athlete(name: string): AppData {
  const data = createInitialData();
  data.profile = {
    name,
    age: 30,
    weight: 75,
    height: 175,
    experience: 2,
    goal: 'fitness',
    daysPerWeek: 3,
    conditions: [],
  };
  data.bodyLogs = [{ date: localDate(), weight: 75 }];
  const plan = {
    title: 'Strength foundations',
    note: 'Two reps in reserve.',
    exercises: [
      { id: randomUUID(), exerciseId: 'goblet-squat', sets: 2, reps: 10, weight: 20, rest: 90 },
    ],
  };
  data.plans['1'] = plan;
  data.plans[String(new Date().getDay())] = { ...plan, title: 'Original local workout' };
  const session: Session = {
    id: randomUUID(),
    date: localDate(),
    title: 'Morning strength',
    duration: 1200,
    note: 'Private personal note',
    xp: 0,
    exercises: [
      {
        id: randomUUID(),
        exerciseId: 'goblet-squat',
        sets: [
          { reps: 10, weight: 20, done: true },
          { reps: 8, weight: 20, done: true },
          { reps: 10, weight: 20, done: false },
        ],
      },
    ],
  };
  session.xp = calculateSessionXp(session, []);
  data.sessions = [session];
  data.notes = [
    {
      id: randomUUID(),
      title: 'Training cues',
      body: 'Breathe steadily. Keep the movement comfortable.',
      pinned: true,
      updatedAt: new Date().toISOString(),
    },
  ];
  return data;
}

async function seed(page: Page, name: string) {
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
    },
    { key: dataKey, value: athlete(name) },
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
}

async function navigate(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true }).first()).toBeVisible();
}

async function cachedState(page: Page): Promise<GroupState> {
  return page.evaluate((key) => {
    const store = JSON.parse(localStorage.getItem(key)!) as GroupStore;
    return store.connections[0].cached!;
  }, groupsKey);
}

async function refresh(page: Page) {
  await page.locator('.group-header').getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('.group-status')).toHaveText('Connected');
  await expect(
    page.locator('.group-header').getByRole('button', { name: 'Refresh', exact: true }),
  ).toBeEnabled();
}

async function assertLayout(page: Page, label: string) {
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return {
      width,
      scroll: document.documentElement.scrollWidth,
      outside: [
        ...document.querySelectorAll(
          'main button, main input, main textarea, main select, main h1, main h2',
        ),
      ]
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && (box.right > width + 2 || box.left < -2);
        })
        .map((element) => ({
          text: element.textContent?.trim().slice(0, 70),
          className: element.className,
        })),
    };
  });
  expect(overflow, label).toMatchObject({ scroll: overflow.width, outside: [] });
}

async function capture(page: Page, filename: string) {
  const dismiss = page.locator('.toast .icon-button');
  if (await dismiss.isVisible()) await dismiss.click();
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page.screenshot({
    path: path.join(output, filename),
    fullPage: true,
    animations: 'disabled',
  });
}

test('real group lifecycle: invitation, assignment, consent, review, chat, scores and offline cache', async ({
  browser,
}) => {
  test.setTimeout(120000);
  const directory = path.resolve('test-results', `social-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  await mkdir(output, { recursive: true });
  const service = createGroupServer({
    dataFile: path.join(directory, 'groups.json'),
    host: '127.0.0.1',
    port: 0,
    allowedOrigins: [baseURL],
  });
  const { url } = await service.start();
  const coachContext = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 960 },
  });
  const memberContext = await browser.newContext({
    baseURL,
    viewport: { width: 375, height: 812 },
  });
  const coach = await coachContext.newPage();
  const member = await memberContext.newPage();
  const errors: string[] = [];
  coach.on('pageerror', (error) => errors.push(error.message));
  member.on('pageerror', (error) => errors.push(error.message));
  try {
    await seed(coach, 'Coach QA');
    await seed(member, 'Member QA');
    await navigate(coach, 'Groups');
    const create = coach.locator('.group-connect form');
    await create
      .locator('[role="group"]')
      .getByRole('button', { name: 'Create group', exact: true })
      .click();
    await create.getByLabel('Server address').fill(url);
    await create.getByLabel('Your display name').fill('Coach QA');
    await create.getByLabel('Group name').fill('Strength circle');
    await create.getByRole('button', { name: 'Create group', exact: true }).last().click();
    await expect(coach.locator('.group-status')).toHaveText('Connected');
    await coach.getByRole('tab', { name: 'Members', exact: true }).click();
    const inviteResponse = coach.waitForResponse(
      (response) => response.url().endsWith('/invite') && response.request().method() === 'POST',
    );
    await coach.getByRole('button', { name: 'Generate invite', exact: true }).click();
    const generatedInvite = await inviteResponse;
    expect(generatedInvite.status()).toBe(200);
    await expect(coach.locator('.group-invite-code code')).toHaveText(
      (await generatedInvite.json()).inviteCode,
    );
    const invitation = (await coach.locator('.group-invite-code code').textContent())!;
    await navigate(member, 'Groups');
    const join = member.locator('.group-connect form');
    await join.getByLabel('Server address').fill(url);
    await join.getByLabel('Your display name').fill('Member QA');
    await join.getByLabel('Invite code').fill(invitation);
    await join.getByRole('button', { name: 'Join group', exact: true }).last().click();
    await expect(member.locator('.group-status')).toHaveText('Connected');
    await refresh(coach);
    await expect(coach.locator('.group-members li')).toHaveCount(2);

    await coach.getByRole('tab', { name: 'Training', exact: true }).click();
    await coach.locator('.group-assignment-form summary').click();
    await coach.getByLabel('Local workout plan').selectOption('1');
    await coach.getByLabel('Title', { exact: true }).fill('Coach assigned strength');
    await coach.getByLabel('Date', { exact: true }).fill(localDate());
    await coach.getByRole('checkbox', { name: 'Member QA', exact: true }).check();
    await coach
      .getByLabel('Group note (optional)')
      .fill('Pause at the bottom and keep two reps in reserve.');
    await coach.getByRole('button', { name: 'Save assignment', exact: true }).click();
    await expect(coach.locator('.group-assignment')).toHaveCount(1);
    await refresh(member);
    await member.getByRole('tab', { name: 'Training', exact: true }).click();
    await expect(member.locator('.group-assignment')).toContainText('Coach assigned strength');
    await member.getByRole('button', { name: 'Copy to My week', exact: true }).click();
    const dialog = member.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: 'Replace this day’s workout?' }),
    ).toBeVisible();
    const original = await member.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      dataKey,
    );
    expect(original.plans[String(new Date().getDay())].title).toBe('Original local workout');
    await dialog.getByRole('button', { name: 'Replace workout', exact: true }).click();
    await expect(member.getByRole('heading', { name: 'My week', exact: true })).toBeVisible();
    const applied = await member.evaluate((key) => JSON.parse(localStorage.getItem(key)!), dataKey);
    expect(applied.plans[String(new Date().getDay())]).toMatchObject({
      title: 'Coach assigned strength',
      note: 'Pause at the bottom and keep two reps in reserve.',
      exercises: [{ exerciseId: 'goblet-squat', sets: 2, reps: 10, weight: 20, rest: 90 }],
    });
    expect(applied.plans[String(new Date().getDay())].exercises[0].id).not.toBe(
      original.plans['1'].exercises[0].id,
    );

    await navigate(member, 'Groups');
    await expect(member.locator('.group-status')).toHaveText('Connected');
    await member.getByRole('tab', { name: 'Training', exact: true }).click();
    await member.locator('.group-share-form summary').click();
    await member.getByLabel('Local completed session').selectOption(applied.sessions[0].id);
    await member
      .getByLabel('Link to assignment (optional)')
      .selectOption((await cachedState(member)).assignments[0].id);
    await expect(member.getByRole('button', { name: 'Share session', exact: true })).toBeDisabled();
    await member.getByRole('checkbox', { name: /^I agree to share/ }).check();
    await member.getByRole('button', { name: 'Share session', exact: true }).click();
    await expect(member.locator('.group-session')).toHaveCount(1);
    const shared = (await cachedState(member)).sessions[0];
    expect(shared.completedSets).toBe(2);
    expect(shared.volumeKg).toBe(360);
    expect(shared.note).toBe('');
    expect(JSON.stringify(shared)).not.toContain('Private personal note');
    await refresh(coach);
    await coach.locator('.group-session summary').click();
    await coach.getByLabel('Grade (1–5)').selectOption('4');
    await coach
      .getByLabel('Feedback (optional)')
      .fill('Good control. Keep this load for your next session.');
    await coach.getByRole('button', { name: 'Save review', exact: true }).click();
    await expect(coach.locator('.group-grade')).toHaveText('Grade: 4/5');
    await refresh(member);
    await member.locator('.group-session summary').click();
    await expect(member.locator('.group-session')).toContainText(
      'Good control. Keep this load for your next session.',
    );

    await coach.getByRole('tab', { name: 'Feed', exact: true }).click();
    await coach
      .getByRole('textbox', { name: 'Message', exact: true })
      .fill('Welcome to our strength circle.');
    await coach.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(coach.getByRole('log')).toContainText('Welcome to our strength circle.');
    await member.getByRole('tab', { name: 'Feed', exact: true }).click();
    await refresh(member);
    await expect(member.getByRole('log')).toContainText('Welcome to our strength circle.');
    await member
      .getByRole('textbox', { name: 'Message', exact: true })
      .fill('Thanks! Finished the assigned workout.');
    await member.getByRole('button', { name: 'Send', exact: true }).click();
    await refresh(coach);
    await expect(coach.getByRole('log')).toContainText('Thanks! Finished the assigned workout.');

    await member.getByRole('tab', { name: 'Leaderboard', exact: true }).click();
    const board = member.locator('.group-leaderboard li');
    await expect(board).toHaveCount(2);
    await expect(board.first()).toContainText('Member QA');
    const state = await cachedState(member);
    const scoredMember = state.members.find((entry) => entry.displayName === 'Member QA')!;
    expect(scoredMember).toMatchObject({
      sessionCount: 1,
      trainingDays: 1,
      completedSets: 2,
      volumeKg: 360,
    });
    expect(scoredMember.score).toBeGreaterThan(0);
    expect(state.members.find((entry) => entry.displayName === 'Coach QA')!.score).toBe(0);
    for (const viewport of [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1440, height: 960 },
      { width: 812, height: 375 },
    ]) {
      await coach.setViewportSize(viewport);
      for (const tab of ['Feed', 'Training', 'Leaderboard', 'Members']) {
        await coach.getByRole('tab', { name: tab, exact: true }).click();
        await assertLayout(coach, `${viewport.width}×${viewport.height} connected group ${tab}`);
      }
    }
    await coach.setViewportSize({ width: 1440, height: 960 });
    await assertLayout(member, '375 px leaderboard');
    await capture(member, 'GYM-dark-mobile-leaderboard.png');
    await coach.getByRole('tab', { name: 'Training', exact: true }).click();
    await coach.locator('.group-session summary').click();
    await assertLayout(coach, '1440 px training');
    await capture(coach, 'GYM-dark-desktop-group-training.png');

    await memberContext.route(`${url}/v1/**`, (route) => route.abort('connectionfailed'));
    await member.getByRole('tab', { name: 'Feed', exact: true }).click();
    await member
      .locator('.group-header')
      .getByRole('button', { name: 'Refresh', exact: true })
      .click();
    await expect(member.locator('.group-status')).toHaveText(
      'Offline — showing the last saved update',
    );
    await expect(member.getByRole('log')).toContainText('Welcome to our strength circle.');
    await member
      .getByRole('textbox', { name: 'Message', exact: true })
      .fill('Offline draft kept on screen');
    await expect(member.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await expect(member.locator('.group-error')).toBeVisible();
    await expect(member.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
      'Offline draft kept on screen',
    );
    expect((await cachedState(member)).messages).toHaveLength(2);
    await member.reload();
    await navigate(member, 'Groups');
    await expect(member.locator('.group-status')).toHaveText(
      'Offline — showing the last saved update',
    );
    await expect(member.getByRole('log')).toContainText('Thanks! Finished the assigned workout.');
    await memberContext.unroute(`${url}/v1/**`);
    await refresh(member);
    expect((await cachedState(member)).messages).toHaveLength(2);
    expect(errors).toEqual([]);
  } finally {
    await coachContext.close();
    await memberContext.close();
    await service.close();
  }
});

test('dark default, persistent appearance, larger text, reduced motion and responsive personal screens', async ({
  page,
}) => {
  test.setTimeout(90000);
  await mkdir(output, { recursive: true });
  await seed(page, 'Alex');
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  await navigate(page, 'Settings');
  await page.getByRole('combobox', { name: 'Appearance', exact: true }).selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
  await navigate(page, 'Settings');
  await page.getByRole('combobox', { name: 'Appearance', exact: true }).selectOption('dark');
  await page.getByRole('checkbox', { name: 'Reduce motion', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Larger text', exact: true }).check();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator('html')).toHaveAttribute('data-text', 'large');

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1440, height: 960 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    for (const screen of ['Today', 'My week', 'Notes', 'Progress', 'Settings', 'Groups']) {
      await navigate(page, screen);
      await assertLayout(page, `${viewport.width}×${viewport.height} ${screen}, large text`);
      if (screen === 'Progress') {
        await page.getByRole('tab', { name: 'Ranks', exact: true }).click();
        await expect(
          page.getByRole('heading', { name: 'Your rank journey', exact: true }),
        ).toBeVisible();
        await assertLayout(page, `${viewport.width}×${viewport.height} ranks, large text`);
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await navigate(page, 'Settings');
  await page.getByRole('checkbox', { name: 'Larger text', exact: true }).uncheck();
  await navigate(page, 'Today');
  await capture(page, 'GYM-dark-desktop-today.png');
  await navigate(page, 'Progress');
  await page.getByRole('tab', { name: 'Ranks', exact: true }).click();
  await capture(page, 'GYM-dark-desktop-ranks.png');
  await page.setViewportSize({ width: 375, height: 812 });
  await navigate(page, 'Today');
  await capture(page, 'GYM-dark-mobile-today.png');
  await navigate(page, 'My week');
  await capture(page, 'GYM-dark-mobile-planner.png');
  await navigate(page, 'Notes');
  await capture(page, 'GYM-dark-mobile-notes.png');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const durations = await page
    .locator('.page')
    .evaluate((element) => getComputedStyle(element).animationDuration);
  expect(durations.split(',').every((value) => parseFloat(value) <= 0.001)).toBe(true);
});
