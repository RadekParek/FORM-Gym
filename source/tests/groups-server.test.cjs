'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createGroupServer } = require('../electron/groups-server.cjs');

async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'form-groups-test-'));
  const dataFile = path.join(directory, 'groups.json');
  const service = createGroupServer({ dataFile, ...options });
  t.after(async () => {
    await service.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const { url } = await service.start();
  async function request(route, method = 'GET', body, token, headers = {}) {
    const response = await fetch(url + route, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      data: response.status === 204 ? null : await response.json(),
    };
  }
  const create = (displayName = 'Coach') =>
    request('/v1/groups', 'POST', { name: 'Tuesday team', displayName, deviceId: randomUUID() });
  return { service, dataFile, directory, request, create, url };
}
const sharedSession = (extra = {}) => ({
  clientId: randomUUID(),
  date: '2026-01-10',
  durationMinutes: 20,
  exercises: [
    {
      exerciseId: 'goblet-squat',
      name: 'Goblet squat',
      sets: [
        { reps: 10, loadKg: 20 },
        { reps: 8, loadKg: 20 },
      ],
    },
  ],
  ...extra,
});
const assignment = (memberIds = [], extra = {}) => ({
  clientId: randomUUID(),
  title: 'Strength session',
  date: '2026-01-10',
  memberIds,
  exercises: [
    {
      exerciseId: 'goblet-squat',
      name: 'Goblet squat',
      sets: 3,
      reps: 10,
      loadKg: 20,
      restSec: 90,
    },
  ],
  ...extra,
});
async function join(f, group, deviceId = randomUUID(), displayName = 'Member') {
  const joined = await f.request('/v1/join', 'POST', {
    inviteCode: group.inviteCode,
    deviceId,
    displayName,
  });
  assert.equal(joined.status, 200);
  return joined.data;
}

test('construction is inert; creation and invitation establish authoritative membership', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'form-groups-inert-'));
  const dataFile = path.join(directory, 'groups.json');
  const service = createGroupServer({ dataFile });
  assert.deepEqual(Object.keys(service), ['start', 'close']);
  await assert.rejects(fs.stat(dataFile), { code: 'ENOENT' });
  await service.close();
  await assert.rejects(service.start(), /closed/);
  await fs.rm(directory, { recursive: true, force: true });

  const f = await fixture(t);
  const created = await f.create();
  assert.equal(created.status, 201);
  const group = created.data;
  const member = await join(f, group);
  const state = await f.request(
    `/v1/groups/${group.groupId}/state`,
    'GET',
    undefined,
    member.token,
  );
  assert.equal(state.status, 200);
  assert.equal(state.data.me.role, 'member');
  assert.equal(state.data.members.filter((entry) => entry.role === 'leader').length, 1);
  assert.equal(state.data.members.length, 2);
  assert.equal(
    state.data.members.every((entry) => entry.score === 0),
    true,
  );
  const serialized = JSON.stringify(state.data);
  for (const forbidden of [
    'tokenHash',
    'deviceHash',
    'inviteCode',
    'conditions',
    'weight',
    'height',
    'age',
  ])
    assert.equal(serialized.includes(`"${forbidden}"`), false);
  const disk = await fs.readFile(f.dataFile, 'utf8');
  assert.equal(disk.includes(group.token), false);
  assert.equal(disk.includes(member.token), false);
  assert.equal(disk.includes(group.inviteCode), false);
  assert.equal((await f.request(`/v1/groups/${group.groupId}/state`)).status, 401);
  const other = (await f.create('Another coach')).data;
  assert.equal(
    (await f.request(`/v1/groups/${other.groupId}/state`, 'GET', undefined, member.token)).status,
    401,
  );
});

