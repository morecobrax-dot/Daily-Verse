/* =========================================================
   CANONICAL SCRIPTURE DATASET
   ---------------------------------------------------------
     node scripts/scripture.js build    derive the dataset into index.html
     node scripts/scripture.js verify   re-derive and diff, writing nothing
     node scripts/scripture.js audit    report on the catalogue, offline

   Both build and verify read the CACHED official corpus
   (scripts/corpus.js), so they are offline and deterministic.
   Nothing here reaches the network.

   WHY THE TEXT IS DERIVED AND NEVER TYPED
   Scripture written from memory is the single most likely way
   this product could ship something false. A remembered verse is
   usually close and occasionally wrong, and "close" is not a
   standard a Bible app gets to hold itself to. So no verse text
   is ever hand-authored or hand-edited: data/curation.json names
   references, and every character of text comes from the
   publisher's own release.

   NORMALISATION — the only two changes made to the source text
   1. WHITESPACE. Runs of whitespace collapse to a single space and
      the result is trimmed. The corpus preserves poetry line
      structure as whitespace; collapsing it changes no word.
   2. PSALM SUPERSCRIPTIONS. "For the Chief Musician. By the sons of
      Korah. According to Alamoth." is liturgical apparatus attached
      to verse 1, not the sentence a reader came for. Where a
      passage starts at verse 1 of a psalm that carries one, it is
      removed — by exact prefix match against the publisher's own
      <d> markup, never by pattern-guessing at the text. A passage
      where the recorded superscription is not found at the start
      is a build failure, not a silent pass.

   Both rules are recorded per passage, so any transformation this
   file performed can be seen from the shipped data.

   THE REFLECTIONS ARE NOT TOUCHED BY THIS SCRIPT.
   They are original writing in their own structure, keyed by
   canonical id. Re-deriving Scripture — or changing edition —
   cannot alter a line of them.
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const corpus = require('./corpus.js');

const ROOT = path.join(__dirname, '..');
const APP_PATH = path.join(ROOT, 'index.html');
const CURATION = path.join(ROOT, 'data', 'curation.json');

/* Standard SIL/UBS book codes, which is what the corpus is keyed by. */
const BOOKS = {
  'Genesis':'GEN','Exodus':'EXO','Leviticus':'LEV','Numbers':'NUM','Deuteronomy':'DEU',
  'Joshua':'JOS','Judges':'JDG','Ruth':'RUT','1 Samuel':'1SA','2 Samuel':'2SA',
  '1 Kings':'1KI','2 Kings':'2KI','1 Chronicles':'1CH','2 Chronicles':'2CH','Ezra':'EZR',
  'Nehemiah':'NEH','Esther':'EST','Job':'JOB','Psalm':'PSA','Proverbs':'PRO',
  'Ecclesiastes':'ECC','Song of Solomon':'SNG','Isaiah':'ISA','Jeremiah':'JER',
  'Lamentations':'LAM','Ezekiel':'EZK','Daniel':'DAN','Hosea':'HOS','Joel':'JOL',
  'Amos':'AMO','Obadiah':'OBA','Jonah':'JON','Micah':'MIC','Nahum':'NAM',
  'Habakkuk':'HAB','Zephaniah':'ZEP','Haggai':'HAG','Zechariah':'ZEC','Malachi':'MAL',
  'Matthew':'MAT','Mark':'MRK','Luke':'LUK','John':'JHN','Acts':'ACT',
  'Romans':'ROM','1 Corinthians':'1CO','2 Corinthians':'2CO','Galatians':'GAL',
  'Ephesians':'EPH','Philippians':'PHP','Colossians':'COL','1 Thessalonians':'1TH',
  '2 Thessalonians':'2TH','1 Timothy':'1TI','2 Timothy':'2TI','Titus':'TIT',
  'Philemon':'PHM','Hebrews':'HEB','James':'JAS','1 Peter':'1PE','2 Peter':'2PE',
  '1 John':'1JN','2 John':'2JN','3 John':'3JN','Jude':'JUD','Revelation':'REV'
};

function readCuration(){ return JSON.parse(fs.readFileSync(CURATION, 'utf8')); }

function parseRef(ref){
  const m = String(ref).match(/^((?:[123] )?[A-Za-z][A-Za-z ]*?) (\d+):(\d+)(?:-(\d+))?$/);
  if(!m) return null;
  const code = BOOKS[m[1]];
  if(!code) return null;
  const from = Number(m[3]);
  const to = m[4] ? Number(m[4]) : from;
  if(to < from) return null;
  return { book: m[1], code: code, chapter: Number(m[2]), from: from, to: to };
}

