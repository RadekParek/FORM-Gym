import { useEffect, useState } from 'react';
import { Check, Copy, LogOut, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import type { AppData } from '../model';
import { GroupApiError, groupRequest } from '../groups';
import {
  communityEndpoint,
  loadCommunity,
  saveCommunity,
  signIn,
  refreshCommunity,
  publishWorkouts,
  type CommunityUser,
} from '../community';
import { featureT } from '../feature-i18n';
import { questLevel } from '../quests';
import UserAvatar from './UserAvatar';
import RankEmblem from './RankEmblem';
import { rankStyle } from '../ranks';

export default function AccountPanel({
  data,
  onSigned,
  leaderboard = false,
}: {
  data: AppData;
  onSigned?: (user: CommunityUser) => void;
  leaderboard?: boolean;
}) {
  const [store, setStore] = useState(loadCommunity);
  const [endpoint, setEndpoint] = useState(store.endpoint || communityEndpoint());
  const [username, setUsername] = useState(data.profile?.username || '');
  const [password, setPassword] = useState('');
  const [recovery, setRecovery] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [mode, setMode] = useState<'register' | 'login' | 'reset'>('register');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [consent, setConsent] = useState(false);
  const f = (key: Parameters<typeof featureT>[1]) => featureT(data.settings.language, key);
  useEffect(() => {
    if (store.endpoint) saveCommunity(store);
  }, [store]);
  async function run(action: string, task: () => Promise<void>) {
    if (busy) return;
    setBusy(action);
    setError('');
    try {
      await task();
      setConnected(true);
    } catch (value) {
      setConnected(false);
      setError(
        f(
          value instanceof GroupApiError && value.code === 'USERNAME_TAKEN'
            ? 'usernameTaken'
            : value instanceof GroupApiError && value.code === 'LOGIN_FAILED'
              ? 'loginError'
              : value instanceof GroupApiError && value.code === 'RECOVERY_FAILED'
                ? 'recoveryError'
                : value instanceof GroupApiError && value.code === 'network'
                  ? 'networkError'
                  : 'serverError',
        ),
      );
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="community-content">
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {store.user ? (
        <section className="panel account-card">
          <div className="account-identity">
            <UserAvatar avatar={store.user.avatar} size={64} />
            <div>
              <span className="eyebrow">{f('account')}</span>
              <h2>@{store.user.username}</h2>
              <p className="fine-print">{connected ? f('connected') : f('offline')}</p>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label={f('signOut')}
              disabled={Boolean(busy)}
              onClick={() => {
                void run('logout', async () => {
                  if (connected && store.token)
                    await groupRequest(store.endpoint, '/me', {
                      method: 'DELETE',
                      token: store.token,
                    });
                  setStore({ endpoint: store.endpoint });
                  setPassword('');
                  setRecoveryKey('');
                  setConsent(false);
                });
              }}
            >
              <LogOut size={20} aria-hidden="true" />
            </button>
          </div>
          <details className="server-settings">
            <summary>{f('server')}</summary>
            <label className="field">
              <span>{f('server')}</span>
              <input
                type="url"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                maxLength={300}
              />
            </label>
            <p className="fine-print">{store.endpoint}</p>
            <p className="fine-print">{f('serverHint')}</p>
          </details>
          {leaderboard && (
            <div className="account-publish">
              <p>{f('syncHelp')}</p>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                <span>{f('agreeShare')}</span>
              </label>
              <div className="account-actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={!consent || Boolean(busy)}
                  onClick={() => {
                    void run('publish', async () => {
                      await groupRequest(store.endpoint, '/me', {
                        method: 'PUT',
                        token: store.token,
                        body: {
                          avatar: data.profile?.avatar || store.user!.avatar,
                          level: questLevel(data),
                        },
                      });
                      const next = await publishWorkouts(store, data);
                      saveCommunity(next);
                      setStore(next);
                    });
                  }}
                >
                  <Upload size={17} aria-hidden="true" />
                  {busy === 'publish' ? f('saving') : f('sync')}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    void run('refresh', async () => setStore(await refreshCommunity({ ...store, endpoint })));
                  }}
                >
                  <RefreshCw size={17} aria-hidden="true" />
                  {f('refresh')}
                </button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="panel account-form-panel">
          <div className="section-heading">
            <div>
              <h2>{f('account')}</h2>
              <p className="muted">{f('accountBody')}</p>
            </div>
            <ShieldCheck size={26} aria-hidden="true" />
          </div>
          <div className="segmented" role="group" aria-label={f('account')}>
            {(['register', 'login', 'reset'] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={mode === item ? 'selected' : ''}
                aria-pressed={mode === item}
                onClick={() => {
                  setMode(item);
                  setError('');
                }}
              >
                {f(item === 'register' ? 'signUp' : item === 'login' ? 'signIn' : 'resetPassword')}
              </button>
            ))}
          </div>
          <div className="account-fields">
            <label className="field field-wide">
              <span>{f('server')}</span>
              <input
                type="url"
                value={endpoint}
                maxLength={300}
                placeholder="https://…"
                autoCapitalize="none"
                autoComplete="url"
                onChange={(event) => setEndpoint(event.target.value)}
              />
              <small>{f('serverHint')}</small>
            </label>
            <label className="field">
              <span>{f('username')}</span>
              <input
                value={username}
                maxLength={20}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => setUsername(event.target.value)}
              />
              <small>{f('usernameHint')}</small>
            </label>
            <label className="field">
              <span>{f(mode === 'reset' ? 'newPassword' : 'password')}</span>
              <input
                type="password"
                value={password}
                minLength={8}
                maxLength={128}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                onChange={(event) => setPassword(event.target.value)}
              />
              <small>{f('passwordHint')}</small>
            </label>
            {mode === 'reset' && (
              <label className="field field-wide">
                <span>{f('recoveryKey')}</span>
                <input
                  value={recovery}
                  maxLength={128}
                  autoComplete="off"
                  onChange={(event) => setRecovery(event.target.value)}
                />
              </label>
            )}
          </div>
          <button
            type="button"
            className="button primary"
            disabled={
              Boolean(busy) ||
              !endpoint.trim() ||
              !/^[a-zA-Z0-9_]{3,20}$/.test(username) ||
              password.length < 8 ||
              (mode === 'reset' && !recovery)
            }
            onClick={() => {
              void run('auth', async () => {
                const result = await signIn(endpoint, mode, username, password, data, recovery);
                setStore(result.store);
                saveCommunity(result.store);
                setPassword('');
                setRecovery('');
                setRecoveryKey(result.recoveryKey || '');
                onSigned?.(result.store.user!);
                if (leaderboard) setStore(await refreshCommunity(result.store));
              });
            }}
          >
            {busy === 'auth'
              ? f('connecting')
              : f(mode === 'register' ? 'signUp' : mode === 'login' ? 'signIn' : 'resetPassword')}
          </button>
        </section>
      )}
      {recoveryKey && (
        <section className="panel recovery-card">
          <h3>{f('recoveryKey')}</h3>
          <p>{f('recoveryHelp')}</p>
          <code>{recoveryKey}</code>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(recoveryKey);
            }}
          >
            <Copy size={16} aria-hidden="true" />
            {f('recoveryKey')}
          </button>
          <button type="button" className="button ghost" onClick={() => setRecoveryKey('')}>
            <Check size={16} aria-hidden="true" />
            {f('close')}
          </button>
        </section>
      )}
      {leaderboard && (
        <section className="panel global-leaderboard">
          <header className="section-heading">
            <div>
              <h2>{f('global')}</h2>
              <p className="muted">{f('leaderboardBody')}</p>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label={f('refresh')}
              disabled={Boolean(busy) || !endpoint.trim()}
              onClick={() => {
                void run('refresh', async () => {
                  const next = await refreshCommunity({ ...store, endpoint });
                  setStore(next);
                });
              }}
            >
              <RefreshCw size={20} aria-hidden="true" />
            </button>
          </header>
          {store.updatedAt && (
            <p className="fine-print board-update">
              {connected ? f('connected') : f('offline')} ·{' '}
              {new Date(store.updatedAt).toLocaleString(data.settings.language)}
            </p>
          )}
          {!store.leaderboard?.length ? (
            <div className="empty-state">
              <RankEmblem xp={0} size={74} />
              <p>{f('noAthletes')}</p>
            </div>
          ) : (
            <ol className="global-board stagger-list">
              {store.leaderboard.map((user, index) => (
                <li
                  key={user.id}
                  className={user.id === store.user?.id ? 'own' : ''}
                  style={rankStyle(user.xp)}
                >
                  <span className="board-position">{String(index + 1).padStart(2, '0')}</span>
                  <UserAvatar avatar={user.avatar} size={48} />
                  <div className="board-name">
                    <strong>@{user.username}</strong>
                    <span className="rank-label">{user.rank.name}</span>
                    <p className="fine-print">
                      {user.reps.toLocaleString()} {f('reps')} · {user.sets.toLocaleString()}{' '}
                      {f('sets')}
                    </p>
                  </div>
                  <strong className="board-xp">
                    {user.xp.toLocaleString()}
                    <small>XP</small>
                  </strong>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
