import type { Exercise, Language } from './model';
import translated from './generated-guides.json';

export type Muscle =
  | 'chest'
  | 'lats'
  | 'upperBack'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'core'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves';
export interface Guide {
  movement: string;
  primary: Muscle[];
  secondary: Muscle[];
  cues: string[];
}
const patterns: Record<string, Omit<Guide, 'movement'>> = {
  squat: {
    primary: ['quads', 'glutes'],
    secondary: ['core', 'hamstrings'],
    cues: [
      'Stand with feet around shoulder width; keep the whole foot grounded.',
      'Sit down between your hips while your knees follow your toes.',
      'Push the floor away and stand tall without locking your knees.',
    ],
  },
  lunge: {
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings', 'core'],
    cues: [
      'Use a split stance with enough room to balance.',
      'Bend both knees and lower straight down with your front heel grounded.',
      'Press through the front foot; use support if balance is difficult.',
    ],
  },
  step: {
    primary: ['quads', 'glutes'],
    secondary: ['calves', 'core'],
    cues: [
      'Use a stable, low step and place the whole foot on it.',
      'Drive through the lead leg without jumping from the trailing foot.',
      'Lower slowly and change sides.',
    ],
  },
  hinge: {
    primary: ['hamstrings', 'glutes'],
    secondary: ['core', 'upperBack'],
    cues: [
      'Brace gently; keep the load close and soften your knees.',
      'Move your hips back while keeping a comfortable neutral spine.',
      'Drive the hips forward to stand; avoid leaning back at the top.',
    ],
  },
  bridge: {
    primary: ['glutes'],
    secondary: ['hamstrings', 'core'],
    cues: [
      'Plant your feet and keep your ribs comfortably down.',
      'Push through your heels and raise the hips.',
      'Pause with your torso and thighs aligned; lower with control.',
    ],
  },
  press: {
    primary: ['chest'],
    secondary: ['shoulders', 'triceps'],
    cues: [
      'Keep feet supported and shoulder blades comfortable against the bench.',
      'Lower the handles or bar toward the chest with wrists stacked over elbows.',
      'Press up smoothly; avoid bouncing or forcing your elbows wide.',
    ],
  },
  pushup: {
    primary: ['chest'],
    secondary: ['triceps', 'core'],
    cues: [
      'Set your hands slightly wider than shoulders; use an incline when needed.',
      'Keep your trunk steady as you lower the chest between your hands.',
      'Press the floor away and keep your elbows at a comfortable angle.',
    ],
  },
  fly: {
    primary: ['chest'],
    secondary: ['shoulders'],
    cues: [
      'Use a light load with a soft bend in the elbows.',
      'Open the arms in an arc until you feel a comfortable chest stretch.',
      'Bring your hands together without shrugging or changing the elbow angle.',
    ],
  },
  pull: {
    primary: ['lats'],
    secondary: ['biceps', 'upperBack'],
    cues: [
      'Choose a comfortable grip; assisted repetitions count.',
      'Pull your elbows toward your ribs without swinging.',
      'Lower smoothly through a comfortable range; keep the neck relaxed.',
    ],
  },
  pulldown: {
    primary: ['lats'],
    secondary: ['biceps', 'upperBack'],
    cues: [
      'Set the thigh pad and sit tall with your feet supported.',
      'Pull the handle toward the upper chest; keep the bar in front of your head.',
      'Let your arms extend slowly without jerking your torso.',
    ],
  },
  row: {
    primary: ['upperBack', 'lats'],
    secondary: ['biceps', 'core'],
    cues: [
      'Brace your torso and start with comfortable extended arms.',
      'Bring the elbows back toward your hips without shrugging.',
      'Return the handles slowly while keeping the torso steady.',
    ],
  },
  facepull: {
    primary: ['upperBack', 'shoulders'],
    secondary: ['biceps'],
    cues: [
      'Set the cable near face height and hold the rope lightly.',
      'Pull toward the face while moving the hands apart.',
      'Keep the neck relaxed and return with control.',
    ],
  },
  overhead: {
    primary: ['shoulders'],
    secondary: ['triceps', 'core'],
    cues: [
      'Start with the load at shoulder height and ribs comfortably down.',
      'Press up through a comfortable range without arching the lower back.',
      'Lower slowly to the starting position.',
    ],
  },
  lateral: {
    primary: ['shoulders'],
    secondary: ['upperBack'],
    cues: [
      'Use a light load and soft elbows.',
      'Raise the arms out in a wide arc to a comfortable shoulder height.',
      'Lower slowly and avoid swinging or shrugging.',
    ],
  },
  curl: {
    primary: ['biceps'],
    secondary: ['core'],
    cues: [
      'Keep your upper arms close to your sides.',
      'Bend the elbows without swinging the torso.',
      'Lower the weight slowly until your arms are comfortably extended.',
    ],
  },
  triceps: {
    primary: ['triceps'],
    secondary: ['shoulders'],
    cues: [
      'Keep the upper arms steady; use a comfortable shoulder position.',
      'Straighten the elbows while keeping the wrists neutral.',
      'Bend the elbows slowly to return; avoid moving the entire arm.',
    ],
  },
  plank: {
    primary: ['core'],
    secondary: ['shoulders', 'glutes'],
    cues: [
      'Place elbows below shoulders; use knees on the floor if needed.',
      'Keep your trunk steady and breathe normally.',
      'End the hold before your posture changes or you need to hold your breath.',
    ],
  },
  deadbug: {
    primary: ['core'],
    secondary: ['glutes'],
    cues: [
      'Lie on your back with arms up and knees comfortably bent.',
      'Reach one arm and the opposite leg away without arching the back.',
      'Return slowly and alternate sides.',
    ],
  },
  birddog: {
    primary: ['core', 'glutes'],
    secondary: ['shoulders', 'upperBack'],
    cues: [
      'Start on hands and knees with a comfortable neutral spine.',
      'Reach one arm and the opposite leg away while keeping your hips level.',
      'Return slowly and alternate sides.',
    ],
  },
  pallof: {
    primary: ['core'],
    secondary: ['shoulders'],
    cues: [
      'Stand sideways to a light cable or resistance band.',
      'Press your hands forward while resisting rotation.',
      'Bring your hands back slowly; repeat facing the other direction.',
    ],
  },
  crunch: {
    primary: ['core'],
    secondary: [],
    cues: [
      'Lie on your back with knees bent and feet supported.',
      'Lift the shoulders a small distance without pulling your neck.',
      'Lower slowly; keep the movement small and controlled.',
    ],
  },
  legpress: {
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings'],
    cues: [
      'Adjust the seat so your lower back stays supported.',
      'Bend the knees in line with your toes through a comfortable range.',
      'Press the platform away without locking your knees.',
    ],
  },
  legextension: {
    primary: ['quads'],
    secondary: [],
    cues: [
      'Align the machine pivot with your knees and set the shin pad.',
      'Straighten the knees smoothly through a comfortable range.',
      'Lower slowly; avoid kicking the load.',
    ],
  },
  legcurl: {
    primary: ['hamstrings'],
    secondary: ['calves'],
    cues: [
      'Align your knees with the machine pivot and keep your hips supported.',
      'Bend the knees to pull the pad toward the seat.',
      'Return slowly without lifting your hips.',
    ],
  },
  calf: {
    primary: ['calves'],
    secondary: [],
    cues: [
      'Stand with stable support available and feet facing comfortably forward.',
      'Rise onto the balls of your feet without rolling your ankles.',
      'Lower slowly through a comfortable ankle range.',
    ],
  },
  walk: {
    primary: ['quads', 'calves'],
    secondary: ['glutes', 'core'],
    cues: [
      'Choose a pace at which you can talk comfortably.',
      'Use natural steps and relaxed arm movement.',
      'Build time gradually and slow down when needed.',
    ],
  },
  cycle: {
    primary: ['quads'],
    secondary: ['glutes', 'hamstrings', 'calves'],
    cues: [
      'Adjust the seat so your knee stays slightly bent at the bottom.',
      'Pedal smoothly with a relaxed grip and comfortable resistance.',
      'Keep breathing normally and build duration gradually.',
    ],
  },
  rower: {
    primary: ['quads', 'upperBack'],
    secondary: ['lats', 'glutes', 'core'],
    cues: [
      'Start with bent knees, a steady torso and comfortably extended arms.',
      'Drive with the legs, then lean slightly and bring the handle toward the ribs.',
      'Return arms first, then torso, then knees.',
    ],
  },
};
const movementIds: Record<string, string[]> = {
  squat: ['goblet-squat', 'bodyweight-squat', 'back-squat', 'front-squat'],
  lunge: ['split-squat', 'lunge'],
  step: ['step-up'],
  hinge: ['deadlift', 'rdl'],
  bridge: ['hip-thrust', 'glute-bridge'],
  press: ['bench-press', 'dumbbell-press', 'incline-press', 'chest-press'],
  pushup: ['push-up', 'incline-push-up'],
  fly: ['chest-fly'],
  pull: ['pull-up', 'assisted-pull-up'],
  pulldown: ['lat-pulldown'],
  row: ['cable-row', 'dumbbell-row', 'barbell-row', 'band-row'],
  facepull: ['face-pull', 'rear-delt-fly'],
  overhead: ['overhead-press'],
  lateral: ['lateral-raise'],
  curl: ['biceps-curl', 'hammer-curl'],
  triceps: ['triceps-pushdown', 'triceps-extension'],
  plank: ['plank'],
  deadbug: ['dead-bug'],
  birddog: ['bird-dog'],
  pallof: ['pallof-press'],
  crunch: ['crunch'],
  legpress: ['leg-press'],
  legextension: ['leg-extension'],
  legcurl: ['leg-curl'],
  calf: ['calf-raise'],
  walk: ['walk'],
  cycle: ['cycle'],
  rower: ['rower'],
};
export const MUSCLE_NAMES: Record<Muscle, string> = {
  chest: 'Chest',
  lats: 'Lats',
  upperBack: 'Upper back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  core: 'Core',
  quads: 'Quadriceps',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
};
export function exerciseGuide(exercise: Exercise): Guide {
  if (exercise.id === 'rear-delt-fly') return { movement: 'rearFly', primary: ['shoulders','upperBack'], secondary: ['core'], cues: ['Hinge at the hips with a steady trunk and a light load.', 'Raise your arms out to the sides with a soft elbow bend.', 'Lower slowly without shrugging or swinging your body.'] };
  if (exercise.id === 'triceps-extension') return { movement: 'tricepsOverhead', primary: ['triceps'], secondary: ['shoulders'], cues: ['Hold a comfortable load overhead with your upper arms steady.', 'Bend your elbows to lower the load behind your head.', 'Straighten the elbows smoothly without arching your lower back.'] };
  const movement = Object.keys(movementIds).find((key) => movementIds[key].includes(exercise.id));
  if (!movement) throw new Error(`Missing exercise guide: ${exercise.id}`);
  return { movement, ...patterns[movement] };
}
export function guideCues(guide: Guide, language: Language): string[] {
  return (
    (translated as Partial<Record<Language, { cues: Record<string, string[]> }>>)[language]?.cues[
      guide.movement
    ] || guide.cues
  );
}
export function muscleName(muscle: Muscle, language: Language): string {
  return (
    (translated as Partial<Record<Language, { muscles: Partial<Record<Muscle, string>> }>>)[
      language
    ]?.muscles[muscle] || MUSCLE_NAMES[muscle]
  );
}
