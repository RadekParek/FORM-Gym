import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createInitialData, getProgress, parseBackup } from '../src/engine';
import { EXERCISES, type AppData, type Session } from '../src/model';
import { claimQuest, dailyQuests, questLevel, questMetrics } from '../src/quests';
import { exerciseGuide } from '../src/exerciseGuides';
import { localGroupRequest } from '../src/localGroups';
import { NOTE_DRAFT_KEY, recoverNoteDrafts } from '../src/noteDrafts';
import { inviteLink, parseGroupInvite } from '../src/groups';

const completed: Session = {
  id: 'completed-session',
  date: '2026-11-21',
  title: 'Training',
  duration: 600,
  note: '',
  xp: 124,
  exercises: [
    {
      id: 'exercise',
      exerciseId: 'bodyweight-squat',
      sets: [
        { reps: 15, weight: 0, done: true },
        { reps: 15, weight: 0, done: true },
      ],
    },
  ],
};
function athlete(): AppData {
  return {
    ...createInitialData(),
    profile: {
      name: 'Alex',
      username: 'alex_1',
      avatar: { skin: 1, hair: 0, shirt: 0 },
      age: 30,
      weight: 75,
      height: 175,
      experience: 0,
      goal: 'fitness',
      daysPerWeek: 3,
      conditions: [],
    },
    sessions: [structuredClone(completed)],
  };
}
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  });
});
describe('daily progression and compatible saves', () => {
  it('offers three repeatable targets with distinct rewards and a gentle starting level', () => {
    expect(dailyQuests('2026-11-21').map((quest) => [quest.tier, quest.xp])).toEqual([
      ['easy', 40],
      ['medium', 90],
      ['hard', 180],
    ]);
    expect(dailyQuests('2026-11-21', 'advanced')).toEqual(dailyQuests('2026-11-21', 'advanced'));
    const data = athlete();
    data.profile!.conditions = ['hirschsprung'];
    expect(questLevel(data)).toBe('foundation');
    expect(dailyQuests('2026-11-21', questLevel(data))[2].target).toBe(4);
  });
  it('requires actual completed sets and awards each daily claim only once', () => {
    const data = athlete();
    const claimed = claimQuest(data, '2026-11-21', 'easy');
    expect(getProgress(claimed).xp).toBe(164);
    expect(claimQuest(claimed, '2026-11-21', 'easy')).toBe(claimed);
    expect(claimQuest(data, '2026-11-22', 'easy')).toBe(data);
    data.sessions[0].exercises[0].sets.forEach((set) => (set.done = false));
    expect(claimQuest(data, '2026-11-21', 'easy')).toBe(data);
  });
  it('does not count timed activity or unfinished sets as repetitions', () => {
    const metrics = questMetrics(
      [
        {
          ...completed,
          exercises: [
            { exerciseId: 'plank', sets: [{ reps: 60, done: true }] },
            {
              exerciseId: 'push-up',
              sets: [
                { reps: 10, done: false },
                { reps: 5, done: true },
              ],
            },
          ],
        },
      ],
      '2026-11-21',
    );
    expect(metrics.reps).toBe(5);
    expect(metrics.sets).toBe(2);
  });
  it('preserves older data and validates new character and quest fields', () => {
    const data = athlete();
    delete data.questClaims;
    delete data.favorites;
    delete data.profile!.username;
    delete data.profile!.avatar;
    expect(parseBackup(JSON.stringify(data)).sessions).toEqual(data.sessions);
    const next = claimQuest(athlete(), '2026-11-21', 'easy');
    next.favorites = ['pull-up'];
    expect(parseBackup(JSON.stringify(next)).questClaims).toEqual(next.questClaims);
    next.questClaims!.push(next.questClaims![0]);
    expect(() => parseBackup(JSON.stringify(next))).toThrow('Duplicate quest');
    const invalid = athlete();
    invalid.profile!.avatar!.skin = 50;
    expect(() => parseBackup(JSON.stringify(invalid))).toThrow('Skin');
  });
  it('includes a movement and muscle guide for every exercise', () => {
    for (const exercise of EXERCISES) {
      const guide = exerciseGuide(exercise);
      expect(guide.cues).toHaveLength(3);
      expect(guide.primary.length).toBeGreaterThan(0);
    }
  });
});
describe('notes recovery and mobile groups', () => {
  it('recovers the last typing draft without replacing a newer saved note', () => {
    const data = athlete();
    const note = {
      id: 'note-1',
      title: 'Plan',
      body: 'Original',
      pinned: false,
      updatedAt: '2026-11-21T12:00:00.000Z',
    };
    data.notes = [note];
    localStorage.setItem(
      NOTE_DRAFT_KEY,
      JSON.stringify({
        'note-1': {
          ...note,
          body: 'Recovered last words',
          updatedAt: '2026-11-21T12:01:00.000Z',
          category: 'training',
        },
      }),
    );
    expect(recoverNoteDrafts(data).notes[0].body).toBe('Recovered last words');
    data.notes[0] = { ...note, body: 'Newer saved words', updatedAt: '2026-11-21T12:02:00.000Z' };
    expect(recoverNoteDrafts(data).notes[0].body).toBe('Newer saved words');
    localStorage.setItem(NOTE_DRAFT_KEY, JSON.stringify({ 'note-1': { ...note, body: 123 } }));
    expect(recoverNoteDrafts(data).notes[0].body).toBe('Newer saved words');
  });
  it('creates and persists a local leader group without a network request', () => {
    const created = localGroupRequest('/groups', 'POST', {
      name: 'Phone group',
      displayName: 'Alex',
    }) as { groupId: string; token: string };
    const path = `/groups/${created.groupId}`;
    localGroupRequest(
      `${path}/messages`,
      'POST',
      { clientId: 'message-1', text: 'Tomorrow: mobility' },
      created.token,
    );
    const state = localGroupRequest(`${path}/state`, 'GET', undefined, created.token) as any;
    expect(state.me.role).toBe('leader');
    expect(state.messages[0].text).toBe('Tomorrow: mobility');
    expect(() => localGroupRequest(`${path}/state`, 'GET', undefined, 'wrong-token')).toThrow(
      'unavailable',
    );
    expect(() => localGroupRequest(`${path}/invite`, 'POST', {}, created.token)).toThrow(
      'Unsupported',
    );
  });
  it('parses invitations into a secure address and preserves HTTPS path prefixes', () => {
    const link = inviteLink('https://example.org/form', 'abcdefghijk');
    expect(parseGroupInvite(link)).toEqual({
      endpoint: 'https://example.org/form',
      code: 'abcdefghijk',
    });
    expect(parseGroupInvite('abcdefghijk')).toBeNull();
    expect(() => parseGroupInvite('http://public.example/invite?code=abcdefghijk')).toThrow();
  });
});
