import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Dumbbell, Play, Plus, Search, Trash2 } from 'lucide-react';
import type { AppData, DayPlan, PlanExercise } from '../model';
import { EXERCISES } from '../model';
import { uid } from '../engine';
import { categoryText, exerciseText, useT } from '../i18n';
import { readWorkoutDraft } from './Workout';

interface Props {
  data: AppData;
  initialDay: number;
  onChange: (next: AppData) => void;
  onStart: (plan: DayPlan) => void;
  notify: (message: string) => void;
}

const weekDays = [1, 2, 3, 4, 5, 6, 0];
const emptyPlan = (): DayPlan => ({ title: '', exercises: [], note: '' });
const bounded = (value: string, min: number, max: number) =>
  Math.min(max, Math.max(min, Number(value) || min));
const displayLoad = (kg: number, units: 'kg' | 'lb') =>
  Math.round(kg * (units === 'lb' ? 2.2046226218 : 1) * 10) / 10;
const quantityKey = (exerciseId: string) =>
  exerciseId === 'plank'
    ? 'seconds'
    : ['walk', 'cycle', 'rower'].includes(exerciseId)
      ? 'minutes'
      : 'reps';

export default function Planner({ data, initialDay, onChange, onStart, notify }: Props) {
  const t = useT(data.settings.language);
  const [day, setDay] = useState(initialDay);
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState('all');
  const [copyTarget, setCopyTarget] = useState(String((day + 1) % 7));
  const [confirmCopy, setConfirmCopy] = useState(false);
  const plan = data.plans[String(day)] ?? emptyPlan();
  const units = data.settings.units;
  const today = new Date();
  const monday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - ((today.getDay() + 6) % 7),
  );
  const dayDate = (value: number) =>
    new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + ((value + 6) % 7));
  const weekday = (value: number, long = false) =>
    dayDate(value).toLocaleDateString(data.settings.language, {
      weekday: long ? 'long' : 'short',
    });
  const choices = EXERCISES.filter((exercise) => {
    const translated = exerciseText(data.settings.language, exercise);
    return (
      (muscle === 'all' || exercise.muscle === muscle) &&
      `${translated.name} ${translated.muscle} ${translated.equipment} ${exercise.name}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  });
  const muscles = [...new Set(EXERCISES.map((exercise) => exercise.muscle))];

  function updatePlan(next: DayPlan) {
    onChange({
      ...data,
      plans: {
        ...data.plans,
        [String(day)]: {
          ...next,
          exercises: next.exercises.map((exercise) =>
            quantityKey(exercise.exerciseId) === 'reps' ? exercise : { ...exercise, weight: 0 },
          ),
        },
      },
    });
  }

  function updateExercise(id: string, update: Partial<PlanExercise>) {
    updatePlan({
      ...plan,
      exercises: plan.exercises.map((exercise) =>
        exercise.id === id ? { ...exercise, ...update } : exercise,
      ),
    });
  }

  function addExercise(exerciseId: string) {
    if (plan.exercises.length >= 30) return;
    updatePlan({
      ...plan,
      title: plan.title || `${weekday(day, true)} ${t('workout').toLowerCase()}`,
      exercises: [
        ...plan.exercises,
        {
          id: uid(),
          exerciseId,
          sets: quantityKey(exerciseId) === 'minutes' ? 1 : 3,
          reps: exerciseId === 'plank' ? 30 : 10,
          weight: 0,
          rest: data.settings.restSeconds,
        },
      ],
    });
  }

  function moveExercise(index: number, direction: number) {
    const next = [...plan.exercises];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    updatePlan({ ...plan, exercises: next });
  }

  function startWorkout() {
    const draft = readWorkoutDraft();
    if (draft) {
      notify(t('resumeWorkout'));
      onStart(draft.plan);
    } else onStart(plan);
  }

  function copyPlan() {
    if (copyTarget === String(day)) return;
    onChange({
      ...data,
      plans: {
        ...data.plans,
        [copyTarget]: {
          ...plan,
          exercises: plan.exercises.map((exercise) => ({
            ...exercise,
            id: uid(),
          })),
        },
      },
    });
    setConfirmCopy(false);
    notify(t('planSaved'));
  }

  return (
    <section className="page planner-page">
      <header className="page-heading">
        <div>
          <h1>{t('planner')}</h1>
          <p className="muted">{t('plannerSubtitle')}</p>
        </div>
        <span className="badge">
          <Check size={14} /> {t('changesSaved')}
        </span>
      </header>
      <div className="week-strip" aria-label={t('chooseDay')}>
        {weekDays.map((value) => (
          <button
            key={value}
            className={`day-button ${day === value ? 'active' : ''} ${today.getDay() === value ? 'is-today' : ''}`}
            onClick={() => {
              setDay(value);
              setCopyTarget(String((value + 1) % 7));
            }}
            aria-pressed={day === value}
          >
            <span>{weekday(value)}</span>
            <strong>{dayDate(value).getDate()}</strong>
            <span
              className={`day-dot ${data.plans[String(value)]?.exercises.length ? 'planned' : ''}`}
            />
          </button>
        ))}
      </div>
      <div className="planner-layout">
        <div className="planner-main">
          <div className="panel plan-header">
            <div className="plan-title-field">
              <span className="eyebrow">{weekday(day, true)}</span>
              <input
                aria-label={t('plannedWorkout')}
                maxLength={100}
                placeholder={t('plannedWorkout')}
                value={plan.title}
                onChange={(event) => updatePlan({ ...plan, title: event.target.value })}
              />
              <p className="muted">
                {t('exerciseCount', { count: plan.exercises.length })} ·{' '}
                {plan.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)} {t('sets')}
              </p>
            </div>
            <button
              className="button primary"
              disabled={!plan.exercises.length}
              onClick={startWorkout}
            >
              <Play size={16} fill="currentColor" />
              {t('startWorkout')}
            </button>
          </div>
          {!plan.exercises.length && (
            <div className="empty-state">
              <Dumbbell size={38} strokeWidth={1.3} />
              <h3>{t('restDay')}</h3>
              <p>{t('emptyPlan')}</p>
            </div>
          )}
          <div className="plan-exercises">
            {plan.exercises.map((exercise, index) => {
              const canonical = EXERCISES.find((item) => item.id === exercise.exerciseId);
              const definition = canonical
                ? exerciseText(data.settings.language, canonical)
                : undefined;
              const quantity = quantityKey(exercise.exerciseId);
              return (
                <article className="exercise-row panel" key={exercise.id}>
                  <div className="exercise-row-header">
                    <span className="exercise-number">{String(index + 1).padStart(2, '0')}</span>
                    <div className="exercise-name">
                      <h3>{definition?.name ?? t('exercise')}</h3>
                      <span className="muted">
                        {definition?.muscle} · {definition?.equipment}
                      </span>
                    </div>
                    <div className="exercise-tools">
                      <button
                        className="icon-button"
                        title={t('moveUp')}
                        aria-label={`${t('moveUp')} ${definition?.name}`}
                        disabled={index === 0}
                        onClick={() => moveExercise(index, -1)}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        className="icon-button"
                        title={t('moveDown')}
                        aria-label={`${t('moveDown')} ${definition?.name}`}
                        disabled={index === plan.exercises.length - 1}
                        onClick={() => moveExercise(index, 1)}
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        className="icon-button danger"
                        title={t('removeExercise')}
                        aria-label={`${t('removeExercise')} ${definition?.name}`}
                        onClick={() =>
                          updatePlan({
                            ...plan,
                            exercises: plan.exercises.filter((item) => item.id !== exercise.id),
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="exercise-fields">
                    <label className="field">
                      <span>{t('sets')}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="12"
                        value={exercise.sets}
                        onChange={(event) =>
                          updateExercise(exercise.id, {
                            sets: Math.round(bounded(event.target.value, 1, 12)),
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>{t(quantity)}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="100"
                        value={exercise.reps}
                        onChange={(event) =>
                          updateExercise(exercise.id, {
                            reps: Math.round(bounded(event.target.value, 1, 100)),
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>
                        {t('load')} ({units})
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max={displayLoad(600, units)}
                        step="0.5"
                        disabled={quantity !== 'reps'}
                        value={quantity !== 'reps' ? 0 : displayLoad(exercise.weight, units)}
                        onChange={(event) =>
                          updateExercise(exercise.id, {
                            weight:
                              bounded(event.target.value, 0, displayLoad(600, units)) /
                              (units === 'lb' ? 2.2046226218 : 1),
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>
                        {t('rest')} ({t('seconds')})
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="600"
                        step="15"
                        value={exercise.rest}
                        onChange={(event) =>
                          updateExercise(exercise.id, {
                            rest: Math.round(bounded(event.target.value, 0, 600)),
                          })
                        }
                      />
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="panel day-note">
            <label className="field">
              <span>{t('dayNote')}</span>
              <textarea
                rows={4}
                maxLength={10000}
                placeholder={t('sessionNotes')}
                value={plan.note}
                onChange={(event) => updatePlan({ ...plan, note: event.target.value })}
              />
            </label>
          </div>
          <div className="copy-controls">
            <label className="field" htmlFor="copy-day">
              <span>{t('copyTo')}</span>
              <select
                id="copy-day"
                value={copyTarget}
                onChange={(event) => setCopyTarget(event.target.value)}
              >
                {weekDays
                  .filter((value) => value !== day)
                  .map((value) => (
                    <option key={value} value={value}>
                      {weekday(value, true)}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="button secondary"
              onClick={() => {
                const target = data.plans[copyTarget];
                if (target && (target.exercises.length || target.note || target.title))
                  setConfirmCopy(true);
                else copyPlan();
              }}
            >
              {t('copyPlan')}
            </button>
          </div>
        </div>
        <aside className="panel exercise-library">
          <h2>{t('exerciseLibrary')}</h2>
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label={t('searchExercises')}
              placeholder={t('searchExercises')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select
            className="library-filter"
            aria-label={t('muscle')}
            value={muscle}
            onChange={(event) => setMuscle(event.target.value)}
          >
            <option value="all">{t('allMuscles')}</option>
            {muscles.map((value) => (
              <option key={value} value={value}>
                {categoryText(data.settings.language, value)}
              </option>
            ))}
          </select>
          <div className="exercise-choices">
            {choices.map((exercise) => {
              const translated = exerciseText(data.settings.language, exercise);
              return (
                <button
                  key={exercise.id}
                  className="exercise-choice"
                  onClick={() => addExercise(exercise.id)}
                  disabled={plan.exercises.length >= 30}
                >
                  <div>
                    <strong>{translated.name}</strong>
                    <span>
                      {translated.muscle} · {translated.equipment}
                    </span>
                  </div>
                  <Plus size={18} />
                </button>
              );
            })}
            {!choices.length && <p className="muted">{t('noSearchResults')}</p>}
          </div>
        </aside>
      </div>
      {confirmCopy && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="copy-plan-title">
            <h2 id="copy-plan-title">{t('replacePlan')}</h2>
            <p className="muted">
              {weekday(Number(copyTarget), true)} · {t('replacePlanBody')}
            </p>
            <div className="modal-actions">
              <button className="button secondary" autoFocus onClick={() => setConfirmCopy(false)}>
                {t('cancel')}
              </button>
              <button className="button primary" onClick={copyPlan}>
                {t('copyPlan')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
