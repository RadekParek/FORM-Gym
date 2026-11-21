import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Pause, Play } from 'lucide-react';
import type { Avatar, Exercise, Language } from '../model';
import type { Guide } from '../exerciseGuides';
import { featureT } from '../feature-i18n';
import { SKIN_COLORS, SHIRT_COLORS } from './UserAvatar';

type Point = [number, number];
type Pose = Record<
  'head' | 'sl' | 'sr' | 'hl' | 'hr' | 'el' | 'er' | 'wl' | 'wr' | 'kl' | 'kr' | 'al' | 'ar',
  Point
>;
const standing: Pose = {
  head: [160, 54],
  sl: [143, 86],
  sr: [177, 86],
  hl: [149, 162],
  hr: [171, 162],
  el: [127, 130],
  er: [193, 130],
  wl: [123, 168],
  wr: [197, 168],
  kl: [145, 210],
  kr: [175, 210],
  al: [138, 260],
  ar: [182, 260],
};
const seated: Pose = {
  ...standing,
  head: [118, 66],
  sl: [125, 96],
  sr: [138, 96],
  hl: [133, 163],
  hr: [146, 163],
  el: [107, 131],
  er: [160, 131],
  wl: [109, 166],
  wr: [164, 166],
  kl: [188, 166],
  kr: [198, 170],
  al: [190, 250],
  ar: [204, 254],
};
const horizontal: Pose = {
  head: [70, 177],
  sl: [97, 191],
  sr: [104, 196],
  hl: [197, 206],
  hr: [200, 212],
  el: [99, 228],
  er: [110, 232],
  wl: [103, 259],
  wr: [115, 264],
  kl: [238, 225],
  kr: [241, 231],
  al: [277, 254],
  ar: [280, 259],
};
function poses(movement: string): [Pose, Pose] {
  const s = standing;
  switch (movement) {
    case 'squat':
      return [
        s,
        {
          ...s,
          head: [160, 111],
          sl: [140, 142],
          sr: [180, 142],
          hl: [149, 205],
          hr: [171, 205],
          el: [127, 173],
          er: [193, 173],
          wl: [144, 169],
          wr: [176, 169],
          kl: [121, 226],
          kr: [199, 226],
          al: [131, 260],
          ar: [189, 260],
        },
      ];
    case 'lunge':
    case 'step':
      return [
        s,
        {
          ...s,
          head: [162, 92],
          sl: [145, 125],
          sr: [179, 125],
          hl: [151, 191],
          hr: [175, 191],
          kl: [127, 220],
          kr: [214, 218],
          al: [104, 260],
          ar: [198, 260],
          el: [128, 171],
          er: [200, 165],
          wl: [120, 210],
          wr: [210, 202],
        },
      ];
    case 'hinge':
      return [
        s,
        {
          ...s,
          head: [106, 122],
          sl: [125, 143],
          sr: [137, 148],
          hl: [190, 178],
          hr: [202, 181],
          el: [136, 187],
          er: [149, 191],
          wl: [130, 230],
          wr: [145, 231],
          kl: [161, 216],
          kr: [187, 220],
        },
      ];
    case 'bridge':
      return [
        {
          ...horizontal,
          head: [64, 235],
          sl: [90, 249],
          sr: [95, 254],
          hl: [168, 258],
          hr: [171, 263],
          kl: [223, 207],
          kr: [225, 213],
          al: [258, 259],
          ar: [265, 264],
        },
        {
          ...horizontal,
          head: [64, 235],
          sl: [90, 249],
          sr: [95, 254],
          hl: [170, 203],
          hr: [174, 208],
          kl: [225, 203],
          kr: [229, 209],
          al: [258, 259],
          ar: [265, 264],
        },
      ];
    case 'plank':
      return [horizontal, horizontal];
    case 'pushup':
      return [
        horizontal,
        {
          ...horizontal,
          head: [70, 218],
          sl: [97, 229],
          sr: [104, 234],
          hl: [197, 238],
          hr: [200, 244],
          el: [68, 251],
          er: [76, 255],
          kl: [238, 250],
          kr: [241, 254],
        },
      ];
    case 'press':
      return [
        {
          ...seated,
          head: [70, 172],
          sl: [100, 185],
          sr: [108, 191],
          hl: [173, 207],
          hr: [181, 211],
          el: [89, 147],
          er: [118, 151],
          wl: [104, 122],
          wr: [124, 126],
        },
        {
          ...seated,
          head: [70, 172],
          sl: [100, 185],
          sr: [108, 191],
          hl: [173, 207],
          hr: [181, 211],
          el: [97, 135],
          er: [117, 139],
          wl: [98, 86],
          wr: [119, 91],
        },
      ];
    case 'overhead':
      return [
        { ...s, el: [124, 98], er: [196, 98], wl: [133, 52], wr: [187, 52] },
        { ...s, el: [141, 40], er: [179, 40], wl: [144, 13], wr: [176, 13] },
      ];
    case 'pull':
      return [
        {
          ...s,
          sl: [143, 116],
          sr: [177, 116],
          head: [160, 85],
          hl: [149, 187],
          hr: [171, 187],
          el: [136, 57],
          er: [184, 57],
          wl: [128, 16],
          wr: [192, 16],
          kl: [145, 230],
          kr: [175, 230],
        },
        {
          ...s,
          head: [160, 25],
          sl: [143, 54],
          sr: [177, 54],
          hl: [149, 128],
          hr: [171, 128],
          el: [120, 67],
          er: [200, 67],
          wl: [128, 16],
          wr: [192, 16],
          kl: [145, 180],
          kr: [175, 180],
          al: [138, 230],
          ar: [182, 230],
        },
      ];
    case 'pulldown':
      return [
        { ...seated, el: [121, 52], er: [163, 52], wl: [106, 18], wr: [177, 18] },
        { ...seated, el: [95, 113], er: [178, 113], wl: [111, 110], wr: [165, 110] },
      ];
    case 'curl':
      return [s, { ...s, wl: [144, 96], wr: [176, 96] }];
    case 'triceps':
      return [
        { ...s, el: [141, 131], er: [179, 131], wl: [151, 93], wr: [169, 93] },
        { ...s, el: [141, 131], er: [179, 131], wl: [145, 176], wr: [175, 176] },
      ];
    case 'tricepsOverhead':
      return [
        { ...s, el: [147, 38], er: [173, 38], wl: [157, 69], wr: [163, 69] },
        { ...s, el: [147, 38], er: [173, 38], wl: [149, 7], wr: [171, 7] },
      ];
    case 'lateral':
      return [s, { ...s, el: [94, 87], er: [226, 87], wl: [57, 87], wr: [263, 87] }];
    case 'fly': return [{...s,el:[96,91],er:[224,91],wl:[60,96],wr:[260,96]}, {...s,el:[133,107],er:[187,107],wl:[153,108],wr:[167,108]}];
    case 'rearFly': return [{...s,head:[117,104],sl:[137,131],sr:[150,134],hl:[178,177],hr:[190,180],el:[144,172],er:[158,175],wl:[141,211],wr:[158,214]}, {...s,head:[117,104],sl:[137,131],sr:[150,134],hl:[178,177],hr:[190,180],el:[105,132],er:[192,134],wl:[69,137],wr:[229,137]}];
    case 'row':
    case 'rower':
      return [
        { ...seated, el: [190, 117], er: [196, 123], wl: [232, 124], wr: [237, 131] },
        { ...seated, el: [104, 129], er: [115, 135], wl: [153, 140], wr: [162, 147] },
      ];
    case 'facepull':
      return [
        { ...s, el: [124, 101], er: [196, 101], wl: [131, 132], wr: [189, 132] },
        { ...s, el: [104, 79], er: [216, 79], wl: [132, 55], wr: [188, 55] },
      ];
    case 'pallof':
      return [
        { ...s, el: [130, 126], er: [190, 126], wl: [151, 108], wr: [169, 108] },
        { ...s, el: [125, 100], er: [195, 100], wl: [102, 88], wr: [218, 88] },
      ];
    case 'legextension':
      return [seated, { ...seated, al: [249, 172], ar: [258, 178] }];
    case 'legcurl':
      return [{ ...seated, al: [249, 172], ar: [258, 178] }, seated];
    case 'legpress':
      return [
        {
          ...seated,
          head: [68, 144],
          sl: [84, 169],
          sr: [92, 175],
          hl: [125, 208],
          hr: [131, 214],
          kl: [155, 177],
          kr: [165, 182],
          al: [180, 132],
          ar: [192, 138],
        },
        {
          ...seated,
          head: [68, 144],
          sl: [84, 169],
          sr: [92, 175],
          hl: [125, 208],
          hr: [131, 214],
          kl: [174, 154],
          kr: [182, 160],
          al: [215, 104],
          ar: [226, 111],
        },
      ];
    case 'calf':
      return [
        s,
        Object.fromEntries(
          Object.entries(s).map(([key, point]) => [
            key,
            key === 'al' || key === 'ar' ? point : [point[0], point[1] - 13],
          ]),
        ) as Pose,
      ];
    case 'deadbug':
      return [
        {
          ...horizontal,
          head: [61, 239],
          sl: [88, 251],
          sr: [96, 255],
          hl: [175, 259],
          hr: [184, 262],
          el: [91, 205],
          er: [101, 210],
          wl: [93, 173],
          wr: [107, 178],
          kl: [190, 211],
          kr: [201, 217],
          al: [238, 213],
          ar: [249, 219],
        },
        {
          ...horizontal,
          head: [61, 239],
          sl: [88, 251],
          sr: [96, 255],
          hl: [175, 259],
          hr: [184, 262],
          el: [59, 248],
          er: [101, 210],
          wl: [21, 241],
          wr: [107, 178],
          kl: [190, 211],
          kr: [228, 245],
          al: [238, 213],
          ar: [278, 252],
        },
      ];
    case 'crunch':
      return [
        {
          ...horizontal,
          head: [61, 239],
          sl: [88, 251],
          sr: [96, 255],
          hl: [175, 259],
          hr: [184, 262],
          el: [91, 205],
          er: [101, 210],
          wl: [93, 173],
          wr: [107, 178],
          kl: [206, 215],
          kr: [217, 220],
          al: [238, 253],
          ar: [249, 259],
        },
        {
          ...horizontal,
          head: [75, 214],
          sl: [105, 229],
          sr: [113, 235],
          hl: [175, 259],
          hr: [184, 262],
          el: [135, 211],
          er: [145, 217],
          wl: [165, 198],
          wr: [176, 204],
          kl: [206, 215],
          kr: [217, 220],
          al: [248, 253],
          ar: [259, 259],
        },
      ];
    case 'bentRow': {
      const start: Pose = {
        ...s,
        head: [106, 122],
        sl: [125, 143],
        sr: [137, 148],
        hl: [190, 178],
        hr: [202, 181],
        el: [132, 177],
        er: [147, 183],
        wl: [128, 218],
        wr: [144, 222],
        kl: [161, 216],
        kr: [187, 220],
      };
      return [start, { ...start, el: [166, 153], er: [179, 160], wl: [153, 177], wr: [166, 184] }];
    }
    case 'birddog':
      return [
        horizontal,
        {
          ...horizontal,
          head: [78, 153],
          sl: [103, 177],
          sr: [111, 183],
          wl: [45, 173],
          el: [73, 177],
          hl: [195, 199],
          hr: [203, 205],
          kr: [245, 189],
          ar: [291, 180],
        },
      ];
    case 'cycle':
      return [
        seated,
        { ...seated, kl: [181, 202], kr: [206, 155], al: [208, 246], ar: [210, 209] },
      ];
    case 'walk':
      return [
        {
          ...s,
          kl: [124, 204],
          kr: [188, 214],
          al: [111, 257],
          ar: [203, 260],
          wl: [135, 164],
          wr: [194, 141],
        },
        {
          ...s,
          kl: [135, 220],
          kr: [192, 194],
          al: [127, 262],
          ar: [215, 248],
          wl: [125, 141],
          wr: [188, 169],
        },
      ];
    default:
      return [s, s];
  }
}
const duration = '3.6s';
const animate = (attributeName: string, a: string | number, b: string | number) => (
  <animate
    attributeName={attributeName}
    values={`${a};${b};${a}`}
    dur={duration}
    repeatCount="indefinite"
    calcMode="spline"
    keyTimes="0;.5;1"
    keySplines=".42 0 .58 1;.42 0 .58 1"
  />
);
export default function ExerciseDemo({
  exercise,
  guide,
  avatar,
  language,
  reducedMotion,
}: {
  exercise: Exercise;
  guide: Guide;
  avatar?: Avatar;
  language: Language;
  reducedMotion: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [playing, setPlaying] = useState(
    !reducedMotion && !matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const movement =
    exercise.id === 'triceps-extension'
      ? 'tricepsOverhead'
      : guide.movement === 'row' && ['Dumbbell', 'Barbell'].includes(exercise.equipment)
        ? 'bentRow'
        : guide.movement;
  const [a, b] = poses(movement);
  useEffect(() => {
    if (playing && !reducedMotion && document.visibilityState === 'visible')
      svg.current?.unpauseAnimations();
    else svg.current?.pauseAnimations();
    const visibility = () => {
      if (playing && !reducedMotion && document.visibilityState === 'visible')
        svg.current?.unpauseAnimations();
      else svg.current?.pauseAnimations();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [playing, reducedMotion]);
  const path = (pose: Pose, keys: (keyof Pose)[]) =>
    keys.map((key, index) => `${index ? 'L' : 'M'}${pose[key].join(' ')}`).join(' ');
  const skin = SKIN_COLORS[avatar?.skin ?? 1];
  const kit = SHIRT_COLORS[avatar?.shirt ?? 0];
  const groups: [(keyof Pose)[], string, number][] = [
    [
      ['hl', 'kl', 'al'],
      guide.primary.some((muscle) => ['quads', 'hamstrings', 'glutes', 'calves'].includes(muscle))
        ? 'var(--muscle-primary)'
        : 'var(--figure-legs)',
      15,
    ],
    [['hr', 'kr', 'ar'], 'var(--figure-legs)', 15],
    [['sl', 'hl'], 'var(--figure-shirt)', 22],
    [['sr', 'hr'], 'var(--figure-shirt)', 22],
    [
      ['sl', 'el', 'wl'],
      guide.primary.some((muscle) => ['biceps', 'triceps'].includes(muscle))
        ? 'var(--muscle-primary)'
        : skin,
      11,
    ],
    [['sr', 'er', 'wr'], skin, 11],
  ];
  return (
    <div className="exercise-demo">
      <svg
        ref={svg}
        viewBox="0 0 320 290"
        role="img"
        aria-label={`${exercise.name} movement demonstration`}
        style={{ '--figure-shirt': kit } as CSSProperties}
      >
        <path d="M32 269h256" stroke="var(--line)" strokeWidth="2" />
        {['press', 'legextension', 'legcurl', 'cycle', 'row', 'rower', 'legpress'].includes(
          guide.movement,
        ) && (
          <path
            d="M79 180h81M91 180v84M157 180v84"
            fill="none"
            stroke="var(--equipment)"
            strokeWidth="7"
            strokeLinecap="round"
          />
        )}
        {guide.movement === 'pull' && (
          <path
            d="M94 16h132M105 16v251M215 16v251"
            stroke="var(--equipment)"
            strokeWidth="5"
            fill="none"
          />
        )}
        {groups.map(([keys, color, width], index) => (
          <path
            key={index}
            d={path(a, keys)}
            fill="none"
            stroke={color}
            strokeWidth={width}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {animate('d', path(a, keys), path(b, keys))}
          </path>
        ))}
        <path d={path(a, ['sl', 'sr', 'hr', 'hl', 'sl'])} fill={kit}>
          {animate(
            'd',
            path(a, ['sl', 'sr', 'hr', 'hl', 'sl']),
            path(b, ['sl', 'sr', 'hr', 'hl', 'sl']),
          )}
        </path>
        <circle cx={a.head[0]} cy={a.head[1]} r="17" fill={skin}>
          {animate('cx', a.head[0], b.head[0])}
          {animate('cy', a.head[1], b.head[1])}
        </circle>
        {[a.head[0] - 5, a.head[0] + 5].map((x, index) => (
          <circle key={index} cx={x} cy={a.head[1]} r="1.8" fill="#352e2b">
            {animate('cx', x, b.head[0] + (index ? 5 : -5))}
            {animate('cy', a.head[1], b.head[1])}
          </circle>
        ))}
        {exercise.equipment === 'Dumbbell' &&
          (['wl', 'wr'] as const).map((hand) => (
            <path
              key={hand}
              d={`M${a[hand][0] - 10} ${a[hand][1]}h20`}
              stroke="var(--equipment)"
              strokeWidth="13"
              strokeLinecap="round"
            >
              {animate(
                'd',
                `M${a[hand][0] - 10} ${a[hand][1]}h20`,
                `M${b[hand][0] - 10} ${b[hand][1]}h20`,
              )}
            </path>
          ))}
        {exercise.equipment === 'Barbell' && (
          <path
            d={path(a, ['wl', 'wr'])}
            stroke="var(--equipment)"
            strokeWidth="7"
            strokeLinecap="round"
          >
            {animate('d', path(a, ['wl', 'wr']), path(b, ['wl', 'wr']))}
          </path>
        )}
      </svg>
      <button
        className="button secondary compact"
        aria-pressed={playing && !reducedMotion}
        onClick={() => setPlaying(!playing)}
        disabled={reducedMotion}
      >
        {playing && !reducedMotion ? (
          <Pause size={16} aria-hidden="true" />
        ) : (
          <Play size={16} aria-hidden="true" />
        )}
        {featureT(language, playing && !reducedMotion ? 'pause' : 'play')}
      </button>
    </div>
  );
}
