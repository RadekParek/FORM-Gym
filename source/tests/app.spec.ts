import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createInitialData, localDate, parseBackup } from '../src/engine';
import type { AppData, Profile } from '../src/model';

test.use({
  baseURL: 'http://127.0.0.1:5173',
  viewport: { width: 1366, height: 900 },
  locale: 'en-GB',
});

const profile: Profile = {
  name: 'Test Athlete',
  age: 30,
  weight: 75,
  height: 175,
  experience: 2,
  goal: 'fitness',
  daysPerWeek: 3,
  conditions: [],
};
const dataKey = 'form-gym-data-v1';

async function seed(page: Page, update: (data: AppData) => AppData = (data) => data) {
  const data = update({
    ...createInitialData(),
    profile,
    bodyLogs: [{ date: localDate(), weight: 75 }],
  });
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
    },
    { key: dataKey, value: data },
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
}

async function readState(page: Page): Promise<AppData> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), dataKey);
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
}

test('English onboarding saves measurements, experience and the final health consideration', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Choose your language' })).toBeVisible();
  await expect(page.locator('.language-choice')).toHaveCount(5);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel(/^Name/).fill('Sam');
  await page.getByLabel(/^Age/).fill('30');
  await page.getByLabel(/^Years of training/).fill('2');
  await page.getByLabel(/^Weight/).fill('75');
  await page.getByLabel(/^Height/).fill('175');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.condition-grid label')).toHaveCount(14);
  await expect(page.locator('.condition-grid label').last()).toHaveText('Hirschsprung disease');
  await page.locator('.conditions-disclosure summary').click();
  await page.getByRole('checkbox', { name: 'Hirschsprung disease', exact: true }).check();
  await page.getByLabel('Training days per week').selectOption('2');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  const saved = await readState(page);
  expect(saved.profile).toEqual({
    ...profile,
    name: 'Sam',
    daysPerWeek: 2,
    conditions: ['hirschsprung'],
  });
  expect(Object.values(saved.plans).filter((plan) => plan.exercises.length)).toHaveLength(2);
  await page.reload();
  await expect(page.locator('.profile-mini')).toContainText('Sam');
});

test('Slovak selection translates onboarding and persists after completing the profile', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Slovenčina/ }).click();
  await expect(page.getByRole('heading', { name: 'Vyber si jazyk' })).toBeVisible();
  await page.getByRole('button', { name: 'Pokračovať', exact: true }).click();
  await page.getByLabel(/^Meno/).fill('Alex');
  await page.getByLabel(/^Vek/).fill('66');
  await page.getByLabel(/^Roky tréningu/).fill('12');
  await page.getByLabel(/^Hmotnosť/).fill('80');
  await page.getByLabel(/^Výška/).fill('180');
  await page.getByRole('button', { name: 'Pokračovať', exact: true }).click();
  await expect(page.locator('.condition-grid label').last()).toHaveText('Hirschsprungova choroba');
  await page.getByRole('button', { name: 'Pokračovať', exact: true }).click();
  await expect(page.locator('.health-advice').first()).toContainText('Pridávaj postupne');
  await page.getByRole('button', { name: 'Začať', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dnes' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'sk');
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'Môj týždeň', exact: true }),
  ).toBeVisible();
});

