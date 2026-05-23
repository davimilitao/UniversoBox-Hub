const express = require('express');
const router  = express.Router();
const { db }  = require('../config/firebase');
const { requireFirebaseAuth } = require('../middleware/requireFirebaseAuth');
const { v4: uuidv4 } = require('uuid');

// Helpers
function safeTrim(v) {
  if (v == null) return '';
  return String(v).trim();
}

function yyyymmdd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// POST /api/compras — Lançamento de compras
router.post('/compras', async (req, res, next) => {
  try {
    const { items, notas, modalidade } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'Lista vazia' });

    const ts     = Date.now();
    const day    = yyyymmdd();
    const compraId = `COMP_${day}_${uuidv4().slice(0, 6).toUpperCase()}`;
    const totalQty  = items.reduce((s, i) => s + Number(i.qty || 0), 0);
    const totalSkus = items.length;
    const marcas    = [...new Set(items.map(i => safeTrim(i.marca)).filter(m => m && m !== 'N/A'))];
    const mesAno    = day.slice(0, 6);

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

// GET /api/purchase-orders
router.get('/purchase-orders', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 30), 100);
    const snap  = await db.collection('purchase_orders')
      .orderBy('createdAtMs', 'desc')
      .limit(limit)
      .get();
    res.json({ items: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.error('[GET /api/purchase-orders]', err);
    next(err);
  }
});

// PATCH /api/purchase-orders/:id/transit-status
router.patch('/purchase-orders/:id/transit-status', async (req, res, next) => {
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

// GET /api/compras/bi
router.get('/compras/bi', async (req, res, next) => {
  try {
    const seisMs = Date.now() - (180 * 24 * 60 * 60 * 1000);

    const [ordersSnap, receiptsSnap, transitSnap] = await Promise.all([
      db.collection('purchase_orders').where('createdAtMs', '>=', seisMs).get(),
      db.collection('stock_receipts').where('createdAtMs', '>=', seisMs).get(),
      db.collection('transit_items').where('status', '==', 'transit').get(),
    ]);

    const orders   = ordersSnap.docs.map(d => d.data());
    const receipts = receiptsSnap.docs.map(d => d.data());
    const transits = transitSnap.docs.map(d => d.data());

    res.json({ orders, receipts, transits });
  } catch (err) {
    console.error('[GET /api/compras/bi]', err);
    next(err);
  }
});

module.exports = router;
