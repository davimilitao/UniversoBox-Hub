/**
 * @file DashboardPage.jsx
 * @module app
 * @description Destino pós-login com tenant na URL; placeholder até o dashboard React completo.
 * @version 1.0.0
 * @date 2026-03-31
 * @author UniversoLab
 *
 * @changelog
 *   1.0.0 — 2026-03-31 — Página mínima após provisionamento.
 */

import { Link, useParams } from 'react-router-dom';

export function DashboardPage() {
  const { tenantId } = useParams();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="font-mono text-xl font-bold text-emerald-400">Tenant ativo</h1>
        <p className="mt-2 text-sm text-slate-400">
          <span className="font-semibold text-slate-200">{tenantId}</span>
        </p>
      </div>
      <p className="max-w-md text-center text-sm text-slate-500">
        Claims provisionados. Use as rotas da API com o Bearer do Firebase (token renovado).
      </p>
      <Link
        to="/login"
        className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
      >
        Voltar ao login
      </Link>
    </div>
  );
}
