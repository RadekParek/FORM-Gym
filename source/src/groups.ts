import { EXERCISES, type DayPlan, type Session } from './model';
import { exerciseText } from './i18n';
import type { Language } from './model';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

declare global {
  interface Window {
    gymGroups?: { host(): Promise<GroupHostResult> };
  }
}

export type GroupRole = 'leader' | 'member';
export interface GroupMember {
  id: string;
  displayName: string;
  role: GroupRole;
  joinedAt: string;
  score: number;
  sessionCount: number;
  trainingDays: number;
  completedSets: number;
  volumeKg: number;
}
export interface AssignedExercise {
  exerciseId?: string;
  name: string;
  sets: number;
  reps: number;
  loadKg?: number;
  restSec?: number;
  note?: string;
}
export interface GroupAssignment {
  id: string;
  clientId?: string;
  title: string;
  date: string;
  memberIds: string[];
  exercises: AssignedExercise[];
  note: string;
  createdBy: string;
  createdAt: string;
}
export interface SharedExercise {
  exerciseId?: string;
  name: string;
  sets: { reps: number; loadKg?: number; seconds?: number }[];
}
export interface SharedSession {
  id: string;
  clientId: string;
  memberId: string;
  assignmentId?: string;
  date: string;
  durationMinutes: number;
  exercises: SharedExercise[];
  note: string;
  createdAt: string;
  volumeKg: number;
  completedSets: number;
  score: number;
  review: null | { grade: number; comment: string; leaderId: string; updatedAt: string };
}
export interface GroupMessage {
  id: string;
  clientId: string;
  memberId: string;
  text: string;
  createdAt: string;
}
export interface GroupState {
  group: { id: string; name: string; createdAt: string };
  me: { id: string; displayName: string; role: GroupRole };
  members: GroupMember[];
  assignments: GroupAssignment[];
  sessions: SharedSession[];
  messages: GroupMessage[];
  revision: number;
  serverTime: string;
}
export interface GroupConnection {
  endpoint: string;
  groupId: string;
  memberId: string;
  token: string;
  name: string;
  cached?: GroupState;
  lastUpdated?: string;
}
export interface GroupStore {
  deviceId: string;
  connections: GroupConnection[];
  activeKey: string | null;
}
export interface GroupHostResult {
  endpoint: string;
  endpoints?: string[];
  port?: number;
}
interface Membership {
  groupId: string;
  memberId: string;
  token: string;
  inviteCode?: string;
  inviteExpiresAt?: string;
}
export interface Invite {
  inviteCode: string;
  inviteExpiresAt: string;
}
export interface SharedSessionInput {
  clientId: string;
  assignmentId?: string;
  date: string;
  durationMinutes: number;
  exercises: SharedExercise[];
  note?: string;
}

const storeKey = 'form-gym-groups-v1';
const timedExercises = new Set(['plank', 'walk', 'cycle', 'rower']);
export const connectionKey = (connection: Pick<GroupConnection, 'endpoint' | 'groupId'>) =>
  `${connection.endpoint}|${connection.groupId}`;

export class GroupApiError extends Error {
  constructor(
    public code: string,
    public status = 0,
  ) {
    super('Group request failed');
    this.name = 'GroupApiError';
  }
}

