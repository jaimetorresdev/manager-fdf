import { cn } from '../../lib/cn';
import React from 'react';

type BaseProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
  size?: 'sm' | 'md' | 'lg';
};

export type ButtonProps = BaseProps & (
  | { iconOnly?: false; children: React.ReactNode }
  | { iconOnly: true; children: React.ReactNode; 'aria-label': string }
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Button({ variant = 'primary', size = 'md', children, className, iconOnly, ...props }: ButtonProps) {
  const variants = {
    primary: 'ui-button-primary font-bold',
    secondary: 'ui-button-secondary',
    ghost: 'ui-button-ghost',
    danger: 'ui-button-danger',
    gold: 'ui-button-gold font-bold'
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-base',
  };
  return (
    <button
      className={cn(
        'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
