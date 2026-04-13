/**
 * @file AbaMontarPedido.jsx
 * @module expedicao/compras
 * @description Carrinho de novo pedido de reposição com detecção de itens já em pedidos abertos.
 * @version 1.1.0
 * @date 2026-04-12
 * @changelog
 *   1.1.0 — 2026-04-12 — Detecção de duplicatas: avisa se SKU já está em pedido aberto
 *             com tooltip CSS hover referenciando o pedido original.
 *   1.0.0 — 2026-04-12 — Extraído de Compras.jsx.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, Plus, Minus, Trash2, FileText, AlertTriangle,
  RotateCcw, Loader2, Inbox, X,
} from 'lucide-react';
import { DRAFT_KEY, MODALIDADES, shortId, imprimirPDF } from './helpers.js';

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

// Tooltip sobre SKUs duplicados em pedidos abertos
function DuplicateBadge({ infos }) {
  if (!infos?.length) return null;
  const label = infos.map(p => `Pedido ${shortId(p.pedidoId)}: ${p.pedidoQty} un.`).join(' · ');
  return (
    <div className="relative group inline-flex items-center">
      <AlertTriangle size={12} className="text-orange-400 cursor-help" />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max max-w-52
        bg-slate-900 border border-orange-500/40 rounded-lg px-2.5 py-2 text-xs text-orange-300
        hidden group-hover:block z-30 pointer-events-none shadow-2xl leading-relaxed">
        <span className="font-bold block mb-0.5">Já em pedido aberto:</span>
        {label}
      </div>
    </div>
  );
}

export default function AbaMontarPedido({ onShowToast }) {
  const [query,        setQuery]        = useState('');
  const [results,      setResults]      = useState([]);
  const [buscando,     setBuscando]     = useState(false);
  const [carrinho,     setCarrinho]     = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(DRAFT_KEY)); return s?.carrinho || []; } catch { return []; }
  });
  const [modalidade,   setModalidade]   = useState(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY))?.modalidade || 'FLEX'; } catch { return 'FLEX'; }
  });
  const [salvando,     setSalvando]     = useState(false);
  const [pedidosAbertos, setPedidosAbertos] = useState([]);

  const searchRef = useRef(null);
  const timerRef  = useRef(null);

  // Persiste rascunho
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ carrinho, modalidade })); } catch {}
  }, [carrinho, modalidade]);

  // Carrega pedidos abertos para detectar duplicatas
  useEffect(() => {
    fetch('/api/purchase-orders?status=pending&limit=50')
      .then(r => r.json())
      .then(d => setPedidosAbertos(d.items || []))
      .catch(() => {});
  }, []);

  // Mapa SKU → lista de pedidos abertos que já contém esse SKU
  const skuEmPedidoAberto = useMemo(() => {
    const map = {};
    pedidosAbertos.forEach(pedido => {
      (pedido.items || []).forEach(item => {
        if (!map[item.sku]) map[item.sku] = [];
        map[item.sku].push({ pedidoId: pedido.id, pedidoQty: item.qty });
      });
    });
    return map;
  }, [pedidosAbertos]);

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
    setCarrinho(prev => [...prev, {
      sku: p.sku, name: p.name, image: p.image || '',
      marca: p.marca || 'N/A', ean: p.ean || 'N/A', qty: 1,
    }]);
    setQuery(''); setResults([]);
    onShowToast(`${p.name.split(' ').slice(0,3).join(' ')} adicionado ✓`, 'ok');
  }

  function remover(sku) { setCarrinho(prev => prev.filter(i => i.sku !== sku)); }

  function setQty(sku, val) {
    setCarrinho(prev => prev.map(i => i.sku === sku ? { ...i, qty: Math.max(1, Number(val) || 1) } : i));
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
                {/* Indicador de duplicata no dropdown */}
                {skuEmPedidoAberto[p.sku] && (
                  <DuplicateBadge infos={skuEmPedidoAberto[p.sku]} />
                )}
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
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-slate-200 line-clamp-1">{item.name}</p>
                          {/* Badge de duplicata no carrinho */}
                          {skuEmPedidoAberto[item.sku] && (
                            <DuplicateBadge infos={skuEmPedidoAberto[item.sku]} />
                          )}
                        </div>
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
