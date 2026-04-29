/**
 * @file server.js
 * @module app
 * @description Servidor Express principal (rotas, estáticos, integrações).
 * @version 0.4.0
 * @date 2026-04-12
 * @author UniversoLab
 *
 * @changelog
 *   0.4.0 — 2026-04-12 — NF-e: parse-xml, fechar pedido (atualiza stock), patch metadados;
 *             GET purchase-orders suporta filtro ?status=.
 *   0.3.0 — 2026-03-31 — Rotas sensíveis: requireAuth JWT → requireFirebaseAuth + requireFirebaseRole;
 *             upload Cloudinary valida/marca tenantId em product_overrides.
 */
// expedicao-pro/backend/server.js
'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();
const { setupTenantsPublicRoutes } = require('./routes/tenants');
const { setupTenantProvisioningRoutes } = require('./routes/tenantProvisioning');
const catalogoRouter = require('./routes/catalogo');
const { requireFirebaseAuth, requireFirebaseRole } = require('./middleware/requireFirebaseAuth');
const { db, serviceAccount, admin } = require('./config/firebase');
const { sendTelegram: _sendTg, telegramConfigurado: _tgOk, getUpdates: _tgUpdates } = require('./utils/telegram');
const { iniciarNotificador, notificarNovoPedido } = require('./jobs/notificador');
const fs = require('fs');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');

const { google } = require('googleapis');

function safeTrim(v) {
  return (v ?? '').toString().trim();
}

const PORT = Number(process.env.PORT || 8080);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const LOCK_TTL_MS = Number(process.env.LOCK_TTL_MS || 20000);
const ORDER_SEQ_PAD = Number(process.env.ORDER_SEQ_PAD || 4);


const app = express();
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '6mb' }));
app.use(morgan('tiny'));
setupTenantsPublicRoutes(app, db);
setupTenantProvisioningRoutes(app, db);

// ---------------- Static (public) ----------------
const PUBLIC_DIR = path.join(__dirname, 'public');
const SPA_DIR = path.join(PUBLIC_DIR, 'spa');
// SPA React — serve os assets buildados
app.use('/spa', express.static(SPA_DIR));

app.get('/spa/*', (req, res) => res.sendFile(path.join(SPA_DIR, 'index.html')));

// ❌ Removido: redirects de /login, /financeiro/*, /expedicao/* causavam erro em dev
// Em produção: Vite já buildou com base '/spa/' — paths estão corretos
// Em dev: Vite serve com basename '/' — redirects quebram a navegação

app.use(express.static(PUBLIC_DIR));

// Redireciona / para o SPA React
app.get('/', (req, res) => res.redirect('/spa/login'));


// ✅ uploads locais (fotos reais do estoque)
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/api/catalogo', catalogoRouter);

// ✅ fallback: placeholder 1x1 transparente se faltar arquivo
app.get('/assets/placeholder.png', (req, res) => {
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7WnKcAAAAASUVORK5CYII=';
  const buf = Buffer.from(pngBase64, 'base64');
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.status(200).send(buf);
});

// ---------------- Helpers ----------------
function nowMs() {
  return Date.now();
}

function yyyymmdd(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function padSeq(n, size) {
  return String(n).padStart(size, '0');
}

function normalizeText(v) {
  return safeTrim(v).toLowerCase();
}

function getTerminalId(req) {
  return safeTrim(req.header('x-terminal-id')) || `anon_${uuidv4().slice(0, 8)}`;
}

function assertMarketplace(v) {
  const ok = ['MERCADO_LIVRE', 'SHOPEE', 'OUTROS'];
  if (!ok.includes(v)) {
    const e = new Error(`Invalid marketplace. Use one of: ${ok.join(' | ')}`);
    e.statusCode = 400;
    throw e;
  }
}

function assertStatus(v) {
  const ok = ['pending', 'picked', 'packed'];
  if (!ok.includes(v)) {
    const e = new Error(`Invalid status. Use one of: ${ok.join(' | ')}`);
    e.statusCode = 400;
    throw e;
  }
}

function isLockActive(orderData) {
  if (!orderData.lockedAt || !orderData.lockedBy) return false;
  const age = nowMs() - Number(orderData.lockedAt);
  return age >= 0 && age <= LOCK_TTL_MS;
}

function toNameShort(name) {
  const n = safeTrim(name);
  if (n.length <= 48) return n;
  return n.slice(0, 45) + '...';
}

// merge product + override (override vence)
function mergeProduct(product, override) {
  const p = product || {};
  const o = override || {};
  return {
    ...p,
    override: o,
    // imagem “operacional” preferida
    displayImage:
      (Array.isArray(o.stockPhotos) && o.stockPhotos[0]) ||
      (Array.isArray(p.images) && p.images[0]) ||
      p.image ||
      './assets/placeholder.png',
    // bin/loc preferido
    displayBin: o.customBinName || p.bin || ''
  };
}

function okFileExt(filename) {
  const f = (filename || '').toLowerCase();
  return f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.webp');
}

// ---------------- Multer (upload de imagens) ----------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const sku = safeTrim(req.params.sku || 'unknown').replace(/[^\w\-]/g, '_');
    const kind = safeTrim(req.body.kind || req.query.kind || 'photo').replace(/[^\w\-]/g, '_');
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const ts = nowMs();
    cb(null, `${sku}__${kind}__${ts}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 } // 6MB
});

// ---------------- Core routes (já existentes) ----------------
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'expedicao-pro-backend', ts: nowMs() });
});

// ================================================================
// SEARCH LAYER — preparado para Typesense (sprint 2)
// Hoje usa Firestore. Quando Typesense estiver pronto, basta
// implementar searchViaTypesense() e trocar a flag USE_TYPESENSE.
// A interface de entrada/saída desta rota não muda.
// ================================================================
const USE_TYPESENSE = true; // <- trocar para true no sprint 2

async function searchViaTypesense(q) {
  // TODO sprint 2: integrar Typesense aqui
  // const { TypesenseClient } = require('./search/typesense-client');
  // return TypesenseClient.search({ q, queryBy: 'name,marca,ean,sku' });
  throw new Error('Typesense not configured yet');
}

async function searchViaFirestore(qRaw) {
  const q = normalizeText(qRaw);
  const items = [];
  const seen  = new Set();

  function collect(snap) {
    snap.forEach(doc => {
      const p = doc.data();
      if (p.sku && !seen.has(p.sku)) { seen.add(p.sku); items.push(p); }
    });
  }

  // ── Busca 1: SKU exato (sem espaço) ──────────────────────────
  const qTrimmed = qRaw.replace(/\s+/g, '');
  if (qTrimmed.length <= 64) {
    const skuDoc = await db.collection('products').doc(qTrimmed).get();
    if (skuDoc.exists) {
      const p = skuDoc.data();
      if (p.sku && !seen.has(p.sku)) { seen.add(p.sku); items.push(p); }
    }
  }

  // ── Busca 2: EAN exato — aceita espaços (usuário cola do leitor)
  // Remove espaços só para comparar, mantém busca mesmo com espaço
  const eanQuery = qRaw.trim().replace(/\s+/g, '');
  if (eanQuery.length >= 8 && eanQuery.length <= 14 && /^\d+$/.test(eanQuery)) {
    const [byEan, byEanBox] = await Promise.all([
      db.collection('products').where('ean',    '==', eanQuery).limit(10).get(),
      db.collection('products').where('eanBox', '==', eanQuery).limit(10).get(),
    ]);
    collect(byEan);
    collect(byEanBox);
  }

  // ── Busca 3: todos os tokens >= 2 chars, em paralelo ─────────
  // FIX: antes só o 1º token era buscado. Agora todos rodam ao mesmo tempo.
  const tokens = q
    .split(/\s+/)
    .filter(Boolean)
    .filter(t => t.length >= 2)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 4); // máx 4 queries paralelas para não explodir leitura

  if (tokens.length > 0) {
    const snaps = await Promise.all(
      tokens.map(t =>
        db.collection('products')
          .where('nameKeywords', 'array-contains', t)
          .limit(20)
          .get()
      )
    );
    snaps.forEach(collect);
  }

  return items;
}

app.get('/products/search', async (req, res, next) => {
  try {
    const qRaw = safeTrim(req.query.q);
    if (!qRaw || qRaw.length < 2) return res.json({ items: [] });

    // ── Tenta Typesense, cai para Firestore se não configurado ──
    let items = [];
    if (USE_TYPESENSE) {
      try {
        items = await searchViaTypesense(qRaw);
      } catch (e) {
        console.warn('[/products/search] Typesense fallback to Firestore:', e.message);
        items = await searchViaFirestore(qRaw);
      }
    } else {
      items = await searchViaFirestore(qRaw);
    }

    // ── Ordena e limita ─────────────────────────────────────────
    items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const sliced = items.slice(0, 20);

    // ── Enriquece com fotos dos overrides (stockPhotos/Cloudinary)
    if (!sliced.length) return res.json({ items: [] });

    const overrideRefs  = sliced.map(p => db.collection('product_overrides').doc(p.sku));
    const overrideSnaps = await db.getAll(...overrideRefs);
    const overrideMap   = new Map();
    for (const s of overrideSnaps) if (s.exists) overrideMap.set(s.id, s.data());

    const enriched = sliced.map(p => {
      const ov = overrideMap.get(p.sku) || {};
      return {
        ...p,
        image: (Array.isArray(ov.stockPhotos) && ov.stockPhotos[0])
          || (Array.isArray(p.images) && p.images[0])
          || p.image
          || '/assets/placeholder.png',
      };
    });

    res.json({ items: enriched });
  } catch (err) {
    console.error('[/products/search] error:', err);
    next(err);
  }
});

// ✅ /orders/list mantendo orderBy (você já criou o índice)
app.get('/orders/list', async (req, res, next) => {
  try {
    const status = safeTrim(req.query.status) || 'pending';
    assertStatus(status);
    const limit = Math.min(Number(req.query.limit || 30), 80);

    const snap = await db
      .collection('orders')
      .where('status', '==', status)
      .orderBy('createdAtMs', 'desc')
      .limit(limit)
      .get();

    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Coleta todos os SKUs unicos dos pedidos
    const allSkus = new Set();
    for (const order of orders) {
      for (const it of (order.items || [])) {
        if (it.sku) allSkus.add(it.sku);
      }
    }

    // Busca overrides em lote (uma unica query no Firestore)
    const overrideMap = new Map();
    if (allSkus.size > 0) {
      const refs = Array.from(allSkus).map(sku => db.collection('product_overrides').doc(sku));
      const overrideSnaps = await db.getAll(...refs);
      for (const s of overrideSnaps) {
        if (s.exists) overrideMap.set(s.id, s.data());
      }
    }

    // Enriquece cada item com as fotos do override
    const enriched = orders.map(order => ({
      ...order,
      items: (order.items || []).map(it => {
        const ov = overrideMap.get(it.sku) || {};
        return {
          ...it,
          qty:        Number(it.qty        ?? 0) || 0,
          checkedQty: Number(it.checkedQty ?? 0) || 0,
          image: (Array.isArray(ov.stockPhotos) && ov.stockPhotos[0])
            || (Array.isArray(it.images) && it.images[0])
            || it.image
            || '/assets/placeholder.png',
          stockPhotos:       Array.isArray(ov.stockPhotos) ? ov.stockPhotos : [],
          boxPhotos:         Array.isArray(ov.boxPhotos)   ? ov.boxPhotos   : [],
          binPhoto:          ov.binPhoto || null,
          binPhotoUpdatedAt: ov.updatedAtMs || null,
          customBin:         ov.customBinName || it.bin || '',
          notes:             ov.notes || it.notes || '',
        };
      })
    }));

    res.json({ items: enriched });
  } catch (err) {
    console.error('[/orders/list] error:', err);
    next(err);
  }
});



app.post('/orders/manual', async (req, res, next) => {
  try {
    const terminalId = getTerminalId(req);
    const marketplace = safeTrim(req.body.marketplace);
    assertMarketplace(marketplace);

    const clienteNome = safeTrim(req.body.clienteNome);
    const isPriority = Boolean(req.body.isPriority);

    const cart = Array.isArray(req.body.cart) ? req.body.cart : [];
    if (cart.length === 0) return res.status(400).json({ error: 'cart must have at least 1 item' });

    const cartClean = cart
      .map((it) => ({ sku: safeTrim(it.sku), qty: Number(it.qty || 0) }))
      .filter((it) => it.sku && Number.isFinite(it.qty) && it.qty > 0);

    if (cartClean.length === 0) return res.status(400).json({ error: 'cart items invalid' });

    const prodRefs = cartClean.map((it) => db.collection('products').doc(it.sku));
    const prodSnaps = await db.getAll(...prodRefs);

    const prodMap = new Map();
    for (const s of prodSnaps) if (s.exists) prodMap.set(s.id, s.data());

    const items = [];
    for (const it of cartClean) {
      const p = prodMap.get(it.sku);
      if (!p) return res.status(400).json({ error: `SKU not found in products: ${it.sku}` });

      items.push({
        sku: p.sku,
        nameShort: toNameShort(p.name),
        qty: it.qty,
        ean: p.ean || '',
        eanBox: p.eanBox || '',
        bin: p.bin || '',
        image: './assets/placeholder.png',
        images: p.images || [],
        checkedQty: 0
      });
    }

    const createdAtMs = nowMs();
    const day = yyyymmdd();
    const counterRef = db.collection('meta').doc(`counters_${day}`);

    const result = await db.runTransaction(async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const prev = counterSnap.exists ? Number(counterSnap.data().seq || 0) : 0;
      const nextSeq = prev + 1;
      const orderId = `ORD_${day}_${padSeq(nextSeq, ORDER_SEQ_PAD)}`;
      const orderRef = db.collection('orders').doc(orderId);

      tx.set(counterRef, { docType: 'counter', day, seq: nextSeq, updatedAtMs: createdAtMs }, { merge: true });

      tx.set(orderRef, {
        docType: 'order',
        source: 'manual',
        marketplace,
        status: 'pending',
        clienteNome: clienteNome || '',
        isPriority,
        logistica: isPriority ? 'flex' : (safeTrim(req.body.logistica) || 'agency'),
        mlOrderId: safeTrim(req.body.mlOrderId) || null,
        items,
        allowConfirmOnlyIfAllChecked: true,
        createdAtMs,
        updatedAtMs: createdAtMs,
        lockedBy: terminalId,
        lockedAt: createdAtMs
      });

      return { orderId };
    });

    res.json({ ok: true, orderId: result.orderId });

    // Telegram — notifica novo pedido em background (não bloqueia resposta)
    notificarNovoPedido({
      clienteNome: req.body.clienteNome,
      marketplace: req.body.marketplace,
      qtdItens:    items.length,
      logistica:   isPriority ? 'flex' : (safeTrim(req.body.logistica) || 'agency'),
      isPriority,
    }).catch(() => {});
  } catch (err) {
    console.error('[/orders/manual] error:', err);
    next(err);
  }
});

app.post('/orders/:id/lock', async (req, res, next) => {
  try {
    const terminalId = getTerminalId(req);
    const orderId = safeTrim(req.params.id);
    if (!orderId) return res.status(400).json({ error: 'missing order id' });

    const orderRef = db.collection('orders').doc(orderId);
    const ts = nowMs();

    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) {
        const e = new Error('order not found');
        e.statusCode = 404;
        throw e;
      }

      const d = snap.data();
      const lockActive = isLockActive(d);

      if (lockActive && d.lockedBy !== terminalId) {
        return { ok: false, locked: true, lockedBy: d.lockedBy, lockedAt: d.lockedAt, ttlMs: LOCK_TTL_MS };
      }

      tx.set(orderRef, { lockedBy: terminalId, lockedAt: ts, updatedAtMs: ts }, { merge: true });
      return { ok: true, locked: true, lockedBy: terminalId, lockedAt: ts, ttlMs: LOCK_TTL_MS };
    });

    res.json(out);
  } catch (err) {
    console.error('[/orders/:id/lock] error:', err);
    next(err);
  }
});

app.post('/orders/:id/status', async (req, res, next) => {
  try {
    const terminalId = getTerminalId(req);
    const orderId = safeTrim(req.params.id);
    const status = safeTrim(req.body.status);
    assertStatus(status);

    const orderRef = db.collection('orders').doc(orderId);
    const ts = nowMs();

    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) {
        const e = new Error('order not found');
        e.statusCode = 404;
        throw e;
      }

      const d = snap.data();
      const lockActive = isLockActive(d);

      if (lockActive && d.lockedBy !== terminalId) {
        return { ok: false, error: 'locked_by_other_terminal', lockedBy: d.lockedBy, lockedAt: d.lockedAt };
      }

      tx.set(orderRef, { lockedBy: terminalId, lockedAt: ts }, { merge: true });

      if (d.status === 'pending' && status === 'picked') {
        const allow = d.allowConfirmOnlyIfAllChecked !== false;
        if (allow) {
          const items = Array.isArray(d.items) ? d.items : [];
          const allOk = items.every((it) => Number(it.checkedQty || 0) >= Number(it.qty || 0));
          if (!allOk) return { ok: false, error: 'not_all_items_checked' };
        }
      }

      tx.set(orderRef, { status, updatedAtMs: ts }, { merge: true });
      return { ok: true, status };
    });

    res.json(out);
  } catch (err) {
    console.error('[/orders/:id/status] error:', err);
    next(err);
  }
});

// --- ROTA DE CONFERÊNCIA ATÓMICA ---
app.post('/orders/:id/check', async (req, res, next) => {
  try {
    const terminalId = getTerminalId(req);
    const orderId = safeTrim(req.params.id);
    const code = safeTrim(req.body.code);

    if (!orderId || !code) return res.status(400).json({ error: 'missing_params' });

    const orderRef = db.collection('orders').doc(orderId);
    const ts = nowMs();

    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) throw new Error('order_not_found');

      const d = snap.data();
      if (isLockActive(d) && d.lockedBy !== terminalId) {
        return { ok: false, error: 'locked_by_other_terminal' };
      }

      const items = Array.isArray(d.items) ? d.items : [];
      // Procura o item por SKU, EAN ou EAN da Embalagem
      const idx = items.findIndex(it => 
        safeTrim(it.sku) === code || safeTrim(it.ean) === code || safeTrim(it.eanBox) === code
      );

      if (idx < 0) return { ok: false, error: 'item_not_found' };

      const item = items[idx];
      if (Number(item.checkedQty || 0) >= Number(item.qty || 0)) {
        return { ok: false, error: 'already_fully_checked', sku: item.sku };
      }

      // ATUALIZAÇÃO ATÓMICA: Incrementamos o valor e salvamos o array atualizado
      const prevChecked = Number(item.checkedQty || 0);
      const newChecked  = prevChecked + 1;
      const itemQty     = Number(item.qty || 0);

      const newItems = items.map((it, i) =>
        i === idx ? { ...it, checkedQty: newChecked } : it
      );

      tx.set(orderRef, {
        items:       newItems,
        lockedBy:    terminalId,
        lockedAt:    ts,
        updatedAtMs: ts,
      }, { merge: true });

      return {
        ok:         true,
        sku:        item.sku,
        checkedQty: newChecked,
        qty:        itemQty,
        allChecked: newChecked >= itemQty,
      };
    });

    res.json(out);
  } catch (err) {
    console.error('[CHECK ERROR]', err);
    next(err);
  }
});

// ---------------- Admin (product overlays) ----------------
/**
 * Overlay:
 *  product_overrides/{sku} = {
 *    customBinName?: string,
 *    stockPhotos?: string[],     // URLs locais: "/uploads/..."
 *    boxPhotos?: string[],       // opcional
 *    binPhoto?: string,          // opcional
 *    notes?: string,
 *    updatedAtMs
 *  }
 */

app.get('/admin/products/search', async (req, res, next) => {
  try {
    const qRaw = safeTrim(req.query.q);
    const q = normalizeText(qRaw);
    if (!q) return res.json({ items: [] });

    // reusa o mesmo search do products, mas retorna merged com override
    const base = await (async () => {
      const items = [];
      const seen = new Set();

      if (qRaw && qRaw.length <= 64 && !qRaw.includes(' ')) {
        const skuDoc = await db.collection('products').doc(qRaw).get();
        if (skuDoc.exists) {
          const p = skuDoc.data();
          if (!seen.has(p.sku)) {
            seen.add(p.sku);
            items.push(p);
          }
        }
      }

      if (qRaw && qRaw.length <= 64 && !qRaw.includes(' ')) {
        const byEanSnap = await db.collection('products').where('ean', '==', qRaw).limit(10).get();
        byEanSnap.forEach((doc) => {
          const p = doc.data();
          if (!seen.has(p.sku)) {
            seen.add(p.sku);
            items.push(p);
          }
        });

        const byEanBoxSnap = await db.collection('products').where('eanBox', '==', qRaw).limit(10).get();
        byEanBoxSnap.forEach((doc) => {
          const p = doc.data();
          if (!seen.has(p.sku)) {
            seen.add(p.sku);
            items.push(p);
          }
        });
      }

      const token = q.split(/\s+/).filter(Boolean)[0];
      if (token && token.length >= 3) {
        const kwSnap = await db.collection('products').where('nameKeywords', 'array-contains', token).limit(25).get();
        kwSnap.forEach((doc) => {
          const p = doc.data();
          if (!seen.has(p.sku)) {
            seen.add(p.sku);
            items.push(p);
          }
        });
      }

      items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return items.slice(0, 25);
    })();

    const overrideRefs = base.map((p) => db.collection('product_overrides').doc(p.sku));
    const overrideSnaps = overrideRefs.length ? await db.getAll(...overrideRefs) : [];
    const overrideMap = new Map();
    for (const s of overrideSnaps) if (s.exists) overrideMap.set(s.id, s.data());

    const merged = base.map((p) => mergeProduct(p, overrideMap.get(p.sku)));
    res.json({ items: merged });
  } catch (err) {
    console.error('[/admin/products/search] error:', err);
    next(err);
  }
});

app.get('/admin/products/:sku', async (req, res, next) => {
  try {
    const sku = safeTrim(req.params.sku);
    if (!sku) return res.status(400).json({ error: 'missing sku' });

    const prodSnap = await db.collection('products').doc(sku).get();
    if (!prodSnap.exists) return res.status(404).json({ error: 'product not found' });

    const ovSnap = await db.collection('product_overrides').doc(sku).get();
    const merged = mergeProduct(prodSnap.data(), ovSnap.exists ? ovSnap.data() : null);

    res.json({ item: merged });
  } catch (err) {
    console.error('[/admin/products/:sku] error:', err);
    next(err);
  }
});

app.patch('/admin/products/:sku', async (req, res, next) => {
  try {
    const sku = safeTrim(req.params.sku);
    if (!sku) return res.status(400).json({ error: 'missing sku' });

    const patch = req.body || {};

    // allowlist de campos editáveis
    const out = {
      updatedAtMs: nowMs()
    };

    if (typeof patch.customBinName === 'string') out.customBinName = safeTrim(patch.customBinName);

    if (typeof patch.notes === 'string') out.notes = patch.notes.toString();

    if (Array.isArray(patch.stockPhotos)) {
      out.stockPhotos = patch.stockPhotos.map((x) => safeTrim(x)).filter(Boolean).slice(0, 10);
    }

    if (Array.isArray(patch.boxPhotos)) {
      out.boxPhotos = patch.boxPhotos.map((x) => safeTrim(x)).filter(Boolean).slice(0, 10);
    }

    if (typeof patch.binPhoto === 'string') out.binPhoto = safeTrim(patch.binPhoto);

    await db.collection('product_overrides').doc(sku).set(out, { merge: true });

    const prodSnap = await db.collection('products').doc(sku).get();
    const ovSnap = await db.collection('product_overrides').doc(sku).get();

    const merged = mergeProduct(prodSnap.exists ? prodSnap.data() : null, ovSnap.exists ? ovSnap.data() : null);
    res.json({ ok: true, item: merged });
  } catch (err) {
    console.error('[/admin/products/:sku PATCH] error:', err);
    next(err);
  }
});

// Upload: kind=stock (produto), kind=box (caixa), kind=bin (local)
app.post('/admin/products/:sku/upload', upload.single('file'), async (req, res, next) => {
  try {
    const sku = safeTrim(req.params.sku);
    if (!sku) return res.status(400).json({ error: 'missing sku' });

    if (!req.file) return res.status(400).json({ error: 'missing file' });
    if (!okFileExt(req.file.originalname)) return res.status(400).json({ error: 'invalid file type' });

    const kind = safeTrim(req.body.kind || req.query.kind || 'stock');
    const url = `/uploads/${req.file.filename}`;

    const ref = db.collection('product_overrides').doc(sku);
    const snap = await ref.get();
    const prev = snap.exists ? snap.data() : {};

    const patch = { updatedAtMs: nowMs() };

    if (kind === 'bin') {
      patch.binPhoto = url;
    } else if (kind === 'box') {
      const prevArr = Array.isArray(prev.boxPhotos) ? prev.boxPhotos : [];
      patch.boxPhotos = [url, ...prevArr].slice(0, 10);
    } else {
      const prevArr = Array.isArray(prev.stockPhotos) ? prev.stockPhotos : [];
      patch.stockPhotos = [url, ...prevArr].slice(0, 10);
    }

    await ref.set(patch, { merge: true });

    const prodSnap = await db.collection('products').doc(sku).get();
    const ovSnap = await db.collection('product_overrides').doc(sku).get();
    const merged = mergeProduct(prodSnap.exists ? prodSnap.data() : null, ovSnap.exists ? ovSnap.data() : null);

    res.json({ ok: true, url, item: merged });
  } catch (err) {
    console.error('[/admin/products/:sku/upload] error:', err);
    next(err);
  }
});


// ================================================================
// ROTAS — Normalização de marcas
// Cole em server.js logo após as rotas de /admin/products
// (por volta da linha 810, antes das rotas de /embalagens)
//
// Dependências já presentes em server.js:
//   db, safeTrim, normalizeText, requireFirebaseAuth, nowMs
//
// Typesense: ainda não configurado (USE_TYPESENSE=true mas sem cliente).
//   O upsert é omitido com um TODO; quando o sprint 2 integrar o cliente,
//   basta descomentar o bloco marcado abaixo.
// ================================================================

// ── Helper local (escopo de módulo) ─────────────────────────────────────────

/** Retorna true para marcas que precisam ser normalizadas */
function isMarcaInvalida(v) {
  if (!v) return true;
  const s = safeTrim(v).toUpperCase();
  return s === '' || s === 'N/A' || s === 'NA' || s === '-' || s === 'SEM MARCA';
}

/**
 * Reconstrói nameKeywords usando a mesma lógica do tokenize() do /import/products.
 * tokenize() está definido dentro do handler de importação — não está acessível
 * no escopo global. Replicamos aqui de forma fiel para manter consistência.
 */
function tokenizeForMarca(v) {
  function normalizeAccents(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  const base = safeTrim(v).toLowerCase();
  const norm = normalizeAccents(base);
  function extractTokens(str) {
    return str
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(t => t.length >= 2)
      .filter((t, i, a) => a.indexOf(t) === i)
      .slice(0, 20);
  }
  function prefixes(t) {
    const ps = [];
    for (let i = 3; i < t.length; i++) ps.push(t.slice(0, i));
    return ps;
  }
  const tokens    = extractTokens(base);
  const norTokens = extractTokens(norm);
  const all = new Set([...tokens, ...norTokens]);
  for (const t of [...tokens, ...norTokens]) {
    prefixes(t).forEach(p => all.add(p));
  }
  return Array.from(all).slice(0, 60);
}

/**
 * Reconstrói nameKeywords fundindo os tokens do nome com os tokens da nova marca.
 * Preserva tokens existentes que não pertençam à marca antiga.
 */
function buildKeywordsComMarca(produto, novaMarca) {
  const marcaAntigaTokens = isMarcaInvalida(produto.marca)
    ? new Set()
    : new Set(tokenizeForMarca(produto.marca));

  const baseAtual = Array.isArray(produto.nameKeywords) ? produto.nameKeywords : [];
  const semAntiga = baseAtual.filter(k => !marcaAntigaTokens.has(k));

  const novosMarca = tokenizeForMarca(novaMarca);
  const merged = new Set([...semAntiga, ...novosMarca]);

  return Array.from(merged).slice(0, 60);
}

// ── GET /products/sem-marca ──────────────────────────────────────────────────
// Query: limit (máx 500, default 200), offset (default 0)
// Firestore não suporta OR de igualdade no mesmo campo,
// então trazemos todos os ativos e filtramos em memória.
app.get('/products/sem-marca', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '200', 10), 500);
    const offset = Math.max(parseInt(req.query.offset || '0',   10), 0);

    const snap = await db.collection('products').get();

    const semMarca = [];
    snap.forEach(doc => {
      const d = doc.data();
      if (safeTrim(d.situacao||'').toLowerCase() === 'inativo') return;
      if (isMarcaInvalida(d.marca)) {
        semMarca.push({
          sku:          d.sku || doc.id,
          name:         d.name || '',
          marca:        d.marca || '',
          situacao:     d.situacao || '',
          displayImage: (d.images && d.images[0]) || d.image || null,
          bin:          d.bin || '',
        });
      }
    });

    const total  = semMarca.length;
    const pagina = semMarca.slice(offset, offset + limit);

    res.json({ ok: true, total, offset, limit, items: pagina });
  } catch (err) {
    console.error('[GET /products/sem-marca]', err);
    next(err);
  }
});

// ── GET /products/marcas-list ────────────────────────────────────────────────
// Retorna marcas válidas únicas, ordenadas por frequência decrescente.
app.get('/products/marcas-list', async (req, res, next) => {
  try {
    const snap = await db.collection('products').get();

    const freq = {};
    snap.forEach(doc => {
      const d = doc.data();
      if (safeTrim(d.situacao||'').toLowerCase() === 'inativo') return;
      const m = safeTrim(d.marca || '');
      if (!isMarcaInvalida(m)) {
        freq[m] = (freq[m] || 0) + 1;
      }
    });

    const items = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map(([marca, count]) => ({ marca, count }));

    res.json({ ok: true, total: items.length, items });
  } catch (err) {
    console.error('[GET /products/marcas-list]', err);
    next(err);
  }
});

// ── PATCH /products/:sku/marca ───────────────────────────────────────────────
// Body: { marca: "Nome da Marca" }
// 1. Atualiza products/{sku}.marca + nameKeywords no Firestore
// 2. TODO sprint 2: upsert no Typesense quando cliente estiver configurado
app.patch('/products/:sku/marca', async (req, res, next) => {
  try {
    const sku       = safeTrim(req.params.sku);
    const novaMarca = safeTrim(req.body?.marca || '');

    if (!sku) return res.status(400).json({ error: 'SKU inválido' });
    if (isMarcaInvalida(novaMarca)) {
      return res.status(400).json({ error: 'Marca inválida ou vazia' });
    }

    const ref  = db.collection('products').doc(sku);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: `Produto ${sku} não encontrado` });
    }

    const produto  = snap.data();
    const keywords = buildKeywordsComMarca(produto, novaMarca);

    await ref.update({
      marca:           novaMarca,
      nameKeywords:    keywords,
      _marcaEditadaEm: nowMs(),
    });

    // ── Typesense (descomentar no sprint 2) ──────────────────────────────
    // if (typeof typesenseClient !== 'undefined') {
    //   try {
    //     await typesenseClient
    //       .collections('products')
    //       .documents()
    //       .upsert({ ...produto, id: sku, marca: novaMarca, nameKeywords: keywords });
    //   } catch (tsErr) {
    //     console.warn('[PATCH /marca] Typesense upsert falhou:', tsErr.message);
    //   }
    // }
    // ────────────────────────────────────────────────────────────────────

    res.json({ ok: true, sku, marca: novaMarca, keywordsCount: keywords.length });
  } catch (err) {
    console.error('[PATCH /products/:sku/marca]', err);
    next(err);
  }
});


// ── DELETE /products/:sku — remove produto (lixo de importação) ──────────────
app.delete('/products/:sku', async (req, res, next) => {
  try {
    const sku = safeTrim(req.params.sku);
    if (!sku) return res.status(400).json({ error: 'SKU inválido' });
    await db.collection('products').doc(sku).delete();
    // Remove override também se existir
    await db.collection('product_overrides').doc(sku).delete().catch(() => {});
    res.json({ ok: true, sku });
  } catch (err) {
    console.error('[DELETE /products/:sku]', err);
    next(err);
  }
});

// Coleção Firestore: "embalagens"
// Documento: {
//   name, type, unit, width, height, depth,
//   stock, stockMin, cost, skus[], notes,
//   createdAtMs, updatedAtMs
// }
// ================================================================

// GET /embalagens/list
app.get('/embalagens/list', async (req, res, next) => {
  try {
    const snap = await db.collection('embalagens').orderBy('createdAtMs', 'desc').get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ items });
  } catch (err) {
    console.error('[/embalagens/list]', err);
    next(err);
  }
});

// POST /embalagens — criar
app.post('/embalagens', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!safeTrim(b.name)) return res.status(400).json({ error: 'name obrigatório' });

    const doc = {
      name:       safeTrim(b.name),
      type:       ['saco','caixa','envelope','outro'].includes(b.type) ? b.type : 'saco',
      unit:       b.unit === 'mm' ? 'mm' : 'cm',
      width:      Number(b.width)    || 0,
      height:     Number(b.height)   || 0,
      depth:      Number(b.depth)    || 0,
      stock:      Number(b.stock)    || 0,
      stockMin:   Number(b.stockMin) || 0,
      cost:       Number(b.cost)     || 0,
      skus:       Array.isArray(b.skus) ? b.skus.map(s => safeTrim(s)).filter(Boolean) : [],
      notes:      safeTrim(b.notes),
      createdAtMs: nowMs(),
      updatedAtMs: nowMs(),
    };

    const ref = await db.collection('embalagens').add(doc);
    res.json({ ok: true, id: ref.id, item: { id: ref.id, ...doc } });
  } catch (err) {
    console.error('[POST /embalagens]', err);
    next(err);
  }
});

// PATCH /embalagens/:id — editar
app.patch('/embalagens/:id', async (req, res, next) => {
  try {
    const id = safeTrim(req.params.id);
    if (!id) return res.status(400).json({ error: 'missing id' });

    const b = req.body || {};
    const patch = { updatedAtMs: nowMs() };

    if (b.name !== undefined)     patch.name     = safeTrim(b.name);
    if (b.type !== undefined)     patch.type     = b.type;
    if (b.unit !== undefined)     patch.unit     = b.unit;
    if (b.width !== undefined)    patch.width    = Number(b.width)    || 0;
    if (b.height !== undefined)   patch.height   = Number(b.height)   || 0;
    if (b.depth !== undefined)    patch.depth    = Number(b.depth)    || 0;
    if (b.stock !== undefined)    patch.stock    = Number(b.stock)    || 0;
    if (b.stockMin !== undefined) patch.stockMin = Number(b.stockMin) || 0;
    if (b.cost !== undefined)     patch.cost     = Number(b.cost)     || 0;
    if (Array.isArray(b.skus))    patch.skus     = b.skus.map(s => safeTrim(s)).filter(Boolean);
    if (b.notes !== undefined)    patch.notes    = safeTrim(b.notes);

    await db.collection('embalagens').doc(id).set(patch, { merge: true });
    const snap = await db.collection('embalagens').doc(id).get();
    res.json({ ok: true, item: { id, ...snap.data() } });
  } catch (err) {
    console.error('[PATCH /embalagens/:id]', err);
    next(err);
  }
});

// DELETE /embalagens/:id
app.delete('/embalagens/:id', async (req, res, next) => {
  try {
    const id = safeTrim(req.params.id);
    if (!id) return res.status(400).json({ error: 'missing id' });
    await db.collection('embalagens').doc(id).delete();
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /embalagens/:id]', err);
    next(err);
  }
});

// POST /embalagens/:id/stock — ajustar estoque (entrada, saída, definir)
app.post('/embalagens/:id/stock', async (req, res, next) => {
  try {
    const id  = safeTrim(req.params.id);
    const op  = safeTrim(req.body.op);   // 'add' | 'sub' | 'set'
    const qty = Number(req.body.qty) || 0;
    const reason = safeTrim(req.body.reason || '');

    if (!id) return res.status(400).json({ error: 'missing id' });
    if (!['add','sub','set'].includes(op)) return res.status(400).json({ error: 'op inválida' });
    if (qty <= 0) return res.status(400).json({ error: 'qty inválida' });

    const ref  = db.collection('embalagens').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'embalagem não encontrada' });

    const current = Number(snap.data().stock || 0);
    let newStock;
    if (op === 'add') newStock = current + qty;
    else if (op === 'sub') newStock = Math.max(0, current - qty);
    else newStock = qty; // set

    await ref.set({
      stock: newStock,
      updatedAtMs: nowMs(),
    }, { merge: true });

    // Registra log de movimentação
    await db.collection('embalagens_log').add({
      embalagemId: id,
      op, qty, reason,
      stockBefore: current,
      stockAfter:  newStock,
      createdAtMs: nowMs(),
    });

    res.json({ ok: true, stock: newStock });
  } catch (err) {
    console.error('[POST /embalagens/:id/stock]', err);
    next(err);
  }
});

// GET /embalagens/alerts — retorna embalagens com estoque baixo (para o dashboard)
app.get('/embalagens/alerts', async (req, res, next) => {
  try {
    const snap = await db.collection('embalagens').get();
    const alerts = [];
    snap.forEach(d => {
      const e = d.data();
      const s = Number(e.stock || 0);
      const m = Number(e.stockMin || 0);
      if (m > 0 && s <= m * 1.5) {
        alerts.push({
          id: d.id,
          name: e.name,
          stock: s,
          stockMin: m,
          level: s <= m ? 'critical' : 'warn',
        });
      }
    });
    res.json({ alerts });
  } catch (err) {
    console.error('[/embalagens/alerts]', err);
    next(err);
  }
});

// ================================================================
// ROTA DE IMPORTAÇÃO VIA BROWSER
// E adicione a rota da página junto com as outras estáticas:
//   app.get('/importar', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'importar.html')));
// ================================================================

// POST /import/products — recebe lote de produtos do browser e grava no Firestore
app.post('/import/products', async (req, res, next) => {
  try {
    const products = Array.isArray(req.body.products) ? req.body.products : [];
    if (!products.length) return res.status(400).json({ error: 'products vazio' });
    if (products.length > 100) return res.status(400).json({ error: 'máximo 100 por lote' });

    const updatedAtMs = nowMs();
    const batch = db.batch();

    // Sanitiza HTML/CSS que pode vir da Descrição Complementar do Bling
    function stripHtml(str) {
      return (str || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    for (const p of products) {
      const sku  = safeTrim(p.sku);
      const name = stripHtml(safeTrim(p.name)); // sanitiza HTML do nome
      if (!sku || !name) continue;
      // Rejeita SKUs com CSS/HTML do campo Descrição Complementar do Bling
      if (sku.length > 60) continue;
      if (sku.includes(' ') || sku.includes(':') || sku.includes(';') || sku.includes('<') || sku.includes('>')) continue;

      // ── tokenize melhorado ────────────────────────────────────
      // Gera tokens exatos + prefixos de 3+ chars para busca por prefixo
      // Antes: só tokens exatos, mín 2 chars — "det" não achava "detergente"
      // Agora: "detergente" gera ["det","dete","deter","deter","deterge",
      //         "detergen","detergen","detergent","detergente"] + o token exato
      // Normaliza acentos: "ypê" → "ype" também fica no array
      function normalizeAccents(s) {
        return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      }

      function tokenize(v) {
        const base = safeTrim(v).toLowerCase();
        const norm = normalizeAccents(base); // versão sem acentos

        // gera tokens de ambas as versões (com e sem acento)
        function extractTokens(str) {
          return str
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .split(' ')
            .filter(t => t.length >= 2)
            .filter((t, i, a) => a.indexOf(t) === i)
            .slice(0, 20);
        }

        const tokens    = extractTokens(base);
        const norTokens = extractTokens(norm);

        // gera prefixos de 3..token.length para cada token
        function prefixes(t) {
          const ps = [];
          for (let i = 3; i < t.length; i++) ps.push(t.slice(0, i));
          return ps;
        }

        const all = new Set([...tokens, ...norTokens]);
        for (const t of [...tokens, ...norTokens]) {
          prefixes(t).forEach(p => all.add(p));
        }

        return Array.from(all).slice(0, 60); // Firestore suporta arrays grandes
      }

      const doc = {
        sku, name,
        bin:    safeTrim(p.bin)    || '',
        ean:    safeTrim(p.ean)    || '',
        eanBox: safeTrim(p.eanBox) || '',
        image:  './assets/placeholder.png',
        images: Array.isArray(p.images) ? p.images.filter(u => typeof u === 'string' && u.startsWith('http')) : [],
        nameKeywords: tokenize(name),
        updatedAtMs,
        situacao: safeTrim(p.situacao) || '',
        marca:    safeTrim(p.marca)    || '',
      };

      // Campos numéricos — só grava se tiver valor (stock aceita 0)
      const nums = ['weight','weightBruto','width','height','depth','itensPorCaixa','preco','precoCusto'];
      for (const k of nums) {
        const v = Number(p[k]);
        if (p[k] !== null && p[k] !== undefined && !isNaN(v) && v > 0) doc[k] = v;
      }
      if (p.stock !== null && p.stock !== undefined && !isNaN(Number(p.stock))) {
        doc.stock = Number(p.stock);
      }

      // Campos de data do relatório de estoque (ISO YYYY-MM-DD ou null)
      if (p.ultimaVenda)  doc.ultimaVenda  = p.ultimaVenda;
      if (p.ultimaCompra) doc.ultimaCompra = p.ultimaCompra;

      batch.set(db.collection('products').doc(sku), doc, { merge: true });
    }

    await batch.commit();
    res.json({ ok: true, count: products.length });
  } catch (err) {
    console.error('[POST /import/products]', err);
    next(err);
  }
});

// ================================================================
// Rota que retorna TODOS os produtos + overrides para o catálogo
// ================================================================

// GET /products/all — retorna todos os produtos com overrides (para o catálogo)
app.get('/products/all', async (req, res, next) => {
  try {
    // Busca todos os produtos
    const snap = await db.collection('products').orderBy('name').get();
    const products = snap.docs.map(d => ({ sku: d.id, ...d.data() }));

    // Busca todos os overrides em lote
    const overrideMap = new Map();
    if (products.length > 0) {
      const refs = products.map(p => db.collection('product_overrides').doc(p.sku));
      // Firestore getAll aceita até 500 docs
      const chunks = [];
      for (let i = 0; i < refs.length; i += 500) chunks.push(refs.slice(i, i + 500));
      for (const chunk of chunks) {
        const snaps = await db.getAll(...chunk);
        for (const s of snaps) if (s.exists) overrideMap.set(s.id, s.data());
      }
    }

    // Merge produto + override
    const items = products.map(p => {
      const ov = overrideMap.get(p.sku) || {};
      return {
        ...p,
        override: ov,
        displayImage:
          (Array.isArray(ov.stockPhotos) && ov.stockPhotos[0]) ||
          (Array.isArray(p.images) && p.images[0]) ||
          p.image ||
          '/assets/placeholder.png',
        displayBin: ov.customBinName || p.bin || '',
      };
    });

    res.json({ items, total: items.length });
  } catch (err) {
    console.error('[/products/all]', err);
    next(err);
  }
});
// ================================================================
// CLOUDINARY UPLOAD — /admin/save-photo-cloudinary/:sku
// Recebe o arquivo via multer (memória), envia ao Cloudinary,
// salva a URL pública no product_overrides do Firestore
// ================================================================
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name:  process.env.CLOUDINARY_CLOUD_NAME,
  api_key:     process.env.CLOUDINARY_API_KEY,
  api_secret:  process.env.CLOUDINARY_API_SECRET,
});

// Validar credenciais do Cloudinary
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.warn('⚠️  Cloudinary não configurado — configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET no .env');
}

// Multer em memória (não salva disco) — só para essa rota
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 }
});

app.post('/admin/save-photo-cloudinary/:sku',
  requireFirebaseAuth,
  requireFirebaseRole(['admin', 'operator', 'operacao', 'catalogo']),
  uploadMemory.single('file'),
  async (req, res, next) => {
    try {
      // Verificar credenciais Cloudinary
      if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        return res.status(500).json({ error: 'Cloudinary não configurado — adicione CLOUDINARY_* ao .env' });
      }

      const tenantId = req.auth.tenantId;
      const sku = safeTrim(req.params.sku);
      if (!sku)       return res.status(400).json({ error: 'missing sku' });
      if (!req.file)  return res.status(400).json({ error: 'missing file' });
      if (!okFileExt(req.file.originalname)) return res.status(400).json({ error: 'invalid file type' });

      const kind = safeTrim(req.body.kind || req.query.kind || 'stock');

      // Isolamento tenant em product_overrides (doc por SKU): não sobrescrever dados de outro tenant
      const ovRef = db.collection('product_overrides').doc(sku);
      const ovSnap = await ovRef.get();
      const prevOv = ovSnap.exists ? ovSnap.data() : {};
      if (prevOv.tenantId && prevOv.tenantId !== tenantId) {
        return res.status(403).json({ error: 'SKU vinculado a outro tenant' });
      }

      const prodSnapPre = await db.collection('products').doc(sku).get();
      if (prodSnapPre.exists) {
        const pd = prodSnapPre.data();
        if (pd.tenantId && pd.tenantId !== tenantId) {
          return res.status(403).json({ error: 'Produto pertence a outro tenant' });
        }
      }

      // Upload para o Cloudinary via stream (sem tocar no disco)
      const cloudUrl = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder:         `universobox-hub/${tenantId}/${sku}`,
            public_id:      `${sku}_${kind}_${Date.now()}`,
            resource_type:  'image',
            transformation: [{ quality: 'auto', fetch_format: 'auto' }],
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result.secure_url);
          }
        );
        stream.end(req.file.buffer);
      });

      // Salva a URL no Firestore (product_overrides) — sempre grava tenantId para novas migrações
      const patch = { updatedAtMs: nowMs(), tenantId };

      if (kind === 'bin') {
        patch.binPhoto = cloudUrl;
      } else if (kind === 'box') {
        const prevArr = Array.isArray(prevOv.boxPhotos) ? prevOv.boxPhotos : [];
        patch.boxPhotos = [cloudUrl, ...prevArr].slice(0, 10);
      } else {
        const prevArr = Array.isArray(prevOv.stockPhotos) ? prevOv.stockPhotos : [];
        patch.stockPhotos = [cloudUrl, ...prevArr].slice(0, 10);
      }

      await ovRef.set(patch, { merge: true });

      const prodSnap = await db.collection('products').doc(sku).get();
      const ovSnap2   = await ovRef.get();
      const merged   = mergeProduct(
        prodSnap.exists ? prodSnap.data() : null,
        ovSnap2.exists   ? ovSnap2.data()   : null
      );

      console.log(`[cloudinary] ${kind} upload ok — sku=${sku} url=${cloudUrl}`);
      res.json({ ok: true, url: cloudUrl, item: merged });
    } catch (err) {
      console.error('[/admin/save-photo-cloudinary]', err);
      next(err);
    }
  }
);
// ================================================================
app.post('/api/compras', async (req, res, next) => {
  try {
    const { items, notas, modalidade } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'Lista vazia' });

    const ts     = Date.now();
    const day    = yyyymmdd(new Date(ts));
    const compraId = `COMP_${day}_${uuidv4().slice(0, 6).toUpperCase()}`;
    const totalQty  = items.reduce((s, i) => s + Number(i.qty || 0), 0);
    const totalSkus = items.length;
    const marcas    = [...new Set(items.map(i => safeTrim(i.marca)).filter(m => m && m !== 'N/A'))];
    const mesAno    = day.slice(0, 6); // YYYYMM

    await db.collection('purchase_orders').doc(compraId).set({
      id: compraId,
      items,
      notas:      notas || '',
      modalidade: safeTrim(modalidade || 'FLEX'),
      status:     'pending',
      totalQty,
      totalSkus,
      marcas,
      mesAno,
      createdAtMs: ts,
    });

    const embSnap    = await db.collection('embalagens').get();
    const embalagens = embSnap.docs.map(d => d.data());
    const alertas    = new Set();
    items.forEach(item => {
      const emb = embalagens.find(e => (e.skus || []).includes(item.sku));
      if (emb) alertas.add(`⚠️ O SKU ${item.sku} usa a embalagem "${emb.name}". Verifique o estoque!`);
    });

    res.json({ ok: true, compraId, alertasEmbalagem: Array.from(alertas) });
  } catch (err) {
    console.error('[/api/compras] erro:', err);
    next(err);
  }
});

// GET /api/purchase-orders — log de pedidos do backend (sincronizado entre dispositivos)
// Filtro ?status= feito em memória para evitar índice composto no Firestore.
// Pedidos sem campo 'status' (criados antes da v2.0) são tratados como 'pending'.
app.get('/api/purchase-orders', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 30), 100);
    const snap = await db.collection('purchase_orders')
      .orderBy('createdAtMs', 'desc')
      .limit(limit)
      .get();
    let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (req.query.status) {
      const s = req.query.status;
      if (s === 'pending') {
        // inclui pedidos sem campo status (legado) como abertos
        items = items.filter(it => !it.status || it.status === 'pending');
      } else {
        items = items.filter(it => it.status === s);
      }
    }
    res.json({ items });
  } catch (err) {
    console.error('[GET /api/purchase-orders]', err);
    next(err);
  }
});

// PATCH /api/purchase-orders/:id/transit-status — atualiza transitSent/transitReceived por SKU
app.patch('/api/purchase-orders/:id/transit-status', async (req, res, next) => {
  try {
    const id     = safeTrim(req.params.id);
    const { sku, status } = req.body;
    if (!id || !sku || !status) return res.status(400).json({ error: 'id, sku e status obrigatórios' });
    const ref  = db.collection('purchase_orders').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'pedido não encontrado' });
    const field = status === 'received' ? 'transitReceived' : 'transitSent';
    await ref.set({ [field]: { ...(snap.data()[field] || {}), [sku]: true }, updatedAtMs: Date.now() }, { merge: true });
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/purchase-orders/:id/transit-status]', err);
    next(err);
  }
});

// ─── Compras NF-e ──────────────────────────────────────────────────────────

// Multer dedicado para upload de XML NF-e (memória, sem disco, 2 MB max)
const uploadXml = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = file.mimetype.includes('xml') || file.originalname.toLowerCase().endsWith('.xml');
    cb(ok ? null : new Error('Apenas arquivos XML são aceitos'), ok);
  },
});

// POST /api/compras/parse-xml — parseia XML NF-e de entrada sem gravar no Firestore
// Suporta layouts: nfeProc (com protocolo) e NFe puro
app.post('/api/compras/parse-xml', uploadXml.single('xml'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo XML não recebido' });

    const { XMLParser } = require('fast-xml-parser');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => name === 'det',
    });

    let obj;
    try {
      obj = parser.parse(req.file.buffer.toString('utf-8'));
    } catch (parseErr) {
      return res.status(400).json({ error: 'XML inválido ou corrompido' });
    }

    // Suporta dois layouts: com wrapper nfeProc ou NFe puro
    const infNFe =
      obj?.nfeProc?.NFe?.infNFe ||
      obj?.NFe?.infNFe ||
      obj?.nfeProc?.infNFe ||
      null;

    if (!infNFe) {
      return res.status(400).json({ error: 'Estrutura de NF-e não reconhecida no XML' });
    }

    const ide   = infNFe.ide  || {};
    const emit  = infNFe.emit || {};
    const total = infNFe.total?.ICMSTot || {};
    const dets  = Array.isArray(infNFe.det) ? infNFe.det : (infNFe.det ? [infNFe.det] : []);

    const nf = {
      numero:       String(ide.nNF   || ''),
      serie:        String(ide.serie || ''),
      dataEmissao:  String(ide.dhEmi || ide.dEmi || ''),
      fornecedor:   safeTrim(emit.xNome  || ''),
      cnpj:         safeTrim(emit.CNPJ   || ''),
      valorTotal:   parseFloat(total.vNF || 0),
    };

    const itens = dets.map((d) => {
      const prod = d.prod || {};
      const eanRaw = String(prod.cEAN || '').trim();
      return {
        codigo:        safeTrim(String(prod.cProd || '')),
        ean:           eanRaw && eanRaw !== 'SEM GTIN' ? eanRaw : null,
        descricao:     safeTrim(String(prod.xProd || '')),
        ncm:           safeTrim(String(prod.NCM   || '')),
        qty:           parseFloat(prod.qCom || 0),
        custoUnitario: parseFloat(prod.vUnCom || 0),
        valorTotal:    parseFloat(prod.vProd  || 0),
      };
    });

    res.json({ ok: true, nf, itens });
  } catch (err) {
    console.error('[POST /api/compras/parse-xml]', err);
    next(err);
  }
});

// POST /api/compras/:id/fechar — confirma pedido via dados do XML, atualiza estoque
app.post('/api/compras/:id/fechar', async (req, res, next) => {
  try {
    const id = safeTrim(req.params.id);
    const { valorTotal, fornecedor, fornecedorCnpj, notaFiscalNumero, notaFiscalSerie, itensXml } = req.body;

    if (!id) return res.status(400).json({ error: 'ID do pedido obrigatório' });
    if (!Array.isArray(itensXml)) return res.status(400).json({ error: 'itensXml deve ser um array' });

    const pedidoRef  = db.collection('purchase_orders').doc(id);
    const pedidoSnap = await pedidoRef.get();

    if (!pedidoSnap.exists) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (pedidoSnap.data().status === 'fechado') return res.status(409).json({ error: 'Pedido já foi fechado' });

    // Mescla custoUnitario do XML nos items do pedido
    const itemsOriginais  = pedidoSnap.data().items || [];
    const itemsAtualizados = itemsOriginais.map((item) => {
      const match = itensXml.find((x) => x.sku && x.sku === item.sku);
      return match ? { ...item, custoUnitario: Number(match.custoUnitario || 0) } : item;
    });

    // Batch: fecha pedido + incrementa stock dos produtos com match
    const admin = require('firebase-admin');
    const batch = db.batch();

    batch.update(pedidoRef, {
      status:            'fechado',
      valorTotal:        parseFloat(valorTotal || 0),
      fornecedor:        safeTrim(fornecedor    || ''),
      fornecedorCnpj:    safeTrim(fornecedorCnpj || ''),
      notaFiscalNumero:  safeTrim(notaFiscalNumero || ''),
      notaFiscalSerie:   safeTrim(notaFiscalSerie  || ''),
      dataFechamento:    Date.now(),
      items:             itemsAtualizados,
      updatedAtMs:       Date.now(),
    });

    for (const item of itensXml) {
      if (!item.sku) continue;
      const qty = Number(item.qty);
      if (!qty || qty <= 0) continue;
      const prodRef = db.collection('products').doc(item.sku);
      batch.update(prodRef, {
        stock:       admin.firestore.FieldValue.increment(qty),
        updatedAtMs: Date.now(),
      });
    }

    await batch.commit();
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/compras/:id/fechar]', err);
    next(err);
  }
});

// PATCH /api/purchase-orders/:id — atualiza metadados seguros (whitelist)
app.patch('/api/purchase-orders/:id', async (req, res, next) => {
  try {
    const ALLOWED = ['finDespesaId', 'notas'];
    const id      = safeTrim(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID obrigatório' });

    const patch = {};
    for (const k of ALLOWED) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
    }
    patch.updatedAtMs = Date.now();

    await db.collection('purchase_orders').doc(id).set(patch, { merge: true });
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/purchase-orders/:id]', err);
    next(err);
  }
});

// GET /api/compras/bi — dados de inteligência de compras (últimos 6 meses)
app.get('/api/compras/bi', async (req, res, next) => {
  try {
    const seisMs = Date.now() - (180 * 24 * 60 * 60 * 1000);

    const [ordersSnap, receiptsSnap, transitSnap] = await Promise.all([
      db.collection('purchase_orders').where('createdAtMs', '>=', seisMs).get(),
      db.collection('stock_receipts').where('createdAtMs', '>=', seisMs).get(),
      db.collection('transit_items').where('status', '==', 'transit').get(),
    ]);

    const orders   = ordersSnap.docs.map(d => d.data());
    const receipts = receiptsSnap.docs.map(d => d.data());

    // ── Agrupamento mensal ──────────────────────────────────────
    const byMonth = {};
    for (const o of orders) {
      const mes = o.mesAno || yyyymmdd(new Date(o.createdAtMs)).slice(0, 6);
      if (!byMonth[mes]) byMonth[mes] = { pedidos: 0, skus: 0, unidades: 0, modalidades: {} };
      byMonth[mes].pedidos++;
      byMonth[mes].skus     += Number(o.totalSkus || 0);
      byMonth[mes].unidades += Number(o.totalQty  || 0);
      const mod = o.modalidade || 'FLEX';
      byMonth[mes].modalidades[mod] = (byMonth[mes].modalidades[mod] || 0) + 1;
    }

    // ── Lead time por marca ─────────────────────────────────────
    const leadByMarca = {};
    for (const r of receipts) {
      if (!r.marca || r.diasEmTransito == null) continue;
      if (!leadByMarca[r.marca]) leadByMarca[r.marca] = { total: 0, count: 0, min: 999, max: 0 };
      leadByMarca[r.marca].total += r.diasEmTransito;
      leadByMarca[r.marca].count++;
      if (r.diasEmTransito < leadByMarca[r.marca].min) leadByMarca[r.marca].min = r.diasEmTransito;
      if (r.diasEmTransito > leadByMarca[r.marca].max) leadByMarca[r.marca].max = r.diasEmTransito;
    }
    const leadTime = Object.entries(leadByMarca)
      .map(([marca, v]) => ({ marca, media: Math.round(v.total / v.count), min: v.min, max: v.max, count: v.count }))
      .sort((a, b) => b.count - a.count);

    // ── Top marcas por volume de unidades ───────────────────────
    const marcaFreq = {};
    for (const o of orders) {
      for (const item of (o.items || [])) {
        const m = item.marca && item.marca !== 'N/A' ? item.marca : null;
        if (!m) continue;
        if (!marcaFreq[m]) marcaFreq[m] = { pedidos: 0, unidades: 0 };
        marcaFreq[m].pedidos++;
        marcaFreq[m].unidades += Number(item.qty || 0);
      }
    }
    const topMarcas = Object.entries(marcaFreq)
      .map(([marca, v]) => ({ marca, ...v }))
      .sort((a, b) => b.unidades - a.unidades)
      .slice(0, 10);

    // ── Top itens por frequência (mais pedidos = mais vendidos) ─
    const itemFreq = {};
    for (const o of orders) {
      for (const item of (o.items || [])) {
        if (!item.sku) continue;
        if (!itemFreq[item.sku]) itemFreq[item.sku] = { sku: item.sku, name: item.name, marca: item.marca, image: item.image, pedidos: 0, unidades: 0, leadTimes: [] };
        itemFreq[item.sku].pedidos++;
        itemFreq[item.sku].unidades += Number(item.qty || 0);
      }
    }
    // Adiciona lead time por SKU
    for (const r of receipts) {
      if (r.sku && itemFreq[r.sku] && r.diasEmTransito != null) {
        itemFreq[r.sku].leadTimes.push(r.diasEmTransito);
      }
    }
    const topItens = Object.values(itemFreq)
      .map(item => ({
        ...item,
        leadMedia: item.leadTimes.length ? Math.round(item.leadTimes.reduce((a, b) => a + b, 0) / item.leadTimes.length) : null,
        leadTimes: undefined,
      }))
      .sort((a, b) => b.unidades - a.unidades)
      .slice(0, 20);

    // ── Divergências por marca ──────────────────────────────────
    const divergencias = receipts
      .filter(r => r.divergencia && r.divergencia.diff !== 0)
      .map(r => ({ marca: r.marca, sku: r.sku, esperada: r.divergencia.esperada, recebida: r.divergencia.recebida, diff: r.divergencia.diff, data: r.dataRecebido }))
      .sort((a, b) => b.data - a.data)
      .slice(0, 10);

    res.json({
      ok: true,
      totalPedidos:  orders.length,
      totalUnidades: orders.reduce((s, o) => s + Number(o.totalQty || 0), 0),
      emTransito:    transitSnap.size,
      byMonth: Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0])).map(([mes, v]) => ({ mes, ...v })),
      leadTime,
      topMarcas,
      topItens,
      divergencias,
    });
  } catch (err) {
    console.error('[GET /api/compras/bi]', err);
    next(err);
  }
});

// ================================================================
// ROTA DE FINANÇAS (INTEGRAÇÃO GOOGLE SHEETS)
// ================================================================

// Aproveitamos a mesma credencial que você já configurou para o Firebase!
const sheetsAuth = new google.auth.GoogleAuth({
  credentials: {
    client_email: serviceAccount.client_email,
    private_key: serviceAccount.private_key,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth: sheetsAuth });

// Pegue o ID da planilha do seu .env (é aquele código gigante na URL do Google Sheets)
const SPREADSHEET_ID = process.env.SPREADSHEET_ID; 
const SHEET_NAME = 'Despesas'; // Nome exato da aba na sua planilha

// --- Rota GET: Ler despesas da planilha ---
app.get('/api/despesas', requireFirebaseAuth, async (req, res, next) => {
  try {
    // Se SPREADSHEET_ID não está configurado, retorna lista vazia (Firestore é a fonte padrão)
    if (!SPREADSHEET_ID) return res.json({ items: [] });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:E`, 
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return res.json({ items: [] });

    const data = rows.slice(1).map((r, index) => {
      const dataBruta = r[0] ? String(r[0]).trim() : '';
      let nomeBruto = r[1] ? String(r[1]).trim() : '';
      let descricaoBruta = r[2] ? String(r[2]).trim() : '';
      const valorBruto = r[3] ? String(r[3]) : '0';
      const situacaoBruta = r[4] ? String(r[4]).trim().toLowerCase() : 'pendente';

      // Proteção para os registros antigos: se a Categoria(B) estiver vazia, chama de 'Outros'
      if (!nomeBruto && descricaoBruta) {
        nomeBruto = 'Outros';
      }

      // Limpeza agressiva da Moeda
      let valorLimpo = valorBruto.replace(/[R$\s]/g, '');
      if (valorLimpo.includes(',') && valorLimpo.includes('.')) {
         valorLimpo = valorLimpo.replace(/\./g, '').replace(',', '.');
      } else {
         valorLimpo = valorLimpo.replace(',', '.');
      }
      const valorNumerico = parseFloat(valorLimpo) || 0;

      let timestamp = 0;
      if (dataBruta.includes('/')) {
        const parts = dataBruta.split('/');
        if (parts.length === 3) timestamp = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00`).getTime();
      } else {
        timestamp = new Date().getTime() - (index * 10000); // Mantém ordem dos antigos
      }

      return {
        id: index,
        data: dataBruta,
        timestamp: timestamp,
        nome: nomeBruto,
        descricao: descricaoBruta,
        valor: valorNumerico,
        situacao: situacaoBruta
      };
    });

    const despesasValidas = data.filter(d => d.nome !== '' || d.descricao !== '' || d.valor > 0);
    despesasValidas.sort((a, b) => b.timestamp - a.timestamp);

    return res.json({ items: despesasValidas });
  } catch (err) {
    console.error('[/api/despesas GET]', err);
    return next(err);
  }
});

// --- Rota POST: Adicionar nova despesa ---
app.post('/api/despesas', async (req, res, next) => {
  try {
    if (!SPREADSHEET_ID) return res.status(500).json({ error: 'SPREADSHEET_ID não configurado' });
    const { data, nome, descricao, valor, situacao } = req.body;

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:A`, // ANCORAGEM FORÇADA NA COLUNA A
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS', // FORÇA A CRIAÇÃO DE UMA LINHA NOVA E LIMPA
      requestBody: {
        values: [[ data, nome, descricao || '', valor, situacao ]] 
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[/api/despesas POST]', err);
    next(err);
  }
});

// --- Rota POST: Parsear comprovante (PDF ou imagem) com Claude AI ---
app.post('/api/despesas/parse-comprovante', requireFirebaseAuth, uploadMemory.single('arquivo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const base64 = req.file.buffer.toString('base64');
    const mime   = req.file.mimetype || 'application/pdf';
    const isPdf  = mime === 'application/pdf';

    const contentBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image',    source: { type: 'base64', media_type: mime,               data: base64 } };

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          contentBlock,
          {
            type: 'text',
            text: 'Extraia do comprovante: 1) valor numérico em reais (ex: 11140.34 sem símbolo), 2) data no formato DD/MM/YYYY, 3) descrição curta com nome do pagador ou beneficiário. Responda APENAS em JSON válido sem markdown: {"valor":0.00,"data":"DD/MM/YYYY","descricao":"..."}',
          },
        ],
      }],
    });

    const raw = msg.content[0]?.text?.trim() || '{}';
    const parsed = JSON.parse(raw);
    res.json({ ok: true, valor: parsed.valor || 0, data: parsed.data || '', descricao: parsed.descricao || '' });
  } catch (err) {
    console.error('[parse-comprovante]', err);
    next(err);
  }
});

