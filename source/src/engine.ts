import {
  CONDITIONS,
  EXERCISES,
  EXTENDED_RANK,
  RANKS,
  type AppData,
  type DayPlan,
  type Profile,
  type Rank,
  type Session,
} from './model';
import { questBonus } from './quests';
import type { QuestClaim } from './model';

const validExercises = new Set(EXERCISES.map((exercise) => exercise.id));
const validConditions = new Set<string>(CONDITIONS.map((condition) => condition.id));
const timedExercises = new Set(['plank', 'walk', 'cycle', 'rower']);
const dayMs = 86400000;

export function uid(): string {
  return crypto.randomUUID();
}
export function localDate(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function createInitialData(): AppData {
  return {
    version: 1,
    profile: null,
    settings: {
      language: 'en',
      units: 'kg',
      appearance: 'dark',
      reducedMotion: false,
      largeText: false,
      restSeconds: 90,
      accent: 'lime',
    },
    plans: Object.fromEntries(
      Array.from({ length: 7 }, (_, day) => [
        String(day),
        { title: 'Rest & reset', exercises: [], note: '' },
      ]),
    ),
    sessions: [],
    notes: [],
    premium: { until: null, lifetime: false },
    bodyLogs: [],
    templates: [],
    questClaims: [],
    favorites: [],
  };
}

export function validateProfile(profile: Profile): string | null {
  if (profile.username !== undefined && !/^[a-zA-Z0-9_]{3,20}$/.test(profile.username))
    return 'Use 3–20 letters, numbers or underscores for your username.';
  if (profile.name.trim().length > 40) return 'Keep your name within 40 characters.';
  if (!Number.isInteger(profile.age) || profile.age < 8 || profile.age > 100)
    return 'Age must be between 8 and 100.';
  if (!Number.isFinite(profile.weight) || profile.weight < 20 || profile.weight > 350)
    return 'Weight must be between 20 and 350 kg.';
  if (!Number.isFinite(profile.height) || profile.height < 80 || profile.height > 240)
    return 'Height must be between 80 and 240 cm.';
  if (
    !Number.isFinite(profile.experience) ||
    profile.experience < 0 ||
    profile.experience > profile.age - 5
  )
    return 'Check your years of training experience.';
  if (!Number.isInteger(profile.daysPerWeek) || profile.daysPerWeek < 1 || profile.daysPerWeek > 6)
    return 'Choose 1 to 6 training days per week.';
  if (!['strength', 'muscle', 'fitness'].includes(profile.goal))
    return 'Choose your training goal.';
  if (
    !Array.isArray(profile.conditions) ||
    profile.conditions.some((condition) => !validConditions.has(condition))
  )
    return 'Choose a listed health consideration.';
  return null;
}

export function createStarterPlans(profile: Profile): Record<string, DayPlan> {
  const days = [1, 4, 6, 2, 5, 3].slice(0, profile.daysPerWeek).sort();
  const gentle = profile.age < 18 || profile.age >= 65 || profile.conditions.length > 0;
  const novice = profile.experience < 1 || gentle;
  const sets = gentle ? 2 : 3;
  const reps = profile.goal === 'strength' && !novice ? 6 : 10;
  const templates = novice
    ? [
        ['bodyweight-squat', 'incline-push-up', 'band-row', 'glute-bridge', 'dead-bug'],
        ['step-up', 'chest-press', 'lat-pulldown', 'calf-raise', 'bird-dog'],
        ['goblet-squat', 'dumbbell-press', 'cable-row', 'glute-bridge', 'dead-bug'],
      ]
    : [
        ['back-squat', 'bench-press', 'cable-row', 'lateral-raise', 'dead-bug'],
        ['rdl', 'overhead-press', 'lat-pulldown', 'split-squat', 'biceps-curl'],
        ['leg-press', 'incline-press', 'dumbbell-row', 'leg-curl', 'triceps-pushdown'],
      ];
  const result = createInitialData().plans;
  days.forEach((day, index) => {
    result[String(day)] = {
      title: `Full body ${String.fromCharCode(65 + (index % 3))}`,
      exercises: templates[index % 3].map((exerciseId) => ({
        id: uid(),
        exerciseId,
        sets,
        reps,
        weight: 0,
        rest: profile.goal === 'strength' ? 120 : 90,
      })),
      note: gentle
        ? 'A starting template, not medical advice. Review exercise choices with your qualified coach or clinician before training.'
        : 'Warm up first. Start with a comfortable load, leave 2–3 reps in reserve, and adjust the plan to suit you.',
    };
  });
  return result;
}

export function isPremium(data: AppData, now = new Date()): boolean {
  return (
    data.premium.lifetime ||
    Boolean(data.premium.until && new Date(data.premium.until).getTime() > now.getTime())
  );
}

function completedSets(session: Session) {
  return session.exercises.flatMap((exercise) =>
    exercise.sets.filter(
      (set) =>
        set.done &&
        set.reps > 0 &&
        Number.isFinite(set.reps) &&
        Number.isFinite(set.weight) &&
        set.weight >= 0,
    ),
  );
}

function exerciseVolume(session: Session, exerciseId: string): number {
  if (timedExercises.has(exerciseId)) return 0;
  return session.exercises
    .filter((exercise) => exercise.exerciseId === exerciseId)
    .flatMap((exercise) => exercise.sets)
    .reduce((sum, set) => sum + (set.done && set.reps > 0 ? set.weight * set.reps : 0), 0);
}

export function calculateSessionXp(session: Session, previous: Session[]): number {
  const sets = completedSets(session);
  if (!sets.length) return 0;
  const dailyAlready = previous
    .filter((item) => item.date === session.date)
    .reduce((sum, item) => sum + Math.max(0, Math.min(600, item.xp)), 0);
  const hasProgress = session.exercises.some((exercise) => {
    const past = previous.filter(
      (item) =>
        item.date < session.date &&
        item.exercises.some((entry) => entry.exerciseId === exercise.exerciseId),
    );
    if (!past.length) return false;
    const best = Math.max(...past.map((item) => exerciseVolume(item, exercise.exerciseId)));
    return best > 0 && exerciseVolume(session, exercise.exerciseId) > best;
  });
  const effort =
    80 +
    Math.min(sets.length, 35) * 12 +
    (session.duration >= 600 ? 20 : 0) +
    (hasProgress ? 40 : 0);
  return Math.max(0, Math.min(effort, 600 - dailyAlready));
}

export function getProgress(data: AppData): {
  xp: number;
  rank: Rank;
  nextRank: Rank | null;
  percent: number;
  streak: number;
  totalVolume: number;
  totalSets: number;
} {
  const xp =
    data.sessions.reduce((sum, session) => sum + Math.max(0, session.xp), 0) +
    questBonus(data.questClaims);
  const ranks = isPremium(data) ? [...RANKS, EXTENDED_RANK] : RANKS;
  let rankIndex = 0;
  ranks.forEach((rank, index) => {
    if (xp >= rank.minXp) rankIndex = index;
  });
  const rank = ranks[rankIndex];
  const nextRank = ranks[rankIndex + 1] ?? null;
  const percent = nextRank
    ? Math.min(100, Math.max(0, ((xp - rank.minXp) / (nextRank.minXp - rank.minXp)) * 100))
    : 100;
  const trainedDays = new Set(
    data.sessions
      .filter((session) => completedSets(session).length > 0)
      .map((session) => session.date),
  );
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  if (!trainedDays.has(localDate(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (trainedDays.has(localDate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const sets = data.sessions.flatMap(completedSets);
  const volumeSets = data.sessions
    .flatMap((session) => session.exercises)
    .filter((exercise) => !timedExercises.has(exercise.exerciseId))
    .flatMap((exercise) => exercise.sets)
    .filter((set) => set.done && set.reps > 0);
  return {
    xp,
    rank,
    nextRank,
    percent,
    streak,
    totalSets: sets.length,
    totalVolume: Math.round(volumeSets.reduce((sum, set) => sum + set.reps * set.weight, 0)),
  };
}

export function getSuggestions(data: AppData): string[] {
  const profile = data.profile;
  if (!profile) return ['Complete your profile to build a routine around your goals.'];
  const messages: string[] = [];
  if (profile.conditions.includes('hirschsprung'))
    messages.push(
      'With Hirschsprung disease or related surgery, review training and hydration needs with your treating clinician. Your plan cannot assess those needs.',
    );
  else if (profile.conditions.length)
    messages.push(
      'Your health considerations are saved. Review suitable exercises and intensity with your clinician; templates are not medical clearance.',
    );
  if (profile.age < 18)
    messages.push(
      'Build technique with a qualified coach and trusted adult. Keep loads comfortable and skip maximal-lift testing.',
    );
  else if (profile.age >= 65)
    messages.push(
      'Start with manageable sessions and comfortable ranges of motion. A qualified coach can help adapt balance and strength work.',
    );
  const recent = data.sessions.filter((session) => {
    const age = (Date.now() - new Date(`${session.date}T12:00:00`).getTime()) / dayMs;
    return age >= -1 && age < 7 && completedSets(session).length > 0;
  });
  const days = new Set(recent.map((session) => session.date));
  if (days.size >= Math.min(profile.daysPerWeek, 5))
    messages.push(
      'You have reached this week’s session goal. Give recovery the same attention as training.',
    );
  else if (recent.length)
    messages.push(
      `${days.size} of ${profile.daysPerWeek} planned training days completed this week. Pick a day that leaves room for recovery.`,
    );
  else
    messages.push(
      'Start with one comfortable session. Logging your actual sets is more useful than chasing a perfect plan.',
    );
  if (profile.daysPerWeek >= 5)
    messages.push(
      'Spread harder sessions out and alternate muscle groups when you train on consecutive days.',
    );
  if (profile.experience < 1)
    messages.push(
      'Keep 2–3 good reps in reserve. When every planned rep feels controlled, consider the smallest available load increase.',
    );
  else
    messages.push(
      'Use your session history to spot trends. Add reps or a small load increase only when technique and recovery stay solid.',
    );
  return messages.slice(0, 4);
}

const codeDigest = 'eac42190d91e41178b1c2fe551530ec44046a09c368065b551c944d509cf674e';
export async function redeemPremium(
  code: string,
  data: AppData,
  now = new Date(),
): Promise<AppData | null> {
  const bytes = new TextEncoder().encode(code.trim());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
  if (hex !== codeDigest) return null;
  const end = new Date(now);
  const originalDay = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(originalDay, lastDay));
  return { ...data, premium: { ...data.premium, until: end.toISOString() } };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || value.length > max)
    throw new Error(`${label} is invalid or too long.`);
  return value;
}
function number(value: unknown, label: string, min: number, max: number, integer = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error(`${label} is out of range.`);
  return value;
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be true or false.`);
  return value;
}
function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new Error(`${label} is invalid or contains too many items.`);
  return value;
}
function choice<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== 'string' || !values.includes(value as T))
    throw new Error(`${label} is not supported.`);
  return value as T;
}
function date(value: unknown, label: string): string {
  const text = string(value, label, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    Number.isNaN(Date.parse(text)) ||
    new Date(text).toISOString().slice(0, 10) !== text
  )
    throw new Error(`${label} must be a valid calendar date.`);
  return text;
}
function timestamp(value: unknown, label: string): string {
  const text = string(value, label, 40);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text) || Number.isNaN(Date.parse(text)))
    throw new Error(`${label} must be a valid timestamp.`);
  return new Date(text).toISOString();
}
function id(value: unknown, label: string): string {
  const text = string(value, label, 100);
  if (!text.trim()) throw new Error(`${label} cannot be empty.`);
  return text;
}

function parseDayPlan(value: unknown, label: string): DayPlan {
  const p = object(value, label);
  return {
    title: string(p.title, 'Plan title', 120),
    note: string(p.note, 'Plan note', 10000),
    exercises: array(p.exercises, 'Planned exercises', 40).map((value) => {
      const e = object(value, 'Planned exercise');
      return {
        id: id(e.id, 'Exercise ID'),
        exerciseId: choice(e.exerciseId, [...validExercises], 'Exercise'),
        sets: number(e.sets, 'Set count', 1, 12, true),
        reps: number(e.reps, 'Reps', 1, 100, true),
        weight: number(e.weight, 'Load', 0, 1000),
        rest: number(e.rest, 'Rest', 0, 600, true),
      };
    }),
  };
}

/** Imports are reconstructed field by field so unexpected JSON properties never enter application state. */
export function parseBackup(text: string): AppData {
  if (text.length > 8_000_000) throw new Error('Backup is larger than 8 MB.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const root = object(parsed, 'Backup');
  if (root.version !== 1) throw new Error('This backup version is not supported.');
  let profile: Profile | null = null;
  if (root.profile !== null) {
    const p = object(root.profile, 'Profile');
    profile = {
      name: string(p.name, 'Name', 40),
      ...(p.username === undefined ? {} : { username: string(p.username, 'Username', 20) }),
      ...(p.avatar === undefined
        ? {}
        : {
            avatar: (() => {
              const avatar = object(p.avatar, 'Character');
              return {
                skin: number(avatar.skin, 'Skin', 0, 4, true),
                hair: number(avatar.hair, 'Hair', 0, 3, true),
                shirt: number(avatar.shirt, 'Shirt', 0, 3, true),
              };
            })(),
          }),
      age: number(p.age, 'Age', 8, 100, true),
      weight: number(p.weight, 'Weight', 20, 350),
      height: number(p.height, 'Height', 80, 240),
      experience: number(p.experience, 'Experience', 0, 95),
      goal: choice(p.goal, ['strength', 'muscle', 'fitness'], 'Goal'),
      daysPerWeek: number(p.daysPerWeek, 'Training days', 1, 6, true),
      conditions: array(p.conditions, 'Conditions', CONDITIONS.length).map((item) =>
        choice(
          item,
          CONDITIONS.map((condition) => condition.id),
          'Condition',
        ),
      ),
    };
    const error = validateProfile(profile);
    if (error) throw new Error(error);
    profile.conditions = [...new Set(profile.conditions)];
  }
  const s = object(root.settings, 'Settings');
  const settings: AppData['settings'] = {
    language: choice(s.language, ['en', 'sk', 'cs', 'de', 'es'], 'Language'),
    units: choice(s.units, ['kg', 'lb'], 'Units'),
    appearance:
      s.appearance === undefined ? 'dark' : choice(s.appearance, ['dark', 'light'], 'Appearance'),
    reducedMotion: boolean(s.reducedMotion, 'Reduced motion'),
    largeText: boolean(s.largeText, 'Large text'),
    restSeconds: number(s.restSeconds, 'Rest timer', 15, 600, true),
    accent: s.accent === undefined ? 'lime' : choice(s.accent, ['lime', 'ice', 'rose'], 'Accent'),
  };
  const rawPlans = object(root.plans, 'Plans');
  const plans: Record<string, DayPlan> = {};
  for (let day = 0; day < 7; day++) {
    plans[String(day)] = parseDayPlan(rawPlans[String(day)], `Day ${day}`);
  }
  const sessions = array(root.sessions, 'Sessions', 10000).map((value) => {
    const session = object(value, 'Session');
    return {
      id: id(session.id, 'Session ID'),
      date: date(session.date, 'Session date'),
      title: string(session.title, 'Session title', 120),
      duration: number(session.duration, 'Duration', 0, 86400),
      note: string(session.note, 'Session note', 10000),
      xp: number(session.xp, 'Session XP', 0, 600, true),
      exercises: array(session.exercises, 'Session exercises', 40).map((value) => {
        const e = object(value, 'Session exercise');
        return {
          id: id(e.id, 'Exercise ID'),
          exerciseId: choice(e.exerciseId, [...validExercises], 'Exercise'),
          sets: array(e.sets, 'Logged sets', 12).map((value) => {
            const set = object(value, 'Set');
            return {
              reps: number(set.reps, 'Reps', 0, 100, true),
              weight: number(set.weight, 'Load', 0, 1000),
              done: boolean(set.done, 'Completed set'),
            };
          }),
        };
      }),
    };
  });
  if (new Set(sessions.map((session) => session.id)).size !== sessions.length)
    throw new Error('Duplicate session IDs found.');
  const dailyXp = new Map<string, number>();
  for (const session of sessions) {
    if (!completedSets(session).length && session.xp !== 0)
      throw new Error('Empty sessions cannot earn XP.');
    dailyXp.set(session.date, (dailyXp.get(session.date) ?? 0) + session.xp);
    if (dailyXp.get(session.date)! > 600) throw new Error('Daily XP exceeds the supported limit.');
  }
  const notes = array(root.notes, 'Notes', 2000).map((value) => {
    const note = object(value, 'Note');
    return {
      id: id(note.id, 'Note ID'),
      title: string(note.title, 'Note title', 120),
      body: string(note.body, 'Note body', 50000),
      updatedAt: timestamp(note.updatedAt, 'Note date'),
      pinned: boolean(note.pinned, 'Pinned'),
      ...(note.category === undefined
        ? {}
        : { category: choice(note.category, ['free', 'training', 'recovery'], 'Note category') }),
    };
  });
  if (new Set(notes.map((note) => note.id)).size !== notes.length)
    throw new Error('Duplicate note IDs found.');
  const p = object(root.premium, 'Premium');
  const premium = {
    until: p.until === null ? null : timestamp(p.until, 'Premium expiry'),
    lifetime: boolean(p.lifetime, 'Lifetime access'),
  };
  const bodyLogs = array(root.bodyLogs, 'Body logs', 5000).map((value) => {
    const log = object(value, 'Body log');
    return {
      date: date(log.date, 'Body log date'),
      weight: number(log.weight, 'Body weight', 20, 350),
    };
  });
  const templates = array(root.templates === undefined ? [] : root.templates, 'Templates', 30).map(
    (value) => {
      const template = object(value, 'Template');
      return {
        id: id(template.id, 'Template ID'),
        name: string(template.name, 'Template name', 120),
        plan: parseDayPlan(template.plan, 'Template plan'),
      };
    },
  );
  if (new Set(templates.map((template) => template.id)).size !== templates.length)
    throw new Error('Duplicate template IDs found.');
  const questClaims: QuestClaim[] = array(root.questClaims ?? [], 'Quest claims', 30000).map(
    (value) => {
      const claim = object(value, 'Quest claim');
      return {
        date: date(claim.date, 'Quest date'),
        tier: choice(claim.tier, ['easy', 'medium', 'hard'], 'Quest tier'),
        level: choice(claim.level, ['foundation', 'standard', 'advanced'], 'Quest level'),
      };
    },
  );
  if (
    new Set(questClaims.map((claim) => `${claim.date}:${claim.tier}`)).size !== questClaims.length
  )
    throw new Error('Duplicate quest claims found.');
  const favorites = [
    ...new Set(
      array(root.favorites ?? [], 'Favorites', EXERCISES.length).map((value) =>
        choice(value, [...validExercises], 'Favorite exercise'),
      ),
    ),
  ];
  return {
    version: 1,
    profile,
    settings,
    plans,
    sessions,
    notes,
    premium,
    bodyLogs,
    templates,
    questClaims,
    favorites,
  };
}
