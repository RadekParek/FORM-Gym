import { EXERCISES, type AppData, type Session } from './model';
import { getProgress, isPremium, localDate } from './engine';
import { exerciseText, useT } from './i18n';
import { exportFile } from './storage';

const escapeHtml = (value: string | number): string =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
const completedCount = (session: Session): number =>
  session.exercises.reduce(
    (count, exercise) => count + exercise.sets.filter((set) => set.done && set.reps > 0).length,
    0,
  );
const sessionVolume = (session: Session): number =>
  session.exercises.reduce(
    (total, exercise) =>
      total +
      exercise.sets.reduce(
        (sum, set) => sum + (set.done && set.reps > 0 ? set.reps * set.weight : 0),
        0,
      ),
    0,
  );

/** A script-free report with escaped user content, ready to open or print offline. */
export function buildTrainingReport(data: AppData, now = new Date()): string {
  const language = data.settings.language;
  const t = useT(language);
  const label = (key: string) => escapeHtml(t(key));
  const number = (value: number, digits = 0) =>
    escapeHtml(value.toLocaleString(language, { maximumFractionDigits: digits }));
  const date = (value: string) =>
    escapeHtml(
      new Date(`${value}T12:00:00`).toLocaleDateString(language, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    );
  const displayWeight = (value: number) =>
    number(value * (data.settings.units === 'lb' ? 2.2046226218 : 1), 1);
  const sessions = data.sessions
    .filter((session) => completedCount(session) > 0)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
  const progress = getProgress(data);
  const monthly = new Map<
    string,
    { sessions: number; sets: number; volume: number; minutes: number }
  >();
  for (const session of sessions) {
    const key = session.date.slice(0, 7);
    const summary = monthly.get(key) ?? {
      sessions: 0,
      sets: 0,
      volume: 0,
      minutes: 0,
    };
    monthly.set(key, {
      sessions: summary.sessions + 1,
      sets: summary.sets + completedCount(session),
      volume: summary.volume + sessionVolume(session),
      minutes: summary.minutes + session.duration / 60,
    });
  }
  const monthlyRows = [...monthly.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(
      ([month, value]) =>
        `<tr><td>${escapeHtml(new Date(`${month}-15T12:00:00`).toLocaleDateString(language, { month: 'long', year: 'numeric' }))}</td><td>${number(value.sessions)}</td><td>${number(value.sets)}</td><td>${displayWeight(value.volume)} ${data.settings.units}</td><td>${number(value.minutes)}</td></tr>`,
    )
    .join('');
  const sessionSections = sessions
    .map((session) => {
      const rows = session.exercises
        .flatMap((exercise) => {
          const definition = EXERCISES.find((item) => item.id === exercise.exerciseId);
          const name = definition ? exerciseText(language, definition).name : t('exercise');
          const quantityUnit =
            exercise.exerciseId === 'plank'
              ? t('seconds')
              : ['walk', 'cycle', 'rower'].includes(exercise.exerciseId)
                ? t('minutes')
                : t('reps');
          return exercise.sets.flatMap((set, index) =>
            set.done && set.reps > 0
              ? [
                  `<tr><td>${escapeHtml(name)}</td><td>${index + 1}</td><td>${number(set.reps)} ${escapeHtml(quantityUnit)}</td><td>${displayWeight(set.weight)} ${data.settings.units}</td></tr>`,
                ]
              : [],
          );
        })
        .join('');
      return `<article class="session"><div class="session-heading"><h3>${escapeHtml(session.title || t('workout'))}</h3><span>${date(session.date)} · ${number(session.duration / 60)} ${label('minutes')} · +${number(session.xp)} XP</span></div><table><thead><tr><th>${label('exercise')}</th><th>${label('sets')}</th><th>${label('reps')}</th><th>${label('load')}</th></tr></thead><tbody>${rows}</tbody></table>${session.note ? `<p class="notes"><strong>${label('sessionNotes')}</strong><br>${escapeHtml(session.note)}</p>` : ''}</article>`;
    })
    .join('');
  const notebook = data.notes
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(
      (note) =>
        `<article class="notebook-entry"><h3>${escapeHtml(note.title || t('untitledNote'))}</h3><small>${escapeHtml(new Date(note.updatedAt).toLocaleDateString(language))}</small><p class="notes">${escapeHtml(note.body)}</p></article>`,
    )
    .join('');
  const bodyRows = data.bodyLogs
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(
      (log) =>
        `<tr><td>${date(log.date)}</td><td>${displayWeight(log.weight)} ${data.settings.units}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>FORM · ${label('trainingReport')}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f3f4ef;color:#20241f;font:14px/1.6 Arial,sans-serif}main{max-width:960px;margin:auto;background:#fff;padding:52px 48px}header{padding-bottom:28px;border-bottom:3px solid #20241f}.brand{font-size:28px;font-weight:800;letter-spacing:3px}h1{font-size:36px;line-height:1.15;margin:20px 0 10px}h2{font-size:20px;margin:36px 0 14px}h3{font-size:16px;margin:0}p{margin:8px 0}small,.muted{color:#5c655a}.stats{display:flex;gap:32px;flex-wrap:wrap;margin:28px 0}.stats div{flex:1;min-width:120px}.stats strong{display:block;font-size:27px}.stats span{color:#5c655a}table{width:100%;border-collapse:collapse;margin:16px 0;text-align:left}th{font-size:12px;letter-spacing:.04em;text-transform:uppercase;background:#edf0e7}td,th{padding:10px 12px;border-bottom:1px solid #dfe4da}th:first-child,td:first-child{width:40%}.session{margin:22px 0 34px}.session-heading{display:flex;gap:10px;justify-content:space-between;align-items:baseline}.session-heading span{font-size:12px;color:#5c655a}.notes{white-space:pre-wrap;overflow-wrap:anywhere;border-left:3px solid #bacf86;padding:8px 16px}.notebook-entry{margin:20px 0}.footnote{font-size:12px;color:#5c655a;border-top:1px solid #dfe4da;padding-top:18px;margin-top:40px}@media(max-width:600px){main{padding:30px 18px}.session-heading{display:block}td,th{padding:8px 6px;font-size:12px}h1{font-size:28px}}@media print{@page{margin:16mm}body{background:#fff;font-size:11px}main{padding:0;max-width:none}h2,h3,.session-heading{break-after:avoid}tr,.notebook-entry{break-inside:avoid}thead{display:table-header-group}.stats{gap:20px}h1{font-size:28px}.footnote{font-size:10px}}
    </style></head><body><main><header><div class="brand">FORM.</div><h1>${label('trainingReport')}</h1>${data.profile?.name ? `<p>${escapeHtml(data.profile.name)} · ${label(data.profile.goal)}</p>` : ''}<p class="muted">${escapeHtml(t('generatedOn', { date: now.toLocaleDateString(language, { day: 'numeric', month: 'long', year: 'numeric' }) }))}</p><p>${label('reportIntro')}</p></header><section class="stats"><div><strong>${number(sessions.length)}</strong><span>${label('workouts')}</span></div><div><strong>${number(progress.totalSets)}</strong><span>${label('completedSets')}</span></div><div><strong>${displayWeight(progress.totalVolume)} ${data.settings.units}</strong><span>${label('totalVolume')}</span></div><div><strong>${number(progress.xp)} XP</strong><span>${escapeHtml(progress.rank.name)}</span></div></section>${monthlyRows ? `<section><h2>${label('monthlySummary')}</h2><table><thead><tr><th>${label('month')}</th><th>${label('workouts')}</th><th>${label('completedSets')}</th><th>${label('volume')}</th><th>${label('minutes')}</th></tr></thead><tbody>${monthlyRows}</tbody></table></section>` : ''}<section><h2>${label('history')}</h2>${sessionSections || `<p>${label('noSessions')}</p>`}</section>${bodyRows ? `<section><h2>${label('bodyweight')}</h2><table><thead><tr><th>${label('date')}</th><th>${label('weight')}</th></tr></thead><tbody>${bodyRows}</tbody></table></section>` : ''}${notebook ? `<section><h2>${label('freeNotes')}</h2>${notebook}</section>` : ''}<footer class="footnote"><p>${label('rankDisclaimer')}</p><p>${label('reportPrivacy')}</p></footer></main></body></html>`;
}

export async function exportTrainingReport(data: AppData): Promise<void> {
  if (!isPremium(data)) throw new Error(useT(data.settings.language)('premiumNeeded'));
  await exportFile(
    `FORM-training-${localDate()}.html`,
    buildTrainingReport(data),
    'text/html;charset=utf-8',
    `FORM · ${useT(data.settings.language)('trainingReport')}`,
  );
}
