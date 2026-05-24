const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const { db }  = require('../config/firebase');

const BLING_CLIENT_ID     = process.env.BLING_CLIENT_ID     || '';
const BLING_CLIENT_SECRET = process.env.BLING_CLIENT_SECRET || '';
const BLING_REDIRECT_URI  = process.env.BLING_REDIRECT_URI  || '';

const BLING_AUTH_URL  = 'https://www.bling.com.br/Api/v3/oauth/authorize';
const BLING_TOKEN_URL = 'https://www.bling.com.br/Api/v3/oauth/token';
const BLING_API_BASE  = 'https://api.bling.com.br/Api/v3';

// Helpers
function nowMs() { return Date.now(); }
function yyyymmdd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
function padSeq(num, size) {
  let s = num + "";
  while (s.length < size) s = "0" + s;
  return s;
}
function safeTrim(v) {
  if (v == null) return '';
  return String(v).trim();
}

const ORDER_SEQ_PAD = Number(process.env.ORDER_SEQ_PAD || 4);

// Token helpers
async function blingGetToken() {
  const doc = await db.collection('bling_tokens').doc('main').get();
  return doc.exists ? doc.data() : null;
}

async function blingSaveToken(d) {
  await db.collection('bling_tokens').doc('main').set({
    accessToken:  d.access_token,
    refreshToken: d.refresh_token,
    expiresAt:    Date.now() + (d.expires_in || 21600) * 1000,
    updatedAtMs:  Date.now(),
  }, { merge: true });
}

