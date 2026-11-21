import { useEffect, useRef, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import type { AppData, Avatar } from '../model';
import { featureT } from '../feature-i18n';
import AccountPanel from './AccountPanel';
import CharacterPicker from './CharacterPicker';
import { loadCommunity } from '../community';

export default function Community({
  data,
  onChange,
}: {
  data: AppData;
  onChange: (data: AppData) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [avatar, setAvatar] = useState<Avatar>(
    data.profile?.avatar || { skin: 1, hair: 0, shirt: 0 },
  );
  const [username, setUsername] = useState(data.profile?.username || '');
  const dialog = useRef<HTMLDialogElement>(null);
  const f = (key: Parameters<typeof featureT>[1]) => featureT(data.settings.language, key);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <section className="page community-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">FORM / COMMUNITY</span>
          <h1>{f('global')}</h1>
          <p className="muted">{f('leaderboardBody')}</p>
        </div>
        <button className="button secondary" onClick={() => setOpen(true)}>
          <Pencil size={17} aria-hidden="true" />
          {f('editCharacter')}
        </button>
      </header>
      <AccountPanel
        data={data}
        leaderboard
        onSigned={(user) => {
          if (data.profile)
            void onChange({
              ...data,
              profile: { ...data.profile, username: user.username, avatar: user.avatar },
            });
        }}
      />
      <dialog
        ref={dialog}
        className="modal character-modal"
        onCancel={() => setOpen(false)}
        aria-labelledby="character-title"
      >
        <div className="section-heading">
          <h2 id="character-title">{f('character')}</h2>
          <button className="icon-button" aria-label={f('close')} onClick={() => setOpen(false)}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <CharacterPicker avatar={avatar} onChange={setAvatar} language={data.settings.language} />
        <label className="field">
          <span>{f('username')}</span>
          <input
            value={loadCommunity().user?.username || username}
            disabled={Boolean(loadCommunity().user)}
            onChange={(event) => setUsername(event.target.value)}
            maxLength={20}
            autoCapitalize="none"
          />
          <small>{f('usernameHint')}</small>
        </label>
        <p className="fine-print">{f('characterBody')}</p>
        <div className="modal-actions">
          <button className="button secondary" onClick={() => setOpen(false)}>
            {f('cancel')}
          </button>
          <button
            className="button primary"
            disabled={!/^[a-zA-Z0-9_]{3,20}$/.test(loadCommunity().user?.username || username)}
            onClick={() => {
              if (data.profile)
                void onChange({
                  ...data,
                  profile: {
                    ...data.profile,
                    username: loadCommunity().user?.username || username,
                    avatar,
                  },
                }).then((saved) => {
                  if (saved) setOpen(false);
                });
            }}
          >
            {f('save')}
          </button>
        </div>
      </dialog>
    </section>
  );
}
