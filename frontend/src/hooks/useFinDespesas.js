/**
 * @file useFinDespesas.js
 * @module financeiro
 * @description Hook Firestore em tempo real para a coleção fin_despesas.
 *              Substitui useDespesas (Google Sheets) como fonte primária de despesas.
 * @version 1.0.0
 * @date 2026-04-11
 */

import { useState, useEffect } from 'react';
import {
  collection, query, orderBy, onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';

// ─── helpers exportados ────────────────────────────────────────────────────────

const HOJE_INICIO = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();

/** Converte qualquer formato de data (Timestamp, Date, ms, "DD/MM/YYYY", ISO) para objeto Date válido */
export function parseAnyDate(raw) {
  if (!raw) return null;
  if (typeof raw.toDate === 'function') {
    const d = raw.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  if (raw instanceof Date) {
    return isNaN(raw.getTime()) ? null : raw;
  }
  if (typeof raw === 'number') {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === 'string') {
    const str = raw.trim();
    if (!str) return null;
    if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        const d = new Date(year, month, day, 12, 0, 0);
        return isNaN(d.getTime()) ? null : d;
      }
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Calcula status efetivo: pago / pendente / vencido */
export function computarStatusEfetivo(d) {
  if (d.situacao === 'pago') return 'pago';
  return d.timestamp < HOJE_INICIO ? 'vencido' : 'pendente';
}

/** Extrai label "MM/YYYY" de um timestamp ou qualquer representação de data */
export function labelMesAnoTs(ts) {
  const d = parseAnyDate(ts);
  if (!d) return '';
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Extrai meses únicos ordenados (mais recente primeiro) */
export function extrairMesesFin(despesas) {
  const vistos = new Set();
  const lista = [];
  despesas.forEach(d => {
    const label = labelMesAnoTs(d.timestamp);
    if (label && !vistos.has(label)) {
      vistos.add(label);
      lista.push({ label, ts: d.timestamp });
    }
  });
  return lista.sort((a, b) => b.ts - a.ts);
}

/** Formata Timestamp ou representação de data do Firestore → "DD/MM/YYYY" */
function fmtData(ts) {
  const d = parseAnyDate(ts);
  return d ? d.toLocaleDateString('pt-BR') : '';
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

    const stored = localStorage.getItem('expedicao_user');
    let tenantId = '';
    try {
      if (stored) tenantId = JSON.parse(stored).tenantId || '';
    } catch (e) {}

    const q = query(
      collection(db, 'fin_despesas'),
      orderBy('data', 'desc'),
    );

    const unsub = onSnapshot(
      q,
      snap => {
        const items = snap.docs.map(doc => {
          const d = doc.data();
          const dateObj = parseAnyDate(d.data);
          const ts = dateObj ? dateObj.getTime() : 0;
          return {
            id:         doc.id,
            tenantId:   d.tenantId   || null,
            rawData:    d.data,
            data:       dateObj ? dateObj.toLocaleDateString('pt-BR') : '',
            timestamp:  ts,
            createdAt:  d.createdAt  || null,
            tipo:       d.tipo       || 'operacional',
            categoria:  d.categoria  || '',
            nome:       d.categoria  || '', // Categoria é mapeada para "nome" para exibição
            fornecedor: d.fornecedor || '',
            descricao:  d.descricao  || '',
            valor:      d.valor      || 0,
            situacao:   d.situacao   || 'pendente',
            meioId:     d.meioId     || null,
            compraId:   d.compraId   || null,
            comprovante: d.comprovante || null,
          };
        }).filter(d => !d.tenantId || d.tenantId === tenantId);
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
