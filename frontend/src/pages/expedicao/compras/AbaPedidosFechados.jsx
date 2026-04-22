/**
 * @file AbaPedidosFechados.jsx
 * @module expedicao/compras
 * @description Lista pedidos fechados via XML NF-e em tabela limpa.
 *   Colunas: Pedido, Fornecedor, NF, Valor NF, Data Fechamento, Status, Produtos, Ações.
 * @version 2.0.0
 * @date 2026-04-22
 * @changelog
 *   2.0.0 — 2026-04-22 — Redesign: tabela com colunas Valor NF e Data Fechamento visíveis.
 *   1.0.0 — 2026-04-12 — Versão inicial com cards expandíveis.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, ChevronDown, FileCheck, DollarSign,
  CheckCircle2, ExternalLink, Loader2, Package,
} from 'lucide-react';
import { BRL, shortId, formatData, formatDataCurta } from './helpers.js';
import ModalLancarFinanceiro from './ModalLancarFinanceiro.jsx';

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

export default function AbaPedidosFechados({ onShowToast }) {
  const [pedidos,   setPedidos]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState(new Set());
  const [pedidoFin, setPedidoFin] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch('/api/purchase-orders?status=fechado&limit=50').then(r => r.json());
      setPedidos(data.items || []);
    } catch { onShowToast('Erro ao carregar pedidos fechados', 'err'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function toggleExpand(id) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function handleLancado(pedidoId, despesaId) {
    setPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, finDespesaId: despesaId } : p));
    setPedidoFin(null);
    onShowToast('Lançamento criado no Financeiro! ✅', 'ok');
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24 gap-2 text-slate-500">
      <Loader2 size={18} className="animate-spin" /> Carregando pedidos fechados...
    </div>
  );

  if (!pedidos.length) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <FileCheck size={36} className="text-slate-700" />
      <p className="text-slate-500 text-sm">Nenhum pedido fechado ainda.</p>
      <p className="text-slate-600 text-xs">Importe um XML NF-e em "Pedidos Abertos".</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''} fechado{pedidos.length !== 1 ? 's' : ''}</span>
        <button onClick={carregar} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-emerald-500/10 overflow-hidden bg-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-slate-900/50">
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Pedido</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Fornecedor</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">NF</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Valor NF</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Fechamento</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Produtos</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => {
                const items    = p.items || [];
                const totalQty = items.reduce((s, x) => s + Number(x.qty), 0);
                const isOpen   = expanded.has(p.id);
                const jaLancou = !!p.finDespesaId;
                const itensSemSku = items.filter(it => !it.custoUnitario);

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

                      {/* Fornecedor */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-300 truncate block max-w-[140px]">{p.fornecedor || '—'}</span>
                      </td>

                      {/* NF */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {p.notaFiscalNumero ? (
                          <span className="text-xs text-slate-400">
                            {p.notaFiscalNumero}
                            {p.notaFiscalSerie && <span className="text-slate-600"> · S{p.notaFiscalSerie}</span>}
                          </span>
                        ) : <span className="text-xs text-slate-600">—</span>}
                      </td>

                      {/* Valor NF */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {p.valorTotal > 0
                          ? <span className="text-sm font-black text-emerald-400">{BRL.format(p.valorTotal)}</span>
                          : <span className="text-xs text-slate-600">—</span>
                        }
                      </td>

                      {/* Data Fechamento */}
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {p.dataFechamento ? formatDataCurta(p.dataFechamento) : '—'}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs border border-emerald-500/20 w-fit whitespace-nowrap">
                            <FileCheck size={9} /> Fechado
                          </span>
                          {jaLancou && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 text-xs border border-violet-500/20 w-fit whitespace-nowrap">
                              <CheckCircle2 size={9} /> Financeiro
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Produtos */}
                      <td className="px-4 py-3">
                        <button onClick={() => toggleExpand(p.id)}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap">
                          {items.length} prod. · {totalQty} un.
                          <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          {!jaLancou ? (
                            <button onClick={() => setPedidoFin(p)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-violet-600/10 text-violet-400 border border-violet-500/20 hover:bg-violet-600/20 transition-colors whitespace-nowrap">
                              <DollarSign size={11} /> Lançar
                            </button>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap">
                              <CheckCircle2 size={10} className="text-emerald-400" /> Lançado
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Linha expansível — itens do pedido */}
                    {isOpen && (
                      <tr>
                        <td colSpan={8} className="p-0">
                          <div className="bg-slate-900/50 border-b border-white/[0.04]">
                            <div className="grid grid-cols-[28px_1fr_64px_96px] gap-3 px-6 py-2 text-xs text-slate-600 font-bold uppercase tracking-wide border-b border-white/[0.03]">
                              <span />
                              <span>Produto</span>
                              <span className="text-right">Qtd</span>
                              <span className="text-right">Custo Un.</span>
                            </div>
                            {items.map((it, ii) => (
                              <div key={ii} className="grid grid-cols-[28px_1fr_64px_96px] gap-3 items-center px-6 py-2.5 border-b border-white/[0.03] last:border-0">
                                <ProductImg src={it.image} size={28} />
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-200 truncate">{it.name}</p>
                                  <p className="text-xs text-slate-500">{it.sku}</p>
                                </div>
                                <span className="text-xs text-slate-400 text-right">{it.qty} un.</span>
                                <span className="text-xs font-semibold text-right">
                                  {it.custoUnitario
                                    ? <span className="text-slate-300">{BRL.format(it.custoUnitario)}</span>
                                    : <span className="text-slate-600">—</span>
                                  }
                                </span>
                              </div>
                            ))}

                            {itensSemSku.length > 0 && (
                              <div className="px-6 py-3 border-t border-white/[0.04] bg-amber-500/5 flex items-center gap-3">
                                <p className="text-xs text-amber-400 font-semibold flex items-center gap-1">
                                  <Package size={11} /> {itensSemSku.length} item{itensSemSku.length !== 1 ? 'ns' : ''} sem SKU
                                </p>
                                <a href="/spa/catalogo/admin"
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors">
                                  <ExternalLink size={11} /> Cadastrar no Catálogo
                                </a>
                              </div>
                            )}
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

      {/* Modal Lançar no Financeiro */}
      {pedidoFin && (
        <ModalLancarFinanceiro
          pedido={pedidoFin}
          onClose={() => setPedidoFin(null)}
          onLancado={(despesaId) => handleLancado(pedidoFin.id, despesaId)}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
}