test('planner edits sets, reps, load and day notes, then copies and reloads the complete day', async ({
  page,
}) => {
  await seed(page);
  await page.locator('.sidebar').getByRole('button', { name: 'My week', exact: true }).click();
  await page.locator('.week-strip button').nth(0).click();
  await page.getByLabel('Your next session').fill('Monday strength');
  await page.getByLabel('Find an exercise…').fill('Bench press');
  await page
    .locator('.exercise-choice')
    .filter({ has: page.getByText('Bench press', { exact: true }) })
    .click();
  const exercise = page.locator('.exercise-row').first();
  await exercise.getByLabel('Sets', { exact: true }).fill('2');
  await exercise.getByLabel('Reps', { exact: true }).fill('8');
  await exercise.getByLabel('Load (kg)', { exact: true }).fill('40');
  await exercise.getByLabel('Rest (seconds)', { exact: true }).fill('0');
  await page.getByLabel('Notes for this day').fill('Keep two reps in reserve.');
  await page.locator('#copy-day').selectOption('2');
  await page.getByRole('button', { name: 'Copy plan', exact: true }).click();
  if (await page.getByRole('dialog').isVisible())
    await page.getByRole('dialog').getByRole('button', { name: 'Copy plan', exact: true }).click();
  const saved = await readState(page);
  expect(saved.plans['2'].note).toBe('Keep two reps in reserve.');
  expect(saved.plans['2'].exercises[0]).toMatchObject({
    sets: 2,
    reps: 8,
    weight: 40,
    rest: 0,
  });
  expect(saved.plans['2'].exercises[0].id).not.toBe(saved.plans['1'].exercises[0].id);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: 'My week', exact: true }).click();
  await page.locator('.week-strip button').nth(1).click();
  await expect(page.getByLabel('Your next session')).toHaveValue('Monday strength');
  await expect(page.getByLabel('Notes for this day')).toHaveValue('Keep two reps in reserve.');
});

test('a weekday shortcut opens that exact day in the planner', async ({ page }) => {
  const targetDay = new Date().getDay() === 1 ? 2 : 1;
  const targetDate = new Date(2026, 0, 4 + targetDay);
  const targetWeekday = targetDate.toLocaleDateString('en-GB', { weekday: 'long' });
  const title = 'Weekday shortcut routine';
  await seed(page, (data) => ({
    ...data,
    plans: { ...data.plans, [String(targetDay)]: { title, note: '', exercises: [] } },
  }));
  await page.getByRole('button', { name: new RegExp(`^${targetWeekday},`) }).click();
  await expect(page.getByRole('heading', { name: 'My week', exact: true })).toBeVisible();
  const weekdays = [1, 2, 3, 4, 5, 6, 0];
  await expect(page.locator('.day-button').nth(weekdays.indexOf(targetDay))).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.day-button[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.getByLabel('Your next session')).toHaveValue(title);
});

test('active sets, notes and timer survive reload; finishing stores one completed session', async ({
  page,
}) => {
  await seed(page, (data) => ({
    ...data,
    plans: {
      ...data.plans,
      [String(new Date().getDay())]: {
        title: 'Focused strength',
        note: 'Plan cue',
        exercises: [
          {
            id: 'bench',
            exerciseId: 'bench-press',
            sets: 2,
            reps: 8,
            weight: 40,
            rest: 90,
          },
        ],
      },
    },
  }));
  await page.getByRole('button', { name: 'Start workout', exact: true }).click();
  await page.getByRole('button', { name: 'Complete set 1 Bench press', exact: true }).click();
  await expect(page.locator('.timer-value')).toHaveText(/01:[23]\d/);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Skip rest', exact: true }).click();
  await expect(page.locator('.timer-value')).toHaveText('00:00');
  await page.getByLabel('Session notes').fill('Controlled reps, comfortable load.');
  await page.reload();
  await page.getByRole('button', { name: 'Resume workout', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: 'Complete set 1 Bench press',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Session notes')).toHaveValue('Controlled reps, comfortable load.');
  await page.getByRole('button', { name: 'Complete set 2 Bench press', exact: true }).click();
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  const saved = await readState(page);
  expect(saved.sessions).toHaveLength(1);
  expect(saved.sessions[0].exercises[0].sets.filter((set) => set.done)).toHaveLength(2);
  expect(saved.sessions[0].note).toBe('Controlled reps, comfortable load.');
  expect(saved.sessions[0].xp).toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem('form-active-workout-v1'))).toBeNull();
  await page.reload();
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(page.locator('.history-detail')).toContainText('Focused strength');
});