// --- Rota DELETE: Remover despesa por índice de linha (somente admin) ---
app.delete('/api/despesas/:rowIndex', requireFirebaseAuth, requireFirebaseRole(['admin']), async (req, res, next) => {
  try {
    if (!SPREADSHEET_ID) return res.status(500).json({ error: 'SPREADSHEET_ID não configurado' });

    const rowIndex = parseInt(req.params.rowIndex, 10);
    if (isNaN(rowIndex) || rowIndex < 0) return res.status(400).json({ error: 'rowIndex inválido' });

    // rowIndex é 0-based relativo aos dados (após header).
    // Linha real na planilha = rowIndex + 2 (1 header + 1-based)
    const sheetRowIndex = rowIndex + 1; // 0-based na API Sheets (após header)

    // Descobre o sheetId da aba "Despesas"
    const metaRes = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheet   = metaRes.data.sheets.find(s => s.properties.title === SHEET_NAME);
    if (!sheet) return res.status(404).json({ error: `Aba "${SHEET_NAME}" não encontrada` });
    const sheetId = sheet.properties.sheetId;

    // Primeiro: relê a planilha para confirmar que a linha bate com o dado esperado
    // (proteção contra race condition — dados podem ter sido reordenados)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId:   sheetId,
              dimension: 'ROWS',
              startIndex: sheetRowIndex,     // 0-based, inclui header (row 0) + dados
              endIndex:   sheetRowIndex + 1,
            }
          }
        }]
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/despesas/:rowIndex]', err);
    next(err);
  }
});

// ── PATCH /api/despesas/:rowIndex — atualiza situação (pago ↔ pendente) ───────
app.patch('/api/despesas/:rowIndex', requireFirebaseAuth, async (req, res, next) => {
  try {
    if (!SPREADSHEET_ID) return res.status(500).json({ error: 'SPREADSHEET_ID não configurado' });

    const rowIndex = parseInt(req.params.rowIndex, 10);
    if (isNaN(rowIndex) || rowIndex < 0) return res.status(400).json({ error: 'rowIndex inválido' });

    const { situacao } = req.body;
    if (!situacao) return res.status(400).json({ error: 'Campo situacao obrigatório' });

    // Linha real na planilha: rowIndex é 0-based nos dados; +2 por causa do header (row 1)
    const sheetRow = rowIndex + 2; // 1-based + 1 header
    const range = `${SHEET_NAME}!E${sheetRow}`; // Coluna E = situacao

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [[situacao]] },
    });

    res.json({ ok: true, situacao });
  } catch (err) {
    console.error('[PATCH /api/despesas/:rowIndex]', err);
    next(err);
  }
});

// ================================================================
// FIN-DESPESAS — Firestore como banco primário de despesas
// Substitui gradualmente o modelo de Google Sheets puro.
// Tipos: mensal_fixa | operacional | investimento
// Investimento cria automaticamente fin_compras + fin_parcelas
// ================================================================

// POST /api/fin-despesas — lança despesa no Firestore + appenda na planilha xlsx
app.post('/api/fin-despesas', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { uid, tenantId } = req.auth;
    const {
      data,             // "DD/MM/YYYY"
      tipo,             // 'mensal_fixa' | 'operacional' | 'investimento'
      categoria,
      fornecedor,
      descricao,
      valor,            // número
      situacao,         // 'pago' | 'pendente'
      meioId,           // opcional — ref fin_meios_pagamento
      numeroParcelas,   // obrigatório se tipo === 'investimento'
      taxaJuros,        // % mensal, opcional
      comprovante,      // { tipo, codigoAutenticacao, banco, dataOriginal, arquivo }
    } = req.body;

    if (!data || !tipo || !categoria || !fornecedor || !valor) {
      return res.status(400).json({ error: 'Campos obrigatórios: data, tipo, categoria, fornecedor, valor' });
    }

    // Converte "DD/MM/YYYY" para Timestamp do Firestore
    const [d, m, y] = data.split('/');
    const dataTs = admin.firestore.Timestamp.fromDate(new Date(`${y}-${m}-${d}T12:00:00`));

    const despesaDoc = {
      data: dataTs,
      tipo,
      categoria,
      fornecedor,
      descricao: descricao || '',
      valor: parseFloat(valor),
      situacao: situacao || 'pago',
      meioId: meioId || null,
      compraId: null,
      numeroParcela: null,
      comprovante: comprovante || null,
      tenantId,
      uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await admin.firestore().collection('fin_despesas').add(despesaDoc);
    let compraId = null;

    // Se for investimento parcelado → cria fin_compras + fin_parcelas
    if (tipo === 'investimento' && numeroParcelas && meioId) {
      const nParcelas = parseInt(numeroParcelas, 10);
      const taxa = parseFloat(taxaJuros || 0);
      const totalComJuros = parseFloat(valor) * (1 + (taxa / 100) * nParcelas);
      const valorBase = Math.floor((totalComJuros / nParcelas) * 100) / 100;
      const resto = Math.round((totalComJuros - valorBase * nParcelas) * 100) / 100;

      // Busca o meio de pagamento para pegar diaVencimento
      const meioSnap = await admin.firestore().collection('fin_meios_pagamento').doc(meioId).get();
      const meio = meioSnap.exists ? meioSnap.data() : {};
      const diaVenc = meio.diaVencimento || 10;

      const compraRef = await admin.firestore().collection('fin_compras').add({
        fornecedor,
        descricao: descricao || categoria,
        totalBruto: parseFloat(valor),
        totalComJuros,
        numeroParcelas: nParcelas,
        taxaJuros: taxa,
        meioId,
        meioNome: meio.nome || '',
        meioBandeira: meio.bandeira || '',
        sku: null,
        qtd: null,
        custoUnitario: null,
        status: 'aberta',
        despesaId: docRef.id,
        tenantId,
        uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      compraId = compraRef.id;

      // Atualiza despesa com compraId
      await docRef.update({ compraId });

      // Cria N parcelas
      const batch = admin.firestore().batch();
      const hoje = new Date(`${y}-${m}-${d}T12:00:00`);
      for (let i = 0; i < nParcelas; i++) {
        const vencMes = new Date(hoje);
        vencMes.setMonth(vencMes.getMonth() + i + 1);
        vencMes.setDate(Math.min(diaVenc, new Date(vencMes.getFullYear(), vencMes.getMonth() + 1, 0).getDate()));
        const valorParcela = i === nParcelas - 1 ? valorBase + resto : valorBase;
        const parcelaRef = admin.firestore().collection('fin_parcelas').doc();
        batch.set(parcelaRef, {
          compraId,
          fornecedor,
          descricao: descricao || categoria,
          meioId,
          meioNome: meio.nome || '',
          meioBandeira: meio.bandeira || '',
          numeroParcela: i + 1,
          totalParcelas: nParcelas,
          valor: valorParcela,
          vencimento: admin.firestore.Timestamp.fromDate(vencMes),
          status: 'pendente',
          comprovante: null,
          paidAt: null,
          tenantId,
          uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    return res.json({ ok: true, id: docRef.id, compraId });
  } catch (err) {
    console.error('[POST /api/fin-despesas]', err);
    return next(err);
  }
});

// GET /api/fin-despesas — lista despesas do Firestore com filtros opcionais
app.get('/api/fin-despesas', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { tipo, categoria, mes } = req.query; // mes = "YYYY-MM"

    let query = admin.firestore().collection('fin_despesas').orderBy('data', 'desc');

    if (tipo) query = query.where('tipo', '==', tipo);
    if (categoria) query = query.where('categoria', '==', categoria);
    if (mes) {
      const [year, month] = mes.split('-').map(Number);
      const inicio = admin.firestore.Timestamp.fromDate(new Date(year, month - 1, 1));
      const fim = admin.firestore.Timestamp.fromDate(new Date(year, month, 1));
      query = query.where('data', '>=', inicio).where('data', '<', fim);
    }

    const snap = await query.limit(500).get();
    const items = snap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        ...d,
        data: d.data?.toDate ? d.data.toDate().toLocaleDateString('pt-BR') : null,
        createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : null,
      };
    });

    return res.json({ items });
  } catch (err) {
    console.error('[GET /api/fin-despesas]', err);
    return next(err);
  }
});

