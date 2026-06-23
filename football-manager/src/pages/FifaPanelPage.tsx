// ─── Panel FIFA — policía del juego ───────────────────────────────────────────
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Modal } from '../components/ui/Modal';
import { SectionHeader } from '../components/ui/SectionHeader';
import { DataTable } from '../components/ui/DataTable';
import type { Column } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { fifaApi } from '../api/governance';
import type { AnticheatAlert, ChatMessageRow, ForumPostRow } from '../api/governance';

// ─── Alert type badge ─────────────────────────────────────────────────────────

function AlertTypeBadge({ type }: { type: string }) {
  const variant =
    type === 'MULTIACCOUNT'       ? 'danger' as const :
    type === 'SUSPICIOUS_TRANSFER' ? 'warning' as const :
    'info' as const;
  return <Badge variant={variant} block>{type}</Badge>;
}

// ─── Confirmación v2 (B13): sustituye a window.confirm ───────────────────────
interface ConfirmState { title: string; body: ReactNode; confirmLabel?: string; onConfirm: () => void }

function ConfirmDialog({ confirm, onClose }: { confirm: ConfirmState | null; onClose: () => void }) {
  const { t } = useTranslation('common');
  if (!confirm) return null;
  return (
    <Modal open onClose={onClose} title={confirm.title} width={420}>
      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{confirm.body}</div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="ghost" size="sm" onClick={onClose}>{t('Cancelar')}</Button>
        <Button variant="danger" size="sm" onClick={() => { const fn = confirm.onConfirm; onClose(); fn(); }}>
          {confirm.confirmLabel ?? t('Confirmar')}
        </Button>
      </div>
    </Modal>
  );
}

// ─── Alerts Panel ─────────────────────────────────────────────────────────────

function AlertsPanel() {
  const { t } = useTranslation('common');
  const [alerts, setAlerts]   = useState<AnticheatAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState<Set<number>>(new Set());

  const load = useCallback(() => {
    fifaApi.getAlerts()
      .then(setAlerts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleResolve = async (id: number) => {
    setBusy(b => new Set(b).add(id));
    try {
      await fifaApi.resolveAlert(id);
      setAlerts(a => a.filter(x => x.id !== id));
      toast.success(t('Alerta resuelta'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('No se pudo resolver la alerta'));
    } finally {
      setBusy(b => { const n = new Set(b); n.delete(id); return n; });
    }
  };

  const columns: Column<AnticheatAlert>[] = [
    {
      key: 'id',
      header: '#',
      render: r => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 11 }}>{r.id}</span>,
      width: 'w-10',
    },
    { key: 'type', header: 'Tipo', render: r => <AlertTypeBadge type={r.type} /> },
    {
      key: 'user',
      header: 'Usuario',
      render: r => r.user
        ? <span style={{ fontFamily: 'var(--font-mono)' }}>{r.user.username}</span>
        : <span style={{ color: 'var(--text-muted)' }}>—</span>,
    },
    {
      key: 'ip',
      header: 'IP',
      render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.ip ?? '—'}</span>,
    },
    {
      key: 'details',
      header: 'Detalles',
      render: r => (
        <span className="text-xs truncate max-w-[200px] block" style={{ color: 'var(--text-secondary)' }}>
          {r.details}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Fecha',
      render: r => <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(r.createdAt).toLocaleDateString('es-ES')}</span>,
    },
    {
      key: 'action',
      header: t('Acción'),
      render: r => (
        <Button size="sm" variant="secondary" disabled={busy.has(r.id)} onClick={() => handleResolve(r.id)}>
          {busy.has(r.id) ? '...' : t('Resolver')}
        </Button>
      ),
    },
  ];

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('Cargando alertas...')}</p>;

  return (
    <DataTable
      columns={columns}
      rows={alerts}
      rowKey={r => r.id}
      empty={<span style={{ color: 'var(--green-primary)' }}>{t('Sin alertas pendientes.')}</span>}
    />
  );
}

// ─── Chat Moderation Panel ────────────────────────────────────────────────────