test('free notes support editing, search, pinning, confirmed deletion and reload', async ({
  page,
}) => {
  await seed(page);
  await page.locator('.sidebar').getByRole('button', { name: 'Notes', exact: true }).click();
  await page
    .locator('.page-heading')
    .getByRole('button', { name: 'New note', exact: true })
    .click();
  await page.getByLabel('Title', { exact: true }).fill('Technique cues');
  await page.getByLabel('Write what matters…', { exact: true }).fill('Control the lowering phase.');
  await page.getByRole('button', { name: 'Pin', exact: true }).click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Shopping');
  await page.getByLabel('Write what matters…', { exact: true }).fill('Bring a towel.');
  await page.getByLabel('Search your notes…').fill('lowering');
  await expect(page.locator('.note-item')).toHaveCount(1);
  await page.locator('.note-item').click();
  await expect(page.getByRole('button', { name: 'Unpin', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Delete note', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.note-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Delete note', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  expect((await readState(page)).notes.map((note) => note.title)).toEqual(['Shopping']);
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Shopping');
});

test('settings reject invalid activation and persist language, accessibility and short valid rest', async ({
  page,
}) => {
  await seed(page);
  await openSettings(page);
  await page.locator('.activation-panel summary').click();
  await page.getByLabel('Activation code', { exact: true }).fill('invalid-test-code');
  await page.getByRole('button', { name: 'Activate', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('This code isn’t valid.');
  expect((await readState(page)).premium.until).toBeNull();
  await page.getByLabel('Rest timer (seconds)', { exact: true }).fill('15');
  await page.getByLabel('Reduce motion', { exact: true }).check();
  await page.getByLabel('Larger text', { exact: true }).check();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('sk');
  await expect(page.locator('html')).toHaveAttribute('lang', 'sk');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dnes' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator('html')).toHaveAttribute('data-text', 'large');
  expect((await readState(page)).settings.restSeconds).toBe(15);
});

test('a configured activation enables premium features and stays active after restart', async ({
  page,
}) => {
  test.skip(
    !process.env.GYM_TEST_CODE,
    'Activation is exercised only when a private test code is supplied.',
  );
  await seed(page);
  await openSettings(page);
  await page.locator('.activation-panel summary').click();
  // Never write the private value to logs, trace files or screenshots.
  await page.getByLabel('Activation code', { exact: true }).fill(process.env.GYM_TEST_CODE!);
  await page.getByRole('button', { name: 'Activate', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Plus activated for one month.');
  await expect(page.getByLabel('Activation code', { exact: true })).toHaveValue('');
  await expect(page.locator('.premium-settings')).toContainText('Plus is active');
  await expect(page.locator('.accent-options')).toBeVisible();
  await page.reload();
  await expect(page.locator('.profile-mini')).toContainText('FORM PLUS');
  await page.locator('.sidebar').getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByRole('tab', { name: 'Ranks', exact: true }).click();
  await expect(page.locator('.rank-step').last()).toContainText('ROBO!');
  await expect(page.locator('.rank-step').last()).toContainText('180,000 XP');
});

test('backup export and import preserve notes, premium templates and appearance', async ({
  page,
}) => {
  const plan = {
    title: 'Reusable strength',
    note: 'Keep loads comfortable',
    exercises: [
      {
        id: 'e',
        exerciseId: 'bench-press',
        sets: 2,
        reps: 8,
        weight: 40,
        rest: 0,
      },
    ],
  };
  await seed(page, (data) => ({
    ...data,
    premium: { lifetime: true, until: null },
    settings: { ...data.settings, accent: 'ice' },
    templates: [{ id: 't', name: 'My routine', plan }],
    notes: [
      {
        id: 'n',
        title: 'Backup note',
        body: 'Original content',
        pinned: true,
        updatedAt: new Date().toISOString(),
      },
    ],
  }));
  await openSettings(page);
  await page.locator('.backup-section summary').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export backup', exact: true }).click(),
  ]);
  const backup = await readFile((await download.path())!);
  const exported = parseBackup(backup.toString('utf8'));
  expect(exported.templates[0].plan.exercises[0].rest).toBe(0);
  expect(exported.settings.accent).toBe('ice');
  expect(exported.notes[0].body).toBe('Original content');
  await page.locator('.sidebar').getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByLabel('Write what matters…', { exact: true }).fill('Edited after backup');
  await openSettings(page);
  await page.locator('.backup-section summary').click();
  await page.locator('.backup-actions input[type=file]').setInputFiles({
    name: 'FORM-backup.json',
    mimeType: 'application/json',
    buffer: backup,
  });
  await expect(page.getByRole('status')).toContainText('Backup restored.');
  expect((await readState(page)).notes[0].body).toBe('Original content');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'ice');
  expect((await readState(page)).templates[0].name).toBe('My routine');
});

test('younger users can continue with an optional name on a narrow phone layout', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel(/^Age/).fill('14');
  await page.getByLabel(/^Weight/).fill('50');
  await page.getByLabel(/^Height/).fill('155');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your routine' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.health-advice').first()).toContainText('avoid maximal lifts');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 2,
  );
  expect(overflow).toBe(false);
  await expect(page.locator('.page')).toHaveCSS('opacity', '1');
  await page.evaluate(() => document.fonts.ready);
  if (process.env.GYM_PREVIEW_DIR)
    await page.screenshot({
      path: path.join(process.env.GYM_PREVIEW_DIR, 'FORM-mobile.png'),
      fullPage: true,
      animations: 'disabled',
    });
});

