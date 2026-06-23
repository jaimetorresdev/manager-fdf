// X3 · Identidad visual del entrenador NPC (sin ficha pública).
// Avatar determinista vía avatarSeed/name + enlace ficticio coherente con NpcCoachLink (Cursor).
import { NpcCoachLink } from '../common/EntityLink';
import { PlayerPortrait } from '../ui/PlayerPortrait';

export interface NpcCoachInfo {
  id?: string;
  name: string;
  avatarSeed?: string;
  tacticalStyle?: { favoriteFormation?: string };
}

function npcCoachPortraitId(npc: Pick<NpcCoachInfo, 'name' | 'avatarSeed'>): number {
  const s = npc.avatarSeed ?? npc.name ?? 'npc';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

interface Props {
  npcCoach: NpcCoachInfo;
  size?: number;
  showFormation?: boolean;
  compact?: boolean;
}

export function NpcCoachIdentity({ npcCoach, size = 20, showFormation = true, compact }: Props) {
  const portraitId = npcCoachPortraitId(npcCoach);
  const formation = npcCoach.tacticalStyle?.favoriteFormation;

  return (
    <span className="npc-id" style={{ display: 'inline-flex', alignItems: 'center', gap: compact ? 4 : 6, minWidth: 0 }}>
      <span
        className="npc-id-avatar"
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          overflow: 'hidden',
          flexShrink: 0,
          border: '1px solid color-mix(in srgb, var(--gold-accent) 35%, var(--border-color))',
          background: 'var(--bg-elevated)',
          boxShadow: '0 0 0 1px color-mix(in srgb, var(--gold-accent) 12%, transparent)',
        }}
        title="Entrenador NPC"
      >
        <PlayerPortrait id={portraitId} size={size} age={52} />
      </span>
      <span style={{ minWidth: 0, display: 'flex', flexDirection: compact ? 'row' : 'column', gap: compact ? 6 : 1, alignItems: compact ? 'center' : 'flex-start' }}>
        <NpcCoachLink id={npcCoach.id} name={npcCoach.name} />
        {showFormation && formation && (
          <span
            style={{
              fontSize: '.58rem',
              fontWeight: 800,
              letterSpacing: '.4px',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              padding: '1px 5px',
              borderRadius: 4,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-elevated)',
              whiteSpace: 'nowrap',
            }}
          >
            {formation}
          </span>
        )}
      </span>
    </span>
  );
}
