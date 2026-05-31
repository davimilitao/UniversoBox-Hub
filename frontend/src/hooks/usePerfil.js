/**
 * @file usePerfil.js
 * @description Hook que lê o perfil do usuário (/api/perfis/:role) e aplica
 *              o tema no <html data-theme="..."> para ativar o ThemeBackground.
 * @version 1.1.0
 */

import { useState, useEffect } from 'react';
import { onAuthStateChanged }  from 'firebase/auth';
import { auth }                from '../firebase';

// Módulos válidos (espelha server.js — inclui 'insumos')
const DEFAULT_MODULOS = {
  admin:      ['pedidos', 'bling', 'financas', 'index', 'config', 'catalogo'],
  operacao:   ['pedidos', 'bling', 'index'],
  financeiro: ['financas', 'index'],
  catalogo:   ['index', 'catalogo'],
  vendas:     ['index'],
};

const TEMAS_VALIDOS = ['dark', 'uber', 'ifood', '99', 'marvel', 'rick', 'clean'];

function applyTheme(tema) {
  const t = TEMAS_VALIDOS.includes(tema) ? tema : 'dark';
  const html = document.documentElement;

  // Ativa transição suave por 400 ms
  html.classList.add('theme-transitioning');
  html.setAttribute('data-theme', t);
  setTimeout(() => html.classList.remove('theme-transitioning'), 400);
}

function getRoleFromStorage() {
  try {
    const stored = localStorage.getItem('expedicao_user');
    if (stored) return JSON.parse(stored).role || 'operacao';
  } catch {}
  return 'admin';
}

export function usePerfil() {
  const [perfil,  setPerfil]  = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (cancelled) return;

      if (!user) {
        const role = 'operacao';
        const nome = 'Visitante';
        const p = { role, nome, modulos: ['index'], cor: '#10b981', tema: 'dark' };
        applyTheme(p.tema);
        setPerfil(p);
        setLoading(false);
        return;
      }

      try {
        const tokenResult = await user.getIdTokenResult();
        const role = tokenResult.claims.role || 'operacao';
        const tenantId = tokenResult.claims.tenantId || '';
        const nome = user.displayName || user.email?.split('@')[0] || 'Usuário';

        // Sincroniza informações no localStorage
        localStorage.setItem('expedicao_user', JSON.stringify({
          uid: user.uid,
          email: user.email,
          role,
          tenantId,
        }));
        localStorage.setItem('expedicao_token', tokenResult.token);

        const res = await fetch(`/api/perfis/${role}`, {
          headers: { Authorization: `Bearer ${tokenResult.token}` },
        });
        if (!res.ok) throw new Error('perfil-fallback');
        const data = await res.json();
        if (!cancelled) {
          const p = {
            role,
            nome,
            modulos:  data.modulos  || DEFAULT_MODULOS[role] || DEFAULT_MODULOS.admin,
            avatar:   data.avatar   || nome.slice(0, 2).toUpperCase(),
            cor:      data.cor      || '#10b981',
            tema:     data.tema     || 'dark',
          };
          applyTheme(p.tema);
          setPerfil(p);
        }
      } catch (err) {
        console.warn('[usePerfil] erro ao carregar perfil do backend, usando fallback local', err);
        const role = getRoleFromStorage();
        const nome = user.displayName || user.email?.split('@')[0] || 'Usuário';
        if (!cancelled) {
          const p = {
            role,
            nome,
            modulos: DEFAULT_MODULOS[role] || DEFAULT_MODULOS.admin,
            avatar:  nome.slice(0, 2).toUpperCase(),
            cor:     '#10b981',
            tema:    'dark',
          };
          applyTheme(p.tema);
          setPerfil(p);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }

      unsub();
    });

    return () => { cancelled = true; unsub(); };
  }, []);

  return { perfil, loading };
}
