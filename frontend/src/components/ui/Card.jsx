/**
 * @file Card.jsx
 * @module ui
 * @description Container genérico temático. Usa var(--bg-card) e var(--border).
 * @version 1.0.0
 * @date 2026-04-22
 */

const PADDING = { none: '', sm: 'p-3', md: 'p-5', lg: 'p-6' };

export function Card({ children, padding = 'md', glass = false, className = '', ...props }) {
  return (
    <div
      className={`rounded-xl border ${glass ? 'backdrop-blur-sm' : ''} ${PADDING[padding]} ${className}`}
      style={{
        background: glass ? 'rgba(15,23,42,0.4)' : 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
      {...props}
    >
      {children}
    </div>
  );
}
