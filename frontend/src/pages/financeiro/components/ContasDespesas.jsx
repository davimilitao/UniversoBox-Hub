/**
 * @file ContasDespesas.jsx
 * @module financeiro
 * @description Aba "Contas a Pagar" unificada: despesas operacionais (fin_despesas)
 *              + parcelas de investimentos (fin_parcelas) em uma única timeline
 *              ordenada por vencimento, com alertas visuais de urgência.
 * @version 2.0.0
 * @date 2026-04-17
 */

import { useState } from 'react';
import {
  AlertCircle, Clock, CheckCircle2, ChevronDown, ChevronUp,
  Loader2, CreditCard, FileText, CalendarClock, Layers,
} from 'lucide-react';
import { brl } from '../../../utils/financeiroUtils';
import { useContasAPagar } from '../../../hooks/useContasAPagar';

// ─── helpers visuais ──────────────────────────────────────────────────────────

const STATUS_CFG = {
  vencido:  { cor: 'red',    label: 'Vencido',    Icone: AlertCircle   },
  hoje:     { cor: 'orange', label: 'Vence hoje', Icone: CalendarClock },
  em_breve: { cor: 'amber',  label: 'Em breve',   Icone: Clock         },
  pendente: { cor: 'slate',  label: 'Pendente',   Icone: Clock         },
  pago:     { cor: 'emerald',label: 'Pago',       Icone: CheckCircle2  },
};

const COR_MAP = {
  red:    { badge: 'text-red-400 bg-red-900/20 border-red-700/30',     header: 'text-red-400'    },
  orange: { badge: 'text-orange-400 bg-orange-900/20 border-orange-700/30', header: 'text-orange-400' },
  amber:  { badge: 'text-amber-400 bg-amber-900/20 border-amber-700/30',header: 'text-amber-400'  },
  slate:  { badge: 'text-slate-400 bg-slate-800 border-white/10',       header: 'text-slate-400'  },
  emerald:{ badge: 'text-emerald-400 bg-emerald-900/20 border-emerald-700/30', header: 'text-emerald-400' },
};

const KPI_COR = {
  red:    'bg-red-900/20 border-red-700/30 text-red-400',
  orange: 'bg-orange-900/20 border-orange-700/30 text-orange-400',
  amber:  'bg-amber-900/20 border-amber-700/30 text-amber-400',
  emerald:'bg-emerald-900/20 border-emerald-700/30 text-emerald-400',
  slate:  'bg-slate-800 border-white/[0.06] text-slate-300',
};

// ─── sub-componentes ──────────────────────────────────────────────────────────

function KpiCard({ label, valor, count, cor }) {
  return (
    <div className={`rounded-xl p-4 border flex flex-col gap-0.5 ${KPI_COR[cor]}`}>
      <span className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</span>
      <span className="text-xl font-bold">{brl(valor)}</span>
      {count !== undefined && (
        <span className="text-xs opacity-60">{count} item{count !== 1 ? 's' : ''}</span>
      )}
    </div>
  );
}

function OrigemPill({ item }) {
  if (item.origem === 'parcela') {
    return (
      <span className="hidden sm:inline text-[10px] font-bold px-1.5 py-0.5 rounded border
        text-purple-400 border-purple-700/40 bg-purple-900/20 shrink-0">
        {item.meioNome ? item.meioNome.slice(0, 12) : 'Parcela'}
      </span>
    );
  }
  return null;
}

