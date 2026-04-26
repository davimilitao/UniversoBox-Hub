/**
 * @file SaudeFinanceira.jsx
 * @description Dashboard financeiro — 3 abas: Painel (DRE mensal) / A Pagar / Posição.
 * @version 2.0.0
 * @date 2026-04-25
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../utils/getAuthToken';
import {
  RefreshCw, Heart, TrendingDown, TrendingUp, ChevronLeft,
  ChevronRight, Clock, AlertTriangle, Loader2, CheckCircle2,
  Banknote, Package, Scale, Calendar,
} from 'lucide-react';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt = v => BRL.format(v || 0);

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
function ValorEditavel({ valor, onChange }) {
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
      onChange={e => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={e => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') setEditando(false); }}
      className="w-32 bg-slate-700 border border-emerald-500/50 rounded-lg px-2 py-1 text-right text-sm font-semibold text-slate-100 focus:outline-none tabular-nums" />
  );
  return (
    <button onClick={iniciar} title="Toque para editar"
      className="text-sm font-semibold tabular-nums text-slate-200 hover:text-white rounded-lg px-2 py-1 hover:bg-white/5 transition-colors min-w-[8rem] text-right">
      {valor > 0 ? fmt(valor) : <span className="text-slate-600 font-normal">Toque para editar</span>}
    </button>
  );
}

// ── Linha de detalhe ─────────────────────────────────────────────────────────
function Linha({ label, sub, valor, onEdit, cor }) {
  const corCls = cor === 'red' ? 'text-red-400' : cor === 'green' ? 'text-emerald-400' : 'text-slate-200';
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

// ── Bloco de seção ───────────────────────────────────────────────────────────
function Bloco({ titulo, total, cor, icon: Icon, children, loading: isLoading }) {
  const borda = { green: 'border-l-emerald-500', red: 'border-l-red-500', blue: 'border-l-blue-500', teal: 'border-l-teal-500' };
  const texto = { green: 'text-emerald-400', red: 'text-red-400', blue: 'text-blue-400', teal: 'text-teal-400' };
  return (
    <div className={`rounded-xl bg-slate-800/80 border border-white/[0.06] border-l-4 ${borda[cor]} overflow-hidden`}>
      <div className="px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={14} className={texto[cor]} />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{titulo}</span>
        </div>
        {isLoading
          ? <div className="h-7 w-28 rounded bg-slate-700 animate-pulse" />
          : <span className={`text-xl font-black tabular-nums ${texto[cor]}`}>{fmt(total)}</span>}
      </div>
      {children && <div className="px-5 pb-3 border-t border-white/[0.05]">{children}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export function SaudeFinanceira() {

  const [aba,    setAba]    = useState('painel');
  const [mesAtivo, setMesAtivo] = useState(mesAtualStr);

  // ── Caixa manual (localStorage) ─────────────────────────────────────────────
  const mesKey = mesAtivo;
  const [mp,           setMp]           = useState(() => parseFloat(localStorage.getItem(`painel_saldo_${mesKey}_mp`)     || '0') || 0);
  const [banco,        setBanco]        = useState(() => parseFloat(localStorage.getItem(`painel_saldo_${mesKey}_banco`)  || '0') || 0);
  const [outros,       setOutros]       = useState(() => parseFloat(localStorage.getItem(`painel_saldo_${mesKey}_outros`) || '0') || 0);
  const [cofre,        setCofre]        = useState(() => parseFloat(localStorage.getItem('saude_cofre')                   || '0') || 0);
  const [saldoLiberar, setSaldoLiberar] = useState(() => parseFloat(localStorage.getItem('saude_saldo_liberar')           || '0') || 0);
  const [estoqueChegar,setEstoqueChegar]= useState(() => parseFloat(localStorage.getItem('saude_estoque_chegar')          || '0') || 0);

  function salvar(campo, valor) {
    const keys = { mp: `painel_saldo_${mesKey}_mp`, banco: `painel_saldo_${mesKey}_banco`, outros: `painel_saldo_${mesKey}_outros`, cofre: 'saude_cofre', saldoLiberar: 'saude_saldo_liberar', estoqueChegar: 'saude_estoque_chegar' };
    localStorage.setItem(keys[campo], valor);
    const fns = { mp: setMp, banco: setBanco, outros: setOutros, cofre: setCofre, saldoLiberar: setSaldoLiberar, estoqueChegar: setEstoqueChegar };
    fns[campo](valor);
  }

  // ── Dados do sistema ─────────────────────────────────────────────────────────
  const [painel,         setPainel]         = useState(null);   // /api/painel-financeiro
  const [estoque,        setEstoque]        = useState(null);   // /api/fin-estoque
  const [obrigacoes,     setObrigacoes]     = useState(null);   // /api/fin-obrigacoes
  const [contasLista,    setContasLista]    = useState([]);     // /api/fin-contas-unificadas
  const [loading,        setLoading]        = useState(true);
  const [loadingContas,  setLoadingContas]  = useState(false);
  const [erro,           setErro]           = useState(null);
  const [atualizadoAs,   setAtualizadoAs]   = useState(() => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));

  const carregar = useCallback(async (mes) => {
    setLoading(true); setErro(null);
    try {
      const [resPainel, resEstoque, resObrig] = await Promise.all([
        apiFetch(`/api/painel-financeiro?mes=${mes}`),
        apiFetch('/api/fin-estoque'),
        apiFetch('/api/fin-obrigacoes'),
      ]);
      if (resPainel.ok) setPainel(await resPainel.json());
      if (resEstoque.ok) { const j = await resEstoque.json(); setEstoque(j.dados); }
      if (resObrig.ok)   setObrigacoes(await resObrig.json());
    } catch (e) { setErro(e.message); }
    finally {
      setLoading(false);
      setAtualizadoAs(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    }
  }, []);

  const carregarContasLista = useCallback(async () => {
    setLoadingContas(true);
    try {
      const res = await apiFetch('/api/fin-contas-unificadas');
      if (res.ok) {
        const j = await res.json();
        // Apenas não-pagas, ordenadas: vencida → pendente
        setContasLista((j.items || []).filter(i => i.status !== 'pago'));
      }
    } catch { /* silencioso */ }
    finally { setLoadingContas(false); }
  }, []);

  useEffect(() => { carregar(mesAtivo); }, [mesAtivo, carregar]);
  useEffect(() => { if (aba === 'apagar') carregarContasLista(); }, [aba, carregarContasLista]);

  // ── Cálculos ─────────────────────────────────────────────────────────────────
  const caixa        = mp + banco + outros + cofre + saldoLiberar;
  const estoqueVal   = (estoque?.totalEstoque || 0) + estoqueChegar;
  const totalAPagar  = obrigacoes?.totalObrigacoes || 0;
  const posicao      = caixa - totalAPagar;

  // Painel mensal
  const receita      = painel?.receita?.bruta || 0;
  const despMes      = painel?.despesas?.total || 0;
  const parcMes      = painel?.parcelas?.total || 0;
  const resultado    = receita - despMes - parcMes;

  // Agrupamento da lista A Pagar
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const mesAtualMM = mesAtualStr();
  const vencidas   = contasLista.filter(i => i.status === 'vencida');
  const esteMes    = contasLista.filter(i => i.status === 'pendente' && i.vencimento?.startsWith(mesAtualMM));
  const proxMeses  = contasLista.filter(i => i.status === 'pendente' && !i.vencimento?.startsWith(mesAtualMM));
  // Agrupa próximos meses por mês
  const proxPorMes = proxMeses.reduce((acc, i) => {
    const mm = i.vencimento?.slice(0, 7) || '';
    if (!acc[mm]) acc[mm] = { label: mesParaLabel(mm), total: 0, items: [] };
    acc[mm].total += i.valor;
    acc[mm].items.push(i);
    return acc;
  }, {});
  const proxMesesOrdenados = Object.entries(proxPorMes).sort(([a], [b]) => a.localeCompare(b));

  const ABAS = [
    { id: 'painel', label: 'Painel' },
    { id: 'apagar', label: 'A Pagar' },
    { id: 'posicao', label: 'Posição' },
  ];

  // ── Helpers de urgência ──────────────────────────────────────────────────────
  function itemCls(status) {
    if (status === 'vencida')  return 'border-red-500/25 bg-red-500/[0.04]';
    return 'border-white/[0.06] bg-slate-800/40';
  }
  function pontoCls(status) {
    if (status === 'vencida')  return 'bg-red-400 animate-pulse';
    return 'bg-yellow-400';
  }
  function urgLabel(i) {
    if (i.status === 'vencida') return `${Math.abs(i.diasParaVencer)}d atraso`;
    if (i.diasParaVencer === 0) return 'Hoje';
    return `${i.diasParaVencer}d`;
  }
  function urgCls(i) {
    if (i.status === 'vencida') return 'text-red-400';
    if (i.diasParaVencer <= 3)  return 'text-yellow-400';
    return 'text-slate-500';
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">

      {/* Header fixo */}
      <div className="border-b border-white/[0.06] bg-slate-950/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Heart size={15} className="text-emerald-400" />
              <span className="text-base font-black text-slate-100">Saúde Financeira</span>
              <span className="text-[10px] text-slate-600 flex items-center gap-1">
                <Clock size={9} /> {atualizadoAs}
              </span>
            </div>
            <button onClick={() => { carregar(mesAtivo); if (aba === 'apagar') carregarContasLista(); }}
              disabled={loading || loadingContas}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-white/[0.08] text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40">
              <RefreshCw size={12} className={(loading || loadingContas) ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>
          <div className="flex gap-0.5">
            {ABAS.map(a => (
              <button key={a.id} onClick={() => setAba(a.id)}
                className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition-all ${
                  aba === a.id ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-600 hover:text-slate-400'
                }`}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══ PAINEL ══ */}
      {aba === 'painel' && (
        <div className="max-w-2xl mx-auto px-4 pt-5 flex flex-col gap-4">

          {/* Erro */}
          {erro && (
            <div className="rounded-xl bg-red-900/20 border border-red-700/30 p-3 flex items-center gap-2">
              <AlertTriangle size={13} className="text-red-400 shrink-0" />
              <p className="text-xs text-red-300">{erro}</p>
            </div>
          )}

          {/* Seletor de mês */}
          <div className="flex items-center gap-2">
            <button onClick={() => setMesAtivo(m => navMes(m, -1))}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] transition-all">
              <ChevronLeft size={16} />
            </button>
            <span className="flex-1 text-center text-sm font-black text-slate-200 capitalize">
              {mesParaLabel(mesAtivo)}
            </span>
            <button onClick={() => setMesAtivo(m => navMes(m, 1))}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] transition-all">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* DRE do mês */}
          <Bloco titulo="Resultado do Mês" total={resultado} cor={resultado >= 0 ? 'green' : 'red'}
            icon={resultado >= 0 ? TrendingUp : TrendingDown} loading={loading}>
            <Linha label="Receita Bruta (NF-e Bling)" valor={receita} cor="green"
              sub={painel?.blingOk === false ? '⚠ Bling indisponível — dados podem estar incompletos' : undefined} />
            <Linha label={`Despesas do mês (${painel?.despesas?.pendente > 0 ? `R$ ${(painel.despesas.pendente/1000).toFixed(1)}k pend.` : 'operacional'})`}
              valor={despMes} cor="red" />
            <Linha label={`Parcelas do mês (${painel?.parcelas?.pendente > 0 ? `R$ ${(painel.parcelas.pendente/1000).toFixed(1)}k pend.` : 'investimentos'})`}
              valor={parcMes} cor="red" />
          </Bloco>

          {/* Caixa disponível */}
          <Bloco titulo="Caixa Disponível" total={caixa} cor="green" icon={Banknote}>
            <Linha label="Mercado Pago"    valor={mp}           onEdit={v => salvar('mp', v)} />
            <Linha label="Banco"           valor={banco}        onEdit={v => salvar('banco', v)} />
            <Linha label="Outros"          valor={outros}       onEdit={v => salvar('outros', v)} />
            <Linha label="Cofre"           valor={cofre}        onEdit={v => salvar('cofre', v)} sub="Dinheiro físico" />
            <Linha label="Saldo a Liberar" valor={saldoLiberar} onEdit={v => salvar('saldoLiberar', v)} sub="Pix/vendas a confirmar" />
          </Bloco>

          {/* Estoque */}
          <Bloco titulo="Estoque (valor)" total={estoqueVal} cor="blue" icon={Package} loading={loading}>
            <Linha label="Em Casa"   valor={estoque?.totalEstoque || 0} auto
              sub={estoque?.totalItens ? `${estoque.totalItens} itens · ${estoque.totalQuantidade} un.` : 'Importe CSV do Bling'} />
            <Linha label="A Chegar"  valor={estoqueChegar} onEdit={v => salvar('estoqueChegar', v)} sub="Compras ainda não entregues" />
          </Bloco>

          {/* Total A Pagar (link para aba) */}
          <Bloco titulo="Total a Pagar (pendente + vencido)" total={totalAPagar} cor="red" icon={TrendingDown} loading={loading}>
            <Linha label={`Despesas pendentes (${obrigacoes?.qtdDespesas || 0})`}
              valor={obrigacoes?.totalDespesas || 0} cor="red" />
            <Linha label={`Parcelas a vencer (${obrigacoes?.qtdParcelas || 0})`}
              valor={obrigacoes?.totalParcelas || 0} cor="red" />
            <div className="flex justify-end pt-1">
              <button onClick={() => setAba('apagar')}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 py-1 transition-colors">
                Ver lista completa <ChevronRight size={12} />
              </button>
            </div>
          </Bloco>

          {/* Resultado final */}
          <div className={`rounded-xl border p-5 ${posicao >= 0 ? 'bg-emerald-900/15 border-emerald-700/25' : 'bg-red-900/15 border-red-700/25'}`}>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">Posição de Caixa</p>
            <p className={`text-5xl font-black tabular-nums ${posicao >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmt(posicao)}
            </p>
            <p className="text-[10px] text-slate-600 mt-1">Caixa Disponível − Total a Pagar</p>
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/[0.06]">
              <div className="text-center">
                <p className="text-[10px] text-slate-600">Caixa</p>
                <p className="text-sm font-bold text-emerald-400 tabular-nums">{fmt(caixa)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-slate-600">Estoque</p>
                <p className="text-sm font-bold text-blue-400 tabular-nums">{fmt(estoqueVal)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-slate-600">A Pagar</p>
                <p className="text-sm font-bold text-red-400 tabular-nums">{fmt(totalAPagar)}</p>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-slate-700 text-center pb-2">
            Resultado usa dados do Bling + Firestore · Caixa digitado manualmente neste dispositivo
          </p>
        </div>
      )}

      {/* ══ A PAGAR ══ */}
      {aba === 'apagar' && (
        <div className="max-w-2xl mx-auto px-4 pt-5 flex flex-col gap-5">

          {/* Total geral */}
          <div className="rounded-xl bg-slate-800/60 border border-white/[0.06] p-4 flex items-baseline justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total a Pagar</p>
              <p className="text-[10px] text-slate-600 mt-0.5">Despesas pendentes + parcelas a vencer</p>
            </div>
            <p className="text-3xl font-black text-red-400 tabular-nums">{fmt(totalAPagar)}</p>
          </div>

          {loadingContas ? (
            <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-slate-600" /></div>
          ) : contasLista.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3 text-slate-700">
              <CheckCircle2 size={40} className="opacity-30" />
              <p className="text-sm">Nenhuma obrigação pendente</p>
            </div>
          ) : (
            <>
              {/* VENCIDAS */}
              {vencidas.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                    <p className="text-xs font-black uppercase tracking-wider text-red-400">
                      Vencidas — {fmt(vencidas.reduce((s,i) => s+i.valor, 0))}
                    </p>
                  </div>
                  <div className="space-y-1">
                    {vencidas.map(i => (
                      <div key={`${i.origem}-${i.id}`}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-500/25 bg-red-500/[0.04]">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-200 truncate">{i.fornecedor || i.descricao}</p>
                          {i.descricao && i.descricao !== i.fornecedor &&
                            <p className="text-[10px] text-slate-600 truncate">{i.descricao}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-white tabular-nums">{fmt(i.valor)}</p>
                          <p className="text-[10px] font-mono text-red-400">{urgLabel(i)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ESTE MÊS */}
              {esteMes.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar size={12} className="text-yellow-400" />
                    <p className="text-xs font-black uppercase tracking-wider text-yellow-400">
                      {mesParaLabel(mesAtualMM)} — {fmt(esteMes.reduce((s,i) => s+i.valor, 0))}
                    </p>
                  </div>
                  <div className="space-y-1">
                    {esteMes.map(i => (
                      <div key={`${i.origem}-${i.id}`}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-yellow-500/20 bg-yellow-500/[0.03]">
                        <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-200 truncate">{i.fornecedor || i.descricao}</p>
                          {i.descricao && i.descricao !== i.fornecedor &&
                            <p className="text-[10px] text-slate-600 truncate">{i.descricao}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-white tabular-nums">{fmt(i.valor)}</p>
                          <p className={`text-[10px] font-mono ${urgCls(i)}`}>{urgLabel(i)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PRÓXIMOS MESES */}
              {proxMesesOrdenados.length > 0 && (
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                    <ChevronRight size={12} /> Próximos meses
                  </p>
                  <div className="space-y-2">
                    {proxMesesOrdenados.map(([mm, dados]) => (
                      <details key={mm} className="rounded-xl border border-white/[0.06] bg-slate-800/40 overflow-hidden">
                        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none hover:bg-white/[0.03] transition-colors">
                          <span className="text-sm font-bold text-slate-300 capitalize">{dados.label}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-600">{dados.items.length} item{dados.items.length !== 1 ? 's' : ''}</span>
                            <span className="text-sm font-bold text-red-400 tabular-nums">{fmt(dados.total)}</span>
                            <ChevronRight size={13} className="text-slate-600" />
                          </div>
                        </summary>
                        <div className="px-4 pb-3 space-y-1.5 border-t border-white/[0.05] pt-2">
                          {dados.items.map(i => (
                            <div key={`${i.origem}-${i.id}`} className="flex items-center gap-2 py-1.5">
                              <div className="w-1 h-1 rounded-full bg-slate-600 shrink-0" />
                              <span className="flex-1 text-sm text-slate-400 truncate">{i.fornecedor || i.descricao}</span>
                              <span className="text-sm font-bold text-slate-300 tabular-nums">{fmt(i.valor)}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <Link to="/financeiro/despesas"
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-white/[0.06] text-sm text-slate-500 hover:text-slate-300 hover:border-white/10 transition-colors">
            Gerenciar despesas e parcelas <ChevronRight size={14} />
          </Link>
        </div>
      )}

      {/* ══ POSIÇÃO ══ */}
      {aba === 'posicao' && (
        <div className="max-w-2xl mx-auto px-4 pt-5 flex flex-col gap-4">

          <Bloco titulo="Ativos" total={caixa + estoqueVal} cor="green" icon={TrendingUp}>
            <Linha label="Caixa Disponível" valor={caixa}      cor="green" sub="MP + Banco + Outros + Cofre + A Liberar" />
            <Linha label="Estoque (valor)"  valor={estoqueVal} cor="green" sub="Em casa + a chegar" />
          </Bloco>

          <Bloco titulo="Passivos — O que devo pagar" total={totalAPagar} cor="red" icon={TrendingDown} loading={loading}>
            <Linha label={`Despesas pendentes (${obrigacoes?.qtdDespesas || 0})`}
              valor={obrigacoes?.totalDespesas || 0} cor="red" sub="Fixas e operacionais — Firestore" />
            <Linha label={`Parcelas a vencer (${obrigacoes?.qtdParcelas || 0})`}
              valor={obrigacoes?.totalParcelas || 0} cor="red" sub="Compras parceladas — Firestore" />
          </Bloco>

          {(() => {
            const ativos = caixa + estoqueVal;
            const pos = ativos - totalAPagar;
            const ok = pos >= 0;
            return (
              <div className={`rounded-xl border p-5 ${ok ? 'bg-emerald-900/15 border-emerald-700/25' : 'bg-red-900/15 border-red-700/25'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Scale size={14} className={ok ? 'text-emerald-400' : 'text-red-400'} />
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Posição Líquida</p>
                </div>
                <p className={`text-5xl font-black tabular-nums ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmt(pos)}
                </p>
                <p className="text-[10px] text-slate-600 mt-1">Ativos − Passivos · fonte: 100% Firestore</p>
                <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/[0.06]">
                  <div>
                    <p className="text-[10px] text-slate-600">Total Ativos</p>
                    <p className="text-sm font-bold text-emerald-400 tabular-nums">{fmt(ativos)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-600">Total Passivos</p>
                    <p className="text-sm font-bold text-red-400 tabular-nums">{fmt(totalAPagar)}</p>
                  </div>
                </div>
              </div>
            );
          })()}

          <p className="text-[10px] text-slate-700 text-center pb-2">
            Passivos = obrigações reais do Firestore · Planilha Excel não utilizada
          </p>
        </div>
      )}

    </div>
  );
}
