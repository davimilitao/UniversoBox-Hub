/**
 * @file AppShell.jsx
 * @description Layout principal — sidebar React + ThemeBackground por tema.
 *   • Todas as telas migradas para React (100% SPA)
 *   • Sistema de temas via CSS custom properties (data-theme no <html>)
 *   • ThemeBackground: animações por tema (portal Rick, sparkles Marvel, etc.)
 * @version 2.1.0
 * @date 2026-04-10
 */

import { useState, useEffect }           from 'react';
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
  FlaskConical, Search, LayoutGrid, FileUp, Truck, Camera, Wallet,
} from 'lucide-react';

// ─── Mapa de módulos ──────────────────────────────────────────────────────────
// Todas as telas estão migradas para React (100% SPA desde Abril/2026)
const ROTAS = [
  // Expedição
  { key: 'pedidos',        moduleId: 'pedidos',        label: 'Entregas do Dia',   secao: 'Expedição',  Icon: Package,           react: true,  href: '/expedicao/pedidos'    },
  { key: 'bling',          moduleId: 'bling',          label: 'Expedir Bling',     secao: 'Expedição',  Icon: Zap,               react: true,  href: '/expedicao/bling'      },
  { key: 'exp-insumos',    moduleId: 'insumos',        label: 'Gestão Insumos',    secao: 'Expedição',  Icon: FlaskConical,      react: true,  href: '/expedicao/insumos'    },
  { key: 'compras',        moduleId: 'compras',        label: 'Compras',           secao: 'Expedição',  Icon: ShoppingBag,       react: true,  href: '/expedicao/compras'    },
  // Catálogo
  { key: 'catalogo-pro',   moduleId: 'catalogo',       label: 'Catálogo Pro',      secao: 'Catálogo',   Icon: LayoutGrid,        react: true,  href: '/catalogo/produtos'    },
  { key: 'busca-produto',  moduleId: 'catalogo',       label: 'Busca SKU / EAN',   secao: 'Catálogo',   Icon: Search,            react: true,  href: '/catalogo/automacao'   },
  { key: 'admin',          moduleId: 'admin',          label: 'Admin Produtos',    secao: 'Catálogo',   Icon: Settings2,         react: true,  href: '/catalogo/admin'       },
  { key: 'importar',       moduleId: 'importar',       label: 'Importar CSV',      secao: 'Catálogo',   Icon: FileUp,            react: true,  href: '/catalogo/importar'    },
  { key: 'image-studio',   moduleId: 'catalogo',       label: 'Image Studio',      secao: 'Catálogo',   Icon: Camera,            react: true,  href: '/catalogo/fotos'       },
  // Financeiro
  { key: 'fin-despesas',   moduleId: 'financas',       label: 'Despesas & Contas', secao: 'Financeiro', Icon: Receipt,           react: true,  href: '/financeiro/despesas'  },
  { key: 'fin-margem',     moduleId: 'financas',       label: 'Margem',            secao: 'Financeiro', Icon: TrendingUp,        react: true,  href: '/financeiro/margem'    },
  { key: 'fin-dre',        moduleId: 'financas',       label: 'DRE',               secao: 'Financeiro', Icon: BarChart2,         react: true,  href: '/financeiro/dre'       },
  { key: 'fin-painel',     moduleId: 'financas',       label: 'Painel',            secao: 'Financeiro', Icon: LayoutDashboard,   react: true,  href: '/financeiro/painel'    },
  // Sistema
  { key: 'index',          moduleId: 'index',          label: 'Painel Principal',  secao: 'Sistema',    Icon: Home,              react: true,  href: '/'                         },
  { key: 'config',         moduleId: 'config',         label: 'Configurações',     secao: 'Sistema',    Icon: SlidersHorizontal, react: true,  href: '/sistema/config'       },
];

const SECOES = ['Expedição', 'Catálogo', 'Financeiro', 'Sistema'];

// ─── THEME BACKGROUND ─────────────────────────────────────────────────────────

