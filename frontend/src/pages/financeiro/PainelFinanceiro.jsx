/**
 * @file PainelFinanceiro.jsx
 * @module financeiro
 * @description Painel financeiro real: receita Bling (NF-e + contasreceber)
 *              + despesas/parcelas Firestore = resultado real do mês.
 * @version 2.0.0
 * @date 2026-04-17
 */

import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, CreditCard,
  ShoppingCart, AlertCircle, RefreshCw, ChevronLeft,
  ChevronRight, Loader2, CheckCircle2, Clock, Wifi, WifiOff,
} from 'lucide-react';
import { apiFetch } from '../../utils/getAuthToken';
import { brl } from '../../utils/financeiroUtils';

// ─── helpers ──────────────────────────────────────────────────────────────────

function mesLabel(mesStr) {
  const [ano, mm] = mesStr.split('-');
  const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${MESES[Number(mm) - 1]} ${ano}`;
}

function pct(val, total) {
  if (!total) return '0%';
  return `${(val / total * 100).toFixed(1)}%`;
}

function mesAnterior(mes) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function mesSeguinte(mes) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── sub-componentes ──────────────────────────────────────────────────────────

function KpiCard({ label, valor, sub, cor = 'slate', Icone, pctVal }) {
  const clr = {
    green:  'bg-emerald-900/20 border-emerald-700/30 text-emerald-400',
    red:    'bg-red-900/20 border-red-700/30 text-red-400',
    blue:   'bg-blue-900/20 border-blue-700/30 text-blue-400',
    amber:  'bg-amber-900/20 border-amber-700/30 text-amber-400',
    purple: 'bg-purple-900/20 border-purple-700/30 text-purple-400',
    slate:  'bg-slate-800 border-white/[0.06] text-slate-300',
  };
  return (
    <div className={`rounded-xl p-4 border flex flex-col gap-1 ${clr[cor]}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</span>
        {Icone && <Icone size={14} className="opacity-50" />}
      </div>
      <span className="text-2xl font-black tabular-nums">{brl(valor)}</span>
      {(sub || pctVal) && (
        <span className="text-xs opacity-60">{pctVal ? `${pctVal} da receita` : sub}</span>
      )}
    </div>
  );
}

function BarraHorizontal({ label, valor, total, cor }) {
  const pctNum = total > 0 ? (valor / total * 100) : 0;
  const corBar = { ML: 'bg-yellow-400', Shopee: 'bg-orange-400', outros: 'bg-slate-500',
                   pago: 'bg-emerald-500', pendente: 'bg-amber-400', vencido: 'bg-red-500' };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300 font-medium">{brl(valor)} <span className="text-slate-600">({pctNum.toFixed(0)}%)</span></span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${corBar[cor] || 'bg-slate-500'} transition-all`}
          style={{ width: `${Math.min(pctNum, 100)}%` }} />
      </div>
    </div>
  );
}

function SecaoCard({ titulo, children }) {
  return (
    <div className="rounded-xl bg-slate-800/50 border border-white/[0.06] p-4 flex flex-col gap-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{titulo}</h3>
      {children}
    </div>
  );
}

function Skeleton() {
  return <div className="h-28 rounded-xl bg-slate-800 border border-white/5 animate-pulse" />;
}

// ─── componente principal ──────────────────────────────────────────────────────

