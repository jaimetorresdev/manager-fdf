// ─── OfferPanel — Oferta multi-apartado estilo FDF (manual §1.6 / §4.3) ───────
// 4 bloques de valoración (entorno / sentimental / expectativas / económico) con
// parámetros llave 🔑 eliminatorios y valoración total en vivo. Sirve para PUJAR
// (mercado) y para RENOVAR (plantilla).
//
// La valoración REAL la calcula el servidor (POST /api/market/evaluate, issue
// 3.1): este panel la pide en vivo (debounced) y solo cae a la estimación local
// del manual si el endpoint no responde.

import { useEffect, useMemo, useRef, useState } from 'react';
import { marketApi } from '../../api/client';
import { num } from '../../lib/format';
import { validateOfferTerms } from '../../lib/offersLogic';
import { Button } from '../ui';
import { DecisionSignal, type DecisionSignalParams } from './DecisionSignal';

export interface OfferTarget {
  id: number;
  name: string;
  age?: number;
  morale?: number;            // 0-100
  marketValue?: number;       // valor ≈ 100 × salario (manual §4.4)
  currentSalary?: number;     // €/mes si se conoce (renovación)
  contractYearsLeft?: number; // años pendientes (renovación)
}

export interface OfferEvaluation {
  blocks: { entorno: number; sentimental: number; expectativas: number; economico: number };
  keys: { id: string; label: string; ok: boolean; detail: string }[];
  total: number;
}

interface Props {
  player: OfferTarget;
  mode: 'bid' | 'renew';
  evaluation?: OfferEvaluation | null;   // si el backend ya evalúa, manda él
  onSubmit: (offer: { salary: number; years: number; clause: number; amount: number }) => void;
  onCancel?: () => void;
}

/** Límite legal de cláusula según años de contrato (manual §1.6). */
const CLAUSE_MULT: Record<number, number> = { 1: 600, 2: 500, 3: 400, 4: 300, 5: 200 };

/** Reducción salarial que acepta según años pendientes (manual §1.6). */
function minSalaryFactor(yearsLeft: number | undefined): number {
  if (yearsLeft === undefined) return 0.9;
  return 1 - Math.max(0, Math.min(0.2, 0.2 - 0.05 * yearsLeft));
}

const clamp = (v: number, lo = 0, hi = 99) => Math.max(lo, Math.min(hi, v));

function evaluateLocal(p: OfferTarget, salary: number, years: number, clause: number): OfferEvaluation {
  const estSalary = p.currentSalary ?? (p.marketValue ? p.marketValue / 100 : 8000);
  const minSalary = Math.round(estSalary * minSalaryFactor(p.contractYearsLeft));
  const clauseLimit = salary * (CLAUSE_MULT[Math.max(1, Math.min(5, years))] ?? 400);

  const keys: OfferEvaluation['keys'] = [
    { id: 'salary', label: 'Salario ≥ mínimo del jugador', ok: salary >= minSalary,
      detail: `mínimo ${minSalary.toLocaleString()} €/mes` },
    { id: 'clause', label: 'Cláusula dentro del límite legal', ok: clause <= clauseLimit,
      detail: `límite ${Math.round(clauseLimit).toLocaleString()} € (salario × ${CLAUSE_MULT[Math.max(1, Math.min(5, years))] ?? 400})` },
    { id: 'years', label: 'Años de contrato aceptables', ok: years >= 1 && years <= 5 && (p.age ?? 25) < 33,
      detail: (p.age ?? 25) >= 33 ? 'con 33+ años no renueva (piensa en la retirada)' : 'máx. 5 temporadas acumuladas' },
    { id: 'morale', label: 'Moral suficiente', ok: (p.morale ?? 75) >= 11,
      detail: `moral ${(p.morale ?? 75)}% (mín. 11%)` },
  ];

  const sueldoVal = salary < minSalary ? 0 : clamp(50 + ((salary / Math.max(1, minSalary)) - 1) * 120);
  const clausulaVal = clause > clauseLimit ? 0 : clamp((1 - clause / Math.max(1, clauseLimit)) * 99);
  const aniosVal = !keys[2].ok ? 0 : clamp(99 - Math.abs(3 - years) * 12);
  const economico = Math.round((sueldoVal + clausulaVal + aniosVal) / 3);

  // Entorno / sentimental / expectativas: el cliente no conoce mentalidades,
  // nacionalidades de la plantilla ni coeficientes → neutro 50 hasta que el
  // backend evalúe (ver NECESITO arriba). La moral sí pondera lo sentimental.
  const entorno = 50;
  const sentimental = clamp(Math.round(((p.morale ?? 75) + 50) / 2));
  const expectativas = 50;

  const anyKeyFail = keys.some(k => !k.ok);
  const total = anyKeyFail ? 0 : Math.round((entorno + sentimental + expectativas + economico) / 4);
  return { blocks: { entorno, sentimental, expectativas, economico }, keys, total };
}

const BLOCK_META: { id: keyof OfferEvaluation['blocks']; icon: string; label: string }[] = [
  { id: 'entorno', icon: '👥', label: 'Entorno' },
  { id: 'sentimental', icon: '❤️', label: 'Sentimental' },
  { id: 'expectativas', icon: '🛡️', label: 'Expectativas' },
  { id: 'economico', icon: '💰', label: 'Económico' },
];

