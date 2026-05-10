/**
 * @file expedicao-v2.test.js
 * @description Testes unitários para as funções puras do módulo Expedição V2.
 *   Testa: isoDate, v2Prioridade, v2DataExpedicao, v2PodeExpedir
 *   Executa com: node --test backend/tests/expedicao-v2.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ─── Replica das funções (copiar de server.js para isolar o teste) ────────────
function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function v2Prioridade(marketplace) {
  if (marketplace === 'MERCADO_LIVRE') return 1;
  if (marketplace === 'SHOPEE') return 2;
  return 3;
}

function v2DataExpedicao(marketplace) {
  const d = new Date();
  if (marketplace !== 'OUTROS') return isoDate(d);
  d.setDate(d.getDate() + 1);
  return isoDate(d);
}

function v2PodeExpedir(o) {
  return (
    o.nota_fiscal === true &&
    o.bloqueado === false &&
    o.data_expedicao <= isoDate() &&
    o.status !== 'EXPEDIDO'
  );
}

// ─── isoDate ─────────────────────────────────────────────────────────────────
describe('isoDate', () => {
  test('retorna formato YYYY-MM-DD', () => {
    const resultado = isoDate();
    assert.match(resultado, /^\d{4}-\d{2}-\d{2}$/, 'deve ser YYYY-MM-DD');
  });

  test('retorna data correta para data específica', () => {
    const d = new Date(2026, 4, 10); // 10 de maio de 2026
    assert.strictEqual(isoDate(d), '2026-05-10');
  });

  test('preenche zeros nos meses e dias de 1 dígito', () => {
    const d = new Date(2026, 0, 5); // 5 de janeiro
    assert.strictEqual(isoDate(d), '2026-01-05');
  });
});

// ─── v2Prioridade ─────────────────────────────────────────────────────────────
describe('v2Prioridade', () => {
  test('MERCADO_LIVRE = 1 (mais alta)', () => {
    assert.strictEqual(v2Prioridade('MERCADO_LIVRE'), 1);
  });

  test('SHOPEE = 2 (média)', () => {
    assert.strictEqual(v2Prioridade('SHOPEE'), 2);
  });

  test('OUTROS = 3 (mais baixa)', () => {
    assert.strictEqual(v2Prioridade('OUTROS'), 3);
  });

  test('marketplace desconhecido = 3', () => {
    assert.strictEqual(v2Prioridade('MAGALU'), 3);
    assert.strictEqual(v2Prioridade(''), 3);
    assert.strictEqual(v2Prioridade(undefined), 3);
  });
});

// ─── v2DataExpedicao ──────────────────────────────────────────────────────────
describe('v2DataExpedicao', () => {
  const hoje = isoDate();
  const amanha = isoDate(new Date(Date.now() + 864e5));

  test('MERCADO_LIVRE → hoje (envio no mesmo dia)', () => {
    assert.strictEqual(v2DataExpedicao('MERCADO_LIVRE'), hoje);
  });

  test('SHOPEE → hoje (flexível, torre pode alterar)', () => {
    assert.strictEqual(v2DataExpedicao('SHOPEE'), hoje);
  });

  test('OUTROS → amanhã (baixa prioridade)', () => {
    assert.strictEqual(v2DataExpedicao('OUTROS'), amanha);
  });

  test('retorna string no formato YYYY-MM-DD', () => {
    assert.match(v2DataExpedicao('MERCADO_LIVRE'), /^\d{4}-\d{2}-\d{2}$/);
    assert.match(v2DataExpedicao('SHOPEE'),        /^\d{4}-\d{2}-\d{2}$/);
    assert.match(v2DataExpedicao('OUTROS'),        /^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── v2PodeExpedir ────────────────────────────────────────────────────────────
describe('v2PodeExpedir', () => {
  const hoje = isoDate();
  const ontem = isoDate(new Date(Date.now() - 864e5));
  const amanha = isoDate(new Date(Date.now() + 864e5));

  const base = {
    nota_fiscal: true,
    bloqueado: false,
    data_expedicao: hoje,
    status: 'NA_FILA',
  };

  test('pedido válido de hoje → pode expedir', () => {
    assert.strictEqual(v2PodeExpedir(base), true);
  });

  test('pedido com data passada → pode expedir (atrasado)', () => {
    assert.strictEqual(v2PodeExpedir({ ...base, data_expedicao: ontem }), true);
  });

  test('pedido para amanhã → NÃO pode expedir ainda', () => {
    assert.strictEqual(v2PodeExpedir({ ...base, data_expedicao: amanha }), false);
  });

  test('nota_fiscal = false → NÃO pode expedir', () => {
    assert.strictEqual(v2PodeExpedir({ ...base, nota_fiscal: false }), false);
  });

  test('bloqueado = true → NÃO pode expedir', () => {
    assert.strictEqual(v2PodeExpedir({ ...base, bloqueado: true }), false);
  });

  test('status = EXPEDIDO → NÃO pode expedir (já expedido)', () => {
    assert.strictEqual(v2PodeExpedir({ ...base, status: 'EXPEDIDO' }), false);
  });

  test('status = ERRO → pode expedir (retry permitido)', () => {
    assert.strictEqual(v2PodeExpedir({ ...base, status: 'ERRO' }), true);
  });

  test('status = EM_PROCESSO → pode expedir (re-scan permitido)', () => {
    assert.strictEqual(v2PodeExpedir({ ...base, status: 'EM_PROCESSO' }), true);
  });

  test('combinação: bloqueado + nota_fiscal false → não expedir', () => {
    assert.strictEqual(v2PodeExpedir({ ...base, bloqueado: true, nota_fiscal: false }), false);
  });
});
