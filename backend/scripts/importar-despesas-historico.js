/**
 * @file importar-despesas-historico.js
 * @description Importa histórico de despesas para a coleção fin_despesas no Firestore.
 *              Uso: node scripts/importar-despesas-historico.js --tenantId=SEU_TENANT_ID
 *              Ou sem tenant (omite o campo): node scripts/importar-despesas-historico.js
 *
 * @changelog
 *   1.0.0 — 2026-04-12 — Criação para importar histórico nov/2025 → abr/2026.
 */

'use strict';

require('dotenv').config();
const { db } = require('../config/firebase');
const { Timestamp } = require('firebase-admin/firestore');

// ─── Resolver tenantId da CLI ──────────────────────────────────────────────────
const tenantArg = process.argv.find(a => a.startsWith('--tenantId='));
const TENANT_ID = tenantArg ? tenantArg.split('=')[1] : null;
const UID_IMPORT = 'importado-script';

if (!TENANT_ID) {
  console.warn('[AVISO] Nenhum --tenantId passado. Os docs serão gravados SEM tenantId.\n  Use: node scripts/importar-despesas-historico.js --tenantId=SEU_ID');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Converte "DD/MM/YYYY" → Timestamp do Firestore */
function tsFromBR(str) {
  const [d, m, y] = str.trim().split('/').map(Number);
  return Timestamp.fromDate(new Date(y, m - 1, d));
}

/** Normaliza status: "pago", "Pago", "pago " → "pago" | "pendente" */
function normStatus(s) {
  const v = (s || '').trim().toLowerCase();
  return v === 'pago' || v === 'paga' ? 'pago' : 'pendente';
}

/** Normaliza valor: "R$ 1.234,56" → 1234.56 ou number direto */
function normValor(v) {
  if (typeof v === 'number') return v;
  return parseFloat(String(v).replace(/[R$\s.]/g, '').replace(',', '.')) || 0;
}

// ─── Dados históricos ─────────────────────────────────────────────────────────
// Campos: data (DD/MM/YYYY) | categoria | descricao | valor | status | tipo
// tipo: 'mensal_fixa' | 'operacional' | 'investimento'
// Regra usada:
//   mensal_fixa  → despesas recorrentes mensais (MEI, Bling, Celular, Contabilidade, Reforma, Corola)
//   operacional  → despesas variáveis do mês (J3, etiquetas, embalagens, impostos, Meli, outros)

const DESPESAS = [
  // ── NOVEMBRO 2025 ──────────────────────────────────────────────────────────
  { data: '17/11/2025', categoria: 'Transporte / Frete',    descricao: 'Despesas Transporte (Corola)',            valor: 400.00,   situacao: 'pago',     tipo: 'mensal_fixa' },
  { data: '22/11/2025', categoria: 'Transporte / Frete',    descricao: 'J3 Transportadora',                      valor: 215.82,   situacao: 'pago',     tipo: 'operacional' },
  { data: '25/11/2025', categoria: 'MEI',                   descricao: 'MEI',                                    valor: 82.50,    situacao: 'pago',     tipo: 'mensal_fixa' },
  { data: '25/11/2025', categoria: 'Celular',               descricao: 'Celular',                                valor: 40.00,    situacao: 'pago',     tipo: 'mensal_fixa' },
  { data: '25/11/2025', categoria: 'Assinaturas',           descricao: 'Bling',                                  valor: 185.00,   situacao: 'pago',     tipo: 'mensal_fixa' },
  { data: '25/11/2025', categoria: 'Embalagens / Etiquetas', descricao: 'Etiqueta',                              valor: 70.00,    situacao: 'pago',     tipo: 'operacional' },
  { data: '25/11/2025', categoria: 'Reforma / Obras',       descricao: 'Reforma',                                valor: 300.00,   situacao: 'pago',     tipo: 'mensal_fixa' },

  // ── DEZEMBRO 2025 ──────────────────────────────────────────────────────────
  { data: '05/12/2025', categoria: 'Transporte / Frete',    descricao: 'J3 Transportadora',                      valor: 517.57,   situacao: 'pago',     tipo: 'operacional' },
  { data: '25/12/2025', categoria: 'Reforma / Obras',       descricao: 'Reforma (1/9)',                          valor: 355.00,   situacao: 'pago',     tipo: 'mensal_fixa' },
  { data: '08/12/2025', categoria: 'Transporte / Frete',    descricao: 'Corola',                                 valor: 400.00,   situacao: 'pago',     tipo: 'mensal_fixa' },
  { data: '08/12/2025', categoria: 'Infraestrutura',        descricao: 'Prateleira 1 de 10',                     valor: 300.00,   situacao: 'pago',     tipo: 'operacional' },
  { data: '10/12/2025', categoria: 'Embalagens / Etiquetas', descricao: 'Embalagens',                            valor: 228.00,   situacao: 'pago',     tipo: 'operacional' },
  { data: '12/12/2025', categoria: 'Contabilidade',         descricao: 'Contador',                               valor: 300.00,   situacao: 'pago',     tipo: 'mensal_fixa' },
  { data: '12/12/2025', categoria: 'Assinaturas',           descricao: 'Bling',                                  valor: 185.00,   situacao: 'pago',     tipo: 'mensal_fixa' },
  { data: '19/12/2025', categoria: 'Divisão de Lucros',     descricao: 'Pagamento Davi',                         valor: 3000.00,  situacao: 'pago',     tipo: 'operacional' },
  { data: '19/12/2025', categoria: 'Contabilidade',         descricao: 'Contador',                               valor: 300.00,   situacao: 'pago',     tipo: 'mensal_fixa' },
  { data: '19/12/2025', categoria: 'Celular',               descricao: 'Celular',                                valor: 50.48,    situacao: 'pago',     tipo: 'mensal_fixa' },
  { data: '22/12/2025', categoria: 'Transporte / Frete',    descricao: 'J3 Transportadora',                      valor: 383.68,   situacao: 'pago',     tipo: 'operacional' },
  { data: '22/12/2025', categoria: 'Impostos',              descricao: 'Imposto',                                valor: 3726.65,  situacao: 'pago',     tipo: 'operacional' },

  // ── JANEIRO 2026 ───────────────────────────────────────────────────────────
  { data: '09/01/2026', categoria: 'Assinaturas',           descricao: 'Bling',                                  valor: 185.00,   situacao: 'pago',     tipo: 'mensal_fixa' },
  { data: '09/01/2026', categoria: 'Embalagens / Etiquetas', descricao: 'Embalagem',                             valor: 30.00,    situacao: 'pago',     tipo: 'operacional' },
  { data: '09/01/2026', categoria: 'Transporte / Frete',    descricao: 'J3 Transportadora',                      valor: 433.00,   situacao: 'pago',     tipo: 'operacional' },
  { data: '16/01/2026', categoria: 'Embalagens / Etiquetas', descricao: 'Etiquetas',                             valor: 45.90,    situacao: 'pago',     tipo: 'operacional' },
  { data: '19/01/2026', categoria: 'Contabilidade',         descricao: 'Contabilidade',                          valor: 300.00,   situacao: 'pago',     tipo: 'mensal_fixa' },
  { data: '19/01/2026', categoria: 'Impostos',              descricao: 'Imposto',                                valor: 4442.28,  situacao: 'pago',     tipo: 'operacional' },
  { data: '19/01/2026', categoria: 'Transporte / Frete',    descricao: 'Corola',                                 valor: 400.00,   situacao: 'pago',     tipo: 'mensal_fixa' },
  { data: '19/01/2026', categoria: 'Infraestrutura',        descricao: 'Prateleira 2 de 10',                     valor: 300.00,   situacao: 'pago',     tipo: 'operacional' },
  { data: '22/01/2026', categoria: 'Transporte / Frete',    descricao: 'J3 Transportadora',                      valor: 133.00,   situacao: 'pago',     tipo: 'operacional' },
  { data: '25/01/2026', categoria: 'Reforma / Obras',       descricao: 'Reforma (2/9)',                          valor: 355.00,   situacao: 'pago',     tipo: 'mensal_fixa' },

  // ── FEVEREIRO 2026 ─────────────────────────────────────────────────────────
  { data: '02/02/2026', categoria: 'Transporte / Frete',    descricao: 'J3 Transportadora',                      valor: 289.76,   situacao: 'pago',     tipo: 'operacional' },
  { data: '06/02/2026', categoria: 'Transporte / Frete',    descricao: 'Coleta Meli e Shopee',                   valor: 165.00,   situacao: 'pago',     tipo: 'operacional' },
  { data: '12/02/2026', categoria: 'Celular',               descricao: 'Celular',                                valor: 48.00,    situacao: 'pago',     tipo: 'mensal_fixa' },
  { data: '12/02/2026', categoria: 'Operador Logístico',    descricao: 'Despesa Operacional',                    valor: 2400.00,  situacao: 'pago',     tipo: 'operacional' },
  { data: '13/02/2026', categoria: 'Embalagens / Etiquetas', descricao: '1000 etiquetas / 10 rolos full / 100 adesivo frágil', valor: 131.12, situacao: 'pago', tipo: 'operacional' },
  { data: '20/02/2026', categoria: 'Embalagens / Etiquetas', descricao: 'Etiqueta',                              valor: 180.00,   situacao: 'pago',     tipo: 'operacional' },
  { data: '20/02/2026', categoria: 'Impostos',              descricao: 'Imposto',                                valor: 6467.90,  situacao: 'pago',     tipo: 'operacional' },
  { data: '20/02/2026', categoria: 'Contabilidade',         descricao: 'Contabilidade',                          valor: 300.00,   situacao: 'pago',     tipo: 'mensal_fixa' },
  { data: '20/02/2026', categoria: 'Meli',                  descricao: 'ADS Meli',                               valor: 651.30,   situacao: 'pago',     tipo: 'operacional' },
  { data: '20/02/2026', categoria: 'Meli',                  descricao: 'Tarifas de envios Full',                 valor: 264.23,   situacao: 'pago',     tipo: 'operacional' },
  { data: '20/02/2026', categoria: 'Meli',                  descricao: 'Tarifas do programa de afiliados',       valor: 98.01,    situacao: 'pago',     tipo: 'operacional' },
  { data: '20/02/2026', categoria: 'Meli',                  descricao: 'Tarifas da Minha Página',                valor: 99.00,    situacao: 'pago',     tipo: 'operacional' },
  { data: '20/02/2026', categoria: 'Reforma / Obras',       descricao: 'Obras',                                  valor: 300.00,   situacao: 'pago',     tipo: 'operacional' },
  { data: '20/02/2026', categoria: 'Infraestrutura',        descricao: 'Prateleira 3 de 10',                     valor: 300.00,   situacao: 'pago',     tipo: 'operacional' },
  { data: '20/02/2026', categoria: 'Transporte / Frete',    descricao: 'Corola',                                 valor: 400.00,   situacao: 'pago',     tipo: 'mensal_fixa' },
  { data: '21/02/2026', categoria: 'Transporte / Frete',    descricao: 'J3 Transportadora',                      valor: 467.61,   situacao: 'pendente', tipo: 'operacional' },
  { data: '25/02/2026', categoria: 'Transporte / Frete',    descricao: 'Frete Fornecedor Vitak',                 valor: 50.00,    situacao: 'pago',     tipo: 'operacional' },
  { data: '25/02/2026', categoria: 'Reforma / Obras',       descricao: 'Reforma (3/9)',                          valor: 355.00,   situacao: 'pago',     tipo: 'mensal_fixa' },

  // ── MARÇO 2026 ─────────────────────────────────────────────────────────────
  { data: '03/03/2026', categoria: 'Embalagens / Etiquetas', descricao: 'Leitor Código Barras / Saco Envelope 25x15 1000un', valor: 226.00, situacao: 'pago', tipo: 'operacional' },
  { data: '05/03/2026', categoria: 'Transporte Flex',       descricao: 'J3 Flex',                                valor: 469.60,   situacao: 'pago',     tipo: 'operacional' },
  { data: '06/03/2026', categoria: 'Transporte / Frete',    descricao: 'Coleta na porta',                        valor: 55.00,    situacao: 'pago',     tipo: 'operacional' },
  { data: '11/03/2026', categoria: 'Assinaturas',           descricao: 'Bling',                                  valor: 185.00,   situacao: 'pago',     tipo: 'mensal_fixa' },
  { data: '11/03/2026', categoria: 'Operador Logístico',    descricao: 'Despesa Operacional',                    valor: 2400.00,  situacao: 'pago',     tipo: 'operacional' },
  { data: '14/03/2026', categoria: 'Outros',                descricao: 'Entrega no full - gasolina / lanche',    valor: 180.00,   situacao: 'pago',     tipo: 'operacional' },
  { data: '14/03/2026', categoria: 'Outros',                descricao: 'EPI necessário para acesso ao Full',     valor: 120.00,   situacao: 'pago',     tipo: 'operacional' },
  { data: '18/03/2026', categoria: 'Contabilidade',         descricao: 'Contabilidade',                          valor: 300.00,   situacao: 'pago',     tipo: 'mensal_fixa' },
  { data: '19/03/2026', categoria: 'Impostos',              descricao: 'Imposto',                                valor: 9608.59,  situacao: 'pago',     tipo: 'operacional' },
  { data: '20/03/2026', categoria: 'Infraestrutura',        descricao: 'Prateleira 4 de 10',                     valor: 300.00,   situacao: 'pago',     tipo: 'operacional' },
  { data: '21/03/2026', categoria: 'Transporte Flex',       descricao: 'TD Fast - Flex',                         valor: 394.00,   situacao: 'pago',     tipo: 'operacional' },
  { data: '21/03/2026', categoria: 'Transporte / Frete',    descricao: 'Coleta na porta semanal 2x',             valor: 110.00,   situacao: 'pago',     tipo: 'operacional' },
  { data: '23/03/2026', categoria: 'Embalagens / Etiquetas', descricao: 'Embalagem 20x30 - 1000 unidades',       valor: 99.99,    situacao: 'pago',     tipo: 'operacional' },
  { data: '24/03/2026', categoria: 'Transporte Flex',       descricao: 'J3 Flex',                                valor: 201.82,   situacao: 'pago',     tipo: 'operacional' },
  { data: '25/03/2026', categoria: 'Reforma / Obras',       descricao: 'Reforma (4/9)',                          valor: 355.00,   situacao: 'pago',     tipo: 'mensal_fixa' },
  { data: '27/03/2026', categoria: 'Transporte / Frete',    descricao: 'Coleta Sr. Francisco 3x',                valor: 165.00,   situacao: 'pago',     tipo: 'operacional' },
  { data: '28/03/2026', categoria: 'Transporte / Frete',    descricao: 'Coleta Sr. Francisco 3x',                valor: 165.00,   situacao: 'pago',     tipo: 'operacional' },
  { data: '31/03/2026', categoria: 'Meli',                  descricao: 'Tarifas por campanha de publicidade',    valor: 410.92,   situacao: 'pago',     tipo: 'operacional' },
  { data: '31/03/2026', categoria: 'Meli',                  descricao: 'Tarifas do programa de afiliados',       valor: 79.64,    situacao: 'pago',     tipo: 'operacional' },
  { data: '31/03/2026', categoria: 'Meli',                  descricao: 'Tarifas de envios Full',                 valor: 223.20,   situacao: 'pago',     tipo: 'operacional' },

  // ── ABRIL 2026 ─────────────────────────────────────────────────────────────
  { data: '01/04/2026', categoria: 'Divisão de Lucros',     descricao: 'Pix na conta - Daniel',                  valor: 2000.00,  situacao: 'pago',     tipo: 'operacional' },
  { data: '01/04/2026', categoria: 'Divisão de Lucros',     descricao: 'Pix conta - Davi',                       valor: 2000.00,  situacao: 'pago',     tipo: 'operacional' },
  { data: '04/04/2026', categoria: 'Transporte / Frete',    descricao: 'Sr. Francisco',                          valor: 55.00,    situacao: 'pago',     tipo: 'operacional' },
  { data: '06/04/2026', categoria: 'Outros',                descricao: 'Compra emergencial de reposição',        valor: 138.18,   situacao: 'pago',     tipo: 'operacional' },
  { data: '07/04/2026', categoria: 'Operador Logístico',    descricao: 'Responsável por preparar e despachar produtos', valor: 2600.00, situacao: 'pago', tipo: 'operacional' },
  { data: '20/04/2026', categoria: 'Infraestrutura',        descricao: 'Prateleira 5 de 10',                     valor: 300.00,   situacao: 'pago',     tipo: 'operacional' },
  { data: '25/04/2026', categoria: 'Reforma / Obras',       descricao: 'Reforma (5/9)',                          valor: 355.00,   situacao: 'pago',     tipo: 'mensal_fixa' },

  // ── FUTURAS (pendentes) ────────────────────────────────────────────────────
  { data: '20/05/2026', categoria: 'Infraestrutura',        descricao: 'Prateleira 6 de 10',                     valor: 300.00,   situacao: 'pendente', tipo: 'operacional' },
  { data: '25/05/2026', categoria: 'Reforma / Obras',       descricao: 'Reforma (6/9)',                          valor: 355.00,   situacao: 'pendente', tipo: 'mensal_fixa' },
  { data: '20/06/2026', categoria: 'Infraestrutura',        descricao: 'Prateleira 7 de 10',                     valor: 300.00,   situacao: 'pendente', tipo: 'operacional' },
  { data: '25/06/2026', categoria: 'Reforma / Obras',       descricao: 'Reforma (7/9)',                          valor: 355.00,   situacao: 'pendente', tipo: 'mensal_fixa' },
  { data: '20/07/2026', categoria: 'Infraestrutura',        descricao: 'Prateleira 8 de 10',                     valor: 300.00,   situacao: 'pendente', tipo: 'operacional' },
  { data: '20/08/2026', categoria: 'Infraestrutura',        descricao: 'Prateleira 9 de 10',                     valor: 300.00,   situacao: 'pendente', tipo: 'operacional' },
  { data: '20/09/2026', categoria: 'Infraestrutura',        descricao: 'Prateleira 10 de 10',                    valor: 300.00,   situacao: 'pendente', tipo: 'operacional' },
];

// ─── Importação principal ──────────────────────────────────────────────────────

async function main() {
  console.log(`\n📦 Importando ${DESPESAS.length} despesas para fin_despesas...`);
  if (TENANT_ID) console.log(`   tenantId: ${TENANT_ID}`);
  else console.log('   tenantId: (nenhum)');

  const col = db.collection('fin_despesas');
  const now = Timestamp.now();

  // Firestore writeBatch suporta max 500 ops; dividimos em grupos
  let lote = db.batch();
  let count = 0;
  let total = 0;

  for (const item of DESPESAS) {
    const ref = col.doc();
    const doc = {
      data:        tsFromBR(item.data),
      tipo:        item.tipo,
      categoria:   item.categoria,
      fornecedor:  item.fornecedor || item.categoria,
      descricao:   item.descricao,
      valor:       normValor(item.valor),
      situacao:    normStatus(item.situacao),
      meioId:      null,
      compraId:    null,
      comprovante: null,
      uid:         UID_IMPORT,
      createdAt:   now,
      ...(TENANT_ID ? { tenantId: TENANT_ID } : {}),
    };

    lote.set(ref, doc);
    count++;
    total++;

    if (count === 499) {
      await lote.commit();
      console.log(`   ✓ Lote commitado (${total} docs)`);
      lote = db.batch();
      count = 0;
    }
  }

  if (count > 0) {
    await lote.commit();
    console.log(`   ✓ Lote final commitado (${total} docs)`);
  }

  console.log(`\n✅ Importação concluída! ${total} despesas gravadas em fin_despesas.\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Erro durante importação:', err.message);
  process.exit(1);
});
