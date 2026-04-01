// scripts/clean_html_names.js v3
'use strict';
require('dotenv').config();
const fs    = require('fs');
const path  = require('path');
const admin = require('firebase-admin');

const SA_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
  path.join(__dirname, '..', 'keys', 'firebase-service-account.json');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(SA_PATH,'utf8'))) });
const db = admin.firestore();

// Remove TODO o HTML/CSS e retorna texto limpo
function stripHtml(str) {
  return (str || '')
    .replace(/<[^>]*>/g, '\n')          // tags viram quebra de linha
    .replace(/&[#a-z0-9]+;/gi, ' ')     // entidades HTML
    .replace(/[{};]/g, '\n')            // separadores CSS
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .join('\n');
}

// Detecta se uma linha parece um nome de produto real
// (tem letras, não é só CSS/propriedades)
function isRealName(line) {
  if (!line || line.length < 3) return false;
  // Descarta linhas que parecem CSS/HTML
  if (/^[a-z-]+\s*:/.test(line))   return false; // font-size: 16px
  if (/^--[a-z]/.test(line))       return false; // --bs-table-bg
  if (/^>/.test(line))             return false; // >
  if (/^</.test(line))             return false; // <tag
  if (/^\s*[\d.]+px/.test(line))   return false; // 16px
  if (/!important/.test(line))     return false; // margin: 0 !important
  if (/serif|sans-serif|monospace/.test(line) && !/produto|bebe|kit/i.test(line)) return false;
  // Precisa ter pelo menos 2 palavras OU ser um nome de produto reconhecível
  const words = line.split(/\s+/).filter(Boolean);
  return words.length >= 2 && /[a-zA-ZÀ-ú]{3,}/.test(line);
}

function hasHtml(str) {
  return /<|>|&[a-z]+;|font-|margin|padding|border|{|}|;|!important/i.test(str || '');
}

// Extrai o melhor nome possível de um campo sujo
function extractBestName(dirty) {
  const lines = stripHtml(dirty).split('\n').filter(Boolean);
  // Prefere a primeira linha que parece um nome real
  for (const line of lines) {
    if (isRealName(line)) return line.trim();
  }
  // Fallback: junta todas as linhas limpas e remove CSS
  const clean = lines
    .filter(l => !l.startsWith('--') && !/^[a-z-]+\s*:/.test(l) && l !== '>')
    .join(' ')
    .replace(/[<>{}:;]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean;
}

async function main() {
  console.log('Buscando produtos com HTML no nome...\n');
  const snap = await db.collection('products').get();
  let fixed = 0;
  let skipped = 0;

  const batches = [db.batch()];
  let batchCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (!hasHtml(data.name || '')) continue;

    const cleanName = extractBestName(data.name);

    if (!cleanName || cleanName.length < 3) {
      console.log(`[SKIP] ${doc.id} — nome ficaria vazio após limpeza`);
      console.log(`  ORIGINAL: ${(data.name||'').slice(0,60)}\n`);
      skipped++;
      continue;
    }

    console.log(`[FIX] ${doc.id}`);
    console.log(`  ANTES:  ${(data.name||'').slice(0,70).replace(/\n/g,' ')}`);
    console.log(`  DEPOIS: ${cleanName}\n`);

    batches[batches.length-1].update(doc.ref, { name: cleanName });
    fixed++;
    batchCount++;
    if (batchCount % 490 === 0) batches.push(db.batch());
  }

  if (fixed === 0 && skipped === 0) {
    console.log('✅ Nenhum produto com HTML encontrado!');
    process.exit(0);
  }

  if (fixed > 0) {
    console.log(`\nCorrigindo ${fixed} produtos...`);
    for (const b of batches) await b.commit();
  }

  console.log(`\n✅ Concluído! ${fixed} corrigidos, ${skipped} pulados.`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
