/* =========================================================
   OFFICIAL SCRIPTURE CORPUS
   ---------------------------------------------------------
   Downloads and caches the publisher's own release of the
   translation this app quotes, and records exactly which bytes
   were used.

     node scripts/corpus.js sync     download + cache + write the lock
     node scripts/corpus.js status   report what is cached, offline

   WHICH EDITION, AND WHY IT MATTERS
   "World English Bible" is not one text. eBible.org publishes
   several editions under similar names, and they disagree on the
   divine name:

     eng-web    World English Bible Classic   "Yahweh"   <- this app
     engwebp    World English Bible           "the LORD"
     engwebu    World English Bible Updated   "the LORD"

   This app quotes the Classic edition. That is not a preference
   about which is better — it is the edition the shipped text has
   always been, and changing it would silently rewrite Scripture
   under readers who had memorised it. A future edition change must
   be a deliberate, announced decision, never a side effect of
   re-running a script.

   WHY THE CORPUS IS NOT COMMITTED
   It is ~24 MB across two archives, and committing it would put
   the whole Bible in a repository whose product is 365 passages.
   Instead `data/corpus.lock.json` records the SHA-256 of every
   archive, so any machine can re-download and prove it received
   the same bytes this dataset was built from.
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, '.corpus-cache');
const LOCK = path.join(ROOT, 'data', 'corpus.lock.json');

/* The edition, pinned. See the header before changing this. */
/* The editions this app ships.

   Only the ID and the language label are declared here. Everything that
   matters for trust — the title, the abbreviation, the copyright statement,
   whether the publisher marks it redistributable and certified — is DERIVED
   from the archives at sync time and recorded in data/corpus.lock.json.
   A licence typed into source is a claim; a licence read out of the
   publisher's own metadata and pinned by hash is evidence.

   `language` is the label shown in Settings, in the language itself. It is
   the one string here a human chooses, because the archives give a name in
   English ("Spanish") and the picker should say "Español". */
const EDITIONS = {
  'eng-web':   { id: 'eng-web',   language: 'English', lang: 'en' },
  'spaRV1909': { id: 'spaRV1909', language: 'Español', lang: 'es' },

  /* HELD — downloaded, hashed and audited, but NOT shipped.

     Louis Segond 1910 numbers a psalm's title line as verse 1, so from there
     on its numbering runs one ahead of the numbering our canonical ids use.
     45 of the 415 passages we ship sit in a chapter whose verse count differs,
     and two were checked by hand and are demonstrably the wrong sentence:

       Isaiah 9:6   we mean "For a child is born to us"
                    LSG 9:6 is what we call 9:7; the right verse is 9:5
       Psalm 20:7   we mean "Some trust in chariots"
                    LSG 20:7 is what we call 20:6; the right verse is 20:8

     Not every flagged chapter is wrong — Nahum 1:7, Mark 9:24 and 3 John 1:4
     line up correctly — so a count-based offset would be a guess, and the
     archives carry no versification mapping to derive a real one from.
     Matching by meaning across languages is inventing a mapping, which is
     the one thing this pipeline may never do.

     Shipping it would have put the wrong verse on the home screen: Psalm 20:7
     was that day's reading. It stays here, with its hashes in the lock, until
     an authoritative mapping exists. */
  'fraLSG':    { id: 'fraLSG',    language: 'Français', lang: 'fr',
                 held: 'versification does not align with our canonical ids' }
};
const DEFAULT_EDITION = 'eng-web';
/* The editions the app actually ships, in display order. */
function shippedEditions(){
  return Object.keys(EDITIONS).filter(id => !EDITIONS[id].held);
}

/* Two archives, each carrying something the other does not.
   - vpl  : one verse per line, flat text, no markup. The verse text.
   - usfx : structured markup. The only place a psalm superscription is
            identified AS a superscription rather than guessed at from
            the shape of the sentence. */
function archivesFor(id){
  return [
    { name: 'vpl',  url: 'https://ebible.org/Scriptures/' + id + '_vpl.zip' },
    { name: 'usfx', url: 'https://ebible.org/Scriptures/' + id + '_usfx.zip' }
  ];
}

function sha256(buf){ return crypto.createHash('sha256').update(buf).digest('hex'); }

function readLock(){
  try{ return JSON.parse(fs.readFileSync(LOCK, 'utf8')); }
  catch(e){ return null; }
}

/* ---------------------------------------------------------
   ZIP
   A minimal reader for the one thing these archives are: stored
   or deflated entries with a central directory at the end. Written
   out rather than shelling to a platform unzip, because the build
   has to behave the same on every machine that runs it.
   --------------------------------------------------------- */
const zlib = require('zlib');

