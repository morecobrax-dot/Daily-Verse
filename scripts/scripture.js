/* =========================================================
   SCRIPTURE SOURCING
   ---------------------------------------------------------
   The verse text in index.html is DERIVED, not typed. It is
   fetched verbatim from a public-domain translation and written
   into the SCRIPTURE region between markers, the same way
   config:sync writes derived identity.

     node scripts/scripture.js fetch    fetch and rewrite the region
     node scripts/scripture.js verify   re-fetch and diff, writing nothing

   WHY THIS SCRIPT EXISTS
   Scripture typed from memory is the single most likely way this
   product could ship something false. A remembered verse is
   usually close and occasionally wrong, and "close" is not a
   standard a Bible app should hold itself to. So no verse text is
   ever hand-authored or hand-edited: it comes from the wire, the
   returned reference is checked against the one requested, and
   `verify` re-fetches so anyone can prove the shipped bytes still
   match the source.

   Neither command runs as part of `npm run verify` — that suite is
   offline and deterministic by design. This one needs a network.

   THE REFLECTIONS ARE NOT TOUCHED BY THIS SCRIPT.
   They are original writing and live in their own structure,
   keyed by reference. Changing translation re-fetches Scripture
   and leaves every reflection intact.
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP_PATH = path.join(ROOT, 'index.html');
const API = 'https://bible-api.com/';

/* The translation. Every English option this source carries is public
   domain; WEB is chosen for modern readable English. Switching is a
   one-word edit here plus a re-fetch — which is the whole point of
   deriving the text rather than typing it. */
const TRANSLATION = { id: 'web', abbr: 'WEB', name: 'World English Bible', license: 'Public Domain' };

/* ---------------------------------------------------------
   THE CURATION
   Reference and theme only. Not a line of verse text lives here
   — that is the script's entire reason for existing.
   --------------------------------------------------------- */
const CURATION = [
  ['comfort', ['Psalm 34:18', 'Psalm 147:3', 'Matthew 5:4', 'Isaiah 41:10', '2 Corinthians 1:3-4',
    'Psalm 23:4', 'Revelation 21:4', 'John 14:27', 'Psalm 46:1', 'Matthew 11:28']],
  ['strength', ['Isaiah 40:31', 'Philippians 4:13', 'Psalm 28:7', 'Ephesians 6:10', '2 Corinthians 12:9',
    'Psalm 73:26', 'Psalm 121:1-2', 'Isaiah 41:13', 'Isaiah 12:2', '1 Chronicles 16:11']],
  ['hope', ['Jeremiah 29:11', 'Romans 15:13', 'Psalm 42:11', 'Lamentations 3:22-23', 'Romans 8:28',
    'Hebrews 11:1', 'Psalm 130:5', 'Isaiah 40:29', 'Romans 5:3-5', 'Micah 7:7']],
  ['guidance', ['Proverbs 3:5-6', 'Psalm 119:105', 'James 1:5', 'Proverbs 16:9', 'Isaiah 30:21',
    'Psalm 32:8', 'Proverbs 4:23', 'Psalm 25:4-5', 'Proverbs 19:21', 'Psalm 143:8']],
  ['peace', ['Philippians 4:6-7', 'John 16:33', 'Psalm 4:8', 'Isaiah 26:3', '1 Peter 5:7',
    'Matthew 6:34', 'Psalm 55:22', 'Colossians 3:15', '2 Thessalonians 3:16', 'Psalm 29:11']],
  ['courage', ['Joshua 1:9', 'Deuteronomy 31:6', '2 Timothy 1:7', 'Psalm 27:1', '1 Corinthians 16:13',
    'Isaiah 43:2', 'Psalm 56:3', 'Psalm 31:24', 'Proverbs 28:1', 'Psalm 138:3']],
  ['love', ['1 Corinthians 13:4-7', '1 John 4:19', 'John 15:12', 'Romans 8:38-39', '1 John 4:7',
    'Colossians 3:14', '1 Peter 4:8', 'Proverbs 17:17', 'Song of Solomon 8:7', 'John 13:34']],
  ['gratitude', ['1 Thessalonians 5:16-18', 'Psalm 100:4', 'Philippians 4:4', 'Psalm 118:24', 'James 1:17',
    'Colossians 3:17', 'Psalm 107:1', 'Psalm 16:11', 'Ecclesiastes 3:12', 'Psalm 34:1']],
  ['perseverance', ['Galatians 6:9', 'James 1:12', 'Hebrews 12:1', '2 Timothy 4:7', '2 Corinthians 4:16-17',
    '1 Corinthians 9:24', 'Philippians 3:14', 'James 1:2-4', 'Hebrews 10:36', 'Isaiah 43:19']],
  ['grace', ['Ephesians 4:32', '1 John 1:9', 'Psalm 145:8', 'Ephesians 2:8-9', 'Psalm 103:12',
    'Micah 7:18', 'Matthew 6:14', 'Romans 8:1', 'Hebrews 4:16', 'Psalm 51:10']],
  ['trust', ['Psalm 56:3-4', 'Mark 11:24', 'Hebrews 11:6', 'Psalm 37:5-6', 'Isaiah 26:4',
    '2 Corinthians 5:7', 'Psalm 62:8', 'Psalm 9:10', 'Psalm 20:7', 'Nahum 1:7']],
  ['purpose', ['Ephesians 2:10', 'Jeremiah 1:5', 'Matthew 5:16', '1 Peter 4:10', 'Romans 12:2',
    'Colossians 3:23-24', 'Proverbs 16:3', 'Psalm 138:8', 'Philippians 1:6', '1 Corinthians 10:31']]
];

