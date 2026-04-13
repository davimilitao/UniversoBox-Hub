/**
 * @file AbaACaminho.jsx
 * @module expedicao/compras
 * @description Aba de itens em trânsito — lista, confirma recebimento e detecta atrasos.
 * @version 1.0.0
 * @date 2026-04-12
 * @changelog
 *   1.0.0 — 2026-04-12 — Extraído de Compras.jsx (sem alterações de lógica).
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Truck, AlertTriangle, CheckCircle2, RefreshCw, Loader2, X,
} from 'lucide-react';
import { diasEmTransito } from './helpers.js';

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

export default function AbaACaminho({ onShowToast }) {
  const [items,    setItems]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [recebido, setRecebido] = useState(null); // { item, qtyInput }

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch('/api/transit').then(r => r.json());
      setItems(data.items || []);
    } catch { onShowToast('Erro ao carregar trânsito', 'err'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function confirmarRecebido() {
    if (!recebido) return;
    const { item, qtyInput } = recebido;
    const qtyReal = Math.max(1, Number(qtyInput) || item.qtyComprada);
    const diverge = qtyReal !== Number(item.qtyComprada);
    try {
      const res = await fetch(`/api/transit/${item.id}/received`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qtyRecebida: qtyReal }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      if (item.compraId) {
        await fetch(`/api/purchase-orders/${item.compraId}/transit-status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku: item.sku, status: 'received' }),
        });
      }
      setRecebido(null);
      setItems(prev => prev.filter(i => i.id !== item.id));
      const diasMsg = data.diasEmTransito != null ? ` · ${data.diasEmTransito}d em trânsito` : '';
      const divMsg  = diverge ? ` ⚠ Divergência: esp. ${item.qtyComprada}, rec. ${qtyReal}` : '';
      onShowToast(`${item.name?.split(' ')[0]} recebido${diasMsg}${divMsg} ✅`, diverge ? 'err' : 'ok');
    } catch (err) { onShowToast(`Erro: ${err.message}`, 'err'); }
  }

  const totalUn   = items.reduce((s, i) => s + Number(i.qtyComprada || 0), 0);
  const atrasados = items.filter(i => diasEmTransito(i.dataACaminho) >= 7).length;

  if (loading) return (
    <div className="flex items-center justify-center py-24 gap-2 text-slate-500">
      <Loader2 size={18} className="animate-spin" /> Carregando...
    </div>
  );

  if (!items.length) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <Truck size={36} className="text-slate-700" />
      <p className="text-slate-500">Nenhum item em trânsito.</p>
      <p className="text-slate-600 text-sm">Marque um item como "A Caminho" nos Pedidos Abertos.</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Resumo */}
      <div className="flex items-center gap-6 px-1">
        <div>
          <span className="text-2xl font-black text-slate-100">{items.length}</span>
          <span className="ml-1 text-xs text-slate-500">item{items.length !== 1 ? 's' : ''} em trânsito</span>
        </div>
        <div>
          <span className="text-2xl font-black text-slate-100">{totalUn}</span>
          <span className="ml-1 text-xs text-slate-500">unidades</span>
        </div>
        {atrasados > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30">
            <AlertTriangle size={13} className="text-red-400" />
            <span className="text-xs font-bold text-red-400">{atrasados} atrasado{atrasados !== 1 ? 's' : ''} +7d</span>
          </div>
        )}
        <button onClick={carregar} className="ml-auto p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.05] transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map(item => {
          const dias     = diasEmTransito(item.dataACaminho);
          const atrasado = dias >= 7;
          const rapido   = dias <= 2;
          const label    = dias === 0 ? 'Saiu hoje' : dias === 1 ? '1 dia' : `${dias} dias`;
          return (
            <div key={item.id}
              className={`rounded-xl bg-slate-800 border p-4 flex flex-col gap-3 ${
                atrasado ? 'border-red-500/50' : 'border-white/5'
              }`}>
              <div className="flex gap-3">
                <ProductImg src={item.image} size={52} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-100 line-clamp-2 leading-snug">{item.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.marca || ''}</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold text-slate-300">{item.qtyComprada} un.</span>
                {item.modalidade && (
                  <span className="px-2 py-0.5 rounded-full bg-slate-700 border border-white/10">{item.modalidade}</span>
                )}
              </div>
              <div className="flex gap-1">
                <div className="flex-1 h-1 rounded-full bg-blue-500" />
                <div className="flex-1 h-1 rounded-full bg-blue-500" />
                <div className="flex-1 h-1 rounded-full bg-slate-700" />
              </div>
              <div className={`text-xs font-bold ${atrasado ? 'text-red-400' : rapido ? 'text-emerald-400' : 'text-slate-400'}`}>
                {label}{atrasado ? ' ⚠' : ''}
              </div>
              <button
                onClick={() => setRecebido({ item, qtyInput: String(item.qtyComprada) })}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 transition-colors text-xs font-bold">
                <CheckCircle2 size={13} /> Confirmar Recebimento
              </button>
            </div>
          );
        })}
      </div>

      {/* Modal confirmar recebido */}
      {recebido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setRecebido(null)}>
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-100">Confirmar Recebimento</h3>
              <button onClick={() => setRecebido(null)} className="text-slate-500 hover:text-slate-300">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-slate-300 mb-1 font-medium truncate">{recebido.item.name}</p>
            <p className="text-xs text-slate-500 mb-4">{recebido.item.marca || ''} · {recebido.item.qtyComprada} un. esperadas</p>
            <label className="block text-xs text-slate-500 mb-1">Quantidade recebida</label>
            <input
              type="number" min="1" autoFocus
              value={recebido.qtyInput}
              onChange={e => setRecebido(r => ({ ...r, qtyInput: e.target.value }))}
              className="w-full rounded-lg bg-slate-800 border border-white/10 text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 mb-4"
            />
            {Number(recebido.qtyInput) !== Number(recebido.item.qtyComprada) && (
              <div className="flex items-center gap-2 text-xs text-orange-400 mb-3 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
                <AlertTriangle size={12} />
                Divergência: esperado {recebido.item.qtyComprada}, informado {recebido.qtyInput}
              </div>
            )}
            <button
              onClick={confirmarRecebido}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors">
              ✅ Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
