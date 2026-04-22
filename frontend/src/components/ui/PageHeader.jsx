/**
 * @file PageHeader.jsx
 * @module ui
 * @description Cabeçalho padrão de página com título, subtítulo, ícone e slot de ações.
 * @version 1.0.0
 * @date 2026-04-22
 */

export function PageHeader({ titulo, subtitulo, icon: Icon, actions, className = '' }) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 ${className}`}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div
            className="p-2 rounded-lg"
            style={{ background: 'var(--accent-dim)' }}
          >
            <Icon size={20} style={{ color: 'var(--accent-text)' }} />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {titulo}
          </h1>
          {subtitulo && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {subtitulo}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
