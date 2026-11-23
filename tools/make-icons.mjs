// Génère les icônes et écrans de lancement PNG (sans dépendance) : node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(OUT, { recursive: true });

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = b => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const C1 = hex('#4338ca'), C2 = hex('#7c3aed'), BG = hex('#0d1117'), W = [255, 255, 255];
const clamp = v => Math.max(0, Math.min(1, v));
const sdRound = (px, py, cx, cy, hw, hh, r) => { const qx = Math.abs(px - cx) - (hw - r), qy = Math.abs(py - cy) - (hh - r); return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
const sdSeg = (px, py, ax, ay, bx, by) => { const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay; const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay)); return Math.hypot(pax - bax * h, pay - bay * h); };

// Dessine le logo dans un carré [ox,oy,size] ; full = fond plein (pas de coins arrondis), scale = taille du symbole
function drawLogo(buf, W0, ox, oy, size, { full = false, glyph = 1 } = {}) {
  const cx = ox + size / 2, cy = oy + size / 2;
  const R = size * 0.27 * glyph, stroke = size * 0.075 * glyph;
  // coche
  const a = [cx - size * 0.13 * glyph, cy + size * 0.005 * glyph], b = [cx - size * 0.03 * glyph, cy + size * 0.1 * glyph], c = [cx + size * 0.15 * glyph, cy - size * 0.1 * glyph];
  for (let y = Math.floor(oy); y < oy + size; y++) for (let x = Math.floor(ox); x < ox + size; x++) {
    const px = x + 0.5, py = y + 0.5;
    const i = (y * W0 + x) * 4;
    const dBg = full ? -1 : sdRound(px, py, cx, cy, size / 2, size / 2, size * 0.225);
    const aBg = clamp(0.5 - dBg);
    if (aBg <= 0) continue;
    const t = clamp(((px - ox) + (py - oy)) / (2 * size));
    let col = C1.map((v, k) => v + (C2[k] - v) * t);
    // anneau ouvert (arc) autour de la coche
    const ang = Math.atan2(py - cy, px - cx);
    const dRing = Math.abs(Math.hypot(px - cx, py - cy) - R) - stroke / 2;
    const gap = ang > -1.15 && ang < -0.25; // ouverture en haut à droite
    const aRing = gap ? 0 : clamp(0.5 - dRing);
    const dChk = Math.min(sdSeg(px, py, ...a, ...b), sdSeg(px, py, ...b, ...c)) - stroke / 2;
    const aChk = clamp(0.5 - dChk);
    const g = Math.max(aRing * 0.92, aChk);
    col = col.map((v, k) => v + (W[k] - v) * g);
    const prevA = buf[i + 3] / 255;
    const outA = aBg + prevA * (1 - aBg);
    for (let k = 0; k < 3; k++) buf[i + k] = Math.round((col[k] * aBg + buf[i + k] * prevA * (1 - aBg)) / (outA || 1));
    buf[i + 3] = Math.round(outA * 255);
  }
}
function icon(size, opts, name) {
  const buf = Buffer.alloc(size * size * 4);
  drawLogo(buf, size, 0, 0, size, opts);
  writeFileSync(join(OUT, name), png(size, size, buf));
}
icon(192, {}, 'icon-192.png');
icon(512, {}, 'icon-512.png');
icon(512, { full: true, glyph: 0.78 }, 'icon-maskable-512.png');
icon(180, { full: true, glyph: 0.95 }, 'apple-touch-icon.png');
icon(32, {}, 'favicon-32.png');

for (const [w, h] of [[1320, 2868], [1206, 2622], [1290, 2796], [1179, 2556], [1284, 2778], [1170, 2532], [1125, 2436], [828, 1792], [750, 1334]]) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { buf[i * 4] = BG[0]; buf[i * 4 + 1] = BG[1]; buf[i * 4 + 2] = BG[2]; buf[i * 4 + 3] = 255; }
  const s = Math.round(w * 0.26);
  drawLogo(buf, w, Math.round((w - s) / 2), Math.round((h - s) / 2 - h * 0.04), s);
  writeFileSync(join(OUT, `splash-${w}x${h}.png`), png(w, h, buf));
}
console.log('Icônes générées dans', OUT);
