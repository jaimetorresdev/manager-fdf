// ─── Cuerpo Técnico (Staff) · identidad v2 elevada (E17 LOTE B) ────────────────
// Plantel técnico como tarjetas (rol/nivel/salario/especialidad-efecto) con
// despido en dos pasos, toggle tarjetas↔tabla y contratación con comparativa de
// salario frente a la media del plantel actual.
// Lógica de datos intacta: staffApi.get / hire / fire.
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Briefcase, Wallet, Layers, LayoutGrid, TableProperties, TrendingUp, TrendingDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../lib/cn';
import { staffApi } from '../api/client';
import { KPICard, SortableTable, Skeleton, Button, EmptyState, SectionHeader, ConfirmModal, type SortCol } from '../components/ui';
import { StaffPyramid} from '../components/staff/StaffPyramid';

interface StaffMember {
  id: number;
  name: string;
  role: string;
  roleLabel: string;
  salary: number;
  level: number;
  specialty: string;
}

interface Candidate {
  role: string;
  roleLabel: string;
  name: string;
  level: number;
  specialty: string;
  salary: number;
  signingFee: number;
}

const STF_CSS = `
.stf-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.stf-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.stf-select{flex:1;min-width:200px;background:var(--bg-elevated);border:1px solid var(--border-color);
  border-radius:0.5rem;padding:8px 12px;color:var(--text-primary);font-size:.84rem;outline:none}
.stf-select:focus{border-color:var(--green-primary)}
.stf-cands{background:var(--bg-surface);border:1px solid var(--border-color);border-radius:0.75rem;padding:16px;box-shadow:0 4px 12px rgba(0,0,0,0.02);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
.stf-pt{display:flex;align-items:center;gap:6px;font-family:var(--font-display);font-weight:700;font-size:.9rem;
  color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
.stf-cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.stf-cand{position:relative;overflow:hidden;background:var(--bg-elevated);border:1px solid var(--border-color);
  border-radius:0.75rem;padding:12px;display:flex;flex-direction:column;gap:8px;box-shadow:0 2px 8px rgba(0,0,0,0.02);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
.stf-cand::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--gold-accent)}
.stf-cn{font-family:var(--font-display);font-weight:700;font-size:.92rem;color:var(--text-primary)}
.stf-cr{font-size:.74rem;color:var(--text-muted)}
.stf-money{font-family:var(--font-sans);font-size:.76rem}
.stf-money b{color:var(--gold-accent)}
.stf-money i{color:var(--red-danger);font-style:normal}
.stf-name{font-weight:700;color:var(--text-primary)}
.stf-spec{font-size:.7rem;color:var(--text-muted)}
.stf-mono{font-family:var(--font-sans)}
.stf-fire{background:none;border:none;padding:0;display:inline-flex;align-items:center;gap:4px;cursor:pointer;
  color:var(--red-danger);font-size:.76rem;font-weight:600}
.stf-fire:hover{color:#FF5774}
.stf-confirm{display:inline-flex;gap:8px;align-items:center;font-size:.74rem;font-weight:700}
.stf-confirm button{background:none;border:none;padding:0;cursor:pointer;font:inherit}
.stf-confirm .yes{color:var(--red-danger)}
.stf-confirm .yes:hover{text-decoration:underline}
.stf-confirm .no{color:var(--text-muted)}
.stf-confirm .no:hover{text-decoration:underline}
.stf-lock{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted)}
.stf-view{display:inline-flex;gap:2px;background:var(--bg-base);border:1px solid var(--border-color);
  border-radius:0.5rem;padding:3px}
.stf-view button{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:4px;border:1px solid transparent;
  background:none;color:var(--text-muted);cursor:pointer;font-size:.72rem;font-weight:700;text-transform:uppercase;
  letter-spacing:.6px;font-family:var(--font-display);transition:all 150ms ease}
.stf-view button:hover{color:var(--text-primary)}
.stf-view button.on{background:var(--bg-elevated);color:var(--green-primary);
  border-color:color-mix(in srgb,var(--green-primary) 34%,var(--border-color));box-shadow:0 2px 4px rgba(0,0,0,0.05)}
.stf-mgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.stf-mcard{position:relative;overflow:hidden;background:var(--bg-surface);border:1px solid var(--border-color);
  border-radius:0.75rem;padding:14px;display:flex;flex-direction:column;gap:8px;
  box-shadow:0 4px 12px rgba(0,0,0,0.03);transition:border-color 200ms ease,transform 200ms ease,box-shadow 200ms ease;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
.stf-mcard:hover{border-color:color-mix(in srgb,var(--green-primary) 36%,var(--border-color));transform:translateY(-1px);box-shadow:0 6px 16px rgba(0,0,0,0.06)}
.stf-mcard::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--green-primary)}
.stf-mrole{font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--text-muted)}
.stf-mname{font-family:var(--font-display);font-weight:700;font-size:1rem;color:var(--text-primary)}
.stf-cmp{display:inline-flex;align-items:center;gap:4px;font-family:var(--font-sans);font-size:.66rem}
.stf-cmp.up{color:var(--red-danger)}
.stf-cmp.down{color:var(--green-primary)}
@media(max-width:760px){.stf-kpis{grid-template-columns:1fr}}
@media (prefers-reduced-motion: reduce){.stf-mcard,.stf-mcard:hover{transform:none;box-shadow:none}}
`;