// PATCH /api/fin-despesas/:id — atualiza situacao (pago/pendente)
app.patch('/api/fin-despesas/:id', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { situacao } = req.body;
    if (!['pago', 'pendente'].includes(situacao)) {
      return res.status(400).json({ error: 'situacao deve ser pago ou pendente' });
    }
    await admin.firestore().collection('fin_despesas').doc(id).update({ situacao });
    return res.json({ ok: true, situacao });
  } catch (err) {
    console.error('[PATCH /api/fin-despesas/:id]', err);
    return next(err);
  }
});

// DELETE /api/fin-despesas/:id — admin sempre; owner nas primeiras 24h
app.delete('/api/fin-despesas/:id', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { uid, role } = req.auth;
    const ref = admin.firestore().collection('fin_despesas').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Despesa não encontrada' });
    const data = snap.data();
    const isAdmin = role === 'admin';
    const isOwner = data.uid === uid;
    const createdMs = data.createdAt?.toMillis?.() ?? 0;
    const dentro24h = Date.now() - createdMs < 86400000;
    if (!isAdmin && !(isOwner && dentro24h)) {
      return res.status(403).json({ error: 'Sem permissão para excluir este lançamento' });
    }
    await ref.delete();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/fin-despesas/:id]', err);
    return next(err);
  }
});

// DELETE /api/fin-parcelas/:id — admin sempre; owner nas primeiras 24h
app.delete('/api/fin-parcelas/:id', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { uid, role } = req.auth;
    const ref = admin.firestore().collection('fin_parcelas').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Parcela não encontrada' });
    const data = snap.data();
    const isAdmin = role === 'admin';
    const isOwner = data.uid === uid;
    const createdMs = data.createdAt?.toMillis?.() ?? 0;
    const dentro24h = Date.now() - createdMs < 86400000;
    if (!isAdmin && !(isOwner && dentro24h)) {
      return res.status(403).json({ error: 'Sem permissão para excluir esta parcela' });
    }
    await ref.delete();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/fin-parcelas/:id]', err);
    return next(err);
  }
});

// DELETE /api/fin-compras/:id — cascade: compra + todas parcelas + despesa vinculada (admin apenas)
app.delete('/api/fin-compras/:id', requireFirebaseAuth, requireFirebaseRole(['admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const db = admin.firestore();
    const compraSnap = await db.collection('fin_compras').doc(id).get();
    if (!compraSnap.exists) return res.status(404).json({ error: 'Compra não encontrada' });
    const compra = compraSnap.data();
    const batch = db.batch();
    // Deleta todas as parcelas vinculadas
    const parcelasSnap = await db.collection('fin_parcelas').where('compraId', '==', id).get();
    parcelasSnap.forEach(d => batch.delete(d.ref));
    // Deleta a despesa vinculada (se existir)
    if (compra.despesaId) {
      batch.delete(db.collection('fin_despesas').doc(compra.despesaId));
    }
    // Deleta a compra
    batch.delete(db.collection('fin_compras').doc(id));
    await batch.commit();
    return res.json({ ok: true, parcelasRemovidas: parcelasSnap.size });
  } catch (err) {
    console.error('[DELETE /api/fin-compras/:id]', err);
    return next(err);
  }
});

// GET /api/fin-contas-unificadas — lista unificada fin_despesas + fin_parcelas
// Query: ?mes=YYYY-MM (opcional) — filtra por mês de vencimento
// Retorna items ordenados: vencida → pendente → pago
app.get('/api/fin-contas-unificadas', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;
    const { mes } = req.query; // YYYY-MM opcional
    const db = admin.firestore();

    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

    function statusItem(vencDate, situacao) {
      if (situacao === 'pago') return 'pago';
      const dias = Math.round((vencDate - hoje) / 86400000);
      return dias < 0 ? 'vencida' : 'pendente';
    }

    function mesDeData(d) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    const [despSnap, parcSnap] = await Promise.all([
      db.collection('fin_despesas').where('tenantId', '==', tenantId).get(),
      db.collection('fin_parcelas').where('tenantId', '==', tenantId).get(),
    ]);

    const items = [];

    despSnap.forEach(doc => {
      const d = doc.data();
      if (d.tipo === 'investimento') return; // coberto por fin_parcelas
      const venc = d.data?.toDate?.() ?? (d.data ? new Date(d.data) : null);
      if (!venc) return;
      if (mes && mesDeData(venc) !== mes) return;
      const status = statusItem(venc, d.situacao);
      items.push({
        id: doc.id, origem: 'despesa',
        fornecedor: d.fornecedor || d.categoria || '',
        descricao: d.descricao || '',
        tipo: d.tipo || 'operacional',
        categoria: d.categoria || '',
        valor: Number(d.valor || 0),
        vencimento: venc.toISOString(),
        status,
        diasParaVencer: Math.round((venc - hoje) / 86400000),
      });
    });

    parcSnap.forEach(doc => {
      const d = doc.data();
      const venc = d.vencimento?.toDate?.() ?? (d.vencimento ? new Date(d.vencimento) : null);
      if (!venc) return;
      if (mes && mesDeData(venc) !== mes) return;
      const status = statusItem(venc, d.status);
      const parc = d.totalParcelas > 1 ? ` (${d.numeroParcela}/${d.totalParcelas}x)` : '';
      items.push({
        id: doc.id, origem: 'parcela',
        fornecedor: d.fornecedor || '',
        descricao: `${d.descricao || d.fornecedor || ''}${parc}`,
        tipo: 'investimento',
        categoria: d.meioNome || 'Parcela',
        valor: Number(d.valor || 0),
        vencimento: venc.toISOString(),
        status,
        diasParaVencer: Math.round((venc - hoje) / 86400000),
        compraId: d.compraId || null,
        numeroParcela: d.numeroParcela,
        totalParcelas: d.totalParcelas,
        meioNome: d.meioNome || '',
      });
    });

    // vencida(0) → pendente(1) → pago(2), dentro do grupo: mais urgente primeiro
    const rank = s => s === 'vencida' ? 0 : s === 'pendente' ? 1 : 2;
    items.sort((a, b) => {
      const dr = rank(a.status) - rank(b.status);
      return dr !== 0 ? dr : a.diasParaVencer - b.diasParaVencer;
    });

    const soma = f => items.filter(f).reduce((s, i) => s + i.valor, 0);
    return res.json({
      ok: true, items,
      totais: {
        total:    soma(() => true),
        vencida:  soma(i => i.status === 'vencida'),
        pendente: soma(i => i.status === 'pendente'),
        pago:     soma(i => i.status === 'pago'),
      },
    });
  } catch (err) {
    console.error('[GET /api/fin-contas-unificadas]', err);
    return next(err);
  }
});

// GET /api/fin-obrigacoes — agrega obrigações financeiras pendentes
// Combina fin_despesas (exceto investimentos) + fin_parcelas pendentes
app.get('/api/fin-obrigacoes', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;

    const [despSnap, parcSnap] = await Promise.all([
      admin.firestore().collection('fin_despesas')
        .where('tenantId', '==', tenantId)
        .where('situacao', '==', 'pendente')
        .get(),
      admin.firestore().collection('fin_parcelas')
        .where('tenantId', '==', tenantId)
        .where('status', '==', 'pendente')
        .get(),
    ]);

    // Exclui investimentos no JS — evita índice composto com != no Firestore
    let totalDespesas = 0;
    let qtdDespesas = 0;
    despSnap.forEach(doc => {
      const d = doc.data();
      if (d.tipo === 'investimento') return;
      totalDespesas += Number(d.valor || 0);
      qtdDespesas++;
    });

    let totalParcelas = 0;
    parcSnap.forEach(doc => {
      totalParcelas += Number(doc.data().valor || 0);
    });

    return res.json({
      ok: true,
      totalObrigacoes: totalDespesas + totalParcelas,
      totalDespesas,
      totalParcelas,
      qtdDespesas,
      qtdParcelas: parcSnap.size,
    });
  } catch (err) {
    console.error('[GET /api/fin-obrigacoes]', err);
    return next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// fin_recebiveis — valores a receber (vendas liberadas, pix pendente, etc.)
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/fin-recebiveis — cria recebível
app.post('/api/fin-recebiveis', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { uid, tenantId } = req.auth;
    const { dataPrevista, valor, origem, descricao, status } = req.body;
    if (!dataPrevista || !valor) {
      return res.status(400).json({ error: 'Campos obrigatórios: dataPrevista, valor' });
    }
    const [d, m, y] = String(dataPrevista).split('/').length === 3
      ? String(dataPrevista).split('/')
      : [null, null, null];
    const ts = d
      ? admin.firestore.Timestamp.fromDate(new Date(`${y}-${m}-${d}T12:00:00`))
      : admin.firestore.Timestamp.fromDate(new Date(dataPrevista));
    const doc = {
      dataPrevista: ts,
      valor: parseFloat(valor),
      origem: origem || 'Manual',
      descricao: descricao || '',
      status: status || 'previsto',
      tenantId, uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await admin.firestore().collection('fin_recebiveis').add(doc);
    return res.json({ ok: true, id: ref.id });
  } catch (err) {
    console.error('[POST /api/fin-recebiveis]', err);
    return next(err);
  }
});

// GET /api/fin-recebiveis — lista recebíveis (com filtros ?status=&ateDias=)
app.get('/api/fin-recebiveis', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;
    const { status, ateDias } = req.query;
    // Sem índice composto: ordena por dataPrevista; filtra tenant/status em memória.
    const snap = await admin.firestore().collection('fin_recebiveis')
      .orderBy('dataPrevista', 'asc')
      .limit(1000)
      .get();
    const limiteMs = ateDias
      ? Date.now() + parseInt(ateDias, 10) * 86400000
      : null;
    const items = snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(d => d.tenantId === tenantId)
      .filter(d => !status || d.status === status)
      .filter(d => {
        if (!limiteMs) return true;
        const ts = d.dataPrevista?.toDate ? d.dataPrevista.toDate().getTime() : 0;
        return ts <= limiteMs;
      })
      .map(d => ({
        ...d,
        dataPrevista: d.dataPrevista?.toDate ? d.dataPrevista.toDate().toISOString() : null,
        createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : null,
      }));
    return res.json({ items });
  } catch (err) {
    console.error('[GET /api/fin-recebiveis]', err);
    return next(err);
  }
});

// PATCH /api/fin-recebiveis/:id — atualiza status ou valor/data
app.patch('/api/fin-recebiveis/:id', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, valor, dataPrevista, descricao, origem } = req.body;
    const update = {};
    if (status) {
      if (!['previsto', 'recebido', 'cancelado'].includes(status)) {
        return res.status(400).json({ error: 'status inválido' });
      }
      update.status = status;
    }
    if (valor != null) update.valor = parseFloat(valor);
    if (descricao != null) update.descricao = descricao;
    if (origem != null) update.origem = origem;
    if (dataPrevista) {
      const parts = String(dataPrevista).split('/');
      update.dataPrevista = parts.length === 3
        ? admin.firestore.Timestamp.fromDate(new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00`))
        : admin.firestore.Timestamp.fromDate(new Date(dataPrevista));
    }
    await admin.firestore().collection('fin_recebiveis').doc(id).update(update);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/fin-recebiveis/:id]', err);
    return next(err);
  }
});

// DELETE /api/fin-recebiveis/:id
app.delete('/api/fin-recebiveis/:id', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    await admin.firestore().collection('fin_recebiveis').doc(id).delete();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/fin-recebiveis/:id]', err);
    return next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Coletas — veículos cadastrados + agenda semanal de coletas (Flex/Agência)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/coletas/veiculos — lista veículos do tenant
app.get('/api/coletas/veiculos', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;
    const snap = await admin.firestore().collection('coletas_veiculos').limit(500).get();
    const data = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(v => v.tenantId === tenantId)
      .sort((a, b) => (a.placa || '').localeCompare(b.placa || ''));
    return res.json({ data });
  } catch (err) {
    console.error('[GET /api/coletas/veiculos]', err);
    return next(err);
  }
});

// POST /api/coletas/veiculos — cria veículo
app.post('/api/coletas/veiculos', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { uid, tenantId } = req.auth;
    const { placa, modelo, marca, cor, valor_frete } = req.body;
    if (!placa || !modelo || !marca) {
      return res.status(400).json({ error: 'placa, modelo e marca são obrigatórios' });
    }
    const doc = {
      placa: String(placa).trim().toUpperCase(),
      modelo: String(modelo).trim(),
      marca: String(marca).trim(),
      cor: String(cor || '').trim(),
      valor_frete: parseFloat(valor_frete) || 0,
      ativo: true,
      tenantId, uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await admin.firestore().collection('coletas_veiculos').add(doc);
    return res.json({ ok: true, id: ref.id });
  } catch (err) {
    console.error('[POST /api/coletas/veiculos]', err);
    return next(err);
  }
});

// PATCH /api/coletas/veiculos/:id — atualiza veículo
app.patch('/api/coletas/veiculos/:id', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;
    const { id } = req.params;
    const ref = admin.firestore().collection('coletas_veiculos').doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== tenantId) {
      return res.status(404).json({ error: 'veículo não encontrado' });
    }
    const { placa, modelo, marca, cor, valor_frete, ativo } = req.body;
    const update = {};
    if (placa != null) update.placa = String(placa).trim().toUpperCase();
    if (modelo != null) update.modelo = String(modelo).trim();
    if (marca != null) update.marca = String(marca).trim();
    if (cor != null) update.cor = String(cor).trim();
    if (valor_frete != null) update.valor_frete = parseFloat(valor_frete) || 0;
    if (ativo != null) update.ativo = !!ativo;
    await ref.update(update);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/coletas/veiculos/:id]', err);
    return next(err);
  }
});

// DELETE /api/coletas/veiculos/:id
app.delete('/api/coletas/veiculos/:id', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;
    const { id } = req.params;
    const ref = admin.firestore().collection('coletas_veiculos').doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== tenantId) {
      return res.status(404).json({ error: 'veículo não encontrado' });
    }
    await ref.delete();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/coletas/veiculos/:id]', err);
    return next(err);
  }
});

// GET /api/coletas/agenda?semana=YYYY-MM-DD — lista agendamentos da semana (6 dias)
app.get('/api/coletas/agenda', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;
    const { semana } = req.query;
    if (!semana) return res.status(400).json({ error: 'parâmetro semana=YYYY-MM-DD obrigatório' });
    const inicio = new Date(`${semana}T00:00:00`);
    const fim = new Date(inicio);
    fim.setDate(fim.getDate() + 6);
    const inicioStr = semana;
    const fimStr = fim.toISOString().split('T')[0];
    const snap = await admin.firestore().collection('coletas_agenda').limit(500).get();
    const data = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(a => a.tenantId === tenantId)
      .filter(a => a.data >= inicioStr && a.data < fimStr)
      .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    return res.json({ data });
  } catch (err) {
    console.error('[GET /api/coletas/agenda]', err);
    return next(err);
  }
});

// POST /api/coletas/agenda — cria agendamento
app.post('/api/coletas/agenda', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { uid, tenantId } = req.auth;
    const { data, veiculo_placa, modalidade, observacoes } = req.body;
    if (!data || !veiculo_placa || !modalidade) {
      return res.status(400).json({ error: 'data, veiculo_placa e modalidade são obrigatórios' });
    }
    if (!['flex', 'agencia'].includes(modalidade)) {
      return res.status(400).json({ error: 'modalidade inválida' });
    }
    const doc = {
      data: String(data),
      veiculo_placa: String(veiculo_placa).trim().toUpperCase(),
      modalidade,
      observacoes: String(observacoes || ''),
      tenantId, uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await admin.firestore().collection('coletas_agenda').add(doc);
    return res.json({ ok: true, id: ref.id });
  } catch (err) {
    console.error('[POST /api/coletas/agenda]', err);
    return next(err);
  }
});

// DELETE /api/coletas/agenda/:id
app.delete('/api/coletas/agenda/:id', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;
    const { id } = req.params;
    const ref = admin.firestore().collection('coletas_agenda').doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== tenantId) {
      return res.status(404).json({ error: 'agendamento não encontrado' });
    }
    await ref.delete();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/coletas/agenda/:id]', err);
    return next(err);
  }
});

// GET /api/coletas/resumo-dia?data=YYYY-MM-DD — conta orders do dia por modalidade
app.get('/api/coletas/resumo-dia', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { data } = req.query;
    if (!data) return res.status(400).json({ error: 'parâmetro data=YYYY-MM-DD obrigatório' });
    const inicio = new Date(`${data}T00:00:00-03:00`).getTime();
    const fim = inicio + 86400000;
    const snap = await admin.firestore().collection('orders')
      .where('createdAtMs', '>=', inicio)
      .where('createdAtMs', '<', fim)
      .limit(500)
      .get();
    let flex_count = 0, agencia_count = 0;
    snap.docs.forEach(d => {
      const o = d.data();
      if (o.logistica === 'flex') flex_count++;
      else if (o.logistica === 'fulfillment') return;
      else agencia_count++;
    });
    return res.json({ data: { flex_count, agencia_count } });
  } catch (err) {
    console.error('[GET /api/coletas/resumo-dia]', err);
    return next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Tarefas — Kanban board (colunas: novo / ativo / revisao / concluido)
// ═══════════════════════════════════════════════════════════════════════════

const TAREFA_STATUS = ['novo', 'ativo', 'revisao', 'concluido'];
const TAREFA_PRIORIDADE = ['baixa', 'media', 'alta'];

// GET /api/tarefas — lista todas as tarefas do tenant
app.get('/api/tarefas', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;
    const snap = await admin.firestore().collection('tarefas').limit(1000).get();
    const data = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(t => t.tenantId === tenantId)
      .map(t => ({
        ...t,
        dueDate: t.dueDate?.toDate ? t.dueDate.toDate().toISOString() : t.dueDate || null,
        createdAt: t.createdAt?.toDate ? t.createdAt.toDate().toISOString() : null,
        updatedAt: t.updatedAt?.toDate ? t.updatedAt.toDate().toISOString() : null,
      }))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return res.json({ data });
  } catch (err) {
    console.error('[GET /api/tarefas]', err);
    return next(err);
  }
});

// POST /api/tarefas — cria tarefa
app.post('/api/tarefas', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { uid, tenantId } = req.auth;
    const { titulo, descricao, status, prioridade, dueDate, responsavel, parentId } = req.body;
    if (!titulo || !String(titulo).trim()) {
      return res.status(400).json({ error: 'titulo é obrigatório' });
    }
    const doc = {
      titulo: String(titulo).trim(),
      descricao: String(descricao || '').trim(),
      status: TAREFA_STATUS.includes(status) ? status : 'novo',
      prioridade: TAREFA_PRIORIDADE.includes(prioridade) ? prioridade : 'media',
      dueDate: dueDate
        ? admin.firestore.Timestamp.fromDate(new Date(`${dueDate}T12:00:00`))
        : null,
      responsavel: String(responsavel || '').trim(),
      parentId: parentId || null,
      tenantId, uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await admin.firestore().collection('tarefas').add(doc);
    return res.json({ ok: true, id: ref.id });
  } catch (err) {
    console.error('[POST /api/tarefas]', err);
    return next(err);
  }
});

// PATCH /api/tarefas/:id — atualiza tarefa
app.patch('/api/tarefas/:id', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;
    const { id } = req.params;
    const ref = admin.firestore().collection('tarefas').doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== tenantId) {
      return res.status(404).json({ error: 'tarefa não encontrada' });
    }
    const { titulo, descricao, status, prioridade, dueDate, responsavel, parentId } = req.body;
    const update = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (titulo != null) update.titulo = String(titulo).trim();
    if (descricao != null) update.descricao = String(descricao).trim();
    if (status != null) {
      if (!TAREFA_STATUS.includes(status)) return res.status(400).json({ error: 'status inválido' });
      update.status = status;
    }
    if (prioridade != null) {
      if (!TAREFA_PRIORIDADE.includes(prioridade)) return res.status(400).json({ error: 'prioridade inválida' });
      update.prioridade = prioridade;
    }
    if (dueDate !== undefined) {
      update.dueDate = dueDate
        ? admin.firestore.Timestamp.fromDate(new Date(`${dueDate}T12:00:00`))
        : null;
    }
    if (responsavel != null) update.responsavel = String(responsavel).trim();
    if (parentId !== undefined) update.parentId = parentId || null;
    await ref.update(update);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/tarefas/:id]', err);
    return next(err);
  }
});

// DELETE /api/tarefas/:id
app.delete('/api/tarefas/:id', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;
    const { id } = req.params;
    const ref = admin.firestore().collection('tarefas').doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== tenantId) {
      return res.status(404).json({ error: 'tarefa não encontrada' });
    }
    await ref.delete();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/tarefas/:id]', err);
    return next(err);
  }
});

// ── helper: extrai valor/data/fornecedor de texto bruto de comprovante
function parsearTextoComprovante(rawText) {
  const MESES = {
    janeiro:'01', fevereiro:'02', março:'03', marco:'03', abril:'04',
    maio:'05', junho:'06', julho:'07', agosto:'08',
    setembro:'09', outubro:'10', novembro:'11', dezembro:'12',
  };

  // Mercado Pago quebra "R$ 11.140\n34" em duas linhas — reconstrói "R$ 11.140,34"
  const text = rawText.replace(/R\$\s*([\d.]+)\r?\n(\d{2})\b/g, 'R$ $1,$2');

  // Valor: maior R$ encontrado no texto normalizado
  let valor = 0;
  const valorMatches = [...text.matchAll(/R\$\s*([\d.]+,\d{2})/g)];
  if (valorMatches.length) {
    const valores = valorMatches.map(m => parseFloat(m[1].replace(/\./g, '').replace(',', '.')));
    valor = Math.max(...valores);
  }
  if (!valor) {
    // fallback: número com vírgula no formato brasileiro sem símbolo R$
    const semSimbolo = [...text.matchAll(/\b(\d{1,3}(?:\.\d{3})*,\d{2})\b/g)];
    if (semSimbolo.length) {
      const vals = semSimbolo.map(m => parseFloat(m[1].replace(/\./g, '').replace(',', '.')));
      valor = Math.max(...vals);
    }
  }

  // Data
  let data = '';
  const dataPorExtenso = text.match(/(\d{1,2})\s+de\s+([a-záêçãõ]+)\s+de\s+(\d{4})/i)
                      || text.match(/(\d{1,2})[\/\s]+([a-záêçãõ]{4,})[\/\s]+(\d{4})/i);
  if (dataPorExtenso) {
    const dia = dataPorExtenso[1].padStart(2, '0');
    const mes = MESES[dataPorExtenso[2].toLowerCase()] || '01';
    data = `${dia}/${mes}/${dataPorExtenso[3]}`;
  } else {
    const dataNum = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (dataNum) data = `${dataNum[1]}/${dataNum[2]}/${dataNum[3]}`;
  }

  // Fornecedor: múltiplos padrões em ordem de confiança
  let fornecedor = '';
  const padFornecedor = [
    /favorecido[:\s]*\r?\n?\s*([^\r\n]{3,60})/i,
    /recebedor[:\s]*\r?\n?\s*([^\r\n]{3,60})/i,
    /benefici[aá]rio[:\s]*\r?\n?\s*([^\r\n]{3,60})/i,
    /destinat[aá]rio[:\s]*\r?\n?\s*([^\r\n]{3,60})/i,
    /\bpara\b\s*\r?\n\s*([^\r\n]{3,60})/i,
    /\bpara\b\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^\r\n]{2,59})/,
    /\bnome[:\s]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^\r\n]{2,59})/i,
  ];
  for (const pat of padFornecedor) {
    const m = text.match(pat);
    if (m) {
      const candidato = m[1].trim();
      if (!/^\d[\d.\-\/\s]+$/.test(candidato)) {
        fornecedor = candidato.slice(0, 60);
        break;
      }
    }
  }

  return { valor, data, fornecedor };
}

// POST /api/fin-despesas/parse-comprovante — PDF (pdf-parse) ou imagem (Google Vision OCR)
app.post('/api/fin-despesas/parse-comprovante', requireFirebaseAuth, uploadMemory.single('arquivo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

    let text = '';
    const mime = req.file.mimetype;

    if (mime === 'application/pdf') {
      // PDF digital: extrai texto direto
      const pdfParse = require('pdf-parse');
      const result = await pdfParse(req.file.buffer);
      text = result.text;
    } else if (mime.startsWith('image/')) {
      // Imagem (foto de comprovante): usa Google Vision OCR
      const { google } = require('googleapis');
      const vision = google.vision('v1');
      const auth = new google.auth.GoogleAuth({
        credentials: serviceAccount,
        scopes: ['https://www.googleapis.com/auth/cloud-vision'],
      });
      const authClient = await auth.getClient();
      const response = await vision.images.annotate({
        auth: authClient,
        requestBody: {
          requests: [{
            image: { content: req.file.buffer.toString('base64') },
            features: [{ type: 'TEXT_DETECTION' }],
            imageContext: { languageHints: ['pt-BR'] },
          }],
        },
      });
      text = response.data.responses[0]?.fullTextAnnotation?.text
          || response.data.responses[0]?.textAnnotations?.[0]?.description
          || '';
    } else {
      return res.status(400).json({ error: 'Envie um PDF ou imagem (JPEG, PNG, etc.).' });
    }

    console.log('[parse-comprovante] texto extraído:\n', text.slice(0, 1000));
    const { valor, data, fornecedor } = parsearTextoComprovante(text);
    res.json({ ok: true, valor, data, fornecedor, _debug: text.slice(0, 1200) });
  } catch (err) {
    console.error('[parse-comprovante]', err);
    next(err);
  }
});

// POST /api/fin-despesas/importar-sheets — migra dados históricos do Google Sheets para Firestore
app.post('/api/fin-despesas/importar-sheets', requireFirebaseAuth, requireFirebaseRole(['admin']), async (req, res, next) => {
  try {
    if (!SPREADSHEET_ID) return res.status(500).json({ error: 'SPREADSHEET_ID não configurado' });
    const { uid, tenantId } = req.auth;

    // Lê todas as linhas do Sheets
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:E`,
    });
    const rows = (response.data.values || []).slice(1); // pula header

    // Tabela de mapeamento: padrão na descrição/nome → { tipo, categoria }
    const MAPA = [
      { re: /reforma|obra/i,                         tipo: 'mensal_fixa',  cat: 'Reforma' },
      { re: /prateleira/i,                           tipo: 'mensal_fixa',  cat: 'Prateleira' },
      { re: /contab|contador/i,                      tipo: 'mensal_fixa',  cat: 'Contabilidade' },
      { re: /imposto|mei\b/i,                        tipo: 'mensal_fixa',  cat: 'Impostos' },
      { re: /divis[aã]o|pix.{0,10}(conta|davi)/i,   tipo: 'operacional',  cat: 'Divisão do lucros' },
      { re: /operacional|operador/i,                 tipo: 'operacional',  cat: 'Operador Logístico' },
      { re: /ads|publicidade|afiliado|campanha/i,    tipo: 'operacional',  cat: 'Publicidade/ADS' },
      { re: /meli|mercado.?(livre|pago)|tarifas|full/i, tipo: 'operacional', cat: 'Marketplace' },
      { re: /shopee/i,                               tipo: 'operacional',  cat: 'Marketplace' },
      { re: /j3|jadlog|jt\b|transportadora|coleta|frete|francisco/i, tipo: 'operacional', cat: 'Transporte / Frete' },
      { re: /corola|flex/i,                          tipo: 'operacional',  cat: 'Transporte Flex' },
      { re: /etiqueta|embalagem|emabalgen|adesivo|leitor|envelope/i, tipo: 'operacional', cat: 'Embalagens / Etiquetas' },
      { re: /bling/i,                                tipo: 'mensal_fixa',  cat: 'Outros' },
      { re: /celular|internet|claro|tim|vivo/i,      tipo: 'mensal_fixa',  cat: 'Outros' },
    ];

    function inferir(nome, desc) {
      const texto = `${nome} ${desc}`.trim();
      for (const { re, tipo, cat } of MAPA) {
        if (re.test(texto)) return { tipo, cat };
      }
      return { tipo: 'operacional', cat: 'Outros' };
    }

    function parseSituacao(raw) {
      const s = (raw || '').trim().toLowerCase();
      if (s === 'paga' || s === 'pago') return 'pago';
      return 'pendente';
    }

    function parseValor(raw) {
      let v = String(raw || '0').replace(/[R$\s]/g, '');
      if (v.includes(',') && v.includes('.')) v = v.replace(/\./g, '').replace(',', '.');
      else v = v.replace(',', '.');
      return parseFloat(v) || 0;
    }

    let importados = 0;
    const erros = [];
    const BATCH_SIZE = 400;
    let batch = admin.firestore().batch();
    let batchCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const dataBruta = (r[0] || '').trim();
      const nomeBruto  = (r[1] || '').trim();
      const descBruta  = (r[2] || '').trim();
      const valor = parseValor(r[3]);
      const situacao = parseSituacao(r[4]);

      if (!dataBruta && !nomeBruto && !descBruta && valor === 0) continue; // linha vazia

      let timestamp = 0;
      let dataTs = null;
      if (dataBruta.includes('/')) {
        const [d, m, y] = dataBruta.split('/');
        const dt = new Date(`${y}-${m}-${d}T12:00:00`);
        if (!isNaN(dt)) { dataTs = admin.firestore.Timestamp.fromDate(dt); timestamp = dt.getTime(); }
      }
      if (!dataTs) { erros.push(`linha ${i+2}: data inválida "${dataBruta}"`); continue; }

      const { tipo, cat } = inferir(nomeBruto, descBruta);
      const fornecedor = nomeBruto || descBruta.split(/[\s\/]/)[0] || 'Desconhecido';
      const categoria  = nomeBruto || cat;

      const docRef = admin.firestore().collection('fin_despesas').doc();
      batch.set(docRef, {
        data: dataTs,
        tipo,
        categoria: categoria || cat,
        fornecedor,
        descricao: descBruta,
        valor,
        situacao,
        meioId: null,
        compraId: null,
        comprovante: { tipo: 'manual', arquivo: 'importado-sheets', codigoAutenticacao: '', banco: '', dataOriginal: dataBruta },
        tenantId,
        uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batchCount++;
      importados++;

      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        batch = admin.firestore().batch();
        batchCount = 0;
      }
    }
    if (batchCount > 0) await batch.commit();

    return res.json({ ok: true, importados, erros });
  } catch (err) {
    console.error('[POST /api/fin-despesas/importar-sheets]', err);
    return next(err);
  }
});

// ================================================================
// MARGEM — lê aba "Margem" da planilha Controle Financeiro
// ================================================================
app.get('/api/margem', requireFirebaseAuth, async (req, res, next) => {
  try {
    if (!SPREADSHEET_ID) return res.status(500).json({ error: 'SPREADSHEET_ID não configurado' });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Margem!A4:AD', // até coluna AD para garantir cobertura
    });

    const rows = response.data.values || [];
    if (rows.length < 2) return res.json({ items: [], totais: null });

    // Linha 0 = cabeçalhos (linha 4 na planilha)
    const headers = rows[0].map(h => String(h || '').trim());

    // Normaliza acentos para comparação robusta
    function norm(s) {
      return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }
    function col(name) {
      const needle = norm(name);
      const idx = headers.findIndex(h => norm(h).includes(needle));
      return idx >= 0 ? idx : -1;
    }

    // Log de debug em desenvolvimento
    console.log('[/api/margem] headers:', headers);

    function parseBRL(str) {
      if (str === undefined || str === null || str === '') return 0;
      const s = String(str);
      const neg = s.includes('-');
      const cleaned = s.replace(/[R$\s\-]/g, '').replace(/\./g, '').replace(',', '.');
      const val = parseFloat(cleaned) || 0;
      return neg ? -val : val;
    }

    function parsePerc(str) {
      if (!str) return 0;
      const n = parseFloat(String(str).replace('%', '').replace(',', '.'));
      return isNaN(n) ? 0 : n / 100;
    }

    const iData       = col('Data');
    const iRecLiq     = col('Receita Líquida');
    const iRecBruta   = col('Receita Bruta');
    const iCusto      = col('Custo Mercadoria');
    const iLucroBruto = col('Soma de Lucro');
    const iMargBruta  = col('Margem Bruta');
    const iImposto    = col('Imposto');
    const iBling      = col('Bling');
    const iADS        = col('ADS');
    const iCorola     = col('Corola');
    const iFlex       = col('Flex');
    const iContador   = col('Contador');
    const iObras      = col('Obras');
    const iEmbalagem  = col('Embalagem');
    const iCelular    = col('Celular');
    const iLogistica  = col('Logística');
    const iOutros     = col('Outros');
    const iDespTotal  = col('Despesas R');
    const iDespPerc   = col('Despesas %');
    const iLucroLiq   = col('Lucro Líquido');
    const iMargLiq    = col('Margem Líquida');

    const items = [];
    let totais  = null;

    for (let i = 1; i < rows.length; i++) {
      const r    = rows[i];
      const data = String(r[iData] || '').trim();
      if (!data) continue;

      const isTotal = data.toLowerCase().includes('total');

      const obj = {
        data,
        isTotal,
        receitaLiquida:  parseBRL(r[iRecLiq]),
        receitaBruta:    parseBRL(r[iRecBruta]),
        custoMercadoria: parseBRL(r[iCusto]),
        lucroBruto:      parseBRL(r[iLucroBruto]),
        margemBruta:     parsePerc(r[iMargBruta]),
        imposto:         parseBRL(r[iImposto]),
        despesas: {
          bling:     parseBRL(r[iBling]),
          ads:       parseBRL(r[iADS]),
          corola:    parseBRL(r[iCorola]),
          flex:      parseBRL(r[iFlex]),
          contador:  parseBRL(r[iContador]),
          obras:     parseBRL(r[iObras]),
          embalagem: parseBRL(r[iEmbalagem]),
          celular:   parseBRL(r[iCelular]),
          logistica: parseBRL(r[iLogistica]),
          outros:    parseBRL(r[iOutros]),
        },
        totalDespesas: parseBRL(r[iDespTotal]),
        despesasPerc:  parsePerc(r[iDespPerc]),
        lucroLiquido:  parseBRL(r[iLucroLiq]),
        margemLiquida: parsePerc(r[iMargLiq]),
      };

      if (isTotal) totais = obj;
      else         items.push(obj);
    }

    return res.json({ items, totais });
  } catch (err) {
    console.error('[GET /api/margem]', err);
    return next(err);
  }
});

// ================================================================
// MARGEM V2 — Dados reais: Bling NF-e + Firestore fin_despesas/fin_compras
// ================================================================

// Categorias que representam impostos/tributos (separadas das despesas operacionais)
const CATEGORIAS_IMPOSTO = ['das', 'simples nacional', 'simples', 'imposto', 'icms', 'iss', 'irpj', 'csll', 'pis', 'cofins', 'tributo'];

