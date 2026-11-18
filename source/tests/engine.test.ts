import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateSessionXp,
  createInitialData,
  createStarterPlans,
  getProgress,
  getSuggestions,
  isPremium,
  localDate,
  parseBackup,
  redeemPremium,
  validateProfile,
} from '../src/engine';
import { CONDITIONS, EXERCISES, type Profile, type Session } from '../src/model';

const profile: Profile = {
  name: 'Alex',
  age: 30,
  weight: 75,
  height: 175,
  experience: 2,
  goal: 'fitness',
  daysPerWeek: 3,
  conditions: [],
};
function session(overrides: Partial<Session> = {}): Session {
  return {
    id: crypto.randomUUID(),
    date: '2026-11-18',
    title: 'Full body A',
    duration: 1200,
    exercises: [
      {
        id: 'a',
        exerciseId: 'bench-press',
        sets: [
          { reps: 10, weight: 30, done: true },
          { reps: 10, weight: 30, done: true },
        ],
      },
    ],
    note: '',
    xp: 124,
    ...overrides,
  };
}

afterEach(() => vi.useRealTimers());

describe('profile and starter routines', () => {
  it('includes a broad exercise library and Hirschsprung disease as the final health consideration', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(35);
    expect(CONDITIONS.length).toBeGreaterThanOrEqual(12);
    expect(CONDITIONS.at(-1)?.id).toBe('hirschsprung');
  });
  it('rejects contradictory experience and non-finite measurements', () => {
    expect(validateProfile({ ...profile, age: 12, experience: 10 })).toBeTruthy();
    expect(validateProfile({ ...profile, weight: Infinity })).toBeTruthy();
    expect(validateProfile({ ...profile, age: 70, experience: 20 })).toBeNull();
  });
  it('allows an optional blank name but enforces its displayed length limit', () => {
    expect(validateProfile({ ...profile, name: '' })).toBeNull();
    expect(validateProfile({ ...profile, name: 'a'.repeat(41) })).toBeTruthy();
  });
  it('creates the selected number of training days without guessing a starting load', () => {
    const plans = createStarterPlans(profile);
    expect(Object.values(plans).filter((plan) => plan.exercises.length > 0)).toHaveLength(3);
    expect(
      Object.values(plans)
        .flatMap((plan) => plan.exercises)
        .every((exercise) => exercise.weight === 0),
    ).toBe(true);
    expect(Object.keys(plans)).toEqual(['0', '1', '2', '3', '4', '5', '6']);
  });
  it('uses manageable starting volume and no maximal testing for younger users', () => {
    const younger = { ...profile, age: 14, experience: 0 };
    expect(
      Object.values(createStarterPlans(younger))
        .flatMap((plan) => plan.exercises)
        .every((exercise) => exercise.sets === 2),
    ).toBe(true);
    expect(getSuggestions({ ...createInitialData(), profile: younger }).join(' ')).toContain(
      'skip maximal-lift testing',
    );
  });
  it('keeps Hirschsprung guidance within clinical review instead of prescribing treatment', () => {
    const advice = getSuggestions({
      ...createInitialData(),
      profile: { ...profile, conditions: ['hirschsprung'] },
    });
    expect(advice[0]).toContain('treating clinician');
    expect(advice[0]).toContain('cannot assess');
  });
});

