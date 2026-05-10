/**
 * @file TorreControle.jsx
 * @module expedicao/v2
 * @description Torre de Controle — visão gerencial em tempo real da expedição V2.
 *   Monitoramento, alertas, controle de fila. NÃO é tela operacional (scanner está em ExpedicaoV2Scanner).
 * @version 1.0.0
 * @date 2026-05-10
 */

import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Package, AlertTriangle, CheckCircle2,
  Clock, RefreshCw, Lock, Unlock, CalendarDays, ChevronRight,
  Zap, TrendingUp, AlertCircle, ScanLine,
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
  const [y, m, d] = iso.split('-');
  return `${d}/${m}`;
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

// ─── Sub-componentes ──────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'slate', icon: Icon }) {
  const colorMap = {
    emerald: 'border-emerald-700/50 bg-emerald-900/20 text-emerald-400',
    blue:    'border-blue-700/50 bg-blue-900/20 text-blue-400',
    amber:   'border-amber-700/50 bg-amber-900/20 text-amber-400',
    red:     'border-red-700/50 bg-red-900/20 text-red-400',
    slate:   'border-slate-700/50 bg-slate-800/30 text-slate-400',
  };
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${colorMap[color]}`}>
      <div className="flex items-center gap-2 text-xs font-medium opacity-70 uppercase tracking-wide">
        {Icon && <Icon size={13} />}
        {label}
      </div>
      <div className="text-3xl font-bold text-white">{value ?? '—'}</div>
      {sub && <div className="text-xs opacity-60">{sub}</div>}
    </div>
  );
}

function MktBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-300 w-32 truncate">{label}</span>
      <div className="flex-1 bg-slate-800 rounded-full h-2">
        <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-sm font-bold text-white w-8 text-right">{count}</span>
    </div>
  );
}

function AlertRow({ alerta, onAction }) {
  const isErro = alerta.tipo === 'erro';
  return (
    <div className={`flex items-start gap-3 py-2 border-b border-slate-800 last:border-0 ${isErro ? 'text-red-300' : 'text-amber-300'}`}>
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      <span className="text-sm flex-1">{alerta.msg}</span>
      {alerta.orderId && (
        <button
          onClick={() => onAction(alerta.orderId)}
          className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1"
        >
          Ver <ChevronRight size={12} />
        </button>
      )}
    </div>
  );
}

function OrderRow({ order, onBloquear, onData }) {
  const [editDate, setEditDate] = useState(false);
  const [newDate, setNewDate]   = useState(order.data_expedicao || '');

  const handleDataSave = async () => {
    if (!newDate) return;
    await onData(order.id, newDate);
    setEditDate(false);
  };

  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-800 last:border-0 text-sm">
      <span className="font-mono text-slate-300 w-36 truncate">{order.id}</span>
      <MktBadgeSmall mkt={order.marketplace} />
      <span className="text-slate-400 flex-1 truncate">{order.clienteNome}</span>

      {/* Data expedição */}
      <div className="flex items-center gap-1">
        {editDate ? (
          <>
            <input
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              className="bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-xs text-white"
            />
            <button onClick={handleDataSave} className="text-emerald-400 text-xs px-1">✓</button>
            <button onClick={() => setEditDate(false)} className="text-slate-500 text-xs px-1">✕</button>
          </>
        ) : (
          <button
            onClick={() => setEditDate(true)}
            className="flex items-center gap-1 text-slate-500 hover:text-slate-300 text-xs"
          >
            <CalendarDays size={11} />
            {fmtDate(order.data_expedicao)}
          </button>
        )}
      </div>

      {/* Bloquear */}
      <button
        onClick={() => onBloquear(order.id, !order.bloqueado)}
        className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
          order.bloqueado
            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
        }`}
        title={order.bloqueado ? `Bloqueado: ${order.motivo_bloqueio || ''}` : 'Bloquear'}
      >
        {order.bloqueado ? <Lock size={11} /> : <Unlock size={11} />}
        {order.bloqueado ? 'Bloqueado' : 'Bloquear'}
      </button>

      <StatusPill status={order.status} />
    </div>
  );
}

function MktBadgeSmall({ mkt }) {
  if (mkt === 'MERCADO_LIVRE')
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0" style={{ background: '#FFE600', color: '#1a2060' }}>ML</span>;
  if (mkt === 'SHOPEE')
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-600 text-white shrink-0">SH</span>;
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-600 text-slate-200 shrink-0">OUT</span>;
}

