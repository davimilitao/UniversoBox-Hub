/**
 * @file ContasDespesas.jsx
 * @module financeiro
 * @description Aba "Contas a Pagar" unificada: despesas + parcelas com filtro de mês,
 *              filtros por tipo e cartão, seleção múltipla e compartilhamento WhatsApp.
 * @version 3.0.0
 * @date 2026-04-17
 */

import { useState, useMemo } from 'react';
import {
  AlertCircle, Clock, CheckCircle2, ChevronDown, ChevronUp,
  Loader2, CreditCard, FileText, CalendarClock, Layers,
  ChevronLeft, ChevronRight, MessageCircle, Copy, Check, X,
} from 'lucide-react';
import { brl, fmtMesAno, labelMes, labelMesAtual } from '../../../utils/financeiroUtils';
import { useContasAPagar } from '../../../hooks/useContasAPagar';

// ─── helpers ──────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  vencido:  { cor: 'red',    label: 'Vencidas',       Icone: AlertCircle   },
  hoje:     { cor: 'orange', label: 'Vence hoje',      Icone: CalendarClock },
  em_breve: { cor: 'amber',  label: 'Próximos 7 dias', Icone: Clock         },
  pendente: { cor: 'slate',  label: 'Pendentes',       Icone: Clock         },
  pago:     { cor: 'emerald',label: 'Pagas',           Icone: CheckCircle2  },
};

const KPI_COR = {
  red:    'bg-red-900/20 border-red-700/30 text-red-400',
  orange: 'bg-orange-900/20 border-orange-700/30 text-orange-400',
  amber:  'bg-amber-900/20 border-amber-700/30 text-amber-400',
  emerald:'bg-emerald-900/20 border-emerald-700/30 text-emerald-400',
  slate:  'bg-slate-800 border-white/[0.06] text-slate-300',
};

const COR_HEADER = {
  red: 'text-red-400', orange: 'text-orange-400', amber: 'text-amber-400',
  slate: 'text-slate-400', emerald: 'text-emerald-400',
};

const COR_BADGE = {
  red:    'text-red-400 bg-red-900/20 border-red-700/30',
  orange: 'text-orange-400 bg-orange-900/20 border-orange-700/30',
  amber:  'text-amber-400 bg-amber-900/20 border-amber-700/30',
  slate:  'text-slate-400 bg-slate-800 border-white/10',
  emerald:'text-emerald-400 bg-emerald-900/20 border-emerald-700/30',
};

const TIPO_LABEL = {
  operacional: 'Operac.',
  mensal_fixa: 'Fixa',
  investimento: 'Parcela',
};

function mesAtualLabel() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function labelParaDate(label) {
  const [m, y] = label.split('/');
  return new Date(Number(y), Number(m) - 1, 1);
}

function fmtWhats(itens) {
  const linhas = itens.map(i => {
    const cartao = i.meioNome ? ` | ${i.meioNome}` : '';
    return `• ${i.fornecedor} — ${i.descricao || i.categoria}${cartao} | *${brl(i.valor)}* | ${i.vencimentoFmt}`;
  });
  const total = itens.reduce((s, i) => s + i.valor, 0);
  return `*Contas a Pagar selecionadas*\n${linhas.join('\n')}\n\n*Total: ${brl(total)}*`;
}

// ─── sub-componentes ──────────────────────────────────────────────────────────

function KpiCard({ label, valor, count, cor }) {
  return (
    <div className={`rounded-xl p-3 border flex flex-col gap-0.5 ${KPI_COR[cor]}`}>
      <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">{label}</span>
      <span className="text-lg font-bold">{brl(valor)}</span>
      {count !== undefined && (
        <span className="text-xs opacity-60">{count} item{count !== 1 ? 's' : ''}</span>
      )}
    </div>
  );
}

