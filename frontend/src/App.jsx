/**
 * @file App.jsx
 * @module app
 * @description Rotas principais: login (Modelo B) e dashboard pós-provisionamento.
 * @version 1.1.0
 * @date 2026-04-01
 * @author UniversoLab
 *
 * @changelog
 *   1.2.0 — 2026-04-01 — Adiciona rota /financeiro/despesas (GestaoDespesas).
 *   1.1.0 — 2026-04-01 — Adiciona rota /financeiro/painel (PainelFinanceiro).
 *   1.0.0 — 2026-03-31 — Rotas /login e /dashboard/:tenantId.
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage }        from './pages/LoginPage';
import { DashboardPage }    from './pages/DashboardPage';
import { PainelFinanceiro } from './pages/financeiro/PainelFinanceiro';
import { GestaoDespesas }   from './pages/financeiro/GestaoDespesas';
import { GestaoMargem }    from './pages/financeiro/GestaoMargem';

export default function App() {
  return (
    <Routes>
      <Route path="/login"                  element={<LoginPage />} />
      <Route path="/dashboard/:tenantId"    element={<DashboardPage />} />
      <Route path="/financeiro/painel"      element={<PainelFinanceiro />} />
      <Route path="/financeiro/despesas"    element={<GestaoDespesas />} />
      <Route path="/financeiro/margem"      element={<GestaoMargem />} />
      <Route path="*"                       element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
