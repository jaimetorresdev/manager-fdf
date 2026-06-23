// ─── Panel Master — control total ────────────────────────────────────────────
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Modal } from '../components/ui/Modal';
import { SectionHeader } from '../components/ui/SectionHeader';
import { DataTable } from '../components/ui/DataTable';
import type { Column } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { masterApi } from '../api/governance';
import type { GlobalSettings, UserRow } from '../api/governance';
import { setToken } from '../api/client';

// ─── Role Badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const variants: Record<string, 'danger' | 'warning' | 'info' | 'success' | 'neutral'> = {
    master:      'danger',
    admin:       'warning',
    agente_fifa: 'info',
    manager:     'neutral',
  };
  return <Badge variant={variants[role] ?? 'neutral'} block>{role}</Badge>;
}

// ─── Confirmación v2 (B13): sustituye a window.confirm ───────────────────────
interface ConfirmState { title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void }

function ConfirmDialog({ confirm, onClose }: { confirm: ConfirmState | null; onClose: () => void }) {
  const { t } = useTranslation('common');
  if (!confirm) return null;
  return (
    <Modal open onClose={onClose} title={confirm.title} width={440}>
      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{confirm.body}</div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="ghost" size="sm" onClick={onClose}>{t('Cancelar')}</Button>
        <Button variant={confirm.danger ? 'danger' : 'primary'} size="sm" onClick={() => { const fn = confirm.onConfirm; onClose(); fn(); }}>
          {confirm.confirmLabel ?? t('Confirmar')}
        </Button>
      </div>
    </Modal>
  );
}

// ─── Settings Form ─────────────────────────────────────────────────────────────

function SettingsPanel({ onConfirm }: { onConfirm: (c: ConfirmState) => void }) {
  const { t } = useTranslation('common');
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [draft, setDraft]       = useState<GlobalSettings | null>(null);
  const [saving, setSaving]     = useState(false);

  const load = useCallback(() => {
    masterApi.getSettings().then(s => { setSettings(s); setDraft(s); }).catch(() => toast.error(t('No se pudieron cargar los ajustes')));
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const doSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await masterApi.saveSettings(draft);
      setSettings(saved);
      toast.success(t('Ajustes guardados'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('No se pudieron guardar los ajustes'));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!draft) return;
    if (draft.MAINTENANCE_MODE && !settings?.MAINTENANCE_MODE) {
      onConfirm({
        title: t('Activar modo mantenimiento'),
        body: t('Los usuarios NO podrán acceder al juego mientras esté activo. ¿Guardar con mantenimiento activado?'),
        confirmLabel: t('Activar y guardar'),
        danger: true,
        onConfirm: doSave,
      });
      return;
    }
    doSave();
  };

  if (!draft) return <p style={{ color: 'var(--text-muted)' }}>{t('Cargando ajustes...')}</p>;

  const field = (
    label: string,
    key: keyof GlobalSettings,
    type: 'text' | 'number' | 'checkbox' = 'text'
  ) => (
    <div key={key} className="flex items-center gap-3 mb-3">
      <label htmlFor={`setting-${key}`} className="w-56 text-xs font-semibold" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
        {label}
      </label>
      {type === 'checkbox' ? (
        <input
          id={`setting-${key}`}
          type="checkbox"
          checked={Boolean(draft[key])}
          onChange={e => setDraft({ ...draft, [key]: e.target.checked })}
          className="w-4 h-4 accent-[var(--green-primary)]"
        />
      ) : (
        <input
          id={`setting-${key}`}
          type={type}
          value={String(draft[key])}
          step={type === 'number' ? '0.1' : undefined}
          onChange={e => {
            const val = e.target.value;
            setDraft({
              ...draft,
              [key]: type === 'number' ? (val === '' ? 0 : Number.isNaN(parseFloat(val)) ? 0 : parseFloat(val)) : val,
            });
          }}
          className="flex-1 px-2 py-1 rounded text-xs"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
          }}
        />
      )}
    </div>
  );

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-bold mb-3 uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
            {t('Horarios de turno (cron)')}
          </p>
          {field('TICK_CRON_T1', 'TICK_CRON_T1')}
          {field('TICK_CRON_T2', 'TICK_CRON_T2')}
        </div>
        <div>
          <p className="text-xs font-bold mb-3 uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
            {t('Multiplicadores económicos')}
          </p>
          {field(t('Ingresos (mult)'), 'ECONOMY_INCOME_MULT', 'number')}
          {field(t('Salarios (mult)'), 'ECONOMY_SALARY_MULT', 'number')}
          {field(t('Traspasos (mult)'), 'ECONOMY_TRANSFER_MULT', 'number')}
        </div>
        <div>
          <p className="text-xs font-bold mb-3 uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
            {t('Feature flags')}
          </p>
          {field(t('Chat habilitado'), 'FEATURE_CHAT', 'checkbox')}
          {field(t('Mercado habilitado'), 'FEATURE_MARKET', 'checkbox')}
          {field(t('Amistosos habilitados'), 'FEATURE_FRIENDLIES', 'checkbox')}
          {field(t('Modo mantenimiento'), 'MAINTENANCE_MODE', 'checkbox')}
        </div>
      </div>
      <div className="flex items-center gap-4 mt-4">
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? t('Guardando...') : t('Guardar ajustes')}
        </Button>
      </div>
      {settings?.MAINTENANCE_MODE && (
        <div className="mt-3 px-3 py-2 rounded text-xs font-bold" style={{ background: 'color-mix(in srgb, var(--red-danger) 12%, transparent)', color: 'var(--red-danger)', border: '1px solid color-mix(in srgb, var(--red-danger) 30%, transparent)' }}>
          {t('MODO MANTENIMIENTO ACTIVO — Los usuarios no pueden acceder al juego.')}
        </div>
      )}
    </div>
  );
}

