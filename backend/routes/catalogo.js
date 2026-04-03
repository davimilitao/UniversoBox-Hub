const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');
const { db } = require('../config/firebase');

// Gera SKU semântico simples a partir do título — sem IA
function gerarSku(titulo, ean) {
  if (!titulo) return `SKU-${ean.slice(-5)}`;
  const palavras = titulo
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(p => p.length > 2)   // ignora artigos/preposições curtas
    .slice(0, 3);                 // pega as 3 primeiras palavras relevantes
  return palavras.length ? palavras.join('-').slice(0, 25) : `SKU-${ean.slice(-5)}`;
}

const BLING_API_BASE  = 'https://www.bling.com.br/Api/v3';
const BLING_TOKEN_URL = 'https://www.bling.com.br/Api/v3/oauth/token';

// ── Token helper (auto-refresh) ───────────────────────────────────
async function blingEnsureToken() {
  const doc = await db.collection('bling_tokens').doc('main').get();
  if (!doc.exists) throw new Error('bling_not_authorized');
  let tok = doc.data();

  if (Date.now() > tok.expiresAt - 300_000) {
    const creds = Buffer.from(
      `${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`
    ).toString('base64');
    const res = await axios.post(
      BLING_TOKEN_URL,
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tok.refreshToken }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${creds}` } }
    );
    const d = res.data;
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

// ── GET /categorias ───────────────────────────────────────────────
router.get('/categorias', async (req, res) => {
  try {
    const token = await blingEnsureToken();
    const response = await axios.get(`${BLING_API_BASE}/categorias/produtos`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const categorias = (response.data?.data || []).map(cat => ({
      id: cat.id,
      nome: cat.descricao
    }));
    res.json(categorias);
  } catch (error) {
    console.error('Erro Bling categorias:', error.response?.data || error.message);
    res.status(500).json({ error: 'Falha na comunicação com o Bling' });
  }
});

// ── POST /processar-ean ───────────────────────────────────────────
router.post('/processar-ean', async (req, res) => {
  const { ean } = req.body;
  if (!ean) return res.status(400).json({ error: 'EAN obrigatório' });

  try {
    let titulo = '';
    let foto   = '';
    try {
      // API pública do ML — sem auth, sem scraping, sem bloqueio de IP
      const { data } = await axios.get(`https://api.mercadolibre.com/sites/MLB/search?q=${ean}`, {
        timeout: 8000,
      });
      const item = data?.results?.[0];
      if (item) {
        titulo = item.title || '';
        foto   = item.thumbnail?.replace('-I.jpg', '-O.jpg') || item.thumbnail || '';
      }
    } catch (e) {
      console.warn('[processar-ean] ML API falhou:', e.message);
    }

    res.json({
      fNome:         titulo || `Produto EAN ${ean}`,
      fSku:          gerarSku(titulo, ean),
      fEan:          ean,
      fMarca:        '',
      fNcm:          '',
      fPreco:        '0.00',
      fPesoLiq:      '0.000',
      fPesoBruto:    '0.000',
      fAltura:       '0',
      fLargura:      '0',
      fProfundidade: '0',
      imagens: foto ? [foto] : [],
    });
  } catch (error) {
    console.error('[processar-ean] erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── POST /criar-produto ───────────────────────────────────────────
router.post('/criar-produto', async (req, res) => {
  const p = req.body;
  if (!p.fNome || !p.fSku) return res.status(400).json({ error: 'Nome e SKU obrigatórios' });

  try {
    const token = await blingEnsureToken();

    const payload = {
      nome:         p.fNome,
      codigo:       p.fSku,
      tipo:         'P',
      situacao:     'A',
      gtin:         p.fEan || '',
      preco:        parseFloat(p.fPreco)     || 0,
      pesoBruto:    parseFloat(p.fPesoBruto) || 0,
      pesoLiquido:  parseFloat(p.fPesoLiq)   || 0,
      largura:      parseFloat(p.fLargura)   || 0,
      altura:       parseFloat(p.fAltura)    || 0,
      profundidade: parseFloat(p.fProfundidade) || 0,
      ncm:          p.fNcm  || '',
      marca:        p.fMarca || '',
      ...(p.idCategoria ? { categoria: { id: Number(p.idCategoria) } } : {}),
      ...(p.imagens?.length ? {
        midia: p.imagens.map(link => ({ link, tipo: 'imagens' }))
      } : {}),
    };

    const response = await axios.post(`${BLING_API_BASE}/produtos`, payload, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });

    res.json({ id: response.data?.data?.id, ok: true });
  } catch (error) {
    const msg = error.response?.data?.error?.message || error.message;
    console.error('Erro criar-produto Bling:', msg);
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
