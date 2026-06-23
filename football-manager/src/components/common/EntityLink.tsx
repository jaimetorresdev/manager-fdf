// ─── E6 · Ficha universal clicable ─────────────────────────────────────────────
// <PlayerLink id name/> y <ClubLink id name/>: donde aparezca un jugador o club,
// clic → MODAL con resumen → botón a su página completa (/player/:id, /club/:id).
// Defensivos: sin id renderizan texto plano; el fetch nunca tumba la página.
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Modal, Skeleton, StatBar, ClubBadge, PlayerPortrait } from '../ui';
import { PlayerDossier, type DossierPlayer } from '../player/PlayerDossier';
import { kitFromPlayer } from '../match/kitColors';
import { playersApi, clubApi, managerApi } from '../../api/client';
import { eur } from '../../lib/format';

// ─── PlayerLink ────────────────────────────────────────────────────────────────
export function PlayerLink({ id, name, children }: { id?: number | null; name: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [player, setPlayer] = useState<any | null>(null);
  const [failed, setFailed] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation('common');

  useEffect(() => {
    if (!open || player || !id) return;
    let alive = true;
    playersApi.getPublicPlayer(id)
      .then(p => { if (alive) setPlayer(p); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [open, id, player]);

  if (!id) return <>{children ?? name}</>;

  const toDossier = (p: any): DossierPlayer => {
    const kit = kitFromPlayer(p);
    return {
      id: p.id ?? id,
      name: p.name ?? name, position: p.position, preferredPosition: p.preferredPosition, age: p.age, potential: p.potential,
      nationality: p.nationality, marketValue: p.marketValue, wage: p.wage ?? p.salary,
      jerseyColor: kit.primary, jerseySecondary: kit.secondary, squadNumber: p.squadNumber ?? undefined,
      passing: p.passing, tackling: p.tackling, shooting: p.shooting, organization: p.organization,
      unmarking: p.unmarking, finishing: p.finishing, dribbling: p.dribbling, fouls: p.fouls, goalkeeping: p.goalkeeping,
      fitness: p.fitness, muscularFitness: p.muscularFitness, mentalSharpness: p.mentalSharpness, matchRhythm: p.matchRhythm,
      isInjured: (p.injuries?.length ?? 0) > 0, isSuspended: (p.suspensions?.length ?? 0) > 0 || (p.suspendedMatches ?? 0) > 0,
    };
  };

  return (
    <>
      <button className="elink" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>{children ?? name}</button>
      {open && (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title={name}
          subtitle={player?.position ? `${player.position} · OVR ${player.overall ?? '—'}` : 'Ficha de jugador'}
          headerIcon={player ? (
            <PlayerPortrait
              id={id}
              size={36}
              variant="card"
              age={player.age}
              dorsal={player.squadNumber}
              jerseyColor={kitFromPlayer(player).primary}
              jerseySecondary={kitFromPlayer(player).secondary}
            />
          ) : <PlayerPortrait id={id} size={36} variant="card" />}
          width={1100}
          footer={player ? (
            <button type="button" className="elink-go" onClick={() => { setOpen(false); navigate(`/player/${id}`); }}>
              {t('Ficha completa →')}
            </button>
          ) : undefined}
        >
          {failed && <p style={{ color: 'var(--text-muted)' }}>{t('No se pudo cargar la ficha.')}</p>}
          {!failed && !player && <Skeleton height={260} />}
          {player && <PlayerDossier player={toDossier(player)} />}
        </Modal>
      )}
    </>
  );
}

// ─── ClubLink ──────────────────────────────────────────────────────────────────
export function ClubLink({ id, name, children }: { id?: number | null; name: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [club, setClub] = useState<any | null>(null);
  const [failed, setFailed] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation('common');

  useEffect(() => {
    if (!open || club || !id) return;
    let alive = true;
    clubApi.getPublic(id)
      .then(c => { if (alive) setClub(c?.club ?? c); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [open, id, club]);

  if (!id) return <>{children ?? name}</>;

  return (
    <>
      <button className="elink" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>{children ?? name}</button>
      {open && (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title={club?.name ?? name}
          subtitle={[club?.city, club?.country].filter(Boolean).join(' · ') || 'Club'}
          headerIcon={<ClubBadge id={club?.id ?? id} name={club?.name ?? name} size={36} />}
          variant="compact"
          width={560}
          footer={club ? (
            <button type="button" className="elink-go" onClick={() => { setOpen(false); navigate(`/club/${id}`); }}>
              {t('Ver club →')}
            </button>
          ) : undefined}
        >
          {failed && <p style={{ color: 'var(--text-muted)' }}>{t('No se pudo cargar el club.')}</p>}
          {!failed && !club && <Skeleton height={180} />}
          {club && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, margin: '4px 0' }}>
                {[
                  ['Valoración FDF', eur(club.fdfValuation ?? club.valuation)],
                  ['Reputación', String(club.reputation ?? '—')],
                  ['Estadio', club.stadiumName ?? club.stadium?.name ?? '—'],
                  ['Aforo', club.stadiumCapacity ?? club.stadium?.capacity ?? '—'],
                ].map(([k, v]) => (
                  <div key={String(k)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-retro)', padding: '8px 10px' }}>
                    <div style={{ fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>{k}</div>
                    <div style={{ fontFamily: 'var(--font-mono-retro)', fontSize: '.92rem' }}>{v}</div>
                  </div>
                ))}
              </div>
              {club.fanLoyalty != null && <StatBar label="Lealtad afición" value={Number(club.fanLoyalty)} />}
            </>
          )}
        </Modal>
      )}
    </>
  );
}

// ─── ManagerLink ───────────────────────────────────────────────────────────────
export function ManagerLink({ id, name, children }: { id?: number | null; name: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [manager, setManager] = useState<any | null>(null);
  const [failed, setFailed] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation('common');

  useEffect(() => {
    if (!open || manager || !id) return;
    let alive = true;
    managerApi.getPublic(id)
      .then(m => { if (alive) setManager(m); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [open, id, manager]);

  if (!id) return <>{children ?? name}</>;

  return (
    <>
      <button className="elink" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>{children ?? name}</button>
      {open && (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title={name}
          subtitle={manager?.club?.name ?? 'Mánager libre'}
          headerIcon={(
            <div style={{
              width: 36, height: 36, borderRadius: 8, background: 'var(--bg-base)',
              display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)',
              fontSize: '1.1rem', color: 'var(--gold-accent)', fontWeight: 800,
            }}>
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          variant="compact"
          width={560}
          footer={manager ? (
            <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'flex-end' }}>
              {manager.dm && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); navigate(`/messages?to=${id}`); }}
                  style={{
                    fontSize: '.75rem', padding: '6px 12px', borderRadius: 6,
                    background: 'var(--blue-info)', color: '#fff', border: 'none', cursor: 'pointer',
                  }}
                >
                  {t('Mensaje directo')}
                </button>
              )}
              <button type="button" className="elink-go" onClick={() => { setOpen(false); navigate(`/manager/${id}`); }}>
                {t('Ficha completa →')}
              </button>
            </div>
          ) : undefined}
        >
          {failed && <p style={{ color: 'var(--text-muted)' }}>{t('No se pudo cargar el mánager.')}</p>}
          {!failed && !manager && <Skeleton height={180} />}
          {manager && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, margin: '4px 0' }}>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-retro)', padding: '8px 10px' }}>
                  <div style={{ fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>{t('Prestigio')}</div>
                  <div style={{ fontFamily: 'var(--font-mono-retro)', fontSize: '.92rem' }}>
                    {manager.recentPrestige != null ? `${Number(manager.recentPrestige).toFixed(1)}%` : '—'}
                  </div>
                </div>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-retro)', padding: '8px 10px' }}>
                  <div style={{ fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>{t('Récord (V-E-D)')}</div>
                  <div style={{ fontFamily: 'var(--font-mono-retro)', fontSize: '.92rem' }}>
                    {manager.record ? `${manager.record.w}-${manager.record.d}-${manager.record.l}` : '0-0-0'}
                  </div>
                </div>
              </div>

              {manager.achievements && manager.achievements.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: '.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>{t('Palmarés Destacado')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {manager.achievements.slice(0, 4).map((a: any, i: number) => (
                      <span key={i} style={{ fontSize: '.75rem', padding: '2px 6px', background: 'var(--bg-elevated)', borderRadius: 4, border: '1px solid var(--border-color)' }}>
                        🏆 {a.name ?? a.description ?? a}
                      </span>
                    ))}
                    {manager.achievements.length > 4 && (
                      <span style={{ fontSize: '.75rem', padding: '2px 6px', color: 'var(--text-muted)' }}>+{manager.achievements.length - 4} {t('más')}</span>
                    )}
                  </div>
                </div>
              )}

            </>
          )}
        </Modal>
      )}
    </>
  );
}

// ─── NpcCoachLink · entrenador NPC (X3 ficha pública) ─────────────────────────
export function NpcCoachLink({ id, name, children }: { id?: string; name: string; children?: ReactNode }) {
  const navigate = useNavigate();
  const label = children ?? name;
  if (!id) {
    return <span className="elink">{label}</span>;
  }
  return (
    <span
      role="link"
      tabIndex={0}
      className="elink cursor-pointer hover:underline"
      title="Ver ficha del entrenador NPC"
      onClick={(e) => { e.stopPropagation(); navigate(`/npc-coach/${id}`); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
          navigate(`/npc-coach/${id}`);
        }
      }}
    >
      {label}
    </span>
  );
}
