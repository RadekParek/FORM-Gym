import { describe, expect, it } from 'vitest';
import { createInitialData, parseBackup } from '../src/engine';

describe('appearance preference', () => {
  it('starts in dark mode', () => {
    expect(createInitialData().settings.appearance).toBe('dark');
  });

  it('migrates older backups without changing training data', () => {
    const data = createInitialData();
    data.notes = [
      {
        id: 'note-1',
        title: 'Keep this',
        body: 'Original training notes',
      updatedAt: '2026-11-18T12:00:00.000Z',
        pinned: true,
      },
    ];
    const previous = JSON.parse(JSON.stringify(data));
    delete previous.settings.appearance;
    const restored = parseBackup(JSON.stringify(previous));
    expect(restored.settings.appearance).toBe('dark');
    expect(restored.notes).toEqual(data.notes);
    expect(restored.plans).toEqual(data.plans);
    expect(restored.premium).toEqual(data.premium);
  });

  it('preserves light mode and rejects unsupported explicit preferences', () => {
    const data = createInitialData();
    data.settings.appearance = 'light';
    expect(parseBackup(JSON.stringify(data)).settings.appearance).toBe('light');
    const invalid = { ...data, settings: { ...data.settings, appearance: 'system' } };
    expect(() => parseBackup(JSON.stringify(invalid))).toThrow('Appearance');
  });
});
