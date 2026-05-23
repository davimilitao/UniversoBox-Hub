const express = require('express');
const router  = express.Router();
const { db }  = require('../config/firebase');
const { requireFirebaseAuth } = require('../middleware/requireFirebaseAuth');

const ML_CLIENT_ID     = process.env.ML_CLIENT_ID     || '';
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET || '';
const ML_REDIRECT_URI  = process.env.ML_REDIRECT_URI  || '';

const ML_TOKEN_URL     = 'https://api.mercadolibre.com/oauth/token';
const ML_AUTH_URL      = 'https://auth.mercadolivre.com.br/authorization';
const ML_API_BASE      = 'https://api.mercadolibre.com';
const BLING_API_BASE  = 'https://api.bling.com.br/Api/v3';

// Helpers
function safeTrim(v) {
  if (v == null) return '';
  return String(v).trim();
}

function getTodayBR() {
  const now = new Date();
  const br  = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const p = {};
  for (const part of br) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}`;
}

async function resolveLocalStatus(orderId) {
  try {
    const doc = await db.collection('ml_order_status').doc(String(orderId)).get();
    if (doc.exists) return doc.data().status || 'imprimir';
  } catch (_) {}
  return 'imprimir';
}

async function saveLocalStatus(orderId, status) {
  await db.collection('ml_order_status').doc(String(orderId)).set({
    status,
    updatedAtMs: Date.now(),
  }, { merge: true });
}

function detectLogistica(order) {
  const tags    = order.tags || [];
  const logType = order.shipping?.logistic_type || '';
  const mode    = order.shipping?.shipping_option?.shipping_method_type || '';

  if (tags.includes('fulfillment') || logType === 'fulfillment')  return 'fulfillment';
  if (tags.includes('self_service') || logType === 'self_service') return 'flex';
  if (mode === 'pickup_point' || logType === 'pickup')             return 'pickup';
  return 'agency';
}

function formatTimeBR(isoStr) {
  if (!isoStr) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(isoStr));
  } catch (_) { return ''; }
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Token helper
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
  const creds = Buffer.from(`${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
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

// ML token helpers
async function mlGetToken() {
  const doc = await db.collection('ml_tokens').doc('main').get();
  return doc.exists ? doc.data() : null;
}

async function mlSaveToken(d) {
  const data = {
    accessToken:  d.access_token,
    expiresAt:    Date.now() + (d.expires_in || 21600) * 1000,
    updatedAtMs:  Date.now(),
  };
  if (d.refresh_token) data.refreshToken = d.refresh_token;
  await db.collection('ml_tokens').doc('main').set(data, { merge: true });
}

async function mlRefreshToken(refreshToken) {
  const res = await fetch(ML_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      refresh_token: refreshToken,
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ML refresh failed: ${res.status} — ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function mlEnsureToken() {
  let tok = await mlGetToken();
  if (!tok) throw Object.assign(new Error('ml_not_authorized'), { statusCode: 401 });
  if (Date.now() > tok.expiresAt - 300_000) {
    const refreshed = await mlRefreshToken(tok.refreshToken);
    await mlSaveToken(refreshed);
    tok = await mlGetToken();
  }
  return tok.accessToken;
}

// ── OAUTH ROUTES ─────────────────────────────────────────────────────────────
router.get('/token', async (req, res) => {
  try {
    const token = await mlEnsureToken();
    res.json({ access_token: token });
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

router.get('/status', async (req, res) => {
  try {
    const tok = await mlGetToken();
    if (!tok) return res.json({ authorized: false });
    res.json({ authorized: true, expired: Date.now() > tok.expiresAt, updatedAtMs: tok.updatedAtMs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/auth', (req, res) => {
  if (!ML_CLIENT_ID) return res.status(500).json({ error: 'ML_CLIENT_ID não configurado' });
  const p = new URLSearchParams({ response_type: 'code', client_id: ML_CLIENT_ID, redirect_uri: ML_REDIRECT_URI });
  res.redirect(`${ML_AUTH_URL}?${p}`);
});

router.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/ml-dashboard?error=auth_denied');
  try {
    const tokenRes = await fetch(ML_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     ML_CLIENT_ID,
        client_secret: ML_CLIENT_SECRET,
        code,
        redirect_uri:  ML_REDIRECT_URI
      }).toString(),
    });
    if (!tokenRes.ok) { console.error('[ml/callback]', await tokenRes.text()); return res.redirect('/ml-dashboard?error=token_failed'); }
    await mlSaveToken(await tokenRes.json());
    res.redirect('/ml-dashboard?success=1');
  } catch(e) { console.error('[ml/callback]', e); res.redirect('/ml-dashboard?error=callback_error'); }
});

router.post('/disconnect', async (req, res) => {
  try {
    await db.collection('ml_tokens').doc('main').delete();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /ml/item/:mlbId ──────────────────────────────────────────────────────
router.get('/item/:mlbId', async (req, res, next) => {
  try {
    let accessToken = '';
    try { accessToken = await mlEnsureToken(); } catch (_) {}
    const headers = accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {};
    const mlbId   = req.params.mlbId;

    const [itemRes, descRes] = await Promise.all([
      fetchWithTimeout(`${ML_API_BASE}/items/${mlbId}`, { headers }),
      fetchWithTimeout(`${ML_API_BASE}/items/${mlbId}/description`, { headers }),
    ]);

    if (!itemRes.ok) return res.status(itemRes.status).json({ error: `Erro MLB: ${itemRes.status}` });

    res.json({
      item:      await itemRes.json(),
      description: descRes.ok ? await descRes.json() : null,
    });
  } catch (err) {
    console.error('[GET /ml/item]', err.message);
    next(err);
  }
});

// ── GET /ml/busca-ean/:ean ──────────────────────────────────────────────────
router.get('/busca-ean/:ean', async (req, res, next) => {
  try {
    let accessToken = '';
    try { accessToken = await mlEnsureToken(); } catch (_) {}
    const headers = accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {};
    const ean     = req.params.ean;

    const [prodRes, searchRes] = await Promise.all([
      fetchWithTimeout(`${ML_API_BASE}/products/search?site_id=MLB&q=${ean}&limit=5`, { headers }),
      fetchWithTimeout(`${ML_API_BASE}/sites/MLB/search?q=${ean}&limit=5`, { headers }),
    ]);

    res.json({
      products: prodRes.ok   ? (await prodRes.json()).results : [],
      results:  searchRes.ok  ? (await searchRes.json()).results : [],
    });
  } catch (err) {
    console.error('[GET /ml/busca-ean]', err.message);
    next(err);
  }
});

// ── DIAGNOSTICS ─────────────────────────────────────────────────────────────
router.get('/diag', async (req, res) => {
  try {
    let accessToken = '';
    try { accessToken = await mlEnsureToken(); } catch (e) { return res.json({ ok: false, error: e.message }); }
    const headers = { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' };
    const r = await fetchWithTimeout(`${ML_API_BASE}/sites/MLB`, { headers });
    res.json({ ok: r.ok, status: r.status, data: await r.json() });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

router.get('/diag-orders', async (req, res) => {
  try {
    let token = '';
    try { token  = await mlEnsureToken(); } catch (e) { return res.json({ error: 'Auth failed', details: e.message }); }
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
    const me = await fetchWithTimeout(`${ML_API_BASE}/users/me`, { headers }, 8000).then(r => r.json());
    const userId = me.id;

    const urls = [
      { key: 'A_recent_no_filter',    url: `${ML_API_BASE}/orders/search?seller=${userId}&limit=5` },
      { key: 'B_date_created_today',  url: `${ML_API_BASE}/orders/search?seller=${userId}&order.date_created.from=2026-03-27T00:00:00.000-03:00&limit=5` },
      { key: 'C_sort_date_desc',      url: `${ML_API_BASE}/orders/search?seller=${userId}&sort=date_desc&limit=5` },
      { key: 'D_q_paid',              url: `${ML_API_BASE}/orders/search?seller=${userId}&q=paid&limit=5` },
    ];

    const results = {};
    for (const t of urls) {
      const r   = await fetchWithTimeout(t.url, { headers }, 10000);
      const data = await r.json().catch(() => ({}));
      results[t.key] = { status: r.status, count: data.results?.length || 0, data };
    }
    res.json({ me, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/ml/orders/today ─────────────────────────────────────────────────
router.get('/orders/today', async (req, res, next) => {
  try {
    const token   = await mlEnsureToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

    const meRes  = await fetchWithTimeout(`${ML_API_BASE}/users/me`, { headers }, 8000);
    const meData = await meRes.json();
    const userId = meData.id;
    if (!userId) throw Object.assign(new Error('Não foi possível obter o ID do vendedor ML'), { statusCode: 502 });

    const today = getTodayBR();
    const urlPaid  = `${ML_API_BASE}/orders/search?seller=${userId}&order.status=paid&order.date_created.from=${today}T00:00:00.000-03:00&limit=50`;
    const urlReady = `${ML_API_BASE}/orders/search?seller=${userId}&order.status=paid&shipping.status=ready_to_ship&limit=50`;

    const [rPaid, rReady] = await Promise.allSettled([
      fetchWithTimeout(urlPaid,  { headers }, 12000),
      fetchWithTimeout(urlReady, { headers }, 12000),
    ]);

    const seen   = new Set();
    const orders = [];

    async function processRes(settled) {
      if (settled.status !== 'fulfilled' || !settled.value.ok) return;
      const data = await settled.value.json();
      for (const o of (data.results || [])) {
        if (seen.has(o.id)) continue;
        seen.add(o.id);
        orders.push(o);
      }
    }
    await processRes(rPaid);
    await processRes(rReady);

    const statusList = await Promise.all(orders.map(o => resolveLocalStatus(o.id)));

    const enriched = orders.map((o, i) => ({
      ...o,
      logistica:     detectLogistica(o),
      _localStatus:  statusList[i],
      _createdTime:  formatTimeBR(o.date_created),
    }));

    const statusOrder = { imprimir: 0, expedir: 1, enviado: 2, cancelado: 3 };
    enriched.sort((a, b) =>
      (statusOrder[a._localStatus] ?? 9) - (statusOrder[b._localStatus] ?? 9) ||
      new Date(b.date_created) - new Date(a.date_created)
    );

    res.json({ orders: enriched, total: enriched.length, date: today });
  } catch (err) {
    console.error('[GET /api/ml/orders/today]', err.message);
    next(err);
  }
});

// ── POST /api/ml/orders/:orderId/status ──────────────────────────────────────
router.post('/orders/:orderId/status', async (req, res, next) => {
  try {
    const orderId = safeTrim(req.params.orderId);
    const status  = safeTrim(req.body.status);

    const validStatus = ['imprimir', 'expedir', 'enviado', 'cancelado'];
    if (!validStatus.includes(status)) {
      return res.status(400).json({ error: `Status inválido. Use: ${validStatus.join(' | ')}` });
    }

    await saveLocalStatus(orderId, status);
    res.json({ ok: true, orderId, status });
  } catch (err) {
    console.error('[POST /api/ml/orders/:orderId/status]', err.message);
    next(err);
  }
});

// ── GET /api/ml/orders/:orderId/label ────────────────────────────────────────
router.get('/orders/:orderId/label', async (req, res, next) => {
  try {
    const orderId = safeTrim(req.params.orderId);
    const token   = await mlEnsureToken();
    const headers = { 'Authorization': `Bearer ${token}` };

    async function tryDownloadUrl(url, label) {
      try {
        const r = await fetchWithTimeout(url, { headers: { 'Authorization': `Bearer ${token}` } }, 10000);
        const ct = r.headers.get('content-type') || '';
        if (r.ok && ct.includes('pdf')) {
          const buf = await r.arrayBuffer();
          return { format: 'pdf', pdf: Buffer.from(buf).toString('base64'), via: label };
        }
      } catch (_) {}
      return null;
    }

    async function tryLabelEndpoint(url, label) {
      console.log(`[ml/label] tentando (${label}): ${url}`);
      const r  = await fetchWithTimeout(url, { headers }, 12000);
      const ct = r.headers.get('content-type') || '';
      const st = r.status;
      console.log(`[ml/label] (${label}) status=${st} ct=${ct}`);

      if (!r.ok) return null;

      if (ct.includes('pdf') || ct.includes('octet')) {
        const buf = await r.arrayBuffer();
        const sig = Buffer.from(buf.slice(0, 4)).toString('ascii');
        if (sig === '%PDF') {
          return { format: 'pdf', pdf: Buffer.from(buf).toString('base64'), via: label };
        }
        const txt = Buffer.from(buf).toString('utf8');
        if (txt.includes('^XA')) {
          return { format: 'zpl', zpl: txt, via: label };
        }
      }

      const raw = await r.text();
      if (raw.trimStart().startsWith('^XA') || (ct.includes('zpl') && raw.includes('^XA'))) {
        return { format: 'zpl', zpl: raw, via: label };
      }

      let data = {};
      try { data = JSON.parse(raw); } catch {}

      const zplInline = data?.zpl || data?.content || data?.label || data?.data?.zpl;
      if (typeof zplInline === 'string' && zplInline.includes('^XA')) {
        return { format: 'zpl', zpl: zplInline, via: label };
      }

      const pdfUrl =
        data?.url || data?.data?.url ||
        data?.link || data?.data?.link ||
        data?.print_url || data?.label_url ||
        (Array.isArray(data) && data[0]?.url) ||
        (Array.isArray(data?.content) && data.content[0]?.url) || null;

      if (pdfUrl) {
        const downloaded = await tryDownloadUrl(pdfUrl, `${label}+url`);
        if (downloaded) return downloaded;
        return { format: 'pdf_url', pdfUrl, via: label };
      }
      return null;
    }

    const orderRes = await fetchWithTimeout(`${ML_API_BASE}/orders/${orderId}`, { headers: { ...headers, 'Accept': 'application/json' } }, 8000);
    if (!orderRes.ok) {
      const body = await orderRes.json().catch(() => ({}));
      throw Object.assign(new Error(body.message || `Pedido ${orderId} não encontrado`), { statusCode: 404 });
    }
    const orderData  = await orderRes.json();
    const shipmentId = orderData.shipping?.id;
    if (!shipmentId) throw Object.assign(new Error('Pedido sem envio associado'), { statusCode: 400 });

    const shipRes = await fetchWithTimeout(`${ML_API_BASE}/shipments/${shipmentId}`, { headers: { ...headers, 'Accept': 'application/json' } }, 8000).catch(() => null);
    if (shipRes?.ok) {
      const ship = await shipRes.json().catch(() => ({}));
      const directUrl = ship?.label?.url || ship?.print_label_url || ship?.shipping_label_url;
      if (directUrl) {
        const downloaded = await tryDownloadUrl(directUrl, 'shipment_direct_url');
        if (downloaded) return res.json({ ok: true, ...downloaded, shipmentId, orderId });
        return res.json({ ok: true, format: 'pdf_url', pdfUrl: directUrl, shipmentId, orderId, via: 'shipment_direct_url' });
      }
    }

    const attempts = [
      [`${ML_API_BASE}/shipments/${shipmentId}/labels`, 'individual_noparams'],
      [`${ML_API_BASE}/shipments/${shipmentId}/labels?response_type=zpl2`, 'individual_zpl2'],
      [`${ML_API_BASE}/shipments/${shipmentId}/labels?response_type=pdf2`, 'individual_pdf2'],
      [`${ML_API_BASE}/shipments/${shipmentId}/labels?response_type=pdf`, 'individual_pdf'],
      [`${ML_API_BASE}/shipments/labels?shipment_ids=${shipmentId}&response_type=zpl2`, 'batch_zpl2'],
      [`${ML_API_BASE}/shipments/labels?shipment_ids=${shipmentId}&response_type=pdf2`, 'batch_pdf2'],
      [`${ML_API_BASE}/shipments/labels?shipment_ids=${shipmentId}`, 'batch_noparams'],
    ];

    for (const [url, label] of attempts) {
      const result = await tryLabelEndpoint(url, label);
      if (result) return res.json({ ok: true, ...result, shipmentId, orderId });
    }

    const mlWebPrintUrl = `https://www.mercadolibre.com.br/envios/label/print?shipmentIds=${shipmentId}&caller=SP&label_type=forward`;
    return res.status(422).json({
      error:      'label_indisponivel',
      message:    'Não foi possível obter a etiqueta via API. Clique em "Abrir no ML" para imprimir pelo site.',
      mlWebUrl:   mlWebPrintUrl,
      shipmentId,
      orderId,
    });
  } catch (err) {
    console.error('[GET /api/ml/orders/:orderId/label]', err.message);
    next(err);
  }
});

// ── GET /api/ml/debug/label/:orderId ─────────────────────────────────────────
router.get('/debug/label/:orderId', requireFirebaseAuth, async (req, res, next) => {
  try {
    const orderId = safeTrim(req.params.orderId);
    const token   = await mlEnsureToken();
    const h       = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

    const orderRes = await fetchWithTimeout(`${ML_API_BASE}/orders/${orderId}`, { headers: h }, 8000);
    const orderData = await orderRes.json().catch(() => ({}));
    const shipmentId = orderData.shipping?.id || null;

    if (!shipmentId) {
      return res.json({ orderId, shipmentId: null, orderStatus: orderRes.status, orderBody: orderData });
    }

    const shipRes  = await fetchWithTimeout(`${ML_API_BASE}/shipments/${shipmentId}`, { headers: h }, 8000);
    const shipData = await shipRes.json().catch(() => ({}));

    const variants = [
      `${ML_API_BASE}/shipments/${shipmentId}/labels`,
      `${ML_API_BASE}/shipments/${shipmentId}/labels?response_type=zpl2`,
      `${ML_API_BASE}/shipments/${shipmentId}/labels?response_type=pdf2`,
      `${ML_API_BASE}/shipments/${shipmentId}/labels?response_type=pdf`,
      `${ML_API_BASE}/shipments/labels?shipment_ids=${shipmentId}&response_type=zpl2`,
      `${ML_API_BASE}/shipments/labels?shipment_ids=${shipmentId}&response_type=pdf2`,
      `${ML_API_BASE}/shipments/labels?shipment_ids=${shipmentId}`,
    ];

    const results = [];
    for (const url of variants) {
      const r  = await fetchWithTimeout(url, { headers: { 'Authorization': `Bearer ${token}` } }, 10000).catch(e => ({ _err: e.message }));
      if (r._err) { results.push({ url, error: r._err }); continue; }
      const ct   = r.headers.get('content-type') || '';
      const body = await r.text().catch(() => '');
      results.push({ url, status: r.status, ct, body: body.slice(0, 500) });
    }

    res.json({
      orderId, shipmentId,
      shipment: { status: shipData.status, substatus: shipData.substatus, tracking_method: shipData.tracking_method, type: shipData.type, logistic_type: shipData.logistic_type },
      mlWebPrintUrl: `https://www.mercadolibre.com.br/envios/label/print?shipmentIds=${shipmentId}&caller=SP&label_type=forward`,
      variants: results,
    });
  } catch (err) {
    console.error('[GET /api/ml/debug/label]', err.message);
    next(err);
  }
});

// ── POST /api/ml/labels/batch ────────────────────────────────────────────────
router.post('/labels/batch', async (req, res, next) => {
  try {
    const orderIds = Array.isArray(req.body.orderIds) ? req.body.orderIds : [];
    if (!orderIds.length) return res.status(400).json({ error: 'orderIds obrigatório' });

    const token   = await mlEnsureToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

    const orderResults = await Promise.allSettled(
      orderIds.map(id => fetchWithTimeout(`${ML_API_BASE}/orders/${id}`, { headers }, 8000).then(r => r.json()))
    );

    const shipmentIds = orderResults
      .filter(r => r.status === 'fulfilled' && r.value?.shipping?.id)
      .map(r => r.value.shipping.id);

    if (!shipmentIds.length) throw new Error('Nenhum envio encontrado para os pedidos informados');

    const batchRes = await fetchWithTimeout(
      `${ML_API_BASE}/shipments/labels?response_type=zpl2&shipment_ids=${shipmentIds.join(',')}`,
      { headers }, 15000
    );

    const contentType = batchRes.headers.get('content-type') || '';

    if (contentType.includes('pdf') || contentType.includes('octet')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="etiquetas-lote.pdf"`);
      const buf = await batchRes.arrayBuffer();
      return res.send(Buffer.from(buf));
    }

    const data = await batchRes.json().catch(() => ({}));
    res.json({ ok: true, shipmentIds, pdfUrl: data.url || null });
  } catch (err) {
    console.error('[POST /api/ml/labels/batch]', err.message);
    next(err);
  }
});

// ── GET /api/ml/orders/:orderId/danfe ────────────────────────────────────────
router.get('/orders/:orderId/danfe', async (req, res, next) => {
  try {
    const orderId = safeTrim(req.params.orderId);
    const today = getTodayBR().replace(/-/g, '/');
    const data  = await blingFetch(`/notas-fiscais?situacoes[]=5&dataEmissaoInicio=${today}&dataEmissaoFim=${today}&limite=100`);
    const nfs = (data?.data || []);

    const nf = nfs.find(n => (n.observacoes || '').includes(orderId) || (n.numero || '').toString() === orderId);

    if (!nf) {
      return res.json({
        ok: false,
        orderId,
        danfeUrl: null,
        message: `NF não encontrada no Bling para o pedido ${orderId}. Acesse o Bling manualmente.`,
        blingUrl: `https://app2.bling.com.br/notas.fiscais.saida.php`,
      });
    }

    let danfeUrl = null;
    try {
      const danfeData = await blingFetch(`/notas-fiscais/${nf.id}/danfe?tipo=simplificado`);
      danfeUrl = danfeData?.data?.url || null;
    } catch (_) {}

    res.json({ ok: true, orderId, nfId: nf.id, nfNumero: nf.numero, danfeUrl });
  } catch (err) {
    console.error('[GET /api/ml/orders/:orderId/danfe]', err.message);
    next(err);
  }
});

// ── GET /api/ml/shipments/today ─────────────────────────────────────────────
router.get('/shipments/today', async (req, res, next) => {
  try {
    const token   = await mlEnsureToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

    const meRes  = await fetchWithTimeout(`${ML_API_BASE}/users/me`, { headers }, 8000);
    const meData = await meRes.json();
    const userId = meData.id;
    if (!userId) throw new Error('Não foi possível obter userId do ML');

    const today = getTodayBR();
    const shipUrl = `${ML_API_BASE}/orders/search?seller=${userId}&shipping.status=ready_to_ship&limit=50`;
    const shipRes = await fetchWithTimeout(shipUrl, { headers }, 12000);
    const shipData = shipRes.ok ? await shipRes.json() : { results: [] };
    const orders  = shipData.results || [];

    const shipments = orders.map(o => ({
      orderId:   o.id,
      logistica: detectLogistica(o),
      needsLabel: !o.shipping?.tracking_number,
      tracking:  o.shipping?.tracking_number || null,
    }));

    let cutoffTime = null;
    let authCode   = null;
    try {
      const prefRes  = await fetchWithTimeout(`${ML_API_BASE}/users/${userId}/shipping_preferences`, { headers }, 8000);
      if (prefRes.ok) {
        const pref = await prefRes.json();
        const opts = pref.custom_shipping_options || pref.modes || [];
        for (const opt of opts) {
          if (opt.cut_off_time) {
            const [h, m] = (opt.cut_off_time || '').split(':');
            if (h && m) {
              const d = new Date();
              d.setHours(Number(h), Number(m), 0, 0);
              cutoffTime = d.toISOString();
              break;
            }
          }
        }
      }
    } catch (_) {}

    try {
      const flexRes = await fetchWithTimeout(`${ML_API_BASE}/users/${userId}/shipping_preferences/flex`, { headers }, 8000);
      if (flexRes.ok) {
        const flex = await flexRes.json();
        authCode = flex.authorization_code || flex.code || null;
      }
    } catch (_) {}

    res.json({ ok: true, date: today, userId, shipments, total: shipments.length, cutoffTime, authCode });
  } catch (err) {
    console.error('[GET /api/ml/shipments/today]', err.message);
    next(err);
  }
});

// ── GET /api/ml/claims ───────────────────────────────────────────────────────
router.get('/claims', async (req, res, next) => {
  try {
    const token   = await mlEnsureToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

    const meRes  = await fetchWithTimeout(`${ML_API_BASE}/users/me`, { headers }, 8000);
    const meData = await meRes.json();
    const userId = meData.id;
    if (!userId) throw new Error('Não foi possível obter userId do ML');

    const claimRes = await fetchWithTimeout(
      `${ML_API_BASE}/post-purchase/claims/search?role=seller&status=opened&limit=20&caller.id=${userId}`,
      { headers }, 12000
    );

    let claims = [];
    if (claimRes.ok) {
      const data = await claimRes.json();
      claims = data.data || data.results || [];
    }

    const medRes = await fetchWithTimeout(
      `${ML_API_BASE}/post-purchase/claims/search?role=seller&status=in_mediation&limit=20&caller.id=${userId}`,
      { headers }, 12000
    ).catch(() => null);
    if (medRes?.ok) {
      const medData = await medRes.json();
      const inMed = medData.data || medData.results || [];
      claims = [...claims, ...inMed];
    }
    res.json({ ok: true, claims, total: claims.length });
  } catch (err) {
    console.error('[GET /api/ml/claims]', err.message);
    next(err);
  }
});

// ── POST /api/ml/scan-baixa ──────────────────────────────────────────────────
router.post('/scan-baixa', async (req, res, next) => {
  try {
    const code = safeTrim(req.body.code);
    if (!code) return res.status(400).json({ error: 'code obrigatório' });

    const fsSnap = await db.collection('ml_order_status').where('tracking_number', '==', code).limit(1).get();
    if (!fsSnap.empty) {
      const doc = fsSnap.docs[0];
      const data = doc.data();
      if (data.status === 'enviado') {
        return res.json({ ok: true, alreadyDone: true, orderId: doc.id, buyer: data.buyer || null });
      }
      await doc.ref.update({ status: 'enviado', updatedAtMs: Date.now() });
      return res.json({ ok: true, orderId: doc.id, buyer: data.buyer || null, tracking: code });
    }

    const token   = await mlEnsureToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

    const shipRes = await fetchWithTimeout(`${ML_API_BASE}/shipments/search?q=${encodeURIComponent(code)}&limit=5`, { headers }, 10000).catch(() => null);

    let orderId = null;
    let buyer   = null;

    if (shipRes?.ok) {
      const shipData = await shipRes.json();
      const results  = shipData.results || shipData.data || [];
      if (results.length > 0) {
        const ship = results[0];
        const orderSearch = await fetchWithTimeout(`${ML_API_BASE}/orders/search?shipping.id=${ship.id}&limit=1`, { headers }, 8000).catch(() => null);
        if (orderSearch?.ok) {
          const od = await orderSearch.json();
          const firstOrder = (od.results || [])[0];
          if (firstOrder) {
            orderId = firstOrder.id;
            buyer   = firstOrder.buyer?.nickname || null;
          }
        }
      }
    }

    if (!orderId) {
      if (/^\d{10,15}$/.test(code)) {
        const orderRes = await fetchWithTimeout(`${ML_API_BASE}/orders/${code}`, { headers }, 8000).catch(() => null);
        if (orderRes?.ok) {
          const od = await orderRes.json();
          orderId = od.id;
          buyer   = od.buyer?.nickname || null;
        }
      }
    }

    if (!orderId) return res.status(404).json({ error: `Código "${code}" não encontrado em nenhum pedido de hoje` });

    await db.collection('ml_order_status').doc(String(orderId)).set({
      status:          'enviado',
      tracking_number: code,
      buyer,
      updatedAtMs:     Date.now(),
    }, { merge: true });

    res.json({ ok: true, orderId, buyer, tracking: code });
  } catch (err) {
    console.error('[POST /api/ml/scan-baixa]', err.message);
    next(err);
  }
});

// ── GET /api/ml/dashboard ────────────────────────────────────────────────────
router.get('/dashboard', requireFirebaseAuth, async (req, res, next) => {
  try {
    let mlConnected = false;
    let orders = [];
    let claims = [];
    let authCode = null;
    let cutoffSchedule = null;

    let token = null;
    try {
      token = await mlEnsureToken();
      mlConnected = true;
    } catch (_) {
      return res.json({
        mlConnected: false,
        orders: [],
        claims: [],
        summary: { flex: 0, agency: 0, fulfillment: 0, cancelados: 0, total: 0, semEtiqueta: 0 },
        authCode: null,
        cutoffSchedule: null,
        date: getTodayBR(),
      });
    }

    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
    const meRes  = await fetchWithTimeout(`${ML_API_BASE}/users/me`, { headers }, 8000);
    const meData = await meRes.json();
    const userId = meData.id;
    if (!userId) throw new Error('Não foi possível obter userId do ML');

    const today = getTodayBR();

    const [rPaid, rReady, rClaims, rClaimsMed] = await Promise.allSettled([
      fetchWithTimeout(`${ML_API_BASE}/orders/search?seller=${userId}&order.status=paid&order.date_created.from=${today}T00:00:00.000-03:00&limit=50`, { headers }, 12000),
      fetchWithTimeout(`${ML_API_BASE}/orders/search?seller=${userId}&order.status=paid&shipping.status=ready_to_ship&limit=50`, { headers }, 12000),
      fetchWithTimeout(`${ML_API_BASE}/post-purchase/claims/search?role=seller&status=opened&limit=20&caller.id=${userId}`, { headers }, 10000),
      fetchWithTimeout(`${ML_API_BASE}/post-purchase/claims/search?role=seller&status=in_mediation&limit=20&caller.id=${userId}`, { headers }, 10000),
    ]);

    const seen = new Set();
    const rawOrders = [];
    for (const settled of [rPaid, rReady]) {
      if (settled.status !== 'fulfilled' || !settled.value.ok) continue;
      const data = await settled.value.json();
      for (const o of (data.results || [])) {
        if (seen.has(o.id)) continue;
        seen.add(o.id);
        rawOrders.push(o);
      }
    }

    const statusList = await Promise.all(rawOrders.map(o => resolveLocalStatus(o.id)));
    orders = rawOrders.map((o, i) => ({
      id:           o.id,
      logistica:    detectLogistica(o),
      _localStatus: statusList[i],
      _createdTime: formatTimeBR(o.date_created),
      buyer:        o.buyer?.nickname || null,
      total:        o.total_amount   || 0,
      items:        (o.order_items   || []).map(it => ({
        sku:   it.item?.seller_sku || null,
        name:  it.item?.title     || null,
        qty:   it.quantity        || 1,
      })),
      tracking:     o.shipping?.tracking_number || null,
      needsLabel:   !o.shipping?.tracking_number,
      orderId:      o.id,
    }));

    const statusOrder = { imprimir: 0, expedir: 1, enviado: 2, cancelado: 3 };
    orders.sort((a, b) => (statusOrder[a._localStatus] ?? 9) - (statusOrder[b._localStatus] ?? 9));

    const summary = { flex: 0, agency: 0, fulfillment: 0, cancelados: 0, total: orders.length, semEtiqueta: 0 };
    for (const o of orders) {
      if (o._localStatus === 'cancelado') { summary.cancelados++; continue; }
      if (o.logistica === 'flex')        summary.flex++;
      else if (o.logistica === 'fulfillment') summary.fulfillment++;
      else summary.agency++;
      if (o.needsLabel && o._localStatus !== 'enviado') summary.semEtiqueta++;
    }

    for (const settled of [rClaims, rClaimsMed]) {
      if (settled.status !== 'fulfilled' || !settled.value.ok) continue;
      const d = await settled.value.json();
      const list = d.data || d.results || [];
      claims.push(...list.map(c => ({
        id:     c.id,
        status: c.status,
        reason: c.reason || c.type || null,
        orderId: c.resource_id || null,
      })));
    }

    try {
      const packRes = await fetchWithTimeout(`${ML_API_BASE}/users/${userId}/shipping_packs?date=${today}`, { headers }, 8000);
      if (packRes.ok) {
        const packData = await packRes.json();
        authCode = packData.authorization_code || packData.code || packData.pack_code || (Array.isArray(packData) && packData[0]?.authorization_code) || null;
      }
    } catch (_) {}

    if (!authCode) {
      try {
        const flexRes = await fetchWithTimeout(`${ML_API_BASE}/users/${userId}/shipping_preferences/flex`, { headers }, 6000);
        if (flexRes.ok) {
          const flexData = await flexRes.json();
          authCode = flexData.authorization_code || flexData.code || null;
        }
      } catch (_) {}
    }

    try {
      const prefRes = await fetchWithTimeout(`${ML_API_BASE}/users/${userId}/shipping_preferences`, { headers }, 8000);
      if (prefRes.ok) {
        const pref = await prefRes.json();
        const opts = pref.custom_shipping_options || pref.modes || [];
        const cutoffs = {};
        const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
        for (const opt of opts) {
          if (opt.cut_off_time) {
            const day = opt.day || opt.week_day || null;
            if (day !== null && DAYS[day]) {
              cutoffs[DAYS[day]] = opt.cut_off_time.slice(0, 5);
            } else if (!cutoffs.default) {
              cutoffs.default = opt.cut_off_time.slice(0, 5);
            }
          }
        }
        if (Object.keys(cutoffs).length > 0) cutoffSchedule = cutoffs;
      }
    } catch (_) {}

    res.json({ mlConnected, orders, claims, summary, authCode, cutoffSchedule, date: today, userId });
  } catch (err) {
    console.error('[GET /api/ml/dashboard]', err.message);
    next(err);
  }
});

module.exports = router;
