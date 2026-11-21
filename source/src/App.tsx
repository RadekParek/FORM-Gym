import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  BookOpen,
  CalendarDays,
  Dumbbell,
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
import Workout from './components/Workout';
import Dashboard from './components/Dashboard';
import PremiumPage from './components/PremiumPage';
import SettingsPage from './components/SettingsPage';
import UserAvatar from './components/UserAvatar';
import { featureT } from './feature-i18n';
import { groupT } from './group-i18n';
import { applyNativeAppearance } from './nativeTheme';
import { EXERCISES } from './model';
import { uid } from './engine';
import type { GroupAssignment } from './groups';
import { NOTE_DRAFT_KEY } from './noteDrafts';
const Planner = lazy(() => import('./components/Planner'));
const Notes = lazy(() => import('./components/NotesEditor'));
const Progress = lazy(() => import('./components/Progress'));
const Groups = lazy(() => import('./components/Groups'));
const Library = lazy(() => import('./components/Library'));
const Community = lazy(() => import('./components/Community'));

const NAV = [
  { id: 'dashboard', icon: Home },
  { id: 'planner', icon: CalendarDays },
  { id: 'library', icon: Dumbbell },
  { id: 'notes', icon: BookOpen },
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
    if (data && (next.questClaims?.length || 0) > (data.questClaims?.length || 0)) {
      const before = getProgress(data).rank.name;
      const after = getProgress(next).rank.name;
      if (after !== before) setRankCelebration(after);
    }
    setData(next);
    return saveData(next)
      .then(() => true)
      .catch(() => {
        notify(t('saveFailed'));
        return false;
      });
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
      if (!(await change(value))) return;
      localStorage.removeItem(NOTE_DRAFT_KEY);
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
    <div
      className="app-shell"
      onPointerDownCapture={(event) => {
        const button = (event.target as HTMLElement).closest<HTMLElement>('button');
        if (button) {
          const bounds = button.getBoundingClientRect();
          button.style.setProperty('--press-x', `${event.clientX - bounds.left}px`);
          button.style.setProperty('--press-y', `${event.clientY - bounds.top}px`);
        }
        document.documentElement.style.setProperty(
          '--dialog-origin',
          `${(event.clientX / innerWidth) * 100}% ${(event.clientY / innerHeight) * 100}%`,
        );
      }}
    >
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
                {id === 'library'
                  ? featureT(data.settings.language, 'library')
                  : id === 'groups'
                    ? groupT(data.settings.language, 'groups')
                    : t(id === 'dashboard' ? 'today' : id)}
              </span>
            </button>
          ))}
        </nav>
        <div className="header-tools">
          <span className="profile-mini">
            <UserAvatar avatar={data.profile.avatar} size={32} />
            <strong>{data.profile.username ? `@${data.profile.username}` : data.profile.name}</strong>
            {isPremium(data) && <small>FORM PLUS</small>}
          </span>
          <button
            className="icon-button header-progress"
            onClick={() => navigate('progress')}
            aria-label={t('progress')}
          >
            <TrendingUp size={20} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            onClick={() => navigate('community')}
            aria-label={featureT(data.settings.language, 'account')}
          >
            <Users size={20} aria-hidden="true" />
          </button>
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
              onClick={() => navigate('progress')}
              aria-label={t('progress')}
            >
              <TrendingUp size={20} aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              onClick={() => navigate('community')}
              aria-label={featureT(data.settings.language, 'account')}
            >
              <UserAvatar avatar={data.profile.avatar} size={30} />
            </button>
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
          <Suspense
            fallback={
              <div className="page loading" role="status">
                <span className="loader" />
              </div>
            }
          >
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
                    onChange={change}
                    notify={notify}
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
                {page === 'library' && <Library data={data} onChange={change} notify={notify} />}
                {page === 'community' && <Community data={data} onChange={change} />}
                {page === 'groups' && (
                  <Groups
                    language={data.settings.language}
                    sessions={data.sessions}
                  displayName={data.profile.username || data.profile.name || 'Athlete'}
                    plans={data.plans}
                    onApplyAssignment={applyAssignment}
                    onHostServer={window.gymGroups ? () => window.gymGroups!.host() : undefined}
                    onGlobal={() => navigate('community')}
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
          </Suspense>
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
