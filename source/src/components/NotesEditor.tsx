import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckSquare,
  Eye,
  Pencil,
  Pin,
  Plus,
  Search,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import type { AppData, Note } from '../model';
import { uid } from '../engine';
import { useT } from '../i18n';
import { featureT } from '../feature-i18n';
import { readNoteDrafts, writeNoteDrafts } from '../noteDrafts';

interface Props {
  data: AppData;
  onChange: (next: AppData) => Promise<boolean>;
  notify: (message: string) => void;
}
type Category = NonNullable<Note['category']>;
export default function NotesEditor({ data, onChange, notify }: Props) {
  const t = useT(data.settings.language);
  const f = (key: Parameters<typeof featureT>[1]) => featureT(data.settings.language, key);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [drafts, setDrafts] = useState(readNoteDrafts);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [preview, setPreview] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Note | null>(null);
  const dirty = useRef(drafts);
  const latest = useRef(data);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bodyInput = useRef<HTMLTextAreaElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(true);
  latest.current = data;
  const allNotes = data.notes.map((note) => drafts[note.id] || note);
  const selected = allNotes.find((note) => note.id === selectedId);
  const notes = allNotes
    .filter(
      (note) =>
        (category === 'all' || (note.category || 'free') === category) &&
        `${note.title} ${note.body}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));

  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    const pending = { ...dirty.current };
    if (!Object.keys(pending).length) return;
    const success = await onChange({
      ...latest.current,
      notes: latest.current.notes.map((note) => pending[note.id] || note),
    });
    if (!success) {
      if (mounted.current) setStatus('error');
      return;
    }
    const remaining = { ...dirty.current };
    for (const [id, note] of Object.entries(pending))
      if (remaining[id] === note) delete remaining[id];
    dirty.current = remaining;
    try {
      writeNoteDrafts(remaining);
    } catch {
      if (mounted.current) setStatus('error');
      return;
    }
    if (mounted.current) {
      setDrafts(remaining);
      setStatus(Object.keys(remaining).length ? 'saving' : 'saved');
    }
  }
  useEffect(() => {
    mounted.current = true;
    const leave = () => {
      void flush();
    };
    window.addEventListener('pagehide', leave);
    return () => {
      mounted.current = false;
      window.removeEventListener('pagehide', leave);
      void flush();
    };
  }, []);
  useEffect(() => {
    if (deleteId) dialog.current?.showModal();
    else dialog.current?.close();
  }, [deleteId]);
  function edit(update: Partial<Note>) {
    if (!selected) return;
    const note = { ...selected, ...update, updatedAt: new Date().toISOString() };
    dirty.current = { ...dirty.current, [note.id]: note };
    setDrafts(dirty.current);
    setStatus('saving');
    try {
      writeNoteDrafts(dirty.current);
    } catch {
      setStatus('error');
      notify(t('saveFailed'));
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush();
    }, 300);
  }
  async function add() {
    await flush();
    const note: Note = {
      id: uid(),
      title: '',
      body: '',
      updatedAt: new Date().toISOString(),
      pinned: false,
      category: category === 'all' ? 'free' : category,
    };
    if (latest.current.notes.length >= 2000) {
      notify(t('saveFailed'));
      return;
    }
    await onChange({ ...latest.current, notes: [note, ...latest.current.notes] });
    setQuery('');
    setSelectedId(note.id);
    setPreview(false);
  }
  async function remove() {
    const note = allNotes.find((entry) => entry.id === deleteId);
    if (!note) return;
    const remaining = { ...dirty.current };
    delete remaining[note.id];
    dirty.current = remaining;
    setDrafts(remaining);
    writeNoteDrafts(remaining);
    setDeleteId(null);
    setSelectedId(null);
    if (
      await onChange({
        ...latest.current,
        notes: latest.current.notes.filter((entry) => entry.id !== note.id),
      })
    )
      setRemoved(note);
  }
  function insertChecklist() {
    if (!selected) return;
    const position = bodyInput.current?.selectionStart ?? selected.body.length;
    const insertion = `${position && selected.body[position - 1] !== '\n' ? '\n' : ''}- [ ] `;
    edit({ body: selected.body.slice(0, position) + insertion + selected.body.slice(position) });
    setPreview(false);
    requestAnimationFrame(() => {
      bodyInput.current?.focus();
      bodyInput.current?.setSelectionRange(
        position + insertion.length,
        position + insertion.length,
      );
    });
  }
  return (
    <section className={`page notes-page notebook ${selected ? 'note-open' : ''}`}>
      <header className="page-heading">
        <div>
          <span className="eyebrow">FORM / {f('notebook')}</span>
          <h1>{t('notes')}</h1>
          <p className="muted">{f('notebookBody')}</p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            void add();
          }}
        >
          <Plus size={18} aria-hidden="true" />
          {f('newNote')}
        </button>
      </header>
      {removed && (
        <div className="note-undo" role="status">
          <span>{f('deleted')}</span>
          <button
            className="button ghost"
            onClick={() => {
              void onChange({ ...latest.current, notes: [removed, ...latest.current.notes] });
              setSelectedId(removed.id);
              setRemoved(null);
            }}
          >
            <Undo2 size={16} aria-hidden="true" />
            {f('undo')}
          </button>
          <button className="icon-button" aria-label={f('close')} onClick={() => setRemoved(null)}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="notes-layout">
        <aside className="panel notes-sidebar">
          <label className="search-field">
            <Search size={18} aria-hidden="true" />
            <input
              aria-label={t('searchNotes')}
              placeholder={t('searchNotes')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="notebook-filters" role="group" aria-label={f('categories')}>
            {(['all', 'free', 'training', 'recovery'] as const).map((item) => (
              <button
                key={item}
                className={`filter-chip ${category === item ? 'selected' : ''}`}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {f(item === 'all' ? 'allNotes' : item)}
              </button>
            ))}
          </div>
          <div className="note-list stagger-list">
            {notes.map((note) => (
              <button
                className={`note-item ${selectedId === note.id ? 'note-active' : ''}`}
                key={note.id}
                aria-pressed={selectedId === note.id}
                onClick={() => {
                  void flush();
                  setSelectedId(note.id);
                  setPreview(false);
                }}
              >
                <div>
                  <strong>{note.title || t('untitledNote')}</strong>
                  {note.pinned && <Pin size={14} aria-hidden="true" />}
                </div>
                <p>{note.body.slice(0, 110) || f('write')}</p>
                <footer>
                  <span className="note-category">{f(note.category || 'free')}</span>
                  <time dateTime={note.updatedAt}>
                    {new Date(note.updatedAt).toLocaleDateString(data.settings.language, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </time>
                </footer>
              </button>
            ))}
            {!notes.length && (
              <div className="notes-empty-small">
                <BookOpen size={30} strokeWidth={1.5} aria-hidden="true" />
                <p className="muted">{query ? t('noSearchResults') : f('emptyNotes')}</p>
              </div>
            )}
          </div>
        </aside>
        {selected ? (
          <article
            className="panel note-editor"
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 's') {
                event.preventDefault();
                void flush();
              }
            }}
          >
            <div className="note-toolbar">
              <button
                className="button ghost note-back"
                onClick={() => {
                  void flush();
                  setSelectedId(null);
                }}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                {f('backNotes')}
              </button>
              <span className={`save-indicator ${status}`} role="status">
                {status === 'saved' && <Check size={15} aria-hidden="true" />}
                {status === 'error'
                  ? t('saveFailed')
                  : f(status === 'saving' ? 'saving' : 'savedDevice')}
              </span>
              <div>
                <button
                  className="icon-button"
                  aria-label={f(preview ? 'write' : 'checklist')}
                  aria-pressed={preview}
                  onClick={() => setPreview(!preview)}
                >
                  {preview ? (
                    <Pencil size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
                <button
                  className="icon-button"
                  aria-label={f('addChecklist')}
                  onClick={insertChecklist}
                >
                  <CheckSquare size={18} aria-hidden="true" />
                </button>
                <button
                  className="icon-button"
                  aria-label={selected.pinned ? t('unpin') : t('pin')}
                  aria-pressed={selected.pinned}
                  onClick={() => edit({ pinned: !selected.pinned })}
                >
                  <Pin
                    size={18}
                    aria-hidden="true"
                    fill={selected.pinned ? 'currentColor' : 'none'}
                  />
                </button>
                <button
                  className="icon-button danger"
                  aria-label={t('deleteNote')}
                  onClick={() => setDeleteId(selected.id)}
                >
                  <Trash2 size={18} aria-hidden="true" />
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
              onChange={(event) => edit({ title: event.target.value })}
              onBlur={() => {
                void flush();
              }}
            />
            <label className="note-category-field">
              <span className="sr-only">{f('categories')}</span>
              <select
                value={selected.category || 'free'}
                onChange={(event) => edit({ category: event.target.value as Category })}
              >
                {(['free', 'training', 'recovery'] as const).map((item) => (
                  <option key={item} value={item}>
                    {f(item)}
                  </option>
                ))}
              </select>
            </label>
            {preview ? (
              <div className="note-preview">
                {selected.body.split('\n').map((line, index) => {
                  const item = /^- \[([ xX])\] (.*)$/.exec(line);
                  return item ? (
                    <label key={index} className="note-check">
                      <input
                        type="checkbox"
                        checked={item[1].toLowerCase() === 'x'}
                        onChange={(event) => {
                          const lines = selected.body.split('\n');
                          lines[index] = `- [${event.target.checked ? 'x' : ' '}] ${item[2]}`;
                          edit({ body: lines.join('\n') });
                        }}
                      />
                      <span>{item[2] || f('checklist')}</span>
                    </label>
                  ) : (
                    <p key={index}>{line || '\u00a0'}</p>
                  );
                })}
              </div>
            ) : (
              <>
                <label className="sr-only" htmlFor="note-body">
                  {t('noteBody')}
                </label>
                <textarea
                  ref={bodyInput}
                  id="note-body"
                  className="note-body-input"
                  maxLength={50000}
                  placeholder={t('noteBody')}
                  value={selected.body}
                  onChange={(event) => edit({ body: event.target.value })}
                  onBlur={() => {
                    void flush();
                  }}
                />
              </>
            )}
            <p className="note-footer muted">
              {selected.body.trim().split(/\s+/).filter(Boolean).length} {f('words')} ·{' '}
              {selected.body.length.toLocaleString()} {t('characters')}
            </p>
          </article>
        ) : (
          <div className="panel empty-state notes-welcome">
            <div className="notebook-art" aria-hidden="true">
              <BookOpen size={52} strokeWidth={1.2} />
            </div>
            <h2>{f('notebook')}</h2>
            <p>{f('emptyNotes')}</p>
            <button
              className="button secondary"
              onClick={() => {
                void add();
              }}
            >
              <Plus size={18} aria-hidden="true" />
              {f('write')}
            </button>
          </div>
        )}
      </div>
      <dialog
        ref={dialog}
        className="modal"
        aria-labelledby="delete-note-title"
        onCancel={() => setDeleteId(null)}
      >
        <h2 id="delete-note-title">{t('deleteNote')}</h2>
        <p className="muted">{t('deleteNoteBody')}</p>
        <div className="modal-actions">
          <button className="button secondary" autoFocus onClick={() => setDeleteId(null)}>
            {t('cancel')}
          </button>
          <button
            className="button danger"
            onClick={() => {
              void remove();
            }}
          >
            {t('delete')}
          </button>
        </div>
      </dialog>
    </section>
  );
}
