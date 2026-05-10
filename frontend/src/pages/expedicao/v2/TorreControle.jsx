/**
 * @file TorreControle.jsx
 * @module expedicao/v2
 * @description Torre de Controle — visão gerencial em tempo real da expedição V2.
 *   KPIs, fila por canal (donut CSS), status operacional, alertas, tabela de fila
 *   e painel de automação. NÃO é tela operacional (scanner está em ExpedicaoV2Scanner).
 * @version 2.0.0
 * @date 2026-05-10
 * @changelog 2.0.0 - Rebuild completo: donut CSS, tabela com prioridade, automação bastidores
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LayoutDashboard, Package, AlertTriangle, CheckCircle2,
  Clock, RefreshCw, Lock, Unlock, CalendarDays,
  Zap, TrendingUp, AlertCircle, ScanLine, Printer,
  Activity, Settings2, ChevronRight, BarChart3,
  FileText, Tag, ShoppingCart, Target,
} from 'lucide-react';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import { getAuthToken } from '../../../utils/getAuthToken';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function isoDateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}
function fmtDate(iso) {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function apiAuth(path, opts = {}) {
  const token = await getAuthToken();
  const res = await fetch(path, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const d = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: d };
}

// ─── Donut chart via conic-gradient (zero dependência externa) ────────────────
function DonutChart({ slices, size = 120, hole = 68 }) {
  let acc = 0;
  const gradient = slices
    .filter(s => s.pct > 0)
    .map(s => {
      const from = acc;
      acc += s.pct;
      return `${s.color} ${from}% ${acc}%`;
    })
    .join(', ');

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: slices.every(s => s.pct === 0)
          ? '#1e293b'
          : `conic-gradient(${gradient})`,
      }} />
      <div style={{
        position: 'absolute',
        top: (size - hole) / 2, left: (size - hole) / 2,
        width: hole, height: hole,
        borderRadius: '50%',
        background: '#0f172a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>
          {slices.reduce((s, x) => s + (x.count || 0), 0)}
        </span>
      </div>
    </div>
  );
}

// ─── StatusDot ────────────────────────────────────────────────────────────────
function StatusDot({ online = true, label, sub }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className={`w-2 h-2 rounded-full shrink-0 ${online ? 'bg-emerald-400' : 'bg-red-400'}`}
        style={online ? { boxShadow: '0 0 6px #34d399' } : {}} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-300 leading-tight">{label}</p>
        {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
      </div>
      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
        online ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
      }`}>
        {online ? 'ONLINE' : 'OFFLINE'}
      </span>
    </div>
  );
}

// ─── PrioridadeBadge ──────────────────────────────────────────────────────────
function PrioridadeBadge({ prioridade }) {
  if (prioridade === 1) return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 uppercase">ALTA</span>
  );
  if (prioridade === 2) return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 uppercase">MÉDIA</span>
  );
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-600/50 text-slate-400 uppercase">BAIXA</span>
  );
}

// ─── MktBadge ────────────────────────────────────────────────────────────────
function MktBadge({ mkt }) {
  if (mkt === 'MERCADO_LIVRE')
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0" style={{ background: '#FFE600', color: '#1a2060' }}>ML</span>;
  if (mkt === 'SHOPEE')
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-600 text-white shrink-0">SH</span>;
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-600 text-slate-200 shrink-0">OUT</span>;
}

// ─── StatusFilaBadge ──────────────────────────────────────────────────────────
function StatusFilaBadge({ order }) {
  if (order.bloqueado)
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 uppercase">PROBLEMA</span>;
  if (!order.nota_fiscal)
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 uppercase">AGUARD NF</span>;
  if (order.status === 'EXPEDIDO')
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 uppercase">EXPEDIDO</span>;
  if (order.status === 'ERRO')
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 uppercase">ERRO</span>;
  if (order.data_expedicao > isoDate())
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 uppercase">AGENDADO</span>;
  return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 uppercase">PRONTO</span>;
}

// ─── KpiCard ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, delta, sub, color = 'slate', icon: Icon, progressPct }) {
  const colorMap = {
    emerald: { border: 'border-emerald-700/50', bg: 'bg-emerald-900/20', text: 'text-emerald-400' },
    blue:    { border: 'border-blue-700/50',    bg: 'bg-blue-900/20',    text: 'text-blue-400' },
    amber:   { border: 'border-amber-700/50',   bg: 'bg-amber-900/20',   text: 'text-amber-400' },
    red:     { border: 'border-red-700/50',     bg: 'bg-red-900/20',     text: 'text-red-400' },
    slate:   { border: 'border-slate-700/50',   bg: 'bg-slate-800/30',   text: 'text-slate-400' },
    purple:  { border: 'border-purple-700/50',  bg: 'bg-purple-900/20',  text: 'text-purple-400' },
  };
  const c = colorMap[color];
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1.5 ${c.border} ${c.bg}`}>
      <div className={`flex items-center gap-2 text-[11px] font-semibold opacity-70 uppercase tracking-wide ${c.text}`}>
        {Icon && <Icon size={12} />}
        {label}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold text-white leading-none">{value ?? '—'}</span>
        {delta && <span className="text-[11px] text-emerald-400 mb-0.5">{delta}</span>}
      </div>
      {progressPct != null && (
        <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1">
          <div className={`h-1.5 rounded-full transition-all duration-700 ${c.text.replace('text-', 'bg-')}`}
            style={{ width: `${Math.min(progressPct, 100)}%` }} />
        </div>
      )}
      {sub && <div className="text-[11px] opacity-60 text-slate-400">{sub}</div>}
    </div>
  );
}

// ─── AutomacaoRow ─────────────────────────────────────────────────────────────
function AutomacaoRow({ label, ativa = true, ultimo }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-800/60 last:border-0">
      <span className={`w-2 h-2 rounded-full shrink-0 ${ativa ? 'bg-emerald-400' : 'bg-slate-600'}`}
        style={ativa ? { boxShadow: '0 0 5px #34d399' } : {}} />
      <span className="text-sm text-slate-300 flex-1">{label}</span>
      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
        ativa ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-500'
      }`}>
        {ativa ? 'ATIVA' : 'INATIVA'}
      </span>
      <span className="text-[11px] text-slate-600 w-16 text-right">
        {ultimo ? `Últ: ${ultimo}` : '—'}
      </span>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function TorreControle() {
  const hoje    = isoDate();
  const amanha  = isoDateOffset(1);

  const [kpis, setKpis]           = useState(null);
  const [alertas, setAlertas]     = useState([]);
  const [porMkt, setPorMkt]       = useState({});
  const [fila, setFila]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [now, setNow]             = useState(new Date());

  // Relógio
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // onSnapshot para atualizações em tempo real
  const snapshotReady = useRef(false);
  useEffect(() => {
    const q = query(
      collection(db, 'orders_v2'),
      where('data_expedicao', 'in', [hoje, amanha])
    );
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (a.prioridade || 3) - (b.prioridade || 3) || (a.createdAtMs || 0) - (b.createdAtMs || 0));
      setFila(docs);
      setLastUpdate(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      snapshotReady.current = true;
    });
    return unsub;
  }, [hoje, amanha]);

  // Polling KPIs do backend
  const loadTorre = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiAuth('/api/v2/expedicao/torre');
      if (r.ok) {
        setKpis(r.data.kpis);
        setAlertas(r.data.alertas || []);
        setPorMkt(r.data.porMarketplace || {});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTorre(); }, [loadTorre]);

  // Re-poll KPIs após mudança na fila (com debounce)
  useEffect(() => {
    if (!snapshotReady.current) return;
    const id = setTimeout(loadTorre, 2500);
    return () => clearTimeout(id);
  }, [fila.length, loadTorre]);

  // Polling 30s
  useEffect(() => {
    const id = setInterval(loadTorre, 30_000);
    return () => clearInterval(id);
  }, [loadTorre]);

  // ─── Actions ─────────────────────────────────────────────────────────────────
  const handleBloquear = async (id, bloquear) => {
    const motivo = bloquear ? window.prompt('Motivo do bloqueio (opcional):') : undefined;
    await apiAuth(`/api/v2/expedicao/${id}/bloquear`, {
      method: 'PATCH',
      body: JSON.stringify({ bloquear, motivo: motivo || null }),
    });
  };

  const handleData = async (id, data_expedicao) => {
    await apiAuth(`/api/v2/expedicao/${id}/data`, {
      method: 'PATCH',
      body: JSON.stringify({ data_expedicao }),
    });
  };

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const mlCount  = porMkt.MERCADO_LIVRE || 0;
  const shCount  = porMkt.SHOPEE        || 0;
  const outCount = porMkt.OUTROS        || 0;
  const totalMkt = mlCount + shCount + outCount;

  const mlPct  = totalMkt > 0 ? (mlCount  / totalMkt) * 100 : 0;
  const shPct  = totalMkt > 0 ? (shCount  / totalMkt) * 100 : 0;
  const outPct = totalMkt > 0 ? (outCount / totalMkt) * 100 : 0;

  const donutSlices = [
    { color: '#FFE600', pct: mlPct,  count: mlCount,  label: 'Mercado Livre' },
    { color: '#EE4D2D', pct: shPct,  count: shCount,  label: 'Shopee' },
    { color: '#64748b', pct: outPct, count: outCount, label: 'Outros' },
  ];

  const metaDiaria   = 200; // placeholder
  const progressPct  = kpis?.expedidos ? Math.round((kpis.expedidos / metaDiaria) * 100) : 0;
  const taxaPerf     = kpis?.totalHoje > 0 ? Math.round(((kpis?.expedidos || 0) / kpis.totalHoje) * 100) : 0;

  const filaHoje   = fila.filter(o => o.data_expedicao === hoje);
  const filaAmanha = fila.filter(o => o.data_expedicao === amanha);
  const filaErro   = fila.filter(o => o.status === 'ERRO' || o.bloqueado);

  return (
    <div className="min-h-screen" style={{ background: '#020617', color: '#e2e8f0' }}>
      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b border-slate-800/80 px-6 py-3"
        style={{ background: 'rgba(2,6,23,0.95)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <LayoutDashboard size={20} className="text-blue-400" />
            <div>
              <h1 className="text-sm font-bold text-white tracking-wide">TORRE DE CONTROLE</h1>
              <p className="text-[11px] text-slate-500">
                Expedição V2 · {hoje}
                {lastUpdate && <span className="ml-2 text-slate-600">· atualizado {lastUpdate}</span>}
              </p>
            </div>
          </div>

          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600/20 text-blue-400 border border-blue-600/30 uppercase tracking-wide">
            MODO GERENCIAL
          </span>

          {/* Status rápido */}
          <div className="hidden md:flex items-center gap-4 ml-4">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 4px #34d399' }} />
              Sistema OK
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Printer size={11} />
              Impressoras Online
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden sm:block text-sm font-mono text-slate-500">
              {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <a href="/spa/expedicao/v2/scanner"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-600/40 text-emerald-400 hover:bg-emerald-600/30 text-xs font-medium transition-colors"
            >
              <ScanLine size={13} /> Ir para Scanner
            </a>
            <button
              onClick={loadTorre}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">

        {/* ── Linha 1: KPI Cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard
            label="Prontos p/ Expedir"
            value={kpis?.prontos}
            delta={kpis?.prontos > 0 ? `${kpis.prontos} na fila` : undefined}
            color="emerald"
            icon={CheckCircle2}
          />
          <KpiCard
            label="Aguardando NF"
            value={kpis?.aguardandoNF ?? 0}
            sub={kpis?.aguardandoNF > 0 ? 'pendentes de fatura' : 'todos com NF'}
            color="amber"
            icon={FileText}
          />
          <KpiCard
            label="Com Problema"
            value={kpis?.comErro ?? 0}
            sub={kpis?.comErro > 0 ? 'ação necessária' : 'sem problemas'}
            color={kpis?.comErro > 0 ? 'red' : 'slate'}
            icon={AlertTriangle}
          />
          <KpiCard
            label="Expedidos Hoje"
            value={kpis?.expedidos ?? 0}
            sub={`Meta: ${metaDiaria} · ${progressPct}%`}
            progressPct={progressPct}
            color="slate"
            icon={TrendingUp}
          />
          <KpiCard
            label="Taxa Performance"
            value={`${taxaPerf}%`}
            sub={`${kpis?.totalHoje ?? 0} pedidos total`}
            color="purple"
            icon={Target}
          />
        </div>

        {/* ── Linha 2: 4 blocos ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

          {/* 2.1 Fila por canal — donut CSS */}
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mb-4 flex items-center gap-1.5">
              <BarChart3 size={12} /> Fila por Canal
            </p>
            <div className="flex items-center gap-4">
              <DonutChart slices={donutSlices} />
              <div className="flex flex-col gap-2.5 min-w-0">
                {[
                  { label: 'Mercado Livre', count: mlCount,  pct: Math.round(mlPct),  color: '#FFE600' },
                  { label: 'Shopee',        count: shCount,  pct: Math.round(shPct),  color: '#EE4D2D' },
                  { label: 'Outros',        count: outCount, pct: Math.round(outPct), color: '#64748b' },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                    <span className="text-xs text-slate-400 truncate">{s.label}</span>
                    <span className="text-xs font-bold text-white ml-auto">{s.count}</span>
                    <span className="text-[10px] text-slate-600 w-8 text-right">{s.pct}%</span>
                  </div>
                ))}
                <div className="border-t border-slate-800 pt-1.5 mt-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Total</span>
                    <span className="text-sm font-bold text-white ml-auto">{totalMkt}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2.2 Status Operacional */}
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Activity size={12} /> Status Operacional
            </p>
            <div className="divide-y divide-slate-800/60">
              <StatusDot online label="Impressora Etiqueta" sub="ZPL · QZ Tray" />
              <StatusDot online label="Impressora DANFE" sub="PDF · QZ Tray" />
              <div className="flex items-center gap-2 py-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" style={{ boxShadow: '0 0 5px #34d399' }} />
                <div className="flex-1">
                  <p className="text-sm text-slate-300">Sistema de Impressão</p>
                </div>
                <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded uppercase">OK</span>
              </div>
              <div className="flex items-center gap-2 py-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" style={{ boxShadow: '0 0 5px #60a5fa' }} />
                <div className="flex-1">
                  <p className="text-sm text-slate-300">Clonagem Bling</p>
                </div>
                <span className="text-[10px] font-bold bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded uppercase">ATIVO</span>
              </div>
            </div>
          </div>

          {/* 2.3 Controle de Envio */}
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <CalendarDays size={12} /> Controle de Envio
            </p>
            <div className="space-y-2">
              {[
                { label: `Hoje (${fmtDate(hoje)})`,     count: filaHoje.length,   badge: 'ATIVO',      color: 'emerald' },
                { label: `Amanhã (${fmtDate(amanha)})`, count: filaAmanha.length, badge: 'PROGRAMADO', color: 'blue' },
                { label: 'Com Erro',                    count: filaErro.length,   badge: 'ATENÇÃO',    color: 'red' },
                { label: 'Expedidos',                   count: kpis?.expedidos ?? 0, badge: 'OK',      color: 'slate' },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-2 py-1">
                  <span className="text-sm text-slate-400 flex-1">{row.label}</span>
                  <span className="text-sm font-bold text-white">{row.count}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                    row.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-400' :
                    row.color === 'blue'    ? 'bg-blue-500/20 text-blue-400' :
                    row.color === 'red'     ? 'bg-red-500/20 text-red-400' :
                    'bg-slate-700/60 text-slate-400'
                  }`}>
                    {row.badge}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 2.4 Alertas Críticos */}
          <div className="rounded-xl border border-red-900/40 bg-red-950/10 p-4">
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <AlertTriangle size={12} className="text-red-400" />
              <span className="text-red-400">Alertas Críticos</span>
              {alertas.length > 0 && (
                <span className="ml-auto bg-red-500/20 text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {alertas.length}
                </span>
              )}
            </p>
            {alertas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <CheckCircle2 size={24} className="text-emerald-500/50 mb-2" />
                <p className="text-xs text-slate-600">Nenhum alerta</p>
              </div>
            ) : (
              <div className="space-y-0 overflow-auto max-h-36">
                {alertas.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 py-1.5 border-b border-slate-800/50 last:border-0">
                    <AlertCircle size={12} className={`mt-0.5 shrink-0 ${a.tipo === 'erro' ? 'text-red-400' : 'text-amber-400'}`} />
                    <span className="text-xs text-slate-300 flex-1 leading-tight">{a.msg}</span>
                    {a.orderId && (
                      <button
                        onClick={() => document.getElementById(`row-${a.orderId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                        className="text-[10px] text-slate-600 hover:text-slate-300 shrink-0"
                      >
                        <ChevronRight size={11} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Linha 3: Fila + Automação ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

          {/* 3.1 Fila de Expedição — tabela completa */}
          <div className="xl:col-span-2 rounded-xl border border-slate-700/60 bg-slate-900/40 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
              <Package size={14} className="text-slate-400" />
              <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">
                Fila de Expedição
              </p>
              <span className="ml-1 text-[10px] bg-slate-700/60 text-slate-400 px-1.5 py-0.5 rounded-full font-medium">
                {fila.filter(o => o.status !== 'EXPEDIDO').length} pedidos
              </span>
              <span className="ml-auto text-[10px] text-slate-600">
                {lastUpdate && `Atualizado ${lastUpdate}`}
              </span>
            </div>

            {/* Cabeçalho da tabela */}
            <div className="grid gap-2 px-4 py-2 border-b border-slate-800/60 text-[10px] text-slate-600 font-semibold uppercase tracking-wide"
              style={{ gridTemplateColumns: '70px 1fr 50px 1fr 65px 35px 90px 120px' }}>
              <span>Prioridade</span>
              <span>Pedido</span>
              <span>Canal</span>
              <span>Cliente</span>
              <span>Expedição</span>
              <span>Its</span>
              <span>Status</span>
              <span className="text-right">Ações</span>
            </div>

            {/* Rows */}
            <div className="overflow-auto max-h-96">
              {fila.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Package size={32} className="text-slate-700 mb-3" />
                  <p className="text-sm text-slate-600">Nenhum pedido na fila</p>
                </div>
              ) : (
                fila.map(order => (
                  <FilaRow
                    key={order.id}
                    order={order}
                    onBloquear={handleBloquear}
                    onData={handleData}
                  />
                ))
              )}
            </div>
          </div>

          {/* 3.2 Automação (Bastidores) */}
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 flex flex-col">
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Settings2 size={12} /> Automação (Bastidores)
            </p>

            <div className="flex-1">
              <AutomacaoRow label="Clonagem automática (Bling)" ativa ultimo={lastUpdate} />
              <AutomacaoRow label="Geração de etiquetas" ativa />
              <AutomacaoRow label="Geração de DANFE" ativa />
              <AutomacaoRow label="Atualização status Bling" ativa />
            </div>

            {/* Pedidos travados */}
            <div className="mt-4 rounded-lg border border-slate-800 p-3">
              <div className="flex items-center gap-2">
                <Lock size={13} className="text-amber-400" />
                <span className="text-sm text-slate-300 flex-1">Pedidos travados</span>
                <span className="text-sm font-bold text-white">{filaErro.length}</span>
              </div>
              {filaErro.length > 0 && (
                <button
                  onClick={() => document.querySelector('[data-fila-table]')?.scrollIntoView({ behavior: 'smooth' })}
                  className="mt-2 w-full text-[11px] text-amber-400 hover:text-amber-300 flex items-center justify-center gap-1 py-1.5 rounded bg-amber-500/10 hover:bg-amber-500/15 transition-colors"
                >
                  Ver detalhes <ChevronRight size={11} />
                </button>
              )}
            </div>

            {/* Stats rápidos */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                { label: 'Hoje',      value: filaHoje.length,    color: 'text-emerald-400' },
                { label: 'Amanhã',    value: filaAmanha.length,  color: 'text-blue-400' },
                { label: 'Expedidos', value: kpis?.expedidos ?? 0, color: 'text-slate-400' },
                { label: 'Erros',     value: filaErro.length,    color: 'text-red-400' },
              ].map(s => (
                <div key={s.label} className="rounded-lg bg-slate-800/50 p-2 text-center">
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-slate-600 uppercase">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FilaRow — linha da tabela de fila ───────────────────────────────────────
function FilaRow({ order, onBloquear, onData }) {
  const [editDate, setEditDate] = useState(false);
  const [newDate, setNewDate]   = useState(order.data_expedicao || '');

  const handleDataSave = async () => {
    if (!newDate) return;
    await onData(order.id, newDate);
    setEditDate(false);
  };

  return (
    <div
      id={`row-${order.id}`}
      className={`grid gap-2 px-4 py-2 border-b border-slate-800/40 last:border-0 items-center text-sm hover:bg-slate-800/20 transition-colors ${
        order.bloqueado ? 'bg-red-950/10' : order.status === 'EXPEDIDO' ? 'opacity-50' : ''
      }`}
      style={{ gridTemplateColumns: '70px 1fr 50px 1fr 65px 35px 90px 120px' }}
    >
      <PrioridadeBadge prioridade={order.prioridade} />

      <span className="font-mono text-slate-300 truncate text-xs">{order.id}</span>

      <MktBadge mkt={order.marketplace} />

      <span className="text-slate-400 truncate text-xs">{order.clienteNome || '—'}</span>

      {/* Data expedição editável */}
      {editDate ? (
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
            className="bg-slate-700 border border-slate-600 rounded px-1 py-0.5 text-[11px] text-white w-full"
            autoFocus
          />
          <button onClick={handleDataSave} className="text-emerald-400 text-xs">✓</button>
          <button onClick={() => setEditDate(false)} className="text-slate-500 text-xs">✕</button>
        </div>
      ) : (
        <button
          onClick={() => setEditDate(true)}
          className="flex items-center gap-1 text-slate-500 hover:text-slate-300 text-xs text-left"
        >
          <CalendarDays size={10} />
          {fmtDate(order.data_expedicao)}
        </button>
      )}

      <span className="text-slate-500 text-xs text-center">{order.qtdItens ?? '—'}</span>

      <StatusFilaBadge order={order} />

      {/* Ações */}
      <div className="flex items-center gap-1 justify-end">
        <button
          onClick={() => onBloquear(order.id, !order.bloqueado)}
          className={`flex items-center gap-0.5 text-[10px] px-1.5 py-1 rounded transition-colors ${
            order.bloqueado
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-slate-700/50 text-slate-500 hover:bg-slate-700 hover:text-slate-300'
          }`}
          title={order.bloqueado ? `Bloqueado: ${order.motivo_bloqueio || ''}` : 'Bloquear pedido'}
        >
          {order.bloqueado ? <Unlock size={9} /> : <Lock size={9} />}
          {order.bloqueado ? 'Desbloquear' : 'Bloquear'}
        </button>
      </div>
    </div>
  );
}
