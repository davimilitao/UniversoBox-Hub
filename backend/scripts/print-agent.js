/**
 * @file print-agent.js
 * @description Micro-Agente de Impressão Local para UniversoBox Hub.
 *   Executa na máquina de expedição (porta 9000) e faz a ponte
 *   entre o navegador e as impressoras físicas locais (Elgin, Zebra, etc.).
 *   Suporta PDF (via pdf-to-printer/SumatraPDF) e ZPL (via Win32 Spooler API).
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const pt = require('pdf-to-printer');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const PORT = 9000;
const TEMP_DIR = path.join(__dirname, '../temp_print');

// Garante que o diretório temporário exista
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Helper: Envia ZPL bruto para a fila da impressora do Windows usando PowerShell + C# Win32 Spooler API
function printRawZpl(printerName, zplString) {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(TEMP_DIR, `job_${uuidv4()}.zpl`);
    fs.writeFileSync(tempFile, zplString, 'utf8');

    // Define a classe C# em PowerShell para chamar APIs de winspool.drv de forma nativa e sem compilação local
    const psScript = `
$code = @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDatatype;
    }
    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendStringToPrinter(string szPrinterName, string szString) {
        IntPtr hPrinter = new IntPtr(0);
        DOCINFOA di = new DOCINFOA();
        bool bSuccess = false;
        di.pDocName = "RAW ZPL Label";
        di.pDatatype = "RAW";
        if (OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    IntPtr pBytes = Marshal.StringToCoTaskMemAnsi(szString);
                    Int32 dwCount = szString.Length;
                    Int32 dwWritten = 0;
                    bSuccess = WritePrinter(hPrinter, pBytes, dwCount, out dwWritten);
                    EndPagePrinter(hPrinter);
                    Marshal.FreeCoTaskMem(pBytes);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return bSuccess;
    }
}
"@

Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue

$zpl = Get-Content -Path "${tempFile.replace(/\\/g, '\\\\')}" -Raw
$ok = [RawPrinterHelper]::SendStringToPrinter("${printerName}", $zpl)
if ($ok) {
    Write-Output "SUCCESS"
} else {
    Write-Error "FAIL_PRINT_SPOOLER"
}
`;

    const psCommand = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;

    exec(psCommand, (error, stdout, stderr) => {
      // Remove o arquivo temporário
      try { fs.unlinkSync(tempFile); } catch (_) {}

      if (error) {
        return reject(new Error(`PowerShell Error: ${error.message}`));
      }
      if (stderr && stderr.includes('FAIL_PRINT_SPOOLER')) {
        return reject(new Error(`Spooler API failed to send raw bytes to printer: ${stderr}`));
      }
      if (stdout.includes('SUCCESS')) {
        resolve();
      } else {
        reject(new Error(`Unexpected output from print script: ${stdout}`));
      }
    });
  });
}

// ── GET /status ──────────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
  res.json({ ok: true, agent: 'UniversoBox-PrintAgent', version: '1.0.0' });
});

// ── GET /printers ────────────────────────────────────────────────────────────
app.get('/printers', async (req, res) => {
  try {
    const list = await pt.getPrinters();
    const defaultPrinter = await pt.getDefaultPrinter();
    res.json({ printers: list.map(p => p.name || p), defaultPrinter });
  } catch (err) {
    console.error('[GET /printers] erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /print-pdf ──────────────────────────────────────────────────────────
app.post('/print-pdf', async (req, res) => {
  const { pdf, printer } = req.body;
  if (!pdf) return res.status(400).json({ error: 'Falta o conteúdo do PDF (base64 ou URL)' });

  const tempFile = path.join(TEMP_DIR, `job_${uuidv4()}.pdf`);

  try {
    if (pdf.startsWith('http://') || pdf.startsWith('https://')) {
      // Faz o download do PDF
      const response = await fetch(pdf);
      if (!response.ok) throw new Error(`Falha ao baixar PDF: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      fs.writeFileSync(tempFile, Buffer.from(arrayBuffer));
    } else {
      // Trata como base64
      const base64Data = pdf.replace(/^data:application\/pdf;base64,/, '');
      fs.writeFileSync(tempFile, Buffer.from(base64Data, 'base64'));
    }

    const options = {};
    if (printer) {
      options.printer = printer;
    }

    console.log(`[print-pdf] Imprimindo na impressora: ${printer || 'Padrão'}`);
    await pt.print(tempFile, options);

    res.json({ ok: true, message: 'PDF enviado com sucesso para a fila de impressão.' });
  } catch (err) {
    console.error('[POST /print-pdf] erro:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    // Remove o arquivo temporário se ainda existir
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (_) {}
  }
});

// ── POST /print-zpl ──────────────────────────────────────────────────────────
app.post('/print-zpl', async (req, res) => {
  const { zpl, printer } = req.body;
  if (!zpl) return res.status(400).json({ error: 'Falta o comando ZPL' });

  try {
    let targetPrinter = printer;
    if (!targetPrinter) {
      targetPrinter = await pt.getDefaultPrinter();
    }

    if (!targetPrinter) {
      throw new Error('Nenhuma impressora padrão configurada no sistema.');
    }

    console.log(`[print-zpl] Enviando ZPL para impressora: ${targetPrinter}`);
    await printRawZpl(targetPrinter, zpl);

    res.json({ ok: true, message: 'ZPL enviado com sucesso para a impressora.' });
  } catch (err) {
    console.error('[POST /print-zpl] erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[PrintAgent] Agente de impressão local rodando na porta :${PORT}`);
});
