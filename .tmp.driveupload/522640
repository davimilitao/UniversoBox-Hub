'use strict';

// ══════════════════════════════════════════════════════
// MODALIDADE GLOBAL
// ══════════════════════════════════════════════════════
let MODALIDADE_GLOBAL = 'FLEX';
function setModalidade(val) { MODALIDADE_GLOBAL = val; atualizarResumo(); }

// ══════════════════════════════════════════════════════
// ESTADO
// ══════════════════════════════════════════════════════
let carrinho      = [];
let logPedidos    = [];
let transitItems  = [];
let biData        = null;
let abaBI         = 'pedidos'; // 'pedidos' | 'itens'
let searchTimeout = null;
let _modalContext    = null;
let _recebidoContext = null;

// ══════════════════════════════════════════════════════
// UTILITÁRIOS
// ══════════════════════════════════════════════════════
function toast(msg, type = 'info', duration = 4000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => el.classList.remove('show'), duration);
}

function imgFb(src, cls = '', size = 40) {
  const s = src && src !== './assets/placeholder.png' ? src : '/assets/placeholder.png';
  return `<img src="${s}" class="${cls}" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:6px;background:var(--depth-5);flex-shrink:0;" onerror="if(this.dataset.fb==='1'){this.outerHTML='<div style=\\'width:${size}px;height:${size}px;border-radius:6px;background:var(--depth-5);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.5)}px;flex-shrink:0;\\'>📦</div>';}else{this.dataset.fb='1';this.src='/assets/placeholder.png';}">`;
}

function nomeMes(mesAno) {
  return new Date(`${mesAno.slice(0,4)}-${mesAno.slice(4,6)}-01`).toLocaleDateString('pt-BR', { month:'short', year:'2-digit' });
}

function shortId(id) {
  // COMP_20260325_4856A7 → 4856A7
  return (id || '').split('_').pop() || id;
}

function formatData(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
}

// ══════════════════════════════════════════════════════
// 1. BUSCA
// ══════════════════════════════════════════════════════
async function buscarProduto() {
  const q = document.getElementById('searchInput').value.trim();
  const resDiv = document.getElementById('searchResults');
  if (q.length < 2) { resDiv.innerHTML = ''; return; }
  resDiv.innerHTML = `<div style="padding:10px;color:var(--text-muted);font-size:12px;text-align:center;">Buscando...</div>`;
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    try {
      const data = await fetch(`/products/search?q=${encodeURIComponent(q)}`).then(r => r.json());
      if (!data.items.length) { resDiv.innerHTML = `<div style="padding:10px;color:var(--text-muted);font-size:12px;text-align:center;">Nenhum produto encontrado</div>`; return; }
      resDiv.innerHTML = data.items.map(p => `
        <div class="search-result-item" onclick='adicionarAoCarrinho(${JSON.stringify(p).replace(/'/g,"&#39;")})'>
          ${imgFb(p.image, 'search-result-img', 36)}
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
            <div style="font-size:11px;color:var(--text-secondary);">${p.marca||''} · SKU: ${p.sku}</div>
          </div>
        </div>`).join('');
    } catch(e) { resDiv.innerHTML = `<div style="padding:10px;color:var(--accent-red);font-size:12px;">Erro na busca</div>`; }
  }, 300);
}

// ══════════════════════════════════════════════════════
// 2. CARRINHO
// ══════════════════════════════════════════════════════
function adicionarAoCarrinho(produto) {
  if (carrinho.find(i => i.sku === produto.sku)) return toast('Produto já está na lista!', 'err');
  carrinho.push({ sku: produto.sku, name: produto.name, image: produto.image||'/assets/placeholder.png', marca: produto.marca||'N/A', ean: produto.ean||'N/A', qty: 1 });
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').innerHTML = '';
  renderizarCarrinho();
  salvarRascunho();
  toast(`${produto.name.split(' ').slice(0,3).join(' ')} adicionado ✓`, 'info');
}

