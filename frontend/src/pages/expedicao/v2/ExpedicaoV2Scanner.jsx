/**
 * @file ExpedicaoV2Scanner.jsx
 * @module expedicao/v2
 * @description Tela operacional de expedição V2.
 *   Layout 3 colunas: sidebar nav | fila clicável de pedidos | detalhe + expedir.
 *   Fluxo: operador clica no pedido → vê itens/foto/bin → clica Expedir Agora.
 *   Scan de ORD_ como atalho rápido opcional (abaixo da fila).
 * @version 2.2.0
 * @date 2026-05-11
 * @changelog 2.2.0 - Bridge local: etiqueta ZPL direto na Elgin via localhost:9191; auto-avança para próximo pedido após 2s
 * @changelog 2.1.0 - Redesign: fila clicável + painel detalhe com itens/foto/bin
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../../../firebase';
import {
  ScanLine, CheckCircle2, XCircle, AlertTriangle, Package,
  Clock, Wifi, WifiOff, Pause, Play, List, CalendarDays,
  History, AlertCircle, Settings, LayoutDashboard,
  Maximize2, Minimize2, MapPin, Loader2, Zap, X, Printer,
} from 'lucide-react';

// ─── Terminal & Auth ──────────────────────────────────────────────────────────
function getTerminalId() {
  let id = localStorage.getItem('expedicao_pro_terminal_id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('expedicao_pro_terminal_id', id); }
  return id;
}
const TERMINAL_ID = getTerminalId();
const OPERADOR_NOME = localStorage.getItem('expedicao_user') || 'Operador';

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
  if (res.status === 401) { window.location.href = '/spa/login'; return null; }
  return { ok: res.ok, status: res.status, data: d };
}

// ─── Beeps ────────────────────────────────────────────────────────────────────
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

function beepAlerta() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [660, 660].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f; g.gain.value = 0.09;
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.22); o.stop(ctx.currentTime + i * 0.22 + 0.14);
    });
    setTimeout(() => ctx.close().catch(() => {}), 700);
  } catch {}
}

// ─── QZ Tray ─────────────────────────────────────────────────────────────────
async function qzConnect() {
  const qz = window.qz;
  if (!qz) throw new Error('QZ Tray não encontrado');
  if (!qz.websocket.isActive()) {
    try {
      qz.security.setCertificatePromise(resolve => resolve(null));
      qz.security.setSignatureAlgorithm('SHA512');
      qz.security.setSignaturePromise((toSign, pFactory) => pFactory(resolve => resolve(null)));
    } catch {}
    await qz.websocket.connect({ retries: 3, delay: 1 });
  }
  return qz;
}

async function printDanfe(blingNfId) {
  const token = localStorage.getItem('expedicao_token') || '';
  const res = await fetch(`/bling/danfe/${encodeURIComponent(blingNfId)}?tipo=simplificado`, {
    headers: { authorization: `Bearer ${token}`, 'x-terminal-id': TERMINAL_ID },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro DANFE ${res.status}`);

  let b64pdf = data.pdf || null;
  if (!b64pdf && data.pdfUrl) {
    const isBrowser = data.pdfUrl.includes('doc.view.php') || data.pdfUrl.includes('danfe.simplificado.php')
      || data.via === 'danfe_simplificado_browser' || data.via === 'linkDanfe_browser';
    if (isBrowser) { window.open(data.pdfUrl, '_blank'); return; }
    try {
      const pdfRes = await fetch(data.pdfUrl);
      const buf = await pdfRes.arrayBuffer();
      const sig = String.fromCharCode(...new Uint8Array(buf.slice(0, 4)));
      if (sig === '%PDF') b64pdf = btoa(String.fromCharCode(...new Uint8Array(buf)));
      else { window.open(data.pdfUrl, '_blank'); return; }
    } catch { window.open(data.pdfUrl, '_blank'); return; }
  }
  if (!b64pdf) throw new Error('Bling não retornou PDF');

  let qzOk = false;
  try {
    const qz = await qzConnect();
    const printer = await qz.printers.getDefault();
    const config = qz.configs.create(printer, { scaleContent: false, colorType: 'blackwhite', margins: { top: 0, right: 0, bottom: 0, left: 0 } });
    await qz.print(config, [{ type: 'pixel', format: 'pdf', flavor: 'base64', data: b64pdf }]);
    qzOk = true;
  } catch {}
  if (!qzOk) {
    const blob = new Blob([Uint8Array.from(atob(b64pdf), c => c.charCodeAt(0))], { type: 'application/pdf' });
    window.open(URL.createObjectURL(blob), '_blank');
  }
}

async function printEtiqueta(orderId) {
  const token = localStorage.getItem('expedicao_token') || '';
  const res = await fetch(`/api/etiqueta-logistica/${encodeURIComponent(orderId)}`, {
    headers: { authorization: `Bearer ${token}`, 'x-terminal-id': TERMINAL_ID },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro etiqueta ${res.status}`);

  // Tenta bridge local (ZPL direto na Elgin — sem pop-up)
  if (data.zpl) {
    try {
      const br = await fetch('http://localhost:9191/print', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ zpl: data.zpl }),
      });
      if (br.ok) return;
    } catch {} // bridge offline → fallback
  }

  // Fallback: abre link no browser
  if (data.link) { window.open(data.link, '_blank'); return; }
  throw new Error('Etiqueta sem conteúdo');
}

// ─── Helpers visuais ──────────────────────────────────────────────────────────
function MktBadge({ mkt, size = 'sm' }) {
  const sm = size === 'sm';
  const cls = `inline-flex items-center font-bold rounded leading-none select-none ${sm ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs gap-1'}`;
  if (mkt === 'MERCADO_LIVRE') return <span className={cls} style={{ background: '#FFE600', color: '#1a2060' }}>{size !== 'sm' && '⚡ '}ML</span>;
  if (mkt === 'SHOPEE')        return <span className={`${cls} bg-orange-600 text-white`}>{size !== 'sm' && '🛍 '}Shopee</span>;
  return <span className={`${cls} bg-slate-600 text-slate-200`}>OUT</span>;
}

function PrioridadeDot({ prioridade }) {
  if (prioridade === 1) return <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" title="Alta — Mercado Livre" />;
  if (prioridade === 2) return <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Média — Shopee" />;
  return <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" title="Baixa — Outros" />;
}

function StatusFilaBadge({ order }) {
  if (order.bloqueado)
    return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400 uppercase">BLOQUEADO</span>;
  if (order.status === 'ERRO')
    return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400 uppercase">ERRO</span>;
  if (order.status === 'EM_PROCESSO')
    return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-400 uppercase">EM PROCESSO</span>;
  if (order.pode_expedir === false)
    return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 uppercase">AGENDADO</span>;
  return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 uppercase">PRONTO</span>;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ counts, activeSection, onSection }) {
  const items = [
    { id: 'scanner',    icon: ScanLine,        label: 'Scanner',           sub: 'Operacional' },
    { id: 'fila',       icon: List,            label: 'Fila de Pedidos',   count: counts.hoje },
    { id: 'amanha',     icon: CalendarDays,    label: 'Amanhã',            count: counts.amanha },
    { id: 'historico',  icon: History,         label: 'Histórico',         sub: 'Expedidos' },
    { id: 'pendencias', icon: AlertCircle,     label: 'Pendências',        count: counts.erros, countColor: 'text-red-400' },
    null,
    { id: 'torre',      icon: LayoutDashboard, label: 'Torre de Controle', sub: 'Dashboard', href: '/spa/expedicao/v2/torre' },
    { id: 'config',     icon: Settings,        label: 'Configurações',     sub: 'Impressão' },
  ];

  return (
    <aside className="w-44 shrink-0 flex flex-col border-r border-slate-800" style={{ background: '#020617' }}>
      <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-800">
        <div className="w-7 h-7 rounded bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
          <ScanLine size={14} className="text-emerald-400" />
        </div>
        <span className="text-xs font-bold text-white leading-tight">UniversoBox</span>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {items.map((item, i) => {
          if (!item) return <div key={i} className="my-2 mx-3 border-t border-slate-800" />;
          const active = activeSection === item.id;
          const Tag = item.href ? 'a' : 'button';
          return (
            <Tag
              key={item.id}
              href={item.href}
              onClick={!item.href ? () => onSection(item.id) : undefined}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors rounded-lg mx-1 ${
                active
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              style={{ width: 'calc(100% - 8px)' }}
            >
              <item.icon size={15} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{item.label}</div>
                {item.sub && <div className="text-[10px] text-slate-600 truncate">{item.sub}</div>}
              </div>
              {item.count != null && (
                <span className={`text-xs font-bold ${item.countColor || 'text-slate-400'}`}>{item.count}</span>
              )}
            </Tag>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
            {OPERADOR_NOME.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-300 truncate">{OPERADOR_NOME}</div>
            <div className="text-[10px] text-slate-600">Estação 01</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── OrderCard (card clicável na fila) ───────────────────────────────────────
function OrderCard({ order, selected, onClick }) {
  const totalItens = (order.items || []).reduce((s, it) => s + Number(it.qty || 0), 0);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-3 transition-all mb-2 ${
        selected
          ? 'border-emerald-500/60 bg-emerald-900/15 ring-1 ring-emerald-500/20'
          : order.bloqueado || order.status === 'ERRO'
            ? 'border-red-800/40 bg-red-950/10 hover:border-red-700/50'
            : 'border-slate-700/50 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-800/40'
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <PrioridadeDot prioridade={order.prioridade} />
        <span className="font-mono text-xs font-bold text-white flex-1 truncate">{order.id}</span>
        <MktBadge mkt={order.marketplace} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 flex-1 truncate">{order.clienteNome || '—'}</span>
        <StatusFilaBadge order={order} />
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-600">
        <span className="flex items-center gap-1"><Package size={9} /> {totalItens} {totalItens === 1 ? 'item' : 'itens'}</span>
        <span className="flex items-center gap-1"><CalendarDays size={9} /> {fmtDate(order.data_expedicao)}</span>
      </div>
    </button>
  );
}

// ─── ItemDetail (linha de item no painel de detalhe) ─────────────────────────
function ItemDetail({ item }) {
  const foto = item.stockPhotos?.[0] || item.image || null;
  const bin  = item.customBin || item.bin || '';
  const nome = item.nameShort || item.name || item.sku || '—';
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-800/60 bg-slate-900/30">
      <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-slate-800 border border-slate-700/40">
        {foto
          ? <img src={foto} onError={e => { e.target.src = '/assets/placeholder.png'; }} className="w-full h-full object-cover" alt="" />
          : <div className="w-full h-full flex items-center justify-center"><Package size={20} className="text-slate-600" /></div>
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 font-medium leading-tight">{nome}</p>
        <p className="text-[11px] text-slate-500 font-mono mt-0.5">{item.sku}</p>
        {bin && (
          <div className="flex items-center gap-1 mt-1.5">
            <MapPin size={10} className="text-amber-400 shrink-0" />
            <span className="text-xs font-bold text-amber-400">{bin}</span>
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <span className="text-2xl font-bold text-white leading-none">{item.qty}</span>
        <p className="text-[10px] text-slate-600">und</p>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ExpedicaoV2Scanner() {
  const [queue, setQueue]                   = useState([]);
  const [counts, setCounts]                 = useState({ hoje: 0, amanha: 0, erros: 0 });
  const [selectedId, setSelectedId]         = useState(null);
  const [orderDetail, setOrderDetail]       = useState(null);
  const [loadingDetail, setLoadingDetail]   = useState(false);
  const [expedindo, setExpedindo]           = useState(false);
  const [expedirResult, setExpedirResult]   = useState(null);
  const [printStatus, setPrintStatus]       = useState('');
  const [codigo, setCodigo]                 = useState('');
  const [scanErro, setScanErro]             = useState('');
  const [paused, setPaused]                 = useState(false);
  const [fullscreen, setFullscreen]         = useState(false);
  const [qzOnline, setQzOnline]             = useState(false);
  const [bridgeOnline, setBridgeOnline]     = useState(false);
  const [activeSection, setActiveSection]   = useState('scanner');
  const [hora, setHora]                     = useState('');
  const scanRef                             = useRef(null);

  // Relógio
  useEffect(() => {
    const tick = () => setHora(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // QZ Tray
  useEffect(() => {
    qzConnect().then(() => setQzOnline(true)).catch(() => setQzOnline(false));
  }, []);

  // Bridge local
  useEffect(() => {
    const check = () => fetch('http://localhost:9191/status').then(r => setBridgeOnline(r.ok)).catch(() => setBridgeOnline(false));
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, []);

  // Fullscreen listener
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  // Carrega fila de orders_v2
  const loadQueue = useCallback(async () => {
    const r = await api('/api/v2/expedicao/queue');
    if (r?.ok) {
      const items  = r.data.items  || [];
      const hoje   = r.data.hoje   || '';
      const amanha = r.data.amanha || '';
      setQueue(items);
      setCounts({
        hoje:   items.filter(o => o.data_expedicao === hoje).length,
        amanha: items.filter(o => o.data_expedicao === amanha).length,
        erros:  items.filter(o => o.status === 'ERRO' || o.bloqueado).length,
      });
    }
  }, []);

  useEffect(() => {
    loadQueue();
    const id = setInterval(loadQueue, 30_000);
    return () => clearInterval(id);
  }, [loadQueue]);

  // Seleciona pedido e busca detalhes ricos de orders/{id}
  const selectOrder = useCallback(async (orderId) => {
    if (selectedId === orderId) {
      setSelectedId(null);
      setOrderDetail(null);
      setExpedirResult(null);
      return;
    }
    setSelectedId(orderId);
    setOrderDetail(null);
    setExpedirResult(null);
    setLoadingDetail(true);
    try {
      const snap = await getDoc(doc(db, 'orders', orderId));
      setOrderDetail(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    } catch {
      setOrderDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [selectedId]);

  // Campo de scan — busca ORD_ na fila e seleciona
  const handleScanSubmit = useCallback((e) => {
    e.preventDefault();
    const cod = codigo.trim();
    if (!cod) return;
    const found = queue.find(o => o.id === cod || o.numeroPedido === cod);
    if (found) {
      setScanErro('');
      setCodigo('');
      selectOrder(found.id);
    } else {
      beep(false);
      setScanErro(`"${cod}" não encontrado na fila`);
      setTimeout(() => setScanErro(''), 3000);
    }
  }, [codigo, queue, selectOrder]);

  // Expedir pedido selecionado
  const handleExpedir = useCallback(async () => {
    if (!selectedId || expedindo || paused) return;

    setExpedindo(true);
    setExpedirResult(null);
    const t0 = Date.now();

    try {
      setPrintStatus('Validando pedido…');
      const scanRes = await api('/api/v2/expedicao/scan', {
        method: 'POST',
        body: JSON.stringify({ codigo: selectedId, operadorId: TERMINAL_ID }),
      });

      if (!scanRes?.ok) {
        beep(false);
        setExpedirResult({ ok: false, msg: scanRes?.data?.error || 'Erro ao processar' });
        return;
      }

      const { order, warning } = scanRes.data;
      if (warning) beepAlerta();

      let etiquetaOk = false, danfeOk = false, erroMsg = null;

      try {
        setPrintStatus('Imprimindo etiqueta de envio…');
        await printEtiqueta(order.id);
        etiquetaOk = true;
      } catch (err) { erroMsg = `Etiqueta: ${err.message}`; }

      try {
        if (order.blingNfId) {
          setPrintStatus('Imprimindo DANFE…');
          await printDanfe(order.blingNfId);
          danfeOk = true;
        } else {
          danfeOk = true;
        }
      } catch (err) {
        erroMsg = erroMsg ? `${erroMsg} | DANFE: ${err.message}` : `DANFE: ${err.message}`;
      }

      if (etiquetaOk || danfeOk) {
        await api(`/api/v2/expedicao/${order.id}/expedido`, {
          method: 'PATCH',
          body: JSON.stringify({ etiqueta_impressa: etiquetaOk, danfe_impressa: danfeOk }),
        });
        beep(true);
        const nextOrder = queue.find(o => o.id !== order.id && !o.bloqueado && o.status !== 'EXPEDIDO' && o.status !== 'EM_PROCESSO');
        setExpedirResult({ ok: true, order, warning, elapsed: Date.now() - t0, nextId: nextOrder?.id });
        loadQueue();
        setTimeout(() => {
          setExpedirResult(null);
          if (nextOrder) {
            selectOrder(nextOrder.id);
          } else {
            setSelectedId(null);
            setOrderDetail(null);
          }
        }, 2000);
      } else {
        await api(`/api/v2/expedicao/${order.id}/erro`, {
          method: 'PATCH',
          body: JSON.stringify({ erroMsg }),
        });
        beep(false);
        setExpedirResult({ ok: false, msg: erroMsg, order });
      }
    } catch (err) {
      beep(false);
      setExpedirResult({ ok: false, msg: err.message });
    } finally {
      setExpedindo(false);
      setPrintStatus('');
    }
  }, [selectedId, expedindo, paused, queue, loadQueue, selectOrder]);

  const selectedQueueItem = queue.find(o => o.id === selectedId);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#020617', color: '#e2e8f0' }}>

      {/* Sidebar */}
      <Sidebar counts={counts} activeSection={activeSection} onSection={setActiveSection} />

      {/* Conteúdo principal */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="shrink-0 flex items-center gap-3 px-4 h-12 border-b border-slate-800 bg-slate-950/80">
          <ScanLine size={16} className="text-emerald-400 shrink-0" />
          <span className="font-bold text-white text-sm tracking-wide">EXPEDIÇÃO V2</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold uppercase">
            {paused ? 'Pausado' : 'Modo Operacional'}
          </span>

          <span className={`flex items-center gap-1.5 text-xs ml-1 ${qzOnline ? 'text-emerald-400' : 'text-slate-600'}`}>
            {qzOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
            QZ {qzOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
          <span className={`flex items-center gap-1.5 text-xs ml-1 ${bridgeOnline ? 'text-emerald-400' : 'text-slate-600'}`}>
            <Printer size={11} /> Bridge {bridgeOnline ? 'ONLINE' : 'OFFLINE'}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPaused(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                paused
                  ? 'bg-emerald-600/20 border-emerald-600/40 text-emerald-400 hover:bg-emerald-600/30'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              {paused ? <><Play size={11} /> Retomar</> : <><Pause size={11} /> Pausar Impressões</>}
            </button>
            <button onClick={toggleFullscreen} className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors">
              {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            <div className="text-xs text-slate-500 pl-2 border-l border-slate-800 text-right">
              <div className="text-white font-bold">{hora}</div>
              <div>{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
            </div>
          </div>
        </header>

        {/* Body — painel fila + painel detalhe */}
        <div className="flex-1 flex overflow-hidden">

          {/* Painel central: fila clicável */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-slate-800">

            <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/60">
              <List size={14} className="text-slate-500" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Fila de Expedição</span>
              <span className="ml-1 text-xs font-bold text-slate-600">{queue.length} pedidos</span>
              {counts.erros > 0 && (
                <span className="ml-auto text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded">
                  {counts.erros} com erro
                </span>
              )}
            </div>

            {/* Lista de cards */}
            <div className="flex-1 overflow-y-auto p-3">
              {queue.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <CheckCircle2 size={40} className="text-emerald-600/30 mb-3" />
                  <p className="text-slate-500 font-medium">Fila vazia</p>
                  <p className="text-slate-700 text-xs mt-1">Todos os pedidos foram expedidos</p>
                </div>
              ) : (
                queue.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    selected={selectedId === order.id}
                    onClick={() => selectOrder(order.id)}
                  />
                ))
              )}
            </div>

            {/* Campo scan — atalho opcional */}
            <div className="shrink-0 border-t border-slate-800 p-3 bg-slate-950/40">
              <form onSubmit={handleScanSubmit}>
                <div className="flex gap-2 items-center">
                  <ScanLine size={13} className="text-slate-600 shrink-0" />
                  <input
                    ref={scanRef}
                    value={codigo}
                    onChange={e => { setCodigo(e.target.value); setScanErro(''); }}
                    placeholder="Bipe ou digite o ORD_ para selecionar…"
                    autoComplete="off"
                    className="flex-1 bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm font-mono text-slate-300 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                  />
                  <button type="submit" className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors shrink-0">
                    OK
                  </button>
                </div>
                {scanErro && (
                  <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                    <AlertCircle size={10} /> {scanErro}
                  </p>
                )}
              </form>
            </div>
          </div>

          {/* Painel direito: detalhe do pedido */}
          <div className="w-96 shrink-0 flex flex-col overflow-hidden">

            {!selectedId ? (
              /* Estado vazio — resumo da fila */
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                  <Package size={28} className="text-emerald-600/50" />
                </div>
                <p className="text-slate-400 font-medium mb-1">Selecione um pedido</p>
                <p className="text-slate-600 text-xs">Clique num card da fila ao lado</p>

                <div className="mt-6 w-full grid grid-cols-2 gap-2">
                  {[
                    { label: 'Prontos hoje',  value: counts.hoje,   color: 'text-emerald-400' },
                    { label: 'Para amanhã',   value: counts.amanha, color: 'text-blue-400' },
                    { label: 'Com erro',      value: counts.erros,  color: 'text-red-400' },
                    { label: 'Total na fila', value: queue.length,  color: 'text-slate-300' },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl bg-slate-900/40 border border-slate-800 p-3 text-center">
                      <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-[10px] text-slate-600 uppercase mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Detalhe do pedido selecionado */
              <div className="flex flex-col h-full overflow-hidden">

                {/* Header do detalhe */}
                <div className="shrink-0 p-4 border-b border-slate-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono font-bold text-white text-sm">{selectedId}</span>
                        {selectedQueueItem && <MktBadge mkt={selectedQueueItem.marketplace} size="lg" />}
                      </div>
                      <p className="text-sm text-slate-400 truncate">{selectedQueueItem?.clienteNome || '—'}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {selectedQueueItem && <StatusFilaBadge order={selectedQueueItem} />}
                        {selectedQueueItem?.data_expedicao && (
                          <span className="text-[10px] text-slate-600 flex items-center gap-1">
                            <CalendarDays size={9} /> {fmtDate(selectedQueueItem.data_expedicao)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => { setSelectedId(null); setOrderDetail(null); setExpedirResult(null); }}
                      className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-500 hover:text-slate-300 shrink-0"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>

                {/* Itens */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {loadingDetail ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2">
                      <Loader2 size={22} className="text-emerald-400 animate-spin" />
                      <span className="text-xs text-slate-500">Carregando itens…</span>
                    </div>
                  ) : orderDetail ? (
                    <>
                      <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                        {(orderDetail.items || []).reduce((s, it) => s + Number(it.qty || 0), 0)} unidades · {(orderDetail.items || []).length} SKU
                      </p>
                      {(orderDetail.items || []).map((item, i) => (
                        <ItemDetail key={i} item={item} />
                      ))}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <AlertTriangle size={22} className="text-amber-400 mb-2" />
                      <p className="text-sm text-slate-500">Detalhes não encontrados</p>
                      <p className="text-xs text-slate-600 mt-1">Pedido sem espelho em <code className="text-slate-500">orders/</code></p>
                    </div>
                  )}

                  {/* Resultado da expedição */}
                  {expedirResult && (
                    <div className={`p-3 rounded-xl border ${expedirResult.ok ? 'border-emerald-600/40 bg-emerald-900/10' : 'border-red-600/40 bg-red-900/10'}`}>
                      <div className="flex items-center gap-2">
                        {expedirResult.ok
                          ? <CheckCircle2 size={14} className="text-emerald-400" />
                          : <XCircle size={14} className="text-red-400" />
                        }
                        <span className={`text-xs font-semibold ${expedirResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                          {expedirResult.ok ? 'Expedido com sucesso!' : 'Erro na expedição'}
                        </span>
                        {expedirResult.elapsed && (
                          <span className="ml-auto text-[10px] text-slate-600">{(expedirResult.elapsed / 1000).toFixed(1)}s</span>
                        )}
                      </div>
                      {expedirResult.msg && <p className="text-xs text-red-300 mt-1">{expedirResult.msg}</p>}
                      {expedirResult.warning && (
                        <p className="text-xs text-amber-300 mt-1 flex items-center gap-1">
                          <AlertTriangle size={10} /> {expedirResult.warning}
                        </p>
                      )}
                      {expedirResult.ok && expedirResult.nextId && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                          <span>Próximo:</span>
                          <span className="font-mono text-slate-400">{expedirResult.nextId}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Botão Expedir Agora */}
                <div className="shrink-0 p-4 border-t border-slate-800">
                  {paused && (
                    <p className="text-xs text-amber-400 text-center mb-2 flex items-center justify-center gap-1">
                      <Pause size={11} /> Impressões pausadas
                    </p>
                  )}
                  <button
                    onClick={handleExpedir}
                    disabled={expedindo || paused || (selectedQueueItem && selectedQueueItem.pode_expedir === false)}
                    className={`w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-bold text-base transition-all ${
                      expedindo
                        ? 'bg-blue-600/30 border border-blue-600/30 text-blue-300 cursor-wait'
                        : paused
                          ? 'bg-slate-700/30 border border-slate-700 text-slate-500 cursor-not-allowed'
                          : selectedQueueItem?.pode_expedir === false
                            ? 'bg-slate-700/30 border border-slate-700 text-slate-500 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 border border-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                    }`}
                  >
                    {expedindo ? (
                      <><Loader2 size={18} className="animate-spin" /> {printStatus || 'Expedindo…'}</>
                    ) : selectedQueueItem?.pode_expedir === false ? (
                      <><Clock size={18} /> Agendado para {fmtDate(selectedQueueItem?.data_expedicao)}</>
                    ) : (
                      <><Zap size={18} /> Expedir Agora</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
