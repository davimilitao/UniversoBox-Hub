/**
 * @file helpers.js
 * @module expedicao/compras
 * @description Funções utilitárias compartilhadas entre os componentes de Compras.
 * @version 1.0.0
 * @date 2026-04-12
 * @changelog
 *   1.0.0 — 2026-04-12 — Extraído de Compras.jsx; adicionado imprimirPDF.
 */

export const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const DRAFT_KEY = 'compras_rascunho';
export const MODALIDADES = ['FLEX', 'FULL', 'AGÊNCIA'];

export function shortId(id = '') {
  return id.split('_').pop() || id;
}

export function formatData(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function nomeMes(mesAno = '') {
  try {
    return new Date(`${mesAno.slice(0, 4)}-${mesAno.slice(4, 6)}-01`)
      .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
  } catch { return mesAno; }
}

export function diasEmTransito(dataACaminho) {
  if (!dataACaminho) return 0;
  return Math.round((Date.now() - dataACaminho) / 86_400_000);
}

export function formatDataCurta(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
}

export function imprimirPDF(compraId, items, modalidade) {
  if (!items.length) return;
  const totalQty = items.reduce((s, i) => s + Number(i.qty), 0);
  const data     = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const rows = items.map(item => `
    <tr>
      <td style="text-align:center;width:56px;padding:6px 10px;">
        <img src="${item.image || '/assets/placeholder.png'}"
          style="width:44px;height:44px;object-fit:contain;border-radius:4px;border:1px solid #eee;"
          crossorigin="anonymous"
          onerror="this.src='/assets/placeholder.png'">
      </td>
      <td style="padding:8px 10px;"><strong>${item.name}</strong><br>
        <small style="color:#888;font-size:10px;">SKU: ${item.sku} · EAN: ${item.ean || '—'}</small>
      </td>
      <td style="padding:8px 10px;color:#555;font-size:12px;">${item.marca || '—'}</td>
      <td style="padding:8px 10px;text-align:center;font-weight:700;font-size:15px;">${item.qty}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Pedido ${compraId}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #fff; color: #111; padding: 24px; }
  .header { border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
  .header h1 { font-size: 18px; font-weight: 800; }
  .header .sub { font-size: 12px; color: #666; margin-top: 2px; }
  .badge { display: inline-block; background: #111; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  thead tr { background: #f5f5f5; }
  th { padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #666; border-bottom: 2px solid #eee; }
  td { border-bottom: 1px solid #f0f0f0; vertical-align: middle; font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #eee; font-size: 11px; color: #aaa; display: flex; justify-content: space-between; }
  @media print { body { padding: 12px; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>📦 Pedido de Compras</h1>
    <div class="sub">${data} · <span class="badge">${modalidade}</span></div>
    <div class="sub" style="margin-top:4px;font-family:monospace;font-size:11px;">${compraId}</div>
  </div>
  <div style="text-align:right;">
    <div style="font-size:22px;font-weight:800;">${items.length} produto${items.length !== 1 ? 's' : ''}</div>
    <div style="font-size:13px;color:#666;">${totalQty} unidades</div>
  </div>
</div>
<table>
  <thead><tr><th width="56"></th><th>Produto</th><th>Marca</th><th style="text-align:center;">Qtd</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">
  <span>UniversoBox Hub</span>
  <span>${compraId}</span>
</div>
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}
