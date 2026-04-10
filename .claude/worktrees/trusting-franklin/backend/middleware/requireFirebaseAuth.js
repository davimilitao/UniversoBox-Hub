/**
 * @file requireFirebaseAuth.js
 * @module auth
 * @description Middleware Express que valida o Firebase ID Token (Bearer) e injeta
 *              identidade + tenant no request. Base para isolamento multi-tenant:
 *              o tenantId vem dos custom claims do token (nunca do body/query).
 * @version 1.1.0
 * @date 2026-03-31
 * @author UniversoLab
 *
 * @changelog
 *   1.0.0 — 2026-03-31 — Criação inicial. Substituição planejada do JWT manual
 *            (auth.js) por verificação server-side com firebase-admin.
 *   1.1.0 — 2026-03-31 — requireFirebaseRole(roles): autorização por claim `role` após requireFirebaseAuth.
 */

'use strict';

const admin = require('firebase-admin');

/**
 * Extrai o JWT do header Authorization no formato "Bearer <token>".
 * @param {import('express').Request} req
 * @returns {string|null} token ou null se ausente/malformado
 */
function extractBearerToken(req) {
  const raw = req.headers.authorization || req.headers.Authorization || '';
  if (typeof raw !== 'string' || !raw.startsWith('Bearer ')) {
    return null;
  }
  const token = raw.slice(7).trim();
  return token.length ? token : null;
}

/**
 * Middleware: exige Firebase ID Token válido e custom claim `tenantId`.
 *
 * Fluxo:
 * 1) Ler Bearer → 401 se não houver token
 * 2) verifyIdToken → 401 se inválido/expirado
 * 3) Exigir claim tenantId → 403 NO_TENANT_CLAIM se faltar
 * 4) req.auth = { uid, tenantId, role, email }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function requireFirebaseAuth(req, res, next) {
  // Etapa 1: obter string do header (única fonte confiável no wire)
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({
      error: 'Token ausente ou header Authorization inválido. Use: Authorization: Bearer <idToken>',
    });
  }

  try {
    // Etapa 2: validar assinatura, expiração e claims do Firebase (server-side)
    const decoded = await admin.auth().verifyIdToken(token);

    // Etapa 3: custom claim obrigatório para multi-tenancy — sem tenant não há contexto seguro
    const tenantId =
      decoded.tenantId != null && decoded.tenantId !== ''
        ? String(decoded.tenantId)
        : null;

    if (!tenantId) {
      return res.status(403).json({
        code: 'NO_TENANT_CLAIM',
        error:
          'Usuário sem tenantId nos custom claims do token. Provisione tenantId via setCustomUserClaims.',
      });
    }

    // Etapa 4: anexar contexto de auth para handlers (sempre filtrar Firestore por tenantId)
    req.auth = {
      uid: decoded.uid,
      tenantId,
      role: decoded.role != null ? String(decoded.role) : null,
      email: decoded.email != null ? String(decoded.email) : null,
    };

    return next();
  } catch (err) {
    // Erros típicos: token expirado, assinatura inválida, projeto errado, etc.
    const code = err && err.code ? String(err.code) : '';
    const isAuthFailure =
      code.startsWith('auth/') ||
      code === 'app/invalid-credential';

    if (isAuthFailure) {
      return res.status(401).json({
        error: 'Token inválido ou expirado',
        code: code || 'auth/invalid-token',
      });
    }

    console.error('[requireFirebaseAuth]', err);
    return res.status(500).json({ error: 'Falha ao validar autenticação' });
  }
}

/**
 * Deve ser usado **depois** de `requireFirebaseAuth` (precisa de req.auth.role).
 * Replica o comportamento do requireAuth(roles) legado com base no custom claim.
 * @param {string[]} allowedRoles
 * @returns {import('express').RequestHandler}
 */
function requireFirebaseRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!allowedRoles.length) return next();
    const role = req.auth && req.auth.role;
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'sem permissão' });
    }
    return next();
  };
}

module.exports = { requireFirebaseAuth, requireFirebaseRole, extractBearerToken };
