import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createInitialData, calculateSessionXp, localDate } from '../src/engine';
import type { Session } from '../src/model';
import type { GroupStore } from '../src/groups';

const loadModule = createRequire(path.resolve('package.json'));
const { createGroupServer } = loadModule('./electron/groups-server.cjs');
const output = process.env.GYM_PREVIEW_OUTPUT || path.resolve('test-results', 'previews');

async function presentation(page: Page, file: string, fullPage = false) {
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page.screenshot({ path: path.join(output, file), fullPage, animations: 'disabled' });
}

test('capture final packaged-build presentation with synthetic training and a real group', async ({
  browser,
}) => {
  test.setTimeout(60000);
  await mkdir(output, { recursive: true });
  const directory = path.resolve('test-results', `final-preview-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const dist = path.resolve('dist');
  const mime: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };
  const staticServer = createServer(async (request, response) => {
    const relative =
      decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname).slice(1) ||
      'index.html';
    const file = path.resolve(dist, relative);
    if (!file.startsWith(dist + path.sep)) {
      response.writeHead(403);
      response.end();
      return;
    }
    try {
      const content = await readFile(file);
      response.writeHead(200, {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      });
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve) => staticServer.listen(0, '127.0.0.1', resolve));
  const address = staticServer.address() as { port: number };
  const baseURL = `http://127.0.0.1:${address.port}`;
  const service = createGroupServer({
    dataFile: path.join(directory, 'groups.json'),
    host: '127.0.0.1',
    port: 0,
    allowedOrigins: [baseURL],
  });
  const { url } = await service.start();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    locale: 'en-GB',
  });
  try {
    async function api(route: string, body?: unknown, token?: string) {
      const response = await fetch(url + '/v1' + route, {
        method: body ? 'POST' : 'GET',
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      expect(response.ok).toBe(true);
      return response.json();
    }
    const coach = await api('/groups', {
      name: 'Wednesday crew',
      displayName: 'Maya',
      deviceId: randomUUID(),
    });
    const alex = await api('/join', {
      inviteCode: coach.inviteCode,
      displayName: 'Alex',
      deviceId: randomUUID(),
    });
    const noa = await api('/join', {
      inviteCode: coach.inviteCode,
      displayName: 'Noa',
      deviceId: randomUUID(),
    });
    const data = createInitialData();
    data.profile = {
      name: 'Alex',
      age: 30,
      weight: 75,
      height: 175,
      experience: 2,
      goal: 'fitness',
      daysPerWeek: 3,
      conditions: [],
    };
    data.settings.reducedMotion = true;
    const exerciseIds = ['goblet-squat', 'bench-press', 'cable-row'];
    const names = ['Goblet squat', 'Bench press', 'Seated cable row'];
    const loads = [20, 40, 35];
    const plan = {
      title: 'Full body · strength',
      note: 'Warm up, then leave two reps in reserve.',
      exercises: exerciseIds.map((exerciseId, index) => ({
        id: randomUUID(),
        exerciseId,
        sets: 3,
        reps: 8,
        weight: loads[index],
        rest: 90,
      })),
    };
    data.plans['1'] = { ...plan, title: 'Full body · foundations' };
    data.plans['5'] = { ...plan, title: 'Full body · movement' };
    data.plans[String(new Date().getDay())] = plan;
    for (let index = 5; index >= 0; index--) {
      const date = new Date();
      date.setDate(date.getDate() - index * 2);
      const session: Session = {
        id: randomUUID(),
        date: localDate(date),
        title: 'Full body · strength',
        duration: 1920,
        note: '',
        xp: 0,
        exercises: exerciseIds.map((exerciseId, position) => ({
          id: randomUUID(),
          exerciseId,
          sets: Array.from({ length: 3 }, () => ({ reps: 8, weight: loads[position], done: true })),
        })),
      };
      session.xp = calculateSessionXp(session, data.sessions);
      data.sessions.push(session);
      await api(
        `/groups/${coach.groupId}/sessions`,
        {
          clientId: session.id,
          date: session.date,
          durationMinutes: 32,
          exercises: session.exercises.map((exercise, position) => ({
            exerciseId: exercise.exerciseId,
            name: names[position],
            sets: exercise.sets.map((set) => ({ reps: set.reps, loadKg: set.weight })),
          })),
        },
        alex.token,
      );
      if (index >= 3)
        await api(
          `/groups/${coach.groupId}/sessions`,
          {
            clientId: randomUUID(),
            date: session.date,
            durationMinutes: 25,
            exercises: [
              {
                exerciseId: 'goblet-squat',
                name: 'Goblet squat',
                sets: Array.from({ length: 4 }, () => ({ reps: 10, loadKg: 16 })),
              },
            ],
          },
          noa.token,
        );
    }
    data.bodyLogs = [{ date: localDate(), weight: 75 }];
    data.notes = [
      {
        id: randomUUID(),
        title: 'A better next session',
        body: 'Keep the same load. Focus on steady breathing and a comfortable range of motion.',
        pinned: true,
        updatedAt: new Date().toISOString(),
      },
    ];
    const state = await api(`/groups/${coach.groupId}/state`, undefined, alex.token);
    const connection = {
      endpoint: url,
      groupId: coach.groupId,
      memberId: alex.memberId,
      token: alex.token,
      name: state.group.name,
      cached: state,
      lastUpdated: new Date().toISOString(),
    };
    const groups: GroupStore = {
      deviceId: randomUUID(),
      connections: [connection],
      activeKey: `${url}|${coach.groupId}`,
    };
    const page = await context.newPage();
    await page.addInitScript(
      ({ data, groups }) => {
        localStorage.setItem('form-gym-data-v1', JSON.stringify(data));
        localStorage.setItem('form-gym-groups-v1', JSON.stringify(groups));
      },
      { data, groups },
    );
    await page.goto(baseURL);
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await presentation(page, 'FORM-preview.png');
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    await page.getByRole('tab', { name: 'Ranks', exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await presentation(page, 'FORM-ranks.png', true);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await presentation(page, 'FORM-mobile.png');
    await page.getByRole('button', { name: 'Groups', exact: true }).click();
    await expect(page.locator('.group-status')).toHaveText('Connected');
    await page.getByRole('tab', { name: 'Leaderboard', exact: true }).click();
    await page.evaluate(() => {
      const tabs = document.querySelector('.group-tabs')!;
      window.scrollTo(0, tabs.getBoundingClientRect().top + window.scrollY - 84);
    });
    await presentation(page, 'FORM-groups.png');
  } finally {
    await context.close();
    await service.close();
    await new Promise<void>((resolve, reject) =>
      staticServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
