// backend/scripts/normalize_bi_and_costs.js
// Standalone script to normalize BI sales intelligence documents and update product costs.
//
// Usage:
//   node scripts/normalize_bi_and_costs.js

'use strict';

require('dotenv').config();
const { db } = require('../config/firebase');

async function main() {
  console.log('\n🚀 Starting BI and Product Cost Normalization Script...\n');

  // 1. Fetch all products to build the initial cost map
  console.log('📦 Fetching products...');
  const productsSnap = await db.collection('products').get();
  console.log(`Found ${productsSnap.size} products.`);

  const costMap = new Map(); // SKU -> Cost
  
  productsSnap.forEach(doc => {
    const data = doc.data();
    const sku = doc.id;
    const cost = Number(data.precoCusto || data.preco_custo || 0);
    if (cost > 0) {
      costMap.set(sku, cost);
    }
  });

  // 2. Fetch all purchases from fin_compras to populate missing costs or find latest purchase cost
  console.log('\n🧾 Fetching purchases (fin_compras)...');
  const purchasesSnap = await db.collection('fin_compras').orderBy('createdAt', 'asc').get();
  console.log(`Found ${purchasesSnap.size} purchases.`);

  const purchaseCostUpdates = new Map(); // SKU -> Cost from purchase history
  purchasesSnap.forEach(doc => {
    const data = doc.data();
    const sku = String(data.sku || '').trim();
    const cost = Number(data.custoUnitario || 0);
    if (sku && cost > 0) {
      purchaseCostUpdates.set(sku, cost);
    }
  });

  // 3. Merge costs (purchase cost takes priority if it exists or updates products that lack cost)
  console.log('\n🔄 Resolving final product cost map...');
  let productsUpdatedCount = 0;
  
  // Create a batch to update products that lack cost but have purchases
  const productBatch = db.batch();
  
  for (const [sku, pCost] of purchaseCostUpdates.entries()) {
    const existingCost = costMap.get(sku) || 0;
    
    // If product has no cost in products collection, or the purchase history has a cost, we use it
    if (existingCost === 0 && pCost > 0) {
      costMap.set(sku, pCost);
      
      // Schedule product update in the database so it's persisted in catalog
      const productRef = db.collection('products').doc(sku);
      productBatch.set(productRef, { precoCusto: pCost }, { merge: true });
      productsUpdatedCount++;
    }
  }

  if (productsUpdatedCount > 0) {
    console.log(`Saving ${productsUpdatedCount} product catalog cost updates to products collection...`);
    await productBatch.commit();
    console.log('✅ Product catalog costs updated.');
  } else {
    console.log('No product catalog cost updates needed.');
  }

  console.log(`Final cost dictionary contains costs for ${costMap.size} unique SKUs.`);

  // 4. Fetch all sales_intelligence documents
  console.log('\n📊 Fetching sales_intelligence documents...');
  const salesSnap = await db.collection('sales_intelligence').get();
  console.log(`Found ${salesSnap.size} sales intelligence documents.`);

  let checkedDocs = 0;
  let updatedDocsCount = 0;
  let totalItemsUpdated = 0;
  
  // We process updates in batches of 500 (Firestore writeBatch limit)
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of salesSnap.docs) {
    const data = doc.data();
    let docUpdated = false;
    
    const items = data.itens || [];
    const newItems = items.map(item => {
      const sku = String(item.sku || '').trim();
      const currentCost = Number(item.precoCusto || 0);
      const correctCost = costMap.get(sku) || 0;

      if (correctCost > 0 && currentCost !== correctCost) {
        docUpdated = true;
        totalItemsUpdated++;
        return {
          ...item,
          precoCusto: correctCost
        };
      }
      return item;
    });

    if (docUpdated) {
      const docRef = db.collection('sales_intelligence').doc(doc.id);
      batch.update(docRef, {
        itens: newItems,
        normalizedAtMs: Date.now()
      });
      updatedDocsCount++;
      batchCount++;

      if (batchCount === 500) {
        console.log(`Submitting batch of 500 updates (Total updated: ${updatedDocsCount})...`);
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
    
    checkedDocs++;
  }

  // Commit remaining updates
  if (batchCount > 0) {
    console.log(`Submitting final batch of ${batchCount} updates...`);
    await batch.commit();
  }

  console.log('\n🎉 Normalization completed successfully!');
  console.log(`-----------------------------------------------`);
  console.log(`Products checked:             ${productsSnap.size}`);
  console.log(`Products catalog updated:     ${productsUpdatedCount}`);
  console.log(`Purchases scanned:            ${purchasesSnap.size}`);
  console.log(`BI documents checked:         ${checkedDocs}`);
  console.log(`BI documents updated:         ${updatedDocsCount}`);
  console.log(`Individual items normalized:  ${totalItemsUpdated}`);
  console.log(`-----------------------------------------------\n`);

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Error executing normalization script:', err);
  process.exit(1);
});
