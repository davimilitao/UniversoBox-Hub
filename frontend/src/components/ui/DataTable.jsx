/**
 * @file DataTable.jsx
 * @module ui
 * @description Tabela temática com colunas configuráveis, estado vazio e loading.
 *              Usa tokens CSS — funciona em qualquer tema.
 * @version 1.0.0
 * @date 2026-04-22
 */

import { Skeleton } from './Skeleton';

export function DataTable({ columns = [], data = [], emptyText = 'Nenhum item encontrado', loading = false }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${col.className ?? ''}`}
                  style={{ color: 'var(--text-muted)' }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3">
                      <Skeleton h="h-4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-sm"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={row.id ?? i}
                  className="transition-colors hover:bg-white/[0.02]"
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 ${col.className ?? ''}`}
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
