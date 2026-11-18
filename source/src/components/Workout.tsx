import { useEffect, useState } from 'react';
import { Check, CheckCheck, Clock3, Dumbbell, Flag, Pause, Play, RotateCcw, X } from 'lucide-react';
import { EXERCISES, type AppData, type DayPlan, type Session } from '../model';
import { createInitialData, localDate, parseBackup, uid } from '../engine';
import { exerciseText, useT } from '../i18n';

interface Props {
  data: AppData;
  plan: DayPlan;
  onFinish: (session: Session) => void;
  onCancel: () => void;
}
interface WorkoutDraft {
  session: Session;
  plan: DayPlan;
  startedAt: number;
  restEndsAt: number | null;
}
export const ACTIVE_WORKOUT_KEY = 'form-active-workout-v1';

export function readWorkoutDraft(): WorkoutDraft | null {
  try {
    const raw = localStorage.getItem(ACTIVE_WORKOUT_KEY);
    if (!raw || raw.length > 8_000_000) return null;
    const value = JSON.parse(raw) as WorkoutDraft;
    if (
      !value ||
      !value.session ||
      !value.plan ||
      !Number.isFinite(value.startedAt) ||
      value.startedAt <= 0 ||
      value.startedAt > Date.now() ||
      (value.restEndsAt !== null && !Number.isFinite(value.restEndsAt))
    )
      return null;
    const base = createInitialData();
    const validated = parseBackup(
      JSON.stringify({
        ...base,
        plans: { ...base.plans, '0': value.plan },
        sessions: [value.session],
      }),
    );
    return {
      session: validated.sessions[0],
      plan: validated.plans['0'],
      startedAt: value.startedAt,
      restEndsAt: value.restEndsAt,
    };
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(ACTIVE_WORKOUT_KEY);
  } catch {
    /* Session remains usable if storage is unavailable. */
  }
}
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
const displayLoad = (kg: number, units: 'kg' | 'lb') =>
  Math.round(kg * (units === 'lb' ? 2.2046226218 : 1) * 10) / 10;
const quantityKey = (exerciseId: string) =>
  exerciseId === 'plank'
    ? 'seconds'
    : ['walk', 'cycle', 'rower'].includes(exerciseId)
      ? 'minutes'
      : 'reps';
const normalizeTimedLoads = (session: Session): Session => ({
  ...session,
  exercises: session.exercises.map((exercise) =>
    quantityKey(exercise.exerciseId) === 'reps'
      ? exercise
      : {
          ...exercise,
          sets: exercise.sets.map((set) => ({ ...set, weight: 0 })),
        },
  ),
});