test('repeat join reuses the member, rotates token, and cannot select a role', async (t) => {
  const f = await fixture(t);
  const group = (await f.create()).data;
  const deviceId = randomUUID();
  const first = await join(f, group, deviceId);
  const second = await join(f, group, deviceId, 'Renamed member');
  assert.equal(second.memberId, first.memberId);
  assert.notEqual(second.token, first.token);
  assert.equal(
    (await f.request(`/v1/groups/${group.groupId}/state`, 'GET', undefined, first.token)).status,
    401,
  );
  const state = (
    await f.request(`/v1/groups/${group.groupId}/state`, 'GET', undefined, second.token)
  ).data;
  assert.equal(state.members.length, 2);
  assert.equal(state.me.displayName, 'Renamed member');
  assert.equal(state.me.role, 'member');
  assert.equal(
    (
      await f.request('/v1/join', 'POST', {
        inviteCode: group.inviteCode,
        deviceId: randomUUID(),
        displayName: 'Intruder',
        role: 'leader',
      })
    ).status,
    400,
  );
  assert.equal(
    (await f.request(`/v1/groups/${group.groupId}/invite`, 'POST', {}, second.token)).status,
    403,
  );
  const rotated = await f.request(`/v1/groups/${group.groupId}/invite`, 'POST', {}, group.token);
  assert.equal(rotated.status, 200);
  assert.equal(
    (
      await f.request('/v1/join', 'POST', {
        inviteCode: group.inviteCode,
        deviceId: randomUUID(),
        displayName: 'Late member',
      })
    ).status,
    404,
  );
});

test('leader assigns plans; members submit sessions; only leader can grade', async (t) => {
  const f = await fixture(t);
  const group = (await f.create()).data;
  const member = await join(f, group);
  const outsider = await join(f, group, randomUUID(), 'Other member');
  const base = `/v1/groups/${group.groupId}`;
  assert.equal(
    (await f.request(base + '/assignments', 'POST', assignment(), member.token)).status,
    403,
  );
  const input = assignment([member.memberId]);
  const assigned = await f.request(base + '/assignments', 'POST', input, group.token);
  assert.equal(assigned.status, 200);
  const repeated = await f.request(base + '/assignments', 'POST', input, group.token);
  assert.equal(repeated.data.assignment.id, assigned.data.assignment.id);
  assert.equal(repeated.data.revision, assigned.data.revision);
  const submittedInput = sharedSession({ assignmentId: assigned.data.assignment.id });
  assert.equal(
    (await f.request(base + '/sessions', 'POST', submittedInput, outsider.token)).status,
    400,
  );
  const submitted = await f.request(base + '/sessions', 'POST', submittedInput, member.token);
  assert.equal(submitted.status, 200);
  assert.equal(submitted.data.session.memberId, member.memberId);
  assert.equal(submitted.data.session.completedSets, 2);
  assert.equal(submitted.data.session.volumeKg, 360);
  assert.equal(submitted.data.session.score, 124);
  const repeatedSession = await f.request(base + '/sessions', 'POST', submittedInput, member.token);
  assert.equal(repeatedSession.data.session.id, submitted.data.session.id);
  assert.equal(repeatedSession.data.revision, submitted.data.revision);
  const reviewRoute = base + `/sessions/${submitted.data.session.id}/review`;
  assert.equal((await f.request(reviewRoute, 'PUT', { grade: 5 }, member.token)).status, 403);
  const reviewed = await f.request(
    reviewRoute,
    'PUT',
    { grade: 4, comment: 'Good control.' },
    group.token,
  );
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.data.review.leaderId, group.memberId);
  const state = (await f.request(base + '/state', 'GET', undefined, group.token)).data;
  assert.equal(state.sessions[0].review.comment, 'Good control.');
  assert.equal(state.members.find((entry) => entry.id === member.memberId).score, 124);
  assert.equal(
    (
      await f.request(
        base + `/assignments/${assigned.data.assignment.id}`,
        'DELETE',
        undefined,
        member.token,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request(
        base + `/assignments/${assigned.data.assignment.id}`,
        'DELETE',
        undefined,
        group.token,
      )
    ).status,
    200,
  );
});

