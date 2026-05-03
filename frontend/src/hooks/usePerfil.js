/**
 * @file usePerfil.js
 * @description Hook que lê o perfil do usuário (/api/perfis/:role) e aplica
 *              o tema no <html data-theme="..."> para ativar o ThemeBackground.
 * @version 1.1.0
 */

import { useState, useEffect } from 'react';
import { onAuthStateChanged }  from 'firebase/auth';
import { auth }                from '../firebase';

// Módulos válidos (espelha AppShell ROTAS — moduleId de cada rota)
const DEFAULT_MODULOS = {
  admin:      ['pedidos','manual','bling','ml-dashboard','insumos','reposicao','admin','catalogo',
               'embalagens','financas','compras','coletas','importar','index','config',
               'cadastrar','enriquecer-xml','tarefas','design-system'],
  operacao:   ['pedidos','manual','bling','ml-dashboard','insumos','reposicao','embalagens','coletas','index'],
  financeiro: ['financas','compras','index'],
  catalogo:   ['admin','catalogo','embalagens','cadastrar','enriquecer-xml','compras','importar','index'],
  vendas:     ['catalogo','index'],
};

const TEMAS_VALIDOS = ['dark', 'uber', 'ifood', '99', 'marvel', 'rick'];

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

      const role = getRoleFromStorage();
      const nome = user?.displayName || user?.email?.split('@')[0] || 'Usuário';

      if (!user) {
        const p = { role, nome, modulos: DEFAULT_MODULOS[role] || DEFAULT_MODULOS.admin, cor: '#10b981', tema: 'dark' };
        applyTheme(p.tema);
        setPerfil(p);
        setLoading(false);
        return;
      }

      try {
        const token = await user.getIdToken(false);
        const res   = await fetch(`/api/perfis/${role}`, {
          headers: { Authorization: `Bearer ${token}` },
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
      } catch {
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
    });

    return () => { cancelled = true; unsub(); };
  }, []);

  return { perfil, loading };
}
