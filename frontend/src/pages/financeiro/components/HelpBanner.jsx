/**
 * @file HelpBanner.jsx
 * @module financeiro/components
 * @description Banner in-page colapsável com guia de uso de cada aba do módulo Financeiro.
 *              O estado aberto/fechado persiste em localStorage com chave hub_help_{abaId}.
 *              Quando fechado exibe apenas um botão "? Ajuda" no canto superior direito.
 * @version 1.0.0
 * @date 2026-04-12
 */

import { useState } from 'react';
import { Info, X, HelpCircle } from 'lucide-react';

/**
 * Banner de ajuda contextual por aba.
 *
 * @param {object} props
 * @param {string}   props.abaId  — chave única da aba (usada no localStorage)
 * @param {string}   props.titulo — título exibido no banner
 * @param {string[]} props.itens  — bullets de orientação
 * @param {string}   [props.dica] — dica extra exibida ao final com ícone 💡
 */
export function HelpBanner({ abaId, titulo, itens = [], dica }) {
  const key = `hub_help_${abaId}`;
  const [aberto, setAberto] = useState(() => {
    try { return localStorage.getItem(key) !== 'fechado'; }
    catch { return true; }
  });

  function fechar() {
    setAberto(false);
    try { localStorage.setItem(key, 'fechado'); } catch {}
  }
  function abrir() {
    setAberto(true);
    try { localStorage.removeItem(key); } catch {}
  }

  if (!aberto) {
    return (
      <div className="flex justify-end mb-1">
        <button
          onClick={abrir}
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          <HelpCircle size={12} /> Ajuda
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-blue-900/10 border border-blue-500/20 p-4 flex gap-3">
      <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-blue-300 mb-2">{titulo}</p>
        <ul className="space-y-1">
          {itens.map((item, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-slate-400">
              <span className="text-blue-500 shrink-0 mt-0.5">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {dica && (
          <p className="mt-2.5 text-xs text-slate-500 bg-white/[0.03] border border-white/[0.05] rounded-lg px-3 py-2">
            💡 {dica}
          </p>
        )}
      </div>
      <button
        onClick={fechar}
        className="text-slate-600 hover:text-slate-400 transition-colors shrink-0"
        title="Fechar ajuda"
      >
        <X size={14} />
      </button>
    </div>
  );
}
