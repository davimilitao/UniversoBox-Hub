'use strict';

const TERMINAL_KEY = 'expedicao_pro_terminal_id';

function getTerminalId() {
  let id = localStorage.getItem(TERMINAL_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(TERMINAL_KEY, id); }
  return id;
}
const terminalId = getTerminalId();

// ── STATE ──
const S = {
  orders: { pending: [], picked: [], packed: [] },
  tab: 'pending',
  selId: null,
  selOrder: null,
};

// ── API ──
async function api(path, opts = {}) {
  const token = localStorage.getItem('expedicao_token') || '';
  const res = await fetch(path, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      'x-terminal-id': terminalId,
      'authorization': `Bearer ${token}`,
      ...(opts.headers || {})
    }
  });
  const d = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = '/login'; return; }
  if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
  return d;
}

// ── UTILS ──
function esc(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]);
}
function fmtTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
}
function fmtDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
}
function sortOrders(arr) {
  arr.sort((a,b) => {
    const aFlex = a.logistica === 'flex' || !!a.isPriority;
    const bFlex = b.logistica === 'flex' || !!b.isPriority;
    if (aFlex !== bFlex) return bFlex ? 1 : -1;
    return Number(b.createdAtMs||0) - Number(a.createdAtMs||0);
  });
}

// ── BADGE DE LOGÍSTICA (Flex / Agência) ──
function mkLogisticaBadge(o) {
  const log = o.logistica || (o.isPriority ? 'flex' : '');
  if (log === 'flex')   return '<span class="oc-badge badge-flex">FLEX</span>';
  if (log === 'agency') return '<span class="oc-badge badge-agency">AGÊNCIA</span>';
  return '';
}

// ── TOAST / BEEP / FLASH ──
let _tt = null;
function toast(msg, type='info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(_tt);
  _tt = setTimeout(() => el.classList.remove('show'), 2600);
}

function beep(ok=true) {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    if (ok) {
      [1046, 1318].forEach((freq, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = freq; g.gain.value = 0.07;
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + i*0.11);
        o.stop(ctx.currentTime + i*0.11 + 0.08);
      });
    } else {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 220; g.gain.value = 0.07;
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.2);
    }
    setTimeout(() => ctx.close().catch(()=>{}), 600);
  } catch {}
}

function flash(ok=true) {
  const el = document.getElementById('scanFlash');
  el.className = `scan-flash ${ok ? 'ok-flash':'err-flash'}`;
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 140);
}

// ── REFRESH ──
async function refreshAll() {
  try {
    const [p, pi, pk] = await Promise.all([
      api('/orders/list?status=pending&limit=80'),
      api('/orders/list?status=picked&limit=80'),
      api('/orders/list?status=packed&limit=80'),
    ]);
    if (!p || !pi || !pk) return;
    S.orders.pending = p.items  || [];
    S.orders.picked  = pi.items || [];
    S.orders.packed  = pk.items || [];
    sortOrders(S.orders.pending);
    sortOrders(S.orders.picked);
    sortOrders(S.orders.packed);

    updateCounters();
    renderList();
    renderDetailPanel();

    // Atualiza pedido selecionado se ainda existir
    if (S.selId) {
      const found = [...S.orders.pending, ...S.orders.picked, ...S.orders.packed]
        .find(x => x.id === S.selId);
      if (found) { S.selOrder = found; renderOrderView(); }
    }
  } catch(e) { toast(`Erro ao atualizar: ${e.message}`, 'err'); }
}

async function refreshSelected() { await refreshAll(); }

// ── COUNTERS ──
function updateCounters() {
  const set = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
  set('tc-p', S.orders.pending.length);
  set('tc-i', S.orders.picked.length);
  set('tc-k', S.orders.packed.length);
}

// ── TABS ──
async function switchTab(status) {
  S.tab = status;
  document.querySelectorAll('.otab').forEach(b =>
    b.classList.toggle('active', b.dataset.status === status)
  );

  const subtitles = {
    pending: 'Separação com scanner · bipe SKU ou EAN + Enter',
    picked:  'Cole a etiqueta de envio e confirme a expedição',
    packed:  'Histórico de pedidos expedidos hoje',
  };
  document.getElementById('pageSubtitle').textContent = subtitles[status] || '';

  // Limpa seleção ao sair da aba pending
  if (status !== 'pending') {
    S.selId = null; S.selOrder = null;
  }

  renderList();

  // Para abas que mostram painel de cards — garante dados frescos antes de renderizar
  if (status === 'picked' || status === 'packed') {
    await refreshAll();
  } else {
    renderDetailPanel();
  }
}
window.switchTab = switchTab;