function ehCategoriaImposto(categoria) {
  const c = String(categoria || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return CATEGORIAS_IMPOSTO.some(k => c.includes(k));
}

// Agrega NF-e de saída do Bling para um mês (YYYY-MM)
// Retorna { total, porMarketplace: { MERCADO_LIVRE, SHOPEE, OUTROS }, totalNFs }
async function blingAgregaMes(mesAno) {
  const [ano, mes] = mesAno.split('-').map(Number);
  const dataInicio = `${mesAno}-01`;
  const ultimoDia  = new Date(ano, mes, 0).getDate();
  const dataFim    = `${mesAno}-${String(ultimoDia).padStart(2, '0')}`;
  // V3 retorna situacao como objeto {id,valor} OU número; excluímos apenas canceladas e inutilizadas
  const SITUACOES_EXCLUIR = new Set([3, 4, 9]);

  let pagina = 1;
  const nfsComValor = [];
  const nfsSemValor = [];

  while (true) {
    // Filtra por data diretamente na API para evitar varrer NFs fora do período
    const params = new URLSearchParams({
      pagina,
      limite: 100,
      dataEmissaoInicial: dataInicio,
      dataEmissaoFinal:   dataFim,
    });
    const resp  = await blingFetch(`/nfe?${params}`);
    const notas = resp.data || [];
    if (!notas.length) break;

    for (const n of notas) {
      // situacao pode ser objeto {id,valor} (Bling V3) ou número (V2)
      const sitId = Number(n.situacao?.id ?? n.situacao);
      if (SITUACOES_EXCLUIR.has(sitId)) continue;

      const mkt = detectarMktPorId(String(n.loja?.id || ''));
      const vt  = parseFloat(n.valorTotal || n.totalProdutos || n.valor || 0);

      if (vt > 0) nfsComValor.push({ id: n.id, mkt, valor: vt });
      else        nfsSemValor.push({ id: n.id, mkt });
    }

    if (notas.length < 100) break;
    if (++pagina > 20) break; // safety: máx 2.000 NFs/mês
  }

  // NFs sem valorTotal no listing → busca detalhes individuais (máx 30)
  await Promise.allSettled(
    nfsSemValor.slice(0, 30).map(async ({ id, mkt }) => {
      try {
        const det = await blingFetch(`/nfe/${id}`);
        const vt  = parseFloat((det.data || det).valorTotal || 0);
        if (vt > 0) nfsComValor.push({ id, mkt, valor: vt });
      } catch (_) {}
    })
  );

  const porMarketplace = { MERCADO_LIVRE: 0, SHOPEE: 0, OUTROS: 0 };
  let total = 0;
  for (const { mkt, valor } of nfsComValor) {
    total += valor;
    porMarketplace[mkt] = (porMarketplace[mkt] || 0) + valor;
  }

  return { total, porMarketplace, totalNFs: nfsComValor.length + nfsSemValor.length };
}

// ── GET /api/painel-financeiro ────────────────────────────────────────────────
// Painel mensal real: NF-e (receita) + contasreceber + contaspagar do Bling
// + fin_despesas + fin_parcelas do Firestore.
// Query: ?mes=YYYY-MM  (padrão: mês atual)
app.get('/api/painel-financeiro', requireFirebaseAuth, async (req, res, next) => {
  try {
    const hoje = new Date();
    const mes  = req.query.mes || `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const [ano, mm] = mes.split('-');
    const inicio = `${ano}-${mm}-01`;
    const fim    = new Date(Number(ano), Number(mm), 0); // último dia do mês
    const fimStr = `${ano}-${mm}-${String(fim.getDate()).padStart(2, '0')}`;
    // Formato DD/MM/YYYY para Bling
    const inicioFmt = `${inicio.split('-').reverse().join('/')}`;
    const fimFmt    = `${fimStr.split('-').reverse().join('/')}`;

    // ── 1. Receita: NF-e do Bling ─────────────────────────────────────────────
    let receitaNFe = { total: 0, porMarketplace: { MERCADO_LIVRE: 0, SHOPEE: 0, OUTROS: 0 } };
    let blingOk = false;
    try {
      receitaNFe = await blingAgregaMes(mes);
      blingOk = true;
    } catch (e) {
      console.warn('[painel] NF-e indisponível:', e.message);
    }

    // ── 2. Contas a Receber do Bling ──────────────────────────────────────────
    let contasReceber = { recebido: 0, pendente: 0, vencido: 0, itens: [] };
    try {
      let pagina = 1, continua = true;
      const itens = [];
      while (continua) {
        const r = await blingFetch(
          `/contasreceber?pagina=${pagina}&limite=100&dataVencimentoInicio=${inicioFmt}&dataVencimentoFim=${fimFmt}`
        );
        const dados = r?.data || [];
        dados.forEach(c => {
          const val = Number(c.valor || 0);
          const sit = Number(c.situacao?.id || 0);
          // 4 = recebida, 1 = aberta, 2 = parcial, 3 = vencida
          itens.push({ id: c.id, descricao: c.descricao || '', valor: val, situacao: sit, vencimento: c.dataVencimento });
          if (sit === 4 || sit === 5) contasReceber.recebido += val;
          else if (sit === 3)         contasReceber.vencido  += val;
          else                        contasReceber.pendente += val;
        });
        continua = dados.length === 100;
        pagina++;
      }
      contasReceber.itens = itens;
    } catch (e) {
      console.warn('[painel] contasreceber indisponível:', e.message);
    }

    // ── 3. Contas a Pagar do Bling ────────────────────────────────────────────
    let contasPagarBling = { pago: 0, pendente: 0, vencido: 0, itens: [] };
    try {
      let pagina = 1, continua = true;
      const itens = [];
      while (continua) {
        const r = await blingFetch(
          `/contaspagar?pagina=${pagina}&limite=100&dataVencimentoInicio=${inicioFmt}&dataVencimentoFim=${fimFmt}`
        );
        const dados = r?.data || [];
        dados.forEach(c => {
          const val = Number(c.valor || 0);
          const sit = Number(c.situacao?.id || 0);
          itens.push({ id: c.id, descricao: c.descricao || '', valor: val, situacao: sit, vencimento: c.dataVencimento, fornecedor: c.contato?.nome || '' });
          if (sit === 4 || sit === 5) contasPagarBling.pago    += val;
          else if (sit === 3)         contasPagarBling.vencido  += val;
          else                        contasPagarBling.pendente += val;
        });
        continua = dados.length === 100;
        pagina++;
      }
      contasPagarBling.itens = itens;
    } catch (e) {
      console.warn('[painel] contaspagar indisponível:', e.message);
    }

    // ── 4. Despesas locais (fin_despesas) ─────────────────────────────────────
    const inicioTs = admin.firestore.Timestamp.fromDate(new Date(inicio));
    const fimTs    = admin.firestore.Timestamp.fromDate(new Date(fimStr + 'T23:59:59'));
    const despSnap = await db.collection('fin_despesas')
      .where('data', '>=', inicioTs).where('data', '<=', fimTs).get();

    let despesasTotal = 0, despesasPago = 0, despesasPendente = 0;
    const despPorCategoria = {};
    despSnap.forEach(d => {
      const raw = d.data();
      if (raw.tipo === 'investimento') return; // parcelas já contadas separado
      const val = Number(raw.valor || 0);
      despesasTotal += val;
      if (raw.situacao === 'pago') despesasPago += val; else despesasPendente += val;
      const cat = raw.categoria || 'Outros';
      despPorCategoria[cat] = (despPorCategoria[cat] || 0) + val;
    });

    // ── 5. Parcelas do mês (fin_parcelas) ─────────────────────────────────────
    const parcSnap = await db.collection('fin_parcelas')
      .where('vencimento', '>=', inicioTs).where('vencimento', '<=', fimTs).get();

    let parcelasTotal = 0, parcelasPago = 0, parcelasPendente = 0;
    parcSnap.forEach(d => {
      const raw = d.data();
      const val = Number(raw.valor || 0);
      parcelasTotal += val;
      if (raw.status === 'pago') parcelasPago += val; else parcelasPendente += val;
    });

    // ── 6. Resultado ─────────────────────────────────────────────────────────
    const receitaBruta  = receitaNFe.total;
    const totalSaidas   = despesasTotal + parcelasTotal;
    const lucroLiquido  = receitaBruta - totalSaidas;
    const margemLiquida = receitaBruta > 0 ? lucroLiquido / receitaBruta : 0;

    res.json({
      mes,
      blingOk,
      receita: {
        bruta: receitaBruta,
        ML:     receitaNFe.porMarketplace.MERCADO_LIVRE || 0,
        Shopee: receitaNFe.porMarketplace.SHOPEE        || 0,
        outros: receitaNFe.porMarketplace.OUTROS        || 0,
      },
      contasReceber,
      contasPagarBling,
      despesas: { total: despesasTotal, pago: despesasPago, pendente: despesasPendente, porCategoria: despPorCategoria },
      parcelas: { total: parcelasTotal, pago: parcelasPago, pendente: parcelasPendente },
      resultado: { lucroLiquido, margemLiquida, totalSaidas },
    });
  } catch (err) {
    console.error('[GET /api/painel-financeiro]', err);
    next(err);
  }
});

// ── GET /api/margem-v2 ───────────────────────────────────────────────────────
// Agrega dados de margem: Bling NF-e + Firestore fin_despesas/fin_compras
// Query: ?de=YYYY-MM&ate=YYYY-MM  (padrão: últimos 12 meses)
app.get('/api/margem-v2', requireFirebaseAuth, async (req, res, next) => {
  try {
    const tenantId = req.auth?.tenantId || null;

    const hoje       = new Date();
    const ateDefault = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const deDefault  = (() => {
      const d = new Date(hoje);
      d.setMonth(d.getMonth() - 11);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    })();

    const de  = req.query.de  || deDefault;
    const ate = req.query.ate || ateDefault;

    function gerarMeses(de, ate) {
      const meses = [];
      let [y, m] = de.split('-').map(Number);
      const [aY, aM] = ate.split('-').map(Number);
      while (y < aY || (y === aY && m <= aM)) {
        meses.push(`${y}-${String(m).padStart(2, '0')}`);
        if (++m > 12) { m = 1; y++; }
      }
      return meses;
    }
    const meses = gerarMeses(de, ate);

    // ── 1. fin_despesas → despesas + impostos por mês ────────────────────────
    const deTs  = new Date(de  + '-01T00:00:00');
    const ateTs = new Date(ate + '-01T00:00:00');
    ateTs.setMonth(ateTs.getMonth() + 1);

    let despQuery = db.collection('fin_despesas')
      .where('data', '>=', deTs)
      .where('data', '<',  ateTs);
    if (tenantId) despQuery = despQuery.where('tenantId', '==', tenantId);

    const despSnap = await despQuery.get();
    const despPorMes = {};
    const catsPorMes = {};

    despSnap.forEach(doc => {
      const d  = doc.data();
      const dt = d.data?.toDate ? d.data.toDate() : new Date(d.data);
      const mm = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      if (!despPorMes[mm]) despPorMes[mm] = { imposto: 0, despesas: 0 };
      if (!catsPorMes[mm]) catsPorMes[mm] = {};

      const valor = Number(d.valor || 0);
      const cat   = String(d.categoria || 'Outros');

      if (ehCategoriaImposto(cat)) {
        despPorMes[mm].imposto += valor;
      } else {
        despPorMes[mm].despesas += valor;
        catsPorMes[mm][cat] = (catsPorMes[mm][cat] || 0) + valor;
      }
    });

    // ── 2. fin_compras → custo de mercadoria por mês ─────────────────────────
    let compQuery = db.collection('fin_compras')
      .where('createdAt', '>=', deTs)
      .where('createdAt', '<',  ateTs);
    if (tenantId) compQuery = compQuery.where('tenantId', '==', tenantId);

    const compSnap = await compQuery.get();
    const custoPorMes = {};

    compSnap.forEach(doc => {
      const d  = doc.data();
      const dt = d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt);
      const mm = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      custoPorMes[mm] = (custoPorMes[mm] || 0) + Number(d.totalBruto || 0);
    });

    // ── 3. fin_margem_mensal → overrides manuais (Shopee, dividendos) ────────
    const manualPorMes = {};
    for (const mm of meses) {
      const docId = tenantId ? `${tenantId}_${mm}` : mm;
      const snap  = await db.collection('fin_margem_mensal').doc(docId).get();
      if (snap.exists) manualPorMes[mm] = snap.data();
    }

    // ── 4. Bling NF-e → receita bruta (paralelo por mês) ────────────────────
    let blingOk = true;
    const receitaPorMes = {};
    try {
      await blingEnsureToken();
      // Paraleliza todos os meses — cada um já filtra por data na API (rápido)
      const resultados = await Promise.all(
        meses.map(mm => blingAgregaMes(mm).then(r => ({ mm, r })).catch(() => ({ mm, r: null })))
      );
      for (const { mm, r } of resultados) {
        if (r) receitaPorMes[mm] = r;
      }
    } catch (err) {
      blingOk = false;
      console.warn('[/api/margem-v2] Bling indisponível:', err.message);
    }

    // ── 5. Google Sheets fallback (histórico) ────────────────────────────────
    const sheetsPorMes = {};
    if (!blingOk && SPREADSHEET_ID) {
      try {
        const shResp = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Margem!A4:AD' });
        const shRows = shResp.data.values || [];
        const shHdrs = (shRows[0] || []).map(h => String(h).trim());
        const nrm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const col = name => shHdrs.findIndex(h => nrm(h).includes(nrm(name)));
        const brl = str => {
          if (!str) return 0;
          const neg = String(str).includes('-');
          const v = parseFloat(String(str).replace(/[R$\s\-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
          return neg ? -v : v;
        };
        const MESES_PT = { jan:1, fev:2, mar:3, abr:4, mai:5, jun:6, jul:7, ago:8, set:9, out:10, nov:11, dez:12 };
        const [iData, iRec, iCusto, iImp, iDesp, iLB] = [
          col('Data'), col('Receita Bruta'), col('Custo Mercadoria'),
          col('Imposto'), col('Despesas R'), col('Soma de Lucro'),
        ];
        for (let i = 1; i < shRows.length; i++) {
          const r = shRows[i];
          const dataStr = String(r[iData] || '').trim();
          if (!dataStr || dataStr.toLowerCase().includes('total')) continue;
          const match = dataStr.toLowerCase().match(/([a-z]+)[.-]+(\d+)/);
          if (!match) continue;
          const mesNum = MESES_PT[match[1].slice(0, 3)];
          const anoNum = 2000 + Number(match[2]);
          if (!mesNum) continue;
          const mm = `${anoNum}-${String(mesNum).padStart(2, '0')}`;
          sheetsPorMes[mm] = {
            receitaBruta:    brl(r[iRec]),
            custoMercadoria: brl(r[iCusto]),
            imposto:         brl(r[iImp]),
            totalDespesas:   brl(r[iDesp]),
            lucroBruto:      brl(r[iLB]),
          };
        }
      } catch (e) {
        console.warn('[/api/margem-v2] Sheets fallback falhou:', e.message);
      }
    }

    // ── 6. Monta items ────────────────────────────────────────────────────────
    const NOMES_MES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    function labelMes(mm) {
      const [a, m] = mm.split('-');
      return `${NOMES_MES[Number(m) - 1]}.-${String(a).slice(2)}`;
    }

    const items = meses.map(mm => {
      const desp    = despPorMes[mm]    || { imposto: 0, despesas: 0 };
      const custo   = custoPorMes[mm]   || 0;
      const receita = receitaPorMes[mm] || null;
      const manual  = manualPorMes[mm]  || {};
      const hist    = sheetsPorMes[mm]  || null;

      let receitaBruta, fonte;
      if (receita) {
        receitaBruta = receita.total + Number(manual.receitaShopeeManual || 0);
        fonte = (desp.despesas > 0 || desp.imposto > 0) ? 'automatico' : 'parcial';
      } else if (hist) {
        receitaBruta = hist.receitaBruta;
        fonte = 'historico';
      } else {
        receitaBruta = Number(manual.receitaBrutaManual || 0);
        fonte = 'manual';
      }

      const imposto       = receita ? desp.imposto       : hist ? hist.imposto       : Number(manual.impostoManual || 0);
      const totalDespesas = receita ? desp.despesas       : hist ? hist.totalDespesas : 0;
      const custoMerc     = receita ? custo               : hist ? hist.custoMercadoria : 0;
      const lucroBruto    = receitaBruta - custoMerc;
      const lucroLiquido  = lucroBruto - imposto - totalDespesas;
      const margemBruta   = receitaBruta > 0 ? lucroBruto   / receitaBruta : 0;
      const margemLiquida = receitaBruta > 0 ? lucroLiquido / receitaBruta : 0;
      const despesasPerc  = receitaBruta > 0 ? totalDespesas / receitaBruta : 0;

      return {
        mesAno: mm, data: labelMes(mm),
        receitaBruta,
        receitaML:      receita ? (receita.porMarketplace.MERCADO_LIVRE || 0) : 0,
        receitaShopee:  (receita ? (receita.porMarketplace.SHOPEE || 0) : 0) + Number(manual.receitaShopeeManual || 0),
        custoMercadoria: custoMerc,
        lucroBruto, margemBruta, imposto,
        totalDespesas, despesasPerc, lucroLiquido, margemLiquida,
        dividendos:  Number(manual.dividendos  || 0),
        observacoes: manual.observacoes || '',
        fonte,
        despesas: catsPorMes[mm] || {},
        fontes: {
          receita:  receita ? 'bling'      : hist ? 'sheets' : 'manual',
          custo:    custo > 0 ? 'firestore' : hist ? 'sheets' : 'manual',
          despesas: (desp.despesas > 0 || desp.imposto > 0) ? 'firestore' : hist ? 'sheets' : 'manual',
          imposto:  desp.imposto > 0 ? 'firestore' : hist ? 'sheets' : 'manual',
        },
      };
    });

    // Totais
    const totais = items.reduce((acc, d) => {
      acc.receitaBruta    += d.receitaBruta;
      acc.custoMercadoria += d.custoMercadoria;
      acc.lucroBruto      += d.lucroBruto;
      acc.imposto         += d.imposto;
      acc.totalDespesas   += d.totalDespesas;
      acc.lucroLiquido    += d.lucroLiquido;
      acc.dividendos      += d.dividendos;
      return acc;
    }, { receitaBruta:0, custoMercadoria:0, lucroBruto:0, imposto:0, totalDespesas:0, lucroLiquido:0, dividendos:0 });

    if (totais.receitaBruta > 0) {
      totais.margemBruta   = totais.lucroBruto   / totais.receitaBruta;
      totais.margemLiquida = totais.lucroLiquido  / totais.receitaBruta;
      totais.despesasPerc  = totais.totalDespesas / totais.receitaBruta;
    } else {
      totais.margemBruta = totais.margemLiquida = totais.despesasPerc = 0;
    }
    Object.assign(totais, { data: 'Total Geral', mesAno: 'Total', isTotal: true, fonte: 'total', despesas: {}, fontes: {} });

    return res.json({ items, totais, blingOk });
  } catch (err) {
    console.error('[GET /api/margem-v2]', err);
    return next(err);
  }
});

// ── PATCH /api/margem-mensal/:mesAno ─────────────────────────────────────────
// Salva overrides manuais (Shopee, dividendos, observações) em fin_margem_mensal
// Body: { receitaShopeeManual?, dividendos?, observacoes? }
app.patch('/api/margem-mensal/:mesAno', requireFirebaseAuth, async (req, res, next) => {
  try {
    const tenantId = req.auth?.tenantId || null;
    const { mesAno } = req.params;
    if (!/^\d{4}-\d{2}$/.test(mesAno)) return res.status(400).json({ error: 'mesAno inválido (YYYY-MM)' });

    const { receitaShopeeManual, dividendos, observacoes } = req.body;
    const docId  = tenantId ? `${tenantId}_${mesAno}` : mesAno;
    const update = { mesAno, tenantId: tenantId || null, uid: req.auth.uid, updatedAt: new Date() };
    if (receitaShopeeManual !== undefined) update.receitaShopeeManual = Number(receitaShopeeManual);
    if (dividendos          !== undefined) update.dividendos          = Number(dividendos);
    if (observacoes         !== undefined) update.observacoes         = String(observacoes);

    await db.collection('fin_margem_mensal').doc(docId).set(update, { merge: true });
    return res.json({ ok: true, docId });
  } catch (err) {
    console.error('[PATCH /api/margem-mensal]', err);
    return next(err);
  }
});

// ================================================================
// BLING INTEGRATION
// ================================================================
// ================================================================
// ================================================================

const BLING_CLIENT_ID     = process.env.BLING_CLIENT_ID     || '';
const BLING_CLIENT_SECRET = process.env.BLING_CLIENT_SECRET || '';
const BLING_REDIRECT_URI  = process.env.BLING_REDIRECT_URI  || '';
const BLING_TOKEN_URL     = 'https://api.bling.com.br/Api/v3/oauth/token';
const BLING_AUTH_URL      = 'https://api.bling.com.br/Api/v3/oauth/authorize';
const BLING_API_BASE      = 'https://api.bling.com.br/Api/v3';

// ── Mercado Livre OAuth constants ─────────────────────────────────────────────
const ML_CLIENT_ID     = process.env.ML_CLIENT_ID     || '';
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET || '';
const ML_REDIRECT_URI  = process.env.ML_REDIRECT_URI  || '';
const ML_TOKEN_URL     = 'https://api.mercadolibre.com/oauth/token';
const ML_AUTH_URL      = 'https://auth.mercadolivre.com.br/authorization';
const ML_API_BASE      = 'https://api.mercadolibre.com';

// ── TOKEN HELPERS ─────────────────────────────────────────────────
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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${creds}` },
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
async function blingFetch(path, retryCount = 0) {
  const token = await blingEnsureToken();
  const res = await fetch(`${BLING_API_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  });
  if (res.status === 401) throw new Error('bling_not_authorized');
  if (res.status === 429 && retryCount < 3) {
    // Rate limit — retry com backoff exponencial (1s, 2s, 4s)
    const delay = Math.pow(2, retryCount) * 1000;
    console.warn(`[blingFetch] 429 rate limit — retry em ${delay}ms (tentativa ${retryCount + 1}/3)`);
    await new Promise(r => setTimeout(r, delay));
    return blingFetch(path, retryCount + 1);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Bling ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

// ================================================================
// ROTA — Cadastro de produto via Bling API
// Cole em server.js após as rotas do Bling existentes
//
// Usa blingFetch/blingEnsureToken já definidos em bling_routes.js
// ================================================================

// Helper: POST autenticado no Bling
async function blingPost(path, body) {
  const token = await blingEnsureToken();
  const res = await fetch(`${BLING_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error('bling_not_authorized');
  const text = await res.text();
  if (!res.ok) throw new Error(`Bling ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// ── POST /produtos/cadastrar ──────────────────────────────────────────────
// Body: produto completo (ver campos abaixo)
// 1. Cria no Bling via API
// 2. Salva no Firestore products/{sku}
// 3. Retorna { ok, blingId, sku }
app.post('/produtos/cadastrar', async (req, res, next) => {
  try {
    const b = req.body;

    // Validações básicas
    const nome  = safeTrim(b.nome);
    const sku   = safeTrim(b.sku).toUpperCase();
    const marca = safeTrim(b.marca);
    if (!nome || !sku || !marca) {
      return res.status(400).json({ error: 'nome, sku e marca são obrigatórios' });
    }

    // ── 1. Monta payload Bling v3 ─────────────────────────────────────
    const blingPayload = {
      nome,
      codigo: sku,
      tipo: 'P',                          // Produto
      situacao: 'A',                      // Ativo
      formato: safeTrim(b.formato) || 'S', // S=Simples, C=Com composição
      descricaoCurta:    safeTrim(b.descricaoCurta)    || '',
      descricaoComplementar: safeTrim(b.descricaoLonga) || '',
      marca: { descricao: marca },
      pesoLiquido:  Number(b.pesoLiquido)  || 0,
      pesoBruto:    Number(b.pesoBruto)    || 0,
      // Bling v3 exige dimensões dentro do objeto "dimensoes"
      dimensoes: {
        largura:      Number(b.largura)      || 0,
        altura:       Number(b.altura)       || 0,
        profundidade: Number(b.profundidade) || 0,
        unidade:      'cm',
      },
      itensPorCaixa: Number(b.itensPorCaixa) || 1,
      observacoes:  safeTrim(b.ncm) ? `NCM: ${safeTrim(b.ncm)}` : '',
    };

    // EAN
    if (safeTrim(b.ean)) {
      blingPayload.gtin = safeTrim(b.ean);
    }

    // Categoria (necessária para aprovação nos marketplaces)
    if (safeTrim(b.categoria)) {
      blingPayload.categoria = { descricao: safeTrim(b.categoria) };
    }

    // Preço
    if (Number(b.preco) > 0) {
      blingPayload.preco = Number(b.preco);
    }

    // ── 2. Cria no Bling ───────────────────────────────────────────────
    let blingId = null;
    let blingErro = null;
    try {
      const blingResp = await blingPost('/produtos', blingPayload);
      blingId = blingResp?.data?.id || null;
    } catch (e) {
      // Não bloqueia — salva no Firestore mesmo sem Bling
      blingErro = e.message;
      console.warn('[POST /produtos/cadastrar] Bling falhou:', blingErro);
    }

    // ── 3. Salva no Firestore ──────────────────────────────────────────
    // Fotos do ML: aceita array de URLs externas enviado pelo frontend
    const mlFotos = Array.isArray(b.mlFotos)
      ? b.mlFotos.map(u => safeTrim(u)).filter(u => u.startsWith('http')).slice(0, 12)
      : [];

    const doc = {
      sku,
      name:         nome,
      marca,
      ean:          safeTrim(b.ean)    || '',
      eanBox:       safeTrim(b.eanBox) || '',
      bin:          '',
      images:       mlFotos,  // fotos do ML viram imagens iniciais do produto
      nameKeywords: [sku.toLowerCase(), ...nome.toLowerCase().split(/\s+/).filter(t => t.length >= 2), marca.toLowerCase()],
      weight:       Number(b.pesoLiquido)  || null,
      weightBruto:  Number(b.pesoBruto)    || null,
      width:        Number(b.largura)      || null,
      height:       Number(b.altura)       || null,
      depth:        Number(b.profundidade) || null,
      stock:        0,
      itensPorCaixa: Number(b.itensPorCaixa) || 1,
      situacao:     'Ativo',
      tagsRaw:      safeTrim(b.tagsRaw) || '',
      ncm:          safeTrim(b.ncm)     || '',
      preco:        Number(b.preco)     || 0,
      descricaoCurta: safeTrim(b.descricaoCurta) || '',
      descricaoLonga: safeTrim(b.descricaoLonga)  || '',
      blingId:      blingId,
      mlbIdOrigem:  safeTrim(b.mlbIdOrigem) || null,  // rastreabilidade: de qual MLB veio
      _cadastradoEm: nowMs(),
      updatedAtMs:   nowMs(),
    };

    await db.collection('products').doc(sku).set(doc, { merge: true });

    // Se há fotos do ML, salva também no product_overrides para exibição nas telas de operação
    if (mlFotos.length > 0) {
      await db.collection('product_overrides').doc(sku).set({
        stockPhotos: mlFotos,
        updatedAtMs: nowMs(),
      }, { merge: true });
    }

    res.json({
      ok: true,
      sku,
      blingId,
      blingErro: blingErro || null,
      mlFotosCount: mlFotos.length,
      mensagem: blingId
        ? `Produto ${sku} criado no Bling (id: ${blingId}) e salvo no sistema.`
        : `Produto ${sku} salvo no sistema. ${blingErro ? 'Bling: ' + blingErro : ''}`,
    });

  } catch (err) {
    console.error('[POST /produtos/cadastrar]', err);
    next(err);
  }
});

// ── GET /produtos/categorias-bling ────────────────────────────────────────
// Lista categorias do Bling para popular o select de categoria
app.get('/produtos/categorias-bling', async (req, res, next) => {
  try {
    const data = await blingFetch('/categorias/produtos?pagina=1&limite=100');
    const items = (data?.data || []).map(c => ({
      id:   c.id,
      nome: c.descricao || c.nome || '',
    }));
    res.json({ ok: true, items });
  } catch (err) {
    if (err.message === 'bling_not_authorized') {
      return res.status(401).json({ error: 'bling_not_authorized' });
    }
    // Retorna lista vazia se Bling falhar — não bloqueia a tela
    console.warn('[GET /produtos/categorias-bling]', err.message);
    res.json({ ok: true, items: [], erro: err.message });
  }
});

// ── Alias API: Categorias do Catálogo (aponta para /produtos/categorias-bling) ──
app.get('/api/catalogo/categorias', async (req, res, next) => {
  try {
    const data = await blingFetch('/categorias/produtos?pagina=1&limite=100');
    const items = (data?.data || []).map(c => ({
      id:   c.id,
      nome: c.descricao || c.nome || '',
    }));
    // Frontend espera array direto: Array.isArray(d)
    res.json(items);
  } catch (err) {
    if (err.message === 'bling_not_authorized') {
      return res.status(401).json({ error: 'bling_not_authorized' });
    }
    console.warn('[GET /api/catalogo/categorias]', err.message);
    res.json([]);
  }
});

// ── Buscar produto COMPLETO no Bling por SKU ou EAN ─────────────────────────
// Frontend (AutomacaoCadastro) espera objeto produto direto, não array
app.get('/api/catalogo/buscar', async (req, res, next) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Informe SKU ou EAN para buscar' });
  }
  try {
    // 1) Busca listagem por código (SKU)
    let listData = await blingFetch(`/produtos?codigo=${encodeURIComponent(q)}&limite=1`);
    let produtos = listData?.data || [];

    // 2) Se não achou por código, tenta por GTIN (EAN)
    if (!produtos.length) {
      listData = await blingFetch(`/produtos?gtin=${encodeURIComponent(q)}&limite=1`);
      produtos = listData?.data || [];
    }

    // 3) Se não achou, tenta busca genérica
    if (!produtos.length) {
      listData = await blingFetch(`/produtos?pesquisa=${encodeURIComponent(q)}&limite=1`);
      produtos = listData?.data || [];
    }

    if (!produtos.length) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    // 4) Busca detalhes completos do primeiro resultado
    const detail = await blingFetch(`/produtos/${produtos[0].id}`);
    const item = detail?.data || {};

    // 5) Extrai imagens (Bling retorna em formatos variados)
    const imgList = item.midia?.internas?.link || item.midia?.imagens || item.imagens || [];
    const imagens = (Array.isArray(imgList) ? imgList : [imgList])
      .map(img => typeof img === 'string' ? img : (img?.link || img?.url || ''))
      .filter(u => u && /^https?:\/\//i.test(u));

    // 6) Monta objeto no formato que o frontend espera
    const produto = {
      id:              item.id,
      nome:            item.nome || '',
      codigo:          item.codigo || '',
      gtin:            item.gtin || '',
      marca:           item.marca?.nome || item.marca || '',
      ncm:             item.classFiscal || item.ncm || '',
      situacao:        item.situacao || 'A',
      tipo:            item.tipo || 'P',
      origem:          item.origem ?? 0,
      preco:           item.preco ?? item.precoCusto ?? 0,
      descricaoCurta:  item.descricaoCurta || '',
      descricao:       item.descricao || '',
      pesoLiq:         item.pesoLiquido ?? item.pesoLiq ?? '0.000',
      pesoBruto:       item.pesoBruto ?? '0.000',
      largura:         item.dimensoes?.largura ?? item.largura ?? '0',
      altura:          item.dimensoes?.altura ?? item.altura ?? '0',
      profundidade:    item.dimensoes?.profundidade ?? item.profundidade ?? '0',
      categoria:       item.categoria ? { id: item.categoria.id, nome: item.categoria.descricao || item.categoria.nome || '' } : null,
      imagens,
    };

    console.log(`[GET /api/catalogo/buscar] q=${q} → id=${produto.id} sku=${produto.codigo} imgs=${imagens.length}`);
    res.json(produto);

  } catch (err) {
    if (err.message === 'bling_not_authorized') {
      return res.status(401).json({ error: 'bling_not_authorized' });
    }
    console.error('[GET /api/catalogo/buscar]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/catalogo/produto/:id  — salva produto editado no Bling ─────────
// blingFetch só suporta GET, então usamos fetch direto para PUT
app.put('/api/catalogo/produto/:id', requireFirebaseAuth, async (req, res, next) => {
  const produtoId = req.params.id;
  const body = req.body || {};

  if (!produtoId) {
    return res.status(400).json({ ok: false, error: 'ID do produto obrigatório' });
  }

  try {
    const token = await blingEnsureToken();

    // Monta payload para Bling (campos aceitos pela API v3)
    const payload = {};
    if (body.nome !== undefined)           payload.nome = body.nome;
    if (body.descricao !== undefined)      payload.descricao = body.descricao;
    if (body.descricaoCurta !== undefined) payload.descricaoCurta = body.descricaoCurta;
    if (body.preco !== undefined)          payload.preco = Number(body.preco) || 0;
    if (body.gtin !== undefined)           payload.gtin = body.gtin;
    if (body.marca !== undefined)          payload.marca = body.marca;

    // Imagens: Bling aceita URLs externas via midia.imagens.externas
    if (body.imagens && Array.isArray(body.imagens)) {
      const urls = body.imagens.filter(u => u && typeof u === 'string');
      if (urls.length) {
        payload.midia = {
          imagens: { externas: urls.map(url => ({ link: url })) }
        };
      }
    }

    const updateRes = await fetch(`${BLING_API_BASE}/produtos/${produtoId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await updateRes.text();
    let data = {};
    try { data = JSON.parse(text); } catch {}

    if (!updateRes.ok) {
      console.error(`[PUT /api/catalogo/produto/${produtoId}] Bling ${updateRes.status}: ${text.slice(0, 300)}`);
      throw new Error(data?.error?.message || `Bling retornou ${updateRes.status}`);
    }

    console.log(`[PUT /api/catalogo/produto/${produtoId}] OK`);
    res.json({ ok: true, message: 'Produto atualizado no Bling', produto: data?.data });

  } catch (err) {
    if (err.message === 'bling_not_authorized') {
      return res.status(401).json({ ok: false, error: 'bling_not_authorized' });
    }
    console.error(`[PUT /api/catalogo/produto/${produtoId}]`, err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ── Helpers ML ────────────────────────────────────────────────────────────────
const ML_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; ExpedicaoPro/1.0)',
};

// fetch com timeout explícito — Railway mata conexões longas sem resposta
async function fetchWithTimeout(url, opts = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Busca detalhes de um MLB + descrição em paralelo. Retorna { item, descricao }.
async function mlFetchItem(mlbId) {
  const [itemRes, descRes] = await Promise.allSettled([
    fetchWithTimeout(`https://api.mercadolibre.com/items/${mlbId}`, { headers: ML_HEADERS }),
    fetchWithTimeout(`https://api.mercadolibre.com/items/${mlbId}/description`, { headers: ML_HEADERS }),
  ]);

  // Log detalhado para diagnóstico
  if (itemRes.status === 'rejected') {
    const reason = itemRes.reason?.message || String(itemRes.reason);
    console.error(`[mlFetchItem] fetch REJECTED para ${mlbId}:`, reason);
    const isTimeout = reason.includes('abort') || reason.includes('timeout');
    throw Object.assign(
      new Error(isTimeout ? `Timeout ao buscar ${mlbId} — ML demorou mais de 12s.` : `Erro de rede ao buscar ${mlbId}: ${reason}`),
      { statusCode: 502 }
    );
  }

  const httpStatus = itemRes.value.status;
  if (!itemRes.value.ok) {
    console.error(`[mlFetchItem] HTTP ${httpStatus} para ${mlbId}`);
    if (httpStatus === 404) throw Object.assign(new Error(`Anúncio ${mlbId} não encontrado (inativo ou inexistente).`), { statusCode: 404 });
    const body = await itemRes.value.text().catch(() => '');
    throw Object.assign(new Error(`ML retornou HTTP ${httpStatus} para ${mlbId}. Body: ${body.slice(0, 200)}`), { statusCode: 502 });
  }

  const item = await itemRes.value.json();
  let descricao = null;
  if (descRes.status === 'fulfilled' && descRes.value.ok) {
    descricao = await descRes.value.json();
  }
  return { item, descricao };
}

// ── GET /produtos/ml-ping ─────────────────────────────────────────────────────
// Rota de diagnóstico: testa conectividade do Railway → ML
// Acesse: GET /produtos/ml-ping
app.get('/produtos/ml-ping', async (req, res) => {
  const start = Date.now();
  const results = {};

  // Teste 1: DNS + TCP para api.mercadolibre.com
  try {
    const r = await fetchWithTimeout('https://api.mercadolibre.com/sites/MLB', { headers: ML_HEADERS }, 8000);
    results.api_ml = { ok: r.ok, status: r.status, ms: Date.now() - start };
  } catch (e) {
    results.api_ml = { ok: false, error: e.message, ms: Date.now() - start };
  }

  // Teste 2: item público conhecido
  const t2 = Date.now();
  try {
    const r = await fetchWithTimeout('https://api.mercadolibre.com/items/MLB1939644618', { headers: ML_HEADERS }, 8000);
    const body = r.ok ? await r.json() : await r.text();
    results.item_test = { ok: r.ok, status: r.status, title: body?.title?.slice(0,40) || body?.slice?.(0,100), ms: Date.now() - t2 };
  } catch (e) {
    results.item_test = { ok: false, error: e.message, ms: Date.now() - t2 };
  }

  const allOk = Object.values(results).every(r => r.ok);
  res.status(allOk ? 200 : 502).json({
    ok: allOk,
    totalMs: Date.now() - start,
    nodeVersion: process.version,
    results,
  });
});

// ── GET /produtos/ml-item/:mlbId ──────────────────────────────────────────────
// Proxy para a API pública do ML — evita CORS no frontend
// Retorna item + descrição juntos
app.get('/produtos/ml-item/:mlbId', async (req, res, next) => {
  try {
    const mlbId = safeTrim(req.params.mlbId).toUpperCase().replace(/-/g,'');
    if (!mlbId.match(/^MLB\d{6,15}$/)) {
      return res.status(400).json({ error: 'Código MLB inválido. Use o formato MLB seguido de números.' });
    }
    const result = await mlFetchItem(mlbId);
    res.json(result);
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: err.message });
    // Retorna o erro completo em vez de 500 genérico — facilita diagnóstico
    console.error('[GET /produtos/ml-item]', err.message);
    res.status(err.statusCode || 502).json({ error: err.message });
  }
});

// ── GET /produtos/ml-busca-ean/:ean ───────────────────────────────────────────
// Busca um anúncio pelo EAN/GTIN na API pública do ML (site MLB)
// Estratégia: tenta /products/search (catálogo) e /search (buscador) em paralelo
// Retorna o primeiro item ativo encontrado com item + descrição
app.get('/produtos/ml-busca-ean/:ean', async (req, res, next) => {
  try {
    const ean = safeTrim(req.params.ean).replace(/\s+/g, '');
    if (!/^\d{8,14}$/.test(ean)) {
      return res.status(400).json({ error: 'EAN inválido. Use 8 a 14 dígitos numéricos.' });
    }

    // Tenta as duas APIs em paralelo — products/search (catálogo) costuma ser mais preciso
    const [catalogRes, searchRes] = await Promise.allSettled([
      fetchWithTimeout(`https://api.mercadolibre.com/products/search?site_id=MLB&q=${ean}&limit=5`, { headers: ML_HEADERS }),
      fetchWithTimeout(`https://api.mercadolibre.com/sites/MLB/search?q=${ean}&limit=5`, { headers: ML_HEADERS }),
    ]);

    let mlbId = null;

    // 1. Tenta catálogo de produtos (mais preciso para EAN)
    if (catalogRes.status === 'fulfilled' && catalogRes.value.ok) {
      const data = await catalogRes.value.json();
      const produtos = data.results || [];
      // Cada resultado do catálogo tem um buy_box_winner com item_id
      for (const p of produtos) {
        const id = p.buy_box_winner?.item_id || p.item_id;
        if (id && id.startsWith('MLB')) { mlbId = id; break; }
      }
    }

    // 2. Fallback: buscador padrão
    if (!mlbId && searchRes.status === 'fulfilled' && searchRes.value.ok) {
      const data = await searchRes.value.json();
      const resultados = data.results || [];
      for (const r of resultados) {
        if (r.id && r.id.startsWith('MLB') && r.condition !== 'not_specified') {
          mlbId = r.id; break;
        }
      }
    }

    if (!mlbId) {
      return res.status(404).json({ error: `Nenhum anúncio ativo encontrado para o EAN ${ean} no Mercado Livre.` });
    }

    // Busca detalhes completos do MLB encontrado
    const result = await mlFetchItem(mlbId);
    res.json({ ...result, mlbIdEncontrado: mlbId });

  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: err.message });
    console.error('[GET /produtos/ml-busca-ean]', err);
    next(err);
  }
});



// Detecta marketplace pelo campo loja ou padrão do nome do cliente
// Detecta marketplace pelo ID da loja (mais confiável que texto)
const LOJA_MKT = {
  '205524457': 'MERCADO_LIVRE',
  '205920469': 'MERCADO_LIVRE',  // ML Full
  '205547154': 'SHOPEE',
  '205744394': 'MAGALU',
  '205540309': 'TIKTOK',
  '205570762': 'OUTROS',         // ddbaby
  '205530029': 'OUTROS',         // Nuvemshop
};
function detectarMktPorId(lojaId) {
  return LOJA_MKT[lojaId] || 'OUTROS';
}

function detectarMkt(nf) {
  // tipoIntegracao é o campo mais confiável (ex: "Shopee", "Mercado Livre")
  const tipo = (nf.tipoIntegracao || '').toLowerCase();
  const loja = (nf.loja?.descricao || nf.loja?.nome || nf.origem?.descricao || '').toLowerCase();
  const nome = (nf.contato?.nome   || '').toLowerCase();
  const num  = String(nf.numeroPedidoLoja || '');

  if (tipo.includes('shopee') || loja.includes('shopee')) return 'SHOPEE';
  if (tipo.includes('mercado') || tipo.includes('meli') || tipo.includes('mlb')) return 'MERCADO_LIVRE';
  if (loja.includes('mercado') || loja.includes('meli')) return 'MERCADO_LIVRE';
  if (nome.match(/\([a-z0-9._-]+\)$/)) return 'MERCADO_LIVRE';
  if (num.length >= 11 && /^\d+$/.test(num)) return 'MERCADO_LIVRE';
  return 'OUTROS';
}

// ── PÁGINA ────────────────────────────────────────────────────────
app.get('/bling', (req, res) => res.redirect('/spa/financeiro/painel'));

// ── STATUS ────────────────────────────────────────────────────────
app.get('/bling/status', async (req, res) => {
  const tok = await blingGetToken();
  if (!tok) return res.json({ authorized: false });
  res.json({ authorized: true, expired: Date.now() > tok.expiresAt, updatedAtMs: tok.updatedAtMs });
});

// ── INICIAR OAUTH ─────────────────────────────────────────────────
app.get('/bling/auth', (req, res) => {
  if (!BLING_CLIENT_ID) return res.status(500).json({ error: 'BLING_CLIENT_ID não configurado' });
  const p = new URLSearchParams({ response_type: 'code', client_id: BLING_CLIENT_ID, redirect_uri: BLING_REDIRECT_URI, state: 'expedicao_pro' });
  res.redirect(`${BLING_AUTH_URL}?${p}`);
});

// ── CALLBACK OAUTH ────────────────────────────────────────────────
app.get('/bling/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/spa/financeiro/painel?bling=error&msg=auth_denied');
  try {
    const creds = Buffer.from(`${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`).toString('base64');
    const tokenRes = await fetch(BLING_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${creds}` },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: BLING_REDIRECT_URI }).toString(),
    });
    if (!tokenRes.ok) { console.error('[bling/callback]', await tokenRes.text()); return res.redirect('/spa/financeiro/painel?bling=error&msg=token_failed'); }
    await blingSaveToken(await tokenRes.json());
    res.redirect('/spa/financeiro/painel?bling=ok');
  } catch(e) { console.error('[bling/callback]', e); res.redirect('/spa/financeiro/painel?bling=error&msg=callback_error'); }
});

// ── DESCONECTAR ───────────────────────────────────────────────────
app.post('/bling/disconnect', async (req, res) => {
  await db.collection('bling_tokens').doc('main').delete();
  res.json({ ok: true });
});

// ── LISTAR NFs DO DIA ─────────────────────────────────────────────
// GET /bling/pedidos?data=2026-03-18
// Retorna resumo das NFs — suporta data única (?data=) ou range (?dataInicio=&dataFim=)
// Itens são carregados sob demanda via /bling/pedidos/:id
app.get('/bling/pedidos', async (req, res, next) => {
  try {
    const hoje    = new Date().toISOString().split('T')[0];
    // Suporte a range: dataInicio + dataFim  OU  data (legado, dia único)
    const dataInicio = req.query.dataInicio || req.query.data || hoje;
    const dataFim    = req.query.dataFim    || req.query.data || hoje;
    const pagina     = Number(req.query.pagina || 1);

    const situacaoFiltro = req.query.situacao || 'all';
    const params = new URLSearchParams({ pagina, limite: 100 });

    const resp  = await blingFetch(`/nfe?${params}`);
    const notas = resp.data || [];

    // Filtrar por range de datas (ISO yyyy-mm-dd)
    const notasRange = notas.filter(n => {
      const d = (n.dataEmissao || n.data || '').split(' ')[0]; // "yyyy-mm-dd"
      return d >= dataInicio && d <= dataFim;
    });

    // Filtro por loja (marketplace) — aplicado localmente
    const lojaFiltro = (req.query.loja || 'all').toLowerCase();
    const LOJAS = {
      ml:     '205524457',
      mlfull: '205920469',
      shopee: '205547154',
      magalu: '205744394',
      tiktok: '205540309',
      ddbaby: '205570762',
      nuv:    '205530029',
    };
    const matchLoja = (n) => {
      if (lojaFiltro === 'all') return true;
      const idLoja = String(n.loja?.id || '');
      if (LOJAS[lojaFiltro]) return idLoja === LOJAS[lojaFiltro];
      return idLoja === lojaFiltro;
    };

    const notasFiltradas = notasRange.filter(n => matchLoja(n));

    console.log(`[bling/pedidos] range=${dataInicio}→${dataFim} loja=${lojaFiltro} | total=${notas.length} range=${notasRange.length} filtrado=${notasFiltradas.length}`);

    const SIT_MAP = {
      1: 'Pendente', 2: 'Emitida DANFE', 3: 'Cancelada',
      4: 'Denegada', 5: 'Autorizada Sem DANFE', 6: 'Inutilizada', 7: 'Emitida DANFE'
    };

    const items = notasFiltradas.map(n => ({
      id:           n.id,
      numero:       n.numero,
      numeroPedido: n.numeroPedidoLoja || null,
      dataEmissao:  (n.dataEmissao || n.data || '').split(' ')[0],
      situacao:     SIT_MAP[Number(n.situacao)] || String(n.situacao || ''),
      cliente:      { nome: n.contato?.nome || '' },
      lojaId:       String(n.loja?.id || ''),
      marketplace:  detectarMktPorId(String(n.loja?.id || '')),
      valorTotal:   null,
      itens:        [],
      detalhado:    false,
    }));

    res.json({ items, total: items.length, dataInicio, dataFim });
  } catch(err) {
    if (err.message === 'bling_not_authorized') return res.status(401).json({ error: 'bling_not_authorized' });
    console.error('[GET /bling/pedidos]', err);
    next(err);
  }
});
// ── DETALHES DE UMA NF (com itens) ───────────────────────────────
// GET /bling/pedidos/:id
app.get('/bling/pedidos/:id', async (req, res, next) => {
  try {
    const resp = await blingFetch(`/nfe/${req.params.id}`);
    const n    = resp.data || resp;

    // LOG para diagnóstico — mostra estrutura real dos itens no Railway
    if (n.itens && n.itens.length > 0) {
      console.log(`[bling/nfe/${req.params.id}] primeiro item:`, JSON.stringify(n.itens[0], null, 2));
    } else {
      console.log(`[bling/nfe/${req.params.id}] SEM ITENS. Campos disponíveis:`, Object.keys(n));
    }

    const item = {
      id:           n.id,
      numero:       n.numero,
      numeroPedido: n.numeroPedidoLoja || n.numeroPedido || null,
      dataEmissao:  n.dataEmissao,
      situacao:     n.situacao?.descricao || '',
      cliente:      { nome: n.contato?.nome || '', email: n.contato?.email || '' },
      marketplace:  detectarMkt(n),
      valorTotal:   n.valorTotal || n.totalProdutos || 0,
      detalhado:    true,
      // Tenta todos os campos possíveis onde o Bling pode colocar os itens
      // Mapeamento correto baseado na estrutura real da API Bling v3
      // Campos confirmados: codigo, descricao, quantidade, valor, gtin, tipo
      itens: (n.itens || [])
        .filter(it => it.tipo === 'P' || !it.tipo) // só produtos, não serviços
        .map(it => ({
          sku:   safeTrim(it.codigo  || ''),
          nome:  safeTrim(it.descricao || ''),
          qty:   Number(it.quantidade ?? 1),
          preco: Number(it.valor ?? 0),
          ean:   safeTrim(it.gtin || ''),
        })),
    };

    res.json({ item });
  } catch(err) {
    if (err.message === 'bling_not_authorized') return res.status(401).json({ error: 'bling_not_authorized' });
    console.error('[GET /bling/pedidos/:id]', err);
    next(err);
  }
});


// ── DANFE PDF (proxy → QZ Tray) ──────────────────────────────────
// GET /bling/danfe/:id  → { ok, pdf: base64 } ou { ok, pdfUrl }
// Query params:
//   ?tipo=simplificado    → DANFE Simplificada (etiqueta 10x15cm)
//   ?tipo=completa        → DANFE completa (A4) [padrão]
//
// IMPORTANTE: NÃO enviar Accept: application/pdf — o Bling V3 retorna
// JSON com URL do PDF ou faz redirect. O header errado causa 404.
// Fluxo: 1) busca link via /nfe/:id/danfe sem Accept restritivo
//         2) se vier redirect → segue e baixa o PDF
//         3) se vier JSON → extrai URL e faz proxy do PDF
//         4) se vier binário PDF direto → converte para base64
app.get('/bling/danfe/:id', async (req, res, next) => {
  const tipoParam = req.query.tipo || 'completa'; // padrão = completa (A4)
  // Sanitiza: remove tudo que não for dígito (ex: traços, espaços, letras)
  const nfId = String(req.params.id).replace(/\D/g, '');
  if (!nfId) return res.status(400).json({ error: 'id_invalido', message: 'ID da NF deve ser numérico.' });

  // Converte URL do viewer Bling para URL de download direto
  // doc.view.php → doc.download.php (mesmo id + accessKey)
  function toBlingDownloadUrl(viewerUrl) {
    try {
      const u = new URL(viewerUrl);
      if (u.pathname.includes('doc.view.php')) {
        u.pathname = u.pathname.replace('doc.view.php', 'doc.download.php');
        return u.toString();
      }
    } catch {}
    return null;
  }

  // Helper: baixa URL, verifica assinatura %PDF e retorna base64
  // Retorna null se não for PDF válido (ex: HTML viewer, SVG, etc.)
  async function downloadPdf(url, via) {
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (!r.ok) return null;
      const buf = await r.arrayBuffer();
      if (buf.byteLength < 100) return null;
      // Verifica assinatura mágica %PDF nos primeiros bytes
      const header = Buffer.from(buf.slice(0, 5)).toString('ascii');
      if (!header.startsWith('%PDF')) {
        const preview = Buffer.from(buf.slice(0, 200)).toString('utf8');
        console.warn(`[danfe] downloadPdf(${via}) não é PDF — header="${header}" preview=${preview.slice(0,100).replace(/\n/g,' ')}`);
        return null;
      }
      return { pdf: Buffer.from(buf).toString('base64'), via };
    } catch { return null; }
  }

  try {
    const token = await blingEnsureToken();

    // ══════════════════════════════════════════════════════════════════════
    // SIMPLIFICADA (10x15 térmica) — curto-circuito ANTES de qualquer
    // fallback para linkPDF/linkPdf/linkDanfeFull (esses são DANFE A4 com
    // canhoto "RECEBEMOS DE..." e NÃO podem ser usados como simplificada).
    // O relatório interno /relatorios/danfe.simplificado.php?idNota1=X é o
    // único caminho confiável — requer sessão web do Bling (cookie), mas
    // o browser do usuário já está logado.
    // ══════════════════════════════════════════════════════════════════════
    if (tipoParam === 'simplificado') {
      const simplUrl = `https://www.bling.com.br/relatorios/danfe.simplificado.php?idNota1=${nfId}`;
      console.log(`[danfe/${nfId}] SIMPLIFICADA → ${simplUrl}`);
      return res.json({
        ok: true, nfId, tipo: 'simplificado',
        pdfUrl: simplUrl, via: 'danfe_simplificado_browser',
      });
    }

    try {
      const detResp = await fetch(`${BLING_API_BASE}/nfe/${nfId}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      });
      if (detResp.ok) {
        const det = await detResp.json().catch(() => ({}));
        const nf  = det?.data || det;

        console.log(`[danfe/${nfId}] detalhe sit=${nf?.situacao} campos=[${Object.keys(nf).join(',')}]`);

        // COMPLETA (A4): linkPDF > linkPdf > linkDanfeFull
        // (simplificado já saiu acima, aqui só cai tipo 'completa')
        // ATENÇÃO: linkDanfe = viewer HTML/SVG — NÃO é PDF binário!
        const linkPdf = nf?.linkPDF || nf?.linkPdf || nf?.linkDanfeFull;

        const linkViewer =
          nf?.linkDanfe || nf?.danfe?.link || nf?.urls?.danfe || nf?.url;

        // Tenta linkPDF primeiro (PDF verdadeiro)
        if (linkPdf) {
          console.log(`[danfe/${nfId}] linkPDF=${linkPdf}`);
          const result = await downloadPdf(linkPdf, 'linkPDF');
          if (result) return res.json({ ok: true, ...result, nfId, tipo: tipoParam });
        }

        // Tenta linkDanfe — normalmente é viewer HTML (doc.view.php)
        // Converte para doc.download.php para tentar PDF direto
        if (linkViewer) {
          console.log(`[danfe/${nfId}] linkDanfe(viewer)=${linkViewer}`);

          // Tenta versão download da mesma URL
          const downloadUrl = toBlingDownloadUrl(linkViewer);
          if (downloadUrl) {
            console.log(`[danfe/${nfId}] tentando download URL: ${downloadUrl}`);
            const result = await downloadPdf(downloadUrl, 'doc.download.php');
            if (result) return res.json({ ok: true, ...result, nfId, tipo: tipoParam });
          }

          // Tenta o viewer direto (às vezes retorna PDF)
          const result = await downloadPdf(linkViewer, 'linkDanfe_direto');
          if (result) return res.json({ ok: true, ...result, nfId, tipo: tipoParam });

          // É HTML viewer — retorna URL para o browser imprimir
          console.log(`[danfe/${nfId}] linkDanfe é HTML viewer — retornando pdfUrl`);
          return res.json({ ok: true, pdfUrl: linkViewer, nfId, tipo: tipoParam, via: 'linkDanfe_browser' });
        }

        // chaveAcesso → tenta serviço público da Receita Federal
        const chave = nf?.chaveAcesso?.replace(/\D/g, '');
        if (chave && chave.length === 44) {
          console.log(`[danfe/${nfId}] tentando SEFAZ com chave ${chave.slice(0,10)}…`);
          const sefazUrl = `https://www.nfe.fazenda.gov.br/portal/downloadNFe.aspx?chave=${chave}&tipoDownload=2`;
          const result = await downloadPdf(sefazUrl, 'sefaz_chave');
          if (result) return res.json({ ok: true, ...result, nfId, tipo: tipoParam });
        }
      } else {
        const errTxt = await detResp.text().catch(() => '');
        console.warn(`[danfe/${nfId}] detalhe retornou ${detResp.status}: ${errTxt.slice(0, 200)}`);
      }
    } catch (detErr) {
      console.warn(`[danfe/${nfId}] detalhe exception: ${detErr.message}`);
    }

    // ══════════════════════════════════════════════════════════════════════
    // PASSO 2 — Endpoint /nfe/{id}/danfe com redirect manual
    // Adiciona ?tipo=simplificado se solicitado (DANFE etiqueta 10x15cm)
    // ══════════════════════════════════════════════════════════════════════
    const danfeUrl = tipoParam === 'simplificado'
      ? `${BLING_API_BASE}/nfe/${nfId}/danfe?tipo=simplificado`
      : `${BLING_API_BASE}/nfe/${nfId}/danfe`;

    const danfeResp = await fetch(danfeUrl, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json, */*;q=0.8' },
      redirect: 'manual',
    });

    const dSt  = danfeResp.status;
    const dCt  = danfeResp.headers.get('content-type') || '';
    const dLoc = danfeResp.headers.get('location') || '';
    console.log(`[danfe/${nfId}] /danfe endpoint status=${dSt} ct=${dCt} location=${dLoc}`);

    if (dSt === 401) return res.status(401).json({ error: 'bling_not_authorized' });

    // Redirect → segue
    if ([301, 302, 307, 308].includes(dSt) && dLoc) {
      const result = await downloadPdf(dLoc, 'redirect');
      if (result) return res.json({ ok: true, ...result, nfId });
      return res.json({ ok: true, pdfUrl: dLoc, nfId, via: 'redirect_url' });
    }

    if (danfeResp.ok) {
      // PDF binário
      if (dCt.includes('pdf') || dCt.includes('octet')) {
        const buf = await danfeResp.arrayBuffer();
        return res.json({ ok: true, pdf: Buffer.from(buf).toString('base64'), nfId, tipo: tipoParam, via: 'binary' });
      }
      // JSON com URL
      const raw = await danfeResp.text();
      console.log(`[danfe/${nfId}] /danfe body: ${raw.slice(0, 400)}`);
      let data = {};
      try { data = JSON.parse(raw); } catch {}
      const pdfUrl =
        data?.data?.url || data?.data?.link || data?.data?.danfe ||
        (typeof data?.data === 'string' && data.data.startsWith('http') ? data.data : null) ||
        data?.url || data?.link || data?.danfe || null;
      if (pdfUrl) {
        const result = await downloadPdf(pdfUrl, 'json_url');
        if (result) return res.json({ ok: true, ...result, nfId, tipo: tipoParam });
        return res.json({ ok: true, pdfUrl, nfId, tipo: tipoParam, via: 'json_url_fallback' });
      }
      // ZPL ou texto desconhecido
      return res.status(422).json({ error: 'danfe_json_sem_url', rawBody: raw.slice(0, 400) });
    }

    // Erro do Bling — loga o body real para debug
    const errRaw = await danfeResp.text().catch(() => '');
    console.error(`[danfe/${nfId}] /danfe error ${dSt}: ${errRaw.slice(0, 400)}`);

    // ══════════════════════════════════════════════════════════════════════
    // PASSO 3 — Fallback: abre danfe.simplificado.php no browser do usuário
    // O Bling não expôs PDF via API mas o viewer web funciona (requer sessão)
    // ══════════════════════════════════════════════════════════════════════
    if (tipoParam === 'simplificado') {
      const simplUrl = `https://www.bling.com.br/relatorios/danfe.simplificado.php?idNota1=${nfId}`;
      console.log(`[danfe/${nfId}] fallback danfe.simplificado.php → ${simplUrl}`);
      return res.json({ ok: true, pdfUrl: simplUrl, nfId, tipo: 'simplificado', via: 'danfe_simplificado_browser' });
    }

    return res.status(404).json({
      error:   'danfe_nao_disponivel',
      message: 'DANFE indisponível via API. Verifique se a NF está autorizada no Bling.',
      detail:  errRaw.slice(0, 300),
      nfId,
    });

  } catch(err) {
    if (err.message === 'bling_not_authorized') return res.status(401).json({ error: 'bling_not_authorized' });
    console.error(`[GET /bling/danfe/${nfId}]`, err.message);
    next(err);
  }
});

// ── Etiqueta de Transporte via Bling API v3 → ZPL para QZ Tray ───────
// GET /bling/etiqueta-transporte/:nfId
//   → { ok, format: 'zpl', zpl } (preferido)
//   → { ok, format: 'pdf', pdf } (base64)
//   → { ok, format: 'pdf_url', pdfUrl } (fallback browser)
//
// O Bling web chama `gerarEtiquetasTransporte` (AJAX interno) que retorna
// ZPL e dispara QZ Tray. Para nós, replicamos via API v3 tentando múltiplos
// caminhos em sequência. Use /bling/debug/etiqueta/:nfId para inspecionar
// a resposta crua quando algo não funcionar.
app.get('/bling/etiqueta-transporte/:nfId', async (req, res, next) => {
  const nfId = String(req.params.nfId).replace(/\D/g, '');
  if (!nfId) return res.status(400).json({ error: 'id_invalido', message: 'ID da NF deve ser numérico.' });

  try {
    const token = await blingEnsureToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

    // Helper: tenta um endpoint, classifica o retorno (zpl/pdf/url/json)
    async function tryEndpoint(url, via) {
      try {
        const r = await fetch(url, { headers });
        const ct = r.headers.get('content-type') || '';
        const st = r.status;
        console.log(`[etiq-transp/${nfId}] (${via}) ${st} ct=${ct}`);
        if (!r.ok) return null;

        // PDF / octet
        if (ct.includes('pdf') || ct.includes('octet')) {
          const buf = await r.arrayBuffer();
          const sig = Buffer.from(buf.slice(0, 4)).toString('ascii');
          if (sig === '%PDF') return { format: 'pdf', pdf: Buffer.from(buf).toString('base64'), via };
          const txt = Buffer.from(buf).toString('utf8');
          if (txt.includes('^XA')) return { format: 'zpl', zpl: txt, via };
        }

        const raw = await r.text();
        // ZPL direto
        if (raw.trimStart().startsWith('^XA')) return { format: 'zpl', zpl: raw, via };

        // JSON — pode trazer ZPL inline ou URL
        let data = {};
        try { data = JSON.parse(raw); } catch {}
        const root = data?.data || data;
        const arr  = Array.isArray(root) ? root : [root];

        for (const it of arr) {
          const zpl = it?.zpl || it?.content || it?.conteudo || it?.label;
          if (typeof zpl === 'string' && zpl.includes('^XA')) return { format: 'zpl', zpl, via };
          const u = it?.url || it?.link || it?.linkEtiqueta || it?.urlEtiqueta || it?.pdfUrl;
          if (typeof u === 'string' && /^https?:\/\//.test(u)) {
            // Tenta baixar o PDF
            try {
              const rr = await fetch(u);
              const cc = rr.headers.get('content-type') || '';
              if (rr.ok && (cc.includes('pdf') || cc.includes('octet'))) {
                const bb = await rr.arrayBuffer();
                const ss = Buffer.from(bb.slice(0, 4)).toString('ascii');
                if (ss === '%PDF') return { format: 'pdf', pdf: Buffer.from(bb).toString('base64'), via: `${via}+url` };
                const tt = Buffer.from(bb).toString('utf8');
                if (tt.includes('^XA')) return { format: 'zpl', zpl: tt, via: `${via}+url` };
              }
            } catch {}
            return { format: 'pdf_url', pdfUrl: u, via };
          }
        }
      } catch (e) {
        console.warn(`[etiq-transp/${nfId}] (${via}) erro: ${e.message}`);
      }
      return null;
    }

    // Caminho A — Logísticas / Etiquetas (API v3)
    const pathsLogistica = [
      `${BLING_API_BASE}/logisticas/etiquetas?idsNotas[]=${nfId}`,
      `${BLING_API_BASE}/logisticas/etiquetas?idNota=${nfId}`,
      `${BLING_API_BASE}/logisticas/objetos?idsNotas[]=${nfId}`,
    ];
    for (const url of pathsLogistica) {
      const hit = await tryEndpoint(url, `logisticas:${url.split('?')[0].split('/').pop()}`);
      if (hit) return res.json({ ok: true, nfId, tipo: 'transporte', ...hit });
    }

    // Caminho B — campos no detalhe da NF (linkEtiqueta/urlEtiqueta/transporte)
    try {
      const detResp = await fetch(`${BLING_API_BASE}/nfe/${nfId}`, { headers });
      if (detResp.ok) {
        const det = await detResp.json().catch(() => ({}));
        const nf  = det?.data || det;
        const cand =
          nf?.linkEtiqueta || nf?.urlEtiqueta ||
          nf?.transporte?.linkEtiqueta || nf?.transporte?.urlEtiqueta ||
          nf?.volumes?.[0]?.linkEtiqueta || nf?.volumes?.[0]?.url || null;
        if (cand) {
          const hit = await tryEndpoint(cand, 'nfe.linkEtiqueta');
          if (hit) return res.json({ ok: true, nfId, tipo: 'transporte', ...hit });
          return res.json({ ok: true, nfId, tipo: 'transporte', format: 'pdf_url', pdfUrl: cand, via: 'nfe.linkEtiqueta_raw' });
        }
      }
    } catch (e) {
      console.warn(`[etiq-transp/${nfId}] detalhe NF erro: ${e.message}`);
    }

    return res.status(404).json({
      error: 'etiqueta_nao_disponivel',
      message: 'Etiqueta de transporte não disponível via API Bling. Inspecione /bling/debug/etiqueta/' + nfId,
      nfId,
    });
  } catch (err) {
    if (err.message === 'bling_not_authorized') return res.status(401).json({ error: 'bling_not_authorized' });
    console.error(`[GET /bling/etiqueta-transporte/${nfId}]`, err.message);
    next(err);
  }
});

// ── Etiqueta de Transporte via API v3 do Bling (Bearer token OAuth2) ────
// GET /bling/etiqueta-v3/:nfId → { ok, pdf (base64), nfId, via }
// Tenta dois caminhos na API v3:
//   1. GET /nfe/{nfId}/etiqueta   (endpoint direto de etiqueta da NF)
//   2. GET /nfe/{nfId} → pedidoVenda.id → GET /pedidosVendas/{id}/etiqueta
// Se nenhum retornar PDF → 404 com erro etiqueta_nao_disponivel_na_v3.
// Use o endpoint legado /bling/etiqueta-transporte/:nfId como fallback browser.
app.get('/bling/etiqueta-v3/:nfId', async (req, res, next) => {
  const nfId = String(req.params.nfId).replace(/\D/g, '');
  if (!nfId) return res.status(400).json({ error: 'id_invalido', message: 'ID da NF deve ser numérico.' });

  try {
    const token = await blingEnsureToken();

    // ── TENTATIVA 1: GET /nfe/{nfId}/etiqueta ──────────────────────────────
    const etiquetaUrl = `${BLING_API_BASE}/nfe/${nfId}/etiqueta`;
    console.log(`[etiqueta-v3/${nfId}] tentativa 1 → ${etiquetaUrl}`);

    const r1 = await fetch(etiquetaUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/pdf',
      },
    });

    if (r1.status === 401) return res.status(401).json({ error: 'bling_not_authorized' });

    const ct1 = (r1.headers.get('content-type') || '').toLowerCase();
    console.log(`[etiqueta-v3/${nfId}] tentativa 1 status=${r1.status} ct=${ct1}`);

    if (r1.ok && (ct1.includes('pdf') || ct1.includes('octet'))) {
      const buf = await r1.arrayBuffer();
      const pdf = Buffer.from(buf).toString('base64');
      console.log(`[etiqueta-v3/${nfId}] PDF obtido via nfe/etiqueta (${buf.byteLength} bytes)`);
      return res.json({ ok: true, pdf, nfId, via: 'bling_v3_nfe_etiqueta' });
    }

    // ── TENTATIVA 2: buscar pedidoVenda.id via GET /nfe/{nfId} ─────────────
    console.log(`[etiqueta-v3/${nfId}] tentativa 1 sem PDF — buscando pedidoVenda.id`);

    const nfeUrl = `${BLING_API_BASE}/nfe/${nfId}`;
    const r2 = await fetch(nfeUrl, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });

    if (r2.status === 401) return res.status(401).json({ error: 'bling_not_authorized' });

    if (r2.ok) {
      let nfeData = {};
      try { nfeData = await r2.json(); } catch {}

      const pedidoVendaId =
        nfeData?.data?.pedidoVenda?.id ||
        nfeData?.pedidoVenda?.id ||
        null;

      console.log(`[etiqueta-v3/${nfId}] pedidoVendaId=${pedidoVendaId}`);

      if (pedidoVendaId) {
        const pedidoEtiquetaUrl = `${BLING_API_BASE}/pedidosVendas/${pedidoVendaId}/etiqueta`;
        console.log(`[etiqueta-v3/${nfId}] tentativa 2 → ${pedidoEtiquetaUrl}`);

        const r3 = await fetch(pedidoEtiquetaUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/pdf',
          },
        });

        if (r3.status === 401) return res.status(401).json({ error: 'bling_not_authorized' });

        const ct3 = (r3.headers.get('content-type') || '').toLowerCase();
        console.log(`[etiqueta-v3/${nfId}] tentativa 2 status=${r3.status} ct=${ct3}`);

        if (r3.ok && (ct3.includes('pdf') || ct3.includes('octet'))) {
          const buf = await r3.arrayBuffer();
          const pdf = Buffer.from(buf).toString('base64');
          console.log(`[etiqueta-v3/${nfId}] PDF obtido via pedidosVendas/etiqueta (${buf.byteLength} bytes)`);
          return res.json({ ok: true, pdf, nfId, via: 'bling_v3_pedido_venda' });
        }
      }
    }

    // ── Nenhuma tentativa retornou PDF ─────────────────────────────────────
    console.warn(`[etiqueta-v3/${nfId}] etiqueta não disponível via API v3`);
    return res.status(404).json({
      ok: false,
      error: 'etiqueta_nao_disponivel_na_v3',
      message: 'Etiqueta não disponível via API v3 — use o fallback browser.',
    });

  } catch (err) {
    if (err.message === 'bling_not_authorized') return res.status(401).json({ error: 'bling_not_authorized' });
    console.error(`[etiqueta-v3/${nfId}]`, err.message);
    next(err);
  }
});

// ── DEBUG: testa o endpoint de DANFE para um ID específico ───────
// GET /bling/debug/danfe/:id  — retorna raw response do Bling
// Query params:
//   ?tipo=simplificado  — testa DANFE Simplificada (etiqueta 10x15cm)
//   ?tipo=completa      — testa DANFE completa (A4) [padrão]
app.get('/bling/debug/danfe/:id', async (req, res, next) => {
  try {
    const token = await blingEnsureToken();
    const nfId  = req.params.id;
    const tipo  = req.query.tipo || 'completa';

    const results = { nfId, tipo_testado: tipo };

    // Teste 1: DANFE (tipo padrão)
    try {
      const danfeUrl = tipo === 'simplificado'
        ? `${BLING_API_BASE}/nfe/${nfId}/danfe?tipo=simplificado`
        : `${BLING_API_BASE}/nfe/${nfId}/danfe`;

      const r = await fetch(danfeUrl, {
        headers: { 'Authorization': `Bearer ${token}` },
        redirect: 'manual',
      });
      const ct  = r.headers.get('content-type') || '';
      const loc = r.headers.get('location')     || '';
      const txt = await r.text().catch(() => '');
      results.danfe_endpoint = {
        status: r.status,
        content_type: ct,
        location: loc,
        body_preview: txt.slice(0, 500),
        url_testada: danfeUrl,
      };
    } catch(e) { results.danfe_endpoint = { erro: e.message }; }

    // Teste 2: GET /nfe/:id para verificar linkDanfe vs linkDanfeSimplificado
    try {
      const r = await fetch(`${BLING_API_BASE}/nfe/${nfId}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      });
      if (r.ok) {
        const data = await r.json().catch(() => ({}));
        const nf = data?.data || data;
        results.nfe_detalhe = {
          numero: nf?.numero,
          linkPDF: nf?.linkPDF ? nf.linkPDF.slice(0, 100) : null,
          linkDanfeFull: nf?.linkDanfeFull ? nf.linkDanfeFull.slice(0, 100) : null,
          linkDanfeSimplificado: nf?.linkDanfeSimplificado ? nf.linkDanfeSimplificado.slice(0, 100) : null,
          linkDanfe: nf?.linkDanfe ? nf.linkDanfe.slice(0, 100) : null,
        };
      }
    } catch(e) { results.nfe_detalhe = { erro: e.message }; }

    // Teste antigo (mantém compatibilidade):
    // Teste 2: Accept: application/json
    try {
      const r = await fetch(`${BLING_API_BASE}/nfe/${nfId}/danfe`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        redirect: 'manual',
      });
      const ct  = r.headers.get('content-type') || '';
      const loc = r.headers.get('location')     || '';
      const txt = await r.text().catch(() => '');
      results.accept_json = {
        status: r.status,
        content_type: ct,
        location: loc,
        body_preview: txt.slice(0, 500),
      };
    } catch(e) { results.accept_json = { erro: e.message }; }

    // Teste 3: detalhe da NF para ver situacao e TODOS os campos (linkDanfe!)
    try {
      const r = await blingFetch(`/nfe/${nfId}`);
      const n = r.data || r;
      results.nf_detalhe = {
        id:           n.id,
        numero:       n.numero,
        situacao:     n.situacao,
        dataEmissao:  n.dataEmissao,
        chaveAcesso:  n.chaveAcesso ? n.chaveAcesso.slice(0, 20) + '…' : null,
        linkDanfe:    n.linkDanfe || null,
        linkDanfeFull: n.linkDanfeFull || null,
        linkDanfeSimplificado: n.linkDanfeSimplificado || null,
        linkXml:      n.linkXml || null,
        urlsDanfe:    n.urls?.danfe || null,
        todosOsCampos: Object.keys(n),
        rawData:      JSON.stringify(n).slice(0, 1000),
      };
    } catch(e) { results.nf_detalhe = { erro: e.message }; }

    res.json(results);
  } catch(err) { next(err); }
});

// ── ZPL Etiqueta de Prateleira (bin label) → QZ Tray ─────────────
// POST /orders/:id/etiqueta-bin  body: { sku, nome, bin, ean }
app.post('/orders/:id/etiqueta-bin', async (req, res) => {
  try {
    const { sku = '', nome = '', bin = '', ean = '' } = req.body || {};
    const trunc = (s, n) => String(s || '').slice(0, n).replace(/[^\x20-\x7E]/g, '?');
    const eanZpl = ean.replace(/\D/g, '').slice(0, 13);
    const zpl = [
      '^XA',
      '^MMT^PW640^LL320^LS0',
      '^FO20,15^A0N,22,22^FDUniversoBox^FS',
      '^FO20,15^GB600,1,2^FS',
      `^FO20,42^A0N,26,26^FB590,2,0,L^FD${trunc(nome,38)}^FS`,
      `^FO20,102^GB180,36,36^FR^FS`,
      `^FO28,108^A0N,24,24^FDSKU ${trunc(sku,24)}^FS`,
      bin ? `^FO220,92^A0N,18,18^FDLocalização^FS\n^FO220,114^A0N,44,44^FD${trunc(bin,20)}^FS` : '',
      eanZpl.length >= 8 ? `^FO20,148^BY2,3,60^BE^FD${eanZpl}^FS\n^FO20,215^A0N,20,20^FD${eanZpl}^FS` : '',
      `^FO400,270^A0N,18,18^FD${trunc(req.params.id,22)}^FS`,
      '^XZ',
    ].filter(Boolean).join('\n');
    res.json({ ok: true, zpl });
  } catch(e) {
    console.error('[POST /orders/:id/etiqueta-bin]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── DEBUG: ver resposta bruta da API do Bling ────────────────────
// ── GET /bling/product-images — busca imagens de produto no Bling por EAN ou SKU
// Query: ?ean=7891234567890  ou  ?sku=PROD-001
// Retorna array de URLs de imagem extraídas do Bling (não requer auth Firebase — só Bling token)
app.get('/bling/product-images', async (req, res, next) => {
  try {
    const { ean, sku, nome } = req.query;
    if (!ean && !sku && !nome) {
      return res.status(400).json({ error: 'Informe ean, sku ou nome como query param' });
    }

    const pesquisa = ean || sku || nome;

    // Bling API v3: GET /produtos?pesquisa=...&limite=5
    const data = await blingFetch(`/produtos?pesquisa=${encodeURIComponent(pesquisa)}&limite=5`);
    const produtos = data?.data || [];

    if (!produtos.length) {
      return res.json({ images: [], total: 0, pesquisa });
    }

    // Para cada produto encontrado, busca detalhes para pegar as imagens
    const imageResults = [];
    for (const p of produtos.slice(0, 3)) {
      try {
        const detail = await blingFetch(`/produtos/${p.id}`);
        const item = detail?.data || {};
        // Bling armazena imagens em vários formatos possíveis
        const internas = (item.midia?.internas?.link || []);
        const externas = (item.midia?.imagens?.externas || []);
        const legado   = (item.imagens || []);
        const allImgs  = [...internas, ...externas, ...legado];
        const imagens = allImgs
          .map(img => typeof img === 'string' ? img : (img.link || img.url))
          .filter(u => u && /^https?:\/\//i.test(u));
        imageResults.push({
          id:      item.id,
          sku:     item.codigo || p.codigo,
          nome:    item.nome || p.nome,
          imagens,
        });
      } catch {
        // produto individual pode falhar — ignorar e continuar
      }
    }

    const allImages = imageResults.flatMap(p => p.imagens.map(url => ({ url, sku: p.sku, nome: p.nome })));
    res.json({ ok: true, images: allImages, produtos: imageResults, total: allImages.length });
  } catch (err) {
    console.error('[GET /bling/product-images]', err.message);
    if (err.message === 'bling_not_authorized') {
      return res.status(401).json({ error: 'Bling não autenticado — acesse /bling/auth para conectar' });
    }
    next(err);
  }
});

// GET /bling/debug/nfe/:id  (usar id interno do Bling, não o numero da NF)
// GET /bling/debug/lista?data=2026-03-17  (ver listagem com IDs reais)
app.get('/bling/debug/nfe/:id', async (req, res, next) => {
  try {
    const raw = await blingFetch(`/nfe/${req.params.id}`);
    res.json(raw);
  } catch(err) { next(err); }
});
// ── SUPER DEBUG: testa múltiplos endpoints e formatos ────────────
app.get('/bling/debug/probe', async (req, res, next) => {
  try {
    const data = req.query.data || '2026-03-17';
    const [y,m,d] = data.split('-');
    const dBR  = `${d}/${m}/${y}`; // dd/mm/yyyy
    const dISO = data;              // yyyy-mm-dd
    const results = {};

    // Testa 1: /nfe sem filtros (pega as mais recentes)
    try {
      const r = await blingFetch('/nfe?pagina=1&limite=3');
      results.nfe_sem_filtro = { count: r.data?.length, primeiro: r.data?.[0] ? { id: r.data[0].id, numero: r.data[0].numero, data: r.data[0].dataEmissao } : null };
    } catch(e) { results.nfe_sem_filtro = { erro: e.message }; }

    // Testa 2: /nfe com data BR
    try {
      const r = await blingFetch(`/nfe?dataEmissaoInicial=${dBR}&dataEmissaoFinal=${dBR}&pagina=1&limite=3`);
      results.nfe_data_BR = { count: r.data?.length, query: `${dBR}` };
    } catch(e) { results.nfe_data_BR = { erro: e.message }; }

    // Testa 3: /nfe com data ISO
    try {
      const r = await blingFetch(`/nfe?dataEmissaoInicial=${dISO}&dataEmissaoFinal=${dISO}&pagina=1&limite=3`);
      results.nfe_data_ISO = { count: r.data?.length, query: `${dISO}` };
    } catch(e) { results.nfe_data_ISO = { erro: e.message }; }

    // Testa 4: /pedidos/vendas (endpoint alternativo)
    try {
      const r = await blingFetch(`/pedidos/vendas?dataInicial=${dBR}&dataFinal=${dBR}&pagina=1&limite=3`);
      results.pedidos_vendas_BR = { count: r.data?.length };
    } catch(e) { results.pedidos_vendas_BR = { erro: e.message }; }

    // Testa 5: /pedidos/vendas sem filtro
    try {
      const r = await blingFetch('/pedidos/vendas?pagina=1&limite=3');
      results.pedidos_vendas_sem_filtro = { count: r.data?.length, primeiro: r.data?.[0]?.id };
    } catch(e) { results.pedidos_vendas_sem_filtro = { erro: e.message }; }

    // Testa 6: ver campos disponíveis de uma NF se achar alguma
    const qualquerNfe = results.nfe_sem_filtro?.primeiro;
    if (qualquerNfe?.id) {
      try {
        const det = await blingFetch(`/nfe/${qualquerNfe.id}`);
        const n = det.data || det;
        results.nfe_detalhe_campos = Object.keys(n);
        results.nfe_detalhe_itens_campo = n.itens ? `itens[${n.itens.length}]` : 'sem itens direto';
        results.nfe_primeiro_item = n.itens?.[0] || null;
      } catch(e) { results.nfe_detalhe = { erro: e.message }; }
    }

    res.json(results);
  } catch(err) { next(err); }
});

// ── DEBUG: ver lojas únicas nas NFs (para configurar filtros) ────
// GET /bling/debug/lojas  — acesse uma vez para ver os nomes das suas lojas
app.get('/bling/debug/lojas', async (req, res, next) => {
  try {
    const resp  = await blingFetch('/nfe?pagina=1&limite=100');
    const notas = resp.data || [];

    // Extrair lojas únicas com contagem
    const lojaMap = {};
    for (const n of notas) {
      const loja = n.loja?.descricao || n.loja?.nome || n.loja?.id || 'sem loja';
      const sit  = n.situacao?.descricao || '';
      if (!lojaMap[loja]) lojaMap[loja] = { count: 0, exemplo_sit: sit, id: n.loja?.id };
      lojaMap[loja].count++;
    }

    // Também mostrar numeroPedidoLoja de exemplos para entender padrão FLEX
    const exemplos = notas.slice(0, 5).map(n => ({
      numero:           n.numero,
      loja:             n.loja?.descricao || n.loja?.id,
      numeroPedidoLoja: n.numeroPedidoLoja,
      situacao:         n.situacao?.descricao,
    }));

    res.json({ lojas: lojaMap, exemplos });
  } catch(err) { next(err); }
});

app.get('/bling/debug/lista', async (req, res, next) => {
  try {
    // Mostra o objeto RAW completo da listagem /nfe (sem detalhe)
    // para ver quais campos chegam na listagem vs detalhe
    const raw = await blingFetch('/nfe?pagina=1&situacao=A&limite=3');
    const primeiro = raw.data?.[0] || null;
    res.json({
      total:       raw.data?.length,
      campos_raw:  primeiro ? Object.keys(primeiro) : [],
      loja_raw:    primeiro?.loja,
      valor_raw:   { valorNota: primeiro?.valorNota, valorTotal: primeiro?.valorTotal, valor: primeiro?.valor },
      sit_raw:     primeiro?.situacao,
      tipo_raw:    primeiro?.tipoIntegracao,
      raw_primeiro: primeiro,
    });
  } catch(err) { next(err); }
});

// ── DEBUG: diagnóstico de receita por mês ──────────────────────────────────────
// GET /bling/debug/receita/:mesAno  ex: /bling/debug/receita/2026-04
app.get('/bling/debug/receita/:mesAno', async (req, res, next) => {
  try {
    const mesAno = req.params.mesAno;
    const [ano, mes] = mesAno.split('-').map(Number);
    const dataInicio = `${mesAno}-01`;
    const ultimoDia  = new Date(ano, mes, 0).getDate();
    const dataFim    = `${mesAno}-${String(ultimoDia).padStart(2, '0')}`;
    const SITUACOES_EXCLUIR = new Set([3, 4, 9]);

    const nfsPeriodo = [];   // NFs no intervalo (antes do filtro situacao)
    const nfsAceitas = [];   // NFs aceitas
    const nfsRejeit  = [];   // NFs rejeitadas (canceladas/inutilizadas)
    let paginas = 0;

    for (let pagina = 1; pagina <= 5; pagina++) {
      paginas++;
      const resp  = await blingFetch(`/nfe?pagina=${pagina}&limite=100`);
      const notas = resp.data || [];
      if (!notas.length) break;
      for (const n of notas) {
        const dataEmissao = (n.dataEmissao || n.data || '').split(' ')[0];
        if (dataEmissao < dataInicio || dataEmissao > dataFim) continue;
        const sitId = Number(n.situacao?.id ?? n.situacao);
        const vt  = parseFloat(n.valorTotal || n.totalProdutos || n.valor || 0);
        const entry = { id: n.id, numero: n.numero, dataEmissao, situacaoRaw: n.situacao, situacaoId: sitId, valorTotal: vt, loja: n.loja?.id };
        nfsPeriodo.push(entry);
        if (!SITUACOES_EXCLUIR.has(sitId)) nfsAceitas.push(entry);
        else                               nfsRejeit.push(entry);
      }
      if (notas.length < 100) break;
    }

    const totalReceita = nfsAceitas.reduce((s, n) => s + n.valorTotal, 0);
    res.json({
      mesAno, dataInicio, dataFim,
      paginasConsultadas: paginas,
      totalNoPeriodo: nfsPeriodo.length,
      aceitas: nfsAceitas.length,
      rejeitadas: nfsRejeit.length,
      totalReceita,
      situacoesEncontradas: [...new Set(nfsPeriodo.map(n => n.situacaoNum))],
      nfsPeriodo: nfsPeriodo.slice(0, 20),
      nfsRejeitadas: nfsRejeit.slice(0, 10),
    });
  } catch(err) { next(err); }
});

// ── CLONAR NF → CRIAR PEDIDO ─────────────────────────────────────
app.post('/bling/clonar', async (req, res, next) => {
  try {
    const { marketplace, itens, clienteNome, numeroPedido, mlOrderId, logistica } = req.body;
    // Sanitiza blingNfId: mantém apenas dígitos (remove traços, letras, etc.)
    const blingNfId = String(req.body.blingNfId || '').replace(/\D/g, '') || null;

    if (!itens || !itens.length) return res.status(400).json({ error: 'Nenhum item enviado. Abra os itens da NF antes de clonar.' });

    // Separar itens com e sem SKU
    const itensComSku = itens.filter(it => safeTrim(it.sku));
    const itensSemSku = itens.filter(it => !safeTrim(it.sku));

    if (!itensComSku.length) return res.status(400).json({
      error: 'Nenhum item com SKU encontrado. Verifique se os produtos têm código cadastrado no Bling.',
      itensSemSku: itensSemSku.map(it => it.nome),
    });

    // Buscar produtos no Firestore
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
      if (!p) { skusFaltando.push(sku); continue; }
      cart.push({
        sku,
        nameShort:  (p.name || it.nome || sku).slice(0, 48),
        qty:        Number(it.qty || 1),
        ean:        p.ean    || '',
        eanBox:     p.eanBox || '',
        bin:        p.bin    || '',
        image:      './assets/placeholder.png',
        images:     p.images || [],
        checkedQty: 0,
      });
    }

    if (!cart.length) return res.status(400).json({
      error: 'Nenhum produto encontrado no sistema para os SKUs desta NF.',
      skusFaltando,
    });

    // Criar pedido
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
        marketplace:   marketplace || 'OUTROS',
        status:        'pending',
        clienteNome:   safeTrim(clienteNome) || '',
        isPriority:    false,
        items:         cart,
        allowConfirmOnlyIfAllChecked: true,
        createdAtMs,
        updatedAtMs:   createdAtMs,
        lockedBy:      terminalId,
        mlOrderId:  mlOrderId  || null,
        logistica:  logistica  || 'agency',
        lockedAt:      createdAtMs,
        skusFaltando:  skusFaltando.length ? skusFaltando : null,
      });
      return { orderId };
    });

    res.json({ ok: true, orderId: result.orderId, skusFaltando, itensSemSku: itensSemSku.map(it=>it.nome), cartCount: cart.length });

    // Telegram — notifica pedido clonado do Bling em background
    notificarNovoPedido({
      clienteNome: safeTrim(clienteNome),
      marketplace: marketplace || 'Bling/ML',
      qtdItens:    cart.length,
      logistica:   logistica || 'agency',
      isPriority:  false,
    }).catch(() => {});
  } catch(err) {
    console.error('[POST /bling/clonar]', err);
    next(err);
  }
});



// ═══════════════════════════════════════════════════════════════════
// API PERFIS — gestão de módulos e temas por perfil
// Collection: "perfis" | doc: role (admin, operacao, financeiro, etc)
// ═══════════════════════════════════════════════════════════════════

// Perfis padrão caso o Firestore não tenha
const PERFIS_DEFAULT = {
  admin:      { nome: 'Super Admin', avatar: 'DA', tema: 'dark',  modulos: ['pedidos','manual','bling','ml-dashboard','insumos','admin','catalogo','embalagens','cadastrar','enriquecer-xml','financas','compras','coletas','tarefas','importar','index','config'] },
  operacao:   { nome: 'Operação',    avatar: 'SU', tema: 'dark',  modulos: ['pedidos','manual','bling','ml-dashboard','insumos','embalagens','coletas','index'] },
  financeiro: { nome: 'Financeiro',  avatar: 'JE', tema: 'dark',  modulos: ['financas','compras','index'] },
  catalogo:   { nome: 'Catálogo',    avatar: 'DN', tema: 'dark',  modulos: ['admin','catalogo','embalagens','cadastrar','enriquecer-xml','compras','importar','index'] },
  vendas:     { nome: 'Vendas',      avatar: 'VE', tema: 'light', modulos: ['catalogo','index'] },
};

// GET /api/perfis — lista todos os perfis
app.get('/api/perfis', async (req, res, next) => {
  try {
    const snap = await db.collection('perfis').get();
    const perfis = {};
    // Começa com os defaults
    for (const [k, v] of Object.entries(PERFIS_DEFAULT)) {
      perfis[k] = { id: k, ...v };
    }
    // Sobrescreve com dados do Firestore
    snap.forEach(doc => {
      perfis[doc.id] = { id: doc.id, ...PERFIS_DEFAULT[doc.id], ...doc.data() };
    });
    res.json({ perfis: Object.values(perfis) });
  } catch(err) {
    console.error('[GET /api/perfis]', err);
    next(err);
  }
});

// GET /api/perfis/:id — um perfil específico (usado pelo menu.js)
app.get('/api/perfis/:id', async (req, res, next) => {
  try {
    const id  = req.params.id;
    const doc = await db.collection('perfis').doc(id).get();
    const def = PERFIS_DEFAULT[id] || PERFIS_DEFAULT.admin;
    if (!doc.exists) {
      return res.json({ id, ...def });
    }
    res.json({ id, ...def, ...doc.data() });
  } catch(err) {
    next(err);
  }
});

// PUT /api/perfis/:id — salvar configurações de um perfil
app.put('/api/perfis/:id', async (req, res, next) => {
  try {
    const id   = req.params.id;
    const data = req.body;

    // Validar campos permitidos
    const allowed = ['nome', 'tema', 'modulos', 'avatar', 'cor'];
    const clean   = {};
    for (const k of allowed) {
      if (data[k] !== undefined) clean[k] = data[k];
    }

    // Validar tema
    const temasValidos = ['dark','light','hc','ml'];
    if (clean.tema && !temasValidos.includes(clean.tema)) {
      return res.status(400).json({ error: 'Tema inválido' });
    }

    // Validar módulos
    const modulosValidos = ['pedidos','manual','bling','ml-dashboard','insumos','admin','catalogo','embalagens','cadastrar','enriquecer-xml','financas','compras','coletas','tarefas','importar','index','config'];
    if (clean.modulos) {
      clean.modulos = clean.modulos.filter(m => modulosValidos.includes(m));
    }

    clean.updatedAtMs = Date.now();
    await db.collection('perfis').doc(id).set(clean, { merge: true });
    res.json({ ok: true, id, ...clean });
  } catch(err) {
    console.error('[PUT /api/perfis/:id]', err);
    next(err);
  }
});

// POST /api/perfis — criar novo perfil customizado
app.post('/api/perfis', async (req, res, next) => {
  try {
    const { id, nome, tema, modulos } = req.body;
    if (!id || !nome) return res.status(400).json({ error: 'id e nome obrigatórios' });

    const temasValidos   = ['dark','light','hc','ml'];
    const modulosValidos = ['pedidos','manual','bling','ml-dashboard','insumos','admin','catalogo','embalagens','cadastrar','enriquecer-xml','financas','compras','coletas','tarefas','importar','index','config'];

    const data = {
      nome,
      tema:      temasValidos.includes(tema) ? tema : 'dark',
      modulos:   (modulos || []).filter(m => modulosValidos.includes(m)),
      avatar:    req.body.avatar || id.slice(0,2).toUpperCase(),
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    };

    await db.collection('perfis').doc(id).set(data);
    res.json({ ok: true, id, ...data });
  } catch(err) {
    console.error('[POST /api/perfis]', err);
    next(err);
  }
});

// DELETE /api/perfis/:id — remover perfil (não permite deletar admin)
app.delete('/api/perfis/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    if (id === 'admin') return res.status(403).json({ error: 'Não é possível remover o perfil admin' });
    await db.collection('perfis').doc(id).delete();
    res.json({ ok: true });
  } catch(err) {
    next(err);
  }
});

// ─── API USUÁRIOS — gestão de Firebase Auth users ────────────────────────────
// Requer role admin para listar e editar roles

// GET /api/users — lista usuários do Firebase Auth (admin only)
app.get('/api/users', requireFirebaseAuth, requireFirebaseRole(['admin']), async (req, res, next) => {
  try {
    const admin = require('firebase-admin');
    const listResult = await admin.auth().listUsers(500);
    const users = listResult.users.map(u => ({
      uid:         u.uid,
      email:       u.email || null,
      displayName: u.displayName || null,
      photoURL:    u.photoURL || null,
      disabled:    u.disabled,
      lastSignIn:  u.metadata.lastSignInTime || null,
      createdAt:   u.metadata.creationTime  || null,
      role:        u.customClaims?.role      || null,
      tenantId:    u.customClaims?.tenantId  || null,
    }));
    // Ordena por último login mais recente
    users.sort((a, b) => (b.lastSignIn || '') > (a.lastSignIn || '') ? 1 : -1);
    res.json({ users, total: users.length });
  } catch(err) {
    console.error('[GET /api/users]', err);
    next(err);
  }
});

// PATCH /api/users/:uid/role — atribui role a um usuário (admin only)
app.patch('/api/users/:uid/role', requireFirebaseAuth, requireFirebaseRole(['admin']), async (req, res, next) => {
  try {
    const admin    = require('firebase-admin');
    const { uid }  = req.params;
    const { role } = req.body;

    // Busca claims atuais para não sobrescrever tenantId
    const user          = await admin.auth().getUser(uid);
    const currentClaims = user.customClaims || {};

    const newClaims = role
      ? { ...currentClaims, role: String(role) }
      : { ...currentClaims, role: null };

    await admin.auth().setCustomUserClaims(uid, newClaims);

    // Log de auditoria
    await db.collection('audit_logs').add({
      action:    'set_user_role',
      targetUid: uid,
      role:      role || null,
      byUid:     req.auth.uid,
      byEmail:   req.auth.email,
      atMs:      Date.now(),
    });

    res.json({ ok: true, uid, role: role || null });
  } catch(err) {
    console.error('[PATCH /api/users/:uid/role]', err);
    next(err);
  }
});

// ================================================================
// TRANSIT ITEMS — "A caminho" (semente do estoque físico)
// Coleção: transit_items
// Documento: {
//   id, compraId, sku, name, marca, image, ean,
//   qtyPedida, qtyComprada, modalidade,
//   dataPedido, dataACaminho, dataRecebido,
//   status: 'transit' | 'received'
// }
// ================================================================

// GET /api/transit — lista itens em trânsito (status=transit)
app.get('/api/transit', async (req, res, next) => {
  try {
    const snap = await db.collection('transit_items')
      .where('status', '==', 'transit')
      .get();
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.dataACaminho || 0) - (a.dataACaminho || 0));
    res.json({ items });
  } catch (err) {
    console.error('[GET /api/transit]', err);
    next(err);
  }
});

// POST /api/transit — marca item como "a caminho"
app.post('/api/transit', async (req, res, next) => {
  try {
    const {
      compraId, sku, name, marca, image, ean,
      qtyPedida, qtyComprada, modalidade, dataPedido
    } = req.body;

    if (!sku || !compraId) return res.status(400).json({ error: 'sku e compraId obrigatórios' });

    const ts  = Date.now();
    const id  = `TRN_${uuidv4().slice(0, 8).toUpperCase()}`;

    await db.collection('transit_items').doc(id).set({
      id, compraId,
      sku:          safeTrim(sku),
      name:         safeTrim(name || ''),
      marca:        safeTrim(marca || ''),
      image:        safeTrim(image || '/assets/placeholder.png'),
      ean:          safeTrim(ean || ''),
      qtyPedida:    Number(qtyPedida  || 0),
      qtyComprada:  Number(qtyComprada || qtyPedida || 0),
      modalidade:   safeTrim(modalidade || ''),
      dataPedido:   dataPedido || null,
      dataACaminho: ts,
      dataRecebido: null,
      status:       'transit',
      createdAtMs:  ts,
    });

    res.json({ ok: true, id });
  } catch (err) {
    console.error('[POST /api/transit]', err);
    next(err);
  }
});

// PATCH /api/transit/:id/received — confirma recebimento com qty real
app.patch('/api/transit/:id/received', async (req, res, next) => {
  try {
    const id          = safeTrim(req.params.id);
    const ts          = Date.now();
    const qtyRecebida = req.body?.qtyRecebida ? Number(req.body.qtyRecebida) : null;

    const ref  = db.collection('transit_items').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'item não encontrado' });

    const data = snap.data();

    const diasEmTransito = data.dataACaminho ? Math.round((ts - data.dataACaminho) / 86400000) : null;
    const diasDoPedido   = data.dataPedido   ? Math.round((ts - data.dataPedido)   / 86400000) : null;

    const qtyFinal    = qtyRecebida ?? data.qtyComprada;
    const divergencia = qtyRecebida !== null && qtyRecebida !== data.qtyComprada
      ? { esperada: data.qtyComprada, recebida: qtyRecebida, diff: qtyRecebida - data.qtyComprada }
      : null;

    await ref.set({ status: 'received', dataRecebido: ts, diasEmTransito, diasDoPedido, qtyRecebida: qtyFinal, divergencia, updatedAtMs: ts }, { merge: true });

    await db.collection('stock_receipts').add({
      transitId: id, compraId: data.compraId,
      sku: data.sku, marca: data.marca,
      qtyComprada: data.qtyComprada, qtyRecebida: qtyFinal,
      divergencia,
      dataPedido: data.dataPedido, dataACaminho: data.dataACaminho, dataRecebido: ts,
      diasEmTransito, diasDoPedido,
      mesAno: yyyymmdd(new Date(ts)).slice(0, 6),
      createdAtMs: ts,
    });

    res.json({ ok: true, diasEmTransito, diasDoPedido, divergencia });
  } catch (err) {
    console.error('[PATCH /api/transit/:id/received]', err);
    next(err);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// MERCADO LIVRE — OAuth + token helpers + proxy routes
// ════════════════════════════════════════════════════════════════════════════

// ── Token helpers (espelho dos do Bling) ─────────────────────────────────────
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
  // refresh_token só vem no primeiro authorize (com offline_access)
  // no refresh subsequente o ML pode omiti-lo — mantém o anterior
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

// ── OAuth routes ─────────────────────────────────────────────────────────────

// GET /ml/token → retorna access_token para uso no browser (chamadas client-side)
app.get('/ml/token', async (req, res) => {
  try {
    const token = await mlEnsureToken();
    res.json({ access_token: token });
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

// GET /ml/status → { authorized, expired, updatedAtMs? }
app.get('/ml/status', async (req, res) => {
  try {
    const tok = await mlGetToken();
    if (!tok) return res.json({ authorized: false });
    res.json({ authorized: true, expired: Date.now() > tok.expiresAt, updatedAtMs: tok.updatedAtMs });
  } catch (e) {
    res.json({ authorized: false, error: e.message });
  }
});

// GET /ml/auth → redireciona para URL de autorização do ML
app.get('/ml/auth', (req, res) => {
  if (!ML_CLIENT_ID) return res.status(500).json({ error: 'ML_CLIENT_ID não configurado' });
  const p = new URLSearchParams({
    response_type: 'code',
    client_id:     ML_CLIENT_ID,
    redirect_uri:  ML_REDIRECT_URI,
    state:         'expedicao_pro',
    scope:         'offline_access read write',
  });
  res.redirect(`${ML_AUTH_URL}?${p}`);
});

// GET /ml/callback → troca code por token, salva no Firestore
app.get('/ml/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/bling?error=ml_auth_denied');
  try {
    const tokenRes = await fetch(ML_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     ML_CLIENT_ID,
        client_secret: ML_CLIENT_SECRET,
        code,
        redirect_uri:  ML_REDIRECT_URI,
      }).toString(),
    });
    if (!tokenRes.ok) {
      console.error('[ml/callback] token error:', await tokenRes.text());
      return res.redirect('/bling?error=ml_token_failed');
    }
    await mlSaveToken(await tokenRes.json());
    res.redirect('/bling?ml_success=1');
  } catch (e) {
    console.error('[ml/callback]', e);
    res.redirect('/bling?error=ml_callback_error');
  }
});

// POST /ml/disconnect → apaga ml_tokens/main do Firestore
app.post('/ml/disconnect', async (req, res) => {
  await db.collection('ml_tokens').doc('main').delete();
  res.json({ ok: true });
});

// ── Proxy routes (agora com token autenticado) ────────────────────────────────

// GET /ml/item/:mlbId — substitui /produtos/ml-item/:mlbId com auth
app.get('/ml/item/:mlbId', async (req, res, next) => {
  try {
    const mlbId = safeTrim(req.params.mlbId).toUpperCase().replace(/-/g, '');
    if (!mlbId.match(/^MLB\d{6,15}$/)) {
      return res.status(400).json({ error: 'Código MLB inválido. Use o formato MLB seguido de números.' });
    }

    let accessToken = null;
    try { accessToken = await mlEnsureToken(); } catch (_) { /* usa sem token se não autorizado */ }

    const headers = { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; ExpedicaoPro/1.0)' };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    const [itemRes, descRes] = await Promise.allSettled([
      fetchWithTimeout(`${ML_API_BASE}/items/${mlbId}`, { headers }),
      fetchWithTimeout(`${ML_API_BASE}/items/${mlbId}/description`, { headers }),
    ]);

    if (itemRes.status === 'rejected') {
      throw Object.assign(new Error(`Erro de rede ao buscar ${mlbId}: ${itemRes.reason}`), { statusCode: 502 });
    }
    const httpStatus = itemRes.value.status;
    if (httpStatus === 404) throw Object.assign(new Error(`Anúncio ${mlbId} não encontrado (inativo ou inexistente).`), { statusCode: 404 });
    if (!itemRes.value.ok) throw Object.assign(new Error(`ML retornou HTTP ${httpStatus} para ${mlbId}.`), { statusCode: 502 });

    const item      = await itemRes.value.json();
    const descricao = descRes.status === 'fulfilled' && descRes.value.ok ? await descRes.value.json() : null;

    res.json({ item, descricao });
  } catch (err) {
    console.error('[GET /ml/item]', err.message);
    next(err);
  }
});