function removerDoCarrinho(sku) { carrinho = carrinho.filter(i => i.sku !== sku); renderizarCarrinho(); salvarRascunho(); }

function atualizarQty(sku, val) {
  const item = carrinho.find(i => i.sku === sku);
  if (item) { item.qty = Math.max(1, Number(val)||1); salvarRascunho(); }
}

function renderizarCarrinho() {
  const tbody = document.getElementById('cartBody');
  const card  = document.getElementById('card-lista');
  if (!carrinho.length) { card.classList.remove('visible'); atualizarResumo(); return; }
  card.classList.add('visible');
  tbody.innerHTML = carrinho.map(item => `
    <tr>
      <td><div style="display:flex;align-items:center;gap:10px;">${imgFb(item.image,'',40)}<div><div style="font-size:13px;font-weight:600;">${item.name}</div><div style="font-size:11px;color:var(--text-muted);">${item.marca} · ${item.sku}</div></div></div></td>
      <td style="font-size:11px;color:var(--text-muted);font-family:'Space Mono',monospace;">${item.ean}</td>
      <td><input type="number" min="1" value="${item.qty}" class="cart-input" onchange="atualizarQty('${item.sku}',this.value)"></td>
      <td><button class="btn-remove" onclick="removerDoCarrinho('${item.sku}')">✕</button></td>
    </tr>`).join('');
  atualizarResumo();
}

function atualizarResumo() {
  const el = document.getElementById('resumo-totais');
  const em = document.getElementById('resumo-modalidade');
  if (!el) return;
  if (!carrinho.length) { el.style.display = 'none'; return; }
  const totalQty = carrinho.reduce((s, i) => s + Number(i.qty), 0);
  el.style.display = 'flex';
  el.innerHTML = `<span style="font-size:12px;color:var(--text-muted);">${carrinho.length} produto${carrinho.length>1?'s':''} · ${totalQty} un.</span>`;
  if (em) em.textContent = `Modalidade: ${MODALIDADE_GLOBAL}`;
}

// ══════════════════════════════════════════════════════
// 3. RASCUNHO
// ══════════════════════════════════════════════════════
function salvarRascunho() {
  try { localStorage.setItem('compras_rascunho', JSON.stringify({ carrinho, modalidade: MODALIDADE_GLOBAL })); } catch(e) {}
}
function carregarRascunho() {
  try {
    const raw = localStorage.getItem('compras_rascunho');
    if (!raw) return;
    const saved = JSON.parse(raw);
    carrinho = saved.carrinho || saved;
    if (saved.modalidade) {
      MODALIDADE_GLOBAL = saved.modalidade;
      const r = document.querySelector(`input[name=modalidade][value="${MODALIDADE_GLOBAL}"]`);
      if (r) r.checked = true;
    }
    renderizarCarrinho();
    if (carrinho.length) toast(`Rascunho restaurado (${carrinho.length} itens) 💾`, 'info');
  } catch(e) {}
}

// ══════════════════════════════════════════════════════
// 4. LOG — BACKEND (Firestore) com fallback localStorage
// ══════════════════════════════════════════════════════
async function carregarLog() {
  try {
    const data = await fetch('/api/purchase-orders?limit=20').then(r => r.json());
    logPedidos = data.items || [];
  } catch(e) {
    try { const raw = localStorage.getItem('compras_log'); if (raw) logPedidos = JSON.parse(raw); } catch(_) {}
  }
  renderizarLog();
}

