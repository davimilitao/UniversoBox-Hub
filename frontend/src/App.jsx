/**
 * @file App.jsx
 * @description Rotas principais. Rotas dentro do AppShell têm sidebar React.
 *   A rota raiz "/" é o DashboardPage — painel operacional do dia.
 * @version 2.4.0
 * @date 2026-04-21
 * @changelog
 *   2.4.0 — 2026-04-21 — SaudeFinanceira como nova home do módulo financeiro.
 *   2.3.0 — 2026-04-12 — Fusão Contas + GestaoDespesas → GestaoFinanceira; /contas redireciona.
 *   2.2.0 — 2026-04-05 — Versão anterior.
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage }          from './pages/LoginPage';
import { DashboardPage }      from './pages/DashboardPage';
import { PainelFinanceiro }   from './pages/financeiro/PainelFinanceiro';
import { GestaoFinanceira }   from './pages/financeiro/GestaoFinanceira';
import { GestaoMargem }       from './pages/financeiro/GestaoMargem';
import { PainelDRE }          from './pages/financeiro/PainelDRE';
import { PosicaoFinanceira }  from './pages/financeiro/PosicaoFinanceira';
import { SaudeFinanceira }    from './pages/financeiro/SaudeFinanceira';
import { BlingPedidos }       from './pages/expedicao/BlingPedidos';
import { AppShell }           from './components/AppShell';
import GestaoInsumos          from './pages/expedicao/GestaoInsumos';
import PedidosDoDia           from './pages/expedicao/PedidosDoDia';
import AutomacaoCadastro      from './pages/catalogo/AutomacaoCadastro';
import CatalogoPro            from './pages/catalogo/CatalogoPro';
import AdminProdutos          from './pages/catalogo/AdminProdutos';
import ImportarCSV            from './pages/catalogo/ImportarCSV';
import ImageStudio            from './pages/catalogo/ImageStudio';
import ConfiguracoesSistema   from './pages/sistema/ConfiguracoesSistema';
import Compras                from './pages/expedicao/Compras';

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
        <Route path="/expedicao/compras"   element={<Compras />} />
        {/* Catálogo */}
        <Route path="/catalogo/produtos"   element={<CatalogoPro />} />
        <Route path="/catalogo/admin"      element={<AdminProdutos />} />
        <Route path="/catalogo/importar"   element={<ImportarCSV />} />
        <Route path="/catalogo/automacao"  element={<AutomacaoCadastro />} />
        <Route path="/catalogo/fotos"      element={<ImageStudio />} />
        {/* Financeiro */}
        <Route path="/financeiro"          element={<Navigate to="/financeiro/saude" replace />} />
        <Route path="/financeiro/saude"    element={<SaudeFinanceira />} />
        <Route path="/financeiro/despesas" element={<GestaoFinanceira />} />
        <Route path="/financeiro/contas"   element={<Navigate to="/financeiro/despesas" replace />} />
        <Route path="/financeiro/margem"   element={<GestaoMargem />} />
        <Route path="/financeiro/painel"   element={<PainelFinanceiro />} />
        <Route path="/financeiro/dre"      element={<PainelDRE />} />
        <Route path="/financeiro/posicao"  element={<PosicaoFinanceira />} />
        {/* Sistema */}
        <Route path="/sistema/config"      element={<ConfiguracoesSistema />} />
      </Route>

      {/* Qualquer rota desconhecida → painel principal */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
