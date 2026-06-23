import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Minus, Maximize2 } from 'lucide-react';

interface Props {
  onCountrySelect?: (country: string) => void;
  selectedCountry?: string | null;
  activeCountries: string[];
}

// ── Nombre (EN de Natural Earth + ES del API) → código canónico ──────────────
const ALIASES: Record<string, string> = {
  spain: 'ES', espana: 'ES',
  germany: 'DE', alemania: 'DE',
  england: 'ENG', inglaterra: 'ENG',
  scotland: 'SCT', escocia: 'SCT',
  france: 'FR', francia: 'FR',
  italy: 'IT', italia: 'IT',
  portugal: 'PT',
  netherlands: 'NL', 'paises bajos': 'NL', holanda: 'NL',
  belgium: 'BE', belgica: 'BE',
  switzerland: 'CH', suiza: 'CH',
  austria: 'AT',
  croatia: 'HR', croacia: 'HR',
  denmark: 'DK', dinamarca: 'DK',
  greece: 'GR', grecia: 'GR',
  poland: 'PL', polonia: 'PL',
  serbia: 'RS',
  sweden: 'SE', suecia: 'SE',
  turkey: 'TR', turkiye: 'TR', turquia: 'TR',
  ukraine: 'UA', ucrania: 'UA',
  czechia: 'CZ', 'czech republic': 'CZ', chequia: 'CZ',
  ireland: 'IE', irlanda: 'IE',
  norway: 'NO', noruega: 'NO',
};
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const codeOf = (name: string): string | null => ALIASES[norm(name)] ?? null;

// ── Proyección web-mercator (lng/lat → unidades de mapa, norte arriba) ────────
const DEG = 180 / Math.PI;
function project(lng: number, lat: number): [number, number] {
  const l = Math.max(-85, Math.min(85, lat));
  return [lng, -DEG * Math.log(Math.tan(Math.PI / 4 + (l * Math.PI) / 360))];
}

type Ring = [number, number][];
type Feature = { name: string; code: string | null; d: string; bbox: [number, number, number, number]; centroid: [number, number]; area: number };
type View = { x: number; y: number; w: number; h: number };

function ringAreaCentroid(r: Ring): { area: number; cx: number; cy: number } {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const cross = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    a += cross; cx += (r[j][0] + r[i][0]) * cross; cy += (r[j][1] + r[i][1]) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) return { area: 0, cx: r[0]?.[0] ?? 0, cy: r[0]?.[1] ?? 0 };
  return { area: Math.abs(a), cx: cx / (6 * a), cy: cy / (6 * a) };
}

