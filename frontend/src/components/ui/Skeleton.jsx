/**
 * @file Skeleton.jsx
 * @module ui
 * @description Placeholder de carregamento animado.
 * @version 1.0.0
 * @date 2026-04-22
 */

export function Skeleton({ h = 'h-32', count = 1, className = '' }) {
  if (count > 1) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className={`rounded-xl animate-pulse ${h} ${className}`}
            style={{ background: 'var(--bg-surface)' }} />
        ))}
      </div>
    );
  }
  return (
    <div className={`rounded-xl animate-pulse ${h} ${className}`}
      style={{ background: 'var(--bg-surface)' }} />
  );
}