test('chat is chronological, concurrent saves retain every message, and retries do not duplicate', async (t) => {
  const f = await fixture(t);
  const group = (await f.create()).data;
  const member = await join(f, group);
  const base = `/v1/groups/${group.groupId}`;
  const messages = Array.from({ length: 12 }, (_, index) => ({
    clientId: randomUUID(),
    text: `Message ${index}`,
  }));
  const results = await Promise.all(
    messages.map((body) => f.request(base + '/messages', 'POST', body, member.token)),
  );
  assert.equal(
    results.every((result) => result.status === 200),
    true,
  );
  const repeated = await Promise.all(
    Array.from({ length: 5 }, () =>
      f.request(base + '/messages', 'POST', messages[3], member.token),
    ),
  );
  assert.equal(
    repeated.every((result) => result.data.message.id === results[3].data.message.id),
    true,
  );
  const state = (await f.request(base + '/state', 'GET', undefined, member.token)).data;
  assert.equal(state.messages.length, 12);
  assert.equal(new Set(state.messages.map((message) => message.id)).size, 12);
  assert.equal(
    state.messages.every((message) => message.memberId === member.memberId),
    true,
  );
  for (let i = 1; i < state.messages.length; i++)
    assert.ok(state.messages[i].createdAt > state.messages[i - 1].createdAt);
  const poll = (
    await f.request(base + `/state?after=${state.revision}`, 'GET', undefined, member.token)
  ).data;
  assert.equal(poll.unchanged, true);
  assert.equal(poll.messages, undefined);
  const stored = JSON.parse(await fs.readFile(f.dataFile, 'utf8'));
  assert.equal(stored.groups[0].messages.length, 12);
  assert.equal(
    (await fs.readdir(f.directory)).some((name) => name.endsWith('.tmp')),
    false,
  );
});

test('session scores use reported work, cap daily points, and exclude timed-set volume', async (t) => {
  const f = await fixture(t);
  const group = (await f.create()).data;
  const base = `/v1/groups/${group.groupId}`;
  for (let i = 0; i < 10; i++)
    assert.equal(
      (await f.request(base + '/sessions', 'POST', sharedSession(), group.token)).status,
      200,
    );
  const timed = await f.request(
    base + '/sessions',
    'POST',
    sharedSession({
      date: '2026-01-11',
      exercises: [
        { exerciseId: 'plank', name: 'Plank', sets: [{ reps: 0, loadKg: 500, seconds: 60 }] },
      ],
    }),
    group.token,
  );
  assert.equal(timed.data.session.volumeKg, 0);
  assert.equal(timed.data.session.completedSets, 1);
  const improved = await f.request(
    base + '/sessions',
    'POST',
    sharedSession({
      date: '2026-01-12',
      exercises: [
        { exerciseId: 'goblet-squat', name: 'Goblet squat', sets: [{ reps: 20, loadKg: 40 }] },
      ],
    }),
    group.token,
  );
  assert.equal(improved.data.session.score, 152);
  const state = (await f.request(base + '/state', 'GET', undefined, group.token)).data;
  assert.equal(
    state.sessions
      .filter((session) => session.date === '2026-01-10')
      .reduce((sum, session) => sum + session.score, 0),
    600,
  );
  assert.equal(state.members[0].trainingDays, 3);
  assert.equal(state.members[0].score, 864);
});

