import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Heart, Plus, Search, X } from 'lucide-react';
import { EXERCISES, type AppData } from '../model';
import { uid } from '../engine';
import { categoryText, exerciseText, useT } from '../i18n';
import { featureT } from '../feature-i18n';
import { exerciseGuide, guideCues, muscleName } from '../exerciseGuides';
import MuscleMap from './MuscleMap';
import ExerciseDemo from './ExerciseDemo';

export default function Library({
  data,
  onChange,
  notify,
}: {
  data: AppData;
  onChange: (data: AppData) => Promise<boolean>;
  notify: (text: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState('all');
  const [equipment, setEquipment] = useState('all');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [day, setDay] = useState(String(new Date().getDay()));
  const dialog = useRef<HTMLDialogElement>(null);
  const t = useT(data.settings.language);
  const f = (key: Parameters<typeof featureT>[1]) => featureT(data.settings.language, key);
  const selected = EXERCISES.find((exercise) => exercise.id === selectedId);
  const guide = selected && exerciseGuide(selected);
  const filtered = EXERCISES.filter(
    (exercise) =>
      `${exerciseText(data.settings.language, exercise).name} ${exercise.muscle} ${exercise.equipment}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (muscle === 'all' || exercise.muscle === muscle) &&
      (equipment === 'all' || exercise.equipment === equipment) &&
      (!favoriteOnly || data.favorites?.includes(exercise.id)),
  );
  useEffect(() => {
    if (adding) dialog.current?.showModal();
    else dialog.current?.close();
  }, [adding]);
  function favorite(id: string) {
    void onChange({
      ...data,
      favorites: data.favorites?.includes(id)
        ? data.favorites.filter((value) => value !== id)
        : [...(data.favorites || []), id],
    });
  }
  return (
    <section className="page library-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">FORM / KNOWLEDGE</span>
          <h1>{f('library')}</h1>
          <p className="muted">{f('libraryBody')}</p>
        </div>
        <span className="library-count">
          {EXERCISES.length} {t('exercises')}
        </span>
      </header>
      {selected && guide ? (
        <>
          <button className="button ghost library-back" onClick={() => setSelectedId(undefined)}>
            <ArrowLeft size={17} aria-hidden="true" />
            {f('library')}
          </button>
          <div className="exercise-detail">
            <section className="panel exercise-stage">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    {categoryText(data.settings.language, selected.equipment)}
                  </span>
                  <h2>{exerciseText(data.settings.language, selected).name}</h2>
                </div>
                <button
                  className="icon-button"
                  aria-label={f(data.favorites?.includes(selected.id) ? 'unfavorite' : 'favorite')}
                  aria-pressed={Boolean(data.favorites?.includes(selected.id))}
                  onClick={() => favorite(selected.id)}
                >
                  <Heart
                    size={21}
                    aria-hidden="true"
                    fill={data.favorites?.includes(selected.id) ? 'currentColor' : 'none'}
                  />
                </button>
              </div>
              <ExerciseDemo
                exercise={selected}
                guide={guide}
                avatar={data.profile?.avatar}
                language={data.settings.language}
                reducedMotion={data.settings.reducedMotion}
              />
              <button className="button primary" onClick={() => setAdding(true)}>
                <Plus size={17} aria-hidden="true" />
                {f('addToDay')}
              </button>
            </section>
            <section className="panel exercise-instructions">
              <h3>{f('muscles')}</h3>
              <div className="muscle-pair">
                <figure>
                  <MuscleMap guide={guide} />
                  <figcaption>{f('front')}</figcaption>
                </figure>
                <figure>
                  <MuscleMap guide={guide} view="back" />
                  <figcaption>{f('back')}</figcaption>
                </figure>
              </div>
              <div className="muscle-legend">
                <p>
                  <i className="primary-dot" />
                  {f('primaryMuscles')}:{' '}
                  {guide.primary
                    .map((value) => muscleName(value, data.settings.language))
                    .join(', ')}
                </p>
                {guide.secondary.length > 0 && (
                  <p>
                    <i className="secondary-dot" />
                    {f('secondaryMuscles')}:{' '}
                    {guide.secondary
                      .map((value) => muscleName(value, data.settings.language))
                      .join(', ')}
                  </p>
                )}
              </div>
              <h3>{f('form')}</h3>
              <ol className="form-cues">
                {guideCues(guide, data.settings.language).map((cue, index) => (
                  <li key={cue}>
                    <span>{index + 1}</span>
                    <p>{cue}</p>
                  </li>
                ))}
              </ol>
              <p className="fine-print">{f('steps')}</p>
            </section>
          </div>
        </>
      ) : (
        <>
          <div className="library-filters panel">
            <label className="search-field">
              <Search size={18} aria-hidden="true" />
              <input
                value={query}
                aria-label={f('searchExercises')}
                placeholder={f('searchExercises')}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="sr-only">{t('muscleGroup')}</span>
              <select
                value={muscle}
                aria-label={t('muscleGroup')}
                onChange={(event) => setMuscle(event.target.value)}
              >
                <option value="all">
                  {f('all')} · {f('muscles')}
                </option>
                {[...new Set(EXERCISES.map((exercise) => exercise.muscle))].map((value) => (
                  <option key={value} value={value}>
                    {categoryText(data.settings.language, value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="sr-only">{t('equipment')}</span>
              <select
                value={equipment}
                aria-label={t('equipment')}
                onChange={(event) => setEquipment(event.target.value)}
              >
                <option value="all">
                  {f('all')} · {t('equipment')}
                </option>
                {[...new Set(EXERCISES.map((exercise) => exercise.equipment))].map((value) => (
                  <option key={value} value={value}>
                    {categoryText(data.settings.language, value)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className={`button secondary ${favoriteOnly ? 'selected' : ''}`}
              aria-pressed={favoriteOnly}
              onClick={() => setFavoriteOnly(!favoriteOnly)}
            >
              <Heart size={17} aria-hidden="true" />
              {f('favorites')}
            </button>
          </div>
          <div className="exercise-library-grid stagger-list">
            {filtered.map((exercise, index) => {
              const info = exerciseGuide(exercise);
              return (
                <button
                  key={exercise.id}
                  className="exercise-library-card panel"
                  onClick={() => setSelectedId(exercise.id)}
                  style={{ animationDelay: `${Math.min(index, 7) * 35}ms` }}
                >
                  <div className="library-card-art">
                    <MuscleMap guide={info} size={58} decorative />
                    <MuscleMap guide={info} view="back" size={58} decorative />
                  </div>
                  <div>
                    <span className="eyebrow">
                      {categoryText(data.settings.language, exercise.muscle)}
                    </span>
                    <h3>{exerciseText(data.settings.language, exercise).name}</h3>
                    <p className="fine-print">
                      {categoryText(data.settings.language, exercise.equipment)}
                    </p>
                  </div>
                  <ArrowUpRight size={19} aria-hidden="true" />
                </button>
              );
            })}
          </div>
          {!filtered.length && (
            <div className="empty-state">
              <Search size={35} aria-hidden="true" />
              <p>{t('noSearchResults')}</p>
            </div>
          )}
        </>
      )}
      <dialog
        ref={dialog}
        className="modal"
        aria-labelledby="add-library-title"
        onCancel={() => setAdding(false)}
      >
        <div className="section-heading">
          <h2 id="add-library-title">{f('addToDay')}</h2>
          <button className="icon-button" aria-label={f('close')} onClick={() => setAdding(false)}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <p>{selected && exerciseText(data.settings.language, selected).name}</p>
        <label className="field">
          <span>{f('chooseDay')}</span>
          <select value={day} onChange={(event) => setDay(event.target.value)}>
            {[1, 2, 3, 4, 5, 6, 0].map((value) => (
              <option key={value} value={value}>
                {new Date(2026, 10, 15 + value).toLocaleDateString(data.settings.language, {
                  weekday: 'long',
                })}
              </option>
            ))}
          </select>
        </label>
        <div className="modal-actions">
          <button className="button secondary" onClick={() => setAdding(false)}>
            {f('cancel')}
          </button>
          <button
            className="button primary"
            disabled={!selected || data.plans[day].exercises.length >= 40}
            onClick={() => {
              if (selected)
                void onChange({
                  ...data,
                  plans: {
                    ...data.plans,
                    [day]: {
                      ...data.plans[day],
                      exercises: [
                        ...data.plans[day].exercises,
                        {
                          id: uid(),
                          exerciseId: selected.id,
                          sets: 3,
                          reps: selected.id === 'plank' ? 30 : 10,
                          weight: 0,
                          rest: data.settings.restSeconds,
                        },
                      ],
                    },
                  },
                }).then((saved) => {
                  if (saved) {
                    setAdding(false);
                    notify(f('added'));
                  }
                });
            }}
          >
            {f('addToDay')}
          </button>
        </div>
      </dialog>
    </section>
  );
}
