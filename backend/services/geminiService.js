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
async function logUsage(tenantId, action, promptTokens, completionTokens, totalTokens) {
  try {
    await db.collection('gemini_usage_logs').add({
      timestamp: new Date(),
      tenantId: tenantId || null,
      model: 'gemini-2.5-flash',
      action,
      promptTokens: Number(promptTokens || 0),
      completionTokens: Number(completionTokens || 0),
      totalTokens: Number(totalTokens || 0),
    });
  } catch (err) {
    console.error('[geminiService] Erro ao salvar log de uso de IA:', err.message);
  }
}

async function parseProductManualPdf(pdfBase64, tenantId = null) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('API Key do Gemini não configurada. Defina GEMINI_API_KEY no .env ou nas Configurações.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  // Usa o gemini-2.5-flash para melhor inteligência e velocidade
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
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
8. Preço de Custo (precoCusto): Se for um pedido de compra ou nota fiscal, tente extrair o preço unitário de custo do produto como número (ex: 45.90) ou nulo se não encontrado.

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
  "profundidade": "Profundidade em cm (ex: 55)",
  "precoCusto": 45.90
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
  
  // Log token usage
  const usage = result.response.usageMetadata || {};
  await logUsage(tenantId, 'parse_product_manual', usage.promptTokenCount, usage.candidatesTokenCount, usage.totalTokenCount);

  try {
    return JSON.parse(textResponse);
  } catch (err) {
    console.error('[geminiService] Falha ao parsear JSON retornado:', textResponse);
    throw new Error('Falha ao estruturar os dados retornados pela IA.');
  }
}

/**
 * Envia um boleto ou comprovante (base64) para o Gemini extrair informações financeiras estruturadas
 * @param {string} fileBase64 - Arquivo (PDF ou imagem) codificado em Base64
 * @param {string} mimeType - Tipo MIME do arquivo
 * @param {string} tenantId - Identificador do tenant para log
 * @returns {Promise<Object>} Dados da despesa estruturados
 */
async function parseExpenseDocument(fileBase64, mimeType, tenantId = null) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('API Key do Gemini não configurada. Defina GEMINI_API_KEY no .env ou nas Configurações.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    }
  });

  const prompt = `
Você é um assistente financeiro especialista em contas a pagar.
Analise este arquivo (comprovante de pagamento, boleto, recibo ou nota fiscal de despesa) e extraia as informações estruturadas no formato JSON abaixo.

ATENÇÃO ÀS SEGUINTES REGRAS DE EXTRAÇÃO:
1. Valor (valor): Extraia o valor total do documento. Deve ser um número de ponto flutuante (ex: 1500.50).
2. Data (data):
   - Se for um boleto (ainda não pago), extraia a data de vencimento.
   - Se for um comprovante de pagamento ou recibo (já pago), extraia a data do pagamento.
   - Se houver ambas as datas, dê preferência à data de pagamento se for um comprovante de transação.
   - Formate a data no padrão ISO YYYY-MM-DD (ex: "2026-05-31").
3. Fornecedor (fornecedor): Identifique o fornecedor, favorecido, recebedor ou emissor do documento (ex: "Light", "Sabesp", "J3 Transportadora").
4. Descrição (descricao): Crie uma descrição curta e resumida sobre o lançamento (ex: "Pagamento de energia elétrica ref. Maio/2026").
5. Situação (situacao):
   - Se o documento for um comprovante de pagamento realizado (como um Pix enviado, transferência efetuada, ou recibo pago), defina como "pago".
   - Se for um boleto, cobrança ou nota fiscal sem comprovante de quitação associado, defina como "pendente".
6. Categoria sugerida (categoria): Tente categorizar a despesa em uma das seguintes categorias padrão se fizer sentido, ou retorne outra caso seja mais adequada:
   - "Mercadoria" (se for aquisição de produtos/estoque)
   - "Frete" (se for transporte ou envio)
   - "Marketing" (se for anúncios, tráfego pago)
   - "Ferramentas/Software" (se for assinaturas de sistemas)
   - "Serviços Contábeis" (se for contabilidade)
   - "Impostos/Taxas"
   - "Água/Luz/Internet"
   - "Aluguel"
   - "Salários/Pró-labore"
   - "Outros"

JSON de Saída esperado (não adicione formatação markdown como \`\`\`json na resposta, retorne apenas o JSON bruto):
{
  "valor": 123.45,
  "data": "YYYY-MM-DD",
  "fornecedor": "Nome do Fornecedor",
  "descricao": "Descrição curta",
  "situacao": "pago",
  "categoria": "Categoria sugerida"
}
`;

  const cleanBase64 = fileBase64.replace(/^data:.*?;base64,/, '');

  const filePart = {
    inlineData: {
      data: cleanBase64,
      mimeType: mimeType,
    },
  };

  const result = await model.generateContent([prompt, filePart]);
  const textResponse = result.response.text();
  
  // Log token usage
  const usage = result.response.usageMetadata || {};
  await logUsage(tenantId, 'parse_expense_document', usage.promptTokenCount, usage.candidatesTokenCount, usage.totalTokenCount);

  try {
    return JSON.parse(textResponse);
  } catch (err) {
    console.error('[geminiService] Falha ao parsear JSON retornado:', textResponse);
    throw new Error('Falha ao estruturar os dados retornados pela IA.');
  }
}

module.exports = {
  parseProductManualPdf,
  parseExpenseDocument,
  getGeminiApiKey,
};
