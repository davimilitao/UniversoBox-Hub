/**
 * @file AppShell.jsx
 * @description Layout wrapper com sidebar React. Envolve todas as rotas do SPA.
 *              Sidebar filtra itens pelo perfil do usuário (/api/perfis/:role),
 *              mantendo compatibilidade total com o config.html legado.
 * @version 1.0.0
 * @date 2026-04-02
 */

import { useState }                      from 'react';
import { Link, useLocation, Outlet }     from 'react-router-dom';
import { signOut }                       from 'firebase/auth';
import { auth }                          from '../firebase';
import { usePerfil }                     from '../hooks/usePerfil';
import {
  Package, ClipboardList, BarChart2, Zap,
  BookOpen, Settings2, Box, PlusCircle, FileCode,
  Receipt, TrendingUp, LayoutDashboard, ShoppingBag, Upload,
  Home, SlidersHorizontal, ChevronLeft, ChevronRight,
  Menu, X, LogOut, Boxes,
} from 'lucide-react';

// ─── Mapa completo de módulos ──────────────────────────────────────────────────
// moduleId  → ID usado no sistema de perfis (config.html / Firestore)
// react     → true = Link interno; false = <a href> (página HTML legada)
const ROTAS = [
  // ── Expedição ────────────────────────────────────────────────────────────
  { key: 'pedidos',        moduleId: 'pedidos',        label: 'Entregas do Dia',   secao: 'Expedição',  Icon: Package,          react: true,  href: '/expedicao/pedidos'    },
  { key: 'manual',         moduleId: 'manual',         label: 'Expedir Manual',    secao: 'Expedição',  Icon: ClipboardList,    react: false, href: '/manual'               },
  { key: 'ml-dashboard',   moduleId: 'ml-dashboard',   label: 'Dashboard Meli',    secao: 'Expedição',  Icon: BarChart2,        react: false, href: '/ml-dashboard'         },
  { key: 'bling',          moduleId: 'bling',          label: 'Expedir Bling',     secao: 'Expedição',  Icon: Zap,              react: true,  href: '/expedicao/bling'      },
  { key: 'exp-insumos',    moduleId: 'insumos',        label: 'Insumos',           secao: 'Expedição',  Icon: Package,          react: true,  href: '/expedicao/insumos'    },
    
  // ── Catálogo ─────────────────────────────────────────────────────────────
  { key: 'catalogo',       moduleId: 'catalogo',       label: 'Catálogo',          secao: 'Catálogo',   Icon: BookOpen,         react: false, href: '/catalogo'             },
  { key: 'admin',          moduleId: 'admin',          label: 'Admin Produtos',    secao: 'Catálogo',   Icon: Settings2,        react: false, href: '/admin'                },
  { key: 'embalagens',     moduleId: 'embalagens',     label: 'Embalagens',        secao: 'Catálogo',   Icon: Box,              react: false, href: '/embalagens'           },
  { key: 'cadastrar',      moduleId: 'cadastrar',      label: 'Cadastro Rápido',   secao: 'Catálogo',   Icon: PlusCircle,       react: false, href: '/cadastrar'            },
  { key: 'enriquecer-xml', moduleId: 'enriquecer-xml', label: 'Cadastro XML',      secao: 'Catálogo',   Icon: FileCode,         react: false, href: '/enriquecer-xml'       },
  { key: 'cat-automacao', moduleId: 'automacao',    label: 'Cadastro Automático',  secao: 'Catálogo',    Icon: Package,          react: true,  href: '/catalogo/automacao'  },

  // ── Financeiro ───────────────────────────────────────────────────────────
  { key: 'fin-despesas',   moduleId: 'financas',       label: 'Despesas',          secao: 'Financeiro', Icon: Receipt,          react: true,  href: '/financeiro/despesas'  },
  { key: 'fin-margem',     moduleId: 'financas',       label: 'Margem',            secao: 'Financeiro', Icon: TrendingUp,       react: true,  href: '/financeiro/margem'    },
  { key: 'fin-painel',     moduleId: 'financas',       label: 'Painel',            secao: 'Financeiro', Icon: LayoutDashboard,  react: true,  href: '/financeiro/painel'    },
  { key: 'compras',        moduleId: 'compras',        label: 'Compras',           secao: 'Financeiro', Icon: ShoppingBag,      react: false, href: '/compras'              },
  { key: 'importar',       moduleId: 'importar',       label: 'Importar Planilha', secao: 'Financeiro', Icon: Upload,           react: false, href: '/importar'             },
  // ── Sistema ──────────────────────────────────────────────────────────────
  { key: 'index',          moduleId: 'index',          label: 'Painel Principal',  secao: 'Sistema',    Icon: Home,             react: false, href: '/'                     },
  { key: 'config',         moduleId: 'config',         label: 'Configurações',     secao: 'Sistema',    Icon: SlidersHorizontal,react: false, href: '/config'               },
];

const SECOES = ['Expedição', 'Catálogo', 'Financeiro', 'Sistema'];

