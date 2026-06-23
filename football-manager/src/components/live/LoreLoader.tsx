import { useState, useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { cn } from '../../lib/cn';
import { subscribe } from '../../lib/ws';

const DEFAULT_LORE = [
  "Preparando el césped del estadio...",
  "Calibrando el sistema de ojeo global...",
  "Revisando los presupuestos de los clubes...",
  "Afilando los tacos de las botas...",
  "Negociando los derechos televisivos...",
  "Calculando tácticas y formaciones...",
  "Llenando las gradas de afición virtual..."
];

const MATCHDAY_LORE = [
  "Cargando análisis de los vestuarios...",
  "Desplegando la unidad móvil de TV...",
  "La afición se acerca al estadio...",
  "Calentamiento de los jugadores...",
  "Repasando las pizarras tácticas..."
];

const CRISIS_LORE = [
  "Buscando soluciones a la crisis...",
  "La afición está muy nerviosa...",
  "Revisando los contratos de la plantilla...",
  "Preparando la rueda de prensa de emergencia..."
];

const EUPHORIA_LORE = [
  "Preparando la retransmisión...",
  "Imprimiendo camisetas conmemorativas...",
  "La moral está por las nubes...",
  "Los aficionados no dejan de cantar..."
];

interface LoreLoaderProps {
  className?: string;
  minHeight?: string;
}

export function LoreLoader({ className, minHeight = "40vh" }: LoreLoaderProps) {
  const shellContext = useGameStore(s => s.shellContext);
  const mode = shellContext?.visual?.mode || 'normal';

  const [lore, setLore] = useState(DEFAULT_LORE[0]);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);

  useEffect(() => {
    const channel = subscribe('system:world', (msg) => {
      if (msg.type === 'tick:progress') {
        const payload = msg.payload as { continent?: string, message?: string } | undefined;
        if (payload?.continent) {
          setProgressMsg(`Simulando ${payload.continent}...`);
        } else if (payload?.message) {
          setProgressMsg(payload.message);
        } else {
          setProgressMsg('Simulando partidos...');
        }
      } else if (msg.type === 'tick:completed') {
        setProgressMsg(null);
      }
    });
    return () => channel.close();
  }, []);

  useEffect(() => {
    if (progressMsg) return;

    let strings = DEFAULT_LORE;
    if (mode === 'matchday') strings = MATCHDAY_LORE;
    else if (mode === 'crisis') strings = CRISIS_LORE;
    else if (mode === 'euphoria') strings = EUPHORIA_LORE;

    const idx = Math.floor(Math.random() * strings.length);
    setLore(strings[idx]);

    const interval = setInterval(() => {
      setLore(strings[Math.floor(Math.random() * strings.length)]);
    }, 4000);

    return () => clearInterval(interval);
  }, [mode, progressMsg]);

  const STYLE_MAP: Record<string, string> = {
    normal: 'text-[var(--text-muted)] border-[var(--gold-accent)]',
    matchday: 'text-[var(--green-primary)] border-[var(--green-primary)]',
    crisis: 'text-[var(--red-danger)] border-[var(--red-danger)]',
    euphoria: 'text-[var(--gold-accent)] border-[var(--gold-accent)]',
  };
  
  const modeStyles = STYLE_MAP[mode] || STYLE_MAP.normal;

  return (
    <div
      className={cn("flex flex-col gap-4 items-center justify-center text-sm transition-colors duration-1000", modeStyles, className)}
      style={{ minHeight }}
    >
      <div className={cn("w-8 h-8 rounded-full border-2 border-t-transparent animate-spin", modeStyles.split(' ')[1])} />
      <span className="font-mono-retro tracking-widest text-xs animate-pulse text-center max-w-[80%]">{progressMsg || lore}</span>
    </div>
  );
}
