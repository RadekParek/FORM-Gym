import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AppData, Language, Profile } from '../model';
import { CONDITIONS } from '../model';
import { validateProfile } from '../engine';
import { LANGUAGES, useT } from '../i18n';
import { featureT } from '../feature-i18n';
import CharacterPicker from './CharacterPicker';
import AccountPanel from './AccountPanel';
import type { Avatar } from '../model';

type Props = { data: AppData; onComplete: (profile: Profile, language: Language) => void };
type ProfileDraft = {
  name: string;
  age: string;
  weight: string;
  height: string;
  experience: string;
  goal: Profile['goal'];
  daysPerWeek: number;
  conditions: string[];
};
type NumericField = 'age' | 'weight' | 'height' | 'experience';
type Field = 'name' | NumericField;
type FieldErrors = Partial<Record<Field, string>>;

function profileErrors(draft: ProfileDraft): FieldErrors {
  const errors: FieldErrors = {};
  const age = Number(draft.age);
  if (draft.name.trim().length > 40) errors.name = 'nameError';
  if (!draft.age.trim() || !Number.isInteger(age) || age < 8 || age > 100) errors.age = 'ageError';
  if (
    !draft.weight.trim() ||
    !Number.isFinite(Number(draft.weight)) ||
    Number(draft.weight) < 20 ||
    Number(draft.weight) > 350
  )
    errors.weight = 'weightError';
  if (
    !draft.height.trim() ||
    !Number.isFinite(Number(draft.height)) ||
    Number(draft.height) < 80 ||
    Number(draft.height) > 240
  )
    errors.height = 'heightError';
  if (
    !draft.experience.trim() ||
    !Number.isFinite(Number(draft.experience)) ||
    Number(draft.experience) < 0 ||
    Number(draft.experience) > 95 ||
    (!errors.age && Number(draft.experience) > age - 5)
  )
    errors.experience = 'experienceError';
  return errors;
}

