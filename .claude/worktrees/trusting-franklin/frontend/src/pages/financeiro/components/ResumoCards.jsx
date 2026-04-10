/**
 * @file ResumoCards.jsx
 * @module financeiro
 * @description Cards de resumo financeiro do mês selecionado:
 *              Total Pago, Total Pendente, Total Geral e Qtd de lançamentos.
 * @version 1.0.0
 * @date 2026-04-01
 * @author UniversoLab
 *
 * @changelog
 *   1.0.0 — 2026-04-01 — Criação inicial para o PainelFinanceiro.
 */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function Card({ titulo, valor, destaque = false, sub }) {
  return (
    <div className={`rounded-xl p-5 flex flex-col gap-1 ${destaque ? 'bg-emerald-900/30 border border-emerald-700/40' : 'bg-slate-800 border border-white/5'}`}>
      <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{titulo}</span>
      <span className={`text-2xl font-bold ${destaque ? 'text-emerald-400' : 'text-slate-100'}`}>
        {valor}
      </span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </div>
  );
}

export function ResumoCards({ despesasMes }) {
  const pago      = despesasMes.filter(d => d.situacao === 'pago').reduce((s, d) => s + d.valor, 0);
  const pendente  = despesasMes.filter(d => d.situacao === 'pendente').reduce((s, d) => s + d.valor, 0);
  const total     = pago + pendente;
  const qtd       = despesasMes.length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card titulo="Total Pago"       valor={BRL.format(pago)}     sub={`${despesasMes.filter(d => d.situacao === 'pago').length} lançamentos`} />
      <Card titulo="Total Pendente"   valor={BRL.format(pendente)} sub={`${despesasMes.filter(d => d.situacao === 'pendente').length} lançamentos`} />
      <Card titulo="Total Geral"      valor={BRL.format(total)}    destaque />
      <Card titulo="Lançamentos"      valor={qtd}                  sub="no mês selecionado" />
    </div>
  );
}