function unzip(buf){
  const files = {};
  /* Find the end-of-central-directory record by scanning back from the
     end — the comment field means it is not at a fixed offset. */
  let eocd = -1;
  for(let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--){
    if(buf.readUInt32LE(i) === 0x06054b50){ eocd = i; break; }
  }
  if(eocd === -1) throw new Error('not a zip archive: no end-of-central-directory record');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for(let n = 0; n < count; n++){
    if(buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt central directory at entry ' + n);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');

    /* The local header repeats the name and extra lengths, and they are
       allowed to differ from the central directory's. Read them there. */
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.slice(dataStart, dataStart + compSize);

    if(!/\/$/.test(name)){
      files[name] = method === 0 ? raw : zlib.inflateRawSync(raw);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/* ---------------------------------------------------------
   SYNC
   --------------------------------------------------------- */
/* Plain https rather than fetch. undici gives up connecting to eBible after
   ten seconds and reports only "fetch failed"; the host is simply slow to
   answer, and curl gets the same file without complaint. Retries are bounded
   and a real HTTP status is never retried — only the transport giving up. */
function download(url, attempt){
  attempt = attempt || 1;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 120000 }, res => {
      if(res.statusCode >= 300 && res.statusCode < 400 && res.headers.location){
        res.resume();
        return resolve(download(res.headers.location, attempt));
      }
      if(res.statusCode !== 200){
        res.resume();
        return reject(new Error(url + ' — HTTP ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', e => {
      if(attempt >= 4) return reject(e);
      setTimeout(() => resolve(download(url, attempt + 1)), attempt * 3000);
    });
  });
}

/* One edition. Its archives land in .corpus-cache/<id>/ and its hashes in
   the lock under that id, so editions cannot overwrite one another and each
   carries its own provenance. */
async function syncEdition(id, previous){
  const dir = cacheDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const before = previous && previous.editions && previous.editions[id];
  const archives = {};

  for(const a of archivesFor(id)){
    process.stdout.write('  ' + id + ' ' + a.name + ' … ');
    const buf = await download(a.url);
    const digest = sha256(buf);
    const priorArchive = before && before.archives && before.archives[a.name];
    const changed = priorArchive && priorArchive.sha256 !== digest;

    const files = unzip(buf);
    Object.keys(files).forEach(name => {
      fs.writeFileSync(path.join(dir, path.basename(name)), files[name]);
    });

    archives[a.name] = { url: a.url, bytes: buf.length, sha256: digest, entries: Object.keys(files).length };
    console.log(buf.length + ' bytes, sha256 ' + digest.slice(0, 16) + '…' +
                (changed ? '  ** CHANGED since the last sync **' : ''));
    if(changed){
      console.log('     was ' + priorArchive.sha256.slice(0, 16) + '… — the publisher has revised this edition.');
      console.log('     Re-run `npm run scripture:build` and read the diff before committing.');
    }
  }

  /* Read back out of the bytes just written, never asserted here. */
  const meta = derivedMeta(id);
  return Object.assign({}, EDITIONS[id], meta, { archives: archives });
}

async function sync(only){
  fs.mkdirSync(CACHE, { recursive: true });
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  const previous = readLock();
  const ids = only ? [only] : Object.keys(EDITIONS);
  const editions = Object.assign({}, (previous && previous.editions) || {});

  console.log('corpus:sync  ' + ids.length + ' edition(s) from eBible.org');
  for(const id of ids){
    editions[id] = await syncEdition(id, previous);
    console.log('     ' + editions[id].title + '  [' + editions[id].iso + ']');
  }

  fs.writeFileSync(LOCK, JSON.stringify({
    editions: editions,
    syncedAt: new Date().toISOString().slice(0, 10)
  }, null, 2) + '\n');
  console.log('  lock written to data/corpus.lock.json');
  return 0;
}

function status(){
  const lock = readLock();
  if(!lock){ console.error('corpus:status  no lock file — run `npm run corpus:sync`'); return 1; }
  const ids = Object.keys(lock.editions || {});
  console.log('corpus:status  ' + ids.length + ' edition(s), synced ' + lock.syncedAt);
  let cachedTotal = 0;
  ids.forEach(id => {
    const e = lock.editions[id];
    const dir = cacheDir(id);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    cachedTotal += files.length;
    console.log('  ' + id.padEnd(11) + ' ' + String(e.title).slice(0, 34).padEnd(36) + files.length + ' file(s)');
    Object.keys(e.archives || {}).forEach(k => {
      console.log('      ' + k.padEnd(6) + e.archives[k].sha256.slice(0, 24) + '…  ' + e.archives[k].bytes + ' bytes');
    });
  });
  const cached = { length: cachedTotal };
  if(!cached.length){
    console.log('\n  The cache is empty. `npm run corpus:sync` restores it; the lock above');
    console.log('  says which bytes it must produce.');
    return 1;
  }
  return 0;
}

/* ---------------------------------------------------------
   READING THE CACHE — used by the build
   --------------------------------------------------------- */
function cacheDir(id){ return path.join(CACHE, id); }

/* Per edition. The archives all use the same file suffixes, so a flat cache
   would have three editions silently overwriting one another. */
function cachedFile(id, suffix){
  const dir = cacheDir(id);
  if(!fs.existsSync(dir)) throw new Error('no cached corpus for ' + id + ' — run `npm run corpus:sync`');
  const f = fs.readdirSync(dir).find(n => n.endsWith(suffix));
  if(!f) throw new Error(id + ' cache is missing a *' + suffix + ' file — run `npm run corpus:sync`');
  return fs.readFileSync(path.join(dir, f), 'utf8');
}

/* Rights and identity, read out of the publisher's own DBL metadata rather
   than asserted here. Returns whatever the archive actually states. */
function derivedMeta(id){
  const xml = cachedFile(id, 'metadata.xml');
  const one = t => {
    const m = xml.match(new RegExp('<' + t + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + t + '>'));
    return m ? m[1].replace(/<[^>]*>/g, ' ').replace(/&lt;[\s\S]*?&gt;/g, ' ')
                   .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() : null;
  };
  const ident = xml.slice(xml.indexOf('<identification>'), xml.indexOf('</identification>'));
  const pick = (block, t) => {
    const m = block.match(new RegExp('<' + t + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + t + '>'));
    return m ? m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : null;
  };
  const langBlock = xml.slice(xml.indexOf('<language>'), xml.indexOf('</language>'));
  return {
    title: pick(ident, 'name'),
    abbr: pick(ident, 'abbreviationLocal') || pick(ident, 'abbreviation'),
    scope: pick(ident, 'scope'),
    languageName: pick(langBlock, 'name'),
    iso: pick(langBlock, 'iso'),
    script: pick(langBlock, 'script'),
    direction: pick(langBlock, 'scriptDirection'),
    copyright: one('statement')
  };
}

/* Verse text, keyed "BOOK C:V" with standard SIL/UBS book codes. */
function verses(id){
  const map = new Map();
  const re = /<v b="([A-Z0-9]{3})" c="(\d+)" v="(\d+)">([\s\S]*?)<\/v>/g;
  const xml = cachedFile(id || DEFAULT_EDITION, '_vpl.xml');
  let m;
  while((m = re.exec(xml)) !== null) map.set(m[1] + ' ' + m[2] + ':' + m[3], m[4]);
  if(!map.size) throw new Error('no verses parsed from the cached corpus for ' + (id || DEFAULT_EDITION));
  return map;
}

/* The publisher's own name for each book, keyed by SIL code. Spanish gets
   "Salmos" and "Juan" because the archive says so, not because anyone here
   translated them. An edition that ships no names simply has none, and the
   canonical English reference stands. */
function bookNames(id){
  const out = {};
  let xml;
  try{ xml = cachedFile(id, 'BookNames.xml'); }catch(e){ return out; }
  const re = /<book code="([A-Z0-9]{3})"[^>]*\bshort="([^"]*)"/g;
  let m;
  while((m = re.exec(xml)) !== null){ if(m[2]) out[m[1]] = m[2]; }
  return out;
}

/* Psalm superscriptions, keyed "BOOK C". Taken from the publisher's own
   <d> markup, so nothing here is inferred from the text. */
function superscriptions(id){
  const xml = cachedFile(id || DEFAULT_EDITION, '_usfx.xml');
  const map = new Map();
  let book = null, chapter = null;
  const re = /<book id="([A-Z0-9]{3})"|<c id="(\d+)"[^>]*\/?>|<d style="d">([\s\S]*?)<\/d>/g;
  let m;
  while((m = re.exec(xml)) !== null){
    if(m[1]){ book = m[1]; chapter = null; continue; }
    if(m[2]){ chapter = Number(m[2]); continue; }
    /* A footnote sits inside the title element and is not part of it. */
    const text = m[3]
      .replace(/<f\b[\s\S]*?<\/f>/g, '')
      .replace(/<x\b[\s\S]*?<\/x>/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if(text) map.set(book + ' ' + chapter, text);
  }
  return map;
}

if(require.main === module){
  const mode = (process.argv[2] || 'status').toLowerCase();
  if(mode === 'sync'){
    sync(process.argv[3]).then(c => process.exit(c)).catch(e => { console.error('corpus:sync  ERROR — ' + e.message); process.exit(1); });
  } else {
    process.exit(status());
  }
}

module.exports = { EDITIONS, DEFAULT_EDITION, shippedEditions, archivesFor, bookNames, CACHE, cacheDir, LOCK, readLock,
                   sha256, verses, superscriptions, unzip, cachedFile, derivedMeta };
