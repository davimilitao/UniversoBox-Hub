import { useState, useRef } from 'react';
import {
  CalendarDays, Tag, FileText, DollarSign,
  CheckCircle2, Clock, Plus, Loader2, Upload,
  Layers, Building2, CreditCard,
} from 'lucide-react';
import { apiFetch, authHeaders } from '../../../utils/getAuthToken';
import { TIPO_LABEL } from '../../../utils/financeiroUtils';

function hojeISO() {
  return new Date().toISOString().split('T')[0];
}
function isoParaBR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function brDataParaISO(br) {
  if (!br) return hojeISO();
  const parts = br.split('/');
  if (parts.length !== 3) return hojeISO();
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

const TIPOS = [
  { val: 'operacional',  label: 'Operacional' },
  { val: 'mensal_fixa',  label: 'Fixa Mensal' },
  { val: 'investimento', label: 'Investimento (parcelado)' },
];

const PARCELAS_OPTS = [2,3,4,5,6,7,8,9,10,12,18,24];

export function FormLancarDespesa({ categorias = [], meiosPagamento = [], onSalvar, salvando }) {
  const [form, setForm] = useState({
    data:          hojeISO(),
    tipo:          'operacional',
    categoria:     '',
    fornecedor:    '',
    descricao:     '',
    valor:         '',
    situacao:      'pago',
    meioId:        '',
    numeroParcelas: 2,
  });
  const [parseando, setParseando] = useState(false);
  const fileRef = useRef(null);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleImportar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseando(true);
    try {
      const hdrs = await authHeaders({});
      delete hdrs['Content-Type']; // deixa o browser setar multipart boundary
      const fd = new FormData();
      fd.append('arquivo', file);
      const res = await fetch('/api/fin-despesas/parse-comprovante', {
        method: 'POST',
        headers: { Authorization: hdrs.Authorization },
        body: fd,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Falha ao ler comprovante');
      setForm(f => ({
        ...f,
        valor:     data.valor     ? String(data.valor)      : f.valor,
        data:      data.data      ? brDataParaISO(data.data) : f.data,
        fornecedor: data.fornecedor || f.fornecedor,
      }));
    } catch (err) {
      alert(`Erro ao importar comprovante: ${err.message}`);
    } finally {
      setParseando(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.categoria.trim() || !form.fornecedor.trim()) return;

    const payload = {
      data:       isoParaBR(form.data),
      tipo:       form.tipo,
      categoria:  form.categoria.trim(),
      fornecedor: form.fornecedor.trim(),
      descricao:  form.descricao.trim(),
      valor:      parseFloat(form.valor),
      situacao:   form.situacao,
      ...(form.tipo === 'investimento' && form.meioId ? {
        meioId:        form.meioId,
        numeroParcelas: Number(form.numeroParcelas),
      } : {}),
    };

    await onSalvar(payload);
    setForm(f => ({ ...f, categoria: '', fornecedor: '', descricao: '', valor: '' }));
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

      {/* Cabeçalho + botão importar */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Plus size={15} className="text-emerald-400" />
          Lançar Despesa
        </h2>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={parseando}
          title="Importar comprovante (PDF ou imagem)"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 border border-white/10 text-slate-300 text-xs transition-colors disabled:opacity-50"
        >
          {parseando ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {parseando ? 'Lendo...' : 'Importar'}
        </button>
        <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={handleImportar} />
      </div>

      {/* Tipo */}
      <Campo label="Tipo" icon={Layers}>
        <div className="flex gap-1.5 flex-wrap">
          {TIPOS.map(({ val, label }) => (
            <button
              key={val}
              type="button"
              onClick={() => set('tipo', val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                form.tipo === val
                  ? 'bg-emerald-600/30 border-emerald-600 text-emerald-400'
                  : 'bg-slate-900 border-white/10 text-slate-500 hover:border-white/20'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Campo>

      {/* Data */}
      <Campo label="Data" icon={CalendarDays}>
        <input type="date" value={form.data} onChange={e => set('data', e.target.value)} className={inputCls} required />
      </Campo>

      {/* Categoria */}
      <Campo label="Categoria" icon={Tag}>
        <input
          type="text"
          list="categorias-despesa"
          placeholder="Ex: Transporte / Frete"
          value={form.categoria}
          onChange={e => set('categoria', e.target.value)}
          className={inputCls}
          required
          autoComplete="off"
        />
        <datalist id="categorias-despesa">
          {categorias.map(c => <option key={c} value={c} />)}
        </datalist>
      </Campo>

      {/* Fornecedor */}
      <Campo label="Fornecedor" icon={Building2}>
        <input
          type="text"
          placeholder="Ex: J3 Transportadora"
          value={form.fornecedor}
          onChange={e => set('fornecedor', e.target.value)}
          className={inputCls}
          required
        />
      </Campo>

      {/* Descrição */}
      <Campo label="Descrição (opcional)" icon={FileText}>
        <input
          type="text"
          placeholder="Ex: Coleta semana 17/04"
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

      {/* Campos extras para investimento */}
      {form.tipo === 'investimento' && (
        <>
          <Campo label="Meio de pagamento" icon={CreditCard}>
            <select value={form.meioId} onChange={e => set('meioId', e.target.value)} className={inputCls} required>
              <option value="">Selecione o cartão...</option>
              {meiosPagamento.map(m => (
                <option key={m.id} value={m.id}>{m.nome}{m.bandeira ? ` (${m.bandeira})` : ''}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Parcelas" icon={Layers}>
            <select value={form.numeroParcelas} onChange={e => set('numeroParcelas', e.target.value)} className={inputCls}>
              {PARCELAS_OPTS.map(n => <option key={n} value={n}>{n}x</option>)}
            </select>
          </Campo>
        </>
      )}

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