function renderizarLog() {
  const container = document.getElementById('log-pedidos');
  if (!container) return;
  if (!logPedidos.length) {
    container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:12px;">Nenhum pedido ainda</div>`;
    return;
  }
  container.innerHTML = logPedidos.map((p, i) => {
    const items     = p.items || [];
    const totalQty  = p.totalQty || items.reduce((s, x) => s + Number(x.qty), 0);
    const dataStr   = formatData(p.createdAtMs) || p.data || '';
    const sid       = shortId(p.id);
    const marcas    = p.marcas && p.marcas.length ? p.marcas : [...new Set(items.map(x => x.marca).filter(m => m && m !== 'N/A'))];
    const marcaLabel = marcas.length === 0 ? ''
      : marcas.length === 1 ? `<span class="marca-pill">${marcas[0]}</span>`
      : `<span class="marca-pill multi">${marcas[0]} +${marcas.length - 1}</span>`;

    return `
      <div class="log-card" id="lc-${i}">
        <div class="log-card-top">
          <div class="log-card-left">
            <span class="log-card-id">Pedido ${sid}</span>
            ${marcaLabel ? `<span style="margin:0 4px;color:var(--text-muted);">·</span>${marcaLabel}` : ''}
            ${p.modalidade ? `<span class="modal-pill">${p.modalidade}</span>` : ''}
          </div>
          <span class="log-card-date">${dataStr}</span>
        </div>
        <div class="log-card-actions">
          <button class="log-btn-items" onclick="verItensPedido(${i})">
            ▸ ${items.length} produto${items.length>1?'s':''} · ${totalQty} un.
          </button>
          <button class="log-btn-pdf" onclick="reimprimirPDF(${i})">PDF</button>
          <button class="log-btn-replicar" onclick="replicarPedido(${i})">↩ Replicar</button>
        </div>
        <div id="log-expand-${i}" class="log-expand">
          ${items.map((it) => {
            const sent     = (p.transitSent     || {})[it.sku];
            const received = (p.transitReceived || {})[it.sku];
            const badge = received
              ? `<span class="status-badge received">✅ Recebido</span>`
              : sent
              ? `<span class="status-badge transit">🚚 A caminho</span>`
              : `<button class="btn-a-caminho" onclick="abrirModalACaminho(${i},${items.indexOf(it)})">🚚 A caminho</button>`;
            return `
              <div class="log-item-row">
                ${imgFb(it.image,'',28)}
                <div style="flex:1;min-width:0;">
                  <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.name}</div>
                  <div style="font-size:10px;color:var(--text-muted);">${it.marca||''} · Qtd: ${it.qty}</div>
                </div>
                ${badge}
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');
}

function verItensPedido(i) {
  const el = document.getElementById(`log-expand-${i}`);
  if (el) el.classList.toggle('open');
}

function replicarPedido(i) {
  const p = logPedidos[i];
  if (carrinho.length > 0 && !confirm('Substituir a lista atual?')) return;
  carrinho = JSON.parse(JSON.stringify(p.items || []));
  if (p.modalidade) {
    MODALIDADE_GLOBAL = p.modalidade;
    const r = document.querySelector(`input[name=modalidade][value="${MODALIDADE_GLOBAL}"]`);
    if (r) r.checked = true;
  }
  renderizarCarrinho(); salvarRascunho();
  toast(`Lista replicada do Pedido ${shortId(p.id)} ✓`, 'ok');
}

async function reimprimirPDF(i) {
  const backup = carrinho;
  carrinho = logPedidos[i].items || [];
  await gerarPDF(logPedidos[i].id, logPedidos[i].modalidade || MODALIDADE_GLOBAL);
  carrinho = backup;
}

// ══════════════════════════════════════════════════════
// 5. MODAL "A CAMINHO"
// ══════════════════════════════════════════════════════
function abrirModalACaminho(pedidoIdx, itemIdx) {
  const p = logPedidos[pedidoIdx];
  const item = (p.items || [])[itemIdx];
  _modalContext = { pedidoIdx, itemIdx, item, compraId: p.id, dataPedido: p.createdAtMs || null };
  document.getElementById('modal-product-name').textContent = item.name;
  document.getElementById('modal-product-meta').textContent = `${item.marca||''} · Pedido ${shortId(p.id)} · ${item.qty} un.`;
  document.getElementById('modal-qty-input').value = item.qty;
  document.getElementById('modalTransit').classList.add('open');
  setTimeout(() => document.getElementById('modal-qty-input').focus(), 100);
}
function fecharModal() { document.getElementById('modalTransit').classList.remove('open'); _modalContext = null; }

async function confirmarACaminho() {
  if (!_modalContext) return;
  const { pedidoIdx, item, compraId, dataPedido } = _modalContext;
  const qtyComprada = Math.max(1, Number(document.getElementById('modal-qty-input').value)||item.qty);

  const existente = transitItems.find(t => t.compraId === compraId && t.sku === item.sku && t.status === 'transit');
  if (existente) { fecharModal(); return toast('Este item já está a caminho', 'err'); }

  try {
    const res = await fetch('/api/transit', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ compraId, sku:item.sku, name:item.name, marca:item.marca, image:item.image, ean:item.ean, qtyPedida:item.qty, qtyComprada, modalidade:logPedidos[pedidoIdx].modalidade||MODALIDADE_GLOBAL, dataPedido }) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);

    await fetch(`/api/purchase-orders/${compraId}/transit-status`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ sku:item.sku, status:'sent' }) });
    if (!logPedidos[pedidoIdx].transitSent) logPedidos[pedidoIdx].transitSent = {};
    logPedidos[pedidoIdx].transitSent[item.sku] = true;
    fecharModal();
    await carregarTransit(); renderizarLog();
    toast(`${item.name.split(' ')[0]} a caminho 🚚`, 'ok');
  } catch(err) { toast(`Erro: ${err.message}`, 'err'); }
}