function flatCuration(){
  const out = [];
  CURATION.forEach(pair => pair[1].forEach(ref => out.push({ ref: ref, theme: pair[0] })));
  return out;
}

/* ---------------------------------------------------------
   FETCH
   --------------------------------------------------------- */
function slug(ref){ return encodeURIComponent(ref.toLowerCase()).replace(/%20/g, '+'); }

/* The source normalises a single psalm to the plural book name. Comparing
   normalised forms means a genuine mismatch — asking for one verse and
   being handed another — is still caught, which is the check that matters. */
function normaliseRef(ref){
  return String(ref).replace(/^Psalms\b/, 'Psalm').replace(/\s+/g, ' ').trim();
}

/* Poetry arrives with line breaks inside a verse. They are layout, not words:
   collapsing them changes nothing a reader would call the text. */
function collapse(text){ return String(text).replace(/\s+/g, ' ').trim(); }

function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

/* The source rate-limits anonymous callers. A 429 is the service asking to be
   left alone for a moment, not a missing verse — retrying with a widening gap
   is the difference between a complete fetch and a curation that silently
   ships short. Anything still failing after this is a real failure. */
const PACE_MS = 2200;
const RETRIES = 5;

async function request(url){
  let wait = PACE_MS;
  for(let attempt = 0; attempt <= RETRIES; attempt++){
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if(res.status !== 429) return res;
    if(attempt === RETRIES) return res;
    await sleep(wait);
    wait *= 2;
  }
}

async function fetchVerse(entry){
  const url = API + slug(entry.ref) + '?translation=' + TRANSLATION.id;
  const res = await request(url);
  if(!res.ok) throw new Error(entry.ref + ' — HTTP ' + res.status);
  const json = await res.json();

  if(!json || typeof json.text !== 'string' || !json.text.trim()){
    throw new Error(entry.ref + ' — the source returned no text');
  }
  /* Asking for one reference and silently being handed another is exactly the
     failure that would put a wrong verse on someone's screen. */
  const got = normaliseRef(json.reference);
  const want = normaliseRef(entry.ref);
  if(got !== want) throw new Error('asked for ' + want + ', source returned ' + got);
  if(json.translation_id !== TRANSLATION.id){
    throw new Error(entry.ref + ' — wrong translation: ' + json.translation_id);
  }
  return { ref: want, theme: entry.theme, text: collapse(json.text) };
}

async function fetchAll(){
  const list = flatCuration();
  const out = [];
  const failures = [];
  for(let i = 0; i < list.length; i++){
    process.stdout.write('\r  fetching ' + (i + 1) + '/' + list.length + '  ' + list[i].ref.padEnd(28));
    try{ out.push(await fetchVerse(list[i])); }
    catch(e){ failures.push(e.message); }
    await sleep(PACE_MS);
  }
  process.stdout.write('\r' + ' '.repeat(64) + '\r');
  return { verses: out, failures: failures };
}

/* ---------------------------------------------------------
   EMIT
   --------------------------------------------------------- */
const BEGIN = '/* SCRIPTURE-BEGIN';
const END = '/* SCRIPTURE-END */';

