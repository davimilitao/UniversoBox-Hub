/**
 * @file TaskBoard.jsx
 * @description Kanban de tarefas — 4 colunas (novo/ativo/revisao/concluido) com
 *   drag-drop nativo, modal de criação/edição e alternância para visão de calendário.
 *   Tema dark, padrão Saúde/Recebíveis.
 * @version 1.0.0
 * @date 2026-04-22
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { auth } from '../../firebase';
import {
  KanbanSquare, Calendar, Plus, Trash2, Edit2, X, ChevronLeft, ChevronRight,
  RefreshCw, AlertCircle, Flag, CalendarDays, User as UserIcon, LayoutGrid,
} from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  const token = await auth.currentUser?.getIdToken(false).catch(() => null);
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `HTTP ${res.status}`);
  }
  return res.json();
}

const COLUNAS = [
  { id: 'novo',       label: 'Novo',        cor: 'bg-blue-500',    texto: 'text-blue-400',    borda: 'border-blue-500/30' },
  { id: 'ativo',      label: 'Em Andamento', cor: 'bg-amber-500',   texto: 'text-amber-400',   borda: 'border-amber-500/30' },
  { id: 'revisao',    label: 'Revisão',     cor: 'bg-purple-500',  texto: 'text-purple-400',  borda: 'border-purple-500/30' },
  { id: 'concluido',  label: 'Concluído',   cor: 'bg-emerald-500', texto: 'text-emerald-400', borda: 'border-emerald-500/30' },
];

const PRIORIDADES = {
  alta:  { label: 'Alta',  classe: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  media: { label: 'Média', classe: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  baixa: { label: 'Baixa', classe: 'bg-slate-600/20 text-slate-400 border-slate-600/40' },
};

function toDateOnly(iso) {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function fmtDMY(iso) {
  const d = toDateOnly(iso);
  if (!d) return '';
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y.slice(2)}`;
}

function isAtrasada(t) {
  if (!t.dueDate || t.status === 'concluido') return false;
  return toDateOnly(t.dueDate) < toDateOnly(new Date().toISOString());
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function ModalTarefa({ tarefa, onClose, onSalvar, onExcluir, loading }) {
  const [titulo, setTitulo]           = useState(tarefa?.titulo || '');
  const [descricao, setDescricao]     = useState(tarefa?.descricao || '');
  const [status, setStatus]           = useState(tarefa?.status || 'novo');
  const [prioridade, setPrioridade]   = useState(tarefa?.prioridade || 'media');
  const [dueDate, setDueDate]         = useState(toDateOnly(tarefa?.dueDate));
  const [responsavel, setResponsavel] = useState(tarefa?.responsavel || '');
  const [err, setErr]                 = useState('');

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function salvar() {
    if (!titulo.trim()) return setErr('Título é obrigatório.');
    setErr('');
    try {
      await onSalvar({
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        status, prioridade,
        dueDate: dueDate || null,
        responsavel: responsavel.trim(),
      });
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-2xl border border-white/[0.08] bg-slate-900 shadow-2xl p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-slate-100 font-semibold text-sm">{tarefa?.id ? 'Editar tarefa' : 'Nova tarefa'}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.05] transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-medium">Título<span className="text-rose-400 ml-0.5">*</span></label>
            <input
              type="text"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              autoFocus
              placeholder="O que precisa ser feito?"
              className="w-full bg-slate-800 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-medium">Descrição</label>
            <textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              rows={3}
              placeholder="Detalhes, links, critérios de aceite..."
              className="w-full bg-slate-800 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-medium">Coluna</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full bg-slate-800 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              >
                {COLUNAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-medium">Prioridade</label>
              <select
                value={prioridade}
                onChange={e => setPrioridade(e.target.value)}
                className="w-full bg-slate-800 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              >
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-medium">Prazo</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full bg-slate-800 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-medium">Responsável</label>
              <input
                type="text"
                value={responsavel}
                onChange={e => setResponsavel(e.target.value)}
                placeholder="Nome"
                className="w-full bg-slate-800 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
            </div>
          </div>

          {err && <p className="text-xs text-rose-400">{err}</p>}

          <div className="flex gap-2 pt-1">
            {tarefa?.id && (
              <button
                onClick={() => { if (window.confirm('Excluir esta tarefa?')) onExcluir(tarefa.id); }}
                disabled={loading}
                className="px-3 py-2 rounded-lg border border-rose-500/30 text-rose-400 text-sm hover:bg-rose-500/10 disabled:opacity-50 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            )}
            <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-white/[0.08] text-slate-400 text-sm hover:bg-white/[0.04] transition-colors">
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Salvando…' : tarefa?.id ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

function TarefaCard({ tarefa, onClick, onDragStart }) {
  const prio = PRIORIDADES[tarefa.prioridade] || PRIORIDADES.media;
  const atrasada = isAtrasada(tarefa);

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, tarefa.id)}
      onClick={() => onClick(tarefa)}
      className={`group rounded-xl border p-3 space-y-2 cursor-pointer transition-all hover:border-white/20 hover:bg-slate-800/60 ${
        atrasada ? 'border-rose-500/40 bg-rose-500/5' : 'border-white/[0.07] bg-slate-900/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-slate-100 text-sm font-medium leading-snug flex-1">{tarefa.titulo}</p>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold shrink-0 ${prio.classe}`}>
          {prio.label}
        </span>
      </div>

      {tarefa.descricao && (
        <p className="text-slate-500 text-xs line-clamp-2">{tarefa.descricao}</p>
      )}

      <div className="flex items-center justify-between gap-2 text-[10px] flex-wrap">
        {tarefa.dueDate && (
          <span className={`inline-flex items-center gap-1 ${atrasada ? 'text-rose-400' : 'text-slate-500'}`}>
            <CalendarDays size={10} />
            {fmtDMY(tarefa.dueDate)}
            {atrasada && <span className="font-bold">· atrasada</span>}
          </span>
        )}
        {tarefa.responsavel && (
          <span className="inline-flex items-center gap-1 text-slate-500">
            <UserIcon size={10} /> {tarefa.responsavel}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TaskBoard() {
  const [tab, setTab]         = useState('board'); // 'board' | 'calendar'
  const [tarefas, setTarefas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [modal, setModal]     = useState(null); // null | {} | tarefa
  const [erro, setErro]       = useState('');
  const [dragOver, setDragOver] = useState(null); // coluna sendo arrastada sobre
  const [mesRef, setMesRef]   = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const r = await apiFetch('/api/tarefas');
      setTarefas(r.data || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar(payload) {
    setSaving(true);
    try {
      if (modal?.id) {
        await apiFetch(`/api/tarefas/${modal.id}`, { method: 'PATCH', body: payload });
      } else {
        await apiFetch('/api/tarefas', { method: 'POST', body: payload });
      }
      setModal(null);
      await carregar();
    } finally {
      setSaving(false);
    }
  }

  async function excluir(id) {
    setSaving(true);
    try {
      await apiFetch(`/api/tarefas/${id}`, { method: 'DELETE' });
      setModal(null);
      await carregar();
    } finally {
      setSaving(false);
    }
  }

  // drag-drop
  function onDragStart(e, id) {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  }

  async function onDrop(e, novoStatus) {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const tarefa = tarefas.find(t => t.id === id);
    if (!tarefa || tarefa.status === novoStatus) return;
    setTarefas(prev => prev.map(t => t.id === id ? { ...t, status: novoStatus } : t));
    try {
      await apiFetch(`/api/tarefas/${id}`, { method: 'PATCH', body: { status: novoStatus } });
    } catch (err) {
      setErro(err.message);
      carregar();
    }
  }

  const porColuna = useMemo(() => {
    const map = { novo: [], ativo: [], revisao: [], concluido: [] };
    tarefas.forEach(t => { if (map[t.status]) map[t.status].push(t); });
    return map;
  }, [tarefas]);

  const totalAtrasadas = tarefas.filter(isAtrasada).length;

  return (
    <div className="h-full overflow-y-auto scrollbar-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/15 flex items-center justify-center">
              <KanbanSquare size={16} className="text-purple-400" />
            </div>
            <div>
              <h1 className="text-slate-100 font-bold text-base leading-tight">Tarefas</h1>
              <p className="text-slate-500 text-xs">
                {tarefas.length} total{totalAtrasadas > 0 && <span className="text-rose-400"> · {totalAtrasadas} atrasada{totalAtrasadas > 1 ? 's' : ''}</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setModal({})}
              className="flex items-center gap-1.5 text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              <Plus size={13} /> Nova tarefa
            </button>
            <button
              onClick={carregar}
              disabled={loading}
              className="p-2 rounded-xl border border-slate-800/60 text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 transition-all disabled:opacity-40"
              title="Atualizar"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {erro && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 flex items-center gap-2 text-rose-400 text-sm">
            <AlertCircle size={14} className="shrink-0" /> {erro}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900/60 border border-white/[0.06] rounded-xl p-1 w-fit">
          {[
            { id: 'board',    label: 'Board',      Icon: LayoutGrid },
            { id: 'calendar', label: 'Calendário', Icon: Calendar },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === id ? 'bg-white/[0.07] text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {/* ══ BOARD ══ */}
        {tab === 'board' && (
          loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {COLUNAS.map(c => (
                <div key={c.id} className="rounded-xl bg-slate-800/40 border border-white/[0.05] h-64 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {COLUNAS.map(col => {
                const lista = porColuna[col.id] || [];
                const isDragOver = dragOver === col.id;
                return (
                  <div
                    key={col.id}
                    onDragOver={e => { e.preventDefault(); setDragOver(col.id); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={e => onDrop(e, col.id)}
                    className={`rounded-xl border transition-all flex flex-col min-h-[200px] ${
                      isDragOver ? `${col.borda} bg-white/[0.03]` : 'border-white/[0.06] bg-slate-900/30'
                    }`}
                  >
                    <div className={`flex items-center justify-between px-3 py-2 border-b border-white/[0.05]`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-4 rounded-full ${col.cor}`} />
                        <p className={`text-xs font-bold uppercase tracking-wider ${col.texto}`}>{col.label}</p>
                        <span className="text-[10px] text-slate-500 tabular-nums">{lista.length}</span>
                      </div>
                      <button
                        onClick={() => setModal({ status: col.id })}
                        className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.05] transition-colors"
                        title="Nova nesta coluna"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <div className="p-2 space-y-2 flex-1">
                      {lista.length === 0 && (
                        <p className="text-[11px] text-slate-600 italic text-center py-4">Nenhuma tarefa</p>
                      )}
                      {lista.map(t => (
                        <TarefaCard
                          key={t.id}
                          tarefa={t}
                          onClick={setModal}
                          onDragStart={onDragStart}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ══ CALENDÁRIO ══ */}
        {tab === 'calendar' && (
          <CalendarioTarefas
            mes={mesRef}
            setMes={setMesRef}
            tarefas={tarefas}
            onClick={setModal}
            loading={loading}
          />
        )}
      </div>

      {modal !== null && (
        <ModalTarefa
          tarefa={modal?.id ? modal : (modal?.status ? { status: modal.status } : null)}
          onClose={() => setModal(null)}
          onSalvar={salvar}
          onExcluir={excluir}
          loading={saving}
        />
      )}
    </div>
  );
}

// ─── Calendário ──────────────────────────────────────────────────────────────

function CalendarioTarefas({ mes, setMes, tarefas, onClick, loading }) {
  const [ano, mesN] = mes.split('-').map(Number);
  const primeiroDia = new Date(ano, mesN - 1, 1);
  const ultimoDia   = new Date(ano, mesN, 0);
  const diasNoMes   = ultimoDia.getDate();
  const weekdayInicial = primeiroDia.getDay();

  function navMes(dir) {
    const d = new Date(ano, mesN - 1 + dir, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const mesLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(primeiroDia);

  // indexa tarefas por data YYYY-MM-DD
  const porDia = useMemo(() => {
    const map = {};
    tarefas.forEach(t => {
      if (!t.dueDate) return;
      const d = toDateOnly(t.dueDate);
      if (!map[d]) map[d] = [];
      map[d].push(t);
    });
    return map;
  }, [tarefas]);

  const semDue = tarefas.filter(t => !t.dueDate && t.status !== 'concluido');

  const celulas = [];
  for (let i = 0; i < weekdayInicial; i++) celulas.push(null);
  for (let d = 1; d <= diasNoMes; d++) {
    celulas.push(`${mes}-${String(d).padStart(2, '0')}`);
  }

  const hoje = toDateOnly(new Date().toISOString());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => navMes(-1)} className="p-2 rounded-lg border border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors">
          <ChevronLeft size={15} />
        </button>
        <p className="text-slate-300 text-sm font-semibold capitalize">{mesLabel}</p>
        <button onClick={() => navMes(1)} className="p-2 rounded-lg border border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors">
          <ChevronRight size={15} />
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl bg-slate-800/40 border border-white/[0.05] h-96 animate-pulse" />
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-slate-900/30 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-white/[0.05] bg-slate-900/60">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
              <div key={d} className="text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {celulas.map((dia, i) => {
              if (!dia) return <div key={i} className="min-h-[90px] border-r border-b border-white/[0.04] bg-slate-950/40" />;
              const itens = porDia[dia] || [];
              const ehHoje = dia === hoje;
              return (
                <div
                  key={i}
                  className={`min-h-[90px] border-r border-b border-white/[0.04] p-1.5 space-y-1 ${ehHoje ? 'bg-emerald-500/5' : ''}`}
                >
                  <div className={`text-[11px] font-bold ${ehHoje ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {parseInt(dia.slice(-2), 10)}
                  </div>
                  {itens.slice(0, 3).map(t => {
                    const prio = PRIORIDADES[t.prioridade] || PRIORIDADES.media;
                    return (
                      <button
                        key={t.id}
                        onClick={() => onClick(t)}
                        className={`w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate border ${prio.classe} hover:opacity-80 transition-opacity`}
                        title={t.titulo}
                      >
                        {t.titulo}
                      </button>
                    );
                  })}
                  {itens.length > 3 && (
                    <p className="text-[10px] text-slate-500">+{itens.length - 3}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {semDue.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-slate-900/30 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Flag size={12} className="text-slate-500" />
            <p className="text-xs text-slate-400 font-semibold">Sem prazo definido ({semDue.length})</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {semDue.map(t => (
              <button
                key={t.id}
                onClick={() => onClick(t)}
                className="text-left rounded-lg border border-white/[0.05] bg-slate-800/40 px-2 py-1.5 text-xs text-slate-300 hover:border-white/10 hover:bg-slate-800/60 transition-colors truncate"
              >
                {t.titulo}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
