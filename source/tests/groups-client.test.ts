import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  connectGroup,
  fetchGroupState,
  mutateGroup,
  normalizeEndpoint,
  sharedSessionInput,
} from '../src/groups';
import type { Session } from '../src/model';

const require = createRequire(import.meta.url);
const { createGroupServer } = require('../electron/groups-server.cjs');
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!();
});

describe('group client privacy and transport', () => {
  it('shares only completed sets and preserves timed quantities without private session notes', () => {
    const session: Session = {
      id: 'local-session',
      date: '2026-11-18',
      title: 'Private workout title',
      duration: 1200,
      xp: 600,
      note: 'Private medical and training note',
      exercises: [
        {
          id: 'b',
          exerciseId: 'bench-press',
          sets: [
            { done: true, reps: 8, weight: 40 },
            { done: false, reps: 8, weight: 40 },
          ],
        },
        { id: 'p', exerciseId: 'plank', sets: [{ done: true, reps: 30, weight: 90 }] },
        { id: 'c', exerciseId: 'cycle', sets: [{ done: true, reps: 10, weight: 90 }] },
      ],
    };
    const shared = sharedSessionInput(session, 'en');
    expect(shared).not.toHaveProperty('note');
    expect(shared).not.toHaveProperty('title');
    expect(shared).not.toHaveProperty('xp');
    expect(shared.exercises[0].sets).toEqual([{ reps: 8, loadKg: 40 }]);
    expect(shared.exercises[1].sets).toEqual([{ reps: 0, loadKg: 0, seconds: 30 }]);
    expect(shared.exercises[2].sets).toEqual([{ reps: 0, loadKg: 0, seconds: 600 }]);
    expect(JSON.stringify(shared)).not.toContain('Private');
  });

  it('accepts encrypted servers and local HTTP but rejects public cleartext and URL credentials', () => {
    expect(normalizeEndpoint(' https://gym.example.com/community/ ')).toBe(
      'https://gym.example.com/community',
    );
    for (const value of [
      'http://localhost:47831',
      'http://127.0.0.1:47831',
      'http://192.168.1.5:47831',
      'http://10.0.0.5',
      'http://172.16.2.1',
      'http://[::1]:47831',
    ])
      expect(normalizeEndpoint(value)).toBe(value);
    for (const value of [
      'http://gym.example.com',
      'http://172.32.1.1',
      'https://name:password@gym.example.com',
      'https://gym.example.com?token=secret',
      'https://gym.example.com#token',
      'file:///private',
    ])
      expect(() => normalizeEndpoint(value)).toThrow();
  });

  it('reads the actual server contract and receives computed scores after an explicit submission', async () => {
    const parent = path.resolve('test-results');
    await mkdir(parent, { recursive: true });
    const directory = await mkdtemp(path.join(parent, 'group-client-'));
    const server = createGroupServer({
      dataFile: path.join(directory, 'groups.json'),
      host: '127.0.0.1',
      port: 0,
    });
    cleanup.push(async () => {
      await server.close();
      await rm(directory, { recursive: true, force: true });
    });
    const { url } = await server.start();
    const { connection } = await connectGroup(url, 'create', {
      name: 'Real test group',
      displayName: 'Coach',
      inviteCode: '',
      deviceId: crypto.randomUUID(),
    });
    const initial = await fetchGroupState(connection);
    expect(initial?.members[0].score).toBe(0);
    expect(initial?.members[0].completedSets).toBe(0);
    expect(await fetchGroupState(connection, initial!.revision)).toBeNull();
    await mutateGroup(connection, '/sessions', {
      clientId: 'completed-session',
      date: '2026-11-18',
      durationMinutes: 20,
      exercises: [
        { exerciseId: 'bench-press', name: 'Bench press', sets: [{ reps: 8, loadKg: 40 }] },
      ],
    });
    const updated = await fetchGroupState(connection);
    expect(updated?.sessions[0].completedSets).toBe(1);
    expect(updated?.sessions[0].volumeKg).toBe(320);
    expect(updated?.members[0].score).toBe(112);
    expect(updated?.members[0].sessionCount).toBe(1);
  });
});
