/**
 * @file PedidosDoDia.jsx
 * @module expedicao
 * @description Separação com scanner, expedição e histórico.
 *              Migração da tela HTML /pedidos para React + Tailwind.
 * @version 1.0.0
 * @date 2026-04-03
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Package, RefreshCw, Plus, Scan, CheckCircle2, Truck,
  ChevronRight, Loader2, Inbox, Zap, Clock, User,
  MapPin, Image as ImageIcon, AlertTriangle, X,
} from 'lucide-react';

// ─── Terminal & Auth ──────────────────────────────────────────────────────────
function getTerminalId() {
  let id = localStorage.getItem('expedicao_pro_terminal_id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('expedicao_pro_terminal_id', id); }
  return id;
}
const TERMINAL_ID = getTerminalId();

async function api(path, opts = {}) {
  const token = localStorage.getItem('expedicao_token') || '';
  const res = await fetch(path, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      'x-terminal-id': TERMINAL_ID,
      'authorization': `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const d = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = '/login'; return null; }
  if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
  return d;
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function fmtTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function sortOrders(arr) {
  return [...arr].sort((a, b) => {
    const aF = a.logistica === 'flex' || !!a.isPriority;
    const bF = b.logistica === 'flex' || !!b.isPriority;
    if (aF !== bF) return bF ? 1 : -1;
    return Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0);
  });
}

function getEtiquetaInfo(o) {
  const nome = o.clienteNome || '';
  if (o.marketplace === 'MERCADO_LIVRE') {
    const m = nome.match(/\(([^)]+)\)/);
    return { tipo: 'ml', valor: m ? m[1] : nome };
  }
  if (o.marketplace === 'SHOPEE') return { tipo: 'shop', valor: o.numeroPedido || '' };
  return null;
}

function beep(ok = true) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ok) {
      [1046, 1318].forEach((freq, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = freq; g.gain.value = 0.07;
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + i * 0.11);
        o.stop(ctx.currentTime + i * 0.11 + 0.08);
      });
    } else {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 220; g.gain.value = 0.07;
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.2);
    }
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {}
}

// ─── Badges ───────────────────────────────────────────────────────────────────
function MktBadge({ mkt }) {
  if (mkt === 'MERCADO_LIVRE') return <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-yellow-400/90 text-black">ML</span>;
  if (mkt === 'SHOPEE')        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/25">SHOPEE</span>;
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-400 border border-slate-600">{mkt || 'OUTROS'}</span>;
}

function FlexBadge() {
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-yellow-400 text-black">FLEX</span>;
}

function StatusTag({ status }) {
  if (status === 'pending') return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/25">A Separar</span>;
  if (status === 'picked')  return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15   text-blue-400   border border-blue-500/25">Separado</span>;
  if (status === 'packed')  return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">Expedido</span>;
  return null;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, tipo }) {
  if (!msg) return null;
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium border max-w-xs
      ${tipo === 'ok'  ? 'bg-emerald-900/95 border-emerald-600 text-emerald-200' :
        tipo === 'err' ? 'bg-red-900/95 border-red-600 text-red-200' :
                         'bg-slate-800/95 border-white/10 text-slate-200'}`}>
      {msg}
    </div>
  );
}

// ─── Flash de scan ────────────────────────────────────────────────────────────
function ScanFlash({ tipo }) {
  if (!tipo) return null;
  return (
    <div className={`fixed inset-0 pointer-events-none z-40 transition-opacity
      ${tipo === 'ok' ? 'bg-emerald-400/10' : 'bg-red-400/10'}`} />
  );
}

// ─── Order Card (lista esquerda) ──────────────────────────────────────────────
function OrderCard({ o, tab, active, onClick }) {
  const its     = Array.isArray(o.items) ? o.items : [];
  const total   = its.reduce((a, it) => a + Number(it.qty || 0), 0);
  const checked = its.reduce((a, it) => a + Number(it.checkedQty || 0), 0);
  const pct     = total > 0 ? Math.round((checked / total) * 100) : 0;
  const isFlex  = o.logistica === 'flex' || !!o.isPriority;
  const etiq    = getEtiquetaInfo(o);

  const thumbs = its.slice(0, 4);
  const extra  = its.length - 4;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-2.5 rounded-xl border transition-all mb-1.5
        ${active
          ? 'bg-blue-500/10 border-blue-500/30 border-l-2 border-l-blue-400'
          : isFlex
          ? 'bg-slate-800/60 border-white/5 border-l-2 border-l-yellow-400 hover:bg-slate-800'
          : 'bg-slate-800/60 border-white/5 hover:bg-slate-800 hover:border-white/10'}`}
    >
      {/* Linha 1: ID + badges */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="font-mono text-[12px] font-bold text-slate-200 truncate">
          {isFlex && '🔥 '}{o.id}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {isFlex && <FlexBadge />}
          <MktBadge mkt={o.marketplace} />
        </div>
      </div>

      {/* Barra de progresso — só na aba pending */}
      {tab === 'pending' && (
        <div className="mb-2">
          <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-400' : 'bg-blue-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono text-[10px] text-slate-500">{checked}/{total}</span>
        </div>
      )}

      {/* Etiqueta highlight — aba expedir */}
      {tab === 'picked' && etiq?.valor && (
        <div className={`text-[11px] font-bold mb-1.5 truncate
          ${etiq.tipo === 'ml' ? 'text-yellow-400' : 'text-orange-400'}`}>
          {etiq.tipo === 'ml' ? '🏷️' : '📦'} {etiq.valor}
        </div>
      )}

      {/* Thumbnails */}
      {thumbs.length > 0 && (
        <div className="flex gap-1 mb-1.5">
          {thumbs.map((it, i) => (
            <img key={i} src={it.image || '/assets/placeholder.png'}
              onError={e => { e.target.src = '/assets/placeholder.png'; }}
              className="w-7 h-7 rounded object-cover border border-white/5 bg-slate-700"
              alt="" />
          ))}
          {extra > 0 && (
            <div className="w-7 h-7 rounded bg-slate-700 border border-white/10 flex items-center justify-center text-[9px] font-bold text-slate-400">
              +{extra}
            </div>
          )}
        </div>
      )}

      {/* Cliente + hora */}
      <div className="flex items-center justify-between gap-2">
        {o.clienteNome && (
          <span className="text-[10px] text-slate-500 truncate flex items-center gap-1">
            <User size={9}/>{o.clienteNome}
          </span>
        )}
        <span className="text-[10px] text-slate-600 shrink-0 flex items-center gap-1">
          <Clock size={9}/>{fmtTime(o.createdAtMs)}
        </span>
      </div>
    </button>
  );
}

