// ─── chartUtils — helpers no-componente del módulo financiero ─────────────────
// Separados de EconomyCharts/EconomyAnalysisCharts para que esos ficheros solo
// exporten componentes (regla react-refresh/only-export-components · A6).
// Mantiene el formato con espacio "M €"/"K €" propio de las gráficas (distinto
// del compacto "M€" de src/lib/format.ts, usado en el resto de la gestión).

/** Importe en euros con espacio, estilo gráfica: "1.5M €" · "250K €" · "—". */
export function eurFmt(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M €`;
  if (abs >= 1e3) return `${Math.round(n / 1e3)}K €`;
  return `${Math.round(n)} €`;
}

/** Metadatos visuales del riesgo de masa salarial (gauge + paneles). */
export const RISK_META: Record<string, { label: string; color: string; desc: string }> = {
  healthy: { label: 'SANO', color: 'var(--green-primary)', desc: 'La masa salarial está bajo control respecto a lo que ingresa el club.' },
  watch: { label: 'VIGILANCIA', color: 'var(--gold-accent)', desc: 'Los salarios empiezan a comerse los ingresos: cuidado con las próximas renovaciones.' },
  risk: { label: 'RIESGO', color: 'var(--red-danger)', desc: 'Los salarios superan lo sostenible: vende, cede o renegocia antes de que la caja se resienta.' },
};