function LevelBar({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5" title={`Nivel ${level}/5`} style={{ justifyContent: 'center' }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={cn('w-1.5 h-1.5', i < level ? 'bg-[var(--green-primary)]' : 'bg-[var(--text-muted)]')}
          style={{ borderRadius: 2, boxShadow: i < level ? '0 2px 4px rgba(0,0,0,0.1)' : undefined }} />
      ))}
    </div>
  );
}

export function StaffPage() {
  const { t } = useTranslation();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [showCandidates, setShowCandidates] = useState(false);
  const [filterRole, setFilterRole] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const fetchStaff = () => {
    setLoading(true);
    setLoadError(null);
    staffApi.get()
      .then((data) => {
        setStaff(data?.members || []);
        setCandidates(data?.candidates || []);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : t('gameplay:staff.loadError');
        setLoadError(msg);
        toast.error(msg);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStaff();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalSalary = staff.reduce((acc, s) => acc + (s?.salary ?? 0), 0);
  const avgSalary = staff.length > 0 ? totalSalary / staff.length : 0;
  const roles = Array.from(new Set(staff.map(s => s.roleLabel)));
  const filteredStaff = filterRole ? staff.filter(s => s.roleLabel === filterRole) : staff;

  const handleHire = async (candidate: Candidate) => {
    try {
      await staffApi.hire({
        role: candidate.role,
        level: candidate.level,
        name: candidate.name,
        salary: candidate.salary,
        specialty: candidate.specialty,
      });
      toast.success(t('gameplay:staff.hireSuccess', { name: candidate.name }));
      fetchStaff();
      setShowCandidates(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('gameplay:staff.hireError'));
    }
  };

  const handleFire = async (id: number) => {
    try {
      await staffApi.fire(id);
      toast.success(t('gameplay:staff.fireSuccess'));
      fetchStaff();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('gameplay:staff.fireError'));
    } finally {
      setConfirmDelete(null);
    }
  };

  const staffCols: SortCol<StaffMember>[] = [
    {
      key: 'name', header: t('gameplay:staff.table.name'),
      render: m => (
        <div>
          <div className="stf-name">{m?.name ?? '—'}</div>
          <div className="stf-spec">{m?.specialty ?? ''}</div>
        </div>
      ),
      sortValue: m => m?.name ?? '',
    },
    {
      key: 'role', header: t('gameplay:staff.table.role'),
      render: m => <span style={{ color: 'var(--text-muted)' }}>{m?.roleLabel ?? m?.role ?? '—'}</span>,
      sortValue: m => m?.roleLabel ?? '',
    },
    {
      key: 'level', header: t('gameplay:staff.table.level'), align: 'center',
      render: m => <LevelBar level={m?.level ?? 0} />,
      sortValue: m => m?.level ?? 0,
    },
    {
      key: 'salary', header: t('gameplay:staff.table.salary'), align: 'right',
      render: m => <b className="stf-mono" style={{ color: 'var(--gold-accent)' }}>{(m?.salary ?? 0).toLocaleString()} €</b>,
      sortValue: m => m?.salary ?? 0,
    },
    {
      key: 'actions', header: t('gameplay:staff.table.actions'), align: 'right',
      render: m => m.role === 'manager' ? (
        <span className="stf-lock">{t('gameplay:staff.essential')}</span>
      ) : (
        <button className="stf-fire" onClick={() => setConfirmDelete(m.id)}>
          <Trash2 size={13} /> {t('gameplay:staff.fireAction')}
        </button>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Skeleton height={64} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {[0, 1, 2].map(i => <Skeleton key={i} height={92} />)}
        </div>
        <Skeleton height={240} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page-surface section-panel p-8">
        <EmptyState
          title={t('gameplay:staff.loadError')}
          hint={loadError}
          action={<Button variant="secondary" onClick={fetchStaff}>{t('gameplay:staff.retry')}</Button>}
        />
      </div>
    );
  }

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{STF_CSS}</style>

      {/* Header */}
      <div>
        <p className="muted-label">{t('gameplay:staff.kicker')}</p>
        <h1 className="section-title text-3xl">{t('gameplay:staff.title')}</h1>
      </div>

      {/* KPIs & Pirámide */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="stf-kpis" style={{ display: 'flex', flexDirection: 'column' }}>
          <KPICard label={t('gameplay:staff.kpis.total')} value={staff.length} tone="green" icon={<Briefcase size={16} />} />
          <KPICard label={t('gameplay:staff.kpis.payroll')} value={`${(totalSalary / 1000).toFixed(1)}K €`} tone="gold" icon={<Wallet size={16} />} />
          <KPICard label={t('gameplay:staff.kpis.roles')} value={roles.length} tone="blue" icon={<Layers size={16} />} />
        </div>
        <div className="section-panel" style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <SectionHeader title={t('gameplay:staff.structureTitle')} icon={<Layers size={14} />} />
          <StaffPyramid 
            total={staff.length}
            levels={[
              { id: 'manager', label: t('gameplay:staff.pyramid.manager'), count: staff.filter(s => s.role === 'manager' || s.role === 'sportingDirector' || s.roleLabel?.toLowerCase().includes('director') || s.roleLabel?.toLowerCase().includes('manager')).length, color: 'var(--red-danger)' },
              { id: 'coach', label: t('gameplay:staff.pyramid.coach'), count: staff.filter(s => s.role === 'coach' || s.role === 'tacticalAnalyst' || s.role === 'goalkeepingCoach' || s.roleLabel?.toLowerCase().includes('entrenador') || s.roleLabel?.toLowerCase().includes('analista')).length, color: 'var(--gold-accent)' },
              { id: 'scout', label: t('gameplay:staff.pyramid.scout'), count: staff.filter(s => s.role === 'scout' || s.roleLabel?.toLowerCase().includes('ojeador')).length, color: 'var(--blue-info)' },
              { id: 'physio', label: t('gameplay:staff.pyramid.physio'), count: staff.filter(s => s.role === 'physio' || s.role === 'fitnessCoach' || s.role === 'doctor' || s.role === 'nutritionist' || s.roleLabel?.toLowerCase().includes('fisio') || s.roleLabel?.toLowerCase().includes('médico') || s.roleLabel?.toLowerCase().includes('nutri')).length, color: 'var(--green-primary)' }
            ].filter(l => l.count > 0)}
          />
        </div>
      </div>

      {/* Filter & Actions */}
      <div className="stf-bar">
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="stf-select"
        >
          <option value="">{t('gameplay:staff.filterRole')}</option>
          {roles.map(role => (
            <option key={role} value={role}>{role}</option>
          ))}
        </select>
        <div className="stf-view" role="tablist" aria-label={t('gameplay:staff.viewMode')}>
          <button className={viewMode === 'cards' ? 'on' : ''} onClick={() => setViewMode('cards')}>
            <LayoutGrid size={13} /> {t('gameplay:staff.viewCards')}
          </button>
          <button className={viewMode === 'table' ? 'on' : ''} onClick={() => setViewMode('table')}>
            <TableProperties size={13} /> {t('gameplay:staff.viewTable')}
          </button>
        </div>
        <Button onClick={() => setShowCandidates(!showCandidates)}>
          <Plus size={16} />
          {showCandidates ? t('gameplay:staff.hideCandidates') : t('gameplay:staff.hireStaff')}
        </Button>
      </div>

      {/* Candidates Section */}
      {showCandidates && (
        <div className="stf-cands">
          <div className="stf-pt"><Plus size={14} /> {t('gameplay:staff.candidatesTitle')}</div>
          {candidates.length === 0 ? (
            <p style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>{t('gameplay:staff.noCandidates')}</p>
          ) : (
            <div className="stf-cgrid">
              {candidates.map(cand => (
                <div key={cand.role} className="stf-cand">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div>
                      <div className="stf-cn">{cand?.name ?? '—'}</div>
                      <div className="stf-cr">{cand?.roleLabel ?? cand?.role}</div>
                    </div>
                    <LevelBar level={cand?.level ?? 0} />
                  </div>
                  <div className="stf-money">{t('gameplay:staff.salary')} <b>{t('gameplay:staff.salaryPerMonth', { amount: (cand?.salary ?? 0).toLocaleString() })}</b></div>
                  <div className="stf-money">{t('gameplay:staff.signingFee')} <i>{t('gameplay:staff.signingFeeAmount', { amount: (cand?.signingFee ?? 0).toLocaleString() })}</i></div>
                  {avgSalary > 0 && (() => {
                    const diff = ((cand?.salary ?? 0) - avgSalary) / avgSalary * 100;
                    const up = diff >= 0;
                    return (
                      <span className={cn('stf-cmp', up ? 'up' : 'down')} title="Comparado con el salario medio de tu staff actual">
                        {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                        {up ? '+' : ''}{t('gameplay:staff.vsAvg', { pct: diff.toFixed(0) })}
                      </span>
                    );
                  })()}
                  <Button size="sm" onClick={() => handleHire(cand)}>{t('gameplay:staff.hire')}</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Staff List: tarjetas (rol/nivel/salario/especialidad) o tabla ordenable */}
      {filteredStaff.length === 0 ? (
        <EmptyState
          icon={<Briefcase size={28} />}
          title={t('gameplay:staff.emptyTitle')}
          hint={t('gameplay:staff.emptyHint')}
        />
      ) : viewMode === 'cards' ? (
        <div className="stf-mgrid">
          {filteredStaff.map(m => (
            <div key={m.id} className="stf-mcard">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div className="stf-mrole">{m?.roleLabel ?? m?.role ?? '—'}</div>
                  <div className="stf-mname">{m?.name ?? '—'}</div>
                </div>
                <LevelBar level={m?.level ?? 0} />
              </div>
              {m?.specialty && <div className="stf-spec">{m.specialty}</div>}
              <div className="stf-money">{t('gameplay:staff.salary')} <b>{t('gameplay:staff.salaryPerMonth', { amount: (m?.salary ?? 0).toLocaleString() })}</b></div>
              <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
                {m.role === 'manager' ? (
                  <span className="stf-lock">{t('gameplay:staff.essential')}</span>
                ) : (
                  <button className="stf-fire" onClick={() => setConfirmDelete(m.id)}>
                    <Trash2 size={13} /> {t('gameplay:staff.fireAction')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <SortableTable
          columns={staffCols}
          data={filteredStaff}
          rowKey={m => m.id}
          initialSort={{ key: 'salary', dir: 'desc' }}
        />
      )}
      <ConfirmModal
        open={confirmDelete != null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => { if (confirmDelete != null) await handleFire(confirmDelete); setConfirmDelete(null); }}
        title={t('gameplay:staff.fireTitle')}
        confirmText={t('gameplay:staff.fireAction')}
        isDestructive
      >
        <p>{t('gameplay:staff.fireBody')}</p>
      </ConfirmModal>
    </div>
  );
}