function MarvelSparkles() {
  const sparks = [
    { top: '8%',  left: '18%', s: 3, d: '0s',    dur: '3.2s', gold: false },
    { top: '22%', left: '78%', s: 2, d: '0.8s',  dur: '2.8s', gold: true  },
    { top: '45%', left: '88%', s: 4, d: '1.5s',  dur: '4.1s', gold: false },
    { top: '65%', left: '12%', s: 2, d: '0.3s',  dur: '3.6s', gold: true  },
    { top: '78%', left: '55%', s: 3, d: '2.1s',  dur: '2.5s', gold: false },
    { top: '35%', left: '42%', s: 2, d: '1.1s',  dur: '3.9s', gold: true  },
    { top: '12%', left: '62%', s: 3, d: '0.5s',  dur: '4.4s', gold: false },
    { top: '90%', left: '30%', s: 4, d: '1.7s',  dur: '3.0s', gold: true  },
    { top: '55%', left: '70%', s: 2, d: '2.4s',  dur: '2.7s', gold: false },
    { top: '30%', left: '5%',  s: 3, d: '0.9s',  dur: '3.4s', gold: true  },
  ];
  return (
    <>
      {sparks.map((s, i) => (
        <div key={i}
          className="absolute rounded-sm animate-marvel-spark"
          style={{
            top: s.top, left: s.left,
            width: s.s + 'px', height: s.s + 'px',
            background: s.gold ? '#F0A500' : '#ED1D24',
            boxShadow: `0 0 ${s.s * 3}px ${s.s}px ${s.gold ? 'rgba(240,165,0,0.6)' : 'rgba(237,29,36,0.5)'}`,
            animationDelay: s.d,
            animationDuration: s.dur,
          }}
        />
      ))}
    </>
  );
}

function ThemeBackground({ tema }) {
  if (!tema || tema === 'dark') return null;

  /* ── UBER ── pure black, scan line ───────────────────────────── */
  if (tema === 'uber') {
    return (
      <div className="fixed inset-0 z-[8] pointer-events-none overflow-hidden">
        {/* Subtle scan line */}
        <div
          className="absolute left-0 right-0 h-[1px] animate-uber-scan"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)' }}
        />
        {/* Grid dots */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>
    );
  }

  /* ── IFOOD ── warm red glows ──────────────────────────────────── */
  if (tema === 'ifood') {
    return (
      <div className="fixed inset-0 z-[8] pointer-events-none overflow-hidden">
        <div
          className="absolute animate-ifood-glow"
          style={{
            bottom: '-10%', right: '-5%',
            width: '55vw', height: '55vw',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(234,29,44,0.10) 0%, rgba(234,29,44,0.04) 40%, transparent 70%)',
          }}
        />
        <div
          className="absolute animate-ifood-glow"
          style={{
            top: '-15%', left: '-10%',
            width: '40vw', height: '40vw',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(234,29,44,0.06) 0%, transparent 65%)',
            animationDelay: '2s',
          }}
        />
        {/* Subtle warm vignette */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at 80% 110%, rgba(234,29,44,0.06) 0%, transparent 55%)' }}
        />
      </div>
    );
  }

  /* ── 99 ── diagonal yellow taxi stripes ───────────────────────── */
  if (tema === '99') {
    return (
      <div className="fixed inset-0 z-[8] pointer-events-none overflow-hidden">
        {/* Animated diagonal stripes */}
        <div
          className="absolute inset-0 animate-taxi-drift"
          style={{
            opacity: 0.04,
            backgroundImage: 'repeating-linear-gradient(45deg, #FFD100 0px, #FFD100 1px, transparent 1px, transparent 28px)',
          }}
        />
        {/* Yellow glow bottom-left (headlight) */}
        <div
          className="absolute"
          style={{
            bottom: '-5%', left: '-5%',
            width: '45vw', height: '45vw',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,209,0,0.07) 0%, transparent 65%)',
          }}
        />
        {/* Subtle horizon line */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{ height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(255,209,0,0.12) 50%, transparent 100%)' }}
        />
      </div>
    );
  }

  /* ── MARVEL ── red/gold epic atmosphere ───────────────────────── */
  if (tema === 'marvel') {
    return (
      <div className="fixed inset-0 z-[8] pointer-events-none overflow-hidden">
        {/* Red glow top-left */}
        <div
          className="absolute"
          style={{
            top: '-20%', left: '-10%',
            width: '60vw', height: '60vw',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(237,29,36,0.08) 0%, transparent 60%)',
          }}
        />
        {/* Gold glow bottom-right */}
        <div
          className="absolute"
          style={{
            bottom: '-15%', right: '-10%',
            width: '50vw', height: '50vw',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(240,165,0,0.07) 0%, transparent 60%)',
          }}
        />
        {/* Subtle comic halftone dots */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(237,29,36,0.8) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        {/* Sparkles */}
        <MarvelSparkles />
      </div>
    );
  }

  /* ── RICK & MORTY ── portal interestelar ──────────────────────── */
  if (tema === 'rick') {
    return (
      <div className="fixed inset-0 z-[8] pointer-events-none overflow-hidden">
        {/* Main portal glow */}
        <div
          className="absolute animate-rick-portal"
          style={{
            top: '-25%', right: '-15%',
            width: '65vw', height: '65vw',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(111,208,140,0.12) 0%, rgba(0,180,216,0.06) 35%, transparent 62%)',
          }}
        />
        {/* Portal ring spinning */}
        <div
          className="absolute animate-rick-spin"
          style={{
            top: '-28%', right: '-18%',
            width: '68vw', height: '68vw',
            borderRadius: '50%',
            border: '1px solid rgba(111,208,140,0.06)',
            boxShadow: '0 0 60px rgba(111,208,140,0.04)',
          }}
        />
        {/* Secondary cyan portal far left */}
        <div
          className="absolute animate-rick-portal"
          style={{
            bottom: '-30%', left: '-20%',
            width: '50vw', height: '50vw',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,180,216,0.06) 0%, transparent 55%)',
            animationDelay: '2.5s',
          }}
        />
        {/* Star field dots */}
        <div
          className="absolute inset-0 opacity-[0.3]"
          style={{
            backgroundImage: [
              'radial-gradient(circle, rgba(111,208,140,0.8) 1px, transparent 1px)',
              'radial-gradient(circle, rgba(0,180,216,0.6) 1px, transparent 1px)',
            ].join(', '),
            backgroundSize: '80px 80px, 120px 120px',
            backgroundPosition: '0 0, 40px 40px',
          }}
        />
      </div>
    );
  }

  return null;
}

