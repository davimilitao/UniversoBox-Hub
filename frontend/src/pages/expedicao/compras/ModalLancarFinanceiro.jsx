/**
 * @file ModalLancarFinanceiro.jsx
 * @module expedicao/compras
 * @description Modal para lançar um pedido fechado como investimento no módulo Financeiro.
 *   Pré-preenche os campos a partir dos dados da NF-e (fornecedor, valor, NF número).
 *   Reutiliza FormLancarDespesa com a prop initialValues.
 * @version 1.0.0
 * @date 2026-04-12
 * @changelog
 *   1.0.0 — 2026-04-12 — Criação; categoria padrão "Compras de Mercadoria".
 */

import { useState, useEffect } from 'react';
import { X, DollarSign, Plus, Loader2 } from 'lucide-react';
import { apiFetch } from '../../../utils/getAuthToken.js';
import { FormLancarDespesa } from '../../financeiro/components/FormLancarDespesa.jsx';
import { useMeiosPagamento } from '../../../hooks/useMeiosPagamento.js';
import { BRL } from './helpers.js';

const CATEGORIA_COMPRAS = 'Compras de Mercadoria';

function hojeISO() { return new Date().toISOString().split('T')[0]; }

export default function ModalLancarFinanceiro({ pedido, onClose, onLancado, onShowToast }) {
  const { meios } = useMeiosPagamento();
  const [categorias,  setCategorias]  = useState([CATEGORIA_COMPRAS]);
  const [salvando,    setSalvando]    = useState(false);
  const [lancamentos, setLancamentos] = useState(0); // quantas despesas foram lançadas

  // Carrega categorias existentes do backend para o select
  useEffect(() => {
    apiFetch('/api/fin-despesas?limit=200')
      .then(r => r.json())
      .then(data => {
        const cats = [...new Set((data.items || []).map(d => d.categoria).filter(Boolean))];
        // Garante que a categoria de compras aparece sempre
        if (!cats.includes(CATEGORIA_COMPRAS)) cats.unshift(CATEGORIA_COMPRAS);
        setCategorias(cats);
      })
      .catch(() => {});
  }, []);

  // Valores pré-preenchidos da NF
  const initialValues = {
    data:           hojeISO(),
    tipo:           'investimento',
    categoria:      CATEGORIA_COMPRAS,
    fornecedor:     pedido.fornecedor || '',
    descricao:      [
      'Compra',
      pedido.notaFiscalNumero ? `NF ${pedido.notaFiscalNumero}` : '',
      pedido.items?.length    ? `– ${pedido.items.length} iten${pedido.items.length !== 1 ? 's' : ''}` : '',
    ].filter(Boolean).join(' '),
    valor:          pedido.valorTotal > 0 ? String(pedido.valorTotal) : '',
    situacao:       'pendente',
    numeroParcelas: '1',
    meioId:         '',
  };

  async function handleSalvar(payload) {
    setSalvando(true);
    try {
      // 1. Lança a despesa no Financeiro
      const res  = await apiFetch('/api/fin-despesas', {
        method:  'POST',
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao lançar despesa');

      const despesaId = data.id;
      setLancamentos(n => n + 1);

      // 2. Registra o finDespesaId no pedido (apenas no primeiro lançamento)
      if (lancamentos === 0 && despesaId) {
        await fetch(`/api/purchase-orders/${pedido.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ finDespesaId: despesaId }),
        });
      }

      onLancado(despesaId);
    } catch (err) {
      onShowToast(`Erro: ${err.message}`, 'err');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <DollarSign size={18} className="text-violet-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-100">Lançar como Investimento</h3>
              <p className="text-xs text-slate-500">
                {pedido.notaFiscalNumero ? `NF ${pedido.notaFiscalNumero} · ` : ''}
                {pedido.valorTotal > 0 ? BRL.format(pedido.valorTotal) : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Formulário */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <FormLancarDespesa
            categorias={categorias}
            meiosPagamento={meios}
            onSalvar={handleSalvar}
            salvando={salvando}
            initialValues={initialValues}
          />

          {/* Botão "+ Adicionar outra despesa" */}
          {lancamentos > 0 && (
            <div className="mt-3 text-center">
              <p className="text-xs text-emerald-400 mb-2">
                {lancamentos} lançamento{lancamentos !== 1 ? 's' : ''} realizado{lancamentos !== 1 ? 's' : ''} ✅
              </p>
              <button
                onClick={() => {
                  // Apenas fecha o modal — o FormLancarDespesa já reseta após salvar
                  onShowToast('Preencha os dados para a próxima despesa', 'info');
                }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 underline mx-auto">
                <Plus size={11} /> Adicionar outra despesa
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
