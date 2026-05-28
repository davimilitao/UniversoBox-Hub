/**
 * @file server.js
 * @module app
 * @description Servidor Express principal (rotas, estáticos, integrações).
 * @version 0.3.0
 * @date 2026-03-31
 * @author UniversoLab
 *
 * @changelog
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
const blingRouter = require('./routes/bling');
const meliRouter = require('./routes/meli');
const financeiroRouter = require('./routes/financeiro');
const sistemaRouter = require('./routes/sistema');
const { requireFirebaseAuth, requireFirebaseRole } = require('./middleware/requireFirebaseAuth');
const { db, serviceAccount } = require('./config/firebase');
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
app.use('/spa', express.static(SPA_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    }
  }
}));

app.get('/spa/*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.sendFile(path.join(SPA_DIR, 'index.html'));
});

app.get('/login', (req, res) => res.redirect('/spa/login'));
app.get('/dashboard/:tenantId', (req, res) =>
  res.redirect(`/spa/dashboard/${req.params.tenantId}`)
);
// Redireciona rotas React para o SPA
app.get('/financeiro/*', (req, res) => res.redirect('/spa' + req.path));
app.get('/expedicao/*',  (req, res) => res.redirect('/spa' + req.path));
app.get('/catalogo/*',   (req, res) => res.redirect('/spa' + req.path));
app.get('/sistema/*',    (req, res) => res.redirect('/spa' + req.path));

app.use(express.static(PUBLIC_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    }
  }
}));
app.get('/favicon.ico', (req, res) => {
  const favPath = path.join(SPA_DIR, 'icon-192.svg');
  if (fs.existsSync(favPath)) {
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.sendFile(favPath);
  }
  res.status(204).end();
});
app.get('/print-agent.js', (req, res) => {
  const agentPath = path.join(__dirname, 'scripts', 'print-agent.js');
  if (fs.existsSync(agentPath)) {
    res.setHeader('Content-Type', 'application/javascript');
    return res.sendFile(agentPath);
  }
  res.status(404).send('Print agent script not found');
});
app.get('/', (req, res) => res.redirect('/spa/'));
app.get('/manual', (req, res) => res.redirect('/spa/expedicao/pedidos'));
app.get('/admin', (req, res) => res.redirect('/spa/catalogo/admin'));
app.get('/pedidos', (req, res) => res.redirect('/spa/expedicao/pedidos'));
app.get('/embalagens', (req, res) => res.redirect('/spa/'));
app.get('/importar', (req, res) => res.redirect('/spa/'));
app.get('/catalogo', (req, res) => res.redirect('/spa/catalogo/produtos'));
app.get('/compras', (req, res) => res.redirect('/spa/expedicao/compras'));
app.get('/financas', (req, res) => res.redirect('/spa/financeiro/despesas'));
app.get('/bling',   (req, res) => res.redirect('/spa/expedicao/bling'));
app.get('/config',  (req, res) => res.redirect('/spa/sistema/config'));
app.get('/cadastrar', (req, res) => res.redirect('/spa/catalogo/automacao'));
app.get('/enriquecer-xml', (req, res) => res.redirect('/spa/'));
app.get('/ml-dashboard', (req, res) => res.redirect('/spa/'));
app.get('/produto-studio', (req, res) => res.redirect('/spa/catalogo/fotos-lote'));


// ✅ uploads locais (fotos reais do estoque)
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/api/catalogo', catalogoRouter);
app.use('/bling', blingRouter);
app.use('/api/ml', meliRouter);
app.use('/ml', meliRouter);
app.use('/api', financeiroRouter);
app.use('/api', sistemaRouter);

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
const USE_TYPESENSE = !!process.env.TYPESENSE_HOST;

async function searchViaTypesense(q) {
  const { TypesenseClient } = require('./search/typesense-client');
  return TypesenseClient.search(q);
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

// --- ROTA DE PRIORIDADE (FLEX) ---
app.post('/orders/:id/priority', async (req, res, next) => {
  try {
    const orderId = safeTrim(req.params.id);
    const { isPriority } = req.body;

    const orderRef = db.collection('orders').doc(orderId);
    const ts = nowMs();

    await orderRef.update({
      isPriority: !!isPriority,
      logistica: isPriority ? 'flex' : 'agency',
      updatedAtMs: ts
    });

    res.json({ ok: true, isPriority: !!isPriority, logistica: isPriority ? 'flex' : 'agency' });
  } catch (err) {
    console.error('[/orders/:id/priority] error:', err);
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

      // Campos numéricos — só grava se tiver valor
      const nums = ['weight','weightBruto','width','height','depth','stock','itensPorCaixa','preco','precoCusto'];
      for (const k of nums) {
        const v = Number(p[k]);
        if (p[k] !== null && p[k] !== undefined && !isNaN(v) && v > 0) doc[k] = v;
      }

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
// ================================================================
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
});