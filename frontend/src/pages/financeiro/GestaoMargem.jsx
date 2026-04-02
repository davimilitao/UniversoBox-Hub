/**
 * @file GestaoMargem.jsx
 * @module financeiro
 * @description Dashboard de Margem — Margem Bruta, Margem Líquida, breakdown de despesas.
 *              Lê a aba "Margem" da planilha Controle Financeiro via /api/margem.
 * @version 1.0.0
 * @date 2026-04-02
 * @author UniversoLab
 */

import { useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged }           from 'firebase/auth';
import { auth }                         from '../../firebase';
import {
  TrendingUp, TrendingDown, DollarSign,
  ReceiptText, ShoppingCart, Percent,
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

// Tooltip customizado para os gráficos
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

// Cores para o donut de despesas
const CORES_DESPESAS = [
  '#10b981','#3b82f6','#f59e0b','#8b5cf6',
  '#ec4899','#06b6d4','#f97316','#84cc16','#6366f1','#14b8a6',
];

// ─── Gráfico 1: Evolução das Margens ──────────────────────────────────────────
function GraficoMargens({ items }) {
  const data = items.map(d => ({
    mes:         d.data,
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
          <Line
            type="monotone" dataKey="Margem Bruta"
            stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone" dataKey="Margem Líquida"
            stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Gráfico 2: Composição do Faturamento ─────────────────────────────────────
function GraficoComposicao({ items }) {
  const data = items.map(d => ({
    mes:           d.data,
    'Custo':       d.custoMercadoria,
    'Imposto':     d.imposto,
    'Despesas':    d.totalDespesas,
    'Lucro Líq.':  Math.max(0, d.lucroLiquido),
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
const LABELS_DESPESAS = {
  bling: 'Bling', ads: 'ADS', corola: 'Corola', flex: 'Flex',
  contador: 'Contador', obras: 'Obras', embalagem: 'Embalagem',
  celular: 'Celular', logistica: 'Logística', outros: 'Outros',
};

function GraficoDespesas({ items }) {
  const totais = useMemo(() => {
    const acc = {};
    items.forEach(d => {
      Object.entries(d.despesas).forEach(([k, v]) => {
        acc[k] = (acc[k] || 0) + v;
      });
    });
    return Object.entries(acc)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ name: LABELS_DESPESAS[k] || k, value: v }))
      .sort((a, b) => b.value - a.value);
  }, [items]);

  const total = totais.reduce((s, d) => s + d.value, 0);

  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 p-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
        <ReceiptText size={15} className="text-orange-400" />
        Breakdown de Despesas
      </h3>
      <div className="flex items-center gap-6">
        <PieChart width={160} height={160}>
          <Pie
            data={totais} cx={75} cy={75} innerRadius={45} outerRadius={72}
            dataKey="value" startAngle={90} endAngle={-270}
          >
            {totais.map((_, i) => (
              <Cell key={i} fill={CORES_DESPESAS[i % CORES_DESPESAS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => BRL.format(v)} />
        </PieChart>

        <div className="flex-1 flex flex-col gap-1.5">
          {totais.map((d, i) => (
            <div key={d.name} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: CORES_DESPESAS[i % CORES_DESPESAS.length] }}
                />
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

// ─── Tabela mensal ─────────────────────────────────────────────────────────────
function TabelaMargem({ items, totais }) {
  function pct(v) {
    const p = v * 100;
    const cor = p >= 15 ? 'text-emerald-400'
              : p >= 5  ? 'text-yellow-400'
              : p >= 0  ? 'text-orange-400'
              : 'text-red-400';
    return <span className={`font-semibold tabular-nums ${cor}`}>{PERC(v)}</span>;
  }

  const rows = totais ? [...items, totais] : items;

  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5 text-left bg-slate-900/50">
              {[
                'Mês','Rec. Bruta','Custo Merc.','Lucro Bruto','Marg. Bruta',
                'Imposto','Despesas','Desp. %','Lucro Líq.','Marg. Líq.',
              ].map(h => (
                <th key={h} className="px-3 py-3 text-slate-500 font-medium whitespace-nowrap text-right first:text-left">
                  {h}
                </th>
              ))}
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
                <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap font-medium">
                  {d.data}
                </td>
                <td className="px-3 py-2.5 text-right text-slate-400 tabular-nums whitespace-nowrap">{BRL.format(d.receitaBruta)}</td>
                <td className="px-3 py-2.5 text-right text-slate-400 tabular-nums whitespace-nowrap">{BRL.format(d.custoMercadoria)}</td>
                <td className="px-3 py-2.5 text-right text-slate-200 tabular-nums whitespace-nowrap">{BRL.format(d.lucroBruto)}</td>
                <td className="px-3 py-2.5 text-right">{pct(d.margemBruta)}</td>
                <td className="px-3 py-2.5 text-right text-slate-400 tabular-nums whitespace-nowrap">{BRL.format(d.imposto)}</td>
                <td className="px-3 py-2.5 text-right text-orange-400/80 tabular-nums whitespace-nowrap">{BRL.format(d.totalDespesas)}</td>
                <td className="px-3 py-2.5 text-right text-slate-500 tabular-nums">{PERC(d.despesasPerc)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                  <span className={d.lucroLiquido >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {BRL.format(d.lucroLiquido)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">{pct(d.margemLiquida)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export function GestaoMargem() {
  const [items,   setItems]   = useState([]);
  const [totais,  setTotais]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (cancelled) return;
      if (!user) { setError('Sessão expirada. Faça login novamente.'); setLoading(false); return; }
      try {
        setLoading(true); setError(null);
        const token = await user.getIdToken(false);
        const res   = await fetch('/api/margem', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { const b = await res.json().catch(() => {}); throw new Error(b?.error || `HTTP ${res.status}`); }
        const data  = await res.json();
        if (!cancelled) { setItems(data.items || []); setTotais(data.totais || null); }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
      unsub();
    });
    return () => { cancelled = true; unsub(); };
  }, []);

  // KPIs do total geral (ou média/soma dos items)
  const kpis = useMemo(() => {
    const base = totais || (items.length ? items[items.length - 1] : null);
    if (!base) return null;

    const recTotal   = items.reduce((s, d) => s + d.receitaBruta,  0);
    const lucTotal   = items.reduce((s, d) => s + d.lucroLiquido,  0);
    const despTotal  = items.reduce((s, d) => s + d.totalDespesas, 0);

    // Margem média ponderada pelo faturamento
    const margBruta = items.length
      ? items.reduce((s, d) => s + d.margemBruta  * d.receitaBruta, 0) / (recTotal || 1)
      : 0;
    const margLiq   = items.length
      ? items.reduce((s, d) => s + d.margemLiquida * d.receitaBruta, 0) / (recTotal || 1)
      : 0;

    return { recTotal, lucTotal, despTotal, margBruta, margLiq };
  }, [items, totais]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 max-w-7xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <TrendingUp size={20} className="text-emerald-400" />
          Gestão de Margem
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Margem bruta · Margem líquida · Breakdown de despesas</p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-900/20 border border-red-700/40 p-4 text-red-400 text-sm mb-6">
          {error}
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

      {/* Conteúdo */}
      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <span className="text-4xl">📊</span>
          <p className="text-slate-400">Nenhum dado encontrado na aba Margem.</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && kpis && (
        <div className="flex flex-col gap-6">

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Card
              icon={DollarSign}  label="Receita Bruta (total)"
              value={BRL.format(kpis.recTotal)}
              cor="slate"
            />
            <Card
              icon={ShoppingCart} label="Margem Bruta (média pond.)"
              value={PERC(kpis.margBruta)}
              sub="Receita − Custo Mercadoria"
              cor="emerald"
            />
            <Card
              icon={ReceiptText}  label="Total Despesas"
              value={BRL.format(kpis.despTotal)}
              cor="orange"
            />
            <Card
              icon={kpis.lucTotal >= 0 ? TrendingUp : TrendingDown}
              label="Lucro Líquido (total)"
              value={BRL.format(kpis.lucTotal)}
              cor={kpis.lucTotal >= 0 ? 'emerald' : 'red'}
            />
            <Card
              icon={Percent}  label="Margem Líquida (média pond.)"
              value={PERC(kpis.margLiq)}
              sub="Após impostos e despesas"
              cor={kpis.margLiq >= 0.05 ? 'blue' : kpis.margLiq >= 0 ? 'orange' : 'red'}
            />
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GraficoMargens items={items} />
            <GraficoComposicao items={items} />
          </div>

          {/* Donut de despesas */}
          <GraficoDespesas items={items} />

          {/* Tabela */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">
              Detalhamento Mensal
            </h3>
            <TabelaMargem items={items} totais={totais} />
          </div>

        </div>
      )}
    </div>
  );
}
