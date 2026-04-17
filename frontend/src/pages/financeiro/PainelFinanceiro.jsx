import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../utils/getAuthToken';
import { Wifi, WifiOff, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, RefreshCw, Wallet, AlertTriangle } from 'lucide-react';

const MES_NOMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function mesLabel(yyyymm) {
  const [y, m] = yyyymm.split('-');
  return `${MES_NOMES[Number(m) - 1]} ${y}`;
}
function mesAnterior(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function mesSeguinte(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmtBRL(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtPct(v) {
  return `${(v || 0).toFixed(1)}%`;
}

function Skeleton({ h = 'h-20' }) {
  return <div className={`rounded-xl bg-slate-800 animate-pulse ${h}`} />;
}

function KpiCard({ label, valor, sub, cor = 'slate' }) {
  const cores = {
    emerald: 'text-emerald-400',
    red:     'text-red-400',
    blue:    'text-blue-400',
    orange:  'text-orange-400',
    slate:   'text-slate-200',
  };
  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 p-4 flex flex-col gap-1">
      <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      <span className={`text-lg font-bold ${cores[cor]}`}>{valor}</span>
      {sub && <span className="text-xs text-slate-600">{sub}</span>}
    </div>
  );
}

function SecaoLista({ titulo, items, renderItem, vazio = 'Nenhum registro' }) {
  if (!items?.length) return (
    <div className="rounded-xl bg-slate-800 border border-white/5 p-5">
      <h3 className="text-sm font-semibold text-slate-400 mb-3">{titulo}</h3>
      <p className="text-slate-600 text-xs">{vazio}</p>
    </div>
  );
  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 p-5">
      <h3 className="text-sm font-semibold text-slate-400 mb-3">{titulo} <span className="text-slate-600 font-normal">({items.length})</span></h3>
      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
        {items.map(renderItem)}
      </div>
    </div>
  );
}

function parseBRL(str) {
  const clean = String(str).replace(/[R$\s.]/g, '').replace(',', '.');
  const v = parseFloat(clean);
  return isNaN(v) ? 0 : v;
}

function SaldoCaixa({ mes, saidasPendentes }) {
  const chave = `painel_saldo_${mes}`;
  const load  = k => localStorage.getItem(`${chave}_${k}`) || '';

  const [mp,    setMp]    = useState(load('mp'));
  const [banco, setBanco] = useState(load('banco'));
  const [outro, setOutro] = useState(load('outro'));

  useEffect(() => {
    localStorage.setItem(`${chave}_mp`,    mp);
    localStorage.setItem(`${chave}_banco`, banco);
    localStorage.setItem(`${chave}_outro`, outro);
  }, [mp, banco, outro, chave]);

  const saldoTotal  = parseBRL(mp) + parseBRL(banco) + parseBRL(outro);
  const caixaLiq    = saldoTotal - saidasPendentes;
  const positivo    = caixaLiq >= 0;

  const inputCls = "w-full rounded-lg bg-slate-900 border border-white/10 text-slate-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 placeholder-slate-600 [color-scheme:dark]";

  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Wallet size={15} className="text-emerald-400" />
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Saldo em Caixa</h3>
        <span className="text-xs text-slate-600 ml-1">— atualize manualmente</span>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Mercado Pago', val: mp,    set: setMp    },
          { label: 'Banco',        val: banco,  set: setBanco },
          { label: 'Outros',       val: outro,  set: setOutro },
        ].map(({ label, val, set }) => (
          <div key={label}>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">{label}</label>
            <input
              type="number" step="0.01" min="0"
              placeholder="0,00"
              value={val}
              onChange={e => set(e.target.value)}
              className={inputCls}
            />
          </div>
        ))}
      </div>

      {/* Projeção */}
      <div className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${positivo ? 'bg-emerald-900/20 border-emerald-700/30' : 'bg-red-900/20 border-red-700/30'}`}>
        <div className="flex items-center gap-2">
          {positivo
            ? <TrendingUp size={18} className="text-emerald-400 shrink-0" />
            : <AlertTriangle size={18} className="text-red-400 shrink-0" />}
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Caixa líquido projetado</p>
            <p className={`text-xl font-bold ${positivo ? 'text-emerald-400' : 'text-red-400'}`}>{fmtBRL(caixaLiq)}</p>
          </div>
        </div>
        <div className="flex gap-6 text-center text-xs">
          <div>
            <p className="text-slate-500">Saldo total</p>
            <p className="text-slate-200 font-semibold">{fmtBRL(saldoTotal)}</p>
          </div>
          <div>
            <p className="text-slate-500">Saídas pendentes</p>
            <p className="text-orange-400 font-semibold">{fmtBRL(saidasPendentes)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Situação Bling: 1=pendente, 2=pago/recebido, 3=cancelado, 13=parcial
function situacaoLabel(id) {
  const m = { 1: 'Pendente', 2: 'Pago', 3: 'Cancelado', 13: 'Parcial' };
  return m[id] || `${id}`;
}
function situacaoCor(id) {
  if (id === 2)  return 'text-emerald-400';
  if (id === 3)  return 'text-slate-600';
  if (id === 13) return 'text-orange-400';
  return 'text-orange-300';
}

export function PainelFinanceiro() {
  const hoje = mesAtual();
  const [mes, setMes]       = useState(hoje);
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const carregar = useCallback(async (m) => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/api/painel-financeiro?mes=${m}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(mes); }, [mes, carregar]);

  const navAntes  = () => setMes(m => mesAnterior(m));
  const navDepois = () => setMes(m => mesSeguinte(m));

  const resultado = data?.resultado;
  const lucro = resultado?.lucroLiquido ?? 0;

  return (
    <div className="text-slate-100 px-4 py-8 max-w-7xl mx-auto flex-1 overflow-y-auto">

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-100">Painel Financeiro</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              {data?.blingOk
                ? <><Wifi size={12} className="text-emerald-400" /><span className="text-xs text-emerald-400">Bling online</span></>
                : <><WifiOff size={12} className="text-slate-600" /><span className="text-xs text-slate-600">Bling offline</span></>
              }
            </div>
          </div>
        </div>

        {/* Navegação de mês */}
        <div className="flex items-center gap-2">
          <button onClick={navAntes}  className="p-1.5 rounded-lg bg-slate-800 border border-white/10 hover:border-white/20 text-slate-400 hover:text-slate-200 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-medium text-slate-200 min-w-[90px] text-center">{mesLabel(mes)}</span>
          <button onClick={navDepois} disabled={mes >= hoje} className="p-1.5 rounded-lg bg-slate-800 border border-white/10 hover:border-white/20 text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors">
            <ChevronRight size={16} />
          </button>
          <button onClick={() => carregar(mes)} disabled={loading} className="p-1.5 rounded-lg bg-slate-800 border border-white/10 hover:border-white/20 text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors" title="Recarregar">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div className="rounded-xl bg-red-900/20 border border-red-700/40 p-4 text-red-400 text-sm mb-6">
          {error}
          {error.includes('autenticado') && (
            <a href="/bling/auth" className="ml-2 underline hover:text-red-300">Conectar Bling</a>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col gap-5">
          <Skeleton h="h-28" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} h="h-20" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Skeleton h="h-60" />
            <Skeleton h="h-60" />
            <Skeleton h="h-60" />
          </div>
        </div>
      )}

      {/* Conteúdo */}
      {!loading && data && (
        <div className="flex flex-col gap-5">

          {/* Card resultado */}
          <div className={`rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${lucro >= 0 ? 'bg-emerald-900/20 border-emerald-700/40' : 'bg-red-900/20 border-red-700/40'}`}>
            <div className="flex items-center gap-3">
              {lucro >= 0
                ? <TrendingUp size={24} className="text-emerald-400 shrink-0" />
                : <TrendingDown size={24} className="text-red-400 shrink-0" />
              }
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Resultado do mês</p>
                <p className={`text-2xl font-bold ${lucro >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtBRL(lucro)}</p>
                <p className="text-xs text-slate-500">Margem: {fmtPct(resultado?.margemLiquida)}</p>
              </div>
            </div>
            <div className="flex gap-6 text-center">
              <div>
                <p className="text-xs text-slate-500">Receita</p>
                <p className="text-sm font-semibold text-slate-200">{fmtBRL(data.receita.bruta)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Saídas</p>
                <p className="text-sm font-semibold text-slate-200">{fmtBRL(resultado?.totalSaidas)}</p>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Receita ML"    valor={fmtBRL(data.receita.ML)}     cor="emerald" />
            <KpiCard label="Receita Shopee" valor={fmtBRL(data.receita.Shopee)} cor="orange"  />
            <KpiCard label="Despesas locais" valor={fmtBRL(data.despesas?.total)} cor="red" />
            <KpiCard label="Parcelas cartão" valor={fmtBRL(data.parcelas?.total)} cor="blue" />
          </div>

          {/* Saldo em caixa */}
          <SaldoCaixa
            mes={mes}
            saidasPendentes={(data.despesas?.pendente || 0) + (data.parcelas?.pendente || 0)}
          />

          {/* Despesas por categoria */}
          {Object.keys(data.despesas?.porCategoria || {}).length > 0 && (() => {
            const sorted = Object.entries(data.despesas.porCategoria).sort((a, b) => b[1] - a[1]);
            const max = sorted[0]?.[1] || 1;
            return (
              <div className="rounded-xl bg-slate-800 border border-white/5 p-5">
                <h3 className="text-sm font-semibold text-slate-400 mb-4">Despesas por Categoria</h3>
                <div className="flex flex-col gap-2">
                  {sorted.map(([cat, val]) => (
                    <div key={cat} className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 w-36 truncate shrink-0">{cat}</span>
                      <div className="flex-1 bg-slate-700 rounded-full h-1.5">
                        <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${(val / max) * 100}%` }} />
                      </div>
                      <span className="text-xs text-slate-300 w-24 text-right shrink-0">{fmtBRL(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Listas Bling */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <SecaoLista
              titulo="Contas a Receber (Bling)"
              items={data.contasReceber?.itens || []}
              vazio={data.blingOk ? 'Nenhuma conta a receber no mês' : 'Bling offline — conecte para ver dados'}
              renderItem={item => (
                <div key={item.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-white/5 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300 truncate">{item.descricao || '—'}</p>
                    <p className="text-[10px] text-slate-600">{item.vencimento}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-slate-200">{fmtBRL(item.valor)}</p>
                    <p className={`text-[10px] ${situacaoCor(item.situacao)}`}>{situacaoLabel(item.situacao)}</p>
                  </div>
                </div>
              )}
            />
            <SecaoLista
              titulo="Contas a Pagar (Bling)"
              items={data.contasPagarBling?.itens || []}
              vazio={data.blingOk ? 'Nenhuma conta a pagar no mês' : 'Bling offline — conecte para ver dados'}
              renderItem={item => (
                <div key={item.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-white/5 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300 truncate">{item.fornecedor || item.descricao || '—'}</p>
                    <p className="text-[10px] text-slate-600">{item.vencimento}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-slate-200">{fmtBRL(item.valor)}</p>
                    <p className={`text-[10px] ${situacaoCor(item.situacao)}`}>{situacaoLabel(item.situacao)}</p>
                  </div>
                </div>
              )}
            />
          </div>

        </div>
      )}

      {/* Empty state */}
      {!loading && !data && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <span className="text-4xl">📊</span>
          <p className="text-slate-400">Selecione um mês para carregar os dados.</p>
        </div>
      )}

    </div>
  );
}
