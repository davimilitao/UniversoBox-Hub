/**
 * @file useFinDespesas.js
 * @module financeiro
 * @description Hook Firestore em tempo real para a coleção fin_despesas.
 *              Substitui useDespesas (Google Sheets) como fonte primária de despesas.
 * @version 1.0.0
 * @date 2026-04-11
 */

import { useState, useEffect, useMemo } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  where, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// ─── helpers exportados ────────────────────────────────────────────────────────

const HOJE_INICIO = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();

/** Calcula status efetivo: pago / pendente / vencido */
export function computarStatusEfetivo(d) {
  if (d.situacao === 'pago') return 'pago';
  return d.timestamp < HOJE_INICIO ? 'vencido' : 'pendente';
}

/** Extrai label "MM/YYYY" de um timestamp */
export function labelMesAnoTs(ts) {
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Extrai meses únicos ordenados (mais recente primeiro) */
export function extrairMesesFin(despesas) {
  const vistos = new Set();
  const lista = [];
  despesas.forEach(d => {
    const label = labelMesAnoTs(d.timestamp);
    if (!vistos.has(label)) {
      vistos.add(label);
      lista.push({ label, ts: d.timestamp });
    }
  });
  return lista.sort((a, b) => b.ts - a.ts);
}

/** Formata Timestamp do Firestore → "DD/MM/YYYY" */
function fmtData(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('pt-BR');
}

// ─── hook principal ────────────────────────────────────────────────────────────

/**
 * useFinDespesas
 * Escuta a coleção fin_despesas em tempo real.
 * Filtro opcional por mês (string "MM/YYYY").
 */
export function useFinDespesas() {
  const [despesas, setDespesas] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    if (!db) {
      setError('Firebase não inicializado — verifique o .env');
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'fin_despesas'),
      orderBy('data', 'desc'),
    );

    const unsub = onSnapshot(
      q,
      snap => {
        const items = snap.docs.map(doc => {
          const d = doc.data();
          const ts = d.data?.toDate ? d.data.toDate().getTime() : 0;
          return {
            id:         doc.id,
            data:       fmtData(d.data),
            timestamp:  ts,
            tipo:       d.tipo       || 'operacional',
            categoria:  d.categoria  || '',
            fornecedor: d.fornecedor || '',
            descricao:  d.descricao  || '',
            valor:      d.valor      || 0,
            situacao:   d.situacao   || 'pendente',
            meioId:     d.meioId     || null,
            compraId:   d.compraId   || null,
            comprovante: d.comprovante || null,
          };
        });
        setDespesas(items);
        setLoading(false);
      },
      err => {
        console.error('[useFinDespesas]', err);
        setError(err.message);
        setLoading(false);
      },
    );

    return unsub;
  }, []);

  return { despesas, loading, error };
}
