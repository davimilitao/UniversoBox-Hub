/**
 * @file App.jsx
 * @description Rotas principais. Rotas dentro do AppShell têm sidebar React.
 * @version 2.1.0
 * @date 2026-04-02
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage }        from './pages/LoginPage';
import { DashboardPage }    from './pages/DashboardPage';
import { PainelFinanceiro } from './pages/financeiro/PainelFinanceiro';
import { GestaoDespesas }   from './pages/financeiro/GestaoDespesas';
import { GestaoMargem }     from './pages/financeiro/GestaoMargem';
import { BlingPedidos }     from './pages/expedicao/BlingPedidos';
import { AppShell }         from './components/AppShell';

export default function App() {
  return (
    <Routes>
      {/* Páginas sem shell */}
      <Route path="/login"               element={<LoginPage />} />
      <Route path="/dashboard/:tenantId" element={<DashboardPage />} />

      {/* Páginas com sidebar React */}
      <Route element={<AppShell />}>
        {/* Expedição */}
        <Route path="/expedicao/bling"     element={<BlingPedidos />} />

        {/* Financeiro */}
        <Route path="/financeiro/despesas" element={<GestaoDespesas />} />
        <Route path="/financeiro/margem"   element={<GestaoMargem />} />
        <Route path="/financeiro/painel"   element={<PainelFinanceiro />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
