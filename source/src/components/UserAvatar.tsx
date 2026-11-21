import { useId } from 'react';
import type { Avatar } from '../model';

export const SKIN_COLORS = ['#f4c9a5', '#dcaa85', '#ba825e', '#8a593e', '#593d30'];
export const SHIRT_COLORS = ['#c8a66d', '#7eb3c5', '#b696ce', '#7db19a'];
const HAIR_COLORS = ['#25232a', '#6a4935', '#c4a170', '#e2d9ce'];
export default function UserAvatar({
  avatar = { skin: 1, hair: 0, shirt: 0 },
  size = 80,
  decorative = true,
}: {
  avatar?: Avatar;
  size?: number;
  decorative?: boolean;
}) {
  const id = useId().replaceAll(':', '');
  const skin = SKIN_COLORS[avatar.skin] || SKIN_COLORS[1];
  const kit = SHIRT_COLORS[avatar.shirt] || SHIRT_COLORS[0];
  return (
    <svg
      className="user-avatar"
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : 'Your training character'}
    >
      <defs>
        <clipPath id={id}>
          <circle cx="60" cy="60" r="57" />
        </clipPath>
      </defs>
      <circle cx="60" cy="60" r="58" fill="var(--panel-2)" />
      <g clipPath={`url(#${id})`}>
        <path d="M14 122V106Q17 87 43 82L77 82Q103 87 106 106V122Z" fill={kit} />
        <path d="M49 68V83Q60 96 71 83V68Z" fill={skin} />
        <ellipse cx="60" cy="50" rx="25" ry="31" fill={skin} />
        <path
          d={
            avatar.hair === 3
              ? 'M36 42Q36 18 60 19Q84 18 84 42L78 32Q61 39 42 30Z'
              : avatar.hair === 2
                ? 'M34 49L32 28Q48 8 76 18L90 30L84 52L79 33L69 35L62 28L41 38L40 53Z'
                : avatar.hair === 1
                  ? 'M35 44Q30 18 59 17Q88 17 85 46L79 31Q61 42 41 32Z'
                  : 'M36 45Q31 17 58 15Q89 13 85 46L79 34L72 26L43 32Z'
          }
          fill={HAIR_COLORS[avatar.hair]}
        />
        <path d="M43 48h10m14 0h10" stroke="#312623" strokeWidth="2" strokeLinecap="round" />
        <circle cx="49" cy="54" r="2.5" fill="#282322" />
        <circle cx="71" cy="54" r="2.5" fill="#282322" />
        <path
          d="M55 66Q60 69 65 66"
          stroke="#8f5141"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M31 104h15M75 104h15" stroke="white" opacity=".26" strokeWidth="2" />
        <path d="M57 103h6v10h-6Z" fill="#171a22" opacity=".6" />
      </g>
      <circle cx="60" cy="60" r="58" fill="none" stroke="var(--line)" strokeWidth="2" />
    </svg>
  );
}