// ── RENDER DETAIL PANEL — muda conforme aba ──
function renderDetailPanel() {
  const ov  = document.getElementById('orderView');
  const ev  = document.getElementById('expedicaoView');
  const ekv = document.getElementById('expedidoView');
  const no  = document.getElementById('noOrder');

  if (S.tab === 'pending') {
    ev.style.display  = 'none';
    ekv.style.display = 'none';
    if (S.selOrder) {
      no.style.display = 'none';
      ov.style.display = 'flex';
    } else {
      no.style.display = 'flex';
      ov.style.display = 'none';
    }
  } else if (S.tab === 'picked') {
    ov.style.display  = 'none';
    no.style.display  = 'none';
    ekv.style.display = 'none';
    ev.style.display  = 'flex';  // mostra ANTES de renderizar
    renderExpedicaoPanel();
  } else if (S.tab === 'packed') {
    ov.style.display = 'none';
    no.style.display = 'none';
    ev.style.display = 'none';
    ekv.style.display = 'flex'; // mostra ANTES de renderizar
    renderExpedidoPanel();
  }
}

// ── BADGES ──
function mkBadge(m) {
  if (m === 'MERCADO_LIVRE') return `<span class="oc-badge badge-ml">ML</span>`;
  if (m === 'SHOPEE')        return `<span class="oc-badge badge-shop">SHOPEE</span>`;
  return `<span class="oc-badge badge-other">${esc(m||'OUTROS')}</span>`;
}

// ── INFO ETIQUETA — apelido ML ou código Shopee ──
function getEtiquetaInfo(o) {
  const nome = o.clienteNome || '';
  if (o.marketplace === 'MERCADO_LIVRE') {
    const match = nome.match(/\(([^)]+)\)/);
    return { tipo: 'ml', valor: match ? match[1] : nome };
  }
  if (o.marketplace === 'SHOPEE') {
    return { tipo: 'shop', valor: o.numeroPedido || '' };
  }
  return null;
}

function mkEtiquetaDestaque(o) {
  const info = getEtiquetaInfo(o);
  if (!info || !info.valor) return '';
  if (info.tipo === 'ml') {
    return `<div class="exp-etiqueta-ml">
      <div>
        <span class="exp-etiqueta-label">Apelido ML — cole a etiqueta para:</span>
        🏷️ ${esc(info.valor)}
      </div>
    </div>`;
  }
  if (info.tipo === 'shop') {
    return `<div class="exp-etiqueta-shop">
      <div>
        <span class="exp-etiqueta-label">Código de envio Shopee</span>
        📦 ${esc(info.valor)}
      </div>
    </div>`;
  }
  return '';
}

