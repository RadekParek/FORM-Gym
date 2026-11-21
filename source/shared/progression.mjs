export const PUBLIC_RANKS = [
  { name: 'First Rep', minXp: 0, subtitle: 'Every beginning counts.', color: '#b8c0ce' },
  { name: 'Foundation', minXp: 800, subtitle: 'Building the habit.', color: '#c69c72' },
  { name: 'Regular', minXp: 2500, subtitle: 'Showing up, week after week.', color: '#75d1c0' },
  { name: 'Challenger', minXp: 6000, subtitle: 'A stronger routine.', color: '#7db6ff' },
  { name: 'Athlete', minXp: 12000, subtitle: 'Consistency is your strength.', color: '#b49aff' },
  { name: 'Iron Elite', minXp: 22000, subtitle: 'Training with intention.', color: '#f18ba4' },
  { name: 'Champion', minXp: 36000, subtitle: 'Effort that lasts.', color: '#f5bd6d' },
  { name: 'Legend', minXp: 55000, subtitle: 'A remarkable training journey.', color: '#eddf94' },
  {
    name: 'Mr. Olympia',
    minXp: 100000,
    subtitle: 'The highest standard training badge.',
    color: '#f7f1cd',
  },
];

export const QUEST_XP = { easy: 40, medium: 90, hard: 180 };
export const TIMED_IDS = ['plank', 'walk', 'cycle', 'rower'];
export function publicRank(xp) {
  return [...PUBLIC_RANKS].reverse().find((rank) => xp >= rank.minXp) || PUBLIC_RANKS[0];
}

/** Targets use completed work, never load or body measurements. */
export function dailyQuests(date, level = 'standard') {
  const rotation = [...date].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 3;
  const easy = { tier: 'easy', kind: 'sets', target: 2, xp: QUEST_XP.easy };
  const medium =
    level === 'foundation'
      ? { tier: 'medium', kind: 'reps', target: 25, xp: QUEST_XP.medium }
      : {
          tier: 'medium',
          kind: rotation === 1 ? 'variety' : 'reps',
          target: rotation === 1 ? 3 : 50,
          xp: QUEST_XP.medium,
        };
  const hard =
    level === 'advanced'
      ? {
          tier: 'hard',
          kind: 'exercise',
          target: [10, 30, 50][rotation],
          exerciseIds: [
            ['pull-up', 'assisted-pull-up'],
            ['push-up', 'incline-push-up'],
            ['bodyweight-squat', 'goblet-squat'],
          ][rotation],
          xp: QUEST_XP.hard,
        }
      : {
          tier: 'hard',
          kind: level === 'foundation' ? 'sets' : 'reps',
          target: level === 'foundation' ? 4 : 90,
          xp: QUEST_XP.hard,
        };
  return [easy, medium, hard];
}

/** Accepts normalized completed sets; timed quantities never inflate rep counts. */
export function questMetrics(sessions, date) {
  const own = sessions.filter((session) => date === undefined || session.date === date);
  const byExercise = {};
  let sets = 0;
  let reps = 0;
  const variety = new Set();
  for (const session of own)
    for (const exercise of session.exercises) {
      const completed = exercise.sets.filter(
        (set) => set.done !== false && (set.reps > 0 || set.seconds > 0),
      );
      sets += completed.length;
      if (completed.length) variety.add(exercise.exerciseId || exercise.name);
      if (!TIMED_IDS.includes(exercise.exerciseId)) {
        const count = completed.reduce((sum, set) => sum + (set.seconds ? 0 : set.reps), 0);
        reps += count;
        byExercise[exercise.exerciseId] = (byExercise[exercise.exerciseId] || 0) + count;
      }
    }
  return { sets, reps, variety: variety.size, byExercise };
}
export function questValue(quest, metrics) {
  return quest.kind === 'exercise'
    ? quest.exerciseIds.reduce((sum, id) => sum + (metrics.byExercise[id] || 0), 0)
    : metrics[quest.kind];
}
