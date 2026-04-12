/**
 * @file ContasDespesas.jsx
 * @module financeiro
 * @description Aba "Contas a Pagar" de despesas operacionais (fin_despesas).
 *              Exibe despesas do mês atual separadas por seção: Vencidas / Pendentes / Pagas.
 *              Investimentos parcelados são omitidos aqui (estão em Contas.jsx via fin_parcelas).
 * @version 1.0.0
 * @date 2026-04-11
 */

import { useState, useMemo } from 'react';
import {
  AlertCircle, Clock, CheckCircle2, ChevronDown, ChevronUp,
  Loader2, ExternalLink, FileText,
} from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function brl(v) { return BRL.format(v || 0); }

const HOJE_INICIO = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();

function diasAtraso(ts) {
  return Math.ceil((HOJE_INICIO - ts) / 86400000);
}

const TIPO_LABEL = { mensal_fixa: 'Fixa', operacional: 'Operac.', investimento: 'Invest.' };
const TIPO_CLS   = {
  mensal_fixa:   'bg-blue-900/40 text-blue-300 border-blue-700/40',
  operacional:   'bg-slate-800 text-slate-400 border-white/10',
  investimento:  'bg-violet-900/40 text-violet-300 border-violet-700/40',
};

// ─── sub-componentes ──────────────────────────────────────────────────────────

function KpiCard({ label, valor, count, cor }) {
  const corMap = {
    red:    'bg-red-900/20 border-red-700/30 text-red-400',
    amber:  'bg-amber-900/20 border-amber-700/30 text-amber-400',
    emerald:'bg-emerald-900/20 border-emerald-700/30 text-emerald-400',
    slate:  'bg-slate-800 border-white/[0.06] text-slate-300',
  };
  return (
    <div className={`rounded-xl p-4 border flex flex-col gap-0.5 ${corMap[cor]}`}>
      <span className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</span>
      <span className="text-xl font-bold">{brl(valor)}</span>
      {count !== undefined && (
        <span className="text-xs opacity-60">{count} lançamento{count !== 1 ? 's' : ''}</span>
      )}
    </div>
  );
}

function Linha({ d, onPagar, pagando }) {
  const atraso = diasAtraso(d.timestamp);
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
      {/* data */}
      <span className="text-xs text-slate-500 w-16 shrink-0">{d.data}</span>

      {/* fornecedor + categoria */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 font-medium truncate">{d.fornecedor || d.categoria}</p>
        {d.descricao && <p className="text-xs text-slate-500 truncate">{d.descricao}</p>}
      </div>

      {/* tipo pill */}
      <span className={`hidden sm:inline text-[10px] font-bold px-1.5 py-0.5 rounded border ${TIPO_CLS[d.tipo] || TIPO_CLS.operacional}`}>
        {TIPO_LABEL[d.tipo] || d.tipo}
      </span>

      {/* comprovante */}
      {d.comprovante && d.comprovante.tipo !== 'manual' && (
        <FileText size={13} className="text-slate-600 shrink-0" title={`Autenticação: ${d.comprovante.codigoAutenticacao}`} />
      )}

      {/* dias em atraso (só vencidas) */}
      {atraso > 0 && d.statusEfetivo === 'vencido' && (
        <span className="text-xs text-red-400 font-medium shrink-0">{atraso}d</span>
      )}

      {/* valor */}
      <span className="text-sm font-semibold text-slate-100 shrink-0 w-24 text-right">{brl(d.valor)}</span>

      {/* botão pagar */}
      <button
        onClick={() => onPagar(d.id)}
        disabled={pagando === d.id}
        className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold
          bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
      >
        {pagando === d.id
          ? <Loader2 size={11} className="animate-spin" />
          : <CheckCircle2 size={11} />}
        Pagar
      </button>
    </div>
  );
}

function LinhaPage({ d }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.03] opacity-60">
      <span className="text-xs text-slate-600 w-16 shrink-0">{d.data}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-400 truncate">{d.fornecedor || d.categoria}</p>
        {d.descricao && <p className="text-xs text-slate-600 truncate">{d.descricao}</p>}
      </div>
      {d.comprovante && d.comprovante.tipo !== 'manual' && (
        <FileText size={13} className="text-slate-700 shrink-0" />
      )}
      <span className="text-sm text-slate-400 shrink-0 w-24 text-right">{brl(d.valor)}</span>
      <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold
        bg-emerald-900/30 text-emerald-500 border border-emerald-700/30">
        <CheckCircle2 size={11} /> Pago
      </span>
    </div>
  );
}

