import { useRef, useCallback, useEffect } from 'react';
import { cn } from '../../lib/cn';
import { getPositionCategory } from '../../lib/gameUtils';

interface PitchProps {
  starters: any[];
  formation: string;
  positions: Record<number, { x: number; y: number }>;
  onPositionsChange: (pos: Record<number, { x: number; y: number }>) => void;
  onPlayerClick?: (player: any) => void;
  formationsData?: any[];
  roleInstructions?: Record<string, string>;
  onDropPlayer?: (draggedId: number, targetId: number) => void;
}

function getPlayerAverage(p: any): number { return p.overall; }

export function Pitch2D({ starters, formation, positions, onPositionsChange, onPlayerClick, formationsData, roleInstructions = {}, onDropPlayer }: PitchProps) {
  const pitchRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{
    id: number; startX: number; startY: number; moved: boolean;
    origin: { x: number; y: number };
  } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent, playerId: number) => {
    e.preventDefault();
    draggingRef.current = {
      id: playerId, startX: e.clientX, startY: e.clientY, moved: false,
      origin: positions[playerId] ?? { x: 50, y: 50 },
    };
  }, [positions]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingRef.current || !pitchRef.current) return;
    if (!draggingRef.current.moved
        && Math.hypot(e.clientX - draggingRef.current.startX, e.clientY - draggingRef.current.startY) < 5) return;
    draggingRef.current.moved = true;
    const rect = pitchRef.current.getBoundingClientRect();
    const x = Math.min(96, Math.max(4, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(96, Math.max(4, ((e.clientY - rect.top) / rect.height) * 100));
    onPositionsChange({ ...positions, [draggingRef.current.id]: { x, y } });
  }, [positions, onPositionsChange]);

  const handleMouseUp = useCallback(() => {
    const drag = draggingRef.current;
    draggingRef.current = null;
    if (!drag) return;
    if (!drag.moved) {
      const player = starters.find(p => p.id === drag.id);
      if (player && onPlayerClick) onPlayerClick(player);
      return;
    }
    const dropped = positions[drag.id];
    if (!dropped) return;
    let target: { id: number; d: number } | null = null;
    for (const p of starters) {
      if (p.id === drag.id) continue;
      const pos = positions[p.id];
      if (!pos) continue;
      const d = Math.hypot(pos.x - dropped.x, pos.y - dropped.y);
      if (d < 7 && (!target || d < target.d)) target = { id: p.id, d };
    }
    if (target) {
      onPositionsChange({ ...positions, [drag.id]: positions[target.id], [target.id]: drag.origin });
    }
  }, [starters, onPlayerClick, positions, onPositionsChange]);

  const handleTouchStart = useCallback((e: React.TouchEvent, playerId: number) => {
    draggingRef.current = {
      id: playerId, startX: e.touches[0].clientX, startY: e.touches[0].clientY, moved: false,
      origin: positions[playerId] ?? { x: 50, y: 50 },
    };
  }, [positions]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!draggingRef.current || !pitchRef.current) return;
    e.preventDefault();
    draggingRef.current.moved = true;
    const rect = pitchRef.current.getBoundingClientRect();
    const x = Math.min(96, Math.max(4, ((e.touches[0].clientX - rect.left) / rect.width) * 100));
    const y = Math.min(96, Math.max(4, ((e.touches[0].clientY - rect.top) / rect.height) * 100));
    onPositionsChange({ ...positions, [draggingRef.current.id]: { x, y } });
  }, [positions, onPositionsChange]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp, handleTouchMove]);

  // Read advanced tactic flag directly from localStorage
  const isAdv = typeof window !== 'undefined' && (() => {
    try {
      const adv = JSON.parse(localStorage.getItem('fdf_tactic_adv') || '{}');
      return Object.keys(adv).length > 0;
    } catch { return false; }
  })();

  const isRetro = ['3-2-5', '2-3-2-3'].includes(formation) || formationsData?.find(f => f.key === formation)?.style === 'retro';


  const handleExternalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const draggedIdStr = e.dataTransfer.getData('text/plain');
    if (!draggedIdStr) return;
    const draggedId = parseInt(draggedIdStr, 10);
    if (!draggedId || !pitchRef.current) return;

    const rect = pitchRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    let target: { id: number; d: number } | null = null;
    for (const p of starters) {
      const pos = positions[p.id];
      if (!pos) continue;
      const d = Math.hypot(pos.x - x, pos.y - y);
      if (d < 12 && (!target || d < target.d)) target = { id: p.id, d };
    }

    if (target && onDropPlayer) {
      onDropPlayer(draggedId, target.id);
    }
  }, [starters, positions, onDropPlayer]);

  return (
    <div 
      className="relative w-full h-full flex items-center justify-center p-2 sm:p-3"
      onDragOver={e => e.preventDefault()}
      onDrop={handleExternalDrop}
    >
      {/* Banquillo / Entorno de estadio detrás de la pizarra */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--green-primary)_15%,transparent)_0%,transparent_70%)] z-[-1] rounded-xl" />

      <div
        ref={pitchRef}
        className={cn("relative overflow-hidden select-none shadow-[0_0_40px_color-mix(in_srgb,var(--green-primary)_18%,transparent),var(--shadow-soft)] transition-all duration-1000", isRetro ? "sepia-[.4] contrast-125 saturate-50" : "")}
        style={{
          aspectRatio: '7/10',
          borderRadius: 'var(--radius-retro)',
          border: '1px solid color-mix(in srgb, var(--green-primary) 35%, var(--border-color))',
          width: '100%',
          maxWidth: '560px',
          background: 'linear-gradient(180deg, var(--pitch-grass-a) 0%, var(--pitch-grass-b) 45%, var(--pitch-grass-c) 100%)',
        }}
      >
        <div className={cn("absolute inset-0 pointer-events-none", isRetro ? "bg-[url('/noise.png')] opacity-30 mix-blend-overlay" : "bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.12)_0%,transparent_65%)]")} />
        
        {/* Césped - Franjas sutiles con textura */}
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="absolute left-0 right-0 pointer-events-none"
            style={{ 
              top: `${i * 10}%`, height: '10%', 
              background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.08)',
              borderTop: '1px solid rgba(255,255,255,0.03)'
            }} />
        ))}

        {/* Glow effects en las áreas */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-[20%] bg-white/5 blur-[40px] pointer-events-none" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60%] h-[20%] bg-white/5 blur-[40px] pointer-events-none" />

        {/* Luces de estadio dinámicas (CSS animation) */}
        <style>{`
          @keyframes sweep-light {
            0% { transform: translateX(-100%) skewX(-15deg); opacity: 0; }
            50% { opacity: 0.15; }
            100% { transform: translateX(200%) skewX(-15deg); opacity: 0; }
          }
          .stadium-light {
            position: absolute;
            top: 0; bottom: 0; width: 150%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent);
            pointer-events: none;
            mix-blend-mode: overlay;
          }
        `}</style>
        <div className="stadium-light" style={{ animation: 'sweep-light 8s ease-in-out infinite' }} />
        <div className="stadium-light" style={{ animation: 'sweep-light 12s ease-in-out infinite 4s' }} />

        {/* Líneas del campo tipo Neon/Cristal */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 143" preserveAspectRatio="none" style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.6))' }}>
          <rect x="3" y="3" width="94" height="137" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.4" />
          <line x1="3" y1="71.5" x2="97" y2="71.5" stroke="rgba(255,255,255,0.6)" strokeWidth="0.4" />
          <circle cx="50" cy="71.5" r="12" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.4" />
          <circle cx="50" cy="71.5" r="0.8" fill="rgba(255,255,255,0.8)" />
          <rect x="22" y="3" width="56" height="20" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.4" />
          <rect x="35" y="3" width="30" height="8" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.4" />
          <rect x="22" y="120" width="56" height="20" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.4" />
          <rect x="35" y="132" width="30" height="8" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.4" />
        </svg>

        {starters.map(p => {
        const pos = positions[p.id] ?? { x: 50, y: 50 };
        const isDragging = draggingRef.current?.id === p.id;
        const avg = getPlayerAverage(p);
        const cat = getPositionCategory(p.position);
        const isGK = cat === 'POR';
        const isDef = cat === 'DEF';
        const isDel = cat === 'DEL';
        const isMed = cat === 'MED';

        // Check if out of position based on Y coordinate
        let outOfPosition = false;
        const det = p.detailedPosition || '';
        if (det === 'POR') outOfPosition = pos.y < 75;
        else if (['LI', 'CAI'].includes(det)) outOfPosition = pos.x > 50 || pos.y < 45 || pos.y > 85;
        else if (['LD', 'CAD'].includes(det)) outOfPosition = pos.x < 50 || pos.y < 45 || pos.y > 85;
        else if (['CT', 'LIB'].includes(det)) outOfPosition = pos.x < 20 || pos.x > 80 || pos.y < 50 || pos.y > 90;
        else if (['MCD', 'MC'].includes(det)) outOfPosition = pos.x < 20 || pos.x > 80 || pos.y < 35 || pos.y > 70;
        else if (det === 'MI') outOfPosition = pos.x > 50 || pos.y < 25 || pos.y > 75;
        else if (det === 'MD') outOfPosition = pos.x < 50 || pos.y < 25 || pos.y > 75;
        else if (det === 'MP') outOfPosition = pos.x < 20 || pos.x > 80 || pos.y < 20 || pos.y > 55;
        else if (det === 'EI') outOfPosition = pos.x > 50 || pos.y > 45;
        else if (det === 'ED') outOfPosition = pos.x < 50 || pos.y > 45;
        else if (['DC', 'SD'].includes(det)) outOfPosition = pos.y > 45;
        else {
          // Fallback
          if (isGK && pos.y < 75) outOfPosition = true;
          else if (isDef && (pos.y > 80 || pos.y < 45)) outOfPosition = true;
          else if (isMed && (pos.y > 65 || pos.y < 25)) outOfPosition = true;
          else if (isDel && pos.y > 45) outOfPosition = true;
        }

        const outlineColor = isGK ? '#facc15' : isDef ? '#3b82f6' : isMed ? '#10b981' : '#ef4444';
        const gradientPrefix = `player-${p.id}`;
        const jerseyGradient = isGK
          ? `url(#${gradientPrefix}-gk)`
          : isDef
            ? `url(#${gradientPrefix}-def)`
            : isMed
              ? `url(#${gradientPrefix}-med)`
              : `url(#${gradientPrefix}-del)`;

        // Estilos holográficos para las cartas


        return (
          <div
            key={p.id}
            data-pitch-player={p.id}
            aria-label={`${p.name} · ${p.position ?? ''}`}
            className={cn('absolute flex flex-col items-center cursor-grab active:cursor-grabbing', isDragging && 'z-50')}
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)', transition: isDragging ? 'none' : 'left 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), top 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)' }}
            onMouseDown={e => handleMouseDown(e, p.id)}
            onTouchStart={e => handleTouchStart(e, p.id)}
          >
            {/* Arrows in advanced mode */}
            {isAdv && !isDragging && (
              <svg className="absolute -top-6 pointer-events-none opacity-50" width="32" height="64" style={{ zIndex: -1 }}>
                {isDef && (
                  <path d="M16,32 L16,56 L10,50 M16,56 L22,50" stroke={outlineColor} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                )}
                {isDel && (
                  <path d="M16,32 L16,8 L10,14 M16,8 L22,14" stroke={outlineColor} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                )}
                {!isDef && !isDel && !isGK && (
                  <path d="M16,24 L16,8 L10,14 M16,8 L22,14 M16,40 L16,56 L10,50 M16,56 L22,50" stroke={outlineColor} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            )}

            {/* Sombra de la ficha que se aleja al arrastrar */}
            <div className="absolute bottom-0 w-8 h-2 bg-black/60 blur-[3px] rounded-full pointer-events-none transition-all duration-200" 
                 style={{ transform: isDragging ? 'translateY(16px) scale(1.5)' : 'translateY(8px) scale(1)', opacity: isDragging ? 0.3 : 0.6 }} />

            {/* Camiseta (Jersey) SVG 3D */}
            <div 
              className={cn('relative flex items-center justify-center transition-transform duration-200', isDragging ? 'scale-125' : 'scale-100 hover:scale-110')}
              style={{
                width: '42px', height: '42px',
                filter: isDragging ? `drop-shadow(0 0 10px ${outlineColor})` : 'drop-shadow(0 4px 6px rgba(0,0,0,0.6))'
              }}
            >
              <svg viewBox="0 0 40 40" className="absolute inset-0 w-full h-full pointer-events-none" style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.5))' }}>
                <defs>
                  {/* Gradientes para las camisetas por posición */}
                  <linearGradient id={`${gradientPrefix}-gk`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#fef08a" />
                    <stop offset="100%" stopColor="#ca8a04" />
                  </linearGradient>
                  <linearGradient id={`${gradientPrefix}-def`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#67e8f9" />
                    <stop offset="100%" stopColor="#0369a1" />
                  </linearGradient>
                  <linearGradient id={`${gradientPrefix}-med`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#6ee7b7" />
                    <stop offset="100%" stopColor="#047857" />
                  </linearGradient>
                  <linearGradient id={`${gradientPrefix}-del`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#fca5a5" />
                    <stop offset="100%" stopColor="#b91c1c" />
                  </linearGradient>
                  
                  {/* Gradiente para pliegues 3D (overlay) */}
                  <linearGradient id={`${gradientPrefix}-folds`} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
                    <stop offset="20%" stopColor="rgba(0,0,0,0.1)" />
                    <stop offset="50%" stopColor="rgba(255,255,255,0.2)" />
                    <stop offset="80%" stopColor="rgba(0,0,0,0.2)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0.3)" />
                  </linearGradient>
                </defs>
                
                {/* Forma de camiseta (Jersey) */}
                <path 
                  d="M12 2 C16 2 18 5 20 5 C22 5 24 2 28 2 C32 2 34 3 37 6 L40 14 L33 18 L30 14 L30 38 L10 38 L10 14 L7 18 L0 14 L3 6 C6 3 8 2 12 2 Z" 
                  fill={jerseyGradient}
                  stroke="rgba(255,255,255,0.5)"
                  strokeWidth="0.5"
                />
                
                {/* Pliegues 3D para darle volumen */}
                <path 
                  d="M12 2 C16 2 18 5 20 5 C22 5 24 2 28 2 C32 2 34 3 37 6 L40 14 L33 18 L30 14 L30 38 L10 38 L10 14 L7 18 L0 14 L3 6 C6 3 8 2 12 2 Z" 
                  fill={`url(#${gradientPrefix}-folds)`}
                  pointerEvents="none"
                />
                
                {/* Cuello del jersey */}
                <path d="M16 2 C18 6 22 6 24 2" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" />
              </svg>

              {/* Dorsal encima de la camiseta */}
              <div className="relative flex items-center justify-center mt-2 z-10">
                <span className="text-[15px] font-black leading-none text-white" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,1)', fontFamily: 'var(--font-display)' }}>
                  {p.squadNumber}
                </span>
              </div>
              
              {/* Badge de fitness (arriba derecha) */}
              <div className={cn('absolute top-0 -right-1 w-2 h-2 rounded-full border border-black/80 z-20',
                p.fitness >= 85 ? 'bg-green-400' : p.fitness >= 70 ? 'bg-yellow-400' : 'bg-red-500')} style={{ boxShadow: '0 0 4px rgba(0,0,0,0.5)' }} />

              {/* Warning/Badge (fuera de posición) */}
              {outOfPosition && (
                <div className="absolute -top-1 -left-2 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center shadow-md animate-bounce z-20" title="Fuera de posición">
                  <span className="text-[11px] text-white font-bold leading-none mb-0.5">!</span>
                </div>
              )}
            </div>

            {/* Fila de Nombre + Valoración con Glassmorphism */}
            <div
              className="mt-1 flex flex-col items-center gap-0.5 px-1.5 py-0.5 rounded border backdrop-blur-sm"
              style={{
                background: 'color-mix(in srgb, var(--bg-surface) 75%, transparent)',
                borderColor: outOfPosition ? 'color-mix(in srgb, var(--red-danger) 50%, transparent)' : 'var(--border-color)',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))',
              }}
            >
              <div className="flex items-center gap-1">
                <span className={cn("text-[9px] font-bold tracking-tight truncate max-w-[46px]", outOfPosition ? "text-[var(--red-danger)]" : "text-[var(--text-primary)]")}>
                  {p.name.split(' ')[0]}
                </span>
                <span className="text-[10px] font-black" style={{ color: outlineColor }}>
                  {Math.round(avg)}
                </span>
              </div>
              {p.slotIndex !== undefined && roleInstructions[p.slotIndex] && (
                <span className="text-[7px] text-[var(--gold-accent)] uppercase font-black tracking-widest whitespace-nowrap">
                  {roleInstructions[p.slotIndex].replace('_', ' ')}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}