function LinhaItem({ item, onPagar, onDesfazer, pagando }) {
  const cfg  = STATUS_CFG[item.statusEfetivo] || STATUS_CFG.pendente;
  const isPago = item.statusEfetivo === 'pago';
  const isLoading = pagando === item.id;

  const hoje_ = new Date(); hoje_.setHours(0,0,0,0);
  const diasDiff = item.vencimento
    ? Math.ceil((item.vencimento.getTime() - hoje_.getTime()) / 86400000)
    : null;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-white/[0.04]
      hover:bg-white/[0.02] transition-colors ${isPago ? 'opacity-55' : ''}`}
    >
      {/* data vencimento */}
      <span className="text-xs text-slate-500 w-16 shrink-0">{item.vencimentoFmt}</span>

      {/* fornecedor + descrição */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 font-medium truncate">{item.fornecedor}</p>
        {item.descricao && (
          <p className="text-xs text-slate-500 truncate">{item.descricao}</p>
        )}
      </div>

      {/* pill origem (Parcela com cartão) */}
      <OrigemPill item={item} />

      {/* comprovante */}
      {item.comprovante && item.comprovante.tipo !== 'manual' && (
        <FileText size={13} className="text-slate-600 shrink-0" />
      )}

      {/* dias */}
      {!isPago && diasDiff !== null && diasDiff < 0 && (
        <span className="text-xs text-red-400 font-medium shrink-0">{Math.abs(diasDiff)}d</span>
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
  const cfg = COR_MAP[cor] || COR_MAP.slate;
  return (
    <div className="rounded-xl border border-white/[0.06] overflow-hidden">
      <button
        onClick={() => setAberta(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-slate-800/60 hover:bg-slate-800 transition-colors"
      >
        <Icone size={14} className={cfg.header} />
        <span className="text-sm font-semibold text-slate-200">{titulo}</span>
        <span className={`ml-1 text-xs font-bold px-1.5 py-0.5 rounded border ${cfg.badge}`}>
          {itens.length}
        </span>
        <span className="ml-auto text-slate-600">
          {aberta ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {aberta && (
        <div>
          {itens.length === 0
            ? <p className="px-4 py-6 text-center text-xs text-slate-600">Nenhum item nesta seção</p>
            : itens.map(renderItem)}
        </div>
      )}
    </div>
  );
}

// ─── componente principal ──────────────────────────────────────────────────────

export function ContasDespesas() {
  const { tudo, kpis, loading, pagando, marcarPago, desfazerPagamento } = useContasAPagar();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-slate-500">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Carregando contas...</span>
      </div>
    );
  }

  if (tudo.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-600 gap-2">
        <CheckCircle2 size={32} className="text-emerald-700/50" />
        <p className="text-sm">Nenhuma conta a pagar cadastrada.</p>
      </div>
    );
  }

  const { vencidas, hoje_, em_breve, pendentes, pagas,
          totalVencido, totalHoje, totalEmBreve, totalPendente, totalPago, totalMes } = kpis;

  const renderLinha = item => (
    <LinhaItem
      key={`${item.origem}-${item.id}`}
      item={item}
      onPagar={marcarPago}
      onDesfazer={desfazerPagamento}
      pagando={pagando}
    />
  );

  return (
    <div className="flex flex-col gap-4">

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Vencido"    valor={totalVencido}  count={vencidas.length}  cor="red"     />
        <KpiCard label="Vence hoje" valor={totalHoje}     count={hoje_.length}     cor="orange"  />
        <KpiCard label="7 dias"     valor={totalEmBreve}  count={em_breve.length}  cor="amber"   />
        <KpiCard label="Pendente"   valor={totalPendente} count={pendentes.length} cor="slate"   />
        <KpiCard label="Pago"       valor={totalPago}     count={pagas.length}     cor="emerald" />
      </div>

      {/* legenda */}
      <div className="flex items-center gap-3 text-xs text-slate-600">
        <span className="flex items-center gap-1">
          <Layers size={11} className="text-slate-500" /> Despesa operacional
        </span>
        <span className="flex items-center gap-1">
          <CreditCard size={11} className="text-purple-500" />
          <span className="text-purple-500">Parcela cartão</span>
        </span>
      </div>

      {/* Seções por urgência */}
      {vencidas.length > 0 && (
        <Secao titulo="Vencidas" icone={AlertCircle} cor="red"
          itens={vencidas} defaultOpen={true} renderItem={renderLinha} />
      )}
      {hoje_.length > 0 && (
        <Secao titulo="Vence hoje" icone={CalendarClock} cor="orange"
          itens={hoje_} defaultOpen={true} renderItem={renderLinha} />
      )}
      {em_breve.length > 0 && (
        <Secao titulo="Próximos 7 dias" icone={Clock} cor="amber"
          itens={em_breve} defaultOpen={true} renderItem={renderLinha} />
      )}
      {pendentes.length > 0 && (
        <Secao titulo="Pendentes" icone={Clock} cor="slate"
          itens={pendentes} defaultOpen={false} renderItem={renderLinha} />
      )}
      {pagas.length > 0 && (
        <Secao titulo="Pagas" icone={CheckCircle2} cor="emerald"
          itens={pagas} defaultOpen={false} renderItem={renderLinha} />
      )}
    </div>
  );
}
