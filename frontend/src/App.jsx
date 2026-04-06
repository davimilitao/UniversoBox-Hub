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
import { PainelFinanceiro } from './pages/financeiro/PainelFinanceiro';
import { GestaoDespesas }   from './pages/financeiro/GestaoDespesas';
import { GestaoMargem }     from './pages/financeiro/GestaoMargem';
import { BlingPedidos }     from './pages/expedicao/BlingPedidos';
import { AppShell }         from './components/AppShell';
import GestaoInsumos           from './pages/expedicao/GestaoInsumos';
import PedidosDoDia            from './pages/expedicao/PedidosDoDia';
import AutomacaoCadastro       from './pages/catalogo/AutomacaoCadastro';
import CatalogoPro             from './pages/catalogo/CatalogoPro';
import AdminProdutos           from './pages/catalogo/AdminProdutos';
import ImportarCSV             from './pages/catalogo/ImportarCSV';
import ConfiguracoesSistema    from './pages/sistema/ConfiguracoesSistema';

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
        <Route path="/expedicao/insumos"   element={<GestaoInsumos />} />
        {/* Catálogo */}
        <Route path="/catalogo/produtos"   element={<CatalogoPro />} />
        <Route path="/catalogo/admin"      element={<AdminProdutos />} />
        <Route path="/catalogo/importar"   element={<ImportarCSV />} />
        <Route path="/catalogo/automacao"  element={<AutomacaoCadastro />} />
        {/* Financeiro */}
        <Route path="/financeiro/despesas" element={<GestaoDespesas />} />
        <Route path="/financeiro/margem"   element={<GestaoMargem />} />
        <Route path="/financeiro/painel"   element={<PainelFinanceiro />} />
        {/* Sistema */}
        <Route path="/sistema/config"      element={<ConfiguracoesSistema />} />
      </Route>

      {/* Qualquer rota desconhecida → painel principal */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
