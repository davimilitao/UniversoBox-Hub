/**
 * @file firebase.js
 * @module config
 * @description Inicialização única do Firebase Admin SDK. Prioriza arquivo JSON no disco
 *              (FIREBASE_SERVICE_ACCOUNT_PATH) para evitar falha de parse com JSON multilinha
 *              no .env; mantém alternativa via FIREBASE_SERVICE_ACCOUNT_JSON (uma linha ou
 *              JSON válido) e fallback para keys/firebase-service-account.json.
 * @version 1.0.0
 * @date 2026-03-31
 * @author UniversoLab
 *
 * @changelog
 *   1.0.0 — 2026-03-31 — Extraído de server.js; PATH antes de JSON inline; require() no .json.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

/**
 * Resolve FIREBASE_SERVICE_ACCOUNT_PATH: absoluto usa como está; relativo é relativo à pasta backend/.
 * @returns {string|null}
 */
function resolvedPathFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (raw == null || !String(raw).trim()) return null;
  const p = String(raw).trim();
  return path.isAbsolute(p) ? p : path.join(__dirname, '..', p);
}

/**
 * Carrega o objeto service account (mesmo formato do JSON da Google).
 * Ordem: arquivo (env PATH) → JSON.parse da env → arquivo padrão keys/...
 * @returns {Record<string, unknown>}
 */
function loadServiceAccount() {
  const fileFromEnv = resolvedPathFromEnv();
  if (fileFromEnv) {
    if (!fs.existsSync(fileFromEnv)) {
      console.error(
        `[ERROR] FIREBASE_SERVICE_ACCOUNT_PATH aponta para arquivo inexistente:\n  ${fileFromEnv}`
      );
      process.exit(1);
    }
    // require() carrega o .json já parseado — conteúdo multilinha (private_key) fica só no arquivo
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const fromFile = require(fileFromEnv);
    console.log('[INFO] Firebase Admin: credencial via FIREBASE_SERVICE_ACCOUNT_PATH');
    return fromFile;
  }

  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inline != null && String(inline).trim()) {
    const trimmed = String(inline).trim();
    try {
      const parsed = JSON.parse(trimmed);
      console.log('[INFO] Firebase Admin: credencial via FIREBASE_SERVICE_ACCOUNT_JSON');
      return parsed;
    } catch (e) {
      console.error(
        '[ERROR] FIREBASE_SERVICE_ACCOUNT_JSON inválido (JSON.parse falhou). ' +
          'Prefira FIREBASE_SERVICE_ACCOUNT_PATH=keys/firebase-service-account.json com JSON multilinha no arquivo.'
      );
      console.error(e.message);
      process.exit(1);
    }
  }

  const defaultPath = path.join(__dirname, '..', 'keys', 'firebase-service-account.json');
  if (!fs.existsSync(defaultPath)) {
    console.error(
      '\n[ERROR] Nenhuma credencial Firebase configurada.\n' +
        '  - Defina FIREBASE_SERVICE_ACCOUNT_PATH (ex.: keys/firebase-service-account.json), ou\n' +
        '  - FIREBASE_SERVICE_ACCOUNT_JSON em uma única linha JSON válida, ou\n' +
        `  - Crie o arquivo: ${defaultPath}\n`
    );
    process.exit(1);
  }
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const fallback = require(defaultPath);
  console.log('[INFO] Firebase Admin: credencial via keys/firebase-service-account.json (padrão)');
  return fallback;
}

const serviceAccount = loadServiceAccount();

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

module.exports = {
  admin,
  db,
  serviceAccount,
};