// GET /ml/busca-ean/:ean — versão autenticada do /produtos/ml-busca-ean
app.get('/ml/busca-ean/:ean', async (req, res, next) => {
  try {
    const ean = safeTrim(req.params.ean).replace(/\D/g, '');
    if (!/^\d{8,14}$/.test(ean)) {
      return res.status(400).json({ error: 'EAN inválido. Use 8 a 14 dígitos.' });
    }

    let accessToken = null;
    try { accessToken = await mlEnsureToken(); } catch (_) { /* usa sem token */ }

    const headers = { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; ExpedicaoPro/1.0)' };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    const [catalogResult, searchResult] = await Promise.allSettled([
      fetchWithTimeout(`${ML_API_BASE}/products/search?site_id=MLB&q=${ean}&limit=5`, { headers }),
      fetchWithTimeout(`${ML_API_BASE}/sites/MLB/search?q=${ean}&limit=5`, { headers }),
    ]);

    let mlbId = null;
    if (catalogResult.status === 'fulfilled' && catalogResult.value.ok) {
      const data = await catalogResult.value.json();
      for (const p of (data.results || [])) {
        const id = p.buy_box_winner?.item_id || p.item_id;
        if (id && id.startsWith('MLB')) { mlbId = id; break; }
      }
    }
    if (!mlbId && searchResult.status === 'fulfilled' && searchResult.value.ok) {
      const data = await searchResult.value.json();
      for (const r of (data.results || [])) {
        if (r.id && r.id.startsWith('MLB') && r.condition !== 'not_specified') { mlbId = r.id; break; }
      }
    }
    if (!mlbId) return res.status(404).json({ error: `Nenhum anúncio encontrado para o EAN ${ean} no Mercado Livre.` });

    // Reusa a rota interna via redirect interno (evita duplicar lógica)
    const itemHeaders = { ...headers };
    const [itemRes, descRes] = await Promise.allSettled([
      fetchWithTimeout(`${ML_API_BASE}/items/${mlbId}`, { headers: itemHeaders }),
      fetchWithTimeout(`${ML_API_BASE}/items/${mlbId}/description`, { headers: itemHeaders }),
    ]);

    if (itemRes.status === 'rejected' || !itemRes.value.ok) {
      throw Object.assign(new Error(`Erro ao buscar item ${mlbId}`), { statusCode: 502 });
    }
    const item      = await itemRes.value.json();
    const descricao = descRes.status === 'fulfilled' && descRes.value.ok ? await descRes.value.json() : null;

    res.json({ item, descricao, mlbIdEncontrado: mlbId });
  } catch (err) {
    console.error('[GET /ml/busca-ean]', err.message);
    next(err);
  }
});