function esc(s){ return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

function buildRegion(verses){
  const rows = verses.map(function(v){
    return "  { ref: '" + esc(v.ref) + "', theme: '" + esc(v.theme) + "',\n" +
           "    text: '" + esc(v.text) + "' }";
  }).join(',\n');
  return [
    ' — fetched verbatim by `node scripts/scripture.js fetch`. Do not hand-edit. */',
    'const SCRIPTURE_SOURCE = {',
    "  translation: '" + esc(TRANSLATION.name) + "',",
    "  abbr: '" + esc(TRANSLATION.abbr) + "',",
    "  license: '" + esc(TRANSLATION.license) + "',",
    "  origin: '" + esc(API) + "',",
    "  fetched: '" + new Date().toISOString().slice(0, 10) + "'",
    '};',
    '',
    'const SCRIPTURE = [',
    rows,
    '];'
  ].join('\n');
}

function readApp(){
  const raw = fs.readFileSync(APP_PATH, 'utf8');
  return { crlf: raw.indexOf('\r\n') !== -1, text: raw.split('\r\n').join('\n') };
}

function writeRegion(region){
  const r = readApp();
  const a = r.text.indexOf(BEGIN);
  const b = r.text.indexOf(END);
  if(a === -1 || b === -1 || b < a){
    throw new Error('markers not found in index.html — refusing to guess where the verses go');
  }
  const next = r.text.slice(0, a + BEGIN.length) + '\n' + region + '\n' + r.text.slice(b);
  fs.writeFileSync(APP_PATH, r.crlf ? next.split('\n').join('\r\n') : next);
}

/* The embedded verses, read back out of the shipped file. */
function embedded(){
  const H = require('../test/harness.js');
  return H.loadApp().ctx.SCRIPTURE || [];
}

/* ---------------------------------------------------------
   RUN
   --------------------------------------------------------- */
async function run(mode){
  if(mode === 'fetch'){
    console.log('scripture:fetch  ' + TRANSLATION.name + ' (' + TRANSLATION.license + ')');
    const result = await fetchAll();
    if(result.failures.length){
      console.error('  FAILED — ' + result.failures.length + ' reference(s) could not be sourced:');
      result.failures.forEach(function(f){ console.error('    ' + f); });
      console.error('\n  Nothing was written. A partial fetch would ship fewer days than the');
      console.error('  curation claims, which is worse than failing loudly.');
      return 1;
    }
    writeRegion(buildRegion(result.verses));
    console.log('  ' + result.verses.length + ' verses written to index.html');
    const themes = [];
    result.verses.forEach(function(v){ if(themes.indexOf(v.theme) === -1) themes.push(v.theme); });
    console.log('  themes: ' + themes.join(', '));
    return 0;
  }

  if(mode === 'verify'){
    const have = embedded();
    if(!have.length){ console.error('scripture:verify  no verses are embedded'); return 1; }
    console.log('scripture:verify  re-fetching ' + have.length + ' verses from ' + API);
    const drift = [];
    for(let i = 0; i < have.length; i++){
      process.stdout.write('\r  checking ' + (i + 1) + '/' + have.length + '  ' + have[i].ref.padEnd(28));
      try{
        const fresh = await fetchVerse({ ref: have[i].ref, theme: have[i].theme });
        if(fresh.text !== have[i].text) drift.push(have[i].ref);
      }catch(e){ drift.push(have[i].ref + ' (' + e.message + ')'); }
      await sleep(PACE_MS);
    }
    process.stdout.write('\r' + ' '.repeat(64) + '\r');
    if(drift.length){
      console.error('  DRIFT — ' + drift.length + ' verse(s) no longer match the source:');
      drift.forEach(function(d){ console.error('    ' + d); });
      return 1;
    }
    console.log('  ok — every embedded verse still matches ' + TRANSLATION.name + ' at the source');
    return 0;
  }

  console.error('usage: node scripts/scripture.js fetch|verify');
  return 1;
}

if(require.main === module){
  run((process.argv[2] || '').toLowerCase())
    .then(function(code){ process.exit(code); })
    .catch(function(e){ console.error('scripture  ERROR — ' + e.message); process.exit(1); });
}

module.exports = { CURATION: CURATION, flatCuration: flatCuration, TRANSLATION: TRANSLATION,
                   normaliseRef: normaliseRef, collapse: collapse };