// ══════════════════════════════════════════════════════
// 6. CARROSSEL "A CAMINHO"
// ══════════════════════════════════════════════════════
async function carregarTransit() {
  try {
    const data = await fetch('/api/transit').then(r => r.json());
    transitItems = data.items || [];
    renderizarTransit();
  } catch(e) { console.error('[transit]', e); }
}

function renderizarTransit() {
  const card     = document.getElementById('card-transit');
  const carousel = document.getElementById('transitCarousel');
  const totais   = document.getElementById('transit-totais');
  if (!transitItems.length) { card.classList.remove('visible'); return; }
  card.classList.add('visible');

  const totalUn   = transitItems.reduce((s, i) => s + Number(i.qtyComprada||0), 0);
  const atrasados = transitItems.filter(i => i.dataACaminho && Math.round((Date.now()-i.dataACaminho)/86400000) >= 7).length;

  totais.innerHTML = `
    <div style="display:flex;gap:20px;padding:10px 20px 0;align-items:center;flex-wrap:wrap;">
      <div style="display:flex;align-items:baseline;gap:5px;">
        <span style="font-size:22px;font-weight:700;color:var(--text-primary);">${transitItems.length}</span>
        <span style="font-size:11px;color:var(--text-muted);">item${transitItems.length>1?'s':''} em trânsito</span>
      </div>
      <div style="display:flex;align-items:baseline;gap:5px;">
        <span style="font-size:22px;font-weight:700;color:var(--text-primary);">${totalUn}</span>
        <span style="font-size:11px;color:var(--text-muted);">unidades</span>
      </div>
      ${atrasados > 0 ? `<div style="background:rgba(239,68,68,.1);padding:3px 12px;border-radius:20px;"><span style="font-size:13px;font-weight:700;color:var(--accent-red);">⚠ ${atrasados} atrasado${atrasados>1?'s':''} +7d</span></div>` : ''}
    </div>`;

  carousel.innerHTML = transitItems.map(item => {
    const dias     = item.dataACaminho ? Math.round((Date.now()-item.dataACaminho)/86400000) : 0;
    const atrasado = dias >= 7;
    const rapido   = dias <= 2;
    const cls      = atrasado ? 'slow' : rapido ? 'fast' : '';
    const label    = dias === 0 ? 'Saiu hoje' : dias === 1 ? '1 dia' : `${dias} dias`;
    const nE = encodeURIComponent(item.name), mE = encodeURIComponent(item.marca||'');
    return `
      <div class="transit-card" style="${atrasado?'border-color:rgba(239,68,68,.5);':''}">
        <img src="${item.image||'/assets/placeholder.png'}" class="transit-card-img" onerror="this.src='/assets/placeholder.png'">
        <div class="transit-card-body">
          <div class="transit-card-name">${item.name}</div>
          <div class="transit-card-marca">${item.marca||''}</div>
          <div class="transit-card-qty">${item.qtyComprada} un.</div>
          <div style="display:flex;gap:3px;margin:5px 0 3px;">
            <div style="flex:1;height:3px;border-radius:2px;background:var(--accent-blue);"></div>
            <div style="flex:1;height:3px;border-radius:2px;background:var(--accent-blue);"></div>
            <div style="flex:1;height:3px;border-radius:2px;background:var(--border-default);"></div>
          </div>
          <div class="transit-card-days ${cls}">${label}${atrasado?' ⚠':''}</div>
          <button class="btn-recebido" data-id="${item.id}" data-name="${nE}" data-marca="${mE}" data-qty="${item.qtyComprada}" data-dias="${dias}" onclick="abrirModalRecebidoFromBtn(this)">✅ Confirmar Recebimento</button>
        </div>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════
// 7. MODAL RECEBIDO (com divergência)
// ══════════════════════════════════════════════════════
function abrirModalRecebidoFromBtn(btn) {
  abrirModalRecebido(btn.dataset.id, decodeURIComponent(btn.dataset.name), decodeURIComponent(btn.dataset.marca), btn.dataset.qty, Number(btn.dataset.dias));
}
function abrirModalRecebido(transitId, name, marca, qty, dias) {
  const t = transitItems.find(t => t.id === transitId);
  _recebidoContext = { transitId, name, marca, sku:t?.sku||'', compraId:t?.compraId||'', qtyEsperada:Number(qty) };
  document.getElementById('modal-recebido-meta').textContent   = `${name} · ${marca}`;
  document.getElementById('modal-recebido-info').textContent   = dias===0?'Saiu hoje':`${dias} dia${dias>1?'s':''} em trânsito`;
  document.getElementById('modal-recebido-qty').value          = qty;
  document.getElementById('modal-recebido-qty-esp').textContent = `Esperado: ${qty} un.`;
  document.getElementById('modalRecebido').classList.add('open');
  setTimeout(() => document.getElementById('modal-recebido-qty').focus(), 100);
}
function fecharModalRecebido() { document.getElementById('modalRecebido').classList.remove('open'); _recebidoContext = null; }

async function confirmarRecebido() {
  if (!_recebidoContext) return;
  const { transitId, name, sku, compraId, qtyEsperada } = _recebidoContext;
  const qtyReal = Math.max(1, Number(document.getElementById('modal-recebido-qty').value)||qtyEsperada);
  const diverge = qtyReal !== qtyEsperada;
  try {
    const res = await fetch(`/api/transit/${transitId}/received`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ qtyRecebida:qtyReal }) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    await fetch(`/api/purchase-orders/${compraId}/transit-status`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ sku, status:'received' }) });
    const idx = logPedidos.findIndex(p => p.id === compraId);
    if (idx >= 0) { if (!logPedidos[idx].transitReceived) logPedidos[idx].transitReceived = {}; logPedidos[idx].transitReceived[sku] = true; }
    fecharModalRecebido();
    await Promise.all([carregarTransit(), carregarLog(), carregarBI()]);
    const diasMsg = data.diasEmTransito != null ? ` · ${data.diasEmTransito}d em trânsito` : '';
    const divMsg  = diverge ? ` ⚠ Divergência: esperado ${qtyEsperada}, recebido ${qtyReal}` : '';
    toast(`${name.split(' ')[0]} recebido${diasMsg}${divMsg} ✅`, diverge?'err':'ok', diverge?7000:4000);
  } catch(err) { toast(`Erro: ${err.message}`, 'err'); }
}

// ══════════════════════════════════════════════════════
// 8. BI — INTELIGÊNCIA DE COMPRAS (2 abas)
// ══════════════════════════════════════════════════════
async function carregarBI() {
  try {
    biData = await fetch('/api/compras/bi').then(r => r.json());
    renderizarBI();
  } catch(e) { console.error('[BI]', e); }
}

function setAbaBI(aba) {
  abaBI = aba;
  document.querySelectorAll('.bi-tab').forEach(t => t.classList.toggle('active', t.dataset.aba === aba));
  renderizarBI();
}

function renderizarBI() {
  const el = document.getElementById('card-bi');
  if (!el || !biData) return;

  const mesAtual    = biData.byMonth?.[0];
  const mesAnterior = biData.byMonth?.[1];
  const varPedidos  = mesAtual && mesAnterior && mesAnterior.pedidos > 0
    ? Math.round(((mesAtual.pedidos - mesAnterior.pedidos) / mesAnterior.pedidos) * 100) : null;

  // Totalizadores (sempre visíveis)
  const totais = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:16px 20px 12px;">
      <div class="bi-stat">
        <div class="bi-stat-label">Pedidos (6m)</div>
        <div class="bi-stat-val">${biData.totalPedidos}</div>
        ${varPedidos !== null ? `<div class="bi-stat-var ${varPedidos>=0?'up':'down'}">${varPedidos>=0?'▲':'▼'} ${Math.abs(varPedidos)}%</div>` : ''}
      </div>
      <div class="bi-stat">
        <div class="bi-stat-label">Unidades (6m)</div>
        <div class="bi-stat-val">${(biData.totalUnidades||0).toLocaleString('pt-BR')}</div>
      </div>
      <div class="bi-stat">
        <div class="bi-stat-label">Em Trânsito</div>
        <div class="bi-stat-val" style="color:${biData.emTransito>0?'var(--accent-blue)':'var(--text-primary)'};">${biData.emTransito}</div>
      </div>
    </div>`;

  let conteudo = '';

  if (abaBI === 'pedidos') {
    // Gráfico de barras mensais
    const max = Math.max(...(biData.byMonth||[]).map(m => m.pedidos), 1);
    const barras = (biData.byMonth||[]).slice(0,6).reverse().map(m => {
      const pct = Math.round((m.pedidos/max)*100);
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;">
        <span style="font-size:9px;color:var(--text-muted);font-weight:600;">${m.pedidos}</span>
        <div style="width:100%;background:var(--depth-4);border-radius:3px;height:52px;display:flex;align-items:flex-end;">
          <div style="width:100%;background:var(--accent-blue);border-radius:3px;height:${pct}%;"></div>
        </div>
        <span style="font-size:9px;color:var(--text-muted);">${nomeMes(m.mes)}</span>
      </div>`;
    }).join('');

    // Lead time por marca
    const leadRows = (biData.leadTime||[]).slice(0,6).map(l => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-subtle);">
        <span style="font-size:12px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l.marca}</span>
        <span style="font-size:10px;color:var(--text-muted);">${l.count} rec.</span>
        <span style="font-size:13px;font-weight:700;min-width:32px;text-align:right;color:${l.media>=7?'var(--accent-red)':l.media<=3?'#15803d':'var(--text-primary)'};">~${l.media}d</span>
        <span style="font-size:10px;color:var(--text-muted);">(${l.min}–${l.max})</span>
      </div>`).join('') || `<div style="padding:12px 0;font-size:12px;color:var(--text-muted);">Confirme recebimentos para ver dados de lead time</div>`;

    // Top marcas por volume
    const marcaRows = (biData.topMarcas||[]).slice(0,6).map((m, i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:5px 0;">
        <span style="font-size:10px;color:var(--text-muted);width:14px;">${i+1}</span>
        <span style="font-size:12px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.marca}</span>
        <span style="font-size:11px;color:var(--text-muted);">${m.unidades} un.</span>
      </div>`).join('') || `<div style="padding:12px 0;font-size:12px;color:var(--text-muted);">Sem dados ainda</div>`;

    // Divergências
    const divRows = (biData.divergencias||[]).slice(0,4).map(d => `
      <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border-subtle);">
        <span style="font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.marca||d.sku}</span>
        <span style="font-size:11px;color:var(--text-muted);">esp. ${d.esperada}</span>
        <span style="font-size:11px;font-weight:700;color:${d.diff<0?'var(--accent-red)':'#15803d'};">${d.diff>0?'+':''}${d.diff}</span>
      </div>`).join('');

    conteudo = `
      <div style="padding:0 20px 12px;">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Pedidos por mês</div>
        <div style="display:flex;gap:6px;align-items:flex-end;">${barras}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--border-subtle);">
        <div style="padding:14px 20px;border-right:1px solid var(--border-subtle);">
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Lead time por marca</div>
          ${leadRows}
        </div>
        <div style="padding:14px 20px;">
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Volume por marca</div>
          ${marcaRows}
        </div>
      </div>
      ${divRows ? `<div style="padding:14px 20px;border-top:1px solid var(--border-subtle);">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Divergências recentes</div>
        ${divRows}
      </div>` : ''}`;
  }

  if (abaBI === 'itens') {
    const itens = biData.topItens || [];
    const rows = itens.map((item, i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 20px;border-bottom:1px solid var(--border-subtle);">
        <span style="font-size:11px;color:var(--text-muted);width:18px;text-align:right;">${i+1}</span>
        ${imgFb(item.image,'',32)}
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name}</div>
          <div style="font-size:10px;color:var(--text-muted);">${item.marca||''} · SKU: ${item.sku}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:13px;font-weight:700;color:var(--text-primary);">${item.unidades} un.</div>
          <div style="font-size:10px;color:var(--text-muted);">${item.pedidos} pedido${item.pedidos>1?'s':''}</div>
          ${item.leadMedia !== null ? `<div style="font-size:10px;color:${item.leadMedia>=7?'var(--accent-red)':item.leadMedia<=3?'#15803d':'var(--text-muted)'};">~${item.leadMedia}d</div>` : ''}
        </div>
      </div>`).join('') || `<div style="padding:32px;text-align:center;font-size:12px;color:var(--text-muted);">Nenhum item com histórico ainda</div>`;

    conteudo = `
      <div style="padding:8px 20px 6px;font-size:11px;color:var(--text-muted);">Ordenado por volume total de unidades pedidas nos últimos 6 meses · lead time = dias até recebimento</div>
      ${rows}`;
  }

  el.innerHTML = totais + conteudo;
}

// ══════════════════════════════════════════════════════
// 9. FECHAR LISTA
// ══════════════════════════════════════════════════════
async function fecharLista() {
  if (!carrinho.length) return toast('A lista está vazia!', 'err');
  const btn = document.getElementById('btnFechar');
  btn.disabled = true; btn.textContent = 'Processando...';
  try {
    const data = await fetch('/api/compras', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ items:carrinho, modalidade:MODALIDADE_GLOBAL }) }).then(r => r.json());
    if (!data.ok) throw new Error(data.error);
    if (data.alertasEmbalagem?.length) {
      data.alertasEmbalagem.forEach((a, i) => setTimeout(() => toast(a, 'err', 8000), i*1000));
    } else { toast('Lista salva com sucesso!', 'ok'); }
    await gerarPDF(data.compraId, MODALIDADE_GLOBAL);
    carrinho = []; renderizarCarrinho(); localStorage.removeItem('compras_rascunho');
    await Promise.all([carregarLog(), carregarBI()]);
  } catch(err) { toast(`Erro: ${err.message}`, 'err'); }
  finally { btn.disabled = false; btn.textContent = '✅ Fechar & Gerar PDF'; }
}

