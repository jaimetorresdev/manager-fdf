// ─── Modal v2 — familia unificada (I-14): default · sheet · fullscreen · compact ─
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useFocusTrap } from '../../lib/a11y';

export type ModalVariant = 'default' | 'sheet' | 'fullscreen' | 'compact';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Escudo, retrato o icono de contexto en cabecera */
  headerIcon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  variant?: ModalVariant;
}

export function Modal({
  open, onClose, title, subtitle, headerIcon, children, footer,
  width = 720, variant = 'default',
}: Props) {
  const { t } = useTranslation('common');
  const modalRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useFocusTrap(modalRef, open);

  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    prevFocusRef.current = document.activeElement as HTMLElement;
    // Foco inicial (el useEffect de useFocusTrap ya atrapa, pero forzamos foco en el modal)
    if (modalRef.current) modalRef.current.focus();
    return () => {
      document.body.style.overflow = originalOverflow;
      if (prevFocusRef.current) prevFocusRef.current.focus();
    };
  }, [open]);

  if (!open) return null;

  const maxW = variant === 'fullscreen' ? '100%' : variant === 'compact' ? 420 : width;
  const align = variant === 'sheet' ? 'flex-end' : 'center';
  const padTop = variant === 'sheet' ? '0' : variant === 'fullscreen' ? '0' : '6vh';

  return (
    <div
      ref={modalRef}
      className={cn('fdf-modal', `fdf-modal--${variant}`)}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
      onClick={onClose}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
      style={{ outline: 'none', alignItems: align, paddingTop: padTop }}
    >
      <style>{`
        .fdf-modal{position:fixed;inset:0;z-index:120;display:flex;justify-content:center;
          padding-left:16px;padding-right:16px;background:rgba(2,5,8,.62);backdrop-filter:blur(3px);
          animation:fdfmin .18s ease}
        .fdf-modal--sheet{padding-bottom:0}
        .fdf-modal--fullscreen{padding:0!important;background:rgba(2,5,8,.78)}
        @keyframes fdfmin{from{opacity:0}to{opacity:1}}
        @keyframes fdfmbox{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
        @keyframes fdfmsheet{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:none}}
        .fdf-modal-box{width:100%;max-height:88vh;overflow:hidden;display:flex;flex-direction:column;
          background:var(--bg-surface);border:1px solid var(--border-color);
          border-radius:var(--radius-retro);box-shadow:var(--shadow-soft);
          animation:fdfmbox .22s cubic-bezier(.2,.8,.2,1) both}
        .fdf-modal--sheet .fdf-modal-box{max-height:92vh;border-radius:16px 16px 0 0;animation:fdfmsheet .28s cubic-bezier(.2,.8,.2,1) both}
        .fdf-modal--fullscreen .fdf-modal-box{max-height:100vh;height:100vh;border-radius:0;border:none;animation:fdfmin .2s ease both}
        .fdf-modal--compact .fdf-modal-box{max-height:70vh}
        .fdf-modal-bar{display:flex;align-items:center;gap:12px;flex-shrink:0;
          padding:12px 16px;background:var(--titlebar-bg);border-bottom:1px solid var(--border-color)}
        .fdf-modal-head{flex:1;min-width:0}
        .fdf-modal-title{font-family:var(--font-display);font-weight:700;font-size:.95rem;color:var(--titlebar-text);
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .fdf-modal-sub{font-size:.72rem;color:var(--text-muted);margin-top:2px;text-transform:uppercase;letter-spacing:.06em}
        .fdf-modal-icon{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:40px;height:40px;
          border-radius:8px;background:var(--bg-elevated);border:1px solid var(--border-color);overflow:hidden}
        .fdf-modal-x{display:grid;place-items:center;width:32px;height:32px;border-radius:8px;cursor:pointer;flex-shrink:0;
          background:var(--bg-elevated);border:1px solid var(--border-color);color:var(--text-primary)}
        .fdf-modal-x:hover{background:var(--bg-base)}
        .fdf-modal-body{padding:16px;overflow:auto;flex:1;min-height:0}
        .fdf-modal--compact .fdf-modal-body{padding:12px}
        .fdf-modal-foot{flex-shrink:0;display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;
          padding:12px 16px;border-top:1px solid var(--border-color);background:var(--bg-elevated)}
        @media(prefers-reduced-motion:reduce){.fdf-modal,.fdf-modal-box{animation:none!important}}
      `}</style>
      <div
        className="fdf-modal-box"
        style={{ maxWidth: maxW }}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || headerIcon) && (
          <div className="fdf-modal-bar">
            {headerIcon && <div className="fdf-modal-icon">{headerIcon}</div>}
            <div className="fdf-modal-head">
              {title && <div id="modal-title" className="fdf-modal-title">{title}</div>}
              {subtitle && <div className="fdf-modal-sub">{subtitle}</div>}
            </div>
            <button type="button" className="fdf-modal-x" onClick={onClose} aria-label={t('actions.close')}>
              <X size={16} />
            </button>
          </div>
        )}
        <div className="fdf-modal-body">{children}</div>
        {footer && <div className="fdf-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
