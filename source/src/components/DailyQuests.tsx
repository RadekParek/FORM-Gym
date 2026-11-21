import { Check, Flag, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AppData } from '../model';
import { dailyQuests, questLevel, questMetrics, questValue, claimQuest } from '../quests';
import { localDate } from '../engine';
import { featureT } from '../feature-i18n';
import { EXERCISES } from '../model';
import { exerciseText } from '../i18n';

export default function DailyQuests({
  data,
  onChange,
  notify,
}: {
  data: AppData;
  onChange: (data: AppData) => void;
  notify: (text: string) => void;
}) {
  const [date, setDate] = useState(localDate);
  useEffect(() => {
    const timer = setInterval(() => setDate(localDate()), 60000);
    return () => clearInterval(timer);
  }, []);
  const metrics = questMetrics(data.sessions, date);
  const t = (key: Parameters<typeof featureT>[1], values?: Record<string, string | number>) =>
    featureT(data.settings.language, key, values);
  return (
    <section className="quest-section section-block">
      <header className="section-heading">
        <div>
          <span className="eyebrow">{t('resets')}</span>
          <h2>{t('quests')}</h2>
          <p className="muted">{t('questsBody')}</p>
        </div>
        <Flag size={22} aria-hidden="true" />
      </header>
      <div className="quest-grid stagger-list">
        {dailyQuests(date, questLevel(data)).map((quest, index) => {
          const value = questValue(quest, metrics);
          const claimed = data.questClaims?.some(
            (claim) => claim.date === date && claim.tier === quest.tier,
          );
          const ready = value >= quest.target;
          const definition = EXERCISES.find((exercise) => exercise.id === quest.exerciseIds?.[0]);
          const label = t(
            quest.kind === 'exercise'
              ? 'questExercise'
              : quest.kind === 'sets'
                ? 'questSets'
                : quest.kind === 'variety'
                  ? 'questVariety'
                  : 'questReps',
            {
              n: quest.target,
              exercise: definition ? exerciseText(data.settings.language, definition).name : '',
            },
          );
          return (
            <article
              key={quest.tier}
              className={`quest-card ${claimed ? 'quest-done' : ''}`}
              style={{ animationDelay: `${index * 55}ms` }}
            >
              <div className="quest-top">
                <span className={`quest-level ${quest.tier}`}>{t(quest.tier)}</span>
                <strong>+{quest.xp} XP</strong>
              </div>
              <h3>{label}</h3>
              <progress
                max={quest.target}
                value={Math.min(value, quest.target)}
                aria-label={label}
              />
              <div className="quest-bottom">
                <span className="muted">
                  {Math.min(value, quest.target)} / {quest.target}
                </span>
                <button
                  className={`button ${ready && !claimed ? 'primary' : 'secondary'} compact`}
                  disabled={!ready || claimed}
                  onClick={() => {
                    const next = claimQuest(data, date, quest.tier);
                    if (next !== data) {
                      onChange(next);
                      notify(`${t('questSuccess')} · +${quest.xp} XP`);
                    }
                  }}
                >
                  {claimed ? (
                    <Check size={16} aria-hidden="true" />
                  ) : (
                    <Sparkles size={16} aria-hidden="true" />
                  )}
                  {t(claimed ? 'claimed' : 'claim')}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <p className="fine-print">{t('questHelp')}</p>
    </section>
  );
}