// ─── NavItem ──────────────────────────────────────────────────────────────────
function NavItem({ rota, ativo, collapsed, onClick }) {

  // ── NORMAL ────────────────────────────────────────────────────────────────
  const cls = [
    'group relative flex items-center gap-2.5 rounded-md text-[13px] font-medium select-none cursor-pointer',
    'transition-colors duration-100',
    collapsed ? 'px-2 py-2 justify-center' : 'px-2.5 py-1.5',
    ativo
      ? 'bg-white/[0.07] text-slate-100'
      : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300',
  ].join(' ');

  const conteudo = (
    <>
      {/* Indicator bar — usa var(--accent) */}
      {ativo && !collapsed && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r"
          style={{ background: 'var(--accent, #10b981)' }}
        />
      )}
      <rota.Icon
        size={15}
        className="shrink-0 transition-colors"
        style={ativo ? { color: 'var(--accent-text, #34d399)' } : undefined}
      />
      {!collapsed && <span className="truncate leading-none">{rota.label}</span>}

      {/* Tooltip colapsado */}
      {collapsed && (
        <span className="pointer-events-none absolute left-full ml-2.5 z-[60] px-2.5 py-1.5 rounded-lg bg-slate-800 border border-white/[0.08] text-xs font-medium text-slate-200 whitespace-nowrap shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-150">
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
    !perfil || perfil.modulos.includes(r.moduleId)
  );

  function isAtivo(rota) {
    // Todas as rotas estão em React, sem rotas locked
    return location.pathname === rota.href || location.pathname.startsWith(rota.href + '/');
  }

  async function handleLogout() {
    try { await signOut(auth); } catch {}
    localStorage.removeItem('expedicao_user');
    localStorage.removeItem('expedicao_token');
    // Reset theme
    document.documentElement.removeAttribute('data-theme');
    window.location.href = '/spa/login';
  }

  return (
    <aside
      className={[
        'flex flex-col h-full border-r transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-[52px]' : 'w-[220px]',
      ].join(' ')}
      style={{ background: 'var(--bg-sidebar, #020617)', borderColor: 'var(--border, rgba(255,255,255,0.05))' }}
    >

      {/* ── Logo ── */}
      <div className={`flex items-center h-12 shrink-0 gap-2 ${collapsed ? 'justify-center px-2' : 'px-3'}`}>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-lg"
          style={{ background: 'var(--accent, #10b981)', boxShadow: '0 4px 12px var(--accent-glow, rgba(16,185,129,0.3))' }}
        >
          <Boxes size={14} className="text-white" />
        </div>
        {!collapsed && (
          <span className="text-[13px] font-semibold text-slate-200 tracking-tight truncate">
            UniversoBox
          </span>
        )}
        {mobile && (
          <button onClick={onClose} className="ml-auto p-1 rounded text-slate-600 hover:text-slate-300 transition-colors">
            <X size={16} />
          </button>
        )}
      </div>

      {/* ── Navegação ── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-1.5 space-y-5">
        {loading && (
          <div className="space-y-1 px-1">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-7 rounded-md bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        )}

        {!loading && SECOES.map(secao => {
          const itens = rotasVisiveis.filter(r => r.secao === secao);
          if (!itens.length) return null;
          return (
            <div key={secao}>
              {!collapsed
                ? <p className="text-[9px] font-bold text-slate-700 uppercase tracking-[0.12em] px-2.5 mb-1">{secao}</p>
                : <div className="h-px mx-1 mb-2" style={{ background: 'var(--border, rgba(255,255,255,0.05))' }} />
              }
              <div className="space-y-px">
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

      {/* ── Footer ── */}
      <div className="shrink-0 border-t mt-auto" style={{ borderColor: 'var(--border, rgba(255,255,255,0.05))' }}>
        {perfil && (
          <div className={`flex items-center gap-2 p-2 ${collapsed ? 'justify-center' : ''}`}>
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ring-1 ring-white/10"
              style={{ background: perfil.cor || 'var(--accent, #10b981)' }}
              title={perfil.nome}
            >
              {(perfil.avatar || perfil.nome?.slice(0, 2) || '??').toUpperCase()}
            </div>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-slate-400 truncate leading-none">{perfil.nome}</p>
                  <p className="text-[9px] text-slate-600 capitalize mt-0.5">{perfil.role}</p>
                </div>
                <button
                  onClick={handleLogout}
                  title="Sair"
                  className="p-1 rounded text-slate-700 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                >
                  <LogOut size={12} />
                </button>
              </>
            )}
          </div>
        )}

        {!mobile && (
          <button
            onClick={() => setCollapsed(c => !c)}
            className="w-full flex items-center py-2 text-slate-700 hover:text-slate-400 transition-colors border-t"
            style={{ borderColor: 'var(--border, rgba(255,255,255,0.05))', justifyContent: collapsed ? 'center' : 'flex-end', paddingRight: collapsed ? undefined : '0.75rem', gap: collapsed ? undefined : '0.25rem' }}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {!collapsed && <span className="text-[10px]">Recolher</span>}
            {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>
        )}
      </div>
    </aside>
  );
}

