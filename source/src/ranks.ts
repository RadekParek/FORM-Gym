import type { CSSProperties } from 'react';
import { publicRank } from '../shared/progression.mjs';

export function rankStyle(xp: number, color?: string): CSSProperties {
  return { '--rank-color': color || publicRank(xp).color } as CSSProperties;
}
