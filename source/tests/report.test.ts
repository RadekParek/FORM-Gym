import { describe, expect, it, vi } from 'vitest';
import { createInitialData } from '../src/engine';
import { buildTrainingReport, exportTrainingReport } from '../src/report';
import { exportFile } from '../src/storage';

vi.mock('../src/storage', () => ({
  exportFile: vi.fn().mockResolvedValue(undefined),
}));

describe('training report', () => {
  it('includes actual completed sets and monthly totals, escaping user text', () => {
    const data = createInitialData();
    data.profile = {
      name: '<script>alert(1)</script>',
      age: 25,
      weight: 80,
      height: 180,
      experience: 2,
      goal: 'strength',
      daysPerWeek: 3,
      conditions: ['hirschsprung'],
    };
    data.sessions = [
      {
        id: 's1',
        title: '<img src=x onerror=alert(1)>',
        date: '2026-11-18',
        duration: 1200,
        note: '<b>session note</b>',
        xp: 112,
        exercises: [
          {
            id: 'e1',
            exerciseId: 'bench-press',
            sets: [
              { done: true, reps: 8, weight: 50 },
              { done: false, reps: 99, weight: 99 },
            ],
          },
        ],
      },
    ];
    data.notes = [
      {
        id: 'n1',
        title: 'My note',
        body: 'A <script>private note</script>',
        updatedAt: '2026-11-18T12:00:00Z',
        pinned: false,
      },
    ];
    const report = buildTrainingReport(data, new Date('2026-11-18T12:00:00Z'));
    expect(report).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(report).not.toContain('<script>');
    expect(report).not.toContain('<img');
    expect(report).toContain('8 Reps');
    expect(report).not.toContain('99 Reps');
    expect(report).toContain('400 kg');
    expect(report).toContain('Monthly training totals');
    expect(report).toContain('&lt;b&gt;session note&lt;/b&gt;');
    expect(report).not.toContain('hirschsprung');
  });

  it('localizes labels, exercises and pounds without changing stored values', () => {
    const data = createInitialData();
    data.settings.language = 'de';
    data.settings.units = 'lb';
    data.sessions = [
      {
        id: 's1',
        title: 'Training',
        date: '2026-11-18',
        duration: 600,
        note: '',
        xp: 100,
        exercises: [
          {
            id: 'e1',
            exerciseId: 'bench-press',
            sets: [{ done: true, reps: 10, weight: 50 }],
          },
        ],
      },
    ];
    const report = buildTrainingReport(data);
    expect(report).toContain('<html lang="de">');
    expect(report).toContain('Trainingsbericht');
    expect(report).toContain('Bankdrücken');
    expect(report).toContain('110,2 lb');
    expect(data.sessions[0].exercises[0].sets[0].weight).toBe(50);
  });

  it('rejects premium export for free users and delegates active premium exports', async () => {
    const data = createInitialData();
    await expect(exportTrainingReport(data)).rejects.toThrow('Premium');
    expect(exportFile).not.toHaveBeenCalled();
    data.premium.lifetime = true;
    await exportTrainingReport(data);
    expect(exportFile).toHaveBeenCalledWith(
      expect.stringMatching(/^FORM-training-\d{4}-\d{2}-\d{2}\.html$/),
      expect.stringContaining('Training report'),
      'text/html;charset=utf-8',
      'FORM · Training report',
    );
  });
});
