/**
 * @file tenants.js
 * @module tenants
 * @description Rota pública GET /api/tenants — lista somente tenants ativos para o dropdown
 *              de login (Modelo B). Usa Admin SDK para não depender de auth no cliente nem expor
 *              dados sensíveis no JSON (apenas id + nome exibível).
 * @version 1.0.0
 * @date 2026-03-31
 * @author UniversoLab
 *
 * @changelog
 *   1.0.0 — 2026-03-31 — Lista pública mínima + Cache-Control para reduzir leituras Firestore.
 */

'use strict';

/**
 * Monta o rótulo seguro para o dropdown (nunca repassa o documento inteiro).
 * @param {string} docId
 * @param {Record<string, unknown>} data
 * @returns {string}
 */
function pickPublicName(docId, data) {
  const raw = data.name ?? data.displayName ?? docId;
  const s = String(raw ?? '').trim();
  return s || docId;
}

/**
 * @param {import('express').Application} app
 * @param {FirebaseFirestore.Firestore} db
 */
function setupTenantsPublicRoutes(app, db) {
  app.get('/api/tenants', async (req, res) => {
    try {
      // Cache curto no CDN/browser: evita hit no Firestore a cada re-render/interação no login
      res.set('Cache-Control', 'public, max-age=60');

      const snap = await db.collection('tenants').where('status', '==', 'active').get();

      const items = snap.docs.map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          name: pickPublicName(d.id, data),
        };
      });

      items.sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));

      // Contrato enxuto: apenas [ { id, name } ] — sem plan, members, tokens, etc.
      return res.json(items);
    } catch (err) {
      console.error('[GET /api/tenants]', err);
      return res.status(500).json({ error: 'Falha ao listar tenants' });
    }
  });
}

module.exports = { setupTenantsPublicRoutes };
