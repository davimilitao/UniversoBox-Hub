/**
 * @file AbaPedidosFechados.jsx
 * @module expedicao/compras
 * @description Lista pedidos fechados via XML NF-e. Exibe valor, fornecedor,
 *   itens com custo unitário e CTA para lançar no Financeiro.
 * @version 1.0.0
 * @date 2026-04-12
 * @changelog
 *   1.0.0 — 2026-04-12 — Criação.
 */

import { useState, useEffect, useCallback } from 'react';
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
  const [pedidos,      setPedidos]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [expanded,     setExpanded]     = useState(new Set());
  const [pedidoFin,    setPedidoFin]    = useState(null); // pedido para lançar no financeiro

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

      {pedidos.map((p) => {
        const items    = p.items || [];
        const totalQty = items.reduce((s, x) => s + Number(x.qty), 0);
        const isOpen   = expanded.has(p.id);
        const jaLancou = !!p.finDespesaId;

        // SKUs sem match (sem custoUnitario = vieram do XML sem match)
        // Os itens que têm custoUnitario são os que tiveram match
        const itensSemSku = items.filter(it => !it.custoUnitario);

        return (
          <div key={p.id} className="rounded-xl bg-slate-800 border border-emerald-500/10 overflow-hidden">
            {/* Cabeçalho */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-300">Pedido {shortId(p.id)}</span>
                  {/* Badge "Fechado" */}
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-xs border border-emerald-500/20">
                    <FileCheck size={9} /> Fechado
                  </span>
                  {p.modalidade && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-xs border border-blue-500/20">{p.modalidade}</span>
                  )}
                  {jaLancou && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 text-xs border border-violet-500/20">
                      <CheckCircle2 size={9} /> Lançado no Financeiro
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {p.notaFiscalNumero && (
                    <span className="text-xs text-slate-500">NF {p.notaFiscalNumero} · Série {p.notaFiscalSerie || '—'}</span>
                  )}
                  {p.fornecedor && (
                    <span className="text-xs text-slate-500 truncate max-w-48">{p.fornecedor}</span>
                  )}
                  {p.dataFechamento && (
                    <span className="text-xs text-slate-600">Fechado em {formatDataCurta(p.dataFechamento)}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                {/* Valor total */}
                {p.valorTotal > 0 && (
                  <span className="text-sm font-black text-emerald-400">{BRL.format(p.valorTotal)}</span>
                )}

                {/* CTA Lançar no Financeiro */}
                {!jaLancou ? (
                  <button onClick={() => setPedidoFin(p)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-violet-600/10 text-violet-400 border border-violet-500/20 hover:bg-violet-600/20 transition-colors">
                    <DollarSign size={11} /> Lançar no Financeiro
                  </button>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <CheckCircle2 size={10} className="text-emerald-400" /> Lançado
                  </span>
                )}

                {/* Expandir */}
                <button onClick={() => toggleExpand(p.id)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    isOpen ? 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400' : 'border-white/10 text-slate-500 hover:text-slate-300'
                  }`}>
                  ▸ {items.length} prod. · {totalQty} un.
                  <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* Itens expandíveis */}
            {isOpen && (
              <div className="border-t border-white/5">
                {/* Header da tabela */}
                <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-4 py-2 border-b border-white/[0.04] text-xs text-slate-600 font-semibold uppercase tracking-wide">
                  <span className="w-7" />
                  <span>Produto</span>
                  <span className="text-right">Qtd</span>
                  <span className="text-right">Custo Un.</span>
                </div>
                {items.map((it, ii) => (
                  <div key={ii} className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-4 py-2.5 border-b border-white/[0.04] last:border-0">
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

                {/* CTAs para SKUs novos (sem custoUnitario implica que não tinha no catálogo) */}
                {itensSemSku.length > 0 && (
                  <div className="px-4 py-3 border-t border-white/[0.04] bg-amber-500/5">
                    <p className="text-xs text-amber-400 font-semibold mb-2 flex items-center gap-1">
                      <Package size={11} /> {itensSemSku.length} item{itensSemSku.length !== 1 ? 'ns' : ''} sem SKU no catálogo
                    </p>
                    <a href="/spa/catalogo/admin"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors">
                      <ExternalLink size={11} /> Cadastrar no Catálogo
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

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
