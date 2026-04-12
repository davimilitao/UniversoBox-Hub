/**
 * @file GestaoFinanceira.jsx
 * @module financeiro
 * @description Tela unificada do módulo Financeiro — fusão de GestaoDespesas.jsx e Contas.jsx.
 *              4 abas: Lançamentos | Contas a Pagar | Parcelas | Cartões.
 *              Cada aba contém um HelpBanner colapsável com guia de uso.
 * @version 1.0.0
 * @date 2026-04-12
 * @changelog
 *   1.0.0 — 2026-04-12 — Criação: fusão de GestaoDespesas 2.0 + Contas 2.0.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  TrendingUp, AlertTriangle, Clock, Calendar, CheckCircle2,
  AlertCircle, CreditCard, Plus, Loader2,
  RefreshCw, MessageCircle, Copy, Check, ChevronLeft,
  ChevronRight, X, RotateCcw,
} from 'lucide-react';

import {
  useFinDespesas, computarStatusEfetivo, extrairMesesFin, labelMesAnoTs,
} from '../../hooks/useFinDespesas';
import { useCompras }        from '../../hooks/useCompras';
import { useMeiosPagamento } from '../../hooks/useMeiosPagamento';
import { apiFetch }          from '../../utils/getAuthToken';

import {
  brl, labelMesAtual, diasParaVencer, urgencyColor, urgencyBg,
  fmtData, fmtDataCurta, fmtMesAno, labelMes, checkAdmin,
} from '../../utils/financeiroUtils';

import { FiltrosBar }        from './components/FiltrosBar';
import { ResumoCards }       from './components/ResumoCards';
import { GraficoBarras }     from './components/GraficoBarras';
import { GraficoPizza }      from './components/GraficoPizza';
import { FormLancarDespesa } from './components/FormLancarDespesa';
import { TabelaDespesas }    from './components/TabelaDespesas';
import { ContasDespesas }    from './components/ContasDespesas';
import { FormNovaCompra }    from './components/FormNovaCompra';
import MeiosPagamento        from './components/MeiosPagamento';
import { HelpBanner }        from './components/HelpBanner';

// ─── Helpers locais ───────────────────────────────────────────────────────────

function Skeleton({ h = 'h-32' }) {
  return <div className={`rounded-xl bg-slate-800 border border-white/5 animate-pulse ${h}`} />;
}

function Toast({ msg, tipo }) {
  if (!msg) return null;
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border
      ${tipo === 'ok'
        ? 'bg-emerald-900/90 border-emerald-600 text-emerald-300'
        : 'bg-red-900/90 border-red-600 text-red-300'
      }`}>
      {msg}
    </div>
  );
}

function TabBtn({ id, label, badge, ativo, onClick }) {
  const isAtivo = ativo === id;
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
        isAtivo
          ? 'border-emerald-500 text-emerald-400'
          : 'border-transparent text-slate-500 hover:text-slate-300'
      }`}
    >
      {label}
      {badge > 0 && (
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
          isAtivo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── KPI Card (para aba Parcelas) ─────────────────────────────────────────────
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

// ─── Formatador para WhatsApp (parcelas) ──────────────────────────────────────
function fmtWhatsContas(parcelas) {
  const linhas = parcelas.map(p => {
    const parc = p.totalParcelas > 1 ? ` (${p.numeroParcela}/${p.totalParcelas}x)` : '';
    return `• ${p.fornecedor}${parc} — ${p.descricao || ''} | *${brl(p.valor)}* | ${fmtDataCurta(p.vencimento)} | ${p.meioNome}`
      .replace(/\s—\s$/, '');
  });
  const total = parcelas.reduce((s, p) => s + (p.valor || 0), 0);
  return `*Contas selecionadas*\n${linhas.join('\n')}\n\n*Total: ${brl(total)}*`;
}

// ─── Aba Parcelas ─────────────────────────────────────────────────────────────
function AbaParcelas({ parcelas, loading, saving, meios, lancarCompra, marcarPago, desfazerPagamento, getResumo, reload }) {
  const [filtroStatus, setFiltroStatus] = useState('pendentes');
  const [meioFiltro,   setMeioFiltro]   = useState('todos');
  const [mesAtivo,     setMesAtivo]     = useState('');
  const [selecionados, setSelecionados] = useState(new Set());
  const [copiado,      setCopiado]      = useState(false);
  const [mostraForm,   setMostraForm]   = useState(false);

  const meses = useMemo(() => {
    const map = new Map();
    parcelas.forEach(p => {
      const k = labelMes(p.vencimento);
      if (k && !map.has(k)) {
        map.set(k, { key: k, label: fmtMesAno(p.vencimento), ts: p.vencimento?.toDate?.()?.getTime() || 0 });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.ts - b.ts);
  }, [parcelas]);

  const mesEfetivo = useMemo(() => {
    if (mesAtivo) return mesAtivo;
    const hoje = new Date();
    const chaveHoje = `${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
    return meses.find(m => m.key === chaveHoje)?.key || meses[0]?.key || '';
  }, [mesAtivo, meses]);

  const idxMes = meses.findIndex(m => m.key === mesEfetivo);

  const listaFiltrada = useMemo(() => parcelas.filter(p => {
    const passStatus = filtroStatus === 'todos' ? true
      : filtroStatus === 'pendentes' ? p.status === 'pendente'
      : p.status === 'pago';
    const passMeio = meioFiltro === 'todos' || p.meioId === meioFiltro;
    const passMes  = !mesEfetivo || labelMes(p.vencimento) === mesEfetivo;
    return passStatus && passMeio && passMes;
  }), [parcelas, filtroStatus, meioFiltro, mesEfetivo]);

  const totaisPorMeio = useMemo(() => {
    const map = {};
    parcelas.filter(p => p.status === 'pendente').forEach(p => {
      if (!p.meioId) return;
      map[p.meioId] = (map[p.meioId] || 0) + (p.valor || 0);
    });
    return map;
  }, [parcelas]);

  const resumo           = getResumo();
  const itensSelecionados = listaFiltrada.filter(p => selecionados.has(p.id));
  const totalSelecionado  = itensSelecionados.reduce((s, p) => s + (p.valor || 0), 0);

  function toggleItem(id) {
    setSelecionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleTodos() {
    setSelecionados(selecionados.size === listaFiltrada.length ? new Set() : new Set(listaFiltrada.map(p => p.id)));
  }
  function compartilharWhats() {
    window.open(`https://wa.me/?text=${encodeURIComponent(fmtWhatsContas(itensSelecionados))}`, '_blank');
  }
  async function copiarTexto() {
    await navigator.clipboard.writeText(fmtWhatsContas(itensSelecionados)).catch(() => {});
    setCopiado(true); setTimeout(() => setCopiado(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-slate-600">
        <Loader2 size={20} className="animate-spin" /> Carregando parcelas…
      </div>
    );
  }

  return (
    <div className="space-y-4">

      <HelpBanner
        abaId="parcelas"
        titulo="Parcelas e Investimentos"
        itens={[
          'Lista todas as parcelas de compras de mercadoria e investimentos parcelados.',
          'Investimentos lançados em "Lançamentos" com tipo Investimento aparecem aqui automaticamente.',
          'Selecione múltiplas parcelas e compartilhe via WhatsApp para consulta rápida.',
          'Use "+ Nova Compra" para lançar uma compra parcelada diretamente, sem passar por Lançamentos.',
        ]}
        dica="Marcar uma parcela como paga libera o limite do cartão associado automaticamente."
      />

      {/* Botão Nova Compra */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setMostraForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/10 hover:bg-emerald-600 border border-emerald-500/20 hover:border-emerald-500 text-emerald-400 hover:text-white text-xs font-bold transition-all"
        >
          <Plus size={13} /> Nova Compra
        </button>
        <button onClick={() => { reload(); setSelecionados(new Set()); }}
          className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-400 transition-colors">
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      {/* Form Nova Compra (colapsável) */}
      {mostraForm && (
        meios.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-600 border border-white/[0.06] rounded-xl">
            <CreditCard size={32} className="opacity-30" />
            <p className="text-sm">Cadastre um cartão primeiro na aba Cartões</p>
          </div>
        ) : (
          <div className="rounded-xl bg-slate-900 border border-white/[0.06] p-5">
            <FormNovaCompra
              meios={meios}
              lancarCompra={lancarCompra}
              saving={saving}
              onSucesso={() => setMostraForm(false)}
            />
          </div>
        )
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Vencido"      value={brl(resumo.vencidas.total)} sub={`${resumo.vencidas.items.length} parcela(s)`}  color="red"     Icon={AlertTriangle} />
        <KpiCard label="Vence Hoje"   value={brl(resumo.hoje.total)}     sub={`${resumo.hoje.items.length} parcela(s)`}      color="yellow"  Icon={Clock} />
        <KpiCard label="Próx. 7 dias" value={brl(resumo.semana.total)}   sub={`${resumo.semana.items.length} parcela(s)`}    color="blue"    Icon={Calendar} />
        <KpiCard label="Total pago"   value={brl(resumo.totalPago)}      sub="histórico"                                     color="emerald" Icon={CheckCircle2} />
      </div>

      {/* Filtros por cartão */}
      {meios.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">Cartão:</span>
          <button onClick={() => setMeioFiltro('todos')}
            className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
              meioFiltro === 'todos'
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'bg-slate-800 border-white/[0.07] text-slate-500 hover:text-slate-300'
            }`}>
            Todos {meioFiltro === 'todos' && `· ${brl(resumo.totalPendente)}`}
          </button>
          {meios.map(m => {
            const total = totaisPorMeio[m.id] || 0;
            const ativo = meioFiltro === m.id;
            return (
              <button key={m.id} onClick={() => setMeioFiltro(ativo ? 'todos' : m.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
                  ativo
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-800 border-white/[0.07] text-slate-500 hover:text-slate-300'
                }`}>
                <CreditCard size={10} />
                {m.nome}
                {total > 0 && <span className={ativo ? 'opacity-80' : 'text-slate-600'}> · {brl(total)}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Navegação de mês + status */}
      <div className="flex items-center gap-3 flex-wrap">
        {meses.length > 0 && (
          <div className="flex items-center gap-1 bg-slate-900 border border-white/[0.07] rounded-xl px-1 py-1">
            <button onClick={() => { const i = idxMes - 1; if (i >= 0) setMesAtivo(meses[i].key); }}
              disabled={idxMes <= 0}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] disabled:opacity-20 transition-all">
              <ChevronLeft size={14} />
            </button>
            <select value={mesEfetivo} onChange={e => setMesAtivo(e.target.value)}
              className="bg-slate-900 text-slate-100 text-sm font-bold px-2 py-1 outline-none cursor-pointer min-w-[100px] text-center [color-scheme:dark]">
              {meses.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <button onClick={() => { const i = idxMes + 1; if (i < meses.length) setMesAtivo(meses[i].key); }}
              disabled={idxMes >= meses.length - 1}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] disabled:opacity-20 transition-all">
              <ChevronRight size={14} />
            </button>
          </div>
        )}
        <div className="flex bg-slate-900 border border-white/[0.05] rounded-xl p-0.5 gap-0.5">
          {[
            { id: 'pendentes', label: 'Pendentes' },
            { id: 'pagos',     label: 'Pagos'     },
            { id: 'todos',     label: 'Todos'     },
          ].map(f => (
            <button key={f.id} onClick={() => setFiltroStatus(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filtroStatus === f.id ? 'bg-white/[0.08] text-slate-100' : 'text-slate-600 hover:text-slate-400'
              }`}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Lista de parcelas */}
      {listaFiltrada.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-700">
          <CheckCircle2 size={40} className="opacity-30" />
          <p className="text-sm">Nenhuma parcela para os filtros selecionados</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 px-4 py-1.5">
            <input type="checkbox"
              checked={selecionados.size === listaFiltrada.length && listaFiltrada.length > 0}
              onChange={toggleTodos}
              className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer" />
            <span className="text-[10px] text-slate-600">Selecionar todos ({listaFiltrada.length})</span>
          </div>

          {listaFiltrada.map(p => {
            const dias     = diasParaVencer(p.vencimento);
            const pago     = p.status === 'pago';
            const selected = selecionados.has(p.id);
            return (
              <div key={p.id}
                onClick={() => toggleItem(p.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                  selected ? 'border-emerald-500/30 bg-emerald-500/[0.05]' :
                  pago ? 'border-white/[0.04] opacity-60' : urgencyBg(dias)
                }`}
                style={{ background: selected ? undefined : 'var(--bg-surface, #0f172a)' }}>

                <input type="checkbox" checked={selected} onChange={() => toggleItem(p.id)}
                  onClick={e => e.stopPropagation()}
                  className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer shrink-0" />

                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  pago ? 'bg-emerald-500' :
                  dias !== null && dias < 0 ? 'bg-red-400 animate-pulse' :
                  dias === 0 ? 'bg-orange-400 animate-pulse' : 'bg-slate-600'
                }`} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-slate-200 truncate">{p.fornecedor}</span>
                    {p.totalParcelas > 1 && (
                      <span className="text-[10px] text-slate-600 font-mono">{p.numeroParcela}/{p.totalParcelas}x</span>
                    )}
                    {p.descricao && <span className="text-[10px] text-slate-600 truncate">{p.descricao}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] text-slate-600">{p.meioNome || p.meioBandeira}</span>
                    <span className={`text-[10px] font-mono font-bold ${urgencyColor(dias)}`}>
                      {pago ? `Pago ${fmtDataCurta(p.paidAt)}` :
                        dias === null ? '—' :
                        dias < 0 ? `${Math.abs(dias)}d atraso` :
                        dias === 0 ? 'Vence HOJE' :
                        `${dias}d · ${fmtDataCurta(p.vencimento)}`}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-white tabular-nums">{brl(p.valor)}</p>
                  <p className="text-[10px] text-slate-600">{fmtData(p.vencimento)}</p>
                </div>

                <div onClick={e => e.stopPropagation()}>
                  {!pago ? (
                    <button onClick={() => marcarPago(p.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600/10 hover:bg-emerald-600 border border-emerald-500/20 hover:border-emerald-500 text-emerald-400 hover:text-white text-[10px] font-bold transition-all">
                      <CheckCircle2 size={12} /> Pago
                    </button>
                  ) : (
                    <button onClick={() => desfazerPagamento(p.id)}
                      className="p-1.5 rounded-lg text-slate-700 hover:text-slate-400 hover:bg-white/[0.05] transition-colors">
                      <RotateCcw size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Toolbar de seleção em lote */}
      {selecionados.size > 0 && (
        <div className="sticky bottom-4 mx-auto max-w-xl animate-fade-in">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-emerald-500/30 shadow-2xl shadow-black/60"
            style={{ background: 'var(--bg-surface, #0f172a)' }}>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500">{selecionados.size} item{selecionados.size !== 1 ? 's' : ''}</p>
              <p className="text-base font-black text-white tabular-nums">{brl(totalSelecionado)}</p>
            </div>
            <button onClick={compartilharWhats}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs transition-all active:scale-95">
              <MessageCircle size={13} /> WhatsApp
            </button>
            <button onClick={copiarTexto}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs transition-all">
              {copiado ? <><Check size={13} className="text-emerald-400" /> Copiado!</> : <><Copy size={13} /> Copiar</>}
            </button>
            <button onClick={() => setSelecionados(new Set())}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-300 hover:bg-white/[0.05] transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Funções auxiliares de categorias/tipos ────────────────────────────────────
function extrairCategorias(despesas) {
  const set = new Set(despesas.map(d => d.categoria).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
function extrairTipos(despesas) {
  return Array.from(new Set(despesas.map(d => d.tipo).filter(Boolean)));
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function GestaoFinanceira() {
  // ── Dados de despesas (fin_despesas)
  const { despesas, loading: loadingDesp, error: errorDesp } = useFinDespesas();

  // ── Dados de parcelas (fin_compras + fin_parcelas)
  const {
    parcelas, loading: loadingParcelas, saving,
    lancarCompra, marcarPago, desfazerPagamento, getResumo, reload,
  } = useCompras();

  // ── Meios de pagamento
  const { meios: meiosPagamento } = useMeiosPagamento();

  // ── Abas
  const [aba, setAba] = useState('lancamentos');

  // ── Filtros (aba Lançamentos)
  const [mesAtivo,       setMesAtivo]       = useState('');
  const [tipoAtivo,      setTipoAtivo]      = useState('all');
  const [categoriaAtiva, setCategoriaAtiva] = useState('all');
  const [statusAtivo,    setStatusAtivo]    = useState('all');

  // ── UI
  const [salvando, setSalvando] = useState(false);
  const [toast,    setToast]    = useState({ msg: '', tipo: 'ok' });
  const isAdmin = checkAdmin();

  // ── Despesas com statusEfetivo calculado
  const despesasComStatus = useMemo(
    () => despesas.map(d => ({ ...d, statusEfetivo: computarStatusEfetivo(d) })),
    [despesas],
  );

  const meses      = useMemo(() => extrairMesesFin(despesasComStatus), [despesasComStatus]);
  const categorias = useMemo(() => extrairCategorias(despesasComStatus), [despesasComStatus]);
  const tipos      = useMemo(() => extrairTipos(despesasComStatus), [despesasComStatus]);

  const mesAtualLabel = useMemo(() => labelMesAtual(), []);

  const mesEfetivo = mesAtivo || meses.find(m => m.label === mesAtualLabel)?.label || meses[0]?.label || '';

  const despesasMes = useMemo(() => {
    if (!mesEfetivo) return despesasComStatus;
    return despesasComStatus.filter(d => labelMesAnoTs(d.timestamp) === mesEfetivo);
  }, [despesasComStatus, mesEfetivo]);
  const despesasMesAtual = useMemo(
    () => despesasComStatus.filter(d => labelMesAnoTs(d.timestamp) === mesAtualLabel),
    [despesasComStatus, mesAtualLabel],
  );

  const despesasFiltradas = useMemo(() => despesasMes.filter(d => {
    if (categoriaAtiva !== 'all' && d.categoria !== categoriaAtiva) return false;
    if (tipoAtivo !== 'all' && d.tipo !== tipoAtivo) return false;
    if (statusAtivo !== 'all' && d.statusEfetivo !== statusAtivo) return false;
    return true;
  }), [despesasMes, categoriaAtiva, tipoAtivo, statusAtivo]);

  // Badges das abas
  const nContasPagar = useMemo(
    () => despesasMesAtual.filter(d => d.statusEfetivo !== 'pago' && d.tipo !== 'investimento').length,
    [despesasMesAtual],
  );
  const resumoParcelas  = getResumo();
  const nParcelasVencidas = resumoParcelas.vencidas.items.length;

  // ── Toast helper
  function showToast(msg, tipo = 'ok') {
    setToast({ msg, tipo });
    setTimeout(() => setToast({ msg: '', tipo: 'ok' }), 3000);
  }

  // ── Handlers despesas
  const handleSalvar = useCallback(async (payload) => {
    setSalvando(true);
    try {
      const res = await apiFetch('/api/fin-despesas', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('Despesa lançada!', 'ok');
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'erro');
    } finally {
      setSalvando(false);
    }
  }, []);

  const handleToggleStatus = useCallback(async (id, novaSituacao) => {
    try {
      const res = await apiFetch(`/api/fin-despesas/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ situacao: novaSituacao }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'erro');
    }
  }, []);

  const handleDelete = useCallback(async (id) => {
    try {
      const res = await apiFetch(`/api/fin-despesas/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      showToast('Despesa removida.', 'ok');
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'erro');
    }
  }, []);

  // ── Render: loading inicial (apenas despesas, parcelas carregam em paralelo)
  if (loadingDesp) {
    return (
      <div className="p-6 flex flex-col gap-4">
        <Skeleton h="h-10" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} h="h-24" />)}
        </div>
        <Skeleton h="h-64" />
      </div>
    );
  }

  if (errorDesp) {
    return (
      <div className="p-6 flex items-center gap-3 text-red-400">
        <AlertCircle size={20} />
        <p className="text-sm">Erro ao carregar despesas: {errorDesp}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      <Toast msg={toast.msg} tipo={toast.tipo} />

      {/* ── Header com tabs ──────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-0 flex flex-col gap-1">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={18} className="text-emerald-400" />
          <h1 className="text-base font-bold text-slate-200">Financeiro</h1>
        </div>
        <div className="flex border-b border-white/[0.08] overflow-x-auto">
          <TabBtn id="lancamentos" label="Lançamentos"     ativo={aba} onClick={setAba} />
          <TabBtn id="contas"      label="Contas a Pagar"  badge={nContasPagar}      ativo={aba} onClick={setAba} />
          <TabBtn id="parcelas"    label="Parcelas"        badge={nParcelasVencidas}  ativo={aba} onClick={setAba} />
          <TabBtn id="cartoes"     label="Cartões"         badge={meiosPagamento.length} ativo={aba} onClick={setAba} />
        </div>
      </div>

      {/* ── Aba Lançamentos ──────────────────────────────────────────────────── */}
      {aba === 'lancamentos' && (
        <div className="p-6 flex flex-col gap-5">
          <HelpBanner
            abaId="lancamentos"
            titulo="Lançamentos de Despesas"
            itens={[
              'Registre aqui todas as despesas: fixas mensais, operacionais e investimentos.',
              'Despesas do tipo Investimento criam parcelas automaticamente na aba Parcelas.',
              'Use /comprovante no Claude para lançar a partir de um PDF de comprovante.',
            ]}
            dica="Filtros de mês, tipo, categoria e status ficam ativos enquanto a aba está aberta."
          />

          <FiltrosBar
            meses={meses}         mesAtivo={mesEfetivo}      onMes={setMesAtivo}
            tipos={tipos}         tipoAtivo={tipoAtivo}      onTipo={setTipoAtivo}
            categorias={categorias} categoriaAtiva={categoriaAtiva} onCategoria={setCategoriaAtiva}
            statusAtivo={statusAtivo} onStatus={setStatusAtivo}
          />

          <ResumoCards despesasMes={despesasMes} />

          {despesasComStatus.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <GraficoBarras despesas={despesasComStatus} />
              <GraficoPizza  despesasMes={despesasMes} />
            </div>
          )}

          <div className="flex flex-col xl:flex-row gap-5 items-start">
            <div className="w-full xl:w-80 shrink-0">
              <FormLancarDespesa
                categorias={categorias}
                meiosPagamento={meiosPagamento}
                onSalvar={handleSalvar}
                salvando={salvando}
              />
            </div>
            <div className="flex-1 min-w-0">
              <TabelaDespesas
                despesas={despesasFiltradas}
                isAdmin={isAdmin}
                onToggleStatus={handleToggleStatus}
                onDelete={handleDelete}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Aba Contas a Pagar ───────────────────────────────────────────────── */}
      {aba === 'contas' && (
        <div className="p-6 flex flex-col gap-5">
          <HelpBanner
            abaId="contas-pagar"
            titulo="Contas a Pagar — Despesas Operacionais"
            itens={[
              'Exibe despesas fixas e operacionais do mês atual com status de pagamento.',
              'Vencidas aparecem primeiro — clique em Pagar para registrar o pagamento.',
              'Investimentos parcelados não aparecem aqui — estão na aba Parcelas.',
            ]}
            dica="Esta aba mostra apenas o mês atual. Para ver outros meses, use a aba Lançamentos com filtro de mês."
          />
          <ContasDespesas
            despesasMes={despesasMesAtual}
            onToggleStatus={handleToggleStatus}
          />
        </div>
      )}

      {/* ── Aba Parcelas ─────────────────────────────────────────────────────── */}
      {aba === 'parcelas' && (
        <div className="p-6">
          <AbaParcelas
            parcelas={parcelas}
            loading={loadingParcelas}
            saving={saving}
            meios={meiosPagamento}
            lancarCompra={lancarCompra}
            marcarPago={marcarPago}
            desfazerPagamento={desfazerPagamento}
            getResumo={getResumo}
            reload={reload}
          />
        </div>
      )}

      {/* ── Aba Cartões ──────────────────────────────────────────────────────── */}
      {aba === 'cartoes' && (
        <div className="p-6 flex flex-col gap-5">
          <HelpBanner
            abaId="cartoes"
            titulo="Cartões e Meios de Pagamento"
            itens={[
              'Cadastre cartões de crédito, contas correntes e outros meios de pagamento.',
              'O limite disponível é atualizado automaticamente conforme as parcelas são pagas.',
              'O dia de vencimento cadastrado é usado para calcular a data das parcelas.',
            ]}
            dica="Nunca altere o limite diretamente — ele é controlado pelo fluxo de parcelas."
          />
          <MeiosPagamento />
        </div>
      )}
    </div>
  );
}

// Alias para retrocompatibilidade (caso algum import use o nome antigo)
export { GestaoFinanceira as GestaoDespesas };
