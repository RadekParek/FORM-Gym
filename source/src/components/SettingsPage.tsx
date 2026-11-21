import { useState } from 'react';
import { ArrowDownToLine, ArrowRight, Check } from 'lucide-react';
import { CONDITIONS, type AppData, type Profile } from '../model';
import { createInitialData, isPremium, redeemPremium, validateProfile } from '../engine';
import { exportData } from '../storage';
import { LANGUAGES, useT } from '../i18n';

export default function SettingsPage({
  data,
  onChange,
  onImport,
  onPremium,
  notify,
}: {
  data: AppData;
  onChange: (data: AppData) => void;
  onImport: (file: File) => Promise<void>;
  onPremium: () => void;
  notify: (text: string) => void;
}) {
  const t = useT(data.settings.language);
  const [profile, setProfile] = useState<Profile>(() => structuredClone(data.profile!));
  const [profileError, setProfileError] = useState(false);
  const [code, setCode] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [reset, setReset] = useState(false);
  const premium = isPremium(data);
  const setSetting = <K extends keyof AppData['settings']>(key: K, value: AppData['settings'][K]) =>
    onChange({ ...data, settings: { ...data.settings, [key]: value } });
  async function activate() {
    if (codeBusy) return;
    setCodeBusy(true);
    try {
      const result = await redeemPremium(code, data);
      if (result) {
        onChange(result);
        setCode('');
        notify(t('codeActivated'));
      } else notify(t('codeInvalid'));
    } catch {
      notify(t('codeInvalid'));
    } finally {
      setCodeBusy(false);
    }
  }
  return (
    <section className="page settings-page">
      <header className="page-heading">
        <h1>{t('settings')}</h1>
      </header>
      <section className="settings-section settings-grid" aria-label={t('preferences')}>
        <h2>{t('preferences')}</h2>
        <div className="preference-fields">
          <label className="field">
            {t('appearance')}
            <select
              value={data.settings.appearance}
              onChange={(event) =>
                setSetting('appearance', event.target.value as AppData['settings']['appearance'])
              }
            >
              <option value="dark">{t('darkTheme')}</option>
              <option value="light">{t('lightTheme')}</option>
            </select>
          </label>
          <label className="field">
            {t('language')}
            <select
              value={data.settings.language}
              onChange={(e) =>
                setSetting('language', e.target.value as AppData['settings']['language'])
              }
            >
              {LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.native}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('units')}
            <select
              value={data.settings.units}
              onChange={(e) => setSetting('units', e.target.value as 'kg' | 'lb')}
            >
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </label>
          <label className="field">
            {t('restTimer')} ({t('seconds')})
            <input
              type="number"
              min="15"
              max="600"
              value={data.settings.restSeconds}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isInteger(value) && value >= 15 && value <= 600)
                  setSetting('restSeconds', value);
              }}
            />
          </label>
        </div>
        <div className="accessibility-options">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={data.settings.reducedMotion}
              onChange={(e) => setSetting('reducedMotion', e.target.checked)}
            />
            <span>{t('reducedMotion')}</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={data.settings.largeText}
              onChange={(e) => setSetting('largeText', e.target.checked)}
            />
            <span>{t('largeText')}</span>
          </label>
        </div>
      </section>
      <details className="settings-section profile-panel">
        <summary>{t('profile')}</summary>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (validateProfile(profile)) {
              setProfileError(true);
              notify(t('profileInvalid'));
              return;
            }
            setProfileError(false);
            onChange({ ...data, profile });
            notify(t('profileSaved'));
          }}
        >
          <div className="profile-fields">
            {(['name', 'age', 'weight', 'height', 'experience'] as const).map((key) => (
              <label className="field" key={key}>
                {t(key === 'experience' ? 'trainingYears' : key)}
                {key === 'weight' ? ' (kg)' : key === 'height' ? ' (cm)' : ''}
                <input
                  type={key === 'name' ? 'text' : 'number'}
                  value={profile[key]}
                  step={key === 'weight' || key === 'experience' ? '0.1' : '1'}
                  maxLength={key === 'name' ? 40 : undefined}
                  aria-describedby={profileError ? 'profile-error' : undefined}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      [key]: key === 'name' ? e.target.value : Number(e.target.value),
                    })
                  }
                />
              </label>
            ))}
            <label className="field">
              {t('goal')}
              <select
                value={profile.goal}
                onChange={(e) =>
                  setProfile({ ...profile, goal: e.target.value as Profile['goal'] })
                }
              >
                {['strength', 'muscle', 'fitness'].map((goal) => (
                  <option value={goal} key={goal}>
                    {t(goal)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('daysPerWeek')}
              <input
                type="number"
                min="1"
                max="6"
                value={profile.daysPerWeek}
                onChange={(e) => setProfile({ ...profile, daysPerWeek: Number(e.target.value) })}
              />
            </label>
          </div>
          <details className="conditions-disclosure">
            <summary>
              {t('conditions')} · {t('optional')}
            </summary>
            <div className="condition-grid">
              {CONDITIONS.map((condition) => (
                <label className="condition-choice" key={condition.id}>
                  <input
                    type="checkbox"
                    checked={profile.conditions.includes(condition.id)}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        conditions: e.target.checked
                          ? [...profile.conditions, condition.id]
                          : profile.conditions.filter((id) => id !== condition.id),
                      })
                    }
                  />
                  <span>{t(`condition_${condition.id}`)}</span>
                </label>
              ))}
            </div>
          </details>
          {profileError && (
            <p role="alert" className="form-error" id="profile-error">
              {t('profileInvalid')}
            </p>
          )}
          <button className="button primary" type="submit">
            {t('saveProfile')}
            <Check size={16} aria-hidden="true" />
          </button>
        </form>
      </details>
      <section className="settings-section premium-settings">
        <div className="section-heading">
          <div>
            <h2>FORM Plus</h2>
            <p className="muted">{premium ? t('premiumActive') : t('freePlan')}</p>
          </div>
          <button className="button secondary" onClick={onPremium}>
            {t('viewPremium')}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
        {premium && (
          <div className="accent-options">
            <span>{t('accent')}</span>
            {['lime', 'ice', 'rose'].map((accent) => (
              <button
                key={accent}
                className={`accent-choice ${data.settings.accent === accent ? 'selected' : ''}`}
                onClick={() => setSetting('accent', accent as AppData['settings']['accent'])}
              >
                {accent === 'lime' ? ({en:'Sand',sk:'Piesková',cs:'Písková',de:'Sand',es:'Arena'}[data.settings.language]) : t(accent)}
              </button>
            ))}
          </div>
        )}
        <details className="activation-panel">
          <summary>{t('activationCode')}</summary>
          <label className="field">
            {t('activationCode')}
            <input
              type="password"
              autoComplete="off"
              value={code}
              maxLength={100}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void activate();
                }
              }}
            />
          </label>
          <button
            className="button secondary"
            disabled={!code.trim() || codeBusy}
            onClick={() => void activate()}
          >
            {t('activate')}
          </button>
        </details>
      </section>
      <details className="settings-section backup-section">
        <summary>{t('backup')}</summary>
        <div className="backup-actions">
          <button
            className="button secondary"
            onClick={() => void exportData(data).catch(() => notify(t('exportFailed')))}
          >
            <ArrowDownToLine size={16} aria-hidden="true" />
            {t('exportBackup')}
          </button>
          <label className="button secondary">
            {t('importBackup')}
            <input
              hidden
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onImport(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <button className="text-button danger-text" onClick={() => setReset(true)}>
          {t('deleteData')}
        </button>
      </details>
      <p className="fine-print">{t('storedLocally')}</p>
      {reset && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true">
            <h2>{t('deleteData')}</h2>
            <p>{t('resetWarning')}</p>
            <div className="modal-actions">
              <button className="button secondary" onClick={() => setReset(false)}>
                {t('cancel')}
              </button>
              <button
                className="button danger"
                onClick={() => {
                  localStorage.removeItem('form-active-workout-v1');
                  localStorage.removeItem('form-note-drafts-v1');
                  onChange(createInitialData());
                  setReset(false);
                }}
              >
                {t('confirmReset')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
