/**
 * @file Compras.jsx
 * @module expedicao
 * @description Gestão de Compras — pedidos de reposição, trânsito e inteligência.
 *   5 abas: Pedidos Abertos · Pedidos Fechados · A Caminho · Novo Pedido · Inteligência
 * @version 2.0.0
 * @date 2026-04-12
 * @changelog
 *   2.0.0 — 2026-04-12 — Refatoração: 5 abas; pedidos abertos vs fechados; XML NF-e;
 *             integração Financeiro; detecção de duplicatas no carrinho; estoque atualizado.
 *   1.0.0 — 2026-04-06 — Migrado de compras.html para React (4 abas).
 */

import { useState } from 'react';
import { Package, Truck, BarChart2, Plus, FileCheck, Clock } from 'lucide-react';
import AbaPedidosAbertos  from './compras/AbaPedidosAbertos.jsx';
import AbaPedidosFechados from './compras/AbaPedidosFechados.jsx';
import AbaACaminho        from './compras/AbaACaminho.jsx';
import AbaMontarPedido    from './compras/AbaMontarPedido.jsx';
import AbaInteligencia    from './compras/AbaInteligencia.jsx';

const ABAS = [
  { id: 'abertos',  label: 'Pedidos Abertos',  Icon: Clock      },
  { id: 'fechados', label: 'Pedidos Fechados',  Icon: FileCheck  },
  { id: 'acaminho', label: 'A Caminho',         Icon: Truck      },
  { id: 'montar',   label: 'Novo Pedido',        Icon: Plus       },
  { id: 'bi',       label: 'Inteligência',       Icon: BarChart2  },
];

function Toast({ msg, tipo }) {
  if (!msg) return null;
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border max-w-sm
      ${tipo === 'ok'
        ? 'bg-emerald-900/90 border-emerald-600 text-emerald-300'
        : tipo === 'err'
        ? 'bg-red-900/90 border-red-600 text-red-300'
        : 'bg-slate-800/95 border-white/10 text-slate-200'
      }`}>
      {msg}
    </div>
  );
}

export default function Compras() {
  const [aba,   setAba]   = useState('abertos');
  const [toast, setToast] = useState({ msg: '', tipo: 'info' });

  function showToast(msg, tipo = 'info') {
    setToast({ msg, tipo });
    setTimeout(() => setToast({ msg: '', tipo: 'info' }), 4000);
  }

  return (
    <div className="text-slate-100 px-4 py-8 max-w-7xl mx-auto flex-1 overflow-y-auto">
      <Toast msg={toast.msg} tipo={toast.tipo} />

      {/* Cabeçalho */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">🛒 Pedidos de Reposição</h1>
        <p className="text-sm text-slate-500 mt-0.5">Monte pedidos, confirme via NF-e e acompanhe trânsito</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/80 border border-white/[0.06] rounded-xl p-1 mb-6 w-fit flex-wrap">
        {ABAS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setAba(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              aba === id
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            }`}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {aba === 'abertos'  && (
        <AbaPedidosAbertos
          onShowToast={showToast}
          onTransitAdded={() => {}}
          onPedidoFechado={() => {}}
        />
      )}
      {aba === 'fechados' && <AbaPedidosFechados onShowToast={showToast} />}
      {aba === 'acaminho' && <AbaACaminho        onShowToast={showToast} />}
      {aba === 'montar'   && <AbaMontarPedido    onShowToast={showToast} />}
      {aba === 'bi'       && <AbaInteligencia />}
    </div>
  );
}
