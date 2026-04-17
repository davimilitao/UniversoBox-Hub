/**
 * @file getAuthToken.js
 * @description Helper para obter sempre um Firebase idToken fresco.
 *              Firebase tokens expiram em 1h — nunca usar o valor cacheado
 *              em localStorage diretamente para requests autenticados.
 */

import { auth } from '../firebase';

/**
 * Aguarda o Firebase resolver o estado de auth (onAuthStateChanged resolve na 1ª vez).
 * Necessário pois auth.currentUser é null nos primeiros ms após o carregamento.
 */
function waitForAuth(timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (!auth) return resolve(null);
    const timer = setTimeout(() => { unsub(); resolve(null); }, timeoutMs);
    const unsub = auth.onAuthStateChanged(user => {
      clearTimeout(timer);
      unsub();
      resolve(user);
    });
  });
}

/**
 * Retorna um idToken válido (auto-refresh se expirado).
 * Espera o Firebase resolver o auth antes de retornar.
 */
export async function getAuthToken() {
  try {
    // currentUser pode ser null na inicialização — aguarda resolução
    const user = auth?.currentUser ?? await waitForAuth();
    if (user) {
      return await user.getIdToken(false);
    }
  } catch {}
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
