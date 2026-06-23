import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, History, Loader2, ShieldCheck, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { matchesApi } from '../../api/client';
import { Button, Collapsible } from '../ui';

interface MatchSeedAuditPanelProps {
  matchId: number;
  played?: boolean;
  onRevive?: () => void | Promise<void>;
  reviveLoading?: boolean;
}

type AuditPayload = {
  audit?: {
    seedHash?: string;
    seedFormula?: string;
    seed?: number;
    algorithm?: string;
    verifiable?: boolean;
  };
  verification?: {
    reproducesPersistedScore?: boolean;
    persisted?: { homeGoals?: number | null; awayGoals?: number | null };
    resimulated?: { homeGoals?: number; awayGoals?: number };
  } | null;
};

export function MatchSeedAuditPanel({ matchId, played, onRevive, reviveLoading }: MatchSeedAuditPanelProps) {
  const [audit, setAudit] = useState<AuditPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadAudit = useCallback(async () => {
    if (!Number.isFinite(matchId)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await matchesApi.getAudit(matchId);
      setAudit(res);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la auditoría');
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    if (loaded) return;
    void loadAudit();
  }, [loadAudit, loaded]);

  const reproduces = audit?.verification?.reproducesPersistedScore;
  const seedHash = audit?.audit?.seedHash;

  return (
    <Collapsible
      title={(
        <span className="inline-flex items-center gap-2">
          <Fingerprint size={15} style={{ color: 'var(--blue-info)' }} />
          Auditoría de semilla
        </span>
      )}
    >
      {loading && !audit && (
        <p className="text-sm flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <Loader2 size={14} className="animate-spin" /> Verificando hash…
        </p>
      )}

      {error && (
        <div className="space-y-2">
          <p className="text-sm" style={{ color: 'var(--red-danger)' }}>{error}</p>
          <Button variant="secondary" size="sm" onClick={() => void loadAudit()}>Reintentar</Button>
        </div>
      )}

      {audit && (
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold mb-1" style={{ color: 'var(--text-muted)' }}>
              Hash SHA-256 ({audit.audit?.algorithm ?? 'sha256'})
            </p>
            <code
              className="block break-all font-mono text-xs p-2 rounded-lg"
              style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
            >
              {seedHash ?? '—'}
            </code>
            {audit.audit?.seedFormula && (
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                Fórmula: {audit.audit.seedFormula} → semilla {audit.audit.seed ?? '—'}
              </p>
            )}
          </div>

          {played && audit.verification && reproduces != null && (
            <div
              className="flex items-start gap-3 p-3 rounded-lg border"
              style={{
                borderColor: reproduces
                  ? 'color-mix(in srgb, var(--green-primary) 35%, transparent)'
                  : 'color-mix(in srgb, var(--gold-accent) 35%, transparent)',
                background: reproduces
                  ? 'color-mix(in srgb, var(--green-primary) 8%, transparent)'
                  : 'color-mix(in srgb, var(--gold-accent) 8%, transparent)',
              }}
            >
              {reproduces ? (
                <ShieldCheck size={18} style={{ color: 'var(--green-primary)', flexShrink: 0 }} />
              ) : (
                <ShieldAlert size={18} style={{ color: 'var(--gold-accent)', flexShrink: 0 }} />
              )}
              <div>
                <p className="font-bold" style={{ color: reproduces ? 'var(--green-primary)' : 'var(--gold-accent)' }}>
                  {reproduces ? 'Reproduce el marcador persistido' : 'Recreación no canónica'}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Persistido: {audit.verification.persisted?.homeGoals ?? '—'} – {audit.verification.persisted?.awayGoals ?? '—'}
                  {' · '}
                  Re-simulado: {audit.verification.resimulated?.homeGoals ?? '—'} – {audit.verification.resimulated?.awayGoals ?? '—'}
                </p>
              </div>
            </div>
          )}

          {played && onRevive && (
            <Button
              variant="secondary"
              size="sm"
              disabled={reviveLoading}
              onClick={async () => {
                try {
                  await onRevive();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'No se pudo revivir el partido');
                }
              }}
            >
              <History size={14} className={reviveLoading ? 'animate-spin' : ''} />
              Revivir partido
            </Button>
          )}

          {!played && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              El hash queda publicado como compromiso previo. Tras jugarse, podrás verificar el marcador.
            </p>
          )}
        </div>
      )}
    </Collapsible>
  );
}
