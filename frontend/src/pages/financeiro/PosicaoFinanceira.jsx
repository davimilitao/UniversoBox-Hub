/**
 * @file PosicaoFinanceira.jsx
 * @description Posição Financeira: Ativos vs Passivos com visão de caixa real.
 *              Ativos  = Caixa (banco/MP) + Estoque + A Receber (DRE)
 *              Passivos = Despesas pendentes + Parcelas pendentes
 *              Posição Líquida = Ativos − Passivos
 */
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../utils/getAuthToken';
import { ImportarEstoque } from './ImportarEstoque';
import {
  Wallet, Package, TrendingDown, TrendingUp,
  RefreshCw, AlertTriangle, Clock, LayoutDashboard, Upload,
  ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Skeleton } from '../../components/ui';

const BRL  = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NUM  = new Intl.NumberFormat('pt-BR');
const PERC = v => `${((v || 0) * 100).toFixed(1)}%`;

function diasAtras(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'hoje';
  if (d === 1) return 'ontem';
  return `há ${d} dias`;
}


// Lê saldo do caixa do localStorage (mesmo padrão do PainelFinanceiro)
function lerSaldoCaixa(mes) {
  const mp     = parseFloat(localStorage.getItem(`painel_saldo_${mes}_mp`)    || '0') || 0;
  const banco  = parseFloat(localStorage.getItem(`painel_saldo_${mes}_banco`) || '0') || 0;
  const outros = parseFloat(localStorage.getItem(`painel_saldo_${mes}_outros`)|| '0') || 0;
  return { mp, banco, outros, total: mp + banco + outros };
}

function salvarSaldo(mes, campo, valor) {
  localStorage.setItem(`painel_saldo_${mes}_${campo}`, valor);
}

// ── Bloco de item de balanço ─────────────────────────────────────────────────
function LinhaSaldo({ label, valor, sub, cor = 'slate', icon: Icon, semDados }) {
  const cores = {
    emerald: 'text-emerald-400',
    red:     'text-red-400',
    violet:  'text-violet-400',
    blue:    'text-blue-400',
    orange:  'text-orange-400',
    slate:   'text-slate-300',
  };
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={14} className={`${cores[cor]} shrink-0`} />}
        <div>
          <span className="text-sm text-slate-300">{label}</span>
          {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
        </div>
      </div>
      <span className={`text-sm font-semibold tabular-nums ${semDados ? 'text-slate-600 italic' : cores[cor]}`}>
        {semDados ? '—' : BRL.format(valor)}
      </span>
    </div>
  );
}

