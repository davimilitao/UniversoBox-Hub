/**
 * @file Recebiveis.jsx
 * @description Gestão de recebíveis — valores que entram no caixa (vendas liberadas, pix pendente, etc.)
 *              CRUD simples alimentando fin_recebiveis. Soma 7/15/30 dias aparece em Saúde Financeira.
 * @version 1.0.0
 * @date 2026-04-21
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../utils/getAuthToken';
import {
  ArrowLeft, Plus, RefreshCw, CheckCircle2, XCircle,
  Trash2, Pencil, CalendarDays, Banknote,
} from 'lucide-react';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatDataBR(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR');
}

function diasAteHoje(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

function dataInputValue(iso) {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

const ORIGENS = ['ML', 'Shopee', 'Bling', 'Pix', 'Manual', 'Outro'];

export function Recebiveis() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [modal, setModal] = useState(null); // null | 'novo' | { editar: item }

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await apiFetch('/api/fin-recebiveis');
      if (!res.ok) throw new Error('Falha ao carregar recebíveis');
      const j = await res.json();
      setItems(j.items || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar(dados, id) {
    const url = id ? `/api/fin-recebiveis/${id}` : '/api/fin-recebiveis';
    const method = id ? 'PATCH' : 'POST';
    const res = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    });
    if (!res.ok) throw new Error('Falha ao salvar');
    setModal(null);
    carregar();
  }

  async function atualizarStatus(id, status) {
    await apiFetch(`/api/fin-recebiveis/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    carregar();
  }

  async function excluir(id) {
    if (!confirm('Remover este recebível?')) return;
    await apiFetch(`/api/fin-recebiveis/${id}`, { method: 'DELETE' });
    carregar();
  }

  // Totais por faixa
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const previstos = items.filter(i => i.status === 'previsto');
  const totalPor = (dias) => previstos
    .filter(i => {
      const d = diasAteHoje(i.dataPrevista);
      return d != null && d <= dias;
    })
    .reduce((s, i) => s + (i.valor || 0), 0);

  const t7 = totalPor(7), t15 = totalPor(15), t30 = totalPor(30);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 border-b border-white/5">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/financeiro/saude" className="text-slate-400 hover:text-slate-200 p-2 -ml-2">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-lg font-bold flex items-center gap-2">
                <Banknote size={16} className="text-emerald-400" />
                Recebíveis
              </h1>
              <p className="text-[11px] text-slate-500 mt-0.5">Valores que entram no caixa</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={carregar}
              disabled={loading}
              className="p-2.5 rounded-xl bg-slate-800 border border-white/10 text-slate-400 hover:text-slate-200 disabled:opacity-40 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Atualizar"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setModal('novo')}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold min-h-[44px]"
            >
              <Plus size={14} /> Novo
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 pt-5 flex flex-col gap-4">
        {erro && (
          <div className="rounded-xl bg-red-900/20 border border-red-700/30 p-3 text-xs text-red-300">
            {erro}
          </div>
        )}

        {/* Resumo 7/15/30 */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { l: '7 dias', v: t7 },
            { l: '15 dias', v: t15 },
            { l: '30 dias', v: t30 },
          ].map(x => (
            <div key={x.l} className="rounded-xl bg-slate-800 border border-white/5 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{x.l}</p>
              <p className="text-sm font-bold text-emerald-400 tabular-nums">{BRL.format(x.v)}</p>
            </div>
          ))}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center py-12 text-slate-500 text-sm">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            Nenhum recebível cadastrado.
            <br />
            <button
              onClick={() => setModal('novo')}
              className="mt-3 text-emerald-400 hover:text-emerald-300 text-xs underline"
            >
              Cadastrar o primeiro
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map(item => {
              const dias = diasAteHoje(item.dataPrevista);
              const atrasado = item.status === 'previsto' && dias != null && dias < 0;
              const cor = item.status === 'recebido' ? 'emerald'
                : item.status === 'cancelado' ? 'slate'
                : atrasado ? 'red'
                : dias <= 3 ? 'amber'
                : 'blue';
              const bordas = {
                emerald: 'border-l-emerald-500', slate: 'border-l-slate-600',
                red: 'border-l-red-500', amber: 'border-l-amber-500', blue: 'border-l-blue-500',
              };
              return (
                <div key={item.id}
                  className={`rounded-xl bg-slate-800 border border-white/5 border-l-4 ${bordas[cor]} p-3 flex items-center gap-3`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300">
                        {item.origem}
                      </span>
                      {item.status !== 'previsto' && (
                        <span className={`text-[10px] uppercase tracking-wider ${
                          item.status === 'recebido' ? 'text-emerald-400' : 'text-slate-500'
                        }`}>
                          {item.status}
                        </span>
                      )}
                      {atrasado && (
                        <span className="text-[10px] uppercase tracking-wider text-red-400">atrasado</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-100 truncate">{item.descricao || '—'}</p>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <CalendarDays size={10} />
                      {formatDataBR(item.dataPrevista)}
                      {item.status === 'previsto' && dias != null && (
                        <span className="ml-1">
                          {dias === 0 ? '(hoje)' : dias > 0 ? `(em ${dias}d)` : `(há ${Math.abs(dias)}d)`}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-bold text-emerald-400 tabular-nums">{BRL.format(item.valor)}</span>
                    <div className="flex gap-1">
                      {item.status === 'previsto' && (
                        <button
                          onClick={() => atualizarStatus(item.id, 'recebido')}
                          className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-emerald-400"
                          title="Marcar como recebido"
                        >
                          <CheckCircle2 size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => setModal({ editar: item })}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400"
                        title="Editar"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => excluir(item.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400"
                        title="Remover"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && (
        <ModalRecebivel
          inicial={modal.editar || null}
          onCancelar={() => setModal(null)}
          onSalvar={salvar}
        />
      )}
    </div>
  );
}

// ═══ Modal de criação/edição ═══════════════════════════════════════════════
function ModalRecebivel({ inicial, onCancelar, onSalvar }) {
  const [valor, setValor] = useState(inicial?.valor || '');
  const [dataPrevista, setDataPrevista] = useState(
    inicial ? dataInputValue(inicial.dataPrevista) : new Date().toISOString().slice(0, 10)
  );
  const [origem, setOrigem] = useState(inicial?.origem || 'Manual');
  const [descricao, setDescricao] = useState(inicial?.descricao || '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const v = parseFloat(String(valor).replace(',', '.'));
    if (!v || v <= 0) return setErro('Valor inválido');
    if (!dataPrevista) return setErro('Informe a data prevista');
    setSalvando(true);
    setErro(null);
    try {
      const [y, m, d] = dataPrevista.split('-');
      await onSalvar(
        { valor: v, dataPrevista: `${d}/${m}/${y}`, origem, descricao },
        inicial?.id
      );
    } catch (e2) {
      setErro(e2.message);
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onCancelar}>
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md bg-slate-900 border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-4"
      >
        <h2 className="text-base font-bold">{inicial ? 'Editar recebível' : 'Novo recebível'}</h2>

        {erro && <div className="text-xs text-red-400">{erro}</div>}

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">Valor</span>
          <input
            type="number" step="0.01" min="0" inputMode="decimal"
            value={valor} onChange={e => setValor(e.target.value)}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-3 text-lg font-bold tabular-nums focus:outline-none focus:border-emerald-500/50"
            autoFocus required
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">Data prevista</span>
          <input
            type="date"
            value={dataPrevista} onChange={e => setDataPrevista(e.target.value)}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-emerald-500/50"
            required
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">Origem</span>
          <select
            value={origem} onChange={e => setOrigem(e.target.value)}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-emerald-500/50"
          >
            {ORIGENS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">Descrição (opcional)</span>
          <input
            type="text" maxLength={120}
            value={descricao} onChange={e => setDescricao(e.target.value)}
            placeholder="Ex: Liberação ML semana X"
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-emerald-500/50"
          />
        </label>

        <div className="flex gap-2 mt-2">
          <button
            type="button" onClick={onCancelar}
            className="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-sm text-slate-300 hover:text-slate-100"
          >
            Cancelar
          </button>
          <button
            type="submit" disabled={salvando}
            className="flex-1 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}
