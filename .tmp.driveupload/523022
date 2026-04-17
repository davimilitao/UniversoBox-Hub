/**
 * @file Compras.jsx
 * @module expedicao
 * @description Gestão de Compras — pedidos de reposição, trânsito e inteligência.
 *   Migrado de compras.html (vanilla JS) para React.
 *   4 abas: A Caminho · Montar Pedido · Histórico · Inteligência
 * @version 1.0.0
 * @date 2026-04-06
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Package, Search, Truck, History, BarChart2,
  X, Plus, Minus, Trash2, RefreshCw, FileText,
  AlertTriangle, CheckCircle2, Clock, ChevronDown,
  RotateCcw, TrendingUp, TrendingDown, ArrowRight,
  Loader2, Inbox,
} from 'lucide-react';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DRAFT_KEY = 'compras_rascunho';
const MODALIDADES = ['FLEX', 'FULL', 'AGÊNCIA'];

// ─── helpers ──────────────────────────────────────────────────────────────────

function shortId(id = '') { return id.split('_').pop() || id; }

function formatData(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function nomeMes(mesAno = '') {
  try {
    return new Date(`${mesAno.slice(0,4)}-${mesAno.slice(4,6)}-01`)
      .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
  } catch { return mesAno; }
}

function diasEmTransito(dataACaminho) {
  if (!dataACaminho) return 0;
  return Math.round((Date.now() - dataACaminho) / 86_400_000);
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Toast({ msg, tipo }) {
  if (!msg) return null;
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border max-w-sm
      ${tipo === 'ok'
        ? 'bg-emerald-900/90 border-emerald-600 text-emerald-300'
        : tipo === 'err'
        ? 'bg-red-900/90 border-red-600 text-red-300'
        : 'bg-slate-800/95 border-white/10 text-slate-200'
      }`}>
      {msg}
    </div>
  );
}

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

// ─── ABA: A CAMINHO ───────────────────────────────────────────────────────────

function AbaACaminho({ onShowToast }) {
  const [items,    setItems]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [recebido, setRecebido] = useState(null); // { item, qtyInput }

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch('/api/transit').then(r => r.json());
      setItems(data.items || []);
    } catch (e) { onShowToast('Erro ao carregar trânsito', 'err'); }
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
      // Atualiza status no purchase-order
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
      <p className="text-slate-600 text-sm">Marque um item como "A Caminho" no Histórico.</p>
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

      {/* Cards carrossel */}
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
              {/* Barra de progresso simples */}
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

// ─── ABA: MONTAR PEDIDO ───────────────────────────────────────────────────────

