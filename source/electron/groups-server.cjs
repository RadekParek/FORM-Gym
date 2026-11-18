'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, randomUUID, createHash } = require('node:crypto');

const MAX_BODY = 128 * 1024;
const LIMITS = { groups: 100, members: 100, assignments: 365, sessions: 2000, messages: 1000 };
const hash = (value) => createHash('sha256').update(value).digest('hex');
const secret = (size = 32) => randomBytes(size).toString('base64url');

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, code, message) => {
  throw new ApiError(status, code, message);
};
const bad = (message) => fail(400, 'BAD_REQUEST', message);

function object(value, fields, required = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad('Expected an object.');
  if (Object.keys(value).some((key) => !fields.includes(key))) bad('Unsupported field.');
  if (required.some((key) => !Object.hasOwn(value, key))) bad('Missing required field.');
  return value;
}
function text(value, label, max, optional = false) {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string') bad(`${label} must be text.`);
  const clean = value.trim();
  if (
    (!optional && !clean) ||
    clean.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(clean)
  )
    bad(`${label} is invalid or too long.`);
  return clean;
}
function number(value, label, min, max, integer = false) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    bad(`${label} is outside its allowed range.`);
  return value;
}
function identifier(value, label, optional = false) {
  if (optional && value === undefined) return undefined;
  const clean = text(value, label, 128);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(clean)) bad(`${label} is invalid.`);
  return clean;
}
function deviceIdentity(value) {
  const clean = identifier(value, 'Device identity');
  if (clean.length < 22) bad('Use a cryptographically random device identity.');
  return hash(clean);
}
function exerciseId(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))
    bad('Invalid exercise ID.');
  return value;
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    bad('Use a YYYY-MM-DD date.');
  const parsed = new Date(value + 'T12:00:00Z');
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value ||
    value < '1900-01-01' ||
    value > '2100-12-31'
  )
    bad('Invalid date.');
  return value;
}
function array(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    bad(`${label} has an invalid length.`);
  return value;
}
function assignmentInput(value) {
  object(
    value,
    ['clientId', 'title', 'date', 'memberIds', 'exercises', 'note'],
    ['title', 'date', 'memberIds', 'exercises'],
  );
  return {
    clientId: identifier(value.clientId, 'Client ID', true),
    title: text(value.title, 'Title', 100),
    date: date(value.date),
    memberIds: [
      ...new Set(
        array(value.memberIds, 'Members', 0, LIMITS.members).map((id) =>
          identifier(id, 'Member ID'),
        ),
      ),
    ],
    exercises: array(value.exercises, 'Exercises', 1, 30).map((entry) => {
      object(
        entry,
        ['exerciseId', 'name', 'sets', 'reps', 'loadKg', 'restSec', 'note'],
        ['name', 'sets', 'reps'],
      );
      return {
        exerciseId: exerciseId(entry.exerciseId),
        name: text(entry.name, 'Exercise name', 100),
        sets: number(entry.sets, 'Sets', 1, 50, true),
        reps: number(entry.reps, 'Reps', 1, 7200, true),
        loadKg: number(entry.loadKg === undefined ? 0 : entry.loadKg, 'Load', 0, 1000),
        restSec: number(entry.restSec === undefined ? 90 : entry.restSec, 'Rest', 0, 1800, true),
        note: text(entry.note, 'Exercise note', 1000, true),
      };
    }),
    note: text(value.note, 'Note', 4000, true),
  };
}
function sessionInput(value) {
  object(
    value,
    ['clientId', 'assignmentId', 'date', 'durationMinutes', 'exercises', 'note'],
    ['clientId', 'date', 'durationMinutes', 'exercises'],
  );
  const result = {
    clientId: identifier(value.clientId, 'Client ID'),
    assignmentId: identifier(value.assignmentId, 'Assignment ID', true),
    date: date(value.date),
    durationMinutes: number(value.durationMinutes, 'Duration', 0, 1440),
    exercises: array(value.exercises, 'Exercises', 1, 30).map((entry) => {
      object(entry, ['exerciseId', 'name', 'sets'], ['name', 'sets']);
      return {
        exerciseId: exerciseId(entry.exerciseId),
        name: text(entry.name, 'Exercise name', 100),
        sets: array(entry.sets, 'Sets', 1, 50).map((set) => {
          object(set, ['reps', 'loadKg', 'seconds'], ['reps']);
          const reps = number(set.reps, 'Reps', 0, 1000, true);
          const seconds =
            set.seconds === undefined ? undefined : number(set.seconds, 'Seconds', 1, 7200, true);
          if (!reps && !seconds) bad('Each submitted set needs reps or time.');
          return {
            reps,
            loadKg: number(set.loadKg === undefined ? 0 : set.loadKg, 'Load', 0, 1000),
            seconds,
          };
        }),
      };
    }),
    note: text(value.note, 'Note', 4000, true),
  };
  if (result.exercises.reduce((sum, entry) => sum + entry.sets.length, 0) > 300)
    bad('A session has too many sets.');
  return result;
}
function volume(exercise) {
  return exercise.sets.reduce((sum, set) => sum + (set.seconds ? 0 : set.reps * set.loadKg), 0);
}
function sessionStats(session, previous) {
  const completedSets = session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const volumeKg =
    Math.round(session.exercises.reduce((sum, exercise) => sum + volume(exercise), 0) * 100) / 100;
  const dailyScore = previous
    .filter((item) => item.date === session.date)
    .reduce((sum, item) => sum + item.score, 0);
  const improved = session.exercises.some((exercise) => {
    const key = exercise.exerciseId || exercise.name.toLowerCase();
    const earlier = previous
      .filter((item) => item.date < session.date)
      .flatMap((item) => item.exercises)
      .filter((item) => (item.exerciseId || item.name.toLowerCase()) === key);
    const best = Math.max(0, ...earlier.map(volume));
    return best > 0 && volume(exercise) > best;
  });
  const effort =
    80 +
    Math.min(completedSets, 35) * 12 +
    (session.durationMinutes >= 10 ? 20 : 0) +
    (improved ? 40 : 0);
  return { completedSets, volumeKg, score: Math.max(0, Math.min(effort, 600 - dailyScore)) };
}
function publicMember(member, sessions) {
  const own = sessions.filter((session) => session.memberId === member.id);
  return {
    id: member.id,
    displayName: member.displayName,
    role: member.role,
    joinedAt: member.joinedAt,
    score: own.reduce((sum, session) => sum + session.score, 0),
    sessionCount: own.length,
    trainingDays: new Set(own.map((session) => session.date)).size,
    completedSets: own.reduce((sum, session) => sum + session.completedSets, 0),
    volumeKg: Math.round(own.reduce((sum, session) => sum + session.volumeKg, 0) * 100) / 100,
  };
}
function snapshot(group, member) {
  return {
    group: { id: group.id, name: group.name, createdAt: group.createdAt },
    me: { id: member.id, displayName: member.displayName, role: member.role },
    members: group.members
      .map((entry) => publicMember(entry, group.sessions))
      .sort((a, b) => b.score - a.score || a.joinedAt.localeCompare(b.joinedAt)),
    assignments: [...group.assignments].sort(
      (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
    ),
    sessions: group.sessions,
    messages: group.messages,
    revision: group.revision,
    serverTime: new Date().toISOString(),
  };
}
function membership(store, groupId, tokenHash) {
  const group = store.groups.find((entry) => entry.id === groupId);
  if (!group) fail(404, 'NOT_FOUND', 'Group not found.');
  const member = group.members.find((entry) => entry.tokenHash === tokenHash);
  if (!member) fail(401, 'UNAUTHORIZED', 'A valid membership token is required.');
  return { group, member };
}
function leader(member) {
  if (member.role !== 'leader') fail(403, 'FORBIDDEN', 'Only the group leader can do this.');
}
function invitation(now) {
  const inviteCode = secret(18);
  const inviteExpiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  return {
    inviteCode,
    inviteExpiresAt,
    invite: { hash: hash(inviteCode), expiresAt: inviteExpiresAt },
  };
}
function duplicate(items, memberId, clientId) {
  return clientId
    ? items.find(
        (item) => item.clientId === clientId && (item.memberId || item.createdBy) === memberId,
      )
    : undefined;
}
function capacity(items, maximum, label) {
  if (items.length >= maximum) fail(409, 'LIMIT_REACHED', `${label} limit reached.`);
}

async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || ''))
    fail(415, 'CONTENT_TYPE', 'Use application/json.');
  const declared = Number(request.headers['content-length']);
  if (declared > MAX_BODY) fail(413, 'BODY_TOO_LARGE', 'Request body is too large.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) fail(413, 'BODY_TOO_LARGE', 'Request body is too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    bad('Invalid JSON.');
  }
}
async function persist(dataFile, store) {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  const temporary = dataFile + '.' + randomUUID() + '.tmp';
  try {
    const file = await fs.open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(store), 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await fs.rename(temporary, dataFile);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}
function validateStore(store) {
  if (
    !store ||
    store.version !== 1 ||
    !Array.isArray(store.groups) ||
    store.groups.length > LIMITS.groups
  )
    throw new Error('The group store is invalid. Preserve it and restore a valid backup.');
  for (const group of store.groups) {
    if (
      !group.id ||
      !Number.isSafeInteger(group.revision) ||
      !Array.isArray(group.members) ||
      !Array.isArray(group.assignments) ||
      !Array.isArray(group.sessions) ||
      !Array.isArray(group.messages) ||
      group.members.filter((member) => member.role === 'leader').length !== 1
    )
      throw new Error('The group store is invalid. Preserve it and restore a valid backup.');
  }
}

// Constructing the service never opens a socket. The app must call start after its host action.
function createGroupServer({ dataFile, host = '127.0.0.1', port = 0, allowedOrigins = [] } = {}) {
  if (typeof dataFile !== 'string' || !dataFile)
    throw new Error('A separate group data file is required.');
  if (typeof host !== 'string' || !host || !Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('Invalid host or port.');
  if (!Array.isArray(allowedOrigins) || allowedOrigins.some((origin) => typeof origin !== 'string'))
    throw new Error('Invalid allowed origins.');
  const resolvedFile = path.resolve(dataFile);
  const origins = new Set(allowedOrigins);
  const rates = new Map();
  let store = { version: 1, groups: [] };
  let queue = Promise.resolve();
  let server;
  let starting;
  let closing = false;

  function mutate(operation) {
    const task = queue
      .catch(() => {})
      .then(async () => {
        const next = structuredClone(store);
        const result = operation(next);
        if (!result.changed) return result.value;
        await persist(resolvedFile, next);
        store = next;
        return result.value;
      });
    queue = task;
    return task;
  }
  function rate(request, restricted) {
    const now = Date.now();
    const key = request.socket.remoteAddress + (restricted ? ':join' : ':all');
    let entry = rates.get(key);
    if (!entry || now - entry.since >= 60_000) entry = { since: now, count: 0 };
    entry.count += 1;
    rates.set(key, entry);
    if (rates.size > 10_000) {
      for (const [ip, item] of rates) if (now - item.since >= 60_000) rates.delete(ip);
      if (rates.size > 10_000) rates.delete(rates.keys().next().value);
    }
    if (entry.count > (restricted ? 30 : 240))
      fail(429, 'RATE_LIMIT', 'Too many requests. Try again in a minute.');
  }
  function send(response, status, value) {
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(JSON.stringify(value));
  }
  async function dispatch(request, response) {
    const origin = request.headers.origin;
    if (origin) {
      if (!origins.has(origin)) fail(403, 'ORIGIN_NOT_ALLOWED', 'This app origin is not allowed.');
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
      });
      response.end();
      return;
    }
    const url = new URL(request.url, 'http://localhost');
    const route = url.pathname.split('/').filter(Boolean);
    rate(
      request,
      request.method === 'POST' && (url.pathname === '/v1/groups' || url.pathname === '/v1/join'),
    );
    if (request.method === 'GET' && url.pathname === '/v1/health') {
      send(response, 200, { ok: true, service: 'form-groups', version: 1 });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/v1/groups') {
      const body = object(
        await readBody(request),
        ['name', 'displayName', 'deviceId'],
        ['name', 'displayName', 'deviceId'],
      );
      const name = text(body.name, 'Group name', 80);
      const displayName = text(body.displayName, 'Display name', 50);
      const deviceHash = deviceIdentity(body.deviceId);
      const token = secret();
      const invite = invitation(Date.now());
      const value = await mutate((next) => {
        capacity(next.groups, LIMITS.groups, 'Group');
        const now = new Date().toISOString();
        const memberId = randomUUID();
        const groupId = randomUUID();
        next.groups.push({
          id: groupId,
          name,
          createdAt: now,
          updatedAt: now,
          revision: 1,
          invite: invite.invite,
          members: [
            {
              id: memberId,
              displayName,
              role: 'leader',
              joinedAt: now,
              deviceHash,
              tokenHash: hash(token),
            },
          ],
          assignments: [],
          sessions: [],
          messages: [],
        });
        return {
          changed: true,
          value: {
            groupId,
            memberId,
            token,
            inviteCode: invite.inviteCode,
            inviteExpiresAt: invite.inviteExpiresAt,
          },
        };
      });
      send(response, 201, value);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/v1/join') {
      const body = object(
        await readBody(request),
        ['inviteCode', 'displayName', 'deviceId'],
        ['inviteCode', 'displayName', 'deviceId'],
      );
      const inviteHash = hash(identifier(body.inviteCode, 'Invitation'));
      const displayName = text(body.displayName, 'Display name', 50);
      const deviceHash = deviceIdentity(body.deviceId);
      const token = secret();
      const value = await mutate((next) => {
        const group = next.groups.find(
          (entry) =>
            entry.invite.hash === inviteHash && Date.parse(entry.invite.expiresAt) > Date.now(),
        );
        if (!group) fail(404, 'INVALID_INVITE', 'Invitation is invalid or expired.');
        let member = group.members.find((entry) => entry.deviceHash === deviceHash);
        if (!member) {
          capacity(group.members, LIMITS.members, 'Member');
          member = {
            id: randomUUID(),
            displayName,
            role: 'member',
            joinedAt: new Date().toISOString(),
            deviceHash,
            tokenHash: '',
          };
          group.members.push(member);
        }
        member.displayName = displayName;
        member.tokenHash = hash(token);
        group.revision += 1;
        return { changed: true, value: { groupId: group.id, memberId: member.id, token } };
      });
      send(response, 200, value);
      return;
    }
    if (route[0] !== 'v1' || route[1] !== 'groups' || !route[2])
      fail(404, 'NOT_FOUND', 'Endpoint not found.');
    const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(request.headers.authorization || '');
    if (!match) fail(401, 'UNAUTHORIZED', 'A valid membership token is required.');
    const tokenHash = hash(match[1]);
    const groupId = route[2];
    await queue.catch(() => {});
    const current = membership(store, groupId, tokenHash);
    if (request.method === 'GET' && route.length === 4 && route[3] === 'state') {
      const after = url.searchParams.get('after');
      if (after !== null && !/^\d{1,12}$/.test(after)) bad('Invalid revision.');
      send(
        response,
        200,
        after !== null && Number(after) === current.group.revision
          ? {
              unchanged: true,
              revision: current.group.revision,
              serverTime: new Date().toISOString(),
            }
          : snapshot(current.group, current.member),
      );
      return;
    }
    const body = ['POST', 'PUT'].includes(request.method) ? await readBody(request) : undefined;
    const value = await mutate((next) => {
      const { group, member } = membership(next, groupId, tokenHash);
      const now = new Date(Math.max(Date.now(), Date.parse(group.updatedAt) + 1)).toISOString();
      const changed = (value) => {
        group.updatedAt = now;
        group.revision += 1;
        return { changed: true, value: { ...value, revision: group.revision } };
      };
      if (request.method === 'POST' && route.length === 4 && route[3] === 'invite') {
        leader(member);
        object(body, []);
        const invite = invitation(Date.now());
        group.invite = invite.invite;
        return changed({ inviteCode: invite.inviteCode, inviteExpiresAt: invite.inviteExpiresAt });
      }
      if (request.method === 'POST' && route.length === 4 && route[3] === 'assignments') {
        leader(member);
        const input = assignmentInput(body);
        const existing = duplicate(group.assignments, member.id, input.clientId);
        if (existing)
          return { changed: false, value: { assignment: existing, revision: group.revision } };
        if (input.memberIds.some((id) => !group.members.some((entry) => entry.id === id)))
          bad('Unknown assignment member.');
        capacity(group.assignments, LIMITS.assignments, 'Assignment');
        const assignment = { id: randomUUID(), ...input, createdBy: member.id, createdAt: now };
        group.assignments.push(assignment);
        return changed({ assignment });
      }
      if (request.method === 'DELETE' && route.length === 5 && route[3] === 'assignments') {
        leader(member);
        const index = group.assignments.findIndex((entry) => entry.id === route[4]);
        if (index < 0) fail(404, 'NOT_FOUND', 'Assignment not found.');
        group.assignments.splice(index, 1);
        return changed({ ok: true });
      }
      if (request.method === 'POST' && route.length === 4 && route[3] === 'sessions') {
        const input = sessionInput(body);
        const existing = duplicate(group.sessions, member.id, input.clientId);
        if (existing)
          return { changed: false, value: { session: existing, revision: group.revision } };
        if (input.assignmentId) {
          const assignment = group.assignments.find((entry) => entry.id === input.assignmentId);
          if (
            !assignment ||
            (assignment.memberIds.length && !assignment.memberIds.includes(member.id))
          )
            bad('This assignment is not available to you.');
        }
        // A device may already be on tomorrow's calendar day in another timezone.
        if (input.date > new Date(Date.now() + 86_400_000).toISOString().slice(0, 10))
          bad('The completed session date is too far in the future.');
        capacity(group.sessions, LIMITS.sessions, 'Session');
        const session = {
          id: randomUUID(),
          ...input,
          memberId: member.id,
          createdAt: now,
          review: null,
          ...sessionStats(
            input,
            group.sessions.filter((entry) => entry.memberId === member.id),
          ),
        };
        group.sessions.push(session);
        return changed({ session });
      }
      if (
        request.method === 'PUT' &&
        route.length === 6 &&
        route[3] === 'sessions' &&
        route[5] === 'review'
      ) {
        leader(member);
        object(body, ['grade', 'comment'], ['grade']);
        const grade = number(body.grade, 'Grade', 1, 5, true);
        const comment = text(body.comment, 'Comment', 2000, true);
        const session = group.sessions.find((entry) => entry.id === route[4]);
        if (!session) fail(404, 'NOT_FOUND', 'Session not found.');
        session.review = { grade, comment, leaderId: member.id, updatedAt: now };
        return changed({ review: session.review });
      }
      if (request.method === 'POST' && route.length === 4 && route[3] === 'messages') {
        object(body, ['clientId', 'text'], ['clientId', 'text']);
        const clientId = identifier(body.clientId, 'Client ID');
        const messageText = text(body.text, 'Message', 2000);
        const existing = duplicate(group.messages, member.id, clientId);
        if (existing)
          return { changed: false, value: { message: existing, revision: group.revision } };
        const message = {
          id: randomUUID(),
          clientId,
          memberId: member.id,
          text: messageText,
          createdAt: now,
        };
        group.messages.push(message);
        if (group.messages.length > LIMITS.messages) group.messages.shift();
        return changed({ message });
      }
      fail(404, 'NOT_FOUND', 'Endpoint not found.');
    });
    send(response, 200, value);
  }
  async function start() {
    if (closing) throw new Error('This group server has been closed.');
    if (starting) return starting;
    starting = (async () => {
      try {
        store = JSON.parse(await fs.readFile(resolvedFile, 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      validateStore(store);
      server = http.createServer((request, response) => {
        dispatch(request, response).catch((error) => {
          if (!response.headersSent)
            send(response, error instanceof ApiError ? error.status : 500, {
              error: {
                code: error instanceof ApiError ? error.code : 'INTERNAL',
                message:
                  error instanceof ApiError
                    ? error.message
                    : 'The group request could not be saved.',
              },
            });
          else response.end();
        });
      });
      server.requestTimeout = 15_000;
      server.headersTimeout = 10_000;
      server.keepAliveTimeout = 5_000;
      server.maxHeadersCount = 32;
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      const address = server.address();
      return {
        host,
        port: address.port,
        url: `http://${host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host.includes(':') ? '[' + host + ']' : host}:${address.port}`,
      };
    })();
    try {
      return await starting;
    } catch (error) {
      starting = undefined;
      server = undefined;
      throw error;
    }
  }
  async function close() {
    closing = true;
    await starting?.catch(() => {});
    if (server?.listening) {
      const stopped = new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      server.closeIdleConnections();
      await stopped;
    }
    await queue.catch(() => {});
    rates.clear();
  }
  return { start, close };
}

module.exports = { createGroupServer };
