// ─── Panel de Administración — identidad v2 (B13) ─────────────────────────────
// Control de turnos (E14) + auditoría por semilla (re-sim audit-only, contrato
// API_UI §13 de Codex) + visión general de clubes/usuarios. Cero window.confirm:
// confirmaciones con Modal y feedback con toasts.
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { gameApi, clubApi, authApi, adminApi, clearToken } from '../api/client';
import {
  Shield, Play, FastForward, Clock, Database, Trophy, Users, RefreshCw,
  Loader2, Building2, UserCog, Microscope, Unlock, Pause,
} from 'lucide-react';
import { Card, Button, StatCard, Modal, SortableTable, type SortCol } from '../components/ui';
import { useSession } from '../stores/sessionStore';
import { useNavigate } from 'react-router-dom';

interface GameState {
  id: number;
  season: string; // nombre de temporada, p. ej. "2024-25"
  week: number;
  phase: string;
}

interface ClubRow {
  name: string;
  cash: number | null;
  position: number;
  points: number;
  played: number;
}

interface AdminClub {
  id: number;
  name: string;
  shortName: string;
  badge: string;
  city: string;
  budget: number;
  reputation: number;
  fans: number;
  managerName: string | null;
  playerCount: number;
}

interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: string;
  manager: {
    name: string;
    club: { name: string; shortName: string; badge: string } | null;
  } | null;
}

const API_BASE = import.meta.env.VITE_API_URL ?? (
  import.meta.env.PROD ? '/api' : 'http://localhost:3001/api'
);