test('strict request validation prevents author/score spoofing and profile disclosure', async (t) => {
  const f = await fixture(t, { allowedOrigins: ['gym://app'] });
  const group = (await f.create()).data;
  const base = `/v1/groups/${group.groupId}`;
  const invalidSessions = [
    sharedSession({ xp: 50000 }),
    sharedSession({ memberId: randomUUID() }),
    sharedSession({ conditions: ['asthma'] }),
    sharedSession({ date: '2026-02-30' }),
    sharedSession({ date: '2100-01-01' }),
    sharedSession({ durationMinutes: -1 }),
    sharedSession({ exercises: [{ exerciseId: '../plank', name: 'Plank', sets: [{ reps: 1 }] }] }),
    sharedSession({ exercises: [{ name: 'Squat', sets: [{ reps: 0 }] }] }),
    sharedSession({ exercises: [{ name: 'Squat', sets: [{ reps: 1, loadKg: null }] }] }),
  ];
  for (const body of invalidSessions)
    assert.equal((await f.request(base + '/sessions', 'POST', body, group.token)).status, 400);
  assert.equal(
    (
      await f.request(
        base + '/messages',
        'POST',
        { clientId: randomUUID(), text: 'Hello', memberId: 'spoofed' },
        group.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.request('/v1/groups', 'POST', {
        name: 'Group',
        displayName: 'Coach',
        deviceId: randomUUID(),
        weight: 80,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.request(
        base + '/messages',
        'POST',
        { clientId: randomUUID(), text: 'x'.repeat(2001) },
        group.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.request(base + '/state', 'GET', undefined, group.token, {
        Origin: 'https://untrusted.example',
      })
    ).status,
    403,
  );
  const allowed = await fetch(f.url + base + '/state', {
    headers: { Origin: 'gym://app', Authorization: `Bearer ${group.token}` },
  });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'gym://app');
  assert.equal(
    (await f.request(base + '/state?after=NaN', 'GET', undefined, group.token)).status,
    400,
  );
});

test('malformed/oversized requests and invitation flooding are limited', async (t) => {
  const f = await fixture(t);
  const malformed = await fetch(f.url + '/v1/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{broken',
  });
  assert.equal(malformed.status, 400);
  const oversized = await fetch(f.url + '/v1/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'x'.repeat(128 * 1024) }),
  });
  assert.equal(oversized.status, 413);
  const wrongType = await fetch(f.url + '/v1/groups', { method: 'POST', body: '{}' });
  assert.equal(wrongType.status, 415);
  let last;
  for (let i = 0; i < 30; i++)
    last = await f.request('/v1/join', 'POST', {
      inviteCode: 'not-a-valid-invitation',
      displayName: 'Member',
      deviceId: randomUUID(),
    });
  assert.equal(last.status, 429);
  assert.equal((await f.request('/v1/health')).status, 200);
});

test('restart preserves tokens and group data; corrupt stores are preserved', async (t) => {
  const f = await fixture(t);
  const group = (await f.create()).data;
  const member = await join(f, group);
  await f.request(
    `/v1/groups/${group.groupId}/messages`,
    'POST',
    { clientId: randomUUID(), text: 'Still here after restart.' },
    member.token,
  );
  await f.service.close();
  const restarted = createGroupServer({ dataFile: f.dataFile });
  t.after(() => restarted.close());
  const { url } = await restarted.start();
  const response = await fetch(url + `/v1/groups/${group.groupId}/state`, {
    headers: { Authorization: `Bearer ${member.token}` },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).messages[0].text, 'Still here after restart.');
  await restarted.close();
  await fs.writeFile(f.dataFile, '{broken', 'utf8');
  const broken = createGroupServer({ dataFile: f.dataFile });
  await assert.rejects(broken.start());
  await broken.close();
  assert.equal(await fs.readFile(f.dataFile, 'utf8'), '{broken');
});

test('a failed disk write rolls back the mutation and a later retry can succeed', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'form-groups-rollback-'));
  const blocked = path.join(directory, 'store');
  const dataFile = path.join(blocked, 'groups.json');
  const service = createGroupServer({ dataFile });
  t.after(async () => {
    await service.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const { url } = await service.start();
  const body = { name: 'Team', displayName: 'Coach', deviceId: randomUUID() };
  await fs.writeFile(blocked, 'a file blocks the store directory');
  const failed = await fetch(url + '/v1/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(failed.status, 500);
  await fs.unlink(blocked);
  const retried = await fetch(url + '/v1/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(retried.status, 201);
  assert.equal(JSON.parse(await fs.readFile(dataFile, 'utf8')).groups.length, 1);
});
