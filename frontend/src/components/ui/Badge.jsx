/**
 * @file Badge.jsx
 * @module ui
 * @description Badge/chip de status. Variantes semânticas são fixas (negócio);
 *              variante "accent" usa o token do tema ativo.
 * @version 1.0.0
 * @date 2026-04-22
 */

const VARIANTS = {
  // semânticos — fixos independente de tema
  pago:     'bg-emerald-900/30 text-emerald-400 border border-emerald-700/30',
  success:  'bg-emerald-900/30 text-emerald-400 border border-emerald-700/30',
  pendente: 'bg-amber-900/20 text-amber-400 border border-amber-700/30',
  warning:  'bg-amber-900/20 text-amber-400 border border-amber-700/30',
  vencido:  'bg-red-900/20 text-red-400 border border-red-700/30',
  danger:   'bg-red-900/20 text-red-400 border border-red-700/30',
  info:     'bg-blue-900/20 text-blue-400 border border-blue-700/30',
  // temáticos — seguem o tema ativo
  accent:   '',   // inline style aplicado abaixo
  muted:    'bg-white/5 text-[var(--text-muted)] border border-[var(--border)]',
};

const SIZES = {
  sm: 'text-[10px] px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
};

export function Badge({ children, variant = 'muted', size = 'md', className = '' }) {
  const isAccent = variant === 'accent';
  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full uppercase tracking-wide ${VARIANTS[variant] ?? VARIANTS.muted} ${SIZES[size]} ${className}`}
      style={isAccent ? {
        background: 'var(--accent-dim)',
        color: 'var(--accent-text)',
        border: '1px solid var(--accent-glow)',
      } : undefined}
    >
      {children}
    </span>
  );
}