test('timed exercises use seconds or minutes and never create lifted load', async ({ page }) => {
  await seed(page, (data) => ({
    ...data,
    plans: {
      ...data.plans,
      [String(new Date().getDay())]: {
        title: 'Movement session',
        note: '',
        exercises: [
          { id: 'plank', exerciseId: 'plank', sets: 1, reps: 30, weight: 50, rest: 0 },
          { id: 'walk', exerciseId: 'walk', sets: 1, reps: 20, weight: 25, rest: 0 },
        ],
      },
    },
  }));
  await page.locator('.sidebar').getByRole('button', { name: 'My week', exact: true }).click();
  await expect(
    page.locator('.exercise-row').nth(0).getByLabel('seconds', { exact: true }),
  ).toHaveValue('30');
  await expect(
    page.locator('.exercise-row').nth(1).getByLabel('minutes', { exact: true }),
  ).toHaveValue('20');
  await expect(
    page.locator('.exercise-row').nth(0).getByLabel('Load (kg)', { exact: true }),
  ).toBeDisabled();
  await expect(
    page.locator('.exercise-row').nth(1).getByLabel('Load (kg)', { exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Start workout', exact: true }).click();
  await expect(page.locator('.workout-exercise input[disabled]').nth(0)).toHaveValue('0');
  await expect(page.locator('.workout-exercise input[disabled]').nth(1)).toHaveValue('0');
  await page.getByRole('button', { name: /Complete set 1 Plank/ }).click();
  await page.getByRole('button', { name: /Complete set 1 Brisk walk/ }).click();
  await expect(page.locator('.workout-summary > div').nth(2)).toContainText('0');
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  expect(
    (await readState(page)).sessions[0].exercises
      .flatMap((exercise) => exercise.sets)
      .every((set) => set.weight === 0),
  ).toBe(true);
});

test('premium session cards download as a real portrait PNG and include a name only when chosen', async ({
  page,
}) => {
  await seed(page, (data) => ({
    ...data,
    profile: { ...profile, name: 'Card Athlete', conditions: ['hirschsprung'] },
    sessions: [
      {
        id: 'shared',
        date: localDate(),
        title: 'Focused strength',
        duration: 1200,
        xp: 124,
        note: 'private-session-cue',
        exercises: [
          { id: 'bench', exerciseId: 'bench-press', sets: [{ reps: 8, weight: 40, done: true }] },
        ],
      },
    ],
  }));
  await page.locator('.sidebar').getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await page.locator('.history-detail').first().locator('summary').click();
  await expect(page.getByRole('button', { name: 'Share session', exact: true })).toHaveCount(0);
  const data = await readState(page);
  data.premium = { until: null, lifetime: true };
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), {
    key: dataKey,
    data,
  });
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await page.locator('.history-detail').first().locator('summary').click();
  await page.getByRole('button', { name: 'Share session', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('img', { name: 'Preview of your workout card' })).toBeVisible();
  await expect(dialog.getByLabel('Include my name', { exact: true })).not.toBeChecked();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Save or share PNG', exact: true }).click(),
  ]);
  const first = await readFile((await download.path())!);
  expect(first.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(first.readUInt32BE(16)).toBe(1080);
  expect(first.readUInt32BE(20)).toBe(1350);
  if (process.env.GYM_PREVIEW_DIR)
    await download.saveAs(path.join(process.env.GYM_PREVIEW_DIR, 'FORM-workout-card.png'));
  const previousSrc = await dialog
    .getByRole('img', { name: 'Preview of your workout card' })
    .getAttribute('src');
  await dialog.getByLabel('Include my name', { exact: true }).check();
  await expect
    .poll(() =>
      dialog.getByRole('img', { name: 'Preview of your workout card' }).getAttribute('src'),
    )
    .not.toBe(previousSrc);
  const [namedDownload] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Save or share PNG', exact: true }).click(),
  ]);
  const named = await readFile((await namedDownload.path())!);
  expect(named.equals(first)).toBe(false);
});

