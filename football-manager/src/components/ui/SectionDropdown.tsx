import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SectionItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface Props {
  items: SectionItem[];
  selectedId: string;
  onChange: (id: string) => void;
  kicker?: string;
  accentColor?: string;
}

export function SectionDropdown({ items, selectedId, onChange, kicker = "SECCIÓN", accentColor = "var(--gold-accent)" }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = items.find(i => i.id === selectedId) || items[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative z-50" ref={containerRef}>
      <style>{`
        .sdrop-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 20px;
          width: 100%;
          max-width: 400px;
          background: color-mix(in srgb, var(--bg-surface) 60%, transparent);
          border: 1px solid color-mix(in srgb, var(--border-color) 60%, transparent);
          border-radius: 16px;
          color: var(--text-primary);
          font-family: var(--font-display);
          font-weight: 900;
          font-size: 1rem;
          text-transform: uppercase;
          letter-spacing: 1px;
          cursor: pointer;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          box-shadow: var(--shadow-soft);
          transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .sdrop-btn:hover, .sdrop-btn:focus-visible {
          border-color: ${accentColor};
          box-shadow: 0 10px 30px rgba(0,0,0,0.3), inset 0 0 20px color-mix(in srgb, ${accentColor} 15%, transparent);
          outline: none;
        }
        .sdrop-btn.is-open {
          border-color: var(--green-primary);
          box-shadow: 0 10px 30px rgba(0,0,0,0.3), inset 0 0 20px color-mix(in srgb, var(--green-primary) 15%, transparent);
          border-bottom-left-radius: 4px;
          border-bottom-right-radius: 4px;
        }
        .sdrop-menu {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          width: max-content;
          min-width: 100%;
          max-width: 90vw;
          max-height: 60vh;
          overflow-y: auto;
          background: color-mix(in srgb, var(--bg-elevated) 85%, transparent);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 8px;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 6px;
          backdrop-filter: blur(25px);
          -webkit-backdrop-filter: blur(25px);
          box-shadow: 0 20px 50px rgba(0,0,0,0.5), inset 0 1px 0 color-mix(in srgb, var(--text-primary) 5%, transparent);
          animation: drop-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
          transform-origin: top left;
        }
        .sdrop-menu::-webkit-scrollbar { width: 6px; }
        .sdrop-menu::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 4px; }
        .sdrop-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 10px;
          background: transparent;
          border: 1px solid transparent;
          color: var(--text-muted);
          font-family: var(--font-display);
          font-weight: 800;
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 1px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }
        .sdrop-item:hover, .sdrop-item:focus-visible {
          background: color-mix(in srgb, var(--bg-surface) 80%, transparent);
          color: var(--text-primary);
          border-color: var(--border-color);
          outline: none;
        }
        .sdrop-item.is-selected {
          background: color-mix(in srgb, var(--green-primary) 15%, transparent);
          color: var(--green-primary);
          border-color: color-mix(in srgb, var(--green-primary) 40%, transparent);
          box-shadow: inset 0 0 15px color-mix(in srgb, var(--green-primary) 10%, transparent);
        }
      `}</style>
      
      <p className="font-display text-[10px] uppercase tracking-widest font-black mb-2 flex items-center gap-2" style={{ color: accentColor }}>
        <span className="w-1.5 h-1.5 rounded animate-pulse" style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}` }} />
        {kicker}
      </p>

      <button 
        className={`sdrop-btn ${isOpen ? 'is-open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {selected?.icon && <span className="text-xl" aria-hidden="true">{selected.icon}</span>}
        <span className="flex-1 text-left truncate">{selected?.label ?? 'Cargando...'}</span>
        <ChevronDown size={20} className={`transition-transform duration-300 ${isOpen ? 'rotate-180 text-[var(--green-primary)]' : 'text-[var(--text-muted)]'}`} />
      </button>

      {isOpen && (
        <div className="sdrop-menu" role="listbox">
          {items.map(item => {
            const isSelected = selectedId === item.id;
            return (
              <button
                key={item.id}
                role="option"
                aria-selected={isSelected}
                className={`sdrop-item ${isSelected ? 'is-selected' : ''}`}
                onClick={() => {
                  onChange(item.id);
                  setIsOpen(false);
                }}
              >
                {item.icon && <span className="text-lg">{item.icon}</span>}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
