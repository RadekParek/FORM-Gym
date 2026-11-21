import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { createInitialData, localDate, parseBackup } from './engine';
import type { AppData } from './model';
import { useT } from './i18n';
import { recoverNoteDrafts } from './noteDrafts';

declare global {
  interface Window {
    gymStore?: {
      read(): Promise<string | null>;
      write(data: string): Promise<void>;
    };
  }
}

const storageKey = 'form-gym-data-v1';

export async function loadData(): Promise<AppData> {
  const raw = window.gymStore ? await window.gymStore.read() : localStorage.getItem(storageKey);
  if (raw === null || raw === '') return createInitialData();
  // Preserve corrupt data and expose a recovery error instead of silently overwriting it.
  return recoverNoteDrafts(parseBackup(raw));
}

export async function saveData(data: AppData): Promise<void> {
  const raw = JSON.stringify(data);
  if (window.gymStore) await window.gymStore.write(raw);
  else localStorage.setItem(storageKey, raw);
}

function validateExportFilename(filename: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(filename))
    throw new Error('Invalid export filename.');
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Native exports use the system chooser; web and desktop exports use a download. */
export async function exportFile(
  filename: string,
  content: string,
  mimeType: string,
  title: string,
): Promise<void> {
  validateExportFilename(filename);
  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ files: [file.uri], title, dialogTitle: title });
    return;
  }
  downloadBlob(filename, new Blob([content], { type: mimeType }));
}

export async function exportBinaryFile(filename: string, blob: Blob, title: string): Promise<void> {
  validateExportFilename(filename);
  if (!Capacitor.isNativePlatform()) {
    downloadBlob(filename, blob);
    return;
  }
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const delimiter = result.indexOf(',');
      if (delimiter < 0 || !result.slice(0, delimiter).endsWith(';base64'))
        reject(new Error('Could not encode export.'));
      else resolve(result.slice(delimiter + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read export.'));
    reader.readAsDataURL(blob);
  });
  const file = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });
  await Share.share({ files: [file.uri], title, dialogTitle: title });
}

export async function exportData(data: AppData): Promise<void> {
  await exportFile(
    `FORM-backup-${localDate()}.json`,
    JSON.stringify(data, null, 2),
    'application/json',
    `FORM · ${useT(data.settings.language)('backup')}`,
  );
}
