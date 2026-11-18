import { useEffect, useState } from 'react';
import { ArrowDownToLine, X } from 'lucide-react';
import { EXTENDED_RANK, RANKS, type AppData, type Session } from '../model';
import { getProgress, isPremium } from '../engine';
import { useT } from '../i18n';
import { exportBinaryFile } from '../storage';

interface Props {
  data: AppData;
  session: Session;
  onClose: () => void;
}
const timedIds = new Set(['plank', 'walk', 'cycle', 'rower']);

/** Generates a self-contained image locally, with only the details selected for sharing. */
export async function createSessionCard(
  data: AppData,
  session: Session,
  includeName: boolean,
): Promise<Blob> {
  await document.fonts.ready;
  const t = useT(data.settings.language);
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');
  const dark = data.settings.appearance !== 'light';
  const palette = dark
    ? {
        canvas: '#111713',
        panel: '#1A241E',
        ink: '#F4F8F5',
        muted: '#AABFB2',
        accent: '#8FE8CF',
        line: '#34463A',
      }
    : {
        canvas: '#f7f7f2',
        panel: '#ffffff',
        ink: '#232a24',
        muted: '#59645b',
        accent: '#4a6653',
        line: '#dce1d8',
      };
  const font = '"DM Sans", sans-serif';
  const heading = '"Barlow Condensed", sans-serif';
  const progress = getProgress(data);
  const ordinal =
    [...RANKS, EXTENDED_RANK].findIndex((rank) => rank.name === progress.rank.name) + 1;
  const completedSets = session.exercises.reduce(
    (sum, exercise) => sum + exercise.sets.filter((set) => set.done && set.reps > 0).length,
    0,
  );
  const kgVolume = session.exercises
    .filter((exercise) => !timedIds.has(exercise.exerciseId))
    .reduce(
      (sum, exercise) =>
        sum +
        exercise.sets
          .filter((set) => set.done && set.reps > 0)
          .reduce((subtotal, set) => subtotal + set.reps * set.weight, 0),
      0,
    );
  const volume = Math.round(kgVolume * (data.settings.units === 'lb' ? 2.2046226218 : 1));

  function text(
    value: string,
    x: number,
    y: number,
    size: number,
    family = font,
    color = palette.ink,
    maxWidth = 920,
    align: CanvasTextAlign = 'left',
  ) {
    context!.fillStyle = color;
    context!.textAlign = align;
    let fitted = size;
    context!.font = `600 ${fitted}px ${family}`;
    while (context!.measureText(value).width > maxWidth && fitted > 24) {
      fitted -= 1;
      context!.font = `600 ${fitted}px ${family}`;
    }
    context!.fillText(value, x, y);
  }

  function divider(y: number) {
    context!.strokeStyle = palette.line;
    context!.lineWidth = 2;
    context!.beginPath();
    context!.moveTo(80, y);
    context!.lineTo(1000, y);
    context!.stroke();
  }

  function titleLines(value: string, size: number): string[] {
    context!.font = `600 ${size}px ${heading}`;
    const lines: string[] = [];
    let line = '';
    for (const word of value.trim().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (context!.measureText(candidate).width <= 920) {
        line = candidate;
        continue;
      }
      if (line) {
        lines.push(line);
        line = '';
      }
      for (const character of word) {
        if (context!.measureText(line + character).width > 920) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  context.fillStyle = palette.canvas;
  context.fillRect(0, 0, 1080, 1350);
  text('FORM', 80, 126, 36);
  context.fillStyle = palette.panel;
  context.strokeStyle = palette.accent;
  context.lineWidth = 3;
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(940, 54);
  context.lineTo(990, 72);
  context.lineTo(990, 112);
  context.quadraticCurveTo(990, 138, 940, 160);
  context.quadraticCurveTo(890, 138, 890, 112);
  context.lineTo(890, 72);
  context.closePath();
  context.fill();
  context.stroke();
  text(String(ordinal), 940, 122, 44, heading, palette.accent, 80, 'center');
  divider(170);
  text(
    new Date(`${session.date}T12:00:00`).toLocaleDateString(data.settings.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    80,
    236,
    28,
    font,
    palette.muted,
  );
  let titleSize = 64;
  let lines = titleLines(session.title || t('workout'), titleSize);
  while (lines.length > 3 && titleSize > 24) {
    titleSize -= 2;
    lines = titleLines(session.title || t('workout'), titleSize);
  }
  lines.forEach((line, index) => text(line, 80, 330 + index * titleSize * 1.2, titleSize, heading));
  const rowStart = Math.max(548, 330 + (lines.length - 1) * titleSize * 1.2 + 100);
  context.fillStyle = palette.panel;
  context.beginPath();
  context.roundRect(52, rowStart - 64, 976, 548, 28);
  context.fill();
  const rows = [
    { label: t('currentRank'), value: progress.rank.name },
    {
      label: t('xp'),
      value: `+${session.xp.toLocaleString(data.settings.language)} XP`,
      accent: true,
    },
    { label: t('completedSets'), value: completedSets.toLocaleString(data.settings.language) },
    {
      label: t('elapsed'),
      value: `${
        session.duration >= 60
          ? (Math.round(session.duration / 6) / 10).toLocaleString(data.settings.language)
          : Math.round(session.duration).toLocaleString(data.settings.language)
      } ${t(session.duration >= 60 ? 'minutes' : 'seconds')}`,
    },
    {
      label: t('volume'),
      value: `${volume.toLocaleString(data.settings.language)} ${data.settings.units}`,
    },
  ];
  rows.forEach((row, index) => {
    const y = rowStart + index * 104;
    text(row.label, 80, y, 28, font, palette.muted, 410);
    text(row.value, 1000, y, 34, font, row.accent ? palette.accent : palette.ink, 470, 'right');
    divider(y + 40);
  });
  if (includeName && data.profile?.name) {
    text(t('name'), 80, 1160, 28, font, palette.muted, 410);
    text(data.profile.name, 1000, 1160, 32, font, palette.ink, 470, 'right');
  }
  context.save();
  context.fillStyle = palette.accent;
  context.globalAlpha = dark ? 0.24 : 0.16;
  for (let index = 0; index < 3; index++) {
    const x = 858 + index * 46;
    context.beginPath();
    context.moveTo(x, 1250);
    context.lineTo(x + 18, 1250);
    context.lineTo(x + 44, 1216);
    context.lineTo(x + 26, 1216);
    context.closePath();
    context.fill();
  }
  context.restore();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG generation failed.'))),
      'image/png',
    ),
  );
}

export default function ShareCard({ data, session, onClose }: Props) {
  const t = useT(data.settings.language);
  const [includeName, setIncludeName] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let canceled = false;
    let objectUrl: string | null = null;
    setBlob(null);
    setPreview(null);
    setError(false);
    createSessionCard(data, session, includeName)
      .then((value) => {
        if (canceled) return;
        objectUrl = URL.createObjectURL(value);
        setBlob(value);
        setPreview(objectUrl);
      })
      .catch(() => {
        if (!canceled) setError(true);
      });
    return () => {
      canceled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [data, session, includeName]);

  async function download() {
    if (!blob) return;
    setBusy(true);
    setError(false);
    try {
      await exportBinaryFile(`FORM-session-${session.date}.png`, blob, t('shareSession'));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (!isPremium(data)) return null;
  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        style={{ maxWidth: 570 }}
      >
        <div className="section-heading">
          <h2 id="share-title">{t('shareSession')}</h2>
          <button className="icon-button" aria-label={t('close')} onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {preview ? (
          <img
            alt={t('sharePreview')}
            src={preview}
            width={1080}
            height={1350}
            style={{
              display: 'block',
              width: '100%',
              height: 'min(50vh, 480px)',
              objectFit: 'contain',
              background: 'transparent',
              borderRadius: 10,
            }}
          />
        ) : (
          <p role="status" className="muted">
            {t('creatingCard')}
          </p>
        )}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 24,
          }}
        >
          <input
            type="checkbox"
            checked={includeName}
            onChange={(event) => setIncludeName(event.target.checked)}
          />
          {t('includeName')}
        </label>
        <p className="fine-print">{t('sharePrivacy')}</p>
        {error && (
          <p className="notice" role="alert">
            {t('shareFailed')}
          </p>
        )}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            {t('close')}
          </button>
          <button
            className="button primary"
            disabled={!blob || busy}
            onClick={() => void download()}
          >
            <ArrowDownToLine size={18} aria-hidden="true" />
            {t('downloadCard')}
          </button>
        </div>
      </div>
    </div>
  );
}
