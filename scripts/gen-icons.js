/*
 * Dependency-free icon generator for Lumière.
 * Renders the app mark (a warm rose-gold rounded tile with a luminous cream
 * orb + sparkle) at 4x supersampling and encodes PNGs using Node's zlib.
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function clamp(n, lo, hi) { return Math.min(Math.max(n, lo), hi); }

const TOP = hex('#E7A79A');
const BOT = hex('#C97B6A');
const CREAM = hex('#FBF6F1');
const CREAM_HI = hex('#FFFFFF');

// Sample the icon color at normalized coords (x,y in 0..1). Returns [r,g,b,a].
function sample(x, y, opts) {
  const pad = opts.padding; // fraction of tile kept as safe-zone padding
  // Background: diagonal gradient. When transparentBg, only draw inside a rounded square.
  const t = clamp((x + y) / 2, 0, 1);
  let col = mix(TOP, BOT, t);
  let a = 1;

  if (opts.transparentBg) {
    // rounded-square mask so maskable/standard art has soft corners on transparent bg
    const r = 0.22;
    const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
    const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > r) return [0, 0, 0, 0];
    if (dist > r - 0.01) a = clamp((r - dist) / 0.01, 0, 1);
  }

  // Luminous orb, centered, sized to respect padding safe-zone
  const cx = 0.5, cy = 0.5;
  const orbR = (0.5 - pad) * 0.5;
  const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));

  // Soft outer glow halo around the orb (luminescence)
  if (d < orbR * 1.9) {
    const halo = clamp(1 - (d - orbR) / (orbR * 0.9), 0, 1);
    col = mix(col, CREAM_HI, halo * halo * 0.28);
  }

  if (d < orbR) {
    // radial highlight from an upper-left light source -> pearl dimensionality
    const hx = cx - orbR * 0.34, hy = cy - orbR * 0.38;
    const hd = Math.sqrt((x - hx) * (x - hx) + (y - hy) * (y - hy)) / (orbR * 1.55);
    const orb = mix(CREAM_HI, CREAM, clamp(hd, 0, 1) * 0.85);
    const edge = clamp((orbR - d) / (orbR * 0.05), 0, 1);
    col = mix(col, orb, edge);
  }

  // Small sparkle just outside the upper-right of the orb
  const sx = cx + orbR * 0.98, sy = cy - orbR * 0.98;
  const sd = Math.sqrt((x - sx) * (x - sx) + (y - sy) * (y - sy));
  const sR = orbR * 0.13;
  if (sd < sR) {
    const edge = clamp((sR - sd) / (sR * 0.55), 0, 1);
    col = mix(col, CREAM_HI, edge);
  }

  return [col[0], col[1], col[2], a];
}

function render(size, opts) {
  const ss = 4; // supersample
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const nx = (px + (sx + 0.5) / ss) / size;
          const ny = (py + (sy + 0.5) / ss) / size;
          const c = sample(nx, ny, opts);
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
        }
      }
      const n = ss * ss;
      const alpha = a / n;
      const i = (py * size + px) * 4;
      if (alpha > 0) {
        buf[i] = Math.round(r / a);
        buf[i + 1] = Math.round(g / a);
        buf[i + 2] = Math.round(b / a);
      }
      buf[i + 3] = Math.round(alpha * 255);
    }
  }
  return buf;
}

// --- minimal PNG encoder ---
function crc32(buf) {
  let c, table = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // no filter
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  { file: 'icon-180.png', size: 180, opts: { padding: 0.06, transparentBg: false } }, // apple-touch (opaque)
  { file: 'icon-192.png', size: 192, opts: { padding: 0.06, transparentBg: false } },
  { file: 'icon-512.png', size: 512, opts: { padding: 0.06, transparentBg: false } },
  { file: 'icon-512-maskable.png', size: 512, opts: { padding: 0.18, transparentBg: false } }, // art in safe zone
  { file: 'favicon-32.png', size: 32, opts: { padding: 0.04, transparentBg: false } }
];

for (const t of targets) {
  const rgba = render(t.size, t.opts);
  fs.writeFileSync(path.join(outDir, t.file), encodePNG(t.size, rgba));
  console.log('wrote', t.file, t.size + 'x' + t.size);
}
console.log('done');
