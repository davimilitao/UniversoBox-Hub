/**
 * @file FormLancarDespesa.jsx
 * @module financeiro
 * @description Formulário de lançamento de despesa com input de data nativo e Lucide icons.
 * @version 2.0.0
 * @date 2026-04-01
 * @author UniversoLab
 *
 * @changelog
 *   2.0.0 — 2026-04-01 — Input date nativo, Lucide icons, nova categoria inline.
 *   1.0.0 — 2026-04-01 — Criação inicial.
 */

import { useState } from 'react';
import {
  CalendarDays, Tag, FileText, DollarSign,
  CheckCircle2, Clock, Plus, X, Loader2,
} from 'lucide-react';

// Hoje no formato YYYY-MM-DD (nativo do input date)
function hojeISO() {
  return new Date().toISOString().split('T')[0];
}

// Converte YYYY-MM-DD → DD/MM/YYYY para o backend
function isoParaBR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function FormLancarDespesa({ categorias, onSalvar, salvando }) {
  const [form, setForm] = useState({
    data:     hojeISO(),
    nome:     '',
    descricao:'',
    valor:    '',
    situacao: 'pago',
  });
  const [novaCategoria,   setNovaCategoria]   = useState('');
  const [adicionandoCat,  setAdicionandoCat]  = useState(false);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const nome = adicionandoCat ? novaCategoria.trim() : form.nome;
    if (!nome) return;

    // Converte data para DD/MM/YYYY antes de enviar
    await onSalvar({ ...form, data: isoParaBR(form.data), nome });

    // Reset parcial
    setForm(f => ({ ...f, descricao: '', valor: '' }));
    setNovaCategoria('');
    setAdicionandoCat(false);
  }

  const inputCls = "w-full rounded-lg bg-slate-900 border border-white/10 text-slate-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 placeholder-slate-600 [color-scheme:dark]";

  function Campo({ label, icon: Icon, children }) {
    return (
      <div>
        <label className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
          <Icon size={12} className="text-slate-600" />
          {label}
        </label>
        {children}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-slate-800 border border-white/5 p-5 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
        <Plus size={15} className="text-emerald-400" />
        Lançar Despesa
      </h2>

      {/* Data */}
      <Campo label="Data" icon={CalendarDays}>
        <input
          type="date"
          value={form.data}
          onChange={e => set('data', e.target.value)}
          className={inputCls}
          required
        />
      </Campo>

      {/* Categoria */}
      <Campo label="Categoria" icon={Tag}>
        {!adicionandoCat ? (
          <div className="flex gap-2">
            <select
              value={form.nome}
              onChange={e => set('nome', e.target.value)}
              className={`${inputCls} flex-1`}
              required
            >
              <option value="">Selecione...</option>
              {categorias.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setAdicionandoCat(true)}
              title="Nova categoria"
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 border border-white/10 transition-colors shrink-0"
            >
              <Plus size={15} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nome da nova categoria"
                value={novaCategoria}
                onChange={e => setNovaCategoria(e.target.value)}
                className={`${inputCls} flex-1`}
                autoFocus
                required
              />
              <button
                type="button"
                onClick={() => { setAdicionandoCat(false); setNovaCategoria(''); }}
                className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-700 text-slate-400 hover:bg-slate-600 border border-white/10 transition-colors shrink-0"
              >
                <X size={15} />
              </button>
            </div>
            <p className="text-xs text-emerald-500 flex items-center gap-1">
              <Plus size={11} /> Criada automaticamente na planilha
            </p>
          </div>
        )}
      </Campo>

      {/* Descrição */}
      <Campo label="Descrição" icon={FileText}>
        <input
          type="text"
          placeholder="Ex: J3 Transportadora"
          value={form.descricao}
          onChange={e => set('descricao', e.target.value)}
          className={inputCls}
        />
      </Campo>

      {/* Valor */}
      <Campo label="Valor (R$)" icon={DollarSign}>
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
      </Campo>

      {/* Status */}
      <div>
        <label className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
          <CheckCircle2 size={12} className="text-slate-600" />
          Status
        </label>
        <div className="flex gap-2">
          {[
            { val: 'pago',     label: 'Pago',     Icon: CheckCircle2, cor: 'emerald' },
            { val: 'pendente', label: 'Pendente', Icon: Clock,        cor: 'orange'  },
          ].map(({ val, label, Icon, cor }) => (
            <button
              key={val}
              type="button"
              onClick={() => set('situacao', val)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium border transition-colors
                ${form.situacao === val
                  ? cor === 'emerald'
                    ? 'bg-emerald-600/30 border-emerald-600 text-emerald-400'
                    : 'bg-orange-600/20 border-orange-500 text-orange-400'
                  : 'bg-slate-900 border-white/10 text-slate-500 hover:border-white/20'}`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Botão */}
      <button
        type="submit"
        disabled={salvando}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
      >
        {salvando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
        {salvando ? 'Salvando...' : 'Adicionar Despesa'}
      </button>
    </form>
  );
}
