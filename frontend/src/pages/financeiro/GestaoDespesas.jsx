/**
 * @file GestaoDespesas.jsx
 * @module financeiro
 * @description Gestão de Despesas — unifica lançamento, dashboard, gráficos e tabela.
 *              Substitui a tela legada financas.html com React + dados reais da planilha.
 *              Categorias dinâmicas extraídas da própria planilha Google Sheets.
 * @version 1.0.0
 * @date 2026-04-01
 * @author UniversoLab
 *
 * @changelog
 *   2.0.0 — 2026-04-01 — Range de datas, Lucide icons, input date nativo.
 *   1.0.0 — 2026-04-01 — Criação inicial unificando financas.html + PainelFinanceiro.
 */

import { useState, useMemo, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { TrendingUp } from 'lucide-react';
import { auth } from '../../firebase';
import { parseDataBR, labelMesAno } from '../../hooks/useDespesas';

import { FiltrosBar }        from './components/FiltrosBar';
import { ResumoCards }       from './components/ResumoCards';
import { GraficoBarras }     from './components/GraficoBarras';
import { GraficoPizza }      from './components/GraficoPizza';
import { FormLancarDespesa } from './components/FormLancarDespesa';
import { TabelaDespesas }    from './components/TabelaDespesas';

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

/** Extrai meses únicos ordenados (mais recente primeiro) das despesas */
function extrairMeses(despesas) {
  const vistos = new Set();
  const lista  = [];
  despesas.forEach(d => {
    const p = parseDataBR(d.data);
    if (!p) return;
    const label = labelMesAno(p);
    if (!vistos.has(label)) {
      vistos.add(label);
      lista.push({ label, ts: new Date(`${p.ano}-${String(p.mes).padStart(2,'0')}-01`).getTime() });
    }
  });
  return lista.sort((a, b) => b.ts - a.ts);
}

/** Extrai categorias únicas da planilha, ordenadas alfabeticamente */
function extrairCategorias(despesas) {
  const set = new Set(despesas.map(d => d.nome).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Verifica se o user tem role admin via custom claim ou localStorage legado */
function checkAdmin(user) {
  try {
    const stored = localStorage.getItem('expedicao_user');
    if (stored) {
      const role = JSON.parse(stored).role;
      if (role) return role === 'admin';
    }
  } catch {}
  // Fallback: se tem user autenticado e não tem claim explícita, assume não-admin
  return false;
}

async function getToken() {
  const user = auth?.currentUser;
  return user ? user.getIdToken(false) : null;
}

// ─── página principal ──────────────────────────────────────────────────────────

export function GestaoDespesas() {
  const { despesas, loading, error, setDespesas } = useDespesasComRefresh();

  // Filtros
  const [mesAtivo,        setMesAtivo]        = useState('');
  const [categoriaAtiva,  setCategoriaAtiva]  = useState('all');
  const [statusAtivo,     setStatusAtivo]     = useState('all');
  const [rangeInicio,     setRangeInicio]     = useState(null); // timestamp
  const [rangeFim,        setRangeFim]        = useState(null); // timestamp
  const modoRange = rangeInicio !== null || rangeFim !== null;

  // UI
  const [salvando,  setSalvando]  = useState(false);
  const [toast,     setToast]     = useState({ msg: '', tipo: 'ok' });

  function showToast(msg, tipo = 'ok') {
    setToast({ msg, tipo });
    setTimeout(() => setToast({ msg: '', tipo: 'ok' }), 3500);
  }

  // ── Dados derivados ───────────────────────────────────────────────────────
  const meses      = useMemo(() => extrairMeses(despesas),    [despesas]);
  const categorias = useMemo(() => extrairCategorias(despesas), [despesas]);
  const mesEfetivo = mesAtivo || meses[0]?.label || '';

  const despesasMes = useMemo(() => {
    if (modoRange) {
      // Modo período: filtra por timestamp
      return despesas.filter(d => {
        if (!d.timestamp) return false;
        const passInicio = rangeInicio === null || d.timestamp >= rangeInicio;
        const passFim    = rangeFim    === null || d.timestamp <= rangeFim + 86_399_999; // até fim do dia
        return passInicio && passFim;
      });
    }
    if (!mesEfetivo) return [];
    return despesas.filter(d => {
      const p = parseDataBR(d.data);
      return p && labelMesAno(p) === mesEfetivo;
    });
  }, [despesas, mesEfetivo, modoRange, rangeInicio, rangeFim]);

  const despesasFiltradas = useMemo(() => {
    return despesasMes.filter(d => {
      const passCat = categoriaAtiva === 'all' || d.nome === categoriaAtiva;
      const passSt  = statusAtivo === 'all'
        || (statusAtivo === 'pago'     && d.situacao?.toLowerCase().includes('pago'))
        || (statusAtivo === 'pendente' && d.situacao?.toLowerCase().includes('pendente'));
      return passCat && passSt;
    });
  }, [despesasMes, categoriaAtiva, statusAtivo]);

  // ── Resumo do mês ──────────────────────────────────────────────────────────
  const resumoMes = useMemo(() => {
    const pago     = despesasFiltradas.filter(d => d.situacao?.toLowerCase().includes('pago')).reduce((s,d) => s+d.valor, 0);
    const pendente = despesasFiltradas.filter(d => d.situacao?.toLowerCase().includes('pendente')).reduce((s,d) => s+d.valor, 0);
    return { pago, pendente, total: pago + pendente, qtd: despesasFiltradas.length };
  }, [despesasFiltradas]);

  // ── Adicionar despesa ──────────────────────────────────────────────────────
  const handleSalvar = useCallback(async (formData) => {
    setSalvando(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/despesas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!data.ok) throw new Error('Falha ao salvar na planilha');

      showToast('Despesa lançada com sucesso! ✅');
      // Adiciona otimisticamente sem recarregar tudo
      // O backend retorna a nova linha; aqui estimamos o timestamp
      const partes = (formData.data || '').split('/');
      const ts = partes.length === 3
        ? new Date(`${partes[2]}-${partes[1]}-${partes[0]}T12:00:00`).getTime()
        : Date.now();
      const nova = {
        id:        Date.now(), // temporário — será substituído no próximo reload
        data:      formData.data,
        nome:      formData.nome,
        descricao: formData.descricao || '',
        valor:     parseFloat(formData.valor) || 0,
        situacao:  formData.situacao,
        timestamp: ts,
      };
      setDespesas(prev => [nova, ...prev]);
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'err');
    } finally {
      setSalvando(false);
    }
  }, [setDespesas]);

  // ── Deletar despesa ────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (rowIndex) => {
    try {
      const token = await getToken();
      if (!token) { showToast('Faça login para deletar.', 'err'); return; }
      const res = await fetch(`/api/despesas/${rowIndex}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Falha ao deletar');
      setDespesas(prev => prev.filter(d => d.id !== rowIndex));
      showToast('Despesa removida.', 'ok');
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'err');
    }
  }, [setDespesas]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 max-w-7xl mx-auto">
      <Toast msg={toast.msg} tipo={toast.tipo} />

      {/* Cabeçalho */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">💰 Gestão de Despesas</h1>
        <p className="text-sm text-slate-500 mt-0.5">Lançamento e análise — Google Sheets</p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-900/20 border border-red-700/40 p-4 text-red-400 text-sm mb-6">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col gap-6">
          <Skeleton h="h-12" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_,i) => <Skeleton key={i} h="h-24" />)}
          </div>
          <Skeleton h="h-72" />
          <Skeleton h="h-64" />
        </div>
      )}

      {/* Conteúdo */}
      {!loading && !error && (
        <div className="flex flex-col gap-6">

          {/* Filtros */}
          {meses.length > 0 && (
            <FiltrosBar
              meses={meses}
              mesAtivo={mesEfetivo}
              onMes={m => { setMesAtivo(m); setCategoriaAtiva('all'); setStatusAtivo('all'); }}
              categorias={categorias}
              categoriaAtiva={categoriaAtiva}
              onCategoria={setCategoriaAtiva}
              statusAtivo={statusAtivo}
              onStatus={setStatusAtivo}
              onRangeChange={(inicio, fim) => { setRangeInicio(inicio); setRangeFim(fim); }}
            />
          )}

          {/* Cards */}
          <ResumoCards despesasMes={despesasFiltradas} />

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GraficoBarras despesas={despesas} />
            <GraficoPizza  despesasMes={despesasFiltradas} />
          </div>

          {/* Form + Tabela */}
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
            <FormLancarDespesa
              categorias={categorias}
              onSalvar={handleSalvar}
              salvando={salvando}
            />
            <TabelaDespesas
              despesas={despesasFiltradas}
              isAdmin={true}
              onDelete={handleDelete}
            />
          </div>

          {/* Empty state */}
          {despesas.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <span className="text-4xl">📊</span>
              <p className="text-slate-400">Nenhuma despesa na planilha.</p>
              <p className="text-slate-600 text-sm">Lance a primeira despesa usando o formulário.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Hook estendido com setter ────────────────────────────────────────────────
// Wraps useDespesas expondo setDespesas para updates otimistas
function useDespesasComRefresh() {
  const [despesas, setDespesas] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useState(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (cancelled) return;
      if (!user) { setError('Sessão expirada. Faça login novamente.'); setLoading(false); return; }
      try {
        setLoading(true); setError(null);
        const token = await user.getIdToken(false);
        const res   = await fetch('/api/despesas', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { const b = await res.json().catch(()=>{}); throw new Error(b?.error || `HTTP ${res.status}`); }
        const data  = await res.json();
        if (!cancelled) setDespesas(data.items || []);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
      unsub();
    });
    return () => { cancelled = true; unsub(); };
  });

  return { despesas, setDespesas, loading, error };
}
