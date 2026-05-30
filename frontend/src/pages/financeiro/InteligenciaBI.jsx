import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../utils/getAuthToken';
import {
  TrendingUp, DollarSign, Truck, Percent, ShoppingBag,
  Calendar, MapPin, BarChart3, Clock, AlertCircle, Info, RefreshCw
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, CartesianGrid
} from 'recharts';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function CardKpi({ title, value, sub, icon: Icon, color = 'emerald' }) {
  const colors = {
    emerald: 'border-emerald-500/20 bg-emerald-950/5 text-emerald-400',
    blue: 'border-blue-500/20 bg-blue-950/5 text-blue-400',
    purple: 'border-purple-500/20 bg-purple-950/5 text-purple-400',
    amber: 'border-amber-500/20 bg-amber-950/5 text-amber-400',
  };

  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-1.5 backdrop-blur-md transition-all hover:scale-[1.01] hover:border-white/10 ${colors[color]}`}>
      <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
        <span>{title}</span>
        <Icon size={16} className="opacity-75" />
      </div>
      <p className="text-2xl font-black text-white tracking-tight">{value}</p>
      {sub && <p className="text-[10px] text-slate-500 font-medium">{sub}</p>}
    </div>
  );
}

export default function InteligenciaBI() {
  const [rangeMode, setRangeMode] = useState('30'); // '7', '30', '90', 'custom'
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [summary, setSummary] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    totalFreight: 0,
    totalCost: 0,
    totalProfit: 0,
  });
  const [ufData, setUfData] = useState([]);
  const [channelData, setChannelData] = useState([]);
  const [hourData, setHourData] = useState([]);
  const [weekdayData, setWeekdayData] = useState([]);

  // Calcula datas predefinidas
  const calculateDates = useCallback((mode) => {
    if (mode === 'custom') return;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - Number(mode));
    
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setDataInicio(fmt(start));
    setDataFim(fmt(end));
  }, []);

  useEffect(() => {
    calculateDates(rangeMode);
  }, [rangeMode, calculateDates]);

  const loadData = useCallback(async () => {
    if (!dataInicio || !dataFim) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ dataInicio, dataFim });
      const res = await apiFetch(`/api/sales-intelligence/summary?${params}`);
      
      setSummary(res.summary || {
        totalOrders: 0,
        totalRevenue: 0,
        totalFreight: 0,
        totalCost: 0,
        totalProfit: 0,
      });
      setUfData(res.uf || []);
      setChannelData(res.channel || []);
      setHourData(res.hour || []);
      setWeekdayData(res.weekday || []);
    } catch (e) {
      console.error('[InteligenciaBI] load error:', e);
      setError(e.message || 'Erro ao carregar dados do BI.');
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calcula margem global
  const marginPct = useMemo(() => {
    if (!summary.totalRevenue) return 0;
    return (summary.totalProfit / summary.totalRevenue) * 100;
  }, [summary]);

  // Ordena dados de UFs por faturamento decrescente
  const sortedUfData = useMemo(() => {
    return [...ufData].sort((a, b) => b.revenue - a.revenue);
  }, [ufData]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 bg-slate-900/10 px-6 py-5 gap-4">
        <div>
          <h1 className="text-lg font-black text-slate-100 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp size={18} className="text-emerald-400" />
            Inteligência de Vendas (BI)
          </h1>
          <p className="text-slate-500 text-xs mt-1">Margem de lucro, frete por região e sazonalidade extraídos de Notas Fiscais</p>
        </div>

        {/* Date Selector */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex bg-slate-900 border border-white/10 rounded-xl p-1">
            {[['7', '7 Dias'], ['30', '30 Dias'], ['90', '90 Dias'], ['custom', 'Personalizado']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setRangeMode(val)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  rangeMode === val ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {rangeMode === 'custom' && (
            <div className="flex items-center gap-1.5 animate-fade-in">
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="bg-slate-900 border border-white/10 rounded-xl px-2.5 py-1.5 text-slate-200 outline-none focus:border-emerald-500/30 text-xs"
              />
              <span className="text-slate-600 font-bold">até</span>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="bg-slate-900 border border-white/10 rounded-xl px-2.5 py-1.5 text-slate-200 outline-none focus:border-emerald-500/30 text-xs"
              />
            </div>
          )}

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-xl border border-white/10 bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-4 flex gap-3 text-xs text-red-400 items-center">
            <AlertCircle size={16} className="shrink-0" />
            <p className="font-semibold">{error}</p>
          </div>
        )}

        {/* KPIs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <CardKpi
            title="Total Pedidos"
            value={summary.totalOrders}
            sub="Notas fiscais mineradas"
            icon={ShoppingBag}
            color="blue"
          />
          <CardKpi
            title="Faturamento"
            value={BRL.format(summary.totalRevenue)}
            sub="Total em produtos"
            icon={DollarSign}
            color="emerald"
          />
          <CardKpi
            title="Frete Pago"
            value={BRL.format(summary.totalFreight)}
            sub={`Média: ${summary.totalOrders ? BRL.format(summary.totalFreight / summary.totalOrders) : 'R$ 0,00'} / pedido`}
            icon={Truck}
            color="amber"
          />
          <CardKpi
            title="Custo de Produto"
            value={BRL.format(summary.totalCost)}
            sub="Baseado no Preço de Custo"
            icon={DollarSign}
            color="purple"
          />
          <CardKpi
            title="Lucro Líquido"
            value={BRL.format(summary.totalProfit)}
            sub={`Margem real: ${marginPct.toFixed(1)}%`}
            icon={Percent}
            color={summary.totalProfit >= 0 ? 'emerald' : 'amber'}
          />
        </div>

        {summary.totalOrders === 0 && !loading ? (
          <div className="rounded-2xl border border-white/[0.04] bg-slate-900/20 py-24 px-6 text-center max-w-xl mx-auto flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
              <TrendingUp size={24} />
            </div>
            <div>
              <h3 className="text-slate-300 font-bold text-sm">Nenhum dado capturado ainda</h3>
              <p className="text-slate-500 text-xs mt-2 max-w-sm leading-relaxed">
                Os dados da Inteligência de Vendas são minerados automaticamente no momento em que você abre os detalhes das notas fiscais na aba <strong>Expedir Bling</strong>.
              </p>
            </div>
            <Link
              to="/expedicao/bling"
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all active:scale-95 shadow-lg shadow-emerald-950/20"
            >
              Ir para Expedir Bling
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Tabela de Margem por Estado */}
            <div className="lg:col-span-2 rounded-2xl border border-white/[0.06] bg-slate-900/10 p-5 flex flex-col gap-4">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <MapPin size={14} className="text-emerald-400" />
                Desempenho e Margem por Estado (UF)
              </h2>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-2.5">Estado</th>
                      <th className="py-2.5 text-center">Pedidos</th>
                      <th className="py-2.5 text-right">Faturamento</th>
                      <th className="py-2.5 text-right">Frete</th>
                      <th className="py-2.5 text-right">Custo Prod.</th>
                      <th className="py-2.5 text-right">Lucro real</th>
                      <th className="py-2.5 text-right pr-2">Margem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03] font-medium">
                    {sortedUfData.map((uf) => {
                      const profit = uf.revenue - uf.cost - uf.freight;
                      const margin = uf.revenue ? (profit / uf.revenue) * 100 : 0;
                      return (
                        <tr key={uf.uf} className="hover:bg-white/[0.01] transition-colors">
                          <td className="py-3 font-bold text-slate-300 uppercase">{uf.uf || 'Ignorado'}</td>
                          <td className="py-3 text-center text-slate-400 tabular-nums">{uf.orders}</td>
                          <td className="py-3 text-right text-slate-300 tabular-nums">{BRL.format(uf.revenue)}</td>
                          <td className="py-3 text-right text-amber-500/80 tabular-nums">{BRL.format(uf.freight)}</td>
                          <td className="py-3 text-right text-purple-400/80 tabular-nums">{BRL.format(uf.cost)}</td>
                          <td className={`py-3 text-right tabular-nums ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {BRL.format(profit)}
                          </td>
                          <td className={`py-3 text-right pr-2 font-bold tabular-nums ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {margin.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Performance por Canal (Marketplace) */}
            <div className="rounded-2xl border border-white/[0.06] bg-slate-900/10 p-5 flex flex-col gap-4">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <BarChart3 size={14} className="text-blue-400" />
                Vendas por Canal
              </h2>

              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                    <XAxis dataKey="channel" stroke="#475569" fontSize={9} tickLine={false} />
                    <YAxis stroke="#475569" fontSize={9} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#0f172a', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '12px' }}
                      labelStyle={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                      itemStyle={{ color: '#10b981', fontSize: '11px' }}
                      formatter={(val) => BRL.format(val)}
                    />
                    <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Tabela Resumo do Canal */}
              <div className="flex-1 flex flex-col gap-2 justify-end mt-4">
                {channelData.map(ch => {
                  const profit = ch.revenue - ch.cost - ch.freight;
                  const margin = ch.revenue ? (profit / ch.revenue) * 100 : 0;
                  return (
                    <div key={ch.channel} className="flex items-center justify-between text-xs border-b border-white/5 pb-2">
                      <span className="font-semibold text-slate-400 uppercase">{String(ch.channel).replace('_', ' ')}</span>
                      <div className="text-right">
                        <span className="font-bold text-slate-200">{BRL.format(ch.revenue)}</span>
                        <span className={`block text-[10px] ${profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          Margem: {margin.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sazonalidade por Hora (Matriz de calor / Gráfico linear) */}
            <div className="rounded-2xl border border-white/[0.06] bg-slate-900/10 p-5 flex flex-col gap-4 lg:col-span-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Clock size={14} className="text-amber-400" />
                Vendas por Faixa Horária (Sazonalidade)
              </h2>

              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hourData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" />
                    <XAxis dataKey="label" stroke="#475569" fontSize={9} tickLine={false} />
                    <YAxis stroke="#475569" fontSize={9} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#0f172a', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '12px' }}
                      labelStyle={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                      itemStyle={{ color: '#f59e0b', fontSize: '11px' }}
                    />
                    <Area type="monotone" dataKey="count" name="Pedidos" stroke="#f59e0b" fill="rgba(245,158,11,0.05)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Sazonalidade por Dia da Semana */}
            <div className="rounded-2xl border border-white/[0.06] bg-slate-900/10 p-5 flex flex-col gap-4">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Calendar size={14} className="text-purple-400" />
                Vendas por Dia da Semana
              </h2>

              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekdayData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                    <XAxis dataKey="label" stroke="#475569" fontSize={9} tickLine={false} />
                    <YAxis stroke="#475569" fontSize={9} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#0f172a', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '12px' }}
                      labelStyle={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                      itemStyle={{ color: '#a78bfa', fontSize: '11px' }}
                    />
                    <Bar dataKey="count" name="Pedidos" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
