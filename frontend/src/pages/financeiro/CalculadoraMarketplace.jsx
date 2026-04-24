/**
 * @file CalculadoraMarketplace.jsx
 * @module financeiro
 * @description Calculadora de precificação multi-marketplace — cálculo local 100% client-side.
 *   Suporta ML Clássico/Premium/Prata, Shopee e modo Manual.
 *   Usa peso cúbico (A×L×C/6000) vs físico para frete ML/Shopee.
 *   Busca por SKU pré-preenche dados do catálogo (precoCusto, preco, weight, dimensões).
 * @version 1.3.0
 * @date 2026-04-24
 * @changelog
 *   1.3.0 — 2026-04-24 — Seletor de marketplace; tabelas de frete ML/Shopee; peso cúbico.
 *   1.2.0 — 2026-04-24 — Busca por SKU via API; auto-load por ?sku= na URL.
 *   1.1.0 — 2026-04-24 — Layout mobile-first; botão "Usar como preço"; banner de sugestão.
 *   1.0.0 — 2026-04-24 — Criação inicial.
 */

import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calculator, RefreshCw, AlertTriangle, TrendingUp,
  DollarSign, Package, Percent, Zap, ArrowUpRight,
  Search, X, CheckCircle, Ruler,
} from 'lucide-react';
import { apiFetch } from '../../utils/getAuthToken';

// ─── Formatação ───────────────────────────────────────────────────────────────
const fmt    = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(isFinite(v) ? v : 0);
const fmtPct = v => `${isFinite(v) ? v.toFixed(1) : '0.0'}%`;
const fmtKg  = v => `${isFinite(v) && v > 0 ? v.toFixed(3) : '—'} kg`;

// ─── Perfis de Marketplace ────────────────────────────────────────────────────
const PROFILES = {
  ml_classico: { label: 'ML Clássico', taxa: 11,   freteMode: 'ml',     cor: 'yellow' },
  ml_prata:    { label: 'ML Prata',    taxa: 13.5,  freteMode: 'ml',     cor: 'yellow' },
  ml_premium:  { label: 'ML Premium',  taxa: 16.5,  freteMode: 'ml',     cor: 'yellow' },
  shopee:      { label: 'Shopee',      taxa: 12,    freteMode: 'shopee', cor: 'orange' },
  manual:      { label: 'Manual',      taxa: 11,    freteMode: 'manual', cor: 'slate'  },
};

const PROFILE_ORDER = ['ml_classico', 'ml_prata', 'ml_premium', 'shopee', 'manual'];

// ─── Tabelas de Frete ─────────────────────────────────────────────────────────
// Mercado Livre 2026 — frete grátis pago pelo vendedor, sem desconto de reputação
function freteML(kg) {
  if (kg <= 0.3)  return 6.55;
  if (kg <= 0.5)  return 9.00;
  if (kg <= 1)    return 13.00;
  if (kg <= 2)    return 17.50;
  if (kg <= 3)    return 21.00;
  if (kg <= 5)    return 26.50;
  if (kg <= 7)    return 33.00;
  if (kg <= 10)   return 41.00;
  if (kg <= 15)   return 55.00;
  if (kg <= 20)   return 70.00;
  return 70 + Math.ceil((kg - 20) / 5) * 12;
}

// Shopee 2026 — estimativa base sem subsídio de cupom
function freteShopee(kg) {
  if (kg <= 0.3)  return 5.00;
  if (kg <= 0.5)  return 7.00;
  if (kg <= 1)    return 10.50;
  if (kg <= 2)    return 15.00;
  if (kg <= 5)    return 23.00;
  if (kg <= 10)   return 35.00;
  return 35 + Math.ceil((kg - 10) / 5) * 8;
}

