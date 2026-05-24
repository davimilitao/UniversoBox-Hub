const express = require('express');
const router = express.Router();
const { db, admin } = require('../config/firebase');
const { requireFirebaseAuth } = require('../middleware/requireFirebaseAuth');

// GET /api/perfis - List all profiles
router.get('/perfis', requireFirebaseAuth, async (req, res, next) => {
  try {
    const tenantId = req.auth.tenantId;
    const snap = await db.collection('perfis').where('tenantId', '==', tenantId).get();
    let perfis = snap.docs.map(doc => ({ id: doc.data().id, ...doc.data() }));

    if (perfis.length === 0) {
      // Initialize default profiles for this tenant
      const defaults = [
        { id: 'admin', nome: 'Super Admin', avatar: 'SA', cor: '#8b5cf6', tema: 'dark', modulos: ['pedidos', 'bling', 'financas', 'index', 'config'], tenantId },
        { id: 'operacao', nome: 'Operação', avatar: 'OP', cor: '#3b82f6', tema: 'dark', modulos: ['pedidos', 'bling', 'index'], tenantId },
        { id: 'financeiro', nome: 'Financeiro', avatar: 'FI', cor: '#10b981', tema: 'dark', modulos: ['financas', 'index'], tenantId },
        { id: 'catalogo', nome: 'Catálogo', avatar: 'CT', cor: '#f59e0b', tema: 'dark', modulos: ['index'], tenantId },
        { id: 'vendas', nome: 'Vendas', avatar: 'VE', cor: '#ec4899', tema: 'dark', modulos: ['index'], tenantId }
      ];
      
      const batch = db.batch();
      defaults.forEach(p => {
        const ref = db.collection('perfis').doc(`${tenantId}_${p.id}`);
        batch.set(ref, p);
      });
      await batch.commit();
      perfis = defaults;
    }
    
    res.json({ perfis });
  } catch (err) {
    console.error('[GET /api/perfis]', err);
    next(err);
  }
});

// GET /api/perfis/:role - Get specific profile config
router.get('/perfis/:role', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { role } = req.params;
    const tenantId = req.auth.tenantId;
    const doc = await db.collection('perfis').doc(`${tenantId}_${role}`).get();
    if (doc.exists) {
      res.json(doc.data());
    } else {
      const DEFAULT_MODULOS = {
        admin:      ['pedidos', 'bling', 'financas', 'index', 'config'],
        operacao:   ['pedidos', 'bling', 'index'],
        financeiro: ['financas', 'index'],
        catalogo:   ['index'],
        vendas:     ['index'],
      };
      const names = { admin: 'Super Admin', operacao: 'Operação', financeiro: 'Financeiro', catalogo: 'Catálogo', vendas: 'Vendas' };
      const colors = { admin: '#8b5cf6', operacao: '#3b82f6', financeiro: '#10b981', catalogo: '#f59e0b', vendas: '#ec4899' };
      
      res.json({
        id: role,
        nome: names[role] || role,
        avatar: role.slice(0, 2).toUpperCase(),
        cor: colors[role] || '#10b981',
        tema: 'dark',
        modulos: DEFAULT_MODULOS[role] || DEFAULT_MODULOS.admin,
        tenantId
      });
    }
  } catch (err) {
    console.error('[GET /api/perfis/:role]', err);
    next(err);
  }
});

// POST /api/perfis - Create a new profile
router.post('/perfis', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { id, nome, tema, modulos } = req.body;
    const tenantId = req.auth.tenantId;
    if (!id || !nome) return res.status(400).json({ error: 'id e nome obrigatórios' });

    const docId = `${tenantId}_${id}`;
    const ref = db.collection('perfis').doc(docId);
    const snap = await ref.get();
    if (snap.exists) return res.status(400).json({ error: 'Perfil já existe' });

    const payload = {
      id,
      nome,
      avatar: id.slice(0, 2).toUpperCase(),
      cor: '#10b981',
      tema: tema || 'dark',
      modulos: modulos || [],
      tenantId
    };
    await ref.set(payload);
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/perfis]', err);
    next(err);
  }
});

