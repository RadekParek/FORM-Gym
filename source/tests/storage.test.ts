import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { exportBinaryFile, exportFile } from '../src/storage';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    writeFile: vi.fn().mockResolvedValue({ uri: 'file:///cache/export.json' }),
  },
}));
vi.mock('@capacitor/share', () => ({
  Share: { share: vi.fn().mockResolvedValue({}) },
}));

describe('native exports', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes text to cache and passes its URI to the native chooser', async () => {
    await exportFile('backup.json', '{"version":1}', 'application/json', 'FORM backup');
    expect(Filesystem.writeFile).toHaveBeenCalledWith({
      path: 'backup.json',
      data: '{"version":1}',
      directory: 'CACHE',
      encoding: 'utf8',
    });
    expect(Share.share).toHaveBeenCalledWith({
      files: ['file:///cache/export.json'],
      title: 'FORM backup',
      dialogTitle: 'FORM backup',
    });
  });

  it('rejects filenames that escape the generated cache file location', async () => {
    await expect(exportFile('../private.json', '{}', 'application/json', 'Backup')).rejects.toThrow(
      'filename',
    );
    expect(Filesystem.writeFile).not.toHaveBeenCalled();
    expect(Share.share).not.toHaveBeenCalled();
  });

  it('writes binary files as base64 without UTF8 encoding', async () => {
    class TestFileReader {
      result = 'data:image/png;base64,AQID';
      onload: (() => void) | null = null;
      readAsDataURL() {
        this.onload?.();
      }
    }
    vi.stubGlobal('FileReader', TestFileReader);
    try {
      await exportBinaryFile(
        'card.png',
        new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
        'FORM card',
      );
      expect(Filesystem.writeFile).toHaveBeenCalledWith({
        path: 'card.png',
        data: 'AQID',
        directory: 'CACHE',
      });
      expect(Share.share).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
