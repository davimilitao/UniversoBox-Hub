/**
 * @file Contas.jsx
 * @description Contas a Pagar — hub financeiro de compras de mercadoria.
 *   Abas:
 *     Vencimentos   — painel de parcelas pendentes / vencidas / pagas
 *     Nova Compra   — formulário de lançamento com parcelamento inteligente
 *     Cartões       — gestão de meios de pagamento (MeiosPagamento existente)
 *
 * @version 1.0.0
 * @date 2026-04-06
 */

import { useState, useMemo } from 'react';
import {
  CreditCard, Plus, AlertTriangle, CheckCircle2, Clock,
  Calendar, Loader2, Wallet, X, ChevronDown, ChevronUp,
  RotateCcw, Banknote, Package, TrendingDown, BarChart2,
  ShieldCheck, User, RefreshCw,
} from 'lucide-react';
import { useCompras, calcParcelas } from '../../hooks/useCompras';
import { useMeiosPagamento } from '../../hooks/useMeiosPagamento';
import MeiosPagamento from './components/MeiosPagamento';

// ─── Formatters ───────────────────────────────────────────────────────────────

function brl(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtData(ts) {
  if (!ts) return '—';
  const d = ts?.toDate?.() ?? new Date(ts);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDataCurta(ts) {
  if (!ts) return '—';
  const d = ts?.toDate?.() ?? new Date(ts);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function diasParaVencer(ts) {
  if (!ts) return null;
  const d = ts?.toDate?.() ?? new Date(ts);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.round((d.setHours(0, 0, 0, 0) - hoje.getTime()) / 86400000);
}

function urgencyColor(dias) {
  if (dias === null) return 'text-slate-500';
  if (dias < 0)  return 'text-red-400';
  if (dias === 0) return 'text-orange-400';
  if (dias <= 3) return 'text-yellow-400';
  return 'text-slate-400';
}

function urgencyBg(dias) {
  if (dias === null) return '';
  if (dias < 0)  return 'border-red-500/20 bg-red-500/[0.03]';
  if (dias === 0) return 'border-orange-500/20 bg-orange-500/[0.03]';
  if (dias <= 3) return 'border-yellow-500/20 bg-yellow-500/[0.03]';
  return 'border-white/[0.06]';
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'emerald', Icon }) {
  const clr = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    red:     'text-red-400 bg-red-500/10 border-red-500/20',
    yellow:  'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    blue:    'text-blue-400 bg-blue-500/10 border-blue-500/20',
  }[color];

  return (
    <div className="bg-slate-900 border border-white/[0.06] rounded-2xl p-4 flex gap-3 items-start">
      <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${clr}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">{label}</p>
        <p className="text-xl font-black text-white leading-tight mt-0.5 tabular-nums">{value}</p>
        {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Painel Vencimentos ───────────────────────────────────────────────────────
function PainelVencimentos({ parcelas, loading, marcarPago, desfazerPagamento, getResumo, reload }) {
  const [filtro, setFiltro] = useState('pendentes'); // pendentes | pagos | todos
  const [expandirPagas, setExpandirPagas] = useState(false);

  const resumo = getResumo();

  const lista = useMemo(() => {
    if (filtro === 'pendentes') return parcelas.filter(p => p.status === 'pendente');
    if (filtro === 'pagos')     return parcelas.filter(p => p.status === 'pago');
    return parcelas;
  }, [parcelas, filtro]);

  if (loading) return (
    <div className="flex items-center justify-center py-24 gap-2 text-slate-600">
      <Loader2 size={20} className="animate-spin" /> Carregando parcelas…
    </div>
  );

  return (
    <div className="space-y-5">

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Vencido" value={brl(resumo.vencidas.total)}
          sub={`${resumo.vencidas.items.length} parcela(s)`} color="red" Icon={AlertTriangle} />
        <KpiCard label="Vence Hoje" value={brl(resumo.hoje.total)}
          sub={`${resumo.hoje.items.length} parcela(s)`} color="yellow" Icon={Clock} />
        <KpiCard label="Próx. 7 dias" value={brl(resumo.semana.total)}
          sub={`${resumo.semana.items.length} parcela(s)`} color="blue" Icon={Calendar} />
        <KpiCard label="Total pago" value={brl(resumo.totalPago)}
          sub="histórico" color="emerald" Icon={CheckCircle2} />
      </div>

      {/* ── Filtros ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex bg-slate-900 border border-white/[0.05] rounded-xl p-0.5 gap-0.5">
          {[
            { id: 'pendentes', label: 'Pendentes' },
            { id: 'pagos',     label: 'Pagos'     },
            { id: 'todos',     label: 'Todos'      },
          ].map(f => (
            <button key={f.id} onClick={() => setFiltro(f.id)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filtro === f.id
                  ? 'bg-white/[0.08] text-slate-100'
                  : 'text-slate-600 hover:text-slate-400'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={reload} className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-400 transition-colors">
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      {/* ── Lista de parcelas ── */}
      {lista.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-700">
          <CheckCircle2 size={40} className="opacity-30" />
          <p className="text-sm">Nenhuma parcela {filtro === 'pagos' ? 'paga' : 'pendente'} encontrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map(p => {
            const dias = diasParaVencer(p.vencimento);
            const pago = p.status === 'pago';
            return (
              <div key={p.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                  pago ? 'border-white/[0.04] opacity-60' : urgencyBg(dias)
                }`}
                style={{ background: 'var(--bg-surface, #0f172a)' }}
              >
                {/* Status dot */}
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  pago ? 'bg-emerald-500' :
                  dias !== null && dias < 0 ? 'bg-red-400 animate-pulse' :
                  dias === 0 ? 'bg-orange-400 animate-pulse' :
                  'bg-slate-600'
                }`} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-slate-200 truncate">{p.fornecedor}</span>
                    {p.totalParcelas > 1 && (
                      <span className="text-[10px] text-slate-600 font-mono">
                        {p.numeroParcela}/{p.totalParcelas}x
                      </span>
                    )}
                    {p.descricao && (
                      <span className="text-[10px] text-slate-600 truncate">{p.descricao}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] text-slate-600">{p.meioNome || p.meioBandeira}</span>
                    <span className={`text-[10px] font-mono font-bold ${urgencyColor(dias)}`}>
                      {pago ? `Pago ${fmtDataCurta(p.paidAt)}` :
                        dias === null ? '—' :
                        dias < 0 ? `${Math.abs(dias)}d atraso` :
                        dias === 0 ? 'Vence HOJE' :
                        `${dias}d para vencer (${fmtDataCurta(p.vencimento)})`
                      }
                    </span>
                  </div>
                </div>

                {/* Valor */}
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-white tabular-nums">{brl(p.valor)}</p>
                  <p className="text-[10px] text-slate-600">{fmtData(p.vencimento)}</p>
                </div>

                {/* Ação */}
                {!pago ? (
                  <button
                    onClick={() => marcarPago(p.id)}
                    title="Marcar como pago"
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600/10 hover:bg-emerald-600 border border-emerald-500/20 hover:border-emerald-500 text-emerald-400 hover:text-white text-[10px] font-bold transition-all"
                  >
                    <CheckCircle2 size={12} /> Pago
                  </button>
                ) : (
                  <button
                    onClick={() => desfazerPagamento(p.id)}
                    title="Desfazer pagamento"
                    className="shrink-0 p-1.5 rounded-lg text-slate-700 hover:text-slate-400 hover:bg-white/[0.05] transition-colors"
                  >
                    <RotateCcw size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Formulário Nova Compra ───────────────────────────────────────────────────
function FormNovaCompra({ meios, lancarCompra, saving, onSucesso }) {
  const EMPTY = {
    fornecedor: '', descricao: '', totalBruto: '', numeroParcelas: '1',
    taxaJuros: '', meioId: '', sku: '', qtd: '', avista: true,
  };
  const [f, setF] = useState(EMPTY);
  const [preview, setPreview] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);

  const meio = meios.find(m => m.id === f.meioId);
  const total = parseFloat(f.totalBruto) || 0;
  const n = parseInt(f.numeroParcelas) || 1;
  const taxa = parseFloat(f.taxaJuros) || 0;

  const { totalComJuros, valorBase } = useMemo(
    () => total > 0 ? calcParcelas(total, n, taxa) : { totalComJuros: 0, valorBase: 0 },
    [total, n, taxa]
  );

  const custoUnit = total > 0 && parseInt(f.qtd) > 0
    ? (total / parseInt(f.qtd)).toFixed(2)
    : '';

  // Calcula data da 1ª parcela baseada no diaVencimento do cartão
  function dataPrimeiraParcela() {
    const hoje = new Date();
    const dia = meio?.diaVencimento || 10;
    // Se o dia de vencimento já passou este mês, vai para o próximo
    const mes = hoje.getDate() < dia ? hoje.getMonth() : hoje.getMonth() + 1;
    return new Date(hoje.getFullYear(), mes, dia);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    if (!f.fornecedor.trim()) { setErro('Informe o fornecedor'); return; }
    if (!total || total <= 0)  { setErro('Valor total inválido'); return; }
    if (!f.meioId)             { setErro('Selecione o meio de pagamento'); return; }

    const result = await lancarCompra({
      fornecedor:         f.fornecedor.trim(),
      descricao:          f.descricao.trim(),
      totalBruto:         total,
      numeroParcelas:     f.avista ? 1 : n,
      taxaJuros:          f.avista ? 0 : taxa,
      meioId:             meio.id,
      meioNome:           meio.nome,
      meioBandeira:       meio.bandeira,
      diaVencimento:      meio.diaVencimento || 10,
      dataPrimeiraParcela: dataPrimeiraParcela(),
      sku:                f.sku.trim(),
      qtd:                parseInt(f.qtd) || 0,
      custoUnitario:      parseFloat(custoUnit) || 0,
    });

    if (result.ok) {
      setOk(true);
      setF(EMPTY);
      setPreview(false);
      setTimeout(() => { setOk(false); onSucesso?.(); }, 1500);
    } else {
      setErro(result.error || 'Erro ao lançar compra');
    }
  }

  const inp = 'w-full bg-slate-800 border border-white/[0.06] rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500/50 placeholder:text-slate-600 transition-colors';
  const lbl = 'text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl mx-auto">

      <div className="flex items-center gap-2 text-emerald-400 text-xs bg-emerald-500/[0.05] border border-emerald-500/10 rounded-xl px-4 py-3">
        <ShieldCheck size={14} className="shrink-0" />
        <span>Os dados do cartão não são armazenados — apenas o apelido e os últimos 4 dígitos.</span>
      </div>

      {/* Fornecedor + Descrição */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className={lbl}>Fornecedor *</p>
          <input className={inp} placeholder="Ex: Distribuidora São Paulo" required
            value={f.fornecedor} onChange={e => setF(p => ({ ...p, fornecedor: e.target.value }))} />
        </div>
        <div>
          <p className={lbl}>Descrição / Produto</p>
          <input className={inp} placeholder="Ex: Pelúcias sortidas — 100un"
            value={f.descricao} onChange={e => setF(p => ({ ...p, descricao: e.target.value }))} />
        </div>
      </div>

      {/* Valor + Meio de pagamento */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className={lbl}>Valor Total R$ *</p>
          <input className={inp} type="number" min="0.01" step="0.01" placeholder="0,00" required
            value={f.totalBruto} onChange={e => setF(p => ({ ...p, totalBruto: e.target.value }))} />
        </div>
        <div>
          <p className={lbl}>Meio de Pagamento *</p>
          <select className={inp} required value={f.meioId}
            onChange={e => setF(p => ({ ...p, meioId: e.target.value }))}>
            <option value="">Selecionar…</option>
            {meios.map(m => (
              <option key={m.id} value={m.id}>
                {m.nome}{m.final ? ` (${m.final})` : ''} — {m.bandeira}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* À vista / Parcelado */}
      <div className="bg-slate-900 border border-white/[0.05] rounded-2xl p-4 space-y-4">
        <div className="flex gap-2">
          {[
            { v: true,  label: 'À Vista / Pix / Boleto' },
            { v: false, label: 'Parcelado no Cartão'    },
          ].map(o => (
            <button type="button" key={String(o.v)}
              onClick={() => setF(p => ({ ...p, avista: o.v, numeroParcelas: o.v ? '1' : p.numeroParcelas }))}
              className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${
                f.avista === o.v
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                  : 'border-white/[0.05] text-slate-600 hover:text-slate-400'
              }`}>
              {o.label}
            </button>
          ))}
        </div>

        {!f.avista && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className={lbl}>Nº de parcelas</p>
              <select className={inp} value={f.numeroParcelas}
                onChange={e => setF(p => ({ ...p, numeroParcelas: e.target.value }))}>
                {Array.from({ length: 24 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n}x</option>
                ))}
              </select>
            </div>
            <div>
              <p className={lbl}>Taxa de juros % a.m.</p>
              <input className={inp} type="number" min="0" step="0.01" placeholder="0.00 (sem juros)"
                value={f.taxaJuros} onChange={e => setF(p => ({ ...p, taxaJuros: e.target.value }))} />
            </div>
          </div>
        )}

        {/* Preview do parcelamento */}
        {total > 0 && (
          <div className="bg-slate-800/60 border border-white/[0.05] rounded-xl px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-600">Total sem juros</span>
              <span className="text-slate-300 font-mono">{brl(total)}</span>
            </div>
            {!f.avista && taxa > 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-600">Total com juros ({n}x {taxa}% a.m.)</span>
                <span className="text-yellow-400 font-mono">{brl(totalComJuros)}</span>
              </div>
            )}
            <div className="flex justify-between text-[11px] border-t border-white/[0.05] pt-1.5 mt-1">
              <span className="text-slate-400 font-bold">
                {f.avista ? 'Pagamento único' : `${n}x de`}
              </span>
              <span className="text-white font-black font-mono tabular-nums">
                {f.avista ? brl(total) : brl(valorBase)}
              </span>
            </div>
            {meio && !f.avista && (
              <p className="text-[10px] text-slate-600">
                1ª parcela: {dataPrimeiraParcela().toLocaleDateString('pt-BR')}
                {' · '}vence dia {meio.diaVencimento} de cada mês
              </p>
            )}
          </div>
        )}
      </div>

      {/* Dados do produto (opcional — para integração Margem) */}
      <div className="bg-slate-900 border border-white/[0.05] rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-slate-600">
          <BarChart2 size={12} className="text-blue-400" />
          <span className="font-bold uppercase tracking-wider text-blue-400">Opcional: Integração com Margem</span>
          <span>— Informe para atualizar custo unitário do produto</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className={lbl}>SKU do produto</p>
            <input className={inp} placeholder="Ex: BUBA-PELUC-01"
              value={f.sku} onChange={e => setF(p => ({ ...p, sku: e.target.value }))} />
          </div>
          <div>
            <p className={lbl}>Quantidade comprada</p>
            <input className={inp} type="number" min="1" placeholder="0"
              value={f.qtd} onChange={e => setF(p => ({ ...p, qtd: e.target.value }))} />
          </div>
          <div>
            <p className={lbl}>Custo unitário calculado</p>
            <div className={`${inp} flex items-center text-emerald-400 font-mono cursor-not-allowed`}>
              {custoUnit ? `R$ ${custoUnit}` : <span className="text-slate-700">automático</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Erro */}
      {erro && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertTriangle size={14} className="shrink-0" /> {erro}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={saving || ok}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm transition-all active:scale-95 disabled:opacity-60
          bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20"
      >
        {saving ? <><Loader2 size={16} className="animate-spin" /> Lançando…</>
          : ok    ? <><CheckCircle2 size={16} /> Lançado com sucesso!</>
          : <><Banknote size={16} /> Lançar Compra</>
        }
      </button>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Contas() {
  const [aba, setAba] = useState('vencimentos'); // vencimentos | nova | cartoes

  const {
    parcelas, compras, loading, saving, lancarCompra,
    marcarPago, desfazerPagamento, getResumo, reload,
  } = useCompras();

  const { meios, loading: loadingMeios } = useMeiosPagamento();

  const resumo = getResumo();

  const ABAS = [
    { id: 'vencimentos', label: 'Vencimentos',  badge: resumo.vencidas.items.length || null },
    { id: 'nova',        label: 'Nova Compra',  badge: null },
    { id: 'cartoes',     label: 'Cartões',       badge: meios.length || null },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Wallet size={15} className="text-emerald-400" />
              </div>
              <h1 className="text-lg font-black text-white">Contas a Pagar</h1>
            </div>
            <p className="text-xs text-slate-600 mt-0.5 ml-10">
              Compras de mercadoria · parcelamento inteligente · fluxo de caixa
            </p>
          </div>

          {aba === 'vencimentos' && (
            <div className="text-right">
              <p className="text-[10px] text-slate-600 uppercase tracking-wider">Total pendente</p>
              <p className="text-xl font-black tabular-nums text-white">{brl(resumo.totalPendente)}</p>
            </div>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="flex bg-slate-900 border border-white/[0.05] rounded-2xl p-1 gap-1">
          {ABAS.map(a => (
            <button key={a.id} onClick={() => setAba(a.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-bold transition-all ${
                aba === a.id
                  ? 'bg-white/[0.07] text-slate-100'
                  : 'text-slate-600 hover:text-slate-400'
              }`}>
              {a.label}
              {a.badge ? (
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                  a.id === 'vencimentos' && resumo.vencidas.items.length
                    ? 'bg-red-500 text-white'
                    : 'bg-slate-700 text-slate-400'
                }`}>
                  {a.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* ── Conteúdo por aba ── */}
        {aba === 'vencimentos' && (
          <PainelVencimentos
            parcelas={parcelas}
            loading={loading}
            marcarPago={marcarPago}
            desfazerPagamento={desfazerPagamento}
            getResumo={getResumo}
            reload={reload}
          />
        )}

        {aba === 'nova' && (
          <div>
            {meios.length === 0 && !loadingMeios ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-600">
                <CreditCard size={36} className="opacity-30" />
                <p className="text-sm">Cadastre um cartão ou conta primeiro</p>
                <button onClick={() => setAba('cartoes')}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors">
                  <Plus size={14} /> Cadastrar Cartão / Conta
                </button>
              </div>
            ) : (
              <FormNovaCompra
                meios={meios}
                lancarCompra={lancarCompra}
                saving={saving}
                onSucesso={() => setAba('vencimentos')}
              />
            )}
          </div>
        )}

        {aba === 'cartoes' && (
          <MeiosPagamento />
        )}

      </div>
    </div>
  );
}
