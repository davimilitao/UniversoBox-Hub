/**
 * @file useContasAPagar.js
 * @module financeiro
 * @description Hook unificado que combina fin_despesas (não-investimento, pendentes/vencidas)
 *              + fin_parcelas (pendentes) em uma única lista de contas a pagar,
 *              com statusEfetivo calculado por vencimento.
 * @version 1.0.0
 * @date 2026-04-17
 */

import { useState, useEffect, useMemo } from 'react';
import {
  collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { apiFetch } from '../utils/getAuthToken';

// ─── helpers ──────────────────────────────────────────────────────────────────

function hoje() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function tsParaDate(ts) {
  if (!ts) return null;
  return ts.toDate ? ts.toDate() : new Date(ts);
}

function fmtData(d) {
  if (!d) return '';
  return d.toLocaleDateString('pt-BR');
}

/**
 * Calcula statusEfetivo com base na data de vencimento e status atual.
 * @returns 'pago' | 'vencido' | 'hoje' | 'em_breve' | 'pendente'
 */
function calcStatus(vencimento, pago) {
  if (pago) return 'pago';
  if (!vencimento) return 'pendente';
  const hojeMs = hoje().getTime();
  const vMs = vencimento.getTime();
  const diff = Math.ceil((vMs - hojeMs) / 86400000);
  if (diff < 0) return 'vencido';
  if (diff === 0) return 'hoje';
  if (diff <= 7) return 'em_breve';
  return 'pendente';
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export function useContasAPagar() {
  const [despesas,  setDespesas]  = useState([]);
  const [parcelas,  setParcelas]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [pagando,   setPagando]   = useState(null);

  // ── listener fin_despesas ──────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'fin_despesas'), orderBy('data', 'desc'));
    return onSnapshot(q, snap => {
      const items = snap.docs
        .map(d => {
          const raw = d.data();
          const venc = tsParaDate(raw.data);
          const pago = raw.situacao === 'pago';
          return {
            id:           d.id,
            origem:       'despesa',
            tipo:         raw.tipo || 'operacional',
            fornecedor:   raw.fornecedor || raw.categoria || '',
            categoria:    raw.categoria || '',
            descricao:    raw.descricao || '',
            valor:        raw.valor || 0,
            vencimento:   venc,
            vencimentoFmt: fmtData(venc),
            statusEfetivo: calcStatus(venc, pago),
            meioId:       raw.meioId || null,
            meioNome:     null,
            comprovante:  raw.comprovante || null,
            compraId:     raw.compraId || null,
          };
        })
        .filter(d => d.tipo !== 'investimento'); // investimentos vivem em parcelas
      setDespesas(items);
      setLoading(false);
    }, err => {
      console.error('[useContasAPagar] despesas:', err);
      setLoading(false);
    });
  }, []);

  // ── listener fin_parcelas ──────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'fin_parcelas'), orderBy('vencimento', 'asc'));
    return onSnapshot(q, snap => {
      const items = snap.docs.map(d => {
        const raw = d.data();
        const venc = tsParaDate(raw.vencimento);
        const pago = raw.status === 'pago';
        return {
          id:           d.id,
          origem:       'parcela',
          tipo:         'investimento',
          fornecedor:   raw.fornecedor || '',
          categoria:    'Compra Parcelada',
          descricao:    raw.descricao
                          ? `${raw.descricao} (${raw.numeroParcela}/${raw.totalParcelas})`
                          : `Parcela ${raw.numeroParcela}/${raw.totalParcelas}`,
          valor:        raw.valor || 0,
          vencimento:   venc,
          vencimentoFmt: fmtData(venc),
          statusEfetivo: calcStatus(venc, pago),
          meioId:       raw.meioId || null,
          meioNome:     raw.meioNome || null,
          meioBandeira: raw.meioBandeira || null,
          comprovante:  null,
          compraId:     raw.compraId || null,
        };
      });
      setParcelas(items);
    }, err => console.error('[useContasAPagar] parcelas:', err));
  }, []);

  // ── lista unificada ────────────────────────────────────────────────────────
  const tudo = useMemo(() => {
    return [...despesas, ...parcelas].sort((a, b) => {
      // pagas vão pro final
      const pa = a.statusEfetivo === 'pago' ? 1 : 0;
      const pb = b.statusEfetivo === 'pago' ? 1 : 0;
      if (pa !== pb) return pa - pb;
      // ordena por vencimento dentro de cada grupo
      const ta = a.vencimento?.getTime() || 0;
      const tb = b.vencimento?.getTime() || 0;
      return ta - tb;
    });
  }, [despesas, parcelas]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const vencidas  = tudo.filter(d => d.statusEfetivo === 'vencido');
    const hoje_     = tudo.filter(d => d.statusEfetivo === 'hoje');
    const em_breve  = tudo.filter(d => d.statusEfetivo === 'em_breve');
    const pagas     = tudo.filter(d => d.statusEfetivo === 'pago');
    const pendentes = tudo.filter(d => d.statusEfetivo === 'pendente');
    const soma = arr => arr.reduce((s, d) => s + d.valor, 0);
    return {
      vencidas,  totalVencido:  soma(vencidas),
      hoje_,     totalHoje:     soma(hoje_),
      em_breve,  totalEmBreve:  soma(em_breve),
      pendentes, totalPendente: soma(pendentes),
      pagas,     totalPago:     soma(pagas),
      totalMes:  soma(tudo),
    };
  }, [tudo]);

  // ── ações ─────────────────────────────────────────────────────────────────

  async function marcarPago(item) {
    if (pagando) return;
    setPagando(item.id);
    try {
      if (item.origem === 'despesa') {
        await apiFetch(`/api/fin-despesas/${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ situacao: 'pago' }),
        });
      } else {
        await updateDoc(doc(db, 'fin_parcelas', item.id), {
          status: 'pago',
          paidAt: serverTimestamp(),
        });
      }
    } finally {
      setPagando(null);
    }
  }

  async function desfazerPagamento(item) {
    if (pagando) return;
    setPagando(item.id);
    try {
      if (item.origem === 'despesa') {
        await apiFetch(`/api/fin-despesas/${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ situacao: 'pendente' }),
        });
      } else {
        await updateDoc(doc(db, 'fin_parcelas', item.id), {
          status: 'pendente',
          paidAt: null,
        });
      }
    } finally {
      setPagando(null);
    }
  }

  return { tudo, kpis, loading, pagando, marcarPago, desfazerPagamento };
}
