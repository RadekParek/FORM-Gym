export type Language = 'en' | 'sk' | 'cs' | 'de' | 'es';
export type Goal = 'strength' | 'muscle' | 'fitness';
import { PUBLIC_RANKS, type QuestTier, type QuestLevel } from '../shared/progression.mjs';

export interface Avatar {
  skin: number;
  hair: number;
  shirt: number;
}
export interface QuestClaim {
  date: string;
  tier: QuestTier;
  level: QuestLevel;
}

export interface Profile {
  name: string;
  username?: string;
  avatar?: Avatar;
  age: number;
  weight: number;
  height: number;
  experience: number;
  goal: Goal;
  daysPerWeek: number;
  conditions: string[];
}

export interface Exercise {
  id: string;
  name: string;
  muscle: string;
  equipment: string;
}
export interface PlanExercise {
  id: string;
  exerciseId: string;
  sets: number;
  reps: number;
  weight: number;
  rest: number;
}
export interface DayPlan {
  title: string;
  exercises: PlanExercise[];
  note: string;
}
export interface SetLog {
  reps: number;
  weight: number;
  done: boolean;
}
export interface SessionExercise {
  id: string;
  exerciseId: string;
  sets: SetLog[];
}
export interface Session {
  id: string;
  date: string;
  title: string;
  duration: number;
  exercises: SessionExercise[];
  note: string;
  xp: number;
}
export interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
  pinned: boolean;
  category?: 'free' | 'training' | 'recovery';
}
export interface Premium {
  until: string | null;
  lifetime: boolean;
}
export interface Settings {
  language: Language;
  units: 'kg' | 'lb';
  appearance: 'dark' | 'light';
  reducedMotion: boolean;
  largeText: boolean;
  restSeconds: number;
  accent: 'lime' | 'ice' | 'rose';
}
export interface AppData {
  version: 1;
  profile: Profile | null;
  settings: Settings;
  plans: Record<string, DayPlan>;
  sessions: Session[];
  notes: Note[];
  premium: Premium;
  bodyLogs: { date: string; weight: number }[];
  templates: { id: string; name: string; plan: DayPlan }[];
  questClaims?: QuestClaim[];
  favorites?: string[];
}

export const CONDITIONS = [
  { id: 'hypertension', name: 'High blood pressure' },
  { id: 'heart', name: 'Heart condition' },
  { id: 'diabetes', name: 'Diabetes' },
  { id: 'asthma', name: 'Asthma' },
  { id: 'arthritis', name: 'Arthritis / joint pain' },
  { id: 'backPain', name: 'Back pain / injury' },
  { id: 'osteoporosis', name: 'Osteoporosis' },
  { id: 'epilepsy', name: 'Epilepsy' },
  { id: 'thyroid', name: 'Thyroid condition' },
  { id: 'kidney', name: 'Kidney condition' },
  { id: 'ibd', name: 'Inflammatory bowel disease' },
  { id: 'pregnancy', name: 'Pregnancy / postpartum' },
  { id: 'recovery', name: 'Surgery / injury recovery' },
  { id: 'hirschsprung', name: 'Hirschsprung disease' },
] as const;

