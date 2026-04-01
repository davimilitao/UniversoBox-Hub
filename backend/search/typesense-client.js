/**
 * search/typesense-client.js
 *
 * Camada de busca — Typesense (sprint 2)
 *
 * Para ativar:
 *   1. npm install typesense
 *   2. Configurar variáveis de ambiente (ver abaixo)
 *   3. Rodar: node search/typesense-client.js --reindex
 *      (importa todos os produtos do Firestore para o índice)
 *   4. Trocar USE_TYPESENSE = true no server.js
 *
 * Variáveis de ambiente necessárias:
 *   TYPESENSE_HOST     = sua-instancia.typesense.net   (ou IP do VPS)
 *   TYPESENSE_PORT     = 443   (cloud) ou 8108 (self-hosted)
 *   TYPESENSE_PROTOCOL = https (cloud) ou http (self-hosted)
 *   TYPESENSE_API_KEY  = chave de admin (gerada no painel ou no startup)
 */

'use strict';

const Typesense = require('typesense');

// ── Configuração ────────────────────────────────────────────────────
const COLLECTION = 'products';

const CLIENT_CONFIG = {
  nodes: [{
    host:     process.env.TYPESENSE_HOST     || 'localhost',
    port:     Number(process.env.TYPESENSE_PORT || 8108),
    protocol: process.env.TYPESENSE_PROTOCOL  || 'http',
  }],
  apiKey:            process.env.TYPESENSE_API_KEY || 'xyz',
  connectionTimeoutSeconds: 5,
};

// ── Schema do índice ────────────────────────────────────────────────
// Define quais campos são buscáveis, filtráveis e usados para ranking.
// Ao adicionar campos novos ao produto no Firestore, adicionar aqui também.
const SCHEMA = {
  name:                COLLECTION,
  enable_nested_fields: false,
  fields: [
    { name: 'sku',    type: 'string',  facet: false },
    { name: 'name',   type: 'string',  facet: false },  // campo principal de busca
    { name: 'marca',  type: 'string',  facet: true  },  // filtrável por marca
    { name: 'ean',    type: 'string',  facet: false, optional: true },
    { name: 'eanBox', type: 'string',  facet: false, optional: true },
    { name: 'bin',    type: 'string',  facet: false, optional: true },
    { name: 'image',  type: 'string',  facet: false, optional: true, index: false },
    { name: 'situacao', type: 'string', facet: true, optional: true },
    { name: 'updatedAtMs', type: 'int64', facet: false, optional: true },
  ],
  // Campos usados para busca textual, em ordem de peso
  // name tem peso 3x maior que marca
  default_sorting_field: 'updatedAtMs',
};

// ── Parâmetros de busca ─────────────────────────────────────────────
function buildSearchParams(q) {
  return {
    q,
    query_by:            'name,marca,ean,sku',
    query_by_weights:    '3,2,1,1',     // name tem mais peso
    prefix:              'true',         // "det" → "detergente"
    typo_tokens_threshold: 1,            // tolerância a 1 typo
    num_typos:           2,              // até 2 erros de digitação
    per_page:            20,
    sort_by:             '_text_match:desc',  // mais relevante primeiro
    // highlight_full_fields: 'name',    // opcional: retorna match highlighting
  };
}

// ── Classe principal ────────────────────────────────────────────────
class TypesenseSearch {
  constructor() {
    this.client = new Typesense.Client(CLIENT_CONFIG);
    this._ready = false;
  }

  async ensureCollection() {
    if (this._ready) return;
    try {
      await this.client.collections(COLLECTION).retrieve();
      this._ready = true;
    } catch (e) {
      if (e.httpStatus === 404) {
        await this.client.collections().create(SCHEMA);
        console.log('[Typesense] Collection criada:', COLLECTION);
        this._ready = true;
      } else {
        throw e;
      }
    }
  }

  /**
   * Busca produtos.
   * Retorna array no mesmo formato que searchViaFirestore() no server.js.
   */
  async search(q) {
    await this.ensureCollection();
    const result = await this.client
      .collections(COLLECTION)
      .documents()
      .search(buildSearchParams(q));

    return (result.hits || []).map(hit => hit.document);
  }

  /**
   * Upsert de um produto (criar ou atualizar no índice).
   * Chamado pela Cloud Function quando produto é criado/editado no Firestore.
   */
  async upsert(product) {
    await this.ensureCollection();
    const doc = toIndexDoc(product);
    await this.client
      .collections(COLLECTION)
      .documents()
      .upsert(doc);
  }

  /**
   * Remove produto do índice.
   * Chamado quando produto é deletado no Firestore.
   */
  async delete(sku) {
    await this.ensureCollection();
    try {
      await this.client.collections(COLLECTION).documents(sku).delete();
    } catch (e) {
      if (e.httpStatus !== 404) throw e;
    }
  }

  /**
   * Re-indexação completa.
   * Rodar manualmente quando necessário: node search/typesense-client.js --reindex
   */
  async reindexAll(db) {
    await this.ensureCollection();
    console.log('[Typesense] Iniciando re-indexação completa...');

    const snap = await db.collection('products').get();
    const docs  = snap.docs.map(d => toIndexDoc({ sku: d.id, ...d.data() }));

    // Importa em lotes de 100 (limite recomendado)
    const BATCH = 100;
    let count   = 0;
    for (let i = 0; i < docs.length; i += BATCH) {
      const batch = docs.slice(i, i + BATCH);
      await this.client
        .collections(COLLECTION)
        .documents()
        .import(batch, { action: 'upsert' });
      count += batch.length;
      console.log(`[Typesense] Indexados ${count}/${docs.length}`);
    }

    console.log('[Typesense] Re-indexação concluída:', count, 'produtos');
    return count;
  }
}

// ── Normaliza documento para o índice ───────────────────────────────
function toIndexDoc(p) {
  return {
    id:          String(p.sku),   // Typesense usa 'id' como chave primária
    sku:         String(p.sku    || ''),
    name:        String(p.name   || ''),
    marca:       String(p.marca  || ''),
    ean:         String(p.ean    || ''),
    eanBox:      String(p.eanBox || ''),
    bin:         String(p.bin    || ''),
    image:       String(p.image  || '/assets/placeholder.png'),
    situacao:    String(p.situacao || ''),
    updatedAtMs: Number(p.updatedAtMs || Date.now()),
  };
}

// ── Singleton exportado ─────────────────────────────────────────────
const TypesenseClient = new TypesenseSearch();
module.exports = { TypesenseClient, toIndexDoc };

// ── CLI: re-indexação manual ────────────────────────────────────────
// node search/typesense-client.js --reindex
if (require.main === module && process.argv.includes('--reindex')) {
  require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
  const admin = require('firebase-admin');
  // Inicializa Firebase se não estiver rodando dentro do server.js
  if (!admin.apps.length) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  const db = admin.firestore();
  TypesenseClient.reindexAll(db)
    .then(n => { console.log('Pronto:', n); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
}
