// Generates build/icon.png — the Timebox dock/window icon.
// Run: node scripts/gen-icon.js
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crcBuf]);
}

// Generate at 1024px so macOS downscaling stays crisp across Dock/App Switcher sizes.
const W = 1024, H = 1024;

function inRRect(px, py, x0, y0, w, h, rx) {
  if (px < x0 || px >= x0 + w || py < y0 || py >= y0 + h) return false;
  const lx = px - x0, ly = py - y0;
  if (lx < rx && ly < rx && (lx - rx) ** 2 + (ly - rx) ** 2 > rx * rx) return false;
  if (lx >= w - rx && ly < rx && (lx - (w - rx)) ** 2 + (ly - rx) ** 2 > rx * rx) return false;
  if (lx < rx && ly >= h - rx && (lx - rx) ** 2 + (ly - (h - rx)) ** 2 > rx * rx) return false;
  if (lx >= w - rx && ly >= h - rx && (lx - (w - rx)) ** 2 + (ly - (h - rx)) ** 2 > rx * rx) return false;
  return true;
}

function makePixel(x, y, mono) {
  // macOS Dock/App Switcher visual balance: keep more breathing room around the glyph.
  const pad = Math.round(W * 0.11);
  const iconX = pad;
  const iconY = pad;
  const iconW = W - pad * 2;
  const iconH = H - pad * 2;
  const iconR = Math.round(iconW * 0.225);
  if (!inRRect(x, y, iconX, iconY, iconW, iconH, iconR)) return [0, 0, 0, 0];

  // Mono (dev) icon matches the sidebar brand mark's near-black (#1a1a1a),
  // not a desaturated green, which reads as washed-out mid-gray.
  const bg = mono ? [0x1a, 0x1a, 0x1a] : [0x2a, 0x2a, 0x2a];
  const m   = Math.round(iconW * 0.115);
  const sq  = Math.round(iconW * 0.355);
  const gap = iconW - 2 * m - 2 * sq;
  const sqR = Math.round(sq * 0.13);

  const ox = iconX;
  const oy = iconY;

  const squares = [
    { x: ox + m,            y: oy + m,            a: 0.9  },
    { x: ox + m + sq + gap, y: oy + m,            a: 0.65 },
    { x: ox + m,            y: oy + m + sq + gap, a: 0.65 },
    { x: ox + m + sq + gap, y: oy + m + sq + gap, a: 0.9  },
  ];

  for (const s of squares) {
    if (inRRect(x, y, s.x, s.y, sq, sq, sqR)) {
      return [
        Math.round(bg[0] + (255 - bg[0]) * s.a),
        Math.round(bg[1] + (255 - bg[1]) * s.a),
        Math.round(bg[2] + (255 - bg[2]) * s.a),
        255,
      ];
    }
  }

  return [...bg, 255];
}

function toGray([r, g, b, a]) {
  const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  return [y, y, y, a];
}

function writeIcon(fileName, mono) {
  const raw = [];
  for (let y = 0; y < H; y++) {
    raw.push(0);
    for (let x = 0; x < W; x++) {
      const px = makePixel(x, y, mono);
      raw.push(...(mono ? toGray(px) : px));
    }
  }

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.from(raw))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);

  const outPath = path.join(__dirname, '..', 'build', fileName);
  fs.writeFileSync(outPath, png);
  console.log(`Icon generated: ${outPath} (${Math.round(png.length / 1024)} KB)`);
}

// Dev/test builds get a black-and-white icon.png-dev so a running test app is
// visually distinguishable from the color production icon.
writeIcon('icon.png', false);
writeIcon('icon-dev.png', true);
