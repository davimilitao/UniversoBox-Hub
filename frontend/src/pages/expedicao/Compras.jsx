/**
 * @file Compras.jsx
 * @module expedicao
 * @description Gestão de Compras — confirmação via NF-e, trânsito e inteligência.
 *   4 abas: Pedidos Abertos · A Caminho · Pedidos Fechados · Inteligência
 * @version 3.0.0
 * @date 2026-05-03
 * @changelog
 *   3.0.0 — 2026-05-03 — Remove aba "Novo Pedido" (substituída por GestaoReposicao);
 *             banner de reposições pendentes; reordenação de abas.
 *   2.0.0 — 2026-04-12 — Refatoração: 5 abas; pedidos abertos vs fechados; XML NF-e;
 *             integração Financeiro; detecção de duplicatas no carrinho; estoque atualizado.
 *   1.0.0 — 2026-04-06 — Migrado de compras.html para React (4 abas).
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, BarChart2, FileCheck, Clock, ClipboardList } from 'lucide-react';
import { Toast } from '../../components/ui';
import { getAuthToken } from '../../utils/getAuthToken';
import AbaPedidosAbertos  from './compras/AbaPedidosAbertos.jsx';
import AbaPedidosFechados from './compras/AbaPedidosFechados.jsx';
import AbaACaminho        from './compras/AbaACaminho.jsx';
import AbaInteligencia    from './compras/AbaInteligencia.jsx';

const ABAS = [
  { id: 'abertos',  label: 'Pedidos Abertos',  Icon: Clock      },
  { id: 'acaminho', label: 'A Caminho',         Icon: Truck      },
  { id: 'fechados', label: 'Pedidos Fechados',  Icon: FileCheck  },
  { id: 'bi',       label: 'Inteligência',       Icon: BarChart2  },
];

export default function Compras() {
  const navigate = useNavigate();
  const [aba,                setAba]                = useState('abertos');
  const [toast,              setToast]              = useState({ msg: '', tipo: 'info' });
  const [reposicoesPendentes, setReposicoesPendentes] = useState(0);

  function showToast(msg, tipo = 'info') {
    setToast({ msg, tipo });
    setTimeout(() => setToast({ msg: '', tipo: 'info' }), 4000);
  }

  useEffect(() => {
    getAuthToken().then(token =>
      fetch('/api/reposicoes?status=pendente', { headers: { Authorization: token } })
        .then(r => r.json())
        .then(d => setReposicoesPendentes(d.items?.length || 0))
        .catch(() => {})
    );
  }, []);

  return (
    <div className="text-slate-100 px-4 py-8 max-w-7xl mx-auto flex-1 overflow-y-auto">
      <Toast msg={toast.msg} tipo={toast.tipo} />

      {/* Cabeçalho */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-100">🛒 Compras</h1>
        <p className="text-sm text-slate-500 mt-0.5">Confirme pedidos via NF-e e acompanhe trânsito</p>
      </div>

      {/* Banner reposições pendentes */}
      {reposicoesPendentes > 0 && (
        <div className="flex items-center justify-between gap-3 mb-5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
          <span>
            ⚠️ {reposicoesPendentes} {reposicoesPendentes === 1 ? 'reposição pendente aguarda' : 'reposições pendentes aguardam'} criação de compra
          </span>
          <button
            onClick={() => navigate('/expedicao/reposicao')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <ClipboardList size={13} /> Ver Reposições
          </button>
        </div>
      )}

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
      {aba === 'acaminho' && <AbaACaminho        onShowToast={showToast} />}
      {aba === 'fechados' && <AbaPedidosFechados onShowToast={showToast} />}
      {aba === 'bi'       && <AbaInteligencia />}
    </div>
  );
}
