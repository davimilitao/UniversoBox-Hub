/**
 * @file getAuthToken.js
 * @description Helper para obter sempre um Firebase idToken fresco.
 *              Firebase tokens expiram em 1h — nunca usar o valor cacheado
 *              em localStorage diretamente para requests autenticados.
 */

import { auth } from '../firebase';

/**
 * Retorna um idToken válido (auto-refresh se expirado).
 * Fallback para localStorage se Firebase não estiver disponível.
 */
export async function getAuthToken() {
  try {
    const user = auth?.currentUser;
    if (user) {
      // force: false — retorna o token cacheado se ainda válido, renova se expirado
      return await user.getIdToken(false);
    }
  } catch {}
  // Fallback: token salvo no login (pode estar expirado — apenas para dev/fallback)
  return localStorage.getItem('expedicao_token') || '';
}

/**
 * Retorna headers de autenticação prontos para fetch.
 */
export async function authHeaders(extra = {}) {
  const token = await getAuthToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

/**
 * fetch autenticado — wrapper conveniente.
 */
export async function apiFetch(path, opts = {}) {
  const token = await getAuthToken();
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  return res;
}
