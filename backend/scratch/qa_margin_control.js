/**
 * Script de Controle de Margens e Auditoria de Tarifas (Ficha Financeira)
 * Executa testes unitários na lógica de negócio para garantir cálculos exatos de CMV, comissão e frete esperados/reais.
 */

const assert = require('assert');

// Função auxiliar idêntica à lógica do backend routes/bling.js
function calculateFinanceiro(n, mkt2, itensComImagens, realCommissionInput = 0, realShippingInput = 0) {
  const valorTotalNF = Number(n.valorTotal || n.totalProdutos || 0);

  let expectedCommission = 0;
  let expectedShipping = 16.15; // default fallback

  if (mkt2 === 'MERCADO_LIVRE') {
    const rate = 0.165;
    const fixed = valorTotalNF < 79 ? 6.00 : 0;
    expectedCommission = Number((valorTotalNF * rate + fixed).toFixed(2));
    expectedShipping = valorTotalNF >= 79 ? 23.65 : 0;
  } else if (mkt2 === 'SHOPEE') {
    expectedCommission = Number((valorTotalNF * 0.20).toFixed(2));
    expectedShipping = 0;
  } else if (mkt2 === 'MAGALU') {
    expectedCommission = Number((valorTotalNF * 0.16).toFixed(2));
    expectedShipping = valorTotalNF >= 79 ? 19.90 : 0;
  } else if (mkt2 === 'TIKTOK') {
    expectedCommission = Number((valorTotalNF * 0.15).toFixed(2));
    expectedShipping = 0;
  } else {
    expectedCommission = Number((valorTotalNF * 0.15).toFixed(2));
    expectedShipping = 0;
  }

  const aliquotaImposto = 0.072;
  const impostoEstimado = Number((valorTotalNF * aliquotaImposto).toFixed(2));
  const custoProdutos = itensComImagens.reduce((sum, it) => sum + (it.precoCusto * it.qty), 0);

  const finalCommission = realCommissionInput > 0 ? realCommissionInput : expectedCommission;
  const finalShipping = realShippingInput > 0 ? realShippingInput : expectedShipping;

  const margemContribReal = Number((valorTotalNF - custoProdutos - finalCommission - finalShipping - impostoEstimado).toFixed(2));
  const margemContribRealPct = valorTotalNF > 0 ? Number(((margemContribReal / valorTotalNF) * 100).toFixed(2)) : 0;
  const temDivergencia = Math.abs(finalShipping - expectedShipping) > 1.00 || Math.abs(finalCommission - expectedCommission) > 1.00;

  return {
    custoProdutos,
    impostoEstimado,
    expectedCommission,
    expectedShipping,
    realCommission: finalCommission,
    realShipping: finalShipping,
    margemContribReal,
    margemContribRealPct,
    temDivergencia
  };
}