export function PainelFinanceiro() {
  const [mes,     setMes]     = useState(mesAtual());
  const [dados,   setDados]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro,    setErro]    = useState(null);

  const carregarDados = useCallback(async (m) => {
    setLoading(true);
    setErro(null);
    try {
      const r = await apiFetch(`/api/painel-financeiro?mes=${m}`);
      if (!r.ok && r.status) throw new Error(`Erro ${r.status}`);
      const data = await (r.json ? r.json() : r);
      setDados(data);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregarDados(mes); }, [mes, carregarDados]);

  const isAtual = mes === mesAtual();

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5 pb-10">

      {/* ── Header: navegação de mês ──────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 bg-slate-800 border border-white/10 rounded-xl px-3 py-2">
          <button onClick={() => setMes(mesAnterior(mes))}
            className="p-0.5 text-slate-400 hover:text-white transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-bold text-slate-200 min-w-[90px] text-center">
            {mesLabel(mes)}
          </span>
          <button onClick={() => setMes(mesSeguinte(mes))} disabled={isAtual}
            className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {dados && (
            <span className={`flex items-center gap-1 text-xs ${dados.blingOk ? 'text-emerald-400' : 'text-amber-400'}`}>
              {dados.blingOk ? <Wifi size={12} /> : <WifiOff size={12} />}
              {dados.blingOk ? 'Bling conectado' : 'Bling offline'}
            </span>
          )}
          <button onClick={() => carregarDados(mes)} disabled={loading}
            className="p-2 rounded-lg bg-slate-800 border border-white/10 text-slate-400
              hover:text-white transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {erro && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-900/20 border border-red-700/30 text-red-400 text-sm">
          <AlertCircle size={15} /> {erro}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => <Skeleton key={i} />)}
        </div>
      ) : dados ? (
        <>
          {/* ── Card resultado principal ─────────────────────────────────── */}
          <div className={`rounded-2xl p-6 border flex flex-col gap-1 ${
            dados.resultado.lucroLiquido >= 0
              ? 'bg-emerald-900/20 border-emerald-700/30'
              : 'bg-red-900/20 border-red-700/30'
          }`}>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-60">
              {dados.resultado.lucroLiquido >= 0
                ? <TrendingUp size={14} className="text-emerald-400" />
                : <TrendingDown size={14} className="text-red-400" />}
              Resultado de {mesLabel(mes)}
            </div>
            <span className={`text-4xl font-black tabular-nums ${
              dados.resultado.lucroLiquido >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {brl(dados.resultado.lucroLiquido)}
            </span>
            <span className="text-sm opacity-60">
              Margem: {pct(dados.resultado.lucroLiquido, dados.receita.bruta)} &nbsp;·&nbsp;
              Receita: {brl(dados.receita.bruta)} &nbsp;·&nbsp;
              Saídas: {brl(dados.resultado.totalSaidas)}
            </span>
          </div>

          {/* ── KPIs principais ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Receita Bruta"   valor={dados.receita.bruta}
              Icone={TrendingUp}  cor="green"
              pctVal={pct(dados.receita.bruta, dados.receita.bruta)} />
            <KpiCard label="Recebido (Bling)" valor={dados.contasReceber.recebido}
              Icone={CheckCircle2} cor="blue"
              sub={`Pendente: ${brl(dados.contasReceber.pendente)}`} />
            <KpiCard label="Despesas locais" valor={dados.despesas.total}
              Icone={ShoppingCart} cor="amber"
              pctVal={pct(dados.despesas.total, dados.receita.bruta)} />
            <KpiCard label="Parcelas cartão" valor={dados.parcelas.total}
              Icone={CreditCard} cor="purple"
              sub={`Pago: ${brl(dados.parcelas.pago)} · Pendente: ${brl(dados.parcelas.pendente)}`} />
          </div>

          {/* ── Detalhamento ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Receita por marketplace */}
            <SecaoCard titulo="Receita por Canal">
              <BarraHorizontal label="Mercado Livre" valor={dados.receita.ML}
                total={dados.receita.bruta} cor="ML" />
              <BarraHorizontal label="Shopee"        valor={dados.receita.Shopee}
                total={dados.receita.bruta} cor="Shopee" />
              <BarraHorizontal label="Outros"        valor={dados.receita.outros}
                total={dados.receita.bruta} cor="outros" />
            </SecaoCard>

            {/* Contas a receber Bling */}
            <SecaoCard titulo="Contas a Receber (Bling)">
              <BarraHorizontal label="Recebido"  valor={dados.contasReceber.recebido}
                total={dados.contasReceber.recebido + dados.contasReceber.pendente + dados.contasReceber.vencido}
                cor="pago" />
              <BarraHorizontal label="Pendente"  valor={dados.contasReceber.pendente}
                total={dados.contasReceber.recebido + dados.contasReceber.pendente + dados.contasReceber.vencido}
                cor="pendente" />
              {dados.contasReceber.vencido > 0 && (
                <BarraHorizontal label="Vencido" valor={dados.contasReceber.vencido}
                  total={dados.contasReceber.recebido + dados.contasReceber.pendente + dados.contasReceber.vencido}
                  cor="vencido" />
              )}
              {dados.contasReceber.recebido === 0 && dados.contasReceber.pendente === 0 && (
                <p className="text-xs text-slate-600 text-center py-2">Sem dados de contas a receber</p>
              )}
            </SecaoCard>

            {/* Contas a pagar Bling */}
            <SecaoCard titulo="Contas a Pagar (Bling)">
              <BarraHorizontal label="Pago"     valor={dados.contasPagarBling.pago}
                total={dados.contasPagarBling.pago + dados.contasPagarBling.pendente + dados.contasPagarBling.vencido}
                cor="pago" />
              <BarraHorizontal label="Pendente" valor={dados.contasPagarBling.pendente}
                total={dados.contasPagarBling.pago + dados.contasPagarBling.pendente + dados.contasPagarBling.vencido}
                cor="pendente" />
              {dados.contasPagarBling.vencido > 0 && (
                <BarraHorizontal label="Vencido" valor={dados.contasPagarBling.vencido}
                  total={dados.contasPagarBling.pago + dados.contasPagarBling.pendente + dados.contasPagarBling.vencido}
                  cor="vencido" />
              )}
              {dados.contasPagarBling.pago === 0 && dados.contasPagarBling.pendente === 0 && (
                <p className="text-xs text-slate-600 text-center py-2">Sem contas a pagar registradas no Bling</p>
              )}
            </SecaoCard>
          </div>

          {/* ── Despesas por categoria ───────────────────────────────────── */}
          {Object.keys(dados.despesas.porCategoria).length > 0 && (
            <SecaoCard titulo="Despesas por Categoria">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(dados.despesas.porCategoria)
                  .sort(([,a],[,b]) => b - a)
                  .map(([cat, val]) => (
                    <div key={cat} className="flex justify-between items-center py-1.5 border-b border-white/[0.04]">
                      <span className="text-xs text-slate-400 truncate">{cat}</span>
                      <div className="text-right shrink-0 ml-4">
                        <span className="text-xs font-semibold text-slate-200">{brl(val)}</span>
                        <span className="text-[10px] text-slate-600 ml-1">
                          {pct(val, dados.despesas.total)}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </SecaoCard>
          )}
        </>
      ) : null}
    </div>
  );
}
