/* =========================================================
   APP ICON — New Covenant
   ---------------------------------------------------------
     node scripts/icons.js           write every brand asset
     node scripts/icons.js verify    fail if any shipped asset drifts

   Every icon this app ships is drawn from the one description
   below, with no dependency and no design tool in the loop. The
   code is the master; the PNG and SVG files are its output.

   WHY GENERATE RATHER THAN COMMIT A DRAWING
   The contamination scan can read filenames but not pixels, so
   "did anyone actually replace the placeholder icons" is the one
   step of a conversion that nothing can check. Keeping the drawing
   as code makes it reviewable in a diff, reproducible at any size,
   and impossible to confuse with an inherited or downloaded asset.

   THE MARK
   An open Bible, seen from the front, in a warm amber cover. Its
   spine shows between the pages and rises out of the book as a
   column of light that thins and fades as it climbs: Scripture,
   then understanding, then direction. The Bible is the dominant
   object; the light is its consequence, not a second picture.

   What was tried and rejected, so nobody re-tries it:
     - a hard, sharp spike through the gutter reads as a blade
       stuck in a book, and a tall one over a low wide book as an
       inverted cross
     - a round sun above the gutter reads as the "person reading"
       pictogram; a road wedge beneath one reads as a necktie
     - candle, flame, smoke and pillar shapes read as an object
       standing on the book rather than light coming out of it
   Only light that dissolves reads as light.

   SMALL SIZES
   There are no page lines, rays or ornaments to turn into noise at
   29px. What survives there is three things: an ivory book shape,
   its amber edge, and an amber stroke rising from the middle.

   PALETTE — from token layer 1, not invented for the icon
   Ground #221C16 -> #0F0C0A (surface-raised to ground), pages the
   warm ivory of --text, the light in the --brand-accent family.

   SAFE ZONES
   Nothing solid lies further than 0.36 of the width from the
   centre, inside the 0.40 circle a maskable icon may be cropped to
   and clear of the corners an iOS mask removes. The field bleeds to
   every edge and no corner is rounded: the platform draws its own
   shape. Only the favicon, which no platform masks, rounds itself.
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');

/* ---------------------------------------------------------
   PNG
   8-bit truecolour, with or without alpha, one IDAT, filter 0.
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

/* App Store and home-screen icons must not carry an alpha channel, so
   opaque art is written as RGB rather than RGBA with every alpha at 255. */