function Secao({ titulo, icone: Icone, cor, itens, renderItem, defaultOpen = true }) {
  const [aberta, setAberta] = useState(defaultOpen);
  const corBadge = {
    red:    'text-red-400 bg-red-900/20 border-red-700/30',
    amber:  'text-amber-400 bg-amber-900/20 border-amber-700/30',
    emerald:'text-emerald-400 bg-emerald-900/20 border-emerald-700/30',
  };
  return (
    <div className="rounded-xl border border-white/[0.06] overflow-hidden">
      <button
        onClick={() => setAberta(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-slate-800/60 hover:bg-slate-800 transition-colors"
      >
        <Icone size={14} className={cor === 'red' ? 'text-red-400' : cor === 'amber' ? 'text-amber-400' : 'text-emerald-400'} />
        <span className="text-sm font-semibold text-slate-200">{titulo}</span>
        <span className={`ml-1 text-xs font-bold px-1.5 py-0.5 rounded border ${corBadge[cor]}`}>{itens.length}</span>
        <span className="ml-auto text-slate-600">{aberta ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
      </button>
      {aberta && (
        <div>
          {itens.length === 0
            ? <p className="px-4 py-6 text-center text-xs text-slate-600">Nenhum lançamento nesta seção</p>
            : itens.map(d => renderItem(d))
          }
        </div>
      )}
    </div>
  );
}

// ─── componente principal ──────────────────────────────────────────────────────

export function ContasDespesas({ despesasMes, onToggleStatus }) {
  const [pagando, setPagando] = useState(null);

  // Exclui investimentos (esses aparecem em Contas.jsx via parcelas)
  const operacionais = useMemo(
    () => despesasMes.filter(d => d.tipo !== 'investimento'),
    [despesasMes],
  );

  const vencidas  = useMemo(() => operacionais.filter(d => d.statusEfetivo === 'vencido')
    .sort((a, b) => a.timestamp - b.timestamp), [operacionais]); // mais antiga primeiro
  const pendentes = useMemo(() => operacionais.filter(d => d.statusEfetivo === 'pendente')
    .sort((a, b) => a.timestamp - b.timestamp), [operacionais]);
  const pagas     = useMemo(() => operacionais.filter(d => d.statusEfetivo === 'pago')
    .sort((a, b) => b.timestamp - a.timestamp), [operacionais]);

  const totalVencido  = vencidas.reduce((s, d) => s + d.valor, 0);
  const totalPendente = pendentes.reduce((s, d) => s + d.valor, 0);
  const totalPago     = pagas.reduce((s, d) => s + d.valor, 0);
  const totalMes      = totalVencido + totalPendente + totalPago;

  async function handlePagar(id) {
    if (!onToggleStatus) return;
    setPagando(id);
    await onToggleStatus(id, 'pago');
    setPagando(null);
  }

  if (operacionais.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-600 gap-2">
        <CheckCircle2 size={32} className="text-emerald-700/50" />
        <p className="text-sm">Sem despesas operacionais no mês atual.</p>
        <p className="text-xs">Use a aba Lançamentos para adicionar ou use <code>/comprovante</code>.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Vencido"  valor={totalVencido}  count={vencidas.length}  cor="red" />
        <KpiCard label="Pendente" valor={totalPendente} count={pendentes.length} cor="amber" />
        <KpiCard label="Pago"     valor={totalPago}     count={pagas.length}     cor="emerald" />
        <KpiCard label="Total mês" valor={totalMes}                               cor="slate" />
      </div>

      {/* Seção Vencidas */}
      <Secao
        titulo="Vencidas"
        icone={AlertCircle}
        cor="red"
        itens={vencidas}
        defaultOpen={true}
        renderItem={d => <Linha key={d.id} d={d} onPagar={handlePagar} pagando={pagando} />}
      />

      {/* Seção Pendentes */}
      <Secao
        titulo="Pendentes"
        icone={Clock}
        cor="amber"
        itens={pendentes}
        defaultOpen={true}
        renderItem={d => <Linha key={d.id} d={d} onPagar={handlePagar} pagando={pagando} />}
      />

      {/* Seção Pagas — recolhida por padrão */}
      <Secao
        titulo="Pagas"
        icone={CheckCircle2}
        cor="emerald"
        itens={pagas}
        defaultOpen={false}
        renderItem={d => <LinhaPage key={d.id} d={d} />}
      />
    </div>
  );
}
