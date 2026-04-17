/**
 * @file useCompras.js
 * @description Hook Firestore para Contas a Pagar (compras de mercadoria).
 *   Coleções:
 *     fin_compras  — cabeçalho da compra
 *     fin_parcelas — parcelas geradas automaticamente
 *
 *   Fluxo:
 *   1. lancarCompra() → cria doc em fin_compras e N docs em fin_parcelas
 *   2. marcarPago()   → atualiza parcela + desconta limite do meio de pagamento
 *   3. loadParcelas() → retorna parcelas ordenadas por vencimento
 */

import { useState, useEffect, useCallback } from 'react';
import {
  collection, addDoc, getDocs, doc, updateDoc, query,
  orderBy, serverTimestamp, Timestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calcula data de vencimento de uma parcela.
 * Usa o diaVencimento do cartão no mês correto.
 */
function calcVencimento(diaVencimento, mesBase, parcelaIdx) {
  const d = new Date(mesBase);
  d.setDate(1); // evita overflow de meses curtos
  d.setMonth(d.getMonth() + parcelaIdx);
  d.setDate(Math.min(diaVencimento, diaNoBimestre(d.getFullYear(), d.getMonth())));
  return Timestamp.fromDate(d);
}

function diaNoBimestre(ano, mes) {
  return new Date(ano, mes + 1, 0).getDate(); // último dia do mês
}

/**
 * Calcula valor de cada parcela com juros simples.
 * Distribui centavos na última parcela.
 */
function calcParcelas(total, n, taxaMensal) {
  const rate = (taxaMensal || 0) / 100;
  const totalComJuros = rate > 0 ? total * (1 + rate * n) : total;
  const valorBase = Math.floor((totalComJuros / n) * 100) / 100;
  const resto = Math.round((totalComJuros - valorBase * n) * 100) / 100;
  return {
    totalComJuros: Math.round(totalComJuros * 100) / 100,
    valorBase,
    resto,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCompras() {
  const [parcelas,   setParcelas]   = useState([]);
  const [compras,    setCompras]    = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [erro,       setErro]       = useState('');

  // ── Carrega parcelas ordenadas por vencimento ─────────────────────────────
  const loadParcelas = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'fin_parcelas'), orderBy('vencimento', 'asc'));
      const snap = await getDocs(q);
      setParcelas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('[useCompras] loadParcelas', e);
      setErro('Erro ao carregar parcelas: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Carrega compras (cabeçalhos) ──────────────────────────────────────────
  const loadCompras = useCallback(async () => {
    try {
      const q = query(collection(db, 'fin_compras'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setCompras(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('[useCompras] loadCompras', e);
    }
  }, []);

  useEffect(() => {
    loadParcelas();
    loadCompras();
  }, [loadParcelas, loadCompras]);

  // ── Lança compra + gera parcelas ──────────────────────────────────────────
  /**
   * @param {Object} dados
   * @param {string}  dados.fornecedor
   * @param {string}  dados.descricao
   * @param {number}  dados.totalBruto        — valor total sem juros
   * @param {number}  dados.numeroParcelas     — 1-24
   * @param {number}  dados.taxaJuros          — % mensal (0 = sem juros)
   * @param {string}  dados.meioId             — id do fin_meios_pagamento
   * @param {string}  dados.meioNome           — apelido do cartão
   * @param {string}  dados.meioBandeira
   * @param {number}  dados.diaVencimento      — dia de vencimento do cartão
   * @param {Date}    dados.dataPrimeiraParcela — data base para a 1ª parcela
   * @param {string}  [dados.sku]              — SKU do produto (para margem)
   * @param {number}  [dados.qtd]              — quantidade comprada
   * @param {number}  [dados.custoUnitario]    — custo por unidade calculado
   */
  async function lancarCompra(dados) {
    setSaving(true); setErro('');
    try {
      const n = dados.numeroParcelas || 1;
      const { totalComJuros, valorBase, resto } = calcParcelas(
        dados.totalBruto, n, dados.taxaJuros
      );

      // 1. Cabeçalho da compra
      const compraRef = await addDoc(collection(db, 'fin_compras'), {
        fornecedor:      dados.fornecedor,
        descricao:       dados.descricao,
        totalBruto:      dados.totalBruto,
        totalComJuros,
        numeroParcelas:  n,
        taxaJuros:       dados.taxaJuros || 0,
        meioId:          dados.meioId,
        meioNome:        dados.meioNome,
        meioBandeira:    dados.meioBandeira,
        sku:             dados.sku || '',
        qtd:             dados.qtd || 0,
        custoUnitario:   dados.custoUnitario || 0,
        status:          'aberta',      // aberta | quitada
        createdAt:       serverTimestamp(),
      });

      // 2. Parcelas em batch
      const batch = writeBatch(db);
      const mesBase = dados.dataPrimeiraParcela || new Date();

      for (let i = 0; i < n; i++) {
        const valor = i === n - 1 ? +(valorBase + resto).toFixed(2) : valorBase;
        const venc  = calcVencimento(dados.diaVencimento, mesBase, i);
        const pRef  = doc(collection(db, 'fin_parcelas'));
        batch.set(pRef, {
          compraId:       compraRef.id,
          fornecedor:     dados.fornecedor,
          descricao:      dados.descricao,
          meioId:         dados.meioId,
          meioNome:       dados.meioNome,
          meioBandeira:   dados.meioBandeira,
          numeroParcela:  i + 1,
          totalParcelas:  n,
          valor,
          vencimento:     venc,
          status:         'pendente',   // pendente | pago | cancelado
          comprovante:    null,
          paidAt:         null,
          createdAt:      serverTimestamp(),
        });
      }
      await batch.commit();

      // 3. Reload
      await Promise.all([loadParcelas(), loadCompras()]);
      return { ok: true, compraId: compraRef.id };
    } catch (e) {
      console.error('[useCompras] lancarCompra', e);
      setErro('Erro ao lançar compra: ' + e.message);
      return { ok: false, error: e.message };
    } finally {
      setSaving(false);
    }
  }

  // ── Marca parcela como paga ───────────────────────────────────────────────
  async function marcarPago(parcelaId) {
    try {
      await updateDoc(doc(db, 'fin_parcelas', parcelaId), {
        status: 'pago',
        paidAt: serverTimestamp(),
      });
      setParcelas(prev =>
        prev.map(p => p.id === parcelaId ? { ...p, status: 'pago', paidAt: new Date() } : p)
      );
      return { ok: true };
    } catch (e) {
      console.error('[useCompras] marcarPago', e);
      return { ok: false, error: e.message };
    }
  }

  // ── Desfaz pagamento ─────────────────────────────────────────────────────
  async function desfazerPagamento(parcelaId) {
    try {
      await updateDoc(doc(db, 'fin_parcelas', parcelaId), {
        status: 'pendente',
        paidAt: null,
      });
      setParcelas(prev =>
        prev.map(p => p.id === parcelaId ? { ...p, status: 'pendente', paidAt: null } : p)
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ── Computed: parcelas de hoje / semana / mês ─────────────────────────────
  function getResumo() {
    const hoje  = new Date(); hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);
    const semAte = new Date(hoje); semAte.setDate(semAte.getDate() + 7);
    const mesAte = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

    const pendentes = parcelas.filter(p => p.status === 'pendente');
    const tsMs = p => (p.vencimento?.toDate?.() ?? new Date(p.vencimento)).getTime();

    const vencidas  = pendentes.filter(p => tsMs(p) < hoje.getTime());
    const hoje_arr  = pendentes.filter(p => { const t = tsMs(p); return t >= hoje.getTime() && t < amanha.getTime(); });
    const semana_arr = pendentes.filter(p => { const t = tsMs(p); return t >= hoje.getTime() && t <= semAte.getTime(); });
    const mes_arr   = pendentes.filter(p => { const t = tsMs(p); return t >= hoje.getTime() && t <= mesAte.getTime(); });

    const soma = arr => arr.reduce((s, p) => s + (p.valor || 0), 0);

    return {
      vencidas:      { items: vencidas,   total: soma(vencidas)   },
      hoje:          { items: hoje_arr,   total: soma(hoje_arr)   },
      semana:        { items: semana_arr, total: soma(semana_arr) },
      mes:           { items: mes_arr,    total: soma(mes_arr)    },
      totalPendente: soma(pendentes),
      totalPago:     parcelas.filter(p => p.status === 'pago').reduce((s, p) => s + (p.valor || 0), 0),
    };
  }

  return {
    parcelas,
    compras,
    loading,
    saving,
    erro,
    lancarCompra,
    marcarPago,
    desfazerPagamento,
    getResumo,
    reload: () => { loadParcelas(); loadCompras(); },
    calcParcelas,
  };
}

// Export helper for use in form preview
export { calcParcelas };