test('invalid profile feedback follows the selected Slovak language', async ({ page }) => {
  await seed(page);
  await openSettings(page);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('sk');
  await page.locator('.profile-panel > summary').click();
  await page.locator('.profile-panel').getByLabel('Vek', { exact: true }).fill('7');
  await page.getByRole('button', { name: 'Uložiť profil', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Skontroluj údaje');
  expect((await readState(page)).profile?.age).toBe(30);
});

async function assertUsableLayout(page: Page, minimumTarget: number) {
  const audit = await page.evaluate((minimum) => {
    const visible = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        bounds.width > 0 &&
        bounds.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none'
      );
    };
    const describe = (element: Element) =>
      `${element.tagName.toLowerCase()}.${element.className} ${(element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 90)}`;
    const text = [...document.body.querySelectorAll<HTMLElement>('*')].filter(
      (element) =>
        visible(element) &&
        !['SCRIPT', 'STYLE', 'SVG', 'PATH'].includes(element.tagName) &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) ||
          [...element.childNodes].some(
            (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          )),
    );
    const smallText = text
      .filter((element) => parseFloat(getComputedStyle(element).fontSize) < 12)
      .map(describe);
    const controls = [
      ...document.body.querySelectorAll<HTMLElement>(
        'button,input,textarea,select,summary,label.button',
      ),
    ].filter(visible);
    const smallControls = controls.flatMap((element) => {
      const target =
        element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)
          ? element.closest('label') || element
          : element;
      const bounds = target.getBoundingClientRect();
      return bounds.width + 0.5 < minimum || bounds.height + 0.5 < minimum
        ? [`${describe(target)} ${Math.round(bounds.width)}×${Math.round(bounds.height)}`]
        : [];
    });
    return {
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      smallText,
      smallControls,
    };
  }, minimumTarget);
  expect(audit.horizontalOverflow, 'The application must fit the viewport horizontally.').toBe(
    false,
  );
  expect(audit.smallText, 'Visible text must be at least 12 CSS pixels.').toEqual([]);
  expect(
    audit.smallControls,
    'Controls must preserve a usable pointer or expanded label target.',
  ).toEqual([]);
}

const viewports = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 844, height: 390 },
];