describe('earned progression', () => {
  it('awards no XP for unchecked or zero-rep sets', () => {
    const empty = session({
      exercises: [
        {
          id: 'a',
          exerciseId: 'push-up',
          sets: [
            { reps: 10, weight: 0, done: false },
            { reps: 0, weight: 0, done: true },
          ],
        },
      ],
    });
    expect(calculateSessionXp(empty, [])).toBe(0);
  });
  it('limits daily XP even when sessions are split into many records', () => {
    const previous = [session({ xp: 590 })];
    expect(calculateSessionXp(session(), previous)).toBe(10);
    expect(calculateSessionXp(session(), [...previous, session({ xp: 10 })])).toBe(0);
  });
  it('awards a bounded improvement bonus only after a previous completed record', () => {
    const previous = session({ date: '2026-11-16' });
    const improved = session({
      exercises: [
        {
          id: 'a',
          exerciseId: 'bench-press',
          sets: [
            { reps: 12, weight: 30, done: true },
            { reps: 12, weight: 30, done: true },
          ],
        },
      ],
    });
    expect(calculateSessionXp(improved, [previous]) - calculateSessionXp(improved, [])).toBe(40);
    expect(calculateSessionXp(session(), [previous])).toBe(calculateSessionXp(session(), []));
  });
  it('computes volume from completed sets only and does not rank body measurements', () => {
    const data = { ...createInitialData(), profile, sessions: [session()] };
    expect(getProgress(data).totalVolume).toBe(600);
    expect(getProgress(data).totalSets).toBe(2);
    expect(
      getProgress({
        ...data,
        profile: { ...profile, weight: 150, height: 200 },
      }).rank,
    ).toEqual(getProgress(data).rank);
  });
  it('excludes timed exercises from lifted volume and strength improvement bonuses', () => {
    const timed = session({
      exercises: [
        {
          id: 'walk',
          exerciseId: 'walk',
          sets: [{ reps: 20, weight: 50, done: true }],
        },
      ],
    });
    const previous = session({
      date: '2026-11-17',
      exercises: [
        {
          id: 'walk',
          exerciseId: 'walk',
          sets: [{ reps: 10, weight: 50, done: true }],
        },
      ],
    });
    expect(getProgress({ ...createInitialData(), sessions: [timed] }).totalVolume).toBe(0);
    expect(calculateSessionXp(timed, [previous])).toBe(calculateSessionXp(timed, []));
  });
  it('counts local consecutive training days and tolerates an unfinished current day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 18, 10));
    const data = {
      ...createInitialData(),
      sessions: [session({ date: '2026-11-16' }), session({ date: '2026-11-17' })],
    };
    expect(getProgress(data).streak).toBe(2);
    data.sessions.push(session({ date: localDate() }));
    expect(getProgress(data).streak).toBe(3);
  });
  it('reveals the extended rank only with current premium access', () => {
    const sessions = Array.from({ length: 310 }, (_, index) =>
      session({ id: String(index), xp: 600 }),
    );
    const data = { ...createInitialData(), sessions };
    expect(getProgress(data).rank.name).toBe('Mr. Olympia');
    expect(getProgress({ ...data, premium: { lifetime: true, until: null } }).rank.name).toBe(
      'ROBO!',
    );
  });
});

describe('premium access', () => {
  it('expires at the exact timestamp and honours lifetime access', () => {
    const data = {
      ...createInitialData(),
      premium: { lifetime: false, until: '2026-11-18T12:00:00.000Z' },
    };
    expect(isPremium(data, new Date('2026-11-18T11:59:59Z'))).toBe(true);
    expect(isPremium(data, new Date('2026-11-18T12:00:00Z'))).toBe(false);
    expect(
      isPremium({ ...data, premium: { ...data.premium, lifetime: true } }, new Date('2036-11-18')),
    ).toBe(true);
  });
  it('rejects invalid activation codes without modifying data', async () => {
    const data = createInitialData();
    expect(await redeemPremium('invalid-test-code', data)).toBeNull();
    expect(data.premium.until).toBeNull();
  });
  it('activates for one calendar month and reuse resets without stacking', async () => {
    const code = String.fromCharCode(
      65,
      68,
      77,
      73,
      78,
      49,
      50,
      51,
      54,
      55,
      115,
      107,
      105,
      98,
      105,
      100,
      105,
    );
    const january = new Date('2027-01-31T10:30:00.000Z');
    const result = await redeemPremium(code, createInitialData(), january);
    expect(result?.premium.until).toBe('2027-02-28T10:30:00.000Z');
    const reused = await redeemPremium(code, result!, january);
    expect(reused?.premium.until).toBe(result?.premium.until);
    expect(await redeemPremium(code.toUpperCase(), createInitialData(), january)).toBeNull();
  });
});

