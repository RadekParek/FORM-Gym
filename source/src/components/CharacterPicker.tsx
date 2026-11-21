import type { Avatar, Language } from '../model';
import UserAvatar, { SKIN_COLORS, SHIRT_COLORS } from './UserAvatar';
import { featureT } from '../feature-i18n';

export default function CharacterPicker({
  avatar,
  onChange,
  language,
}: {
  avatar: Avatar;
  onChange: (avatar: Avatar) => void;
  language: Language;
}) {
  return (
    <div className="character-picker">
      <UserAvatar avatar={avatar} size={140} decorative={false} />
      <div className="character-controls">
        {(['skin', 'hair', 'shirt'] as const).map((part) => (
          <fieldset key={part}>
            <legend>{featureT(language, part)}</legend>
            <div className="character-swatches">
              {Array.from({ length: part === 'skin' ? 5 : 4 }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  className={`character-swatch ${avatar[part] === index ? 'chosen' : ''}`}
                  aria-label={`${featureT(language, part)} ${index + 1}`}
                  aria-pressed={avatar[part] === index}
                  onClick={() => onChange({ ...avatar, [part]: index })}
                >
                  {part === 'hair' ? (
                    <span>{index + 1}</span>
                  ) : (
                    <i
                      style={{ background: (part === 'skin' ? SKIN_COLORS : SHIRT_COLORS)[index] }}
                    />
                  )}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