function AbaMontarPedido({ onShowToast }) {
  const [query,      setQuery]      = useState('');
  const [results,    setResults]    = useState([]);
  const [buscando,   setBuscando]   = useState(false);
  const [carrinho,   setCarrinho]   = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(DRAFT_KEY)); return s?.carrinho || []; } catch { return []; }
  });
  const [modalidade, setModalidade] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY))?.modalidade || 'FLEX'; } catch { return 'FLEX'; }
  });
  const [salvando,   setSalvando]   = useState(false);
  const searchRef = useRef(null);
  const timerRef  = useRef(null);

  // Persiste rascunho
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ carrinho, modalidade })); } catch {}
  }, [carrinho, modalidade]);

  function handleQuery(val) {
    setQuery(val);
    if (val.length < 2) { setResults([]); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const data = await fetch(`/products/search?q=${encodeURIComponent(val)}`).then(r => r.json());
        setResults(data.items || []);
      } catch { setResults([]); }
      finally { setBuscando(false); }
    }, 300);
  }

  function adicionarAoCarrinho(p) {
    if (carrinho.find(i => i.sku === p.sku)) { onShowToast('Produto já está na lista!', 'err'); return; }
    setCarrinho(prev => [...prev, { sku: p.sku, name: p.name, image: p.image || '', marca: p.marca || 'N/A', ean: p.ean || 'N/A', qty: 1 }]);
    setQuery(''); setResults([]);
    onShowToast(`${p.name.split(' ').slice(0,3).join(' ')} adicionado ✓`, 'ok');
  }

  function remover(sku) { setCarrinho(prev => prev.filter(i => i.sku !== sku)); }

  function setQty(sku, val) {
    setCarrinho(prev => prev.map(i => i.sku === sku ? { ...i, qty: Math.max(1, Number(val) || 1) } : i));
  }

  function replicarRascunho() {
    onShowToast(`Rascunho restaurado (${carrinho.length} itens) 💾`);
  }

  async function fecharLista() {
    if (!carrinho.length) { onShowToast('A lista está vazia!', 'err'); return; }
    setSalvando(true);
    try {
      const data = await fetch('/api/compras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: carrinho, modalidade }),
      }).then(r => r.json());
      if (!data.ok) throw new Error(data.error);

      if (data.alertasEmbalagem?.length) {
        data.alertasEmbalagem.forEach((a, i) => setTimeout(() => onShowToast(a, 'err'), i * 1200));
      } else {
        onShowToast('Lista salva com sucesso! ✅', 'ok');
      }

      // Gera PDF em nova aba
      imprimirPDF(data.compraId, carrinho, modalidade);

      setCarrinho([]);
      localStorage.removeItem(DRAFT_KEY);
    } catch (err) {
      onShowToast(`Erro: ${err.message}`, 'err');
    } finally { setSalvando(false); }
  }

  const totalQty = carrinho.reduce((s, i) => s + Number(i.qty), 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Busca */}
      <div className="relative">
        <div className="flex items-center gap-2 rounded-xl bg-slate-800 border border-white/10 px-4 py-3 focus-within:border-emerald-500/50 transition-colors">
          <Search size={16} className="text-slate-500 flex-shrink-0" />
          <input
            ref={searchRef}
            type="text" placeholder="Buscar produto por nome, SKU ou EAN..."
            value={query} onChange={e => handleQuery(e.target.value)}
            className="flex-1 bg-transparent text-slate-100 text-sm placeholder-slate-600 outline-none"
          />
          {buscando && <Loader2 size={14} className="animate-spin text-slate-500" />}
          {query && <button onClick={() => { setQuery(''); setResults([]); }} className="text-slate-600 hover:text-slate-400"><X size={14} /></button>}
        </div>
        {/* Dropdown resultados */}
        {results.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-xl bg-slate-900 border border-white/10 shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
            {results.map(p => (
              <button key={p.sku} onClick={() => adicionarAoCarrinho(p)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] border-b border-white/[0.04] last:border-0 text-left transition-colors">
                <ProductImg src={p.image} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-200 truncate">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.marca || ''} · SKU: {p.sku}</p>
                </div>
                <Plus size={14} className="text-emerald-500 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
        {query.length >= 2 && !buscando && results.length === 0 && (
          <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-xl bg-slate-900 border border-white/10 px-4 py-3 text-xs text-slate-500">
            Nenhum produto encontrado
          </div>
        )}
      </div>

      {/* Modalidade */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500">Modalidade:</span>
        {MODALIDADES.map(m => (
          <button key={m} onClick={() => setModalidade(m)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors border ${
              modalidade === m
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'bg-slate-800 border-white/10 text-slate-500 hover:text-slate-300'
            }`}>{m}</button>
        ))}
      </div>

      {/* Carrinho */}
      {carrinho.length > 0 ? (
        <div className="rounded-xl bg-slate-800 border border-white/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left">
                <th className="px-4 py-3 text-slate-500 font-medium">Produto</th>
                <th className="px-4 py-3 text-slate-500 font-medium hidden sm:table-cell">EAN</th>
                <th className="px-4 py-3 text-slate-500 font-medium text-center">Qtd</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {carrinho.map(item => (
                <tr key={item.sku} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ProductImg src={item.image} size={40} />
                      <div>
                        <p className="text-sm font-semibold text-slate-200 line-clamp-1">{item.name}</p>
                        <p className="text-xs text-slate-500">{item.marca} · {item.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 font-mono hidden sm:table-cell">{item.ean}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex items-center gap-1 bg-slate-900 rounded-lg border border-white/10">
                      <button onClick={() => setQty(item.sku, item.qty - 1)}
                        className="p-1.5 text-slate-500 hover:text-slate-300 disabled:opacity-30"
                        disabled={item.qty <= 1}>
                        <Minus size={12} />
                      </button>
                      <input type="number" min="1" value={item.qty}
                        onChange={e => setQty(item.sku, e.target.value)}
                        className="w-12 text-center bg-transparent text-slate-200 text-sm font-bold outline-none tabular-nums" />
                      <button onClick={() => setQty(item.sku, item.qty + 1)}
                        className="p-1.5 text-slate-500 hover:text-slate-300">
                        <Plus size={12} />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => remover(item.sku)} className="text-slate-600 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10 bg-slate-900/50">
                <td colSpan={4} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500">
                      {carrinho.length} produto{carrinho.length !== 1 ? 's' : ''} · {totalQty} un. · {modalidade}
                    </span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { if (confirm('Limpar a lista atual?')) { setCarrinho([]); localStorage.removeItem(DRAFT_KEY); } }}
                        className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-300 border border-white/10 hover:border-white/20 transition-colors">
                        Limpar
                      </button>
                      <button onClick={fecharLista} disabled={salvando}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors disabled:opacity-60">
                        {salvando ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                        {salvando ? 'Processando...' : 'Fechar & Gerar PDF'}
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="rounded-xl bg-slate-800/50 border border-dashed border-white/10 p-12 flex flex-col items-center gap-3 text-center">
          <Inbox size={32} className="text-slate-700" />
          <p className="text-slate-500 text-sm">Lista vazia. Busque produtos acima.</p>
          {(() => {
            try {
              const s = JSON.parse(localStorage.getItem(DRAFT_KEY));
              if (s?.carrinho?.length > 0) {
                return (
                  <button onClick={() => { setCarrinho(s.carrinho); setModalidade(s.modalidade || 'FLEX'); onShowToast(`Rascunho restaurado (${s.carrinho.length} itens) 💾`); }}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 underline">
                    <RotateCcw size={12} /> Restaurar rascunho ({s.carrinho.length} itens)
                  </button>
                );
              }
            } catch {} return null;
          })()}
        </div>
      )}
    </div>
  );
}

// ─── ABA: HISTÓRICO ───────────────────────────────────────────────────────────

function AbaHistorico({ onShowToast, onTransitAdded }) {
  const [pedidos,   setPedidos]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState(new Set());
  const [modalTransit, setModalTransit] = useState(null); // { pedido, item, qtyInput }
  const [processando, setProcessando]  = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch('/api/purchase-orders?limit=30').then(r => r.json());
      setPedidos(data.items || []);
    } catch { onShowToast('Erro ao carregar histórico', 'err'); }
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
    onShowToast(`Lista replicada do Pedido ${shortId(pedido.id)} — vá para Montar Pedido ✓`);
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
          compraId:     pedido.id,
          sku:          item.sku,
          name:         item.name,
          marca:        item.marca,
          image:        item.image,
          ean:          item.ean,
          qtyPedida:    item.qty,
          qtyComprada,
          modalidade:   pedido.modalidade || 'FLEX',
          dataPedido:   pedido.createdAtMs || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await fetch(`/api/purchase-orders/${pedido.id}/transit-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: item.sku, status: 'sent' }),
      });
      // Atualiza localmente
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

  if (loading) return (
    <div className="flex items-center justify-center py-24 gap-2 text-slate-500">
      <Loader2 size={18} className="animate-spin" /> Carregando histórico...
    </div>
  );

  if (!pedidos.length) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <History size={36} className="text-slate-700" />
      <p className="text-slate-500 text-sm">Nenhum pedido registrado.</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button onClick={carregar} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      {pedidos.map((p, pi) => {
        const items    = p.items || [];
        const totalQty = p.totalQty || items.reduce((s, x) => s + Number(x.qty), 0);
        const marcas   = p.marcas?.length ? p.marcas : [...new Set(items.map(x => x.marca).filter(m => m && m !== 'N/A'))];
        const isOpen   = expanded.has(p.id);

        return (
          <div key={p.id} className="rounded-xl bg-slate-800 border border-white/5 overflow-hidden">
            {/* Cabeçalho */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-300">Pedido {shortId(p.id)}</span>
                  {marcas.slice(0,2).map(m => (
                    <span key={m} className="px-1.5 py-0.5 rounded bg-slate-700 text-xs text-slate-400">{m}</span>
                  ))}
                  {marcas.length > 2 && <span className="text-xs text-slate-500">+{marcas.length - 2}</span>}
                  {p.modalidade && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-xs border border-blue-500/20">{p.modalidade}</span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-0.5">{formatData(p.createdAtMs) || p.data || ''}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => replicarPedido(p)}
                  title="Replicar pedido"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-slate-500 hover:text-slate-300 border border-white/10 hover:border-white/20 transition-colors">
                  <RotateCcw size={11} /> Replicar
                </button>
                <button onClick={() => imprimirPDF(p.id, p.items || [], p.modalidade || 'FLEX')}
                  title="Reimprimir PDF"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-slate-500 hover:text-slate-300 border border-white/10 hover:border-white/20 transition-colors">
                  <FileText size={11} /> PDF
                </button>
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
                {items.map((it, ii) => {
                  const sent     = (p.transitSent     || {})[it.sku];
                  const received = (p.transitReceived || {})[it.sku];
                  return (
                    <div key={ii} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.04] last:border-0">
                      <ProductImg src={it.image} size={28} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-200 truncate">{it.name}</p>
                        <p className="text-xs text-slate-500">{it.marca || ''} · Qtd: {it.qty}</p>
                      </div>
                      {received ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 size={10} /> Recebido
                        </span>
                      ) : sent ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          <Truck size={10} /> A caminho
                        </span>
                      ) : (
                        <button
                          onClick={() => setModalTransit({ pedido: p, item: it, qtyInput: String(it.qty) })}
                          disabled={processando === it.sku}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-600/10 text-blue-400 border border-blue-500/20 hover:bg-blue-600/20 transition-colors disabled:opacity-50">
                          {processando === it.sku ? <Loader2 size={10} className="animate-spin" /> : <Truck size={10} />}
                          A caminho
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

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
    </div>
  );
}

// ─── ABA: INTELIGÊNCIA ────────────────────────────────────────────────────────

function AbaInteligencia() {
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

// ─── PDF (nova aba/janela) ────────────────────────────────────────────────────

function imprimirPDF(compraId, items, modalidade) {
  if (!items.length) return;
  const totalQty = items.reduce((s, i) => s + Number(i.qty), 0);
  const data     = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });

  const rows = items.map(item => `
    <tr>
      <td style="text-align:center;width:56px;padding:6px 10px;">
        <img src="${item.image || '/assets/placeholder.png'}"
          style="width:44px;height:44px;object-fit:contain;border-radius:4px;border:1px solid #eee;"
          crossorigin="anonymous"
          onerror="this.src='/assets/placeholder.png'">
      </td>
      <td style="padding:8px 10px;"><strong>${item.name}</strong><br>
        <small style="color:#888;font-size:10px;">SKU: ${item.sku} · EAN: ${item.ean || '—'}</small>
      </td>
      <td style="padding:8px 10px;color:#555;font-size:12px;">${item.marca || '—'}</td>
      <td style="padding:8px 10px;text-align:center;font-weight:700;font-size:15px;">${item.qty}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Pedido ${compraId}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #fff; color: #111; padding: 24px; }
  .header { border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
  .header h1 { font-size: 18px; font-weight: 800; }
  .header .sub { font-size: 12px; color: #666; margin-top: 2px; }
  .badge { display: inline-block; background: #111; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  thead tr { background: #f5f5f5; }
  th { padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #666; border-bottom: 2px solid #eee; }
  td { border-bottom: 1px solid #f0f0f0; vertical-align: middle; font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #eee; font-size: 11px; color: #aaa; display: flex; justify-content: space-between; }
  @media print { body { padding: 12px; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>📦 Pedido de Compras</h1>
    <div class="sub">${data} · <span class="badge">${modalidade}</span></div>
    <div class="sub" style="margin-top:4px;font-family:monospace;font-size:11px;">${compraId}</div>
  </div>
  <div style="text-align:right;">
    <div style="font-size:22px;font-weight:800;">${items.length} produto${items.length !== 1 ? 's' : ''}</div>
    <div style="font-size:13px;color:#666;">${totalQty} unidades</div>
  </div>
</div>
<table>
  <thead><tr><th width="56"></th><th>Produto</th><th>Marca</th><th style="text-align:center;">Qtd</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">
  <span>UniversoBox Hub</span>
  <span>${compraId}</span>
</div>
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

const ABAS = [
  { id: 'acaminho',   label: 'A Caminho',    Icon: Truck       },
  { id: 'montar',     label: 'Montar Pedido', Icon: Package     },
  { id: 'historico',  label: 'Histórico',    Icon: History     },
  { id: 'bi',         label: 'Inteligência', Icon: BarChart2   },
];

export default function Compras() {
  const [aba,   setAba]   = useState('acaminho');
  const [toast, setToast] = useState({ msg: '', tipo: 'info' });
  const [transitCount, setTransitCount] = useState(0);

  function showToast(msg, tipo = 'info') {
    setToast({ msg, tipo });
    setTimeout(() => setToast({ msg: '', tipo: 'info' }), 4000);
  }

  return (
    <div className="text-slate-100 px-4 py-8 max-w-7xl mx-auto flex-1 overflow-y-auto">
      <Toast msg={toast.msg} tipo={toast.tipo} />

      {/* Cabeçalho */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">🛒 Pedidos de Reposição</h1>
        <p className="text-sm text-slate-500 mt-0.5">Monte pedidos, acompanhe trânsito e analise compras</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/80 border border-white/[0.06] rounded-xl p-1 mb-6 w-fit flex-wrap">
        {ABAS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setAba(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              aba === id
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            }`}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {aba === 'acaminho'  && <AbaACaminho  onShowToast={showToast} />}
      {aba === 'montar'    && <AbaMontarPedido onShowToast={showToast} />}
      {aba === 'historico' && <AbaHistorico onShowToast={showToast} onTransitAdded={() => setTransitCount(c => c + 1)} />}
      {aba === 'bi'        && <AbaInteligencia />}
    </div>
  );
}
