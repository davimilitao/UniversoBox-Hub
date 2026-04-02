/**
 * @file FormLancarDespesa.jsx
 * @module financeiro
 * @description Formulário para lançar nova despesa. Categorias dinâmicas vindas da planilha.
 * @version 1.0.0
 * @date 2026-04-01
 * @author UniversoLab
 */

import { useState } from 'react';

function hoje() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

export function FormLancarDespesa({ categorias, onSalvar, salvando }) {
  const [form, setForm] = useState({
    data:      hoje(),
    nome:      '',
    descricao: '',
    valor:     '',
    situacao:  'pago',
  });
  const [novaCategoria, setNovaCategoria] = useState('');
  const [adicionandoCat, setAdicionandoCat] = useState(false);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const nome = adicionandoCat ? novaCategoria.trim() : form.nome;
    if (!nome) return;
    await onSalvar({ ...form, nome });
    // Reset parcial — mantém data, categoria e status
    setForm(f => ({ ...f, descricao: '', valor: '' }));
    setNovaCategoria('');
    setAdicionandoCat(false);
  }

  const inputCls = "w-full rounded-lg bg-slate-900 border border-white/10 text-slate-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 placeholder-slate-600";

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-slate-800 border border-white/5 p-5 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Lançar Despesa</h2>

      {/* Data */}
      <div>
        <label className="text-xs text-slate-500 mb-1 block">Data</label>
        <input
          type="text"
          placeholder="DD/MM/AAAA"
          value={form.data}
          onChange={e => set('data', e.target.value)}
          className={inputCls}
          required
        />
      </div>

      {/* Categoria */}
      <div>
        <label className="text-xs text-slate-500 mb-1 block">Categoria</label>
        {!adicionandoCat ? (
          <div className="flex gap-2">
            <select
              value={form.nome}
              onChange={e => set('nome', e.target.value)}
              className={`${inputCls} flex-1`}
              required={!adicionandoCat}
            >
              <option value="">Selecione...</option>
              {categorias.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setAdicionandoCat(true)}
              className="px-3 py-2 rounded-lg bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 border border-white/10 shrink-0"
              title="Nova categoria"
            >
              +
            </button>
          </div>
        ) : (
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
              className="px-3 py-2 rounded-lg bg-slate-700 text-slate-400 text-sm hover:bg-slate-600 border border-white/10 shrink-0"
            >
              ✕
            </button>
          </div>
        )}
        {adicionandoCat && (
          <p className="text-xs text-emerald-500 mt-1">
            A categoria será criada automaticamente na planilha.
          </p>
        )}
      </div>

      {/* Descrição */}
      <div>
        <label className="text-xs text-slate-500 mb-1 block">Descrição</label>
        <input
          type="text"
          placeholder="Ex: J3 Transportadora"
          value={form.descricao}
          onChange={e => set('descricao', e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Valor */}
      <div>
        <label className="text-xs text-slate-500 mb-1 block">Valor (R$)</label>
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

      {/* Status */}
      <div>
        <label className="text-xs text-slate-500 mb-1 block">Status</label>
        <div className="flex gap-2">
          {[
            { val: 'pago',     label: '✅ Pago'    },
            { val: 'pendente', label: '⏳ Pendente' },
          ].map(s => (
            <button
              key={s.val}
              type="button"
              onClick={() => set('situacao', s.val)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors
                ${form.situacao === s.val
                  ? s.val === 'pago'
                    ? 'bg-emerald-600/30 border-emerald-600 text-emerald-400'
                    : 'bg-orange-600/20 border-orange-500 text-orange-400'
                  : 'bg-slate-900 border-white/10 text-slate-500 hover:border-white/20'
                }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={salvando}
        className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
      >
        {salvando ? 'Salvando...' : '+ Adicionar Despesa'}
      </button>
    </form>
  );
}
