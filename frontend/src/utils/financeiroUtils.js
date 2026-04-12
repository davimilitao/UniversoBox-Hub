/**
 * @file financeiroUtils.js
 * @module utils
 * @description Utilitários compartilhados do módulo Financeiro.
 *              Centraliza formatação monetária, datas, urgência de vencimento e
 *              mapeamento de tipos de despesa — funções antes duplicadas em vários
 *              componentes de Contas.jsx e GestaoDespesas.jsx.
 * @version 1.0.0
 * @date 2026-04-12
 */

// ─── Formatação monetária ──────────────────────────────────────────────────────

export const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formata um número como BRL. Retorna R$ 0,00 para valores nulos/undefined. */
export function brl(v) {
  return BRL.format(v || 0);
}

// ─── Timestamps ───────────────────────────────────────────────────────────────

/**
 * Normaliza um Timestamp do Firestore ou um Date nativo para Date.
 * @param {import('firebase/firestore').Timestamp | Date | number | null} ts
 * @returns {Date | null}
 */
export function tsToDate(ts) {
  if (!ts) return null;
  return ts?.toDate?.() ?? new Date(ts);
}

// ─── Formatação de datas ───────────────────────────────────────────────────────

/** "01/jan./2026" */
export function fmtData(ts) {
  const d = tsToDate(ts);
  return d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

/** "01/01" */
export function fmtDataCurta(ts) {
  const d = tsToDate(ts);
  return d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';
}

/** "jan. 2026" */
export function fmtMesAno(ts) {
  const d = tsToDate(ts);
  return d ? d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : '';
}

/** "01/2026" — chave de agrupamento mensal */
export function labelMes(ts) {
  const d = tsToDate(ts);
  return d ? `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '';
}

/** "MM/YYYY" do mês corrente */
export function labelMesAtual() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ─── Urgência de vencimento ────────────────────────────────────────────────────

/**
 * Calcula dias para vencer a partir de um Timestamp.
 * @returns {number | null} Negativo = vencida, 0 = vence hoje, positivo = dias restantes.
 */
export function diasParaVencer(ts) {
  const d = tsToDate(ts);
  if (!d) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(d); alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 86400000);
}

/**
 * Retorna classes Tailwind de cor de texto baseadas na urgência.
 * @param {number | null} dias
 */
export function urgencyColor(dias) {
  if (dias === null) return 'text-slate-500';
  if (dias < 0)     return 'text-red-400';
  if (dias === 0)   return 'text-orange-400';
  if (dias <= 3)    return 'text-yellow-400';
  return 'text-slate-400';
}

/**
 * Retorna classes Tailwind de borda/fundo baseadas na urgência.
 * @param {number | null} dias
 */
export function urgencyBg(dias) {
  if (dias === null) return 'border-white/[0.06]';
  if (dias < 0)     return 'border-red-500/20 bg-red-500/[0.03]';
  if (dias === 0)   return 'border-orange-500/20 bg-orange-500/[0.03]';
  if (dias <= 3)    return 'border-yellow-500/20 bg-yellow-500/[0.03]';
  return 'border-white/[0.06]';
}

// ─── Tipos de despesa ──────────────────────────────────────────────────────────

/** Rótulos legíveis dos tipos de despesa */
export const TIPO_LABEL = {
  mensal_fixa:  'Fixa',
  operacional:  'Operac.',
  investimento: 'Invest.',
};

/** Classes Tailwind dos badges de tipo de despesa */
export const TIPO_CLS = {
  mensal_fixa:  'bg-blue-900/40 text-blue-300 border-blue-700/40',
  operacional:  'bg-slate-700/60 text-slate-400 border-white/10',
  investimento: 'bg-violet-900/40 text-violet-300 border-violet-700/40',
};

// ─── Admin check ──────────────────────────────────────────────────────────────

/** Verifica se o usuário logado tem role admin via localStorage. */
export function checkAdmin() {
  try {
    const stored = localStorage.getItem('expedicao_user');
    if (stored) {
      const r = JSON.parse(stored).role;
      if (r) return r === 'admin';
    }
  } catch {}
  return false;
}
