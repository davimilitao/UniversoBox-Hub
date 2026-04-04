/**
 * @file PedidosDoDia.jsx
 * @module expedicao
 * @description Separação + Expedição com scanner — v3.0
 *              Aba Expedir com mesmo fluxo modal/scanner da Separação.
 *              Logos reais de marketplace, identidade visual forte.
 * @version 3.0.0
 * @date 2026-04-04
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  RefreshCw, Plus, Loader2, ChevronRight,
  User, MapPin, X, ScanLine, Printer,
  PackageCheck, SendHorizonal, CircleCheck,
  BoxesIcon, Truck, ClipboardCheck,
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
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function isToday(ms) {
  if (!ms) return false;
  const d = new Date(Number(ms)), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
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
function matchOrderByScan(code, orders) {
  const c = code.trim().toLowerCase();
  return orders.find(o => {
    if ((o.id || '').toLowerCase() === c) return true;
    if ((o.numeroPedido || '').toLowerCase() === c) return true;
    const m = (o.clienteNome || '').match(/\(([^)]+)\)/);
    if (m && m[1].toLowerCase() === c) return true;
    return false;
  }) || null;
}

function beep(ok = true) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ok) {
      [880, 1108].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f; g.gain.value = 0.08;
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + i * 0.1); o.stop(ctx.currentTime + i * 0.1 + 0.09);
      });
    } else {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 180; g.gain.value = 0.07;
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.22);
    }
    setTimeout(() => ctx.close().catch(() => {}), 700);
  } catch {}
}

// ─── QZ Tray: DANFE ───────────────────────────────────────────────────────────
async function printDanfe(blingNfId, onStatus) {
  const qz = window.qz;
  if (!qz) throw new Error('QZ Tray não encontrado. Instale em qz.io/download');
  if (!qz.websocket.isActive()) {
    try {
      qz.security.setCertificatePromise(r => r(null));
      qz.security.setSignatureAlgorithm('SHA512');
      qz.security.setSignaturePromise(() => r => r(null));
    } catch {}
    onStatus?.('Conectando ao QZ Tray…');
    await qz.websocket.connect({ retries: 3, delay: 1 });
  }
  onStatus?.('Buscando DANFE no Bling…');
  const token = localStorage.getItem('expedicao_token') || '';
  const res = await fetch(`/bling/danfe/${encodeURIComponent(blingNfId)}`, {
    headers: { authorization: `Bearer ${token}`, 'x-terminal-id': TERMINAL_ID },
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
  const data = await res.json();
  if (!data?.pdf) throw new Error('Bling não retornou o PDF da DANFE.');
  onStatus?.('Enviando para impressora…');
  const printer = await qz.printers.getDefault();
  const config = qz.configs.create(printer, { scaleContent: true, colorType: 'blackwhite' });
  await qz.print(config, [{ type: 'pixel', format: 'pdf', flavor: 'base64', data: data.pdf }]);
}

// ─── Marketplace Logos ────────────────────────────────────────────────────────
// Logos com identidade visual real dos canais
function MktLogo({ mkt, size = 'sm' }) {
  if (mkt === 'MERCADO_LIVRE') {
    const isLg = size === 'lg';
    return (
      <span
        title="Mercado Livre"
        className={`inline-flex items-center gap-1 font-black rounded-lg leading-none
          ${isLg ? 'px-3 py-1.5 text-sm gap-1.5' : 'px-2 py-1 text-[10px]'}`}
        style={{ background: '#FFE600', color: '#2D3277' }}
      >
        {/* Shopping bag icon */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
          width={isLg ? 14 : 10} height={isLg ? 14 : 10}>
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zm1 14a1 1 0 0 1-2 0V9a1 1 0 0 1 2 0zm4 0a1 1 0 0 1-2 0V9a1 1 0 0 1 2 0zm4 0a1 1 0 0 1-2 0V9a1 1 0 0 1 2 0z"/>
        </svg>
        <span>Mercado Livre</span>
      </span>
    );
  }
  if (mkt === 'SHOPEE') {
    const isLg = size === 'lg';
    return (
      <span
        title="Shopee"
        className={`inline-flex items-center gap-1 font-black rounded-lg leading-none text-white
          ${isLg ? 'px-3 py-1.5 text-sm gap-1.5' : 'px-2 py-1 text-[10px]'}`}
        style={{ background: '#EE4D2D' }}
      >
        {/* Shopee S bag icon approximation */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"
          width={isLg ? 14 : 10} height={isLg ? 14 : 10}>
          <path d="M12 2a5 5 0 0 0-5 5H5l-1 15h16L19 7h-2a5 5 0 0 0-5-5zm0 2a3 3 0 0 1 3 3H9a3 3 0 0 1 3-3zm0 6c2 0 3.5 1 3.5 2.5S13.5 15 12 15c-.8 0-1.5.3-1.5.8s.7.7 1.5.7c2.5 0 4-1.2 4-3S14.5 11 12 11c-.7 0-1.3-.2-1.3-.8s.6-.7 1.3-.7c1 0 1.8.4 1.8.4l.8-1.6S13.8 8 12 8C9.8 8 8.5 9.2 8.5 11S10 13.5 12 13.5c.8 0 1.5.2 1.5.75s-.7.75-1.5.75c-1.2 0-2.2-.5-2.2-.5L9 16s1.2.6 3 .6c2.3 0 3.8-1.2 3.8-3.1S13.8 11 12 11z"/>
        </svg>
        <span>Shopee</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-lg bg-slate-700 border border-slate-600 text-slate-300 leading-none">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={10} height={10}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
      {mkt || 'OUTROS'}
    </span>
  );
}

function FlexBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black bg-amber-400 text-black leading-none animate-pulse">
      ⚡ FLEX
    </span>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ items }) {
  if (!items.length) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none" style={{ minWidth: 300 }}>
      {items.map(t => (
        <div key={t.id} className={`flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold border backdrop-blur-sm
          ${t.tipo === 'ok'  ? 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200' :
            t.tipo === 'err' ? 'bg-red-950/95 border-red-500/40 text-red-200' :
                               'bg-slate-900/95 border-white/15 text-slate-200'}`}>
          <span className="text-lg leading-none shrink-0">
            {t.tipo === 'ok' ? '✓' : t.tipo === 'err' ? '✕' : 'ℹ'}
          </span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

function ScanFlash({ tipo }) {
  if (!tipo) return null;
  return <div className={`fixed inset-0 pointer-events-none z-40 ${tipo === 'ok' ? 'bg-emerald-400/8' : 'bg-red-400/12'}`} />;
}

// ─── Progress Ring ────────────────────────────────────────────────────────────
function ProgressRing({ pct, size = 40, stroke = 3.5 }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 100 ? '#34d399' : pct > 0 ? '#60a5fa' : '#1e293b';
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.4s, stroke 0.3s' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px`,
          fill: pct >= 100 ? '#34d399' : '#64748b', fontSize: 9, fontWeight: 700, fontFamily: 'monospace' }}>
        {pct}%
      </text>
    </svg>
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
  const thumbs  = its.slice(0, 3);

  return (
    <button onClick={onClick}
      className={`w-full text-left rounded-2xl border transition-all mb-2 overflow-hidden
        ${active
          ? 'border-blue-500/50 bg-blue-500/8 ring-1 ring-blue-500/20 shadow-lg shadow-blue-900/20'
          : isFlex
          ? 'border-l-[3px] border-l-amber-400 border-r-white/5 border-t-white/5 border-b-white/5 bg-slate-800/70 hover:bg-slate-800'
          : 'border-white/6 bg-slate-800/50 hover:bg-slate-800 hover:border-white/12'}`}>

      {isFlex && (
        <div className="bg-amber-400/10 border-b border-amber-400/20 px-3 py-1">
          <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider">⚡ Prioridade Flex</span>
        </div>
      )}

      <div className="p-3">
        {/* Topo: marketplace logo + ID */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <MktLogo mkt={o.marketplace} />
          <span className="font-mono text-[10px] text-slate-500 truncate">{o.id}</span>
        </div>

        {/* Etiqueta ML/Shopee */}
        {etiq?.valor && (
          <div className={`text-[11px] font-bold mb-2.5 truncate px-2 py-1 rounded-lg
            ${etiq.tipo === 'ml' ? 'text-amber-400 bg-amber-400/8 border border-amber-400/15' : 'text-orange-300 bg-orange-500/8 border border-orange-500/15 font-mono'}`}>
            {etiq.tipo === 'ml' ? '🏷️ ' : '📦 '}{etiq.valor}
          </div>
        )}

        {/* Thumbs + progresso */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1 flex-1">
            {thumbs.map((it, i) => (
              <div key={i} className="relative">
                <img src={it.stockPhotos?.[0] || it.image || '/assets/placeholder.png'}
                  onError={e => { e.target.src = '/assets/placeholder.png'; }}
                  className="w-9 h-9 rounded-lg object-cover border border-white/10 bg-slate-700" alt="" />
                {Number(it.qty) > 1 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-900 border border-white/10 text-[8px] font-black text-slate-300 flex items-center justify-center">
                    {it.qty}
                  </span>
                )}
              </div>
            ))}
            {its.length > 3 && (
              <div className="w-9 h-9 rounded-lg bg-slate-700 border border-white/10 flex items-center justify-center text-[9px] font-bold text-slate-400">
                +{its.length - 3}
              </div>
            )}
          </div>
          {tab === 'pending' && <ProgressRing pct={pct} size={36} />}
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between gap-2 mt-2">
          {o.clienteNome ? (
            <span className="text-[10px] text-slate-500 truncate flex items-center gap-1">
              <User size={9}/>{o.clienteNome.split(' ').slice(0, 2).join(' ')}
            </span>
          ) : <span />}
          <span className="text-[10px] text-slate-600 font-mono shrink-0">{fmtTime(o.createdAtMs)}</span>
        </div>
      </div>
    </button>
  );
}

// ─── Scanner Zone ─────────────────────────────────────────────────────────────
function ScannerZone({ status, hint, inputRef, onManualScan }) {
  const isBusy = status === 'busy';
  return (
    <div className={`mx-4 my-3 rounded-2xl border-2 overflow-hidden transition-all duration-300
      ${isBusy
        ? 'border-amber-400/60 bg-amber-400/5 shadow-lg shadow-amber-900/20'
        : 'border-emerald-500/40 bg-emerald-950/30 shadow-lg shadow-emerald-900/15'}`}>
      <div className={`flex items-center gap-2.5 px-4 py-2 border-b
        ${isBusy ? 'border-amber-400/20 bg-amber-400/8' : 'border-emerald-500/15 bg-emerald-950/30'}`}>
        <div className={`w-2 h-2 rounded-full shrink-0 ${isBusy ? 'bg-amber-400 animate-ping' : 'bg-emerald-400 animate-pulse'}`} />
        <ScanLine size={13} className={isBusy ? 'text-amber-400' : 'text-emerald-500'} />
        <span className={`text-xs font-black uppercase tracking-widest ${isBusy ? 'text-amber-400' : 'text-emerald-400'}`}>
          {isBusy ? 'Lendo…' : 'Scanner Ativo'}
        </span>
        {hint && <span className="ml-auto text-[10px] text-slate-600 font-normal">{hint}</span>}
      </div>
      <div className="px-4 py-3">
        <input
          ref={inputRef}
          id="scannerInput"
          type="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Bipe o código ou digite + Enter…"
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const v = e.target.value.trim();
              e.target.value = '';
              if (v) onManualScan(v);
            }
          }}
          className={`w-full font-mono text-sm font-bold rounded-xl border px-4 py-2.5 outline-none transition-all
            bg-slate-950/60 text-slate-100 placeholder:text-slate-600
            ${isBusy
              ? 'border-amber-400/40 focus:border-amber-400'
              : 'border-emerald-500/30 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15'}`}
        />
      </div>
    </div>
  );
}

