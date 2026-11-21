import { groupRequest, normalizeEndpoint, loadGroupStore } from './groups';
import type { Avatar, AppData } from './model';
import type { QuestLevel, PublicRank } from '../shared/progression.mjs';
import { sharedSessionInput } from './groups';
import { questLevel } from './quests';

export interface CommunityUser {
  id: string;
  username: string;
  avatar: Avatar;
  level: QuestLevel;
  xp: number;
  reps: number;
  sets: number;
  sessionCount: number;
  rank: PublicRank;
}
export interface CommunityStore {
  endpoint: string;
  token?: string;
  user?: CommunityUser;
  leaderboard?: CommunityUser[];
  updatedAt?: string;
  publishedIds?: string[];
  publishedClaims?: string[];
}
const key = 'form-community-v1';
export function loadCommunity(): CommunityStore {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    if (value && typeof value.endpoint === 'string') {
      if (value.user) validateUser(value.user);
      if (value.leaderboard && (!Array.isArray(value.leaderboard) || value.leaderboard.length > 100)) throw new Error('Invalid cache');
      if (value.leaderboard) value.leaderboard.forEach(validateUser);
      return { ...value, endpoint: normalizeEndpoint(value.endpoint) };
    }
  } catch {
    /* Reconnecting replaces only this connection, never personal training data. */
  }
  return { endpoint: import.meta.env.VITE_FORM_SERVER_URL || '' };
}
export function saveCommunity(store: CommunityStore) {
  localStorage.setItem(key, JSON.stringify(store));
}
export function communityEndpoint(): string {
  const account = loadCommunity();
  if (account.endpoint) return account.endpoint;
  const groups = loadGroupStore();
  return (
    groups.connections.find((connection) => connection.endpoint !== 'local://device')?.endpoint ||
    ''
  );
}
function validateUser(user: CommunityUser): CommunityUser {
  if (
    !user ||
    typeof user.id !== 'string' ||
    !/^[a-z0-9_]{3,20}$/.test(user.username) ||
    ![user.xp, user.reps, user.sets, user.sessionCount].every(
      (value) => Number.isFinite(value) && value >= 0,
    ) ||
    !user.avatar ||
    !user.rank ||
    typeof user.rank.color !== 'string' ||
    !/^#[a-fA-F0-9]{6}$/.test(user.rank.color) ||
    ![user.avatar.skin,user.avatar.hair,user.avatar.shirt].every((value) => Number.isInteger(value) && value >= 0) ||
    user.avatar.skin > 4 || user.avatar.hair > 3 || user.avatar.shirt > 3
  )
    throw new Error('Invalid community response');
  return user;
}
export async function signIn(
  endpoint: string,
  mode: 'register' | 'login' | 'reset',
  username: string,
  password: string,
  data: AppData,
  recoveryKey?: string,
) {
  const result = await groupRequest<{ user: CommunityUser; token: string; recoveryKey?: string }>(
    endpoint,
    `/auth/${mode}`,
    {
      method: 'POST',
      body: {
        username,
        password,
        ...(mode === 'register'
          ? {
              avatar: data.profile?.avatar || { skin: 1, hair: 0, shirt: 0 },
              level: questLevel(data),
            }
          : {}),
        ...(mode === 'reset' ? { recoveryKey } : {}),
      },
    },
  );
  if (typeof result.token !== 'string') throw new Error('Invalid account response');
  return {
    store: {
      endpoint: normalizeEndpoint(endpoint),
      token: result.token,
      user: validateUser(result.user),
    } as CommunityStore,
    recoveryKey: result.recoveryKey,
  };
}
export async function refreshCommunity(
  store: CommunityStore,
  signal?: AbortSignal,
): Promise<CommunityStore> {
  const board = await groupRequest<{ users: CommunityUser[]; updatedAt: string }>(
    store.endpoint,
    '/leaderboard',
    { signal },
  );
  if (
    !Array.isArray(board.users) ||
    board.users.length > 100 ||
    typeof board.updatedAt !== 'string'
  )
    throw new Error('Invalid leaderboard');
  let user = store.user;
  if (store.token)
    user = validateUser(
      (
        await groupRequest<{ user: CommunityUser }>(store.endpoint, '/me', {
          token: store.token,
          signal,
        })
      ).user,
    );
  return { ...store, user, leaderboard: board.users.map(validateUser), updatedAt: board.updatedAt };
}
export async function publishWorkouts(
  store: CommunityStore,
  data: AppData,
): Promise<CommunityStore> {
  if (!store.token) throw new Error('Sign in first');
  const completed = data.sessions.filter((session) =>
    session.exercises.some((exercise) => exercise.sets.some((set) => set.done && set.reps > 0)),
  );
  const pending = completed
    .filter((session) => !store.publishedIds?.includes(session.id))
    .sort((a, b) => a.date.localeCompare(b.date));
  let next = {
    ...store,
    publishedIds: [...(store.publishedIds || [])],
    publishedClaims: [...(store.publishedClaims || [])],
  };
  for (let index = 0; index < pending.length; index += 10) {
    const chunk = pending.slice(index, index + 10);
    const result = await groupRequest<{ user: CommunityUser }>(store.endpoint, '/me/workouts', {
      method: 'POST',
      token: store.token,
      body: {
        sessions: chunk.map((session) => sharedSessionInput(session, data.settings.language)),
      },
    });
    next = {
      ...next,
      user: validateUser(result.user),
      publishedIds: [...next.publishedIds, ...chunk.map((session) => session.id)],
    };
    saveCommunity(next);
  }
  const claims = (data.questClaims || []).filter(
    (claim) => !next.publishedClaims.includes(`${claim.date}:${claim.tier}`),
  );
  for (let index = 0; index < claims.length; index += 50) {
    const chunk = claims.slice(index, index + 50);
    const result = await groupRequest<{ user: CommunityUser }>(store.endpoint, '/me/workouts', {
      method: 'POST',
      token: store.token,
      body: { sessions: [], claims: chunk },
    });
    next = {
      ...next,
      user: validateUser(result.user),
      publishedClaims: [
        ...next.publishedClaims,
        ...chunk.map((claim) => `${claim.date}:${claim.tier}`),
      ],
    };
    saveCommunity(next);
  }
  return refreshCommunity(next);
}