export default function Workout({ data, plan, onFinish, onCancel }: Props) {
  const t = useT(data.settings.language);
  const [initial] = useState<WorkoutDraft>(() => {
    const existing = readWorkoutDraft();
    if (existing) return { ...existing, session: normalizeTimedLoads(existing.session) };
    return {
      plan,
      startedAt: Date.now(),
      restEndsAt: null,
      session: {
        id: uid(),
        date: localDate(),
        title: plan.title,
        duration: 0,
        note: plan.note,
        xp: 0,
        exercises: plan.exercises.map((exercise) => ({
          id: exercise.id,
          exerciseId: exercise.exerciseId,
          sets: Array.from({ length: exercise.sets }, () => ({
            reps: exercise.reps,
            weight: quantityKey(exercise.exerciseId) === 'reps' ? exercise.weight : 0,
            done: false,
          })),
        })),
      },
    };
  });
  const [session, setSession] = useState(initial.session);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(initial.restEndsAt);
  const [now, setNow] = useState(Date.now());
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [pausedRest, setPausedRest] = useState<number | null>(null);
  const [storageError, setStorageError] = useState(false);
  const units = data.settings.units;
  const elapsed = Math.min(86400, Math.max(0, Math.floor((now - initial.startedAt) / 1000)));
  const restRemaining = restEndsAt
    ? Math.max(0, Math.ceil((restEndsAt - now) / 1000))
    : (pausedRest ?? 0);
  const completed = session.exercises.reduce(
    (sum, exercise) => sum + exercise.sets.filter((set) => set.done).length,
    0,
  );
  const total = session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const volume = session.exercises
    .filter((exercise) => quantityKey(exercise.exerciseId) === 'reps')
    .reduce(
      (sum, exercise) =>
        sum +
        exercise.sets
          .filter((set) => set.done)
          .reduce((subtotal, set) => subtotal + set.reps * set.weight, 0),
      0,
    );

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        ACTIVE_WORKOUT_KEY,
        JSON.stringify({
          session,
          plan: initial.plan,
          startedAt: initial.startedAt,
          restEndsAt,
        }),
      );
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [session, initial, restEndsAt]);
  useEffect(() => {
    if (restEndsAt && now >= restEndsAt) setRestEndsAt(null);
  }, [now, restEndsAt]);

  function updateSet(
    exerciseId: string,
    index: number,
    update: { reps?: number; weight?: number; done?: boolean },
  ) {
    setSession((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: exercise.sets.map((set, setIndex) =>
                setIndex === index ? { ...set, ...update } : set,
              ),
            }
          : exercise,
      ),
    }));
  }

  function toggleSet(exerciseId: string, index: number, done: boolean) {
    updateSet(exerciseId, index, { done: !done });
    if (!done) {
      const rest =
        initial.plan.exercises.find((exercise) => exercise.id === exerciseId)?.rest ??
        data.settings.restSeconds;
      setPausedRest(null);
      setNow(Date.now());
      setRestEndsAt(rest > 0 ? Date.now() + rest * 1000 : null);
    }
  }

  function finish() {
    if (!completed) return;
    clearDraft();
    onFinish({
      ...session,
      duration: Math.min(86400, Math.max(1, Math.floor((Date.now() - initial.startedAt) / 1000))),
    });
  }

  return (
    <section className="page workout-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{t('training')} / LIVE</span>
          <h1>{session.title || t('workout')}</h1>
          <p className="muted">{t('workoutSubtitle')}</p>
        </div>
        <button className="button ghost" onClick={() => setConfirmDiscard(true)}>
          <X size={17} />
          {t('close')}
        </button>
      </header>
      {storageError && (
        <p role="alert" className="notice">
          {t('storageUnavailable')}
        </p>
      )}
      <div className="workout-summary panel">
        <div>
          <span className="muted">{t('elapsed')}</span>
          <strong>
            <Clock3 size={20} /> {clock(elapsed)}
          </strong>
        </div>
        <div>
          <span className="muted">{t('completedSets')}</span>
          <strong>
            {completed}
            <small> / {total}</small>
          </strong>
        </div>
        <div>
          <span className="muted">{t('volume')}</span>
          <strong>
            {displayLoad(volume, units).toLocaleString()}
            <small> {units}</small>
          </strong>
        </div>
        <div className="workout-progress">
          <span style={{ width: `${total ? (completed / total) * 100 : 0}%` }} />
        </div>
      </div>
      <div className="workout-grid">
        <div className="workout-exercises">
          {session.exercises.map((exercise, exerciseIndex) => {
            const canonical = EXERCISES.find((item) => item.id === exercise.exerciseId);
            const definition = canonical
              ? exerciseText(data.settings.language, canonical)
              : undefined;
            const quantity = quantityKey(exercise.exerciseId);
            const lastSession = [...data.sessions]
              .reverse()
              .find((item) =>
                item.exercises.some(
                  (entry) =>
                    entry.exerciseId === exercise.exerciseId && entry.sets.some((set) => set.done),
                ),
              );
            const previous = lastSession?.exercises
              .find((item) => item.exerciseId === exercise.exerciseId)
              ?.sets.filter((set) => set.done);
            const allDone = exercise.sets.every((set) => set.done);
            return (
              <article
                key={exercise.id}
                className={`panel workout-exercise ${allDone ? 'exercise-completed' : ''}`}
              >
                <div className="exercise-row-header">
                  <span className="exercise-number">
                    {String(exerciseIndex + 1).padStart(2, '0')}
                  </span>
                  <div className="exercise-name">
                    <h3>{definition?.name ?? t('exercise')}</h3>
                    <span className="muted">
                      {definition?.muscle} · {definition?.equipment}
                    </span>
                  </div>
                  {allDone && <CheckCheck size={23} className="accent" />}
                </div>
                <div className="set-table">
                  <div className="set-row set-labels">
                    <span>{t('sets')}</span>
                    <span>{t(quantity)}</span>
                    <span>
                      {t('load')} ({units})
                    </span>
                    <span>{t('completed')}</span>
                  </div>
                  {exercise.sets.map((set, index) => (
                    <div key={index} className={`set-row ${set.done ? 'set-done' : ''}`}>
                      <span className="set-index">{index + 1}</span>
                      <input
                        aria-label={`${definition?.name} ${t('sets')} ${index + 1} ${t(quantity)}`}
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="100"
                        value={set.reps}
                        onChange={(event) =>
                          updateSet(exercise.id, index, {
                            reps: Math.round(
                              Math.min(100, Math.max(1, Number(event.target.value) || 1)),
                            ),
                          })
                        }
                      />
                      <input
                        aria-label={`${definition?.name} ${t('sets')} ${index + 1} ${t('load')} ${units}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max={displayLoad(600, units)}
                        step="0.5"
                        disabled={quantity !== 'reps'}
                        value={quantity !== 'reps' ? 0 : displayLoad(set.weight, units)}
                        onChange={(event) =>
                          updateSet(exercise.id, index, {
                            weight: Math.min(
                              600,
                              Math.max(0, Number(event.target.value) || 0) /
                                (units === 'lb' ? 2.2046226218 : 1),
                            ),
                          })
                        }
                      />
                      <button
                        className={`set-check ${set.done ? 'checked' : ''}`}
                        aria-label={`${t('completeSet')} ${index + 1} ${definition?.name}`}
                        aria-pressed={set.done}
                        onClick={() => toggleSet(exercise.id, index, set.done)}
                      >
                        <Check size={20} />
                      </button>
                    </div>
                  ))}
                </div>
                {previous?.length ? (
                  <p className="previous-performance muted">
                    {t('history')}:{' '}
                    {previous
                      .map((set) =>
                        quantity !== 'reps'
                          ? `${set.reps} ${t(quantity)}`
                          : `${set.reps} × ${displayLoad(set.weight, units)} ${units}`,
                      )
                      .join(' · ')}
                  </p>
                ) : (
                  <p className="previous-performance muted">
                    {quantity === 'reps' ? t('bodyweightLoad') : t(quantity)}
                  </p>
                )}
              </article>
            );
          })}
        </div>
        <aside className="workout-side">
          <div className={`panel rest-panel ${restRemaining ? 'timer-active' : ''}`}>
            <span className="eyebrow">{t('restTimer')}</span>
            <strong className="timer-value" aria-live={restRemaining === 0 ? 'polite' : 'off'}>
              {clock(restRemaining)}
            </strong>
            <p className="muted">{t('recovery')}</p>
            <div className="timer-actions">
              <button
                className="icon-button"
                aria-label={t('reset')}
                title={t('reset')}
                onClick={() => {
                  setPausedRest(null);
                  setNow(Date.now());
                  setRestEndsAt(Date.now() + data.settings.restSeconds * 1000);
                }}
              >
                <RotateCcw size={18} />
              </button>
              <button
                className="icon-button"
                aria-label={restEndsAt ? t('pause') : t('start')}
                title={restEndsAt ? t('pause') : t('start')}
                onClick={() => {
                  if (restEndsAt) {
                    setPausedRest(restRemaining);
                    setRestEndsAt(null);
                  } else if (pausedRest) {
                    setRestEndsAt(Date.now() + pausedRest * 1000);
                    setPausedRest(null);
                  } else setRestEndsAt(Date.now() + data.settings.restSeconds * 1000);
                }}
              >
                {restEndsAt ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <button
                className="button ghost"
                onClick={() => {
                  setRestEndsAt(null);
                  setPausedRest(null);
                }}
              >
                {t('skipRest')}
              </button>
            </div>
          </div>
          <div className="panel session-note">
            <label className="field">
              <span>{t('sessionNotes')}</span>
              <textarea
                rows={6}
                maxLength={10000}
                value={session.note}
                placeholder={t('addNote')}
                onChange={(event) =>
                  setSession((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <button
            className="button primary finish-button"
            disabled={!completed}
            onClick={() => setConfirmFinish(true)}
          >
            <Flag size={18} />
            {t('finishWorkout')}
          </button>
        </aside>
      </div>
      {confirmDiscard && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="discard-title">
            <h2 id="discard-title">{t('discardWorkout')}</h2>
            <p className="muted">{t('discardWorkoutBody')}</p>
            <div className="modal-actions">
              <button
                className="button secondary"
                autoFocus
                onClick={() => setConfirmDiscard(false)}
              >
                {t('keepTraining')}
              </button>
              <button
                className="button danger"
                onClick={() => {
                  clearDraft();
                  onCancel();
                }}
              >
                {t('discard')}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmFinish && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="finish-title">
            <Dumbbell size={32} className="accent" />
            <h2 id="finish-title">{t('saveWorkout')}</h2>
            <p className="muted">
              {completed} / {total} {t('loggedSets')} · {clock(elapsed)}
            </p>
            <p>{t('finishWorkoutBody')}</p>
            <div className="modal-actions">
              <button
                className="button secondary"
                autoFocus
                onClick={() => setConfirmFinish(false)}
              >
                {t('keepTraining')}
              </button>
              <button className="button primary" onClick={finish}>
                <Check size={17} />
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