async function blingRefreshToken(refreshToken) {
  const creds = Buffer.from(`${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(BLING_TOKEN_URL, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded', 
      'Authorization': `Basic ${creds}`,
      'enable-jwt': '1'
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
  });
  if (!res.ok) throw new Error(`Bling refresh failed: ${res.status}`);
  return res.json();
}

async function blingEnsureToken() {
  let tok = await blingGetToken();
  if (!tok) throw new Error('bling_not_authorized');
  if (Date.now() > tok.expiresAt - 300_000) {
    const refreshed = await blingRefreshToken(tok.refreshToken);
    await blingSaveToken(refreshed);
    tok = await blingGetToken();
  }
  return tok.accessToken;
}

async function blingFetch(path) {
  const token = await blingEnsureToken();
  const res = await fetch(`${BLING_API_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  });
  if (res.status === 401) throw new Error('bling_not_authorized');
  const text = await res.text();
  if (!res.ok) throw new Error(`Bling ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

function detectarMkt(nf) {
  const loja = (nf.loja?.descricao || nf.loja?.nome || nf.origem?.descricao || '').toLowerCase();
  const nome = (nf.contato?.nome || '').toLowerCase();
  if (loja.includes('mercado') || loja.includes('meli') || loja.includes('mlb')) return 'MERCADO_LIVRE';
  if (loja.includes('shopee')) return 'SHOPEE';
  if (nome.match(/\([a-z0-9._-]+\)$/)) return 'MERCADO_LIVRE';
  return 'OUTROS';
}

const SITUACOES_NFE = {
  1: 'Pendente',
  2: 'Cancelada',
  3: 'Aguardando recibo',
  4: 'Rejeitada',
  5: 'Autorizada',
  6: 'Emitida DANFE',
  7: 'Registrada',
  8: 'Aguardando protocolo',
  9: 'Denegada',
  10: 'Consulta situação',
  11: 'Bloqueada'
};

function getSituacaoDescricao(sit) {
  if (typeof sit === 'object' && sit !== null) {
    return sit.descricao || SITUACOES_NFE[sit.id] || '';
  }
  return SITUACOES_NFE[sit] || String(sit || '');
}

function isSemDanfe(sitDesc) {
  const s = (sitDesc || '').toLowerCase();
  if (s.includes('cancelada')) return false;
  if (s.includes('sem danfe')) return true;
  if (s.includes('emitida') || s.includes('danfe')) return false;
  return true; // 'autorizada', 'pendente', etc.
}

function isComDanfe(sitDesc) {
  if (isSemDanfe(sitDesc)) return false;
  const s = (sitDesc || '').toLowerCase();
  return s.includes('emitida') || s.includes('danfe');
}

function matchCanal(canalId, mkt) {
  const m = (mkt || '').toLowerCase();
  switch (canalId) {
    case 'ml':     return (m.includes('mercado') || m.includes('meli') || m.includes('mlb')) && !m.includes('full');
    case 'mlfull': return m.includes('full');
    case 'shopee': return m.includes('shopee');
    case 'magalu': return m.includes('magalu');
    case 'tiktok': return m.includes('tiktok');
    default:       return true;
  }
}

// ── STATUS ────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const tok = await blingGetToken();
    if (!tok) return res.json({ authorized: false });
    res.json({ authorized: true, expired: Date.now() > tok.expiresAt, updatedAtMs: tok.updatedAtMs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── INICIAR OAUTH ─────────────────────────────────────────────────
router.get('/auth', (req, res) => {
  if (!BLING_CLIENT_ID) return res.status(500).json({ error: 'BLING_CLIENT_ID não configurado' });
  const p = new URLSearchParams({ response_type: 'code', client_id: BLING_CLIENT_ID, redirect_uri: BLING_REDIRECT_URI, state: 'expedicao_pro' });
  res.redirect(`${BLING_AUTH_URL}?${p}`);
});

// ── CALLBACK OAUTH ────────────────────────────────────────────────
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/bling?error=auth_denied');
  try {
    const creds = Buffer.from(`${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`).toString('base64');
    const tokenRes = await fetch(BLING_TOKEN_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded', 
        'Authorization': `Basic ${creds}`,
        'enable-jwt': '1'
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: BLING_REDIRECT_URI }).toString(),
    });
    if (!tokenRes.ok) { console.error('[bling/callback]', await tokenRes.text()); return res.redirect('/bling?error=token_failed'); }
    await blingSaveToken(await tokenRes.json());
    res.redirect('/bling?success=1');
  } catch(e) { console.error('[bling/callback]', e); res.redirect('/bling?error=callback_error'); }
});

// ── DESCONECTAR ───────────────────────────────────────────────────
router.post('/disconnect', async (req, res) => {
  try {
    await db.collection('bling_tokens').doc('main').delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── LISTAR NFs DO DIA ─────────────────────────────────────────────
router.get('/pedidos', async (req, res, next) => {
  try {
    const hoje    = new Date().toISOString().split('T')[0];
    const dataInicio = req.query.dataInicio || req.query.data || hoje;
    const dataFim    = req.query.dataFim    || req.query.data || hoje;
    const pagina     = Number(req.query.pagina || 1);

    const params = new URLSearchParams({
      dataEmissaoInicial: `${dataInicio} 00:00:00`,
      dataEmissaoFinal:   `${dataFim} 23:59:59`,
      pagina,
      limite: 100
    });

    const resp  = await blingFetch(`/nfe?${params}`);
    const notas = resp.data || [];

    let items = notas.map(n => ({
      id:          n.id,
      numero:      n.numero,
      numeroPedido: null,
      dataEmissao: n.dataEmissao,
      situacao:    getSituacaoDescricao(n.situacao),
      cliente:     { nome: n.contato?.nome || '' },
      marketplace: detectarMkt(n),
      valorTotal:  n.valorTotal || 0,
      itens:       [],
      detalhado:   false,
    }));

    // Filtragem local retrocompatível para bling.html antigo
    const situacaoFiltro = req.query.situacao;
    const lojaFiltro = req.query.loja;

    if (situacaoFiltro && situacaoFiltro !== 'all') {
      if (situacaoFiltro === '5') {
        items = items.filter(item => isSemDanfe(item.situacao));
      } else if (situacaoFiltro === '7') {
        items = items.filter(item => isComDanfe(item.situacao));
      }
    }

    if (lojaFiltro && lojaFiltro !== 'all') {
      items = items.filter(item => matchCanal(lojaFiltro, item.marketplace));
    }

    res.json({ items, total: items.length, dataInicio, dataFim });
  } catch(err) {
    if (err.message === 'bling_not_authorized') return res.status(401).json({ error: 'bling_not_authorized' });
    console.error('[GET /bling/pedidos]', err);
    next(err);
  }
});

// ── DETALHES DE UMA NF (com itens) ───────────────────────────────
router.get('/pedidos/:id', async (req, res, next) => {
  try {
    const resp = await blingFetch(`/nfe/${req.params.id}`);
    const n    = resp.data || resp;

    const numeroPedido = n.numeroPedidoLoja || n.numeroPedido || null;
    const mkt2         = detectarMkt(n);
    const mlOrderId2   = (mkt2 === 'MERCADO_LIVRE' && numeroPedido) ? String(numeroPedido) : null;

    const item = {
      id:           n.id,
      numero:       n.numero,
      numeroPedido,
      mlOrderId:    mlOrderId2,
      dataEmissao:  n.dataEmissao,
      situacao:     getSituacaoDescricao(n.situacao),
      cliente:      { nome: n.contato?.nome || '', email: n.contato?.email || '' },
      marketplace:  mkt2,
      valorTotal:   n.valorTotal || n.totalProdutos || 0,
      linkDanfe:    n.linkDanfe || null,
      linkPDF:      n.linkPDF || null,
      detalhado:    true,
      itens: (n.itens || []).map(it => ({
        sku:   safeTrim(it.codigo || it.produto?.codigo || ''),
        nome:  safeTrim(it.descricao || it.produto?.descricao || ''),
        qty:   Number(it.quantidade ?? it.qty ?? 1),
        preco: Number(it.valor ?? it.valorUnitario ?? 0),
      })),
    };

    res.json({ item });
  } catch(err) {
    if (err.message === 'bling_not_authorized') return res.status(401).json({ error: 'bling_not_authorized' });
    console.error('[GET /bling/pedidos/:id]', err);
    next(err);
  }
});

// ── GET /bling/danfe/:id ───────────────────────────────────────
router.get('/danfe/:id', async (req, res, next) => {
  const nfId = req.params.id;
  try {
    const token = await blingEnsureToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

    const resp = await fetch(`${BLING_API_BASE}/nfe/${nfId}`, { headers });
    if (!resp.ok) return res.status(resp.status).json({ error: `Erro Bling: ${resp.status}` });

    const nfe = await resp.json();
    const data = nfe.data || {};
    const sitDesc = getSituacaoDescricao(data.situacao).toLowerCase();

    if (!sitDesc.includes('emitida') && !sitDesc.includes('danfe') && !sitDesc.includes('autorizada')) {
      return res.status(404).json({ error: 'danfe_nao_disponivel', situacao: sitDesc });
    }

    const danfeRes = await fetch(`${BLING_API_BASE}/nfe/${nfId}/pdf`, { headers });
    if (!danfeRes.ok) return res.status(danfeRes.status).json({ error: `Erro PDF Bling: ${danfeRes.status}` });

    const danfe = await danfeRes.json();
    if (danfe?.data?.pdf) {
      return res.json({ pdf: danfe.data.pdf });
    } else if (danfe?.data?.link) {
      return res.json({ pdfUrl: danfe.data.link });
    }

    res.status(404).json({ error: 'pdf_not_found_in_payload' });
  } catch (err) {
    console.error(`[GET /bling/danfe/${nfId}]`, err.message);
    next(err);
  }
});

// ── GET /bling/etiqueta/:nfeId ─────────────────────────────────
router.get('/etiqueta/:nfeId', async (req, res, next) => {
  const nfeId = req.params.nfeId;
  try {
    const token = await blingEnsureToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
    
    console.log(`[GET /bling/etiqueta/${nfeId}] Consultando etiquetas no Bling`);
    const resp = await fetch(`${BLING_API_BASE}/logisticas/etiquetas?idsNfes[]=${nfeId}`, { headers });
    
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: `Erro Bling Etiquetas: ${resp.status}`, details: text });
    }
    
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    if (err.message === 'bling_not_authorized') return res.status(401).json({ error: 'bling_not_authorized' });
    console.error(`[GET /bling/etiqueta/${nfeId}]`, err.message);
    next(err);
  }
});


// ── GET /bling/debug/danfe/:id ──────────────────────────────────
router.get('/debug/danfe/:id', async (req, res, next) => {
  try {
    const raw = await blingFetch(`/nfe/${req.params.id}`);
    res.json(raw);
  } catch(err) {
    next(err);
  }
});

// ── GET /bling/product-images ────────────────────────────────────
router.get('/product-images', async (req, res, next) => {
  const { ean, sku } = req.query;
  if (!ean && !sku) return res.status(400).json({ error: 'ean ou sku obrigatório' });
  try {
    const token = await blingEnsureToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
    const term = ean ? `gtin=${encodeURIComponent(ean)}` : `codigo=${encodeURIComponent(sku)}`;
    
    const { data: listData } = await axios.get(`${BLING_API_BASE}/produtos?${term}`, { headers });
    if (!listData?.data?.length) return res.json({ images: [] });
    
    const prodId = listData.data[0].id;
    const { data: detData } = await axios.get(`${BLING_API_BASE}/produtos/${prodId}`, { headers });
    const p = detData.data || {};
    
    let images = [];
    if (p.imagemURL) images.push(p.imagemURL);
    if (Array.isArray(p.imagens)) {
      p.imagens.forEach(img => {
        const u = typeof img === 'string' ? img : img.link || img.url;
        if (u && !images.includes(u)) images.push(u);
      });
    }
    if (Array.isArray(p.midia)) {
      p.midia.forEach(m => {
        const u = m.link || m.url;
        if (u && !images.includes(u)) images.push(u);
      });
    }
    res.json({ images });
  } catch (err) {
    console.error('[GET /bling/product-images]', err.message);
    next(err);
  }
});

// ── DEBUG ENDPOINTS ──────────────────────────────────────────────
router.get('/debug/nfe/:id', async (req, res, next) => {
  try {
    const raw = await blingFetch(`/nfe/${req.params.id}`);
    res.json(raw);
  } catch(err) {
    next(err);
  }
});

router.get('/debug/probe', async (req, res, next) => {
  try {
    const token = await blingEnsureToken();
    res.json({ ok: true, tokenPreview: token.slice(0, 10) + '...' });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/debug/lojas', async (req, res, next) => {
  try {
    const r = await blingFetch('/lojas');
    res.json(r);
  } catch (err) {
    next(err);
  }
});

router.get('/debug/lista', async (req, res, next) => {
  try {
    const r = await blingFetch('/nfe');
    res.json(r);
  } catch (err) {
    next(err);
  }
});

// ── CLONAR NF → CRIAR PEDIDO ─────────────────────────────────────
router.post('/clonar', async (req, res, next) => {
  try {
    const { marketplace, itens, clienteNome, numeroPedido, mlOrderId, logistica } = req.body;
    const blingNfId = String(req.body.blingNfId || '').replace(/\D/g, '') || null;

    if (!itens || !itens.length) return res.status(400).json({ error: 'Nenhum item enviado. Abra os itens da NF antes de clonar.' });

    const itensComSku = itens.filter(it => safeTrim(it.sku));
    const itensSemSku = itens.filter(it => !safeTrim(it.sku));

    if (!itensComSku.length) return res.status(400).json({
      error: 'Nenhum item com SKU encontrado. Verifique se os produtos têm código cadastrado no Bling.',
      itensSemSku: itensSemSku.map(it => it.nome),
    });

    const skus      = itensComSku.map(it => safeTrim(it.sku));
    const prodRefs  = skus.map(sku => db.collection('products').doc(sku));
    const prodSnaps = await db.getAll(...prodRefs);
    const prodMap   = new Map();
    for (const s of prodSnaps) if (s.exists) prodMap.set(s.id, s.data());

    const cart         = [];
    const skusFaltando = [];

    for (const it of itensComSku) {
      const sku = safeTrim(it.sku);
      const p   = prodMap.get(sku);
      if (!p) {
        // Fallback: se o produto não estiver no banco, cria o item com os dados do Bling
        skusFaltando.push(sku);
        cart.push({
          sku,
          nameShort:  (it.nome || sku).slice(0, 48),
          qty:        Number(it.qty || 1),
          ean:        '',
          eanBox:     '',
          bin:        '',
          image:      '/assets/placeholder.png',
          images:     [],
          checkedQty: 0,
        });
      } else {
        cart.push({
          sku,
          nameShort:  (p.name || it.nome || sku).slice(0, 48),
          qty:        Number(it.qty || 1),
          ean:        p.ean    || '',
          eanBox:     p.eanBox || '',
          bin:        p.bin    || '',
          image:      '/assets/placeholder.png',
          images:     p.images || [],
          checkedQty: 0,
        });
      }
    }

    const terminalId  = safeTrim(req.header('x-terminal-id')) || `bling_clone`;
    const createdAtMs = nowMs();
    const day         = yyyymmdd();
    const counterRef  = db.collection('meta').doc(`counters_${day}`);

    const result = await db.runTransaction(async tx => {
      const cSnap   = await tx.get(counterRef);
      const seq     = (cSnap.exists ? Number(cSnap.data().seq || 0) : 0) + 1;
      const orderId = `ORD_${day}_${padSeq(seq, ORDER_SEQ_PAD)}`;
      tx.set(counterRef, { docType: 'counter', day, seq, updatedAtMs: createdAtMs }, { merge: true });
      tx.set(db.collection('orders').doc(orderId), {
        docType:       'order',
        source:        'bling',
        blingNfId:     blingNfId   || null,
        numeroPedido:  numeroPedido || null,
        mlOrderId:     mlOrderId   || null,
        logistica:     logistica   || 'agency',
        marketplace:   marketplace || 'OUTROS',
        status:        'pending',
        clienteNome:   safeTrim(clienteNome) || '',
        isPriority:    logistica === 'flex',
        items:         cart,
        allowConfirmOnlyIfAllChecked: true,
        createdAtMs,
        updatedAtMs:   createdAtMs,
        lockedBy:      terminalId,
        lockedAt:      createdAtMs,
        skusFaltando:  skusFaltando.length ? skusFaltando : null,
      });
      return { orderId };
    });

    res.json({ ok: true, orderId: result.orderId, skusFaltando, itensSemSku: itensSemSku.map(it=>it.nome), cartCount: cart.length });
  } catch(err) {
    console.error('[POST /bling/clonar]', err);
    next(err);
  }
});

// ── CLONAR NFs EM LOTE ───────────────────────────────────────────
router.post('/clonar-lote', async (req, res, next) => {
  try {
    const { pedidos } = req.body;
    if (!Array.isArray(pedidos) || !pedidos.length) {
      return res.status(400).json({ error: 'Nenhum pedido enviado para clonagem.' });
    }

    const allSkusSet = new Set();
    for (const p of pedidos) {
      if (Array.isArray(p.itens)) {
        for (const it of p.itens) {
          if (it.sku) allSkusSet.add(safeTrim(it.sku));
        }
      }
    }

    const allSkus = Array.from(allSkusSet);
    const prodMap = new Map();
    if (allSkus.length > 0) {
      const prodRefs = allSkus.map(sku => db.collection('products').doc(sku));
      const prodSnaps = await db.getAll(...prodRefs);
      for (const s of prodSnaps) if (s.exists) prodMap.set(s.id, s.data());
    }

    const terminalId  = safeTrim(req.header('x-terminal-id')) || `bling_clone_lote`;
    const createdAtMs = nowMs();
    const day         = yyyymmdd();
    const counterRef  = db.collection('meta').doc(`counters_${day}`);

    const result = await db.runTransaction(async tx => {
      const cSnap   = await tx.get(counterRef);
      const startSeq = cSnap.exists ? Number(cSnap.data().seq || 0) : 0;
      let seq = startSeq;

      const createdOrders = [];

      for (let i = 0; i < pedidos.length; i++) {
        const p = pedidos[i];
        const blingNfId = String(p.blingNfId || '').replace(/\D/g, '') || null;
        
        const itens = p.itens || [];
        const itensComSku = itens.filter(it => safeTrim(it.sku));
        
        if (!itensComSku.length) continue;

        const cart = [];
        const skusFaltando = [];

        for (const it of itensComSku) {
          const sku = safeTrim(it.sku);
          const prodData = prodMap.get(sku);
          if (!prodData) {
            skusFaltando.push(sku);
            cart.push({
              sku,
              nameShort:  (it.nome || sku).slice(0, 48),
              qty:        Number(it.qty || 1),
              ean:        '',
              eanBox:     '',
              bin:        '',
              image:      '/assets/placeholder.png',
              images:     [],
              checkedQty: 0,
            });
          } else {
            cart.push({
              sku,
              nameShort:  (prodData.name || it.nome || sku).slice(0, 48),
              qty:        Number(it.qty || 1),
              ean:        prodData.ean    || '',
              eanBox:     prodData.eanBox || '',
              bin:        prodData.bin    || '',
              image:      '/assets/placeholder.png',
              images:     prodData.images || [],
              checkedQty: 0,
            });
          }
        }

        seq++;
        const orderId = `ORD_${day}_${padSeq(seq, ORDER_SEQ_PAD)}`;

        tx.set(db.collection('orders').doc(orderId), {
          docType:       'order',
          source:        'bling',
          blingNfId:     blingNfId   || null,
          numeroPedido:  p.numeroPedido || null,
          mlOrderId:     p.mlOrderId   || null,
          logistica:     p.logistica   || 'agency',
          marketplace:   p.marketplace || 'OUTROS',
          status:        'pending',
          clienteNome:   safeTrim(p.clienteNome) || '',
          isPriority:    p.logistica === 'flex',
          items:         cart,
          allowConfirmOnlyIfAllChecked: true,
          createdAtMs,
          updatedAtMs:   createdAtMs,
          lockedBy:      terminalId,
          lockedAt:      createdAtMs,
          skusFaltando:  skusFaltando.length ? skusFaltando : null,
        });

        createdOrders.push({ orderId, blingNfId });
      }

      tx.set(counterRef, { docType: 'counter', day, seq, updatedAtMs: createdAtMs }, { merge: true });

      return { createdOrders };
    });

    res.json({ ok: true, createdCount: result.createdOrders.length, orders: result.createdOrders });
  } catch (err) {
    console.error('[POST /bling/clonar-lote]', err);
    next(err);
  }
});

module.exports = router;