// ─── NavItem ──────────────────────────────────────────────────────────────────
function NavItem({ rota, ativo, collapsed, onClick }) {
  const cls = [
    'group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium',
    'transition-colors duration-150 cursor-pointer select-none',
    ativo
      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
      : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 border border-transparent',
  ].join(' ');

  const conteudo = (
    <>
      <rota.Icon
        size={17}
        className={`shrink-0 transition-colors ${ativo ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`}
      />
      {!collapsed && <span className="truncate leading-none">{rota.label}</span>}
      {/* Tooltip no modo colapsado */}
      {collapsed && (
        <span className="
          pointer-events-none absolute left-full ml-3 z-[60]
          px-2.5 py-1.5 rounded-lg bg-slate-800 border border-white/10
          text-xs text-slate-200 whitespace-nowrap shadow-2xl
          opacity-0 group-hover:opacity-100 transition-opacity duration-150
        ">
          {rota.label}
        </span>
      )}
    </>
  );

  if (rota.react) {
    return (
      <Link to={rota.href} className={cls} onClick={onClick}>
        {conteudo}
      </Link>
    );
  }
  return (
    <a href={rota.href} className={cls} onClick={onClick}>
      {conteudo}
    </a>
  );
}

// ─── SidebarContent ───────────────────────────────────────────────────────────
function SidebarContent({ perfil, loading, collapsed, setCollapsed, mobile, onClose }) {
  const location = useLocation();

  const rotasVisiveis = ROTAS.filter(r =>
    // Sem perfil carregado → mostra tudo (evita tela vazia)
    !perfil || perfil.modulos.includes(r.moduleId)
  );

  function isAtivo(rota) {
    if (!rota.react) return false;
    return location.pathname === rota.href
      || location.pathname.startsWith(rota.href + '/');
  }

  async function handleLogout() {
    try { await signOut(auth); } catch {}
    localStorage.removeItem('expedicao_user');
    localStorage.removeItem('expedicao_token');
    window.location.href = '/login';
  }

  return (
    <aside className={[
      'flex flex-col bg-slate-900 border-r border-white/5 h-full',
      'transition-[width] duration-200 ease-in-out',
      collapsed ? 'w-16' : 'w-60',
    ].join(' ')}>

      {/* ── Logo ────────────────────────────────────────────────────────── */}
      <div className={`flex items-center h-14 px-3 border-b border-white/5 shrink-0 gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
          <Boxes size={15} className="text-white" />
        </div>
        {!collapsed && (
          <span className="text-sm font-bold text-slate-100 tracking-tight truncate">
            UniversoBox
          </span>
        )}
        {/* Botão fechar no mobile */}
        {mobile && (
          <button
            onClick={onClose}
            className="ml-auto text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* ── Navegação ───────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-4">
        {loading && (
          <div className="space-y-1.5 px-1">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-9 rounded-lg bg-slate-800 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && SECOES.map(secao => {
          const itens = rotasVisiveis.filter(r => r.secao === secao);
          if (!itens.length) return null;
          return (
            <div key={secao}>
              {!collapsed
                ? <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-3 mb-1.5">{secao}</p>
                : <div className="h-px bg-white/5 mx-2 mb-1" />
              }
              <div className="space-y-0.5">
                {itens.map(rota => (
                  <NavItem
                    key={rota.key}
                    rota={rota}
                    ativo={isAtivo(rota)}
                    collapsed={collapsed}
                    onClick={mobile ? onClose : undefined}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* ── Footer: usuário + collapse ───────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/5">

        {/* Info do usuário */}
        {perfil && (
          <div className={`flex items-center gap-2.5 px-3 py-3 ${collapsed ? 'justify-center' : ''}`}>
            {/* Avatar */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
              style={{ background: perfil.cor || '#10b981' }}
              title={perfil.nome}
            >
              {(perfil.avatar || perfil.nome?.slice(0, 2) || '??').toUpperCase()}
            </div>

            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-300 truncate leading-none">{perfil.nome}</p>
                  <p className="text-[10px] text-slate-600 capitalize mt-0.5">{perfil.role}</p>
                </div>
                <button
                  onClick={handleLogout}
                  title="Sair"
                  className="text-slate-600 hover:text-red-400 transition-colors shrink-0"
                >
                  <LogOut size={14} />
                </button>
              </>
            )}
          </div>
        )}

        {/* Botão collapse (só desktop) */}
        {!mobile && (
          <button
            onClick={() => setCollapsed(c => !c)}
            className="w-full flex items-center justify-center py-2.5 border-t border-white/5 text-slate-600 hover:text-slate-400 hover:bg-white/[0.02] transition-colors"
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        )}
      </div>
    </aside>
  );
}

// ─── AppShell (exportado) ─────────────────────────────────────────────────────
export function AppShell() {
  const { perfil, loading } = usePerfil();

  const [collapsed,   setCollapsed]   = useState(() => {
    try { return localStorage.getItem('erp_sidebar_collapsed') === 'true'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('erp_sidebar_collapsed', String(next)); } catch {}
      return next;
    });
  }

  const sidebarProps = { perfil, loading };

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">

      {/* ── Sidebar desktop ──────────────────────────────────────────────── */}
      <div className="hidden lg:flex shrink-0">
        <SidebarContent
          {...sidebarProps}
          collapsed={collapsed}
          setCollapsed={toggleCollapsed}
          mobile={false}
        />
      </div>

      {/* ── Drawer mobile ────────────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className={`
        fixed inset-y-0 left-0 z-50 lg:hidden flex
        transition-transform duration-200 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <SidebarContent
          {...sidebarProps}
          collapsed={false}
          setCollapsed={() => {}}
          mobile={true}
          onClose={() => setMobileOpen(false)}
        />
      </div>

      {/* ── Conteúdo principal ───────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Topbar mobile */}
        <header className="lg:hidden flex items-center gap-3 h-14 px-4 bg-slate-900 border-b border-white/5 shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="w-6 h-6 rounded-md bg-emerald-600 flex items-center justify-center">
            <Boxes size={13} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-200">UniversoBox</span>
        </header>

        {/* Páginas React via Outlet */}
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
