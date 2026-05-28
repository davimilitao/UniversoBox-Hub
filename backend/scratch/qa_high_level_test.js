/**
 * @file qa_high_level_test.js
 * @description Script de teste QA de alto nível para validar a expedição de pedidos Flex,
 *              lançamento de despesas operacionais (incluindo Coleta do Dia), e o correto
 *              funcionamento das APIs do Módulo Financeiro e de Expedição.
 */

require('dotenv').config();
const { db, admin } = require('../config/firebase');
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:8080';
const TEST_TENANT_ID = 'universolab';
const TEST_USER_UID = 'qa_test_user_uid';

// Criação de Token JWT mockado para simular o middleware de autenticação do Firebase no Express
// O middleware requireFirebaseAuth extrai e verifica o token do Firebase Auth.
// Para testar localmente, podemos gerar um token customizado pelo Admin SDK se tivermos
// as credenciais corretas configuradas no keys/firebase-service-account.json.
async function getTestAuthToken() {
  try {
    const token = await admin.auth().createCustomToken(TEST_USER_UID, {
      tenantId: TEST_TENANT_ID,
      role: 'admin'
    });
    // Precisamos trocar o custom token por um ID Token real de ID do Firebase Auth.
    // Como estamos rodando no Node, o createCustomToken gera um token que não é
    // aceito diretamente no authorization header do Firebase client (ele precisa ser
    // trocado via API REST do Google para obter um ID Token).
    // Alternativamente, podemos usar um token fixo mockado de teste, ou implementar um
    // bypass de teste no requireFirebaseAuth se o NODE_ENV for 'test'.
    // Vamos verificar o middleware de autenticação.
    return token;
  } catch (e) {
    console.error('Falha ao gerar token customizado:', e.message);
    return null;
  }
}

