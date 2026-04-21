/**
 * @file SaudeFinanceira.jsx
 * @description Dashboard "Saúde Financeira" — visão consolidada para o gestor.
 *              Inspirado no app Banco Inter: clareza, números proeminentes, dados que falam por si.
 *              Disponível (caixa + cofre + a liberar) + Estoque − Obrigações = Saldo Final
 * @version 1.0.0
 * @date 2026-04-21
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../utils/getAuthToken';
import {
  RefreshCw, Heart, Package, Banknote,
  TrendingDown, ChevronRight, AlertTriangle, Clock,
} from 'lucide-react';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

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
  const bordas   = { emerald: 'border-l-emerald-500', blue: 'border-l-blue-500', red: 'border-l-red-500' };
  const corTexto = { emerald: 'text-emerald-400',     blue: 'text-blue-400',     red: 'text-red-400'     };

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
      const [resEstoque, resDespesas] = await Promise.all([
        apiFetch('/api/fin-estoque'),
        apiFetch('/api/fin-despesas'),
      ]);

      if (resEstoque.ok) {
        const j = await resEstoque.json();
        setEstoqueEmCasa(j.dados?.totalEstoque || 0);
        setImportadoEm(j.dados?.importadoEm || null);
      }

      if (resDespesas.ok) {
        const j = await resDespesas.json();
        // Suporte a múltiplos formatos de resposta
        const lista = j.items || j.despesas || j.data || (Array.isArray(j) ? j : []);
        const total = lista
          .filter(d => d.situacao !== 'pago' && d.situacao !== 'cancelado')
          .reduce((acc, d) => acc + (parseFloat(d.valor) || 0), 0);
        setContasPagar(total);
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
  const totalDisponivel = mp + banco + outros + cofre + saldoLiberar;
  const totalEstoque    = estoqueEmCasa + estoqueChegar;
  const saldoFinal      = totalDisponivel + totalEstoque - contasPagar;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">

      {/* Header */}
      <div className="px-4 pt-6 pb-4 border-b border-white/5">
        <div className="max-w-xl mx-auto flex items-center justify-between">
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
            onClick={carregar}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40 min-h-[44px]"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

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
          <Linha label="Mercado Pago"    valor={mp}          onEdit={v => salvar('mp', v)} />
          <Linha label="Banco"           valor={banco}        onEdit={v => salvar('banco', v)} />
          <Linha label="Outros"          valor={outros}       onEdit={v => salvar('outros', v)} />
          <Linha label="Cofre"           valor={cofre}        onEdit={v => salvar('cofre', v)}
            sub="Dinheiro físico guardado" />
          <Linha label="Saldo a Liberar" valor={saldoLiberar} onEdit={v => salvar('saldoLiberar', v)}
            sub="Vendas pendentes, Pix a confirmar" />
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
          <div className="flex items-center justify-between min-h-[52px]">
            <div>
              <p className="text-sm text-slate-300">Contas a Pagar</p>
              <p className="text-[10px] text-slate-600 mt-0.5">Despesas pendentes cadastradas</p>
            </div>
            <Link
              to="/financeiro/despesas"
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors min-h-[44px] justify-end"
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
    </div>
  );
}