function calcularFrete(campos) {
  if (campos.freteFixo !== '' && !isNaN(parseFloat(campos.freteFixo))) {
    return { frete: parseFloat(campos.freteFixo), pesoEfetivo: null, pesoCubado: null };
  }

  const pesoFisico = parseFloat(campos.peso) || 0;
  const profile    = PROFILES[campos.marketplace] || PROFILES.ml_classico;
  const a = parseFloat(campos.altura)     || 0;
  const l = parseFloat(campos.largura)    || 0;
  const c = parseFloat(campos.comprimento)|| 0;
  const pesoCubado   = (a * l * c) / 6000;
  const pesoEfetivo  = (profile.freteMode !== 'manual' && pesoCubado > 0)
    ? Math.max(pesoFisico, pesoCubado)
    : pesoFisico;

  let frete;
  if      (profile.freteMode === 'ml')     frete = freteML(pesoEfetivo);
  else if (profile.freteMode === 'shopee') frete = freteShopee(pesoEfetivo);
  else {
    // manual — tabela genérica simples
    const kg = pesoFisico;
    frete = kg <= 0.3 ? 6.50 : kg <= 0.5 ? 8.00 : kg <= 1 ? 12.00 : kg <= 2 ? 18.00 : 25.00;
  }

  return { frete, pesoEfetivo, pesoCubado: pesoCubado > 0 ? pesoCubado : null };
}

// ─── Motor de cálculo ─────────────────────────────────────────────────────────
function calcular(campos) {
  const precoVenda     = parseFloat(campos.precoVenda)      || 0;
  const custoProduto   = parseFloat(campos.custoProduto)    || 0;
  const custoEmbalagem = parseFloat(campos.embalagem)       || 0;
  const taxaMktPct     = parseFloat(campos.taxaMarketplace) || 0;
  const impostoPct     = parseFloat(campos.imposto)         || 0;
  const marketingPct   = parseFloat(campos.marketing)       || 0;

  const { frete, pesoEfetivo, pesoCubado } = calcularFrete(campos);
  const taxaMarketplace = precoVenda * (taxaMktPct / 100);
  const imposto         = precoVenda * (impostoPct / 100);
  const marketing       = precoVenda * (marketingPct / 100);

  const custoTotal    = custoProduto + custoEmbalagem + taxaMarketplace + frete + imposto + marketing;
  const lucro         = precoVenda - custoTotal;
  const margemPercent = precoVenda > 0 ? (lucro / precoVenda) * 100 : 0;
  const margemContrib = precoVenda > 0
    ? ((precoVenda - taxaMarketplace - frete - imposto - marketing) / precoVenda) * 100 : 0;
  const markup        = custoProduto > 0 ? (lucro / custoProduto) * 100 : 0;

  const custosFixos      = custoProduto + custoEmbalagem + frete;
  const taxasPercentuais = (taxaMktPct + impostoPct + marketingPct) / 100;
  const precoMinimo      = taxasPercentuais < 1 ? custosFixos / (1 - taxasPercentuais) : 0;
  const precoIdeal       = precoMinimo * 1.3;

  const status =
    margemPercent < 10 ? '🔴 Inviável' :
    margemPercent < 20 ? '🟡 Atenção'  :
    margemPercent < 30 ? '🟢 Ok'       : '🚀 Excelente';

  return {
    frete, pesoEfetivo, pesoCubado,
    taxaMarketplace, imposto, marketing,
    custoTotal, lucro, margemPercent, margemContrib,
    markup, precoMinimo, precoIdeal, status,
    precoVenda, custoProduto,
  };
}

