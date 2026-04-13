/**
 * @file AbaInteligencia.jsx
 * @module expedicao/compras
 * @description Dashboard de BI de compras — KPIs, gráficos, lead time e top itens.
 * @version 1.0.0
 * @date 2026-04-12
 * @changelog
 *   1.0.0 — 2026-04-12 — Extraído de Compras.jsx (sem alterações de lógica).
 */

import { useState, useEffect } from 'react';
import { AlertTriangle, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { nomeMes } from './helpers.js';

function ProductImg({ src, size = 40 }) {
  const [err, setErr] = useState(false);
  const s = (!err && src && src !== './assets/placeholder.png') ? src : null;
  if (!s) return (
    <div style={{ width: size, height: size }}
      className="rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0 text-lg">
      📦
    </div>
  );
  return (
    <img src={s} alt="" onError={() => setErr(true)}
      style={{ width: size, height: size }}
      className="rounded-lg object-cover bg-slate-700 flex-shrink-0" />
  );
}

export default function AbaInteligencia() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [abaBI,   setAbaBI]   = useState('pedidos');

  useEffect(() => {
    fetch('/api/compras/bi').then(r => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-24 gap-2 text-slate-500">
      <Loader2 size={18} className="animate-spin" /> Carregando inteligência...
    </div>
  );
  if (!data) return (
    <div className="text-slate-500 text-sm text-center py-12">Sem dados disponíveis.</div>
  );

  const mesAtual    = data.byMonth?.[0];
  const mesAnterior = data.byMonth?.[1];
  const varPedidos  = mesAtual && mesAnterior && mesAnterior.pedidos > 0
    ? Math.round(((mesAtual.pedidos - mesAnterior.pedidos) / mesAnterior.pedidos) * 100) : null;

  const max = Math.max(...(data.byMonth || []).map(m => m.pedidos), 1);

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pedidos (6m)',   value: data.totalPedidos,
            extra: varPedidos !== null
              ? <span className={`flex items-center gap-0.5 text-xs font-bold mt-1 ${varPedidos >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {varPedidos >= 0 ? <TrendingUp size={11}/> : <TrendingDown size={11}/>}
                  {varPedidos >= 0 ? '+' : ''}{varPedidos}% vs mês ant.
                </span> : null },
          { label: 'Unidades (6m)', value: (data.totalUnidades || 0).toLocaleString('pt-BR') },
          { label: 'Em Trânsito',   value: data.emTransito,
            color: data.emTransito > 0 ? 'text-blue-400' : 'text-slate-200' },
        ].map(({ label, value, extra, color }) => (
          <div key={label} className="rounded-xl bg-slate-800 border border-white/5 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-bold">{label}</p>
            <p className={`text-3xl font-black mt-1 ${color || 'text-slate-100'}`}>{value}</p>
            {extra}
          </div>
        ))}
      </div>

      {/* Tabs BI */}
      <div className="flex gap-1 bg-slate-800/80 border border-white/[0.06] rounded-xl p-1 w-fit">
        {[{ id: 'pedidos', label: 'Por pedidos' }, { id: 'itens', label: 'Top itens' }].map(t => (
          <button key={t.id} onClick={() => setAbaBI(t.id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              abaBI === t.id ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-300'
            }`}>{t.label}</button>
        ))}
      </div>

      {abaBI === 'pedidos' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico barras mensais */}
          <div className="rounded-xl bg-slate-800 border border-white/5 p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4">Pedidos por mês</p>
            <div className="flex items-end gap-2 h-24">
              {(data.byMonth || []).slice(0,6).reverse().map(m => {
                const pct = Math.round((m.pedidos / max) * 100);
                return (
                  <div key={m.mes} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-slate-500 font-semibold">{m.pedidos}</span>
                    <div className="w-full bg-slate-700 rounded-sm" style={{ height: 52 }}>
                      <div className="w-full bg-blue-500 rounded-sm transition-all" style={{ height: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-slate-600">{nomeMes(m.mes)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lead time por marca */}
          <div className="rounded-xl bg-slate-800 border border-white/5 p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Lead time por marca</p>
            {(data.leadTime || []).length === 0 ? (
              <p className="text-xs text-slate-600">Confirme recebimentos para ver dados de lead time.</p>
            ) : (data.leadTime || []).slice(0,8).map(l => (
              <div key={l.marca} className="flex items-center gap-2 py-1.5 border-b border-white/[0.04] last:border-0">
                <span className="text-xs font-semibold text-slate-300 flex-1 truncate">{l.marca}</span>
                <span className="text-xs text-slate-600">{l.count} rec.</span>
                <span className={`text-sm font-black w-8 text-right ${l.media >= 7 ? 'text-red-400' : l.media <= 3 ? 'text-emerald-400' : 'text-slate-300'}`}>
                  ~{l.media}d
                </span>
                <span className="text-xs text-slate-600 w-14 text-right">({l.min}–{l.max})</span>
              </div>
            ))}
          </div>

          {/* Top marcas por volume */}
          <div className="rounded-xl bg-slate-800 border border-white/5 p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Volume por marca</p>
            {(data.topMarcas || []).slice(0,6).map((m, i) => (
              <div key={m.marca} className="flex items-center gap-2 py-1.5">
                <span className="text-xs text-slate-600 w-4">{i+1}</span>
                <span className="text-xs font-semibold text-slate-300 flex-1 truncate">{m.marca}</span>
                <span className="text-xs text-slate-500">{m.unidades} un.</span>
              </div>
            ))}
            {!(data.topMarcas || []).length && <p className="text-xs text-slate-600">Sem dados ainda.</p>}
          </div>

          {/* Divergências */}
          {(data.divergencias || []).length > 0 && (
            <div className="rounded-xl bg-slate-800 border border-white/5 p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1">
                <AlertTriangle size={11} className="text-orange-400" /> Divergências recentes
              </p>
              {(data.divergencias || []).slice(0,5).map((d, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5 border-b border-white/[0.04] last:border-0">
                  <span className="text-xs text-slate-300 flex-1 truncate">{d.marca || d.sku}</span>
                  <span className="text-xs text-slate-500">esp. {d.esperada}</span>
                  <span className={`text-xs font-bold ${d.diff < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {d.diff > 0 ? '+' : ''}{d.diff}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {abaBI === 'itens' && (
        <div className="rounded-xl bg-slate-800 border border-white/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-xs text-slate-500">
              Ordenado por volume total de unidades pedidas nos últimos 6 meses · lead time = dias até recebimento
            </p>
          </div>
          {(data.topItens || []).length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">Nenhum item com histórico ainda</div>
          ) : (data.topItens || []).map((item, i) => (
            <div key={item.sku} className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] last:border-0">
              <span className="text-xs text-slate-600 w-5 text-right">{i+1}</span>
              <ProductImg src={item.image} size={32} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-200 truncate">{item.name}</p>
                <p className="text-xs text-slate-500">{item.marca || ''} · SKU: {item.sku}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-black text-slate-100">{item.unidades} un.</p>
                <p className="text-xs text-slate-500">{item.pedidos} pedido{item.pedidos !== 1 ? 's' : ''}</p>
                {item.leadMedia !== null && (
                  <p className={`text-xs font-bold ${item.leadMedia >= 7 ? 'text-red-400' : item.leadMedia <= 3 ? 'text-emerald-400' : 'text-slate-500'}`}>
                    ~{item.leadMedia}d
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
