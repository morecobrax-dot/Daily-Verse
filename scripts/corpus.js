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

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, '.corpus-cache');
const LOCK = path.join(ROOT, 'data', 'corpus.lock.json');

/* The edition, pinned. See the header before changing this. */
const EDITION = {
  id: 'eng-web',
  title: 'World English Bible Classic',
  abbr: 'WEB',
  language: 'English (United States)',
  license: 'Public Domain',
  publisher: 'eBible.org',
  divineName: 'Yahweh'
};

/* Two archives, each carrying something the other does not.
   - vpl  : one verse per line, flat text, no markup. The verse text.
   - usfx : structured markup. The only place a psalm superscription is
            identified AS a superscription rather than guessed at from
            the shape of the sentence. */
const ARCHIVES = [
  { name: 'vpl',  url: 'https://ebible.org/Scriptures/eng-web_vpl.zip' },
  { name: 'usfx', url: 'https://ebible.org/Scriptures/eng-web_usfx.zip' }
];

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
async function download(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error(url + ' — HTTP ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

async function sync(){
  fs.mkdirSync(CACHE, { recursive: true });
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });

  console.log('corpus:sync  ' + EDITION.title + ' (' + EDITION.id + ') from ' + EDITION.publisher);
  const previous = readLock();
  const archives = {};

  for(const a of ARCHIVES){
    process.stdout.write('  ' + a.name + ' … ');
    const buf = await download(a.url);
    const digest = sha256(buf);
    const before = previous && previous.archives && previous.archives[a.name];
    const changed = before && before.sha256 !== digest;

    const files = unzip(buf);
    Object.keys(files).forEach(name => {
      fs.writeFileSync(path.join(CACHE, path.basename(name)), files[name]);
    });

    archives[a.name] = { url: a.url, bytes: buf.length, sha256: digest, entries: Object.keys(files).length };
    console.log(buf.length + ' bytes, sha256 ' + digest.slice(0, 16) + '…' +
                (changed ? '  ** CHANGED since the last sync **' : ''));
    if(changed){
      console.log('     was ' + before.sha256.slice(0, 16) + '… — the publisher has revised this edition.');
      console.log('     Re-run `npm run scripture:build` and read the diff before committing.');
    }
  }

  const lock = {
    edition: EDITION,
    archives: archives,
    syncedAt: new Date().toISOString().slice(0, 10)
  };
  fs.writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n');
  console.log('  lock written to data/corpus.lock.json');
  return 0;
}

function status(){
  const lock = readLock();
  if(!lock){ console.error('corpus:status  no lock file — run `npm run corpus:sync`'); return 1; }
  const cached = fs.existsSync(CACHE) ? fs.readdirSync(CACHE) : [];
  console.log('corpus:status  ' + lock.edition.title + ' (' + lock.edition.id + ')');
  console.log('  synced   : ' + lock.syncedAt);
  Object.keys(lock.archives).forEach(k => {
    console.log('  ' + k.padEnd(8) + ' : ' + lock.archives[k].sha256.slice(0, 24) + '…  ' +
                lock.archives[k].bytes + ' bytes');
  });
  console.log('  cache    : ' + cached.length + ' file(s) in .corpus-cache/');
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
function cachedFile(suffix){
  const f = fs.readdirSync(CACHE).find(n => n.endsWith(suffix));
  if(!f) throw new Error('corpus cache is missing a *' + suffix + ' file — run `npm run corpus:sync`');
  return fs.readFileSync(path.join(CACHE, f), 'utf8');
}

/* Verse text, keyed "BOOK C:V" with standard SIL/UBS book codes. */
function verses(){
  const map = new Map();
  const re = /<v b="([A-Z0-9]{3})" c="(\d+)" v="(\d+)">([\s\S]*?)<\/v>/g;
  const xml = cachedFile('_vpl.xml');
  let m;
  while((m = re.exec(xml)) !== null) map.set(m[1] + ' ' + m[2] + ':' + m[3], m[4]);
  if(!map.size) throw new Error('no verses parsed from the cached corpus');
  return map;
}

/* Psalm superscriptions, keyed "BOOK C". Taken from the publisher's own
   <d> markup, so nothing here is inferred from the text. */
function superscriptions(){
  const xml = cachedFile('_usfx.xml');
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
    sync().then(c => process.exit(c)).catch(e => { console.error('corpus:sync  ERROR — ' + e.message); process.exit(1); });
  } else {
    process.exit(status());
  }
}

module.exports = { EDITION, ARCHIVES, CACHE, LOCK, readLock, sha256, verses, superscriptions, unzip };
