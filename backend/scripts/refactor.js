const fs = require('fs');
const path = require('path');

const serverJsPath = path.join(__dirname, '../server.js');
let code = fs.readFileSync(serverJsPath, 'utf8');

console.log('Original server.js length:', code.length);

// 1. Find and extract the etiqueta-bin route
const etiquetaBinStartMarker = '// ── ZPL Etiqueta de Prateleira (bin label) → QZ Tray ─────────────';
const etiquetaBinEndMarker = '  } catch(e) {\r\n    console.error(\'[POST /orders/:id/etiqueta-bin]\', e);\r\n    res.status(500).json({ error: e.message });\r\n  }\r\n});';
const etiquetaBinEndMarkerLF = '  } catch(e) {\n    console.error(\'[POST /orders/:id/etiqueta-bin]\', e);\n    res.status(500).json({ error: e.message });\n  }\n});';

let startIndex = code.indexOf(etiquetaBinStartMarker);
let endIndex = -1;
let usedMarker = '';

if (startIndex !== -1) {
  // Let's search for the end marker
  let endIdx = code.indexOf(etiquetaBinEndMarker, startIndex);
  if (endIdx !== -1) {
    endIndex = endIdx + etiquetaBinEndMarker.length;
    usedMarker = etiquetaBinEndMarker;
  } else {
    endIdx = code.indexOf(etiquetaBinEndMarkerLF, startIndex);
    if (endIdx !== -1) {
      endIndex = endIdx + etiquetaBinEndMarkerLF.length;
      usedMarker = etiquetaBinEndMarkerLF;
    }
  }
}

if (startIndex === -1 || endIndex === -1) {
  console.error('ERROR: Could not find /orders/:id/etiqueta-bin block!');
  process.exit(1);
}

const etiquetaBinCode = code.substring(startIndex, endIndex);
console.log('Extracted etiqueta-bin code block, length:', etiquetaBinCode.length);

// Remove the etiqueta-bin code block from its original position
code = code.substring(0, startIndex) + code.substring(endIndex);

// 2. Locate the place to insert it (after app.post(\'/orders/:id/check\', ...))
const checkRouteEnd = '    res.json(out);\r\n  } catch (err) {\r\n    console.error(\'[CHECK ERROR]\', err);\r\n    next(err);\r\n  }\r\n});';
const checkRouteEndLF = '    res.json(out);\n  } catch (err) {\n    console.error(\'[CHECK ERROR]\', err);\n    next(err);\n  }\n});';

let checkEndIndex = code.indexOf(checkRouteEnd);
let checkMarker = checkRouteEnd;
if (checkEndIndex === -1) {
  checkEndIndex = code.indexOf(checkRouteEndLF);
  checkMarker = checkRouteEndLF;
}

if (checkEndIndex === -1) {
  console.error('ERROR: Could not find end of check route!');
  process.exit(1);
}

// Insert after check route
const insertPos = checkEndIndex + checkMarker.length;
code = code.substring(0, insertPos) + '\n\n' + etiquetaBinCode + '\n' + code.substring(insertPos);
console.log('Inserted etiqueta-bin after check route.');

// 3. Insert imports
const importTarget = 'const catalogoRouter = require(\'./routes/catalogo\');';
const importIndex = code.indexOf(importTarget);
if (importIndex === -1) {
  console.error('ERROR: Could not find catalogoRouter import!');
  process.exit(1);
}
const importPos = importIndex + importTarget.length;
const importsText = '\nconst blingRouter = require(\'./routes/bling\');\nconst meliRouter = require(\'./routes/meli\');\nconst financeiroRouter = require(\'./routes/financeiro\');';
code = code.substring(0, importPos) + importsText + code.substring(importPos);
console.log('Inserted router imports.');

// 4. Insert mounts
const mountTarget = 'app.use(\'/api/catalogo\', catalogoRouter);';
const mountIndex = code.indexOf(mountTarget);
if (mountIndex === -1) {
  console.error('ERROR: Could not find catalogoRouter mount!');
  process.exit(1);
}
const mountPos = mountIndex + mountTarget.length;
const mountsText = '\napp.use(\'/bling\', blingRouter);\napp.use(\'/api/ml\', meliRouter);\napp.use(\'/ml\', meliRouter);\napp.use(\'/api\', financeiroRouter);';
code = code.substring(0, mountPos) + mountsText + code.substring(mountPos);
console.log('Inserted router mounts.');

// 5. Delete redundant/legacy code blocks
// Block A (compras, finance, sheets, margem) starts at:
// `app.post('/api/compras', async (req, res, next) => {`
// and runs to:
// `// ================================================================`
// `// BLING INTEGRATION`
// Wait, let's find the start and end of this block
const blockAStartStr = 'app.post(\'/api/compras\', async (req, res, next) => {';
const blockAEndStr = '// ================================================================\r\n// BLING INTEGRATION';
const blockAEndStrLF = '// ================================================================\n// BLING INTEGRATION';

let blockAStartIndex = code.indexOf(blockAStartStr);
let blockAEndIndex = code.indexOf(blockAEndStr);
if (blockAEndIndex === -1) {
  blockAEndIndex = code.indexOf(blockAEndStrLF);
}

if (blockAStartIndex === -1 || blockAEndIndex === -1) {
  console.error('ERROR: Could not find Block A boundaries!', blockAStartIndex, blockAEndIndex);
  process.exit(1);
}

console.log('Block A starts at:', blockAStartIndex, 'ends at:', blockAEndIndex);
// Remove Block A (compras, finance, sheets, margem)
code = code.substring(0, blockAStartIndex) + code.substring(blockAEndIndex);

// Block B (Bling and ML routes) now starts at `// BLING INTEGRATION` and runs to `// ---------------- Errors ----------------`
const blockBStartStr = '// BLING INTEGRATION';
const blockBEndStr = '// ---------------- Errors ----------------';

let blockBStartIndex = code.indexOf(blockBStartStr);
let blockBEndIndex = code.indexOf(blockBEndStr);

if (blockBStartIndex === -1 || blockBEndIndex === -1) {
  console.error('ERROR: Could not find Block B boundaries!', blockBStartIndex, blockBEndIndex);
  process.exit(1);
}

console.log('Block B starts at:', blockBStartIndex, 'ends at:', blockBEndIndex);
// Remove Block B (Bling and ML integrations)
code = code.substring(0, blockBStartIndex) + code.substring(blockBEndIndex);

fs.writeFileSync(serverJsPath, code, 'utf8');
console.log('Refactoring finished. New server.js length:', code.length);
