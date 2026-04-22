/**
 * @file Button.jsx
 * @module ui
 * @description Botão temático — consome var(--accent) para variante primary.
 * @version 1.0.0
 * @date 2026-04-22
 */

import { Loader2 } from 'lucide-react';

const BASE = 'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all focus:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:pointer-events-none';

const VARIANTS = {
  primary: 'text-white hover:opacity-90 active:scale-[0.98]',
  ghost:   'bg-transparent text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]',
  danger:  'bg-red-900/30 text-red-400 border border-red-700/30 hover:bg-red-900/50',
  outline: 'bg-transparent border border-[var(--border)] text-[var(--text-primary)] hover:bg-white/5',
};

const SIZES = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-4 py-2',
  lg: 'text-base px-5 py-2.5',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  as: Tag = 'button',
  className = '',
  ...props
}) {
  const inlinePrimary = variant === 'primary'
    ? { background: 'var(--accent)', boxShadow: '0 0 0 0 var(--accent-glow)' }
    : {};

  return (
    <Tag
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      style={inlinePrimary}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </Tag>
  );
}