function ChatModerationPanel({ onConfirm }: { onConfirm: (c: ConfirmState) => void }) {
  const { t } = useTranslation('common');
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [busy, setBusy]         = useState<Set<number>>(new Set());

  const load = useCallback(() => {
    fifaApi.getChatMessages(50)
      .then(setMessages)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    setBusy(b => new Set(b).add(id));
    try {
      await fifaApi.deleteChatMessage(id);
      setMessages(m => m.filter(x => x.id !== id));
      toast.success(t('Mensaje eliminado'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('No se pudo eliminar el mensaje'));
    } finally {
      setBusy(b => { const n = new Set(b); n.delete(id); return n; });
    }
  };

  const columns: Column<ChatMessageRow>[] = [
    {
      key: 'channel',
      header: 'Canal',
      render: r => <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.channel.name}</span>,
    },
    {
      key: 'author',
      header: 'Autor ID',
      render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.authorId}</span>,
    },
    {
      key: 'text',
      header: 'Mensaje',
      render: r => (
        <span className="text-xs truncate max-w-[280px] block" style={{ color: 'var(--text-primary)' }}>
          {r.text}
        </span>
      ),
    },
    {
      key: 'ts',
      header: 'Fecha',
      render: r => <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(r.timestamp).toLocaleString('es-ES')}</span>,
    },
    {
      key: 'action',
      header: '',
      render: r => (
        <Button size="sm" variant="danger" disabled={busy.has(r.id)} onClick={() => onConfirm({
          title: t('Eliminar mensaje de chat'),
          body: <>{t('Se eliminará el mensaje')} «{r.text.slice(0, 80)}». {t('Esta acción no se puede deshacer.')}</>,
          confirmLabel: t('Eliminar'),
          onConfirm: () => handleDelete(r.id),
        })}>
          {busy.has(r.id) ? '...' : t('Eliminar')}
        </Button>
      ),
    },
  ];

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('Cargando mensajes...')}</p>;

  return (
    <DataTable
      columns={columns}
      rows={messages}
      rowKey={r => r.id}
      empty={t('Sin mensajes recientes.')}
    />
  );
}

// ─── Forum Moderation Panel ────────────────────────────────────────────────────

