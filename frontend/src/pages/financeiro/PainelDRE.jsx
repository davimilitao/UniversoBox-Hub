/**
 * @file PainelDRE.jsx
 * @description Dashboard DRE — lê dados importados do Bling (CSV) + despesas do Firestore.
 *              Substitui a dependência da Bling API por upload manual de arquivos.
 */
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../utils/getAuthToken';
import { ImportarDRE } from './ImportarDRE';
import {
  TrendingUp, TrendingDown, Upload, Clock, AlertTriangle,
  ChevronLeft, ChevronRight, RefreshCw, BarChart2,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

const BRL  = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const PERC = v => `${((v || 0) * 100).toFixed(1)}%`;

function diasAtras(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'hoje';
  if (d === 1) return 'ontem';
  return `${d} dias atrás`;
}

function Skeleton({ h = 'h-20' }) {
  return <div className={`rounded-xl bg-slate-800 animate-pulse ${h}`} />;
}

function KpiCard({ label, valor, sub, cor = 'slate', icon: Icon }) {
  const cores = { emerald:'text-emerald-400', red:'text-red-400', blue:'text-blue-400', orange:'text-orange-400', slate:'text-slate-200', yellow:'text-yellow-400' };
  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 p-4 flex flex-col gap-1">
      {Icon && <Icon size={14} className={`${cores[cor]} mb-1`} />}
      <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
      <span className={`text-lg font-bold ${cores[cor]}`}>{valor}</span>
      {sub && <span className="text-xs text-slate-600">{sub}</span>}
    </div>
  );
}

