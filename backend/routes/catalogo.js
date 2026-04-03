const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');
const Anthropic = require('@anthropic-ai/sdk');
const { db } = require('../config/firebase');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    // 1. Scraping do Mercado Livre
    const url = `https://lista.mercadolivre.com.br/${ean}`;
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    const titulobruto = $('.ui-search-item__title').first().text().trim() || 'Produto';
    const foto = $('.ui-search-result-image__element').first().attr('src') || '';

    // 2. IA processa o título bruto
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: `Você é um especialista em cadastro de produtos para e-commerce brasileiro.
Dado um título bruto de produto do Mercado Livre, retorne APENAS um JSON válido com estes campos:
- nome: título limpo e profissional em português (máx 120 chars)
- sku: código semântico em maiúsculas (formato MARCA-MODELO-VARIANTE, máx 25 chars, sem acentos)
- marca: nome da marca
- ncm: código NCM de 8 dígitos mais provável para o produto
- categoriaSugerida: nome da categoria de produto (ex: "Cadeiras para Auto", "Berços e Cercados", "Brinquedos")
Retorne somente o JSON, sem markdown.`,
      messages: [{ role: 'user', content: `Título bruto: "${titulobruto}"\nEAN: ${ean}` }]
    });

    let ia = {};
    try {
      ia = JSON.parse(msg.content[0].text);
    } catch (_) {
      ia = { nome: titulobruto, sku: `SKU-${ean.slice(-5)}`, marca: '', ncm: '', categoriaSugerida: '' };
    }

    res.json({
      fNome:    ia.nome   || titulobruto,
      fSku:     ia.sku    || `SKU-${ean.slice(-5)}`,
      fEan:     ean,
      fMarca:   ia.marca  || '',
      fNcm:     ia.ncm    || '',
      fPreco:   '0.00',
      fPesoLiq: '0.000',
      fPesoBruto: '0.000',
      fAltura: '0', fLargura: '0', fProfundidade: '0',
      categoriaSugerida: ia.categoriaSugerida || '',
      imagens: foto ? [foto] : [],
    });
  } catch (error) {
    console.error('Erro processar-ean:', error.message);
    res.status(500).json({ error: 'Falha ao processar EAN' });
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
