/**
 * @file TabelaPendentes.jsx
 * @module financeiro
 * @description Tabela de despesas pendentes do mês selecionado,
 *              ordenadas por data crescente. Borda esquerda laranja para destaque.
 * @version 1.0.0
 * @date 2026-04-01
 * @author UniversoLab
 *
 * @changelog
 *   1.0.0 — 2026-04-01 — Criação inicial para o PainelFinanceiro.
 */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function TabelaPendentes({ despesasMes }) {
  const pendentes = despesasMes
    .filter(d => d.situacao === 'pendente')
    .sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 p-5">
      <h2 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">
        Pendentes no mês
        {pendentes.length > 0 && (
          <span className="ml-2 px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-xs font-normal">
            {pendentes.length}
          </span>
        )}
      </h2>

      {pendentes.length === 0 ? (
        <p className="text-slate-500 text-sm py-8 text-center">
          Nenhuma despesa pendente neste mês
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-white/5">
                <th className="pb-2 pr-4 font-medium">Data</th>
                <th className="pb-2 pr-4 font-medium">Categoria</th>
                <th className="pb-2 pr-4 font-medium">Descrição</th>
                <th className="pb-2 font-medium text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {pendentes.map((d, i) => (
                <tr
                  key={i}
                  className="border-b border-white/5 last:border-0 border-l-2 border-l-orange-500"
                >
                  <td className="py-2.5 pr-4 text-slate-400 pl-2">{d.data}</td>
                  <td className="py-2.5 pr-4 text-slate-300 font-medium">{d.nome || '—'}</td>
                  <td className="py-2.5 pr-4 text-slate-500 max-w-xs truncate">{d.descricao || '—'}</td>
                  <td className="py-2.5 text-right text-orange-400 font-semibold">{BRL.format(d.valor)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="pt-3 text-slate-500 text-xs pl-2">Total pendente</td>
                <td className="pt-3 text-right text-orange-400 font-bold">
                  {BRL.format(pendentes.reduce((s, d) => s + d.valor, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
