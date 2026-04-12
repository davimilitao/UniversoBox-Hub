// Rodar UMA VEZ com: node gen-icons.js
// Gera icon-192.png e icon-512.png na pasta public/
const { createCanvas } = require('canvas');
const fs = require('fs');

function drawIcon(size) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const r = size * 0.15;

  // Fundo
  ctx.fillStyle = '#020617';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, r);
  ctx.fill();

  // Caixa verde
  const pad = size * 0.18;
  const bs  = size - pad * 2;
  ctx.fillStyle = '#059669';
  ctx.beginPath();
  ctx.roundRect(pad, pad, bs, bs, r * 0.6);
  ctx.fill();

  // Letra U branca
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size * 0.52}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('UB', size / 2, size / 2);

  return c.toBuffer('image/png');
}

try {
  fs.writeFileSync('icon-192.png', drawIcon(192));
  fs.writeFileSync('icon-512.png', drawIcon(512));
  console.log('Icons generated!');
} catch {
  console.log('canvas not available — create icons manually or use a PNG editor');
}
