/**
 * @file CalculadoraMarketplace.jsx
 * @module financeiro
 * @description Calculadora de precificação para marketplace — cálculo local 100% client-side.
 *   Simula lucro, margem, markup, break-even e cenários de ads em tempo real.
 * @version 1.1.0
 * @date 2026-04-24
 * @changelog
 *   1.1.0 — 2026-04-24 — Layout mobile-first; botão "Usar como preço" no preço ideal; banner de sugestão.
 *   1.0.0 — 2026-04-24 — Criação inicial.
 */

import { useState } from 'react';
import {
  Calculator, RefreshCw, AlertTriangle, TrendingUp,
  DollarSign, Package, Percent, Zap, ArrowUpRight,
} from 'lucide-react';

const fmt = v =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(isFinite(v) ? v : 0);

const fmtPct = v =>
  `${isFinite(v) ? v.toFixed(1) : '0.0'}%`;

const DEFAULTS = {
  precoVenda: '',
  custoProduto: '',
  embalagem: '0.50',
  taxaMarketplace: '11',
  imposto: '7.5',
  marketing: '5',
  peso: '0.5',
  freteFixo: '',
};

function calcularFrete(pesoKg, freteFixo) {
  if (freteFixo !== '' && freteFixo !== null && !isNaN(parseFloat(freteFixo))) {
    return parseFloat(freteFixo);
  }
  const kg = parseFloat(pesoKg) || 0;
  if (kg <= 0.3) return 6.50;
  if (kg <= 0.5) return 8.00;
  if (kg <= 1)   return 12.00;
  if (kg <= 2)   return 18.00;
  return 25.00;
}

function calcular(campos) {
  const precoVenda      = parseFloat(campos.precoVenda)       || 0;
  const custoProduto    = parseFloat(campos.custoProduto)     || 0;
  const custoEmbalagem  = parseFloat(campos.embalagem)        || 0;
  const taxaMktPct      = parseFloat(campos.taxaMarketplace)  || 0;
  const impostoPct      = parseFloat(campos.imposto)          || 0;
  const marketingPct    = parseFloat(campos.marketing)        || 0;
  const pesoKg          = parseFloat(campos.peso)             || 0;

  const frete           = calcularFrete(pesoKg, campos.freteFixo);
  const taxaMarketplace = precoVenda * (taxaMktPct / 100);
  const imposto         = precoVenda * (impostoPct / 100);
  const marketing       = precoVenda * (marketingPct / 100);

  const custoTotal      = custoProduto + custoEmbalagem + taxaMarketplace + frete + imposto + marketing;
  const lucro           = precoVenda - custoTotal;
  const margemPercent   = precoVenda > 0 ? (lucro / precoVenda) * 100 : 0;
  const margemContrib   = precoVenda > 0
    ? ((precoVenda - taxaMarketplace - frete - imposto - marketing) / precoVenda) * 100
    : 0;
  const markup          = custoProduto > 0 ? (lucro / custoProduto) * 100 : 0;

  const custosFixos     = custoProduto + custoEmbalagem + frete;
  const taxasPercentuais = (taxaMktPct + impostoPct + marketingPct) / 100;
  const precoMinimo     = taxasPercentuais < 1 ? custosFixos / (1 - taxasPercentuais) : 0;
  const precoIdeal      = precoMinimo * 1.3;

  let status;
  if      (margemPercent < 10) status = '🔴 Inviável';
  else if (margemPercent < 20) status = '🟡 Atenção';
  else if (margemPercent < 30) status = '🟢 Ok';
  else                         status = '🚀 Excelente';

  return {
    frete, taxaMarketplace, imposto, marketing,
    custoTotal, lucro, margemPercent, margemContrib,
    markup, precoMinimo, precoIdeal, status,
    precoVenda, custoProduto,
  };
}

function InputField({ label, value, onChange, prefix, suffix, placeholder }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-slate-400 text-xs sm:text-sm leading-tight">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || '0'}
          className={[
            'bg-slate-900 border border-white/10 rounded-lg py-2.5 text-white w-full text-sm',
            'focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30',
            'placeholder:text-slate-600',
            prefix ? 'pl-7 pr-3' : suffix ? 'pl-3 pr-8' : 'px-3',
          ].join(' ')}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, highlight, small, action, onAction }) {
  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 p-4 flex flex-col gap-1">
      <span className="text-slate-400 text-xs">{label}</span>
      <span className={[
        'font-bold leading-tight',
        small ? 'text-base' : 'text-xl',
        highlight === 'green'  ? 'text-emerald-400' :
        highlight === 'red'    ? 'text-red-400'     :
        highlight === 'yellow' ? 'text-yellow-400'  :
        'text-white',
      ].join(' ')}>
        {value}
      </span>
      {sub && <span className="text-slate-500 text-xs">{sub}</span>}
      {action && (
        <button
          onClick={onAction}
          className="mt-1 flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors self-start"
        >
          <ArrowUpRight size={12} />
          {action}
        </button>
      )}
    </div>
  );
}

