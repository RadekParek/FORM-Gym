'use strict';
const {
  randomBytes,
  randomUUID,
  createHash,
  scrypt: derive,
  timingSafeEqual,
} = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(derive);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const sessionDays = 30 * 86400000;

function createCommunity({
  readStore,
  mutate,
  readBody,
  send,
  fail,
  object,
  text,
  number,
  sessionInput,
  sessionStats,
}) {
  let rules;
  let loading;
  let activeHashes = 0;
  const bad = (message) => fail(400, 'BAD_REQUEST', message);
  const username = (value) => {
    const clean = text(value, 'Username', 20).toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(clean)) bad('Use 3–20 letters, numbers or underscores.');
    return clean;
  };
  const password = (value) => {
    if (typeof value !== 'string' || value.length < 8 || value.length > 128)
      bad('Use an 8–128 character password.');
    return value;
  };
  const level = (value) => {
    if (!['foundation', 'standard', 'advanced'].includes(value)) bad('Invalid training level.');
    return value;
  };
  const avatar = (value) => {
    object(value, ['skin', 'hair', 'shirt'], ['skin', 'hair', 'shirt']);
    return {
      skin: number(value.skin, 'Skin', 0, 4, true),
      hair: number(value.hair, 'Hair', 0, 3, true),
      shirt: number(value.shirt, 'Shirt', 0, 3, true),
    };
  };
  async function hashPassword(value, salt) {
    if (activeHashes >= 8) fail(429, 'RATE_LIMIT', 'Try again shortly.');
    activeHashes += 1;
    try {
      return Buffer.from(await scrypt(value, salt, 64)).toString('hex');
    } finally {
      activeHashes -= 1;
    }
  }
  function authorize(request, store = readStore()) {
    const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(request.headers.authorization || '');
    const tokenHash = match && digest(match[1]);
    const user =
      tokenHash &&
      (store.accounts || []).find((account) =>
        account.tokens.some((token) => token.hash === tokenHash && token.expiresAt > Date.now()),
      );
    if (!user) fail(401, 'UNAUTHORIZED', 'Sign in again.');
    return user;
  }
  function publicUser(user) {
    const xp =
      user.sessions.reduce((sum, session) => sum + session.score, 0) +
      user.claims.reduce((sum, claim) => sum + rules.QUEST_XP[claim.tier], 0);
    const stats = rules.questMetrics(user.sessions);
    return {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      level: user.level,
      xp,
      reps: stats.reps,
      sets: stats.sets,
      sessionCount: user.sessions.length,
      rank: rules.publicRank(xp),
    };
  }
  function newToken(user, value) {
    user.tokens = user.tokens.filter((token) => token.expiresAt > Date.now()).slice(-4);
    user.tokens.push({ hash: digest(value), expiresAt: Date.now() + sessionDays });
  }
  return async function community(request, response, url) {
    if (!/^\/v1\/(auth|me|leaderboard)(\/|$)/.test(url.pathname)) return false;
    await (loading ||= import('../shared/progression.mjs').then((value) => {
      rules = value;
    }));
    if (request.method === 'POST' && url.pathname === '/v1/auth/register') {
      const body = object(
        await readBody(request),
        ['username', 'password', 'avatar', 'level'],
        ['username', 'password', 'avatar', 'level'],
      );
      const name = username(body.username);
      const salt = randomBytes(16).toString('hex');
      const passwordHash = await hashPassword(password(body.password), salt);
      const look = avatar(body.avatar);
      const trainingLevel = level(body.level);
      const token = secret();
      const recoveryKey = secret();
      const result = await mutate((store) => {
        store.accounts ||= [];
        if (store.accounts.some((user) => user.username === name))
          fail(409, 'USERNAME_TAKEN', 'Username is already used.');
        if (store.accounts.length >= 5000) fail(409, 'CAPACITY', 'Account capacity reached.');
        const user = {
          id: randomUUID(),
          username: name,
          salt,
          passwordHash,
          recoveryHash: digest(recoveryKey),
          avatar: look,
          level: trainingLevel,
          tokens: [],
          sessions: [],
          claims: [],
          visible: false,
        };
        newToken(user, token);
        store.accounts.push(user);
        return { changed: true, value: { user: publicUser(user), token, recoveryKey } };
      });
      send(response, 201, result);
      return true;
    }
    if (request.method === 'POST' && url.pathname === '/v1/auth/login') {
      const body = object(
        await readBody(request),
        ['username', 'password'],
        ['username', 'password'],
      );
      const name = username(body.username);
      const value = password(body.password);
      const found = (readStore().accounts || []).find((user) => user.username === name);
      const calculated = await hashPassword(value, found?.salt || 'unregistered-account');
      if (
        !found ||
        !timingSafeEqual(Buffer.from(calculated, 'hex'), Buffer.from(found.passwordHash, 'hex'))
      )
        fail(401, 'LOGIN_FAILED', 'Check your username and password.');
      const token = secret();
      const result = await mutate((store) => {
        const user = store.accounts.find((entry) => entry.id === found.id);
        // Recheck the hash inside the transaction if a reset raced this login.
        if (user.passwordHash !== found.passwordHash) fail(401, 'LOGIN_FAILED', 'Sign in again.');
        newToken(user, token);
        return { changed: true, value: { user: publicUser(user), token } };
      });
      send(response, 200, result);
      return true;
    }
    if (request.method === 'POST' && url.pathname === '/v1/auth/reset') {
      const body = object(
        await readBody(request),
        ['username', 'recoveryKey', 'password'],
        ['username', 'recoveryKey', 'password'],
      );
      const name = username(body.username);
      const recoveryHash = digest(text(body.recoveryKey, 'Recovery key', 128));
      const salt = randomBytes(16).toString('hex');
      const passwordHash = await hashPassword(password(body.password), salt);
      const token = secret();
      const recoveryKey = secret();
      const result = await mutate((store) => {
        const user = (store.accounts || []).find(
          (entry) => entry.username === name && entry.recoveryHash === recoveryHash,
        );
        if (!user) fail(401, 'RECOVERY_FAILED', 'Check your recovery key.');
        Object.assign(user, { salt, passwordHash, recoveryHash: digest(recoveryKey), tokens: [] });
        newToken(user, token);
        return { changed: true, value: { user: publicUser(user), token, recoveryKey } };
      });
      send(response, 200, result);
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/v1/leaderboard') {
      const users = (readStore().accounts || [])
        .filter((user) => user.visible)
        .map(publicUser)
        .sort((a, b) => b.xp - a.xp || a.username.localeCompare(b.username));
      send(response, 200, { users: users.slice(0, 100), updatedAt: new Date().toISOString() });
      return true;
    }
    if (url.pathname === '/v1/me') {
      if (request.method === 'GET') {
        send(response, 200, { user: publicUser(authorize(request)) });
        return true;
      }
      if (request.method === 'DELETE') {
        const result = await mutate((store) => {
          const user = authorize(request, store);
          const tokenHash = digest(request.headers.authorization.slice(7));
          user.tokens = user.tokens.filter((token) => token.hash !== tokenHash);
          return { changed: true, value: { ok: true } };
        });
        send(response, 200, result);
        return true;
      }
      if (request.method === 'PUT') {
        const body = object(await readBody(request), ['avatar', 'level'], ['avatar', 'level']);
        const look = avatar(body.avatar);
        const trainingLevel = level(body.level);
        const result = await mutate((store) => {
          const user = authorize(request, store);
          user.avatar = look;
          user.level = trainingLevel;
          return { changed: true, value: { user: publicUser(user) } };
        });
        send(response, 200, result);
        return true;
      }
    }
    if (request.method === 'POST' && url.pathname === '/v1/me/workouts') {
      authorize(request);
      const body = object(await readBody(request), ['sessions', 'claims'], ['sessions']);
      if (
        !Array.isArray(body.sessions) ||
        body.sessions.length > 25 ||
        !Array.isArray(body.claims || []) ||
        (body.claims || []).length > 100
      )
        bad('Invalid workout batch.');
      const inputs = body.sessions.map(sessionInput);
      const claims = (body.claims || []).map((claim) => {
        object(claim, ['date', 'tier', 'level'], ['date', 'tier', 'level']);
        if (
          typeof claim.date !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(claim.date) ||
          !Number.isFinite(Date.parse(claim.date)) ||
          new Date(claim.date).toISOString().slice(0, 10) !== claim.date ||
          !Object.hasOwn(rules.QUEST_XP, claim.tier)
        )
          bad('Invalid quest claim.');
        return { date: claim.date, tier: claim.tier, level: level(claim.level) };
      });
      const result = await mutate((store) => {
        const user = authorize(request, store);
        for (const input of inputs.sort((a, b) => a.date.localeCompare(b.date))) {
          if (input.date > new Date(Date.now() + 86400000).toISOString().slice(0, 10))
            bad('Future workouts cannot be shared.');
          if (user.sessions.some((session) => session.clientId === input.clientId)) continue;
          if (user.sessions.length >= 5000) fail(409, 'CAPACITY', 'Workout capacity reached.');
          user.sessions.push({ ...input, ...sessionStats(input, user.sessions) });
        }
        for (const claim of claims) {
          if (user.claims.some((entry) => entry.date === claim.date && entry.tier === claim.tier))
            continue;
          const quest = rules
            .dailyQuests(claim.date, claim.level)
            .find((entry) => entry.tier === claim.tier);
          if (rules.questValue(quest, rules.questMetrics(user.sessions, claim.date)) < quest.target)
            bad('This quest has not been completed in shared workouts.');
          user.claims.push(claim);
        }
        user.visible = true;
        return { changed: true, value: { user: publicUser(user) } };
      });
      send(response, 200, result);
      return true;
    }
    fail(404, 'NOT_FOUND', 'Endpoint not found.');
  };
}
module.exports = { createCommunity };