describe('backup trust boundary', () => {
  it('round trips complete data with a real plan, note and session', () => {
    const data = {
      ...createInitialData(),
      profile,
      plans: createStarterPlans(profile),
      sessions: [session()],
      notes: [
        {
          id: 'n',
          title: 'Training cue',
          body: 'Keep the last reps controlled.',
          updatedAt: '2026-11-18T10:00:00.000Z',
          pinned: true,
        },
      ],
    };
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
  });
  it('preserves a deliberately disabled exercise rest timer', () => {
    const data = {
      ...createInitialData(),
      profile,
      plans: createStarterPlans(profile),
    };
    data.plans['1'].exercises[0].rest = 0;
    expect(parseBackup(JSON.stringify(data)).plans['1'].exercises[0].rest).toBe(0);
  });
  it('round trips premium templates and appearance and migrates older backups', () => {
    const data = {
      ...createInitialData(),
      profile,
      plans: createStarterPlans(profile),
    };
    data.settings.accent = 'ice';
    data.templates = [{ id: 'template', name: 'Full body', plan: data.plans['1'] }];
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
    const previous = JSON.parse(JSON.stringify(data));
    delete previous.settings.accent;
    delete previous.templates;
    const migrated = parseBackup(JSON.stringify(previous));
    expect(migrated.settings.accent).toBe('lime');
    expect(migrated.templates).toEqual([]);
  });
  it.each([
    ['version', (data: ReturnType<typeof createInitialData>) => ({ ...data, version: 2 })],
    [
      'invalid date',
      (data: ReturnType<typeof createInitialData>) => ({
        ...data,
        bodyLogs: [{ date: '2026-02-31', weight: 75 }],
      }),
    ],
    [
      'unknown exercise',
      (data: ReturnType<typeof createInitialData>) => ({
        ...data,
        sessions: [
          session({
            exercises: [{ id: 'a', exerciseId: 'unknown', sets: [] }],
          }),
        ],
      }),
    ],
    [
      'negative load',
      (data: ReturnType<typeof createInitialData>) => ({
        ...data,
        sessions: [
          session({
            exercises: [
              {
                id: 'a',
                exerciseId: 'bench-press',
                sets: [{ reps: 10, weight: -20, done: true }],
              },
            ],
          }),
        ],
      }),
    ],
    [
      'daily XP inflation',
      (data: ReturnType<typeof createInitialData>) => ({
        ...data,
        sessions: [session({ xp: 600 }), session({ xp: 600 })],
      }),
    ],
    [
      'empty session XP',
      (data: ReturnType<typeof createInitialData>) => ({
        ...data,
        sessions: [session({ exercises: [] })],
      }),
    ],
    [
      'duplicate session IDs',
      (data: ReturnType<typeof createInitialData>) => ({
        ...data,
        sessions: [session({ id: 'duplicate' }), session({ id: 'duplicate' })],
      }),
    ],
  ])('rejects %s while preserving the caller’s current data', (_, corrupt) => {
    const data = createInitialData();
    expect(() => parseBackup(JSON.stringify(corrupt(data)))).toThrow();
    expect(data.sessions).toHaveLength(0);
  });
  it('discards unexpected properties instead of importing executable or prototype state', () => {
    const raw = JSON.stringify({
      ...createInitialData(),
      dangerous: 'ignored',
    }).replace('"version":1', '"__proto__":{"polluted":true},"version":1');
    const restored = parseBackup(raw);
    expect(Object.hasOwn(restored, '__proto__')).toBe(false);
    expect(Object.hasOwn(restored, 'dangerous')).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
