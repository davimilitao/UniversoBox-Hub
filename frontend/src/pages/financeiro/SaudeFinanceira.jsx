/**
 * @file SaudeFinanceira.jsx
 * @description Dashboard "Saúde Financeira" — visão consolidada para o gestor.
 *              Inspirado no app Banco Inter: clareza, números proeminentes, dados que falam por si.
 *              Disponível (caixa + cofre + a liberar) + Estoque − Obrigações = Saldo Final
 * @version 1.1.0
 * @date 2026-04-25
 * @changelog
 *   1.1.0 (2026-04-25) — Bug fix: Obrigações agora consome /api/fin-obrigacoes (despesas + parcelas
 *                        reais). Card expandido com breakdown Despesas Pendentes / Parcelas a Vencer.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../utils/getAuthToken';
import {
  RefreshCw, Heart, Package, Banknote,
  TrendingDown, ChevronRight, AlertTriangle, Clock,
  TrendingUp, Scale, CheckCircle2, CreditCard, Loader2,
} from 'lucide-react';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// Mercado Pago rende ~100% CDI. CDI atual ≈ 10,5% a.a. → ~0,84% a.m.
// Atualizar quando o CDI mudar significativamente.
const MP_RENDIMENTO_MENSAL = 0.0084;

function horaAtual() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function diasAtras(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'hoje';
  if (d === 1) return 'ontem';
  return `há ${d} dias`;
}

// ── Input inline: clica no valor e edita ────────────────────────────────────
function ValorEditavel({ valor, onChange }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const inputRef = useRef(null);

  function iniciar() {
    setTexto(valor > 0 ? String(valor) : '');
    setEditando(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function confirmar() {
    const v = parseFloat(String(texto).replace(',', '.')) || 0;
    onChange(v);
    setEditando(false);
  }

  if (editando) {
    return (
      <input
        ref={inputRef}
        type="number"
        step="0.01"
        min="0"
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={e => {
          if (e.key === 'Enter') confirmar();
          if (e.key === 'Escape') setEditando(false);
        }}
        className="w-32 bg-slate-700/80 border border-emerald-500/50 rounded-lg px-2 py-1 text-right text-sm font-semibold text-slate-100 focus:outline-none tabular-nums"
      />
    );
  }

  return (
    <button
      onClick={iniciar}
      title="Toque para editar"
      className="text-sm font-semibold tabular-nums text-slate-200 hover:text-white rounded-lg px-2 py-1 hover:bg-white/5 transition-colors min-w-[8rem] text-right -mr-2"
    >
      {valor > 0 ? BRL.format(valor) : <span className="text-slate-600 font-normal">Toque para editar</span>}
    </button>
  );
}

// ── Linha de detalhe dentro de um card ──────────────────────────────────────
function Linha({ label, sub, valor, auto, onEdit }) {
  return (
    <div className="flex items-center justify-between min-h-[52px] py-2 border-b border-white/5 last:border-0 gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-300 leading-tight">{label}</p>
        {sub && <p className="text-[10px] text-slate-600 mt-0.5 leading-snug">{sub}</p>}
      </div>
      {auto
        ? <span className="text-sm font-semibold tabular-nums text-slate-200 shrink-0">{BRL.format(valor)}</span>
        : <ValorEditavel valor={valor} onChange={onEdit} />
      }
    </div>
  );
}

// ── Card de seção com borda colorida ────────────────────────────────────────
function CardSecao({ titulo, total, corBorda, icon: Icon, children, loadingTotal }) {
  const bordas   = { emerald: 'border-l-emerald-500', blue: 'border-l-blue-500', red: 'border-l-red-500', teal: 'border-l-teal-500' };
  const corTexto = { emerald: 'text-emerald-400',     blue: 'text-blue-400',     red: 'text-red-400',     teal: 'text-teal-400'     };

  return (
    <div className={`rounded-xl bg-slate-800 border border-white/5 border-l-4 ${bordas[corBorda]} overflow-hidden`}>
      {/* Cabeçalho */}
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={15} className={corTexto[corBorda]} />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{titulo}</span>
        </div>
        {loadingTotal
          ? <div className="h-7 w-28 rounded-lg bg-slate-700/60 animate-pulse" />
          : <span className={`text-2xl font-bold tabular-nums ${corTexto[corBorda]}`}>{BRL.format(total)}</span>
        }
      </div>
      {/* Detalhes */}
      <div className="px-5 pb-2 border-t border-white/5">
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export function SaudeFinanceira() {

  const mes = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  const [aba, setAba] = useState('painel'); // 'painel' | 'obrigacoes' | 'posicao'
  const [contas,        setContas]        = useState([]);
  const [totaisContas,  setTotaisContas]  = useState({ total: 0, vencida: 0, pendente: 0, pago: 0 });
  const [loadingContas, setLoadingContas] = useState(false);

  const carregarContas = useCallback(async () => {
    setLoadingContas(true);
    try {
      const res = await apiFetch('/api/fin-contas-unificadas');
      if (res.ok) {
        const j = await res.json();
        setContas(j.items || []);
        setTotaisContas(j.totais || { total: 0, vencida: 0, pendente: 0, pago: 0 });
      }
    } catch (e) { /* silencioso */ }
    finally { setLoadingContas(false); }
  }, []);

  useEffect(() => {
    if (aba === 'obrigacoes') carregarContas();
  }, [aba, carregarContas]);

  // ── Campos manuais em localStorage ──────────────────────────────────────────
  // Compatível com PosicaoFinanceira (mesmas chaves para mp/banco/outros)
  const [mp,            setMp]            = useState(() => parseFloat(localStorage.getItem(`painel_saldo_${mes}_mp`)     || '0') || 0);
  const [banco,         setBanco]         = useState(() => parseFloat(localStorage.getItem(`painel_saldo_${mes}_banco`)  || '0') || 0);
  const [outros,        setOutros]        = useState(() => parseFloat(localStorage.getItem(`painel_saldo_${mes}_outros`) || '0') || 0);
  const [cofre,         setCofre]         = useState(() => parseFloat(localStorage.getItem('saude_cofre')                || '0') || 0);
  const [saldoLiberar,  setSaldoLiberar]  = useState(() => parseFloat(localStorage.getItem('saude_saldo_liberar')        || '0') || 0);
  const [estoqueChegar, setEstoqueChegar] = useState(() => parseFloat(localStorage.getItem('saude_estoque_chegar')       || '0') || 0);

  // ── Dados do sistema ─────────────────────────────────────────────────────────
  const [estoqueEmCasa,  setEstoqueEmCasa]  = useState(0);
  const [importadoEm,    setImportadoEm]    = useState(null);
  const [contasPagar,    setContasPagar]    = useState(0);
  const [totalDespesas,  setTotalDespesas]  = useState(0);
  const [totalParcelas,  setTotalParcelas]  = useState(0);
  const [qtdDespesas,    setQtdDespesas]    = useState(0);
  const [qtdParcelas,    setQtdParcelas]    = useState(0);
  const [receber7,       setReceber7]       = useState(0);
  const [receber15,      setReceber15]      = useState(0);
  const [receber30,      setReceber30]      = useState(0);
  const [loading,        setLoading]        = useState(true);
  const [erro,           setErro]           = useState(null);
  const [atualizadoAs,   setAtualizadoAs]   = useState(horaAtual);

  function salvar(campo, valor) {
    switch (campo) {
      case 'mp':            localStorage.setItem(`painel_saldo_${mes}_mp`,     valor); setMp(valor);            break;
      case 'banco':         localStorage.setItem(`painel_saldo_${mes}_banco`,  valor); setBanco(valor);         break;
      case 'outros':        localStorage.setItem(`painel_saldo_${mes}_outros`, valor); setOutros(valor);        break;
      case 'cofre':         localStorage.setItem('saude_cofre',                valor); setCofre(valor);         break;
      case 'saldoLiberar':  localStorage.setItem('saude_saldo_liberar',        valor); setSaldoLiberar(valor);  break;
      case 'estoqueChegar': localStorage.setItem('saude_estoque_chegar',       valor); setEstoqueChegar(valor); break;
    }
  }

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [resEstoque, resObrigacoes, resReceber] = await Promise.all([
        apiFetch('/api/fin-estoque'),
        apiFetch('/api/fin-obrigacoes'),
        apiFetch('/api/fin-recebiveis?status=previsto'),
      ]);

      if (resEstoque.ok) {
        const j = await resEstoque.json();
        setEstoqueEmCasa(j.dados?.totalEstoque || 0);
        setImportadoEm(j.dados?.importadoEm || null);
      }

      if (resObrigacoes.ok) {
        const j = await resObrigacoes.json();
        setContasPagar(j.totalObrigacoes || 0);
        setTotalDespesas(j.totalDespesas || 0);
        setTotalParcelas(j.totalParcelas || 0);
        setQtdDespesas(j.qtdDespesas || 0);
        setQtdParcelas(j.qtdParcelas || 0);
      }

      if (resReceber.ok) {
        const j = await resReceber.json();
        const lista = j.items || [];
        const agora = Date.now();
        const somaAte = (dias) => lista
          .filter(r => {
            const d = Math.ceil((new Date(r.dataPrevista).getTime() - agora) / 86400000);
            return d <= dias; // inclui atrasados (d < 0) e futuros até N dias
          })
          .reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);
        setReceber7(somaAte(7));
        setReceber15(somaAte(15));
        setReceber30(somaAte(30));
      }
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
      setAtualizadoAs(horaAtual());
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Cálculos ─────────────────────────────────────────────────────────────────
  const totalDisponivel  = mp + banco + outros + cofre + saldoLiberar;
  const totalEstoque     = estoqueEmCasa + estoqueChegar;
  const saldoFinal       = totalDisponivel + totalEstoque - contasPagar;
  const rendimentoMp30d  = mp > 0 ? mp * MP_RENDIMENTO_MENSAL : 0;
  // Projetado inclui "A Receber 30 dias" (entrada prevista no caixa)
  const saldoProjetado   = saldoFinal + receber30;

  // ── Helpers para a lista de obrigações ──────────────────────────────────────
  function statusCls(s) {
    if (s === 'vencida')  return 'text-red-400';
    if (s === 'pendente') return 'text-yellow-400';
    return 'text-emerald-400';
  }
  function statusLabel(s, dias) {
    if (s === 'pago') return 'Pago';
    if (s === 'vencida') return `${Math.abs(dias)}d atraso`;
    if (dias === 0) return 'Vence hoje';
    return `${dias}d`;
  }
  function origemLabel(o) {
    return o === 'parcela' ? 'Parcela' : 'Despesa';
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  const ABAS = [
    { id: 'painel',      label: 'Painel'      },
    { id: 'obrigacoes',  label: 'Obrigações'  },
    { id: 'posicao',     label: 'Posição'     },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">

      {/* Header */}
      <div className="px-4 pt-6 pb-0 border-b border-white/5">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Heart size={16} className="text-emerald-400" />
                Saúde Financeira
              </h1>
              <p className="text-[11px] text-slate-600 mt-0.5 flex items-center gap-1">
                <Clock size={10} />
                Atualizado às {atualizadoAs}
              </p>
            </div>
            <button
              onClick={() => { carregar(); if (aba === 'obrigacoes') carregarContas(); }}
              disabled={loading || loadingContas}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40 min-h-[44px]"
            >
              <RefreshCw size={13} className={(loading || loadingContas) ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>
          {/* Tabs */}
          <div className="flex gap-0.5 bg-slate-900/60 rounded-t-xl p-1">
            {ABAS.map(a => (
              <button key={a.id} onClick={() => setAba(a.id)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  aba === a.id
                    ? 'bg-slate-800 text-slate-100 shadow'
                    : 'text-slate-600 hover:text-slate-400'
                }`}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══ ABA: PAINEL ══ */}
      {aba === 'painel' && (
      <div className="max-w-xl mx-auto px-4 pt-5 flex flex-col gap-4">

        {/* Erro */}
        {erro && (
          <div className="rounded-xl bg-red-900/20 border border-red-700/30 p-3 flex items-center gap-2.5">
            <AlertTriangle size={14} className="text-red-400 shrink-0" />
            <p className="text-xs text-red-300">{erro}</p>
          </div>
        )}

        {/* ── DISPONÍVEL ── */}
        <CardSecao titulo="Disponível" total={totalDisponivel} corBorda="emerald" icon={Banknote}>
          <Linha
            label="Mercado Pago"
            sub={mp > 0 ? `Rendimento est. 30d: +${BRL.format(rendimentoMp30d)} (~0,84% CDI)` : undefined}
            valor={mp}
            onEdit={v => salvar('mp', v)}
          />
          <Linha label="Banco"           valor={banco}        onEdit={v => salvar('banco', v)} />
          <Linha label="Outros"          valor={outros}       onEdit={v => salvar('outros', v)} />
          <Linha label="Cofre"           valor={cofre}        onEdit={v => salvar('cofre', v)}
            sub="Dinheiro físico guardado" />
          <Linha label="Saldo a Liberar" valor={saldoLiberar} onEdit={v => salvar('saldoLiberar', v)}
            sub="Vendas pendentes, Pix a confirmar" />
        </CardSecao>

        {/* ── A RECEBER ── */}
        <CardSecao titulo="A Receber (30 dias)" total={receber30} corBorda="teal" icon={TrendingUp} loadingTotal={loading}>
          <div className="flex items-center justify-between min-h-[52px]">
            <div className="flex-1 grid grid-cols-3 gap-2 mr-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">7 dias</p>
                <p className="text-sm font-semibold tabular-nums text-teal-300">{BRL.format(receber7)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">15 dias</p>
                <p className="text-sm font-semibold tabular-nums text-teal-300">{BRL.format(receber15)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">30 dias</p>
                <p className="text-sm font-semibold tabular-nums text-teal-300">{BRL.format(receber30)}</p>
              </div>
            </div>
            <Link
              to="/financeiro/recebiveis"
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors min-h-[44px] justify-end shrink-0"
            >
              Gerenciar
              <ChevronRight size={13} />
            </Link>
          </div>
        </CardSecao>

        {/* ── ESTOQUE ── */}
        <CardSecao titulo="Estoque" total={totalEstoque} corBorda="blue" icon={Package} loadingTotal={loading}>
          <Linha
            label="Em Casa"
            sub={
              loading ? 'Carregando...'
              : importadoEm ? `Importado ${diasAtras(importadoEm)} · atualize em Posição Financeira`
              : 'Importe o CSV do Bling em Posição Financeira'
            }
            valor={estoqueEmCasa}
            auto
          />
          <Linha
            label="A Chegar"
            sub="Compras realizadas ainda não entregues"
            valor={estoqueChegar}
            onEdit={v => salvar('estoqueChegar', v)}
          />
        </CardSecao>

        {/* ── OBRIGAÇÕES ── */}
        <CardSecao titulo="Obrigações" total={contasPagar} corBorda="red" icon={TrendingDown} loadingTotal={loading}>
          <Linha
            label={qtdDespesas > 0 ? `Despesas Pendentes (${qtdDespesas})` : 'Despesas Pendentes'}
            sub="Fixas e operacionais"
            valor={loading ? 0 : totalDespesas}
            auto
          />
          <Linha
            label={qtdParcelas > 0 ? `Parcelas a Vencer (${qtdParcelas})` : 'Parcelas a Vencer'}
            sub="Compras parceladas"
            valor={loading ? 0 : totalParcelas}
            auto
          />
          <div className="flex justify-end pt-1 pb-0.5">
            <Link
              to="/financeiro/despesas"
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors min-h-[36px]"
            >
              Ver detalhes
              <ChevronRight size={13} />
            </Link>
          </div>
        </CardSecao>

        {/* ── SALDO FINAL ── */}
        <div className={`rounded-xl border p-5 ${
          saldoFinal >= 0
            ? 'bg-emerald-900/20 border-emerald-700/30'
            : 'bg-red-900/20 border-red-700/30'
        }`}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Saldo Final</p>
          <p className={`text-4xl font-black tabular-nums leading-none ${saldoFinal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {BRL.format(saldoFinal)}
          </p>
          <p className="text-[10px] text-slate-600 mt-2">Disponível + Estoque − Obrigações</p>

          {/* Projetado (inclui A Receber 30d) */}
          {receber30 > 0 && (
            <div className="mt-3 pt-3 border-t border-white/5 flex items-baseline justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Projetado em 30 dias</p>
                <p className="text-[10px] text-slate-600">+ A Receber {BRL.format(receber30)}</p>
              </div>
              <p className={`text-xl font-bold tabular-nums ${saldoProjetado >= 0 ? 'text-teal-300' : 'text-red-400'}`}>
                {BRL.format(saldoProjetado)}
              </p>
            </div>
          )}

          {/* Mini resumo */}
          <div className="flex gap-0 mt-4 pt-4 border-t border-white/5 -mx-0">
            <div className="flex-1 text-center">
              <p className="text-[10px] text-slate-600 mb-1">Disponível</p>
              <p className="text-sm font-bold text-emerald-400 tabular-nums">{BRL.format(totalDisponivel)}</p>
            </div>
            <div className="w-px bg-white/5" />
            <div className="flex-1 text-center">
              <p className="text-[10px] text-slate-600 mb-1">Estoque</p>
              <p className="text-sm font-bold text-blue-400 tabular-nums">{BRL.format(totalEstoque)}</p>
            </div>
            <div className="w-px bg-white/5" />
            <div className="flex-1 text-center">
              <p className="text-[10px] text-slate-600 mb-1">Obrigações</p>
              <p className="text-sm font-bold text-red-400 tabular-nums">{BRL.format(contasPagar)}</p>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-slate-700 text-center pb-2">
          Valores manuais salvos neste dispositivo · Estoque e contas via sistema
        </p>

      </div>
      )}

      {/* ══ ABA: OBRIGAÇÕES ══ */}
      {aba === 'obrigacoes' && (
      <div className="max-w-xl mx-auto px-4 pt-5 flex flex-col gap-4">

        {/* Totais rápidos */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Vencidas',  valor: totaisContas.vencida,  cor: 'red'    },
            { label: 'Pendentes', valor: totaisContas.pendente, cor: 'yellow' },
            { label: 'Pagas',     valor: totaisContas.pago,     cor: 'emerald'},
          ].map(k => (
            <div key={k.label} className="rounded-xl bg-slate-800 border border-white/5 p-3 text-center">
              <p className="text-[10px] text-slate-500 mb-1">{k.label}</p>
              <p className={`text-sm font-bold tabular-nums text-${k.cor}-400`}>{BRL.format(k.valor)}</p>
            </div>
          ))}
        </div>

        {/* Lista unificada */}
        {loadingContas ? (
          <div className="flex justify-center py-12">
            <Loader2 size={20} className="animate-spin text-slate-600" />
          </div>
        ) : contas.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2 text-slate-700">
            <CheckCircle2 size={36} className="opacity-30" />
            <p className="text-sm">Nenhuma obrigação encontrada</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {contas.map(item => (
              <div key={`${item.origem}-${item.id}`}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                  item.status === 'vencida'  ? 'border-red-500/20 bg-red-500/[0.03]' :
                  item.status === 'pendente' ? 'border-white/[0.06] bg-slate-800/50' :
                  'border-white/[0.04] opacity-60 bg-slate-900/30'
                }`}>
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  item.status === 'vencida'  ? 'bg-red-400 animate-pulse' :
                  item.status === 'pendente' ? 'bg-yellow-400' : 'bg-emerald-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-slate-200 truncate">{item.fornecedor || item.descricao}</span>
                    <span className="text-[10px] text-slate-600 rounded px-1 bg-slate-700/50">
                      {item.origem === 'parcela' ? 'Parcela' : item.tipo === 'mensal_fixa' ? 'Fixa' : 'Operac.'}
                    </span>
                  </div>
                  {item.descricao && item.descricao !== item.fornecedor && (
                    <p className="text-[10px] text-slate-600 truncate">{item.descricao}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-white tabular-nums">{BRL.format(item.valor)}</p>
                  <p className={`text-[10px] font-mono font-bold ${statusCls(item.status)}`}>
                    {statusLabel(item.status, item.diasParaVencer)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* ══ ABA: POSIÇÃO ══ */}
      {aba === 'posicao' && (
      <div className="max-w-xl mx-auto px-4 pt-5 flex flex-col gap-4">

        {/* Ativos */}
        <CardSecao titulo="Ativos" total={totalDisponivel + totalEstoque} corBorda="emerald" icon={TrendingUp}>
          <Linha label="Disponível (caixa)"  valor={totalDisponivel} auto
            sub="Mercado Pago + Banco + Outros + Cofre + A Liberar" />
          <Linha label="Estoque (valor)"     valor={totalEstoque}    auto
            sub="Em casa + a chegar" />
        </CardSecao>

        {/* Passivos = Obrigações (Firestore, mesma fonte que aba Obrigações) */}
        <CardSecao titulo="Passivos (Obrigações)" total={contasPagar} corBorda="red" icon={TrendingDown} loadingTotal={loading}>
          <Linha label={`Despesas pendentes (${qtdDespesas})`} valor={totalDespesas} auto
            sub="Fixas e operacionais — fonte Firestore" />
          <Linha label={`Parcelas a vencer (${qtdParcelas})`}  valor={totalParcelas} auto
            sub="Compras parceladas — fonte Firestore" />
        </CardSecao>

        {/* Posição Líquida */}
        {(() => {
          const ativos   = totalDisponivel + totalEstoque;
          const positivo = ativos - contasPagar >= 0;
          return (
            <div className={`rounded-xl border p-5 ${positivo ? 'bg-emerald-900/20 border-emerald-700/30' : 'bg-red-900/20 border-red-700/30'}`}>
              <div className="flex items-center gap-2 mb-3">
                <Scale size={15} className={positivo ? 'text-emerald-400' : 'text-red-400'} />
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Posição Líquida</p>
              </div>
              <p className={`text-4xl font-black tabular-nums leading-none ${positivo ? 'text-emerald-400' : 'text-red-400'}`}>
                {BRL.format(ativos - contasPagar)}
              </p>
              <p className="text-[10px] text-slate-600 mt-2">Ativos − Passivos (tudo via Firestore)</p>
              <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-slate-600">Total Ativos</p>
                  <p className="text-sm font-bold text-emerald-400 tabular-nums">{BRL.format(ativos)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-600">Total Passivos</p>
                  <p className="text-sm font-bold text-red-400 tabular-nums">{BRL.format(contasPagar)}</p>
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
