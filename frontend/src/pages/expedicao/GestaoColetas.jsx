/**
 * @file GestaoColetas.jsx
 * @description Gestão de Coletas — agenda semanal de veículos por modalidade (Flex/Agência)
 *   com contagem real de pedidos do dia integrada ao Firestore/orders.
 * @version 1.0.0
 * @date 2026-04-21
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../../firebase';
import {
  Truck, Calendar, Plus, Trash2, Edit2, X, ChevronLeft, ChevronRight,
  Package, Zap, Building2, RefreshCw, CheckCircle2, AlertCircle,
  DollarSign, Car, ClipboardList,
} from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

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

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function getMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toISO(date) {
  return date.toISOString().split('T')[0];
}

const DIAS_LABEL = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DIAS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function formatDia(dateStr) {
  const [, , d] = dateStr.split('-');
  return d;
}

function mesLabel(monday) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(monday + 'T12:00:00Z'));
}

// ─── sub-componentes ──────────────────────────────────────────────────────────

function Badge({ tipo }) {
  if (tipo === 'flex') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/20">
      <Zap size={9} /> Flex
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/20">
      <Building2 size={9} /> Agência
    </span>
  );
}

function ModalBase({ title, onClose, children }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-slate-900 shadow-2xl p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-slate-100 font-semibold text-sm">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.05] transition-colors">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, type = 'text', required, placeholder, step }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-slate-400 font-medium">{label}{required && <span className="text-rose-400 ml-0.5">*</span>}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        step={step}
        className="w-full bg-slate-800 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
      />
    </div>
  );
}

// ─── Modal Agendar ────────────────────────────────────────────────────────────

function ModalAgendar({ data, veiculos, agendamentos, onClose, onSalvar, loading }) {
  const [modalidade, setModalidade] = useState('flex');
  const [veiculoPlaca, setVeiculoPlaca] = useState('');
  const [observacoes, setObs] = useState('');
  const [err, setErr] = useState('');

  const veiculosAtivos = veiculos.filter(v => v.ativo);
  const veiculo = veiculosAtivos.find(v => v.placa === veiculoPlaca);

  async function salvar() {
    if (!veiculoPlaca) return setErr('Selecione um veículo.');
    setErr('');
    try {
      await onSalvar({ data, veiculo_placa: veiculoPlaca, modalidade, observacoes });
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <ModalBase title={`Agendar coleta — ${data}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-slate-400 font-medium">Modalidade<span className="text-rose-400 ml-0.5">*</span></label>
          <div className="grid grid-cols-2 gap-2">
            {['flex', 'agencia'].map(m => (
              <button
                key={m}
                onClick={() => setModalidade(m)}
                className={`py-2 rounded-lg border text-xs font-semibold transition-colors ${modalidade === m
                  ? m === 'flex' ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' : 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                  : 'bg-slate-800 border-white/[0.06] text-slate-400 hover:border-white/10'}`}
              >
                {m === 'flex' ? '⚡ Flex' : '🏢 Agência'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-400 font-medium">Veículo<span className="text-rose-400 ml-0.5">*</span></label>
          <select
            value={veiculoPlaca}
            onChange={e => setVeiculoPlaca(e.target.value)}
            className="w-full bg-slate-800 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          >
            <option value="">Selecione...</option>
            {veiculosAtivos.map(v => (
              <option key={v.id} value={v.placa}>
                {v.placa} — {v.modelo} {v.marca}{v.cor ? ` (${v.cor})` : ''}
              </option>
            ))}
          </select>
        </div>

        {veiculo && (
          <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 px-3 py-2 flex items-center gap-2">
            <DollarSign size={13} className="text-emerald-400 shrink-0" />
            <span className="text-xs text-emerald-300">Frete: <strong>{BRL.format(veiculo.valor_frete)}</strong></span>
          </div>
        )}

        <InputField
          label="Observações"
          value={observacoes}
          onChange={setObs}
          placeholder="Opcional..."
        />

        {err && <p className="text-xs text-rose-400">{err}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-white/[0.08] text-slate-400 text-sm hover:bg-white/[0.04] transition-colors">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={loading}
            className="flex-1 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Salvando…' : 'Agendar'}
          </button>
        </div>
      </div>
    </ModalBase>
  );
}

// ─── Modal Veículo ─────────────────────────────────────────────────────────────

function ModalVeiculo({ veiculo, onClose, onSalvar, loading }) {
  const [placa, setPlaca]   = useState(veiculo?.placa   || '');
  const [modelo, setModelo] = useState(veiculo?.modelo  || '');
  const [marca, setMarca]   = useState(veiculo?.marca   || '');
  const [cor, setCor]       = useState(veiculo?.cor     || '');
  const [frete, setFrete]   = useState(String(veiculo?.valor_frete || ''));
  const [err, setErr]       = useState('');

  async function salvar() {
    if (!placa || !modelo || !marca) return setErr('Placa, modelo e marca são obrigatórios.');
    setErr('');
    try {
      await onSalvar({ placa, modelo, marca, cor, valor_frete: parseFloat(frete) || 0 });
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <ModalBase title={veiculo ? 'Editar Veículo' : 'Novo Veículo'} onClose={onClose}>
      <div className="space-y-3">
        <InputField label="Placa" value={placa} onChange={setPlaca} required placeholder="ABC-1234" />
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Modelo" value={modelo} onChange={setModelo} required placeholder="Sprinter" />
          <InputField label="Marca" value={marca} onChange={setMarca} required placeholder="Mercedes" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Cor" value={cor} onChange={setCor} placeholder="Branco" />
          <InputField label="Valor do Frete" value={frete} onChange={setFrete} type="number" step="0.01" placeholder="0,00" />
        </div>

        {err && <p className="text-xs text-rose-400">{err}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-white/[0.08] text-slate-400 text-sm hover:bg-white/[0.04] transition-colors">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={loading}
            className="flex-1 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Salvando…' : veiculo ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </div>
    </ModalBase>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function GestaoColetas() {
  const [tab, setTab]               = useState('calendario');
  const [veiculos, setVeiculos]     = useState([]);
  const [agendamentos, setAgend]    = useState([]);
  const [resumos, setResumos]       = useState({});   // { 'YYYY-MM-DD': { flex_count, agencia_count } }
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [semana, setSemana]         = useState(() => toISO(getMonday()));
  const [modalAgendar, setModalAg]  = useState(null); // dateStr
  const [modalVeiculo, setModalVei] = useState(null); // null | {} | veiculo
  const [erro, setErro]             = useState('');

  const diasSemana = Array.from({ length: 6 }, (_, i) => toISO(addDays(new Date(semana + 'T12:00:00Z'), i)));

  // ── carregar dados ────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const [vRes, aRes] = await Promise.all([
        apiFetch('/api/coletas/veiculos'),
        apiFetch(`/api/coletas/agenda?semana=${semana}`),
      ]);
      setVeiculos(vRes.data || []);
      setAgend(aRes.data || []);

      // buscar resumo de cada dia em paralelo
      const resumoEntries = await Promise.allSettled(
        diasSemana.map(d => apiFetch(`/api/coletas/resumo-dia?data=${d}`).then(r => [d, r.data]))
      );
      const map = {};
      resumoEntries.forEach(r => { if (r.status === 'fulfilled') { const [d, data] = r.value; map[d] = data; } });
      setResumos(map);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [semana]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── navegação de semana ───────────────────────────────────────────────────
  function navSemana(dir) {
    const d = new Date(semana + 'T12:00:00Z');
    d.setDate(d.getDate() + dir * 7);
    setSemana(toISO(d));
  }

  // ── agendar coleta ─────────────────────────────────────────────────────────
  async function handleAgendar(payload) {
    setSaving(true);
    try {
      await apiFetch('/api/coletas/agenda', { method: 'POST', body: payload });
      setModalAg(null);
      await carregar();
    } finally {
      setSaving(false);
    }
  }

  // ── remover agendamento ───────────────────────────────────────────────────
  async function removerAgend(id) {
    if (!window.confirm('Remover este agendamento?')) return;
    await apiFetch(`/api/coletas/agenda/${id}`, { method: 'DELETE' });
    setAgend(prev => prev.filter(a => a.id !== id));
  }

  // ── criar / editar veículo ─────────────────────────────────────────────────
  async function handleSalvarVeiculo(payload) {
    setSaving(true);
    try {
      if (modalVeiculo?.id) {
        await apiFetch(`/api/coletas/veiculos/${modalVeiculo.id}`, { method: 'PATCH', body: payload });
      } else {
        await apiFetch('/api/coletas/veiculos', { method: 'POST', body: payload });
      }
      setModalVei(null);
      await carregar();
    } finally {
      setSaving(false);
    }
  }

  // ── remover veículo ───────────────────────────────────────────────────────
  async function removerVeiculo(id) {
    if (!window.confirm('Remover este veículo? Esta ação não pode ser desfeita.')) return;
    await apiFetch(`/api/coletas/veiculos/${id}`, { method: 'DELETE' });
    setVeiculos(prev => prev.filter(v => v.id !== id));
  }

  // ── filtrar agendamentos do dia ───────────────────────────────────────────
  function agendDia(dateStr) {
    return agendamentos.filter(a => a.data === dateStr);
  }

  const isHoje = (d) => d === toISO(new Date());

  // ── resumo semanal ────────────────────────────────────────────────────────
  const totalFlex    = diasSemana.reduce((s, d) => s + (resumos[d]?.flex_count    || 0), 0);
  const totalAgencia = diasSemana.reduce((s, d) => s + (resumos[d]?.agencia_count || 0), 0);
  const totalColetas = agendamentos.length;

  return (
    <div className="h-full overflow-y-auto scrollbar-none">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-4">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <Truck size={16} className="text-emerald-400" />
            </div>
            <div>
              <h1 className="text-slate-100 font-bold text-base leading-tight">Gestão de Coletas</h1>
              <p className="text-slate-500 text-xs">Veículos e agenda semanal</p>
            </div>
          </div>
          <button
            onClick={carregar}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-800/60 text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 transition-all disabled:opacity-40"
            title="Atualizar"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* ── Erro ── */}
        {erro && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 flex items-center gap-2 text-rose-400 text-sm">
            <AlertCircle size={14} className="shrink-0" /> {erro}
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-slate-900/60 border border-white/[0.06] rounded-xl p-1 w-fit">
          {[
            { id: 'calendario', label: 'Calendário', Icon: Calendar },
            { id: 'veiculos',   label: 'Veículos',   Icon: Car },
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

        {/* ══ TAB CALENDÁRIO ══════════════════════════════════════════════════ */}
        {tab === 'calendario' && (
          <>
            {/* Navegação de semana */}
            <div className="flex items-center justify-between gap-3">
              <button onClick={() => navSemana(-1)} className="p-2 rounded-lg border border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors">
                <ChevronLeft size={15} />
              </button>
              <p className="text-slate-300 text-sm font-semibold capitalize">{mesLabel(semana)}</p>
              <button onClick={() => navSemana(1)} className="p-2 rounded-lg border border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors">
                <ChevronRight size={15} />
              </button>
            </div>

            {/* Grid de dias — 1 col mobile, 2 md, 3 lg, 6 xl */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                {diasSemana.map(d => (
                  <div key={d} className="rounded-xl bg-slate-800/40 border border-white/[0.05] h-36 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                {diasSemana.map((d, i) => {
                  const agends = agendDia(d);
                  const res    = resumos[d] || {};
                  const hoje   = isHoje(d);
                  return (
                    <div
                      key={d}
                      className={`rounded-xl border p-3 space-y-2.5 transition-all ${hoje ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/[0.06] bg-slate-900/40'}`}
                    >
                      {/* Cabeçalho dia */}
                      <div className="flex items-start justify-between">
                        <div>
                          <p className={`text-[10px] font-bold uppercase tracking-wider ${hoje ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {DIAS_SHORT[i]}
                          </p>
                          <p className={`text-xl font-black tabular-nums leading-none ${hoje ? 'text-emerald-300' : 'text-slate-300'}`}>
                            {formatDia(d)}
                          </p>
                        </div>
                        <button
                          onClick={() => setModalAg(d)}
                          className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                          title="Agendar coleta"
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      {/* Contagem de pedidos */}
                      <div className="flex gap-1.5 flex-wrap">
                        {res.flex_count > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-semibold">
                            <Zap size={9} /> {res.flex_count}
                          </span>
                        )}
                        {res.agencia_count > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-semibold">
                            <Building2 size={9} /> {res.agencia_count}
                          </span>
                        )}
                        {!res.flex_count && !res.agencia_count && (
                          <span className="text-[10px] text-slate-600">Sem pedidos</span>
                        )}
                      </div>

                      {/* Veículos agendados */}
                      <div className="space-y-1.5">
                        {agends.length === 0 && (
                          <p className="text-[10px] text-slate-700 italic">Nenhum veículo</p>
                        )}
                        {agends.map(a => (
                          <div key={a.id} className="flex items-center justify-between gap-1 group">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Badge tipo={a.modalidade} />
                              <span className="text-[10px] text-slate-400 truncate font-mono">{a.veiculo_placa}</span>
                            </div>
                            <button
                              onClick={() => removerAgend(a.id)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-600 hover:text-rose-400 transition-all shrink-0"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Resumo semanal */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Pedidos Flex',    value: totalFlex,    color: 'text-blue-400',    Icon: Zap },
                { label: 'Pedidos Agência', value: totalAgencia, color: 'text-orange-400',  Icon: Building2 },
                { label: 'Coletas na semana', value: totalColetas, color: 'text-emerald-400', Icon: Truck },
                { label: 'Veículos ativos', value: veiculos.filter(v => v.ativo).length, color: 'text-slate-300', Icon: Car },
              ].map(({ label, value, color, Icon }) => (
                <div key={label} className="rounded-xl border border-white/[0.06] bg-slate-900/40 p-3 flex items-center gap-3">
                  <Icon size={15} className={`${color} shrink-0`} />
                  <div>
                    <p className={`text-xl font-bold tabular-nums leading-none ${color}`}>{value}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Link para expedição */}
            <div className="flex items-center justify-end">
              <Link
                to="/expedicao/bling"
                className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 px-3 py-1.5 rounded-lg hover:bg-emerald-500/5 transition-colors"
              >
                <ClipboardList size={12} /> Ir para Expedição
              </Link>
            </div>
          </>
        )}

        {/* ══ TAB VEÍCULOS ════════════════════════════════════════════════════ */}
        {tab === 'veiculos' && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-slate-400 text-xs">{veiculos.length} veículo{veiculos.length !== 1 ? 's' : ''} cadastrado{veiculos.length !== 1 ? 's' : ''}</p>
              <button
                onClick={() => setModalVei({})}
                className="flex items-center gap-1.5 text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
              >
                <Plus size={13} /> Novo Veículo
              </button>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-slate-800/40 animate-pulse" />)}
              </div>
            ) : veiculos.length === 0 ? (
              <div className="text-center py-16 text-slate-600">
                <Truck size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum veículo cadastrado</p>
                <p className="text-xs mt-1">Clique em "Novo Veículo" para começar</p>
              </div>
            ) : (
              <div className="space-y-2">
                {veiculos.map(v => (
                  <div key={v.id} className={`rounded-xl border p-4 flex items-center gap-4 transition-all ${v.ativo ? 'border-white/[0.07] bg-slate-900/40' : 'border-white/[0.03] bg-slate-900/20 opacity-50'}`}>
                    <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
                      <Truck size={15} className="text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-slate-100 font-bold text-sm font-mono">{v.placa}</p>
                        {!v.ativo && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-500">inativo</span>}
                      </div>
                      <p className="text-slate-400 text-xs mt-0.5">{v.modelo} · {v.marca}{v.cor ? ` · ${v.cor}` : ''}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-emerald-400 font-semibold text-sm tabular-nums">{BRL.format(v.valor_frete)}</p>
                      <p className="text-slate-600 text-[10px]">frete</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setModalVei(v)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.05] transition-colors"
                        title="Editar"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => removerVeiculo(v.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Remover"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modais ── */}
      {modalAgendar && (
        <ModalAgendar
          data={modalAgendar}
          veiculos={veiculos}
          agendamentos={agendamentos}
          onClose={() => setModalAg(null)}
          onSalvar={handleAgendar}
          loading={saving}
        />
      )}

      {modalVeiculo !== null && (
        <ModalVeiculo
          veiculo={modalVeiculo?.id ? modalVeiculo : null}
          onClose={() => setModalVei(null)}
          onSalvar={handleSalvarVeiculo}
          loading={saving}
        />
      )}
    </div>
  );
}
