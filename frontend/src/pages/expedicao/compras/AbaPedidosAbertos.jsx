/**
 * @file AbaPedidosAbertos.jsx
 * @module expedicao/compras
 * @description Lista pedidos em aberto (status=pending) em layout de tabela limpa.
 *   Permite enviar itens a caminho e importar XML NF-e para fechar o pedido.
 * @version 2.0.0
 * @date 2026-04-22
 * @changelog
 *   2.0.0 — 2026-04-22 — Redesign: tabela Dorel-inspired (Pedido/Fornecedor/Data/Status/Produtos/Ações).
 *   1.0.0 — 2026-04-12 — Versão inicial com cards expandíveis.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, RotateCcw, FileText, Truck, CheckCircle2,
  ChevronDown, Clock, Upload, Loader2, X, History,
} from 'lucide-react';
import { shortId, formatData, imprimirPDF, DRAFT_KEY } from './helpers.js';
import ModalFecharComXml from './ModalFecharComXml.jsx';

function ProductImg({ src, size = 28 }) {
  const [err, setErr] = useState(false);
  const s = (!err && src && src !== './assets/placeholder.png') ? src : null;
  if (!s) return (
    <div style={{ width: size, height: size }}
      className="rounded bg-slate-700 flex items-center justify-center flex-shrink-0 text-sm">
      📦
    </div>
  );
  return (
    <img src={s} alt="" onError={() => setErr(true)}
      style={{ width: size, height: size }}
      className="rounded object-cover bg-slate-700 flex-shrink-0" />
  );
}

export default function AbaPedidosAbertos({ onShowToast, onTransitAdded, onPedidoFechado }) {
  const [pedidos,      setPedidos]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [expanded,     setExpanded]     = useState(new Set());
  const [modalTransit, setModalTransit] = useState(null);
  const [processando,  setProcessando]  = useState(null);
  const [pedidoXml,    setPedidoXml]    = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch('/api/purchase-orders?status=pending&limit=50').then(r => r.json());
      setPedidos(data.items || []);
    } catch { onShowToast('Erro ao carregar pedidos', 'err'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function toggleExpand(id) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function replicarPedido(pedido) {
    try {
      const atual = JSON.parse(localStorage.getItem(DRAFT_KEY));
      if (atual?.carrinho?.length > 0 && !confirm('Substituir a lista atual pelo pedido replicado?')) return;
    } catch {}
    const replicated = JSON.parse(JSON.stringify(pedido.items || []));
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ carrinho: replicated, modalidade: pedido.modalidade || 'FLEX' }));
    onShowToast(`Lista replicada do Pedido ${shortId(pedido.id)} — vá para Novo Pedido ✓`);
  }

  async function confirmarACaminho() {
    if (!modalTransit) return;
    const { pedido, item, qtyInput } = modalTransit;
    const qtyComprada = Math.max(1, Number(qtyInput) || item.qty);
    setProcessando(item.sku);
    try {
      const res = await fetch('/api/transit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compraId:   pedido.id,
          sku:        item.sku,
          name:       item.name,
          marca:      item.marca,
          image:      item.image,
          ean:        item.ean,
          qtyPedida:  item.qty,
          qtyComprada,
          modalidade: pedido.modalidade || 'FLEX',
          dataPedido: pedido.createdAtMs || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await fetch(`/api/purchase-orders/${pedido.id}/transit-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: item.sku, status: 'sent' }),
      });
      setPedidos(prev => prev.map(p => p.id === pedido.id
        ? { ...p, transitSent: { ...(p.transitSent || {}), [item.sku]: true } }
        : p
      ));
      setModalTransit(null);
      onShowToast(`${item.name?.split(' ')[0]} a caminho 🚚`, 'ok');
      onTransitAdded?.();
    } catch (err) { onShowToast(`Erro: ${err.message}`, 'err'); }
    finally { setProcessando(null); }
  }

  function handlePedidoFechado(pedidoId) {
    setPedidos(prev => prev.filter(p => p.id !== pedidoId));
    onPedidoFechado?.();
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24 gap-2 text-slate-500">
      <Loader2 size={18} className="animate-spin" /> Carregando pedidos...
    </div>
  );

  if (!pedidos.length) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <History size={36} className="text-slate-700" />
      <p className="text-slate-500 text-sm">Nenhum pedido em aberto.</p>
      <p className="text-slate-600 text-xs">Crie um pedido em "Novo Pedido".</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''} aguardando NF</span>
        <button onClick={carregar} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-white/5 overflow-hidden bg-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-slate-900/50">
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Pedido</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Fornecedor</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Data</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Produtos / Qtd</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => {
                const items    = p.items || [];
                const totalQty = p.totalQty || items.reduce((s, x) => s + Number(x.qty), 0);
                const marcas   = p.marcas?.length ? p.marcas : [...new Set(items.map(x => x.marca).filter(m => m && m !== 'N/A'))];
                const isOpen   = expanded.has(p.id);

                return (
                  <React.Fragment key={p.id}>
                    <tr className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">

                      {/* Pedido */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-200">#{shortId(p.id)}</span>
                          {p.modalidade && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-xs border border-blue-500/20">{p.modalidade}</span>
                          )}
                        </div>
                      </td>

                      {/* Fornecedor / Marcas */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {marcas.slice(0, 2).map(m => (
                            <span key={m} className="px-1.5 py-0.5 rounded bg-slate-700 text-xs text-slate-400">{m}</span>
                          ))}
                          {marcas.length > 2 && <span className="text-xs text-slate-500">+{marcas.length - 2}</span>}
                          {!marcas.length && <span className="text-xs text-slate-600">—</span>}
                        </div>
                      </td>

                      {/* Data */}
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {formatData(p.createdAtMs) || p.data || '—'}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 text-xs border border-orange-500/20 whitespace-nowrap">
                          <Clock size={9} /> Aguardando NF
                        </span>
                      </td>

                      {/* Produtos / Qtd */}
                      <td className="px-4 py-3">
                        <button onClick={() => toggleExpand(p.id)}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap">
                          {items.length} prod. · {totalQty} un.
                          <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-end flex-wrap">
                          <button onClick={() => setPedidoXml(p)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-600/20 transition-colors whitespace-nowrap">
                            <Upload size={11} /> Importar XML
                          </button>
                          <button onClick={() => replicarPedido(p)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-slate-500 hover:text-slate-300 border border-white/10 hover:border-white/20 transition-colors">
                            <RotateCcw size={11} /> Replicar
                          </button>
                          <button onClick={() => imprimirPDF(p.id, p.items || [], p.modalidade || 'FLEX')}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-slate-500 hover:text-slate-300 border border-white/10 hover:border-white/20 transition-colors">
                            <FileText size={11} /> PDF
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Linha expansível — itens do pedido */}
                    {isOpen && (
                      <tr>
                        <td colSpan={6} className="p-0">
                          <div className="bg-slate-900/50 border-b border-white/[0.04]">
                            <div className="grid grid-cols-[28px_1fr_64px_120px] gap-3 px-6 py-2 text-xs text-slate-600 font-bold uppercase tracking-wide border-b border-white/[0.03]">
                              <span />
                              <span>Produto</span>
                              <span className="text-right">Qtd</span>
                              <span className="text-right">Status</span>
                            </div>
                            {items.map((it, ii) => {
                              const sent     = (p.transitSent     || {})[it.sku];
                              const received = (p.transitReceived || {})[it.sku];
                              return (
                                <div key={ii} className="grid grid-cols-[28px_1fr_64px_120px] gap-3 items-center px-6 py-2.5 border-b border-white/[0.03] last:border-0">
                                  <ProductImg src={it.image} size={28} />
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-slate-200 truncate">{it.name}</p>
                                    <p className="text-xs text-slate-500">{it.marca || ''}</p>
                                  </div>
                                  <span className="text-xs text-slate-400 text-right">{it.qty} un.</span>
                                  <div className="flex justify-end">
                                    {received ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                                        <CheckCircle2 size={10} /> Recebido
                                      </span>
                                    ) : sent ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 whitespace-nowrap">
                                        <Truck size={10} /> A caminho
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => setModalTransit({ pedido: p, item: it, qtyInput: String(it.qty) })}
                                        disabled={processando === it.sku}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-600/10 text-blue-400 border border-blue-500/20 hover:bg-blue-600/20 transition-colors disabled:opacity-50 whitespace-nowrap">
                                        {processando === it.sku ? <Loader2 size={10} className="animate-spin" /> : <Truck size={10} />}
                                        A caminho
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal A Caminho */}
      {modalTransit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setModalTransit(null)}>
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Truck size={16} className="text-blue-400" /> Marcar A Caminho
              </h3>
              <button onClick={() => setModalTransit(null)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </div>
            <p className="text-sm text-slate-300 mb-1 font-medium truncate">{modalTransit.item.name}</p>
            <p className="text-xs text-slate-500 mb-4">
              {modalTransit.item.marca || ''} · Pedido {shortId(modalTransit.pedido.id)} · {modalTransit.item.qty} un. pedidas
            </p>
            <label className="block text-xs text-slate-500 mb-1">Quantidade que chegou / foi confirmada</label>
            <input type="number" min="1" autoFocus
              value={modalTransit.qtyInput}
              onChange={e => setModalTransit(m => ({ ...m, qtyInput: e.target.value }))}
              className="w-full rounded-lg bg-slate-800 border border-white/10 text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50 mb-4"
            />
            <button onClick={confirmarACaminho}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors">
              🚚 Confirmar
            </button>
          </div>
        </div>
      )}

      {/* Modal fechar com XML */}
      {pedidoXml && (
        <ModalFecharComXml
          pedido={pedidoXml}
          onClose={() => setPedidoXml(null)}
          onFechado={(pedidoId) => {
            setPedidoXml(null);
            handlePedidoFechado(pedidoId);
            onShowToast('Pedido fechado com sucesso! Estoque atualizado. ✅', 'ok');
          }}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
}
