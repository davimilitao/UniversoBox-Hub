/**
 * @file geminiService.js
 * @description Integração com a API do Google Gemini para leitura de manuais em PDF
 *   e extração estruturada de dados de produtos.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { db } = require('../config/firebase');

// Cache local da chave de API
let cachedApiKey = null;

/**
 * Obtém a chave do Gemini a partir do .env ou do Firestore
 */
async function getGeminiApiKey() {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  if (cachedApiKey) {
    return cachedApiKey;
  }
  try {
    const doc = await db.collection('config').doc('gemini').get();
    if (doc.exists && doc.data().apiKey) {
      cachedApiKey = doc.data().apiKey;
      return cachedApiKey;
    }
  } catch (err) {
    console.warn('[geminiService] Erro ao ler chave do Firestore:', err.message);
  }
  return null;
}

/**
 * Envia um PDF (base64) para o Gemini extrair informações estruturadas
 * @param {string} pdfBase64 - PDF codificado em Base64
 * @returns {Promise<Object>} Dados do produto estruturados
 */
async function parseProductManualPdf(pdfBase64) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('API Key do Gemini não configurada. Defina GEMINI_API_KEY no .env ou nas Configurações.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  // Usa o 2.0-flash por ser estável, rápido e excelente com extração de dados técnicos
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    }
  });

  const prompt = `
Você é um assistente especialista em catálogo e cadastro de produtos.
Analise este arquivo PDF (manual de montagem, catálogo ou nota fiscal de produto) e extraia os dados técnicos do produto no formato JSON abaixo.

ATENÇÃO ÀS SEGUINTES REGRAS:
1. Código / SKU: Procure pelo código de referência do modelo ou SKU do fabricante (ex: Dorel, Cosco, Safety 1st, Infanti).
2. GTIN / EAN: Procure o código de barras (normalmente 13 dígitos).
3. Peso Líquido e Peso Bruto: Extraia em quilogramas (kg) apenas como string numérica (ex: "8.500", "0.350").
4. Dimensões (Altura, Largura, Profundidade): Extraia em centímetros (cm) apenas como string numérica (ex: "105", "45", "52").
5. Descrição Curta: Crie uma frase de venda chamativa de até 80 caracteres.
6. Descrição Completa: Redija uma descrição técnica detalhada contendo os destaques do produto, materiais, certificações de segurança e usabilidade extraídos do manual.
7. Marca: Identifique a marca do fabricante (ex: Cosco, Safety 1st, Infanti, Quinny, Maxi-Cosi, Dorel).

JSON de Saída esperado (não adicione formatação markdown como \`\`\`json na resposta, retorne apenas o JSON bruto):
{
  "nome": "Nome comercial do produto completo",
  "codigo": "SKU ou Código do Fabricante",
  "gtin": "Código de Barras EAN13 se houver",
  "marca": "Marca do Produto",
  "ncm": "NCM do produto se houver, senão string vazia",
  "descricaoCurta": "Frase de venda resumida",
  "descricao": "Descrição técnica e comercial completa do produto",
  "pesoLiq": "Peso líquido em kg (ex: 7.200)",
  "pesoBruto": "Peso bruto em kg (ex: 8.500)",
  "altura": "Altura em cm (ex: 98)",
  "largura": "Largura em cm (ex: 45)",
  "profundidade": "Profundidade em cm (ex: 55)"
}
`;

  const pdfPart = {
    inlineData: {
      data: pdfBase64.replace(/^data:application\/pdf;base64,/, ''),
      mimeType: 'application/pdf',
    },
  };

  const result = await model.generateContent([prompt, pdfPart]);
  const textResponse = result.response.text();
  
  try {
    return JSON.parse(textResponse);
  } catch (err) {
    console.error('[geminiService] Falha ao parsear JSON retornado:', textResponse);
    throw new Error('Falha ao estruturar os dados retornados pela IA.');
  }
}

module.exports = {
  parseProductManualPdf,
  getGeminiApiKey,
};
