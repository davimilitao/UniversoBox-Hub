require('dotenv').config();
const { db } = require('../config/firebase');
const fetch = require('node-fetch');

const BLING_API_BASE = 'https://api.bling.com.br/Api/v3';

async function debug() {
  const doc = await db.collection('bling_tokens').doc('main').get();
  const token = doc.data().accessToken;

  console.log('Listando /nfe...');
  try {
    const res = await fetch(`${BLING_API_BASE}/nfe?limite=3`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    console.log('Status da listagem:', res.status);
    const data = await res.json();
    console.log('Primeiros itens:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(e);
  }
}

debug().then(() => process.exit(0));
