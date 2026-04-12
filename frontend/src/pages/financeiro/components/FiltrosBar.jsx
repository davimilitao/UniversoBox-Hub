/**
 * @file FiltrosBar.jsx
 * @description Filtros financeiros em linha única: mês, tipo, categoria, status.
 * @version 4.0.0
 * @date 2026-04-11
 * @changelog
 *   4.0.0 — 2026-04-11 — Linha única; dropdown tipo + categoria; pill vencido.
 *   3.0.0 — 2026-04-01 — Range de datas + pills de categoria.
 */

import { ChevronLeft, ChevronRight, LayoutList, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

const NOME_MES = {
  '01':'Jan','02':'Fev','03':'Mar','04':'Abr',
  '05':'Mai','06':'Jun','07':'Jul','08':'Ago',
  '09':'Set','10':'Out','11':'Nov','12':'Dez',
};

function labelBonito(label) {
  const [mm, yyyy] = (label || '').split('/');
  return mm && yyyy ? `${NOME_MES[mm] ?? mm} ${yyyy}` : label;
}

const select = "rounded-lg bg-slate-900 border border-white/10 text-slate-300 text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 [color-scheme:dark] cursor-pointer";

const STATUS_OPTS = [
  { val: 'all',      label: 'Todos',    Icon: LayoutList,  cls: 'bg-slate-600 border-slate-500 text-white', activeCls: '' },
  { val: 'pago',     label: 'Pago',     Icon: CheckCircle2,cls: 'bg-emerald-600/20 border-emerald-500 text-emerald-400', activeCls: '' },
  { val: 'pendente', label: 'Pendente', Icon: Clock,       cls: 'bg-amber-600/20 border-amber-500 text-amber-400', activeCls: '' },
  { val: 'vencido',  label: 'Vencido',  Icon: AlertCircle, cls: 'bg-red-600/20 border-red-500 text-red-400', activeCls: '' },
];

export function FiltrosBar({
  meses, mesAtivo, onMes,
  tipos, tipoAtivo, onTipo,
  categorias, categoriaAtiva, onCategoria,
  statusAtivo, onStatus,
}) {
  const idxAtivo = meses.findIndex(m => m.label === mesAtivo);

  function navMes(delta) {
    const novoIdx = idxAtivo + delta;
    if (novoIdx >= 0 && novoIdx < meses.length) onMes(meses[novoIdx].label);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">

      {/* ── Navegação de mês ───────────────────────────────────────────────── */}
      {meses.length > 0 && (
        <div className="flex items-center gap-1 bg-slate-900 border border-white/[0.07] rounded-xl px-1 py-1">
          <button
            onClick={() => navMes(1)}
            disabled={idxAtivo >= meses.length - 1}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] disabled:opacity-20 transition-all"
          >
            <ChevronLeft size={14} />
          </button>
          <select
            value={mesAtivo}
            onChange={e => onMes(e.target.value)}
            className="bg-transparent text-slate-100 text-sm font-bold px-2 py-1 outline-none cursor-pointer min-w-[100px] text-center [color-scheme:dark]"
          >
            {meses.map(m => (
              <option key={m.label} value={m.label}>{labelBonito(m.label)}</option>
            ))}
          </select>
          <button
            onClick={() => navMes(-1)}
            disabled={idxAtivo <= 0}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] disabled:opacity-20 transition-all"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* ── Tipo ──────────────────────────────────────────────────────────── */}
      {tipos && tipos.length > 0 && (
        <select
          value={tipoAtivo || 'all'}
          onChange={e => onTipo?.(e.target.value)}
          className={select}
        >
          <option value="all">Todos os tipos</option>
          <option value="mensal_fixa">Fixa Mensal</option>
          <option value="operacional">Operacional</option>
          <option value="investimento">Investimento</option>
        </select>
      )}

      {/* ── Categoria ─────────────────────────────────────────────────────── */}
      {categorias && categorias.length > 0 && (
        <select
          value={categoriaAtiva || 'all'}
          onChange={e => onCategoria?.(e.target.value)}
          className={select}
        >
          <option value="all">Todas as categorias</option>
          {categorias.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      )}

      {/* ── Separador ─────────────────────────────────────────────────────── */}
      <span className="w-px h-5 bg-white/10" />

      {/* ── Pills de status ───────────────────────────────────────────────── */}
      {STATUS_OPTS.map(({ val, label, Icon }) => {
        const ativo = statusAtivo === val;
        return (
          <button key={val} onClick={() => onStatus(val)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
              ativo
                ? val === 'pago'     ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400'
                : val === 'pendente' ? 'bg-amber-600/20 border-amber-500 text-amber-400'
                : val === 'vencido'  ? 'bg-red-600/20 border-red-500 text-red-400'
                                     : 'bg-slate-600 border-slate-500 text-white'
                : 'bg-slate-800 border-white/[0.07] text-slate-500 hover:text-slate-300'
            }`}>
            <Icon size={10} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
