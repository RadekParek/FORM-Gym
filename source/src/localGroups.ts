import type { GroupState, GroupAssignment, SharedSession } from './groups';
import { questMetrics } from '../shared/progression.mjs';

export const LOCAL_ENDPOINT = 'local://device';
const key = 'form-local-groups-v1';
interface LocalGroup {
  token: string;
  state: GroupState;
}
const error = (message: string) => {
  throw Object.assign(new Error(message), { code: 'storage' });
};
function read(): LocalGroup[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (
      Array.isArray(value) &&
      value.length <= 100 &&
      value.every(
        (entry) =>
          entry.state?.group?.id &&
          Array.isArray(entry.state.members) &&
          Array.isArray(entry.state.assignments) &&
          Array.isArray(entry.state.messages) &&
          Array.isArray(entry.state.sessions) &&
          typeof entry.token === 'string',
      )
    )
      return value;
  } catch {
    /* Preserve the original file until it is recovered. */
  }
  return error('Invalid local group data');
}
function save(groups: LocalGroup[]) {
  localStorage.setItem(key, JSON.stringify(groups));
}
function recalculate(state: GroupState) {
  const own = state.sessions;
  const metrics = questMetrics(own);
  state.members[0] = {
    ...state.members[0],
    score: own.reduce((sum, session) => sum + session.score, 0),
    sessionCount: own.length,
    completedSets: metrics.sets,
    completedReps: metrics.reps,
    trainingDays: new Set(own.map((session) => session.date)).size,
    volumeKg: own.reduce((sum, session) => sum + session.volumeKg, 0),
  };
}
export function localGroupRequest(
  route: string,
  method: string,
  body: unknown,
  token?: string,
): unknown {
  const groups = read();
  const input = body as Record<string, any>;
  const now = new Date().toISOString();
  if (route === '/groups' && method === 'POST') {
    if (
      groups.length >= 100 ||
      typeof input?.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 80 ||
      typeof input.displayName !== 'string' ||
      !input.displayName.trim() ||
      input.displayName.length > 50
    )
      return error('Invalid local group');
    const groupId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    const value = crypto.randomUUID() + crypto.randomUUID();
    const state: GroupState = {
      group: { id: groupId, name: input.name.trim(), createdAt: now },
      me: { id: memberId, displayName: input.displayName.trim(), role: 'leader' },
      members: [
        {
          id: memberId,
          displayName: input.displayName.trim(),
          role: 'leader',
          joinedAt: now,
          score: 0,
          sessionCount: 0,
          trainingDays: 0,
          completedSets: 0,
          completedReps: 0,
          volumeKg: 0,
        },
      ],
      assignments: [],
      sessions: [],
      messages: [],
      revision: 1,
      serverTime: now,
    };
    groups.push({ token: value, state });
    save(groups);
    return { groupId, memberId, token: value };
  }
  const parts = route.split('?')[0].split('/').filter(Boolean);
  const group = groups.find((entry) => entry.state.group.id === parts[1] && entry.token === token);
  if (!group) return error('Local group unavailable');
  const state = group.state;
  if (parts[2] === 'state' && method === 'GET') return state;
  let result: unknown;
  if (parts[2] === 'messages' && method === 'POST') {
    if (
      typeof input?.text !== 'string' ||
      !input.text.trim() ||
      input.text.length > 2000 ||
      typeof input.clientId !== 'string'
    )
      return error('Invalid journal entry');
    const existing = state.messages.find((message) => message.clientId === input.clientId);
    const message = existing || {
      id: crypto.randomUUID(),
      clientId: input.clientId,
      text: input.text.trim(),
      memberId: state.me.id,
      createdAt: now,
    };
    if (!existing) state.messages.push(message);
    state.messages = state.messages.slice(-1000);
    result = { message };
  } else if (parts[2] === 'assignments' && method === 'POST') {
    if (
      !input?.title ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
      !Array.isArray(input.exercises) ||
      !input.exercises.length ||
      input.exercises.length > 30 ||
      !Array.isArray(input.memberIds) ||
      input.memberIds.some((id: string) => id !== state.me.id) ||
      state.assignments.length >= 365
    )
      return error('Invalid assignment');
    const existing = state.assignments.find((entry) => entry.clientId === input.clientId);
    const assignment =
      existing ||
      ({
        ...input,
        id: crypto.randomUUID(),
        createdBy: state.me.id,
        createdAt: now,
      } as GroupAssignment);
    if (!existing) state.assignments.push(assignment);
    result = { assignment };
  } else if (parts[2] === 'assignments' && method === 'DELETE') {
    state.assignments = state.assignments.filter((assignment) => assignment.id !== parts[3]);
    result = { ok: true };
  } else if (parts[2] === 'sessions' && method === 'POST') {
    if (
      !input?.clientId ||
      !Array.isArray(input.exercises) ||
      !input.exercises.length ||
      input.exercises.length > 30 ||
      state.sessions.length >= 2000
    )
      return error('Invalid workout');
    const existing = state.sessions.find((session) => session.clientId === input.clientId);
    const count = input.exercises.reduce(
      (sum: number, exercise: any) => sum + exercise.sets.length,
      0,
    );
    if (!count || count > 300) return error('Invalid set count');
    const volume = input.exercises.reduce(
      (sum: number, exercise: any) =>
        sum +
        exercise.sets.reduce(
          (value: number, set: any) => value + (set.seconds ? 0 : set.reps * (set.loadKg || 0)),
          0,
        ),
      0,
    );
    const already = state.sessions
      .filter((session) => session.date === input.date)
      .reduce((sum, session) => sum + session.score, 0);
    const session =
      existing ||
      ({
        ...input,
        id: crypto.randomUUID(),
        memberId: state.me.id,
        note: input.note || '',
        createdAt: now,
        volumeKg: volume,
        completedSets: count,
        score: Math.max(
          0,
          Math.min(
            600 - already,
            80 + Math.min(count, 35) * 12 + (input.durationMinutes >= 10 ? 20 : 0),
          ),
        ),
        review: null,
      } as SharedSession);
    if (!existing) state.sessions.push(session);
    recalculate(state);
    result = { session };
  } else if (parts[2] === 'sessions' && parts[4] === 'review' && method === 'PUT') {
    const session = state.sessions.find((entry) => entry.id === parts[3]);
    if (
      !session ||
      !Number.isInteger(input.grade) ||
      input.grade < 1 ||
      input.grade > 5 ||
      typeof input.comment !== 'string' ||
      input.comment.length > 2000
    )
      return error('Invalid review');
    session.review = {
      grade: input.grade,
      comment: input.comment,
      leaderId: state.me.id,
      updatedAt: now,
    };
    result = { review: session.review };
  } else return error('Unsupported local action');
  state.revision += 1;
  state.serverTime = now;
  save(groups);
  return { ...(result as object), revision: state.revision };
}