for (const viewport of viewports) {
  test(`forms and training tools remain usable at ${viewport.width}×${viewport.height} with larger text`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seed(page, (data) => {
      const plan = {
        title: 'Full body training',
        note: 'Use a comfortable load and keep every rep controlled.',
        exercises: [
          { id: 'bench', exerciseId: 'bench-press', sets: 2, reps: 8, weight: 40, rest: 90 },
        ],
      };
      return {
        ...data,
        settings: { ...data.settings, largeText: true, reducedMotion: true },
        premium: { lifetime: true, until: null },
        plans: { ...data.plans, [String(new Date().getDay())]: plan },
        notes: [
          {
            id: 'n',
            title: 'Training reminders',
            body: 'Keep a steady pace. Take time to recover between sets.',
            updatedAt: new Date().toISOString(),
            pinned: true,
          },
        ],
        sessions: [
          {
            id: 's',
            date: localDate(),
            title: 'Full body training',
            duration: 1200,
            xp: 124,
            note: '',
            exercises: [
              {
                id: 'bench',
                exerciseId: 'bench-press',
                sets: [{ reps: 8, weight: 40, done: true }],
              },
            ],
          },
        ],
        templates: [{ id: 't', name: 'Full body training', plan }],
      };
    });
    const minimumTarget = viewport.width <= 375 ? 48 : 44;
    await expect(page.locator('html')).toHaveAttribute('data-text', 'large');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    await assertUsableLayout(page, minimumTarget);
    await page.getByRole('button', { name: 'My week', exact: true }).click();
    await assertUsableLayout(page, minimumTarget);
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await assertUsableLayout(page, minimumTarget);
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    await assertUsableLayout(page, minimumTarget);
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    await page.locator('.history-detail').first().locator('summary').click();
    await assertUsableLayout(page, minimumTarget);
    await page.getByRole('tab', { name: 'Ranks', exact: true }).click();
    await assertUsableLayout(page, minimumTarget);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await assertUsableLayout(page, minimumTarget);
    await page.locator('.profile-panel > summary').click();
    await assertUsableLayout(page, minimumTarget);
    await page.locator('.backup-section > summary').click();
    await assertUsableLayout(page, minimumTarget);
    await page.locator('.activation-panel > summary').click();
    await assertUsableLayout(page, minimumTarget);
    await page.getByRole('button', { name: 'View Premium', exact: true }).click();
    await assertUsableLayout(page, minimumTarget);
  });
}

for (const viewport of viewports) {
  test(`onboarding remains readable at ${viewport.width}×${viewport.height} and keeps health details optional`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const data = createInitialData();
    data.settings.largeText = true;
    data.settings.reducedMotion = true;
    await page.addInitScript(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), {
      key: dataKey,
      data,
    });
    await page.goto('/');
    const minimumTarget = viewport.width <= 375 ? 48 : 44;
    await expect(
      page.getByRole('heading', { name: 'Choose your language', exact: true }),
    ).toBeVisible();
    await assertUsableLayout(page, minimumTarget);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await assertUsableLayout(page, minimumTarget);
    await page.locator('#onboarding-age').fill('30');
    await page.locator('#onboarding-weight').fill('75');
    await page.locator('#onboarding-height').fill('175');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('.conditions-disclosure')).not.toHaveAttribute('open');
    await page.locator('.conditions-disclosure summary').click();
    await expect(page.getByRole('checkbox')).toHaveCount(14);
    await assertUsableLayout(page, minimumTarget);
  });
}

test('profile errors are linked to fields and receive keyboard focus after failed submission', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.form-error-summary')).toBeFocused();
  await expect(page.locator('.form-error-summary a')).toHaveCount(3);
  await expect(page.locator('#onboarding-age')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('.form-error-summary a').first().click();
  await expect(page.locator('#onboarding-age')).toBeFocused();
});

test('an active workout can be left for notes and resumed without losing completed sets', async ({
  page,
}) => {
  await seed(page, (data) => ({
    ...data,
    plans: {
      ...data.plans,
      [String(new Date().getDay())]: {
        title: 'Focused strength',
        note: '',
        exercises: [
          { id: 'bench', exerciseId: 'bench-press', sets: 2, reps: 8, weight: 40, rest: 0 },
        ],
      },
    },
  }));
  await page.getByRole('button', { name: 'Start workout', exact: true }).click();
  await page.getByRole('button', { name: 'Complete set 1 Bench press', exact: true }).click();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Resume workout', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Complete set 1 Bench press', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});
