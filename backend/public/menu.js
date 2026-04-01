// menu.js — UniversoBox Hub v4.0
// Mobile-first | Lucide SVG icons | Safe area iOS | Swipe-to-open
'use strict';

(function () {

  // ══════════════════════════════════════════════════════
  // ÍCONES LUCIDE — stroke, rounded, 16x16
  // Para trocar: lucide.dev → copie o path
  // ══════════════════════════════════════════════════════
  const IC = {
    pedidos:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    manual:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    bling:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    mldashboard:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
    catalogo:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    admin:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
    embalagens:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
    cadastrar:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
    xml:          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>`,
    financas:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    compras:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
    importar:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    painel:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
    config:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 1 0 4.93 19.07M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`,
    themeDark:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
    themeLight:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
    themeHC:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>`,
    themeML:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    menu:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  };

  // ══════════════════════════════════════════════════════
  // MÓDULOS — nomes que dizem o que fazem
  // ══════════════════════════════════════════════════════
  const ALL_MODULES = [
    { id: 'pedidos',        label: 'Entregas do Dia',      icon: IC.pedidos,     href: '/pedidos',        section: 'Expedição',  roles: ['operacao','admin'] },
    { id: 'manual',         label: 'Expedir Manualmente',  icon: IC.manual,      href: '/manual',         section: 'Expedição',  roles: ['operacao','admin'] },
    { id: 'ml-dashboard',   label: 'Dashboard Meli',       icon: IC.mldashboard, href: '/ml-dashboard',   section: 'Expedição',  roles: ['operacao','admin'] },
    { id: 'bling',          label: 'Expedir pelo Bling',   icon: IC.bling,       href: '/bling',          section: 'Expedição',  roles: ['operacao','admin'] },
    { id: 'catalogo',       label: 'Produtos do Catálogo', icon: IC.catalogo,    href: '/catalogo',       section: 'Catálogo',   roles: ['catalogo','vendas','admin'] },
    { id: 'admin',          label: 'Admin de Produtos',    icon: IC.admin,       href: '/admin',          section: 'Catálogo',   roles: ['catalogo','admin'] },
    { id: 'embalagens',     label: 'Embalagens',           icon: IC.embalagens,  href: '/embalagens',     section: 'Catálogo',   roles: ['catalogo','operacao','admin'] },
    { id: 'cadastrar',      label: 'Cadastro Rápido',      icon: IC.cadastrar,   href: '/cadastrar',      section: 'Catálogo',   roles: ['catalogo','admin'] },
    { id: 'enriquecer-xml', label: 'Cadastro por XML',     icon: IC.xml,         href: '/enriquecer-xml', section: 'Catálogo',   roles: ['catalogo','admin'] },
    { id: 'financas',       label: 'Lançar Despesas',      icon: IC.financas,    href: '/financas',       section: 'Financeiro', roles: ['financeiro','admin'] },
    { id: 'compras',        label: 'Registrar Compras',    icon: IC.compras,     href: '/compras',        section: 'Financeiro', roles: ['catalogo','financeiro','admin'] },
    { id: 'importar',       label: 'Importar Planilha',    icon: IC.importar,    href: '/importar',       section: 'Financeiro', roles: ['admin'] },
    { id: 'index',          label: 'Painel',               icon: IC.painel,      href: '/',               section: 'Sistema',    roles: ['operacao','financeiro','catalogo','vendas','admin'] },
    { id: 'config',         label: 'Configurações',        icon: IC.config,      href: '/config',         section: 'Sistema',    roles: ['admin'] },
    { id: 'produto-studio', label: 'Produto Studio',       icon: IC.produtoStudio, href: '/produto-studio', section: 'Sistema',    roles: ['admin'] },
  ];
  const THEMES = {
    dark:  { label: 'Dark Navy',       icon: IC.themeDark  },
    light: { label: 'Mercado Livre',   icon: IC.themeLight },
    hc:    { label: 'Alto Contraste',  icon: IC.themeHC    },
    ml:    { label: 'Universo Cosmos', icon: IC.themeML    },
  };

  const DEFAULT_PROFILES = {
    admin:      { label: 'Super Admin', name: 'Davi',    avatar: 'DA', tema: 'dark'  },
    operacao:   { label: 'Operação',    name: 'Sueli',   avatar: 'SU', tema: 'dark'  },
    financeiro: { label: 'Financeiro',  name: 'Jéssica', avatar: 'JE', tema: 'dark'  },
    catalogo:   { label: 'Catálogo',    name: 'Daniel',  avatar: 'DN', tema: 'dark'  },
    vendas:     { label: 'Vendas',      name: 'Vendas',  avatar: 'VE', tema: 'light' },
  };

  const SK_COLLAPSED = 'erp_sidebar_collapsed';
  const SK_ASSUMED   = 'erp_assumed_profile';
  const SK_THEME     = 'erp_theme';

  function getRealRole() {
    try { return JSON.parse(localStorage.getItem('expedicao_user') || '{}').role || 'admin'; }
    catch { return 'admin'; }
  }
  function getRole() { return sessionStorage.getItem(SK_ASSUMED) || getRealRole(); }
  function getCurrentPage() {
    const p = window.location.pathname;
    if (p === '/' || p === '/index.html') return 'index';
    return p.replace(/^\//, '').replace(/\.html$/, '');
  }

  function applyTheme(theme) {
    const t = Object.keys(THEMES).includes(theme) ? theme : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(SK_THEME, t);
  }
  function loadTheme() {
    const saved = localStorage.getItem(SK_THEME);
    if (saved) { applyTheme(saved); return; }
    applyTheme((DEFAULT_PROFILES[getRole()] || DEFAULT_PROFILES.admin).tema || 'dark');
  }

  function getVisibleModules(role, customModules) {
    if (customModules?.length) return ALL_MODULES.filter(m => customModules.includes(m.id));
    return ALL_MODULES.filter(m => m.roles.includes(role));
  }

  // ══════════════════════════════════════════════════════
  // CSS INJETADO — tudo mobile-first num só lugar
  // ══════════════════════════════════════════════════════
  function injectStyles() {
    if (document.getElementById('erp-menu-styles')) return;
    const s = document.createElement('style');
    s.id = 'erp-menu-styles';
    s.textContent = `
      .nav-item-icon{display:flex;align-items:center;justify-content:center;width:20px;height:20px;flex-shrink:0}
      .nav-item-icon svg{width:16px;height:16px;flex-shrink:0}

      .sidebar-logo-full{display:block;height:34px;width:auto;object-fit:contain;opacity:.92}
      .sidebar-logo-icon{display:none;height:28px;width:28px;object-fit:contain;opacity:.92}
      .erp-sidebar.collapsed .sidebar-logo-full{display:none!important}
      .erp-sidebar.collapsed .sidebar-logo-icon{display:block!important}
      .erp-sidebar.collapsed .sidebar-brand{justify-content:center!important;padding:10px 0!important}

      @supports(padding-top:env(safe-area-inset-top)){
        .mobile-topbar{
          padding-top:env(safe-area-inset-top);
          height:calc(52px + env(safe-area-inset-top));
        }
        .erp-main{min-height:calc(100dvh - 52px - env(safe-area-inset-top))}
      }

      #swipe-zone{position:fixed;top:0;left:0;bottom:0;width:20px;z-index:190;display:none}
      @media(max-width:768px){#swipe-zone{display:block}}

      .toast{
        bottom:auto!important;
        top:calc(16px + env(safe-area-inset-top,0px))!important;
        transform:translateX(-50%) translateY(-80px)!important;
        border-radius:var(--r-lg)!important;
        display:flex!important;
        align-items:center!important;
        gap:8px!important;
        padding:12px 20px!important;
        font-size:14px!important;
        font-weight:600!important;
        min-width:200px!important;
        max-width:90vw!important;
        justify-content:center!important;
        box-shadow:0 4px 24px rgba(0,0,0,.35)!important;
      }
      .toast.show{transform:translateX(-50%) translateY(0)!important}

      @media(max-width:768px){
        .nav-item{min-height:44px!important}
        .btn{min-height:44px!important}
        .btn-sm{min-height:40px!important;padding:0 14px!important}
        .field input,.field select,.field textarea,.form-input{
          min-height:48px!important;padding:12px 14px!important;font-size:15px!important
        }
        .qty-btn{width:48px!important;height:48px!important;font-size:22px!important}
        .icon-btn{min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center}

        .stat-label,.dash-label,.nav-section-label,.badge,.itag,.photo-label,.user-role{font-size:12px!important}
        .page-title{font-size:20px!important}
        .page-content{gap:14px!important}

        .cart-table,.modal-box{max-width:100%!important;width:100%!important;overflow-x:auto}
        .scan-card,.ocard,.corte-box,.stab-row{max-width:100%!important;width:100%!important}
        .admin-layout{grid-template-columns:1fr!important}
        .fin-layout{grid-template-columns:1fr!important}
        .config-grid{grid-template-columns:1fr!important}
        .table-container,.table-wrap{overflow-x:auto!important;-webkit-overflow-scrolling:touch}
        table{min-width:max-content}

        .page-header{flex-direction:column;gap:8px}
        .page-actions{flex-wrap:wrap}
        .card-sm{padding:14px!important}
        .stat-value{font-size:24px!important}
      }

      @media(min-width:769px) and (max-width:1100px){
        .grid-4{grid-template-columns:repeat(2,1fr)!important}
        .dashboard-cards{grid-template-columns:repeat(2,1fr)!important}
      }
    `;
    document.head.appendChild(s);
  }

  // ══════════════════════════════════════════════════════
  // BUILD SIDEBAR
  // ══════════════════════════════════════════════════════
  function buildSidebar(customModules) {
    const role      = getRole();
    const realRole  = getRealRole();
    const assumed   = sessionStorage.getItem(SK_ASSUMED);
    const profile   = DEFAULT_PROFILES[role] || DEFAULT_PROFILES.admin;
    const page      = getCurrentPage();
    const collapsed = localStorage.getItem(SK_COLLAPSED) === 'true';

    const sections = {};
    for (const m of getVisibleModules(role, customModules)) {
      if (!sections[m.section]) sections[m.section] = [];
      sections[m.section].push(m);
    }

    let navHtml = '';
    const keys = Object.keys(sections);
    keys.forEach((sec, si) => {
      navHtml += `<div class="nav-section-label">${sec}</div>`;
      for (const item of sections[sec]) {
        const active = page === item.id;
        navHtml += `
          <a href="${item.href}"
             class="nav-item${active ? ' active' : ''}"
             aria-label="${item.label}"
             aria-current="${active ? 'page' : 'false'}"
             data-tip-label="${item.label}"
             data-tip-section="${item.section}">
            <span class="nav-item-icon" aria-hidden="true">${item.icon}</span>
            <span class="nav-item-label">${item.label}</span>
          </a>`;
      }
      if (si < keys.length - 1) navHtml += '<div class="nav-divider" role="separator"></div>';
    });

    let assumeHtml = '';
    if (realRole === 'admin') {
      assumeHtml = `
        <div class="assume-profile">
          <select id="assumeProfileSelect" aria-label="Ver como perfil">
            <option value="">Ver como perfil…</option>
            <option value="operacao"   ${assumed==='operacao'   ?'selected':''}>Sueli — Operação</option>
            <option value="financeiro" ${assumed==='financeiro' ?'selected':''}>Jéssica — Financeiro</option>
            <option value="catalogo"   ${assumed==='catalogo'   ?'selected':''}>Daniel — Catálogo</option>
            <option value="vendas"     ${assumed==='vendas'     ?'selected':''}>Vendas</option>
          </select>
        </div>`;
    }

    return `
      <aside class="erp-sidebar${collapsed ? ' collapsed' : ''}"
             id="erp-sidebar"
             role="navigation"
             aria-label="Menu principal">

        <div class="sidebar-brand" aria-label="UniversoBox Hub" style="padding:12px 14px;">
          <img src="/assets/logo.png"      alt="UniversoBox Hub" class="sidebar-logo-full"
               onerror="this.style.display='none';document.querySelector('.sidebar-brand-fallback').style.display='flex'"/>
          <img src="/assets/logo-icon.png" alt="UniversoBox Hub" class="sidebar-logo-icon"
               onerror="this.style.display='none'"/>
          <div class="sidebar-brand-fallback" style="display:none;align-items:center;gap:10px;">
            <div class="sidebar-brand-icon" aria-hidden="true">U</div>
            <div class="sidebar-brand-text">
              <div class="sidebar-brand-name">
                <span style="color:var(--text-primary)">universo</span><span style="color:var(--accent-blue)">box</span><span style="color:var(--text-secondary);font-weight:500"> hub</span>
              </div>
            </div>
          </div>
        </div>

        <button class="sidebar-toggle"
                id="sidebarToggle"
                aria-label="${collapsed ? 'Expandir menu' : 'Recolher menu'}"
                title="${collapsed ? 'Expandir menu' : 'Recolher menu'}">
          ${collapsed ? '›' : '‹'}
        </button>

        <nav class="sidebar-nav" aria-label="Módulos">
          ${navHtml}
        </nav>

        <div class="sidebar-user">
          <div class="sidebar-user-card" id="userCardBtn"
               title="Segure para sair"
               role="button" tabindex="0">
            <div class="user-avatar" aria-hidden="true">${profile.avatar}</div>
            <div class="user-info">
              <div class="user-name">${profile.name}</div>
              <div class="user-role">${assumed ? '· ' : ''}${profile.label}</div>
            </div>
          </div>
          ${assumeHtml}
        </div>

      </aside>
      <div class="sidebar-overlay" id="sidebarOverlay" role="presentation"></div>
      <div id="swipe-zone" aria-hidden="true"></div>`;
  }

  // ══════════════════════════════════════════════════════
  // MOBILE TOPBAR
  // ══════════════════════════════════════════════════════
  function injectMobileTopbar() {
    if (document.querySelector('.mobile-topbar')) return;
    const mod   = ALL_MODULES.find(m => m.id === getCurrentPage());
    const icon  = mod ? `<span style="width:18px;height:18px;display:inline-flex;align-items:center;flex-shrink:0">${mod.icon}</span>` : '';
    const title = mod ? mod.label : 'UniversoBox Hub';
    const topbar = document.createElement('div');
    topbar.className = 'mobile-topbar';
    topbar.setAttribute('role', 'banner');
    topbar.innerHTML = `
      <button class="mobile-menu-btn" id="mobileMenuBtn"
              aria-label="Abrir menu" aria-expanded="false"
              style="min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;">
        ${IC.menu}
      </button>
      <span class="mobile-topbar-brand" style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;">
        ${icon}${title}
      </span>`;
    const main = document.querySelector('.erp-main');
    if (main) main.parentNode.insertBefore(topbar, main);
  }

  // ══════════════════════════════════════════════════════
  // EVENTOS
  // ══════════════════════════════════════════════════════
  function bindEvents() {
    const sidebar   = document.getElementById('erp-sidebar');
    const overlay   = document.getElementById('sidebarOverlay');
    const toggle    = document.getElementById('sidebarToggle');
    const swipeZone = document.getElementById('swipe-zone');

    // Desktop: collapsed toggle
    toggle?.addEventListener('click', () => {
      const c = sidebar.classList.toggle('collapsed');
      toggle.textContent = c ? '›' : '‹';
      toggle.setAttribute('aria-label', c ? 'Expandir menu' : 'Recolher menu');
      localStorage.setItem(SK_COLLAPSED, c);
    });

    // Desktop: tooltip flutuante
    let _tip = null;
    function showTip(item) {
      if (!sidebar?.classList.contains('collapsed')) return;
      removeTip();
      const label   = item.dataset.tipLabel || '';
      const section = item.dataset.tipSection || '';
      const iconEl  = item.querySelector('.nav-item-icon');
      if (!label) return;
      const rect = item.getBoundingClientRect();
      const wCol = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w-collapsed') || '56');
      _tip = document.createElement('div');
      _tip.style.cssText = `position:fixed;left:${wCol+10}px;top:${rect.top+rect.height/2}px;transform:translateY(-50%);background:var(--tooltip-bg,var(--depth-5));color:var(--text-primary);border:1px solid var(--tooltip-border,var(--border-default));border-radius:var(--r-md);padding:8px 13px;font-family:var(--font-body);white-space:nowrap;pointer-events:none;z-index:9999;box-shadow:var(--shadow-md);display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600`;
      _tip.innerHTML = `<span style="width:16px;height:16px;display:flex;align-items:center;opacity:.7">${iconEl?.innerHTML||''}</span><span><span style="display:block">${label}</span>${section?`<span style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-top:1px">${section}</span>`:''}</span>`;
      document.body.appendChild(_tip);
    }
    function removeTip() { if (_tip) { _tip.remove(); _tip = null; } }
    sidebar?.addEventListener('mouseover', e => { const i = e.target.closest('.nav-item'); i ? showTip(i) : removeTip(); });
    sidebar?.addEventListener('mouseleave', removeTip);

    // Mobile: abrir/fechar
    function openMobile() {
      sidebar?.classList.add('mobile-open');
      overlay?.classList.add('show');
      document.getElementById('mobileMenuBtn')?.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      if (swipeZone) swipeZone.style.pointerEvents = 'none';
    }
    function closeMobile() {
      sidebar?.classList.remove('mobile-open');
      overlay?.classList.remove('show');
      document.getElementById('mobileMenuBtn')?.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      if (swipeZone) swipeZone.style.pointerEvents = 'auto';
    }

    document.addEventListener('click', e => {
      const btn = document.getElementById('mobileMenuBtn');
      if (btn?.contains(e.target)) {
        sidebar?.classList.contains('mobile-open') ? closeMobile() : openMobile();
        return;
      }
      if (e.target === overlay) closeMobile();
    });

    // Swipe FECHA — arrasta esquerda no sidebar aberto
    let _tx = 0, _ty = 0;
    sidebar?.addEventListener('touchstart', e => {
      _tx = e.touches[0].clientX;
      _ty = e.touches[0].clientY;
    }, { passive: true });
    sidebar?.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - _tx;
      const dy = Math.abs(e.changedTouches[0].clientY - _ty);
      if (dx < -60 && dy < 50) closeMobile();
    }, { passive: true });

    // Swipe ABRE — arrasta direita da borda esquerda (20px zone)
    let _szx = 0, _szy = 0;
    swipeZone?.addEventListener('touchstart', e => {
      _szx = e.touches[0].clientX;
      _szy = e.touches[0].clientY;
    }, { passive: true });
    swipeZone?.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - _szx;
      const dy = Math.abs(e.changedTouches[0].clientY - _szy);
      if (dx > 50 && dy < 60) openMobile();
    }, { passive: true });

    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMobile(); });
    sidebar?.querySelectorAll('.nav-item').forEach(i => {
      i.addEventListener('click', () => { if (window.innerWidth <= 768) closeMobile(); });
    });

    // Assume profile
    document.getElementById('assumeProfileSelect')?.addEventListener('change', e => {
      const val = e.target.value;
      if (val) sessionStorage.setItem(SK_ASSUMED, val);
      else     sessionStorage.removeItem(SK_ASSUMED);
      localStorage.removeItem(SK_THEME);
      window.location.reload();
    });

    // Logout — clique direito desktop | long press mobile
    const card = document.getElementById('userCardBtn');
    if (card) {
      card.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (confirm('Sair do sistema?')) {
          ['expedicao_token','expedicao_user',SK_THEME].forEach(k => localStorage.removeItem(k));
          sessionStorage.removeItem(SK_ASSUMED);
          window.location.href = '/login';
        }
      });
      let _lp;
      card.addEventListener('touchstart', () => {
        _lp = setTimeout(() => {
          if (confirm('Sair do sistema?')) {
            ['expedicao_token','expedicao_user'].forEach(k => localStorage.removeItem(k));
            window.location.href = '/login';
          }
        }, 800);
      }, { passive: true });
      card.addEventListener('touchend', () => clearTimeout(_lp), { passive: true });
    }
  }

  // ══════════════════════════════════════════════════════
  // INJECT
  // ══════════════════════════════════════════════════════
  async function inject() {
    const placeholder = document.getElementById('sidebar-placeholder');
    if (!placeholder) return;
    loadTheme();
    injectStyles();

    let customModules = null;
    try {
      const role  = getRole();
      const token = localStorage.getItem('expedicao_token') || '';
      const res   = await fetch(`/api/perfis/${role}`, { headers: { authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        if (data?.modulos?.length) customModules = data.modulos;
        if (data?.tema && !localStorage.getItem(SK_THEME)) applyTheme(data.tema);
      }
    } catch { /* usa padrão */ }

    placeholder.outerHTML = buildSidebar(customModules);
    bindEvents();
    injectMobileTopbar();
  }

  window.ERPMenu = { applyTheme, getRole, getRealRole, THEMES, ALL_MODULES, IC };

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', inject)
    : inject();

})();
