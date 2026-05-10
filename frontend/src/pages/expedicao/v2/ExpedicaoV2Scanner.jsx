/**
 * @file ExpedicaoV2Scanner.jsx
 * @module expedicao/v2
 * @description Tela de scanner do fluxo Expedição V2.
 *   Operação física: bipa → imprime etiqueta + DANFE → próximo pedido.
 *   Zero decisão do operador — toda regra fica no backend.
 * @version 1.0.0
 * @date 2026-05-10
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ScanLine, CheckCircle2, XCircle, AlertTriangle, Printer,
  Package, Clock, ChevronRight, Wifi, WifiOff, RotateCcw,
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
  if (!qz) throw new Error('QZ Tray não encontrado. Instale em qz.io/download');
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

  if (!b64pdf) throw new Error('Bling não retornou PDF da DANFE');

  let qzOk = false;
  try {
    const qz = await qzConnect();
    const printer = await qz.printers.getDefault();
    const config = qz.configs.create(printer, {
      scaleContent: false, colorType: 'blackwhite', rotation: 0,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
    });
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

  if (data.pdfUrl) {
    window.open(data.pdfUrl, '_blank');
    return;
  }
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

// ─── Componentes visuais ──────────────────────────────────────────────────────
function MktBadge({ mkt }) {
  if (mkt === 'MERCADO_LIVRE')
    return <span className="px-2 py-0.5 rounded text-[11px] font-bold" style={{ background: '#FFE600', color: '#1a2060' }}>ML</span>;
  if (mkt === 'SHOPEE')
    return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-orange-600 text-white">SH</span>;
  return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-600 text-slate-200">OUT</span>;
}

function StatusBadge({ status }) {
  const map = {
    SUCESSO:     'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40',
    ERRO:        'bg-red-500/20 text-red-400 border border-red-500/40',
    AVISO:       'bg-amber-500/20 text-amber-400 border border-amber-500/40',
    PROCESSANDO: 'bg-blue-500/20 text-blue-400 border border-blue-500/40',
  };
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${map[status] || map.PROCESSANDO}`}>
      {status}
    </span>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ExpedicaoV2Scanner() {
  const [codigo, setCodigo]           = useState('');
  const [processing, setProcessing]   = useState(false);
  const [lastResult, setLastResult]   = useState(null);   // { status, order, msg, warning }
  const [printStatus, setPrintStatus] = useState('');
  const [queue, setQueue]             = useState([]);
  const [qzOnline, setQzOnline]       = useState(false);
  const inputRef                      = useRef(null);

  // Mantém foco no input
  const focusInput = useCallback(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    focusInput();
    const id = setInterval(focusInput, 2000);
    return () => clearInterval(id);
  }, [focusInput]);

  // Conecta QZ Tray em background
  useEffect(() => {
    qzConnect().then(() => setQzOnline(true)).catch(() => setQzOnline(false));
  }, []);

  // Carrega fila a cada 30s
  const loadQueue = useCallback(async () => {
    const r = await api('/api/v2/expedicao/queue');
    if (r?.ok) setQueue((r.data.items || []).slice(0, 5));
  }, []);

  useEffect(() => {
    loadQueue();
    const id = setInterval(loadQueue, 30000);
    return () => clearInterval(id);
  }, [loadQueue]);

  const handleScan = useCallback(async (e) => {
    e.preventDefault();
    const cod = codigo.trim();
    if (!cod || processing) return;

    setProcessing(true);
    setPrintStatus('Validando pedido…');

    try {
      // 1. Chama /scan no backend
      const scanRes = await api('/api/v2/expedicao/scan', {
        method: 'POST',
        body: JSON.stringify({ codigo: cod, operadorId: TERMINAL_ID }),
      });

      if (!scanRes?.ok) {
        const msg = scanRes?.data?.error || 'Erro ao processar scan';
        beep(false);
        setLastResult({ status: 'ERRO', msg, order: scanRes?.data?.order });
        setCodigo('');
        return;
      }

      const { order, warning } = scanRes.data;
      if (warning) beepAlerta();

      // 2. Imprime etiqueta + DANFE
      let etiquetaOk = false;
      let danfeOk    = false;
      let erroMsg    = null;

      try {
        setPrintStatus('Imprimindo etiqueta de envio…');
        await printEtiqueta(order.id);
        etiquetaOk = true;
      } catch (err) {
        erroMsg = `Etiqueta: ${err.message}`;
      }

      try {
        if (order.blingNfId) {
          setPrintStatus('Imprimindo DANFE…');
          await printDanfe(order.blingNfId);
          danfeOk = true;
        } else {
          danfeOk = true; // sem NF Bling, pula DANFE
        }
      } catch (err) {
        erroMsg = erroMsg ? `${erroMsg} | DANFE: ${err.message}` : `DANFE: ${err.message}`;
      }

      // 3. Confirma ou registra erro
      if (etiquetaOk || danfeOk) {
        await api(`/api/v2/expedicao/${order.id}/expedido`, {
          method: 'PATCH',
          body: JSON.stringify({ etiqueta_impressa: etiquetaOk, danfe_impressa: danfeOk }),
        });
        beep(true);
        setLastResult({ status: 'SUCESSO', order, warning });
        loadQueue();
      } else {
        await api(`/api/v2/expedicao/${order.id}/erro`, {
          method: 'PATCH',
          body: JSON.stringify({ erroMsg }),
        });
        beep(false);
        setLastResult({ status: 'ERRO', msg: erroMsg, order });
      }
    } catch (err) {
      beep(false);
      setLastResult({ status: 'ERRO', msg: err.message });
    } finally {
      setProcessing(false);
      setPrintStatus('');
      setCodigo('');
      setTimeout(focusInput, 100);
    }
  }, [codigo, processing, focusInput, loadQueue]);

  const fmtTime = (ms) => ms ? new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: '#020617', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}
      onClick={focusInput}
    >
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
        <ScanLine size={20} className="text-emerald-400" />
        <span className="font-bold text-white tracking-wide">EXPEDIÇÃO V2</span>
        <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">OPERACIONAL</span>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-400">
          {qzOnline
            ? <span className="flex items-center gap-1 text-emerald-400"><Wifi size={12} /> QZ Online</span>
            : <span className="flex items-center gap-1 text-slate-500"><WifiOff size={12} /> QZ Offline</span>
          }
          <span className="text-slate-500">Terminal {TERMINAL_ID.slice(0, 8)}</span>
        </div>
      </header>

      <div className="flex flex-1 gap-4 p-4 max-w-5xl mx-auto w-full">
        {/* Coluna principal */}
        <div className="flex-1 flex flex-col gap-4">
          {/* Zona de scan */}
          <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 flex flex-col items-center gap-4">
            <div className="flex flex-col items-center gap-1 text-center">
              <ScanLine size={40} className={processing ? 'text-blue-400 animate-pulse' : 'text-emerald-400'} />
              <p className="text-sm text-slate-400 mt-1">
                {processing ? printStatus || 'Processando…' : 'Aproxime o scanner ou digite o código'}
              </p>
            </div>

            <form onSubmit={handleScan} className="w-full max-w-md">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={codigo}
                  onChange={e => setCodigo(e.target.value)}
                  disabled={processing}
                  placeholder="ESCANEIE AQUI"
                  autoComplete="off"
                  className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-center text-lg font-mono tracking-widest text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={processing || !codigo.trim()}
                  className="px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </form>

            <p className={`text-sm ${processing ? 'text-blue-400 animate-pulse' : 'text-slate-500'}`}>
              {processing ? printStatus || 'Aguarde…' : 'Aguardando leitura…'}
            </p>
          </div>

          {/* Último pedido processado */}
          {lastResult && (
            <div className={`rounded-xl border p-5 ${
              lastResult.status === 'SUCESSO'
                ? 'border-emerald-600/40 bg-emerald-900/20'
                : lastResult.status === 'AVISO'
                ? 'border-amber-600/40 bg-amber-900/20'
                : 'border-red-600/40 bg-red-900/20'
            }`}>
              <div className="flex items-center gap-3 mb-3">
                {lastResult.status === 'SUCESSO'
                  ? <CheckCircle2 size={20} className="text-emerald-400" />
                  : lastResult.status === 'AVISO'
                  ? <AlertTriangle size={20} className="text-amber-400" />
                  : <XCircle size={20} className="text-red-400" />
                }
                <span className="font-bold text-sm text-slate-300">ÚLTIMO PEDIDO PROCESSADO</span>
                <StatusBadge status={lastResult.status} />
              </div>

              {lastResult.order && (
                <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Pedido</span>
                    <span className="font-mono font-bold text-white">{lastResult.order.id}</span>
                    {lastResult.order.marketplace && <MktBadge mkt={lastResult.order.marketplace} />}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Cliente</span>
                    <span className="text-slate-200 truncate">{lastResult.order.clienteNome || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Printer size={12} className="text-slate-500" />
                    <span className="text-slate-500">Etiqueta</span>
                    <span className={lastResult.order.etiqueta_impressa ? 'text-emerald-400' : 'text-slate-500'}>
                      {lastResult.order.etiqueta_impressa ? '✓ Impressa' : '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Printer size={12} className="text-slate-500" />
                    <span className="text-slate-500">DANFE</span>
                    <span className={lastResult.order.danfe_impressa ? 'text-emerald-400' : 'text-slate-500'}>
                      {lastResult.order.danfe_impressa ? '✓ Impressa' : '—'}
                    </span>
                  </div>
                </div>
              )}

              {lastResult.msg && (
                <p className="text-sm text-red-300 mt-1">{lastResult.msg}</p>
              )}
              {lastResult.warning && (
                <p className="text-sm text-amber-300 mt-1 flex items-center gap-1">
                  <AlertTriangle size={12} /> {lastResult.warning}
                </p>
              )}
            </div>
          )}

          {/* Próximo na fila */}
          {queue.length > 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-900/30 p-4">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-3">Próximos da Fila</p>
              <div className="flex flex-col gap-2">
                {queue.map((o, i) => (
                  <div key={o.id} className="flex items-center gap-3 py-1.5 border-b border-slate-800 last:border-0">
                    <span className="text-slate-600 text-xs w-4">{i + 1}</span>
                    <MktBadge mkt={o.marketplace} />
                    <span className="font-mono text-sm text-slate-300">{o.id}</span>
                    <span className="text-slate-500 text-xs truncate flex-1">{o.clienteNome}</span>
                    <span className="text-slate-600 text-xs flex items-center gap-1">
                      <Package size={11} />
                      {(o.items || []).reduce((s, it) => s + Number(it.qty || 0), 0)} itens
                    </span>
                    <span className="text-slate-600 text-xs flex items-center gap-1">
                      <Clock size={11} />
                      {o.data_expedicao}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Botão recarregar fila */}
      <div className="fixed bottom-4 right-4">
        <button
          onClick={loadQueue}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs transition-colors"
        >
          <RotateCcw size={12} /> Atualizar fila
        </button>
      </div>
    </div>
  );
}