// ─── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULTS = {
  marketplace: 'ml_classico',
  precoVenda: '', custoProduto: '',
  embalagem: '0.50',
  taxaMarketplace: '11',
  imposto: '7.5', marketing: '5',
  peso: '', altura: '', largura: '', comprimento: '',
  freteFixo: '',
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────
function InputField({ label, value, onChange, prefix, suffix, placeholder, small }) {
  return (
    <div className="flex flex-col gap-1">
      <label className={`text-slate-400 leading-tight ${small ? 'text-[11px]' : 'text-xs sm:text-sm'}`}>{label}</label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">{prefix}</span>}
        <input
          type="number" min="0" step="any" inputMode="decimal"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || '0'}
          className={[
            'bg-slate-900 border border-white/10 rounded-lg text-white w-full text-sm',
            'focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30',
            'placeholder:text-slate-600',
            small ? 'py-2' : 'py-2.5',
            prefix ? 'pl-7 pr-3' : suffix ? 'pl-3 pr-8' : 'px-3',
          ].join(' ')}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">{suffix}</span>}
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
        highlight === 'yellow' ? 'text-yellow-400'  : 'text-white',
      ].join(' ')}>{value}</span>
      {sub && <span className="text-slate-500 text-xs">{sub}</span>}
      {action && (
        <button onClick={onAction} className="mt-1 flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors self-start">
          <ArrowUpRight size={12} />{action}
        </button>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function CalculadoraMarketplace() {
  const [campos, setCampos]         = useState(DEFAULTS);
  const [skuInput, setSkuInput]     = useState('');
  const [skuStatus, setSkuStatus]   = useState(null);
  const skuRef                      = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const set = key => val => setCampos(prev => ({ ...prev, [key]: val }));

  const selecionarMarketplace = (id) => {
    const p = PROFILES[id];
    setCampos(prev => ({ ...prev, marketplace: id, taxaMarketplace: String(p.taxa) }));
  };

  const usarPrecoIdeal = () =>
    setCampos(prev => ({ ...prev, precoVenda: String(calcular(prev).precoIdeal.toFixed(2)) }));

  const carregarProduto = (p, skuFallback) => {
    setCampos(prev => ({
      ...prev,
      custoProduto:  p.precoCusto  != null ? String(p.precoCusto)        : prev.custoProduto,
      precoVenda:    p.preco       != null ? String(p.preco)             : prev.precoVenda,
      peso:          p.weight      != null ? String(p.weight)            : prev.peso,
      altura:        p.height      != null ? String(p.height)            : prev.altura,
      largura:       p.width       != null ? String(p.width)             : prev.largura,
      comprimento:   p.depth       != null ? String(p.depth)             : prev.comprimento,
    }));
    setSkuStatus({ nome: p.name || p.nome || skuFallback, sku: p.sku || skuFallback });
  };

  const buscarSKU = async () => {
    const sku = skuInput.trim().toUpperCase();
    if (!sku) return;
    setSkuStatus('loading');
    try {
      const res  = await apiFetch(`/admin/products/${encodeURIComponent(sku)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      carregarProduto(data.item || data.produto || data, sku);
    } catch { setSkuStatus('error'); }
  };

  const limparSKU = () => {
    setSkuInput(''); setSkuStatus(null);
    setSearchParams({}, { replace: true });
    skuRef.current?.focus();
  };

  useEffect(() => {
    const sku = searchParams.get('sku');
    if (!sku) return;
    setSkuInput(sku.toUpperCase());
    setSkuStatus('loading');
    apiFetch(`/admin/products/${encodeURIComponent(sku)}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => carregarProduto(data.item || data.produto || data, sku))
      .catch(() => setSkuStatus('error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const res        = calcular(campos);
  const profile    = PROFILES[campos.marketplace] || PROFILES.ml_classico;
  const temPreco   = parseFloat(campos.precoVenda) > 0;
  const temCusto   = parseFloat(campos.custoProduto) > 0;
  const emPrejuizo = temPreco && res.precoVenda < res.precoMinimo;
  const semPreco   = temCusto && !temPreco;
  const usaCubado  = profile.freteMode !== 'manual' && res.pesoCubado != null;

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
            <p className="text-slate-400 text-xs sm:text-sm">Simule custos e margens por marketplace em tempo real</p>
          </div>
          <button
            onClick={() => { setCampos(DEFAULTS); setSkuInput(''); setSkuStatus(null); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-white/5 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors text-sm shrink-0"
          >
            <RefreshCw size={14} />
            <span className="hidden sm:inline">Limpar / Nova análise</span>
            <span className="sm:hidden">Limpar</span>
          </button>
        </div>

        {/* Seletor de Marketplace */}
        <div className="rounded-xl bg-slate-800 border border-white/5 p-4">
          <p className="text-xs text-slate-500 font-medium mb-3 uppercase tracking-widest">Marketplace</p>
          <div className="flex flex-wrap gap-2">
            {PROFILE_ORDER.map(id => {
              const p      = PROFILES[id];
              const ativo  = campos.marketplace === id;
              const colors = ativo
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-900 border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20';
              return (
                <button
                  key={id}
                  onClick={() => selecionarMarketplace(id)}
                  className={`flex flex-col items-start px-3 py-2 rounded-lg border text-xs transition-all ${colors}`}
                >
                  <span className="font-semibold">{p.label}</span>
                  <span className="text-[10px] opacity-60">{p.taxa}%</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Busca por SKU */}
        <div className="rounded-xl bg-slate-800 border border-white/5 p-4">
          <p className="text-xs text-slate-400 mb-2 font-medium">Buscar produto do catálogo</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                ref={skuRef} type="text" value={skuInput}
                onChange={e => { setSkuInput(e.target.value.toUpperCase()); setSkuStatus(null); }}
                onKeyDown={e => e.key === 'Enter' && buscarSKU()}
                placeholder="Digite o SKU e pressione Enter"
                className="w-full bg-slate-900 border border-white/10 rounded-lg pl-8 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 placeholder:text-slate-600 uppercase"
              />
            </div>
            <button
              onClick={buscarSKU}
              disabled={!skuInput.trim() || skuStatus === 'loading'}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shrink-0"
            >{skuStatus === 'loading' ? '...' : 'Buscar'}</button>
          </div>
          {skuStatus && skuStatus !== 'loading' && skuStatus !== 'error' && (
            <div className="flex items-center gap-2 mt-2">
              <CheckCircle size={13} className="text-emerald-400 shrink-0" />
              <span className="text-emerald-300 text-xs font-medium truncate">{skuStatus.nome}</span>
              <span className="text-slate-500 text-xs ml-auto shrink-0">{skuStatus.sku}</span>
              <button onClick={limparSKU} className="text-slate-500 hover:text-slate-300 transition-colors shrink-0"><X size={13} /></button>
            </div>
          )}
          {skuStatus === 'error' && (
            <p className="text-red-400 text-xs mt-2 flex items-center gap-1">
              <AlertTriangle size={12} /> SKU não encontrado no catálogo
            </p>
          )}
        </div>

        {/* Banner preço sugerido */}
        {semPreco && res.precoIdeal > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4">
            <div className="flex items-start gap-3 flex-1">
              <TrendingUp size={18} className="text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-emerald-300 font-semibold text-sm">Preço sugerido baseado no seu custo</p>
                <p className="text-emerald-400/70 text-xs mt-0.5">
                  Margem 30%: <strong className="text-emerald-300">{fmt(res.precoIdeal)}</strong>
                  <span className="ml-2 opacity-70">(mínimo: {fmt(res.precoMinimo)})</span>
                </p>
              </div>
            </div>
            <button onClick={usarPrecoIdeal} className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold transition-colors shrink-0">
              <ArrowUpRight size={14} />Usar este preço
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
                Preço mínimo: <strong className="text-red-300">{fmt(res.precoMinimo)}</strong>
              </p>
            </div>
          </div>
        )}

        {/* Layout 2 colunas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Coluna esquerda — Inputs */}
          <div className="rounded-xl bg-slate-800 border border-white/5 p-4 sm:p-5 space-y-4">

            {/* Dados do Produto */}
            <div className="flex items-center gap-2">
              <DollarSign size={15} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-300">Dados do Produto</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InputField label="Preço de Venda"   value={campos.precoVenda}   onChange={set('precoVenda')}   prefix="R$" placeholder="0,00" />
              <InputField label="Custo do Produto"  value={campos.custoProduto} onChange={set('custoProduto')} prefix="R$" placeholder="0,00" />
              <InputField label="Embalagem"          value={campos.embalagem}   onChange={set('embalagem')}    prefix="R$" />
              <InputField label="Peso físico"        value={campos.peso}        onChange={set('peso')}         suffix="kg" />
            </div>

            {/* Dimensões (peso cúbico ML/Shopee) */}
            {profile.freteMode !== 'manual' && (
              <>
                <div className="h-px bg-white/5" />
                <div className="flex items-center gap-2">
                  <Ruler size={15} className="text-emerald-400" />
                  <h2 className="text-sm font-semibold text-slate-300">Dimensões da Embalagem</h2>
                  <span className="text-[10px] text-slate-500 ml-1">para peso cúbico</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <InputField label="Altura"      value={campos.altura}      onChange={set('altura')}      suffix="cm" small />
                  <InputField label="Largura"      value={campos.largura}     onChange={set('largura')}     suffix="cm" small />
                  <InputField label="Comprimento"  value={campos.comprimento} onChange={set('comprimento')} suffix="cm" small />
                </div>
                {usaCubado && (
                  <div className="rounded-lg bg-slate-900/60 border border-white/5 p-3 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Peso físico</span>
                      <span className="text-slate-400">{fmtKg(parseFloat(campos.peso))}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Peso cúbico</span>
                      <span className="text-slate-400">{fmtKg(res.pesoCubado)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold border-t border-white/5 pt-1 mt-1">
                      <span className="text-slate-400">Peso efetivo (cobrado)</span>
                      <span className={res.pesoEfetivo > (parseFloat(campos.peso) || 0) ? 'text-yellow-400' : 'text-emerald-400'}>
                        {fmtKg(res.pesoEfetivo)}
                        {res.pesoEfetivo > (parseFloat(campos.peso) || 0) && ' ⚠'}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="h-px bg-white/5" />

            {/* Taxas */}
            <div className="flex items-center gap-2">
              <Percent size={15} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-300">Taxas e Impostos</h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <InputField label="Marketplace" value={campos.taxaMarketplace} onChange={set('taxaMarketplace')} suffix="%" />
              <InputField label="Imposto"      value={campos.imposto}         onChange={set('imposto')}         suffix="%" />
              <InputField label="Mkt / Ads"    value={campos.marketing}       onChange={set('marketing')}       suffix="%" />
            </div>

            <div className="h-px bg-white/5" />

            {/* Frete */}
            <div className="flex items-center gap-2">
              <Package size={15} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-300">Frete</h2>
            </div>
            <div className="space-y-1">
              <InputField
                label={`Frete fixo — vazio = tabela ${profile.label}`}
                value={campos.freteFixo}
                onChange={set('freteFixo')}
                prefix="R$"
                placeholder="automático"
              />
              {campos.freteFixo === '' && (
                <p className="text-slate-500 text-xs">
                  Frete estimado ({profile.label}):{' '}
                  <span className="text-slate-400 font-medium">{fmt(res.frete)}</span>
                  {usaCubado && res.pesoEfetivo != null &&
                    <span className="ml-1 text-slate-600">— {fmtKg(res.pesoEfetivo)} efetivo</span>
                  }
                </p>
              )}
            </div>
          </div>

          {/* Coluna direita — Resultados */}
          <div className="space-y-4">

            {/* Breakdown */}
            <div className="rounded-xl bg-slate-800 border border-white/5 p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={15} className="text-emerald-400" />
                <h2 className="text-sm font-semibold text-slate-300">Breakdown de Custos</h2>
                <span className="ml-auto text-[10px] text-slate-600">{profile.label}</span>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Custo do produto',  val: res.custoProduto                   },
                  { label: 'Embalagem',          val: parseFloat(campos.embalagem) || 0 },
                  { label: 'Taxa marketplace',   val: res.taxaMarketplace                },
                  { label: 'Frete',              val: res.frete                          },
                  { label: 'Imposto',            val: res.imposto                        },
                  { label: 'Marketing/Ads',      val: res.marketing                      },
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

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3">
              <KpiCard label="Lucro por unidade"     value={fmt(res.lucro)}            highlight={temPreco ? (res.lucro >= 0 ? 'green' : 'red') : undefined} />
              <KpiCard label="Margem líquida"         value={fmtPct(res.margemPercent)} sub={temPreco ? res.status : undefined} highlight={margemHighlight} />
              <KpiCard label="Margem contribuição"    value={fmtPct(res.margemContrib)} highlight={margemHighlight} />
              <KpiCard label="Markup sobre custo"     value={fmtPct(res.markup)}        highlight={temPreco && res.markup > 0 ? 'green' : undefined} />
              <KpiCard label="Break-even (mínimo)"    value={fmt(res.precoMinimo)}      small />
              <KpiCard label="Preço ideal (30%)"      value={fmt(res.precoIdeal)}       highlight="green" small action="Usar como preço" onAction={usarPrecoIdeal} />
            </div>
          </div>
        </div>

        {/* Simulação de cenários de Ads */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Zap size={15} className="text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Simulação — Investimento em Ads</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {cenarios.map(({ ads, lucro, margem }) => {
              const borderBg   = margem < 10 ? 'border-red-500/20 bg-red-500/5' : margem < 20 ? 'border-yellow-500/20 bg-yellow-500/5' : 'border-emerald-500/20 bg-emerald-500/5';
              const lucroColor = lucro < 0 ? 'text-red-400' : margem < 20 ? 'text-yellow-400' : 'text-emerald-400';
              const margemColor= margem < 10 ? 'text-red-400' : margem < 20 ? 'text-yellow-400' : 'text-emerald-400';
              const isAtual    = String(ads) === String(parseFloat(campos.marketing) || 0);
              return (
                <div key={ads} className={`rounded-xl border p-4 sm:p-5 relative ${borderBg} ${isAtual ? 'ring-1 ring-emerald-500/40' : ''}`}>
                  {isAtual && <span className="absolute top-3 right-3 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">atual</span>}
                  <p className="text-slate-400 text-xs mb-3">Ads: <span className="text-white font-bold">{ads}%</span></p>
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
