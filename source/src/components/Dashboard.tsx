import { ArrowRight, ArrowUpRight, Check, Flame, Pencil, Play } from 'lucide-react';
import type { AppData, DayPlan } from '../model';
import { EXERCISES } from '../model';
import { getProgress, getSuggestions, localDate } from '../engine';
import { exerciseText, suggestionText, useT } from '../i18n';
import { LOCALES, kgToDisplay, type Page } from '../ui';
import { readWorkoutDraft } from './Workout';
import RankEmblem from './RankEmblem';
import DailyQuests from './DailyQuests';
import { rankStyle } from '../ranks';

export default function Dashboard({
  data,
  onNavigate,
  onEditDay,
  onStart,
  onChange,
  notify,
}: {
  data: AppData;
  onNavigate: (page: Page) => void;
  onEditDay: (day: number) => void;
  onStart: (plan: DayPlan) => void;
  onChange: (data: AppData) => void;
  notify: (message: string) => void;
}) {
  const t = useT(data.settings.language);
  const locale = LOCALES[data.settings.language];
  const today = new Date();
  const plan = data.plans[String(today.getDay())];
  const draft = readWorkoutDraft();
  const sessionPlan = draft?.plan ?? plan;
  const hasWorkout = Boolean(sessionPlan?.exercises.length);
  const progress = getProgress(data);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return date;
  });
  const completedDays = new Set(
    data.sessions
      .filter((s) => s.date >= localDate(monday) && s.date <= localDate(today))
      .map((s) => s.date),
  );
  return (
    <section className="page dashboard">
      <header className="page-heading">
        <div>
          <p className="date-label">
            {today.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1>{t('dashboardTitle')}</h1>
        </div>
        <span className="streak-pill">
          <Flame size={18} aria-hidden="true" /> {t('streak')}: {progress.streak}
        </span>
      </header>
      <button
        className="rank-summary"
        style={rankStyle(progress.xp, progress.rank.color)}
        onClick={() => onNavigate('progress')}
      >
        <RankEmblem xp={progress.xp} size={72} color={progress.rank.color} />
        <div className="rank-summary-copy">
          <span className="muted">{t('currentRank')}</span>
          <strong>{progress.rank.name}</strong>
          <div className="rank-summary-progress">
            <span>{progress.xp.toLocaleString(locale)} XP</span>
            <span>{Math.round(progress.percent)}%</span>
          </div>
          <progress max="100" value={progress.percent} aria-label={t('currentRank')} />
        </div>
        <ArrowUpRight size={20} aria-hidden="true" />
      </button>
      <section className="today-workout" aria-label={t('todayPlan')}>
        <div className="section-heading">
          <div>
            <span className="section-label">{draft ? t('resumeWorkout') : t('todayPlan')}</span>
            <h2>{hasWorkout ? sessionPlan.title : t('restDay')}</h2>
          </div>
          <button className="button ghost" onClick={() => onEditDay(today.getDay())}>
            <Pencil size={16} aria-hidden="true" />
            {t('editPlan')}
          </button>
        </div>
        {hasWorkout ? (
          <>
            <ul className="today-exercises">
              {sessionPlan.exercises.map((item, index) => {
                const definition = EXERCISES.find((exercise) => exercise.id === item.exerciseId)!;
                const quantity =
                  item.exerciseId === 'plank'
                    ? t('seconds')
                    : ['walk', 'cycle', 'rower'].includes(item.exerciseId)
                      ? t('minutes')
                      : t('reps');
                return (
                  <li key={item.id}>
                    <span className="list-number">{index + 1}</span>
                    <div>
                      <strong>{exerciseText(data.settings.language, definition).name}</strong>
                      <span>
                        {item.sets} {t('sets')} × {item.reps} {quantity}
                        {item.weight > 0
                          ? ` · ${kgToDisplay(item.weight, data).toFixed(1)} ${data.settings.units}`
                          : ''}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            {sessionPlan.note && (
              <details className="workout-note-disclosure">
                <summary>{t('dayNote')}</summary>
                <p>{sessionPlan.note}</p>
              </details>
            )}
            <div className="today-action">
              <button className="button primary" onClick={() => onStart(sessionPlan)}>
                <Play size={16} aria-hidden="true" />
                {draft ? t('resumeWorkout') : t('startWorkout')}
              </button>
              <span className="muted">
                {t('exerciseCount', { count: sessionPlan.exercises.length })}
              </span>
            </div>
          </>
        ) : (
          <div className="rest-day-content">
            <p>{t('noPlan')}</p>
            <button className="button primary" onClick={() => onNavigate('planner')}>
              {t('buildYourPlan')}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </section>
      <DailyQuests data={data} onChange={onChange} notify={notify} />
      <section className="week-section">
        <div className="section-heading">
          <h2>{t('weekSchedule')}</h2>
          <span className="muted">
            {completedDays.size} / {data.profile!.daysPerWeek} {t('workouts')}
          </span>
        </div>
        <div className="week-overview">
          {weekDays.map((date) => {
            const value = localDate(date);
            const completed = completedDays.has(value);
            const dayPlan = data.plans[String(date.getDay())];
            return (
              <button
                key={value}
                className={`week-day ${value === localDate(today) ? 'current' : ''}`}
                onClick={() => onEditDay(date.getDay())}
                aria-label={`${date.toLocaleDateString(locale, { weekday: 'long' })}, ${completed ? t('logged') : dayPlan?.exercises.length ? dayPlan.title : t('restDay')}`}
              >
                <span>{date.toLocaleDateString(locale, { weekday: 'short' })}</span>
                <strong>{date.getDate()}</strong>
                <span className="day-status">
                  {completed ? (
                    <Check size={16} aria-hidden="true" />
                  ) : dayPlan?.exercises.length ? (
                    '•'
                  ) : (
                    '—'
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <div className="training-totals">
        <div>
          <span>{t('workouts')}</span>
          <strong>{data.sessions.length}</strong>
        </div>
        <div>
          <span>{t('completedSets')}</span>
          <strong>{progress.totalSets}</strong>
        </div>
        <div>
          <span>{t('totalVolume')}</span>
          <strong>
            {Math.round(kgToDisplay(progress.totalVolume, data)).toLocaleString(locale)}{' '}
            <small>{data.settings.units}</small>
          </strong>
        </div>
      </div>
      <p className="training-guidance">
        {suggestionText(data.settings.language, getSuggestions(data)[0])}
      </p>
    </section>
  );
}
