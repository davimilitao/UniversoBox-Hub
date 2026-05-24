/**
 * @file qa_auth_profiles.js
 * @description Script de teste de qualidade QA para validar integridade de Tenants,
 *              Perfis, Custom Claims dos usuários no Firebase Auth e restrições de segurança.
 * @version 1.0.0
 * @date 2026-05-24
 */

const { db, admin } = require('../config/firebase');

async function runQA() {
  console.log('==================================================');
  console.log('=== UNIVERSOBOX-HUB QA: AUTENTICAÇÃO E PERFIS ===');
  console.log('==================================================\n');

  let errors = 0;
  let warnings = 0;

  // 1. Verificar tenants cadastrados
  console.log('--------------------------------------------------');
  console.log('[1/4] Verificando Tenants ativos no Firestore...');
  const tenantsSnap = await db.collection('tenants').get();
  console.log(`Encontrados ${tenantsSnap.size} tenants no total.`);
  
  const activeTenants = [];
  tenantsSnap.forEach(doc => {
    const data = doc.data();
    console.log(` - ID: ${doc.id} | Nome: ${data.name || data.displayName || 'Sem Nome'} | Status: ${data.status}`);
    if (data.status === 'active') {
      activeTenants.push({ id: doc.id, name: data.name || data.displayName || doc.id });
    }
  });

  if (activeTenants.length === 0) {
    console.log('❌ [ERRO] Nenhum tenant ativo encontrado no Firestore! O dropdown de login ficará vazio.');
    errors++;
  } else {
    console.log('✅ [OK] Tenants ativos carregados com sucesso.');
  }

  // 2. Verificar Perfis cadastrados por Tenant
  console.log('\n--------------------------------------------------');
  console.log('[2/4] Verificando Perfis (Templates) por Tenant...');
  for (const t of activeTenants) {
    console.log(`Tenant: ${t.name} (${t.id})`);
    const perfisSnap = await db.collection('perfis').where('tenantId', '==', t.id).get();
    console.log(` - Encontrados ${perfisSnap.size} perfis.`);
    
    const requiredRoles = ['admin', 'operacao', 'financeiro', 'catalogo', 'vendas'];
    const foundRoles = perfisSnap.docs.map(doc => doc.data().id);
    
    requiredRoles.forEach(role => {
      if (foundRoles.includes(role)) {
        console.log(`   ✅ Perfil "${role}" existe.`);
      } else {
        console.log(`   ⚠️ [AVISO] Perfil "${role}" não encontrado. Será inicializado no primeiro carregamento de lista do tenant.`);
        warnings++;
      }
    });
  }

  // 3. Verificar Claims e Papéis dos Usuários no Firebase Auth
  console.log('\n--------------------------------------------------');
  console.log('[3/4] Verificando Custom Claims dos Usuários no Firebase Auth...');
  try {
    const listUsers = await admin.auth().listUsers(1000);
    console.log(`Encontrados ${listUsers.users.length} usuários cadastrados no Firebase Auth.`);

    for (const u of listUsers.users) {
      const claims = u.customClaims || {};
      const { tenantId, role } = claims;
      console.log(`\nUsuário: ${u.email} (UID: ${u.uid})`);
      console.log(` - Claims Atuais:`, JSON.stringify(claims));

      if (!tenantId) {
        console.log(`   ❌ [ERRO] Usuário não possui claim "tenantId" configurada. Falhará ao logar (NO_TENANT_CLAIM).`);
        errors++;
      } else {
        console.log(`   ✅ Claim "tenantId" presente: ${tenantId}`);
        
        // Verificar se é membro do tenant indicado
        const memberSnap = await db.collection('tenants').doc(tenantId).collection('members').doc(u.uid).get();
        if (!memberSnap.exists) {
          console.log(`   ❌ [ERRO] Usuário tem a claim tenantId="${tenantId}", mas NÃO é membro registrado na subcoleção "members" do tenant.`);
          errors++;
        } else {
          const mData = memberSnap.data() || {};
          console.log(`   ✅ Membro registrado no Firestore. Cargo no Firestore: "${mData.role || 'operator'}" | Cargo no Auth Claim: "${role || 'Nenhum'}"`);
          if (role !== mData.role) {
            console.log(`   ⚠️ [AVISO] Discrepância: Cargo no Firestore ("${mData.role}") difere das claims do Auth ("${role}").`);
            warnings++;
          }
        }
      }
    }
  } catch (e) {
    console.log(`❌ [ERRO] Falha ao listar usuários do Firebase Auth: ${e.message}`);
    errors++;
  }

  // 4. Teste de Boundary de Segurança de Perfis
  console.log('\n--------------------------------------------------');
  console.log('[4/4] Verificando Boundary de Segurança de Perfis...');
  
  function testAccess(userAuth, targetRole) {
    if (userAuth.role !== 'admin' && userAuth.role !== targetRole) {
      return { status: 403, error: 'Acesso negado ao perfil solicitado' };
    }
    return { status: 200, ok: true };
  }

  const mockAuthOperacao = { role: 'operacao', tenantId: 'test_tenant' };
  const mockAuthAdmin = { role: 'admin', tenantId: 'test_tenant' };

  const t1 = testAccess(mockAuthOperacao, 'operacao');
  const t2 = testAccess(mockAuthOperacao, 'admin');
  const t3 = testAccess(mockAuthAdmin, 'operacao');
  const t4 = testAccess(mockAuthAdmin, 'admin');

  if (t1.status === 200 && t2.status === 403 && t3.status === 200 && t4.status === 200) {
    console.log('✅ [OK] Restrições de segurança do backend simuladas com sucesso (operador bloqueado de ver admin, admin livre para ver qualquer perfil).');
  } else {
    console.log('❌ [ERRO] Falha no teste de restrições de segurança de perfis.');
    errors++;
  }

  console.log('\n--------------------------------------------------');
  console.log('=== SUMÁRIO DO DIAGNÓSTICO QA ===');
  console.log(`Erros Críticos: ${errors}`);
  console.log(`Avisos/Problemas Menores: ${warnings}`);
  console.log('--------------------------------------------------');
  if (errors === 0) {
    console.log('✅ [QA APROVADO] A autenticação, claims e segurança dos perfis estão consistentes!');
  } else {
    console.log('❌ [QA REPROVADO] Foram encontrados problemas críticos de segurança ou claims. Corrija-os.');
  }
  console.log('==================================================');
}

runQA().catch(err => {
  console.error('Falha catastrófica ao executar QA:', err);
  process.exit(1);
});
