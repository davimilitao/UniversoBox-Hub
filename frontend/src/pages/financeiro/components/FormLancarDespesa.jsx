/**
 * @file FormLancarDespesa.jsx
 * @module financeiro
 * @description Formulário de lançamento de despesa via POST /api/fin-despesas.
 *              Suporta tipo (mensal_fixa / operacional / investimento) e fornecedor.
 *              Investimento: exibe campos numeroParcelas e meioId.
 * @version 3.1.0
 * @date 2026-04-12
 * @changelog
 *   3.1.0 — 2026-04-12 — Prop initialValues para pré-preencher formulário (modal de Compras).
 *   3.0.0 — 2026-04-11 — Migrado para fin-despesas (Firestore); tipo + fornecedor + parcelas.
 *   2.0.0 — 2026-04-01 — Input date nativo, Lucide icons, nova categoria inline.
 */

import { useState } from 'react';
import {
  CalendarDays, Tag, FileText, DollarSign, Building2,
  CheckCircle2, Clock, Plus, X, Loader2, Layers,
} from 'lucide-react';

function hojeISO() { return new Date().toISOString().split('T')[0]; }
function isoParaBR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const inputCls = "w-full rounded-lg bg-slate-900 border border-white/10 text-slate-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 placeholder-slate-600 [color-scheme:dark]";

function Campo({ label, icon: Icon, children }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
        <Icon size={12} className="text-slate-600" /> {label}
      </label>
      {children}
    </div>
  );
}

const TIPOS = [
  { val: 'mensal_fixa',  label: 'Fixa Mensal',   desc: 'Contador, aluguel, assinaturas' },
  { val: 'operacional',  label: 'Operacional',    desc: 'Frete, ADS, embalagens' },
  { val: 'investimento', label: 'Investimento',   desc: 'Parcelado — vai p/ Contas a Pagar' },
];