/* The canonical id. Derived from the reference, so it is stable across
   rebuilds, edition changes and catalogue growth — which is what lets a
   saved verse or a written reflection keep pointing at the right passage
   however the catalogue moves underneath it. */
function canonicalId(p){
  return p.code + '.' + p.chapter + '.' + p.from + (p.to !== p.from ? '-' + p.to : '');
}

function collapse(s){ return String(s).replace(/\s+/g, ' ').trim(); }

/* ---------------------------------------------------------
   DERIVE
   --------------------------------------------------------- */
function build(){
  const cur = readCuration();
  const verses = corpus.verses();
  const supers = corpus.superscriptions();
  const lock = corpus.readLock();
  if(!lock) throw new Error('no data/corpus.lock.json — run `npm run corpus:sync` first');

  const themes = new Set(cur._themes);
  const out = [];
  const errors = [];
  const seen = new Set();

  cur.passages.forEach(entry => {
    const p = parseRef(entry.ref);
    if(!p){ errors.push(entry.ref + ' — cannot be parsed as a reference'); return; }

    const id = canonicalId(p);
    if(seen.has(id)){ errors.push(entry.ref + ' — duplicate canonical id ' + id); return; }
    seen.add(id);

    if(!entry.themes || !entry.themes.length){ errors.push(entry.ref + ' — no theme tags'); return; }
    const badTheme = entry.themes.filter(t => !themes.has(t));
    if(badTheme.length){ errors.push(entry.ref + ' — unknown theme(s): ' + badTheme.join(', ')); return; }

    const parts = [];
    for(let v = p.from; v <= p.to; v++){
      const key = p.code + ' ' + p.chapter + ':' + v;
      if(!verses.has(key)){ errors.push(entry.ref + ' — ' + key + ' is not in the corpus'); return; }
      parts.push(verses.get(key));
    }

    let text = collapse(parts.join(' '));
    let stripped = false;

    /* Rule 2. Only ever at verse 1, only where the publisher recorded a
       title, and only as an exact prefix. Anything else is a failure. */
    const sup = p.from === 1 ? supers.get(p.code + ' ' + p.chapter) : null;
    if(sup){
      const prefix = collapse(sup);
      if(text.indexOf(prefix) !== 0){
        errors.push(entry.ref + ' — a superscription is recorded for this chapter but the ' +
                    'passage does not begin with it; refusing to guess');
        return;
      }
      text = collapse(text.slice(prefix.length));
      stripped = true;
    }

    if(text.length < 8){ errors.push(entry.ref + ' — derived text is implausibly short'); return; }

    const rec = { id: id, ref: entry.ref, themes: entry.themes.slice(), text: text };
    if(stripped) rec.sup = 1;
    out.push(rec);
  });

  if(errors.length){
    const e = new Error(errors.length + ' passage(s) failed to derive');
    e.detail = errors;
    throw e;
  }
  return { passages: out, lock: lock, curation: cur };
}

/* A hash over the content that matters — id and text, in catalogue order.
   Two machines that derive the same dataset get the same digest, which is
   what makes "the shipped text is the published text" checkable rather than
   asserted. Themes are deliberately excluded: retagging is an editorial
   change and must not read as the Scripture having moved.

   The separators below are NUL and SOH, written as escape sequences rather
   than as the characters themselves. Git classifies a source file holding
   literal control bytes as binary and stops diffing it, which is the last
   thing the file carrying this product's trust argument should be. They are
   the right separators because neither can occur in a reference or in
   Scripture, so no passage can forge a boundary and two different catalogues
   cannot be made to collide onto a single digest. */
function datasetHash(passages){
  const canon = passages.map(p => p.id + '\u0000' + p.text).join('\u0001');
  return crypto.createHash('sha256').update(canon, 'utf8').digest('hex');
}

/* ---------------------------------------------------------
   EMIT
   --------------------------------------------------------- */
const BEGIN = '/* SCRIPTURE-BEGIN';
const END = '/* SCRIPTURE-END */';

