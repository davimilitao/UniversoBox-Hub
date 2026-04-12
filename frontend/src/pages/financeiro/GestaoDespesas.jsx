/**
 * @file GestaoDespesas.jsx
 * @module financeiro
 * @description Gestão de Despesas — fonte Firestore (fin_despesas).
 *              Duas abas: Lançamentos (tabela + filtros + form) | Contas a Pagar (AP view).
 *              Status efetivo: pago / pendente / vencido (calculado no frontend).
 * @version 2.0.0
 * @date 2026-04-11
 * @changelog
 *   2.0.0 — 2026-04-11 — Migrado para Firestore; tabs Lançamentos/Contas a Pagar; vencido.
 *   1.0.0 — 2026-04-01 — Criação inicial com Google Sheets.
 */

import { useState, useMemo, useCallback } from 'react';
import { TrendingUp, AlertCircle } from 'lucide-react';
import {
  useFinDespesas, computarStatusEfetivo, extrairMesesFin, labelMesAnoTs,
} from '../../hooks/useFinDespesas';
import { useMeiosPagamento } from '../../hooks/useMeiosPagamento';
import { apiFetch } from '../../utils/getAuthToken';
import { auth } from '../../firebase';

import { FiltrosBar }        from './components/FiltrosBar';
import { ResumoCards }       from './components/ResumoCards';
import { GraficoBarras }     from './components/GraficoBarras';
import { GraficoPizza }      from './components/GraficoPizza';
import { FormLancarDespesa } from './components/FormLancarDespesa';
import { TabelaDespesas }    from './components/TabelaDespesas';
import { ContasDespesas }    from './components/ContasDespesas';

// ─── helpers ──────────────────────────────────────────────────────────────────

function Skeleton({ h = 'h-32' }) {
  return <div className={`rounded-xl bg-slate-800 border border-white/5 animate-pulse ${h}`} />;
}