// ── Seção colapsável (Ativos / Passivos) ────────────────────────────────────
function Secao({ titulo, total, cor, children }) {
  const [aberta, setAberta] = useState(true);
  const ePos = cor === 'emerald';
  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 overflow-hidden">
      <button
        onClick={() => setAberta(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          {ePos
            ? <ArrowUpRight size={16} className="text-emerald-400" />
            : <ArrowDownRight size={16} className="text-red-400" />
          }
          <span className="text-sm font-semibold text-slate-200">{titulo}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-base font-bold tabular-nums ${ePos ? 'text-emerald-400' : 'text-red-400'}`}>
            {BRL.format(total)}
          </span>
          {aberta ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
        </div>
      </button>
      {aberta && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

// ── Inputs de caixa ──────────────────────────────────────────────────────────
function InputCaixa({ label, campo, mes, valor, onChange }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-sm text-slate-400">{label}</span>
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-600">R$</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={valor || ''}
          placeholder="0,00"
          onChange={e => {
            const v = parseFloat(e.target.value) || 0;
            salvarSaldo(mes, campo, v);
            onChange(campo, v);
          }}
          className="w-28 bg-slate-700/60 border border-white/10 rounded-lg px-2 py-1 text-right text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 tabular-nums"
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export function PosicaoFinanceira() {
  const [aba, setAba] = useState('posicao'); // 'posicao' | 'estoque'

  const mesAtual = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  // Dados externos
  const [estoque,    setEstoque]    = useState(null);
  const [dreData,    setDreData]    = useState(null);
  const [despesas,   setDespesas]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [erro,       setErro]       = useState(null);

  // Caixa (localStorage)
  const [caixa, setCaixa] = useState(() => lerSaldoCaixa(mesAtual));

  const atualizarCaixa = (campo, valor) => {
    setCaixa(prev => ({ ...prev, [campo]: valor, total: lerSaldoCaixa(mesAtual).total + (valor - (prev[campo] || 0)) }));
  };

  // Recalcula total quando qualquer campo muda
  const totalCaixa = caixa.mp + caixa.banco + caixa.outros;

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [resEstoque, resDRE] = await Promise.all([
        apiFetch('/api/fin-estoque'),
        apiFetch(`/api/fin-dre?de=${mesAtual}&ate=${mesAtual}`),
      ]);

      if (resEstoque.ok) {
        const j = await resEstoque.json();
        setEstoque(j.dados);
      }
      if (resDRE.ok) {
        const j = await resDRE.json();
        setDreData(j.items?.[0] || null);
        // Despesas vêm no primeiro item — já temos despesasCategorias
      }
    } catch(e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [mesAtual]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Cálculos ──────────────────────────────────────────────────────────────

  const totalEstoque   = estoque?.totalEstoque   || 0;
  const aReceber       = dreData?.receitaBruta    || 0;  // proxy: receita bruta do mês
  const totalAtivos    = totalCaixa + totalEstoque;      // A Receber é informativo apenas

  const despOpFin      = dreData ? (dreData.despesasOperacionais + dreData.despesaFinanceira) : 0;
  const totalPassivos  = despOpFin + (dreData?.irCsll || 0);

  const posicaoLiquida = totalAtivos - totalPassivos;
  const cobertura      = totalPassivos > 0 ? totalAtivos / totalPassivos : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      {/* Header */}
      <div className="px-6 pt-8 pb-5 border-b border-white/5">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-100">Posição Financeira</h1>
            <p className="text-xs text-slate-500 mt-0.5">Ativos × Passivos — visão consolidada do mês</p>
          </div>
          <button
            onClick={carregar}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto mt-5 flex gap-1">
          {[
            { id: 'posicao', label: 'Posição', Icon: LayoutDashboard },
            { id: 'estoque', label: 'Importar Estoque', Icon: Upload },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all
                ${aba === id
                  ? 'bg-slate-700 text-slate-100 shadow'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 pt-6">

        {aba === 'estoque' && (
          <ImportarEstoque onImportado={() => { setAba('posicao'); carregar(); }} />
        )}

        {aba === 'posicao' && (
          <>
            {erro && (
              <div className="rounded-xl bg-red-900/20 border border-red-700/40 p-4 flex items-center gap-3 mb-5">
                <AlertTriangle size={15} className="text-red-400 shrink-0" />
                <p className="text-sm text-red-300">{erro}</p>
              </div>
            )}

            {loading
              ? <div className="flex flex-col gap-4">
                  <Skeleton h="h-28" />
                  <Skeleton h="h-40" />
                  <Skeleton h="h-40" />
                </div>
              : (
                <div className="flex flex-col gap-5">

                  {/* KPI Posição Líquida */}
                  <div className={`rounded-2xl border p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4
                    ${posicaoLiquida >= 0
                      ? 'bg-emerald-900/20 border-emerald-700/30'
                      : 'bg-red-900/20 border-red-700/30'}`}
                  >
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Posição Líquida</p>
                      <p className={`text-3xl font-bold tabular-nums ${posicaoLiquida >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {BRL.format(posicaoLiquida)}
                      </p>
                      <p className="text-xs text-slate-600 mt-1">Ativos − Passivos · {mesAtual}</p>
                    </div>
                    <div className="flex flex-col sm:items-end gap-1">
                      {cobertura !== null && (
                        <div className="text-right">
                          <p className="text-xs text-slate-500">Cobertura</p>
                          <p className={`text-lg font-semibold ${cobertura >= 1.5 ? 'text-emerald-400' : cobertura >= 1 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {cobertura.toFixed(2)}×
                          </p>
                        </div>
                      )}
                      <div className="flex gap-4 sm:justify-end">
                        <div className="text-right">
                          <p className="text-[10px] text-slate-600">Total Ativos</p>
                          <p className="text-sm font-semibold text-emerald-400">{BRL.format(totalAtivos)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-600">Total Passivos</p>
                          <p className="text-sm font-semibold text-red-400">{BRL.format(totalPassivos)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ATIVOS */}
                  <Secao titulo="Ativos" total={totalAtivos} cor="emerald">
                    {/* Caixa — inputs editáveis */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Caixa Disponível</p>
                        <span className="text-xs font-semibold text-emerald-400 tabular-nums">{BRL.format(totalCaixa)}</span>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg px-3 py-1">
                        <InputCaixa label="Mercado Pago" campo="mp"     mes={mesAtual} valor={caixa.mp}     onChange={atualizarCaixa} />
                        <InputCaixa label="Banco"        campo="banco"  mes={mesAtual} valor={caixa.banco}  onChange={atualizarCaixa} />
                        <InputCaixa label="Outros"       campo="outros" mes={mesAtual} valor={caixa.outros} onChange={atualizarCaixa} />
                      </div>
                    </div>

                    {/* Estoque */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Estoque</p>
                        {estoque?.importadoEm && (
                          <span className="text-[10px] text-slate-600">
                            <Clock size={9} className="inline mr-1" />
                            {diasAtras(estoque.importadoEm)}
                          </span>
                        )}
                      </div>
                      <div className="bg-slate-900/50 rounded-lg px-3 py-1">
                        <LinhaSaldo
                          label="Valor total em estoque"
                          sub={estoque ? `${NUM.format(estoque.totalItens)} itens · ${NUM.format(estoque.totalQuantidade)} unidades` : undefined}
                          valor={totalEstoque}
                          cor="violet"
                          icon={Package}
                          semDados={!estoque}
                        />
                        {!estoque && (
                          <p className="text-xs text-slate-600 pb-2">
                            Importe o CSV do estoque na aba{' '}
                            <button className="text-violet-400 underline" onClick={() => setAba('estoque')}>Importar Estoque</button>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* A Receber (informativo) */}
                    {dreData && !dreData.semDados && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-slate-500 uppercase tracking-wider font-medium flex items-center gap-1">
                            A Receber <span className="text-slate-700 normal-case font-normal">(referência DRE)</span>
                          </p>
                        </div>
                        <div className="bg-slate-900/50 rounded-lg px-3 py-1">
                          <LinhaSaldo
                            label="Receita Bruta (DRE)"
                            sub="Faturamento do mês — não necessariamente recebido"
                            valor={dreData.receitaBruta}
                            cor="blue"
                            icon={TrendingUp}
                          />
                        </div>
                      </div>
                    )}
                  </Secao>

                  {/* PASSIVOS */}
                  <Secao titulo="Passivos" total={totalPassivos} cor="red">
                    {dreData && !dreData.semDados ? (
                      <div className="bg-slate-900/50 rounded-lg px-3 py-1">
                        <LinhaSaldo
                          label="Despesas Operacionais"
                          sub="DRE do mês"
                          valor={dreData.despesasOperacionais}
                          cor="red"
                          icon={TrendingDown}
                        />
                        <LinhaSaldo
                          label="Despesas Financeiras"
                          sub="Taxas, juros, parcelamentos"
                          valor={dreData.despesaFinanceira}
                          cor="orange"
                          icon={TrendingDown}
                        />
                        {dreData.irCsll > 0 && (
                          <LinhaSaldo
                            label="IR + CSLL"
                            valor={dreData.irCsll}
                            cor="orange"
                            icon={TrendingDown}
                          />
                        )}
                      </div>
                    ) : (
                      <div className="bg-slate-900/50 rounded-lg px-3 py-3 text-center">
                        <p className="text-xs text-slate-600">
                          Sem dados de DRE para {mesAtual}.{' '}
                          <a href="/financeiro/dre" className="text-blue-400 underline">Importe o DRE</a>{' '}
                          para ver os passivos.
                        </p>
                      </div>
                    )}
                  </Secao>

                  {/* Nota de rodapé */}
                  <p className="text-[10px] text-slate-700 text-center pb-2">
                    Caixa Disponível salvo localmente no navegador · Estoque e DRE via importação CSV do Bling
                  </p>

                </div>
              )
            }
          </>
        )}
      </div>
    </div>
  );
}
