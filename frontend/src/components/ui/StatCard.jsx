/**
 * @file StatCard.jsx
 * @module ui
 * @description Card KPI com título, valor (BRL ou texto), contagem e variante semântica.
 *              Extrai o padrão repetido em ResumoCards, Saúde, Recebíveis, Tarefas.
 * @version 1.0.0
 * @date 2026-04-22
 */

const VARIANTS = {
  default:  { wrap: 'bg-white/5 border-white/5',                      text: 'text-[var(--text-primary)]',    label: 'text-[var(--text-muted)]' },
  success:  { wrap: 'bg-emerald-900/30 border-emerald-700/40',         text: 'text-emerald-400',              label: 'text-emerald-600' },
  warning:  { wrap: 'bg-amber-900/20 border-amber-700/30',             text: 'text-amber-400',                label: 'text-amber-700' },
  danger:   { wrap: 'bg-red-900/20 border-red-700/30',                 text: 'text-red-400',                  label: 'text-red-800' },
  accent:   { wrap: '',                                                  text: 'text-[var(--accent-text)]',    label: 'text-[var(--text-muted)]' },
  highlight:{ wrap: 'bg-white/8 border-white/10',                      text: 'text-[var(--text-primary)]',    label: 'text-[var(--text-muted)]' },
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function StatCard({ titulo, valor, count, variante = 'default', icon: Icon, trend, className = '' }) {
  const v = VARIANTS[variante] ?? VARIANTS.default;
  const isAccent = variante === 'accent';

  const formattedValue = typeof valor === 'number' ? BRL.format(valor) : valor;

  return (
    <div
      className={`rounded-xl p-5 flex flex-col gap-1 border ${v.wrap} ${className}`}
      style={isAccent ? {
        background: 'var(--accent-dim)',
        borderColor: 'var(--accent-glow)',
      } : undefined}
    >
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium uppercase tracking-wider ${v.label}`}>{titulo}</span>
        {Icon && <Icon size={14} className={`opacity-60 ${v.text}`} />}
      </div>

      <span className={`text-2xl font-bold font-mono ${v.text}`}>{formattedValue}</span>

      <div className="flex items-center gap-2">
        {count !== undefined && (
          <span className="text-xs text-[var(--text-muted)]">
            {count} lançamento{count !== 1 ? 's' : ''}
          </span>
        )}
        {trend && (
          <span className={`text-xs font-semibold ${trend.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}