// GET /ml/diag — diagnóstico Railway → ML (versão autenticada)
app.get('/ml/diag', async (req, res) => {
  const results = {};
  try {
    const r = await fetchWithTimeout(`${ML_API_BASE}/sites/MLB`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; ExpedicaoPro/1.0)' },
    }, 8000);
    results.publicApi = { status: r.status, ok: r.ok };
  } catch (e) {
    results.publicApi = { error: e.message };
  }

  let accessToken = null;
  try { accessToken = await mlEnsureToken(); } catch (e) { results.auth = { error: e.message }; }

  if (accessToken) {
    try {
      const r = await fetchWithTimeout(`${ML_API_BASE}/users/me`, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
      }, 8000);
      const body = await r.json().catch(() => ({}));
      results.auth = { status: r.status, ok: r.ok, nickname: body.nickname || null };
    } catch (e) {
      results.auth = { error: e.message };
    }
  }

  res.json(results);
});

// GET /ml/diag-orders — testa múltiplas URLs da API de pedidos e devolve raw
// Acesse: /ml/diag-orders para ver exatamente o que o ML retorna
app.get('/ml/diag-orders', async (req, res) => {
  const out = {};
  let token, userId;
  try {
    token  = await mlEnsureToken();
    const me = await fetchWithTimeout(`${ML_API_BASE}/users/me`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    }, 8000);
    const meData = await me.json();
    userId = meData.id;
    out.userId   = userId;
    out.nickname = meData.nickname;
  } catch(e) { return res.json({ error: e.message }); }

  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

  // Testa 6 variações de URL para descobrir qual funciona
  const tests = [
    { key: 'A_recent_no_filter',    url: `${ML_API_BASE}/orders/search?seller=${userId}&limit=5` },
    { key: 'B_date_created_today',  url: `${ML_API_BASE}/orders/search?seller=${userId}&order.date_created.from=2026-03-27T00:00:00.000-03:00&limit=5` },
    { key: 'C_sort_date_desc',      url: `${ML_API_BASE}/orders/search?seller=${userId}&sort=date_desc&limit=5` },
    { key: 'D_q_paid',              url: `${ML_API_BASE}/orders/search?seller=${userId}&q=paid&limit=5` },
    { key: 'E_myfeeds',             url: `${ML_API_BASE}/orders/search?seller=${userId}&limit=5&offset=0` },
    { key: 'F_shipments_endpoint',  url: `${ML_API_BASE}/shipments/search?seller_id=${userId}&status=ready_to_ship&limit=5` },
  ];

  for (const t of tests) {
    try {
      const r   = await fetchWithTimeout(t.url, { headers }, 10000);
      const txt = await r.text();
      let parsed;
      try { parsed = JSON.parse(txt); } catch { parsed = txt.slice(0, 300); }
      out[t.key] = {
        status: r.status,
        url:    t.url.replace(ML_API_BASE, ''),
        total:  parsed?.paging?.total ?? parsed?.total ?? '?',
        count:  (parsed?.results || parsed?.data || []).length,
        first:  (parsed?.results || parsed?.data || []).slice(0,1).map(o => ({
          id: o.id, status: o.status,
          date: (o.date_created||'').slice(0,16),
          ship_status: o.shipping?.status,
        })),
        error: parsed?.error || parsed?.message || null,
      };
    } catch(e) {
      out[t.key] = { error: e.message };
    }
  }

  res.json(out);
});

// ════════════════════════════════════════════════════════════════════════════
// ML DASHBOARD — Rotas Express
// Adicione este bloco no server.js ANTES da seção "FIM — Mercado Livre"
// (logo abaixo das rotas /ml/diag e /ml/busca-ean existentes)
//
// Pré-requisitos já existentes no server.js:
//   - mlEnsureToken()  — obtém/renova access_token do ML
//   - blingFetch()     — GET autenticado no Bling
//   - fetchWithTimeout()
//   - ML_API_BASE, BLING_API_BASE
//   - db (Firestore)
//   - safeTrim(), nowMs()
// ════════════════════════════════════════════════════════════════════════════

// Rota do HTML (adicione junto com as outras app.get('/', ...))
// app.get('/ml-dashboard', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'ml-dashboard.html')));


// ── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Retorna a data de hoje no formato YYYY-MM-DD no timezone America/Sao_Paulo
 */
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

/**
 * Resolve o status local de um pedido ML.
 * Prioridade: Firestore (ml_order_status) > padrão 'imprimir'
 */
async function resolveLocalStatus(orderId) {
  try {
    const doc = await db.collection('ml_order_status').doc(String(orderId)).get();
    if (doc.exists) return doc.data().status || 'imprimir';
  } catch (_) {}
  return 'imprimir';
}

/**
 * Salva o status local de um pedido no Firestore
 */
async function saveLocalStatus(orderId, status) {
  await db.collection('ml_order_status').doc(String(orderId)).set({
    status,
    updatedAtMs: Date.now(),
  }, { merge: true });
}

/**
 * Detecta o tipo de logística do pedido
 */
function detectLogistica(order) {
  const tags    = order.tags || [];
  const logType = order.shipping?.logistic_type || '';
  const mode    = order.shipping?.shipping_option?.shipping_method_type || '';

  if (tags.includes('fulfillment') || logType === 'fulfillment')  return 'fulfillment';
  if (tags.includes('self_service') || logType === 'self_service') return 'flex';
  if (mode === 'pickup_point' || logType === 'pickup')             return 'pickup';
  return 'agency'; // padrão: agência
}

/**
 * Formata hora no timezone BR
 */
function formatTimeBR(isoStr) {
  if (!isoStr) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(isoStr));
  } catch (_) { return ''; }
}