function StatusPill({ status }) {
  const map = {
    NA_FILA:      'bg-slate-700/60 text-slate-300',
    EM_PROCESSO:  'bg-blue-500/20 text-blue-400',
    EXPEDIDO:     'bg-emerald-500/20 text-emerald-400',
    ERRO:         'bg-red-500/20 text-red-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 ${map[status] || map.NA_FILA}`}>
      {status?.replace('_', ' ')}
    </span>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function TorreControle() {
  const hoje   = isoDate();
  const amanha = isoDateOffset(1);

  const [kpis, setKpis]         = useState(null);
  const [alertas, setAlertas]   = useState([]);
  const [porMkt, setPorMkt]     = useState({});
  const [proximosFila, setProximosFila] = useState([]);
  const [orders, setOrders]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  // onSnapshot em orders_v2 para atualização em tempo real
  useEffect(() => {
    const q = query(
      collection(db, 'orders_v2'),
      where('data_expedicao', 'in', [hoje, amanha])
    );
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOrders(docs);
      setLastUpdate(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    });
    return unsub;
  }, [hoje, amanha]);

  // Busca KPIs do backend (inclui pedidos EXPEDIDOS)
  const loadTorre = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiAuth('/api/v2/expedicao/torre');
      if (r.ok) {
        setKpis(r.data.kpis);
        setAlertas(r.data.alertas || []);
        setPorMkt(r.data.porMarketplace || {});
        setProximosFila(r.data.proximosDaFila || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTorre(); }, [loadTorre]);

  // Recarrega KPIs quando orders mudam (throttled)
  useEffect(() => {
    const id = setTimeout(loadTorre, 2000);
    return () => clearTimeout(id);
  }, [orders.length, loadTorre]);

  const handleBloquear = async (id, bloquear) => {
    const motivo = bloquear ? prompt('Motivo do bloqueio (opcional):') : undefined;
    await apiAuth(`/api/v2/expedicao/${id}/bloquear`, {
      method: 'PATCH',
      body: JSON.stringify({ bloquear, motivo: motivo || null }),
    });
  };

  const handleData = async (id, data) => {
    await apiAuth(`/api/v2/expedicao/${id}/data`, {
      method: 'PATCH',
      body: JSON.stringify({ data_expedicao: data }),
    });
  };

  const totalMkt = Object.values(porMkt).reduce((s, v) => s + v, 0);

  // Separa pedidos de hoje e amanhã da lista local
  const ordersHoje   = orders.filter(o => o.data_expedicao === hoje && o.status !== 'EXPEDIDO');
  const ordersAmanha = orders.filter(o => o.data_expedicao === amanha && o.status !== 'EXPEDIDO');

  return (
    <div className="min-h-screen p-4 lg:p-6" style={{ background: '#020617', color: '#e2e8f0' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <LayoutDashboard size={22} className="text-blue-400" />
        <div>
          <h1 className="text-lg font-bold text-white">TORRE DE CONTROLE</h1>
          <p className="text-xs text-slate-500">
            Hoje: {hoje} {lastUpdate && `· Atualizado ${lastUpdate}`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <a href="/spa/expedicao/v2/scanner"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600/20 border border-emerald-600/40 text-emerald-400 hover:bg-emerald-600/30 text-sm font-medium transition-colors"
          >
            <ScanLine size={14} /> Ir para Scanner
          </a>
          <button
            onClick={loadTorre}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Prontos p/ Expedir" value={kpis?.prontos}    color="emerald" icon={CheckCircle2} />
        <KpiCard label="Em Processo"         value={kpis?.emProcesso} color="blue"    icon={Zap} />
        <KpiCard label="Expedidos Hoje"      value={kpis?.expedidos}  color="slate"   icon={TrendingUp} />
        <KpiCard label="Com Problema"        value={kpis?.comErro}    color="red"     icon={AlertTriangle} sub={kpis?.comErro > 0 ? 'ação necessária' : ''} />
        <KpiCard label="Total Hoje"          value={kpis?.totalHoje}  color="slate"   icon={Package} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Fila por marketplace */}
        <div className="rounded-xl border border-slate-700 bg-slate-900/30 p-4">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-4 flex items-center gap-2">
            <Package size={13} /> Fila por Marketplace (Hoje)
          </p>
          <div className="flex flex-col gap-3">
            <MktBar label="Mercado Livre" count={porMkt.MERCADO_LIVRE || 0} total={totalMkt} color="#FFE600" />
            <MktBar label="Shopee"        count={porMkt.SHOPEE || 0}        total={totalMkt} color="#EE4D2D" />
            <MktBar label="Outros"        count={porMkt.OUTROS || 0}        total={totalMkt} color="#64748b" />
          </div>
        </div>

        {/* Alertas */}
        <div className="rounded-xl border border-slate-700 bg-slate-900/30 p-4">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-3 flex items-center gap-2">
            <AlertTriangle size={13} /> Alertas
          </p>
          {alertas.length === 0
            ? <p className="text-sm text-slate-600 italic">Nenhum alerta no momento</p>
            : alertas.map((a, i) => (
              <AlertRow key={i} alerta={a} onAction={(id) => {
                const el = document.getElementById(`order-${id}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }} />
            ))
          }
        </div>

        {/* Próximos da fila */}
        <div className="rounded-xl border border-slate-700 bg-slate-900/30 p-4">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-3 flex items-center gap-2">
            <Clock size={13} /> Próximos Prontos
          </p>
          {proximosFila.length === 0
            ? <p className="text-sm text-slate-600 italic">Nenhum pronto no momento</p>
            : proximosFila.map(o => (
              <div key={o.id} className="flex items-center gap-2 py-1.5 border-b border-slate-800 last:border-0 text-xs">
                <MktBadgeSmall mkt={o.marketplace} />
                <span className="font-mono text-slate-300 flex-1 truncate">{o.id}</span>
                <span className="text-slate-500">{fmtDate(o.data_expedicao)}</span>
                <span className="text-slate-600">{o.qtdItens}it</span>
              </div>
            ))
          }
        </div>
      </div>

      {/* Controle de Envio — Hoje */}
      {ordersHoje.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/30 p-4 mb-4">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-3 flex items-center gap-2">
            <CalendarDays size={13} /> Pedidos de Hoje ({ordersHoje.length})
          </p>
          <div className="overflow-auto">
            {ordersHoje.map(o => (
              <div id={`order-${o.id}`} key={o.id}>
                <OrderRow order={o} onBloquear={handleBloquear} onData={handleData} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controle de Envio — Amanhã */}
      {ordersAmanha.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/30 p-4">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-3 flex items-center gap-2">
            <CalendarDays size={13} /> Pedidos de Amanhã ({ordersAmanha.length})
          </p>
          <div className="overflow-auto">
            {ordersAmanha.map(o => (
              <div id={`order-${o.id}`} key={o.id}>
                <OrderRow order={o} onBloquear={handleBloquear} onData={handleData} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
