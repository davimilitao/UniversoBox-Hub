/**
 * @file ExpedicaoV2Scanner.jsx
 * @module expedicao/v2
 * @description Tela de scanner do fluxo Expedição V2.
 *   Layout completo: sidebar própria + zona de scan + painel direito com fila e alertas.
 *   Operação física: bipa → imprime etiqueta + DANFE → próximo pedido. Zero clique.
 * @version 2.0.0
 * @date 2026-05-10
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ScanLine, CheckCircle2, XCircle, AlertTriangle, Printer,
  Package, Clock, ChevronRight, Wifi, WifiOff, Pause, Play,
  List, CalendarDays, History, AlertCircle, Settings, User,
  LayoutDashboard, Maximize2, Minimize2,
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

  if (data.pdfUrl) { window.open(data.pdfUrl, '_blank'); return; }
  if (data.pdf) {
    let qzOk = false;
    try {
      const qz = await qzConnect();
      const printer = await qz.printers.getDefault();
      const config = qz.configs.create(printer, { scaleContent: false, colorType: 'blackwhite' });
      await qz.print(config, [{ type: 'pixel', format: 'pdf', flavor: 'base64', data: data.pdf }]);
      qzOk = true;
    } catch {}
    if (!qzOk) {
      const blob = new Blob([Uint8Array.from(atob(data.pdf), c => c.charCodeAt(0))], { type: 'application/pdf' });
      window.open(URL.createObjectURL(blob), '_blank');
    }
  }
}

// ─── Helpers visuais ──────────────────────────────────────────────────────────
function MktBadge({ mkt, size = 'sm' }) {
  const sm = size === 'sm';
  const cls = `inline-flex items-center font-bold rounded leading-none select-none ${sm ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs gap-1'}`;
  if (mkt === 'MERCADO_LIVRE') return <span className={cls} style={{ background: '#FFE600', color: '#1a2060' }}>{size !== 'sm' && '⚡ '}ML</span>;
  if (mkt === 'SHOPEE')        return <span className={`${cls} bg-orange-600 text-white`}>{size !== 'sm' && '🛍 '}Shopee</span>;
  return <span className={`${cls} bg-slate-600 text-slate-200`}>OUT</span>;
}

function StatusBadge({ status }) {
  const map = {
    SUCESSO: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40',
    ERRO:    'bg-red-500/20 text-red-400 border border-red-500/40',
    AVISO:   'bg-amber-500/20 text-amber-400 border border-amber-500/40',
  };
  return <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${map[status] || map.AVISO}`}>{status}</span>;
}

function fmtTime(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function now() { return Date.now(); }

// ─── Sidebar interna ──────────────────────────────────────────────────────────
function Sidebar({ counts, activeSection, onSection }) {
  const items = [
    { id: 'scanner',  icon: ScanLine,        label: 'Scanner',           sub: 'Modo Operacional' },
    { id: 'fila',     icon: List,            label: 'Fila de Pedidos',   count: counts.hoje },
    { id: 'amanha',   icon: CalendarDays,    label: 'Amanhã',            count: counts.amanha },
    { id: 'historico',icon: History,         label: 'Histórico',         sub: 'Expedidos' },
    { id: 'pendencias',icon: AlertCircle,    label: 'Pendências',        count: counts.erros, countColor: 'text-red-400' },
    null, // divider
    { id: 'torre',    icon: LayoutDashboard, label: 'Torre de Controle', sub: 'Dashboard', href: '/spa/expedicao/v2/torre' },
    { id: 'config',   icon: Settings,        label: 'Configurações',     sub: 'Impressão' },
  ];

  return (
    <aside className="w-44 shrink-0 flex flex-col border-r border-slate-800" style={{ background: '#020617' }}>
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-800">
        <div className="w-7 h-7 rounded bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
          <ScanLine size={14} className="text-emerald-400" />
        </div>
        <span className="text-xs font-bold text-white leading-tight">UniversoBox</span>
      </div>

      {/* Nav items */}
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

      {/* Operador */}
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

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ExpedicaoV2Scanner() {
  const [codigo, setCodigo]           = useState('');
  const [processing, setProcessing]   = useState(false);
  const [paused, setPaused]           = useState(false);
  const [fullscreen, setFullscreen]   = useState(false);
  const [lastResult, setLastResult]   = useState(null);
  const [printStatus, setPrintStatus] = useState('');
  const [scanStart, setScanStart]     = useState(null);
  const [queue, setQueue]             = useState([]);
  const [alertas, setAlertas]         = useState([]);
  const [counts, setCounts]           = useState({ hoje: 0, amanha: 0, erros: 0 });
  const [qzOnline, setQzOnline]       = useState(false);
  const [activeSection, setActiveSection] = useState('scanner');
  const [hora, setHora]               = useState('');
  const inputRef                      = useRef(null);

  const focusInput = useCallback(() => { if (!paused) inputRef.current?.focus(); }, [paused]);

  // Relógio
  useEffect(() => {
    const tick = () => setHora(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-foco
  useEffect(() => {
    focusInput();
    const id = setInterval(focusInput, 2000);
    return () => clearInterval(id);
  }, [focusInput]);

  // QZ
  useEffect(() => {
    qzConnect().then(() => setQzOnline(true)).catch(() => setQzOnline(false));
  }, []);

  // Carrega fila
  const loadQueue = useCallback(async () => {
    const r = await api('/api/v2/expedicao/queue');
    if (r?.ok) {
      const items = r.data.items || [];
      setQueue(items.slice(0, 8));
      const hoje = r.data.hoje || '';
      const amanha = r.data.amanha || '';
      const erros = items.filter(o => o.status === 'ERRO').length;
      const hj = items.filter(o => o.data_expedicao === hoje).length;
      const am = items.filter(o => o.data_expedicao === amanha).length;
      setCounts({ hoje: hj, amanha: am, erros });
      setAlertas(items.filter(o => o.status === 'ERRO').slice(0, 5));
    }
  }, []);

  useEffect(() => {
    loadQueue();
    const id = setInterval(loadQueue, 30000);
    return () => clearInterval(id);
  }, [loadQueue]);

  // Fullscreen
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const handleScan = useCallback(async (e) => {
    e.preventDefault();
    const cod = codigo.trim();
    if (!cod || processing || paused) return;

    const t0 = now();
    setScanStart(t0);
    setProcessing(true);
    setPrintStatus('Validando pedido…');

    try {
      const scanRes = await api('/api/v2/expedicao/scan', {
        method: 'POST',
        body: JSON.stringify({ codigo: cod, operadorId: TERMINAL_ID }),
      });

      if (!scanRes?.ok) {
        beep(false);
        setLastResult({ status: 'ERRO', msg: scanRes?.data?.error || 'Erro ao processar', order: scanRes?.data?.order, elapsed: now() - t0 });
        setCodigo('');
        return;
      }

      const { order, warning } = scanRes.data;
      if (warning) beepAlerta();

      let etiquetaOk = false;
      let danfeOk = false;
      let erroMsg = null;

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
        } else { danfeOk = true; }
      } catch (err) { erroMsg = erroMsg ? `${erroMsg} | DANFE: ${err.message}` : `DANFE: ${err.message}`; }

      const elapsed = now() - t0;

      if (etiquetaOk || danfeOk) {
        await api(`/api/v2/expedicao/${order.id}/expedido`, {
          method: 'PATCH',
          body: JSON.stringify({ etiqueta_impressa: etiquetaOk, danfe_impressa: danfeOk }),
        });
        beep(true);
        setLastResult({ status: 'SUCESSO', order: { ...order, etiqueta_impressa: etiquetaOk, danfe_impressa: danfeOk }, warning, elapsed });
        loadQueue();
      } else {
        await api(`/api/v2/expedicao/${order.id}/erro`, {
          method: 'PATCH',
          body: JSON.stringify({ erroMsg }),
        });
        beep(false);
        setLastResult({ status: 'ERRO', msg: erroMsg, order, elapsed });
      }
    } catch (err) {
      beep(false);
      setLastResult({ status: 'ERRO', msg: err.message, elapsed: now() - (scanStart || t0) });
    } finally {
      setProcessing(false);
      setPrintStatus('');
      setCodigo('');
      setTimeout(focusInput, 100);
    }
  }, [codigo, processing, paused, focusInput, loadQueue, scanStart]);

  const StatusDot = ({ ok, label }) => (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
      <span className="text-xs text-slate-300">{label}</span>
      <span className={`text-xs font-semibold ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{ok ? 'ONLINE' : 'OFFLINE'}</span>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#020617', color: '#e2e8f0' }} onClick={focusInput}>

      {/* Sidebar */}
      <Sidebar counts={counts} activeSection={activeSection} onSection={setActiveSection} />

      {/* Conteúdo principal */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="shrink-0 flex items-center gap-3 px-4 h-12 border-b border-slate-800 bg-slate-950/80">
          <ScanLine size={16} className="text-emerald-400 shrink-0" />
          <span className="font-bold text-white text-sm tracking-wide">EXPEDIÇÃO V2 – SCANNER</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold uppercase">
            {paused ? 'Pausado' : 'Modo Operacional'}
          </span>

          <div className="flex items-center gap-4 ml-2">
            <StatusDot ok={qzOnline} label="Impressora Etiqueta" />
            <StatusDot ok={qzOnline} label="Impressora DANFE" />
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-xs text-slate-300">Sistema</span>
              <span className="text-xs font-semibold text-emerald-400">OK</span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => { setPaused(p => !p); focusInput(); }}
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
            <div className="text-xs text-slate-500 pl-2 border-l border-slate-800">
              <div className="text-white font-bold">{hora}</div>
              <div>{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
            </div>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 flex gap-0 overflow-hidden">

          {/* Zona central */}
          <div className="flex-1 flex flex-col gap-4 p-4 overflow-y-auto">

            {/* Zona de scan */}
            <div className={`rounded-xl border p-6 flex flex-col items-center gap-4 transition-colors ${
              paused ? 'border-amber-600/30 bg-amber-900/10' : 'border-slate-700 bg-slate-900/40'
            }`}>
              <div className="flex flex-col items-center gap-1">
                <div className={`transition-transform ${processing ? 'scale-110' : 'scale-100'}`}>
                  <ScanLine size={44} className={processing ? 'text-blue-400 animate-pulse' : paused ? 'text-amber-400' : 'text-emerald-400'} strokeWidth={1.5} />
                </div>
                <p className="text-base font-semibold text-white mt-1">
                  {paused ? 'IMPRESSÕES PAUSADAS' : 'LEIA O CÓDIGO DO PEDIDO'}
                </p>
                <p className="text-xs text-slate-500">
                  {paused ? 'Clique em Retomar para continuar' : 'Aproxime o scanner ou digite o código'}
                </p>
              </div>

              <form onSubmit={handleScan} className="w-full max-w-lg">
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    value={codigo}
                    onChange={e => setCodigo(e.target.value)}
                    disabled={processing || paused}
                    placeholder="ESCANEIE AQUI"
                    autoComplete="off"
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-5 py-3.5 text-center text-xl font-mono tracking-widest text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 disabled:opacity-40 transition-all"
                  />
                  <button type="button" className="px-3 rounded-xl bg-slate-700 border border-slate-600 text-slate-400 hover:text-slate-200">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="4" height="18"/><rect x="7" y="3" width="2" height="18"/><rect x="10" y="3" width="4" height="18"/><rect x="15" y="3" width="1" height="18"/><rect x="17" y="3" width="3" height="18"/></svg>
                  </button>
                  <button
                    type="submit"
                    disabled={processing || paused || !codigo.trim()}
                    className="px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold transition-colors"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </form>

              <p className={`text-sm transition-all ${processing ? 'text-blue-400 animate-pulse' : 'text-slate-600'}`}>
                {processing ? (printStatus || 'Processando…') : 'Aguardando leitura...'}
              </p>
            </div>

            {/* Último pedido processado */}
            {lastResult && (
              <div className={`rounded-xl border p-5 transition-all ${
                lastResult.status === 'SUCESSO'
                  ? 'border-emerald-600/40 bg-emerald-900/10'
                  : 'border-red-600/40 bg-red-900/10'
              }`}>
                <div className="flex items-center gap-3 mb-4">
                  {lastResult.status === 'SUCESSO'
                    ? <CheckCircle2 size={18} className="text-emerald-400" />
                    : <XCircle size={18} className="text-red-400" />
                  }
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Último pedido processado</span>
                  <StatusBadge status={lastResult.status} />
                  {lastResult.elapsed != null && (
                    <span className="ml-auto text-xs text-slate-500">
                      Tempo total <span className="text-slate-300 font-semibold">{(lastResult.elapsed / 1000).toFixed(1)}s</span>
                    </span>
                  )}
                </div>

                {lastResult.order && (
                  <div className="grid grid-cols-2 gap-4">
                    {/* Coluna 1: info do pedido */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xl text-white">#{lastResult.order.id || lastResult.order.numeroPedido}</span>
                        <MktBadge mkt={lastResult.order.marketplace} size="lg" />
                      </div>
                      <div className="text-sm text-slate-400">{lastResult.order.clienteNome || '—'}</div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Package size={11} /> {(lastResult.order.items || []).reduce((s, it) => s + Number(it.qty || 0), 0)} itens</span>
                        <span className="flex items-center gap-1"><Clock size={11} /> {fmtTime(lastResult.order.updatedAtMs)}</span>
                      </div>
                    </div>

                    {/* Coluna 2: impressões + status */}
                    <div className="flex flex-col gap-2">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Impressões</div>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 text-sm">
                          <Printer size={13} className={lastResult.order.etiqueta_impressa ? 'text-emerald-400' : 'text-slate-600'} />
                          <span className="text-slate-300">Etiqueta de Envio</span>
                          {lastResult.order.etiqueta_impressa
                            ? <span className="text-emerald-400 text-xs font-semibold">IMPRESSA • {fmtTime(lastResult.order.expedidoAtMs)}</span>
                            : <span className="text-slate-600 text-xs">—</span>
                          }
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Printer size={13} className={lastResult.order.danfe_impressa ? 'text-emerald-400' : 'text-slate-600'} />
                          <span className="text-slate-300">DANFE Simplificado</span>
                          {lastResult.order.danfe_impressa
                            ? <span className="text-emerald-400 text-xs font-semibold">IMPRESSA • {fmtTime(lastResult.order.expedidoAtMs)}</span>
                            : <span className="text-slate-600 text-xs">—</span>
                          }
                        </div>
                      </div>
                      {lastResult.status === 'SUCESSO' && (
                        <div className="mt-1">
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">EXPEDIDO</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {lastResult.msg && <p className="text-sm text-red-300 mt-2">{lastResult.msg}</p>}
                {lastResult.warning && (
                  <p className="text-sm text-amber-300 mt-1 flex items-center gap-1">
                    <AlertTriangle size={12} /> {lastResult.warning}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Painel direito */}
          <aside className="w-64 shrink-0 flex flex-col border-l border-slate-800 overflow-y-auto">

            {/* Próximos na fila */}
            <div className="p-3 border-b border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Próximos na fila (Hoje)</span>
                {counts.hoje > 0 && (
                  <span className="text-xs font-bold bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">{counts.hoje}</span>
                )}
              </div>

              {queue.length === 0 ? (
                <p className="text-xs text-slate-600 italic py-2">Fila vazia</p>
              ) : (
                <div className="flex flex-col gap-0">
                  {/* Cabeçalho */}
                  <div className="grid text-[10px] text-slate-600 font-semibold uppercase mb-1" style={{ gridTemplateColumns: '1fr auto auto auto' }}>
                    <span>Pedido</span><span>Canal</span><span className="px-1">Itens</span><span>Exp.</span>
                  </div>
                  {queue.map(o => (
                    <div key={o.id} className="grid items-center gap-1 py-1.5 border-b border-slate-800/60 last:border-0"
                      style={{ gridTemplateColumns: '1fr auto auto auto' }}>
                      <span className="font-mono text-xs text-slate-300 truncate">{o.id}</span>
                      <MktBadge mkt={o.marketplace} />
                      <span className="text-xs text-slate-500 text-center px-1">
                        {(o.items || []).reduce((s, it) => s + Number(it.qty || 0), 0)}
                      </span>
                      <span className="text-[10px] text-slate-600 text-right">{o.data_expedicao?.slice(8)}/{o.data_expedicao?.slice(5,7)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Alertas */}
            <div className="p-3 flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Alertas</span>
                {alertas.length > 0 && (
                  <span className="text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded">{alertas.length}</span>
                )}
              </div>
              {alertas.length === 0 ? (
                <p className="text-xs text-slate-600 italic">Nenhum alerta</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {alertas.map(o => (
                    <div key={o.id} className="flex items-start gap-2 p-2 rounded-lg bg-red-900/10 border border-red-800/30">
                      <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-mono text-red-300 truncate">Pedido {o.id}</div>
                        <div className="text-[10px] text-red-400/70 truncate">{o.erroMsg || 'Falha de impressão'}</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <MktBadge mkt={o.marketplace} />
                          <span className="text-[10px] text-slate-600">{fmtTime(o.updatedAtMs)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Status QZ */}
            <div className="p-3 border-t border-slate-800 text-xs text-slate-600">
              {qzOnline
                ? <span className="flex items-center gap-1 text-emerald-500"><Wifi size={11} /> QZ Tray conectado</span>
                : <span className="flex items-center gap-1 text-slate-600"><WifiOff size={11} /> QZ Tray offline — fallback navegador</span>
              }
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
