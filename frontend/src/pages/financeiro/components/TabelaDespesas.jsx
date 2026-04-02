/**
 * @file TabelaDespesas.jsx
 * @module financeiro
 * @description Tabela completa de despesas com Lucide icons, ordenação e delete (admin).
 * @version 2.0.0
 * @date 2026-04-01
 * @author UniversoLab
 *
 * @changelog
 *   2.0.0 — 2026-04-01 — Lucide icons, visual refinado.
 *   1.0.0 — 2026-04-01 — Criação inicial.
 */

import { useState } from 'react';
import {
  ArrowDownUp, ArrowUp, ArrowDown,
  CheckCircle2, Clock, Trash2, Inbox,
} from 'lucide-react';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function TabelaDespesas({ despesas, isAdmin, onDelete }) {
  const [ordem,    setOrdem]    = useState('desc');
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
      <div className="rounded-xl bg-slate-800 border border-white/5 p-12 flex flex-col items-center gap-3 text-center">
        <Inbox size={32} className="text-slate-700" />
        <p className="text-slate-500 text-sm">Nenhuma despesa para os filtros selecionados.</p>
      </div>
    );
  }

  const OrdemIcon = ordem === 'asc' ? ArrowUp : ArrowDown;

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
                <span className="flex items-center gap-1.5">
                  <OrdemIcon size={13} className="text-emerald-500" />
                  Data
                </span>
              </th>
              <th className="px-4 py-3 text-slate-500 font-medium">Categoria</th>
              <th className="px-4 py-3 text-slate-500 font-medium">Descrição</th>
              <th className="px-4 py-3 text-slate-500 font-medium text-right">Valor</th>
              <th className="px-4 py-3 text-slate-500 font-medium text-center">Status</th>
              {isAdmin && <th className="px-4 py-3 text-slate-500 font-medium text-center w-12" />}
            </tr>
          </thead>
          <tbody>
            {sorted.map((d, i) => {
              const isPago = d.situacao?.toLowerCase().includes('pago');
              return (
                <tr
                  key={i}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors group"
                >
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap font-mono text-xs">
                    {d.data || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-300 font-medium max-w-[160px] truncate">
                    {d.nome || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 max-w-[220px] truncate">
                    {d.descricao || '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-200 whitespace-nowrap tabular-nums">
                    {BRL.format(d.valor)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isPago ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 size={11} /> Pago
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">
                        <Clock size={11} /> Pendente
                      </span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDelete(d.id, d.descricao || d.nome)}
                        disabled={deletando === d.id}
                        className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all disabled:opacity-40"
                        title="Apagar despesa"
                      >
                        {deletando === d.id
                          ? <span className="text-xs text-slate-500">...</span>
                          : <Trash2 size={14} />
                        }
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/10 bg-slate-900/50">
              <td colSpan={3} className="px-4 py-3 text-slate-500 text-xs">
                {sorted.length} lançamento{sorted.length !== 1 ? 's' : ''}
              </td>
              <td className="px-4 py-3 text-right font-bold text-slate-200 whitespace-nowrap tabular-nums">
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
