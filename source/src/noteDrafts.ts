import type { AppData, Note } from './model';
import { parseBackup } from './engine';

export const NOTE_DRAFT_KEY = 'form-note-drafts-v1';
export function readNoteDrafts(): Record<string, Note> {
  const raw = localStorage.getItem(NOTE_DRAFT_KEY);
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {
    /* Keep an invalid draft available for recovery. */
  }
  return {};
}
export function writeNoteDrafts(drafts: Record<string, Note>) {
  localStorage.setItem(NOTE_DRAFT_KEY, JSON.stringify(drafts));
}
export function recoverNoteDrafts(data: AppData): AppData {
  const drafts = readNoteDrafts();
  const notes = new Map(data.notes.map((note) => [note.id, note]));
  for (const [id, note] of Object.entries(drafts)) {
    if (note?.id !== id) continue;
    const original = notes.get(id);
    if (!original || note.updatedAt >= original.updatedAt) notes.set(id, note);
  }
  if (notes.size > 2000) return data;
  try {
    return parseBackup(JSON.stringify({ ...data, notes: [...notes.values()] }));
  } catch {
    return data;
  }
}