function encodePng(width, height, pixels, channels){
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for(let y = 0; y < height; y++){
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* Reads back the PNGs this file writes (and any 8-bit non-interlaced PNG
   whose rows use filter 0-4). Verification compares decoded pixels rather
   than file bytes, because two builds of zlib may compress identical pixels
   differently and that is not drift. */
function decodePng(buf){
  if(buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not a PNG');
  let p = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while(p < buf.length){
    const len = buf.readUInt32BE(p);
    const kind = buf.toString('ascii', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if(kind === 'IHDR'){
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; type = data[9]; interlace = data[12];
    } else if(kind === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  if(depth !== 8 || interlace !== 0 || (type !== 2 && type !== 6)) throw new Error('unsupported PNG layout');
  const channels = type === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * channels);
  for(let y = 0; y < height; y++){
    const f = raw[y * (stride + 1)];
    for(let x = 0; x < stride; x++){
      const i = y * stride + x;
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= channels ? out[i - channels] : 0;
      const b = y > 0 ? out[i - stride] : 0;
      const c = x >= channels && y > 0 ? out[i - stride - channels] : 0;
      let pred = 0;
      if(f === 1) pred = a;
      else if(f === 2) pred = b;
      else if(f === 3) pred = (a + b) >> 1;
      else if(f === 4){
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        pred = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      out[i] = (v + pred) & 0xFF;
    }
  }
  return { width, height, channels, pixels: out };
}

/* ---------------------------------------------------------
   GEOMETRY
   Paths are command lists in a 1000 x 1000 space. The same list is
   written into the SVG masters and flattened for the rasteriser, so
   the vector files and the PNGs cannot describe different marks.
   --------------------------------------------------------- */
function Path(){
  const cmds = [];
  const api = {
    M: (x, y) => { cmds.push(['M', x, y]); return api; },
    L: (x, y) => { cmds.push(['L', x, y]); return api; },
    C: (x1, y1, x2, y2, x, y) => { cmds.push(['C', x1, y1, x2, y2, x, y]); return api; },
    Z: () => { cmds.push(['Z']); return api; },
    cmds: cmds
  };
  return api;
}

/* The open book. Each page's top and bottom edges lift through the middle
   of the page and dip into the spine; the outer edges are straight. Both
   edges take the same lift, so a page keeps an even thickness. */
function bookPath(b){
  const cx = 500, hw = b.hw, yo = b.yo, yg = b.yg, lift = b.lift, H = b.H, Hg = b.Hg;
  return Path()
    .M(cx - hw, yo)
    .C(cx - hw * 0.62, yo - lift, cx - hw * 0.22, yg - lift * 0.55, cx, yg)
    .C(cx + hw * 0.22, yg - lift * 0.55, cx + hw * 0.62, yo - lift, cx + hw, yo)
    .L(cx + hw, yo + H)
    .C(cx + hw * 0.62, yo + H - lift, cx + hw * 0.22, yg + Hg - lift * 0.55, cx, yg + Hg)
    .C(cx - hw * 0.22, yg + Hg - lift * 0.55, cx - hw * 0.62, yo + H - lift, cx - hw, yo + H)
    .Z().cmds;
}

function quadPath(x0, y0, x1, y1, x2, y2, x3, y3){
  return Path().M(x0, y0).L(x1, y1).L(x2, y2).L(x3, y3).Z().cmds;
}

function roundRectPath(x, y, w, h, r){
  const k = 0.5523 * r;
  return Path()
    .M(x + r, y).L(x + w - r, y).C(x + w - r + k, y, x + w, y + r - k, x + w, y + r)
    .L(x + w, y + h - r).C(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h)
    .L(x + r, y + h).C(x + r - k, y + h, x, y + h - r + k, x, y + h - r)
    .L(x, y + r).C(x, y + r - k, x + r - k, y, x + r, y)
    .Z().cmds;
}

/* ---------------------------------------------------------
   THE MARK — the single description every asset is drawn from
   --------------------------------------------------------- */
const PALETTE = {
  groundTop:  '#221C16',
  groundBase: '#0F0C0A',
  pageLight:  '#F7F0E6',
  pageShade:  '#E6D8C6',
  cover:      '#C8652B',
  lightTop:   '#FFCB78',
  lightBase:  '#EF7026'
};

const BOOK = { hw: 292, yo: 588, yg: 634, lift: 84, H: 172, Hg: 188 };
const COVER = { hw: BOOK.hw + 11, yo: BOOK.yo + 18, yg: BOOK.yg + 18, lift: BOOK.lift, H: BOOK.H, Hg: BOOK.Hg };
const LIGHT_TOP = 230;

/* A linear gradient along y. Colour and opacity are both piecewise linear
   between stops, so the SVG masters (which interpolate that way natively)
   and the PNGs describe the same fill. */
function gradient(y0, y1, stops){ return { y0: y0, y1: y1, stops: stops }; }
function solid(color){ return gradient(0, 1000, [{ t: 0, color: color }, { t: 1, color: color }]); }

function hexBetween(a, b, t){
  const ca = hexRgb(a), cb = hexRgb(b);
  return '#' + [0, 1, 2].map(i => Math.round(ca[i] + (cb[i] - ca[i]) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/* The light is at full strength where it leaves the spine and gone by
   LIGHT_TOP. Opacity follows a gentle ease, t^1.1, sampled at quarters and
   rounded, so most of the column stays readable at small sizes and only the
   last stretch dissolves. */
const LIGHT_FILL = gradient(LIGHT_TOP, BOOK.yg - 16, [0, 0.25, 0.5, 0.75, 1].map(t => ({
  t: t,
  color: hexBetween(PALETTE.lightTop, PALETTE.lightBase, t),
  opacity: Math.round(Math.pow(t, 1.1) * 100) / 100
})));

const MARK = [
  /* behind the pages, so the column has no visible base: it comes out of
     the book rather than standing on it */
  { name: 'light', path: quadPath(500 - 42, BOOK.yg + 70, 500 - 12, LIGHT_TOP, 500 + 12, LIGHT_TOP, 500 + 42, BOOK.yg + 70),
    fill: LIGHT_FILL },
  { name: 'cover', path: bookPath(COVER), fill: solid(PALETTE.cover) },
  { name: 'pages', path: bookPath(BOOK),
    fill: gradient(470, 790, [{ t: 0, color: PALETTE.pageLight }, { t: 1, color: PALETTE.pageShade }]) },
  /* the spine, where the cover shows between the pages and meets the light */
  { name: 'spine', path: quadPath(500 - 7, BOOK.yg + BOOK.Hg + 2, 500 - 6, BOOK.yg - 3, 500 + 6, BOOK.yg - 3, 500 + 7, BOOK.yg + BOOK.Hg + 2),
    fill: solid(PALETTE.cover) }
];

/* How the mark sits on each canvas: a scale about the centre, then a lift.
   The icon centres the book and the readable part of the light optically;
   the favicon, which nobody crops, spends more of its 32 pixels on them. */
const PLACEMENT = {
  icon:    { scale: 0.92, dy: -44 },
  favicon: { scale: 1.12, dy: -70 }
};

const SCENES = {
  icon:    { placement: PLACEMENT.icon, ground: 'bleed' },
  favicon: { placement: PLACEMENT.favicon, ground: 'rounded', radius: 220 },
  mark:    { placement: PLACEMENT.icon, ground: 'none' }
};

const GROUND = gradient(0, 1000, [{ t: 0, color: PALETTE.groundTop }, { t: 1, color: PALETTE.groundBase }]);

/* ---------------------------------------------------------
   RASTER
   Nonzero-winding scanline coverage: SS rows sampled per pixel, exact
   horizontal span coverage within each row. Clean edges at 29px, and
   fast enough to re-render every asset inside the contract suite.
   --------------------------------------------------------- */
const SS = 6;

function hexRgb(h){ return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

function sampleGradient(g, y){
  const t = g.y1 === g.y0 ? 0 : (y - g.y0) / (g.y1 - g.y0);
  const s = g.stops;
  let i = 0;
  while(i < s.length - 2 && t > s[i + 1].t) i++;
  const a = s[i], b = s[Math.min(i + 1, s.length - 1)];
  let u = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  if(u < 0) u = 0; if(u > 1) u = 1;
  const ca = hexRgb(a.color), cb = hexRgb(b.color);
  const oa = a.opacity === undefined ? 1 : a.opacity, ob = b.opacity === undefined ? 1 : b.opacity;
  return {
    rgb: [ca[0] + (cb[0] - ca[0]) * u, ca[1] + (cb[1] - ca[1]) * u, ca[2] + (cb[2] - ca[2]) * u],
    opacity: t <= 0 ? oa : t >= 1 ? ob : oa + (ob - oa) * u
  };
}

function flatten(cmds, place){
  const rings = [];
  let ring = null, cx = 0, cy = 0;
  const tf = (x, y) => [500 + (x - 500) * place.scale, 500 + (y - 500) * place.scale + place.dy];
  cmds.forEach(c => {
    if(c[0] === 'M'){ ring = [tf(c[1], c[2])]; rings.push(ring); cx = c[1]; cy = c[2]; }
    else if(c[0] === 'L'){ ring.push(tf(c[1], c[2])); cx = c[1]; cy = c[2]; }
    else if(c[0] === 'C'){
      for(let i = 1; i <= 48; i++){
        const t = i / 48, u = 1 - t;
        const x = u * u * u * cx + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5];
        const y = u * u * u * cy + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6];
        ring.push(tf(x, y));
      }
      cx = c[5]; cy = c[6];
    }
  });
  return rings;
}

function coverage(cmds, size, place){
  const cov = new Float32Array(size * size);
  const k = size / 1000;
  const edges = [];
  flatten(cmds, place).forEach(r => {
    for(let i = 0; i < r.length; i++){
      const a = r[i], b = r[(i + 1) % r.length];
      if(a[1] !== b[1]) edges.push([a[0] * k, a[1] * k, b[0] * k, b[1] * k]);
    }
  });
  const w = 1 / SS;
  for(let row = 0; row < size; row++){
    for(let s = 0; s < SS; s++){
      const yy = row + (s + 0.5) / SS;
      const xs = [];
      for(let e = 0; e < edges.length; e++){
        const x0 = edges[e][0], y0 = edges[e][1], x1 = edges[e][2], y1 = edges[e][3];
        if((y0 <= yy && yy < y1) || (y1 <= yy && yy < y0)){
          xs.push([x0 + (yy - y0) * (x1 - x0) / (y1 - y0), y1 > y0 ? 1 : -1]);
        }
      }
      if(!xs.length) continue;
      xs.sort((p, q) => p[0] - q[0]);
      let wind = 0, start = 0;
      for(let i = 0; i < xs.length; i++){
        const prev = wind;
        wind += xs[i][1];
        if(prev === 0 && wind !== 0) start = xs[i][0];
        else if(prev !== 0 && wind === 0){
          let a = Math.max(0, start), b = Math.min(size, xs[i][0]);
          if(b <= a) continue;
          const first = Math.floor(a), last = Math.min(size - 1, Math.ceil(b) - 1);
          for(let px = first; px <= last; px++){
            const o = Math.min(b, px + 1) - Math.max(a, px);
            if(o > 0) cov[row * size + px] += o * w;
          }
        }
      }
    }
  }
  for(let i = 0; i < cov.length; i++) if(cov[i] > 1) cov[i] = 1;
  return cov;
}

/* Straight alpha, painted in order. Returns RGB for opaque scenes and RGBA
   for the favicon, whose rounded corners are transparent. */
function render(sceneName, size){
  const scene = SCENES[sceneName];
  const place = scene.placement;
  const k = 1000 / size;
  const n = size * size;
  const rgb = new Float32Array(n * 3);
  const alpha = new Float32Array(n);

  if(scene.ground !== 'none'){
    const groundCov = scene.ground === 'rounded'
      ? coverage(roundRectPath(0, 0, 1000, 1000, scene.radius), size, { scale: 1, dy: 0 })
      : null;
    for(let y = 0; y < size; y++){
      const c = sampleGradient(GROUND, (y + 0.5) * k).rgb;
      for(let x = 0; x < size; x++){
        const i = y * size + x;
        rgb[i * 3] = c[0]; rgb[i * 3 + 1] = c[1]; rgb[i * 3 + 2] = c[2];
        alpha[i] = groundCov ? groundCov[i] : 1;
      }
    }
  }

  MARK.forEach(layer => {
    const cov = coverage(layer.path, size, place);
    for(let y = 0; y < size; y++){
      /* gradients live in the mark's own frame, so sample through the placement */
      const markY = 500 + ((y + 0.5) * k - place.dy - 500) / place.scale;
      const g = sampleGradient(layer.fill, markY);
      for(let x = 0; x < size; x++){
        const i = y * size + x;
        const a = cov[i] * g.opacity;
        if(a <= 0) continue;
        const outA = a + alpha[i] * (1 - a);
        for(let ch = 0; ch < 3; ch++){
          const dst = rgb[i * 3 + ch];
          rgb[i * 3 + ch] = outA > 0 ? (g.rgb[ch] * a + dst * alpha[i] * (1 - a)) / outA : 0;
        }
        alpha[i] = outA;
      }
    }
  });

  const channels = scene.ground === 'bleed' ? 3 : 4;
  const out = Buffer.alloc(n * channels);
  for(let i = 0; i < n; i++){
    for(let ch = 0; ch < 3; ch++) out[i * channels + ch] = Math.max(0, Math.min(255, Math.round(rgb[i * 3 + ch])));
    if(channels === 4) out[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(alpha[i] * 255)));
  }
  return { channels: channels, pixels: out };
}

/* ---------------------------------------------------------
   SVG — the vector masters, from the same commands and stops
   --------------------------------------------------------- */
function num(v){ return String(Math.round(v * 100) / 100); }
function svgD(cmds){ return cmds.map(c => c[0] === 'Z' ? 'Z' : c[0] + c.slice(1).map(num).join(' ')).join(' '); }

function svg(sceneName){
  const scene = SCENES[sceneName];
  const place = scene.placement;
  const defs = [], body = [];
  const grad = (id, g) => {
    const s = g.stops;
    if(s.length === 2 && s[0].color === s[1].color && s[0].opacity === undefined && s[1].opacity === undefined) return s[0].color;
    defs.push('<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="0" y1="' + num(g.y0) +
      '" x2="0" y2="' + num(g.y1) + '">' +
      g.stops.map(s => '<stop offset="' + num(s.t) + '" stop-color="' + s.color + '"' +
        (s.opacity === undefined ? '' : ' stop-opacity="' + num(s.opacity) + '"') + '/>').join('') +
      '</linearGradient>');
    return 'url(#' + id + ')';
  };
  if(scene.ground === 'bleed') body.push('<rect width="1000" height="1000" fill="' + grad('ground', GROUND) + '"/>');
  if(scene.ground === 'rounded') body.push('<path d="' + svgD(roundRectPath(0, 0, 1000, 1000, scene.radius)) + '" fill="' + grad('ground', GROUND) + '"/>');
  const group = MARK.map(layer => '<path d="' + svgD(layer.path) + '" fill="' + grad(layer.name, layer.fill) + '"/>');
  /* translate(500, 500 + dy) scale(s) translate(-500, -500): scale about the centre, then lift */
  body.push('<g transform="translate(' + num(500 - 500 * place.scale) + ' ' + num(500 - 500 * place.scale + place.dy) +
            ') scale(' + num(place.scale) + ')">' + group.join('') + '</g>');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">' +
    '<defs>' + defs.join('') + '</defs>' + body.join('') + '</svg>\n';
}

/* ---------------------------------------------------------
   ASSETS — every file the app and its store listing use
   --------------------------------------------------------- */
const ASSETS = [
  { file: 'icon-512.png',                 scene: 'icon',    size: 512,  use: 'manifest, any + maskable' },
  { file: 'icon-192.png',                 scene: 'icon',    size: 192,  use: 'manifest, any + maskable' },
  { file: 'apple-touch-icon.png',         scene: 'icon',    size: 180,  use: 'iOS home screen' },
  { file: 'favicon-32.png',               scene: 'favicon', size: 32,   use: 'browser tab' },
  { file: 'favicon.svg',                  scene: 'favicon',             use: 'browser tab, scalable' },
  { file: 'brand/app-icon-1024.png',      scene: 'icon',    size: 1024, use: 'App Store master, no alpha' },
  { file: 'brand/new-covenant-icon.svg',  scene: 'icon',                use: 'vector master, full bleed' },
  { file: 'brand/new-covenant-mark.svg',  scene: 'mark',                use: 'the mark alone, transparent' }
];

function build(asset){
  if(asset.size){
    const r = render(asset.scene, asset.size);
    return encodePng(asset.size, asset.size, r.pixels, r.channels);
  }
  return Buffer.from(svg(asset.scene), 'utf8');
}

/* Drift means different PIXELS or different SVG text, never merely
   different compression — or different line endings, which a Windows
   checkout with core.autocrlf adds to every text file it writes. */
function matches(asset, onDisk){
  if(!asset.size) return onDisk.toString('utf8').replace(/\r\n/g, '\n') === svg(asset.scene);
  let got;
  try{ got = decodePng(onDisk); }catch(e){ return false; }
  const want = render(asset.scene, asset.size);
  return got.width === asset.size && got.height === asset.size &&
         got.channels === want.channels && got.pixels.equals(want.pixels);
}

/* The furthest solid point of the mark from the centre of an icon canvas,
   as a fraction of the width. The light is excluded where it has faded
   below a quarter of its strength, because a crop there removes nothing
   anyone can see. */
function solidExtent(){
  const place = PLACEMENT.icon;
  let far = 0;
  MARK.forEach(layer => flatten(layer.path, place).forEach(r => r.forEach(p => {
    const markY = 500 + (p[1] - place.dy - 500) / place.scale;
    if(sampleGradient(layer.fill, markY).opacity < 0.25) return;
    far = Math.max(far, Math.sqrt((p[0] - 500) * (p[0] - 500) + (p[1] - 500) * (p[1] - 500)) / 1000);
  })));
  return far;
}

function run(mode){
  if(mode === 'verify'){
    const drift = ASSETS.filter(a => {
      const p = path.join(ROOT, a.file);
      return !fs.existsSync(p) || !matches(a, fs.readFileSync(p));
    });
    if(drift.length){
      console.error('icons:verify  FAILED — these no longer match scripts/icons.js:');
      drift.forEach(a => console.error('  - ' + a.file));
      console.error('\n  Run `npm run icons` to redraw them.');
      return 1;
    }
    console.log('icons:verify  ok — ' + ASSETS.length + ' assets match the mark');
    return 0;
  }
  fs.mkdirSync(path.join(ROOT, 'brand'), { recursive: true });
  ASSETS.forEach(a => {
    const file = path.join(ROOT, a.file);
    fs.writeFileSync(file, build(a));
    console.log('  wrote ' + a.file.padEnd(30) + (fs.statSync(file).size / 1024).toFixed(1).padStart(6) + ' KB   ' + a.use);
  });
  console.log('icons  done — solid mark within ' + solidExtent().toFixed(3) + ' of the width from centre (maskable limit 0.40)');
  return 0;
}

if(require.main === module) process.exit(run((process.argv[2] || '').toLowerCase()));
module.exports = { ASSETS, PALETTE, PLACEMENT, SCENES, MARK, build, render, svg, matches, encodePng, decodePng, solidExtent };
