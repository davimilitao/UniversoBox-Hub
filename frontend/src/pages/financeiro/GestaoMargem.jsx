/**
 * @file GestaoMargem.jsx
 * @module financeiro
 * @description Dashboard de Margem v2 — dados reais: Bling NF-e + Firestore fin_despesas/fin_compras.
 *              Overrides manuais (Shopee, dividendos) via modal + endpoint /api/margem-mensal/:mesAno.
 *              Fallback histórico via Google Sheets para meses anteriores.
 * @version 2.0.0
 * @date 2026-04-17
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { onAuthStateChanged }                         from 'firebase/auth';
import { auth }                                       from '../../firebase';
import {
  TrendingUp, TrendingDown, DollarSign,
  ReceiptText, ShoppingCart, Percent,
  Pencil, X, Save, AlertTriangle, Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart,  Bar,
  PieChart,  Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

// ─── helpers ──────────────────────────────────────────────────────────────────

const BRL  = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const PERC = (v) => `${(v * 100).toFixed(1)}%`;

function Skeleton({ h = 'h-32', className = '' }) {
  return <div className={`rounded-xl bg-slate-800 border border-white/5 animate-pulse ${h} ${className}`} />;
}

function Card({ icon: Icon, label, value, sub, cor = 'emerald' }) {
  const cores = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    blue:    'text-blue-400   bg-blue-500/10   border-blue-500/20',
    orange:  'text-orange-400 bg-orange-500/10 border-orange-500/20',
    red:     'text-red-400    bg-red-500/10    border-red-500/20',
    slate:   'text-slate-400  bg-slate-500/10  border-slate-500/20',
    purple:  'text-purple-400 bg-purple-500/10 border-purple-500/20',
  };
  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 p-5 flex flex-col gap-3">
      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${cores[cor]}`}>
        <Icon size={17} />
      </div>
      <div>
        <p className="text-xs text-slate-500 mb-1">{label}</p>
        <p className="text-xl font-bold text-slate-100">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function TooltipBRL({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-slate-900 border border-white/10 p-3 text-sm shadow-xl">
      <p className="text-slate-400 mb-2 font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="font-semibold tabular-nums">{BRL.format(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

function TooltipPerc({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-slate-900 border border-white/10 p-3 text-sm shadow-xl">
      <p className="text-slate-400 mb-2 font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="font-semibold tabular-nums">{PERC(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

const CORES_DESPESAS = [
  '#10b981','#3b82f6','#f59e0b','#8b5cf6',
  '#ec4899','#06b6d4','#f97316','#84cc16','#6366f1','#14b8a6',
];

// Badge de fonte de dados por mês
function BadgeFonte({ fonte }) {
  const mapa = {
    automatico: { emoji: '🟢', label: 'Automático', cls: 'text-emerald-400 bg-emerald-500/10' },
    parcial:    { emoji: '🟡', label: 'Parcial',    cls: 'text-yellow-400 bg-yellow-500/10'   },
    historico:  { emoji: '⚪', label: 'Histórico',  cls: 'text-slate-400  bg-slate-500/10'    },
    manual:     { emoji: '✏️', label: 'Manual',     cls: 'text-purple-400 bg-purple-500/10'   },
  };
  const b = mapa[fonte] || mapa.historico;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md ${b.cls}`}>
      {b.emoji} {b.label}
    </span>
  );
}

// ─── Gráfico 1: Evolução das Margens ──────────────────────────────────────────
function GraficoMargens({ items }) {
  const data = items.filter(d => !d.isTotal).map(d => ({
    mes:              d.data,
    'Margem Bruta':   d.margemBruta,
    'Margem Líquida': d.margemLiquida,
  }));

  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 p-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
        <Percent size={15} className="text-emerald-400" />
        Evolução das Margens
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 11 }} />
          <YAxis tickFormatter={v => `${(v*100).toFixed(0)}%`} tick={{ fill: '#64748b', fontSize: 11 }} />
          <Tooltip content={<TooltipPerc />} />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          <Line type="monotone" dataKey="Margem Bruta"   stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 4 }} activeDot={{ r: 6 }} />
          <Line type="monotone" dataKey="Margem Líquida" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Gráfico 2: Composição do Faturamento ─────────────────────────────────────
function GraficoComposicao({ items }) {
  const data = items.filter(d => !d.isTotal).map(d => ({
    mes:          d.data,
    'Custo':      d.custoMercadoria,
    'Imposto':    d.imposto,
    'Despesas':   d.totalDespesas,
    'Lucro Líq.': Math.max(0, d.lucroLiquido),
  }));

  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 p-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
        <ShoppingCart size={15} className="text-blue-400" />
        Composição da Receita Bruta
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 11 }} />
          <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fill: '#64748b', fontSize: 11 }} />
          <Tooltip content={<TooltipBRL />} />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          <Bar dataKey="Custo"      stackId="a" fill="#475569" radius={[0,0,0,0]} />
          <Bar dataKey="Imposto"    stackId="a" fill="#f59e0b" />
          <Bar dataKey="Despesas"   stackId="a" fill="#f97316" />
          <Bar dataKey="Lucro Líq." stackId="a" fill="#10b981" radius={[4,4,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Gráfico 3: Donut de Despesas ─────────────────────────────────────────────
function GraficoDespesas({ items }) {
  const totais = useMemo(() => {
    const acc = {};
    items.filter(d => !d.isTotal).forEach(d => {
      Object.entries(d.despesas || {}).forEach(([k, v]) => {
        acc[k] = (acc[k] || 0) + v;
      });
    });
    return Object.entries(acc)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ name: k, value: v }))
      .sort((a, b) => b.value - a.value);
  }, [items]);

  const total = totais.reduce((s, d) => s + d.value, 0);

  if (!totais.length) return (
    <div className="rounded-xl bg-slate-800 border border-white/5 p-5 flex items-center gap-3 text-slate-500 text-sm">
      <ReceiptText size={15} />
      Despesas por categoria estarão disponíveis após conectar o Firestore.
    </div>
  );

  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 p-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
        <ReceiptText size={15} className="text-orange-400" />
        Breakdown de Despesas (por categoria)
      </h3>
      <div className="flex items-center gap-6">
        <PieChart width={160} height={160}>
          <Pie data={totais} cx={75} cy={75} innerRadius={45} outerRadius={72} dataKey="value" startAngle={90} endAngle={-270}>
            {totais.map((_, i) => <Cell key={i} fill={CORES_DESPESAS[i % CORES_DESPESAS.length]} />)}
          </Pie>
          <Tooltip formatter={(v) => BRL.format(v)} />
        </PieChart>
        <div className="flex-1 flex flex-col gap-1.5">
          {totais.map((d, i) => (
            <div key={d.name} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CORES_DESPESAS[i % CORES_DESPESAS.length] }} />
                <span className="text-slate-400">{d.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-300 tabular-nums">{BRL.format(d.value)}</span>
                <span className="text-slate-600 w-8 text-right tabular-nums">
                  {total ? `${((d.value / total) * 100).toFixed(0)}%` : '—'}
                </span>
              </div>
            </div>
          ))}
          <div className="border-t border-white/10 mt-1 pt-1 flex justify-between text-xs font-semibold">
            <span className="text-slate-400">Total</span>
            <span className="text-slate-200 tabular-nums">{BRL.format(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Editar dados manuais do mês ────────────────────────────────────────
function ModalEditarMes({ item, onClose, onSaved, getToken }) {
  const [shopee,     setShopee]     = useState(String(item.receitaShopeeManual ?? item.receitaShopee ?? ''));
  const [dividendos, setDividendos] = useState(String(item.dividendos ?? ''));
  const [obs,        setObs]        = useState(item.observacoes ?? '');
  const [saving,     setSaving]     = useState(false);
  const [err,        setErr]        = useState(null);

  async function salvar() {
    setSaving(true); setErr(null);
    try {
      const token = await getToken();
      const r = await fetch(`/api/margem-mensal/${item.mesAno}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          receitaShopeeManual: Number(String(shopee).replace(',', '.')) || 0,
          dividendos:          Number(String(dividendos).replace(',', '.')) || 0,
          observacoes:         obs,
        }),
      });
      if (!r.ok) { const b = await r.json().catch(() => {}); throw new Error(b?.error || `HTTP ${r.status}`); }
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/10 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div>
            <h2 className="text-slate-100 font-semibold flex items-center gap-2">
              <Pencil size={15} className="text-purple-400" />
              Ajuste Manual — {item.data}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Dados que não vêm automaticamente das APIs</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">
              Receita Shopee (R$)
              <span className="ml-2 text-slate-600 font-normal">— complemento à receita automática do Bling</span>
            </label>
            <input
              type="number" step="0.01" value={shopee}
              onChange={e => setShopee(e.target.value)}
              placeholder="0,00"
              className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-purple-500/50"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">
              Dividendos distribuídos (R$)
            </label>
            <input
              type="number" step="0.01" value={dividendos}
              onChange={e => setDividendos(e.target.value)}
              placeholder="0,00"
              className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-purple-500/50"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Observações</label>
            <textarea
              value={obs} onChange={e => setObs(e.target.value)} rows={2}
              placeholder="Ex: Mês de lançamento, sazonalidade alta..."
              className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-purple-500/50 resize-none"
            />
          </div>

          {err && (
            <div className="rounded-lg bg-red-900/20 border border-red-700/40 p-3 text-red-400 text-xs flex items-center gap-2">
              <AlertTriangle size={14} /> {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-400 text-sm hover:bg-slate-700 transition-colors">
            Cancelar
          </button>
          <button
            onClick={salvar} disabled={saving}
            className="flex-1 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <Save size={14} />
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tabela mensal ─────────────────────────────────────────────────────────────
function TabelaMargem({ items, totais, onEditar }) {
  function pct(v) {
    const p = v * 100;
    const cor = p >= 15 ? 'text-emerald-400'
              : p >= 5  ? 'text-yellow-400'
              : p >= 0  ? 'text-orange-400'
              : 'text-red-400';
    return <span className={`font-semibold tabular-nums ${cor}`}>{PERC(v)}</span>;
  }

  const temDividendos = items.some(d => d.dividendos > 0) || (totais?.dividendos > 0);
  const rows = totais ? [...items, totais] : items;

  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5 text-left bg-slate-900/50">
              <th className="px-3 py-3 text-slate-500 font-medium whitespace-nowrap">Mês</th>
              <th className="px-3 py-3 text-slate-500 font-medium whitespace-nowrap text-right">Rec. Bruta</th>
              <th className="px-3 py-3 text-slate-500 font-medium whitespace-nowrap text-right">Custo Merc.</th>
              <th className="px-3 py-3 text-slate-500 font-medium whitespace-nowrap text-right">Lucro Bruto</th>
              <th className="px-3 py-3 text-slate-500 font-medium whitespace-nowrap text-right">Marg. Bruta</th>
              <th className="px-3 py-3 text-slate-500 font-medium whitespace-nowrap text-right">Imposto</th>
              <th className="px-3 py-3 text-slate-500 font-medium whitespace-nowrap text-right">Despesas</th>
              <th className="px-3 py-3 text-slate-500 font-medium whitespace-nowrap text-right">Desp. %</th>
              <th className="px-3 py-3 text-slate-500 font-medium whitespace-nowrap text-right">Lucro Líq.</th>
              <th className="px-3 py-3 text-slate-500 font-medium whitespace-nowrap text-right">Marg. Líq.</th>
              {temDividendos && <th className="px-3 py-3 text-slate-500 font-medium whitespace-nowrap text-right">Dividendos</th>}
              <th className="px-3 py-3 text-slate-500 font-medium whitespace-nowrap text-center">Fonte</th>
              <th className="px-3 py-3 text-slate-500 font-medium whitespace-nowrap text-center w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d, i) => (
              <tr
                key={i}
                className={`border-b border-white/5 last:border-0 transition-colors
                  ${d.isTotal
                    ? 'bg-slate-900/60 font-semibold border-t border-white/10'
                    : 'hover:bg-white/[0.02]'}`}
              >
                <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap font-medium">{d.data}</td>
                <td className="px-3 py-2.5 text-right text-slate-400 tabular-nums whitespace-nowrap">{BRL.format(d.receitaBruta)}</td>
                <td className="px-3 py-2.5 text-right text-slate-400 tabular-nums whitespace-nowrap">{BRL.format(d.custoMercadoria)}</td>
                <td className="px-3 py-2.5 text-right text-slate-200 tabular-nums whitespace-nowrap">{BRL.format(d.lucroBruto)}</td>
                <td className="px-3 py-2.5 text-right">{pct(d.margemBruta)}</td>
                <td className="px-3 py-2.5 text-right text-yellow-500/80 tabular-nums whitespace-nowrap">{BRL.format(d.imposto)}</td>
                <td className="px-3 py-2.5 text-right text-orange-400/80 tabular-nums whitespace-nowrap">{BRL.format(d.totalDespesas)}</td>
                <td className="px-3 py-2.5 text-right text-slate-500 tabular-nums">{PERC(d.despesasPerc)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                  <span className={d.lucroLiquido >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {BRL.format(d.lucroLiquido)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">{pct(d.margemLiquida)}</td>
                {temDividendos && (
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                    {d.dividendos > 0
                      ? <span className="text-purple-400">{BRL.format(d.dividendos)}</span>
                      : <span className="text-slate-700">—</span>}
                  </td>
                )}
                <td className="px-3 py-2.5 text-center">
                  {!d.isTotal && <BadgeFonte fonte={d.fonte} />}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {!d.isTotal && onEditar && (
                    <button
                      onClick={() => onEditar(d)}
                      title="Ajustar dados manuais"
                      className="text-slate-600 hover:text-purple-400 transition-colors"
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Legenda de fontes ─────────────────────────────────────────────────────────
function LegendaFontes({ blingOk }) {
  return (
    <div className="rounded-xl bg-slate-800/50 border border-white/5 p-4">
      <div className="flex flex-wrap gap-x-6 gap-y-2 items-center">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Info size={12} className="text-slate-600" />
          <span className="font-medium text-slate-400">Fonte dos dados:</span>
        </div>
        <span className="text-xs text-slate-500 flex items-center gap-1">🟢 <span className="text-emerald-400">Automático</span> — Bling NF-e + Firestore (despesas + custo)</span>
        <span className="text-xs text-slate-500 flex items-center gap-1">🟡 <span className="text-yellow-400">Parcial</span> — Uma fonte conectada, outra pendente</span>
        <span className="text-xs text-slate-500 flex items-center gap-1">⚪ <span className="text-slate-400">Histórico</span> — Importado da planilha Google Sheets</span>
        <span className="text-xs text-slate-500 flex items-center gap-1">✏️ <span className="text-purple-400">Manual</span> — Inserido manualmente</span>
      </div>
      {!blingOk && (
        <div className="mt-3 flex items-center gap-2 text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-2">
          <AlertTriangle size={13} />
          Bling não conectado — receita bruta indisponível. Conecte o Bling para dados automáticos de faturamento.
        </div>
      )}
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export function GestaoMargem() {
  const [items,      setItems]      = useState([]);
  const [totais,     setTotais]     = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [blingOk,    setBlingOk]    = useState(true);
  const [editingMes, setEditingMes] = useState(null); // item sendo editado no modal
  const [userRef,    setUserRef]    = useState(null); // firebase User ref para token

  // Carrega dados
  const carregar = useCallback(async (user) => {
    try {
      setLoading(true); setError(null);
      const token = await user.getIdToken(false);
      const res   = await fetch('/api/margem-v2', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const b = await res.json().catch(() => {}); throw new Error(b?.error || `HTTP ${res.status}`); }
      const data  = await res.json();
      setItems(data.items || []);
      setTotais(data.totais || null);
      setBlingOk(data.blingOk !== false);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (cancelled) return;
      if (!user) { setError('Sessão expirada. Faça login novamente.'); setLoading(false); return; }
      setUserRef(user);
      await carregar(user);
      unsub();
    });
    return () => { cancelled = true; unsub(); };
  }, [carregar]);

  const getToken = useCallback(async () => {
    if (!userRef) throw new Error('Sessão inativa');
    return userRef.getIdToken(false);
  }, [userRef]);

  // KPIs
  const kpis = useMemo(() => {
    if (!items.length) return null;
    const recTotal  = items.reduce((s, d) => s + d.receitaBruta,  0);
    const lucTotal  = items.reduce((s, d) => s + d.lucroLiquido,  0);
    const despTotal = items.reduce((s, d) => s + d.totalDespesas, 0);
    const divTotal  = items.reduce((s, d) => s + d.dividendos,    0);
    const margBruta = recTotal
      ? items.reduce((s, d) => s + d.margemBruta   * d.receitaBruta, 0) / recTotal : 0;
    const margLiq   = recTotal
      ? items.reduce((s, d) => s + d.margemLiquida  * d.receitaBruta, 0) / recTotal : 0;
    return { recTotal, lucTotal, despTotal, divTotal, margBruta, margLiq };
  }, [items]);

  return (
    <div className="text-slate-100 px-4 py-8 max-w-7xl mx-auto flex-1 overflow-y-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <TrendingUp size={20} className="text-emerald-400" />
          Gestão de Margem
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Margem bruta · Margem líquida · Breakdown real por categoria — dados de Bling + Firestore
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-900/20 border border-red-700/40 p-4 text-red-400 text-sm mb-6 flex items-center gap-2">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[...Array(5)].map((_,i) => <Skeleton key={i} h="h-28" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton h="h-72" /> <Skeleton h="h-72" />
          </div>
          <Skeleton h="h-64" />
          <Skeleton h="h-56" />
        </div>
      )}

      {/* Empty */}
      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <span className="text-4xl">📊</span>
          <p className="text-slate-400">Nenhum dado de margem encontrado.</p>
          <p className="text-slate-600 text-sm">Conecte o Bling e certifique-se de ter despesas lançadas no Financeiro.</p>
        </div>
      )}

      {/* Conteúdo */}
      {!loading && !error && items.length > 0 && kpis && (
        <div className="flex flex-col gap-6">

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Card
              icon={DollarSign} label="Receita Bruta (total)"
              value={BRL.format(kpis.recTotal)} cor="slate"
            />
            <Card
              icon={ShoppingCart} label="Margem Bruta (pond.)"
              value={PERC(kpis.margBruta)} sub="Receita − Custo de Mercadoria" cor="emerald"
            />
            <Card
              icon={ReceiptText} label="Total Despesas + Impostos"
              value={BRL.format(kpis.despTotal)} cor="orange"
            />
            <Card
              icon={kpis.lucTotal >= 0 ? TrendingUp : TrendingDown}
              label="Lucro Líquido (total)"
              value={BRL.format(kpis.lucTotal)}
              cor={kpis.lucTotal >= 0 ? 'emerald' : 'red'}
            />
            <Card
              icon={Percent} label="Margem Líquida (pond.)"
              value={PERC(kpis.margLiq)} sub="Após impostos e despesas"
              cor={kpis.margLiq >= 0.05 ? 'blue' : kpis.margLiq >= 0 ? 'orange' : 'red'}
            />
          </div>

          {/* Dividendos card (só mostra quando há valor) */}
          {kpis.divTotal > 0 && (
            <div className="rounded-xl bg-purple-900/20 border border-purple-700/30 p-4 flex items-center gap-3">
              <span className="text-purple-400 font-semibold text-sm">💰 Dividendos distribuídos no período:</span>
              <span className="text-purple-300 font-bold text-sm tabular-nums">{BRL.format(kpis.divTotal)}</span>
            </div>
          )}

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GraficoMargens items={items} />
            <GraficoComposicao items={items} />
          </div>

          {/* Donut de despesas (categorias reais do Firestore) */}
          <GraficoDespesas items={items} />

          {/* Tabela */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                Detalhamento Mensal
              </h3>
              <span className="text-xs text-slate-600">Clique no lápis para ajustar dados manuais (Shopee, dividendos)</span>
            </div>
            <TabelaMargem
              items={items}
              totais={totais}
              onEditar={(item) => setEditingMes(item)}
            />
          </div>

          {/* Legenda */}
          <LegendaFontes blingOk={blingOk} />

        </div>
      )}

      {/* Modal editar mês */}
      {editingMes && (
        <ModalEditarMes
          item={editingMes}
          getToken={getToken}
          onClose={() => setEditingMes(null)}
          onSaved={async () => {
            setEditingMes(null);
            if (userRef) await carregar(userRef);
          }}
        />
      )}

    </div>
  );
}
