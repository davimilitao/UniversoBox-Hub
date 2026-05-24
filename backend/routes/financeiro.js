const express = require('express');
const router  = express.Router();
const { admin, db }  = require('../config/firebase');
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

// ─── DESPESAS (coleção fin_despesas no Firestore) ─────────────────────────────

// POST /fin-despesas — lança despesa no Firestore
router.post('/fin-despesas', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { uid, tenantId } = req.auth;
    const {
      data, tipo, categoria, fornecedor, descricao, valor, situacao, meioId, comprovante
    } = req.body;

    if (!data) return res.status(400).json({ error: 'Data obrigatória' });
    if (!valor || valor <= 0) return res.status(400).json({ error: 'Valor inválido' });

    const docId = `DESP_${yyyymmdd()}_${uuidv4().slice(0, 6).toUpperCase()}`;

    // Converte data "YYYY-MM-DD" ou "DD/MM/YYYY" para Date
    let dataAlvo;
    if (String(data).includes('/')) {
      const [d, m, y] = String(data).split('/');
      dataAlvo = new Date(Number(y), Number(m) - 1, Number(d));
    } else {
      dataAlvo = new Date(data);
    }
    dataAlvo.setHours(12, 0, 0, 0); // evita fuso horário

    const payload = {
      id: docId,
      uid,
      tenantId:  tenantId || null,
      data:      admin.firestore.Timestamp.fromDate(dataAlvo),
      tipo:      tipo || 'operacional',
      categoria: categoria || '',
      fornecedor: fornecedor || '',
      descricao: descricao || '',
      valor:     Number(valor),
      situacao:  situacao || 'pendente',
      meioId:    meioId || null,
      comprovante: comprovante || null,
      createdAt: new Date(),
    };

    await db.collection('fin_despesas').doc(docId).set(payload);
    res.json({ ok: true, id: docId });
  } catch (err) {
    console.error('[POST /api/fin-despesas]', err);
    next(err);
  }
});

// GET /fin-despesas — lista despesas do Firestore
router.get('/fin-despesas', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;
    const snap = await db.collection('fin_despesas')
      .where('tenantId', '==', tenantId)
      .orderBy('data', 'desc')
      .limit(200)
      .get();

    const items = snap.docs.map(doc => {
      const d = doc.data();
      const dateObj = d.data?.toDate ? d.data.toDate() : new Date(d.data);
      const diaStr = dateObj.toLocaleDateString('pt-BR');
      return {
        id:         doc.id,
        data:       diaStr,
        timestamp:  dateObj.getTime(),
        tipo:       d.tipo || 'operacional',
        categoria:  d.categoria || '',
        nome:       d.categoria || '', // Categoria é mapeada para "nome" no frontend
        fornecedor: d.fornecedor || '',
        descricao:  d.descricao || '',
        valor:      d.valor || 0,
        situacao:   d.situacao || 'pendente',
        meioId:     d.meioId || null,
        comprovante: d.comprovante || null,
      };
    });

    res.json({ items });
  } catch (err) {
    console.error('[GET /api/fin-despesas]', err);
    next(err);
  }
});

// PATCH /fin-despesas/:id — atualiza situação (pago/pendente)
router.patch('/fin-despesas/:id', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { situacao } = req.body;
    const situacaoLower = String(situacao).toLowerCase();
    if (!['pago', 'pendente'].includes(situacaoLower)) {
      return res.status(400).json({ error: 'Situação inválida' });
    }

    await db.collection('fin_despesas').doc(id).update({
      situacao: situacaoLower,
      updatedAt: new Date(),
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/fin-despesas/:id]', err);
    next(err);
  }
});

// DELETE /fin-despesas/:id — admin sempre; owner nas primeiras 24h
router.delete('/fin-despesas/:id', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { uid, role } = req.auth;
    const ref = db.collection('fin_despesas').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Despesa não encontrada' });
    const data = snap.data();
    const isAdmin = role === 'admin';
    const isOwner = data.uid === uid;
    const createdMs = data.createdAt?.toMillis?.() ?? (data.createdAt ? new Date(data.createdAt).getTime() : 0);
    const dentro24h = Date.now() - createdMs < 86400000;
    if (!isAdmin && !(isOwner && dentro24h)) {
      return res.status(403).json({ error: 'Sem permissão para excluir este lançamento' });
    }
    await ref.delete();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/fin-despesas/:id]', err);
    next(err);
  }
});

// GET /fin-contas-unificadas — lista unificada fin_despesas + fin_parcelas
router.get('/fin-contas-unificadas', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;
    const { mes } = req.query; // YYYY-MM

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

    // vencida(0) -> pendente(1) -> pago(2)
    const rank = s => s === 'vencida' ? 0 : s === 'pendente' ? 1 : 2;
    items.sort((a, b) => {
      const dr = rank(a.status) - rank(b.status);
      return dr !== 0 ? dr : a.diasParaVencer - b.diasParaVencer;
    });

    const soma = filterFn => items.filter(filterFn).reduce((s, i) => s + i.valor, 0);

    res.json({
      ok: true,
      items,
      totais: {
        total:    soma(() => true),
        vencida:  soma(i => i.status === 'vencida'),
        pendente: soma(i => i.status === 'pendente'),
        pago:     soma(i => i.status === 'pago'),
      }
    });
  } catch (err) {
    console.error('[GET /api/fin-contas-unificadas]', err);
    next(err);
  }
});

module.exports = router;
