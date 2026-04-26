/**
 * @file SaudeFinanceira.jsx
 * @description Dashboard "Saúde Financeira" — 2 abas: Painel | A Pagar.
 *              Posição = Caixa + A Receber − A Pagar. Bling é informativo.
 * @version 4.0.0
 * @date 2026-04-26
 * @changelog
 *   4.0.0 — 2026-04-26 — Fase 1: remove Bling do cálculo, adiciona A Receber manual,
 *                         nova fórmula Posição = Caixa + A Receber − A Pagar,
 *                         A Pagar agrupa por tipo (Operacional / Parcelas).
 *   3.0.0 — 2026-04-26 — 2 abas, carga paralela, itens detalhados.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../utils/getAuthToken';
import {
  RefreshCw, Heart, TrendingDown, TrendingUp, ChevronLeft,
  ChevronRight, Clock, AlertTriangle, Loader2, CheckCircle2,
  Banknote, Package, ChevronDown, CreditCard, Receipt, ArrowDownLeft,
} from 'lucide-react';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt = v => BRL.format(v || 0);
const fmtData = iso => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

function mesParaLabel(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}
function mesAtualStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function navMes(yyyymm, delta) {
  const [y, m] = yyyymm.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Valor editável inline ────────────────────────────────────────────────────
function ValorEditavel({ valor, onChange, placeholder = 'Toque p/ editar' }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const ref = useRef(null);

  function iniciar() {
    setTexto(valor > 0 ? String(valor) : '');
    setEditando(true);
    setTimeout(() => ref.current?.select(), 0);
  }
  function confirmar() {
    onChange(parseFloat(String(texto).replace(',', '.')) || 0);
    setEditando(false);
  }

  if (editando) return (
    <input ref={ref} type="number" step="0.01" min="0" value={texto}
      onChange={e => setTexto(e.target.value)} onBlur={confirmar}
      onKeyDown={e => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') setEditando(false); }}
      className="w-28 bg-slate-700 border border-emerald-500/50 rounded-lg px-2 py-1 text-right text-sm font-semibold text-slate-100 focus:outline-none tabular-nums" />
  );
  return (
    <button onClick={iniciar} title="Toque para editar"
      className="text-sm font-semibold tabular-nums text-slate-200 hover:text-white rounded px-1.5 py-0.5 hover:bg-white/5 transition-colors min-w-[7rem] text-right">
      {valor > 0 ? fmt(valor) : <span className="text-slate-600 font-normal text-xs">{placeholder}</span>}
    </button>
  );
}

// ── Linha de detalhe ─────────────────────────────────────────────────────────
function Linha({ label, sub, valor, onEdit, cor }) {
  const corCls = cor === 'red' ? 'text-red-400' : cor === 'green' ? 'text-emerald-400' : cor === 'blue' ? 'text-blue-400' : 'text-slate-200';
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.05] last:border-0 gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-300 leading-tight">{label}</p>
        {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
      </div>
      {onEdit
        ? <ValorEditavel valor={valor} onChange={onEdit} />
        : <span className={`text-sm font-semibold tabular-nums shrink-0 ${corCls}`}>{fmt(valor)}</span>}
    </div>
  );
}

// ── Card collapsível ─────────────────────────────────────────────────────────
function CardCollapse({ titulo, total, cor, icon: Icon, children, defaultOpen = false, loading: isLoading, badge }) {
  const [aberto, setAberto] = useState(defaultOpen);
  const borda  = { green: 'border-l-emerald-500', red: 'border-l-red-500', blue: 'border-l-blue-500', teal: 'border-l-teal-500', slate: 'border-l-slate-600' };
  const texto  = { green: 'text-emerald-400',     red: 'text-red-400',     blue: 'text-blue-400',     teal: 'text-teal-400',     slate: 'text-slate-500'    };

  return (
    <div className={`rounded-xl bg-slate-800/80 border border-white/[0.06] border-l-4 ${borda[cor]} overflow-hidden`}>
      <button onClick={() => setAberto(v => !v)}
        className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center gap-2">
          <Icon size={14} className={texto[cor]} />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{titulo}</span>
          {badge != null && (
            <span className="text-[10px] text-slate-700 font-mono">{badge}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLoading
            ? <div className="h-6 w-24 rounded bg-slate-700 animate-pulse" />
            : <span className={`text-xl font-black tabular-nums ${texto[cor]}`}>{fmt(total)}</span>}
          <ChevronDown size={14} className={`text-slate-600 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {aberto && children && (
        <div className="px-5 pb-3 border-t border-white/[0.05]">{children}</div>
      )}
    </div>
  );
}

// ── Item da lista A Pagar ────────────────────────────────────────────────────
function ItemAPagar({ item }) {
  const isVencida = item.status === 'vencida';
  const urgDias   = Math.abs(item.diasParaVencer);
  const urgCls    = isVencida ? 'text-red-400' : item.diasParaVencer <= 3 ? 'text-yellow-400' : 'text-slate-500';
  const urgTxt    = isVencida ? `${urgDias}d atraso` : item.diasParaVencer === 0 ? 'Hoje' : `${item.diasParaVencer}d`;
  const bordaCls  = isVencida ? 'border-red-500/20 bg-red-500/[0.04]' : 'border-white/[0.05] bg-slate-900/30';
  const ponto     = isVencida ? 'bg-red-400 animate-pulse' : 'bg-yellow-400';

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${bordaCls}`}>
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ponto}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-slate-200 truncate leading-tight">
            {item.fornecedor || item.descricao}
          </p>
          {item.origem === 'parcela' && item.totalParcelas > 1 && (
            <span className="text-[10px] text-slate-600 font-mono shrink-0">
              {item.numeroParcela}/{item.totalParcelas}x
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {item.descricao && item.descricao !== item.fornecedor && (
            <span className="text-[10px] text-slate-600 truncate max-w-[130px]">{item.descricao}</span>
          )}
          {item.origem === 'parcela' && item.meioNome && (
            <span className="text-[10px] text-slate-700 flex items-center gap-0.5 shrink-0">
              <CreditCard size={8} /> {item.meioNome}
            </span>
          )}
          {item.origem === 'despesa' && item.categoria && (
            <span className="text-[10px] text-slate-700 flex items-center gap-0.5 shrink-0">
              <Receipt size={8} /> {item.categoria}
            </span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0 min-w-[68px]">
        <p className="text-sm font-bold text-white tabular-nums">{fmt(item.valor)}</p>
        <div className="flex items-center justify-end gap-1">
          <span className="text-[10px] text-slate-600">{fmtData(item.vencimento)}</span>
          <span className={`text-[10px] font-mono ${urgCls}`}>{urgTxt}</span>
        </div>
      </div>
    </div>
  );
}

// ── Grupo collapsível na aba A Pagar ─────────────────────────────────────────
function GrupoAPagar({ titulo, icon: Icon, cor, items }) {
  const [aberto, setAberto] = useState(true);
  if (items.length === 0) return null;

  const total    = items.reduce((s, i) => s + i.valor, 0);
  const nVencida = items.filter(i => i.status === 'vencida').length;
  const corTotal = nVencida > 0 ? 'text-red-400' : 'text-slate-300';
  const bordaCls = { red: 'border-red-500/20', yellow: 'border-yellow-500/20', slate: 'border-white/[0.06]' };

  return (
    <div className={`rounded-xl border overflow-hidden bg-slate-800/40 ${bordaCls[cor] || 'border-white/[0.06]'}`}>
      <button onClick={() => setAberto(v => !v)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center gap-2">
          <Icon size={13} className={cor === 'red' ? 'text-red-400' : 'text-slate-500'} />
          <span className="text-xs font-bold text-slate-300">{titulo}</span>
          <span className="text-[10px] text-slate-600">{items.length} item{items.length !== 1 ? 's' : ''}</span>
          {nVencida > 0 && (
            <span className="text-[10px] font-bold text-red-400 animate-pulse">{nVencida} vencida{nVencida !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold tabular-nums ${corTotal}`}>{fmt(total)}</span>
          <ChevronDown size={13} className={`text-slate-600 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {aberto && (
        <div className="px-3 pb-3 flex flex-col gap-1.5 border-t border-white/[0.05] pt-2">
          {items.map(i => <ItemAPagar key={`${i.origem}-${i.id}`} item={i} />)}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export function SaudeFinanceira() {

  const [aba,      setAba]      = useState('painel');
  const [mesAtivo, setMesAtivo] = useState(mesAtualStr);

  // ── Valores manuais em localStorage ─────────────────────────────────────────
  const mesKey = mesAtivo;
  const [mp,           setMp]           = useState(() => parseFloat(localStorage.getItem(`painel_saldo_${mesKey}_mp`)      || '0') || 0);
  const [banco,        setBanco]        = useState(() => parseFloat(localStorage.getItem(`painel_saldo_${mesKey}_banco`)   || '0') || 0);
  const [outros,       setOutros]       = useState(() => parseFloat(localStorage.getItem(`painel_saldo_${mesKey}_outros`)  || '0') || 0);
  const [cofre,        setCofre]        = useState(() => parseFloat(localStorage.getItem('saude_cofre')                    || '0') || 0);
  const [saldoLiberar, setSaldoLiberar] = useState(() => parseFloat(localStorage.getItem('saude_saldo_liberar')            || '0') || 0);
  const [aReceber,     setAReceber]     = useState(() => parseFloat(localStorage.getItem(`saude_a_receber_${mesKey}`)      || '0') || 0);
  const [estoqueChegar,setEstoqueChegar]= useState(() => parseFloat(localStorage.getItem('saude_estoque_chegar')           || '0') || 0);

  function salvar(campo, valor) {
    const keys = {
      mp:           `painel_saldo_${mesKey}_mp`,
      banco:        `painel_saldo_${mesKey}_banco`,
      outros:       `painel_saldo_${mesKey}_outros`,
      cofre:        'saude_cofre',
      saldoLiberar: 'saude_saldo_liberar',
      aReceber:     `saude_a_receber_${mesKey}`,
      estoqueChegar:'saude_estoque_chegar',
    };
    localStorage.setItem(keys[campo], valor);
    ({ mp: setMp, banco: setBanco, outros: setOutros, cofre: setCofre, saldoLiberar: setSaldoLiberar, aReceber: setAReceber, estoqueChegar: setEstoqueChegar })[campo](valor);
  }

  // ── Estado do sistema ────────────────────────────────────────────────────────
  const [painel,      setPainel]      = useState(null);
  const [estoque,     setEstoque]     = useState(null);
  const [obrigacoes,  setObrigacoes]  = useState(null);
  const [contasLista, setContasLista] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [erro,        setErro]        = useState(null);
  const [updatedAt,   setUpdatedAt]   = useState(() => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));

  const carregar = useCallback(async (mes) => {
    setLoading(true); setErro(null);
    try {
      const [resPainel, resEstoque, resObrig, resContas] = await Promise.all([
        apiFetch(`/api/painel-financeiro?mes=${mes}`),
        apiFetch('/api/fin-estoque'),
        apiFetch('/api/fin-obrigacoes'),
        apiFetch('/api/fin-contas-unificadas'),
      ]);
      if (resPainel.ok) setPainel(await resPainel.json());
      if (resEstoque.ok) { const j = await resEstoque.json(); setEstoque(j.dados); }
      if (resObrig.ok)   setObrigacoes(await resObrig.json());
      if (resContas.ok)  {
        const j = await resContas.json();
        setContasLista((j.items || []).filter(i => i.status !== 'pago'));
      }
    } catch (e) { setErro(e.message); }
    finally {
      setLoading(false);
      setUpdatedAt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    }
  }, []);

  useEffect(() => { carregar(mesAtivo); }, [mesAtivo, carregar]);

  // ── Cálculos ─────────────────────────────────────────────────────────────────

  // Caixa = dinheiro disponível agora
  const caixa       = mp + banco + outros + cofre + saldoLiberar;
  // Posição real = Caixa + A Receber (clientes) − O que falta pagar
  const totalAPagar = obrigacoes?.totalObrigacoes || 0;
  const posicao     = caixa + aReceber - totalAPagar;
  // Estoque é patrimonial — informativo, não entra na posição de caixa
  const estoqueVal  = (estoque?.totalEstoque || 0) + estoqueChegar;

  // Dados Bling (informativos — não usados no cálculo principal)
  const receitaBling = painel?.receita?.bruta || 0;
  const despMes      = painel?.despesas?.total || 0;
  const parcMes      = painel?.parcelas?.total || 0;
  const blingOk      = painel?.blingOk !== false;

  // Agrupamento A Pagar por tipo
  const despesas = contasLista.filter(i => i.origem === 'despesa');
  const parcelas = contasLista.filter(i => i.origem === 'parcela');

  // Badge da aba A Pagar
  const totalVencidas = contasLista.filter(i => i.status === 'vencida').length;

  const ABAS = [
    { id: 'painel', label: 'Painel' },
    {
      id: 'apagar',
      label: contasLista.length > 0
        ? `A Pagar (${contasLista.length}${totalVencidas > 0 ? ` · ${totalVencidas} venc.` : ''})`
        : 'A Pagar',
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">

      {/* Header sticky */}
      <div className="border-b border-white/[0.06] bg-slate-950/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Heart size={15} className="text-emerald-400" />
              <span className="text-base font-black text-slate-100">Saúde Financeira</span>
              {!loading && (
                <span className="text-[10px] text-slate-700 flex items-center gap-1">
                  <Clock size={9} /> {updatedAt}
                </span>
              )}
            </div>
            <button onClick={() => carregar(mesAtivo)} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 border border-white/[0.08] text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40">
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Carregando…' : 'Atualizar'}
            </button>
          </div>
          <div className="flex gap-0.5">
            {ABAS.map(a => (
              <button key={a.id} onClick={() => setAba(a.id)}
                className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition-all ${
                  aba === a.id
                    ? 'border-emerald-500 text-emerald-400'
                    : totalVencidas > 0 && a.id === 'apagar'
                      ? 'border-transparent text-red-500 hover:text-red-400'
                      : 'border-transparent text-slate-600 hover:text-slate-400'
                }`}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══ PAINEL ══ */}
      {aba === 'painel' && (
        <div className="max-w-2xl mx-auto px-4 pt-5 flex flex-col gap-3">

          {erro && (
            <div className="rounded-xl bg-red-900/20 border border-red-700/30 p-3 flex items-center gap-2">
              <AlertTriangle size={13} className="text-red-400 shrink-0" />
              <p className="text-xs text-red-300">{erro}</p>
            </div>
          )}

          {/* ── Posição de Caixa — número grande ── */}
          <div className={`rounded-2xl border p-5 ${posicao >= 0 ? 'bg-emerald-950/40 border-emerald-700/20' : 'bg-red-950/40 border-red-700/20'}`}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-1">
              Posição de Caixa
            </p>
            {loading
              ? <div className="h-12 w-48 rounded-xl bg-slate-800 animate-pulse mt-1" />
              : <p className={`text-5xl font-black tabular-nums leading-none ${posicao >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmt(posicao)}
                </p>
            }
            <p className="text-[10px] text-slate-700 mt-1.5">
              Caixa + A Receber − A Pagar
            </p>
            {/* Grid de 3 */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/[0.05]">
              <div className="text-center">
                <p className="text-[9px] text-slate-600 uppercase tracking-wider">Caixa</p>
                <p className="text-sm font-bold text-emerald-400 tabular-nums">{fmt(caixa)}</p>
              </div>
              <div className="text-center">
                <p className="text-[9px] text-slate-600 uppercase tracking-wider">A Receber</p>
                <button onClick={() => {
                  const v = parseFloat(prompt('Valor a receber (R$):', aReceber || '')) || 0;
                  salvar('aReceber', v);
                }}
                  className="text-sm font-bold text-blue-400 tabular-nums hover:text-blue-300 transition-colors"
                  title="Toque para editar">
                  {aReceber > 0 ? fmt(aReceber) : <span className="text-slate-700 font-normal text-xs">Editar</span>}
                </button>
              </div>
              <div className="text-center">
                <p className="text-[9px] text-slate-600 uppercase tracking-wider">A Pagar</p>
                <p className="text-sm font-bold text-red-400 tabular-nums">{fmt(totalAPagar)}</p>
              </div>
            </div>
          </div>

          {/* ── A Receber (editável) ── */}
          <CardCollapse titulo="A Receber dos Clientes" total={aReceber} cor="blue"
            icon={ArrowDownLeft} defaultOpen={aReceber === 0}>
            <div className="pt-1 pb-1">
              <p className="text-[11px] text-slate-600 mb-3">
                Informe os valores que você espera receber — vendas confirmadas, Pix a confirmar, marketplace a liberar.
              </p>
              <Linha label="Total A Receber" valor={aReceber}
                onEdit={v => salvar('aReceber', v)}
                sub="Clientes + plataformas + pix pendentes" />
            </div>
          </CardCollapse>

          {/* ── Total A Pagar (resumo com link) ── */}
          <div className="rounded-xl bg-slate-800/60 border border-white/[0.06] overflow-hidden">
            <div className="px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown size={14} className="text-red-400" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total a Pagar</span>
              </div>
              {loading
                ? <div className="h-6 w-24 rounded bg-slate-700 animate-pulse" />
                : <span className="text-xl font-black tabular-nums text-red-400">{fmt(totalAPagar)}</span>}
            </div>
            <div className="px-5 pb-3 border-t border-white/[0.05]">
              <Linha label={`Despesas operacionais (${obrigacoes?.qtdDespesas || 0})`}
                valor={obrigacoes?.totalDespesas || 0} cor="red" />
              <Linha label={`Parcelas de compras (${obrigacoes?.qtdParcelas || 0})`}
                valor={obrigacoes?.totalParcelas || 0} cor="red" />
            </div>
            <button onClick={() => setAba('apagar')}
              className="w-full px-5 py-2.5 text-xs text-blue-400 hover:text-blue-300 flex items-center justify-end gap-1 border-t border-white/[0.05] hover:bg-white/[0.02] transition-colors">
              Ver cada despesa e parcela <ChevronRight size={12} />
            </button>
          </div>

          {/* ── Caixa disponível (collapsível) ── */}
          <CardCollapse titulo="Caixa Disponível" total={caixa} cor="green" icon={Banknote}>
            <Linha label="Mercado Pago"    valor={mp}           onEdit={v => salvar('mp', v)} />
            <Linha label="Banco / Conta"   valor={banco}        onEdit={v => salvar('banco', v)} />
            <Linha label="Outros"          valor={outros}       onEdit={v => salvar('outros', v)} />
            <Linha label="Cofre"           valor={cofre}        onEdit={v => salvar('cofre', v)}        sub="Dinheiro físico" />
            <Linha label="Saldo a Liberar" valor={saldoLiberar} onEdit={v => salvar('saldoLiberar', v)} sub="Pix/vendas a confirmar" />
          </CardCollapse>

          {/* ── Estoque (informativo, collapsível) ── */}
          <CardCollapse titulo="Estoque — Patrimônio" total={estoqueVal} cor="teal" icon={Package} loading={loading}
            badge="informativo">
            <p className="text-[10px] text-slate-700 pt-2 mb-1">
              Valor de custo dos produtos. Não entra na posição de caixa — é patrimônio.
            </p>
            <Linha label="Em Casa" valor={estoque?.totalEstoque || 0}
              sub={estoque?.totalItens
                ? `${estoque.totalItens} SKUs · ${estoque.totalQuantidade} unidades`
                : 'Importe CSV do Bling para atualizar'} />
            <Linha label="A Chegar" valor={estoqueChegar} onEdit={v => salvar('estoqueChegar', v)} sub="Compras em trânsito" />
          </CardCollapse>

          {/* ── Bling / DRE mensal (informativo) ── */}
          <CardCollapse titulo={`Faturamento Bling — ${mesParaLabel(mesAtivo)}`}
            total={receitaBling} cor="slate" icon={TrendingUp}
            badge="informativo — não afeta o cálculo">
            {!blingOk && (
              <div className="flex items-center gap-2 py-2 text-amber-500/70">
                <AlertTriangle size={11} />
                <p className="text-[10px]">Bling indisponível ou não configurado — dados incompletos</p>
              </div>
            )}
            {receitaBling === 0 && blingOk && (
              <p className="text-[10px] text-slate-600 py-2">Nenhuma NF-e emitida no Bling para este mês</p>
            )}
            <Linha label="Receita NF-e" valor={receitaBling} cor="green" />
            <Linha label="Despesas no mês"
              valor={despMes} cor="red"
              sub={painel?.despesas?.qtd ? `${painel.despesas.qtd} lançamentos` : undefined} />
            <Linha label="Parcelas no mês"
              valor={parcMes} cor="red"
              sub={painel?.parcelas?.qtd ? `${painel.parcelas.qtd} parcelas` : undefined} />
          </CardCollapse>

          <p className="text-[10px] text-slate-800 text-center pb-2">
            Caixa e A Receber digitados manualmente · Obrigações do Firestore
          </p>
        </div>
      )}

      {/* ══ A PAGAR ══ */}
      {aba === 'apagar' && (
        <div className="max-w-2xl mx-auto px-4 pt-5 flex flex-col gap-4">

          {/* Cabeçalho com total */}
          <div className="rounded-2xl bg-slate-800/60 border border-white/[0.06] p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Pendente</p>
              <p className="text-[10px] text-slate-700 mt-0.5">
                {obrigacoes?.qtdDespesas || 0} despesas + {obrigacoes?.qtdParcelas || 0} parcelas
              </p>
            </div>
            {loading
              ? <div className="h-8 w-28 rounded bg-slate-700 animate-pulse" />
              : <p className="text-3xl font-black text-red-400 tabular-nums">{fmt(totalAPagar)}</p>}
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={24} className="animate-spin text-slate-700" />
            </div>
          ) : contasLista.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3 text-slate-700">
              <CheckCircle2 size={40} className="opacity-30" />
              <p className="text-sm">Nenhuma obrigação pendente</p>
            </div>
          ) : (
            <>
              {/* DESPESAS OPERACIONAIS */}
              <GrupoAPagar
                titulo="Despesas Operacionais"
                icon={Receipt}
                cor={despesas.some(i => i.status === 'vencida') ? 'red' : 'slate'}
                items={despesas}
              />

              {/* PARCELAS DE COMPRAS */}
              <GrupoAPagar
                titulo="Parcelas de Compras"
                icon={CreditCard}
                cor={parcelas.some(i => i.status === 'vencida') ? 'red' : 'slate'}
                items={parcelas}
              />
            </>
          )}

          <Link to="/financeiro/despesas"
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-white/[0.06] text-sm text-slate-600 hover:text-slate-300 hover:border-white/10 transition-colors">
            Lançar ou excluir despesas e parcelas <ChevronRight size={14} />
          </Link>
        </div>
      )}

    </div>
  );
}
