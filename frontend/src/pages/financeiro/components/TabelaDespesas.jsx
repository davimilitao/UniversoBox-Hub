/**
 * @file TabelaDespesas.jsx
 * @description Tabela de despesas com seleção múltipla, total acumulado e compartilhamento WhatsApp.
 * @version 3.0.0
 */

import { useState, useMemo } from 'react';
import {
  ArrowUp, ArrowDown, CheckCircle2, Clock, Trash2, Inbox,
  MessageCircle, Copy, X, Check, Loader2,
} from 'lucide-react';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function fmtWhats(despesas) {
  const linhas = despesas.map(d =>
    `• ${d.data} | ${d.nome} — ${d.descricao || ''}`.trim().replace(/\s+—\s*$/, '')
    + ` | *${BRL.format(d.valor)}* | ${d.situacao}`
  );
  const total = despesas.reduce((s, d) => s + d.valor, 0);
  return `*Despesas selecionadas*\n${linhas.join('\n')}\n\n*Total: ${BRL.format(total)}*`;
}

export function TabelaDespesas({ despesas, isAdmin, onDelete, onToggleStatus }) {
  const [ordem,        setOrdem]        = useState('desc');
  const [deletando,    setDeletando]    = useState(null);
  const [toggling,     setToggling]     = useState(null);
  const [selecionados, setSelecionados] = useState(new Set());
  const [copiado,      setCopiado]      = useState(false);

  const sorted = useMemo(() =>
    [...despesas].sort((a, b) => ordem === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp),
    [despesas, ordem]
  );

  const totalSelecionado = useMemo(() => {
    return sorted
      .filter(d => selecionados.has(d.id))
      .reduce((s, d) => s + d.valor, 0);
  }, [sorted, selecionados]);

  const itensSelecionados = useMemo(() =>
    sorted.filter(d => selecionados.has(d.id)),
    [sorted, selecionados]
  );

  function toggleItem(id) {
    setSelecionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleTodos() {
    if (selecionados.size === sorted.length) setSelecionados(new Set());
    else setSelecionados(new Set(sorted.map(d => d.id)));
  }

  function limparSelecao() { setSelecionados(new Set()); }

  function compartilharWhats() {
    const texto = fmtWhats(itensSelecionados);
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  }

  async function copiarTexto() {
    const texto = fmtWhats(itensSelecionados);
    await navigator.clipboard.writeText(texto).catch(() => {});
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  async function handleToggle(id, situacaoAtual) {
    if (!onToggleStatus) return;
    const nova = situacaoAtual?.toLowerCase().includes('pago') ? 'Pendente' : 'Pago';
    setToggling(id);
    await onToggleStatus(id, nova);
    setToggling(null);
  }

  async function handleDelete(id, label) {
    if (!confirm(`Apagar "${label}"?\n\nRemove a linha da planilha permanentemente.`)) return;
    setDeletando(id);
    await onDelete(id);
    setDeletando(null);
    setSelecionados(prev => { const n = new Set(prev); n.delete(id); return n; });
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
  const todosSelect = selecionados.size === sorted.length && sorted.length > 0;

  return (
    <div className="relative">
      <div className="rounded-xl bg-slate-800 border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left">
                {/* Checkbox selecionar todos */}
                <th className="px-3 py-3 w-10">
                  <input type="checkbox" checked={todosSelect} onChange={toggleTodos}
                    className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer" />
                </th>
                <th className="px-4 py-3 text-slate-500 font-medium cursor-pointer select-none hover:text-slate-300 whitespace-nowrap"
                  onClick={() => setOrdem(o => o === 'desc' ? 'asc' : 'desc')}>
                  <span className="flex items-center gap-1.5">
                    <OrdemIcon size={13} className="text-emerald-500" /> Data
                  </span>
                </th>
                <th className="px-4 py-3 text-slate-500 font-medium">Categoria</th>
                <th className="px-4 py-3 text-slate-500 font-medium">Descrição</th>
                <th className="px-4 py-3 text-slate-500 font-medium text-right">Valor</th>
                <th className="px-4 py-3 text-slate-500 font-medium text-center">Status</th>
                {isAdmin && <th className="px-4 py-3 w-10" />}
              </tr>
            </thead>
            <tbody>
              {sorted.map((d, i) => {
                const isPago   = d.situacao?.toLowerCase().includes('pago');
                const selected = selecionados.has(d.id);
                return (
                  <tr key={i}
                    onClick={() => toggleItem(d.id)}
                    className={`border-b border-white/5 last:border-0 cursor-pointer transition-colors group ${
                      selected ? 'bg-emerald-500/[0.06]' : 'hover:bg-white/[0.02]'
                    }`}>
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected} onChange={() => toggleItem(d.id)}
                        className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer" />
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap font-mono text-xs">{d.data || '—'}</td>
                    <td className="px-4 py-3 text-slate-300 font-medium max-w-[160px] truncate">{d.nome || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-[220px] truncate">{d.descricao || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-200 whitespace-nowrap tabular-nums">
                      {BRL.format(d.valor)}
                    </td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      {toggling === d.id ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-slate-500">
                          <Loader2 size={11} className="animate-spin" /> …
                        </span>
                      ) : isPago ? (
                        <button onClick={() => handleToggle(d.id, d.situacao)}
                          title="Clique para marcar como Pendente"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-orange-500/10 hover:text-orange-400 hover:border-orange-500/20 transition-colors cursor-pointer">
                          <CheckCircle2 size={11}/> Pago
                        </button>
                      ) : (
                        <button onClick={() => handleToggle(d.id, d.situacao)}
                          title="Clique para marcar como Pago"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/20 transition-colors cursor-pointer">
                          <Clock size={11}/> Pendente
                        </button>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <button onClick={() => handleDelete(d.id, d.descricao || d.nome)}
                          disabled={deletando === d.id}
                          className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all disabled:opacity-40"
                          title="Apagar despesa">
                          {deletando === d.id ? <span className="text-xs">...</span> : <Trash2 size={14} />}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10 bg-slate-900/50">
                <td colSpan={4} className="px-4 py-3 text-slate-500 text-xs">
                  {sorted.length} lançamento{sorted.length !== 1 ? 's' : ''}
                  {selecionados.size > 0 && (
                    <span className="ml-2 text-emerald-400 font-bold">
                      · {selecionados.size} selecionado{selecionados.size !== 1 ? 's' : ''}
                    </span>
                  )}
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

      {/* ── Toolbar de seleção (flutuante na base) ─────────────────────────── */}
      {selecionados.size > 0 && (
        <div className="sticky bottom-4 mt-3 mx-auto max-w-xl animate-fade-in">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-emerald-500/30 shadow-2xl shadow-black/50"
            style={{ background: 'var(--bg-surface, #0f172a)' }}>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500">{selecionados.size} item{selecionados.size !== 1 ? 's' : ''} selecionado{selecionados.size !== 1 ? 's' : ''}</p>
              <p className="text-base font-black text-white tabular-nums">{BRL.format(totalSelecionado)}</p>
            </div>
            <button onClick={compartilharWhats}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs transition-all active:scale-95">
              <MessageCircle size={13} /> WhatsApp
            </button>
            <button onClick={copiarTexto}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs transition-all">
              {copiado ? <><Check size={13} className="text-emerald-400" /> Copiado!</> : <><Copy size={13} /> Copiar</>}
            </button>
            <button onClick={limparSelecao}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-300 hover:bg-white/[0.05] transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
