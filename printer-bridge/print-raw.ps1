param([string]$printerName, [string]$dataFile)
$bytes = [System.IO.File]::ReadAllBytes($dataFile)
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class WinPrint {
  [DllImport("winspool.drv",EntryPoint="OpenPrinterA")] public static extern bool OpenPrinter(string n, ref IntPtr h, IntPtr d);
  [DllImport("winspool.drv")] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv",EntryPoint="StartDocPrinterA")] public static extern int StartDoc(IntPtr h, int lv, ref DOCINFO di);
  [DllImport("winspool.drv")] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv")] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv")] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv")] public static extern bool WritePrinter(IntPtr h, byte[] b, int c, ref int w);
  [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential,CharSet=System.Runtime.InteropServices.CharSet.Ansi)]
  public struct DOCINFO {
    public int sz; public string doc; public string out_; public string dtype; public int flags;
    public DOCINFO(string dt){sz=20;doc="Label";out_=null;dtype=dt;flags=0;}
  }
}
'@
$h=[IntPtr]::Zero
[WinPrint]::OpenPrinter($printerName,[ref]$h,[IntPtr]::Zero)|Out-Null
$di=[WinPrint+DOCINFO]::new("RAW")
[WinPrint]::StartDoc($h,1,[ref]$di)|Out-Null
[WinPrint]::StartPagePrinter($h)|Out-Null
$w=0; [WinPrint]::WritePrinter($h,$bytes,$bytes.Length,[ref]$w)|Out-Null
[WinPrint]::EndPagePrinter($h)|Out-Null
[WinPrint]::EndDocPrinter($h)|Out-Null
[WinPrint]::ClosePrinter($h)|Out-Null
Write-Output "printed:$w"
