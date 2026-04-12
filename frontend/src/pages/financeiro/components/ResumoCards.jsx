/**
 * @file ResumoCards.jsx
 * @module financeiro
 * @description Cards de resumo financeiro do mês: Vencido / Pendente / Pago / Total.
 *              Usa campo statusEfetivo (calculado no GestaoDespesas).
 * @version 2.0.0
 * @date 2026-04-11
 * @changelog
 *   2.0.0 — 2026-04-11 — Adicionado card Vencido; usa statusEfetivo em vez de situacao.
 *   1.0.0 — 2026-04-01 — Criação inicial.
 */

import { BRL } from '../../../utils/financeiroUtils';

function Card({ titulo, valor, count, variante = 'default' }) {
  const cls = {
    default:  'bg-slate-800 border-white/5 text-slate-100',
    emerald:  'bg-emerald-900/30 border-emerald-700/40 text-emerald-400',
    amber:    'bg-amber-900/20 border-amber-700/30 text-amber-400',
    red:      'bg-red-900/20 border-red-700/30 text-red-400',
    highlight:'bg-slate-700/60 border-white/10 text-slate-100',
  };
  return (
    <div className={`rounded-xl p-5 flex flex-col gap-1 border ${cls[variante]}`}>
      <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{titulo}</span>
      <span className={`text-2xl font-bold ${variante === 'default' || variante === 'highlight' ? 'text-slate-100' : ''}`}>
        {typeof valor === 'number' ? BRL.format(valor) : valor}
      </span>
      {count !== undefined && (
        <span className="text-xs text-slate-500">{count} lançamento{count !== 1 ? 's' : ''}</span>
      )}
    </div>
  );
}

export function ResumoCards({ despesasMes }) {
  const vencido  = despesasMes.filter(d => d.statusEfetivo === 'vencido');
  const pendente = despesasMes.filter(d => d.statusEfetivo === 'pendente');
  const pago     = despesasMes.filter(d => d.statusEfetivo === 'pago');

  const totalVencido  = vencido.reduce((s, d) => s + d.valor, 0);
  const totalPendente = pendente.reduce((s, d) => s + d.valor, 0);
  const totalPago     = pago.reduce((s, d) => s + d.valor, 0);
  const total         = totalVencido + totalPendente + totalPago;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card titulo="Vencido"  valor={totalVencido}  count={vencido.length}  variante="red" />
      <Card titulo="Pendente" valor={totalPendente} count={pendente.length} variante="amber" />
      <Card titulo="Pago"     valor={totalPago}     count={pago.length}     variante="emerald" />
      <Card titulo="Total Mês" valor={total}        count={despesasMes.length} variante="highlight" />
    </div>
  );
}
