/**
 * @file AcaminhoWidget.jsx
 * @module expedicao/compras
 * @description Widget compacto de itens em trânsito para o Dashboard.
 *   Mostra total, os 3 mais urgentes e link para a tela completa.
 *   Retorna null se não houver itens em trânsito.
 * @version 1.0.0
 * @date 2026-04-22
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Truck, AlertTriangle, ArrowRight } from 'lucide-react';
import { diasEmTransito } from './helpers.js';

function ItemRow({ item }) {
  const dias     = diasEmTransito(item.dataACaminho);
  const atrasado = dias >= 7;
  const label    = dias === 0 ? 'hoje' : `${dias}d`;

  return (
    <div className="flex items-center gap-2.5 py-1.5 border-t border-white/[0.05]">
      <div className="w-7 h-7 rounded bg-slate-700 flex items-center justify-center text-xs flex-shrink-0 overflow-hidden">
        {item.image
          ? <img src={item.image} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
          : '📦'
        }
      </div>
      <p className="text-xs text-slate-300 flex-1 truncate">{item.name}</p>
      <span className={`text-xs font-bold flex-shrink-0 ${atrasado ? 'text-red-400' : 'text-slate-500'}`}>
        {label}{atrasado ? ' ⚠' : ''}
      </span>
    </div>
  );
}

export default function AcaminhoWidget() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/transit')
      .then(r => r.json())
      .then(d => setItems(d.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !items.length) return null;

  const atrasados = items.filter(i => diasEmTransito(i.dataACaminho) >= 7).length;
  const top3 = [...items]
    .sort((a, b) => diasEmTransito(b.dataACaminho) - diasEmTransito(a.dataACaminho))
    .slice(0, 3);

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center">
            <Truck size={15} className="text-blue-400" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-blue-400/80 font-bold">A Caminho</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xl font-black text-blue-300 leading-none tabular-nums">{items.length}</span>
              <span className="text-xs text-slate-500">item{items.length !== 1 ? 'ns' : ''} em trânsito</span>
              {atrasados > 0 && (
                <span className="flex items-center gap-0.5 text-xs font-bold text-red-400">
                  <AlertTriangle size={10} /> {atrasados} atrasado{atrasados !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>
        <Link
          to="/expedicao/compras"
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0"
        >
          Ver todos <ArrowRight size={11} />
        </Link>
      </div>

      {/* Top 3 itens mais urgentes */}
      <div>
        {top3.map(item => <ItemRow key={item.id} item={item} />)}
        {items.length > 3 && (
          <p className="text-[11px] text-slate-600 mt-2 text-center">
            +{items.length - 3} mais em trânsito
          </p>
        )}
      </div>
    </div>
  );
}
