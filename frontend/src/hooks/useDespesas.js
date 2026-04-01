/**
 * @file useDespesas.js
 * @module hooks
 * @description Hook para buscar despesas do Google Sheets via GET /api/despesas.
 *              Inclui token Firebase no header — rota agora requer autenticação.
 * @version 1.0.0
 * @date 2026-04-01
 * @author UniversoLab
 *
 * @changelog
 *   1.0.0 — 2026-04-01 — Criação inicial para o PainelFinanceiro.
 */

import { useState, useEffect } from 'react';
import { auth } from '../firebase';

/**
 * Parseia data no formato DD/MM/YYYY e retorna { mes (1-12), ano }.
 * Retorna null se o formato for inválido.
 */
export function parseDataBR(dataStr) {
  if (!dataStr) return null;
  const parts = String(dataStr).trim().split('/');
  if (parts.length !== 3) return null;
  const dia = parseInt(parts[0], 10);
  const mes = parseInt(parts[1], 10);
  const ano = parseInt(parts[2], 10);
  if (isNaN(dia) || isNaN(mes) || isNaN(ano)) return null;
  return { dia, mes, ano };
}

/**
 * Retorna label "MM/YYYY" a partir de { mes, ano }.
 */
export function labelMesAno({ mes, ano }) {
  return `${String(mes).padStart(2, '0')}/${ano}`;
}

export function useDespesas() {
  const [despesas, setDespesas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchDespesas() {
      try {
        setLoading(true);
        setError(null);

        const user = auth?.currentUser;
        // getIdToken(false) usa cache; força refresh apenas se expirado
        const token = user ? await user.getIdToken(false) : null;

        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch('/api/despesas', { headers });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!cancelled) setDespesas(data.items || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDespesas();
    return () => { cancelled = true; };
  }, []);

  return { despesas, loading, error };
}
