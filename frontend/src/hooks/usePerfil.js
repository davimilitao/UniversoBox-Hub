/**
 * @file usePerfil.js
 * @description Hook que lê o perfil do usuário (/api/perfis/:role) e retorna
 *              os módulos visíveis, nome, avatar e cor. Compatível com o
 *              sistema de perfis gerenciado em config.html.
 */

import { useState, useEffect } from 'react';
import { onAuthStateChanged }  from 'firebase/auth';
import { auth }                from '../firebase';

// Fallback local — espelha os defaults do server.js
const DEFAULT_MODULOS = {
  admin:      ['pedidos','manual','bling','ml-dashboard','admin','catalogo',
               'embalagens','financas','compras','importar','index','config',
               'cadastrar','enriquecer-xml'],
  operacao:   ['pedidos','manual','bling','ml-dashboard','embalagens','index'],
  financeiro: ['financas','compras','index'],
  catalogo:   ['admin','catalogo','embalagens','cadastrar','enriquecer-xml','compras','index'],
  vendas:     ['catalogo','index'],
};

function getRoleFromStorage() {
  try {
    const stored = localStorage.getItem('expedicao_user');
    if (stored) return JSON.parse(stored).role || 'operacao';
  } catch {}
  return 'admin'; // assume admin dentro do React SPA enquanto não tem login integrado
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

      // Sem user Firebase → usa defaults locais
      if (!user) {
        setPerfil({ role, nome, modulos: DEFAULT_MODULOS[role] || DEFAULT_MODULOS.admin });
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
          setPerfil({
            role,
            nome,
            modulos: data.modulos  || DEFAULT_MODULOS[role] || DEFAULT_MODULOS.admin,
            avatar:  data.avatar   || nome.slice(0, 2).toUpperCase(),
            cor:     data.cor      || '#10b981',
            tema:    data.tema     || 'dark',
          });
        }
      } catch {
        if (!cancelled) {
          setPerfil({
            role,
            nome,
            modulos: DEFAULT_MODULOS[role] || DEFAULT_MODULOS.admin,
            avatar:  nome.slice(0, 2).toUpperCase(),
            cor:     '#10b981',
          });
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
