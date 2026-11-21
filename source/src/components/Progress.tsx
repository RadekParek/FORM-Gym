import { useState, type KeyboardEvent } from 'react';
import { ArrowDownToLine, ArrowRight, Check, Flag, Plus, Trophy, X } from 'lucide-react';
import { EXERCISES, EXTENDED_RANK, RANKS, type AppData, type Session, type SetLog } from '../model';
import { getProgress, isPremium, localDate, uid } from '../engine';
import { useT, exerciseText } from '../i18n';
import { LOCALES, kgToDisplay, displayToKg } from '../ui';
import { exportTrainingReport } from '../report';
import ShareCard from './ShareCard';
import RankEmblem from './RankEmblem';
import { rankStyle } from '../ranks';

interface Props {
  data: AppData;
  onChange: (data: AppData) => void;
  onPremium: () => void;
  notify: (text: string) => void;
}
type Tab = 'overview' | 'history' | 'ranks';
const tabs: Tab[] = ['overview', 'history', 'ranks'];
const timedIds = new Set(['plank', 'walk', 'cycle', 'rower']);

function CurrentRankCard({
  data,
  progress,
  onViewRanks,
}: {
  data: AppData;
  progress: ReturnType<typeof getProgress>;
  onViewRanks?: () => void;
}) {
  const t = useT(data.settings.language);
  const locale = LOCALES[data.settings.language];
  const remaining = progress.nextRank ? Math.max(0, progress.nextRank.minXp - progress.xp) : 0;
  return (
    <section
      className="current-rank-card"
      style={rankStyle(progress.xp, progress.rank.color)}
      aria-label={t('currentRank')}
    >
      <RankEmblem xp={progress.xp} size={112} color={progress.rank.color} />
      <div className="current-rank-copy">
        <p className="muted">{t('currentRank')}</p>
        <h2>{progress.rank.name}</h2>
        <p className="rank-xp-line">
          <strong>{progress.xp.toLocaleString(locale)} XP</strong>
          <span>
            {progress.nextRank
              ? t('xpToNext', {
                  xp: remaining.toLocaleString(locale),
                  rank: progress.nextRank.name,
                })
              : t('topRank')}
          </span>
        </p>
        <div
          className="progress-track"
          role="progressbar"
          aria-label={t('nextRank')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress.percent)}
          aria-valuetext={
            progress.nextRank
              ? `${Math.round(progress.percent)}% · ${progress.nextRank.name}`
              : t('topRank')
          }
        >
          <i style={{ width: `${progress.percent}%` }} />
        </div>
        <div className="rank-current-summary">
          <span>
            {progress.nextRank ? `${t('nextRank')}: ${progress.nextRank.name}` : t('topRank')}
          </span>
          {onViewRanks && (
            <button className="text-button" onClick={onViewRanks}>
              {t('viewRanks')}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Progress({ data, onChange, notify }: Props) {
  const t = useT(data.settings.language);
  const progress = getProgress(data);
  const premium = isPremium(data);
  const locale = LOCALES[data.settings.language];
  const [tab, setTab] = useState<Tab>('overview');
  const [newWeight, setNewWeight] = useState('');
  const [shareSession, setShareSession] = useState<Session | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const weeks = Array.from({ length: 8 }, (_, index) => {
    const end = new Date();
    end.setDate(end.getDate() - (7 - index) * 7);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    return {
      label: end.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
      count: data.sessions.filter(
        (session) => session.date >= localDate(start) && session.date <= localDate(end),
      ).length,
    };
  });
  const maxWeek = Math.max(1, ...weeks.map((week) => week.count));
  const records = EXERCISES.filter((exercise) => !timedIds.has(exercise.id))
    .map((exercise) => {
      const sets = data.sessions
        .flatMap((session) =>
          session.exercises
            .filter((entry) => entry.exerciseId === exercise.id)
            .flatMap((entry) => entry.sets),
        )
        .filter((set) => set.done && set.reps > 0 && set.weight > 0);
      return {
        ...exercise,
        max: Math.max(0, ...sets.map((set) => set.weight)),
        estimate: Math.max(
          0,
          ...sets.filter((set) => set.reps <= 12).map((set) => set.weight * (1 + set.reps / 30)),
        ),
      };
    })
    .filter((exercise) => exercise.max > 0)
    .sort((a, b) => b.max - a.max);
  const visibleRanks = premium ? [...RANKS, EXTENDED_RANK] : RANKS;
  const todayPlan = data.plans[String(new Date().getDay())];
  const milestones = [
    { label: 'firstSession', done: data.sessions.length >= 1 },
    { label: 'tenSessions', done: data.sessions.length >= 10 },
    { label: 'hundredSets', done: progress.totalSets >= 100 },
    {
      label: 'fourWeek',
      done: weeks.slice(-4).every((week) => week.count >= data.profile!.daysPerWeek),
    },
  ];

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index + tabs.length - 1) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : null;
    if (target === null) return;
    event.preventDefault();
    setTab(tabs[target]);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [target]?.focus();
  }

  function saveWeight() {
    const value = displayToKg(Number(newWeight), data);
    if (!newWeight || !Number.isFinite(value) || value < 20 || value > 350) {
      notify(t('weightInvalid'));
      return;
    }
    onChange({
      ...data,
      bodyLogs: [
        ...data.bodyLogs.filter((log) => log.date !== localDate()),
        { date: localDate(), weight: value },
      ],
      profile: { ...data.profile!, weight: value },
    });
    setNewWeight('');
    notify(t('weightSaved'));
  }

  function saveTemplate() {
    if (!todayPlan?.exercises.length) return;
    onChange({
      ...data,
      templates: [
        ...data.templates,
        { id: uid(), name: todayPlan.title, plan: structuredClone(todayPlan) },
      ].slice(-30),
    });
    notify(t('templateSaved'));
  }

  function setText(exerciseId: string, set: SetLog) {
    if (timedIds.has(exerciseId))
      return `${set.reps} ${t(exerciseId === 'plank' ? 'seconds' : 'minutes')}`;
    return `${set.reps} × ${kgToDisplay(set.weight, data).toFixed(1)} ${data.settings.units}`;
  }

  async function downloadReport() {
    setReportBusy(true);
    try {
      await exportTrainingReport(data);
    } catch {
      notify(t('exportFailed'));
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <section className="page progress-page">
      <header className="page-heading">
        <h1>{t('progressTitle')}</h1>
      </header>
      <div className="progress-tabs" role="tablist" aria-label={t('progress')}>
        {tabs.map((item, index) => (
          <button
            key={item}
            id={`progress-tab-${item}`}
            className={`tab-button ${tab === item ? 'active' : ''}`}
            role="tab"
            aria-selected={tab === item}
            aria-controls={`progress-panel-${item}`}
            tabIndex={tab === item ? 0 : -1}
            onClick={() => setTab(item)}
            onKeyDown={(event) => navigateTabs(event, index)}
          >
            {t(item)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div
          id="progress-panel-overview"
          role="tabpanel"
          aria-labelledby="progress-tab-overview"
          className="progress-overview"
        >
          <CurrentRankCard data={data} progress={progress} onViewRanks={() => setTab('ranks')} />
          <dl className="metrics-row">
            <div>
              <dt>{t('workouts')}</dt>
              <dd>{data.sessions.length.toLocaleString(locale)}</dd>
            </div>
            <div>
              <dt>{t('completedSets')}</dt>
              <dd>{progress.totalSets.toLocaleString(locale)}</dd>
            </div>
            <div>
              <dt>{t('totalVolume')}</dt>
              <dd>
                {Math.round(kgToDisplay(progress.totalVolume, data)).toLocaleString(locale)}{' '}
                <small>{data.settings.units}</small>
              </dd>
            </div>
          </dl>
          {data.sessions.length > 0 && (
            <section className="section-block trend-panel">
              <div className="section-heading">
                <h2>{t('weekSummary')}</h2>
                <span className="muted">8 {t('week')}</span>
              </div>
              <div
                className="bar-chart"
                role="img"
                aria-label={`${t('workouts')}: ${weeks.map((week) => `${week.label} ${week.count}`).join(', ')}`}
              >
                <div className="chart-y-label">{t('workouts')}</div>
                {weeks.map((week) => (
                  <div className="chart-column" key={week.label}>
                    <span>{week.count}</span>
                    <div style={{ height: `${(week.count / maxWeek) * 130}px` }} />
                    <small>{week.label}</small>
                  </div>
                ))}
              </div>
              <p className="chart-caption muted">
                {t('weekSummary')} · {t('logged')}
              </p>
            </section>
          )}
          {records.length > 0 && (
            <section className="section-block">
              <div className="section-heading">
                <h2>{t('personalRecords')}</h2>
              </div>
              <ul className="plain-list records-list">
                {records.map((exercise) => (
                  <li className="record-row" key={exercise.id}>
                    <strong>{exerciseText(data.settings.language, exercise).name}</strong>
                    <span>
                      {kgToDisplay(exercise.max, data).toFixed(1)} {data.settings.units}
                    </span>
                    {premium && (
                      <small>
                        {t('estimated1RM')}: {kgToDisplay(exercise.estimate, data).toFixed(1)}{' '}
                        {data.settings.units}
                      </small>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="section-block body-panel">
            <div className="section-heading">
              <h2>{t('bodyweight')}</h2>
              <strong>
                {kgToDisplay(data.profile!.weight, data).toFixed(1)} {data.settings.units}
              </strong>
            </div>
            <p className="muted">{t('weightHint')}</p>
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                saveWeight();
              }}
            >
              <label className="field">
                {t('bodyweight')} ({data.settings.units})
                <input
                  type="number"
                  step="0.1"
                  min={data.settings.units === 'kg' ? 20 : 44.1}
                  max={data.settings.units === 'kg' ? 350 : 771.7}
                  value={newWeight}
                  onChange={(event) => setNewWeight(event.target.value)}
                />
              </label>
              <button className="button secondary" type="submit">
                {t('updateWeight')}
              </button>
            </form>
            {data.bodyLogs.length > 0 && (
              <div className="weight-history">
                {data.bodyLogs
                  .slice(-4)
                  .reverse()
                  .map((log) => (
                    <div key={log.date}>
                      <span>{new Date(`${log.date}T12:00:00`).toLocaleDateString(locale)}</span>
                      <strong>
                        {kgToDisplay(log.weight, data).toFixed(1)} {data.settings.units}
                      </strong>
                    </div>
                  ))}
              </div>
            )}
          </section>
          {premium && (
            <details className="section-block advanced-tools">
              <summary>{t('advancedTools')}</summary>
              <div className="section-heading">
                <h2>{t('templates')}</h2>
                <button
                  className="button secondary"
                  disabled={!todayPlan?.exercises.length}
                  onClick={saveTemplate}
                >
                  <Plus size={18} aria-hidden="true" />
                  {t('saveTemplate')}
                </button>
              </div>
              {data.templates.length > 0 && (
                <ul className="plain-list template-list">
                  {data.templates.map((template) => (
                    <li className="record-row" key={template.id}>
                      <strong>{template.name}</strong>
                      <select
                        aria-label={`${t('chooseDay')} ${template.name}`}
                        defaultValue=""
                        onChange={(event) => {
                          const day = event.target.value;
                          if (!day) return;
                          onChange({
                            ...data,
                            plans: { ...data.plans, [day]: structuredClone(template.plan) },
                          });
                          notify(t('planSaved'));
                          event.target.value = '';
                        }}
                      >
                        <option value="">{t('chooseDay')}</option>
                        {Array.from({ length: 7 }, (_, day) => (
                          <option value={day} key={day}>
                            {new Date(2026, 10, 15 + day).toLocaleDateString(locale, {
                              weekday: 'long',
                            })}
                          </option>
                        ))}
                      </select>
                      <button
                        className="icon-button"
                        aria-label={`${t('delete')} ${template.name}`}
                        onClick={() =>
                          onChange({
                            ...data,
                            templates: data.templates.filter((entry) => entry.id !== template.id),
                          })
                        }
                      >
                        <X size={18} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                className="button secondary report-button"
                disabled={reportBusy}
                onClick={() => void downloadReport()}
              >
                <ArrowDownToLine size={18} aria-hidden="true" />
                {t('downloadReport')}
              </button>
            </details>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div
          id="progress-panel-history"
          role="tabpanel"
          aria-labelledby="progress-tab-history"
          className="section-block progress-history"
        >
          {data.sessions.length ? (
            data.sessions
              .slice()
              .reverse()
              .map((session) => (
                <details className="history-detail" key={session.id}>
                  <summary>
                    <span>{session.title}</span>
                    <span>
                      {new Date(`${session.date}T12:00:00`).toLocaleDateString(locale)} ·{' '}
                      {session.duration < 60
                        ? `${Math.round(session.duration)} ${t('seconds')}`
                        : `${Math.round(session.duration / 60)} ${t('minutes')}`}{' '}
                      · +{session.xp} XP
                    </span>
                  </summary>
                  <div className="session-details">
                    {session.exercises.map((exercise) => {
                      const definition = EXERCISES.find(
                        (entry) => entry.id === exercise.exerciseId,
                      );
                      const sets = exercise.sets.filter((set) => set.done);
                      if (!sets.length) return null;
                      return (
                        <p key={exercise.id}>
                          <strong>
                            {definition
                              ? exerciseText(data.settings.language, definition).name
                              : t('exercise')}
                          </strong>{' '}
                          — {sets.map((set) => setText(exercise.exerciseId, set)).join(' / ')}
                        </p>
                      );
                    })}
                    {session.note && <p className="session-text">{session.note}</p>}
                    {premium && (
                      <button className="button secondary" onClick={() => setShareSession(session)}>
                        {t('shareSession')}
                      </button>
                    )}
                  </div>
                </details>
              ))
          ) : (
            <p className="muted">{t('noSessions')}</p>
          )}
        </div>
      )}

      {tab === 'ranks' && (
        <div
          id="progress-panel-ranks"
          role="tabpanel"
          aria-labelledby="progress-tab-ranks"
          className="section-block progress-ranks"
        >
          <CurrentRankCard data={data} progress={progress} />
          <div className="section-heading">
            <h2>{t('rankRoadmap')}</h2>
            <span className="muted">{t('xpRules')}</span>
          </div>
          <ol className="rank-list rank-roadmap plain-list">
            {visibleRanks.map((rank) => (
              <li
                className={`rank-step rank-tile ${progress.xp >= rank.minXp ? 'earned' : 'locked'} ${rank.name === progress.rank.name ? 'rank-current current' : ''}`}
                key={rank.name}
                style={rankStyle(rank.minXp, rank.color)}
                aria-current={rank.name === progress.rank.name ? 'step' : undefined}
              >
                <RankEmblem xp={rank.minXp} size={56} color={rank.color} />
                <div>
                  <strong>{rank.name}</strong>
                  <small>{rank.minXp.toLocaleString(locale)} XP</small>
                </div>
                {rank.name === progress.rank.name && (
                  <span className="rank-state">{t('currentRank')}</span>
                )}
                {rank.name !== progress.rank.name && progress.xp >= rank.minXp && (
                  <Check size={16} aria-label={t('completed')} />
                )}
              </li>
            ))}
          </ol>
          <p className="fine-print">{t('rankDisclaimer')}</p>
          <details className="benchmarks">
            <summary>{t('benchmarks')}</summary>
            <p>{t('benchmarkDetails')}</p>
            <p className="muted">{t('notMedicalAdvice')}</p>
          </details>
          <section className="milestone-details">
            <div className="section-heading">
              <h2>{t('badges')}</h2>
              <span className="muted">
                {t('milestoneCount', {
                  count: milestones.filter((milestone) => milestone.done).length,
                  total: milestones.length,
                })}
              </span>
            </div>
            <ul className="milestone-grid plain-list">
              {milestones.map((milestone) => (
                <li
                  className={`milestone-row milestone-card ${milestone.done ? 'earned' : ''}`}
                  key={milestone.label}
                >
                  {milestone.label === 'firstSession' ? (
                    <Flag size={22} aria-hidden="true" />
                  ) : (
                    <Trophy size={22} aria-hidden="true" />
                  )}
                  <strong>{t(milestone.label)}</strong>
                  <span className="muted">{t(milestone.done ? 'completed' : 'notYetEarned')}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      {shareSession && (
        <ShareCard data={data} session={shareSession} onClose={() => setShareSession(null)} />
      )}
    </section>
  );
}