function LinhaItem({ item, selecionado, onToggle, onPagar, onDesfazer, pagando }) {
  const isPago    = item.statusEfetivo === 'pago';
  const isLoading = pagando === item.id;
  const hoje_     = new Date(); hoje_.setHours(0,0,0,0);
  const diasDiff  = item.vencimento
    ? Math.ceil((item.vencimento.getTime() - hoje_.getTime()) / 86400000)
    : null;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-white/[0.04]
      hover:bg-white/[0.02] transition-colors ${isPago ? 'opacity-55' : ''}`}
    >
      {/* checkbox */}
      <input
        type="checkbox"
        checked={selecionado}
        onChange={onToggle}
        className="w-3.5 h-3.5 accent-emerald-500 shrink-0 cursor-pointer"
      />

      {/* data */}
      <span className="text-xs text-slate-500 w-16 shrink-0">{item.vencimentoFmt}</span>

      {/* fornecedor + descrição */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 font-medium truncate">{item.fornecedor}</p>
        {item.descricao && (
          <p className="text-xs text-slate-500 truncate">{item.descricao}</p>
        )}
      </div>

      {/* pill tipo */}
      <span className={`hidden sm:inline text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
        item.origem === 'parcela'
          ? 'text-purple-400 border-purple-700/40 bg-purple-900/20'
          : item.tipo === 'mensal_fixa'
          ? 'text-blue-400 border-blue-700/40 bg-blue-900/20'
          : 'text-slate-400 border-white/10 bg-slate-800'
      }`}>
        {item.meioNome ? item.meioNome.slice(0, 10) : (TIPO_LABEL[item.tipo] || item.tipo)}
      </span>

      {/* comprovante */}
      {item.comprovante && item.comprovante.tipo !== 'manual' && (
        <FileText size={13} className="text-slate-600 shrink-0" />
      )}

      {/* urgência */}
      {!isPago && diasDiff !== null && diasDiff < 0 && (
        <span className="text-xs text-red-400 font-medium shrink-0">{Math.abs(diasDiff)}d atraso</span>
      )}
      {!isPago && diasDiff === 0 && (
        <span className="text-xs text-orange-400 font-bold shrink-0">HOJE</span>
      )}

      {/* valor */}
      <span className="text-sm font-semibold text-slate-100 shrink-0 w-24 text-right">
        {brl(item.valor)}
      </span>

      {/* ação */}
      {isPago ? (
        <button
          onClick={() => onDesfazer(item)}
          disabled={isLoading}
          title="Desfazer pagamento"
          className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold
            bg-emerald-900/30 text-emerald-500 border border-emerald-700/30
            hover:bg-red-900/20 hover:text-red-400 hover:border-red-700/30 transition-colors disabled:opacity-50"
        >
          {isLoading ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
          Pago
        </button>
      ) : (
        <button
          onClick={() => onPagar(item)}
          disabled={isLoading}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold
            bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
        >
          {isLoading ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
          Pagar
        </button>
      )}
    </div>
  );
}

function Secao({ titulo, icone: Icone, cor, itens, renderItem, defaultOpen = true }) {
  const [aberta, setAberta] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/[0.06] overflow-hidden">
      <button
        onClick={() => setAberta(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-slate-800/60 hover:bg-slate-800 transition-colors"
      >
        <Icone size={14} className={COR_HEADER[cor]} />
        <span className="text-sm font-semibold text-slate-200">{titulo}</span>
        <span className={`ml-1 text-xs font-bold px-1.5 py-0.5 rounded border ${COR_BADGE[cor]}`}>
          {itens.length}
        </span>
        <span className="ml-auto text-slate-600">
          {aberta ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {aberta && (
        <div>
          {itens.length === 0
            ? <p className="px-4 py-6 text-center text-xs text-slate-600">Nenhum item</p>
            : itens.map(renderItem)}
        </div>
      )}
    </div>
  );
}

// ─── componente principal ──────────────────────────────────────────────────────

export function ContasDespesas() {
  const { tudo, loading, pagando, marcarPago, desfazerPagamento } = useContasAPagar();

  // ── filtros ──────────────────────────────────────────────────────────────────
  const [mesAtivo,     setMesAtivo]     = useState(mesAtualLabel());
  const [filtroTipo,   setFiltroTipo]   = useState('todos');
  const [filtroCartao, setFiltroCartao] = useState('todos');
  const [selecionados, setSelecionados] = useState(new Set());
  const [copiado,      setCopiado]      = useState(false);

  // meses disponíveis nos dados
  const meses = useMemo(() => {
    const map = new Map();
    tudo.forEach(i => {
      const k = i.vencimento ? labelMes(i.vencimento) : null;
      if (k && !map.has(k)) {
        map.set(k, { key: k, label: fmtMesAno(i.vencimento), ts: i.vencimento.getTime() });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.ts - b.ts);
  }, [tudo]);

  const idxMes = meses.findIndex(m => m.key === mesAtivo);

  // cartões disponíveis
  const cartoes = useMemo(() => {
    const map = new Map();
    tudo.forEach(i => {
      if (i.meioId && i.meioNome) map.set(i.meioId, i.meioNome);
    });
    return Array.from(map.entries()).map(([id, nome]) => ({ id, nome }));
  }, [tudo]);

  // lista filtrada
  const lista = useMemo(() => {
    return tudo.filter(i => {
      const kMes = i.vencimento ? labelMes(i.vencimento) : null;
      if (mesAtivo && kMes !== mesAtivo) return false;
      if (filtroTipo !== 'todos') {
        if (filtroTipo === 'parcela' && i.origem !== 'parcela') return false;
        if (filtroTipo !== 'parcela' && i.tipo !== filtroTipo) return false;
      }
      if (filtroCartao !== 'todos' && i.meioId !== filtroCartao) return false;
      return true;
    });
  }, [tudo, mesAtivo, filtroTipo, filtroCartao]);

  // KPIs da lista filtrada
  const kpis = useMemo(() => {
    const grupos = { vencido: [], hoje: [], em_breve: [], pendente: [], pago: [] };
    lista.forEach(i => { (grupos[i.statusEfetivo] || grupos.pendente).push(i); });
    const soma = arr => arr.reduce((s, i) => s + i.valor, 0);
    return {
      vencidas:  grupos.vencido,  totalVencido:  soma(grupos.vencido),
      hoje_:     grupos.hoje,     totalHoje:     soma(grupos.hoje),
      em_breve:  grupos.em_breve, totalEmBreve:  soma(grupos.em_breve),
      pendentes: grupos.pendente, totalPendente: soma(grupos.pendente),
      pagas:     grupos.pago,     totalPago:     soma(grupos.pago),
    };
  }, [lista]);

  // ── seleção ──────────────────────────────────────────────────────────────────
  const itensSel     = lista.filter(i => selecionados.has(i.id));
  const totalSel     = itensSel.reduce((s, i) => s + i.valor, 0);
  const todosMarcados = lista.length > 0 && lista.every(i => selecionados.has(i.id));

  function toggleItem(id) {
    setSelecionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleTodos() {
    setSelecionados(todosMarcados ? new Set() : new Set(lista.map(i => i.id)));
  }
  function limparSelecao() { setSelecionados(new Set()); }

  async function compartilharWhats() {
    window.open(`https://wa.me/?text=${encodeURIComponent(fmtWhats(itensSel))}`, '_blank');
  }
  async function copiarTexto() {
    await navigator.clipboard.writeText(fmtWhats(itensSel)).catch(() => {});
    setCopiado(true); setTimeout(() => setCopiado(false), 2000);
  }

  // ── render ───────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-2 text-slate-500">
      <Loader2 size={18} className="animate-spin" />
      <span className="text-sm">Carregando contas...</span>
    </div>
  );

  const renderLinha = item => (
    <LinhaItem
      key={`${item.origem}-${item.id}`}
      item={item}
      selecionado={selecionados.has(item.id)}
      onToggle={() => toggleItem(item.id)}
      onPagar={marcarPago}
      onDesfazer={desfazerPagamento}
      pagando={pagando}
    />
  );

  const { vencidas, hoje_, em_breve, pendentes, pagas,
          totalVencido, totalHoje, totalEmBreve, totalPendente, totalPago } = kpis;

  return (
    <div className="flex flex-col gap-4">

      {/* ── Navegação de mês ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-800 border border-white/10 rounded-xl px-2 py-1.5">
          <button
            onClick={() => idxMes > 0 && setMesAtivo(meses[idxMes - 1].key)}
            disabled={idxMes <= 0}
            className="p-1 rounded text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="text-sm font-semibold text-slate-200 min-w-[90px] text-center">
            {meses.find(m => m.key === mesAtivo)?.label || mesAtivo}
          </span>
          <button
            onClick={() => idxMes < meses.length - 1 && setMesAtivo(meses[idxMes + 1].key)}
            disabled={idxMes >= meses.length - 1}
            className="p-1 rounded text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        {/* filtro tipo */}
        <div className="flex gap-1 flex-wrap">
          {[
            { val: 'todos',        label: 'Todos'     },
            { val: 'operacional',  label: 'Operac.'   },
            { val: 'mensal_fixa',  label: 'Fixa'      },
            { val: 'parcela',      label: 'Parcelas'  },
          ].map(({ val, label }) => (
            <button
              key={val}
              onClick={() => setFiltroTipo(val)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                filtroTipo === val
                  ? 'bg-emerald-600/30 border-emerald-600 text-emerald-400'
                  : 'bg-slate-900 border-white/10 text-slate-500 hover:border-white/20'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* filtro cartão */}
        {cartoes.length > 0 && (
          <select
            value={filtroCartao}
            onChange={e => setFiltroCartao(e.target.value)}
            className="text-xs rounded-lg bg-slate-900 border border-white/10 text-slate-300
              px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 [color-scheme:dark]"
          >
            <option value="todos">Todos os cartões</option>
            {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        )}

        {/* selecionar todos */}
        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={todosMarcados}
            onChange={toggleTodos}
            className="accent-emerald-500"
          />
          Selec. todos ({lista.length})
        </label>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 lg:grid-cols-5 gap-2">
        <KpiCard label="Vencido"    valor={totalVencido}  count={vencidas.length}  cor="red"     />
        <KpiCard label="Vence hoje" valor={totalHoje}     count={hoje_.length}     cor="orange"  />
        <KpiCard label="7 dias"     valor={totalEmBreve}  count={em_breve.length}  cor="amber"   />
        <KpiCard label="Pendente"   valor={totalPendente} count={pendentes.length} cor="slate"   />
        <KpiCard label="Pago"       valor={totalPago}     count={pagas.length}     cor="emerald" />
      </div>

      {/* ── Seções ───────────────────────────────────────────────────────── */}
      {lista.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-600 gap-2">
          <CheckCircle2 size={28} className="text-emerald-700/40" />
          <p className="text-sm">Nenhum item para os filtros selecionados.</p>
        </div>
      ) : (
        <>
          {vencidas.length > 0 && (
            <Secao titulo="Vencidas" icone={AlertCircle} cor="red"
              itens={vencidas} defaultOpen renderItem={renderLinha} />
          )}
          {hoje_.length > 0 && (
            <Secao titulo="Vence hoje" icone={CalendarClock} cor="orange"
              itens={hoje_} defaultOpen renderItem={renderLinha} />
          )}
          {em_breve.length > 0 && (
            <Secao titulo="Próximos 7 dias" icone={Clock} cor="amber"
              itens={em_breve} defaultOpen renderItem={renderLinha} />
          )}
          {pendentes.length > 0 && (
            <Secao titulo="Pendentes" icone={Clock} cor="slate"
              itens={pendentes} defaultOpen={false} renderItem={renderLinha} />
          )}
          {pagas.length > 0 && (
            <Secao titulo="Pagas" icone={CheckCircle2} cor="emerald"
              itens={pagas} defaultOpen={false} renderItem={renderLinha} />
          )}
        </>
      )}

      {/* ── Toolbar seleção ──────────────────────────────────────────────── */}
      {itensSel.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
          flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl
          bg-slate-900 border border-white/10">
          <span className="text-xs text-slate-400 font-medium">
            {itensSel.length} item{itensSel.length > 1 ? 's' : ''} —
          </span>
          <span className="text-sm font-bold text-white">{brl(totalSel)}</span>
          <button
            onClick={compartilharWhats}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold
              bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            <MessageCircle size={13} /> WhatsApp
          </button>
          <button
            onClick={copiarTexto}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold
              bg-slate-700 hover:bg-slate-600 text-slate-200 border border-white/10 transition-colors"
          >
            {copiado ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            {copiado ? 'Copiado!' : 'Copiar'}
          </button>
          <button onClick={limparSelecao} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