async function adminRequest<T>(path: string): Promise<T> {
  const token = localStorage.getItem('fdf_token');
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── Confirmación v2 (sustituye a window.confirm) ─────────────────────────────
interface ConfirmState {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

function ConfirmDialog({ confirm, onClose }: { confirm: ConfirmState | null; onClose: () => void }) {
  const { t } = useTranslation('common');
  if (!confirm) return null;
  return (
    <Modal open onClose={onClose} title={confirm.title} width={440}>
      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{confirm.body}</div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="ghost" size="sm" onClick={onClose}>{t('Cancelar')}</Button>
        <Button
          variant={confirm.danger ? 'danger' : 'primary'}
          size="sm"
          onClick={() => { const fn = confirm.onConfirm; onClose(); fn(); }}
        >
          {confirm.confirmLabel ?? t('Confirmar')}
        </Button>
      </div>
    </Modal>
  );
}

export function AdminPage() {
  const { t } = useTranslation('common');
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [week, setWeek] = useState(1);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof adminApi.stats>> | null>(null);
  const [adminClubs, setAdminClubs] = useState<AdminClub[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    authApi.me()
      .then((user) => {
        // admin y master ven el panel (requireAdmin del backend = admin+)
        const admin = user.role === 'admin' || user.role === 'master';
        localStorage.setItem('fdf_role', user.role);
        setIsAdmin(admin);
      })
      .catch(() => {
        localStorage.removeItem('fdf_role');
        setIsAdmin(false);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [state, standings, statsData, clubsData, usersData] = await Promise.all([
        gameApi.getState(),
        clubApi.standings(),
        adminApi.stats().catch(() => null),
        adminRequest<AdminClub[]>('/admin/clubs').catch(() => []),
        adminRequest<AdminUser[]>('/admin/users').catch(() => []),
      ]);
      setGameState(state);
      setWeek(state.week);
      setStats(statsData);
      setAdminClubs(clubsData);
      setAdminUsers(usersData);

      const formattedClubs = standings.slice(0, 10).map((c: any) => ({
        name: c.team,
        cash: c.cash ?? null, // sin dato real → se muestra "—"
        position: c.position,
        points: c.points,
        played: c.played,
      }));
      setClubs(formattedClubs);
    } catch (error) {
      console.error('Failed to load admin data:', error);
      toast.error(t('No se pudieron cargar los datos de administración'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const doAdvanceWeek = async () => {
    try {
      setAdvancing(true);
      await gameApi.advance();
      toast.success(t('Jornada avanzada'));
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('No se pudo avanzar'));
    } finally {
      setAdvancing(false);
    }
  };

  const doGoToWeek = async () => {
    if (!gameState || week <= gameState.week) {
      toast.error(t('Solo puedes avanzar a jornadas futuras'));
      return;
    }
    try {
      setAdvancing(true);
      const diff = week - gameState.week;
      for (let i = 0; i < diff; i++) {
        await gameApi.advance();
      }
      toast.success(t('Avanzado hasta la jornada') + ` ${week}`);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('Fallo a mitad de tanda'));
    } finally {
      setAdvancing(false);
    }
  };

  const clubCols: SortCol<ClubRow>[] = [
    { key: 'position', header: '#', sortValue: (r) => r.position, render: (r) => <span className="font-bold">{r.position}</span>, align: 'left' },
    { key: 'name', header: t('Club'), sortValue: (r) => r.name, render: (r) => r.name, align: 'left' },
    { key: 'points', header: t('Puntos'), sortValue: (r) => r.points, render: (r) => <span style={{ color: 'var(--gold-accent)', fontWeight: 600 }}>{r.points}</span>, align: 'center' },
    { key: 'played', header: t('PJ'), sortValue: (r) => r.played, render: (r) => <span style={{ color: 'var(--text-muted)' }}>{r.played}</span>, align: 'center' },
    {
      key: 'cash', header: t('Caja (M€)'), sortValue: (r) => r.cash ?? -1, align: 'right',
      render: (r) => <span className="font-mono" style={{ color: 'var(--green-primary)' }}>{r.cash != null ? (r.cash / 1_000_000).toFixed(1) : '—'}</span>,
    },
  ];

  if (!authChecked) {
    return (
      <div className="text-center py-12">
        <Loader2 className="animate-spin mx-auto mb-3 text-[var(--green-primary)]" />
        <p className="text-[var(--text-muted)]">{t('Verificando permisos...')}</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <Shield size={48} className="mx-auto mb-4 text-[var(--red-danger)]" />
          <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">{t('Acceso Denegado')}</h1>
          <p className="text-[var(--text-muted)] mb-6">{t('Tu sesión no tiene rol de administrador')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield size={32} className="text-[var(--red-danger)]" />
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display)' }}>{t('PANEL DE ADMINISTRACIÓN')}</h1>
            <p className="text-[var(--text-muted)] text-sm">{t('Control total del juego')}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirm({
            title: t('Salir del modo admin'),
            body: t('Se cerrará tu sesión actual. ¿Continuar?'),
            confirmLabel: t('Salir'),
            danger: true,
            onConfirm: () => {
              localStorage.removeItem('fdf_role');
              clearToken();
              useSession.getState().logout();
              navigate('/');
            },
          })}
        >
          {t('Salir Admin')}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="animate-spin mx-auto mb-3 text-[var(--green-primary)]" />
          <p className="text-[var(--text-muted)]">{t('Cargando datos...')}</p>
        </div>
      ) : (
        <>
          {/* E14 · Control total de turnos */}
          <TurnControlPanel onConfirm={setConfirm} />

          {/* B13 · Auditoría por semilla (re-sim audit-only) */}
          <SeedAuditPanel onConfirm={setConfirm} />

          {/* Game State Card */}
          {gameState && (
            <Card className="border-[var(--border-color)] bg-[var(--bg-surface)]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Play size={20} className="text-[var(--green-primary)]" /> {t(' Estado del Juego')}
                </h2>
                <button
                  onClick={loadData}
                  className="p-1.5 hover:bg-[var(--border-color)] rounded-lg transition"
                  aria-label="Recargar"
                >
                  <RefreshCw size={18} className="text-[var(--text-muted)]" />
                </button>
              </div>

              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-[var(--bg-base)] p-3 rounded-lg border border-[var(--border-color)]">
                  <p className="text-[var(--text-muted)] text-xs uppercase">{t('Temporada')}</p>
                  <p className="text-2xl font-bold text-[var(--gold-accent)]">{gameState.season}</p>
                </div>
                <div className="bg-[var(--bg-base)] p-3 rounded-lg border border-[var(--border-color)]">
                  <p className="text-[var(--text-muted)] text-xs uppercase">{t('Jornada Actual')}</p>
                  <p className="text-2xl font-bold text-[var(--green-primary)]">{gameState.week}</p>
                </div>
                <div className="bg-[var(--bg-base)] p-3 rounded-lg border border-[var(--border-color)]">
                  <p className="text-[var(--text-muted)] text-xs uppercase">{t('Fase')}</p>
                  <p className="text-xl font-bold text-[var(--text-primary)]">{gameState.phase}</p>
                </div>
                <div className="bg-[var(--bg-base)] p-3 rounded-lg border border-[var(--border-color)]">
                  <p className="text-[var(--text-muted)] text-xs uppercase">{t('ID Juego')}</p>
                  <p className="text-xl font-bold text-[var(--text-primary)]">#{gameState.id}</p>
                </div>
              </div>

              {/* Controls */}
              <div className="space-y-3">
                <Button
                  onClick={() => setConfirm({
                    title: t('Avanzar jornada'),
                    body: t('Se simulará la siguiente jornada completa. ¿Continuar?'),
                    confirmLabel: t('Avanzar'),
                    onConfirm: doAdvanceWeek,
                  })}
                  disabled={advancing}
                  className="w-full"
                >
                  <FastForward size={16} />
                  {advancing ? t('Avanzando...') : t('Avanzar 1 Jornada')}
                </Button>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <label htmlFor="admin-goto-week" className="block text-xs text-[var(--text-muted)] mb-1.5">{t('Ir a jornada')}</label>
                    <input
                      id="admin-goto-week"
                      type="number"
                      min="1"
                      max="38"
                      value={week}
                      onChange={(e) => setWeek(Math.max(1, Math.min(38, parseInt(e.target.value) || 1)))}
                      className="w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--green-primary)]"
                    />
                  </div>
                  <div className="mt-6">
                    <Button
                      variant="gold"
                      onClick={() => setConfirm({
                        title: t('Ir a la jornada ') + week,
                        body: t('Se simularán ') + `${week - gameState.week}` + t(' jornada(s) seguidas. ¿Continuar?'),
                        confirmLabel: t('Ir'),
                        onConfirm: doGoToWeek,
                      })}
                      disabled={advancing || week <= gameState.week}
                    >
                      {t('Ir')}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard
              label={t('Clubes')}
              value={String(stats?.clubs ?? clubs.length)}
              icon={<Users size={18} />}
              color="bg-[color-mix(in_srgb,var(--green-primary)_10%,transparent)] text-[var(--green-primary)]"
            />
            <StatCard
              label={t('Jornadas')}
              value={gameState?.week || '0'}
              icon={<Clock size={18} />}
              color="bg-[color-mix(in_srgb,var(--gold-accent)_10%,transparent)] text-[var(--gold-accent)]"
            />
            <StatCard
              label={t('Temporada')}
              value={String(gameState?.season || '0')}
              icon={<Trophy size={18} />}
              color="bg-[color-mix(in_srgb,var(--red-danger)_10%,transparent)] text-[var(--red-danger)]"
            />
            <StatCard
              label={t('Usuarios')}
              value={String(stats?.users ?? adminUsers.length)}
              icon={<Database size={18} />}
              color="bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)] text-[var(--text-primary)]"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-[var(--border-color)] bg-[var(--bg-surface)]">
              <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <Building2 size={20} className="text-[var(--blue-info)]" /> {t(' Clubes y managers')}
              </h2>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {adminClubs.slice(0, 12).map((club) => (
                  <div key={club.id} className="flex items-center justify-between rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-lg">{club.badge}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[var(--text-primary)]">{club.name}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {club.city} · {club.playerCount} {t('jugadores · rep')} {club.reputation}
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-[11px]">
                      <p className="font-semibold text-[var(--green-primary)]">{club.managerName ?? t('Libre')}</p>
                      <p className="text-[var(--gold-accent)]">{(club.budget / 1_000_000).toFixed(1)}{t('M €')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="border-[var(--border-color)] bg-[var(--bg-surface)]">
              <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <UserCog size={20} className="text-[var(--gold-accent)]" /> {t(' Usuarios')}
              </h2>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {adminUsers.slice(0, 12).map((user) => (
                  <div key={user.id} className="flex items-center justify-between rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[var(--text-primary)]">{user.username}</p>
                      <p className="truncate text-[10px] text-[var(--text-muted)]">{user.email}</p>
                    </div>
                    <div className="text-right text-[11px]">
                      <p className={user.role === 'admin' || user.role === 'master' ? 'font-semibold text-[var(--red-danger)]' : 'font-semibold text-[var(--green-primary)]'}>
                        {user.role}
                      </p>
                      <p className="text-[var(--text-muted)]">
                        {user.manager?.club ? `${user.manager.club.badge} ${user.manager.club.shortName}` : t('Sin club')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Clubs Table */}
          <Card className="border-[var(--border-color)] bg-[var(--bg-surface)]">
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Trophy size={20} className="text-[var(--gold-accent)]" /> {t(' Top 10 Clubes')}
            </h2>
            <SortableTable columns={clubCols} data={clubs} rowKey={(r) => r.name} initialSort={{ key: 'position', dir: 'asc' }} />
          </Card>

          {/* Simulation Stats */}
          {stats && (
            <Card className="border-[var(--border-color)] bg-[var(--bg-surface)]">
              <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">{t('Estadísticas del universo')}</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-[var(--bg-base)] p-4 rounded-lg border border-[var(--border-color)]">
                  <p className="text-[var(--text-muted)] text-xs uppercase">{t('Partidos jugados')}</p>
                  <p className="text-2xl font-bold text-[var(--green-primary)]">{stats.playedMatches}</p>
                </div>
                <div className="bg-[var(--bg-base)] p-4 rounded-lg border border-[var(--border-color)]">
                  <p className="text-[var(--text-muted)] text-xs uppercase">{t('Partidos totales')}</p>
                  <p className="text-2xl font-bold text-[var(--gold-accent)]">{stats.totalMatches}</p>
                </div>
                <div className="bg-[var(--bg-base)] p-4 rounded-lg border border-[var(--border-color)]">
                  <p className="text-[var(--text-muted)] text-xs uppercase">{t('Traspasos')}</p>
                  <p className="text-2xl font-bold text-[var(--blue-info)]">{stats.transfers}</p>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── E14 · Panel de control total de turnos (admin) ────────────────────────────
// Contra /admin/turn-control + /turn/advance|pause|resume|rewind|unlock.
// Confirmaciones con Modal (prop onConfirm del padre) y resultados con toast.
function TurnControlPanel({ onConfirm }: { onConfirm: (c: ConfirmState) => void }) {
  const { t } = useTranslation('common');
  const [state, setState] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [advanceCount, setAdvanceCount] = useState(1);
  const [unlockReason, setUnlockReason] = useState('');

  const refresh = () => adminApi.turnControl().then(setState).catch(() => setState(null));
  useEffect(() => { refresh(); }, []);

  const run = async (key: string, fn: () => Promise<any>, successMsg?: string) => {
    setBusy(key);
    try {
      const r = await fn();
      toast.success(r?.message ?? successMsg ?? 'OK');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(null);
    }
  };

  const advanceN = () => {
    const n = Math.min(10, Math.max(1, advanceCount));
    onConfirm({
      title: t('Avanzar ') + n + t(' turno(s)'),
      body: t('Se procesarán ') + n + t(' turno(s) seguidos del universo (ticks completos). ¿Continuar?'),
      confirmLabel: t('Procesar ') + n,
      onConfirm: () => run('n', async () => {
        for (let i = 0; i < n; i++) await adminApi.turnAdvance(`admin x${n}`);
        return { message: `${n} turno(s) procesados` };
      }),
    });
  };

  const paused = state?.paused === true;
  const locked = state?.isLocked === true || state?.gameState?.isLocked === true;

  return (
    <Card className="border-[var(--border-color)] bg-[var(--bg-surface)]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Clock size={20} className="text-[var(--gold-accent)]" /> {t(' Control de turnos')}
        </h2>
        <div className="flex gap-2">
          {locked && (
            <span className="text-xs font-bold px-2 py-1 rounded"
              style={{ background: 'color-mix(in srgb,var(--red-danger) 18%,transparent)', color: 'var(--red-danger)' }}>
              {t('TICK BLOQUEADO')}
            </span>
          )}
          {state && (
            <span className="text-xs font-bold px-2 py-1 rounded"
              style={{ background: paused ? 'color-mix(in srgb,var(--red-danger) 18%,transparent)' : 'color-mix(in srgb,var(--green-primary) 18%,transparent)', color: paused ? 'var(--red-danger)' : 'var(--green-primary)' }}>
              {paused ? t('CRON PAUSADO') : t('CRON ACTIVO')}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Button
          onClick={() => onConfirm({
            title: t('Forzar turno'),
            body: t('Se procesará un turno completo del universo AHORA (partidos, economía, desarrollo…). ¿Continuar?'),
            confirmLabel: t('Forzar'),
            onConfirm: () => run('adv', () => adminApi.turnAdvance('admin manual'), t('Turno procesado')),
          })}
          disabled={busy !== null}
        >
          {busy === 'adv' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} {t(' Forzar turno')}
        </Button>

        <div className="flex items-end gap-1">
          <div>
            <label htmlFor="admin-advance-n" className="block text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>{t('N turnos (1-10)')}</label>
            <input
              id="admin-advance-n"
              type="number" min={1} max={10} value={advanceCount}
              onChange={(e) => setAdvanceCount(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
              className="w-20 px-2 py-1.5 bg-[var(--bg-base)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--green-primary)]"
            />
          </div>
          <Button variant="secondary" onClick={advanceN} disabled={busy !== null}>
            {busy === 'n' ? <Loader2 size={14} className="animate-spin" /> : <FastForward size={14} />} {t(' Avanzar N')}
          </Button>
        </div>

        {paused
          ? (
            <Button variant="secondary" onClick={() => run('res', () => adminApi.turnResume(), t('Cron reanudado'))} disabled={busy !== null}>
              <Play size={14} /> {t(' Reanudar cron')}
            </Button>
          )
          : (
            <Button
              variant="secondary"
              onClick={() => onConfirm({
                title: t('Pausar cron de turnos'),
                body: t('Nadie recibirá turnos automáticos (11:00/23:00) hasta reanudar. ¿Pausar?'),
                confirmLabel: t('Pausar'),
                danger: true,
                onConfirm: () => run('pau', () => adminApi.turnPause(), t('Cron pausado')),
              })}
              disabled={busy !== null}
            >
              <Pause size={14} /> {t(' Pausar cron')}
            </Button>
          )}

        <Button
          variant="ghost"
          onClick={() => onConfirm({
            title: t('Rewind de reloj'),
            body: t('Restaura SOLO el reloj/estado global al último snapshot (forceClockOnly). Los efectos del turno NO se revierten. ¿Continuar?'),
            confirmLabel: t('Rewind'),
            danger: true,
            onConfirm: () => run('rew', () => adminApi.turnRewind(undefined, true), t('Reloj restaurado')),
          })}
          disabled={busy !== null}
        >
          {t('⏪ Rewind reloj')}
        </Button>
      </div>

      {/* Desbloqueo del tick (auditado en AdminAction) */}
      <div className="flex flex-wrap items-end gap-2 mt-4 pt-4 border-t border-[var(--border-color)]">
        <div className="flex-1 min-w-48">
          <label htmlFor="admin-unlock-reason" className="block text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>{t('Motivo del desbloqueo (auditoría)')}</label>
          <input
            id="admin-unlock-reason"
            type="text" value={unlockReason} placeholder="p. ej. lock huérfano tras crash"
            onChange={(e) => setUnlockReason(e.target.value)}
            className="w-full px-2 py-1.5 bg-[var(--bg-base)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--green-primary)]"
          />
        </div>
        <Button
          variant={locked ? 'danger' : 'secondary'}
          onClick={() => onConfirm({
            title: t('Desbloquear tick'),
            body: locked
              ? t('El tick está BLOQUEADO (isLocked). Desbloquear a mitad de un turno real puede dejar datos a medias — úsalo solo si el lock es huérfano. La acción queda registrada en AdminAction.')
              : t('El tick no parece bloqueado. ¿Forzar desbloqueo igualmente? La acción queda registrada en AdminAction.'),
            confirmLabel: t('Desbloquear'),
            danger: true,
            onConfirm: () => run('unlock', () => adminApi.unlockTick(unlockReason || undefined), t('Tick desbloqueado')),
          })}
          disabled={busy !== null}
        >
          {busy === 'unlock' ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />} {t(' Desbloquear tick')}
        </Button>
      </div>

      {state?.nextTickAt && (
        <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
          {t('Próximo turno programado: ')}{new Date(state.nextTickAt).toLocaleString('es-ES')}
        </p>
      )}
    </Card>
  );
}

// ─── B13 · Auditoría por semilla: re-simulación AUDIT-ONLY ─────────────────────
// POST /api/admin/matches/:id/resimulate (contrato API_UI §13): reproduce el
// partido con su semilla determinista (matchId×1337) SIN tocar lo persistido y
// compara marcadores. Verifica la promesa "todo auditable por semilla".
function SeedAuditPanel({ onConfirm }: { onConfirm: (c: ConfirmState) => void }) {
  const { t } = useTranslation('common');
  const [matchId, setMatchId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof adminApi.resimulateMatch>> | null>(null);

  const runAudit = async () => {
    const id = Number(matchId);
    if (!Number.isFinite(id) || id <= 0) { toast.error(t('ID de partido no válido')); return; }
    setBusy(true);
    setResult(null);
    try {
      const r = await adminApi.resimulateMatch(id, reason || undefined);
      setResult(r);
      if (r.reproducesPersistedScore) toast.success(t('Partido #') + id + t(': la semilla REPRODUCE el marcador persistido'));
      else toast.error(t('Partido #') + id + t(': el marcador NO coincide — revisar'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('Error al re-simular'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-[var(--border-color)] bg-[var(--bg-surface)]">
      <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1 flex items-center gap-2">
        <Microscope size={20} className="text-[var(--blue-info)]" /> {t(' Auditoría por semilla')}
      </h2>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        {t('Re-simula un partido jugado con su semilla determinista (matchId×1337) en modo auditoría: no modifica marcador, clasificación, economía ni estadísticas.')}
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="admin-audit-match-id" className="block text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>{t('ID del partido')}</label>
          <input
            id="admin-audit-match-id"
            type="number" min={1} value={matchId} placeholder="88"
            onChange={(e) => setMatchId(e.target.value)}
            className="w-28 px-2 py-1.5 bg-[var(--bg-base)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--green-primary)]"
          />
        </div>
        <div className="flex-1 min-w-48">
          <label htmlFor="admin-audit-reason" className="block text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>{t('Motivo (auditoría, opcional)')}</label>
          <input
            id="admin-audit-reason"
            type="text" value={reason} placeholder="p. ej. verificación semilla F25"
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-2 py-1.5 bg-[var(--bg-base)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--green-primary)]"
          />
        </div>
        <Button
          onClick={() => onConfirm({
            title: t('Re-simular en modo auditoría'),
            body: t('Se re-simulará el partido #') + (matchId || '?') + t(' con su semilla determinista. No se modifica ningún dato persistido. La acción queda registrada en AdminAction.'),
            confirmLabel: t('Re-simular'),
            onConfirm: runAudit,
          })}
          disabled={busy || !matchId}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Microscope size={14} />} {t(' Auditar')}
        </Button>
      </div>

      {result && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-[var(--bg-base)] p-3 rounded-lg border border-[var(--border-color)]">
            <p className="text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>{t('Persistido')}</p>
            <p className="text-xl font-bold font-mono text-[var(--text-primary)]">
              {result.persisted.homeGoals ?? '—'} - {result.persisted.awayGoals ?? '—'}
            </p>
            <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{t('seed ')}{result.persisted.seed ?? '—'}</p>
          </div>
          <div className="bg-[var(--bg-base)] p-3 rounded-lg border border-[var(--border-color)]">
            <p className="text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>{t('Re-simulado')}</p>
            <p className="text-xl font-bold font-mono text-[var(--text-primary)]">
              {result.resimulated.homeGoals} - {result.resimulated.awayGoals}
            </p>
            <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{t('seed ')}{result.seed}</p>
          </div>
          <div
            className="p-3 rounded-lg border flex flex-col items-center justify-center"
            style={{
              borderColor: result.reproducesPersistedScore ? 'color-mix(in srgb,var(--green-primary) 40%,transparent)' : 'color-mix(in srgb,var(--red-danger) 40%,transparent)',
              background: result.reproducesPersistedScore ? 'color-mix(in srgb,var(--green-primary) 8%,transparent)' : 'color-mix(in srgb,var(--red-danger) 8%,transparent)',
            }}
          >
            <p className="text-lg font-bold" style={{ color: result.reproducesPersistedScore ? 'var(--green-primary)' : 'var(--red-danger)' }}>
              {result.reproducesPersistedScore ? '✓ REPRODUCE' : '✗ NO COINCIDE'}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t('AdminAction #')}{result.adminActionId}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
