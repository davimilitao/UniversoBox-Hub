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
// listItem: objeto resumido do endpoint de lista (tem imagemURL como fallback)
function normalizarProduto(p, listItem = null) {
  let imagens = [];

  // 1. midia[] — endpoint de detalhe V3
  if (Array.isArray(p.midia) && p.midia.length > 0) {
    // Diagnóstico: loga estrutura completa do primeiro item para entender os campos
    console.log(`[normalizarProduto] midia[0] keys:`, Object.keys(p.midia[0] || {}));
    console.log(`[normalizarProduto] midia raw:`, JSON.stringify(p.midia).slice(0, 600));
    imagens = p.midia
      .filter(m => {
        const url = m.link || m.url || m.linkThumbnail || '';
        const tipo = String(m.tipo || m.tipoArquivo || '').toLowerCase();
        return url && !tipo.includes('video');
      })
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
      .map(m => m.link || m.url || m.linkThumbnail || '')
      .filter(Boolean);
  }

  // 2. imagens[] — campo alternativo
  if (!imagens.length && Array.isArray(p.imagens) && p.imagens.length > 0) {
    console.log(`[normalizarProduto] usando p.imagens, length=${p.imagens.length}`);
    imagens = p.imagens
      .map(i => (typeof i === 'string' ? i : i.link || i.url || i.linkThumbnail || ''))
      .filter(Boolean);
  }

  // 3. imagemURL do próprio detalhe
  if (!imagens.length && p.imagemURL) {
    console.log(`[normalizarProduto] usando p.imagemURL`);
    imagens = [p.imagemURL];
  }

  // 4. imagemURL do item de lista (passado como fallback)
  if (!imagens.length && listItem?.imagemURL) {
    console.log(`[normalizarProduto] usando listItem.imagemURL`);
    imagens = [listItem.imagemURL];
  }

  // Diagnóstico final
  console.log(`[normalizarProduto] sku=${p.codigo} imagens=${imagens.length}`, imagens.slice(0, 2));
  // Loga keys do objeto detalhe para entender a estrutura completa
  console.log(`[normalizarProduto] detail keys:`, Object.keys(p || {}));

  return {
    id:           p.id,
    nome:         p.nome          || '',
    codigo:       p.codigo        || '',
    gtin:         p.gtin          || '',
    preco:        String(p.preco  || '0.00'),
    marca:        p.marca         || '',
    ncm:          p.ncm           || '',
    descricao:       p.descricao       || '',
    descricaoCurta:  p.descricaoCurta  || '',
    tipo:            p.tipo            || 'P',
    situacao:     p.situacao      || 'A',
    origem:       p.origem        ?? 0,
    pesoLiq:      String(p.peso?.liquido  || p.pesoLiquido  || '0.000'),
    pesoBruto:    String(p.peso?.bruto    || p.pesoBruto    || '0.000'),
    altura:       String(p.dimensoes?.altura      || p.altura      || '0'),
    largura:      String(p.dimensoes?.largura     || p.largura     || '0'),
    profundidade: String(p.dimensoes?.profundidade|| p.profundidade|| '0'),
    categoria:    p.categoria ? { id: p.categoria.id, nome: p.categoria.descricao || p.categoria.nome || '' } : null,
    imagens,
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
    descricao:      p.descricao      || '',
    descricaoCurta: p.descricaoCurta || '',
    origem:         Number(p.origem) || 0,
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

  // Validação básica: mínimo 3 chars
  if (q.length < 3) return res.status(400).json({ error: 'Busca muito curta — use o SKU ou EAN completo' });

  try {
    const token = await blingEnsureToken();

    // GTIN (EAN) só se for numérico puro com 8-14 dígitos
    const pareceEAN = /^\d{8,14}$/.test(q);

    const tentativas = [];
    if (pareceEAN) tentativas.push({ url: `${BLING_API_BASE}/produtos?gtin=${encodeURIComponent(q)}&limit=5`,   campo: 'gtin'   });
    tentativas.push(            { url: `${BLING_API_BASE}/produtos?codigo=${encodeURIComponent(q)}&limit=5`, campo: 'codigo' });

    let produto = null;
    for (const { url, campo } of tentativas) {
      const { data } = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!data?.data?.length) continue;

      // Verifica se o produto retornado realmente bate com a query
      // (Bling pode ignorar o filtro e retornar todos quando o valor é inválido)
      const match = data.data.find(p => {
        const gtin   = (p.gtin   || '').toLowerCase();
        const codigo = (p.codigo || '').toLowerCase();
        const ql     = q.toLowerCase();
        return gtin === ql || codigo === ql;
      });
      if (match) { produto = match; break; }
    }

    if (!produto) return res.status(404).json({ error: 'Produto não encontrado no Bling' });

    // Busca detalhe completo pelo ID
    const { data: det } = await axios.get(`${BLING_API_BASE}/produtos/${produto.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const raw = det?.data || produto;
    res.json(normalizarProduto(raw, produto)); // produto = list item → fallback imagemURL
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