// PUT /api/perfis/:id - Update profile config
router.put('/perfis/:id', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nome, avatar, cor, tema, modulos } = req.body;
    const tenantId = req.auth.tenantId;

    const docId = `${tenantId}_${id}`;
    const ref = db.collection('perfis').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Perfil não encontrado' });

    const payload = {
      nome: nome !== undefined ? nome : snap.data().nome,
      avatar: avatar !== undefined ? avatar : snap.data().avatar,
      cor: cor !== undefined ? cor : snap.data().cor,
      tema: tema !== undefined ? tema : snap.data().tema,
      modulos: modulos !== undefined ? modulos : snap.data().modulos,
    };
    await ref.update(payload);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PUT /api/perfis/:id]', err);
    next(err);
  }
});

// DELETE /api/perfis/:id - Delete a profile
router.delete('/perfis/:id', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.auth.tenantId;
    if (id === 'admin') return res.status(400).json({ error: 'Não é possível deletar o perfil admin' });

    const docId = `${tenantId}_${id}`;
    await db.collection('perfis').doc(docId).delete();
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/perfis/:id]', err);
    next(err);
  }
});

// GET /api/users - List users in the same tenantId
router.get('/users', requireFirebaseAuth, async (req, res, next) => {
  try {
    if (req.auth.role !== 'admin') {
      return res.status(403).json({ error: 'Exige perfil admin' });
    }

    const listResult = await admin.auth().listUsers(1000);
    const tenantId = req.auth.tenantId;

    const filteredUsers = listResult.users
      .filter(u => u.customClaims?.tenantId === tenantId)
      .map(u => ({
        uid: u.uid,
        email: u.email,
        displayName: u.displayName || u.email.split('@')[0],
        lastSignIn: u.metadata.lastSignInTime,
        role: u.customClaims?.role || null,
      }));

    res.json({ users: filteredUsers });
  } catch (err) {
    console.error('[GET /api/users]', err);
    next(err);
  }
});

// PATCH /api/users/:uid/role - Update user role claim
router.patch('/users/:uid/role', requireFirebaseAuth, async (req, res, next) => {
  try {
    if (req.auth.role !== 'admin') {
      return res.status(403).json({ error: 'Exige perfil admin' });
    }

    const { uid } = req.params;
    const { role } = req.body;
    const tenantId = req.auth.tenantId;

    const user = await admin.auth().getUser(uid);
    if (user.customClaims?.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Usuário não pertence ao seu tenant' });
    }

    const newClaims = {
      ...user.customClaims,
      role: role || null
    };

    await admin.auth().setCustomUserClaims(uid, newClaims);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/users/:uid/role]', err);
    next(err);
  }
});

// GET /api/bling/config - Get Bling API Integration Config & Status
router.get('/bling/config', requireFirebaseAuth, async (req, res, next) => {
  try {
    const configDoc = await db.collection('config').doc('bling').get();
    const configData = configDoc.exists ? configDoc.data() : { active: false };

    const tokenDoc = await db.collection('bling_tokens').doc('main').get();
    const authorized = tokenDoc.exists;
    const tokenData = tokenDoc.exists ? tokenDoc.data() : null;

    res.json({
      active: configData.active ?? false,
      clientId: process.env.BLING_CLIENT_ID || '',
      redirectUri: process.env.BLING_REDIRECT_URI || '',
      authorized,
      updatedAtMs: configData.updatedAtMs || null,
      tokenUpdatedAtMs: tokenData?.updatedAtMs || null,
      tokenExpiresAt: tokenData?.expiresAt || null,
    });
  } catch (err) {
    console.error('[GET /api/bling/config]', err);
    next(err);
  }
});

// POST /api/bling/config - Update Bling API Integration Config
router.post('/bling/config', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { active } = req.body;
    if (active === undefined) {
      return res.status(400).json({ error: 'Campo active é obrigatório' });
    }

    const payload = {
      active: !!active,
      updatedAtMs: Date.now(),
      updatedBy: req.auth.uid,
    };

    await db.collection('config').doc('bling').set(payload, { merge: true });
    res.json({ ok: true, active: payload.active });
  } catch (err) {
    console.error('[POST /api/bling/config]', err);
    next(err);
  }
});

module.exports = router;

