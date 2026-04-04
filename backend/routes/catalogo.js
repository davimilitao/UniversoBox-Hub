const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const { db }  = require('../config/firebase');

const BLING_API_BASE  = 'https://www.bling.com.br/Api/v3';
const BLING_TOKEN_URL = 'https://www.bling.com.br/Api/v3/oauth/token';

// ── Token helper (auto-refresh) ───────────────────────────────────────────────
async function blingEnsureToken() {
  const doc = await db.collection('bling_tokens').doc('main').get();
  if (!doc.exists) throw new Error('bling_not_authorized');
  const tok = doc.data();

  if (Date.now() > tok.expiresAt - 300_000) {
    const creds = Buffer.from(
      `${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`
    ).toString('base64');
    const { data: d } = await axios.post(
      BLING_TOKEN_URL,
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tok.refreshToken }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${creds}` } }
    );
    await db.collection('bling_tokens').doc('main').set({
      accessToken:  d.access_token,
      refreshToken: d.refresh_token,
      expiresAt:    Date.now() + (d.expires_in || 21600) * 1000,
      updatedAtMs:  Date.now(),
    }, { merge: true });
    return d.access_token;
  }
  return tok.accessToken;
}

// Normaliza produto Bling v3 para o formato do Studio
function normalizarProduto(p) {
  return {
    id:           p.id,
    nome:         p.nome          || '',
    codigo:       p.codigo        || '',
    gtin:         p.gtin          || '',
    preco:        String(p.preco  || '0.00'),
    marca:        p.marca         || '',
    ncm:          p.ncm           || '',
    descricao:    p.descricao     || '',
    tipo:         p.tipo          || 'P',
    situacao:     p.situacao      || 'A',
    origem:       p.origem        ?? 0,
    pesoLiq:      String(p.peso?.liquido  || p.pesoLiquido  || '0.000'),
    pesoBruto:    String(p.peso?.bruto    || p.pesoBruto    || '0.000'),
    altura:       String(p.dimensoes?.altura      || p.altura      || '0'),
    largura:      String(p.dimensoes?.largura     || p.largura     || '0'),
    profundidade: String(p.dimensoes?.profundidade|| p.profundidade|| '0'),
    categoria:    p.categoria ? { id: p.categoria.id, nome: p.categoria.descricao || '' } : null,
    imagens:      (p.midia || []).filter(m => m.tipo === 'imagens').map(m => m.link),
  };
}

// Monta payload para PUT /produtos/:id
function montarPayload(p) {
  return {
    nome:         p.nome,
    codigo:       p.codigo,
    tipo:         p.tipo      || 'P',
    situacao:     p.situacao  || 'A',
    gtin:         p.gtin      || '',
    preco:        parseFloat(p.preco)        || 0,
    marca:        p.marca     || '',
    ncm:          p.ncm       || '',
    descricao:    p.descricao || '',
    origem:       Number(p.origem) || 0,
    peso: {
      liquido: parseFloat(p.pesoLiq)   || 0,
      bruto:   parseFloat(p.pesoBruto) || 0,
    },
    dimensoes: {
      largura:      parseFloat(p.largura)      || 0,
      altura:       parseFloat(p.altura)        || 0,
      profundidade: parseFloat(p.profundidade)  || 0,
    },
    ...(p.categoria?.id ? { categoria: { id: Number(p.categoria.id) } } : {}),
    ...(p.imagens?.length ? {
      midia: p.imagens.map(link => ({ link, tipo: 'imagens' }))
    } : {}),
  };
}

// ── GET /categorias ───────────────────────────────────────────────────────────
router.get('/categorias', async (req, res) => {
  try {
    const token = await blingEnsureToken();
    const { data } = await axios.get(`${BLING_API_BASE}/categorias/produtos`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json((data?.data || []).map(c => ({ id: c.id, nome: c.descricao })));
  } catch (e) {
    console.error('[GET /categorias]', e.message);
    res.status(500).json({ error: 'Falha ao buscar categorias' });
  }
});

// ── GET /buscar?q=SKU_ou_EAN ──────────────────────────────────────────────────
// Busca por código (SKU) ou GTIN (EAN) — retorna produto normalizado
router.get('/buscar', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Parâmetro q obrigatório' });

  try {
    const token = await blingEnsureToken();

    // Tenta por GTIN primeiro (EAN), depois por código (SKU)
    const tentativas = [
      `${BLING_API_BASE}/produtos?gtin=${encodeURIComponent(q)}&limit=5`,
      `${BLING_API_BASE}/produtos?codigo=${encodeURIComponent(q)}&limit=5`,
    ];

    let produto = null;
    for (const url of tentativas) {
      const { data } = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      if (data?.data?.length) { produto = data.data[0]; break; }
    }

    if (!produto) return res.status(404).json({ error: 'Produto não encontrado no Bling' });

    // Busca detalhe completo pelo ID
    const { data: det } = await axios.get(`${BLING_API_BASE}/produtos/${produto.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    res.json(normalizarProduto(det?.data || produto));
  } catch (e) {
    console.error('[GET /buscar]', e.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /produto/:id ──────────────────────────────────────────────────────────
router.get('/produto/:id', async (req, res) => {
  try {
    const token = await blingEnsureToken();
    const { data } = await axios.get(`${BLING_API_BASE}/produtos/${req.params.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json(normalizarProduto(data?.data));
  } catch (e) {
    console.error('[GET /produto/:id]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /produto/:id — atualiza no Bling ──────────────────────────────────────
router.put('/produto/:id', async (req, res) => {
  const { id } = req.params;
  const p = req.body;
  if (!p.nome || !p.codigo) return res.status(400).json({ error: 'Nome e SKU obrigatórios' });

  try {
    const token   = await blingEnsureToken();
    const payload = montarPayload(p);
    await axios.put(`${BLING_API_BASE}/produtos/${id}`, payload, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    res.json({ ok: true });
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;
    console.error('[PUT /produto/:id]', msg);
    res.status(500).json({ error: msg });
  }
});

// ── POST /criar-produto — cria novo produto no Bling ─────────────────────────
router.post('/criar-produto', async (req, res) => {
  const p = req.body;
  if (!p.nome || !p.codigo) return res.status(400).json({ error: 'Nome e SKU obrigatórios' });

  try {
    const token = await blingEnsureToken();
    const { data } = await axios.post(`${BLING_API_BASE}/produtos`, montarPayload(p), {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    res.json({ id: data?.data?.id, ok: true });
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;
    console.error('[POST /criar-produto]', msg);
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