// ─── Foto de item ─────────────────────────────────────────────────────────────
function ItemFotoGrid({ stockPhotos, boxPhotos, binPhoto, binLabel }) {
  const cols = [];
  if (stockPhotos?.[0]) cols.push({ label: '📦 Produto',    src: stockPhotos[0] });
  if (boxPhotos?.[0])   cols.push({ label: '🎁 Embalado',   src: boxPhotos[0]   });
  if (binPhoto)         cols.push({ label: '📍 Prateleira', src: binPhoto        });

  if (!cols.length && !binLabel) return null;

  return (
    <div className="border-t border-white/5 bg-slate-900/60 p-3">
      {cols.length > 0 && (
        <div className={`grid gap-3 mb-3 ${cols.length === 1 ? 'grid-cols-1 max-w-[140px]' : cols.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {cols.map((c, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">{c.label}</span>
              <img src={c.src} onError={e => { e.target.src = '/assets/placeholder.png'; }}
                className="w-full aspect-square object-cover rounded-xl border border-white/10 bg-slate-800 cursor-zoom-in"
                alt="" />
            </div>
          ))}
        </div>
      )}
      {binLabel && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-400/8 border border-yellow-400/20">
          <MapPin size={13} className="text-yellow-400 shrink-0" />
          <span className="text-sm font-bold text-yellow-400">Localização: <strong>{binLabel}</strong></span>
        </div>
      )}
    </div>
  );
}

// ─── Item row (separação) ─────────────────────────────────────────────────────
function ItemRow({ it, onCheck }) {
  const qty  = Number(it.qty || 0);
  const chk  = Number(it.checkedQty || 0);
  const ok   = chk >= qty;
  const binLabel = it.customBin || it.bin || '';

  return (
    <div className={`rounded-xl border overflow-hidden transition-all
      ${ok ? 'border-emerald-500/20 bg-emerald-500/3' : 'border-white/5 bg-slate-800/60'}`}>

      {/* Linha principal */}
      <div className="grid gap-0" style={{ gridTemplateColumns: '72px 1fr 80px' }}>

        {/* Foto principal */}
        <img
          src={it.stockPhotos?.[0] || it.image || '/assets/placeholder.png'}
          onError={e => { e.target.src = '/assets/placeholder.png'; }}
          className="w-[72px] h-[72px] object-cover bg-slate-800"
          alt=""
        />

        {/* Info */}
        <div className="px-3 py-2 flex flex-col justify-center gap-1.5 min-w-0">
          <p className="text-sm font-bold text-slate-200 leading-tight line-clamp-2">
            {it.nameShort || it.name || '—'}
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {it.sku && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-700 border border-white/10 text-slate-400">
                SKU {it.sku}
              </span>
            )}
            {it.ean && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-700 border border-white/10 text-slate-400">
                EAN {it.ean}
              </span>
            )}
          </div>
          {it.notes && (
            <p className="text-[11px] text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded px-2 py-1">
              ⚠️ {it.notes}
            </p>
          )}
        </div>

        {/* Qty + Botão */}
        <div className="flex flex-col items-center justify-center gap-1 px-2 py-2 border-l border-white/5 bg-slate-900/40">
          <span className={`font-mono text-2xl font-black leading-none ${ok ? 'text-emerald-400' : 'text-white'}`}>
            {chk}
          </span>
          <span className="text-[9px] text-slate-600">de {qty}</span>
          <button
            onClick={() => onCheck(it.sku)}
            disabled={ok}
            className={`w-8 h-8 rounded-lg border text-base font-bold transition-all flex items-center justify-center
              ${ok
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 cursor-default'
                : 'bg-slate-700 border-white/10 text-slate-200 hover:bg-blue-500 hover:border-transparent hover:text-white'}`}
          >
            {ok ? '✓' : '+'}
          </button>
        </div>
      </div>

      {/* Fotos */}
      <ItemFotoGrid
        stockPhotos={it.stockPhotos}
        boxPhotos={it.boxPhotos}
        binPhoto={it.binPhoto}
        binLabel={binLabel}
      />
    </div>
  );
}

// ─── Etiqueta destaque (expedição) ────────────────────────────────────────────
function EtiquetaDestaque({ o }) {
  const info = getEtiquetaInfo(o);
  if (!info?.valor) return null;

  function copiar() {
    navigator.clipboard.writeText(info.valor).catch(() => {});
  }

  if (info.tipo === 'ml') {
    return (
      <div onClick={copiar} title="Clique para copiar"
        className="mx-4 mt-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-yellow-400/10 border border-yellow-400/25 cursor-pointer hover:bg-yellow-400/15 transition-colors">
        <span className="text-xl">🏷️</span>
        <div>
          <p className="text-[9px] font-bold text-yellow-600 uppercase tracking-wider mb-0.5">Apelido ML — cole a etiqueta para:</p>
          <p className="text-lg font-extrabold text-yellow-400">{info.valor}</p>
        </div>
      </div>
    );
  }
  return (
    <div onClick={copiar} title="Clique para copiar"
      className="mx-4 mt-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/20 cursor-pointer hover:bg-orange-500/15 transition-colors font-mono">
      <span className="text-xl">📦</span>
      <div>
        <p className="text-[9px] font-bold text-orange-600 uppercase tracking-wider mb-0.5">Código de envio Shopee</p>
        <p className="text-lg font-extrabold text-orange-400">{info.valor}</p>
      </div>
    </div>
  );
}

// ─── Card de expedição ────────────────────────────────────────────────────────
function ExpedicaoCard({ o, onConfirmar, confirmando }) {
  const its    = Array.isArray(o.items) ? o.items : [];
  const info   = getEtiquetaInfo(o);
  const isFlex = o.logistica === 'flex' || !!o.isPriority;

  return (
    <div className="rounded-xl border border-white/5 bg-slate-800/60 overflow-hidden mb-3 hover:border-white/10 transition-colors">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3 bg-slate-800 border-b border-white/5">
        <div className="min-w-0">
          {info?.valor ? (
            <>
              <EtiquetaDestaque o={o} />
              <p className="font-mono text-[11px] text-slate-600 mt-1 px-4">{o.id}</p>
            </>
          ) : (
            <>
              <p className="font-bold text-slate-200">{o.clienteNome || o.id}</p>
              <p className="font-mono text-[11px] text-slate-600">{o.id}</p>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 mt-1">
          {isFlex && <FlexBadge />}
          <MktBadge mkt={o.marketplace} />
        </div>
      </div>

      {/* Itens */}
      <div className="px-4 py-3 space-y-2">
        {its.length > 0 ? its.map((it, i) => (
          <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
            <img src={it.image || '/assets/placeholder.png'}
              onError={e => { e.target.src = '/assets/placeholder.png'; }}
              className="w-11 h-11 rounded-lg object-cover border border-white/10 bg-slate-700 shrink-0"
              alt="" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-200 truncate">{it.nameShort || it.name || it.sku || '—'}</p>
              <p className="text-[10px] text-slate-500">
                SKU: {it.sku || '—'}
                {(it.customBin || it.bin) ? ` · 📍 ${it.customBin || it.bin}` : ''}
              </p>
            </div>
            <span className="font-mono text-lg font-extrabold text-emerald-400 shrink-0">×{it.qty || 1}</span>
          </div>
        )) : (
          <p className="text-sm text-slate-600 text-center py-2">Itens não carregados — clique em ⟳</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-800/80 border-t border-white/5">
        <span className="text-[11px] text-slate-600">🕐 Separado às {fmtTime(o.updatedAtMs || o.createdAtMs)}</span>
        <button
          onClick={() => onConfirmar(o.id)}
          disabled={confirmando === o.id}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-extrabold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-lg shadow-emerald-500/20 transition-all"
        >
          {confirmando === o.id
            ? <><Loader2 size={14} className="animate-spin"/> Confirmando…</>
            : <><Truck size={14}/> Confirmar Expedição</>
          }
        </button>
      </div>
    </div>
  );
}

// ─── Modal de confirmação de separação ────────────────────────────────────────
function ModalSeparado({ order, proximo, onConfirmar, onFechar, confirmando }) {
  if (!order) return null;
  const its = Array.isArray(order.items) ? order.items : [];

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onFechar()}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-white/5">
          <div>
            <p className="font-mono text-sm font-bold text-slate-200">{order.id}</p>
            <p className="text-xs text-slate-500 mt-0.5">Confirmar separação completa?</p>
          </div>
          <div className="flex items-center gap-2">
            <MktBadge mkt={order.marketplace} />
            <button onClick={onFechar} className="text-slate-500 hover:text-slate-300 transition-colors">
              <X size={18}/>
            </button>
          </div>
        </div>

        {/* Itens */}
        <div className="p-4">
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-3">
            ✅ {its.length} item(s) separado(s)
          </p>
          <div className="space-y-0">
            {its.map((it, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                <img src={it.image || '/assets/placeholder.png'}
                  onError={e => { e.target.src = '/assets/placeholder.png'; }}
                  className="w-11 h-11 rounded-lg object-cover bg-slate-800 shrink-0"
                  alt="" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-200 truncate">{it.nameShort || it.name || ''}</p>
                  <p className="text-[10px] text-slate-500">
                    SKU: {it.sku}
                    {(it.customBin || it.bin) ? ` · 📍 ${it.customBin || it.bin}` : ''}
                  </p>
                </div>
                <span className="font-mono text-base font-extrabold text-emerald-400">×{it.qty}</span>
              </div>
            ))}
          </div>

          {/* Próximo pedido */}
          {proximo ? (
            <div className="mt-4 p-3 rounded-xl bg-blue-500/8 border border-blue-500/20 flex items-center gap-3">
              <ChevronRight size={20} className="text-blue-400 shrink-0" />
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Próximo pedido</p>
                <p className="font-bold text-sm text-blue-400">{proximo.id}</p>
                <p className="text-[11px] text-slate-500">{(proximo.items || []).length} item(s) · {proximo.marketplace || ''}</p>
              </div>
            </div>
          ) : (
            <div className="mt-4 p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/15 text-center text-sm text-emerald-400">
              🎉 Último pedido da fila!
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end p-4 border-t border-white/5">
          <button onClick={onFechar}
            className="px-4 py-2 rounded-xl text-sm border border-white/10 text-slate-400 hover:text-red-400 hover:border-red-500/30 transition-colors">
            ✕ Cancelar
          </button>
          <button onClick={() => onConfirmar(proximo?.id || '')} disabled={confirmando}
            className="px-5 py-2 rounded-xl text-sm font-extrabold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-all">
            {confirmando
              ? <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin"/> Confirmando…</span>
              : proximo ? '✓ Confirmar e ir para próximo' : '✓ Confirmar separação'
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Painel vazio ─────────────────────────────────────────────────────────────
function PainelVazio({ tab }) {
  const msgs = {
    pending: { icon: '📦', titulo: 'Selecione um pedido', sub: 'Clique em um pedido para iniciar a separação.' },
    picked:  { icon: '🏷️', titulo: 'Nenhum pedido separado', sub: 'Quando a separação for confirmada, os pedidos aparecem aqui.' },
    packed:  { icon: '✅', titulo: 'Nenhum pedido expedido', sub: 'Pedidos expedidos hoje aparecerão aqui.' },
  };
  const m = msgs[tab] || msgs.pending;
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-10">
      <div className="text-5xl opacity-10">{m.icon}</div>
      <p className="text-slate-400 font-semibold">{m.titulo}</p>
      <p className="text-slate-600 text-sm max-w-xs leading-relaxed">{m.sub}</p>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function PedidosDoDia() {
  const [tab,          setTab]          = useState('pending');
  const [orders,       setOrders]       = useState({ pending: [], picked: [], packed: [] });
  const [loading,      setLoading]      = useState(false);
  const [selOrder,     setSelOrder]     = useState(null);
  const [filter,       setFilter]       = useState('');
  const [flash,        setFlash]        = useState(null);   // 'ok' | 'err'
  const [toast,        setToast]        = useState(null);
  const [modal,        setModal]        = useState(false);
  const [confirmando,  setConfirmando]  = useState(null);   // orderId em progresso
  const [scanStatus,   setScanStatus]   = useState('ready');// 'ready' | 'busy'
  const [clock,        setClock]        = useState('');
  const scanBuf  = useRef('');
  const scanTimer = useRef(null);

  // Relógio
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('pt-BR'));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Toast helper
  const showToast = useCallback((msg, tipo = 'info') => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 2600);
  }, []);

  // Flash helper
  const doFlash = useCallback((ok) => {
    setFlash(ok ? 'ok' : 'err');
    setTimeout(() => setFlash(null), 150);
  }, []);

  // ── Refresh ──
  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, pi, pk] = await Promise.all([
        api('/orders/list?status=pending&limit=80'),
        api('/orders/list?status=picked&limit=80'),
        api('/orders/list?status=packed&limit=80'),
      ]);
      if (!p || !pi || !pk) return;
      const novo = {
        pending: sortOrders(p.items  || []),
        picked:  sortOrders(pi.items || []),
        packed:  sortOrders(pk.items || []),
      };
      setOrders(novo);

      // Atualiza o pedido selecionado
      setSelOrder(prev => {
        if (!prev) return null;
        const found = [...novo.pending, ...novo.picked, ...novo.packed].find(x => x.id === prev.id);
        return found || prev;
      });
    } catch (e) { showToast(`Erro ao atualizar: ${e.message}`, 'err'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  // ── Selecionar pedido ──
  async function selectOrder(o) {
    setSelOrder(o);
    try { await api(`/orders/${encodeURIComponent(o.id)}/lock`, { method: 'POST', body: '{}' }); } catch {}
  }

  // ── Scan item ──
  async function onScan(code) {
    if (tab !== 'pending') return;
    if (!selOrder) { showToast('Selecione um pedido primeiro', 'info'); beep(false); return; }

    setScanStatus('busy');
    try {
      const r = await api(`/orders/${encodeURIComponent(selOrder.id)}/check`, {
        method: 'POST', body: JSON.stringify({ code }),
      });

      if (r?.ok) {
        beep(true); doFlash(true);
        showToast(`✓ ${r.sku}  (${r.checkedQty}/${r.qty})`, 'ok');

        // Atualiza localmente
        setSelOrder(prev => {
          if (!prev || !Array.isArray(prev.items)) return prev;
          const items = prev.items.map(it =>
            it.sku === r.sku ? { ...it, checkedQty: Number(r.checkedQty) } : it
          );
          const total   = items.reduce((a, i) => a + Number(i.qty || 0), 0);
          const checked = items.reduce((a, i) => a + Number(i.checkedQty || 0), 0);
          const updated = { ...prev, items };
          if (total > 0 && checked >= total) {
            setTimeout(() => setModal(true), 600);
          }
          return updated;
        });

        refreshAll().catch(() => {});
      } else if (r) {
        beep(false); doFlash(false);
        const msgs = {
          item_not_found:           `⚠ Código não encontrado: ${code}`,
          already_fully_checked:    'Item já conferido por completo',
          locked_by_other_terminal: 'Pedido em uso em outro terminal',
          not_all_items_checked:    'Confira todos os itens antes de confirmar',
        };
        showToast(msgs[r.error] || r.error || 'Erro desconhecido', 'err');
      }
    } catch (e) {
      beep(false); doFlash(false);
      showToast(`Erro: ${e.message}`, 'err');
    } finally {
      setScanStatus('ready');
    }
  }

  // ── Scanner global (teclado / leitor de código) ──
  useEffect(() => {
    function handler(e) {
      const active = document.activeElement;
      if (active && active.id === 'filterInput') return;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active.id !== 'scannerInput') return;
      if (tab !== 'pending') return;

      if (e.key === 'Enter') {
        const code = scanBuf.current.trim();
        scanBuf.current = '';
        clearTimeout(scanTimer.current);
        if (code) onScan(code);
        return;
      }
      if (e.key.length === 1) {
        scanBuf.current += e.key;
        clearTimeout(scanTimer.current);
        scanTimer.current = setTimeout(() => { scanBuf.current = ''; }, 500);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tab, selOrder]); // eslint-disable-line

  // ── Marcar como separado (abre modal) ──
  function handleMarkPicked() { setModal(true); }

  // ── Confirmar separação ──
  async function confirmarSeparado(proximoId) {
    setConfirmando(selOrder?.id);
    try {
      const r = await api(`/orders/${encodeURIComponent(selOrder.id)}/status`, {
        method: 'POST', body: JSON.stringify({ status: 'picked' }),
      });
      if (r?.ok) {
        beep(true);
        setModal(false);

        // Impressão etiqueta ML
        const o = selOrder;
        if (o?.marketplace === 'MERCADO_LIVRE') {
          const mlId = o.mlOrderId || (() => {
            const m = (o.clienteNome || '').match(/\[#(\d+)\]/);
            return m ? m[1] : null;
          })();
          if (mlId && window.imprimirEtiquetaML) {
            window.imprimirEtiquetaML(mlId, o.id).catch(err => showToast(`Etiqueta: ${err.message}`, 'err'));
          }
        }

        await refreshAll();

        if (proximoId) {
          const proximo = orders.pending.find(x => x.id === proximoId);
          if (proximo) { selectOrder(proximo); showToast(`✓ Separado! Próximo: ${proximoId}`, 'ok'); }
          else showToast('Pedido separado ✓', 'ok');
        } else {
          setSelOrder(null);
          showToast('🎉 Todos os pedidos separados!', 'ok');
        }
      } else if (r) {
        showToast(r.error || 'Falha', 'err');
      }
    } catch (e) { showToast(e.message, 'err'); }
    finally { setConfirmando(null); }
  }

  // ── Confirmar expedição ──
  async function confirmarExpedicao(orderId) {
    setConfirmando(orderId);
    try {
      const r = await api(`/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'POST', body: JSON.stringify({ status: 'packed' }),
      });
      if (r?.ok) { beep(true); showToast('Pedido EXPEDIDO ✅', 'ok'); await refreshAll(); }
      else if (r) showToast(r.error || 'Falha ao expedir', 'err');
    } catch (e) { showToast(e.message, 'err'); }
    finally { setConfirmando(null); }
  }

  // ── Troca de aba ──
  async function switchTab(t) {
    setTab(t);
    if (t !== 'pending') setSelOrder(null);
    if (t === 'picked' || t === 'packed') await refreshAll();
  }

  // ── Contadores ──
  const counts = { pending: orders.pending.length, picked: orders.picked.length, packed: orders.packed.length };

  // ── Lista filtrada ──
  const listaFiltrada = useMemo(() => {
    const q = filter.toLowerCase().trim();
    const lista = orders[tab] || [];
    if (!q) return lista;
    return lista.filter(o =>
      (o.id || '').toLowerCase().includes(q) ||
      (o.clienteNome || '').toLowerCase().includes(q)
    );
  }, [orders, tab, filter]);

  // ── Progress do pedido selecionado ──
  const progress = useMemo(() => {
    const its     = Array.isArray(selOrder?.items) ? selOrder.items : [];
    const total   = its.reduce((a, i) => a + Number(i.qty || 0), 0);
    const checked = its.reduce((a, i) => a + Number(i.checkedQty || 0), 0);
    return { total, checked, pct: total > 0 ? Math.round((checked / total) * 100) : 0, allOk: total > 0 && checked >= total };
  }, [selOrder]);

  // ── Próximo pedido da fila ──
  const proximoPedido = useMemo(() => {
    if (!selOrder) return null;
    return orders.pending.find(x => x.id !== selOrder.id) || null;
  }, [orders.pending, selOrder]);

  const TABS = [
    { id: 'pending', label: 'Separar',  count: counts.pending },
    { id: 'picked',  label: 'Expedir',  count: counts.picked  },
    { id: 'packed',  label: 'Expedido', count: counts.packed  },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden text-slate-100">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0 bg-slate-900">
        <div>
          <h1 className="font-bold text-lg flex items-center gap-2"><Package size={18} className="text-blue-400"/> Pedidos do Dia</h1>
          <p className="text-xs text-slate-500">
            {tab === 'pending' ? 'Separação com scanner · bipe SKU ou EAN + Enter' :
             tab === 'picked'  ? 'Cole a etiqueta de envio e confirme a expedição' :
             'Histórico de pedidos expedidos hoje'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-600 bg-slate-800 border border-white/5 px-2 py-1 rounded">{clock}</span>
          <button onClick={refreshAll} disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 border border-white/10 text-slate-500 hover:text-slate-300 disabled:opacity-40 transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <a href="/manual"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors">
            <Plus size={14}/> Pedido
          </a>
        </div>
      </div>

      {/* ── Layout principal ── */}
      <div className="flex-1 overflow-hidden grid" style={{ gridTemplateColumns: '290px 1fr' }}>

        {/* ── Coluna esquerda: lista ── */}
        <div className="border-r border-white/5 flex flex-col overflow-hidden">

          {/* Tabs */}
          <div className="grid grid-cols-3 gap-1 p-2 border-b border-white/5 flex-shrink-0">
            {TABS.map(t => (
              <button key={t.id} onClick={() => switchTab(t.id)}
                className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border transition-all text-xs font-semibold
                  ${tab === t.id
                    ? 'bg-blue-500/12 border-blue-500/25 text-blue-400'
                    : 'bg-slate-800/60 border-white/5 text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}>
                <span className="font-mono text-lg font-black leading-none">{t.count}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="px-2 py-2 border-b border-white/5 flex-shrink-0">
            <input
              id="filterInput"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filtrar pedidos…"
              className="w-full bg-slate-800 border border-white/5 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/50 transition-colors placeholder:text-slate-600"
            />
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-700">
            {listaFiltrada.length === 0 ? (
              <div className="text-center text-slate-600 text-sm py-10">
                {orders[tab]?.length === 0
                  ? { pending: 'Nenhum pedido para separar', picked: 'Nenhum pedido aguardando expedição', packed: 'Nenhum pedido expedido hoje' }[tab]
                  : 'Nenhum resultado para o filtro'}
              </div>
            ) : listaFiltrada.map(o => (
              <OrderCard key={o.id} o={o} tab={tab}
                active={selOrder?.id === o.id}
                onClick={() => tab === 'pending' ? selectOrder(o) : (() => {
                  const el = document.getElementById(`expcard-${o.id}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                })()} />
            ))}
          </div>
        </div>

        {/* ── Coluna direita: detalhe ── */}
        <div className="flex flex-col overflow-hidden">

          {/* ── ABA SEPARAR ── */}
          {tab === 'pending' && (
            selOrder ? (
              <div className="flex flex-col h-full overflow-hidden">

                {/* Header do pedido */}
                <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-white/5 bg-slate-900 flex-shrink-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-base text-slate-200">{selOrder.id}</span>
                      <StatusTag status={selOrder.status} />
                      <MktBadge mkt={selOrder.marketplace} />
                      {(selOrder.logistica === 'flex' || selOrder.isPriority) && <FlexBadge />}
                    </div>
                    {/* Etiqueta inline */}
                    {(() => {
                      const info = getEtiquetaInfo(selOrder);
                      if (!info?.valor) return null;
                      return (
                        <span className={`inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full border
                          ${info.tipo === 'ml' ? 'bg-yellow-400/15 text-yellow-400 border-yellow-400/30' : 'bg-orange-500/12 text-orange-400 border-orange-500/25 font-mono'}`}>
                          {info.tipo === 'ml' ? '🏷️' : '📦'} {info.valor}
                        </span>
                      );
                    })()}
                    {selOrder.clienteNome && (
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><User size={10}/>{selOrder.clienteNome}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={refreshAll}
                      className="p-1.5 rounded-lg bg-slate-800 border border-white/10 text-slate-500 hover:text-slate-300 transition-colors">
                      <RefreshCw size={13}/>
                    </button>
                    <button onClick={handleMarkPicked} disabled={!progress.allOk || selOrder.status !== 'pending'}
                      className="px-4 py-1.5 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition-all">
                      ✓ Separado
                    </button>
                  </div>
                </div>

                {/* Barra de scanner */}
                <div className="px-4 py-2 border-b border-white/5 flex-shrink-0">
                  <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-800 border border-white/5">
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0"/>
                    <span className="text-xs text-slate-400"><strong className="text-slate-200">Scanner ativo</strong> — bipe SKU ou EAN + Enter</span>
                    <span className={`ml-auto font-mono text-xs font-bold ${scanStatus === 'busy' ? 'text-yellow-400' : 'text-emerald-400'}`}>
                      {scanStatus === 'busy' ? '● LENDO…' : '● PRONTO'}
                    </span>
                  </div>
                </div>

                {/* Itens */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 scrollbar-thin scrollbar-thumb-slate-700">
                  {(selOrder.items || []).length === 0 ? (
                    <p className="text-slate-600 text-sm text-center py-10">Sem itens neste pedido.</p>
                  ) : (selOrder.items || []).map((it, i) => (
                    <ItemRow key={i} it={it} onCheck={onScan} />
                  ))}
                </div>

                {/* Progresso footer */}
                <div className="flex items-center gap-3 px-4 py-2.5 border-t border-white/5 bg-slate-900 flex-shrink-0">
                  <span className="text-xs text-slate-500">Progresso</span>
                  <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${progress.pct >= 100 ? 'bg-emerald-400' : 'bg-blue-400'}`}
                      style={{ width: `${progress.pct}%` }}
                    />
                  </div>
                  <span className="font-mono text-sm font-bold text-slate-300">{progress.checked} / {progress.total}</span>
                </div>
              </div>
            ) : (
              <PainelVazio tab="pending" />
            )
          )}

          {/* ── ABA EXPEDIR ── */}
          {tab === 'picked' && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-slate-900 flex-shrink-0">
                <div>
                  <p className="font-bold">🏷️ Pronto para Expedir</p>
                  <p className="text-xs text-slate-500">Cole a etiqueta e confirme cada pedido</p>
                </div>
                <button onClick={refreshAll} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors">
                  <RefreshCw size={12}/> Atualizar
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-700">
                {orders.picked.length === 0 ? <PainelVazio tab="picked" /> : (
                  orders.picked.map(o => (
                    <div key={o.id} id={`expcard-${o.id}`}>
                      <ExpedicaoCard o={o} onConfirmar={confirmarExpedicao} confirmando={confirmando} />
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── ABA EXPEDIDO ── */}
          {tab === 'packed' && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-slate-900 flex-shrink-0">
                <div>
                  <p className="font-bold">✅ Expedidos</p>
                  <p className="text-xs text-slate-500">Pedidos finalizados hoje</p>
                </div>
                <button onClick={refreshAll} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors">
                  <RefreshCw size={12}/> Atualizar
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-700">
                {orders.packed.length === 0 ? <PainelVazio tab="packed" /> : (
                  orders.packed.map(o => (
                    <div key={o.id} className="rounded-xl border border-white/5 bg-slate-800/40 overflow-hidden mb-3 opacity-70">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-slate-800/60">
                        <div>
                          <p className="font-mono font-bold text-sm text-slate-300">{o.id}</p>
                          {o.clienteNome && <p className="text-xs text-slate-500 mt-0.5">👤 {o.clienteNome}</p>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MktBadge mkt={o.marketplace} />
                          <StatusTag status="packed" />
                        </div>
                      </div>
                      <div className="px-4 py-2 space-y-1.5">
                        {(Array.isArray(o.items) ? o.items : []).map((it, i) => (
                          <div key={i} className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0">
                            <img src={it.image || '/assets/placeholder.png'} onError={e => { e.target.src = '/assets/placeholder.png'; }}
                              className="w-9 h-9 rounded-lg object-cover bg-slate-700 shrink-0" alt="" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-300 truncate">{it.nameShort || it.name || ''}</p>
                              <p className="text-[10px] text-slate-500">SKU: {it.sku}</p>
                            </div>
                            <span className="font-mono text-sm font-bold text-emerald-500">×{it.qty}</span>
                          </div>
                        ))}
                      </div>
                      <div className="px-4 py-2 border-t border-white/5">
                        <span className="text-[11px] text-slate-600">✅ Expedido às {fmtTime(o.updatedAtMs || o.createdAtMs)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Overlays ── */}
      <Toast msg={toast?.msg} tipo={toast?.tipo} />
      <ScanFlash tipo={flash} />
      {modal && (
        <ModalSeparado
          order={selOrder}
          proximo={proximoPedido}
          onConfirmar={confirmarSeparado}
          onFechar={() => setModal(false)}
          confirmando={!!confirmando}
        />
      )}

      {/* Input oculto para scanner em alguns dispositivos */}
      <input id="scannerInput" autoComplete="off"
        style={{ opacity: 0, position: 'absolute', pointerEvents: 'none', width: 1, height: 1 }} />
    </div>
  );
}
