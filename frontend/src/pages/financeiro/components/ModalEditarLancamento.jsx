/**
 * @file ModalEditarLancamento.jsx
 * @description Modal de edição para lançamentos financeiros (despesas ou parcelas de compras).
 * @version 1.0.0
 */

import { useState, useEffect } from 'react';
import {
  X, Calendar, Tag, FileText, DollarSign,
  CheckCircle2, Clock, CreditCard, Save,
} from 'lucide-react';

export function ModalEditarLancamento({ item, meios, onClose, onSave }) {
  const [form, setForm] = useState({
    dataISO: '',
    categoria: '',
    fornecedor: '',
    descricao: '',
    valor: '',
    situacao: 'pendente',
    meioId: '',
  });

  useEffect(() => {
    if (!item) return;

    if (item.origem === 'despesa') {
      // Converte data DD/MM/YYYY para YYYY-MM-DD para input date
      let dataISO = '';
      if (item.data) {
        const parts = item.data.split('/');
        if (parts.length === 3) {
          dataISO = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
      }
      setForm({
        dataISO,
        categoria: item.categoria || '',
        fornecedor: '',
        descricao: item.descricao || '',
        valor: item.valor || '',
        situacao: item.situacao || 'pendente',
        meioId: '',
      });
    } else {
      // É parcela. item.timestamp é numérico (ms)
      let dataISO = '';
      if (item.timestamp) {
        dataISO = new Date(item.timestamp).toISOString().split('T')[0];
      }
      setForm({
        dataISO, // usado como vencISO no salvamento
        categoria: '',
        fornecedor: item.fornecedor || '',
        descricao: item.descricao || '',
        valor: item.valor || '',
        situacao: item.situacao || 'pendente',
        meioId: item.meioId || '',
      });
    }
  }, [item]);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (item.origem === 'despesa') {
      onSave({
        ...item,
        dataISO: form.dataISO,
        categoria: form.categoria.trim(),
        descricao: form.descricao.trim(),
        valor: parseFloat(form.valor) || 0,
        situacao: form.situacao,
      });
    } else {
      onSave({
        ...item,
        vencISO: form.dataISO,
        fornecedor: form.fornecedor.trim(),
        descricao: form.descricao.trim(),
        valor: parseFloat(form.valor) || 0,
        situacao: form.situacao,
        meioId: form.meioId,
      });
    }
  }

  const inputCls = "w-full rounded-lg bg-slate-900 border border-white/10 text-slate-200 text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 placeholder-slate-600 [color-scheme:dark]";
  const labelCls = "flex items-center gap-1.5 text-xs text-slate-400 font-semibold mb-1.5 uppercase tracking-wider";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-slate-800 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider">Editar Lançamento</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
              Origem: {item.origem === 'despesa' ? 'Despesa Operacional' : 'Compra Parcelada'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {item.origem === 'despesa' ? (
            <>
              {/* Data despesa */}
              <div>
                <label className={labelCls}>
                  <Calendar size={12} className="text-emerald-400" /> Data
                </label>
                <input
                  type="date"
                  value={form.dataISO}
                  onChange={e => set('dataISO', e.target.value)}
                  className={inputCls}
                  required
                />
              </div>

              {/* Categoria despesa */}
              <div>
                <label className={labelCls}>
                  <Tag size={12} className="text-emerald-400" /> Categoria
                </label>
                <input
                  type="text"
                  placeholder="Categoria (Ex: Aluguel, Luz)"
                  value={form.categoria}
                  onChange={e => set('categoria', e.target.value)}
                  className={inputCls}
                  required
                />
              </div>
            </>
          ) : (
            <>
              {/* Vencimento parcela */}
              <div>
                <label className={labelCls}>
                  <Calendar size={12} className="text-blue-400" /> Vencimento
                </label>
                <input
                  type="date"
                  value={form.dataISO}
                  onChange={e => set('dataISO', e.target.value)}
                  className={inputCls}
                  required
                />
              </div>

              {/* Fornecedor parcela */}
              <div>
                <label className={labelCls}>
                  <Tag size={12} className="text-blue-400" /> Fornecedor
                </label>
                <input
                  type="text"
                  placeholder="Fornecedor / Loja"
                  value={form.fornecedor}
                  onChange={e => set('fornecedor', e.target.value)}
                  className={inputCls}
                  required
                />
              </div>

              {/* Meio de pagamento */}
              <div>
                <label className={labelCls}>
                  <CreditCard size={12} className="text-blue-400" /> Meio de Pagamento
                </label>
                <select
                  value={form.meioId}
                  onChange={e => set('meioId', e.target.value)}
                  className={inputCls}
                  required
                >
                  <option value="">Selecione...</option>
                  {meios.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.nome} — {m.bandeira}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Descrição (comum) */}
          <div>
            <label className={labelCls}>
              <FileText size={12} className="text-slate-400" /> Descrição / Detalhe
            </label>
            <input
              type="text"
              placeholder="Ex: Nota Fiscal 103"
              value={form.descricao}
              onChange={e => set('descricao', e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Valor (comum) */}
          <div>
            <label className={labelCls}>
              <DollarSign size={12} className="text-emerald-400" /> Valor R$
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={form.valor}
              onChange={e => set('valor', e.target.value)}
              className={inputCls}
              required
            />
          </div>

          {/* Status (comum) */}
          <div>
            <label className={labelCls}>
              <CheckCircle2 size={12} className="text-slate-400" /> Status
            </label>
            <div className="flex gap-2">
              {[
                { val: 'pago',     label: 'Pago',     Icon: CheckCircle2, activeCls: 'bg-emerald-600/30 border-emerald-600 text-emerald-400' },
                { val: 'pendente', label: 'Pendente', Icon: Clock,        activeCls: 'bg-orange-600/20 border-orange-500 text-orange-400'  },
              ].map(({ val, label, Icon, activeCls }) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => set('situacao', val)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium border transition-colors
                    ${form.situacao === val
                      ? activeCls
                      : 'bg-slate-900 border-white/10 text-slate-500 hover:border-white/20'}`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-white/10 text-slate-300 text-sm font-semibold hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
            >
              <Save size={14} />
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