export function FormLancarDespesa({ categorias, meiosPagamento = [], onSalvar, salvando, initialValues = {} }) {
  const [form, setForm] = useState({
    data:           hojeISO(),
    tipo:           'operacional',
    categoria:      '',
    fornecedor:     '',
    descricao:      '',
    valor:          '',
    situacao:       'pago',
    numeroParcelas: '1',
    meioId:         '',
    ...initialValues,
  });
  const [novaCategoria,  setNovaCategoria]  = useState('');
  const [adicionandoCat, setAdicionandoCat] = useState(false);

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    const categoria = adicionandoCat ? novaCategoria.trim() : form.categoria;
    if (!categoria || !form.fornecedor || !form.valor) return;

    const payload = {
      data:      isoParaBR(form.data),
      tipo:      form.tipo,
      categoria,
      fornecedor: form.fornecedor,
      descricao:  form.descricao,
      valor:      parseFloat(form.valor),
      situacao:   form.tipo === 'investimento' ? 'pendente' : form.situacao,
    };
    if (form.tipo === 'investimento') {
      payload.numeroParcelas = parseInt(form.numeroParcelas, 10) || 1;
      payload.meioId         = form.meioId || null;
      payload.taxaJuros      = 0;
    }

    await onSalvar(payload);
    setForm(f => ({ ...f, descricao: '', valor: '', fornecedor: '' }));
    setNovaCategoria('');
    setAdicionandoCat(false);
  }

  const isInvestimento = form.tipo === 'investimento';

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-slate-800 border border-white/5 p-5 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
        <Plus size={15} className="text-emerald-400" /> Lançar Despesa
      </h2>

      {/* Data */}
      <Campo label="Data" icon={CalendarDays}>
        <input type="date" value={form.data} onChange={e => set('data', e.target.value)}
          className={inputCls} required />
      </Campo>

      {/* Tipo */}
      <Campo label="Tipo" icon={Layers}>
        <div className="flex flex-col gap-1">
          {TIPOS.map(t => (
            <button key={t.val} type="button" onClick={() => set('tipo', t.val)}
              className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors ${
                form.tipo === t.val
                  ? 'bg-emerald-900/30 border-emerald-700/60 text-emerald-300'
                  : 'bg-slate-900 border-white/10 text-slate-400 hover:border-white/20'
              }`}>
              <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${form.tipo === t.val ? 'bg-emerald-400' : 'bg-slate-700'}`} />
              <span>
                <span className="text-xs font-semibold block">{t.label}</span>
                <span className="text-[10px] text-slate-600">{t.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </Campo>

      {/* Fornecedor */}
      <Campo label="Fornecedor" icon={Building2}>
        <input type="text" placeholder="Ex: J3 Transportadora, Jadlog..."
          value={form.fornecedor} onChange={e => set('fornecedor', e.target.value)}
          className={inputCls} required />
      </Campo>

      {/* Categoria */}
      <Campo label="Categoria" icon={Tag}>
        {!adicionandoCat ? (
          <div className="flex gap-2">
            <select value={form.categoria} onChange={e => set('categoria', e.target.value)}
              className={`${inputCls} flex-1`} required>
              <option value="">Selecione...</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="button" onClick={() => setAdicionandoCat(true)} title="Nova categoria"
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 border border-white/10 transition-colors shrink-0">
              <Plus size={15} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              <input type="text" placeholder="Nome da nova categoria"
                value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)}
                className={`${inputCls} flex-1`} autoFocus required />
              <button type="button" onClick={() => { setAdicionandoCat(false); setNovaCategoria(''); }}
                className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-700 text-slate-400 hover:bg-slate-600 border border-white/10 shrink-0">
                <X size={15} />
              </button>
            </div>
            <p className="text-xs text-emerald-500 flex items-center gap-1">
              <Plus size={11} /> Categoria nova criada no banco
            </p>
          </div>
        )}
      </Campo>

      {/* Descrição */}
      <Campo label="Descrição" icon={FileText}>
        <input type="text" placeholder="Detalhes opcionais"
          value={form.descricao} onChange={e => set('descricao', e.target.value)}
          className={inputCls} />
      </Campo>

      {/* Valor */}
      <Campo label="Valor (R$)" icon={DollarSign}>
        <input type="number" step="0.01" min="0" placeholder="0,00"
          value={form.valor} onChange={e => set('valor', e.target.value)}
          className={inputCls} required />
      </Campo>

      {/* Investimento: parcelas + meio */}
      {isInvestimento && (
        <div className="rounded-lg bg-violet-900/20 border border-violet-700/30 p-3 flex flex-col gap-3">
          <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider">Parcelamento</p>
          <Campo label="Nº de parcelas" icon={Layers}>
            <select value={form.numeroParcelas} onChange={e => set('numeroParcelas', e.target.value)} className={inputCls}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>{n}x</option>
              ))}
            </select>
          </Campo>
          {meiosPagamento.length > 0 && (
            <Campo label="Meio de pagamento" icon={Building2}>
              <select value={form.meioId} onChange={e => set('meioId', e.target.value)} className={inputCls}>
                <option value="">Sem meio específico</option>
                {meiosPagamento.map(m => (
                  <option key={m.id} value={m.id}>{m.nome || m.id}</option>
                ))}
              </select>
            </Campo>
          )}
          <p className="text-xs text-slate-500">Parcelas serão criadas em Contas a Pagar automaticamente.</p>
        </div>
      )}

      {/* Status — apenas para não-investimento */}
      {!isInvestimento && (
        <div>
          <label className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
            <CheckCircle2 size={12} className="text-slate-600" /> Status
          </label>
          <div className="flex gap-2">
            {[
              { val: 'pago',     label: 'Pago',     Icon: CheckCircle2, cor: 'emerald' },
              { val: 'pendente', label: 'Pendente', Icon: Clock,        cor: 'amber'   },
            ].map(({ val, label, Icon, cor }) => (
              <button key={val} type="button" onClick={() => set('situacao', val)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  form.situacao === val
                    ? cor === 'emerald'
                      ? 'bg-emerald-600/30 border-emerald-600 text-emerald-400'
                      : 'bg-amber-600/20 border-amber-500 text-amber-400'
                    : 'bg-slate-900 border-white/10 text-slate-500 hover:border-white/20'
                }`}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Botão */}
      <button type="submit" disabled={salvando}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
        {salvando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
        {salvando ? 'Salvando...' : 'Adicionar Despesa'}
      </button>
    </form>
  );
}
