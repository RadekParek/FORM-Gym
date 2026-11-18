import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  BookOpen,
  CalendarDays,
  Check,
  Home,
  Settings2,
  TrendingUp,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import type { AppData, DayPlan, Session } from './model';
import {
  calculateSessionXp,
  createInitialData,
  createStarterPlans,
  getProgress,
  isPremium,
  localDate,
  parseBackup,
} from './engine';
import { loadData, saveData } from './storage';
import { useT, localizeStarterPlans } from './i18n';
import type { Page } from './ui';
import Onboarding from './components/Onboarding';
import Planner from './components/Planner';
import Workout from './components/Workout';
import Notes from './components/Notes';
import Dashboard from './components/Dashboard';
import Progress from './components/Progress';
import PremiumPage from './components/PremiumPage';
import SettingsPage from './components/SettingsPage';
import Groups from './components/Groups';
import { groupT } from './group-i18n';
import { applyNativeAppearance } from './nativeTheme';
import { EXERCISES } from './model';
import { uid } from './engine';
import type { GroupAssignment } from './groups';

const NAV = [
  { id: 'dashboard', icon: Home },
  { id: 'planner', icon: CalendarDays },
  { id: 'notes', icon: BookOpen },
  { id: 'progress', icon: TrendingUp },
  { id: 'groups', icon: Users },
] as const;
function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">
        F
      </span>
      <strong>FORM</strong>
    </span>
  );
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState<Page>('dashboard');
  const [plannerDay, setPlannerDay] = useState(new Date().getDay());
  const [activePlan, setActivePlan] = useState<DayPlan | null>(null);
  const [toast, setToast] = useState('');
  const [rankCelebration, setRankCelebration] = useState('');
  const [ready, setReady] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = useT(data?.settings.language ?? 'en');
  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4000);
  };
  useEffect(() => {
    loadData()
      .then((value) => {
        setData(value);
        setReady(true);
      })
      .catch(() => {
        setLoadError(true);
        setReady(true);
      });
  }, []);
  useEffect(() => {
    if (!data) return;
    document.documentElement.lang = data.settings.language;
    document.documentElement.dataset.motion = data.settings.reducedMotion ? 'reduced' : 'full';
    document.documentElement.dataset.text = data.settings.largeText ? 'large' : 'normal';
    document.documentElement.dataset.accent = isPremium(data) ? data.settings.accent : 'lime';
    document.documentElement.dataset.appearance = data.settings.appearance;
  }, [data]);
  useEffect(() => {
    if (data) void applyNativeAppearance(data.settings.appearance);
  }, [data?.settings.appearance]);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  const change = (next: AppData) => {
    setData(next);
    saveData(next).catch(() => notify(t('saveFailed')));
  };
  const navigate = (next: Page) => {
    setActivePlan(null);
    if (next === 'planner') setPlannerDay(new Date().getDay());
    setPage(next);
  };
  const editDay = (day: number) => {
    navigate('planner');
    setPlannerDay(day);
  };
  const applyAssignment = (assignment: GroupAssignment) => {
    if (!data) return;
    const exercises = assignment.exercises.flatMap((entry) => {
      const definition = EXERCISES.find((exercise) => exercise.id === entry.exerciseId);
      return definition
        ? [
            {
              id: uid(),
              exerciseId: definition.id,
              sets: entry.sets,
              reps: entry.reps,
              weight: entry.loadKg ?? 0,
              rest: entry.restSec ?? data.settings.restSeconds,
            },
          ]
        : [];
    });
    if (!exercises.length) {
      notify(groupT(data.settings.language, 'noKnownExercises'));
      return;
    }
    const day = new Date(`${assignment.date}T12:00:00`).getDay();
    change({
      ...data,
      plans: {
        ...data.plans,
        [day]: { title: assignment.title, exercises, note: assignment.note ?? '' },
      },
    });
    editDay(day);
    notify(t('planSaved'));
  };
  const finish = (session: Session) => {
    if (!data) return;
    const completed = { ...session, xp: calculateSessionXp(session, data.sessions) };
    const next = { ...data, sessions: [...data.sessions, completed] };
    const before = getProgress(data).rank.name;
    const after = getProgress(next).rank.name;
    change(next);
    navigate('dashboard');
    notify(`${t('workoutSaved')} · +${completed.xp} XP`);
    if (before !== after) setRankCelebration(after);
  };
  const importBackup = async (file: File) => {
    try {
      if (file.size > 8_000_000) throw new Error('size');
      const value = parseBackup(await file.text());
      change(value);
      setLoadError(false);
      navigate('dashboard');
      notify(t('backupImported'));
    } catch {
      notify(t('error'));
    }
  };
  if (!ready)
    return (
      <div className="loading">
        <Brand />
        <span className="loader" />
      </div>
    );
  if (loadError || !data)
    return (
      <main className="loading">
        <Brand />
        <h1>{t('loadFailed')}</h1>
        <label className="button primary">
          {t('importBackup')}
          <input
            type="file"
            accept=".json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBackup(file);
            }}
          />
        </label>
        <button
          className="button secondary"
          onClick={() => {
            setData(createInitialData());
            setLoadError(false);
          }}
        >
          {t('reset')}
        </button>
      </main>
    );
  if (!data.profile)
    return (
      <Onboarding
        data={data}
        onComplete={(profile, language) =>
          change({
            ...data,
            profile,
            settings: { ...data.settings, language },
            plans: localizeStarterPlans(createStarterPlans(profile), language),
            bodyLogs: [{ date: localDate(), weight: profile.weight }],
          })
        }
      />
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t('training')}
      </a>
      <header className="sidebar">
        <Brand />
        <nav aria-label="Main navigation">
          {NAV.map(({ id, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id && !activePlan ? 'selected' : ''}`}
              aria-current={page === id && !activePlan ? 'page' : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>
                {id === 'groups'
                  ? groupT(data.settings.language, 'groups')
                  : t(id === 'dashboard' ? 'today' : id)}
              </span>
            </button>
          ))}
        </nav>
        <div className="header-tools">
          <span className="profile-mini">
            <strong>{data.profile.name}</strong>
            {isPremium(data) && <small>FORM PLUS</small>}
          </span>
          <button
            className="icon-button"
            onClick={() => navigate('settings')}
            aria-label={t('settings')}
          >
            <Settings2 size={20} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="main-area">
        <header className="topbar">
          <Brand />
          <div className="header-tools">
            <button
              className="icon-button"
              onClick={() => navigate('settings')}
              aria-label={t('settings')}
            >
              <Settings2 size={20} aria-hidden="true" />
            </button>
          </div>
        </header>
        <main className="main-content" id="main-content" key={activePlan ? 'active' : page}>
          {activePlan ? (
            <Workout
              data={data}
              plan={activePlan}
              onFinish={finish}
              onCancel={() => setActivePlan(null)}
            />
          ) : (
            <>
              {page === 'dashboard' && (
                <Dashboard
                  data={data}
                  onNavigate={navigate}
                  onEditDay={editDay}
                  onStart={setActivePlan}
                />
              )}
              {page === 'planner' && (
                <Planner
                  data={data}
                  initialDay={plannerDay}
                  onChange={change}
                  onStart={setActivePlan}
                  notify={notify}
                />
              )}
              {page === 'notes' && <Notes data={data} onChange={change} notify={notify} />}
              {page === 'groups' && (
                <Groups
                  language={data.settings.language}
                  sessions={data.sessions}
                  displayName={data.profile.name}
                  plans={data.plans}
                  onApplyAssignment={applyAssignment}
                  onHostServer={window.gymGroups ? () => window.gymGroups!.host() : undefined}
                />
              )}
              {page === 'progress' && (
                <Progress
                  data={data}
                  onChange={change}
                  onPremium={() => navigate('premium')}
                  notify={notify}
                />
              )}
              {page === 'premium' && <PremiumPage data={data} />}
              {page === 'settings' && (
                <SettingsPage
                  data={data}
                  onChange={change}
                  onImport={importBackup}
                  onPremium={() => navigate('premium')}
                  notify={notify}
                />
              )}
            </>
          )}
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <Check size={18} aria-hidden="true" />
          {toast}
          <button className="icon-button" onClick={() => setToast('')} aria-label={t('close')}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      {rankCelebration && (
        <div className="modal-backdrop">
          <div role="dialog" aria-modal="true" className="modal celebration">
            <Trophy size={40} aria-hidden="true" />
            <div className="achievement-burst" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} style={{ '--particle': i } as CSSProperties} />
              ))}
            </div>
            <p>{t('rankUpgrade')}</p>
            <h2>{rankCelebration}</h2>
            <button className="button primary" onClick={() => setRankCelebration('')}>
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
