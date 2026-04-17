/**
 * @file firebase.js
 * @module auth
 * @description Inicialização do Firebase (Auth + Firestore) para o SPA.
 *              Configuração via variáveis VITE_* (Console Firebase → Project settings).
 * @version 1.0.0
 * @date 2026-03-31
 * @author UniversoLab
 *
 * @changelog
 *   1.0.0 — 2026-03-31 — Criação inicial para LoginPage e listagem de tenants.
 */

import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasClientConfig = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

export const firebaseApp = !hasClientConfig
  ? null
  : getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApps()[0];

export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;

export function isFirebaseClientReady() {
  return Boolean(firebaseApp && auth && db);
}
