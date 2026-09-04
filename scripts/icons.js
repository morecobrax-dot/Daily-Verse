/* =========================================================
   APP ICON
   ---------------------------------------------------------
     node scripts/icons.js

   Draws icon-192.png and icon-512.png from the description
   below, with no dependency and no design tool in the loop.

   WHY GENERATE RATHER THAN COMMIT A DRAWING
   The contamination scan can read filenames but not pixels, so
   "did anyone actually replace the placeholder icons" is the one
   step of the conversion that nothing can check. Keeping the
   drawing as code makes it reviewable in a diff, reproducible at
   any size, and impossible to confuse with an inherited asset.

   THE MARK
   An open book, warm off-white, on a full-bleed amber field —
   the app's --brand-accent ramp, so the icon and the product are
   visibly the same thing. Two arced leaves meeting at a folded
   spine, with a sliver of stacked page edges underneath.

   MASKABLE SAFE ZONE
   Both files are declared `any maskable`, so a launcher may crop
   to a circle of 80% width. The mark is kept inside a centred
   circle of radius 0.32 * size, well within it; the field bleeds
   to every edge so no crop can expose a corner.
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');

/* ---------------------------------------------------------
   PNG ENCODER
   Truecolour with alpha, one IDAT, no interlacing.
   --------------------------------------------------------- */
