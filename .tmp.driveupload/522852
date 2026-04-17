/**
 * @file tenantProvisioning.js
 * @module auth
 * @description Rota POST /auth/provision: associa o usuário autenticado (Firebase ID Token)
 *              a um tenant pré-cadastrado, gravando custom claims (tenantId + role) e log de auditoria.
 *              Único fluxo em que o client envia tenantId no body — validação server-side obrigatória.
 * @version 1.0.0
 * @date 2026-03-31
 * @author UniversoLab
 *
 * @changelog
 *   1.0.0 — 2026-03-31 — Criação inicial para provisionamento multi-tenant via Firestore + custom claims.
 */

'use strict';

const admin = require('firebase-admin');
const { extractBearerToken } = require('../middleware/requireFirebaseAuth');

/**
 * Extrai e valida o Firebase ID Token sem exigir custom claim tenantId (primeiro login / provisionamento).
 * @param {import('express').Request} req
 * @returns {Promise<admin.auth.DecodedIdToken>}
 */
async function verifyIdTokenOnly(req) {
  const token = extractBearerToken(req);
  if (!token) {
    const err = new Error('TOKEN_MISSING');
    err.statusCode = 401;
    throw err;
  }
  return admin.auth().verifyIdToken(token);
}

/**
 * Registra POST /auth/provision no app Express.
 * @param {import('express').Application} app
 * @param {FirebaseFirestore.Firestore} db
 */
function setupTenantProvisioningRoutes(app, db) {
  app.post('/auth/provision', async (req, res) => {
    try {
      // Etapa 1: validar ID Token (identidade Firebase) — sem requireFirebaseAuth (claim tenantId ainda não existe)
      let decoded;
      try {
        decoded = await verifyIdTokenOnly(req);
      } catch (e) {
        if (e && e.message === 'TOKEN_MISSING') {
          return res.status(401).json({ error: 'Token ausente. Envie Authorization: Bearer <idToken>' });
        }
        const code = e && e.code ? String(e.code) : '';
        if (code.startsWith('auth/')) {
          return res.status(401).json({ error: 'Token inválido ou expirado', code });
        }
        console.error('[/auth/provision] verifyIdToken', e);
        return res.status(500).json({ error: 'Falha ao validar token' });
      }

      const uid = decoded.uid;

      // Etapa 2: tenantId vindo do body — única exceção permitida; ainda assim checamos Firestore antes de confiar
      const tenantIdRaw = req.body && req.body.tenantId != null ? String(req.body.tenantId).trim() : '';
      if (!tenantIdRaw) {
        return res.status(400).json({ error: 'tenantId é obrigatório no body' });
      }

      // Etapa 3: documento do tenant deve existir
      const tenantRef = db.collection('tenants').doc(tenantIdRaw);
      const tenantSnap = await tenantRef.get();
      if (!tenantSnap.exists) {
        return res.status(403).json({ error: 'Tenant não encontrado', code: 'TENANT_NOT_FOUND' });
      }

      // Etapa 4: usuário deve estar pré-registrado como membro desse tenant
      const memberRef = tenantRef.collection('members').doc(uid);
      const memberSnap = await memberRef.get();
      if (!memberSnap.exists) {
        return res.status(403).json({ error: 'Usuário não é membro deste tenant', code: 'NOT_A_MEMBER' });
      }

      const memberData = memberSnap.data() || {};
      // role vem do cadastro do membro — fallback seguro para operador
      const role =
        typeof memberData.role === 'string' && memberData.role.trim()
          ? memberData.role.trim()
          : 'operator';

      // Etapa 5: persistir claims no Firebase Auth (cliente deve chamar getIdToken(true) depois)
      await admin.auth().setCustomUserClaims(uid, { tenantId: tenantIdRaw, role });

      // Etapa 6: auditoria na subcoleção do tenant (rastreabilidade multi-tenant)
      // Subcoleção audit_logs: um documento por evento (append-only); alinhado ao firestore.rules
      await tenantRef.collection('audit_logs').add({
        action: 'tenant_provision',
        uid,
        tenantId: tenantIdRaw,
        role,
        email: decoded.email || null,
        createdAtMs: Date.now(),
        ip: req.ip || null,
        userAgent: (req.headers['user-agent'] || '').slice(0, 512) || null,
      });

      return res.json({
        success: true,
        tenantId: tenantIdRaw,
        requireTokenRefresh: true,
      });
    } catch (err) {
      console.error('[/auth/provision]', err);
      return res.status(500).json({ error: 'Erro ao provisionar tenant' });
    }
  });
}

module.exports = { setupTenantProvisioningRoutes };