// Suite de Testes
function runTests() {
  console.log("=== INICIANDO TESTES QA - CONTROLE DE MARGENS E AUDITORIA ===");

  // Caso 1: Mercado Livre < R$ 79 (Frete 0, Comissão com taxa fixa)
  {
    const n = { valorTotal: 50.00 };
    const mkt = 'MERCADO_LIVRE';
    const itens = [
      { sku: 'SKU-A', qty: 2, precoCusto: 15.00 } // Total custo = 30.00
    ];
    
    const result = calculateFinanceiro(n, mkt, itens, 0, 0);
    console.log("\n[Caso 1: Mercado Livre < R$ 79]");
    console.log(result);

    // Assertions
    assert.strictEqual(result.custoProdutos, 30.00, 'CMV deve ser R$ 30.00');
    // expectedCommission = 50 * 0.165 + 6.00 = 8.25 + 6.00 = 14.25
    assert.strictEqual(result.expectedCommission, 14.25, 'Comissão esperada deve ser R$ 14.25');
    assert.strictEqual(result.expectedShipping, 0, 'Frete esperado deve ser R$ 0.00');
    // impostoEstimado = 50 * 0.072 = 3.60
    assert.strictEqual(result.impostoEstimado, 3.60, 'Imposto deve ser R$ 3.60');
    // margemContribReal = 50 - 30 - 14.25 - 0 - 3.60 = 2.15
    assert.strictEqual(result.margemContribReal, 2.15, 'Margem de contribuição líquida deve ser R$ 2.15');
    // margemContribRealPct = (2.15 / 50) * 100 = 4.3%
    assert.strictEqual(result.margemContribRealPct, 4.3, 'Margem % deve ser 4.30%');
    assert.strictEqual(result.temDivergencia, false, 'Não deve haver divergência (real não fornecido)');
    console.log("✓ Caso 1 aprovado!");
  }

  // Caso 2: Mercado Livre >= R$ 79 (Com frete R$ 23.65, sem taxa fixa)
  {
    const n = { valorTotal: 100.00 };
    const mkt = 'MERCADO_LIVRE';
    const itens = [
      { sku: 'SKU-B', qty: 1, precoCusto: 40.00 }
    ];

    const result = calculateFinanceiro(n, mkt, itens, 0, 0);
    console.log("\n[Caso 2: Mercado Livre >= R$ 79]");
    console.log(result);

    // expectedCommission = 100 * 0.165 = 16.50
    assert.strictEqual(result.expectedCommission, 16.50, 'Comissão esperada deve ser R$ 16.50');
    assert.strictEqual(result.expectedShipping, 23.65, 'Frete esperado deve ser R$ 23.65');
    // imposto = 100 * 0.072 = 7.20
    assert.strictEqual(result.impostoEstimado, 7.20, 'Imposto deve ser R$ 7.20');
    // margem = 100 - 40 - 16.50 - 23.65 - 7.20 = 12.65
    assert.strictEqual(result.margemContribReal, 12.65, 'Margem líquida deve ser R$ 12.65');
    assert.strictEqual(result.margemContribRealPct, 12.65, 'Margem % deve ser 12.65%');
    console.log("✓ Caso 2 aprovado!");
  }

  // Caso 3: Mercado Livre com Divergência no Frete Real (Cobrado R$ 30.00 em vez de R$ 23.65)
  {
    const n = { valorTotal: 100.00 };
    const mkt = 'MERCADO_LIVRE';
    const itens = [
      { sku: 'SKU-B', qty: 1, precoCusto: 40.00 }
    ];

    const realCommission = 16.50;
    const realShipping = 30.00; // Cobrança abusiva do frete
    const result = calculateFinanceiro(n, mkt, itens, realCommission, realShipping);
    console.log("\n[Caso 3: Mercado Livre com Divergência no Frete]");
    console.log(result);

    assert.strictEqual(result.temDivergencia, true, 'Deve alertar divergência no frete');
    // margem = 100 - 40 - 16.50 - 30.00 - 7.20 = 6.30
    assert.strictEqual(result.margemContribReal, 6.30, 'Margem líquida deve ser reduzida para R$ 6.30');
    console.log("✓ Caso 3 aprovado!");
  }

  // Caso 4: Shopee (20% Comissão, Frete esperado R$ 0.00)
  {
    const n = { valorTotal: 80.00 };
    const mkt = 'SHOPEE';
    const itens = [
      { sku: 'SKU-C', qty: 2, precoCusto: 20.00 }
    ];

    const result = calculateFinanceiro(n, mkt, itens, 0, 0);
    console.log("\n[Caso 4: Shopee]");
    console.log(result);

    // commission = 80 * 0.2 = 16.00
    assert.strictEqual(result.expectedCommission, 16.00, 'Comissão Shopee deve ser R$ 16.00');
    assert.strictEqual(result.expectedShipping, 0, 'Frete Shopee esperado deve ser R$ 0.00');
    // imposto = 80 * 0.072 = 5.76
    assert.strictEqual(result.impostoEstimado, 5.76, 'Imposto deve ser R$ 5.76');
    // margem = 80 - 40 - 16 - 0 - 5.76 = 18.24
    assert.strictEqual(result.margemContribReal, 18.24, 'Margem líquida deve ser R$ 18.24');
    console.log("✓ Caso 4 aprovado!");
  }

  // Caso 5: Magalu >= R$ 79 (16% Comissão, Frete R$ 19.90)
  {
    const n = { valorTotal: 100.00 };
    const mkt = 'MAGALU';
    const itens = [
      { sku: 'SKU-D', qty: 1, precoCusto: 30.00 }
    ];

    const result = calculateFinanceiro(n, mkt, itens, 0, 0);
    console.log("\n[Caso 5: Magalu]");
    console.log(result);

    // commission = 100 * 0.16 = 16.00
    assert.strictEqual(result.expectedCommission, 16.00, 'Comissão Magalu deve ser R$ 16.00');
    assert.strictEqual(result.expectedShipping, 19.90, 'Frete Magalu esperado deve ser R$ 19.90');
    // imposto = 100 * 0.072 = 7.20
    assert.strictEqual(result.impostoEstimado, 7.20, 'Imposto deve ser R$ 7.20');
    // margem = 100 - 30 - 16 - 19.90 - 7.20 = 26.90
    assert.strictEqual(result.margemContribReal, 26.90, 'Margem líquida deve ser R$ 26.90');
    console.log("✓ Caso 5 aprovado!");
  }

  console.log("\n=======================================================");
  console.log("=== TODOS OS TESTES PASSARAM COM SUCESSO! ===");
  console.log("=======================================================");
}

runTests();
