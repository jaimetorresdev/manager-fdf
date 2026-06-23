import { cn } from '../../lib/cn';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  onClick?: () => void;
  glow?: boolean;
  variant?: 'default' | 'elevated' | 'pitch';
  /** Estilos inline puntuales (aditivo: lo usa FanPulsePanel para layout flexible). */
  style?: React.CSSProperties;
}

export function Card({
  children,
  className,
  padding = 'md',
  hover,
  onClick,
  glow = false,
  variant = 'default',
  style
}: CardProps) {
  const paddings = { none: '', sm: 'p-3', md: 'p-4 sm:p-5', lg: 'p-5 sm:p-6' };

  const variantStyles = {
    default: 'section-panel-subtle',
    elevated: 'retro-panel',
    pitch: 'pitch-panel'
  };

  return (
    <div
      className={cn(
        'rounded-lg transition-all duration-300',
        variantStyles[variant],
        paddings[padding],
        hover && 'card-hover',
        glow && 'shadow-[0_0_20px_rgba(0,230,118,0.15)]',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  );
}