const CRC_TABLE = (function(){
  const t = new Int32Array(256);
  for(let n = 0; n < 256; n++){
    let c = n;
    for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf){
  let c = 0xFFFFFFFF;
  for(let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data){
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba){
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;      // bit depth
  ihdr[9] = 6;      // colour type: truecolour with alpha
  ihdr[10] = 0;     // deflate
  ihdr[11] = 0;     // adaptive filtering
  ihdr[12] = 0;     // no interlace

  /* Filter type 0 on every scanline. The image is smooth gradients and flat
     fills, which deflate compresses well enough that choosing per-line
     filters would buy bytes nobody is counting. */
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for(let y = 0; y < height; y++){
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------------------------------------------------------
   DRAWING
   Everything is evaluated per sample in normalised coordinates,
   so one description renders at any size. 4x4 supersampling
   turns the analytic shapes into clean edges without a
   rasteriser.
   --------------------------------------------------------- */
const SS = 4;

function mix(a, b, t){
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/* Painter's algorithm, straight alpha. */
function over(dst, src, alpha){
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  return [dst[0] + (src[0] - dst[0]) * a,
          dst[1] + (src[1] - dst[1]) * a,
          dst[2] + (src[2] - dst[2]) * a];
}

/* Signed distance to a rounded rectangle centred at the origin, in a frame
   rotated by `ang`. Negative inside. Distance rather than a hit test, so an
   edge can be antialiased and a shadow can be a blur of the same shape. */
function sdRoundRect(px, py, cx, cy, hw, hh, r, ang){
  const dx = px - cx, dy = py - cy;
  const c = Math.cos(-ang), s = Math.sin(-ang);
  const x = Math.abs(dx * c - dy * s) - (hw - r);
  const y = Math.abs(dx * s + dy * c) - (hh - r);
  const ax = x > 0 ? x : 0, ay = y > 0 ? y : 0;
  const outside = Math.sqrt(ax * ax + ay * ay);
  const inside = Math.min(Math.max(x, y), 0);
  return outside + inside - r;
}

/* Coverage from a distance, over roughly one output pixel. */
function cover(d, soft){
  const w = soft || 0.0016;
  return 1 - Math.min(Math.max(d / w + 0.5, 0), 1);
}

/* ---- the palette, matching token layer 1 ---- */
const FIELD_HI   = [0xFF, 0xB2, 0x6B];
const FIELD_LO   = [0xDE, 0x53, 0x1C];
const PAGE_HI    = [0xFF, 0xFC, 0xF8];
const PAGE_LO    = [0xF2, 0xE2, 0xD1];
const EDGE       = [0xD9, 0xC3, 0xAC];
const SHADOW     = [0x6B, 0x24, 0x03];

/* The book, described once, in normalised coordinates.

   The silhouette is the one every reader already knows: a band whose top and
   bottom edges each arc upward through the middle of each half and come back
   down at the spine and at the outer edge. Two tilted rectangles were tried
   first and read as two loose cards — the arc is what makes it a book. */
const HW    = 0.278;         // half width of the whole book
const HH    = 0.158;         // half height at the spine
const ARC   = 0.057;         // how far each page lifts through its middle
const CORNER = 0.042;        // outer corner radius
const CX = 0.5, CY = 0.505;  // optically centred: a hair low reads as centred

/* Distance above the top edge / below the bottom edge, following the arc.
   Both edges take the same lift, so the pages keep an even thickness. */
function pageLift(x){
  const u = Math.min(Math.abs(x - CX) / HW, 1);
  return ARC * Math.sin(Math.PI * u);
}

/* Negative inside the book. Not a true distance field — the arc makes that
   expensive — but a close enough approximation that 4x4 supersampling
   resolves the edge cleanly. */
function sdBook(x, y, dy, scale){
  const s = scale === undefined ? 1 : scale;
  const lift = pageLift(x);
  const top = CY - HH * s - lift + dy;
  const bot = CY + HH * s - lift + dy;
  const band = Math.max(top - y, y - bot);
  const box = sdRoundRect(x, y, CX, CY + dy, HW * s, (HH + ARC) * s + 0.02, CORNER, 0);
  return Math.max(band, box);
}

function sample(x, y){
  /* The field bleeds to every edge — a maskable icon has no corners it can
     rely on keeping. */
  let col = mix(FIELD_HI, FIELD_LO, (x * 0.55 + y * 0.75));

  /* A soft warm highlight so the field reads as lit rather than flat. */
  const dx = x - 0.40, dy = y - 0.30;
  const r = Math.sqrt(dx * dx + dy * dy);
  col = over(col, FIELD_HI, Math.max(0, 0.26 - r * 0.34));

  /* One soft drop shadow under the whole mark. */
  const dShadow = sdBook(x, y, 0.030);
  col = over(col, SHADOW, Math.max(0, 1 - Math.max(dShadow, 0) / 0.055) * 0.22);

  /* The page-edge stack: the same silhouette nudged down, so a sliver of
     stacked paper shows beneath the open leaves. */
  col = over(col, EDGE, cover(sdBook(x, y, 0.019)));

  /* The open pages, lit from the top. */
  const d = sdBook(x, y, 0);
  const lift = pageLift(x);
  const t = (y - (CY - HH - lift)) / (HH * 2);
  col = over(col, mix(PAGE_HI, PAGE_LO, t), cover(d));

  /* The fold. A darkening that tightens toward the centre line gives an
     open book its spine without drawing a hard rule down the middle. */
  const spine = Math.max(0, 1 - Math.abs(x - CX) / 0.085);
  col = over(col, EDGE, cover(d) * Math.pow(spine, 2.2) * 0.55);

  return col;
}

function render(size){
  const buf = Buffer.alloc(size * size * 4);
  const step = 1 / (size * SS);
  for(let py = 0; py < size; py++){
    for(let px = 0; px < size; px++){
      let r = 0, g = 0, b = 0;
      for(let sy = 0; sy < SS; sy++){
        for(let sx = 0; sx < SS; sx++){
          const x = (px * SS + sx + 0.5) * step;
          const y = (py * SS + sy + 0.5) * step;
          const c = sample(x, y);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS;
      const i = (py * size + px) * 4;
      buf[i]     = Math.round(Math.min(255, Math.max(0, r / n)));
      buf[i + 1] = Math.round(Math.min(255, Math.max(0, g / n)));
      buf[i + 2] = Math.round(Math.min(255, Math.max(0, b / n)));
      buf[i + 3] = 255;                 // opaque: a maskable icon has no holes
    }
  }
  return buf;
}

function run(){
  [192, 512].forEach(function(size){
    const file = path.join(ROOT, 'icon-' + size + '.png');
    fs.writeFileSync(file, encodePng(size, size, render(size)));
    console.log('  wrote icon-' + size + '.png  (' +
      (fs.statSync(file).size / 1024).toFixed(1) + ' KB)');
  });
  console.log('icons  done — open book, amber field, full bleed for maskable crops');
  return 0;
}

if(require.main === module) process.exit(run());
module.exports = { encodePng: encodePng, render: render };