function ForumModerationPanel({ onConfirm }: { onConfirm: (c: ConfirmState) => void }) {
  const { t } = useTranslation('common');
  const [posts, setPosts]     = useState<ForumPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState<Set<number>>(new Set());

  const load = useCallback(() => {
    fifaApi.getForumPosts(50)
      .then(setPosts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    setBusy(b => new Set(b).add(id));
    try {
      await fifaApi.deleteForumPost(id);
      setPosts(p => p.filter(x => x.id !== id));
      toast.success(t('Post eliminado'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('No se pudo eliminar el post'));
    } finally {
      setBusy(b => { const n = new Set(b); n.delete(id); return n; });
    }
  };

  const columns: Column<ForumPostRow>[] = [
    {
      key: 'thread',
      header: 'Hilo',
      render: r => (
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          [{r.thread.category}] {r.thread.title}
        </span>
      ),
    },
    {
      key: 'author',
      header: 'Autor ID',
      render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.authorId}</span>,
    },
    {
      key: 'text',
      header: 'Mensaje',
      render: r => (
        <span className="text-xs truncate max-w-[280px] block" style={{ color: 'var(--text-primary)' }}>
          {r.text}
        </span>
      ),
    },
    {
      key: 'action',
      header: '',
      render: r => (
        <Button size="sm" variant="danger" disabled={busy.has(r.id)} onClick={() => onConfirm({
          title: t('Eliminar post del foro'),
          body: <>{t('Se eliminará el post')} «{r.text.slice(0, 80)}» {t('del hilo')} [{r.thread.category}] {r.thread.title}.</>,
          confirmLabel: t('Eliminar'),
          onConfirm: () => handleDelete(r.id),
        })}>
          {busy.has(r.id) ? '...' : t('Eliminar')}
        </Button>
      ),
    },
  ];

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('Cargando posts...')}</p>;

  return (
    <DataTable
      columns={columns}
      rows={posts}
      rowKey={r => r.id}
      empty={t('Sin posts recientes.')}
    />
  );
}

// ─── Sanction Form ─────────────────────────────────────────────────────────────

function SanctionForm({ onConfirm }: { onConfirm: (c: ConfirmState) => void }) {
  const { t } = useTranslation('common');
  const [managerId, setManagerId]         = useState('');
  const [reason, setReason]               = useState('');
  const [budgetPenalty, setBudgetPenalty] = useState('');
  const [suspendTurns, setSuspendTurns]   = useState('');
  const [busy, setBusy]                   = useState(false);

  const apply = async () => {
    setBusy(true);
    try {
      await fifaApi.sanction({
        managerId: Number(managerId),
        reason,
        budgetPenalty: budgetPenalty ? Number(budgetPenalty) : undefined,
        suspendTurns:  suspendTurns  ? Number(suspendTurns)  : undefined,
      });
      toast.success(t('Sanción aplicada correctamente'));
      setManagerId(''); setReason(''); setBudgetPenalty(''); setSuspendTurns('');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('No se pudo aplicar la sanción'));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!managerId || !reason) return;
    onConfirm({
      title: t('Aplicar sanción'),
      body: <>{t('Se sancionará al mánager #')}{managerId}{budgetPenalty ? <> {t('con multa de')} {Number(budgetPenalty).toLocaleString('es-ES')} €</> : null}{suspendTurns ? <> {t('y suspensión de')} {suspendTurns} {t('turno(s)')}</> : null}. {t('Motivo:')} «{reason}».</>,
      confirmLabel: t('Sancionar'),
      onConfirm: apply,
    });
  };

  const inputStyle = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 12,
    width: '100%',
  } as React.CSSProperties;

  const labelStyle = {
    display: 'block',
    fontSize: 11,
    color: 'var(--text-muted)',
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.07em',
    fontFamily: 'var(--font-mono)',
  } as React.CSSProperties;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label style={labelStyle}>{t('Manager ID')} *</label>
          <input style={inputStyle} type="number" value={managerId} onChange={e => setManagerId(e.target.value)} required placeholder={t('Ej: 3')} />
        </div>
        <div>
          <label style={labelStyle}>{t('Penalización presupuesto (€)')}</label>
          <input style={inputStyle} type="number" value={budgetPenalty} onChange={e => setBudgetPenalty(e.target.value)} placeholder={t('Ej: 500000')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label style={labelStyle}>{t('Suspender N turnos')}</label>
          <input style={inputStyle} type="number" value={suspendTurns} onChange={e => setSuspendTurns(e.target.value)} placeholder={t('Ej: 3')} />
        </div>
      </div>
      <div>
        <label style={labelStyle}>{t('Razón / Descripción')} *</label>
        <textarea
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          value={reason}
          onChange={e => setReason(e.target.value)}
          required
          placeholder={t('Describe la infracción...')}
        />
      </div>
      <div className="flex items-center gap-4">
        <Button type="submit" variant="danger" size="sm" disabled={busy || !managerId || !reason}>
          {busy ? t('Sancionando...') : t('Aplicar sanción')}
        </Button>
      </div>
    </form>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'alerts' | 'chat' | 'forum' | 'sanction';

export function FifaPanelPage() {
  const { t } = useTranslation('common');
  const [tab, setTab] = useState<Tab>('alerts');
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'alerts',  label: t('Alertas antitrampas') },
    { key: 'chat',    label: t('Chat') },
    { key: 'forum',   label: t('Foro') },
    { key: 'sanction', label: t('Sancionar') },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold tracking-wider uppercase"
          style={{ color: 'var(--blue-info)', fontFamily: 'var(--font-display)' }}
        >
          {t('Panel Agentes FIFA')}
        </h1>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('Moderación, antitrampas y sanciones. Requiere rol')} <code style={{ color: 'var(--blue-info)' }}>{t('agente_fifa')}</code> {t('o superior.')}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-2">
        {tabs.map(tabItem => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className="px-4 py-1.5 text-xs font-semibold uppercase rounded transition-all"
            style={{
              backgroundColor: tab === tabItem.key ? 'var(--blue-info)' : 'var(--bg-elevated)',
              color: tab === tabItem.key ? 'black' : 'var(--text-muted)',
              border: '1px solid var(--border-color)',
              letterSpacing: '0.08em',
              cursor: 'pointer',
            }}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'alerts' && (
        <SectionHeader title={t('Cola de alertas anticheat')} flush>
          <div className="p-4"><AlertsPanel /></div>
        </SectionHeader>
      )}
      {tab === 'chat' && (
        <SectionHeader title={t('Moderación de Chat')} flush>
          <div className="p-4"><ChatModerationPanel onConfirm={setConfirm} /></div>
        </SectionHeader>
      )}
      {tab === 'forum' && (
        <SectionHeader title={t('Moderación de Foro')} flush>
          <div className="p-4"><ForumModerationPanel onConfirm={setConfirm} /></div>
        </SectionHeader>
      )}
      {tab === 'sanction' && (
        <SectionHeader title={t('Emitir sanción a un mánager')}>
          <SanctionForm onConfirm={setConfirm} />
        </SectionHeader>
      )}
    </div>
  );
}
