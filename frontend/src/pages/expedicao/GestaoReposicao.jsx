/**
 * @file GestaoReposicao.jsx
 * @module expedicao
 * @description Gestão de Pedidos de Reposição — sinalização de necessidade de compra.
 *   3 abas: Pendentes · Em Compra · Histórico
 * @version 1.0.0
 * @date 2026-05-03
 * @changelog
 *   1.0.0 — 2026-05-03 — Criação do módulo de Reposição separado de Compras.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList, Plus, X, Search, Loader2, Inbox,
  ShoppingCart, CheckCircle2, XCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Toast } from '../../components/ui';
import { getAuthToken } from '../../utils/getAuthToken';

const PRIORIDADE_LABEL = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal' };
const PRIORIDADE_COR   = {
  urgente: 'bg-red-500/20 text-red-400 border-red-500/30',
  alta:    'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  normal:  'bg-slate-700 text-slate-400 border-white/10',
};
const PRIORIDADE_ORDEM = { urgente: 0, alta: 1, normal: 2 };

function prioridadeMaisAlta(itens) {
  if (!itens?.length) return 'normal';
  return itens.reduce((acc, i) => {
    return PRIORIDADE_ORDEM[i.prioridade] < PRIORIDADE_ORDEM[acc] ? i.prioridade : acc;
  }, 'normal');
}

function BadgePrioridade({ prioridade }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${PRIORIDADE_COR[prioridade] || PRIORIDADE_COR.normal}`}>
      {PRIORIDADE_LABEL[prioridade] || prioridade}
    </span>
  );
}

function BadgeStatus({ status }) {
  const map = {
    concluida: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    cancelada: 'bg-slate-700 text-slate-500 border-white/10',
  };
  const label = { concluida: 'Concluída', cancelada: 'Cancelada' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${map[status] || 'bg-slate-700 text-slate-400 border-white/10'}`}>
      {label[status] || status}
    </span>
  );
}

function EmptyState({ mensagem }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <Inbox size={36} className="text-slate-700" />
      <p className="text-slate-500 text-sm">{mensagem}</p>
    </div>
  );
}

function RowExpandivel({ reposicao }) {
  const [aberta, setAberta] = useState(false);
  return (
    <div>
      <button
        onClick={() => setAberta(v => !v)}
        className="flex items-center gap-1 text-slate-400 hover:text-slate-200 text-sm transition-colors"
      >
        {reposicao.itens?.length ?? 0} {reposicao.itens?.length === 1 ? 'item' : 'itens'}
        {aberta ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {aberta && (
        <ul className="mt-1.5 space-y-0.5 pl-1">
          {(reposicao.itens || []).map((it, idx) => (
            <li key={idx} className="flex items-center gap-2 text-xs text-slate-400">
              <BadgePrioridade prioridade={it.prioridade || 'normal'} />
              <span className="font-mono text-slate-500">{it.sku}</span>
              <span className="truncate">{it.descricao}</span>
              <span className="text-slate-500 ml-auto">{it.qtdSugerida} un.</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function fmtData(ts) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts._seconds ? ts._seconds * 1000 : ts);
  return d.toLocaleDateString('pt-BR');
}

// ── Modal Nova Reposição ──────────────────────────────────────────────────────

function ModalNovaReposicao({ onFechar, onSalvo }) {
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [itens,    setItens]    = useState([]);
  const [notas,    setNotas]    = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState('');
  const timerRef = useRef(null);

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

  function adicionarItem(p) {
    if (itens.find(i => i.sku === p.sku)) return;
    setItens(prev => [...prev, {
      sku: p.sku, descricao: p.name, marca: p.marca || '',
      qtdSugerida: 1, prioridade: 'normal',
    }]);
    setQuery(''); setResults([]);
  }

  function removerItem(sku) {
    setItens(prev => prev.filter(i => i.sku !== sku));
  }

  function setQtd(sku, val) {
    setItens(prev => prev.map(i => i.sku === sku ? { ...i, qtdSugerida: Math.max(1, Number(val) || 1) } : i));
  }

  function setPrio(sku, val) {
    setItens(prev => prev.map(i => i.sku === sku ? { ...i, prioridade: val } : i));
  }

  async function salvar() {
    if (!itens.length) { setErro('Adicione pelo menos um produto.'); return; }
    setSalvando(true); setErro('');
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/reposicoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ itens, notas }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
      onSalvo();
    } catch (err) {
      setErro(err.message);
    } finally { setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <h2 className="font-bold text-slate-100 text-base">Nova Reposição</h2>
          <button onClick={onFechar} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Busca */}
          <div className="relative">
            <div className="flex items-center gap-2 rounded-xl bg-slate-800 border border-white/10 px-4 py-3 focus-within:border-emerald-500/50 transition-colors">
              <Search size={15} className="text-slate-500 flex-shrink-0" />
              <input
                type="text" placeholder="Buscar produto por nome, SKU ou EAN..."
                value={query} onChange={e => handleQuery(e.target.value)}
                className="flex-1 bg-transparent text-slate-100 text-sm placeholder-slate-600 outline-none"
                autoFocus
              />
              {buscando && <Loader2 size={13} className="animate-spin text-slate-500" />}
              {query && <button onClick={() => { setQuery(''); setResults([]); }} className="text-slate-600 hover:text-slate-400"><X size={13} /></button>}
            </div>
            {results.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-xl bg-slate-900 border border-white/10 shadow-2xl overflow-hidden max-h-52 overflow-y-auto">
                {results.map(p => (
                  <button key={p.sku} onClick={() => adicionarItem(p)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] border-b border-white/[0.04] last:border-0 text-left transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-200 truncate">{p.name}</p>
                      <p className="text-xs text-slate-500">{p.marca || ''} · SKU: {p.sku}</p>
                    </div>
                    <Plus size={13} className="text-emerald-500 flex-shrink-0" />
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

          {/* Itens adicionados */}
          {itens.length > 0 && (
            <div className="rounded-xl bg-slate-800 border border-white/5 overflow-hidden">
              {itens.map(it => (
                <div key={it.sku} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{it.descricao}</p>
                    <p className="text-xs text-slate-500 font-mono">{it.sku}</p>
                  </div>
                  <input
                    type="number" min="1" value={it.qtdSugerida}
                    onChange={e => setQtd(it.sku, e.target.value)}
                    className="w-16 text-center rounded-lg bg-slate-700 border border-white/10 text-slate-200 text-sm py-1 outline-none focus:border-emerald-500/50"
                  />
                  <select
                    value={it.prioridade}
                    onChange={e => setPrio(it.sku, e.target.value)}
                    className="rounded-lg bg-slate-700 border border-white/10 text-slate-200 text-xs py-1 px-2 outline-none focus:border-emerald-500/50"
                  >
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                  <button onClick={() => removerItem(it.sku)} className="text-slate-600 hover:text-red-400 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Observações */}
          <textarea
            placeholder="Observações (opcional)..."
            value={notas} onChange={e => setNotas(e.target.value)}
            rows={3}
            className="w-full rounded-xl bg-slate-800 border border-white/10 text-slate-200 text-sm px-4 py-3 placeholder-slate-600 outline-none focus:border-emerald-500/50 resize-none transition-colors"
          />

          {erro && <p className="text-red-400 text-xs">{erro}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/[0.07]">
          <button onClick={onFechar}
            className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 border border-white/10 hover:border-white/20 transition-colors">
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando || !itens.length}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-50">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <ClipboardList size={14} />}
            {salvando ? 'Salvando...' : 'Salvar Reposição'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

const ABAS = [
  { id: 'pendentes', label: 'Pendentes' },
  { id: 'em_compra', label: 'Em Compra' },
  { id: 'historico', label: 'Histórico'  },
];

export default function GestaoReposicao() {
  const navigate = useNavigate();
  const [aba,           setAba]           = useState('pendentes');
  const [reposicoes,    setReposicoes]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [modalAberto,   setModalAberto]   = useState(false);
  const [convertendo,   setConvertendo]   = useState(null);
  const [toast,         setToast]         = useState({ msg: '', tipo: 'info' });

  function showToast(msg, tipo = 'info') {
    setToast({ msg, tipo });
    setTimeout(() => setToast({ msg: '', tipo: 'info' }), 4000);
  }

  async function carregar() {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/reposicoes', { headers: { Authorization: token } });
      const data = await res.json();
      setReposicoes(data.items || []);
    } catch {
      showToast('Erro ao carregar reposições', 'err');
    } finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  async function converter(id) {
    if (!window.confirm('Criar pedido de compra a partir desta reposição?')) return;
    setConvertendo(id);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/reposicoes/${id}/converter`, {
        method: 'POST',
        headers: { Authorization: token },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao converter');
      showToast(`Compra criada: ${data.compraId} ✅`, 'ok');
      carregar();
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'err');
    } finally { setConvertendo(null); }
  }

  async function cancelar(id) {
    if (!window.confirm('Cancelar esta reposição?')) return;
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/reposicoes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ status: 'cancelada' }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      showToast('Reposição cancelada', 'info');
      carregar();
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'err');
    }
  }

  const pendentes = reposicoes.filter(r => r.status === 'pendente');
  const emCompra  = reposicoes.filter(r => r.status === 'em_compra');
  const historico = reposicoes.filter(r => r.status === 'concluida' || r.status === 'cancelada');

  return (
    <div className="text-slate-100 px-4 py-8 max-w-7xl mx-auto flex-1 overflow-y-auto">
      <Toast msg={toast.msg} tipo={toast.tipo} />

      {modalAberto && (
        <ModalNovaReposicao
          onFechar={() => setModalAberto(false)}
          onSalvo={() => { setModalAberto(false); carregar(); showToast('Reposição criada ✅', 'ok'); }}
        />
      )}

      {/* Cabeçalho */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-100">📋 Pedidos de Reposição</h1>
          <p className="text-sm text-slate-500 mt-0.5">Sinalize necessidades de compra — sem impacto financeiro direto</p>
        </div>
        <button
          onClick={() => setModalAberto(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
        >
          <Plus size={15} /> Nova Reposição
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/80 border border-white/[0.06] rounded-xl p-1 mb-6 w-fit">
        {ABAS.map(({ id, label }) => {
          const count = id === 'pendentes' ? pendentes.length : id === 'em_compra' ? emCompra.length : historico.length;
          return (
            <button key={id} onClick={() => setAba(id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                aba === id ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
              }`}>
              {label}
              {!loading && count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${aba === id ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-400'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={28} className="animate-spin text-slate-600" />
        </div>
      ) : (
        <>
          {/* Aba Pendentes */}
          {aba === 'pendentes' && (
            pendentes.length === 0 ? (
              <EmptyState mensagem="Nenhuma reposição pendente. Clique em 'Nova Reposição' para começar." />
            ) : (
              <div className="rounded-xl bg-slate-800 border border-white/5 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-left">
                      <th className="px-4 py-3 text-slate-500 font-medium">Data</th>
                      <th className="px-4 py-3 text-slate-500 font-medium">Itens</th>
                      <th className="px-4 py-3 text-slate-500 font-medium">Prioridade</th>
                      <th className="px-4 py-3 text-slate-500 font-medium hidden md:table-cell">Observações</th>
                      <th className="px-4 py-3 text-slate-500 font-medium text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendentes.map(r => (
                      <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{fmtData(r.createdAt)}</td>
                        <td className="px-4 py-3"><RowExpandivel reposicao={r} /></td>
                        <td className="px-4 py-3">
                          <BadgePrioridade prioridade={prioridadeMaisAlta(r.itens)} />
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell max-w-48 truncate">
                          {r.notas || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => converter(r.id)}
                              disabled={convertendo === r.id}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                              {convertendo === r.id
                                ? <Loader2 size={12} className="animate-spin" />
                                : <ShoppingCart size={12} />}
                              Criar Compra
                            </button>
                            <button
                              onClick={() => cancelar(r.id)}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Cancelar reposição"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Aba Em Compra */}
          {aba === 'em_compra' && (
            emCompra.length === 0 ? (
              <EmptyState mensagem="Nenhuma reposição em compra no momento." />
            ) : (
              <div className="rounded-xl bg-slate-800 border border-white/5 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-left">
                      <th className="px-4 py-3 text-slate-500 font-medium">Data</th>
                      <th className="px-4 py-3 text-slate-500 font-medium">Itens</th>
                      <th className="px-4 py-3 text-slate-500 font-medium">ID da Compra</th>
                      <th className="px-4 py-3 text-slate-500 font-medium text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emCompra.map(r => (
                      <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{fmtData(r.createdAt)}</td>
                        <td className="px-4 py-3"><RowExpandivel reposicao={r} /></td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-400">{r.compraId || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => navigate('/expedicao/compras')}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-semibold transition-colors ml-auto"
                          >
                            <ShoppingCart size={12} /> Ver Compras
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Aba Histórico */}
          {aba === 'historico' && (
            historico.length === 0 ? (
              <EmptyState mensagem="Nenhuma reposição concluída ou cancelada ainda." />
            ) : (
              <div className="rounded-xl bg-slate-800 border border-white/5 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-left">
                      <th className="px-4 py-3 text-slate-500 font-medium">Data Criação</th>
                      <th className="px-4 py-3 text-slate-500 font-medium">Itens</th>
                      <th className="px-4 py-3 text-slate-500 font-medium">Status</th>
                      <th className="px-4 py-3 text-slate-500 font-medium hidden md:table-cell">Atualização</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map(r => (
                      <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{fmtData(r.createdAt)}</td>
                        <td className="px-4 py-3"><RowExpandivel reposicao={r} /></td>
                        <td className="px-4 py-3"><BadgeStatus status={r.status} /></td>
                        <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">{fmtData(r.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
