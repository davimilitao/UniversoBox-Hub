/**
 * @file App.jsx
 * @description Rotas principais. Rotas dentro do AppShell têm sidebar React.
 *   A rota raiz "/" é o DashboardPage — painel operacional do dia.
 * @version 2.2.0
 * @date 2026-04-05
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage }        from './pages/LoginPage';
import { DashboardPage }    from './pages/DashboardPage';
import { BlingPedidos }     from './pages/expedicao/BlingPedidos';
import { AppShell }         from './components/AppShell';
import PedidosDoDia            from './pages/expedicao/PedidosDoDia';
import ConfiguracoesSistema    from './pages/sistema/ConfiguracoesSistema';
import Contas                  from './pages/financeiro/Contas';

export default function App() {
  return (
    <Routes>
      {/* Páginas sem shell */}
      <Route path="/login" element={<LoginPage />} />
      {/* Legado: /dashboard/:tenantId → redireciona para painel principal */}
      <Route path="/dashboard/:tenantId" element={<Navigate to="/" replace />} />

      {/* Páginas com sidebar React */}
      <Route element={<AppShell />}>
        {/* Painel operacional — rota raiz */}
        <Route index element={<DashboardPage />} />
        {/* Expedição */}
        <Route path="/expedicao/bling"     element={<BlingPedidos />} />
        <Route path="/expedicao/pedidos"   element={<PedidosDoDia />} />
        {/* Financeiro */}
        <Route path="/financeiro/despesas"    element={<Contas />} />
        {/* Sistema */}
        <Route path="/sistema/config"      element={<ConfiguracoesSistema />} />
      </Route>

      {/* Qualquer rota desconhecida → painel principal */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