export default function CalculadoraMarketplace() {
  const [campos, setCampos] = useState(DEFAULTS);

  const set = key => val => setCampos(prev => ({ ...prev, [key]: val }));

  const usarPrecoIdeal = () =>
    setCampos(prev => ({ ...prev, precoVenda: String(calcular(prev).precoIdeal.toFixed(2)) }));

  const res = calcular(campos);
  const temPreco      = parseFloat(campos.precoVenda) > 0;
  const temCusto      = parseFloat(campos.custoProduto) > 0;
  const emPrejuizo    = temPreco && res.precoVenda < res.precoMinimo;
  const semPreco      = temCusto && !temPreco;

  const margemHighlight =
    !temPreco ? undefined :
    res.margemPercent < 10 ? 'red' :
    res.margemPercent < 20 ? 'yellow' : 'green';

  const cenarios = [0, 5, 10].map(ads => {
    const r = calcular({ ...campos, marketing: String(ads) });
    return { ads, lucro: r.lucro, margem: r.margemPercent };
  });

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Calculator size={20} className="text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-white">Calculadora de Precificação</h1>
            <p className="text-slate-400 text-xs sm:text-sm">Simule custos e margens para marketplace em tempo real</p>
          </div>
          <button
            onClick={() => setCampos(DEFAULTS)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-white/5 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors text-sm shrink-0"
          >
            <RefreshCw size={14} />
            <span className="hidden sm:inline">Limpar / Nova análise</span>
            <span className="sm:hidden">Limpar</span>
          </button>
        </div>

        {/* Sugestão de preço ideal (sem preço de venda, mas com custo) */}
        {semPreco && res.precoIdeal > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4">
            <div className="flex items-start gap-3 flex-1">
              <TrendingUp size={18} className="text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-emerald-300 font-semibold text-sm">Preço sugerido baseado no seu custo</p>
                <p className="text-emerald-400/70 text-xs mt-0.5">
                  Para uma margem de 30%: <strong className="text-emerald-300">{fmt(res.precoIdeal)}</strong>
                  <span className="ml-1">(mínimo: {fmt(res.precoMinimo)})</span>
                </p>
              </div>
            </div>
            <button
              onClick={usarPrecoIdeal}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold transition-colors shrink-0"
            >
              <ArrowUpRight size={14} />
              Usar este preço
            </button>
          </div>
        )}

        {/* Alerta de prejuízo */}
        {emPrejuizo && (
          <div className="flex items-start gap-3 rounded-xl bg-red-500/10 border border-red-500/20 p-4">
            <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-300 font-semibold text-sm">Produto dá prejuízo neste preço</p>
              <p className="text-red-400/70 text-xs mt-0.5">
                Preço mínimo para cobrir todos os custos: <strong className="text-red-300">{fmt(res.precoMinimo)}</strong>
              </p>
            </div>
          </div>
        )}

        {/* Layout 2 colunas no desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Coluna esquerda — Inputs */}
          <div className="rounded-xl bg-slate-800 border border-white/5 p-4 sm:p-5 space-y-4">

            <div className="flex items-center gap-2">
              <DollarSign size={15} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-300">Dados do Produto</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InputField label="Preço de Venda" value={campos.precoVenda}   onChange={set('precoVenda')}   prefix="R$" placeholder="0,00" />
              <InputField label="Custo do Produto" value={campos.custoProduto} onChange={set('custoProduto')} prefix="R$" placeholder="0,00" />
              <InputField label="Embalagem" value={campos.embalagem} onChange={set('embalagem')} prefix="R$" />
              <InputField label="Peso" value={campos.peso} onChange={set('peso')} suffix="kg" />
            </div>

            <div className="h-px bg-white/5" />

            <div className="flex items-center gap-2">
              <Percent size={15} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-300">Taxas e Impostos</h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <InputField label="Marketplace" value={campos.taxaMarketplace} onChange={set('taxaMarketplace')} suffix="%" />
              <InputField label="Imposto" value={campos.imposto} onChange={set('imposto')} suffix="%" />
              <InputField label="Marketing/Ads" value={campos.marketing} onChange={set('marketing')} suffix="%" />
            </div>

            <div className="h-px bg-white/5" />

            <div className="flex items-center gap-2">
              <Package size={15} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-300">Frete</h2>
            </div>
            <div className="space-y-1">
              <InputField
                label="Frete fixo — vazio = simulação automática por peso"
                value={campos.freteFixo}
                onChange={set('freteFixo')}
                prefix="R$"
                placeholder="automático"
              />
              {campos.freteFixo === '' && (
                <p className="text-slate-500 text-xs">
                  Frete estimado para {campos.peso || '0'} kg:{' '}
                  <span className="text-slate-400 font-medium">{fmt(res.frete)}</span>
                </p>
              )}
            </div>
          </div>

          {/* Coluna direita — Resultados */}
          <div className="space-y-4">

            {/* Breakdown de custos */}
            <div className="rounded-xl bg-slate-800 border border-white/5 p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={15} className="text-emerald-400" />
                <h2 className="text-sm font-semibold text-slate-300">Breakdown de Custos</h2>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Custo do produto',  val: res.custoProduto                     },
                  { label: 'Embalagem',          val: parseFloat(campos.embalagem) || 0   },
                  { label: 'Taxa marketplace',   val: res.taxaMarketplace                  },
                  { label: 'Frete',              val: res.frete                            },
                  { label: 'Imposto',            val: res.imposto                          },
                  { label: 'Marketing/Ads',      val: res.marketing                        },
                ].map(({ label, val }) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">{label}</span>
                    <span className="text-slate-300 font-medium">{fmt(val)}</span>
                  </div>
                ))}
                <div className="h-px bg-white/5 my-1" />
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className="text-slate-300">Custo total</span>
                  <span className="text-white">{fmt(res.custoTotal)}</span>
                </div>
              </div>
            </div>

            {/* KPIs principais */}
            <div className="grid grid-cols-2 gap-3">
              <KpiCard
                label="Lucro por unidade"
                value={fmt(res.lucro)}
                highlight={temPreco ? (res.lucro >= 0 ? 'green' : 'red') : undefined}
              />
              <KpiCard
                label="Margem líquida"
                value={fmtPct(res.margemPercent)}
                sub={temPreco ? res.status : undefined}
                highlight={margemHighlight}
              />
              <KpiCard
                label="Margem de contribuição"
                value={fmtPct(res.margemContrib)}
                highlight={margemHighlight}
              />
              <KpiCard
                label="Markup sobre custo"
                value={fmtPct(res.markup)}
                highlight={temPreco && res.markup > 0 ? 'green' : undefined}
              />
              <KpiCard
                label="Break-even (preço mínimo)"
                value={fmt(res.precoMinimo)}
                small
              />
              <KpiCard
                label="Preço ideal (margem 30%)"
                value={fmt(res.precoIdeal)}
                highlight="green"
                small
                action="Usar como preço"
                onAction={usarPrecoIdeal}
              />
            </div>
          </div>
        </div>

        {/* Simulação de cenários */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Zap size={15} className="text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Simulação — Investimento em Ads</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {cenarios.map(({ ads, lucro, margem }) => {
              const borderBg =
                margem < 10 ? 'border-red-500/20 bg-red-500/5' :
                margem < 20 ? 'border-yellow-500/20 bg-yellow-500/5' :
                'border-emerald-500/20 bg-emerald-500/5';
              const lucroColor =
                lucro < 0   ? 'text-red-400' :
                margem < 20 ? 'text-yellow-400' :
                'text-emerald-400';
              const margemColor =
                margem < 10 ? 'text-red-400' :
                margem < 20 ? 'text-yellow-400' :
                'text-emerald-400';
              const isAtual = String(ads) === String(parseFloat(campos.marketing) || 0);
              return (
                <div
                  key={ads}
                  className={[
                    'rounded-xl border p-4 sm:p-5 relative',
                    borderBg,
                    isAtual ? 'ring-1 ring-emerald-500/40' : '',
                  ].join(' ')}
                >
                  {isAtual && (
                    <span className="absolute top-3 right-3 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      atual
                    </span>
                  )}
                  <p className="text-slate-400 text-xs mb-3">
                    Ads: <span className="text-white font-bold">{ads}%</span>
                  </p>
                  <div className="flex sm:flex-col gap-6 sm:gap-2">
                    <div>
                      <p className="text-slate-500 text-xs">Lucro</p>
                      <p className={`text-xl font-bold ${lucroColor}`}>{fmt(lucro)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">Margem</p>
                      <p className={`text-lg font-bold ${margemColor}`}>{fmtPct(margem)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