function Bar({ value }: { value: number }) {
  const color = value >= 66 ? 'var(--green-primary)' : value >= 33 ? 'var(--gold-accent)' : 'var(--red-danger)';
  return (
    <div style={{ height: 6, background: 'var(--bg-base)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${value}%`, height: '100%', background: color, transition: 'width .25s' }} />
    </div>
  );
}

export function OfferPanel({ player, mode, evaluation, onSubmit, onCancel }: Props) {
  const estSalary = player.currentSalary ?? (player.marketValue ? Math.round(player.marketValue / 100) : 8000);
  const [salary, setSalary] = useState(estSalary);
  const [years, setYears] = useState(3);
  const [clause, setClause] = useState(player.marketValue ?? estSalary * 100);
  const [amount, setAmount] = useState(mode === 'bid' ? (player.marketValue ?? 0) : 0);

  // Evaluación del SERVIDOR en vivo (debounced); fallback a la estimación local.
  const [serverEv, setServerEv] = useState<OfferEvaluation | null>(null);
  const [evSource, setEvSource] = useState<'server' | 'local'>('local');
  const evTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (evaluation) return; // si el padre inyecta una evaluación, manda él
    if (evTimer.current) clearTimeout(evTimer.current);
    evTimer.current = setTimeout(() => {
      marketApi.evaluate(player.id, salary, years, clause)
        .then((res) => {
          if (res && res.blocks && res.keys) { setServerEv(res as OfferEvaluation); setEvSource('server'); }
        })
        .catch(() => { setServerEv(null); setEvSource('local'); });
    }, 450);
    return () => { if (evTimer.current) clearTimeout(evTimer.current); };
  }, [evaluation, player.id, salary, years, clause]);

  const ev = useMemo(
    () => evaluation ?? serverEv ?? evaluateLocal(player, salary, years, clause),
    [evaluation, serverEv, player, salary, years, clause],
  );
  const canSubmit = ev.total > 0;

  // A2 · capa de avisos sobre los TÉRMINOS (offersLogic, puro). No cambia el gate
  // de envío (lo decide el servidor vía ev.total); solo añade avisos consultivos.
  const termsAdvice = useMemo(
    () => validateOfferTerms(
      { amount, salary, years, clause },
      { marketValue: player.marketValue, currentContractYears: player.contractYearsLeft, playerAge: player.age },
    ),
    [amount, salary, years, clause, player],
  );
  const advisoryWarnings = mode === 'bid' ? termsAdvice.warnings : [];

  const signalParams = useMemo<DecisionSignalParams | null>(() => {
    if (mode === 'bid') {
      return { action: 'sign', playerId: player.id, amount, salary, years, clause };
    }
    return { action: 'renew', playerId: player.id, salary, years, clause };
  }, [mode, player.id, amount, salary, years, clause]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Oferta */}
      <div style={{ display: 'grid', gridTemplateColumns: mode === 'bid' ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: 8 }}>
        {mode === 'bid' && (
          <label className="of-f">
            <span>Traspaso (€)</span>
            <input type="number" value={amount} onChange={e => setAmount(num(e.target.value))} />
          </label>
        )}
        <label className="of-f">
          <span>Salario €/mes</span>
          <input type="number" value={salary} onChange={e => setSalary(num(e.target.value))} />
        </label>
        <label className="of-f">
          <span>Años</span>
          <select value={years} onChange={e => setYears(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="of-f">
          <span>Cláusula (€)</span>
          <input type="number" value={clause} onChange={e => setClause(num(e.target.value))} />
        </label>
      </div>
      <style>{`
        .of-f{display:flex;flex-direction:column;gap:3px}
        .of-f span{font-size:.6rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)}
        .of-f input,.of-f select{background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:6px;padding:6px 8px;color:var(--text-primary);font-size:.82rem;width:100%}
      `}</style>

      <DecisionSignal params={signalParams} compact />

      {/* 4 bloques de valoración */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {BLOCK_META.map(b => (
          <div key={b.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>{b.icon} {b.label}</span>
              <span style={{ fontSize: '.78rem', fontWeight: 800, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-primary)' }}>{ev.blocks[b.id]}%</span>
            </div>
            <Bar value={ev.blocks[b.id]} />
          </div>
        ))}
      </div>

      {/* Parámetros llave 🔑 (eliminatorios) */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '8px 10px' }}>
        <p style={{ fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 6 }}>
          🔑 Parámetros llave — si uno falla, el jugador NO acepta
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {ev.keys.map(k => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: '.74rem' }}>
              <span style={{ color: k.ok ? 'var(--green-primary)' : 'var(--red-danger)', fontWeight: 800 }}>{k.ok ? '✓' : '✗'}</span>
              <span style={{ color: 'var(--text-primary)' }}>{k.label}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '.66rem' }}>· {k.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Total + acciones */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>
              Valoración de la oferta {evaluation ? '' : evSource === 'server' ? '· 🟢 del jugador' : '· 🟡 estimación'}
            </span>
            <span style={{ fontSize: '1rem', fontWeight: 900, fontFamily: 'var(--font-mono, monospace)', color: canSubmit ? 'var(--green-primary)' : 'var(--red-danger)' }}>
              {ev.total}%
            </span>
          </div>
          <Bar value={ev.total} />
        </div>
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancelar</Button>}
        <Button onClick={() => canSubmit && onSubmit({ salary, years, clause, amount })}>
          {mode === 'bid' ? 'Presentar oferta' : 'Ofrecer renovación'}
        </Button>
      </div>
      {!canSubmit && (
        <p style={{ fontSize: '.68rem', color: 'var(--gold-accent)' }}>
          ⚠ Hay parámetros llave sin cumplir: el jugador rechazará esta oferta tal cual.
        </p>
      )}
      {advisoryWarnings.map((w, i) => (
        <p key={i} style={{ fontSize: '.66rem', color: 'var(--text-muted)' }}>💡 {w}</p>
      ))}
    </div>
  );
}
