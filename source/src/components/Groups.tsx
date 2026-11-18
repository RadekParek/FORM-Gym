import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Check, Copy, MessageCircle, Plus, RefreshCw, Server, Trash2, Users } from 'lucide-react';
import { EXERCISES, RANKS, type DayPlan, type Language, type Session } from '../model';
import { localDate } from '../engine';
import { groupT } from '../group-i18n';
import { useT } from '../i18n';
import {
  GroupApiError,
  assignmentExercises,
  connectGroup,
  connectionKey,
  fetchGroupState,
  loadGroupStore,
  mutateGroup,
  saveGroupStore,
  sharedSessionInput,
  type GroupAssignment,
  type GroupHostResult,
  type GroupState,
  type Invite,
  type SharedSession,
} from '../groups';

export interface GroupsProps {
  language: Language;
  sessions: Session[];
  displayName: string;
  plans?: Record<string, DayPlan>;
  onApplyAssignment?: (assignment: GroupAssignment) => void;
  onHostServer?: () => Promise<GroupHostResult>;
}
type Tab = 'feed' | 'training' | 'leaderboard' | 'members';
const tabs: Tab[] = ['feed', 'training', 'leaderboard', 'members'];
const availableIds = new Set(EXERCISES.map((exercise) => exercise.id));

function ReviewForm({
  session,
  language,
  busy,
  disabled,
  onSave,
}: {
  session: SharedSession;
  language: Language;
  busy: boolean;
  disabled: boolean;
  onSave: (grade: number, comment: string) => Promise<boolean>;
}) {
  const t = (key: Parameters<typeof groupT>[1]) => groupT(language, key);
  const [grade, setGrade] = useState(String(session.review?.grade || 3));
  const [comment, setComment] = useState(session.review?.comment || '');
  useEffect(() => {
    setGrade(String(session.review?.grade || 3));
    setComment(session.review?.comment || '');
  }, [session.review?.updatedAt]);
  return (
    <form
      className="group-form group-review"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(Number(grade), comment.trim());
      }}
    >
      <h3>{t('review')}</h3>
      <label className="field">
        <span>{t('grade')}</span>
        <select value={grade} onChange={(event) => setGrade(event.target.value)}>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t('feedback')}</span>
        <textarea
          maxLength={1000}
          rows={2}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
      </label>
      <button className="button secondary" disabled={busy || disabled}>
        {busy ? t('saving') : t('saveReview')}
      </button>
    </form>
  );
}

