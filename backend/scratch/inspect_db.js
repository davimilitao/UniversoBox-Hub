require('dotenv').config();
const { db } = require('../config/firebase');

async function inspect() {
  console.log('--- INSPECTING FIRESTORE ---');
  
  // 1. Root Orders
  const ordersSnap = await db.collection('orders').limit(10).get();
  console.log(`\nRoot Orders total in snap (limit 10): ${ordersSnap.size}`);
  ordersSnap.forEach(doc => {
    const data = doc.data();
    console.log(`- Order: ${doc.id} | Status: ${data.status} | Logistica: ${data.logistica} | Cliente: ${data.clienteNome} | Tenant: ${data.tenantId}`);
  });
}

inspect().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
