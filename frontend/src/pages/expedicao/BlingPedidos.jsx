/**
 * @file BlingPedidos.jsx
 * @module expedicao
 * @description Tela de Pedidos do Bling — NFs de saída autorizadas.
 *              Multicanal, date picker com atalhos, cards de resumo,
 *              expansão de itens com badge de SKU e criação de pedido.
 * @version 1.0.0
 * @date 2026-04-02
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Zap, CalendarDays, RefreshCw, Unplug, Plug,
  ChevronDown, ChevronUp, PackagePlus, CheckCircle2,
  AlertTriangle, Clock, XCircle, Loader2, Inbox,
  ShoppingBag, Tag, Hash,
} from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function hoje()  { return new Date().toISOString().split('T')[0]; }
function ontem() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
function fmtData(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// localStorage: set de IDs já clonados
function getClonados() {
  try { return new Set(JSON.parse(localStorage.getItem('bling_clonados') || '[]')); }
  catch { return new Set(); }
}
function addClonado(id) {
  const s = getClonados(); s.add(String(id));
  localStorage.setItem('bling_clonados', JSON.stringify([...s]));
}

// ─── Canais ───────────────────────────────────────────────────────────────────
const CANAIS = [
  { id: 'all',    label: 'Todas',    cor: 'slate'   },
  { id: 'ml',     label: 'ML',       cor: 'yellow'  },
  { id: 'mlfull', label: 'ML Full',  cor: 'blue'    },
  { id: 'shopee', label: 'Shopee',   cor: 'orange'  },
  { id: 'magalu', label: 'Magalu',   cor: 'purple'  },
  { id: 'tiktok', label: 'TikTok',   cor: 'pink'    },
];

const COR_CANAL = {
  yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  blue:   'bg-blue-500/10   text-blue-400   border-blue-500/30',
  orange: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  pink:   'bg-pink-500/10   text-pink-400   border-pink-500/30',
  slate:  'bg-slate-700/50  text-slate-400  border-slate-600',
};

function canalCor(mkt) {
  const mktLow = (mkt || '').toLowerCase();
  if (mktLow.includes('full'))   return COR_CANAL.blue;
  if (mktLow.includes('ml'))     return COR_CANAL.yellow;
  if (mktLow.includes('shopee')) return COR_CANAL.orange;
  if (mktLow.includes('magalu')) return COR_CANAL.purple;
  if (mktLow.includes('tiktok')) return COR_CANAL.pink;
  return COR_CANAL.slate;
}

// ─── Badge de situação ────────────────────────────────────────────────────────
function SituacaoBadge({ sit }) {
  const s = (sit || '').toLowerCase();
  if (s.includes('sem danfe') || s.includes('autorizada sem')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/25 whitespace-nowrap">
        <Clock size={10} /> Sem DANFE
      </span>
    );
  }
  if (s.includes('emitida') || s.includes('danfe')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 whitespace-nowrap">
        <CheckCircle2 size={10} /> DANFE Emitida
      </span>
    );
  }
  if (s.includes('cancelada')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/25 whitespace-nowrap">
        <XCircle size={10} /> Cancelada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-700 text-slate-400 border border-slate-600 whitespace-nowrap">
      {sit || '—'}
    </span>
  );
}

// ─── Card de resumo ───────────────────────────────────────────────────────────
function ResumoCard({ label, valor, sub, cor = 'slate' }) {
  const cores = {
    slate:   'text-slate-300',
    amber:   'text-amber-400',
    emerald: 'text-emerald-400',
    blue:    'text-blue-400',
  };
  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 px-4 py-3 flex flex-col gap-1">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${cores[cor]}`}>{valor}</p>
      {sub && <p className="text-xs text-slate-600">{sub}</p>}
    </div>
  );
}

// ─── Row expandível de NF ─────────────────────────────────────────────────────
function NFRow({ nf, clonados, onClonar, onExpand, expandido, detalhe, expandindo }) {
  const jaCriado  = clonados.has(String(nf.id));
  const canal     = CANAIS.find(c => c.id !== 'all' && nf.marketplace?.toLowerCase().includes(c.id)) || CANAIS[0];

  return (
    <div className={`rounded-xl border transition-colors ${expandido ? 'bg-slate-800 border-white/10' : 'bg-slate-800/50 border-white/5 hover:border-white/10'}`}>

      {/* ── Linha principal ─────────────────────────────────────────── */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => onExpand(nf.id)}
      >
        {/* Número NF */}
        <span className="text-xs font-mono text-slate-500 w-16 shrink-0">
          #{nf.numero}
        </span>

        {/* Badge canal */}
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${canalCor(nf.marketplace)}`}>
          {nf.marketplace || '?'}
        </span>

        {/* Cliente */}
        <span className="flex-1 text-sm text-slate-300 truncate text-left">
          {nf.cliente?.nome || '—'}
        </span>

        {/* Valor (disponível após expand) */}
        <span className="hidden sm:block text-sm tabular-nums text-slate-400 w-28 text-right shrink-0">
          {detalhe?.valorTotal ? BRL.format(detalhe.valorTotal) : '—'}
        </span>

        {/* Data */}
        <span className="hidden md:block text-xs text-slate-600 w-20 text-right shrink-0">
          {fmtData(nf.dataEmissao)}
        </span>

        {/* Situação */}
        <div className="shrink-0">
          <SituacaoBadge sit={nf.situacao} />
        </div>

        {/* Badge "No sistema" */}
        {jaCriado && (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 size={10} /> No sistema
          </span>
        )}

        {/* Chevron */}
        <div className="shrink-0 text-slate-600">
          {expandindo
            ? <Loader2 size={15} className="animate-spin" />
            : expandido ? <ChevronUp size={15} /> : <ChevronDown size={15} />
          }
        </div>
      </button>

      {/* ── Detalhe expandido ────────────────────────────────────────── */}
      {expandido && detalhe && (
        <div className="border-t border-white/5 px-4 py-4">

          {/* Info rápida */}
          {detalhe.numeroPedido && (
            <p className="text-xs text-slate-500 mb-3 flex items-center gap-1">
              <Hash size={11} /> Pedido loja: <span className="text-slate-300 font-mono">{detalhe.numeroPedido}</span>
            </p>
          )}

          {/* Itens */}
          {detalhe.itens?.length > 0 ? (
            <div className="space-y-2 mb-4">
              {detalhe.itens.map((it, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg bg-slate-900/60 px-3 py-2">
                  {/* Qty badge */}
                  <span className="shrink-0 w-7 h-7 rounded-md bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                    {it.qty}
                  </span>

                  {/* Nome */}
                  <span className="flex-1 text-sm text-slate-300 truncate">{it.nome || '—'}</span>

                  {/* SKU */}
                  {it.sku ? (
                    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      <Tag size={9} /> {it.sku}
                    </span>
                  ) : (
                    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-orange-500/10 text-orange-400 border border-orange-500/20">
                      <AlertTriangle size={9} /> Sem SKU
                    </span>
                  )}

                  {/* Preço */}
                  <span className="shrink-0 text-xs text-slate-500 tabular-nums w-20 text-right">
                    {BRL.format(it.preco)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600 mb-4">Nenhum item encontrado nesta NF.</p>
          )}

          {/* Ações */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm font-semibold text-slate-200">
              Total: {detalhe.valorTotal ? BRL.format(detalhe.valorTotal) : '—'}
            </span>

            {jaCriado ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 size={14} /> Pedido já criado no sistema
              </span>
            ) : (
              <button
                onClick={() => onClonar(nf, detalhe)}
                disabled={!detalhe.itens?.length}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-colors"
              >
                <PackagePlus size={15} />
                Criar Pedido na Expedição
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export function BlingPedidos() {
  const [status,        setStatus]        = useState(null);   // { authorized, expired, updatedAtMs }
  const [dataSel,       setDataSel]       = useState(hoje());
  const [canalSel,      setCanalSel]      = useState('all');
  const [situacaoSel,   setSituacaoSel]   = useState('all'); // 'all' | 'sem_danfe' | 'danfe'
  const [nfs,           setNfs]           = useState([]);
  const [loadingNfs,    setLoadingNfs]    = useState(false);
  const [erro,          setErro]          = useState(null);
  const [expandidos,    setExpandidos]    = useState({});     // id → detalhe obj
  const [expandindo,    setExpandindo]    = useState(null);   // id carregando
  const [clonados,      setClonados]      = useState(getClonados);
  const [clonando,      setClonando]      = useState(null);
  const [toast,         setToast]         = useState(null);
  const pollingRef = useRef(null);

  // ── Status / polling ─────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/bling/status');
      setStatus(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    pollingRef.current = setInterval(fetchStatus, 30_000);
    return () => clearInterval(pollingRef.current);
  }, [fetchStatus]);

  // ── Buscar NFs ───────────────────────────────────────────────────
  const fetchNFs = useCallback(async () => {
    if (!dataSel) return;
    setLoadingNfs(true); setErro(null);
    try {
      const params = new URLSearchParams({ data: dataSel, loja: canalSel });
      const res  = await fetch(`/bling/pedidos?${params}`);
      const data = await res.json();
      if (data.error === 'bling_not_authorized') {
        setErro('Bling não autorizado. Conecte sua conta abaixo.');
        setNfs([]);
        return;
      }
      setNfs(data.items || []);
      setExpandidos({});
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoadingNfs(false);
    }
  }, [dataSel, canalSel]);

  useEffect(() => { fetchNFs(); }, [fetchNFs]);

  // ── Expandir NF (lazy load detalhe) ─────────────────────────────
  async function handleExpand(id) {
    if (expandidos[id]) {
      setExpandidos(p => { const n = { ...p }; delete n[id]; return n; });
      return;
    }
    setExpandindo(id);
    try {
      const res  = await fetch(`/bling/pedidos/${id}`);
      const data = await res.json();
      setExpandidos(p => ({ ...p, [id]: data.item }));
    } catch (e) {
      showToast(`Erro ao carregar itens: ${e.message}`, 'err');
    } finally {
      setExpandindo(null);
    }
  }

  // ── Clonar NF → criar pedido ─────────────────────────────────────
  async function handleClonar(nf, detalhe) {
    setClonando(nf.id);
    try {
      const res  = await fetch('/bling/clonar', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          blingNfId:    nf.id,
          marketplace:  nf.marketplace,
          itens:        detalhe.itens,
          clienteNome:  nf.cliente?.nome || '',
          numeroPedido: detalhe.numeroPedido || '',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao criar pedido');

      addClonado(nf.id);
      setClonados(getClonados());

      let msg = `✅ Pedido ${data.orderId} criado!`;
      if (data.skusFaltando?.length) msg += ` ⚠️ SKUs faltando: ${data.skusFaltando.join(', ')}`;
      showToast(msg, 'ok');
    } catch (e) {
      showToast(`Erro: ${e.message}`, 'err');
    } finally {
      setClonando(null);
    }
  }

  // ── Desconectar ──────────────────────────────────────────────────
  async function handleDisconnect() {
    if (!confirm('Desconectar o Bling?')) return;
    await fetch('/bling/disconnect', { method: 'POST' });
    fetchStatus();
  }

  // ── Toast ────────────────────────────────────────────────────────
  function showToast(msg, tipo = 'ok') {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Filtros locais (situação) ────────────────────────────────────
  const nfsFiltradas = useMemo(() => {
    if (situacaoSel === 'all') return nfs;
    return nfs.filter(n => {
      const s = (n.situacao || '').toLowerCase();
      if (situacaoSel === 'sem_danfe') return s.includes('sem danfe') || s.includes('autorizada sem');
      if (situacaoSel === 'danfe')     return s.includes('emitida') || s.includes('danfe');
      return true;
    });
  }, [nfs, situacaoSel]);

  // ── Cards de resumo ──────────────────────────────────────────────
  const resumo = useMemo(() => {
    const total    = nfs.length;
    const semDanfe = nfs.filter(n => {
      const s = (n.situacao || '').toLowerCase();
      return s.includes('sem danfe') || s.includes('autorizada sem');
    }).length;
    const importadas = nfs.filter(n => clonados.has(String(n.id))).length;
    return { total, semDanfe, importadas, pendentes: semDanfe - importadas };
  }, [nfs, clonados]);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="text-slate-100 px-4 py-8 max-w-6xl mx-auto">

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border max-w-sm
          ${toast.tipo === 'ok'
            ? 'bg-emerald-900/90 border-emerald-600 text-emerald-300'
            : 'bg-red-900/90 border-red-600 text-red-300'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Zap size={20} className="text-yellow-400" />
            Pedidos do Bling
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">NFs de saída autorizadas — importe para a fila de separação</p>
        </div>

        {/* Status de conexão */}
        {status && (
          <div className="flex items-center gap-2">
            {status.authorized ? (
              <>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Bling conectado</span>
                  {status.updatedAtMs && (
                    <span className="text-emerald-600 text-xs">
                      · {new Date(status.updatedAtMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleDisconnect}
                  title="Desconectar"
                  className="p-2 rounded-lg bg-slate-800 border border-white/10 text-slate-500 hover:text-red-400 hover:border-red-500/30 transition-colors"
                >
                  <Unplug size={15} />
                </button>
              </>
            ) : (
              <a
                href="/bling/auth"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm font-medium hover:bg-yellow-500/20 transition-colors"
              >
                <Plug size={14} /> Conectar Bling
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 mb-5">

        {/* Data + refresh */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setDataSel(hoje())}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
              ${dataSel === hoje()
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'}`}
          >
            Hoje
          </button>
          <button
            onClick={() => setDataSel(ontem())}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
              ${dataSel === ontem()
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'}`}
          >
            Ontem
          </button>
          <input
            type="date"
            value={dataSel}
            onChange={e => setDataSel(e.target.value)}
            className="rounded-lg bg-slate-800 border border-white/10 text-slate-300 text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 [color-scheme:dark]"
          />
          <button
            onClick={fetchNFs}
            disabled={loadingNfs}
            className="p-1.5 rounded-lg bg-slate-800 border border-white/10 text-slate-500 hover:text-slate-300 disabled:opacity-40 transition-colors"
            title="Atualizar"
          >
            <RefreshCw size={14} className={loadingNfs ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Canal + Situação */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Canais */}
          {CANAIS.map(c => (
            <button
              key={c.id}
              onClick={() => setCanalSel(c.id)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors
                ${canalSel === c.id
                  ? c.id === 'all'
                    ? 'bg-slate-600 border-slate-500 text-white'
                    : COR_CANAL[c.cor] + ' border-opacity-100'
                  : 'bg-slate-800 border-white/10 text-slate-500 hover:text-slate-300'}`}
            >
              {c.label}
            </button>
          ))}

          <span className="w-px h-4 bg-white/10 mx-1" />

          {/* Situação */}
          {[
            { id: 'all',       label: 'Todas'      },
            { id: 'sem_danfe', label: 'Sem DANFE'  },
            { id: 'danfe',     label: 'Com DANFE'  },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setSituacaoSel(s.id)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors
                ${situacaoSel === s.id
                  ? 'bg-slate-600 border-slate-500 text-white'
                  : 'bg-slate-800 border-white/10 text-slate-500 hover:text-slate-300'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cards resumo ────────────────────────────────────────────── */}
      {!loadingNfs && !erro && nfs.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <ResumoCard label="Total NFs"       valor={resumo.total}     cor="slate"   />
          <ResumoCard label="Sem DANFE"        valor={resumo.semDanfe}  cor="amber"   sub="Aguardando emissão" />
          <ResumoCard label="Já importadas"    valor={resumo.importadas}cor="emerald" sub="Pedidos criados hoje" />
          <ResumoCard label="Pendentes"        valor={resumo.pendentes} cor={resumo.pendentes > 0 ? 'amber' : 'slate'} sub="Sem DANFE não importadas" />
        </div>
      )}

      {/* ── Erro ────────────────────────────────────────────────────── */}
      {erro && (
        <div className="rounded-xl bg-red-900/20 border border-red-700/40 p-4 text-red-400 text-sm mb-5 flex items-center gap-2">
          <AlertTriangle size={15} /> {erro}
        </div>
      )}

      {/* ── Loading skeleton ─────────────────────────────────────────── */}
      {loadingNfs && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-slate-800 border border-white/5 animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Lista NFs ───────────────────────────────────────────────── */}
      {!loadingNfs && !erro && (
        <>
          {nfsFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Inbox size={36} className="text-slate-700" />
              <p className="text-slate-500 text-sm">
                {nfs.length === 0
                  ? `Nenhuma NF encontrada em ${fmtData(dataSel)}.`
                  : 'Nenhuma NF para os filtros selecionados.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Header da lista */}
              <div className="hidden sm:grid grid-cols-[4rem_6rem_1fr_7rem_6rem_8rem_2rem] gap-3 px-4 py-1.5 text-[11px] font-medium text-slate-600 uppercase tracking-wider">
                <span>NF</span>
                <span>Canal</span>
                <span>Cliente</span>
                <span className="text-right">Valor</span>
                <span className="text-right">Data</span>
                <span>Situação</span>
                <span />
              </div>

              {nfsFiltradas.map(nf => (
                <NFRow
                  key={nf.id}
                  nf={nf}
                  clonados={clonados}
                  onClonar={handleClonar}
                  onExpand={handleExpand}
                  expandido={!!expandidos[nf.id]}
                  detalhe={expandidos[nf.id] || null}
                  expandindo={expandindo === nf.id}
                />
              ))}

              <p className="text-xs text-slate-700 text-center pt-2">
                {nfsFiltradas.length} NF{nfsFiltradas.length !== 1 ? 's' : ''} exibida{nfsFiltradas.length !== 1 ? 's' : ''}
                {nfsFiltradas.length !== nfs.length ? ` de ${nfs.length}` : ''}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