export default function Onboarding({ data, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState(
    data.profile?.username || `athlete_${crypto.randomUUID().slice(0, 6)}`,
  );
  const [avatar, setAvatar] = useState<Avatar>(
    data.profile?.avatar || { skin: 1, hair: 0, shirt: 0 },
  );
  const [accountOpen, setAccountOpen] = useState(false);
  const [identityError, setIdentityError] = useState(false);
  const [language, setLanguage] = useState<Language>(data.settings.language);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<ProfileDraft>({
    name: data.profile?.name ?? '',
    age: String(data.profile?.age ?? ''),
    weight: String(data.profile?.weight ?? ''),
    height: String(data.profile?.height ?? ''),
    experience: String(data.profile?.experience ?? 0),
    goal: data.profile?.goal ?? 'fitness',
    daysPerWeek: data.profile?.daysPerWeek ?? 3,
    conditions: data.profile?.conditions ?? [],
  });
  const t = useT(language);
  const profile: Profile = {
    ...draft,
    name: draft.name.trim(),
    username,
    avatar,
    age: Number(draft.age),
    weight: Number(draft.weight),
    height: Number(draft.height),
    experience: Number(draft.experience),
  };
  const steps = ['languageStep', 'character', 'profileStep', 'healthStep', 'readyStep'];
  const titles = ['chooseLanguage', 'character', 'aboutTitle', 'approachTitle', 'readyTitle'];
  const bodies = ['chooseLanguageBody', 'characterBody', 'aboutBody', 'approachBody', 'readyBody'];
  const fields: {
    key: NumericField;
    label: string;
    unit: string;
    min: number;
    max: number;
    increment: number;
  }[] = [
    { key: 'age', label: 'age', unit: t('years'), min: 8, max: 100, increment: 1 },
    {
      key: 'experience',
      label: 'trainingYears',
      unit: t('years'),
      min: 0,
      max: 95,
      increment: 0.5,
    },
    { key: 'weight', label: 'weight', unit: 'kg', min: 20, max: 350, increment: 0.1 },
    { key: 'height', label: 'height', unit: 'cm', min: 80, max: 240, increment: 0.1 },
  ];
  const errorEntries = Object.entries(errors) as [Field, string][];

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => {
    if (!submitted || !errorEntries.length) return;
    if (errorEntries.length > 1) errorRef.current?.focus();
    else document.getElementById(`onboarding-${errorEntries[0][0]}`)?.focus();
  }, [focusRequest]);

  function next(event: FormEvent) {
    event.preventDefault();
    if (step === 1 && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      setIdentityError(true);
      return;
    }
    if (step >= 2) {
      const nextErrors = profileErrors(draft);
      if (Object.keys(nextErrors).length || validateProfile(profile)) {
        setErrors(nextErrors);
        setSubmitted(true);
        setStep(2);
        setFocusRequest((value) => value + 1);
        return;
      }
    }
    setErrors({});
    setSubmitted(false);
    if (step === 4) onComplete(profile, language);
    else setStep(step + 1);
  }

  function validateField(field: Field) {
    const currentErrors = profileErrors(draft);
    const relatedFields: Field[] = field === 'age' ? ['age', 'experience'] : [field];
    setErrors((current) => {
      const next = { ...current };
      for (const related of relatedFields) {
        const message = currentErrors[related];
        if (message) next[related] = message;
        else delete next[related];
      }
      return next;
    });
  }

  function toggleCondition(id: string) {
    setDraft((current) => ({
      ...current,
      conditions: current.conditions.includes(id)
        ? current.conditions.filter((value) => value !== id)
        : [...current.conditions, id],
    }));
  }

  return (
    <div className="onboarding-shell">
      <main className="onboarding-panel">
        <div className="onboarding-brand" aria-label="FORM Gym">
          FORM
        </div>
        <ol className="onboarding-stepper" aria-label={t('setupSteps')}>
          {steps.map((label, index) => (
            <li
              key={label}
              className={`onboarding-step ${index === step ? 'active' : ''} ${index < step ? 'done' : ''}`}
              aria-current={index === step ? 'step' : undefined}
            >
              <span>{index + 1}</span>
              <span>{label === 'character' ? featureT(language, 'character') : t(label)}</span>
            </li>
          ))}
        </ol>
        <form onSubmit={next} noValidate className="onboarding-form">
          <header className="onboarding-heading">
            <h1 ref={headingRef} tabIndex={-1}>
              {step === 1 ? featureT(language, 'character') : t(titles[step])}
            </h1>
            <p>{step === 1 ? featureT(language, 'characterBody') : t(bodies[step])}</p>
          </header>
          {submitted && errorEntries.length > 1 && (
            <div ref={errorRef} className="form-error-summary" tabIndex={-1} role="alert">
              <p>{t('checkFields')}</p>
              <ul>
                {errorEntries.map(([field, message]) => (
                  <li key={field}>
                    <a
                      href={`#onboarding-${field}`}
                      onClick={(event) => {
                        event.preventDefault();
                        document.getElementById(`onboarding-${field}`)?.focus();
                      }}
                    >
                      {t(message)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="onboarding-content">
            {step === 0 && (
              <div className="language-grid" role="group" aria-label={t('language')}>
                {LANGUAGES.map((item) => (
                  <button
                    type="button"
                    key={item.code}
                    onClick={() => setLanguage(item.code)}
                    className={`language-choice ${language === item.code ? 'selected' : ''}`}
                    aria-pressed={language === item.code}
                  >
                    <span>{item.native}</span>
                    {language === item.code && (
                      <span className="selection-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {step === 1 && (
              <div className="identity-step">
                <CharacterPicker avatar={avatar} onChange={setAvatar} language={language} />
                <label className="field">
                  <span>{featureT(language, 'username')}</span>
                  <input
                    value={username}
                    maxLength={20}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      setIdentityError(false);
                    }}
                    aria-invalid={identityError}
                  />
                  <small>{featureT(language, 'usernameHint')}</small>
                </label>
                {identityError && (
                  <p className="field-error" role="alert">
                    {featureT(language, 'usernameHint')}
                  </p>
                )}
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setAccountOpen(!accountOpen)}
                >
                  {featureT(language, 'signIn')} / {featureT(language, 'signUp')}
                </button>
                {accountOpen && (
                  <AccountPanel
                    data={{ ...data, profile }}
                    onSigned={(user) => {
                      setUsername(user.username);
                      setAvatar(user.avatar);
                    }}
                  />
                )}
              </div>
            )}
            {step === 2 && (
              <div className="onboarding-fields">
                <div className="field field-wide">
                  <label htmlFor="onboarding-name">
                    {t('name')} <span className="muted">({t('optional')})</span>
                  </label>
                  <input
                    id="onboarding-name"
                    maxLength={40}
                    autoComplete="given-name"
                    value={draft.name}
                    onBlur={() => validateField('name')}
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? 'onboarding-name-error' : undefined}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                  {errors.name && (
                    <p className="field-error" id="onboarding-name-error">
                      {t(errors.name)}
                    </p>
                  )}
                </div>
                {fields.map((field) => (
                  <div className="field" key={field.key}>
                    <label htmlFor={`onboarding-${field.key}`}>
                      {t(field.label)} <span className="muted">({field.unit})</span>
                    </label>
                    <input
                      id={`onboarding-${field.key}`}
                      type="number"
                      required
                      min={field.min}
                      max={field.max}
                      step={field.increment}
                      inputMode={field.increment === 1 ? 'numeric' : 'decimal'}
                      value={draft[field.key]}
                      onBlur={() => validateField(field.key)}
                      aria-invalid={Boolean(errors[field.key])}
                      aria-describedby={
                        errors[field.key] ? `onboarding-${field.key}-error` : undefined
                      }
                      onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                    />
                    {errors[field.key] && (
                      <p className="field-error" id={`onboarding-${field.key}-error`}>
                        {t(errors[field.key]!)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {step === 3 && (
              <>
                <fieldset className="goal-fieldset">
                  <legend>{t('goal')}</legend>
                  <div className="goal-grid">
                    {(['strength', 'muscle', 'fitness'] as const).map((goal) => (
                      <button
                        type="button"
                        key={goal}
                        className={`goal-choice ${draft.goal === goal ? 'selected' : ''}`}
                        aria-pressed={draft.goal === goal}
                        onClick={() => setDraft({ ...draft, goal })}
                      >
                        {t(goal)}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className="field rhythm-field">
                  <label htmlFor="onboarding-days">{t('daysPerWeek')}</label>
                  <select
                    id="onboarding-days"
                    value={draft.daysPerWeek}
                    onChange={(event) =>
                      setDraft({ ...draft, daysPerWeek: Number(event.target.value) })
                    }
                  >
                    {[1, 2, 3, 4, 5, 6].map((day) => (
                      <option key={day} value={day}>
                        {t('daysLabel', { count: day })}
                      </option>
                    ))}
                  </select>
                </div>
                <details className="conditions-disclosure">
                  <summary>
                    <span>
                      {t('conditions')} <span className="muted">({t('optional')})</span>
                    </span>
                    <small>
                      {draft.conditions.length
                        ? t('selectedCount', { count: draft.conditions.length })
                        : t('noneSelected')}
                    </small>
                  </summary>
                  <p className="muted">{t('conditionsBody')}</p>
                  <div className="condition-grid">
                    {CONDITIONS.map((condition) => (
                      <label key={condition.id} className="condition-choice">
                        <input
                          type="checkbox"
                          checked={draft.conditions.includes(condition.id)}
                          onChange={() => toggleCondition(condition.id)}
                        />
                        <span>{t(`condition_${condition.id}`)}</span>
                      </label>
                    ))}
                  </div>
                </details>
                {draft.conditions.length > 0 && (
                  <p className="health-advice">{t('conditionAdvice')}</p>
                )}
              </>
            )}
            {step === 4 && (
              <>
                <dl className="onboarding-summary">
                  <div>
                    <dt>{t('summaryFocus')}</dt>
                    <dd>{t(draft.goal)}</dd>
                  </div>
                  <div>
                    <dt>{t('summaryRhythm')}</dt>
                    <dd>{t('daysLabel', { count: draft.daysPerWeek })}</dd>
                  </div>
                  <div>
                    <dt>{t('summaryExperience')}</dt>
                    <dd>{t('experienceLabel', { count: profile.experience })}</dd>
                  </div>
                </dl>
                <p className="health-advice">
                  {t(
                    profile.age < 18
                      ? 'youthAdvice'
                      : profile.age >= 65
                        ? 'olderAdvice'
                        : draft.conditions.length > 0
                          ? 'conditionAdvice'
                          : 'healthNote',
                  )}
                </p>
                {profile.age < 18 && draft.conditions.length > 0 && (
                  <p className="health-advice">{t('conditionAdvice')}</p>
                )}
              </>
            )}
          </div>
          <div className="onboarding-actions">
            {step > 0 ? (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setErrors({});
                  setSubmitted(false);
                  setStep(step - 1);
                }}
              >
                {t('back')}
              </button>
            ) : (
              <span />
            )}
            <button type="submit" className="button primary">
              {t(step === 4 ? 'complete' : 'next')}
            </button>
          </div>
          <p className="privacy-note">{t('privacyNote')}</p>
        </form>
      </main>
    </div>
  );
}
