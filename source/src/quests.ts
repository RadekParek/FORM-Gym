import type { AppData, QuestClaim } from './model';
import {
  dailyQuests,
  QUEST_XP,
  questMetrics,
  questValue,
  type QuestLevel,
  type QuestTier,
} from '../shared/progression.mjs';

export { dailyQuests, questMetrics, questValue, QUEST_XP };
export function questLevel(data: AppData): QuestLevel {
  const profile = data.profile;
  if (!profile || profile.age < 18 || profile.age >= 65 || profile.conditions.length)
    return 'foundation';
  return profile.experience >= 2 ? 'advanced' : 'standard';
}
export function questBonus(claims: QuestClaim[] = []): number {
  return claims.reduce((sum, claim) => sum + QUEST_XP[claim.tier], 0);
}
export function claimQuest(data: AppData, date: string, tier: QuestTier): AppData {
  const level = questLevel(data);
  const quest = dailyQuests(date, level).find((entry) => entry.tier === tier)!;
  if (data.questClaims?.some((claim) => claim.date === date && claim.tier === tier)) return data;
  if (questValue(quest, questMetrics(data.sessions, date)) < quest.target) return data;
  return { ...data, questClaims: [...(data.questClaims || []), { date, tier, level }] };
}
