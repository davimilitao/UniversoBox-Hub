/**
 * @file FiltrosBar.jsx
 * @description Filtros financeiros — seletor de mês compacto estilo banco + período + categoria + status.
 * @version 3.0.0
 */

import { useState } from 'react';
import {
  CalendarRange, Tag, CheckCircle2, Clock, LayoutList,
  ChevronLeft, ChevronRight,
} from 'lucide-react';

const NOME_MES = {
  '01':'Jan','02':'Fev','03':'Mar','04':'Abr',
  '05':'Mai','06':'Jun','07':'Jul','08':'Ago',
  '09':'Set','10':'Out','11':'Nov','12':'Dez',
};

function toTs(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr + 'T00:00:00').getTime();
}

function fmtBR(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function labelBonito(label) {
  const [mm, yyyy] = (label || '').split('/');
  return mm && yyyy ? `${NOME_MES[mm] ?? mm} ${yyyy}` : label;
}

export function FiltrosBar({
  meses, mesAtivo, onMes,
  categorias, categoriaAtiva, onCategoria,
  statusAtivo, onStatus,
  onRangeChange,
}) {
  const [modo, setModo]          = useState('mes');
  const [rangeInicio, setInicio] = useState('');
  const [rangeFim,    setFim]    = useState('');

  const idxAtivo = meses.findIndex(m => m.label === mesAtivo);

  function navMes(delta) {
    const novoIdx = idxAtivo + delta;
    if (novoIdx >= 0 && novoIdx < meses.length) onMes(meses[novoIdx].label);
  }

  function handleModo(m) {
    setModo(m);
    if (m === 'mes') { setInicio(''); setFim(''); onRangeChange?.(null, null); }
    else onRangeChange?.(toTs(rangeInicio), toTs(rangeFim));
  }

  function handleInicio(v) { setInicio(v); onRangeChange?.(toTs(v), toTs(rangeFim)); }
  function handleFim(v)    { setFim(v);    onRangeChange?.(toTs(rangeInicio), toTs(v)); }

  const inputCls = "rounded-lg bg-slate-900 border border-white/10 text-slate-300 text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 [color-scheme:dark]";

  return (
    <div className="flex flex-col gap-3">

      {/* ── Linha 1: Navegação de mês compacta ─────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Toggle Mês / Período */}
        <div className="flex bg-slate-800/80 border border-white/[0.06] rounded-xl p-0.5 gap-0.5">
          {[
            { id: 'mes',     label: 'Mês a mês'  },
            { id: 'periodo', label: 'Período', Icon: CalendarRange },
          ].map(o => (
            <button key={o.id} onClick={() => handleModo(o.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                modo === o.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}>
              {o.Icon && <o.Icon size={12} />}
              {o.label}
            </button>
          ))}
        </div>

        {/* Navegação compacta de mês — estilo banco digital */}
        {modo === 'mes' && meses.length > 0 && (
          <div className="flex items-center gap-1 bg-slate-900 border border-white/[0.07] rounded-xl px-1 py-1">
            <button
              onClick={() => navMes(1)}
              disabled={idxAtivo >= meses.length - 1}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] disabled:opacity-20 transition-all"
              title="Mês anterior"
            >
              <ChevronLeft size={14} />
            </button>

            {/* Mês ativo — select para navegação rápida */}
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
              title="Próximo mês"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Range de datas */}
        {modo === 'periodo' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">De</span>
            <input type="date" value={rangeInicio} onChange={e => handleInicio(e.target.value)} className={inputCls} />
            <span className="text-xs text-slate-500">até</span>
            <input type="date" value={rangeFim} min={rangeInicio} onChange={e => handleFim(e.target.value)} className={inputCls} />
            {(rangeInicio || rangeFim) && (
              <button onClick={() => { setInicio(''); setFim(''); onRangeChange?.(null, null); }}
                className="text-xs text-slate-500 hover:text-slate-300 underline">Limpar</button>
            )}
          </div>
        )}
      </div>

      {/* ── Linha 2: Categoria + Status ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-slate-600">
          <Tag size={11} /> Categoria:
        </span>
        {['Todas', ...categorias].map(cat => {
          const val  = cat === 'Todas' ? 'all' : cat;
          const ativo = categoriaAtiva === val;
          return (
            <button key={val} onClick={() => onCategoria(val)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                ativo
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'bg-slate-800 border-white/[0.07] text-slate-500 hover:text-slate-300 hover:border-emerald-600/40'
              }`}>
              {val === 'all' && <LayoutList size={10} className="inline mr-1" />}
              {cat}
            </button>
          );
        })}

        <span className="w-px h-3.5 bg-white/10 mx-0.5" />

        {[
          { val: 'all',      label: 'Todos',    Icon: LayoutList   },
          { val: 'pago',     label: 'Pago',     Icon: CheckCircle2 },
          { val: 'pendente', label: 'Pendente', Icon: Clock        },
        ].map(({ val, label, Icon }) => (
          <button key={val} onClick={() => onStatus(val)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
              statusAtivo === val
                ? val === 'pago'     ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400'
                : val === 'pendente' ? 'bg-orange-600/20 border-orange-500 text-orange-400'
                                     : 'bg-slate-600 border-slate-500 text-white'
                : 'bg-slate-800 border-white/[0.07] text-slate-500 hover:text-slate-300'
            }`}>
            <Icon size={10} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