// ── RENDER LIST (coluna esquerda) ──
function renderList() {
  const filter = (document.getElementById('filterInput').value || '').toLowerCase().trim();
  const orders = S.orders[S.tab] || [];
  const list   = document.getElementById('orderList');
  list.innerHTML = '';

  const items = filter
    ? orders.filter(o =>
        (o.id||'').toLowerCase().includes(filter) ||
        (o.clienteNome||'').toLowerCase().includes(filter))
    : orders;

  if (!items.length) {
    const msgs = {
      pending: 'Nenhum pedido para separar',
      picked:  'Nenhum pedido aguardando expedição',
      packed:  'Nenhum pedido expedido hoje',
    };
    list.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:20px;text-align:center;">${msgs[S.tab]||'Nenhum pedido'}</div>`;
    return;
  }

  for (const o of items) {
    const its     = Array.isArray(o.items) ? o.items : [];
    const total   = its.reduce((a,it) => a + Number(it.qty||0), 0);
    const checked = its.reduce((a,it) => a + Number(it.checkedQty||0), 0);
    const pct     = total > 0 ? Math.round((checked/total)*100) : 0;

    const thumbs = its.slice(0,4).map(it => {
      const src = it.image || '/assets/placeholder.png';
      return `<img class="oc-thumb" src="${esc(src)}" onerror="this.src='/assets/placeholder.png'" alt="">`;
    });
    if (its.length > 4) thumbs.push(`<div class="oc-thumb-more">+${its.length-4}</div>`);

    // Na aba expedição mostra badge destacado de etiqueta
    const etiq = S.tab === 'picked' ? (() => {
      const info = getEtiquetaInfo(o);
      if (!info || !info.valor) return '';
      const cor = info.tipo === 'ml' ? 'var(--accent-yellow)' : 'var(--accent-orange)';
      return `<div style="font-size:10px;font-weight:800;color:${cor};margin-top:4px;">${info.tipo==='ml'?'🏷️':'📦'} ${esc(info.valor)}</div>`;
    })() : '';

    const card = document.createElement('div');
    card.className = `order-card${o.id===S.selId?' active':''}${o.isPriority?' priority':''}`;
    card.innerHTML = `
      <div class="oc-top">
        <div class="oc-id">${o.isPriority?'🔥 ':''}${esc(o.id)}</div>
        <div class="oc-badges">
          ${mkLogisticaBadge(o)}
          ${mkBadge(o.marketplace)}
        </div>
      </div>
      ${S.tab === 'pending' ? `
        <div class="oc-progress">
          <div class="oc-bar-wrap"><div class="oc-bar${pct>=100?' full':''}" style="width:${pct}%"></div></div>
          <div class="oc-ratio">${checked}/${total}</div>
        </div>` : ''}
      <div class="oc-thumbs">${thumbs.join('')}</div>
      ${etiq}
      ${o.clienteNome ? `<div class="oc-time">👤 ${esc(o.clienteNome)}</div>` : ''}
      <div class="oc-time">🕐 ${fmtTime(o.createdAtMs)}</div>
    `;

    if (S.tab === 'pending') {
      card.addEventListener('click', () => selectOrder(o));
    } else if (S.tab === 'picked') {
      // Scroll até o card de expedição correspondente
      card.addEventListener('click', () => {
        const target = document.getElementById(`expcard-${o.id}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    list.appendChild(card);
  }
}
window.renderList = renderList;

// ── SELECT ORDER (separação) ──
async function selectOrder(o) {
  S.selId    = o.id;
  S.selOrder = o;
  renderList();
  renderDetailPanel();
  renderOrderView(); // popula os itens
  try { await api(`/orders/${encodeURIComponent(o.id)}/lock`, {method:'POST', body:'{}'}); } catch {}
  focusScanner();
}

// ── RENDER ORDER VIEW (separação) ──
function renderOrderView() {
  const o = S.selOrder;
  if (!o) return;

  document.getElementById('viewId').textContent = o.id;

  const statusTag = {
    pending: '<span class="tag tag-pending">A Separar</span>',
    picked:  '<span class="tag tag-picked">Separado</span>',
    packed:  '<span class="tag tag-packed">Expedido</span>'
  }[o.status] || '';

  document.getElementById('viewMeta').innerHTML = `
    ${statusTag}
    ${mkBadge(o.marketplace)}
    ${o.isPriority ? '<span class="tag" style="background:rgba(255,230,0,.15);color:var(--ml);border:1px solid rgba(255,230,0,.3);">🔥 FLEX</span>' : ''}
    ${o.clienteNome ? `<span style="font-size:12px;color:var(--text-muted);">👤 ${esc(o.clienteNome)}</span>` : ''}
    ${_mkShipInfoBadge(o)}
  `;

  const its     = Array.isArray(o.items) ? o.items : [];
  const total   = its.reduce((a,it) => a + Number(it.qty||0), 0);
  const checked = its.reduce((a,it) => a + Number(it.checkedQty||0), 0);
  const pct     = total > 0 ? Math.round((checked/total)*100) : 0;
  const allOk   = total > 0 && checked >= total;

  document.getElementById('pfBar').style.width  = `${pct}%`;
  document.getElementById('pfPct').textContent  = `${checked} / ${total}`;
  document.getElementById('btnPicked').disabled = !(o.status === 'pending' && allOk);

  const area = document.getElementById('itemsArea');
  area.innerHTML = '';
  area.scrollTop = 0;

  if (!its.length) {
    area.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:40px;">Sem itens neste pedido.</div>`;
    return;
  }

  for (const it of its) {
    const qty = Number(it.qty||0);
    const chk = Number(it.checkedQty||0);
    const ok  = chk >= qty;

    const stockPhotos = Array.isArray(it.stockPhotos) ? it.stockPhotos : [];
    const boxPhotos   = Array.isArray(it.boxPhotos)   ? it.boxPhotos   : [];
    const binPhoto    = it.binPhoto || null;
    const binLabel    = it.customBin || it.bin || '';

    // Foto principal: prioridade → estoque → placeholder
    const mainPhoto = stockPhotos[0] || it.image || '/assets/placeholder.png';

    const row = document.createElement('div');
    row.className = `item-row${ok?' checked':''}`;

    // ── Fotos do estoque (sempre visíveis se existirem) ──
    const temFotos = stockPhotos.length > 0 || boxPhotos.length > 0 || binPhoto;
    let fotosHtml = '';
    if (temFotos) {
      const cols = [];
      if (stockPhotos[0]) cols.push(`
        <div style="display:flex;flex-direction:column;gap:4px;flex:1;">
          <div style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;">📦 Produto</div>
          <img src="${esc(stockPhotos[0])}" onerror="this.src='/assets/placeholder.png'"
            style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--r-md);border:1px solid var(--border-default);background:var(--depth-5);cursor:zoom-in;">
        </div>`);
      if (boxPhotos[0]) cols.push(`
        <div style="display:flex;flex-direction:column;gap:4px;flex:1;">
          <div style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;">🎁 Embalado</div>
          <img src="${esc(boxPhotos[0])}" onerror="this.src='/assets/placeholder.png'"
            style="max-height: 400px;width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--r-md);border:1px solid var(--border-default);background:var(--depth-5);cursor:zoom-in;">
        </div>`);
      if (binPhoto) cols.push(`
        <div style="display:flex;flex-direction:column;gap:4px;flex:1;">
          <div style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;">📍 Prateleira</div>
          <img src="${esc(binPhoto)}" onerror="this.src='/assets/placeholder.png'"
            style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--r-md);border:1px solid var(--border-default);background:var(--depth-5);cursor:zoom-in;">
        </div>`);

      fotosHtml = `
        <div style="padding:10px 12px;border-top:1px solid var(--border-subtle);background:var(--depth-4);">
          <div style="display:flex;gap:8px;">${cols.join('')}</div>
          ${binLabel ? `<div style="margin-top:8px;font-size:12px;font-weight:700;color:var(--accent-yellow);background:rgba(245,200,66,.07);border-radius:var(--r-sm);padding:6px 10px;border:1px solid rgba(245,200,66,.15);">📍 Localização: <strong>${esc(binLabel)}</strong></div>` : ''}
        </div>`;
    } else if (binLabel) {
      // Sem fotos mas tem localização — mostra só a localização
      fotosHtml = `
        <div style="padding:8px 12px;border-top:1px solid var(--border-subtle);background:var(--depth-4);">
          <div style="font-size:12px;font-weight:700;color:var(--accent-yellow);background:rgba(245,200,66,.07);border-radius:var(--r-sm);padding:6px 10px;border:1px solid rgba(245,200,66,.15);">📍 <strong>${esc(binLabel)}</strong></div>
        </div>`;
    }

    row.innerHTML = `
      <!-- LINHA PRINCIPAL -->
      <div style="display:grid;grid-template-columns:72px 50px 1fr 80px;min-height:72px;">

        <!-- Foto principal -->
        <img src="${esc(mainPhoto)}" onerror="this.src='/assets/placeholder.png'"
          style="width:72px;height:72px;object-fit:cover;display:block;background:var(--depth-4);">

        <!-- Qty + Botão -->
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px;gap:4px;border-left:1px solid var(--border-subtle);">
          <div class="qty-num">${qty}</div>
        </div>

        <!-- Info -->
        <div style="padding:8px 12px;display:flex;flex-direction:column;justify-content:center;gap:5px;min-width:0;">
          <div style="font-weight:700;font-size:13px;line-height:1.3;">${esc(it.nameShort||it.name||'')}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            <span class="itag">SKU ${esc(it.sku||'')}</span>
            ${it.ean ? `<span class="itag">EAN ${esc(it.ean)}</span>` : ''}
            ${it.eanBox ? `<span class="itag">EAN cx: ${esc(it.eanBox)}</span>` : ''}
          </div>
          ${it.notes ? `<div class="item-notes">⚠️ ${esc(it.notes)}</div>` : ''}
          ${!temFotos && !binLabel ? `<div style="font-size:10px;color:var(--text-muted);">📷 Sem fotos — cadastre no Admin</div>` : ''}
        </div>

        <!-- Qty + Botão -->
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px;gap:4px;border-left:1px solid var(--border-subtle);background:var(--depth-4);">
          <div class="qty-num${ok?' full':''}">${chk}</div>
          <div class="qty-of">de ${qty}</div>
          <button class="qty-btn${ok?' done':''}" data-sku="${esc(it.sku)}" ${ok?'disabled':''}>
            ${ok ? '✓' : '+'}
          </button>
        </div>

      </div>

      <!-- FOTOS (sempre abertas se existirem) -->
      ${fotosHtml}
    `;

    row.querySelector('.qty-btn').addEventListener('click', e => onScan(e.currentTarget.dataset.sku));
    area.appendChild(row);
  }
}

// ── SHIP INFO BADGE (header de separação) ──
function _mkShipInfoBadge(o) {
  const info = getEtiquetaInfo(o);
  if (!info || !info.valor) return '';
  if (info.tipo === 'ml') {
    return `<span style="font-size:12px;font-weight:800;background:rgba(245,200,66,.15);color:var(--accent-yellow);border:1px solid rgba(245,200,66,.3);padding:2px 8px;border-radius:var(--r-full);">🏷️ ${esc(info.valor)}</span>`;
  }
  return `<span style="font-size:12px;font-weight:800;font-family:'Space Mono',monospace;background:rgba(249,115,22,.12);color:var(--accent-orange);border:1px solid rgba(249,115,22,.25);padding:2px 8px;border-radius:var(--r-full);">📦 ${esc(info.valor)}</span>`;
}

// ── RENDER PAINEL EXPEDIÇÃO ──
function renderExpedicaoPanel() {
  const panel  = document.getElementById('expedicaoPanel');
  const orders = S.orders.picked;

  if (!orders.length) {
    panel.innerHTML = `<div class="exp-empty">
      <div style="font-size:44px;opacity:.1;">🏷️</div>
      <div style="font-size:15px;color:var(--text-secondary);font-weight:600;">Nenhum pedido separado</div>
      <div style="font-size:12px;max-width:240px;line-height:1.6;">Quando a Sueli confirmar a separação, os pedidos aparecem aqui para expedição.</div>
    </div>`;
    return;
  }

  panel.innerHTML = orders.map(o => {
    const its  = Array.isArray(o.items) ? o.items : [];
    const etiq = mkEtiquetaDestaque(o);

    const itensHtml = its.length > 0
      ? its.map(it => `
          <div class="exp-item">
            <img class="exp-item-img" src="${esc(it.image||'/assets/placeholder.png')}" onerror="this.src='/assets/placeholder.png'" alt="">
            <div class="exp-item-info">
              <div class="exp-item-name">${esc(it.nameShort||it.name||it.sku||'—')}</div>
              <div class="exp-item-sub">
                SKU: ${esc(it.sku||'—')}
                ${it.customBin||it.bin ? ` · 📍 ${esc(it.customBin||it.bin)}` : ''}
              </div>
            </div>
            <div class="exp-item-qty">×${it.qty||1}</div>
          </div>`).join('')
      : `<div style="padding:12px;font-size:12px;color:var(--text-muted);text-align:center;">
           Itens não carregados — clique em ⟳ Atualizar
         </div>`;

    // ── Info de etiqueta para o header ──
    const info = getEtiquetaInfo(o);
    let etiquetaHtml = '';
    if (info && info.valor) {
      if (info.tipo === 'ml') {
        etiquetaHtml = `
          <div class="exp-etiqueta-ml" onclick="copiarEtiqueta('${esc(info.valor)}')"
               title="Clique para copiar" style="cursor:pointer;">
            <div>
              <span class="exp-etiqueta-label">Apelido ML — cole a etiqueta para:</span>
              🏷️ <strong>${esc(info.valor)}</strong>
            </div>
          </div>`;
      } else if (info.tipo === 'shop') {
        etiquetaHtml = `
          <div class="exp-etiqueta-shop" onclick="copiarEtiqueta('${esc(info.valor)}')"
               title="Clique para copiar" style="cursor:pointer;">
            <div>
              <span class="exp-etiqueta-label">Código de envio Shopee</span>
              📦 <strong>${esc(info.valor)}</strong>
            </div>
          </div>`;
      }
    }

    // ── Título principal do header ──
    let headerTitulo = '';
    if (etiquetaHtml) {
      // ML/Shopee: etiqueta é o destaque, ID fica embaixo pequeno
      headerTitulo = `
        ${etiquetaHtml}
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px;padding:0 2px;font-family:'Space Mono',monospace;">${esc(o.id)}</div>`;
    } else {
      // Outros: nome do cliente grande, ID pequeno
      headerTitulo = `
        <div style="font-size:16px;font-weight:800;color:var(--text-primary);margin-bottom:4px;">
          ${esc(o.clienteNome || o.id)}
        </div>
        <div style="font-size:11px;color:var(--text-muted);font-family:'Space Mono',monospace;">${esc(o.id)}</div>`;
    }

    return `
      <div class="exp-card" id="expcard-${esc(o.id)}">
        <div class="exp-card-header" style="flex-direction:column;align-items:stretch;gap:0;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div style="flex:1;min-width:0;">${headerTitulo}</div>
            <div style="display:flex;gap:6px;align-items:flex-start;flex-shrink:0;margin-top:2px;">
              ${o.isPriority ? '<span class="oc-badge badge-flex">FLEX</span>' : ''}
              ${mkBadge(o.marketplace)}
            </div>
          </div>
        </div>

        <div class="exp-items">${itensHtml}</div>

        <div class="exp-card-footer">
          <span class="exp-card-time">🕐 Separado às ${fmtTime(o.updatedAtMs||o.createdAtMs)}</span>
          <button
            class="btn btn-success btn-sm"
            onclick="confirmarExpedicao('${esc(o.id)}')"
            style="font-weight:800;">
            🚚 Confirmar Expedição
          </button>
        </div>
      </div>`;
  }).join('');
}

// ── RENDER PAINEL EXPEDIDO (histórico) ──
function renderExpedidoPanel() {
  const panel  = document.getElementById('expedidoPanel');
  const orders = S.orders.packed;

  if (!orders.length) {
    panel.innerHTML = `<div class="exp-empty">
      <div style="font-size:44px;opacity:.1;">✅</div>
      <div style="font-size:15px;color:var(--text-secondary);font-weight:600;">Nenhum pedido expedido</div>
    </div>`;
    return;
  }

  panel.innerHTML = orders.map(o => {
    const its = Array.isArray(o.items) ? o.items : [];
    const itensHtml = its.map(it => `
      <div class="exp-item">
        <img class="exp-item-img" src="${esc(it.image||'/assets/placeholder.png')}" onerror="this.src='/assets/placeholder.png'" alt="">
        <div class="exp-item-info">
          <div class="exp-item-name">${esc(it.nameShort||it.name||'')}</div>
          <div class="exp-item-sub">SKU: ${esc(it.sku)}</div>
        </div>
        <div class="exp-item-qty">×${it.qty}</div>
      </div>`).join('');

    return `
      <div class="exp-card" style="opacity:.7;">
        <div class="exp-card-header">
          <div>
            <div class="exp-card-id">${esc(o.id)}</div>
            ${o.clienteNome ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">👤 ${esc(o.clienteNome)}</div>` : ''}
          </div>
          <div class="exp-card-badges">
            ${mkBadge(o.marketplace)}
            <span class="tag tag-packed">Expedido</span>
          </div>
        </div>
        <div class="exp-items">${itensHtml}</div>
        <div class="exp-card-footer">
          <span class="exp-card-time">✅ Expedido às ${fmtTime(o.updatedAtMs||o.createdAtMs)}</span>
        </div>
      </div>`;
  }).join('');
}

// ── CONFIRMAR EXPEDIÇÃO ──
async function confirmarExpedicao(orderId) {
  const btn = document.querySelector(`#expcard-${orderId} .btn-success`);
  if (btn) { btn.disabled = true; btn.textContent = '⟳ Confirmando...'; }
  try {
    const r = await api(`/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'POST', body: JSON.stringify({status:'packed'})
    });
    if (r && r.ok) {
      beep(true);
      toast('Pedido EXPEDIDO ✅', 'ok');
      // Animação de saída
      const card = document.getElementById(`expcard-${orderId}`);
      if (card) {
        card.style.transition = 'opacity .3s, transform .3s';
        card.style.opacity    = '0';
        card.style.transform  = 'translateX(20px)';
        setTimeout(() => refreshAll(), 350);
      } else {
        await refreshAll();
      }
    } else if (r) {
      toast(r.error||'Falha ao expedir', 'err');
      if (btn) { btn.disabled = false; btn.textContent = '🚚 Confirmar Expedição'; }
    }
  } catch(e) {
    toast(e.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = '🚚 Confirmar Expedição'; }
  }
}

// ── SCANNER ──
function focusScanner() { document.getElementById('scannerInput')?.focus(); }

let _buf = '', _bt = null;
window.addEventListener('keydown', e => {
  const active = document.activeElement;
  if (active && active.id === 'filterInput') return;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active.id !== 'scannerInput') return;
  if (S.tab !== 'pending') return; // scanner só ativo na aba de separação

  if (e.key === 'Enter') {
    const code = _buf.trim(); _buf = ''; clearTimeout(_bt);
    if (code) onScan(code);
    return;
  }
  if (e.key.length === 1) {
    _buf += e.key;
    clearTimeout(_bt);
    _bt = setTimeout(() => { _buf = ''; }, 500);
  }
});

async function onScan(code) {
  if (!S.selId) { toast('Selecione um pedido primeiro', 'info'); beep(false); return; }

  const sc = document.getElementById('scanStatus');
  sc.className = 'scanner-status busy font-mono';
  sc.textContent = '● LENDO…';

  try {
    const r = await api(`/orders/${encodeURIComponent(S.selId)}/check`, {
      method:'POST', body: JSON.stringify({ code })
    });

    if (r && r.ok) {
      const chk = Number(r.checkedQty);
      const qty = Number(r.qty);
      beep(true); flash(true);
      toast(`✓ ${r.sku}  (${chk}/${qty})`, 'ok');

      if (S.selOrder && Array.isArray(S.selOrder.items)) {
        const it = S.selOrder.items.find(x => x.sku === r.sku);
        if (it) it.checkedQty = chk;
        renderOrderViewLocal();

        // ── Verifica se todos os itens foram conferidos ──
        const its     = S.selOrder.items;
        const total   = its.reduce((a,i) => a + Number(i.qty||0), 0);
        const checked = its.reduce((a,i) => a + Number(i.checkedQty||0), 0);
        if (total > 0 && checked >= total) {
          // Pequeno delay para o operador ver o último item marcado antes do modal
          setTimeout(() => {
            if (!document.getElementById('modalSeparado')) {
              abrirModalSeparado();
            }
          }, 600);
        }
      }
      refreshAll().catch(() => {});

    } else if (r) {
      beep(false); flash(false);
      const msgs = {
        item_not_found:           `⚠ Código não encontrado: ${code}`,
        already_fully_checked:    'Item já conferido por completo',
        locked_by_other_terminal: 'Pedido em uso em outro terminal',
        not_all_items_checked:    'Confira todos os itens antes de confirmar',
      };
      toast(msgs[r.error] || r.error || 'Erro desconhecido', 'err');
    }
  } catch(e) {
    beep(false); flash(false);
    toast(`Erro: ${e.message}`, 'err');
  } finally {
    sc.className = 'scanner-status ready font-mono';
    sc.textContent = '● PRONTO';
    focusScanner();
  }
}

// ── ATUALIZAÇÃO LOCAL (sem recriar DOM) ──
function renderOrderViewLocal() {
  const o = S.selOrder;
  if (!o) return;

  const its     = Array.isArray(o.items) ? o.items : [];
  const total   = its.reduce((a,it) => a + Number(it.qty||0), 0);
  const checked = its.reduce((a,it) => a + Number(it.checkedQty||0), 0);
  const pct     = total > 0 ? Math.round((checked/total)*100) : 0;
  const allOk   = total > 0 && checked >= total;

  const pfBar = document.getElementById('pfBar');
  const pfPct = document.getElementById('pfPct');
  if (pfBar) pfBar.style.width = `${pct}%`;
  if (pfPct) pfPct.textContent = `${checked} / ${total}`;

  const btnPicked = document.getElementById('btnPicked');
  if (btnPicked) btnPicked.disabled = !(o.status === 'pending' && allOk);

  for (const it of its) {
    const qty = Number(it.qty||0);
    const chk = Number(it.checkedQty||0);
    const ok  = chk >= qty;

    const btn = document.querySelector(`.qty-btn[data-sku="${CSS.escape(it.sku)}"]`);
    if (!btn) continue;
    const row = btn.closest('.item-row');
    if (!row) continue;

    const qtyNum = row.querySelector('.qty-num');
    if (qtyNum) { qtyNum.textContent = chk; qtyNum.className = `qty-num${ok?' full':''}`; }
    btn.textContent = ok ? '✓' : '+';
    btn.disabled    = ok;
    btn.className   = `qty-btn${ok?' done':''}`;
    row.classList.toggle('checked', ok);
  }
}

// ── MODAL DE CONFIRMAÇÃO DE SEPARAÇÃO ──
function abrirModalSeparado() {
  const o   = S.selOrder;
  if (!o) return;
  const its = Array.isArray(o.items) ? o.items : [];

  // Próximo pedido na fila (pendentes excluindo o atual)
  const proximos = S.orders.pending.filter(x => x.id !== o.id);
  const proximo  = proximos[0] || null;

  const itensHtml = its.map(it => `
    <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border-subtle);">
      <img src="${esc(it.image||'/assets/placeholder.png')}"
        onerror="this.src='/assets/placeholder.png'"
        style="width:44px;height:44px;border-radius:6px;object-fit:cover;flex-shrink:0;background:var(--depth-5);">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${esc(it.nameShort||it.name||'')}
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">
          SKU: ${esc(it.sku)}
          ${it.customBin||it.bin ? ` · 📍 ${esc(it.customBin||it.bin)}` : ''}
        </div>
      </div>
      <div style="font-family:'Space Mono',monospace;font-size:16px;font-weight:800;color:var(--accent-green);flex-shrink:0;">
        ×${it.qty}
      </div>
    </div>`).join('');

  const proximoHtml = proximo
    ? `<div style="margin-top:14px;padding:10px 14px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.2);border-radius:var(--r-md);display:flex;align-items:center;gap:10px;">
        <div style="font-size:20px;">➡️</div>
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;">Próximo pedido</div>
          <div style="font-weight:700;font-size:13px;color:var(--accent-blue);">${esc(proximo.id)}</div>
          <div style="font-size:11px;color:var(--text-muted);">${(proximo.items||[]).length} item(s) · ${esc(proximo.marketplace||'')}</div>
        </div>
       </div>`
    : `<div style="margin-top:14px;padding:10px 14px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.15);border-radius:var(--r-md);text-align:center;font-size:13px;color:var(--accent-green);">
        🎉 Último pedido da fila!
       </div>`;

  // Cria modal
  const modal = document.createElement('div');
  modal.id = 'modalSeparado';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);';
  modal.innerHTML = `
    <div style="background:var(--depth-2);border:1px solid var(--border-strong);border-radius:var(--r-lg);width:100%;max-width:420px;max-height:90vh;overflow-y:auto;box-shadow:var(--shadow-lg);">

      <!-- Header -->
      <div style="padding:14px 18px;border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-family:'Space Mono',monospace;font-size:13px;font-weight:700;">${esc(o.id)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Confirmar separação completa?</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          ${mkBadge(o.marketplace)}
          <button onclick="fecharModalSeparado()" style="background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;padding:4px;line-height:1;">✕</button>
        </div>
      </div>

      <!-- Itens -->
      <div style="padding:14px 18px;">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">
          ✅ ${its.length} item(s) separado(s)
        </div>
        <div>${itensHtml}</div>
        ${proximoHtml}
      </div>

      <!-- Footer -->
      <div style="padding:12px 18px;border-top:1px solid var(--border-subtle);display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-ghost btn-sm" onclick="fecharModalSeparado()" style="color:var(--accent-red);">✕ Cancelar</button>
        <button class="btn btn-primary" id="btnConfirmarSeparado"
          onclick="confirmarSeparado('${esc(proximo?.id||'')}')"
          style="font-size:13px;padding:8px 18px;font-weight:800;">
          ${proximo ? '✓ Confirmar e ir para próximo' : '✓ Confirmar separação'}
        </button>
      </div>

    </div>`;

  document.body.appendChild(modal);

  // Fecha ao clicar fora
  modal.addEventListener('click', e => { if (e.target === modal) fecharModalSeparado(); });
}

function fecharModalSeparado() {
  document.getElementById('modalSeparado')?.remove();
  focusScanner();
}

async function confirmarSeparado(proximoId) {
  const btn = document.getElementById('btnConfirmarSeparado');
  if (btn) { btn.disabled = true; btn.textContent = '⟳ Confirmando...'; }

  try {
    const r = await api(`/orders/${encodeURIComponent(S.selId)}/status`, {
      method:'POST', body:JSON.stringify({status:'picked'})
    });
    if (r && r.ok) {
      beep(true);
      fecharModalSeparado();

      // Imprime etiqueta de transporte ML (Flex e Agência)
      const o = S.selOrder;
      if (o && o.marketplace === 'MERCADO_LIVRE') {
        // mlOrderId salvo diretamente no doc (pedidos novos)
        // fallback: extrai do clienteNome padrão "Nome (apelido) [#ID]"
        const mlId = o.mlOrderId || (() => {
          const m = (o.clienteNome||'').match(/\[#(\d+)\]/);
          return m ? m[1] : null;
        })();
        if (mlId) {
          imprimirEtiquetaML(mlId, o.id).catch(err =>
            toast(`Etiqueta: ${err.message}`, 'err')
          );
        }
      }
      // Shopee: etiqueta via QZ Tray — Sprint C

      await refreshAll();

      if (proximoId) {
        // Abre o próximo pedido automaticamente
        const proximo = S.orders.pending.find(x => x.id === proximoId);
        if (proximo) {
          selectOrder(proximo);
          toast(`✓ Separado! Próximo: ${proximoId}`, 'ok');
        } else {
          toast('Pedido separado ✓', 'ok');
        }
      } else {
        S.selId = null; S.selOrder = null;
        renderDetailPanel();
        toast('🎉 Todos os pedidos separados!', 'ok');
      }
    } else if (r) {
      toast(r.error||'Falha', 'err');
      if (btn) { btn.disabled = false; btn.textContent = '✓ Confirmar'; }
    }
  } catch(e) {
    toast(e.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = '✓ Confirmar'; }
  }
}

// ── AÇÕES ──
async function markPicked() {
  if (!S.selId) return;
  abrirModalSeparado();
}

// ── COPIAR ETIQUETA ──
function copiarEtiqueta(valor) {
  navigator.clipboard.writeText(valor).then(() => {
    toast(`✓ Copiado: ${valor}`, 'ok');
  }).catch(() => toast('Erro ao copiar', 'err'));
}
window.refreshAll          = refreshAll;
window.refreshSelected     = refreshSelected;
window.markPicked          = markPicked;
window.confirmarExpedicao  = confirmarExpedicao;
window.fecharModalSeparado = fecharModalSeparado;
window.confirmarSeparado   = confirmarSeparado;
window.copiarEtiqueta      = copiarEtiqueta;

// ── IMPRIMIR ETIQUETA ML ──
async function imprimirEtiquetaML(mlOrderId, localOrderId) {
  toast('Buscando etiqueta de transporte...', 'info');
  try {
    const res = await fetch(`/api/ml/orders/${encodeURIComponent(mlOrderId)}/label`, {
      headers: {
        'authorization': `Bearer ${localStorage.getItem('expedicao_token')||''}`,
        'x-terminal-id': terminalId,
      }
    });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('pdf') || ct.includes('octet')) {
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast('Etiqueta aberta ✓', 'ok');
      return;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.pdfUrl) {
      window.open(data.pdfUrl, '_blank');
      toast('Etiqueta aberta ✓', 'ok');
    } else {
      toast('Etiqueta sem URL — imprima pelo Bling', 'info');
    }
  } catch (err) {
    throw err;
  }
}
window.imprimirEtiquetaML = imprimirEtiquetaML;

// ── INIT ──
refreshAll();
focusScanner();