export default function Groups({
  language,
  sessions,
  displayName,
  plans = {},
  onApplyAssignment,
  onHostServer,
}: GroupsProps) {
  const t = (key: Parameters<typeof groupT>[1]) => groupT(language, key);
  const [store, setStore] = useState(loadGroupStore);
  const workoutT = useT(language);
  const current = store.connections.find(
    (connection) => connectionKey(connection) === store.activeKey,
  );
  const [state, setState] = useState<GroupState | undefined>(current?.cached);
  const [online, setOnline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [tab, setTab] = useState<Tab>('feed');
  const [showConnect, setShowConnect] = useState(!current);
  const [mode, setMode] = useState<'create' | 'join'>('join');
  const [endpoint, setEndpoint] = useState(current?.endpoint || '');
  const [hostAddresses, setHostAddresses] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [memberName, setMemberName] = useState(displayName);
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState<Invite>();
  const invites = useRef(new Map<string, Invite>());
  const [message, setMessage] = useState('');
  const [planDay, setPlanDay] = useState(
    Object.keys(plans).find((day) => plans[day].exercises.length > 0) || '',
  );
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentDate, setAssignmentDate] = useState(localDate());
  const [assignmentNote, setAssignmentNote] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [linkedAssignment, setLinkedAssignment] = useState('');
  const [consent, setConsent] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    kind: 'apply' | 'delete' | 'remove';
    assignment?: GroupAssignment;
  }>();
  const dialog = useRef<HTMLDialogElement>(null);
  const lifetime = useRef(new AbortController());
  const refresh = useRef<(force?: boolean) => Promise<void>>(async () => {});
  const drafts = useRef(new Map<string, { fingerprint: string; id: string }>());
  const isLeader = state?.me.role === 'leader';
  const planChoices = Object.entries(plans).filter(([, plan]) => plan.exercises.length > 0);
  const completedSessions = sessions.filter((session) =>
    session.exercises.some((exercise) => exercise.sets.some((set) => set.done)),
  );
  const localSession = completedSessions.find((session) => session.id === selectedSession);
  const sharedIds = new Set(
    state?.sessions
      .filter((session) => session.memberId === state.me.id)
      .map((session) => session.clientId),
  );
  const sessionPreview = localSession
    ? sharedSessionInput(localSession, language, linkedAssignment || undefined)
    : undefined;
  const groupName = state?.group.name || current?.name;
  const visibleAssignments =
    state?.assignments.filter(
      (assignment) =>
        isLeader || assignment.memberIds.length === 0 || assignment.memberIds.includes(state.me.id),
    ) || [];
  const displayedError = error || syncError;

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  useEffect(() => {
    try {
      saveGroupStore(store);
    } catch {
      setError(t('storageError'));
    }
  }, [store]);
  useEffect(() => {
    if (confirmation) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirmation]);
  useEffect(() => {
    setAssignmentTitle(plans[planDay]?.title || '');
  }, [planDay]);

  const errorText = (value: unknown) => {
    if (value instanceof GroupApiError) {
      if (value.code === 'endpoint') return t('endpointError');
      if (value.code === 'network') return t('networkError');
      if (value.code === 'storage') return t('storageError');
      if (value.code === 'response') return t('responseError');
      if (value.status === 401 || value.status === 403) return t('accessError');
    }
    return t('saveError');
  };

  useEffect(() => {
    setState(current?.cached);
    setOnline(false);
    setInvite(current ? invites.current.get(connectionKey(current)) : undefined);
    setMessage('');
    setSelectedSession('');
    setConsent(false);
    setLinkedAssignment('');
    setRecipients([]);
    setError('');
    setSyncError('');
    setNotice('');
    if (!current) {
      refresh.current = async () => {};
      setShowConnect(true);
      return;
    }
    const connection = current;
    const controller = new AbortController();
    let revision = connection.cached?.revision;
    let loading = false;
    let pending = false;
    async function load(force = false): Promise<void> {
      if (controller.signal.aborted) return;
      if (loading) {
        if (force) pending = true;
        return;
      }
      loading = true;
      setRefreshing(true);
      try {
        const next = await fetchGroupState(
          connection,
          force ? undefined : revision,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (next) {
          revision = next.revision;
          setState(next);
        }
        setOnline(true);
        setSyncError('');
        setStore((previous) => ({
          ...previous,
          connections: previous.connections.map((entry) =>
            connectionKey(entry) === connectionKey(connection)
              ? {
                  ...entry,
                  name: next?.group.name || entry.name,
                  cached: next || entry.cached,
                  lastUpdated: new Date().toISOString(),
                }
              : entry,
          ),
        }));
      } catch (value) {
        if (!controller.signal.aborted) {
          setOnline(false);
          setSyncError(errorText(value));
        }
      } finally {
        loading = false;
        if (!controller.signal.aborted) {
          setRefreshing(false);
          if (pending) {
            pending = false;
            void load(true);
          }
        }
      }
    }
    refresh.current = load;
    void load();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 8000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      controller.abort();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [current?.endpoint, current?.groupId, current?.token]);

  function draftId(kind: string, value: unknown): string {
    const fingerprint = JSON.stringify(value);
    const existing = drafts.current.get(kind);
    if (existing?.fingerprint === fingerprint) return existing.id;
    const next = { fingerprint, id: crypto.randomUUID() };
    drafts.current.set(kind, next);
    return next.id;
  }

  async function run(
    action: string,
    task: () => Promise<void>,
    success?: Parameters<typeof groupT>[1],
  ): Promise<boolean> {
    if (busy) return false;
    if (current && action !== 'connect' && action !== 'host' && !online) {
      setError(t('networkError'));
      return false;
    }
    const signal = lifetime.current.signal;
    setBusy(action);
    setError('');
    setNotice('');
    try {
      await task();
      if (signal.aborted) return false;
      if (success) setNotice(t(success));
      await refresh.current(true);
      return true;
    } catch (value) {
      if (!signal.aborted) {
        setError(errorText(value));
        if (value instanceof GroupApiError && (value.code === 'network' || value.status === 401))
          setOnline(false);
      }
      return false;
    } finally {
      if (!signal.aborted) setBusy('');
    }
  }

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

  async function connect(event: FormEvent) {
    event.preventDefault();
    if (
      !endpoint.trim() ||
      !memberName.trim() ||
      !(mode === 'create' ? name.trim() : code.trim())
    ) {
      setError(t('required'));
      return;
    }
    await run('connect', async () => {
      const result = await connectGroup(
        endpoint,
        mode,
        { name, displayName: memberName, inviteCode: code, deviceId: store.deviceId },
        lifetime.current.signal,
      );
      if (lifetime.current.signal.aborted) return;
      const key = connectionKey(result.connection);
      if (result.invite) invites.current.set(key, result.invite);
      setStore((previous) => ({
        ...previous,
        activeKey: key,
        connections: [
          ...previous.connections.filter((entry) => connectionKey(entry) !== key),
          result.connection,
        ],
      }));
      setShowConnect(false);
      setCode('');
      if (mode === 'create') setTab('members');
    });
  }

  const memberLabel = (id: string) =>
    state?.members.find((member) => member.id === id)?.displayName || id;
  const formattedDate = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString(language, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  const timestamp = (date: string) =>
    new Date(date).toLocaleString(language, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <section className="page groups-page">
      <header className="page-heading">
        <div>
          <h1>{t('groups')}</h1>
          <p className="muted">{t('subtitle')}</p>
        </div>
        {current && (
          <button className="button secondary" onClick={() => setShowConnect(!showConnect)}>
            <Plus size={16} />
            {t('manage')}
          </button>
        )}
      </header>
      {displayedError && (
        <div className="group-error" role="alert">
          <p>{displayedError}</p>
          {current && (
            <button
              className="button secondary"
              disabled={refreshing}
              onClick={() => {
                setError('');
                void refresh.current(true);
              }}
            >
              {t('retry')}
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="group-notice" role="status">
          <Check size={16} />
          {notice}
        </p>
      )}
      {(showConnect || !current) && (
        <section className="panel group-connect">
          <form
            className="group-form"
            onSubmit={(event) => {
              void connect(event);
            }}
          >
            <div className="group-actions" role="group" aria-label={t('connect')}>
              <button
                type="button"
                className={`button ${mode === 'join' ? 'primary' : 'secondary'}`}
                aria-pressed={mode === 'join'}
                onClick={() => setMode('join')}
              >
                {t('join')}
              </button>
              <button
                type="button"
                className={`button ${mode === 'create' ? 'primary' : 'secondary'}`}
                aria-pressed={mode === 'create'}
                onClick={() => setMode('create')}
              >
                {t('create')}
              </button>
            </div>
            <div className="group-connection-grid">
              <label className="field">
                <span>{t('server')}</span>
                <input
                  type="url"
                  required
                  maxLength={300}
                  placeholder="https://…"
                  value={endpoint}
                  onChange={(event) => setEndpoint(event.target.value)}
                  autoComplete="off"
                  aria-describedby="group-server-help"
                />
              </label>
              <label className="field">
                <span>{t('displayName')}</span>
                <input
                  required
                  maxLength={40}
                  value={memberName}
                  onChange={(event) => setMemberName(event.target.value)}
                  autoComplete="nickname"
                />
              </label>
              {mode === 'create' ? (
                <label className="field">
                  <span>{t('groupName')}</span>
                  <input
                    required
                    maxLength={80}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
              ) : (
                <label className="field">
                  <span>{t('inviteCode')}</span>
                  <input
                    required
                    maxLength={80}
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </label>
              )}
            </div>
            <p className="muted" id="group-server-help">
              {t('serverHint')}
            </p>
            <div className="group-actions">
              <button className="button primary" disabled={Boolean(busy)}>
                <Users size={16} />
                {busy === 'connect' ? t('connecting') : t(mode)}
              </button>
              {onHostServer && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    void run('host', async () => {
                      const result = await onHostServer();
                      if (lifetime.current.signal.aborted) return;
                      setEndpoint(result.endpoint);
                      setHostAddresses(result.endpoints || [result.endpoint]);
                    });
                  }}
                >
                  <Server size={16} />
                  {busy === 'host' ? t('hosting') : t('host')}
                </button>
              )}
            </div>
            {hostAddresses.length > 0 && (
              <div className="group-host-addresses">
                <p>{t('hostHint')}</p>
                <label className="field">
                  <span>{t('addresses')}</span>
                  <select value={endpoint} onChange={(event) => setEndpoint(event.target.value)}>
                    {hostAddresses.map((address) => (
                      <option key={address}>{address}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </form>
          <p className="fine-print group-privacy">{t('privacy')}</p>
        </section>
      )}
      {current && (
        <>
          <header className="group-header panel">
            <div>
              <h2>{groupName}</h2>
              <p className={`group-status ${online ? 'connected' : 'offline'}`}>
                {online ? t('online') : current.cached ? t('offline') : t('notLoaded')}
              </p>
              {current.lastUpdated && (
                <p className="fine-print">
                  {t('lastUpdated')}: {timestamp(current.lastUpdated)}
                </p>
              )}
            </div>
            <div className="group-actions">
              {store.connections.length > 1 && (
                <label className="field">
                  <span>{t('yourGroups')}</span>
                  <select
                    value={store.activeKey || ''}
                    disabled={Boolean(busy)}
                    onChange={(event) =>
                      setStore((previous) => ({ ...previous, activeKey: event.target.value }))
                    }
                  >
                    {store.connections.map((connection) => (
                      <option key={connectionKey(connection)} value={connectionKey(connection)}>
                        {connection.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                className="button secondary"
                disabled={refreshing}
                onClick={() => {
                  setError('');
                  void refresh.current(true);
                }}
              >
                <RefreshCw size={16} />
                {refreshing ? t('refreshing') : t('refresh')}
              </button>
            </div>
          </header>
          {!state ? (
            <div className="panel group-empty">
              <p>{t('notLoaded')}</p>
            </div>
          ) : (
            <>
              <div className="group-tabs" role="tablist" aria-label={t('groups')}>
                {tabs.map((value, index) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    id={`group-tab-${value}`}
                    aria-controls={`group-panel-${value}`}
                    aria-selected={tab === value}
                    tabIndex={tab === value ? 0 : -1}
                    onClick={() => setTab(value)}
                    onKeyDown={(event) => navigateTabs(event, index)}
                  >
                    {t(value)}
                  </button>
                ))}
              </div>
              <div
                className="group-content"
                id={`group-panel-${tab}`}
                role="tabpanel"
                aria-labelledby={`group-tab-${tab}`}
              >
                {tab === 'feed' && (
                  <section className="panel group-feed">
                    <div
                      className="group-messages"
                      aria-live="polite"
                      aria-relevant="additions"
                      role="log"
                      aria-label={t('feed')}
                    >
                      {state.messages.length === 0 ? (
                        <div className="group-empty">
                          <MessageCircle size={28} />
                          <p>{t('emptyFeed')}</p>
                        </div>
                      ) : (
                        state.messages.slice(-100).map((item) => (
                          <article
                            className={`group-message ${item.memberId === state.me.id ? 'own' : ''}`}
                            key={item.id}
                          >
                            <header>
                              <strong>{memberLabel(item.memberId)}</strong>
                              <time dateTime={item.createdAt}>{timestamp(item.createdAt)}</time>
                            </header>
                            <p>{item.text}</p>
                          </article>
                        ))
                      )}
                    </div>
                    <form
                      className="group-form group-composer"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!message.trim()) return;
                        const text = message.trim();
                        void run(
                          'message',
                          async () => {
                            await mutateGroup(
                              current,
                              '/messages',
                              { clientId: draftId(`message:${current.groupId}`, text), text },
                              'POST',
                              lifetime.current.signal,
                            );
                            if (!lifetime.current.signal.aborted) {
                              setMessage('');
                              drafts.current.delete(`message:${current.groupId}`);
                            }
                          },
                          'sent',
                        );
                      }}
                    >
                      <label className="field">
                        <span>{t('message')}</span>
                        <textarea
                          rows={3}
                          maxLength={2000}
                          placeholder={t('messagePlaceholder')}
                          value={message}
                          onChange={(event) => setMessage(event.target.value)}
                          required
                        />
                      </label>
                      <button
                        className="button primary"
                        disabled={Boolean(busy) || !online || !message.trim()}
                      >
                        {busy === 'message' ? t('sending') : t('send')}
                      </button>
                    </form>
                  </section>
                )}
                {tab === 'training' && (
                  <div className="group-training">
                    {isLeader && (
                      <details className="panel group-assignment-form">
                        <summary>{t('assign')}</summary>
                        {planChoices.length === 0 ? (
                          <p className="muted">{t('noPlans')}</p>
                        ) : (
                          <form
                            className="group-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const plan = plans[planDay];
                              if (!plan || !assignmentTitle.trim()) return;
                              const input = {
                                title: assignmentTitle.trim(),
                                date: assignmentDate,
                                memberIds: recipients,
                                exercises: assignmentExercises(plan, language),
                                note: assignmentNote.trim(),
                              };
                              void run(
                                'assignment',
                                async () => {
                                  await mutateGroup(
                                    current,
                                    '/assignments',
                                    {
                                      ...input,
                                      clientId: draftId(`assignment:${current.groupId}`, input),
                                    },
                                    'POST',
                                    lifetime.current.signal,
                                  );
                                  if (!lifetime.current.signal.aborted) {
                                    setAssignmentNote('');
                                    drafts.current.delete(`assignment:${current.groupId}`);
                                  }
                                },
                                'assignmentSaved',
                              );
                            }}
                          >
                            <label className="field">
                              <span>{t('plan')}</span>
                              <select
                                value={planDay}
                                onChange={(event) => setPlanDay(event.target.value)}
                              >
                                {planChoices.map(([day, plan]) => (
                                  <option key={day} value={day}>
                                    {plan.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <div className="group-connection-grid">
                              <label className="field">
                                <span>{t('title')}</span>
                                <input
                                  required
                                  maxLength={100}
                                  value={assignmentTitle}
                                  onChange={(event) => setAssignmentTitle(event.target.value)}
                                />
                              </label>
                              <label className="field">
                                <span>{t('date')}</span>
                                <input
                                  required
                                  type="date"
                                  value={assignmentDate}
                                  onChange={(event) => setAssignmentDate(event.target.value)}
                                />
                              </label>
                            </div>
                            <fieldset className="group-recipients">
                              <legend>{t('recipients')}</legend>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={recipients.length === 0}
                                  onChange={() => setRecipients([])}
                                />
                                {t('allMembers')}
                              </label>
                              {state.members.map((member) => (
                                <label key={member.id}>
                                  <input
                                    type="checkbox"
                                    checked={recipients.includes(member.id)}
                                    onChange={(event) =>
                                      setRecipients((previous) =>
                                        event.target.checked
                                          ? [...previous, member.id]
                                          : previous.filter((id) => id !== member.id),
                                      )
                                    }
                                  />
                                  {member.displayName}
                                </label>
                              ))}
                            </fieldset>
                            <label className="field">
                              <span>{t('groupNote')}</span>
                              <textarea
                                rows={2}
                                maxLength={2000}
                                value={assignmentNote}
                                onChange={(event) => setAssignmentNote(event.target.value)}
                              />
                            </label>
                            <button className="button primary" disabled={Boolean(busy) || !online}>
                              {busy === 'assignment' ? t('saving') : t('saveAssignment')}
                            </button>
                          </form>
                        )}
                      </details>
                    )}
                    <section className="group-assignments">
                      <h2>{t('assignments')}</h2>
                      {visibleAssignments.length === 0 && (
                        <p className="muted">{t('noAssignments')}</p>
                      )}
                      {visibleAssignments.map((assignment) => {
                        const known = assignment.exercises.some(
                          (exercise) =>
                            exercise.exerciseId && availableIds.has(exercise.exerciseId),
                        );
                        return (
                          <article className="panel group-assignment" key={assignment.id}>
                            <header>
                              <h3>{assignment.title}</h3>
                              <time dateTime={assignment.date}>
                                {formattedDate(assignment.date)}
                              </time>
                            </header>
                            <p className="fine-print">
                              {t('assignedTo')}:{' '}
                              {assignment.memberIds.length === 0
                                ? t('allMembers')
                                : assignment.memberIds.map(memberLabel).join(', ')}
                            </p>
                            <ul>
                              {assignment.exercises.map((exercise, index) => (
                                <li key={index}>
                                  <strong>{exercise.name}</strong>
                                  <span>
                                    {exercise.sets} × {exercise.reps}{' '}
                                    {workoutT(
                                      exercise.exerciseId === 'plank'
                                        ? 'seconds'
                                        : ['walk', 'cycle', 'rower'].includes(
                                              exercise.exerciseId || '',
                                            )
                                          ? 'minutes'
                                          : 'reps',
                                    )}
                                    {exercise.loadKg ? ` · ${exercise.loadKg} kg` : ''}
                                  </span>
                                </li>
                              ))}
                            </ul>
                            {assignment.note && <p className="group-text">{assignment.note}</p>}
                            {!known && <p className="fine-print">{t('noKnownExercises')}</p>}
                            <div className="group-actions">
                              {onApplyAssignment && (
                                <button
                                  className="button secondary"
                                  disabled={!known}
                                  onClick={() => setConfirmation({ kind: 'apply', assignment })}
                                >
                                  <Copy size={16} />
                                  {t('addToWeek')}
                                </button>
                              )}
                              {isLeader && (
                                <button
                                  className="icon-button danger"
                                  aria-label={`${t('deleteAssignment')}: ${assignment.title}`}
                                  disabled={Boolean(busy) || !online}
                                  onClick={() => setConfirmation({ kind: 'delete', assignment })}
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </section>
                    <details className="panel group-share-form">
                      <summary>{t('share')}</summary>
                      {completedSessions.length === 0 ? (
                        <p className="muted">{t('noLocalSessions')}</p>
                      ) : (
                        <form
                          className="group-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (!sessionPreview || !consent || sharedIds.has(selectedSession))
                              return;
                            void run(
                              'session',
                              async () => {
                                await mutateGroup(
                                  current,
                                  '/sessions',
                                  sessionPreview,
                                  'POST',
                                  lifetime.current.signal,
                                );
                                if (!lifetime.current.signal.aborted) {
                                  setConsent(false);
                                  setSelectedSession('');
                                }
                              },
                              'sessionShared',
                            );
                          }}
                        >
                          <label className="field">
                            <span>{t('session')}</span>
                            <select
                              required
                              value={selectedSession}
                              onChange={(event) => {
                                setSelectedSession(event.target.value);
                                setConsent(false);
                              }}
                            >
                              <option value="">{t('none')}</option>
                              {completedSessions.map((session) => (
                                <option
                                  key={session.id}
                                  value={session.id}
                                  disabled={sharedIds.has(session.id)}
                                >
                                  {formattedDate(session.date)} · {session.title}
                                  {sharedIds.has(session.id) ? ` · ${t('shared')}` : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field">
                            <span>{t('assignment')}</span>
                            <select
                              value={linkedAssignment}
                              onChange={(event) => setLinkedAssignment(event.target.value)}
                            >
                              <option value="">{t('none')}</option>
                              {state.assignments
                                .filter(
                                  (item) =>
                                    item.memberIds.length === 0 ||
                                    item.memberIds.includes(state.me.id),
                                )
                                .map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.title} · {formattedDate(item.date)}
                                  </option>
                                ))}
                            </select>
                          </label>
                          {sessionPreview && (
                            <div className="group-share-preview">
                              <p>
                                {formattedDate(sessionPreview.date)} ·{' '}
                                {sessionPreview.durationMinutes} {t('minutes')}
                              </p>
                              <ul>
                                {sessionPreview.exercises.map((exercise, index) => (
                                  <li key={index}>
                                    <strong>{exercise.name}</strong>
                                    <span>
                                      {exercise.sets.length} {t('sets')}
                                      {' · '}
                                      {exercise.sets
                                        .map((set) =>
                                          set.seconds
                                            ? `${set.seconds} s`
                                            : `${set.reps} × ${set.loadKg || 0} kg`,
                                        )
                                        .join(' · ')}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <label className="group-consent">
                            <input
                              type="checkbox"
                              checked={consent}
                              onChange={(event) => setConsent(event.target.checked)}
                              required
                            />
                            {t('consent')}
                          </label>
                          <p className="fine-print">{t('privateNotes')}</p>
                          <button
                            className="button primary"
                            disabled={
                              Boolean(busy) ||
                              !online ||
                              !consent ||
                              !selectedSession ||
                              sharedIds.has(selectedSession)
                            }
                          >
                            {busy === 'session' ? t('sending') : t('submit')}
                          </button>
                        </form>
                      )}
                    </details>
                    <section className="group-sessions">
                      <h2>{t('sharedSessions')}</h2>
                      {state.sessions.length === 0 && <p className="muted">{t('noSessions')}</p>}
                      {[...state.sessions].reverse().map((session) => (
                        <details className="panel group-session" key={session.id}>
                          <summary>
                            <strong>{memberLabel(session.memberId)}</strong>
                            <span>
                              {formattedDate(session.date)} · {session.completedSets} {t('sets')} ·{' '}
                              {session.durationMinutes} {t('minutes')}
                            </span>
                          </summary>
                          <ul>
                            {session.exercises.map((exercise, index) => (
                              <li key={index}>
                                <strong>{exercise.name}</strong>
                                <span>
                                  {exercise.sets
                                    .map((set) =>
                                      set.seconds
                                        ? `${set.seconds} s`
                                        : `${set.reps} × ${set.loadKg || 0} kg`,
                                    )
                                    .join(' · ')}
                                </span>
                              </li>
                            ))}
                          </ul>
                          <p className="fine-print">
                            {session.score} {t('score')} ·{' '}
                            {session.volumeKg.toLocaleString(language)} kg {t('volume')}
                          </p>
                          {session.note && <p className="group-text">{session.note}</p>}
                          <p className="group-grade">
                            {session.review
                              ? `${t('reviewed')}: ${session.review.grade}/5`
                              : t('awaitingReview')}
                          </p>
                          {session.review?.comment && (
                            <p className="group-text">{session.review.comment}</p>
                          )}
                          {isLeader && (
                            <ReviewForm
                              session={session}
                              language={language}
                              busy={Boolean(busy)}
                              disabled={!online}
                              onSave={(grade, comment) =>
                                run(
                                  `review:${session.id}`,
                                  async () => {
                                    await mutateGroup(
                                      current,
                                      `/sessions/${encodeURIComponent(session.id)}/review`,
                                      { grade, comment },
                                      'PUT',
                                      lifetime.current.signal,
                                    );
                                  },
                                  'saved',
                                )
                              }
                            />
                          )}
                        </details>
                      ))}
                    </section>
                  </div>
                )}
                {tab === 'leaderboard' && (
                  <section className="panel group-leaderboard">
                    <h2>{t('leaderboard')}</h2>
                    <p className="muted">{t('scoreHint')}</p>
                    {state.members.every((member) => member.sessionCount === 0) ? (
                      <div className="group-empty">
                        <p>{t('emptyLeaderboard')}</p>
                      </div>
                    ) : (
                      <ol>
                        {[...state.members]
                          .sort(
                            (a, b) =>
                              b.score - a.score || a.displayName.localeCompare(b.displayName),
                          )
                          .map((member, index) => {
                            const rank =
                              [...RANKS].reverse().find((item) => member.score >= item.minXp) ||
                              RANKS[0];
                            return (
                              <li
                                className={member.id === state.me.id ? 'own' : ''}
                                key={member.id}
                              >
                                <span className="position" aria-hidden="true">
                                  {index + 1}
                                </span>
                                <div>
                                  <strong>
                                    {member.displayName}
                                    {member.id === state.me.id ? ` · ${t('you')}` : ''}
                                  </strong>
                                  <span className="badge">{rank.name}</span>
                                  <p className="fine-print">
                                    {member.sessionCount} {t('workouts')} · {member.trainingDays}{' '}
                                    {t('days')} · {member.completedSets} {t('sets')}
                                  </p>
                                </div>
                                <strong>{member.score.toLocaleString(language)} XP</strong>
                              </li>
                            );
                          })}
                      </ol>
                    )}
                  </section>
                )}
                {tab === 'members' && (
                  <section className="panel group-members">
                    <h2>{t('members')}</h2>
                    {state.members.length === 0 ? (
                      <p className="muted">{t('emptyMembers')}</p>
                    ) : (
                      <ul>
                        {state.members.map((member) => (
                          <li key={member.id}>
                            <strong>
                              {member.displayName}
                              {member.id === state.me.id ? ` · ${t('you')}` : ''}
                            </strong>
                            <span className="badge">{t(member.role)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {isLeader && (
                      <section className="group-invite">
                        <h3>{t('invite')}</h3>
                        <button
                          className="button secondary"
                          disabled={Boolean(busy) || !online}
                          onClick={() => {
                            void run('invite', async () => {
                              const result = await mutateGroup<Invite>(
                                current,
                                '/invite',
                                {},
                                'POST',
                                lifetime.current.signal,
                              );
                              if (!lifetime.current.signal.aborted) {
                                invites.current.set(connectionKey(current), result);
                                setInvite(result);
                              }
                            });
                          }}
                        >
                          {t('generateInvite')}
                        </button>
                        {invite && (
                          <div className="group-invite-code">
                            <code>{invite.inviteCode}</code>
                            <p className="fine-print">
                              {t('expires')}: {timestamp(invite.inviteExpiresAt)}
                            </p>
                            <button
                              className="button secondary"
                              onClick={() => {
                                if (!navigator.clipboard) {
                                  setError(t('copyUnavailable'));
                                  return;
                                }
                                void navigator.clipboard
                                  .writeText(invite.inviteCode)
                                  .then(() => setNotice(t('copied')))
                                  .catch(() => setError(t('copyUnavailable')));
                              }}
                            >
                              <Copy size={16} />
                              {t('copy')}
                            </button>
                          </div>
                        )}
                      </section>
                    )}
                    <details className="group-remove">
                      <summary>{t('removeLocal')}</summary>
                      <p className="fine-print">{t('removeHint')}</p>
                      <button
                        className="button secondary"
                        onClick={() => setConfirmation({ kind: 'remove' })}
                      >
                        {t('disconnect')}
                      </button>
                    </details>
                  </section>
                )}
              </div>
            </>
          )}
        </>
      )}
      <dialog
        className="modal group-dialog"
        ref={dialog}
        onClose={() => setConfirmation(undefined)}
      >
        {confirmation && (
          <>
            <h2>
              {confirmation.kind === 'apply'
                ? t('replaceTitle')
                : confirmation.kind === 'delete'
                  ? t('deleteAssignment')
                  : t('disconnectTitle')}
            </h2>
            <p>
              {confirmation.kind === 'apply'
                ? t('replaceHint').replace('{date}', formattedDate(confirmation.assignment!.date))
                : confirmation.kind === 'remove'
                  ? t('removeHint')
                  : confirmation.assignment?.title}
            </p>
            {confirmation.kind === 'apply' && <p className="fine-print">{t('noMatches')}</p>}
            <div className="group-actions">
              <button className="button secondary" onClick={() => setConfirmation(undefined)}>
                {t('cancel')}
              </button>
              <button
                className="button primary"
                disabled={Boolean(busy) || (confirmation.kind === 'delete' && !online)}
                onClick={() => {
                  const action = confirmation;
                  setConfirmation(undefined);
                  if (action.kind === 'apply' && action.assignment)
                    onApplyAssignment?.(action.assignment);
                  else if (action.kind === 'delete' && action.assignment && current)
                    void run(
                      'delete',
                      async () => {
                        await mutateGroup(
                          current,
                          `/assignments/${encodeURIComponent(action.assignment!.id)}`,
                          undefined,
                          'DELETE',
                          lifetime.current.signal,
                        );
                      },
                      'saved',
                    );
                  else if (action.kind === 'remove' && current)
                    setStore((previous) => {
                      const connections = previous.connections.filter(
                        (entry) => connectionKey(entry) !== connectionKey(current),
                      );
                      return {
                        ...previous,
                        connections,
                        activeKey: connections[0] ? connectionKey(connections[0]) : null,
                      };
                    });
                }}
              >
                {confirmation.kind === 'apply'
                  ? t('replace')
                  : confirmation.kind === 'delete'
                    ? t('deleteAssignment')
                    : t('disconnect')}
              </button>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}
