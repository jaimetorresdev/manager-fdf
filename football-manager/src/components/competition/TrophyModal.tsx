import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Trophy, Star, History, Info } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useFocusTrap } from '../../lib/a11y';

interface TrophyModalProps {
  type: string;
  onClose: () => void;
}

export function TrophyModal({ type, onClose }: TrophyModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useFocusTrap(modalRef, true);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    prevFocusRef.current = document.activeElement as HTMLElement;
    if (modalRef.current) modalRef.current.focus();
    
    return () => {
      document.body.style.overflow = originalOverflow;
      if (prevFocusRef.current) prevFocusRef.current.focus();
    };
  }, []);

  // Configuramos datos por tipo
  const data = (() => {
    switch (type) {
      case 'champions':
        return {
          title: 'UEFA Champions League',
          color: 'from-blue-900 to-black',
          accent: 'text-blue-400',
          image: '/trophy_champions.png',
          desc: 'La competición de clubes más prestigiosa del mundo. Sólo los verdaderos elegidos logran levantar La Orejona y alcanzar la gloria continental eterna.',
          stats: [
            { label: 'Último Campeón', value: 'Real Madrid CF' },
            { label: 'Más Títulos', value: 'Real Madrid CF (15)' },
            { label: 'Fundación', value: '1955' }
          ]
        };
      case 'europa':
        return {
          title: 'UEFA Europa League',
          color: 'from-orange-900 to-black',
          accent: 'text-orange-400',
          image: '/trophy_europa.png',
          desc: 'La épica segunda competición europea. Un trofeo forjado en plata maciza que exige sangre, sudor y lágrimas en las noches mágicas de los jueves.',
          stats: [
            { label: 'Último Campeón', value: 'Atalanta BC' },
            { label: 'Más Títulos', value: 'Sevilla FC (7)' },
            { label: 'Fundación', value: '1971' }
          ]
        };
      case 'conference':
        return {
          title: 'UEFA Conference League',
          color: 'from-emerald-900 to-black',
          accent: 'text-emerald-400',
          image: '/trophy_conference.png',
          desc: 'La nueva frontera del fútbol europeo. Un escenario para que clubes emergentes hagan historia y levanten un trofeo continental oficial.',
          stats: [
            { label: 'Último Campeón', value: 'Olympiacos FC' },
            { label: 'Más Títulos', value: 'Roma / West Ham / Olympiacos (1)' },
            { label: 'Fundación', value: '2021' }
          ]
        };
      default:
        return {
          title: 'Trofeo FDF',
          color: 'from-gray-900 to-black',
          accent: 'text-gray-400',
          image: '/trophy_champions.png',
          desc: 'Trofeo oficial de la Federación Deportiva de Fútbol.',
          stats: []
        };
    }
  })();

  useEffect(() => {
    // Simula carga para el efecto de aparición
    const timer = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" 
      style={{ perspective: '2000px' }}
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="trophy-title"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-500" 
        onClick={onClose}
        style={{ opacity: loading ? 0 : 1 }}
      />
      
      <div 
        className={cn(
          "relative w-full max-w-4xl min-h-[500px] rounded-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row bg-gradient-to-br transition-all duration-700 border border-white/10",
          data.color,
          loading ? "opacity-0 translate-y-12 rotate-x-12 scale-95" : "opacity-100 translate-y-0 rotate-x-0 scale-100"
        )}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
          aria-label={t('actions.close', 'Cerrar')}
        >
          <X size={24} />
        </button>

        {/* Zona de Imagen (Izquierda) */}
        <div className="relative w-full md:w-1/2 flex items-center justify-center p-8 bg-black/40 overflow-hidden">
          {/* Spotlight effect */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200%] h-full bg-gradient-to-b from-white/20 via-transparent to-transparent pointer-events-none transform -skew-x-12" />
          
          <img 
            src={data.image} 
            alt={data.title} 
            className={cn(
              "relative z-10 max-w-full max-h-[60vh] object-contain drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)] transition-all duration-1000",
              loading ? "scale-90 opacity-0 blur-sm" : "scale-100 opacity-100 blur-0"
            )}
            style={{ filter: 'drop-shadow(0 0 30px rgba(255,255,255,0.2))' }}
          />
        </div>

        {/* Zona de Info (Derecha) */}
        <div className="relative w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center text-white bg-gradient-to-l from-black/80 to-transparent">
          <div className="flex items-center gap-3 mb-4">
            <Trophy className={data.accent} size={32} />
            <h2 id="trophy-title" className="font-display font-black italic uppercase tracking-tighter text-4xl md:text-5xl leading-none" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
              {data.title.split(' ').map((word, i) => (
                <span key={i} className={i === 0 ? "text-white" : data.accent}>{word} </span>
              ))}
            </h2>
          </div>
          
          <p className="text-gray-300 text-lg leading-relaxed mb-8 font-medium">
            {data.desc}
          </p>

          <div className="space-y-4 mb-8">
            {data.stats.map((stat, i) => (
              <div key={i} className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-gray-400 font-bold uppercase tracking-widest text-xs flex items-center gap-2">
                  {i === 0 ? <Star size={14}/> : i === 1 ? <History size={14}/> : <Info size={14}/>}
                  {stat.label}
                </span>
                <span className="font-display font-bold text-lg">{stat.value}</span>
              </div>
            ))}
          </div>

          <button 
            className={cn(
              "w-full py-4 rounded font-display font-black uppercase tracking-widest italic text-lg transition-transform hover:scale-105 shadow-xl",
              type === 'champions' ? "bg-blue-600 text-white hover:bg-blue-500" :
              type === 'europa' ? "bg-orange-600 text-white hover:bg-orange-500" :
              "bg-emerald-600 text-white hover:bg-emerald-500"
            )}
          >
            {t('gameplay:trophyModal.viewCompetition')}
          </button>
        </div>
      </div>
    </div>
  );
}
