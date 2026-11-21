import type { Guide, Muscle } from '../exerciseGuides';
import { MUSCLE_NAMES } from '../exerciseGuides';

const front: Partial<Record<Muscle, string>> = {
  chest: 'M37 63Q44 58 58 63L58 85Q48 89 40 81ZM83 63Q76 58 62 63L62 85Q72 89 80 81Z',
  shoulders: 'M33 61Q22 61 24 78L34 82L39 65ZM87 61Q98 61 96 78L86 82L81 65Z',
  biceps: 'M25 81L33 84L29 107L21 103ZM95 81L87 84L91 107L99 103Z',
  core: 'M47 89L73 89L71 122L49 122Z',
  quads: 'M41 134L57 135L54 174L42 181L36 161ZM79 134L63 135L66 174L78 181L84 161Z',
  calves: 'M42 186L53 185L51 210L44 220ZM78 186L67 185L69 210L76 220Z',
};
const back: Partial<Record<Muscle, string>> = {
  upperBack: 'M39 61L60 57L81 61L75 87L45 87Z',
  lats: 'M38 75L55 86L54 112L43 107ZM82 75L65 86L66 112L77 107Z',
  shoulders: front.shoulders,
  triceps: 'M25 81L33 84L29 110L21 104ZM95 81L87 84L91 110L99 104Z',
  core: 'M51 96L69 96L70 125L50 125Z',
  glutes: 'M40 120Q48 116 58 125L57 145L41 145ZM80 120Q72 116 62 125L63 145L79 145Z',
  hamstrings: 'M41 148L56 149L53 183L42 181ZM79 148L64 149L67 183L78 181Z',
  calves: 'M41 188Q47 182 54 189L51 216L44 220ZM79 188Q73 182 66 189L69 216L76 220Z',
};
export default function MuscleMap({
  guide,
  view = 'front',
  size = 140,
  decorative = false,
}: {
  guide: Guide;
  view?: 'front' | 'back';
  size?: number;
  decorative?: boolean;
}) {
  const regions = view === 'front' ? front : back;
  return (
    <svg
      className="muscle-map"
      width={size}
      height={Math.round(size * 1.9)}
      viewBox="0 0 120 232"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={
        decorative
          ? undefined
          : `${view}. Primary muscles: ${guide.primary.map((muscle) => MUSCLE_NAMES[muscle]).join(', ')}. Supporting: ${guide.secondary.map((muscle) => MUSCLE_NAMES[muscle]).join(', ')}`
      }
    >
      <circle cx="60" cy="25" r="17" fill="var(--anatomy-base)" />
      <path
        d="M52 43V54L37 57Q24 58 21 72L12 112L14 134L23 134L29 105L34 91L38 123L34 148L38 183L40 218L35 226H53L56 183L60 153L64 183L67 226H85L80 218L82 183L86 148L82 123L86 91L91 105L97 134L106 134L108 112L99 72Q96 58 83 57L68 54V43Z"
        fill="var(--anatomy-base)"
        stroke="var(--anatomy-line)"
        strokeWidth="1"
      />
      {Object.entries(regions).map(([muscle, path]) => (
        <path
          key={muscle}
          d={path}
          fill={
            guide.primary.includes(muscle as Muscle)
              ? 'var(--muscle-primary)'
              : guide.secondary.includes(muscle as Muscle)
                ? 'var(--muscle-secondary)'
                : 'var(--anatomy-detail)'
          }
          stroke="var(--anatomy-base)"
          strokeWidth="1"
        >
          <title>{MUSCLE_NAMES[muscle as Muscle]}</title>
        </path>
      ))}
      <path
        d="M60 62V125M48 98h24M49 107h22M50 115h20"
        fill="none"
        stroke="var(--anatomy-line)"
        opacity=".45"
      />
    </svg>
  );
}