// ══════════════════════════════════════════════════════
// 10. PDF
// ══════════════════════════════════════════════════════
async function gerarPDF(compraId, modalidade) {
  const itensPDF = carrinho.slice();
  if (!itensPDF.length) return;

  const totalQty = itensPDF.reduce((s, i) => s + Number(i.qty), 0);

  // 1. Preenche template
  document.getElementById('pdf-id').textContent         = compraId;
  document.getElementById('pdf-date').textContent       = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
  document.getElementById('pdf-modalidade').textContent = modalidade || MODALIDADE_GLOBAL;
  document.getElementById('pdf-total').textContent      = `${itensPDF.length} produto${itensPDF.length>1?'s':''} · ${totalQty} unidades`;
  document.getElementById('pdf-footer-id').textContent  = compraId;

  document.getElementById('pdf-body').innerHTML = itensPDF.map(item => `
    <tr>
      <td style="text-align:center;width:56px;padding:6px 10px;">
        <img src="${item.image || '/assets/placeholder.png'}"
          style="width:44px;height:44px;object-fit:contain;border-radius:4px;border:1px solid #eee;"
          crossorigin="anonymous"
          onerror="this.src='/assets/placeholder.png'">
      </td>
      <td style="padding:8px 10px;"><strong>${item.name}</strong><br><small style="color:#888;font-size:10px;">SKU: ${item.sku}</small></td>
      <td style="padding:8px 10px;font-size:11px;">${item.marca}</td>
      <td style="padding:8px 10px;font-family:monospace;font-size:10px;">${item.ean}</td>
      <td style="padding:8px 10px;text-align:center;font-size:20px;font-weight:700;">${item.qty}</td>
    </tr>`).join('');

  const element = document.getElementById('pdf-template');

  // 2. Posiciona fora do fluxo para não afetar o layout da página
  //    e garante que o html2canvas sempre captura do topo (scrollY=0)
  element.style.position = 'absolute';
  element.style.top      = '0';
  element.style.left     = '0';
  element.style.width    = '800px';
  element.style.zIndex   = '-1';
  element.style.display  = 'block';

  // 3. Aguarda imagens carregarem
  const imgs = Array.from(element.querySelectorAll('img'));
  await Promise.all(imgs.map(img =>
    img.complete
      ? Promise.resolve()
      : new Promise(res => { img.onload = res; img.onerror = res; })
  ));

  // 4. Gera PDF — scrollY:0 garante captura sempre do topo independente do scroll da página
  await html2pdf()
    .set({
      margin:      [14, 12],
      filename:    `Pedido_${compraId}.pdf`,
      image:       { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0, scrollX: 0 },
      jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak:   { mode: 'css', avoid: 'tr' },
    })
    .from(element)
    .save();

  // 5. Restaura estado original
  element.style.display  = 'none';
  element.style.position = '';
  element.style.top      = '';
  element.style.left     = '';
  element.style.width    = '';
  element.style.zIndex   = '';
}

// ══════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  carregarTransit();
  carregarLog();
  carregarRascunho();
  carregarBI();
  document.getElementById('modalTransit').addEventListener('click', e => { if(e.target===e.currentTarget) fecharModal(); });
  document.getElementById('modalRecebido').addEventListener('click', e => { if(e.target===e.currentTarget) fecharModalRecebido(); });
  document.getElementById('modal-qty-input').addEventListener('keydown', e => { if(e.key==='Enter') confirmarACaminho(); if(e.key==='Escape') fecharModal(); });
  document.getElementById('modal-recebido-qty').addEventListener('keydown', e => { if(e.key==='Enter') confirmarRecebido(); if(e.key==='Escape') fecharModalRecebido(); });
});
