/**
 * @file useDespesas.js
 * @module hooks
 * @description Hook para buscar despesas do Google Sheets via GET /api/despesas.
 *              Inclui token Firebase no header — rota agora requer autenticação.
 * @version 1.1.0
 * @date 2026-04-01
 * @author UniversoLab
 *
 * @changelog
 *   1.1.0 — 2026-04-01 — Usa onAuthStateChanged para aguardar Firebase inicializar
 *                         antes de buscar (evita token null em acesso direto à rota).
 *   1.0.0 — 2026-04-01 — Criação inicial para o PainelFinanceiro.
 */

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
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

    // Aguarda o Firebase resolver o estado de auth antes de buscar.
    // onAuthStateChanged dispara imediatamente com null (não logado)
    // ou com o user (logado com sessão ativa) — evita race condition
    // com auth.currentUser sendo null no primeiro render.
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (cancelled) return;

      if (!user) {
        setError('Sessão expirada. Faça login novamente.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const token = await user.getIdToken(false);
        const res = await fetch('/api/despesas', {
          headers: { Authorization: `Bearer ${token}` },
        });

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

      // Busca uma vez e cancela o listener
      unsubscribe();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return { despesas, loading, error };
}
