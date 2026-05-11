# print-raw.ps1 — envia ZPL diretamente ao spooler Windows via P/Invoke (winspool.drv)
param(
  [string]$PrinterName,
  [string]$ZplContent
)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class WinSpool {
    [DllImport("winspool.drv", CharSet=CharSet.Auto, SetLastError=true)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", CharSet=CharSet.Auto, SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", CharSet=CharSet.Ansi, SetLastError=true)]
    public static extern int StartDocPrinter(IntPtr hPrinter, int Level, ref DOC_INFO_1 pDocInfo);

    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
    public struct DOC_INFO_1 {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDatatype;
    }

    public static void SendZpl(string printerName, string zpl) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            throw new Exception("Impressora nao encontrada: " + printerName);
        try {
            var di = new DOC_INFO_1 { pDocName = "ZPL", pOutputFile = null, pDatatype = "RAW" };
            if (StartDocPrinter(hPrinter, 1, ref di) == 0)
                throw new Exception("StartDocPrinter falhou");
            StartPagePrinter(hPrinter);
            byte[] bytes = System.Text.Encoding.ASCII.GetBytes(zpl);
            IntPtr ptr = Marshal.AllocCoTaskMem(bytes.Length);
            try {
                Marshal.Copy(bytes, 0, ptr, bytes.Length);
                int written;
                WritePrinter(hPrinter, ptr, bytes.Length, out written);
            } finally {
                Marshal.FreeCoTaskMem(ptr);
            }
            EndPagePrinter(hPrinter);
            EndDocPrinter(hPrinter);
        } finally {
            ClosePrinter(hPrinter);
        }
    }
}
'@ -Language CSharp

[WinSpool]::SendZpl($PrinterName, $ZplContent)
