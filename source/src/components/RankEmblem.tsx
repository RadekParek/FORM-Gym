import { RANKS } from '../model';
import { rankStyle } from '../ranks';

interface Props {
  xp: number;
  size?: number;
  color?: string;
}

/** A decorative rank marker. Its surrounding text carries the accessible rank name. */
export default function RankEmblem({ xp, size = 96, color }: Props) {
  const tier = Math.max(1, RANKS.filter((rank) => Number.isFinite(xp) && xp >= rank.minXp).length);
  return (
    <svg
      className="rank-emblem"
      style={rankStyle(xp, color)}
      data-tier={tier}
      data-count={RANKS.length}
      width={size}
      height={Math.round(size * 1.1)}
      viewBox="0 0 120 132"
      aria-hidden="true"
      focusable="false"
    >
      <path className="rank-emblem-shell" d="M60 5 105 22V76L92 96 60 122 28 96 15 76V22Z" />
      <path className="rank-emblem-inset" d="M60 16 94 29V73L84 89 60 109 36 89 26 73V29Z" />
      <path className="rank-emblem-mark" d="m60 26 5 8-5 8-5-8Z" />
      <path
        className="rank-emblem-laurel"
        d="m34 48 6 7-5 2m-2 6 7 6-4 3m3 6 8 4m39-34-6 7 5 2m2 6-7 6 4 3m-3 6-8 4"
      />
      <text className="rank-emblem-ordinal" x="60" y="73" textAnchor="middle">
        {String(tier).padStart(2, '0')}
      </text>
      {RANKS.map((rank, index) => (
        <path
          key={rank.minXp}
          className={`rank-emblem-tick ${index < tier ? 'earned' : ''}`}
          d={`M${34 + index * 6} 92h4v5h-4Z`}
        />
      ))}
    </svg>
  );
}
