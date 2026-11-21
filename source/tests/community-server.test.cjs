'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createGroupServer } = require('../electron/groups-server.cjs');

async function fixture(t, storage) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'form-community-test-'));
  const dataFile = path.join(folder, 'groups.json');
  const server = createGroupServer({ dataFile, storage });
  const { url } = await server.start();
  t.after(async () => {
    await server.close();
    await fs.rm(folder, { recursive: true, force: true });
  });
  const request = async (route, method = 'GET', body, token) => {
    const response = await fetch(url + '/v1' + route, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, value: await response.json() };
  };
  return { request, server, dataFile, folder };
}
const registration = (username) => ({
  username,
  password: 'unit-test-password',
  avatar: { skin: 1, hair: 0, shirt: 0 },
  level: 'standard',
});
const workout = (id, reps = 15) => ({
  clientId: id,
  date: new Date().toISOString().slice(0, 10),
  durationMinutes: 10,
  exercises: [
    {
      exerciseId: 'bodyweight-squat',
      name: 'Squat',
      sets: [
        { reps, loadKg: 0 },
        { reps, loadKg: 0 },
      ],
    },
  ],
});
test('account registration, normalized usernames, password login and recovery revoke old access', async (t) => {
  const { request, dataFile } = await fixture(t);
  const created = await request('/auth/register', 'POST', registration('Alex_1'));
  assert.equal(created.status, 201);
  assert.equal(created.value.user.username, 'alex_1');
  assert.equal((await request('/auth/register', 'POST', registration('alex_1'))).status, 409);
  assert.equal(
    (await request('/auth/login', 'POST', { username: 'alex_1', password: 'wrong-password' }))
      .status,
    401,
  );
  const signed = await request('/auth/login', 'POST', {
    username: 'ALEX_1',
    password: 'unit-test-password',
  });
  assert.equal(signed.status, 200);
  assert.equal((await request('/me', 'GET', undefined, signed.value.token)).status, 200);
  const reset = await request('/auth/reset', 'POST', {
    username: 'alex_1',
    recoveryKey: created.value.recoveryKey,
    password: 'new-test-password',
  });
  assert.equal(reset.status, 200);
  assert.equal((await request('/me', 'GET', undefined, signed.value.token)).status, 401);
  assert.equal((await request('/me', 'GET', undefined, reset.value.token)).status, 200);
  const disk = await fs.readFile(dataFile, 'utf8');
  assert.ok(!disk.includes('unit-test-password'));
  assert.ok(!disk.includes(created.value.token));
  assert.ok(!disk.includes(created.value.recoveryKey));
});
test('global scores, repetitions and quests come from submitted work and retry safely', async (t) => {
  const { request } = await fixture(t);
  const a = (await request('/auth/register', 'POST', registration('alex_a'))).value;
  const b = (await request('/auth/register', 'POST', registration('alex_b'))).value;
  assert.equal((await request('/leaderboard')).value.users.length, 0);
  const log = workout('workout-account-a');
  const first = await request('/me/workouts', 'POST', { sessions: [log] }, a.token);
  assert.equal(first.status, 200);
  assert.equal(first.value.user.xp, 124);
  assert.equal(first.value.user.reps, 30);
  const second = await request('/me/workouts', 'POST', { sessions: [log] }, a.token);
  assert.equal(second.value.user.xp, 124);
  const claim = { date: log.date, tier: 'easy', level: 'standard' };
  const claimed = await request('/me/workouts', 'POST', { sessions: [], claims: [claim] }, a.token);
  assert.equal(claimed.value.user.xp, 164);
  assert.equal(
    (await request('/me/workouts', 'POST', { sessions: [], claims: [claim] }, a.token)).value.user
      .xp,
    164,
  );
  assert.equal(
    (
      await request(
        '/me/workouts',
        'POST',
        { sessions: [], claims: [{ ...claim, tier: 'hard' }] },
        a.token,
      )
    ).status,
    400,
  );
  await request('/me/workouts', 'POST', { sessions: [workout('workout-account-b', 5)] }, b.token);
  const board = (await request('/leaderboard')).value.users;
  assert.equal(board[0].username, 'alex_a');
  assert.equal(board[0].rank.name, 'First Rep');
  assert.equal(board[1].reps, 10);
  assert.equal(
    (await request('/me/workouts', 'POST', { sessions: [log], xp: 999999 }, a.token)).status,
    400,
  );
  assert.equal(
    (await request('/me/workouts', 'POST', { sessions: [log] }, 'invalid-token')).status,
    401,
  );
});
test('community data and tokens survive restart and failing persistent writes roll back', async (t) => {
  let persisted;
  let failing = false;
  const storage = {
    read: async () => persisted,
    write: async (value) => {
      if (failing) throw new Error('Storage unavailable');
      persisted = structuredClone(value);
    },
  };
  const { request, server, dataFile } = await fixture(t, storage);
  const account = (await request('/auth/register', 'POST', registration('saved_user'))).value;
  failing = true;
  assert.equal(
    (
      await request(
        '/me/workouts',
        'POST',
        { sessions: [workout('saved-workout-1')] },
        account.token,
      )
    ).status,
    500,
  );
  failing = false;
  assert.equal((await request('/me', 'GET', undefined, account.token)).value.user.xp, 0);
  await server.close();
  const replacement = createGroupServer({ dataFile, storage });
  const { url } = await replacement.start();
  t.after(() => replacement.close());
  const response = await fetch(url + '/v1/me', {
    headers: { Authorization: `Bearer ${account.token}` },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.username, 'saved_user');
});