// ════════════════════════════════════════════════════════════════════════════
// GET /api/ml/orders/today
// Lista pedidos do dia com status paid + ready_to_ship do Mercado Livre.
// Enriquece cada pedido com o status local (imprimir / expedir / enviado)
// salvo no Firestore (coleção ml_order_status).
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/ml/orders/today', async (req, res, next) => {
  try {
    const token   = await mlEnsureToken();
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept':        'application/json',
    };

    // Busca userId do ML (necessário para listar pedidos)
    const meRes  = await fetchWithTimeout(`${ML_API_BASE}/users/me`, { headers }, 8000);
    const meData = await meRes.json();
    const userId = meData.id;
    if (!userId) throw Object.assign(new Error('Não foi possível obter o ID do vendedor ML'), { statusCode: 502 });

    // Busca pedidos: paid + ready_to_ship de hoje
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

    // Busca status local de todos em paralelo
    const statusList = await Promise.all(orders.map(o => resolveLocalStatus(o.id)));

    const enriched = orders.map((o, i) => ({
      ...o,
      logistica:     detectLogistica(o),
      _localStatus:  statusList[i],
      _createdTime:  formatTimeBR(o.date_created),
    }));

    // Ordena: imprimir → expedir → enviado, e por hora de criação desc
    const order = { imprimir: 0, expedir: 1, enviado: 2, cancelado: 3 };
    enriched.sort((a, b) =>
      (order[a._localStatus] ?? 9) - (order[b._localStatus] ?? 9) ||
      new Date(b.date_created) - new Date(a.date_created)
    );

    res.json({ orders: enriched, total: enriched.length, date: today });

  } catch (err) {
    console.error('[GET /api/ml/orders/today]', err.message);
    next(err);
  }
});


