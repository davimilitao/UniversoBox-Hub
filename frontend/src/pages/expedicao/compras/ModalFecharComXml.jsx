/**
 * @file ModalFecharComXml.jsx
 * @module expedicao/compras
 * @description Modal de 3 etapas para fechar pedido via XML NF-e de entrada.
 *   Etapa 1: upload do XML → Etapa 2: matching e revisão → Etapa 3: confirmação.
 * @version 1.0.0
 * @date 2026-04-12
 * @changelog
 *   1.0.0 — 2026-04-12 — Criação; suporta nfeProc e NFe puro; EAN SEM GTIN tratado.
 */

import { useState, useRef } from 'react';
import {
  X, Upload, AlertTriangle, CheckCircle2, Loader2,
  ArrowRight, FileCheck, Package,
} from 'lucide-react';
import { BRL, shortId } from './helpers.js';

// ─── Algoritmo de matching cliente-side ──────────────────────────────────────
function matchItens(itensXml, itensPedido) {
  return itensXml.map(itemXml => {
    // 1. Tenta match por EAN
    if (itemXml.ean) {
      const match = itensPedido.find(p => p.ean && String(p.ean) === String(itemXml.ean));
      if (match) return { ...itemXml, sku: match.sku, matchTipo: 'ean', matchNome: match.name };
    }
    // 2. Fallback: match por código (cProd == SKU)
    const matchCod = itensPedido.find(p => p.sku && String(p.sku) === String(itemXml.codigo));
    if (matchCod) return { ...itemXml, sku: matchCod.sku, matchTipo: 'codigo', matchNome: matchCod.name };
    // 3. Sem match
    return { ...itemXml, sku: null, matchTipo: 'none', matchNome: null };
  });
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ModalFecharComXml({ pedido, onClose, onFechado, onShowToast }) {
  const [etapa,         setEtapa]         = useState(1); // 1 | 2 | 3
  const [carregando,    setCarregando]    = useState(false);
  const [erro,          setErro]          = useState('');
  const [nfData,        setNfData]        = useState(null);    // { numero, serie, fornecedor, cnpj, valorTotal, dataEmissao }
  const [itensMatched,  setItensMatched]  = useState([]);      // itensXml c/ campo sku, matchTipo
  const [confirmando,   setConfirmando]   = useState(false);
  const fileRef = useRef(null);

  const itensPedido = pedido.items || [];

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErro('');
    setCarregando(true);
    try {
      const form = new FormData();
      form.append('xml', file);
      const res  = await fetch('/api/compras/parse-xml', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao processar XML');

      const matched = matchItens(data.itens || [], itensPedido);
      setNfData(data.nf);
      setItensMatched(matched);
      setEtapa(2);
    } catch (err) {
      setErro(err.message || 'Arquivo inválido ou estrutura de NF-e não reconhecida.');
    } finally {
      setCarregando(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function setSkuManual(index, sku) {
    setItensMatched(prev => prev.map((it, i) => i === index ? { ...it, sku, matchTipo: sku ? 'manual' : 'none' } : it));
  }

  async function confirmarFechamento() {
    setConfirmando(true);
    try {
      const res = await fetch(`/api/compras/${pedido.id}/fechar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valorTotal:       nfData.valorTotal,
          fornecedor:       nfData.fornecedor,
          fornecedorCnpj:   nfData.cnpj,
          notaFiscalNumero: nfData.numero,
          notaFiscalSerie:  nfData.serie,
          itensXml: itensMatched.map(it => ({
            sku:           it.sku || null,
            ean:           it.ean || null,
            descricao:     it.descricao,
            qty:           it.qty,
            custoUnitario: it.custoUnitario,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao fechar pedido');
      onFechado(pedido.id);
    } catch (err) {
      onShowToast(`Erro: ${err.message}`, 'err');
    } finally {
      setConfirmando(false);
    }
  }

  const comMatch   = itensMatched.filter(i => i.sku).length;
  const semMatch   = itensMatched.filter(i => !i.sku).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <FileCheck size={18} className="text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-100">Fechar Pedido via XML NF-e</h3>
              <p className="text-xs text-slate-500">Pedido {shortId(pedido.id)} · {itensPedido.length} produto{itensPedido.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Indicador de etapas */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-white/[0.04]">
          {[
            { n: 1, label: 'Upload XML' },
            { n: 2, label: 'Revisão'    },
            { n: 3, label: 'Confirmar'  },
          ].map(({ n, label }, i) => (
            <div key={n} className="flex items-center gap-2">
              {i > 0 && <ArrowRight size={12} className="text-slate-700" />}
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                etapa === n
                  ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                  : etapa > n
                  ? 'bg-slate-800 text-slate-400 border border-white/10'
                  : 'text-slate-600'
              }`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${
                  etapa > n ? 'bg-emerald-600 text-white' : etapa === n ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-500'
                }`}>{etapa > n ? '✓' : n}</span>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Conteúdo por etapa */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── ETAPA 1: Upload ──────────────────────────────────────────── */}
          {etapa === 1 && (
            <div className="flex flex-col items-center gap-5 py-6">
              <div className="w-16 h-16 rounded-2xl bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center">
                <Upload size={28} className="text-emerald-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-200">Selecione o arquivo XML da NF-e</p>
                <p className="text-xs text-slate-500 mt-1">Formato NF-e padrão SEFAZ (.xml) · Máx. 2 MB</p>
              </div>

              <label className="cursor-pointer">
                <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml"
                  className="hidden" onChange={handleFileChange} disabled={carregando} />
                <div className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
                  carregando
                    ? 'bg-slate-700 text-slate-500 cursor-wait'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                }`}>
                  {carregando ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                  {carregando ? 'Processando...' : 'Selecionar XML'}
                </div>
              </label>

              {erro && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs max-w-sm">
                  <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                  {erro}
                </div>
              )}
            </div>
          )}

          {/* ── ETAPA 2: Matching ────────────────────────────────────────── */}
          {etapa === 2 && nfData && (
            <div className="flex flex-col gap-4">
              {/* Dados da NF */}
              <div className="rounded-xl bg-slate-800 border border-white/5 p-4 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500">NF</p>
                  <p className="text-sm font-bold text-slate-100">{nfData.numero} · Série {nfData.serie}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Valor Total</p>
                  <p className="text-sm font-bold text-emerald-400">{BRL.format(nfData.valorTotal)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500">Fornecedor</p>
                  <p className="text-sm font-semibold text-slate-200">{nfData.fornecedor}</p>
                </div>
              </div>

              {/* Legenda */}
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1 text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Match por EAN</span>
                <span className="flex items-center gap-1 text-orange-400"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> Match por código</span>
                <span className="flex items-center gap-1 text-red-400"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Sem match</span>
              </div>

              {/* Lista de itens */}
              <div className="flex flex-col gap-1.5">
                {itensMatched.map((it, idx) => (
                  <div key={idx} className={`rounded-xl border p-3 ${
                    it.matchTipo === 'ean'    ? 'bg-emerald-500/5 border-emerald-500/20'  :
                    it.matchTipo === 'codigo' || it.matchTipo === 'manual' ? 'bg-orange-500/5 border-orange-500/20' :
                    'bg-red-500/5 border-red-500/20'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                        it.matchTipo === 'ean'    ? 'bg-emerald-500' :
                        it.matchTipo === 'codigo' || it.matchTipo === 'manual' ? 'bg-orange-500' :
                        'bg-red-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-200 truncate">{it.descricao}</p>
                          <span className="text-xs text-slate-400 flex-shrink-0">{it.qty} un. · {BRL.format(it.custoUnitario)}/un.</span>
                        </div>
                        <p className="text-xs text-slate-500">Cód: {it.codigo}{it.ean ? ` · EAN: ${it.ean}` : ' · SEM EAN'}</p>
                        {it.sku ? (
                          <p className={`text-xs mt-1 ${it.matchTipo === 'ean' ? 'text-emerald-400' : 'text-orange-400'}`}>
                            ↳ {it.matchNome || it.sku} (SKU: {it.sku})
                          </p>
                        ) : (
                          <div className="mt-1.5">
                            <select
                              className="text-xs bg-slate-800 border border-red-500/30 text-slate-300 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-red-500/50"
                              value=""
                              onChange={e => setSkuManual(idx, e.target.value || null)}>
                              <option value="">— Sem match — vincular manualmente</option>
                              {itensPedido.map(p => (
                                <option key={p.sku} value={p.sku}>{p.name} ({p.sku})</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Resumo */}
              <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
                <span className="text-emerald-400 font-bold">{comMatch} com match</span>
                {semMatch > 0 && <span className="text-red-400">{semMatch} sem match (não atualizarão estoque)</span>}
              </div>
            </div>
          )}

          {/* ── ETAPA 3: Confirmação ─────────────────────────────────────── */}
          {etapa === 3 && nfData && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  <p className="text-sm font-bold text-slate-100">Resumo do Fechamento</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">NF-e</p>
                    <p className="font-semibold text-slate-200">{nfData.numero} · Série {nfData.serie}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Valor Total</p>
                    <p className="font-bold text-emerald-400">{BRL.format(nfData.valorTotal)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500">Fornecedor</p>
                    <p className="font-semibold text-slate-200">{nfData.fornecedor}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Itens com match</p>
                    <p className="font-bold text-emerald-400">{comMatch} SKU{comMatch !== 1 ? 's' : ''} terão estoque atualizado</p>
                  </div>
                  {semMatch > 0 && (
                    <div>
                      <p className="text-xs text-slate-500">Sem match</p>
                      <p className="font-bold text-orange-400">{semMatch} item{semMatch !== 1 ? 'ns' : ''} não atualizarão estoque</p>
                    </div>
                  )}
                </div>
              </div>

              {semMatch > 0 && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs">
                  <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                  {semMatch} item{semMatch !== 1 ? 'ns' : ''} do XML não foram vinculados a nenhum SKU. Eles serão registrados na NF mas não incrementarão o estoque.
                </div>
              )}

              <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs">
                <Package size={13} className="flex-shrink-0 mt-0.5" />
                Após confirmar, o pedido será marcado como fechado e o estoque dos SKUs vinculados será incrementado automaticamente.
              </div>
            </div>
          )}
        </div>

        {/* Footer com ações */}
        <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 border border-white/10 hover:border-white/20 transition-colors">
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            {etapa > 1 && (
              <button onClick={() => setEtapa(e => e - 1)} disabled={confirmando}
                className="px-4 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200 border border-white/10 transition-colors disabled:opacity-50">
                ← Voltar
              </button>
            )}
            {etapa === 2 && (
              <button onClick={() => setEtapa(3)}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors">
                Revisar → Confirmar
              </button>
            )}
            {etapa === 3 && (
              <button onClick={confirmarFechamento} disabled={confirmando}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors disabled:opacity-60">
                {confirmando ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                {confirmando ? 'Fechando...' : 'Confirmar e Fechar Pedido'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