function TooltipBRL({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-slate-900 border border-white/10 p-3 text-xs shadow-xl">
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

function pctCor(v) {
  const p = (v || 0) * 100;
  return p >= 15 ? 'text-emerald-400' : p >= 5 ? 'text-yellow-400' : p >= 0 ? 'text-orange-400' : 'text-red-400';
}

// ── Tabela DRE ──────────────────────────────────────────────────────────────
function TabelaDRE({ items, totais }) {
  const rows = totais ? [...items, totais] : items;

  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5 bg-slate-900/50 text-left">
              {['Mês','Rec. Bruta','Rec. Líquida','Custo Merc.','Lucro Bruto','Marg. Bruta','Desp. Financ.','IR/CSLL','Resultado Líq.','Marg. Líq.'].map(h => (
                <th key={h} className="px-3 py-3 text-slate-500 font-medium whitespace-nowrap text-right first:text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d, i) => (
              <tr key={i} className={`border-b border-white/5 last:border-0 transition-colors
                ${d.isTotal ? 'bg-slate-900/60 font-semibold border-t border-white/10' : d.semDados ? 'opacity-30' : 'hover:bg-white/[0.02]'}`}>
                <td className="px-3 py-2.5 text-slate-300 font-medium whitespace-nowrap">
                  {d.isTotal ? 'Total' : d.label || d.mesAno}
                  {d.semDados && <span className="ml-2 text-[10px] text-slate-600 font-normal">sem dados</span>}
                </td>
                <td className="px-3 py-2.5 text-right text-slate-400 tabular-nums whitespace-nowrap">{BRL.format(d.receitaBruta || 0)}</td>
                <td className="px-3 py-2.5 text-right text-slate-400 tabular-nums whitespace-nowrap">{BRL.format(d.receitaLiquida || 0)}</td>
                <td className="px-3 py-2.5 text-right text-slate-400 tabular-nums whitespace-nowrap">{BRL.format(d.custoMercadoria || 0)}</td>
                <td className="px-3 py-2.5 text-right text-slate-200 tabular-nums whitespace-nowrap">{BRL.format(d.lucroBruto || 0)}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`font-semibold tabular-nums ${pctCor(d.margemBruta)}`}>{PERC(d.margemBruta)}</span>
                </td>
                <td className="px-3 py-2.5 text-right text-orange-400/80 tabular-nums whitespace-nowrap">{BRL.format(d.despesaFinanceira || d.totalDespesas || 0)}</td>
                <td className="px-3 py-2.5 text-right text-yellow-500/70 tabular-nums whitespace-nowrap">{BRL.format(d.irCsll || 0)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                  <span className={(d.resultadoLiquido || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {BRL.format(d.resultadoLiquido || 0)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`font-semibold tabular-nums ${pctCor(d.margemLiquida)}`}>{PERC(d.margemLiquida)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Página principal ────────────────────────────────────────────────────────
export function PainelDRE() {
  const [aba,      setAba]     = useState('dashboard'); // 'dashboard' | 'importar'
  const [data,     setData]    = useState(null);
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState('');

  // Período: últimos 12 meses por padrão
  const hoje = new Date();
  const ateDefault = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
  const d12 = new Date(hoje); d12.setMonth(d12.getMonth() - 11);
  const deDefault = `${d12.getFullYear()}-${String(d12.getMonth()+1).padStart(2,'0')}`;
  const [de,  setDe]  = useState(deDefault);
  const [ate, setAte] = useState(ateDefault);

  const carregar = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await apiFetch(`/api/fin-dre?de=${de}&ate=${ate}`);
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `HTTP ${res.status}`); }
      setData(await res.json());
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [de, ate]);

  useEffect(() => { carregar(); }, [carregar]);

  const items     = data?.items || [];
  const totais    = data?.totais || null;
  const meta      = data?.meta  || null;
  const comDados  = items.filter(i => !i.semDados);

  // Dados para gráficos
  const grafDados = comDados.map(d => ({
    mes:            d.label || d.mesAno,
    'Rec. Bruta':   d.receitaBruta,
    'Custo':        d.custoMercadoria,
    'Despesas':     d.despesaFinanceira,
    'Resultado':    d.resultadoLiquido,
  }));
  const grafMargens = comDados.map(d => ({
    mes:              d.label || d.mesAno,
    'Marg. Bruta':    +(((d.margemBruta  || 0) * 100).toFixed(1)),
    'Marg. Líquida':  +(((d.margemLiquida || 0) * 100).toFixed(1)),
  }));

  const diasSemAtualizar = meta?.ultimaImportacao
    ? Math.floor((Date.now() - new Date(meta.ultimaImportacao._seconds ? meta.ultimaImportacao._seconds*1000 : meta.ultimaImportacao).getTime()) / 86400000)
    : null;

  return (
    <div className="text-slate-100 px-4 py-8 max-w-7xl mx-auto flex-1 overflow-y-auto">

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <BarChart2 size={20} className="text-emerald-400" />
            DRE — Resultado do Exercício
          </h1>
          {meta ? (
            <div className="flex items-center gap-1.5 mt-1">
              {diasSemAtualizar !== null && diasSemAtualizar > 7
                ? <AlertTriangle size={12} className="text-orange-400" />
                : <Clock size={12} className="text-emerald-400" />}
              <span className={`text-xs ${diasSemAtualizar !== null && diasSemAtualizar > 7 ? 'text-orange-400' : 'text-slate-500'}`}>
                Última importação: {diasAtras(
                  meta.ultimaImportacao?._seconds
                    ? new Date(meta.ultimaImportacao._seconds * 1000).toISOString()
                    : meta.ultimaImportacao
                )} · {meta.arquivoNome}
              </span>
            </div>
          ) : (
            <p className="text-xs text-slate-600 mt-1">Nenhum dado importado ainda</p>
          )}
        </div>

        {/* Abas + ações */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-slate-800 border border-white/10 p-1 gap-1">
            <button
              onClick={() => setAba('dashboard')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                ${aba === 'dashboard' ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setAba('importar')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5
                ${aba === 'importar' ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Upload size={11} /> Importar CSV
            </button>
          </div>
          {aba === 'dashboard' && (
            <button onClick={carregar} disabled={loading} className="p-1.5 rounded-lg bg-slate-800 border border-white/10 hover:border-white/20 text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      </div>

      {/* Aba Importar */}
      {aba === 'importar' && (
        <ImportarDRE onImportado={() => { setAba('dashboard'); carregar(); }} />
      )}

      {/* Aba Dashboard */}
      {aba === 'dashboard' && (
        <>
          {/* Filtro de período */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">De</label>
              <input type="month" value={de} onChange={e => setDe(e.target.value)}
                className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 [color-scheme:dark]" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Até</label>
              <input type="month" value={ate} onChange={e => setAte(e.target.value)}
                className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 [color-scheme:dark]" />
            </div>
          </div>

          {/* Sem dados — CTA importar */}
          {!loading && !error && comDados.length === 0 && (
            <div className="rounded-xl bg-slate-800 border border-white/5 p-12 flex flex-col items-center gap-4 text-center">
              <Upload size={36} className="text-slate-600" />
              <div>
                <p className="text-slate-300 font-medium">Nenhum dado encontrado para o período</p>
                <p className="text-xs text-slate-500 mt-1">Importe o CSV do DRE do Bling para visualizar o resultado financeiro</p>
              </div>
              <button onClick={() => setAba('importar')}
                className="mt-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors flex items-center gap-2">
                <Upload size={14} /> Importar agora
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-900/20 border border-red-700/40 p-4 text-red-400 text-sm mb-5">{error}</div>
          )}

          {loading && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_,i) => <Skeleton key={i} h="h-24" />)}
              </div>
              <Skeleton h="h-64" />
              <Skeleton h="h-48" />
            </div>
          )}

          {!loading && comDados.length > 0 && (
            <div className="flex flex-col gap-5">

              {/* KPIs do período total */}
              {totais && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <KpiCard label="Receita Total"    valor={BRL.format(totais.receitaBruta)}    cor="emerald" icon={TrendingUp} />
                  <KpiCard label="Custo Mercadoria" valor={BRL.format(totais.custoMercadoria)} cor="orange"  />
                  <KpiCard
                    label="Resultado Líquido"
                    valor={BRL.format(totais.resultadoLiquido)}
                    cor={totais.resultadoLiquido >= 0 ? 'emerald' : 'red'}
                    icon={totais.resultadoLiquido >= 0 ? TrendingUp : TrendingDown}
                  />
                  <KpiCard
                    label="Margem Líquida"
                    valor={PERC(totais.margemLiquida)}
                    sub={`Margem bruta: ${PERC(totais.margemBruta)}`}
                    cor={totais.margemLiquida >= 0.1 ? 'emerald' : totais.margemLiquida >= 0.05 ? 'yellow' : 'red'}
                  />
                </div>
              )}

              {/* Gráfico composição */}
              <div className="rounded-xl bg-slate-800 border border-white/5 p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">Composição do Faturamento</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={grafDados} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <Tooltip content={<TooltipBRL />} />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                    <Bar dataKey="Custo"    stackId="a" fill="#475569" />
                    <Bar dataKey="Despesas" stackId="a" fill="#f97316" />
                    <Bar dataKey="Resultado" fill="#10b981" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Gráfico margens */}
              <div className="rounded-xl bg-slate-800 border border-white/5 p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">Evolução das Margens (%)</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={grafMargens} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis tickFormatter={v => `${v}%`} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <Tooltip formatter={v => `${v}%`} contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                    <Line type="monotone" dataKey="Marg. Bruta"   stroke="#10b981" strokeWidth={2} dot={{ fill:'#10b981', r:3 }} />
                    <Line type="monotone" dataKey="Marg. Líquida" stroke="#3b82f6" strokeWidth={2} dot={{ fill:'#3b82f6', r:3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Tabela DRE */}
              <div>
                <h3 className="text-sm font-semibold text-slate-400 mb-3">DRE Mensal Detalhado</h3>
                <TabelaDRE items={items} totais={totais} />
              </div>

            </div>
          )}
        </>
      )}
    </div>
  );
}