// ════════════════════════════════════════════════════════════════════════════
// GET /api/ml/painel
// Painel de expedição ML: pedidos de hoje, amanhã, código de autorização,
// horário de corte. Replica visualmente o painel de vendas do ML.
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/ml/painel', async (req, res, next) => {
  try {
    const token   = await mlEnsureToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

    // ── 1. Seller ID ──────────────────────────────────────────────────────
    const meRes  = await fetchWithTimeout(`${ML_API_BASE}/users/me`, { headers }, 8000);
    if (!meRes.ok) throw Object.assign(new Error('ml_not_authorized'), { statusCode: 401 });
    const me     = await meRes.json();
    const userId = me.id;

    const nowBR      = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const todayStr   = nowBR.toISOString().slice(0, 10);
    const tomorrowStr= new Date(nowBR.getTime() + 86400000).toISOString().slice(0, 10);
    // Janela de 45 dias atrás — evita pedidos pagos antigos que nunca foram despachados
    const desde45d   = new Date(nowBR.getTime() - 45 * 86400000).toISOString().slice(0, 10);

    // ── 2. Busca pedidos em paralelo (queries amplas — filtragem real é feita em código) ──
    // IMPORTANTE: os parâmetros logistic_type do ML API não são confiáveis.
    // A API pode devolver Flex ou Full dentro de uma query cross_docking.
    // Por isso: busca ampla por status, filtra pelo campo real o.shipping.logistic_type.
    const queries = [
      // Pedidos prontos para enviar (ready_to_ship) — últimos 45 dias
      `${ML_API_BASE}/orders/search?seller=${userId}&order.status=paid&shipping.status=ready_to_ship&order.date_created.from=${desde45d}T00:00:00.000-03:00&sort=date_desc&limit=100`,
      // Pedidos pendentes (pagos mas ainda não prontos) — últimos 45 dias
      `${ML_API_BASE}/orders/search?seller=${userId}&order.status=paid&order.date_created.from=${desde45d}T00:00:00.000-03:00&sort=date_desc&limit=100`,
      // Em trânsito — últimos 45 dias
      `${ML_API_BASE}/orders/search?seller=${userId}&order.status=paid&shipping.status=shipped&order.date_created.from=${desde45d}T00:00:00.000-03:00&sort=date_desc&limit=50`,
    ];

    const results = await Promise.allSettled(
      queries.map(url => fetchWithTimeout(url, { headers }, 12000).then(r => r.ok ? r.json() : null))
    );

    function getOrders(settled) {
      return settled.status === 'fulfilled' && settled.value?.results
        ? settled.value.results : [];
    }

    // Filtragem pelo campo REAL do objeto — não pelo query param
    const lg = o => (o.shipping?.logistic_type || '').toLowerCase();

    const readyToShip  = getOrders(results[0]);
    const allPaid      = getOrders(results[1]);
    const inTransitRaw = getOrders(results[2]);

    // Dedup por ID
    const seen = new Set();
    function dedup(list) {
      return list.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true; });
    }

    // Agência hoje = cross_docking + ready_to_ship
    const agenciaHoje  = dedup(readyToShip.filter(o => lg(o) === 'cross_docking'));

    // Full hoje = fulfillment + ready_to_ship
    const fullCentro   = dedup(readyToShip.filter(o => lg(o) === 'fulfillment'));

    // Pendentes cross_docking (pagos, não ready_to_ship, não já em agenciaHoje)
    const agenciaIdSet = new Set(agenciaHoje.map(o => o.id));
    const crossPending = dedup(
      allPaid.filter(o => lg(o) === 'cross_docking' && !agenciaIdSet.has(o.id) && o.shipping?.status !== 'ready_to_ship')
    );

    // Em trânsito = cross_docking já despachados
    const inTransit = dedup(inTransitRaw.filter(o => lg(o) === 'cross_docking'));

    // Próximos: todos os cross_docking pendentes, sem tentar adivinhar "amanhã" por date_created
    // (o campo real de prazo está no /shipments/{id}.lead_time — ainda não mapeado)
    const agenciaAmanha   = [];   // reservado: será preenchido quando mapearmos lead_time
    const agenciaProximos = crossPending;

    // ── 4. Detalhe do primeiro shipment Agência (cutoff + shape discovery) ─
    let authCode   = null;
    let cutoffTime = null;
    try {
      const firstShipmentId = agenciaHoje[0]?.shipping?.id;
      if (firstShipmentId) {
        const shipRes = await fetchWithTimeout(
          `${ML_API_BASE}/shipments/${firstShipmentId}`,
          { headers }, 6000
        ).catch(() => null);
        if (shipRes?.ok) {
          const ship = await shipRes.json().catch(() => ({}));
          cutoffTime = ship?.drop_off?.cutoff_time || ship?.carrier_info?.cutoff || null;
          authCode   = ship?.authorization_code || ship?.drop_off?.code || null;
          console.log('[ml/painel] shipment keys:', Object.keys(ship));
          if (ship.drop_off) console.log('[ml/painel] drop_off:', JSON.stringify(ship.drop_off));
        }
      }
    } catch (_) {}

    // ── 5. Monta resposta estruturada ─────────────────────────────────────
    const formatOrder = o => ({
      id:          String(o.id),
      shipmentId:  o.shipping?.id || null,
      buyerName:   o.buyer?.nickname || '',
      total:       o.total_amount,
      dateCreated: o.date_created,
      items:       (o.order_items || []).map(i => ({
        title: i.item?.title || '',
        sku:   i.item?.seller_sku || '',
        qty:   i.quantity,
        price: i.unit_price,
      })),
    });

    res.json({
      ok: true,
      sellerId:   userId,
      sellerNick: me.nickname,
      date:       todayStr,
      authCode,
      cutoffTime,
      summary: {
        agenciaHoje:    agenciaHoje.length,
        agenciaAmanha:  agenciaAmanha.length,
        agenciaProximos: agenciaProximos.length,
        fullCentro:     fullCentro.length,
        emTransito:     inTransit.length,
        finalizadas:    delivered.length,
      },
      agenciaHoje:    agenciaHoje.map(formatOrder),
      agenciaAmanha:  agenciaAmanha.map(formatOrder),
      agenciaProximos: agenciaProximos.slice(0, 10).map(formatOrder),
      emTransito:     inTransit.slice(0, 10).map(formatOrder),
    });

  } catch (err) {
    console.error('[GET /api/ml/painel]', err.message);
    next(err);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/ml/orders/:orderId/status
// Salva o status local do pedido (imprimir / expedir / enviado) no Firestore.
// Não chama a API do ML — é apenas controle interno de expedição.
// ════════════════════════════════════════════════════════════════════════════
app.post('/api/ml/orders/:orderId/status', async (req, res, next) => {
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


// ════════════════════════════════════════════════════════════════════════════
// GET /api/ml/orders/:orderId/label
// Etiqueta de transporte ML — retorna ZPL (string) ou PDF (base64).
// Estratégia: múltiplas variantes de endpoint até encontrar uma que funcione.
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/ml/orders/:orderId/label', async (req, res, next) => {
  try {
    const orderId = safeTrim(req.params.orderId);
    const token   = await mlEnsureToken();
    const headers = { 'Authorization': `Bearer ${token}` };

    // ── Helpers ──────────────────────────────────────────────────────────────
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

      if (!r.ok) {
        const errBody = await r.text().catch(() => '');
        console.log(`[ml/label] (${label}) err body=${errBody.slice(0, 200)}`);
        return null;
      }

      // PDF binário — lê como buffer (text() corromperia o binário)
      if (ct.includes('pdf') || ct.includes('octet')) {
        const buf = await r.arrayBuffer();
        // Verifica assinatura %PDF
        const sig = Buffer.from(buf.slice(0, 4)).toString('ascii');
        if (sig === '%PDF') {
          return { format: 'pdf', pdf: Buffer.from(buf).toString('base64'), via: label };
        }
        // Pode ser ZPL em octet-stream
        const txt = Buffer.from(buf).toString('utf8');
        if (txt.includes('^XA')) {
          return { format: 'zpl', zpl: txt, via: label };
        }
      }

      // Texto / JSON
      const raw = await r.text();
      console.log(`[ml/label] (${label}) body=${raw.slice(0, 300)}`);

      // ZPL direto
      if (raw.trimStart().startsWith('^XA') || (ct.includes('zpl') && raw.includes('^XA'))) {
        return { format: 'zpl', zpl: raw, via: label };
      }

      // JSON — extrai URL ou ZPL inline
      let data = {};
      try { data = JSON.parse(raw); } catch {}

      // ZPL inline no JSON
      const zplInline = data?.zpl || data?.content || data?.label || data?.data?.zpl;
      if (typeof zplInline === 'string' && zplInline.includes('^XA')) {
        return { format: 'zpl', zpl: zplInline, via: label };
      }

      // URL de PDF no JSON (várias formas que o ML pode retornar)
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

      return null; // conteúdo não reconhecido
    }

    // ── 1. Busca shipment_id a partir do pedido ───────────────────────────
    const orderRes = await fetchWithTimeout(
      `${ML_API_BASE}/orders/${orderId}`,
      { headers: { ...headers, 'Accept': 'application/json' } },
      8000
    );
    if (!orderRes.ok) {
      const body = await orderRes.json().catch(() => ({}));
      throw Object.assign(new Error(body.message || `Pedido ${orderId} não encontrado`), { statusCode: 404 });
    }
    const orderData  = await orderRes.json();
    const shipmentId = orderData.shipping?.id;
    if (!shipmentId) throw Object.assign(new Error('Pedido sem envio associado'), { statusCode: 400 });

    console.log(`[ml/label] orderId=${orderId} shipmentId=${shipmentId}`);

    // ── 2. Verifica detalhe do shipment (pode ter URL de etiqueta direta) ──
    const shipRes = await fetchWithTimeout(
      `${ML_API_BASE}/shipments/${shipmentId}`,
      { headers: { ...headers, 'Accept': 'application/json' } },
      8000
    ).catch(() => null);

    if (shipRes?.ok) {
      const ship = await shipRes.json().catch(() => ({}));
      console.log(`[ml/label] shipment status=${ship.status} substatus=${ship.substatus} tracking_method=${ship.tracking_method}`);

      // Algumas modalidades expõem url diretamente
      const directUrl = ship?.label?.url || ship?.print_label_url || ship?.shipping_label_url;
      if (directUrl) {
        const downloaded = await tryDownloadUrl(directUrl, 'shipment_direct_url');
        if (downloaded) return res.json({ ok: true, ...downloaded, shipmentId, orderId });
        return res.json({ ok: true, format: 'pdf_url', pdfUrl: directUrl, shipmentId, orderId, via: 'shipment_direct_url' });
      }
    }

    // ── 3. Cascata de endpoints de etiqueta ──────────────────────────────
    // IMPORTANTE: /shipments/{id}/labels NÃO usa shipment_ids= (isso é para lote via /shipments/labels)
    const attempts = [
      // individual sem parâmetro extra
      [`${ML_API_BASE}/shipments/${shipmentId}/labels`, 'individual_noparams'],
      // individual ZPL
      [`${ML_API_BASE}/shipments/${shipmentId}/labels?response_type=zpl2`, 'individual_zpl2'],
      // individual PDF
      [`${ML_API_BASE}/shipments/${shipmentId}/labels?response_type=pdf2`, 'individual_pdf2'],
      // individual PDF (sem 2)
      [`${ML_API_BASE}/shipments/${shipmentId}/labels?response_type=pdf`, 'individual_pdf'],
      // endpoint de lote com 1 ID
      [`${ML_API_BASE}/shipments/labels?shipment_ids=${shipmentId}&response_type=zpl2`, 'batch_zpl2'],
      [`${ML_API_BASE}/shipments/labels?shipment_ids=${shipmentId}&response_type=pdf2`, 'batch_pdf2'],
      [`${ML_API_BASE}/shipments/labels?shipment_ids=${shipmentId}`, 'batch_noparams'],
    ];

    for (const [url, label] of attempts) {
      const result = await tryLabelEndpoint(url, label);
      if (result) {
        console.log(`[ml/label] ✓ sucesso via (${result.via}) format=${result.format}`);
        return res.json({ ok: true, ...result, shipmentId, orderId });
      }
    }

    // ── 4. Nada funcionou — retorna URL web do ML como último recurso ──────
    // O usuário pode clicar para abrir a página de impressão do ML diretamente
    const mlWebPrintUrl = `https://www.mercadolibre.com.br/envios/label/print?shipmentIds=${shipmentId}&caller=SP&label_type=forward`;
    console.log(`[ml/label] todas tentativas falharam — fallback URL web: ${mlWebPrintUrl}`);
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


// ════════════════════════════════════════════════════════════════════════════
// GET /api/ml/debug/label/:orderId
// Diagnóstico — testa cada variante do endpoint de etiqueta e retorna raw.
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/ml/debug/label/:orderId', async (req, res, next) => {
  try {
    const orderId = safeTrim(req.params.orderId);
    const token   = await mlEnsureToken();
    const h       = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

    // Busca shipment_id
    const orderRes = await fetchWithTimeout(`${ML_API_BASE}/orders/${orderId}`, { headers: h }, 8000);
    const orderData = await orderRes.json().catch(() => ({}));
    const shipmentId = orderData.shipping?.id || null;

    if (!shipmentId) {
      return res.json({ orderId, shipmentId: null, orderStatus: orderRes.status, orderBody: orderData });
    }

    // Detalhe do shipment
    const shipRes  = await fetchWithTimeout(`${ML_API_BASE}/shipments/${shipmentId}`, { headers: h }, 8000);
    const shipData = await shipRes.json().catch(() => ({}));

    // Testa cada variante
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


// ════════════════════════════════════════════════════════════════════════════
// GET /api/ml/debug/orders
// Mapeia TODOS os valores reais de shipping.status + logistic_type dos últimos
// 45 dias — mostra contagem por combinação + 1 exemplo de cada grupo.
// Fase 1 do plano: descobrir quais status correspondem a cada tab do ML.
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/ml/debug/orders', async (req, res, next) => {
  try {
    const token   = await mlEnsureToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

    const meRes = await fetchWithTimeout(`${ML_API_BASE}/users/me`, { headers }, 8000);
    const me    = await meRes.json();
    const uid   = me.id;

    // ── Busca todos os ready_to_ship e seus shipments em paralelo ────────
    const nowBR     = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const todayISO  = nowBR.toISOString().slice(0, 10);
    const tomorrowISO = new Date(nowBR.getTime() + 86400000).toISOString().slice(0, 10);

    // Pega todos os ready_to_ship (total=49, cabe em limit=100)
    const rtsRes = await fetchWithTimeout(
      `${ML_API_BASE}/orders/search?seller=${uid}&shipping.status=ready_to_ship&sort=date_desc&limit=100`,
      { headers }, 15000
    );
    const rtsRaw  = await rtsRes.json();
    const rtsOrders = rtsRaw.results || [];

    // Busca todos os shipments em paralelo
    const shipments = await Promise.all(rtsOrders.map(async o => {
      if (!o.shipping?.id) return { orderId: o.id, error: 'no_shipping_id' };
      const sr = await fetchWithTimeout(`${ML_API_BASE}/shipments/${o.shipping.id}`, { headers }, 8000).catch(() => null);
      if (!sr?.ok) return { orderId: o.id, shipmentId: o.shipping.id, error: `http_${sr?.status}` };
      const s = await sr.json().catch(() => null);
      return {
        orderId:      o.id,
        shipmentId:   o.shipping.id,
        logisticType: s?.logistic_type || null,
        shipStatus:   s?.status || null,
        substatus:    s?.substatus || null,
        deliveryFrom: s?.shipping_option?.desired_promised_delivery?.from || null,
        cutoff:       s?.drop_off?.cutoff_time || null,
        authCode:     s?.authorization_code || s?.drop_off?.code || null,
        buyer:        o.buyer?.nickname,
        total:        o.total_amount,
      };
    }));

    // Agrupa para visualização rápida
    const byLogistic = {};
    const byDeliveryDate = {};
    for (const s of shipments) {
      const lt  = s.logisticType || 'unknown';
      const dd  = s.deliveryFrom ? s.deliveryFrom.slice(0, 10) : 'unknown';
      byLogistic[lt]     = (byLogistic[lt]     || 0) + 1;
      byDeliveryDate[dd] = (byDeliveryDate[dd] || 0) + 1;
    }

    res.json({
      sellerId:       uid,
      sellerNick:     me.nickname,
      today:          todayISO,
      tomorrow:       tomorrowISO,
      totalReadyToShip: rtsOrders.length,
      byLogisticType: byLogistic,   // ← quantos Agência vs Full
      byDeliveryDate: byDeliveryDate, // ← agrupamento por data de entrega
      shipments,                    // ← lista completa para inspeção
    });
  } catch (err) {
    console.error('[GET /api/ml/debug/orders]', err.message);
    next(err);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/ml/labels/batch
// Gera PDF com múltiplas etiquetas de transporte.
// Body: { orderIds: string[] }
// ════════════════════════════════════════════════════════════════════════════
app.post('/api/ml/labels/batch', async (req, res, next) => {
  try {
    const orderIds = Array.isArray(req.body.orderIds) ? req.body.orderIds : [];
    if (!orderIds.length) return res.status(400).json({ error: 'orderIds obrigatório' });

    const token   = await mlEnsureToken();
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept':        'application/json',
    };

    // Busca shipment_ids em paralelo
    const orderResults = await Promise.allSettled(
      orderIds.map(id => fetchWithTimeout(`${ML_API_BASE}/orders/${id}`, { headers }, 8000).then(r => r.json()))
    );

    const shipmentIds = orderResults
      .filter(r => r.status === 'fulfilled' && r.value?.shipping?.id)
      .map(r => r.value.shipping.id);

    if (!shipmentIds.length) throw new Error('Nenhum envio encontrado para os pedidos informados');

    // Solicita etiquetas em lote
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


// ════════════════════════════════════════════════════════════════════════════
// GET /api/ml/orders/:orderId/danfe
// Busca no Bling a DANFE simplificada vinculada ao pedido ML.
// Estratégia: busca NF pelo número do pedido ML no campo obs/clienteNome.
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/ml/orders/:orderId/danfe', async (req, res, next) => {
  try {
    const orderId = safeTrim(req.params.orderId);

    // Busca NFs do Bling de hoje com o ID do pedido ML
    const today = getTodayBR().replace(/-/g, '/');
    const data  = await blingFetch(
      `/notas-fiscais?situacoes[]=5&dataEmissaoInicio=${today}&dataEmissaoFim=${today}&limite=100`
    );
    const nfs = (data?.data || []);

    // Tenta encontrar a NF cujo campo contém o orderId
    const nf = nfs.find(n =>
      (n.observacoes || '').includes(orderId) ||
      (n.numero || '').toString() === orderId
    );

    if (!nf) {
      // Fallback: retorna URL de listagem de NFs do Bling
      return res.json({
        ok: false,
        orderId,
        danfeUrl: null,
        message: `NF não encontrada no Bling para o pedido ${orderId}. Acesse o Bling manualmente.`,
        blingUrl: `https://app2.bling.com.br/notas.fiscais.saida.php`,
      });
    }

    // Solicita URL do DANFE simplificado
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


// ════════════════════════════════════════════════════════════════════════════
// GET /api/ml/shipments/today
// Retorna resumo dos envios do dia:
//   - tipos de logística (agência, flex, full, coleta) e quantidades
//   - horário de corte da agência (de hoje)
//   - código de autorização Flex
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/ml/shipments/today', async (req, res, next) => {
  try {
    const token   = await mlEnsureToken();
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept':        'application/json',
    };

    const meRes  = await fetchWithTimeout(`${ML_API_BASE}/users/me`, { headers }, 8000);
    const meData = await meRes.json();
    const userId = meData.id;
    if (!userId) throw new Error('Não foi possível obter userId do ML');

    // Busca envios ready_to_ship
    const today = getTodayBR();
    const shipUrl = `${ML_API_BASE}/orders/search?seller=${userId}&shipping.status=ready_to_ship&limit=50`;
    const shipRes = await fetchWithTimeout(shipUrl, { headers }, 12000);
    const shipData = shipRes.ok ? await shipRes.json() : { results: [] };
    const orders  = shipData.results || [];

    // Monta lista de envios com logística
    const shipments = orders.map(o => ({
      orderId:   o.id,
      logistica: detectLogistica(o),
      needsLabel: !o.shipping?.tracking_number,
      tracking:  o.shipping?.tracking_number || null,
    }));

    // Busca horário de corte (logistic_center / shipping_preference do vendedor)
    let cutoffTime = null;
    let authCode   = null;
    try {
      const prefRes  = await fetchWithTimeout(
        `${ML_API_BASE}/users/${userId}/shipping_preferences`,
        { headers }, 8000
      );
      if (prefRes.ok) {
        const pref = await prefRes.json();
        // O ML retorna cut_off em custom_shipping_options ou modes
        const opts = pref.custom_shipping_options || pref.modes || [];
        for (const opt of opts) {
          if (opt.cut_off_time) {
            // cut_off_time é no formato "HH:MM:SS"
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

    // Busca código de autorização Flex (se disponível)
    try {
      const flexRes = await fetchWithTimeout(
        `${ML_API_BASE}/users/${userId}/shipping_preferences/flex`,
        { headers }, 8000
      );
      if (flexRes.ok) {
        const flex = await flexRes.json();
        authCode = flex.authorization_code || flex.code || null;
      }
    } catch (_) {}

    res.json({
      ok:          true,
      date:        today,
      userId,
      shipments,
      total:       shipments.length,
      cutoffTime,
      authCode,
    });

  } catch (err) {
    console.error('[GET /api/ml/shipments/today]', err.message);
    next(err);
  }
});


// ════════════════════════════════════════════════════════════════════════════
// GET /api/ml/claims
// Lista reclamações abertas do Mercado Livre.
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/ml/claims', async (req, res, next) => {
  try {
    const token   = await mlEnsureToken();
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept':        'application/json',
    };

    const meRes  = await fetchWithTimeout(`${ML_API_BASE}/users/me`, { headers }, 8000);
    const meData = await meRes.json();
    const userId = meData.id;
    if (!userId) throw new Error('Não foi possível obter userId do ML');

    // Busca reclamações abertas (como vendedor)
    const claimRes = await fetchWithTimeout(
      `${ML_API_BASE}/post-purchase/claims/search?role=seller&status=opened&limit=20&caller.id=${userId}`,
      { headers }, 12000
    );

    let claims = [];
    if (claimRes.ok) {
      const data = await claimRes.json();
      claims = data.data || data.results || [];
    }

    // Também busca em mediação
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


// ════════════════════════════════════════════════════════════════════════════
// POST /api/ml/scan-baixa
// Recebe o código de rastreio lido pelo scanner e:
//   1. Procura o pedido com esse tracking_number no Firestore/ML
//   2. Marca o status local como 'enviado'
//   3. Retorna dados do pedido para feedback visual
//
// Body: { code: string }  (código de barras da etiqueta de transporte)
// ════════════════════════════════════════════════════════════════════════════
app.post('/api/ml/scan-baixa', async (req, res, next) => {
  try {
    const code = safeTrim(req.body.code);
    if (!code) return res.status(400).json({ error: 'code obrigatório' });

    // Estratégia 1: busca no Firestore ml_order_status por tracking_number
    const fsSnap = await db.collection('ml_order_status')
      .where('tracking_number', '==', code)
      .limit(1)
      .get();

    if (!fsSnap.empty) {
      const doc = fsSnap.docs[0];
      const data = doc.data();

      if (data.status === 'enviado') {
        return res.json({ ok: true, alreadyDone: true, orderId: doc.id, buyer: data.buyer || null });
      }

      await doc.ref.update({ status: 'enviado', updatedAtMs: Date.now() });
      return res.json({ ok: true, orderId: doc.id, buyer: data.buyer || null, tracking: code });
    }

    // Estratégia 2: busca no ML pela shipping API
    const token   = await mlEnsureToken();
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept':        'application/json',
    };

    const shipRes = await fetchWithTimeout(
      `${ML_API_BASE}/shipments/search?q=${encodeURIComponent(code)}&limit=5`,
      { headers }, 10000
    ).catch(() => null);

    let orderId = null;
    let buyer   = null;

    if (shipRes?.ok) {
      const shipData = await shipRes.json();
      const results  = shipData.results || shipData.data || [];
      if (results.length > 0) {
        const ship = results[0];
        // Busca o pedido pelo shipment_id
        const orderSearch = await fetchWithTimeout(
          `${ML_API_BASE}/orders/search?shipping.id=${ship.id}&limit=1`,
          { headers }, 8000
        ).catch(() => null);
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
      // Estratégia 3: o código pode ser o próprio orderId (bipe manual)
      if (/^\d{10,15}$/.test(code)) {
        const orderRes = await fetchWithTimeout(`${ML_API_BASE}/orders/${code}`, { headers }, 8000).catch(() => null);
        if (orderRes?.ok) {
          const od = await orderRes.json();
          orderId = od.id;
          buyer   = od.buyer?.nickname || null;
        }
      }
    }

    if (!orderId) {
      return res.status(404).json({ error: `Código "${code}" não encontrado em nenhum pedido de hoje` });
    }

    // Salva status e tracking
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

// ════════════════════════════════════════════════════════════════════════════
// ADICIONE ESTA LINHA NO server.js (rotas estáticas):
//   app.get('/ml-dashboard', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'ml-dashboard.html')));
//
// E no config.html, na lista de módulos:
//   { id: 'ml-dashboard', nome: 'ML Dashboard', rota: '/ml-dashboard', icone: '🛒' }
// ════════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════════
// GET /api/ml/dashboard
// Endpoint agregado para o DashboardPage — retorna em uma única chamada:
//   • orders: pedidos do dia com logística + status local
//   • summary: contagens por modalidade (flex/agency/fulfillment/cancelados)
//   • claims: reclamações abertas + em mediação
//   • cutoffSchedule: horário de corte diário da semana (fixo por seller config)
//   • authCode: código de autorização do dia (flex/agência) — quando disponível
//   • mlConnected: se a autenticação ML está ativa
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/ml/dashboard', requireFirebaseAuth, async (req, res, next) => {
  try {
    let mlConnected = false;
    let orders = [];
    let claims = [];
    let authCode = null;
    let cutoffSchedule = null;

    // ── Tenta conectar ao ML ──────────────────────────────────────────────
    let token = null;
    try {
      token = await mlEnsureToken();
      mlConnected = true;
    } catch (_) {
      // ML não autorizado — retorna dados parciais (sem ML)
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

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept':        'application/json',
    };

    // ── userId do vendedor ────────────────────────────────────────────────
    const meRes  = await fetchWithTimeout(`${ML_API_BASE}/users/me`, { headers }, 8000);
    const meData = await meRes.json();
    const userId = meData.id;
    if (!userId) throw new Error('Não foi possível obter userId do ML');

    const today = getTodayBR();

    // ── Busca paralela: pedidos + claims ──────────────────────────────────
    const [rPaid, rReady, rClaims, rClaimsMed] = await Promise.allSettled([
      fetchWithTimeout(
        `${ML_API_BASE}/orders/search?seller=${userId}&order.status=paid&order.date_created.from=${today}T00:00:00.000-03:00&limit=50`,
        { headers }, 12000
      ),
      fetchWithTimeout(
        `${ML_API_BASE}/orders/search?seller=${userId}&order.status=paid&shipping.status=ready_to_ship&limit=50`,
        { headers }, 12000
      ),
      fetchWithTimeout(
        `${ML_API_BASE}/post-purchase/claims/search?role=seller&status=opened&limit=20&caller.id=${userId}`,
        { headers }, 10000
      ),
      fetchWithTimeout(
        `${ML_API_BASE}/post-purchase/claims/search?role=seller&status=in_mediation&limit=20&caller.id=${userId}`,
        { headers }, 10000
      ),
    ]);

    // ── Consolida pedidos (deduplica) ─────────────────────────────────────
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

    // ── Status local em paralelo ──────────────────────────────────────────
    const statusList = await Promise.all(rawOrders.map(o => resolveLocalStatus(o.id)));
    // Início do dia local (America/Sao_Paulo ~= UTC-3) em ms — pedido criado antes disso
    // e ainda não expedido é considerado atrasado.
    const inicioHojeMs = new Date(`${today}T00:00:00.000-03:00`).getTime();
    orders = rawOrders.map((o, i) => {
      const createdAtMs = o.date_created ? new Date(o.date_created).getTime() : 0;
      const local = statusList[i];
      const isDelayed = local !== 'enviado' && local !== 'cancelado'
        && createdAtMs > 0 && createdAtMs < inicioHojeMs;
      return {
        id:           o.id,
        logistica:    detectLogistica(o),
        _localStatus: local,
        _createdTime: formatTimeBR(o.date_created),
        createdAtMs,
        isDelayed,
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
      };
    });

    // Ordena: imprimir → expedir → enviado → cancelado, depois hora desc
    const statusOrder = { imprimir: 0, expedir: 1, enviado: 2, cancelado: 3 };
    orders.sort((a, b) =>
      (statusOrder[a._localStatus] ?? 9) - (statusOrder[b._localStatus] ?? 9)
    );

    // ── Summary por modalidade + recorte atrasados vs hoje ───────────────
    const summary = {
      flex: 0, agency: 0, fulfillment: 0,
      cancelados: 0, total: orders.length, semEtiqueta: 0,
      hoje: 0, atrasados: 0,
    };
    for (const o of orders) {
      if (o._localStatus === 'cancelado') { summary.cancelados++; continue; }
      if (o.logistica === 'flex')             summary.flex++;
      else if (o.logistica === 'fulfillment') summary.fulfillment++;
      else                                     summary.agency++;
      if (o.needsLabel && o._localStatus !== 'enviado') summary.semEtiqueta++;
      if (o._localStatus === 'enviado') continue;
      if (o.isDelayed) summary.atrasados++;
      else             summary.hoje++;
    }

    // ── Claims ────────────────────────────────────────────────────────────
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

    // ── Código de autorização + corte via shipment do primeiro pedido Agência ─
    // O código diário e o horário de corte ficam no objeto drop_off do shipment.
    // Não existe endpoint global público para isso no ML — vem por pedido.
    try {
      const firstAgencia = rawOrders.find(o => {
        const lg = detectLogistica(o);
        return lg !== 'flex' && lg !== 'fulfillment' && o.shipping?.id;
      });
      if (firstAgencia?.shipping?.id) {
        const shipRes = await fetchWithTimeout(
          `${ML_API_BASE}/shipments/${firstAgencia.shipping.id}`,
          { headers }, 8000
        ).catch(() => null);
        if (shipRes?.ok) {
          const ship = await shipRes.json().catch(() => ({}));
          // Log para identificar campos reais no Railway
          console.log('[dashboard] agencia shipment logistic_type:', ship.logistic_type,
            '| substatus:', ship.substatus, '| shipId:', firstAgencia.shipping.id);
          if (ship.drop_off) console.log('[dashboard] drop_off:', JSON.stringify(ship.drop_off));
          if (ship.lead_time) console.log('[dashboard] lead_time:', JSON.stringify(ship.lead_time));

          authCode = ship?.drop_off?.authorization_code
            || ship?.drop_off?.code
            || ship?.authorization_code
            || null;

          const rawCutoff = ship?.drop_off?.cutoff_time
            || ship?.lead_time?.cutoff
            || ship?.carrier_info?.cutoff
            || null;
          if (rawCutoff) {
            cutoffSchedule = { default: String(rawCutoff).slice(0, 5) };
          }
        }
      }
    } catch (_) {}

    res.json({
      mlConnected,
      orders,
      claims,
      summary,
      authCode,
      cutoffSchedule,
      date: today,
      userId,
    });

  } catch (err) {
    console.error('[GET /api/ml/dashboard]', err.message);
    next(err);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// FIM — Mercado Livre
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// ENRIQUECER PRODUTOS — atualização em lote via XML de NF + PDFs
// ════════════════════════════════════════════════════════════════════════════

// Helper: PUT autenticado no Bling (atualização de produto)
async function blingPut(path, body) {
  const token = await blingEnsureToken();
  const res = await fetch(`${BLING_API_BASE}${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error('bling_not_authorized');
  const text = await res.text();
  if (!res.ok) throw new Error(`Bling ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// GET /produtos/buscar-por-codigo?codigo=IMP02509
// Busca produto no Bling pelo código (SKU) para obter o ID interno
app.get('/produtos/buscar-por-codigo', async (req, res, next) => {
  try {
    const codigo = safeTrim(req.query.codigo);
    if (!codigo) return res.status(400).json({ error: 'codigo obrigatório' });
    const data = await blingFetch(`/produtos?codigo=${encodeURIComponent(codigo)}&limite=5`);
    const produtos = data?.data || [];
    if (!produtos.length) return res.status(404).json({ error: `Produto "${codigo}" não encontrado no Bling` });
    res.json({ produto: produtos[0] });
  } catch (err) {
    next(err);
  }
});

// GET /produtos/buscar-por-ean?ean=7898488592024
app.get('/produtos/buscar-por-ean', async (req, res, next) => {
  try {
    const ean = safeTrim(req.query.ean);
    if (!ean) return res.status(400).json({ error: 'ean obrigatório' });
    const data = await blingFetch(`/produtos?gtin=${encodeURIComponent(ean)}&limite=5`);
    const produtos = data?.data || [];
    if (!produtos.length) return res.status(404).json({ error: `Produto EAN "${ean}" não encontrado no Bling` });
    res.json({ produto: produtos[0] });
  } catch (err) {
    next(err);
  }
});

// POST /produtos/enriquecer
// Body: { blingId, dados: { marca, ncm, pesoLiquido, pesoBruto, altura, largura, profundidade } }
app.post('/produtos/enriquecer', async (req, res, next) => {
  try {
    const { blingId, dados } = req.body;
    if (!blingId) return res.status(400).json({ error: 'blingId obrigatório' });
    if (!dados)   return res.status(400).json({ error: 'dados obrigatório' });

    const payload = {};

    if (safeTrim(dados.marca))  payload.marca = { descricao: safeTrim(dados.marca) };
    if (Number(dados.pesoLiquido) > 0) payload.pesoLiquido = Number(dados.pesoLiquido);
    if (Number(dados.pesoBruto)  > 0)  payload.pesoBruto   = Number(dados.pesoBruto);
    if (safeTrim(dados.ncm)) payload.observacoes = `NCM: ${safeTrim(dados.ncm)}`;

    const temDimensoes = Number(dados.altura) > 0 || Number(dados.largura) > 0 || Number(dados.profundidade) > 0;
    if (temDimensoes) {
      payload.dimensoes = {
        altura:       Number(dados.altura)       || 0,
        largura:      Number(dados.largura)      || 0,
        profundidade: Number(dados.profundidade) || 0,
        unidade:      'cm',
      };
    }

    if (!Object.keys(payload).length) {
      return res.status(400).json({ error: 'Nenhum dado para atualizar' });
    }

    await blingPut(`/produtos/${blingId}`, payload);

    // Atualiza no Firestore também se existir
    try {
      const snap = await db.collection('produtos').where('blingId', '==', String(blingId)).limit(1).get();
      if (!snap.empty) {
        await snap.docs[0].ref.update({
          ...(dados.marca        && { marca: safeTrim(dados.marca) }),
          ...(dados.ncm          && { ncm: safeTrim(dados.ncm) }),
          ...(dados.pesoLiquido  && { pesoLiquido: Number(dados.pesoLiquido) }),
          ...(dados.pesoBruto    && { pesoBruto: Number(dados.pesoBruto) }),
          ...(dados.altura       && { altura: Number(dados.altura) }),
          ...(dados.largura      && { largura: Number(dados.largura) }),
          ...(dados.profundidade && { profundidade: Number(dados.profundidade) }),
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (_) { /* Firestore opcional */ }

    res.json({ ok: true, blingId });
  } catch (err) {
    next(err);
  }
});

// POST /produtos/fotos-bling — envia fotos ao Cloudinary e vincula ao produto no Bling
app.post('/produtos/fotos-bling',
  uploadMemory.array('fotos', 20),
  async (req, res, next) => {
    try {
      const blingId = safeTrim(req.body.blingId);
      if (!blingId) return res.status(400).json({ error: 'blingId obrigatório' });
      if (!req.files?.length) return res.status(400).json({ error: 'Nenhuma foto enviada' });

      const urls = [];
      for (const file of req.files) {
        const cloudUrl = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: `expedicao-pro/bling/${blingId}`, resource_type: 'image',
              transformation: [{ quality: 'auto', fetch_format: 'auto', width: 1200, crop: 'limit' }] },
            (err, result) => err ? reject(err) : resolve(result.secure_url)
          );
          stream.end(file.buffer);
        });
        urls.push(cloudUrl);
      }

      // Busca fotos existentes no Bling para não sobrescrever
      let fotosExistentes = [];
      try {
        const prod = await blingFetch(`/produtos/${blingId}`);
        fotosExistentes = prod?.data?.midia?.imagens?.externas || [];
      } catch (_) {}

      const todasFotos = [
        ...fotosExistentes,
        ...urls.map(url => ({ link: url })),
      ].slice(0, 15);

      await blingPut(`/produtos/${blingId}`, {
        midia: { imagens: { externas: todasFotos } }
      });

      res.json({ ok: true, enviadas: urls.length, urls });
    } catch (err) {
      console.error('[POST /produtos/fotos-bling]', err);
      next(err);
    }
  }
);

// ── TOKEN HELPERS ─────────────────────────────────────────────────
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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${creds}` },
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
async function blingFetch(path, retryCount = 0) {
  const token = await blingEnsureToken();
  const res = await fetch(`${BLING_API_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  });
  if (res.status === 401) throw new Error('bling_not_authorized');
  if (res.status === 429 && retryCount < 3) {
    // Rate limit — retry com backoff exponencial (1s, 2s, 4s)
    const delay = Math.pow(2, retryCount) * 1000;
    console.warn(`[blingFetch] 429 rate limit — retry em ${delay}ms (tentativa ${retryCount + 1}/3)`);
    await new Promise(r => setTimeout(r, delay));
    return blingFetch(path, retryCount + 1);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Bling ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

// Detecta marketplace pelo campo loja ou padrão do nome do cliente
function detectarMkt(nf) {
  const loja = (nf.loja?.descricao || nf.loja?.nome || nf.origem?.descricao || '').toLowerCase();
  const nome = (nf.contato?.nome || '').toLowerCase();
  if (loja.includes('mercado') || loja.includes('meli') || loja.includes('mlb')) return 'MERCADO_LIVRE';
  if (loja.includes('shopee')) return 'SHOPEE';
  // Padrão ML: "Nome Sobrenome (usuario.ml)" — parênteses sem espaço no usuário
  if (nome.match(/\([a-z0-9._-]+\)$/)) return 'MERCADO_LIVRE';
  return 'OUTROS';
}

// ── PÁGINA ────────────────────────────────────────────────────────
app.get('/bling', (req, res) => res.redirect('/spa/financeiro/painel'));

// ── STATUS ────────────────────────────────────────────────────────
app.get('/bling/status', async (req, res) => {
  const tok = await blingGetToken();
  if (!tok) return res.json({ authorized: false });
  res.json({ authorized: true, expired: Date.now() > tok.expiresAt, updatedAtMs: tok.updatedAtMs });
});

// ── INICIAR OAUTH ─────────────────────────────────────────────────
app.get('/bling/auth', (req, res) => {
  if (!BLING_CLIENT_ID) return res.status(500).json({ error: 'BLING_CLIENT_ID não configurado' });
  const p = new URLSearchParams({ response_type: 'code', client_id: BLING_CLIENT_ID, redirect_uri: BLING_REDIRECT_URI, state: 'expedicao_pro' });
  res.redirect(`${BLING_AUTH_URL}?${p}`);
});

// ── CALLBACK OAUTH ────────────────────────────────────────────────
app.get('/bling/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/spa/financeiro/painel?bling=error&msg=auth_denied');
  try {
    const creds = Buffer.from(`${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`).toString('base64');
    const tokenRes = await fetch(BLING_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${creds}` },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: BLING_REDIRECT_URI }).toString(),
    });
    if (!tokenRes.ok) { console.error('[bling/callback]', await tokenRes.text()); return res.redirect('/spa/financeiro/painel?bling=error&msg=token_failed'); }
    await blingSaveToken(await tokenRes.json());
    res.redirect('/spa/financeiro/painel?bling=ok');
  } catch(e) { console.error('[bling/callback]', e); res.redirect('/spa/financeiro/painel?bling=error&msg=callback_error'); }
});

// ── DESCONECTAR ───────────────────────────────────────────────────
app.post('/bling/disconnect', async (req, res) => {
  await db.collection('bling_tokens').doc('main').delete();
  res.json({ ok: true });
});

// ── LISTAR NFs DO DIA ─────────────────────────────────────────────
// GET /bling/pedidos?data=2026-03-18
// Retorna resumo das NFs — itens são carregados sob demanda via /bling/pedidos/:id
app.get('/bling/pedidos', async (req, res, next) => {
  try {
    const data   = req.query.data || new Date().toISOString().split('T')[0];
    const pagina = Number(req.query.pagina || 1);

    // situacao=100 = Autorizada | 101 = Cancelada | omitir para todas
    const params = new URLSearchParams({
      dataEmissaoInicial: data,
      dataEmissaoFinal:   data,
      pagina,
      limite: 100,
    });

    const resp  = await blingFetch(`/nfe?${params}`);
    const notas = resp.data || [];

    const items = notas.map(n => ({
      id:          n.id,
      numero:      n.numero,
      numeroPedido: null,           // carregado sob demanda
      dataEmissao: n.dataEmissao,
      situacao:    n.situacao?.descricao || '',
      cliente:     { nome: n.contato?.nome || '' },
      marketplace: detectarMkt(n),
      valorTotal:  n.valorTotal || 0,
      itens:       [],              // carregados sob demanda
      detalhado:   false,
    }));

    res.json({ items, total: items.length, data });
  } catch(err) {
    if (err.message === 'bling_not_authorized') return res.status(401).json({ error: 'bling_not_authorized' });
    console.error('[GET /bling/pedidos]', err);
    next(err);
  }
});

// ── DETALHES DE UMA NF (com itens) ───────────────────────────────
// GET /bling/pedidos/:id
app.get('/bling/pedidos/:id', async (req, res, next) => {
  try {
    const resp = await blingFetch(`/nfe/${req.params.id}`);
    const n    = resp.data || resp;

    const numeroPedido = n.numeroPedidoLoja || n.numeroPedido || null;
    const mkt2         = detectarMkt(n);
    // mlOrderId: numeroPedidoLoja do Bling para pedidos ML é o order_id do ML
    const mlOrderId2   = (mkt2 === 'MERCADO_LIVRE' && numeroPedido) ? String(numeroPedido) : null;

    const item = {
      id:           n.id,
      numero:       n.numero,
      numeroPedido,
      mlOrderId:    mlOrderId2,
      dataEmissao:  n.dataEmissao,
      situacao:     n.situacao?.descricao || '',
      cliente:      { nome: n.contato?.nome || '', email: n.contato?.email || '' },
      marketplace:  mkt2,
      valorTotal:   n.valorTotal || n.totalProdutos || 0,
      detalhado:    true,
      itens: (n.itens || []).map(it => ({
        // Bling v3 NF: campos diretos no item
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


// ── DEBUG: ver resposta bruta da API do Bling ────────────────────
// GET /bling/debug/nfe/:id  — remover em produção após diagnóstico
app.get('/bling/debug/nfe/:id', async (req, res, next) => {
  try {
    const raw = await blingFetch(`/nfe/${req.params.id}`);
    res.json(raw); // retorna tudo como veio do Bling
  } catch(err) {
    next(err);
  }
});

// ── CLONAR NF → CRIAR PEDIDO ─────────────────────────────────────
app.post('/bling/clonar', async (req, res, next) => {
  try {
    const { marketplace, itens, clienteNome, numeroPedido, mlOrderId, logistica } = req.body;
    // Sanitiza blingNfId: mantém apenas dígitos (remove traços, letras, etc.)
    const blingNfId = String(req.body.blingNfId || '').replace(/\D/g, '') || null;

    if (!itens || !itens.length) return res.status(400).json({ error: 'Nenhum item enviado. Abra os itens da NF antes de clonar.' });

    // Separar itens com e sem SKU
    const itensComSku = itens.filter(it => safeTrim(it.sku));
    const itensSemSku = itens.filter(it => !safeTrim(it.sku));

    if (!itensComSku.length) return res.status(400).json({
      error: 'Nenhum item com SKU encontrado. Verifique se os produtos têm código cadastrado no Bling.',
      itensSemSku: itensSemSku.map(it => it.nome),
    });

    // Buscar produtos no Firestore
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
      if (!p) { skusFaltando.push(sku); continue; }
      cart.push({
        sku,
        nameShort:  (p.name || it.nome || sku).slice(0, 48),
        qty:        Number(it.qty || 1),
        ean:        p.ean    || '',
        eanBox:     p.eanBox || '',
        bin:        p.bin    || '',
        image:      './assets/placeholder.png',
        images:     p.images || [],
        checkedQty: 0,
      });
    }

    if (!cart.length) return res.status(400).json({
      error: 'Nenhum produto encontrado no sistema para os SKUs desta NF.',
      skusFaltando,
    });

    // Criar pedido
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
        isPriority:    false,
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


// ════════════════════════════════════════════════════════════════════════════
// FIM — Enriquecer Produtos
// ════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// PROXY DE IMAGEM — /admin/proxy-image?url=...
// Resolve CORS: o browser não consegue fazer fetch em URLs externas (Bling S3,
// Cloudinary de outro domínio). O backend baixa a imagem e devolve como buffer.
// ══════════════════════════════════════════════════════════════════════════════
app.get('/admin/proxy-image', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url obrigatório' });
  try {
    const ext = url.split('?')[0].split('.').pop().toLowerCase();
    const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/jpeg';
    const r = await fetch(url, { headers: { 'User-Agent': 'UniversoBox-Hub/1.0' } });
    if (!r.ok) return res.status(r.status).json({ error: `fetch remoto falhou: ${r.status}` });
    const buf = Buffer.from(await r.arrayBuffer());
    res.set('Content-Type', mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(buf);
  } catch (e) {
    console.error('[proxy-image]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// INTELIGÊNCIA DO PRODUTO — /bling/produto-intel?sku=XPTO
// Retorna: estoque atual + vendas 30 dias por canal de marketplace
// Usa blingFetch (já definido no server.js)
// ══════════════════════════════════════════════════════════════════════════════
app.get('/bling/produto-intel', async (req, res) => {
  const { sku } = req.query;
  if (!sku) return res.status(400).json({ error: 'sku obrigatório' });
  try {
    // 1. Busca produto no Bling para obter o ID
    const lista = await blingFetch(`/produtos?codigo=${encodeURIComponent(sku)}&limite=5`);
    const match = (lista?.data || []).find(p =>
      (p.codigo || '').toLowerCase() === sku.toLowerCase()
    );
    if (!match) return res.json({ ok: true, estoque: null, vendas30d: null, canais: [] });

    const blingId = match.id;

    // 2. Estoque em paralelo com pedidos 30 dias
    const dataInicio = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dataFim    = new Date().toISOString().slice(0, 10);

    const [estoqueRes, pedidosRes] = await Promise.allSettled([
      blingFetch(`/estoques/${blingId}`),
      blingFetch(`/pedidos/vendas?dataInicial=${dataInicio}&dataFinal=${dataFim}&limite=100`),
    ]);

    // 3. Estoque
    let estoque = null;
    if (estoqueRes.status === 'fulfilled') {
      const ed = estoqueRes.value?.data;
      estoque = ed?.saldoFisico ?? ed?.saldoVirtual ?? null;
    }

    // 4. Vendas: filtra por SKU nos itens dos pedidos
    const canaisMap = {};
    let totalQty = 0;
    if (pedidosRes.status === 'fulfilled') {
      const pedidos = pedidosRes.value?.data || [];
      for (const pedido of pedidos) {
        const canal = pedido.canal?.descricao || pedido.canal?.nome || 'Outros';
        const itens = pedido.itens || [];
        for (const item of itens) {
          const itemSku = item.codigo || item.produto?.codigo || '';
          if (itemSku.toLowerCase() !== sku.toLowerCase()) continue;
          const qty = Number(item.quantidade) || 0;
          totalQty += qty;
          canaisMap[canal] = (canaisMap[canal] || 0) + qty;
        }
      }
    }

    const canais = Object.entries(canaisMap)
      .map(([nome, qty]) => ({ nome, qty }))
      .sort((a, b) => b.qty - a.qty);

    res.json({ ok: true, sku, blingId, estoque, vendas30d: totalQty, canais });
  } catch (e) {
    console.error('[/bling/produto-intel]', e.message);
    if (e.message === 'bling_not_authorized') {
      return res.status(401).json({ error: 'Bling não conectado' });
    }
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/margem-v2/importar-historico ───────────────────────────────────
// Admin only — executa 1x para migrar dados históricos do Google Sheets
// para Firestore (fin_margem_mensal), preservando meses já automáticos.
app.post('/api/margem-v2/importar-historico', requireFirebaseAuth, requireFirebaseRole(['admin']), async (req, res, next) => {
  try {
    const tenantId = req.auth?.tenantId || null;
    if (!SPREADSHEET_ID) return res.status(500).json({ error: 'SPREADSHEET_ID não configurado' });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Margem!A4:AD',
    });
    const rows = response.data.values || [];
    if (rows.length < 2) return res.json({ importados: 0 });

    const headers = (rows[0] || []).map(h => String(h).trim());
    const nrm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const col = name => headers.findIndex(h => nrm(h).includes(nrm(name)));
    const brl = str => {
      if (!str) return 0;
      const neg = String(str).includes('-');
      const v = parseFloat(String(str).replace(/[R$\s\-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
      return neg ? -v : v;
    };

    const MESES_PT = { jan:1, fev:2, mar:3, abr:4, mai:5, jun:6, jul:7, ago:8, set:9, out:10, nov:11, dez:12 };
    const [iData, iRec, iRecLiq, iCusto, iImp, iDesp, iLB, iLL] = [
      col('Data'), col('Receita Bruta'), col('Receita Líquida'), col('Custo Mercadoria'),
      col('Imposto'), col('Despesas R'), col('Soma de Lucro'), col('Lucro Líquido'),
    ];

    const batch = db.batch();
    let importados = 0;

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const dataStr = String(r[iData] || '').trim();
      if (!dataStr || dataStr.toLowerCase().includes('total')) continue;

      const match = dataStr.toLowerCase().match(/([a-z]+)[.-]+(\d+)/);
      if (!match) continue;
      const mesNum = MESES_PT[match[1].slice(0, 3)];
      const anoNum = 2000 + Number(match[2]);
      if (!mesNum) continue;

      const mesAno = `${anoNum}-${String(mesNum).padStart(2, '0')}`;
      const docId  = tenantId ? `${tenantId}_${mesAno}` : mesAno;

      const existing = await db.collection('fin_margem_mensal').doc(docId).get();
      if (existing.exists && existing.data().fonte === 'automatico') continue;

      batch.set(db.collection('fin_margem_mensal').doc(docId), {
        mesAno,
        tenantId:        tenantId || null,
        fonte:           'historico',
        receitaBruta:    brl(r[iRec]),
        receitaLiquida:  brl(r[iRecLiq]),
        custoMercadoria: brl(r[iCusto]),
        imposto:         brl(r[iImp]),
        totalDespesas:   brl(r[iDesp]),
        lucroBruto:      brl(r[iLB]),
        lucroLiquido:    brl(r[iLL]),
        importadoEm:     new Date(),
      }, { merge: true });
      importados++;
    }

    await batch.commit();
    return res.json({ ok: true, importados });
  } catch (err) {
    console.error('[POST /api/margem-v2/importar-historico]', err);
    return next(err);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// DRE IMPORTAÇÃO — upload de CSV do Bling e leitura do DRE mensal
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Converte "Jan/26" → "2026-01", "Fev/26" → "2026-02", etc.
 */
function parseMesColuna(col) {
  const MESES = { jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12 };
  const m = String(col).toLowerCase().match(/([a-z]+)[\\/](\d{2,4})/);
  if (!m) return null;
  const num = MESES[m[1].slice(0,3)];
  if (!num) return null;
  const ano = Number(m[2]) < 100 ? 2000 + Number(m[2]) : Number(m[2]);
  return `${ano}-${String(num).padStart(2,'0')}`;
}

/**
 * Converte "104.926,67" → 104926.67
 */
function parseBRLNum(str) {
  if (!str) return 0;
  const s = String(str).trim().replace(/"/g,'').replace(/\./g,'').replace(',','.');
  const v = parseFloat(s);
  return isNaN(v) ? 0 : v;
}

/**
 * Parser do DRE Bling CSV (separador ";", primeira linha = cabeçalho com meses).
 * Retorna array de objetos { mesAno, receitaBruta, deducoes, receitaLiquida,
 *   custoMercadoria, lucroBruto, despesasOperacionais, receitaFinanceira,
 *   despesaFinanceira, resultadoAntesIR, irCsll, resultadoLiquido }
 */
function parseDREBlingCSV(csvText) {
  const linhas = csvText.split(/\r?\n/).filter(l => l.trim());
  if (!linhas.length) throw new Error('Arquivo vazio');

  // Cabeçalho: ;"Jan/26";"Fev/26";...;"Total"
  const cabecalho = linhas[0].split(';').map(c => c.replace(/"/g,'').trim());
  // cabecalho[0] = '' (vazio), cabecalho[n] = 'Total' — ignoramos o Total
  const colunasMes = [];
  for (let i = 1; i < cabecalho.length; i++) {
    const mesAno = parseMesColuna(cabecalho[i]);
    if (mesAno) colunasMes.push({ idx: i, mesAno });
  }
  if (!colunasMes.length) throw new Error('Nenhum mês encontrado no cabeçalho');

  // Mapa label → valores por coluna
  const linhasData = {};
  for (let i = 1; i < linhas.length; i++) {
    const celulas = linhas[i].split(';').map(c => c.replace(/"/g,'').trim());
    const label = celulas[0];
    if (!label) continue;
    linhasData[label] = celulas;
  }

  function getVal(labelParcial, idxCol) {
    const key = Object.keys(linhasData).find(k => k.includes(labelParcial));
    if (!key) return 0;
    return parseBRLNum(linhasData[key][idxCol]);
  }

  return colunasMes.map(({ idx, mesAno }) => ({
    mesAno,
    receitaBruta:          getVal('Receita Operacional Bruta',   idx),
    deducoes:              getVal('Deduções da Receita Bruta',   idx),
    receitaLiquida:        getVal('Receita Operacional Líquida', idx),
    custoMercadoria:       getVal('Custos das Mercadorias',      idx),
    lucroBruto:            getVal('Resultado Operacional Bruto', idx),
    despesasOperacionais:  getVal('Despesas Operacionais',       idx),
    receitaFinanceira:     getVal('Receita Financeira',          idx),
    despesaFinanceira:     getVal('Despesa Financeira',          idx),
    resultadoAntesIR:      getVal('Resultado Operacional antes', idx),
    irCsll:                getVal('IR e CSLL',                   idx),
    resultadoLiquido:      getVal('Resultado Líquido do Exercício', idx),
  }));
}

// ── POST /api/fin-dre/importar ────────────────────────────────────────────────
// Recebe CSV do DRE Bling, parseia e salva cada mês no Firestore fin_dre/{mesAno}
const uploadDRE = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

app.post('/api/fin-dre/importar', requireFirebaseAuth, uploadDRE.single('arquivo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const csvText = req.file.buffer.toString('utf-8');
    let meses;
    try {
      meses = parseDREBlingCSV(csvText);
    } catch(e) {
      return res.status(422).json({ error: `Erro ao ler CSV: ${e.message}` });
    }

    const tenantId  = req.auth?.tenantId || null;
    const agora     = admin.firestore.Timestamp.now();
    const nomeArq   = req.file.originalname || 'dre.csv';
    const batch     = db.batch();

    for (const item of meses) {
      const docId = tenantId ? `${tenantId}_${item.mesAno}` : item.mesAno;
      const ref   = db.collection('fin_dre').doc(docId);
      batch.set(ref, {
        ...item,
        tenantId:    tenantId || null,
        importadoEm: agora,
        arquivoNome: nomeArq,
        fonte:       'bling_dre_csv',
      }, { merge: false });
    }

    await batch.commit();

    // Salva metadado da última importação
    const metaRef = db.collection('fin_dre_meta').doc(tenantId || 'default');
    await metaRef.set({
      ultimaImportacao: agora,
      arquivoNome: nomeArq,
      mesesImportados: meses.map(m => m.mesAno),
      tenantId: tenantId || null,
    });

    res.json({ ok: true, mesesImportados: meses.length, meses: meses.map(m => m.mesAno), preview: meses });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/fin-dre ──────────────────────────────────────────────────────────
// Retorna DRE mensal do Firestore + despesas detalhadas do fin_despesas + custo fin_compras
// Query: ?de=YYYY-MM&ate=YYYY-MM  (padrão: últimos 12 meses)
app.get('/api/fin-dre', requireFirebaseAuth, async (req, res, next) => {
  try {
    const tenantId = req.auth?.tenantId || null;
    const hoje = new Date();
    const ateDefault = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
    const d12 = new Date(hoje); d12.setMonth(d12.getMonth() - 11);
    const deDefault = `${d12.getFullYear()}-${String(d12.getMonth()+1).padStart(2,'0')}`;
    const de  = req.query.de  || deDefault;
    const ate = req.query.ate || ateDefault;

    // Gera lista de meses no intervalo
    function gerarMeses(de, ate) {
      const meses = []; let [y,m] = de.split('-').map(Number);
      const [aY,aM] = ate.split('-').map(Number);
      while (y < aY || (y === aY && m <= aM)) {
        meses.push(`${y}-${String(m).padStart(2,'0')}`);
        if (++m > 12) { m = 1; y++; }
      }
      return meses;
    }
    const meses = gerarMeses(de, ate);

    // 1. Busca DRE importado do Firestore
    const dreSnap = await db.collection('fin_dre')
      .where('mesAno', 'in', meses.slice(0, 30)) // Firestore limita in a 30 items
      .get();
    const drePorMes = {};
    dreSnap.forEach(doc => { drePorMes[doc.data().mesAno] = doc.data(); });

    // 2. Busca fin_despesas para breakdown de categorias (complemento)
    const deTs  = new Date(de  + '-01T00:00:00');
    const ateTs = new Date(ate + '-01T00:00:00');
    ateTs.setMonth(ateTs.getMonth() + 1);
    let despQ = db.collection('fin_despesas').where('data','>=',deTs).where('data','<',ateTs);
    if (tenantId) despQ = despQ.where('tenantId','==',tenantId);
    const despSnap = await despQ.get();
    const despCatPorMes = {};
    despSnap.forEach(doc => {
      const d = doc.data();
      const dt = d.data?.toDate ? d.data.toDate() : new Date(d.data);
      const mm = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      if (!despCatPorMes[mm]) despCatPorMes[mm] = {};
      const cat = String(d.categoria || 'Outros');
      despCatPorMes[mm][cat] = (despCatPorMes[mm][cat] || 0) + Number(d.valor || 0);
    });

    // 3. Metadado da última importação
    const metaDoc = await db.collection('fin_dre_meta').doc(tenantId || 'default').get();
    const meta = metaDoc.exists ? metaDoc.data() : null;

    // 4. Monta resposta
    const NOMES_MES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    const items = meses.map(mm => {
      const dre = drePorMes[mm] || null;
      const cats = despCatPorMes[mm] || {};
      const [a, m] = mm.split('-');
      const label = `${NOMES_MES[Number(m)-1]}.-${String(a).slice(2)}`;

      if (!dre) return { mesAno: mm, label, semDados: true, despesasCategorias: cats };

      const receitaBruta   = dre.receitaBruta || 0;
      const margemBruta    = receitaBruta > 0 ? (dre.lucroBruto / receitaBruta) : 0;
      const totalDespesas  = dre.despesasOperacionais + dre.despesaFinanceira;
      const margemLiquida  = receitaBruta > 0 ? (dre.resultadoLiquido / receitaBruta) : 0;

      return {
        mesAno:              mm,
        label,
        semDados:            false,
        receitaBruta,
        deducoes:            dre.deducoes || 0,
        receitaLiquida:      dre.receitaLiquida || 0,
        custoMercadoria:     dre.custoMercadoria || 0,
        lucroBruto:          dre.lucroBruto || 0,
        margemBruta,
        despesasOperacionais: dre.despesasOperacionais || 0,
        receitaFinanceira:   dre.receitaFinanceira || 0,
        despesaFinanceira:   dre.despesaFinanceira || 0,
        totalDespesas,
        irCsll:              dre.irCsll || 0,
        resultadoLiquido:    dre.resultadoLiquido || 0,
        margemLiquida,
        despesasCategorias:  cats,
        importadoEm:         dre.importadoEm?.toDate?.()?.toISOString() || null,
        arquivoNome:         dre.arquivoNome || null,
      };
    });

    // Totais
    const comDados = items.filter(i => !i.semDados);
    const totais = comDados.length ? {
      isTotal:          true,
      label:            'Total',
      receitaBruta:     comDados.reduce((s,i) => s + i.receitaBruta, 0),
      receitaLiquida:   comDados.reduce((s,i) => s + i.receitaLiquida, 0),
      custoMercadoria:  comDados.reduce((s,i) => s + i.custoMercadoria, 0),
      lucroBruto:       comDados.reduce((s,i) => s + i.lucroBruto, 0),
      totalDespesas:    comDados.reduce((s,i) => s + i.totalDespesas, 0),
      irCsll:           comDados.reduce((s,i) => s + i.irCsll, 0),
      resultadoLiquido: comDados.reduce((s,i) => s + i.resultadoLiquido, 0),
      margemBruta:      0,
      margemLiquida:    0,
    } : null;
    if (totais) {
      totais.margemBruta   = totais.receitaBruta > 0 ? totais.lucroBruto / totais.receitaBruta : 0;
      totais.margemLiquida = totais.receitaBruta > 0 ? totais.resultadoLiquido / totais.receitaBruta : 0;
    }

    res.json({ items, totais, meta, de, ate });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ESTOQUE — upload CSV "Visão Financeira do Estoque" e leitura do saldo
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Parser do CSV "Visão Financeira do Estoque" do Bling.
 * Formato: "Código";"Produto";"Un";"Quantidade";"Valor unitário";"Valor total"
 * Última linha: "Totais (N Itens)";;;"qty_total";;"valor_total"
 *
 * Retorna { totalEstoque, totalItens, totalQuantidade, produtos[] }
 */
function parseEstoqueBlingCSV(csvText) {
  const linhas = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (linhas.length < 2) throw new Error('Arquivo vazio ou sem dados');

  // Detecta o cabeçalho: deve conter "Produto" ou "Código"
  const cabecalho = linhas[0].split(';').map(c => c.replace(/"/g,'').trim().toLowerCase());
  const hasProduto = cabecalho.some(c => c.includes('produto') || c.includes('código'));
  if (!hasProduto) throw new Error('Cabeçalho não reconhecido. Exporte o relatório "Visão Financeira do Estoque" do Bling.');

  const idxCodigo    = cabecalho.findIndex(c => c.includes('código') || c === 'codigo');
  const idxProduto   = cabecalho.findIndex(c => c.includes('produto'));
  const idxUn        = cabecalho.findIndex(c => c === 'un' || c.includes('unid'));
  const idxQtd       = cabecalho.findIndex(c => c.includes('quantidade') || c === 'qtd');
  const idxVlrUnit   = cabecalho.findIndex(c => c.includes('unitário') || c.includes('unitario'));
  const idxVlrTotal  = cabecalho.findIndex(c => c.includes('valor total') || c === 'valor total');

  // Índice de fallback: 0=Código,1=Produto,2=Un,3=Quantidade,4=ValorUnit,5=ValorTotal
  const iCod  = idxCodigo   >= 0 ? idxCodigo   : 0;
  const iProd = idxProduto  >= 0 ? idxProduto  : 1;
  const iUn   = idxUn       >= 0 ? idxUn       : 2;
  const iQtd  = idxQtd      >= 0 ? idxQtd      : 3;
  const iUnit = idxVlrUnit  >= 0 ? idxVlrUnit  : 4;
  const iVlr  = idxVlrTotal >= 0 ? idxVlrTotal : 5;

  let totalEstoque    = 0;
  let totalQuantidade = 0;
  let totalItens      = 0;
  const produtos      = [];

  for (let i = 1; i < linhas.length; i++) {
    const cel = linhas[i].split(';').map(c => c.replace(/"/g,'').trim());
    const label = cel[0] || '';

    // Linha de totais: "Totais (187 Itens)" ou "Totais"
    const matchTotais = label.match(/^Totais\s*\((\d+)\s*Iten?s\)?/i);
    if (matchTotais) {
      totalItens      = parseInt(matchTotais[1], 10);
      totalQuantidade = parseBRLNum(cel[iQtd]);
      totalEstoque    = parseBRLNum(cel[iVlr]);
      continue;
    }

    // Linha de produto
    const produto   = cel[iProd] || '';
    const codigo    = cel[iCod]  || '';
    const un        = cel[iUn]   || '';
    const quantidade = parseBRLNum(cel[iQtd]);
    const valorUnit  = parseBRLNum(cel[iUnit]);
    const valorTotal = parseBRLNum(cel[iVlr]);

    // Ignora linhas sem produto ou com quantidade 0/negativa
    if (!produto || quantidade <= 0) continue;

    produtos.push({ codigo, produto, un, quantidade, valorUnit, valorTotal });
  }

  // Fallback: se a linha "Totais" não apareceu, soma manualmente
  if (totalEstoque === 0 && produtos.length > 0) {
    totalEstoque    = produtos.reduce((s, p) => s + p.valorTotal, 0);
    totalQuantidade = produtos.reduce((s, p) => s + p.quantidade, 0);
    totalItens      = produtos.length;
  }

  if (totalEstoque === 0) throw new Error('Nenhum dado de estoque encontrado no arquivo.');

  return { totalEstoque, totalItens, totalQuantidade, produtos };
}

// ── POST /api/fin-estoque/importar ────────────────────────────────────────────
// Recebe CSV do estoque Bling, parseia e salva no Firestore fin_estoque
const uploadEstoque = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/api/fin-estoque/importar', requireFirebaseAuth, uploadEstoque.single('arquivo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const csvText = req.file.buffer.toString('utf-8');
    let dados;
    try {
      dados = parseEstoqueBlingCSV(csvText);
    } catch(e) {
      return res.status(422).json({ error: `Erro ao ler CSV: ${e.message}` });
    }

    const tenantId  = req.auth?.tenantId || null;
    const agora     = admin.firestore.Timestamp.now();
    const nomeArq   = req.file.originalname || 'estoque.csv';

    // Salva snapshot do estoque (um doc por importação, keyed by data)
    const docId = tenantId ? `${tenantId}_latest` : 'latest';
    await db.collection('fin_estoque').doc(docId).set({
      totalEstoque:    dados.totalEstoque,
      totalItens:      dados.totalItens,
      totalQuantidade: dados.totalQuantidade,
      tenantId:        tenantId || null,
      importadoEm:     agora,
      arquivoNome:     nomeArq,
      fonte:           'bling_estoque_csv',
      // Salva os top 100 produtos por valor (evita doc grande demais)
      produtos: dados.produtos
        .sort((a, b) => b.valorTotal - a.valorTotal)
        .slice(0, 100),
    });

    res.json({
      ok: true,
      totalEstoque:    dados.totalEstoque,
      totalItens:      dados.totalItens,
      totalQuantidade: dados.totalQuantidade,
      produtosCarregados: dados.produtos.length,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/fin-estoque ──────────────────────────────────────────────────────
// Retorna o último snapshot de estoque importado
app.get('/api/fin-estoque', requireFirebaseAuth, async (req, res, next) => {
  try {
    const tenantId = req.auth?.tenantId || null;
    const docId    = tenantId ? `${tenantId}_latest` : 'latest';
    const snap     = await db.collection('fin_estoque').doc(docId).get();
    if (!snap.exists) return res.json({ dados: null });

    const d = snap.data();
    res.json({
      dados: {
        totalEstoque:    d.totalEstoque    || 0,
        totalItens:      d.totalItens      || 0,
        totalQuantidade: d.totalQuantidade || 0,
        importadoEm:     d.importadoEm?.toDate?.()?.toISOString() || null,
        arquivoNome:     d.arquivoNome     || null,
        produtos:        d.produtos        || [],
      },
    });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// TELEGRAM BOT — registro, status e teste
// ════════════════════════════════════════════════════════════════════════════

// POST /api/telegram/register — Davi registra o chatId do seu Telegram
app.post('/api/telegram/register', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { tenantId, uid } = req.auth;
    const chatId = String(req.body.chatId || '').trim();
    if (!chatId) return res.status(400).json({ error: 'chatId obrigatório' });

    await db.collection('telegram_config').doc(tenantId).set({
      chatId,
      tenantId,
      uid,
      ativo: true,
      configuredAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ ok: true, chatId });
  } catch (err) { next(err); }
});

// GET /api/telegram/status — verifica se está configurado
app.get('/api/telegram/status', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;
    const snap = await db.collection('telegram_config').doc(tenantId).get();
    res.json({
      botConfigurado: _tgOk(),
      registrado:     snap.exists && snap.data().ativo,
      chatId:         snap.exists ? snap.data().chatId : null,
    });
  } catch (err) { next(err); }
});

// POST /api/telegram/test — envia mensagem de teste
app.post('/api/telegram/test', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;
    if (!_tgOk()) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN não configurado no servidor' });
    const snap = await db.collection('telegram_config').doc(tenantId).get();
    if (!snap.exists) return res.status(400).json({ error: 'ChatId não registrado. Registre primeiro.' });

    const { chatId } = snap.data();
    await _sendTg(chatId,
      `✅ <b>UniversoBox Hub conectado!</b>\n\nSeu Telegram está configurado corretamente.\nVocê receberá alertas de:\n• 📦 Novos pedidos\n• ⚠️ Reclamações ML\n• 💳 Vencimentos\n• 📦 Insumos críticos\n• 🚛 Coleta não registrada`
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/telegram/chatid-helper — retorna chatIds dos updates recentes (ajuda na configuração)
app.get('/api/telegram/chatid-helper', requireFirebaseAuth, async (req, res, next) => {
  try {
    if (!_tgOk()) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN não configurado' });
    const updates = await _tgUpdates();
    const chatIds = [...new Map(
      updates
        .filter(u => u.message?.chat)
        .map(u => [u.message.chat.id, {
          chatId:    u.message.chat.id,
          nome:      u.message.chat.first_name || u.message.chat.title || '',
          username:  u.message.chat.username || '',
          ultimaMsg: u.message.text || '',
        }])
    ).values()];
    res.json({ chatIds });
  } catch (err) { next(err); }
});

// ---------------- Errors ----------------
app.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  res.status(status).json({ error: err.message || 'internal_error', status });
});

app.listen(PORT, () => {
  console.log(`[expedicao-pro] backend listening on :${PORT}`);
  console.log(`[expedicao-pro] CORS_ORIGIN=${CORS_ORIGIN}`);
  console.log(`[expedicao-pro] LOCK_TTL_MS=${LOCK_TTL_MS}`);
  console.log(`[expedicao-pro] serving public from: ${PUBLIC_DIR}`);
  console.log(`[expedicao-pro] serving uploads from: ${UPLOADS_DIR}`);

  // Inicia notificador Telegram após o servidor estar pronto
  iniciarNotificador({ admin, mlEnsureToken, ML_API_BASE });
});