function esc(s){ return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

function region(built){
  const hash = datasetHash(built.passages);
  const ed = built.lock.edition;
  const rows = built.passages.map(p =>
    "  { id: '" + esc(p.id) + "', ref: '" + esc(p.ref) + "'," +
    " themes: [" + p.themes.map(t => "'" + esc(t) + "'").join(', ') + "]," +
    (p.sup ? " sup: 1," : "") + "\n" +
    "    text: '" + esc(p.text) + "' }"
  ).join(',\n');

  return [
    ' — derived by `npm run scripture:build` from the corpus in data/corpus.lock.json.',
    '   Do not hand-edit. */',
    'const SCRIPTURE_SOURCE = {',
    "  edition: '" + esc(ed.id) + "',",
    "  title: '" + esc(ed.title) + "',",
    "  abbr: '" + esc(ed.abbr) + "',",
    "  language: '" + esc(ed.language) + "',",
    "  license: '" + esc(ed.license) + "',",
    "  publisher: '" + esc(ed.publisher) + "',",
    "  divineName: '" + esc(ed.divineName) + "',",
    "  corpusSynced: '" + esc(built.lock.syncedAt) + "',",
    "  datasetHash: '" + hash + "',",
    "  built: '" + new Date().toISOString().slice(0, 10) + "'",
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

function writeRegion(text){
  const r = readApp();
  const a = r.text.indexOf(BEGIN);
  const b = r.text.indexOf(END);
  if(a === -1 || b === -1 || b < a){
    throw new Error('SCRIPTURE markers not found in index.html — refusing to guess where the dataset goes');
  }
  const next = r.text.slice(0, a + BEGIN.length) + '\n' + text + '\n' + r.text.slice(b);
  fs.writeFileSync(APP_PATH, r.crlf ? next.split('\n').join('\r\n') : next);
}

function shipped(){
  const H = require('../test/harness.js');
  const ctx = H.loadApp().ctx;
  return { passages: ctx.SCRIPTURE || [], source: ctx.SCRIPTURE_SOURCE || {}, reflections: ctx.REFLECTIONS || {} };
}

/* ---------------------------------------------------------
   RUN
   --------------------------------------------------------- */
function run(mode){
  if(mode === 'build'){
    const built = build();
    writeRegion(region(built));
    console.log('scripture:build  ' + built.lock.edition.title + ' (' + built.lock.edition.id + ')');
    console.log('  passages     : ' + built.passages.length);
    console.log('  superscript. : ' + built.passages.filter(p => p.sup).length + ' normalised');
    console.log('  dataset hash : ' + datasetHash(built.passages));
    return 0;
  }

  if(mode === 'verify'){
    const built = build();
    const have = shipped().passages;
    const wantHash = datasetHash(built.passages);
    const haveHash = datasetHash(have);
    console.log('scripture:verify  re-derived from the cached official corpus');
    console.log('  shipped   : ' + have.length + ' passages, hash ' + haveHash.slice(0, 16) + '…');
    console.log('  re-derived: ' + built.passages.length + ' passages, hash ' + wantHash.slice(0, 16) + '…');
    if(wantHash === haveHash){
      console.log('  ok — every shipped character matches the published edition');
      return 0;
    }
    const byId = new Map(have.map(p => [p.id, p]));
    let shown = 0;
    built.passages.forEach(p => {
      const h = byId.get(p.id);
      if(h && h.text === p.text) return;
      if(shown++ >= 10) return;
      console.error('  DRIFT ' + p.id + ' (' + p.ref + ')');
      console.error('    shipped   : ' + (h ? h.text : '(absent)'));
      console.error('    published : ' + p.text);
    });
    console.error('  FAILED — the shipped dataset is not what the corpus produces.');
    return 1;
  }

  if(mode === 'audit'){
    const s = shipped();
    const withRefl = s.passages.filter(p => typeof s.reflections[p.id] === 'string' && s.reflections[p.id].trim());
    const themes = {};
    s.passages.forEach(p => (p.themes || []).forEach(t => { themes[t] = (themes[t] || 0) + 1; }));
    const books = new Set(s.passages.map(p => p.id.split('.')[0]));
    console.log('scripture:audit');
    console.log('  edition      : ' + s.source.title + ' (' + s.source.edition + ')');
    console.log('  dataset hash : ' + s.source.datasetHash);
    console.log('  passages     : ' + s.passages.length);
    console.log('  with a reflection (daily-eligible) : ' + withRefl.length);
    console.log('  awaiting a reflection              : ' + (s.passages.length - withRefl.length));
    console.log('  distinct books : ' + books.size);
    console.log('  themes       : ' + Object.keys(themes).sort().map(t => t + ':' + themes[t]).join('  '));
    return 0;
  }

  console.error('usage: node scripts/scripture.js build|verify|audit');
  return 1;
}

if(require.main === module){
  try{ process.exit(run((process.argv[2] || '').toLowerCase())); }
  catch(e){
    console.error('scripture  ERROR — ' + e.message);
    if(e.detail) e.detail.slice(0, 20).forEach(d => console.error('    ' + d));
    process.exit(1);
  }
}

module.exports = { BOOKS, parseRef, canonicalId, collapse, build, datasetHash };