// ─── AppShell ─────────────────────────────────────────────────────────────────
export function AppShell() {
  const { perfil, loading } = usePerfil();

  const [collapsed,   setCollapsed]   = useState(() => {
    try { return localStorage.getItem('erp_sidebar_collapsed') === 'true'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  // ── Aplicar tema quando perfil carrega ──────────────────────────────────
  useEffect(() => {
    const tema = perfil?.tema || 'dark';
    document.documentElement.setAttribute('data-theme', tema);
  }, [perfil?.tema]);

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('erp_sidebar_collapsed', String(next)); } catch {}
      return next;
    });
  }

  const sidebarProps = { perfil, loading };

  return (
    <div
      className="flex h-screen overflow-hidden relative"
      style={{ background: 'var(--bg-app, #020617)' }}
    >
      {/* Theme decorative background (z-0, pointer-events-none) */}
      <ThemeBackground tema={perfil?.tema} />

      {/* Sidebar desktop (z-10) */}
      <div className="hidden lg:flex shrink-0 relative z-10">
        <SidebarContent
          {...sidebarProps}
          collapsed={collapsed}
          setCollapsed={toggleCollapsed}
          mobile={false}
        />
      </div>

      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[2px] lg:hidden animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Drawer mobile */}
      <div className={`fixed inset-y-0 left-0 z-50 lg:hidden flex transition-transform duration-200 ease-in-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent
          {...sidebarProps}
          collapsed={false}
          setCollapsed={() => {}}
          mobile={true}
          onClose={() => setMobileOpen(false)}
        />
      </div>

      {/* Conteúdo principal (z-10) */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative z-10">
        {/* Topbar mobile */}
        <header className="lg:hidden flex items-center gap-2.5 h-11 px-3 border-b shrink-0" style={{ background: 'var(--bg-sidebar, #020617)', borderColor: 'var(--border, rgba(255,255,255,0.05))' }}>
          <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] transition-colors">
            <Menu size={18} />
          </button>
          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'var(--accent, #10b981)' }}>
            <Boxes size={11} className="text-white" />
          </div>
          <span className="text-[13px] font-semibold text-slate-300">UniversoBox</span>
        </header>

        <main className="flex-1 min-h-0 flex flex-col overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
