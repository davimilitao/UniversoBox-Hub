/**
 * @file PainelFinanceiro.jsx
 * @module financeiro
 * @description Painel de BI financeiro: resumo de despesas do mês, gráficos e tabela
 *              de pendentes. Fonte de dados: GET /api/despesas (Google Sheets).
 * @version 1.0.0
 * @date 2026-04-01
 * @author UniversoLab
 *
 * @changelog
 *   1.0.0 — 2026-04-01 — Criação inicial com cards, barras, pizza e tabela de pendentes.
 */

import { useState, useMemo } from 'react';
import { useDespesas, parseDataBR, labelMesAno } from '../../hooks/useDespesas';
import { ResumoCards }     from './components/ResumoCards';
import { GraficoBarras }   from './components/GraficoBarras';
import { GraficoPizza }    from './components/GraficoPizza';
import { TabelaPendentes } from './components/TabelaPendentes';

// ─── Skeleton genérico para loading ───────────────────────────────────────────
function Skeleton({ height = 'h-40' }) {
  return <div className={`rounded-xl bg-slate-800 border border-white/5 animate-pulse ${height}`} />;
}

// ─── Ordena e deduplica os meses presentes nos dados ──────────────────────────
function extrairMeses(despesas) {
  const vistos = new Set();
  const meses = [];
  despesas.forEach(d => {
    const p = parseDataBR(d.data);
    if (!p) return;
    const label = labelMesAno(p);
    if (!vistos.has(label)) {
      vistos.add(label);
      meses.push({ label, ts: new Date(`${p.ano}-${String(p.mes).padStart(2, '0')}-01`).getTime() });
    }
  });
  return meses.sort((a, b) => b.ts - a.ts); // mais recente primeiro
}

export function PainelFinanceiro() {
  const { despesas, loading, error } = useDespesas();

  const mesesDisponiveis = useMemo(() => extrairMeses(despesas), [despesas]);

  // Inicializa com o mês mais recente assim que os dados chegam
  const [mesSelecionado, setMesSelecionado] = useState('');
  const mesAtivo = mesSelecionado || mesesDisponiveis[0]?.label || '';

  // Filtra despesas do mês ativo
  const despesasMes = useMemo(() => {
    if (!mesAtivo) return [];
    return despesas.filter(d => {
      const p = parseDataBR(d.data);
      return p && labelMesAno(p) === mesAtivo;
    });
  }, [despesas, mesAtivo]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 max-w-7xl mx-auto">

      {/* ── Cabeçalho ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Painel Financeiro</h1>
          <p className="text-sm text-slate-500 mt-0.5">Despesas operacionais — Google Sheets</p>
        </div>

        {/* Seletor de mês */}
        {!loading && mesesDisponiveis.length > 0 && (
          <select
            value={mesAtivo}
            onChange={e => setMesSelecionado(e.target.value)}
            className="rounded-lg bg-slate-800 border border-white/10 text-slate-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            {mesesDisponiveis.map(m => (
              <option key={m.label} value={m.label}>{m.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Estado de erro ──────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl bg-red-900/20 border border-red-700/40 p-4 text-red-400 text-sm mb-6">
          Erro ao carregar despesas: {error}
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} height="h-24" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton height="h-72" />
            <Skeleton height="h-72" />
          </div>
          <Skeleton height="h-48" />
        </div>
      )}

      {/* ── Conteúdo ────────────────────────────────────────────────────────── */}
      {!loading && !error && (
        <>
          {/* Empty state global */}
          {despesas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
              <span className="text-4xl">📊</span>
              <p className="text-slate-400">Nenhuma despesa encontrada na planilha.</p>
              <p className="text-slate-600 text-sm">Verifique se SPREADSHEET_ID está configurado no Railway.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">

              {/* 1. Cards de resumo */}
              <ResumoCards despesasMes={despesasMes} />

              {/* 2. Gráficos lado a lado */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GraficoBarras despesas={despesas} />
                <GraficoPizza  despesasMes={despesasMes} />
              </div>

              {/* 3. Tabela de pendentes */}
              <TabelaPendentes despesasMes={despesasMes} />

              {/* Empty state do mês */}
              {despesasMes.length === 0 && mesAtivo && (
                <p className="text-center text-slate-600 text-sm -mt-2">
                  Nenhum lançamento em {mesAtivo}.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
