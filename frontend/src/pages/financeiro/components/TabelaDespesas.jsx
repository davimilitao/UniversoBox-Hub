/**
 * @file TabelaDespesas.jsx
 * @module financeiro
 * @description Tabela completa de despesas do mês com ordenação e delete (admin).
 * @version 1.0.0
 * @date 2026-04-01
 * @author UniversoLab
 */

import { useState } from 'react';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function TabelaDespesas({ despesas, isAdmin, onDelete }) {
  const [ordem, setOrdem] = useState('desc'); // desc = mais recente primeiro
  const [deletando, setDeletando] = useState(null);

  const sorted = [...despesas].sort((a, b) =>
    ordem === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
  );

  async function handleDelete(id, label) {
    if (!confirm(`Apagar "${label}"?\n\nRemove a linha da planilha permanentemente.`)) return;
    setDeletando(id);
    await onDelete(id);
    setDeletando(null);
  }

  if (!despesas.length) {
    return (
      <div className="rounded-xl bg-slate-800 border border-white/5 p-8 text-center">
        <p className="text-slate-500 text-sm">Nenhuma despesa para os filtros selecionados.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left">
              <th
                className="px-4 py-3 text-slate-500 font-medium cursor-pointer select-none hover:text-slate-300 transition-colors whitespace-nowrap"
                onClick={() => setOrdem(o => o === 'desc' ? 'asc' : 'desc')}
              >
                Data {ordem === 'desc' ? '↓' : '↑'}
              </th>
              <th className="px-4 py-3 text-slate-500 font-medium">Categoria</th>
              <th className="px-4 py-3 text-slate-500 font-medium">Descrição</th>
              <th className="px-4 py-3 text-slate-500 font-medium text-right">Valor</th>
              <th className="px-4 py-3 text-slate-500 font-medium text-center">Status</th>
              {isAdmin && <th className="px-4 py-3 text-slate-500 font-medium text-center">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((d, i) => {
              const isPago = d.situacao?.toLowerCase().includes('pago');
              return (
                <tr
                  key={i}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{d.data || '—'}</td>
                  <td className="px-4 py-3 text-slate-300 font-medium max-w-[160px] truncate">{d.nome || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-[220px] truncate">{d.descricao || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-200 whitespace-nowrap">
                    {BRL.format(d.valor)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                      ${isPago
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                      }`}>
                      {isPago ? '✅ Pago' : '⏳ Pendente'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDelete(d.id, d.descricao || d.nome)}
                        disabled={deletando === d.id}
                        className="text-slate-600 hover:text-red-400 transition-colors disabled:opacity-40 text-base"
                        title="Apagar despesa"
                      >
                        {deletando === d.id ? '...' : '🗑️'}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {/* Totais */}
          <tfoot>
            <tr className="border-t border-white/10 bg-slate-900/50">
              <td colSpan={isAdmin ? 3 : 3} className="px-4 py-3 text-slate-500 text-xs">
                {sorted.length} lançamento{sorted.length !== 1 ? 's' : ''}
              </td>
              <td className="px-4 py-3 text-right font-bold text-slate-200 whitespace-nowrap">
                {BRL.format(sorted.reduce((s, d) => s + d.valor, 0))}
              </td>
              <td colSpan={isAdmin ? 2 : 1} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