// ─── Users Table ────────────────────────────────────────────────────────────────

const ROLES = ['manager', 'agente_fifa', 'admin', 'master'] as const;

function UsersPanel({ onConfirm }: { onConfirm: (c: ConfirmState) => void }) {
  const { t } = useTranslation('common');
  const [users, setUsers]         = useState<UserRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [pending, setPending]     = useState<Record<number, string>>({});

  const load = useCallback(() => {
    masterApi.listUsers()
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const doRoleChange = async (userId: number, role: string) => {
    try {
      await masterApi.setRole(userId, role);
      setUsers(u => u.map(x => x.id === userId ? { ...x, role } : x));
      toast.success(t('Rol actualizado a') + ' ' + role);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('No se pudo cambiar el rol'));
    }
  };

  const handleRoleChange = (row: UserRow, role: string) => {
    onConfirm({
      title: t('Cambiar rol de usuario'),
      body: <>{t('Se cambiará el rol de')} <b>{row.username}</b> {t('de')} «{row.role}» {t('a')} «{role}».{role === 'master' ? ' ⚠ ' + t('MASTER tiene control total de la aplicación.') : ''}</>,
      confirmLabel: t('Asignar rol'),
      danger: role === 'master' || role === 'admin',
      onConfirm: () => doRoleChange(row.id, role),
    });
  };

  const handleImpersonate = (row: UserRow) => {
    onConfirm({
      title: t('Suplantar usuario'),
      body: <>{t('Tu sesión pasará a ser la de')} <b>{row.username}</b> ({row.role}). {t('Tendrás que volver a iniciar sesión para recuperar tu cuenta.')}</>,
      confirmLabel: t('Suplantar'),
      danger: true,
      onConfirm: async () => {
        try {
          const res = await masterApi.impersonate(row.id);
          setToken(res.token);
          toast.success(t('Suplantando a') + ` ${res.impersonating.username} (${res.impersonating.role}). ` + t('Recarga para aplicar.'));
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : t('No se pudo suplantar'));
        }
      },
    });
  };

  const columns: Column<UserRow>[] = [
    {
      key: 'user',
      header: t('Usuario'),
      render: row => (
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{row.username}</span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: row => <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.email}</span>,
    },
    {
      key: 'club',
      header: t('Club'),
      render: row => row.manager?.club
        ? <span className="text-xs">{row.manager.club.badge} {row.manager.club.shortName}</span>
        : <span style={{ color: 'var(--text-muted)' }}>—</span>,
    },
    {
      key: 'role',
      header: t('Rol'),
      render: row => <RoleBadge role={row.role} />,
    },
    {
      key: 'actions',
      header: t('Cambiar rol'),
      render: row => (
        <div className="flex items-center gap-2">
          <select
            value={pending[row.id] ?? row.role}
            onChange={e => setPending(p => ({ ...p, [row.id]: e.target.value }))}
            className="text-xs px-1 py-0.5 rounded"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
          >
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <Button
            size="sm"
            variant="secondary"
            disabled={!pending[row.id] || pending[row.id] === row.role}
            onClick={() => handleRoleChange(row, pending[row.id] ?? row.role)}
          >
            {t('Asignar')}
          </Button>
        </div>
      ),
    },
    {
      key: 'impersonate',
      header: t('Suplantar'),
      render: row => (
        <Button size="sm" variant="ghost" onClick={() => handleImpersonate(row)}>
          {t('Suplantar')}
        </Button>
      ),
    },
  ];

  return (
    <div>
      {loading
        ? <p style={{ color: 'var(--text-muted)' }}>{t('Cargando usuarios...')}</p>
        : (
          <DataTable
            columns={columns}
            rows={users}
            rowKey={r => r.id}
            empty={t('No hay usuarios.')}
          />
        )
      }
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'settings' | 'users';

export function MasterPanelPage() {
  const { t } = useTranslation('common');
  const [tab, setTab] = useState<Tab>('settings');
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold tracking-wider uppercase"
          style={{ color: 'var(--gold-accent)', fontFamily: 'var(--font-display)' }}
        >
          {t('Panel Master')}
        </h1>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('Control total de la aplicación. Solo visible para el rol')} <code style={{ color: 'var(--gold-accent)' }}>{t('master')}</code>{'.'}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2">
        {(['settings', 'users'] as Tab[]).map(tabKey => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className="px-4 py-1.5 text-xs font-semibold uppercase rounded transition-all"
            style={{
              background: tab === tabKey ? 'var(--gold-accent)' : 'var(--bg-elevated)',
              color: tab === tabKey ? 'var(--bg-base)' : 'var(--text-muted)',
              border: '1px solid var(--border-color)',
              letterSpacing: '0.08em',
              cursor: 'pointer',
            }}
          >
            {tabKey === 'settings' ? t('Ajustes globales') : t('Usuarios & Roles')}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'settings' && (
        <SectionHeader title={t('Ajustes globales del servidor')}>
          <SettingsPanel onConfirm={setConfirm} />
        </SectionHeader>
      )}
      {tab === 'users' && (
        <SectionHeader title={t('Gestión de usuarios y roles')} flush>
          <div className="p-4">
            <UsersPanel onConfirm={setConfirm} />
          </div>
        </SectionHeader>
      )}
    </div>
  );
}