export function normalizeEndpoint(value: string): string {
  try {
    const url = new URL(value.trim());
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
    const hostname = url.hostname.toLowerCase();
    const octets = hostname.split('.').map(Number);
    const privateIpv4 =
      octets.length === 4 &&
      octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
      (octets[0] === 10 ||
        octets[0] === 127 ||
        (octets[0] === 192 && octets[1] === 168) ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 169 && octets[1] === 254));
    if (
      url.protocol === 'http:' &&
      hostname !== 'localhost' &&
      hostname !== '[::1]' &&
      !hostname.endsWith('.local') &&
      !privateIpv4
    )
      throw new Error();
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    throw new GroupApiError('endpoint');
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === 'string';
const number = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const role = (value: unknown): value is GroupRole => value === 'leader' || value === 'member';

function isState(value: unknown): value is GroupState {
  if (!record(value) || !record(value.group) || !record(value.me)) return false;
  if (
    !string(value.group.id) ||
    !string(value.group.name) ||
    !string(value.group.createdAt) ||
    !string(value.me.id) ||
    !string(value.me.displayName) ||
    !role(value.me.role) ||
    !number(value.revision) ||
    !string(value.serverTime)
  )
    return false;
  if (
    !Array.isArray(value.members) ||
    value.members.length > 100 ||
    !value.members.every(
      (member) =>
        record(member) &&
        string(member.id) &&
        string(member.displayName) &&
        role(member.role) &&
        string(member.joinedAt) &&
        ['score', 'sessionCount', 'trainingDays', 'completedSets', 'volumeKg'].every((key) =>
          number(member[key]),
        ),
    )
  )
    return false;
  if (
    !Array.isArray(value.assignments) ||
    value.assignments.length > 365 ||
    !value.assignments.every(
      (item) =>
        record(item) &&
        string(item.id) &&
        string(item.title) &&
        string(item.date) &&
        string(item.note) &&
        string(item.createdBy) &&
        string(item.createdAt) &&
        Array.isArray(item.memberIds) &&
        item.memberIds.every(string) &&
        Array.isArray(item.exercises) &&
        item.exercises.every(
          (exercise) =>
            record(exercise) &&
            string(exercise.name) &&
            number(exercise.sets) &&
            number(exercise.reps),
        ),
    )
  )
    return false;
  if (
    !Array.isArray(value.sessions) ||
    value.sessions.length > 2000 ||
    !value.sessions.every(
      (item) =>
        record(item) &&
        string(item.id) &&
        string(item.clientId) &&
        string(item.memberId) &&
        string(item.date) &&
        string(item.note) &&
        string(item.createdAt) &&
        number(item.durationMinutes) &&
        number(item.volumeKg) &&
        number(item.completedSets) &&
        number(item.score) &&
        Array.isArray(item.exercises) &&
        item.exercises.every(
          (exercise) =>
            record(exercise) &&
            string(exercise.name) &&
            Array.isArray(exercise.sets) &&
            exercise.sets.every((set) => record(set) && number(set.reps)),
        ) &&
        (item.review === null ||
          (record(item.review) &&
            number(item.review.grade) &&
            string(item.review.comment) &&
            string(item.review.leaderId) &&
            string(item.review.updatedAt))),
    )
  )
    return false;
  return (
    Array.isArray(value.messages) &&
    value.messages.length <= 1000 &&
    value.messages.every(
      (item) =>
        record(item) &&
        string(item.id) &&
        string(item.clientId) &&
        string(item.memberId) &&
        string(item.text) &&
        string(item.createdAt),
    )
  );
}

export function loadGroupStore(): GroupStore {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storeKey) || 'null');
    if (
      record(raw) &&
      string(raw.deviceId) &&
      /^[a-f0-9-]{36}$/i.test(raw.deviceId) &&
      Array.isArray(raw.connections)
    ) {
      const connections = raw.connections
        .filter((value): value is Record<string, unknown> => record(value))
        .flatMap((value) => {
          try {
            if (
              ![value.groupId, value.memberId, value.token, value.name].every(string) ||
              String(value.token).length > 512
            )
              return [];
            return [
              {
                endpoint: normalizeEndpoint(String(value.endpoint)),
                groupId: value.groupId as string,
                memberId: value.memberId as string,
                token: value.token as string,
                name: value.name as string,
                cached: isState(value.cached) ? value.cached : undefined,
                lastUpdated: string(value.lastUpdated) ? value.lastUpdated : undefined,
              },
            ];
          } catch {
            return [];
          }
        })
        .slice(0, 20);
      return {
        deviceId: raw.deviceId,
        connections,
        activeKey: string(raw.activeKey) ? raw.activeKey : null,
      };
    }
  } catch {
    /* A damaged group cache must not affect personal training data. */
  }
  return { deviceId: crypto.randomUUID(), connections: [], activeKey: null };
}

export function saveGroupStore(store: GroupStore): void {
  // Credentials remain local and are deliberately excluded from AppData backups and exports.
  try {
    localStorage.setItem(storeKey, JSON.stringify(store));
  } catch {
    throw new GroupApiError('storage');
  }
}