// ─── Item Row (separação) ─────────────────────────────────────────────────────
function ItemRow({ it, onCheck }) {
  const qty = Number(it.qty || 0), chk = Number(it.checkedQty || 0);
  const ok  = chk >= qty;
  const foto = it.stockPhotos?.[0] || it.image || null;
  const bin  = it.customBin || it.bin || '';

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all duration-300
      ${ok ? 'border-emerald-500/30 bg-emerald-950/20' : 'border-white/8 bg-slate-800/60 hover:border-white/15'}`}>
      <div className="flex items-stretch">
        {/* Foto */}
        <div className="shrink-0 relative">
          <img src={foto || '/assets/placeholder.png'}
            onError={e => { e.target.src = '/assets/placeholder.png'; }}
            className="w-24 h-24 object-cover bg-slate-800" alt="" />
          {ok && (
            <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
              <CircleCheck size={32} className="text-emerald-400 drop-shadow-lg" />
            </div>
          )}
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0 px-3 py-2.5 flex flex-col justify-between gap-1">
          <p className={`font-bold text-sm leading-snug line-clamp-2 ${ok ? 'text-emerald-300' : 'text-slate-100'}`}>
            {it.nameShort || it.name || '—'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {it.sku && <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-700/80 border border-white/8 text-slate-400">SKU {it.sku}</span>}
            {it.ean && <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-700/80 border border-white/8 text-slate-400">EAN {it.ean}</span>}
            {it.eanBox && <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 border border-blue-500/20 text-blue-400">CX {it.eanBox}</span>}
          </div>
          {it.notes && <p className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1">⚠️ {it.notes}</p>}
        </div>
        {/* Qty + botão */}
        <div className="flex flex-col items-center justify-center gap-2 px-3 py-2.5 border-l border-white/5 bg-slate-900/40 min-w-[76px]">
          <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl font-black leading-none transition-all
            ${ok ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                 : chk > 0 ? 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
                           : 'bg-slate-700/60 border border-white/8 text-slate-200'}`}>
            <span className="text-2xl leading-none">{ok ? '✓' : chk > 0 ? chk : qty}</span>
            {!ok && chk > 0 && <span className="text-[9px] text-slate-500 mt-0.5">de {qty}</span>}
            {!ok && chk === 0 && <span className="text-[9px] text-slate-500 mt-0.5">und</span>}
          </div>
          <button onClick={() => !ok && onCheck(it.sku)} disabled={ok}
            className={`w-10 h-8 rounded-xl border text-sm font-extrabold transition-all flex items-center justify-center
              ${ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 cursor-default opacity-60'
                   : 'bg-slate-700 border-white/10 text-slate-200 hover:bg-blue-500 hover:border-blue-400 hover:text-white hover:scale-105 active:scale-95'}`}>
            {ok ? '✓' : '+1'}
          </button>
        </div>
      </div>
      {/* Localização */}
      {bin && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-400/6 border-t border-amber-400/15">
          <MapPin size={12} className="text-amber-400 shrink-0" />
          <span className="text-xs font-black text-amber-300">Localização:</span>
          <span className="font-mono text-sm font-black text-amber-400">{bin}</span>
        </div>
      )}
      {/* Fotos extras */}
      {(it.boxPhotos?.[0] || it.binPhoto) && (
        <div className={`grid gap-2 p-3 border-t border-white/5 bg-slate-900/50
          ${[it.boxPhotos?.[0], it.binPhoto].filter(Boolean).length === 1 ? 'grid-cols-1 max-w-[120px]' : 'grid-cols-2'}`}>
          {it.boxPhotos?.[0] && (
            <div>
              <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Embalado</p>
              <img src={it.boxPhotos[0]} onError={e => { e.target.src = '/assets/placeholder.png'; }}
                className="w-full aspect-square object-cover rounded-xl border border-white/8 bg-slate-800" alt="" />
            </div>
          )}
          {it.binPhoto && (
            <div>
              <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Prateleira</p>
              <img src={it.binPhoto} onError={e => { e.target.src = '/assets/placeholder.png'; }}
                className="w-full aspect-square object-cover rounded-xl border border-white/8 bg-slate-800" alt="" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Etiqueta destaque (expedição) ────────────────────────────────────────────
function EtiquetaDestaque({ o, large = false }) {
  const info = getEtiquetaInfo(o);
  if (!info?.valor) return null;
  const isMl = info.tipo === 'ml';

  function copiar() { navigator.clipboard.writeText(info.valor).catch(() => {}); }

  return (
    <div onClick={copiar} title="Clique para copiar"
      className={`flex items-center gap-4 cursor-pointer transition-all rounded-2xl border-2
        ${isMl ? 'bg-amber-400/8 border-amber-400/30 hover:bg-amber-400/12 hover:border-amber-400/50'
               : 'bg-orange-500/8 border-orange-500/25 hover:bg-orange-500/12 hover:border-orange-500/40'}
        ${large ? 'px-5 py-4' : 'px-4 py-3'}`}>
      <span className={large ? 'text-3xl' : 'text-2xl'}>{isMl ? '🏷️' : '📦'}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isMl ? 'text-amber-600' : 'text-orange-600'}`}>
          {isMl ? 'Apelido ML — cole na etiqueta' : 'Código de envio Shopee'}
        </p>
        <p className={`font-black tracking-tight leading-none truncate ${isMl ? 'text-amber-400' : 'text-orange-400 font-mono'} ${large ? 'text-2xl' : 'text-xl'}`}>
          {info.valor}
        </p>
      </div>
      <span className="text-[9px] text-slate-600 shrink-0">toque p/ copiar</span>
    </div>
  );
}

// ─── Modal de confirmação de SEPARAÇÃO ────────────────────────────────────────
function ModalSeparado({ order, proximo, onConfirmar, onFechar, confirmando }) {
  if (!order) return null;
  const its = Array.isArray(order.items) ? order.items : [];
  const [printStatus, setPrintStatus] = useState(null);
  const [printMsg,    setPrintMsg]    = useState('');
  const temDanfe = !!order.blingNfId;

  async function handlePrint() {
    if (!temDanfe) return;
    setPrintStatus('loading'); setPrintMsg('Conectando…');
    try {
      await printDanfe(order.blingNfId, msg => setPrintMsg(msg));
      setPrintStatus('ok'); setPrintMsg('DANFE enviada para impressão ✓');
      setTimeout(() => { setPrintStatus(null); setPrintMsg(''); }, 4000);
    } catch(e) { setPrintStatus('err'); setPrintMsg(e.message); }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onFechar()}>
      <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-white/5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ClipboardCheck size={20} className="text-emerald-400" />
              <p className="font-black text-base text-slate-100">Separação Completa!</p>
            </div>
            <p className="font-mono text-xs text-slate-500">{order.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <MktLogo mkt={order.marketplace} />
            <button onClick={onFechar} className="text-slate-500 hover:text-slate-300 transition-colors">
              <X size={18}/>
            </button>
          </div>
        </div>

        {/* Itens */}
        <div className="p-4 space-y-0">
          {its.map((it, i) => {
            const foto = it.stockPhotos?.[0] || it.image || '/assets/placeholder.png';
            return (
              <div key={i} className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0">
                <img src={foto} onError={e => { e.target.src = '/assets/placeholder.png'; }}
                  className="w-12 h-12 rounded-xl object-cover bg-slate-800 border border-white/8 shrink-0" alt="" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-200 truncate">{it.nameShort || it.name || ''}</p>
                  <p className="font-mono text-[10px] text-slate-500">{it.sku}{(it.customBin || it.bin) ? ` · 📍 ${it.customBin || it.bin}` : ''}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <span className="font-mono text-lg font-black text-emerald-400">×{it.qty}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Próximo */}
        <div className="px-4 pb-3">
          {proximo ? (
            <div className="p-3.5 rounded-2xl bg-blue-500/8 border border-blue-500/20 flex items-center gap-3">
              <ChevronRight size={18} className="text-blue-400 shrink-0" />
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Próximo na fila</p>
                <p className="font-bold text-sm text-blue-400">{proximo.id}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <MktLogo mkt={proximo.marketplace} />
                  <span className="text-[10px] text-slate-500">{(proximo.items || []).length} item(s)</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-emerald-500/8 border border-emerald-500/15 text-center">
              <p className="text-base font-black text-emerald-400">🎉 Último pedido da fila!</p>
            </div>
          )}
        </div>

        {/* Botão DANFE */}
        {temDanfe && (
          <div className="px-4 pb-3">
            <button onClick={handlePrint} disabled={printStatus === 'loading'}
              className={`w-full flex items-center justify-center gap-2.5 py-3 rounded-2xl border-2 text-sm font-extrabold transition-all
                ${printStatus === 'loading' ? 'border-slate-600 bg-slate-800/60 text-slate-500 cursor-wait' :
                  printStatus === 'ok'      ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-400' :
                  printStatus === 'err'     ? 'border-red-500/40 bg-red-950/30 text-red-400' :
                  'border-dashed border-slate-600 bg-slate-800/30 text-slate-400 hover:border-slate-400 hover:text-slate-200'}`}>
              {printStatus === 'loading' ? <><Loader2 size={15} className="animate-spin"/>{printMsg}</> :
               printStatus === 'ok'      ? <><CircleCheck size={15}/>{printMsg}</> :
               printStatus === 'err'     ? <><span>⚠️</span><span className="text-xs font-normal line-clamp-2">{printMsg}</span></> :
               <><Printer size={15}/> Imprimir DANFE Simplificado</>}
            </button>
            {printStatus === 'err' && <p className="text-[10px] text-slate-600 text-center mt-1.5">QZ Tray precisa estar rodando · qz.io/download</p>}
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-white/5">
          <button onClick={onFechar}
            className="flex-1 py-2.5 rounded-xl text-sm border border-white/10 text-slate-400 hover:text-red-400 hover:border-red-500/30 transition-colors">
            Cancelar
          </button>
          <button onClick={() => onConfirmar(proximo?.id || '')} disabled={confirmando}
            className="flex-[2] py-2.5 rounded-xl text-sm font-extrabold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-all shadow-lg shadow-blue-900/30">
            {confirmando
              ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin"/>Confirmando…</span>
              : proximo ? '✓ Confirmar e ir ao próximo' : '✓ Confirmar separação'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de confirmação de EXPEDIÇÃO ────────────────────────────────────────
function ModalExpedicao({ order, proximo, onConfirmar, onFechar, confirmando }) {
  if (!order) return null;
  const its = Array.isArray(order.items) ? order.items : [];
  const [printStatus, setPrintStatus] = useState(null);
  const [printMsg,    setPrintMsg]    = useState('');
  const temDanfe = !!order.blingNfId;

  async function handlePrint() {
    if (!temDanfe) return;
    setPrintStatus('loading'); setPrintMsg('Conectando…');
    try {
      await printDanfe(order.blingNfId, msg => setPrintMsg(msg));
      setPrintStatus('ok'); setPrintMsg('Impresso ✓');
      setTimeout(() => { setPrintStatus(null); setPrintMsg(''); }, 4000);
    } catch(e) { setPrintStatus('err'); setPrintMsg(e.message); }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onFechar()}>
      <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-white/5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Truck size={20} className="text-emerald-400" />
              <p className="font-black text-base text-slate-100">Confirmar Expedição</p>
            </div>
            <p className="font-mono text-xs text-slate-500">{order.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <MktLogo mkt={order.marketplace} />
            <button onClick={onFechar} className="text-slate-500 hover:text-slate-300 transition-colors">
              <X size={18}/>
            </button>
          </div>
        </div>

        {/* Etiqueta destaque */}
        <div className="px-4 pt-4">
          <EtiquetaDestaque o={order} large />
        </div>

        {/* Itens */}
        <div className="p-4 space-y-0">
          {its.map((it, i) => {
            const foto = it.stockPhotos?.[0] || it.image || '/assets/placeholder.png';
            return (
              <div key={i} className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0">
                <img src={foto} onError={e => { e.target.src = '/assets/placeholder.png'; }}
                  className="w-12 h-12 rounded-xl object-cover bg-slate-800 border border-white/8 shrink-0" alt="" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-200 truncate">{it.nameShort || it.name || ''}</p>
                  <p className="font-mono text-[10px] text-slate-500">{it.sku}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-950/40 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <span className="font-mono text-lg font-black text-blue-400">×{it.qty}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Próximo */}
        {proximo && (
          <div className="px-4 pb-3">
            <div className="p-3.5 rounded-2xl bg-blue-500/8 border border-blue-500/20 flex items-center gap-3">
              <ChevronRight size={18} className="text-blue-400 shrink-0" />
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Próximo para expedir</p>
                <p className="font-bold text-sm text-blue-400">{proximo.id}</p>
                <MktLogo mkt={proximo.marketplace} />
              </div>
            </div>
          </div>
        )}

        {/* Botão DANFE */}
        {temDanfe && (
          <div className="px-4 pb-3">
            <button onClick={handlePrint} disabled={printStatus === 'loading'}
              className={`w-full flex items-center justify-center gap-2.5 py-3 rounded-2xl border-2 text-sm font-extrabold transition-all
                ${printStatus === 'loading' ? 'border-slate-600 bg-slate-800/60 text-slate-500 cursor-wait' :
                  printStatus === 'ok'      ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-400' :
                  printStatus === 'err'     ? 'border-red-500/40 bg-red-950/30 text-red-400' :
                  'border-dashed border-slate-600 bg-slate-800/30 text-slate-400 hover:border-slate-400 hover:text-slate-200'}`}>
              {printStatus === 'loading' ? <><Loader2 size={15} className="animate-spin"/>{printMsg}</> :
               printStatus === 'ok'      ? <><CircleCheck size={15}/>{printMsg}</> :
               printStatus === 'err'     ? <><span>⚠️</span><span className="text-xs">{printMsg}</span></> :
               <><Printer size={15}/> Imprimir DANFE Simplificado</>}
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-white/5">
          <button onClick={onFechar}
            className="flex-1 py-2.5 rounded-xl text-sm border border-white/10 text-slate-400 hover:text-red-400 hover:border-red-500/30 transition-colors">
            Cancelar
          </button>
          <button onClick={() => onConfirmar(proximo?.id || '')} disabled={confirmando}
            className="flex-[2] py-2.5 rounded-xl text-sm font-extrabold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-all shadow-lg shadow-emerald-900/30">
            {confirmando
              ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin"/>Confirmando…</span>
              : <><Truck size={14} className="inline mr-1.5"/>Confirmar Expedição</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function Vazio({ icon, titulo, sub }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-10 opacity-50">
      <div className="text-5xl">{icon}</div>
      <p className="text-slate-300 font-bold">{titulo}</p>
      {sub && <p className="text-slate-500 text-sm max-w-xs leading-relaxed">{sub}</p>}
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function PedidosDoDia() {
  const [tab,         setTab]         = useState('pending');
  const [orders,      setOrders]      = useState({ pending: [], picked: [], packed: [] });
  const [loading,     setLoading]     = useState(false);
  const [selOrder,    setSelOrder]    = useState(null);
  const [filter,      setFilter]      = useState('');
  const [flash,       setFlash]       = useState(null);
  const [toasts,      setToasts]      = useState([]);
  const [modalSep,    setModalSep]    = useState(false);
  const [modalExp,    setModalExp]    = useState(false);
  const [confirmando, setConfirmando] = useState(null);
  const [scanStatus,  setScanStatus]  = useState('ready');
  const [clock,       setClock]       = useState('');

  const scanBuf     = useRef('');
  const scanTimer   = useRef(null);
  const scanInputRef = useRef(null);

  // Relógio
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, []);

  // Toast
  const showToast = useCallback((msg, tipo = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p.slice(-2), { id, msg, tipo }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  }, []);

  const doFlash = useCallback(ok => {
    setFlash(ok ? 'ok' : 'err');
    setTimeout(() => setFlash(null), 160);
  }, []);

  // Refresh
  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, pi, pk] = await Promise.all([
        api('/orders/list?status=pending&limit=80'),
        api('/orders/list?status=picked&limit=80'),
        api('/orders/list?status=packed&limit=200'),
      ]);
      if (!p || !pi || !pk) return;
      const novo = {
        pending: sortOrders(p.items  || []),
        picked:  sortOrders(pi.items || []),
        packed:  sortOrders((pk.items || []).filter(o => isToday(o.updatedAtMs || o.createdAtMs))),
      };
      setOrders(novo);
      setSelOrder(prev => {
        if (!prev) return null;
        return [...novo.pending, ...novo.picked, ...novo.packed].find(x => x.id === prev.id) || prev;
      });
    } catch(e) { showToast(`Erro ao atualizar: ${e.message}`, 'err'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  // Selecionar pedido
  async function selectOrder(o) {
    setSelOrder(o);
    try { await api(`/orders/${encodeURIComponent(o.id)}/lock`, { method: 'POST', body: '{}' }); } catch {}
    setTimeout(() => scanInputRef.current?.focus(), 100);
  }

  // ── Scan SEPARAÇÃO ──
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
        setSelOrder(prev => {
          if (!prev || !Array.isArray(prev.items)) return prev;
          const items = prev.items.map(it => it.sku === r.sku ? { ...it, checkedQty: Number(r.checkedQty) } : it);
          const total   = items.reduce((a, i) => a + Number(i.qty || 0), 0);
          const checked = items.reduce((a, i) => a + Number(i.checkedQty || 0), 0);
          if (total > 0 && checked >= total) setTimeout(() => setModalSep(true), 600);
          return { ...prev, items };
        });
        refreshAll().catch(() => {});
      } else if (r) {
        beep(false); doFlash(false);
        const msgs = {
          item_not_found: `Código não encontrado: ${code}`,
          already_fully_checked: 'Item já conferido por completo',
          locked_by_other_terminal: 'Pedido em uso em outro terminal',
        };
        showToast(msgs[r.error] || r.error || 'Erro desconhecido', 'err');
      }
    } catch(e) { beep(false); doFlash(false); showToast(`Erro: ${e.message}`, 'err'); }
    finally { setScanStatus('ready'); scanInputRef.current?.focus(); }
  }

  // ── Scan EXPEDIÇÃO — bipe da DANFE ou apelido identifica e confirma ──
  async function onScanExpedicao(code) {
    if (tab !== 'picked') return;
    setScanStatus('busy');
    try {
      const match = matchOrderByScan(code, orders.picked);

      if (!match) {
        beep(false); doFlash(false);
        showToast(`Código não encontrado nos pedidos para expedir`, 'err');
        return;
      }

      if (selOrder && selOrder.id === match.id) {
        // Segundo bipe no mesmo pedido → confirmar expedição direto
        beep(true); doFlash(true);
        showToast(`Expedindo ${match.id}…`, 'ok');
        setModalExp(true);
      } else {
        // Primeiro bipe → identificar pedido
        beep(true); doFlash(true);
        setSelOrder(match);
        showToast(`✓ Pedido identificado — bipe novamente para expedir`, 'ok');
      }
    } finally {
      setScanStatus('ready');
      scanInputRef.current?.focus();
    }
  }

  // ── Scanner global (leitor físico) ──
  useEffect(() => {
    function handler(e) {
      const active = document.activeElement;
      if (active?.id === 'filterInput') return;
      if (active?.id === 'scannerInput') return;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      if (tab !== 'pending' && tab !== 'picked') return;

      if (e.key === 'Enter') {
        const code = scanBuf.current.trim();
        scanBuf.current = ''; clearTimeout(scanTimer.current);
        if (code) (tab === 'pending' ? onScan : onScanExpedicao)(code);
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
  }, [tab, selOrder, orders.picked]); // eslint-disable-line

  // ── Confirmar separação ──
  async function confirmarSeparado(proximoId) {
    setConfirmando(selOrder?.id);
    try {
      const r = await api(`/orders/${encodeURIComponent(selOrder.id)}/status`, {
        method: 'POST', body: JSON.stringify({ status: 'picked' }),
      });
      if (r?.ok) {
        beep(true); setModalSep(false);
        await refreshAll();
        if (proximoId) {
          const prox = orders.pending.find(x => x.id === proximoId);
          if (prox) { selectOrder(prox); showToast(`✓ Separado! Próximo: ${proximoId}`, 'ok'); }
          else showToast('Pedido separado ✓', 'ok');
        } else { setSelOrder(null); showToast('🎉 Todos separados!', 'ok'); }
      } else if (r) showToast(r.error || 'Falha', 'err');
    } catch(e) { showToast(e.message, 'err'); }
    finally { setConfirmando(null); }
  }

  // ── Confirmar expedição ──
  async function confirmarExpedicao(proximoId) {
    if (!selOrder) return;
    setConfirmando(selOrder.id);
    try {
      const r = await api(`/orders/${encodeURIComponent(selOrder.id)}/status`, {
        method: 'POST', body: JSON.stringify({ status: 'packed' }),
      });
      if (r?.ok) {
        beep(true); setModalExp(false);
        await refreshAll();
        if (proximoId) {
          const prox = orders.picked.find(x => x.id === proximoId);
          if (prox) { selectOrder(prox); showToast(`✓ Expedido! Próximo: ${proximoId}`, 'ok'); }
          else { setSelOrder(null); showToast('Pedido EXPEDIDO ✅', 'ok'); }
        } else { setSelOrder(null); showToast('🎉 Todos expedidos!', 'ok'); }
      } else if (r) showToast(r.error || 'Falha ao expedir', 'err');
    } catch(e) { showToast(e.message, 'err'); }
    finally { setConfirmando(null); }
  }

  async function switchTab(t) {
    setTab(t); setSelOrder(null);
    if (t !== 'pending') setModalSep(false);
    setTimeout(() => scanInputRef.current?.focus(), 150);
    await refreshAll();
  }

  const counts = { pending: orders.pending.length, picked: orders.picked.length, packed: orders.packed.length };

  const listaFiltrada = useMemo(() => {
    const q = filter.toLowerCase().trim();
    const lista = orders[tab] || [];
    if (!q) return lista;
    return lista.filter(o =>
      (o.id || '').toLowerCase().includes(q) ||
      (o.clienteNome || '').toLowerCase().includes(q)
    );
  }, [orders, tab, filter]);

  const progress = useMemo(() => {
    const its = Array.isArray(selOrder?.items) ? selOrder.items : [];
    const total   = its.reduce((a, i) => a + Number(i.qty || 0), 0);
    const checked = its.reduce((a, i) => a + Number(i.checkedQty || 0), 0);
    return { total, checked, pct: total > 0 ? Math.round((checked / total) * 100) : 0, allOk: total > 0 && checked >= total };
  }, [selOrder]);

  const proximoPedido = useMemo(() => {
    if (!selOrder) return null;
    const lista = orders[tab] || [];
    return lista.find(x => x.id !== selOrder.id) || null;
  }, [orders, tab, selOrder]);

  const TABS = [
    { id: 'pending', label: 'Separar',  count: counts.pending, icon: PackageCheck,  color: 'amber'  },
    { id: 'picked',  label: 'Expedir',  count: counts.picked,  icon: SendHorizonal, color: 'blue'   },
    { id: 'packed',  label: 'Expedido', count: counts.packed,  icon: CircleCheck,   color: 'emerald', sub: 'hoje' },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-slate-950 text-slate-100">

      {/* ── Topbar ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-slate-900/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <BoxesIcon size={16} className="text-blue-400" />
          </div>
          <div>
            <h1 className="font-black text-base text-slate-100 leading-none">Expedição do Dia</h1>
            <p className="text-[10px] text-slate-600 mt-0.5 font-mono">{clock}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshAll} disabled={loading}
            className="p-2 rounded-xl bg-slate-800 border border-white/8 text-slate-500 hover:text-slate-300 disabled:opacity-40 transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <a href="/manual"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold transition-all hover:scale-105 shadow-lg shadow-blue-900/30">
            <Plus size={13}/> Novo Pedido
          </a>
        </div>
      </div>

      {/* ── Layout ── */}
      <div className="flex-1 min-h-0 grid overflow-hidden" style={{ gridTemplateColumns: '300px 1fr' }}>

        {/* ── Coluna esquerda ── */}
        <div className="border-r border-white/5 flex flex-col overflow-hidden bg-slate-900/30">

          {/* Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-3 border-b border-white/5 flex-shrink-0">
            {TABS.map(t => {
              const Icon = t.icon;
              const isActive = tab === t.id;
              const dotColor = { amber: 'bg-amber-400', blue: 'bg-blue-400', emerald: 'bg-emerald-400' }[t.color];
              const textColor = { amber: 'text-amber-400', blue: 'text-blue-400', emerald: 'text-emerald-400' }[t.color];
              return (
                <button key={t.id} onClick={() => switchTab(t.id)}
                  className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border transition-all
                    ${isActive ? 'bg-slate-800 border-white/12 shadow-sm' : 'bg-transparent border-transparent text-slate-600 hover:text-slate-400'}`}>
                  <div className="flex items-center gap-1.5">
                    {t.count > 0 && isActive && <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
                    <span className={`font-black text-2xl leading-none tabular-nums ${isActive ? textColor : ''}`}>{t.count}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Icon size={10} className={isActive ? textColor : 'text-slate-600'} />
                    <span className={`text-[10px] font-bold ${isActive ? 'text-slate-300' : 'text-slate-600'}`}>{t.label}</span>
                  </div>
                  {t.sub && <span className="text-[8px] text-slate-700 font-mono">{t.sub}</span>}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-white/5 flex-shrink-0">
            <input id="filterInput" value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="🔍  Filtrar pedidos…"
              className="w-full bg-slate-800/60 border border-white/5 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-white/20 transition-colors placeholder:text-slate-600" />
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto p-2.5 scrollbar-thin scrollbar-thumb-slate-700/50">
            {loading && orders[tab].length === 0 ? (
              <div className="space-y-2 pt-1">
                {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-slate-800/60 animate-pulse" />)}
              </div>
            ) : listaFiltrada.length === 0 ? (
              <div className="text-center text-slate-600 text-xs py-12">
                {orders[tab]?.length === 0
                  ? tab === 'pending' ? '📭 Sem pedidos para separar'
                    : tab === 'picked' ? '📭 Sem pedidos para expedir'
                    : '📭 Nenhum expedido hoje'
                  : '🔍 Sem resultados'}
              </div>
            ) : listaFiltrada.map(o => (
              <OrderCard key={o.id} o={o} tab={tab} active={selOrder?.id === o.id}
                onClick={() => selectOrder(o)} />
            ))}
          </div>
        </div>

        {/* ── Coluna direita ── */}
        <div className="flex flex-col overflow-hidden">

          {/* ════ ABA SEPARAR ════ */}
          {tab === 'pending' && (selOrder ? (
            <div className="flex flex-col min-h-0 overflow-hidden">
              {/* Header do pedido */}
              <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-white/5 bg-slate-900/60 flex-shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <MktLogo mkt={selOrder.marketplace} />
                    <span className="font-mono font-black text-sm text-slate-300">{selOrder.id}</span>
                    {(selOrder.logistica === 'flex' || selOrder.isPriority) && <FlexBadge />}
                  </div>
                  {(() => {
                    const info = getEtiquetaInfo(selOrder);
                    if (!info?.valor) return null;
                    return (
                      <span className={`inline-flex items-center gap-1 mt-1.5 text-xs font-bold px-2 py-0.5 rounded-full border
                        ${info.tipo === 'ml' ? 'bg-amber-400/12 text-amber-400 border-amber-400/25' : 'bg-orange-500/10 text-orange-400 border-orange-500/20 font-mono'}`}>
                        {info.tipo === 'ml' ? '🏷️' : '📦'} {info.valor}
                      </span>
                    );
                  })()}
                  {selOrder.clienteNome && (
                    <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1"><User size={10}/>{selOrder.clienteNome}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ProgressRing pct={progress.pct} size={46} stroke={4} />
                  <button onClick={() => setModalSep(true)}
                    disabled={!progress.allOk || selOrder.status !== 'pending'}
                    className="px-4 py-2 rounded-xl text-sm font-extrabold bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-900/30">
                    ✓ Separado
                  </button>
                </div>
              </div>
              {/* Scanner */}
              <div className="flex-shrink-0">
                <ScannerZone status={scanStatus} hint="bipe SKU ou EAN + Enter" inputRef={scanInputRef} onManualScan={onScan} />
              </div>
              {/* Itens */}
              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2.5 scrollbar-thin scrollbar-thumb-slate-700/50">
                {(selOrder.items || []).length === 0
                  ? <Vazio icon="📦" titulo="Sem itens" sub="Este pedido não possui itens cadastrados." />
                  : (selOrder.items || []).map((it, i) => <ItemRow key={i} it={it} onCheck={onScan} />)
                }
              </div>
              {/* Footer progresso */}
              <div className="flex items-center gap-3 px-5 py-3 border-t border-white/5 bg-slate-900/60 flex-shrink-0">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Progresso</span>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${progress.pct >= 100 ? 'bg-emerald-400' : 'bg-blue-400'}`}
                    style={{ width: `${progress.pct}%` }} />
                </div>
                <span className={`font-mono text-sm font-black ${progress.allOk ? 'text-emerald-400' : 'text-slate-300'}`}>
                  {progress.checked} / {progress.total}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 items-center justify-center gap-5 p-10">
              <div className="w-20 h-20 rounded-3xl bg-slate-800/60 border border-white/5 flex items-center justify-center">
                <ScanLine size={36} className="text-slate-600" />
              </div>
              <div className="text-center">
                <p className="font-black text-lg text-slate-300">Selecione um pedido</p>
                <p className="text-slate-600 text-sm mt-2 max-w-xs leading-relaxed">
                  Escolha um pedido na lista para iniciar a separação com o scanner
                </p>
              </div>
              {counts.pending === 0 && (
                <div className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-500/8 border border-emerald-500/15">
                  <CircleCheck size={18} className="text-emerald-400" />
                  <span className="text-sm font-bold text-emerald-400">Todos os pedidos foram separados!</span>
                </div>
              )}
            </div>
          ))}

          {/* ════ ABA EXPEDIR ════ */}
          {tab === 'picked' && (selOrder ? (
            <div className="flex flex-col min-h-0 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-white/5 bg-slate-900/60 flex-shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <MktLogo mkt={selOrder.marketplace} />
                    <span className="font-mono font-black text-sm text-slate-300">{selOrder.id}</span>
                    {(selOrder.logistica === 'flex' || selOrder.isPriority) && <FlexBadge />}
                  </div>
                  {selOrder.clienteNome && (
                    <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1"><User size={10}/>{selOrder.clienteNome}</p>
                  )}
                </div>
                <button onClick={() => setModalExp(true)}
                  className="px-4 py-2 rounded-xl text-sm font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white transition-all hover:scale-105 active:scale-95 shadow-lg shadow-emerald-900/30">
                  <Truck size={14} className="inline mr-1.5"/> Expedir
                </button>
              </div>

              {/* Scanner EXPEDIR */}
              <div className="flex-shrink-0">
                <ScannerZone
                  status={scanStatus}
                  hint="bipe DANFE ou apelido 2× para confirmar"
                  inputRef={scanInputRef}
                  onManualScan={onScanExpedicao}
                />
              </div>

              {/* Instruções do fluxo scanner */}
              <div className="mx-4 mb-3 px-4 py-3 rounded-xl bg-blue-500/6 border border-blue-500/15 flex-shrink-0">
                <p className="text-xs font-bold text-blue-400 mb-1">Como funciona o scanner aqui:</p>
                <ol className="text-[11px] text-slate-500 space-y-0.5 list-decimal list-inside">
                  <li>Bipe o código da <strong className="text-slate-400">DANFE ou do apelido/pedido</strong> → pedido é identificado</li>
                  <li>Bipe <strong className="text-slate-400">novamente</strong> o mesmo código → expedição é confirmada automaticamente</li>
                </ol>
              </div>

              {/* Etiqueta destaque */}
              <div className="px-4 mb-3 flex-shrink-0">
                <EtiquetaDestaque o={selOrder} large />
              </div>

              {/* Itens */}
              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 scrollbar-thin scrollbar-thumb-slate-700/50">
                {(Array.isArray(selOrder.items) ? selOrder.items : []).map((it, i) => {
                  const foto = it.stockPhotos?.[0] || it.image || '/assets/placeholder.png';
                  return (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl border border-white/6 bg-slate-800/50">
                      <img src={foto} onError={e => { e.target.src = '/assets/placeholder.png'; }}
                        className="w-14 h-14 rounded-xl object-cover border border-white/8 bg-slate-700 shrink-0" alt="" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-200 truncate">{it.nameShort || it.name || '—'}</p>
                        <p className="font-mono text-[10px] text-slate-500 mt-0.5">SKU {it.sku}{(it.customBin || it.bin) ? ` · 📍 ${it.customBin || it.bin}` : ''}</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-500/25 flex items-center justify-center shrink-0">
                        <span className="font-mono text-lg font-black text-emerald-400">×{it.qty}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 items-center justify-center gap-5 p-10">
              <div className="w-20 h-20 rounded-3xl bg-slate-800/60 border border-white/5 flex items-center justify-center">
                <ScanLine size={36} className="text-slate-600" />
              </div>
              <div className="text-center">
                <p className="font-black text-lg text-slate-300">Selecione ou bipe um pedido</p>
                <p className="text-slate-600 text-sm mt-2 max-w-xs leading-relaxed">
                  Escolha um pedido na lista ou bipe o código da DANFE para identificar automaticamente
                </p>
              </div>
              {counts.picked === 0 && (
                <div className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-500/8 border border-blue-500/15">
                  <SendHorizonal size={18} className="text-blue-400" />
                  <span className="text-sm font-bold text-blue-400">Nenhum pedido aguardando expedição</span>
                </div>
              )}
            </div>
          ))}

          {/* ════ ABA EXPEDIDO ════ */}
          {tab === 'packed' && (
            <div className="flex flex-col overflow-hidden h-full">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 bg-slate-900/60 flex-shrink-0">
                <div>
                  <p className="font-black text-base flex items-center gap-2">
                    <CircleCheck size={16} className="text-emerald-400"/>Expedidos Hoje
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{counts.packed} pedido(s) · contador zera à meia-noite</p>
                </div>
                <button onClick={refreshAll} disabled={loading}
                  className="p-2 rounded-xl bg-slate-800 border border-white/8 text-slate-500 hover:text-slate-300 disabled:opacity-40 transition-colors">
                  <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5 scrollbar-thin scrollbar-thumb-slate-700/50">
                {orders.packed.length === 0
                  ? <Vazio icon="✅" titulo="Nenhum pedido expedido hoje" sub="Dados históricos ficam salvos no Firestore para pesquisa futura." />
                  : orders.packed.map(o => {
                    const its = Array.isArray(o.items) ? o.items : [];
                    const etiq = getEtiquetaInfo(o);
                    return (
                      <div key={o.id} className="rounded-2xl border border-emerald-500/12 bg-emerald-950/8 overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-emerald-500/8">
                          <div className="min-w-0 flex items-center gap-2">
                            <CircleCheck size={14} className="text-emerald-500 shrink-0" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <MktLogo mkt={o.marketplace} />
                                <span className="font-mono text-[10px] text-slate-500">{o.id}</span>
                              </div>
                              {etiq?.valor && (
                                <p className={`text-[10px] font-bold mt-0.5 truncate ${etiq.tipo === 'ml' ? 'text-amber-500' : 'text-orange-500'}`}>
                                  {etiq.valor}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] font-mono text-emerald-600 shrink-0">{fmtTime(o.updatedAtMs)}</span>
                        </div>
                        <div className="divide-y divide-white/5">
                          {its.map((it, i) => {
                            const foto = it.stockPhotos?.[0] || it.image || '/assets/placeholder.png';
                            return (
                              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                                <img src={foto} onError={e => { e.target.src = '/assets/placeholder.png'; }}
                                  className="w-10 h-10 rounded-xl object-cover bg-slate-800 border border-white/8 shrink-0" alt="" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-slate-300 truncate">{it.nameShort || it.name || '—'}</p>
                                  <p className="font-mono text-[10px] text-slate-600">SKU {it.sku}</p>
                                </div>
                                <span className="font-mono text-sm font-black text-emerald-500 shrink-0">×{it.qty}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Overlays ── */}
      <Toast items={toasts} />
      <ScanFlash tipo={flash} />

      {modalSep && (
        <ModalSeparado
          order={selOrder} proximo={proximoPedido}
          onConfirmar={confirmarSeparado} onFechar={() => setModalSep(false)}
          confirmando={!!confirmando}
        />
      )}
      {modalExp && (
        <ModalExpedicao
          order={selOrder} proximo={proximoPedido}
          onConfirmar={confirmarExpedicao} onFechar={() => setModalExp(false)}
          confirmando={!!confirmando}
        />
      )}
    </div>
  );
}
