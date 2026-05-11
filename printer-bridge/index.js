/**
 * printer-bridge — daemon HTTP local para impressão ZPL na Elgin L42 Pro
 * Porta: 9191
 * Uso: node printer-bridge/index.js
 *
 * Endpoints:
 *   GET  /status  → { ok: true, printer }
 *   POST /print   → { zpl: "^XA..." }  → imprime via Windows spooler (winspool.drv)
 */

const http = require('http');
const { execFileSync } = require('child_process');
const path = require('path');
const os = require('os');

const PORT = 9191;
const PS_SCRIPT = path.join(__dirname, 'print-raw.ps1');

// Nome da impressora — null usa a padrão do sistema
const PRINTER_NAME = process.env.PRINTER_NAME || null;

function getPrinterName() {
  if (PRINTER_NAME) return PRINTER_NAME;
  try {
    const out = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      '(Get-WmiObject -Query "SELECT * FROM Win32_Printer WHERE Default=True").Name',
    ], { encoding: 'utf8', timeout: 5000 }).trim();
    return out || 'Elgin L42 Pro';
  } catch {
    return 'Elgin L42 Pro';
  }
}

function printZpl(zpl) {
  const printer = getPrinterName();
  execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', PS_SCRIPT,
    '-PrinterName', printer,
    '-ZplContent', zpl,
  ], { timeout: 15000 });
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, code, obj) {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url === '/status') {
    return json(res, 200, { ok: true, printer: getPrinterName() });
  }

  if (req.method === 'POST' && req.url === '/print') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const { zpl } = JSON.parse(body);
        if (!zpl || typeof zpl !== 'string') return json(res, 400, { error: 'zpl obrigatório' });
        printZpl(zpl);
        json(res, 200, { ok: true });
      } catch (e) {
        console.error('[bridge] erro ao imprimir:', e.message);
        json(res, 500, { error: e.message });
      }
    });
    return;
  }

  json(res, 404, { error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  const printer = getPrinterName();
  console.log(`[bridge] rodando em http://localhost:${PORT}`);
  console.log(`[bridge] impressora: ${printer}`);
  console.log('[bridge] /status para verificar  /print para imprimir ZPL');
});