function Toast({ msg, tipo }) {
  if (!msg) return null;
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border
      ${tipo === 'ok'
        ? 'bg-emerald-900/90 border-emerald-600 text-emerald-300'
        : 'bg-red-900/90 border-red-600 text-red-300'
      }`}>
      {msg}
    </div>
  );
}

function checkAdmin() {
  try {
    const stored = localStorage.getItem('expedicao_user');
    if (stored) { const r = JSON.parse(stored).role; if (r) return r === 'admin'; }
  } catch {}
  return false;
}

function extrairCategorias(despesas) {
  const set = new Set(despesas.map(d => d.categoria).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function extrairTipos(despesas) {
  return Array.from(new Set(despesas.map(d => d.tipo).filter(Boolean)));
}

function labelMesAtual() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ─── TabBtn ───────────────────────────────────────────────────────────────────

function TabBtn({ id, label, badge, ativo, onClick }) {
  const isAtivo = ativo === id;
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
        isAtivo
          ? 'border-emerald-500 text-emerald-400'
          : 'border-transparent text-slate-500 hover:text-slate-300'
      }`}
    >
      {label}
      {badge > 0 && (
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
          isAtivo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── página principal ──────────────────────────────────────────────────────────

export function GestaoDespesas() {
  const { despesas, loading, error } = useFinDespesas();
  const { meios: meiosPagamento }    = useMeiosPagamento();

  // ── Abas
  const [aba, setAba] = useState('lancamentos');

  // ── Filtros
  const [mesAtivo,       setMesAtivo]       = useState('');
  const [tipoAtivo,      setTipoAtivo]      = useState('all');
  const [categoriaAtiva, setCategoriaAtiva] = useState('all');
  const [statusAtivo,    setStatusAtivo]    = useState('all');

  // ── UI
  const [salvando, setSalvando] = useState(false);
  const [toast,    setToast]    = useState({ msg: '', tipo: 'ok' });
  const isAdmin = checkAdmin();

  // ── Despesas com statusEfetivo calculado
  const despesasComStatus = useMemo(
    () => despesas.map(d => ({ ...d, statusEfetivo: computarStatusEfetivo(d) })),
    [despesas],
  );

  // ── Listas derivadas para filtros
  const meses      = useMemo(() => extrairMesesFin(despesasComStatus), [despesasComStatus]);
  const categorias = useMemo(() => extrairCategorias(despesasComStatus), [despesasComStatus]);
  const tipos      = useMemo(() => extrairTipos(despesasComStatus), [despesasComStatus]);

  // Define mês ativo inicial (mês mais recente)
  const mesEfetivo = mesAtivo || meses[0]?.label || '';

  // ── Despesas do mês ativo (para filtros da aba Lançamentos)
  const despesasMes = useMemo(() => {
    if (!mesEfetivo) return despesasComStatus;
    return despesasComStatus.filter(d => labelMesAnoTs(d.timestamp) === mesEfetivo);
  }, [despesasComStatus, mesEfetivo]);

  // ── Despesas do mês ATUAL (para aba Contas a Pagar)
  const mesAtualLabel = useMemo(() => labelMesAtual(), []);
  const despesasMesAtual = useMemo(
    () => despesasComStatus.filter(d => labelMesAnoTs(d.timestamp) === mesAtualLabel),
    [despesasComStatus, mesAtualLabel],
  );

  // ── Aplicar filtros de categoria + tipo + status sobre o mês selecionado
  const despesasFiltradas = useMemo(() => {
    return despesasMes.filter(d => {
      if (categoriaAtiva !== 'all' && d.categoria !== categoriaAtiva) return false;
      if (tipoAtivo !== 'all' && d.tipo !== tipoAtivo) return false;
      if (statusAtivo !== 'all' && d.statusEfetivo !== statusAtivo) return false;
      return true;
    });
  }, [despesasMes, categoriaAtiva, tipoAtivo, statusAtivo]);

  // ── Badge da aba Contas a Pagar (vencidas + pendentes, exceto investimento)
  const nContasPagar = useMemo(
    () => despesasMesAtual.filter(d => d.statusEfetivo !== 'pago' && d.tipo !== 'investimento').length,
    [despesasMesAtual],
  );

  // ── Toast helper
  function showToast(msg, tipo = 'ok') {
    setToast({ msg, tipo });
    setTimeout(() => setToast({ msg: '', tipo: 'ok' }), 3000);
  }

  // ── Salvar nova despesa
  const handleSalvar = useCallback(async (payload) => {
    setSalvando(true);
    try {
      const res = await apiFetch('/api/fin-despesas', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('Despesa lançada!', 'ok');
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'erro');
    } finally {
      setSalvando(false);
    }
  }, []);

  // ── Toggle status (pago ↔ pendente)
  const handleToggleStatus = useCallback(async (id, novaSituacao) => {
    try {
      const res = await apiFetch(`/api/fin-despesas/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ situacao: novaSituacao }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'erro');
    }
  }, []);

  // ── Deletar (admin only) — usa DELETE do Firestore via endpoint
  const handleDelete = useCallback(async (id) => {
    try {
      const res = await apiFetch(`/api/fin-despesas/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      showToast('Despesa removida.', 'ok');
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'erro');
    }
  }, []);

  // ── Render
  if (loading) {
    return (
      <div className="p-6 flex flex-col gap-4">
        <Skeleton h="h-10" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} h="h-24" />)}
        </div>
        <Skeleton h="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 flex items-center gap-3 text-red-400">
        <AlertCircle size={20} />
        <p className="text-sm">Erro ao carregar despesas: {error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      <Toast msg={toast.msg} tipo={toast.tipo} />

      {/* ── Header com tabs ──────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-0 flex flex-col gap-1">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={18} className="text-emerald-400" />
          <h1 className="text-base font-bold text-slate-200">Gestão de Despesas</h1>
        </div>
        <div className="flex border-b border-white/[0.08]">
          <TabBtn id="lancamentos" label="Lançamentos"    ativo={aba} onClick={setAba} />
          <TabBtn id="contas"      label="Contas a Pagar" badge={nContasPagar} ativo={aba} onClick={setAba} />
        </div>
      </div>

      {/* ── Aba Lançamentos ──────────────────────────────────────────────────── */}
      {aba === 'lancamentos' && (
        <div className="p-6 flex flex-col gap-5">

          {/* Filtros */}
          <FiltrosBar
            meses={meses}         mesAtivo={mesEfetivo}    onMes={setMesAtivo}
            tipos={tipos}         tipoAtivo={tipoAtivo}    onTipo={setTipoAtivo}
            categorias={categorias} categoriaAtiva={categoriaAtiva} onCategoria={setCategoriaAtiva}
            statusAtivo={statusAtivo} onStatus={setStatusAtivo}
          />

          {/* KPI cards */}
          <ResumoCards despesasMes={despesasMes} />

          {/* Gráficos */}
          {despesasComStatus.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <GraficoBarras despesas={despesasComStatus} />
              <GraficoPizza  despesasMes={despesasMes} />
            </div>
          )}

          {/* Form + Tabela */}
          <div className="flex flex-col xl:flex-row gap-5 items-start">
            <div className="w-full xl:w-80 shrink-0">
              <FormLancarDespesa
                categorias={categorias}
                meiosPagamento={meiosPagamento}
                onSalvar={handleSalvar}
                salvando={salvando}
              />
            </div>
            <div className="flex-1 min-w-0">
              <TabelaDespesas
                despesas={despesasFiltradas}
                isAdmin={isAdmin}
                onToggleStatus={handleToggleStatus}
                onDelete={handleDelete}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Aba Contas a Pagar ───────────────────────────────────────────────── */}
      {aba === 'contas' && (
        <div className="p-6">
          <ContasDespesas
            despesasMes={despesasMesAtual}
            onToggleStatus={handleToggleStatus}
          />
        </div>
      )}
    </div>
  );
}
