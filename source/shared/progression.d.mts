export interface PublicRank {
  name: string;
  minXp: number;
  subtitle: string;
  color: string;
}
export type QuestTier = 'easy' | 'medium' | 'hard';
export type QuestLevel = 'foundation' | 'standard' | 'advanced';
export interface DailyQuest {
  tier: QuestTier;
  kind: 'sets' | 'reps' | 'variety' | 'exercise';
  target: number;
  exerciseIds?: string[];
  xp: number;
}
export interface QuestMetrics {
  sets: number;
  reps: number;
  variety: number;
  byExercise: Record<string, number>;
}
export const PUBLIC_RANKS: PublicRank[];
export const QUEST_XP: Record<QuestTier, number>;
export const TIMED_IDS: string[];
export function publicRank(xp: number): PublicRank;
export function dailyQuests(date: string, level?: QuestLevel): DailyQuest[];
export function questMetrics(
  sessions: {
    date: string;
    exercises: {
      exerciseId?: string;
      name?: string;
      sets: { reps: number; done?: boolean; seconds?: number }[];
    }[];
  }[],
  date?: string,
): QuestMetrics;
export function questValue(quest: DailyQuest, metrics: QuestMetrics): number;
