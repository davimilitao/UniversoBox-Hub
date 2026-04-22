/**
 * @file ResumoCards.jsx
 * @module financeiro
 * @description Cards de resumo financeiro do mês: Vencido / Pendente / Pago / Total.
 *              Usa campo statusEfetivo (calculado no GestaoDespesas).
 * @version 3.0.0
 * @date 2026-04-22
 * @changelog
 *   3.0.0 — 2026-04-22 — Migrado para StatCard do ui/ — remove Card local hardcoded.
 *   2.0.0 — 2026-04-11 — Adicionado card Vencido; usa statusEfetivo em vez de situacao.
 *   1.0.0 — 2026-04-01 — Criação inicial.
 */

import { StatCard } from '../../../components/ui';

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
      <StatCard titulo="Vencido"   valor={totalVencido}  count={vencido.length}       variante="danger" />
      <StatCard titulo="Pendente"  valor={totalPendente} count={pendente.length}      variante="warning" />
      <StatCard titulo="Pago"      valor={totalPago}     count={pago.length}          variante="success" />
      <StatCard titulo="Total Mês" valor={total}         count={despesasMes.length}   variante="highlight" />
    </div>
  );
}
