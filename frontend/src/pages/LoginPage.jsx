/**
 * @file LoginPage.jsx
 * @module auth
 * @description Tela de login (Modelo B): e-mail/senha Firebase, seleção de tenant ativo,
 *              provisionamento de claims via POST /auth/provision e redirecionamento ao dashboard.
 * @version 1.0.1
 * @date 2026-03-31
 * @author UniversoLab
 *
 * @changelog
 *   1.0.0 — 2026-03-31 — Substitui login HTML legado; fluxo tenant + provisionamento.
 *   1.0.1 — 2026-03-31 — Lista de tenants via GET /api/tenants (público, cache 60s); remove query Firestore no cliente.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, isFirebaseClientReady } from '../firebase';

/** Mesma origem em produção; em dev o Vite proxy encaminha /auth e /api para o Express */
function apiUrl(path) {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (base === undefined || base === '') return path;
  return `${String(base).replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function provisionUrl() {
  return apiUrl('/auth/provision');
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [tenants, setTenants] = useState([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Etapa 1: tenants ativos via API pública (Admin SDK no servidor) — sem credencial no browser
  const loadTenants = useCallback(async () => {
    setLoadingTenants(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/tenants'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const list = await res.json();
      if (!Array.isArray(list)) throw new Error('Resposta inválida do servidor');
      const normalized = list.map((t) => ({
        id: String(t.id),
        name: String(t.name ?? t.id),
      }));
      normalized.sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
      setTenants(normalized);
      if (normalized.length === 1) setTenantId(normalized[0].id);
    } catch (e) {
      console.error('[LoginPage] tenants', e);
      setError(e?.message || 'Não foi possível carregar tenants. Tente novamente.');
    } finally {
      setLoadingTenants(false);
    }
  }, []);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!isFirebaseClientReady() || !auth) {
      setError('Firebase Auth indisponível. Configure VITE_FIREBASE_*.');
      return;
    }
    if (!email.trim() || !password) {
      setError('Informe e-mail e senha.');
      return;
    }
    if (!tenantId) {
      setError('Selecione um tenant.');
      return;
    }

    setSubmitting(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = cred.user;
      const idToken = await user.getIdToken();

      const res = await fetch(provisionUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ tenantId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        await auth.signOut();
        throw new Error(body.error || `Provisionamento falhou (${res.status})`);
      }

      await user.getIdToken(true);

      const fresh = await user.getIdToken();
      try {
        localStorage.setItem('firebase_id_token', fresh);
      } catch (_) {
        /* ignore quota */
      }

      navigate('/', { replace: true });
    } catch (err) {
      console.error('[LoginPage] submit', err);
      setError(err?.message || 'Falha no login. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 font-sans">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-black/50">
        <div className="mb-6">
          <p className="font-mono text-lg font-bold text-amber-300 tracking-wide">
            UNIVERSOBOX<span className="text-slate-500 font-normal">/HUB</span>
          </p>
          <p className="mt-1 text-sm text-slate-400">Entre com sua conta e escolha o tenant (Modelo B)</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-600 focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/20"
              placeholder="voce@empresa.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Senha
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/20"
              placeholder="••••••••"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="tenant" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tenant
            </label>
            <select
              id="tenant"
              value={tenantId}
              onChange={(ev) => setTenantId(ev.target.value)}
              disabled={loadingTenants || tenants.length === 0}
              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/20 disabled:opacity-50"
            >
              <option value="">
                {loadingTenants ? 'Carregando tenants…' : tenants.length === 0 ? 'Nenhum tenant ativo' : 'Selecione…'}
              </option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.id})
                </option>
              ))}
            </select>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300"
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting || loadingTenants}
            className="mt-2 w-full rounded-xl bg-sky-600 py-3 text-sm font-bold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-6 text-center font-mono text-[11px] text-slate-600">UniversoLab © 2026</p>
      </div>
    </div>
  );
}
