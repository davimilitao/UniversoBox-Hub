/**
 * @file FiltrosBar.jsx
 * @module financeiro
 * @description Filtros de mês (abas) + período customizado (range) + categoria + status.
 *              Modo "Mês": navega mês a mês. Modo "Período": range de/até livre.
 * @version 2.0.0
 * @date 2026-04-01
 * @author UniversoLab
 *
 * @changelog
 *   2.0.0 — 2026-04-01 — Range de datas + Lucide icons + input nativo.
 *   1.0.0 — 2026-04-01 — Criação inicial com abas e chips.
 */

import { useState } from 'react';
import {
  CalendarDays, CalendarRange, Tag, CheckCircle2, Clock, LayoutList,
} from 'lucide-react';

const NOME_MES = {
  '01':'Jan','02':'Fev','03':'Mar','04':'Abr',
  '05':'Mai','06':'Jun','07':'Jul','08':'Ago',
  '09':'Set','10':'Out','11':'Nov','12':'Dez',
};

// Converte YYYY-MM-DD (input date) → timestamp início do dia
function toTs(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr + 'T00:00:00').getTime();
}

// Converte YYYY-MM-DD → DD/MM/YYYY para exibição
function fmtBR(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export function FiltrosBar({
  meses, mesAtivo, onMes,
  categorias, categoriaAtiva, onCategoria,
  statusAtivo, onStatus,
  onRangeChange, // (inicio: timestamp|null, fim: timestamp|null) => void
}) {
  const [modo, setModo]           = useState('mes');     // 'mes' | 'periodo'
  const [rangeInicio, setInicio]  = useState('');
  const [rangeFim,    setFim]     = useState('');

  function handleModo(m) {
    setModo(m);
    if (m === 'mes') {
      // Volta para modo mês — limpa range
      setInicio(''); setFim('');
      onRangeChange?.(null, null);
    } else {
      // Modo período — desativa filtro de mês
      onRangeChange?.(toTs(rangeInicio), toTs(rangeFim));
    }
  }

  function handleInicio(v) {
    setInicio(v);
    onRangeChange?.(toTs(v), toTs(rangeFim));
  }

  function handleFim(v) {
    setFim(v);
    onRangeChange?.(toTs(rangeInicio), toTs(v));
  }

  const inputCls = "rounded-lg bg-slate-900 border border-white/10 text-slate-300 text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 [color-scheme:dark]";

  return (
    <div className="flex flex-col gap-3">

      {/* ── Toggle Mês / Período ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleModo('mes')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
            ${modo === 'mes'
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-white/10'}`}
        >
          <CalendarDays size={14} />
          Mês a mês
        </button>
        <button
          onClick={() => handleModo('periodo')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
            ${modo === 'periodo'
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-white/10'}`}
        >
          <CalendarRange size={14} />
          Período
        </button>
      </div>

      {/* ── Abas de mês ─────────────────────────────────────────────────── */}
      {modo === 'mes' && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {meses.map(m => {
            const [mm, yyyy] = m.label.split('/');
            const label = mm && yyyy ? `${NOME_MES[mm] ?? mm} ${yyyy}` : m.label;
            const ativo = m.label === mesAtivo;
            return (
              <button
                key={m.label}
                onClick={() => onMes(m.label)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${ativo
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-white/5'}`}
              >
                <CalendarDays size={13} className="opacity-70" />
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Range de datas ───────────────────────────────────────────────── */}
      {modo === 'periodo' && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">De</span>
            <input
              type="date"
              value={rangeInicio}
              onChange={e => handleInicio(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">até</span>
            <input
              type="date"
              value={rangeFim}
              min={rangeInicio}
              onChange={e => handleFim(e.target.value)}
              className={inputCls}
            />
          </div>
          {(rangeInicio || rangeFim) && (
            <span className="text-xs text-emerald-500">
              {rangeInicio && rangeFim
                ? `${fmtBR(rangeInicio)} → ${fmtBR(rangeFim)}`
                : rangeInicio
                  ? `A partir de ${fmtBR(rangeInicio)}`
                  : `Até ${fmtBR(rangeFim)}`}
            </span>
          )}
          {(rangeInicio || rangeFim) && (
            <button
              onClick={() => { setInicio(''); setFim(''); onRangeChange?.(null, null); }}
              className="text-xs text-slate-500 hover:text-slate-300 underline"
            >
              Limpar
            </button>
          )}
        </div>
      )}

      {/* ── Categoria + Status ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Ícone label */}
        <span className="flex items-center gap-1 text-xs text-slate-600">
          <Tag size={12} /> Categoria:
        </span>

        {/* Chips de categoria */}
        {['Todas', ...categorias].map(cat => {
          const val  = cat === 'Todas' ? 'all' : cat;
          const ativo = categoriaAtiva === val;
          return (
            <button
              key={val}
              onClick={() => onCategoria(val)}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors border
                ${ativo
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'bg-slate-800 border-white/10 text-slate-400 hover:border-emerald-600/50 hover:text-slate-200'}`}
            >
              {val === 'all' && <LayoutList size={11} />}
              {cat}
            </button>
          );
        })}

        <span className="w-px h-4 bg-white/10 mx-1" />

        {/* Status */}
        {[
          { val: 'all',      label: 'Todos',    Icon: LayoutList   },
          { val: 'pago',     label: 'Pago',     Icon: CheckCircle2 },
          { val: 'pendente', label: 'Pendente', Icon: Clock        },
        ].map(({ val, label, Icon }) => (
          <button
            key={val}
            onClick={() => onStatus(val)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors border
              ${statusAtivo === val
                ? val === 'pago'
                  ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400'
                  : val === 'pendente'
                    ? 'bg-orange-600/20 border-orange-500 text-orange-400'
                    : 'bg-slate-600 border-slate-500 text-white'
                : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'}`}
          >
            <Icon size={11} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
