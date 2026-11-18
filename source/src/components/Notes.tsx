import { useState } from 'react';
import { BookOpen, Pin, Plus, Search, Trash2 } from 'lucide-react';
import type { AppData, Note } from '../model';
import { uid } from '../engine';
import { useT } from '../i18n';

interface Props {
  data: AppData;
  onChange: (next: AppData) => void;
  notify: (message: string) => void;
}

export default function Notes({ data, onChange, notify }: Props) {
  const t = useT(data.settings.language);
  const [selectedId, setSelectedId] = useState<string | null>(data.notes[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const selected = data.notes.find((note) => note.id === selectedId);
  const notes = data.notes
    .filter((note) => `${note.title} ${note.body}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));

  function addNote() {
    const note: Note = {
      id: uid(),
      title: '',
      body: '',
      updatedAt: new Date().toISOString(),
      pinned: false,
    };
    onChange({ ...data, notes: [note, ...data.notes] });
    setQuery('');
    setSelectedId(note.id);
  }

  function updateNote(update: Partial<Note>) {
    if (!selected) return;
    onChange({
      ...data,
      notes: data.notes.map((note) =>
        note.id === selected.id
          ? { ...note, ...update, updatedAt: new Date().toISOString() }
          : note,
      ),
    });
  }

  function deleteNote() {
    const remaining = data.notes.filter((note) => note.id !== deleteId);
    onChange({ ...data, notes: remaining });
    if (selectedId === deleteId) setSelectedId(remaining[0]?.id ?? null);
    setDeleteId(null);
    notify(t('noteSaved'));
  }

  return (
    <section className="page notes-page">
      <header className="page-heading">
        <div>
          <h1>{t('notes')}</h1>
          <p className="muted">{t('notesSubtitle')}</p>
        </div>
        <button className="button primary" onClick={addNote}>
          <Plus size={17} />
          {t('newNote')}
        </button>
      </header>
      <div className="notes-layout">
        <aside className="panel notes-sidebar">
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label={t('searchNotes')}
              placeholder={t('searchNotes')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="note-list">
            {notes.map((note) => (
              <button
                className={`note-item ${selectedId === note.id ? 'note-active' : ''}`}
                key={note.id}
                onClick={() => setSelectedId(note.id)}
                aria-pressed={selectedId === note.id}
              >
                <div>
                  <strong>{note.title || t('untitledNote')}</strong>
                  {note.pinned && <Pin size={13} />}
                </div>
                <p>{note.body.slice(0, 100) || t('noteBody')}</p>
                <time dateTime={note.updatedAt}>
                  {new Date(note.updatedAt).toLocaleDateString(data.settings.language, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </time>
              </button>
            ))}
            {!notes.length && (
              <div className="notes-empty-small">
                <BookOpen size={28} strokeWidth={1.3} />
                <p className="muted">{query ? t('noSearchResults') : t('noNotes')}</p>
              </div>
            )}
          </div>
        </aside>
        {selected ? (
          <article className="panel note-editor">
            <div className="note-toolbar">
              <span className="badge">{t('changesSaved')}</span>
              <div>
                <button
                  className={`icon-button ${selected.pinned ? 'accent' : ''}`}
                  title={selected.pinned ? t('unpin') : t('pin')}
                  aria-label={selected.pinned ? t('unpin') : t('pin')}
                  aria-pressed={selected.pinned}
                  onClick={() => updateNote({ pinned: !selected.pinned })}
                >
                  <Pin size={18} fill={selected.pinned ? 'currentColor' : 'none'} />
                </button>
                <button
                  className="icon-button danger"
                  title={t('deleteNote')}
                  aria-label={t('deleteNote')}
                  onClick={() => setDeleteId(selected.id)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
            <label className="sr-only" htmlFor="note-title">
              {t('noteTitle')}
            </label>
            <input
              id="note-title"
              className="note-title-input"
              maxLength={120}
              placeholder={t('untitledNote')}
              value={selected.title}
              onChange={(event) => updateNote({ title: event.target.value })}
            />
            <label className="sr-only" htmlFor="note-body">
              {t('noteBody')}
            </label>
            <textarea
              id="note-body"
              className="note-body-input"
              maxLength={50000}
              placeholder={t('noteBody')}
              value={selected.body}
              onChange={(event) => updateNote({ body: event.target.value })}
            />
            <p className="note-footer muted">
              {t('noteUpdated')}{' '}
              {new Date(selected.updatedAt).toLocaleString(data.settings.language, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}{' '}
              · {selected.body.length.toLocaleString()} {t('characters')}
            </p>
          </article>
        ) : (
          <div className="panel empty-state notes-welcome">
            <BookOpen size={46} strokeWidth={1.2} />
            <p>{t('noNotes')}</p>
          </div>
        )}
      </div>
      {deleteId && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-note-title"
          >
            <h2 id="delete-note-title">{t('deleteNote')}</h2>
            <p className="muted">{t('deleteNoteBody')}</p>
            <div className="modal-actions">
              <button className="button secondary" autoFocus onClick={() => setDeleteId(null)}>
                {t('cancel')}
              </button>
              <button className="button danger" onClick={deleteNote}>
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