export const EXERCISES: Exercise[] = [
  {
    id: 'goblet-squat',
    name: 'Goblet squat',
    muscle: 'Legs',
    equipment: 'Dumbbell',
  },
  {
    id: 'bodyweight-squat',
    name: 'Bodyweight squat',
    muscle: 'Legs',
    equipment: 'Bodyweight',
  },
  {
    id: 'back-squat',
    name: 'Barbell back squat',
    muscle: 'Legs',
    equipment: 'Barbell',
  },
  {
    id: 'front-squat',
    name: 'Front squat',
    muscle: 'Legs',
    equipment: 'Barbell',
  },
  { id: 'leg-press', name: 'Leg press', muscle: 'Legs', equipment: 'Machine' },
  {
    id: 'split-squat',
    name: 'Split squat',
    muscle: 'Legs',
    equipment: 'Dumbbell',
  },
  { id: 'lunge', name: 'Reverse lunge', muscle: 'Legs', equipment: 'Dumbbell' },
  { id: 'step-up', name: 'Step-up', muscle: 'Legs', equipment: 'Bodyweight' },
  {
    id: 'leg-extension',
    name: 'Leg extension',
    muscle: 'Legs',
    equipment: 'Machine',
  },
  {
    id: 'leg-curl',
    name: 'Seated leg curl',
    muscle: 'Legs',
    equipment: 'Machine',
  },
  {
    id: 'calf-raise',
    name: 'Calf raise',
    muscle: 'Legs',
    equipment: 'Bodyweight',
  },
  { id: 'deadlift', name: 'Deadlift', muscle: 'Back', equipment: 'Barbell' },
  {
    id: 'rdl',
    name: 'Romanian deadlift',
    muscle: 'Legs',
    equipment: 'Dumbbell',
  },
  {
    id: 'hip-thrust',
    name: 'Hip thrust',
    muscle: 'Legs',
    equipment: 'Barbell',
  },
  {
    id: 'glute-bridge',
    name: 'Glute bridge',
    muscle: 'Legs',
    equipment: 'Bodyweight',
  },
  {
    id: 'bench-press',
    name: 'Bench press',
    muscle: 'Chest',
    equipment: 'Barbell',
  },
  {
    id: 'dumbbell-press',
    name: 'Dumbbell bench press',
    muscle: 'Chest',
    equipment: 'Dumbbell',
  },
  {
    id: 'incline-press',
    name: 'Incline dumbbell press',
    muscle: 'Chest',
    equipment: 'Dumbbell',
  },
  { id: 'push-up', name: 'Push-up', muscle: 'Chest', equipment: 'Bodyweight' },
  {
    id: 'incline-push-up',
    name: 'Incline push-up',
    muscle: 'Chest',
    equipment: 'Bodyweight',
  },
  {
    id: 'chest-fly',
    name: 'Cable chest fly',
    muscle: 'Chest',
    equipment: 'Cable',
  },
  {
    id: 'chest-press',
    name: 'Chest press',
    muscle: 'Chest',
    equipment: 'Machine',
  },
  {
    id: 'lat-pulldown',
    name: 'Lat pulldown',
    muscle: 'Back',
    equipment: 'Machine',
  },
  { id: 'pull-up', name: 'Pull-up', muscle: 'Back', equipment: 'Bodyweight' },
  {
    id: 'assisted-pull-up',
    name: 'Assisted pull-up',
    muscle: 'Back',
    equipment: 'Machine',
  },
  {
    id: 'cable-row',
    name: 'Seated cable row',
    muscle: 'Back',
    equipment: 'Cable',
  },
  {
    id: 'dumbbell-row',
    name: 'One-arm dumbbell row',
    muscle: 'Back',
    equipment: 'Dumbbell',
  },
  {
    id: 'barbell-row',
    name: 'Barbell row',
    muscle: 'Back',
    equipment: 'Barbell',
  },
  {
    id: 'band-row',
    name: 'Resistance band row',
    muscle: 'Back',
    equipment: 'Band',
  },
  {
    id: 'face-pull',
    name: 'Face pull',
    muscle: 'Shoulders',
    equipment: 'Cable',
  },
  {
    id: 'overhead-press',
    name: 'Overhead press',
    muscle: 'Shoulders',
    equipment: 'Dumbbell',
  },
  {
    id: 'lateral-raise',
    name: 'Lateral raise',
    muscle: 'Shoulders',
    equipment: 'Dumbbell',
  },
  {
    id: 'rear-delt-fly',
    name: 'Rear delt fly',
    muscle: 'Shoulders',
    equipment: 'Dumbbell',
  },
  {
    id: 'biceps-curl',
    name: 'Biceps curl',
    muscle: 'Arms',
    equipment: 'Dumbbell',
  },
  {
    id: 'hammer-curl',
    name: 'Hammer curl',
    muscle: 'Arms',
    equipment: 'Dumbbell',
  },
  {
    id: 'triceps-pushdown',
    name: 'Triceps pushdown',
    muscle: 'Arms',
    equipment: 'Cable',
  },
  {
    id: 'triceps-extension',
    name: 'Overhead triceps extension',
    muscle: 'Arms',
    equipment: 'Dumbbell',
  },
  {
    id: 'plank',
    name: 'Plank (seconds)',
    muscle: 'Core',
    equipment: 'Bodyweight',
  },
  { id: 'dead-bug', name: 'Dead bug', muscle: 'Core', equipment: 'Bodyweight' },
  { id: 'bird-dog', name: 'Bird dog', muscle: 'Core', equipment: 'Bodyweight' },
  {
    id: 'pallof-press',
    name: 'Pallof press',
    muscle: 'Core',
    equipment: 'Cable',
  },
  { id: 'crunch', name: 'Crunch', muscle: 'Core', equipment: 'Bodyweight' },
  {
    id: 'walk',
    name: 'Brisk walk (minutes)',
    muscle: 'Cardio',
    equipment: 'Bodyweight',
  },
  {
    id: 'cycle',
    name: 'Stationary cycle (minutes)',
    muscle: 'Cardio',
    equipment: 'Machine',
  },
  {
    id: 'rower',
    name: 'Rowing machine (minutes)',
    muscle: 'Cardio',
    equipment: 'Machine',
  },
];

export interface Rank {
  name: string;
  minXp: number;
  subtitle: string;
  color?: string;
}
export const RANKS: Rank[] = PUBLIC_RANKS;

export const EXTENDED_RANK: Rank = {
  name: 'ROBO!',
  minXp: 180000,
  subtitle: 'Beyond the ordinary.',
  color: '#9de3ee',
};