export async function groupRequest<T>(
  endpoint: string,
  route: string,
  options: {
    token?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 12000);
  try {
    const url = `${normalizeEndpoint(endpoint)}/v1${route}`;
    const method = options.method || 'GET';
    const headers = {
      Accept: 'application/json',
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    };
    let status: number;
    let text: string;
    if (Capacitor.isNativePlatform()) {
      if (controller.signal.aborted) throw new GroupApiError('network');
      const response = await CapacitorHttp.request({
        url,
        method,
        headers,
        data: options.body,
        connectTimeout: 12000,
        readTimeout: 12000,
        disableRedirects: true,
        responseType: 'json',
      });
      if (controller.signal.aborted) throw new GroupApiError('network');
      status = response.status;
      text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    } else {
      const response = await fetch(url, {
        method: options.method || 'GET',
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      status = response.status;
      text = await response.text();
    }
    if (text.length > 6_000_000) throw new GroupApiError('response');
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new GroupApiError('response', status);
    }
    if (status < 200 || status >= 300) {
      const code =
        record(value) && record(value.error) && string(value.error.code)
          ? value.error.code
          : 'server';
      throw new GroupApiError(code, status);
    }
    return value as T;
  } catch (error) {
    if (error instanceof GroupApiError) throw error;
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw new GroupApiError('network');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

export async function connectGroup(
  endpoint: string,
  mode: 'create' | 'join',
  input: {
    name: string;
    displayName: string;
    inviteCode: string;
    deviceId: string;
  },
  signal?: AbortSignal,
): Promise<{ connection: GroupConnection; invite?: Invite }> {
  const result = await groupRequest<Membership>(endpoint, mode === 'create' ? '/groups' : '/join', {
    method: 'POST',
    body:
      mode === 'create'
        ? {
            name: input.name.trim(),
            displayName: input.displayName.trim(),
            deviceId: input.deviceId,
          }
        : {
            inviteCode: input.inviteCode.trim(),
            displayName: input.displayName.trim(),
            deviceId: input.deviceId,
          },
    signal,
  });
  if (!record(result) || ![result.groupId, result.memberId, result.token].every(string))
    throw new GroupApiError('response');
  return {
    connection: {
      endpoint: normalizeEndpoint(endpoint),
      groupId: result.groupId,
      memberId: result.memberId,
      token: result.token,
      name: mode === 'create' ? input.name.trim() : result.groupId,
    },
    invite:
      result.inviteCode && result.inviteExpiresAt
        ? { inviteCode: result.inviteCode, inviteExpiresAt: result.inviteExpiresAt }
        : undefined,
  };
}

export async function fetchGroupState(
  connection: GroupConnection,
  revision?: number,
  signal?: AbortSignal,
): Promise<GroupState | null> {
  const result = await groupRequest<unknown>(
    connection.endpoint,
    `/groups/${encodeURIComponent(connection.groupId)}/state${revision === undefined ? '' : `?after=${revision}`}`,
    { token: connection.token, signal },
  );
  if (record(result) && result.unchanged === true && number(result.revision)) return null;
  if (
    !isState(result) ||
    result.group.id !== connection.groupId ||
    result.me.id !== connection.memberId
  )
    throw new GroupApiError('response');
  return result;
}

export async function mutateGroup<T>(
  connection: GroupConnection,
  route: string,
  body: unknown,
  method: 'POST' | 'PUT' | 'DELETE' = 'POST',
  signal?: AbortSignal,
): Promise<T> {
  return groupRequest<T>(
    connection.endpoint,
    `/groups/${encodeURIComponent(connection.groupId)}${route}`,
    { token: connection.token, method, body, signal },
  );
}

export function assignmentExercises(plan: DayPlan, language: Language): AssignedExercise[] {
  return plan.exercises.map((exercise) => {
    const known = EXERCISES.find((item) => item.id === exercise.exerciseId);
    return {
      exerciseId: exercise.exerciseId,
      name: known ? exerciseText(language, known).name : exercise.exerciseId,
      sets: exercise.sets,
      reps: exercise.reps,
      ...(timedExercises.has(exercise.exerciseId) ? {} : { loadKg: exercise.weight }),
      restSec: exercise.rest,
    };
  });
}

export function sharedSessionInput(
  session: Session,
  language: Language,
  assignmentId?: string,
): SharedSessionInput {
  return {
    clientId: session.id,
    ...(assignmentId ? { assignmentId } : {}),
    date: session.date,
    durationMinutes: Math.max(0, Math.round(session.duration / 60)),
    exercises: session.exercises.flatMap((exercise) => {
      const known = EXERCISES.find((item) => item.id === exercise.exerciseId);
      const sets = exercise.sets
        .filter((set) => set.done)
        .map((set) =>
          timedExercises.has(exercise.exerciseId)
            ? { reps: 0, loadKg: 0, seconds: set.reps * (exercise.exerciseId === 'plank' ? 1 : 60) }
            : { reps: set.reps, loadKg: set.weight },
        );
      return sets.length
        ? [
            {
              exerciseId: exercise.exerciseId,
              name: known ? exerciseText(language, known).name : exercise.exerciseId,
              sets,
            },
          ]
        : [];
    }),
  };
}