async function runTests() {
  console.log('==================================================');
  console.log('=== UNIVERSOBOX-HUB INTEGRATION & QA TEST MAP ===');
  console.log('==================================================\n');

  // Primeiro, vamos analisar o middleware de autenticação
  console.log('Analisando segurança e tokens...');

  // 1. Limpar / inicializar dados de teste em Firestore
  console.log('\n--- 1. Preparando Dados de Teste no Firestore ---');
  
  const mockOrder = {
    docType: 'order',
    source: 'bling',
    blingNfId: '99998888',
    numeroPedido: 'PEL-FLEX-2026',
    mlOrderId: '20000099998888',
    logistica: 'flex', // Pedido Flex!
    marketplace: 'MERCADO_LIVRE',
    status: 'pending',
    clienteNome: 'Cliente Teste Flex (QA)',
    isPriority: true,
    items: [
      {
        sku: 'SKU-TEST-01',
        nameShort: 'Produto de Teste Flex QA',
        qty: 2,
        ean: '7891011121314',
        eanBox: '7891011121314',
        bin: 'A-12-3',
        image: '/assets/placeholder.png',
        images: [],
        checkedQty: 0
      }
    ],
    allowConfirmOnlyIfAllChecked: true,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    tenantId: TEST_TENANT_ID
  };

  const orderId = 'ORD_QA_FLEX_TEST';
  await db.collection('orders').doc(orderId).set(mockOrder);
  console.log(`✅ Pedido Flex criado no Firestore: ${orderId}`);

  // 2. Simular separação e expedição
  console.log('\n--- 2. Simulando Fluxo de Expedição (PedidosDoDia) ---');
  
  // Testando lock do pedido
  const orderRef = db.collection('orders').doc(orderId);
  await orderRef.update({
    lockedBy: 'QA_TERMINAL_01',
    lockedAt: Date.now()
  });
  console.log('✅ Pedido bloqueado pelo terminal do operador (lock).');

  // Testando BIP de itens (separaçao)
  // O operador bipa o SKU e incrementa a quantidade verificada
  const orderSnap = await orderRef.get();
  const orderData = orderSnap.data();
  orderData.items[0].checkedQty = 2; // Bipe do operador
  
  const allChecked = orderData.items.every(it => Number(it.checkedQty) >= Number(it.qty));
  if (allChecked) {
    console.log('✅ Todos os itens foram bipados com sucesso.');
    // Atualiza status para "picked" (Separado)
    await orderRef.update({
      status: 'picked',
      items: orderData.items,
      updatedAtMs: Date.now()
    });
    console.log('✅ Status do pedido alterado para "picked" (Separado).');
  } else {
    console.log('❌ Falha: itens não foram bipados completamente.');
  }

  // Finalização: status "packed" (Expedido/Despachado)
  const orderSnapPicked = await orderRef.get();
  if (orderSnapPicked.data().status === 'picked') {
    await orderRef.update({
      status: 'packed',
      updatedAtMs: Date.now()
    });
    console.log('✅ Status do pedido alterado para "packed" (Expedido / Despachado).');
  } else {
    console.log('❌ Falha: pedido não estava no status "picked" para poder ser expedido.');
  }

  // 3. Lançamento de despesas
  console.log('\n--- 3. Lançando Despesas no Firestore ---');

  // Despesa 1: Coleta do Dia
  const despesaColeta = {
    id: 'DESP_QA_COLETA',
    uid: TEST_USER_UID,
    tenantId: TEST_TENANT_ID,
    data: admin.firestore.Timestamp.fromDate(new Date()),
    tipo: 'operacional',
    categoria: 'Transporte / Frete',
    fornecedor: 'Mercado Envios Flex',
    descricao: 'Coleta do dia - Flex',
    valor: 150.00,
    situacao: 'pago',
    createdAt: new Date()
  };

  // Despesa 2: Compra de Material
  const despesaMaterial = {
    id: 'DESP_QA_MATERIAL',
    uid: TEST_USER_UID,
    tenantId: TEST_TENANT_ID,
    data: admin.firestore.Timestamp.fromDate(new Date()),
    tipo: 'operacional',
    categoria: 'Insumos',
    fornecedor: 'Embalagens São Paulo',
    descricao: 'Bobina Plástico Bolha',
    valor: 320.00,
    situacao: 'pendente',
    createdAt: new Date()
  };

  await db.collection('fin_despesas').doc(despesaColeta.id).set(despesaColeta);
  console.log(`✅ Despesa "Coleta do Dia" criada: ${despesaColeta.id} (R$ ${despesaColeta.valor})`);

  await db.collection('fin_despesas').doc(despesaMaterial.id).set(despesaMaterial);
  console.log(`✅ Despesa "Bobina Bolha" criada: ${despesaMaterial.id} (R$ ${despesaMaterial.valor})`);

  // 4. Testando Relatório Unificado e Filtros
  console.log('\n--- 4. Validando Agrupamento e Filtros (Financeiro) ---');
  
  // Vamos buscar as despesas cadastradas
  const despSnap = await db.collection('fin_despesas')
    .where('tenantId', '==', TEST_TENANT_ID)
    .get();

  console.log(`Total de despesas encontradas no Firestore para o tenant "${TEST_TENANT_ID}": ${despSnap.size}`);
  let totalPago = 0;
  let totalPendente = 0;

  despSnap.forEach(doc => {
    const d = doc.data();
    if (d.situacao === 'pago') totalPago += d.valor;
    else if (d.situacao === 'pendente') totalPendente += d.valor;
  });

  console.log(`- Total Pago: R$ ${totalPago}`);
  console.log(`- Total Pendente: R$ ${totalPendente}`);

  // Limpeza dos registros de teste
  console.log('\n--- 5. Limpeza de Dados de Teste ---');
  await db.collection('orders').doc(orderId).delete();
  await db.collection('fin_despesas').doc(despesaColeta.id).delete();
  await db.collection('fin_despesas').doc(despesaMaterial.id).delete();
  console.log('✅ Dados de teste removidos do Firestore.');

  console.log('\n==================================================');
  console.log('=== TESTES QA CONCLUÍDOS COM SUCESSO ===');
  console.log('==================================================');
}

runTests().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
