/**
 * search/sync-function.js
 *
 * Cloud Function — sincronização automática Firestore → Typesense
 *
 * Deploy (sprint 2):
 *   firebase deploy --only functions:onProductWrite
 *
 * O que faz:
 *   - Produto criado no Firestore → adiciona no Typesense
 *   - Produto editado no Firestore → atualiza no Typesense
 *   - Produto deletado no Firestore → remove do Typesense
 *
 * Não precisa mexer no server.js para deploy desta function.
 * Ela roda de forma independente no Firebase Functions.
 */

'use strict';

const functions  = require('firebase-functions');
const { TypesenseClient, toIndexDoc } = require('./typesense-client');

/**
 * Trigger: qualquer escrita na coleção 'products'
 * Roda automaticamente, sem intervenção manual
 */
exports.onProductWrite = functions
  .runWith({ timeoutSeconds: 30, memory: '256MB' })
  .firestore
  .document('products/{sku}')
  .onWrite(async (change, context) => {
    const sku = context.params.sku;

    try {
      // Produto deletado
      if (!change.after.exists) {
        console.log(`[sync] DELETE sku=${sku}`);
        await TypesenseClient.delete(sku);
        return;
      }

      // Produto criado ou editado
      const data = change.after.data();
      console.log(`[sync] UPSERT sku=${sku}`);
      await TypesenseClient.upsert({ sku, ...data });

    } catch (err) {
      // Não lança — uma falha de sync não deve derrubar o Firestore
      // O safety net de re-indexação diária vai corrigir inconsistências
      console.error(`[sync] Erro ao sincronizar sku=${sku}:`, err.message);
    }
  });

/**
 * Trigger agendado: re-indexação diária às 3h (safety net)
 * Garante que o índice está sempre consistente com o Firestore,
 * mesmo que algum evento de sync tenha falhado silenciosamente
 */
exports.dailyReindex = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .pubsub
  .schedule('0 3 * * *')         // todo dia às 3h da manhã
  .timeZone('America/Sao_Paulo')
  .onRun(async () => {
    const admin = require('firebase-admin');
    if (!admin.apps.length) admin.initializeApp();
    const db = admin.firestore();
    console.log('[dailyReindex] Iniciando re-indexação de segurança...');
    await TypesenseClient.reindexAll(db);
    console.log('[dailyReindex] Concluída');
  });
