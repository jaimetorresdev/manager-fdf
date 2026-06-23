import { memo, useMemo } from 'react';
import { cn } from '../../lib/cn';
import { collarForPlayer } from '../../lib/playerFacesJs';
import { skinForPlayer } from '../../lib/comicFace';
import { libraryPortrait } from '../../lib/portraitLibrary';
import { proceduralPortrait } from '../../lib/proceduralPortrait';
import { SilhouetteFace } from './SilhouetteFace';
import { FootballShirt } from '../../lib/playerFootballShirt';
import { StickerFrame } from '../../lib/playerStickerFrame';

interface Props {
  id: number;
  size?: number;
  className?: string;
  jerseyColor?: string;
  jerseySecondary?: string;
  dorsal?: number;
  age?: number;
  variant?: 'default' | 'broadcast' | 'card';
}

export const PlayerPortrait = memo(function PlayerPortrait({
  id, size = 64, className, jerseyColor, jerseySecondary, dorsal, age, variant = 'default',
}: Props) {
  const broadcast = variant === 'broadcast';
  const card = variant === 'card';
  const sticker = broadcast || card;
  const radius = sticker ? '8%' : '50%';

  const primary = jerseyColor ?? 'var(--club-primary, var(--green-primary))';
  const secondary = jerseySecondary ?? primary;

  const collar = useMemo(() => collarForPlayer(id), [id]);
  const skin = useMemo(() => skinForPlayer(id), [id]);
  // Retrato raster de la librería (pixel-art) si existe para este (id, edad).
  const raster = useMemo(() => libraryPortrait(id, age), [id, age]);
  // Si no hay retrato especial, generamos uno procedural con piezas separadas
  const procedural = useMemo(() => (!raster ? proceduralPortrait(id, age) : null), [id, age, raster]);

  // El dorsal solo en cromos (card/broadcast); en avatares redondos pequeños sobra.
  const showNumber = sticker && dorsal != null && dorsal > 0;

  return (
    <div
      className={cn(
        'relative overflow-hidden shrink-0 pp-wrap',
        sticker && 'pp-wrap--sticker',
        card && 'pp-wrap--card',
        broadcast && 'pp-wrap--broadcast',
        variant === 'default' && 'pp-wrap--round',
        className,
      )}
      style={{ width: size, borderRadius: radius }}
      role="img"
      aria-label={`Retrato jugador ${id}`}
    >
      <div className="pp-sticker-bg" aria-hidden />
      <div className="pp-stage">
        {/* Camiseta (kit + rayas + dorsal) la pinta el código → consistente en todos */}
        <div className="pp-shirt-layer">
          <FootballShirt
            skin={skin}
            primary={primary}
            secondary={secondary}
            dorsal={showNumber ? dorsal : undefined}
            collar={collar}
          />
        </div>
        {/* Cara: busto raster transparente de la librería, o capas procedurales, o silueta neutra */}
        <div className="pp-face-layer">
          {raster ? (
            <img src={raster} alt={`Retrato jugador ${id}`} className="pp-raster" draggable={false} />
          ) : procedural ? (
            <>
              <img src={procedural.base} alt="" className="pp-raster" draggable={false} />
              {procedural.beard && <img src={procedural.beard} alt="" className="pp-raster pp-raster-overlay" draggable={false} />}
              {procedural.hair && <img src={procedural.hair} alt="" className="pp-raster pp-raster-overlay" draggable={false} />}
            </>
          ) : (
            <SilhouetteFace className="pp-comic-host" />
          )}
        </div>
      </div>
      {sticker && <StickerFrame />}
      <div className="pp-sticker-vignette" aria-hidden />
      <div className="pp-sticker-shine" aria-hidden />
    </div>
  );
});