export function WorldMapPolitical({ onCountrySelect, selectedCountry, activeCountries }: Props) {
  const { t } = useTranslation('common');
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [view, setView] = useState<View>({ x: -28, y: -80, w: 110, h: 70 });
  const [hover, setHover] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const dragRef = useRef<{ on: boolean; moved: number; px: number; py: number }>({ on: false, moved: 0, px: 0, py: 0 });
  const animRef = useRef<number>(0);

  const activeCodes = useMemo(() => {
    const m = new Map<string, string>(); // code → nombre ES exacto del API
    for (const c of activeCountries) { const k = codeOf(c); if (k) m.set(k, c); }
    return m;
  }, [activeCountries]);
  const selectedCode = selectedCountry ? codeOf(selectedCountry) : null;

  // Carga + proyección del GeoJSON (una vez)
  useEffect(() => {
    let cancelled = false;
    fetch('/world_subunits.geojson').then(r => r.json()).then((gj: { features: Array<{ properties: { name: string }; geometry: { type: string; coordinates: number[][][] | number[][][][] } }> }) => {
      if (cancelled) return;
      const out: Feature[] = [];
      for (const f of gj.features) {
        const name = f.properties?.name;
        if (!name) continue;
        const polys: Ring[][] = f.geometry.type === 'Polygon'
          ? [(f.geometry.coordinates as number[][][]).map(r => r.map(p => project(p[0], p[1])) as Ring)]
          : (f.geometry.coordinates as number[][][][]).map(poly => poly.map(r => r.map(p => project(p[0], p[1])) as Ring));
        let d = '', minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let bestArea = 0, cen: [number, number] = [0, 0];
        for (const poly of polys) {
          for (let ri = 0; ri < poly.length; ri++) {
            const ring = poly[ri];
            d += 'M' + ring.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('L') + 'Z';
            for (const p of ring) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
            if (ri === 0) { const { area, cx, cy } = ringAreaCentroid(ring); if (area > bestArea) { bestArea = area; cen = [cx, cy]; } }
          }
        }
        out.push({ name, code: codeOf(name), d, bbox: [minX, minY, maxX, maxY], centroid: cen, area: bestArea });
      }
      setFeatures(out);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Ajusta el tamaño del contenedor (para mantener aspecto)
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 }));
    ro.observe(el);
    setSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
    return () => ro.disconnect();
  }, []);

  // Encadra la vista a un bbox (con animación suave)
  const animateTo = (target: View) => {
    cancelAnimationFrame(animRef.current);
    const start = { ...view }; const t0 = performance.now(); const dur = 480;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - k, 3);
      setView({ x: start.x + (target.x - start.x) * e, y: start.y + (target.y - start.y) * e, w: start.w + (target.w - start.w) * e, h: start.h + (target.h - start.h) * e });
      if (k < 1) animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
  };

  const fitBbox = (b: [number, number, number, number], padFactor: number): View => {
    const aspect = size.w / size.h;
    let w = (b[2] - b[0]) * padFactor, h = (b[3] - b[1]) * padFactor;
    if (w / h > aspect) h = w / aspect; else w = h * aspect;
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  };

  // Encuadre inicial = Europa (bbox de los países activos)
  const didInitialFit = useRef(false);
  useEffect(() => {
    if (didInitialFit.current || !features.length || size.w <= 1) return;
    const act = features.filter(f => f.code && activeCodes.has(f.code));
    const src = act.length ? act : features;
    let b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const f of src) { b = [Math.min(b[0], f.bbox[0]), Math.min(b[1], f.bbox[1]), Math.max(b[2], f.bbox[2]), Math.max(b[3], f.bbox[3])]; }
    setView(fitBbox(b, 1.35));
    didInitialFit.current = true;
  }, [features, size, activeCodes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al seleccionar un país, vuela a su forma
  useEffect(() => {
    if (!selectedCode || !features.length) return;
    const f = features.find(ft => ft.code === selectedCode);
    if (f) animateTo(fitBbox(f.bbox, 2.6));
  }, [selectedCountry, features]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Interacción: pan (arrastrar) + zoom (rueda) ──────────────────────────────
  const toUser = (clientX: number, clientY: number): [number, number] => {
    const r = containerRef.current!.getBoundingClientRect();
    return [view.x + ((clientX - r.left) / r.width) * view.w, view.y + ((clientY - r.top) / r.height) * view.h];
  };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const [ux, uy] = toUser(e.clientX, e.clientY);
    const f = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    const nw = Math.max(6, Math.min(360, view.w * f)); const nh = nw * (view.h / view.w);
    setView({ w: nw, h: nh, x: ux - (ux - view.x) * (nw / view.w), y: uy - (uy - view.y) * (nh / view.h) });
  };
  const onPointerDown = (e: React.PointerEvent) => { dragRef.current = { on: true, moved: 0, px: e.clientX, py: e.clientY }; (e.target as Element).setPointerCapture?.(e.pointerId); };
  const onPointerMove = (e: React.PointerEvent) => {
    const dr = dragRef.current; if (!dr.on) return;
    const dx = e.clientX - dr.px, dy = e.clientY - dr.py; dr.moved += Math.abs(dx) + Math.abs(dy); dr.px = e.clientX; dr.py = e.clientY;
    const r = containerRef.current!.getBoundingClientRect();
    setView(v => ({ ...v, x: v.x - (dx / r.width) * v.w, y: v.y - (dy / r.height) * v.h }));
  };
  const onPointerUp = () => { dragRef.current.on = false; };

  const clickCountry = (code: string | null) => {
    if (dragRef.current.moved > 6 || !code) return;
    const country = activeCodes.get(code);
    if (country) onCountrySelect?.(country);
  };

  // Controles de zoom (rueda de botones)
  const zoomBy = (f: number) => setView(v => {
    const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    const nw = Math.max(6, Math.min(360, v.w * f)); const nh = nw * (v.h / v.w);
    return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
  });
  const resetView = () => {
    const act = features.filter(f => f.code && activeCodes.has(f.code));
    const src = act.length ? act : features;
    if (!src.length) return;
    let b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const f of src) { b = [Math.min(b[0], f.bbox[0]), Math.min(b[1], f.bbox[1]), Math.max(b[2], f.bbox[2]), Math.max(b[3], f.bbox[3])]; }
    animateTo(fitBbox(b, 1.35));
  };

  // Etiquetas: centroide → pantalla
  const labels = useMemo(() => {
    if (!features.length) return [];
    return features.filter(f => f.code && activeCodes.has(f.code)).map(f => {
      const sx = ((f.centroid[0] - view.x) / view.w) * size.w;
      const sy = ((f.centroid[1] - view.y) / view.h) * size.h;
      return { code: f.code!, country: activeCodes.get(f.code!)!, x: sx, y: sy, vis: sx > -40 && sx < size.w + 40 && sy > -20 && sy < size.h + 20 };
    });
  }, [features, activeCodes, view, size]);

  const strokeW = (view.w / size.w) * 0.7;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[400px] overflow-hidden rounded-[inherit] select-none"
      style={{ background: 'radial-gradient(120% 120% at 50% 20%, #0a1c34 0%, #050f1f 60%, #03070f 100%)', cursor: dragRef.current.on ? 'grabbing' : 'grab' }}
    >
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full touch-none"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid slice"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {features.map((f, i) => {
          const active = !!(f.code && activeCodes.has(f.code));
          const selected = !!(f.code && f.code === selectedCode);
          const hovered = active && hover === f.code;
          const fill = selected ? '#f5c518' : hovered ? '#3ee6a6' : active ? '#1f7a5b' : '#16243a';
          const stroke = selected ? '#fff0b8' : active ? '#5ff0c0' : '#2c405c';
          return (
            <path
              key={i}
              data-code={f.code ?? ''}
              d={f.d}
              fill={fill}
              stroke={stroke}
              strokeWidth={selected || hovered ? strokeW * 2 : strokeW}
              strokeLinejoin="round"
              style={{ cursor: active ? 'pointer' : 'default', transition: 'fill .18s' }}
              onPointerEnter={() => active && setHover(f.code)}
              onPointerLeave={() => active && setHover(h => (h === f.code ? null : h))}
              onClick={() => clickCountry(f.code)}
            />
          );
        })}
      </svg>

      {/* Etiquetas de nombre (HTML, nítidas y de tamaño constante) */}
      <div className="absolute inset-0 z-20 overflow-hidden pointer-events-none">
        {labels.filter(l => l.vis).map(l => {
          const selected = l.code === selectedCode;
          const hovered = hover === l.code;
          return (
            <button
              key={l.code}
              type="button"
              onClick={(e) => { e.stopPropagation(); onCountrySelect?.(l.country); }}
              className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-black uppercase tracking-wide rounded-full border transition-colors pointer-events-auto"
              style={{
                left: l.x, top: l.y,
                fontSize: 10,
                padding: '2px 7px',
                zIndex: selected ? 30 : hovered ? 25 : 10,
                color: selected ? '#08140d' : '#eafff5',
                background: selected ? 'rgba(245,197,24,0.95)' : 'rgba(5,16,30,0.62)',
                borderColor: selected ? 'rgba(245,197,24,0.9)' : 'rgba(52,211,153,0.5)',
                boxShadow: selected ? '0 2px 12px rgba(245,197,24,0.4)' : '0 1px 6px rgba(0,0,0,0.4)',
              }}
            >
              {l.country}
            </button>
          );
        })}
      </div>

      {/* Controles de zoom */}
      <div className="absolute bottom-4 right-4 z-30 flex flex-col gap-1.5">
        {[
          { icon: Plus, fn: () => zoomBy(1 / 1.4), label: t('Acercar', 'Acercar') },
          { icon: Minus, fn: () => zoomBy(1.4), label: t('Alejar', 'Alejar') },
          { icon: Maximize2, fn: resetView, label: t('Ver todo', 'Ver todo') },
        ].map(({ icon: Icon, fn, label }, i) => (
          <button
            key={i}
            type="button"
            onClick={fn}
            title={label}
            aria-label={label}
            className="w-9 h-9 grid place-items-center rounded-lg border border-[var(--green-primary)]/40 bg-black/55 text-white/85 backdrop-blur-md hover:bg-[var(--green-primary)]/25 hover:text-white hover:border-[var(--green-primary)] transition-colors shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
          >
            <Icon size={16} />
          </button>
        ))}
      </div>

      {/* Vignette + HUD */}
      <div className="absolute inset-0 pointer-events-none z-10" style={{ background: 'radial-gradient(ellipse at center, transparent 60%, rgba(3,7,15,0.55) 100%)' }} />
      <div className="absolute top-4 left-4 z-30 pointer-events-none">
        <div className="font-mono text-xs text-[var(--green-primary)] opacity-70 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[var(--green-primary)] animate-pulse" />
          {t('FDF_NET // GLOBAL_LINK')}
        </div>
        <div className="font-mono text-[9px] text-[var(--text-muted)] mt-2 uppercase tracking-widest">{t('Pulsa un país · rueda para zoom · arrastra para mover')}</div>
      </div>
    </div>
  );
}
