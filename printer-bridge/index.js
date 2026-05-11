/**
 * @file printer-bridge/index.js
 * @description Bridge local de impressão para etiquetas ZPL na Elgin L42 Pro (USB).
 *   HTTP em localhost:9191. Frontend POST /print { zpl } → PowerShell Win32 spooler → impressora.
 *   Sem npm extra — usa apenas módulos nativos do Node.js + PowerShell do Windows.
 *
 * Uso:
 *   node index.js                          # usa "Elgin L42 PRO" como impressora padrão
 *   node index.js "Nome Exato Impressora"  # nome customizado
 *
 * Endpoints:
 *   GET  /status          → { ok, printer, version }
 *   GET  /printers        → lista impressoras Windows disponíveis
 *   POST /print { zpl }   → imprime e retorna { ok }
 */

const http      = require('http');
const { execFile, exec } = require('child_process');
const fs        = require('fs');
const path      = require('path');
const os        = require('os');

const PORT         = 9191;
const PRINTER_NAME = process.argv[2] || 'Elgin L42 PRO';
const PS_SCRIPT    = path.join(__dirname, 'print-raw.ps1');

function listPrinters(cb) {
  exec('powershell -NonInteractive -Command "Get-Printer | Select-Object -ExpandProperty Name"',
    (err, stdout) => {
      if (err) return cb([]);
      cb(stdout.split('\n').map(s => s.trim()).filter(Boolean));
    }
  );
}

function printZpl(zpl, cb) {
  const tmp = path.join(os.tmpdir(), `lbl_${Date.now()}_${Math.random().toString(36).slice(2)}.zpl`);
  try {
    fs.writeFileSync(tmp, zpl, 'binary');
  } catch (e) {
    return cb(e);
  }
  execFile(
    'powershell',
    ['-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS_SCRIPT, PRINTER_NAME, tmp],
    { timeout: 15000 },
    (err, stdout, stderr) => {
      fs.unlink(tmp, () => {});
      if (err) return cb(new Error(stderr || err.message));
      cb(null, stdout.trim());
    }
  );
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // GET /status
  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, printer: PRINTER_NAME, version: '1.0', platform: process.platform }));
    return;
  }

  // GET /printers — lista impressoras instaladas no Windows
  if (req.method === 'GET' && req.url === '/printers') {
    listPrinters(list => {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, printers: list, current: PRINTER_NAME }));
    });
    return;
  }

  // POST /print { zpl: string }
  if (req.method === 'POST' && req.url === '/print') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 2 * 1024 * 1024) req.destroy(); });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); } catch (e) {
        res.writeHead(400); res.end(JSON.stringify({ error: 'JSON inválido' })); return;
      }
      const { zpl } = parsed;
      if (!zpl || typeof zpl !== 'string') {
        res.writeHead(400); res.end(JSON.stringify({ error: 'campo zpl obrigatório (string)' })); return;
      }
      printZpl(zpl, (err, output) => {
        if (err) {
          console.error('[bridge] erro impressão:', err.message);
          res.writeHead(500); res.end(JSON.stringify({ error: err.message })); return;
        }
        console.log(`[bridge] impresso ${zpl.length} chars → ${output}`);
        res.writeHead(200); res.end(JSON.stringify({ ok: true, output }));
      });
    });
    return;
  }

  res.writeHead(404); res.end(JSON.stringify({ error: 'rota não encontrada' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('✅  Print Bridge UniversoBox — rodando');
  console.log(`    URL:       http://127.0.0.1:${PORT}`);
  console.log(`    Impressora: ${PRINTER_NAME}`);
  console.log('    Para parar: Ctrl+C');
  console.log('');
  console.log('    Endpoints:');
  console.log(`      GET  http://127.0.0.1:${PORT}/status   → verifica se está ativo`);
  console.log(`      GET  http://127.0.0.1:${PORT}/printers → lista impressoras Windows`);
  console.log(`      POST http://127.0.0.1:${PORT}/print    → imprime ZPL { zpl: "..." }`);
  console.log('');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Porta ${PORT} já em uso. Outro bridge rodando?`);
  } else {
    console.error('❌ Erro no servidor:', err.message);
  }
  process.exit(1);
});
