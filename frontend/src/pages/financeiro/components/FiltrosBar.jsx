/**
 * @file FiltrosBar.jsx
 * @module financeiro
 * @description Abas de mês, chips de categoria dinâmicos e filtro de status.
 * @version 1.0.0
 * @date 2026-04-01
 * @author UniversoLab
 */

const NOME_MES = {
  '01':'Jan','02':'Fev','03':'Mar','04':'Abr',
  '05':'Mai','06':'Jun','07':'Jul','08':'Ago',
  '09':'Set','10':'Out','11':'Nov','12':'Dez',
};

export function FiltrosBar({
  meses, mesAtivo, onMes,
  categorias, categoriaAtiva, onCategoria,
  statusAtivo, onStatus,
}) {
  return (
    <div className="flex flex-col gap-3">

      {/* ── Abas de mês ─────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {meses.map(m => {
          const [mm, yyyy] = m.label.split('/');
          const label = mm && yyyy ? `${NOME_MES[mm] ?? mm} ${yyyy}` : m.label;
          const ativo = m.label === mesAtivo;
          return (
            <button
              key={m.label}
              onClick={() => onMes(m.label)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${ativo
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Chips de categoria + filtro de status ───────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Categoria */}
        {['Todas', ...categorias].map(cat => {
          const val   = cat === 'Todas' ? 'all' : cat;
          const ativo = categoriaAtiva === val;
          return (
            <button
              key={val}
              onClick={() => onCategoria(val)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border
                ${ativo
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'bg-slate-800 border-white/10 text-slate-400 hover:border-emerald-600/50 hover:text-slate-200'
                }`}
            >
              {cat}
            </button>
          );
        })}

        {/* Separador */}
        <span className="w-px h-5 bg-white/10 mx-1" />

        {/* Status */}
        {[
          { val: 'all',      label: 'Todos'    },
          { val: 'pago',     label: '✅ Pago'   },
          { val: 'pendente', label: '⏳ Pendente'},
        ].map(s => (
          <button
            key={s.val}
            onClick={() => onStatus(s.val)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border
              ${statusAtivo === s.val
                ? 'bg-slate-600 border-slate-500 text-white'
                : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'
              }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
