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

  /* AUDITED AND SHIPPED. Public Domain per the archive metadata, contributed
     by BSB Publishing LLC, completed 2020, no draft marker. 66 books - its
     declared scope is 'Bible without Deuterocanon' and all 66 are present -
     1189 chapters, 0 empty addresses. Its numbering agrees with WEB: the 16
     chapters whose verse sets differ are the standard critical-text
     omissions (MAT 17:21, MRK 9:44, JHN 5:4, ACT 8:37 and so on) plus the
     Romans doxology, all of which are ABSENCES at an address rather than a
     different sentence at it. It prints 'the LORD' where WEB prints
     'Yahweh'; that is its own published choice and is shown as published. */
  'engbsb':    { id: 'engbsb',    language: 'English', lang: 'en' },

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
                 held: 'versification does not align with our canonical ids' },

  /* ---- GATE 3 ----
     Six candidates were downloaded, hashed and audited. Four ship and two
     hold, which is the outcome the gate is for: an edition earns `held`
     removed only when its rights, its canon and its numbering all check out,
     and `npm run versify` proves the last of those against the whole corpus.

     All six are Public Domain and Redistributable per eBible's own catalogue,
     and all six are complete 66-book Bibles whose numbering agrees with our
     canonical ids. The two holds are not about the text. */

  /* SHIPPED. Public Domain, Redistributable and Certified per eBible's
     catalogue, completed 1901, 66 books. Its numbering agrees with ours
     everywhere except the Romans doxology, which every edition but WEB
     Classic prints at 16:26-27 — an append past our last verse, not a
     displacement. Its 16 empty addresses are the classic critical-text
     omissions (MAT 17:21, MRK 9:44, JHN 5:4, ACT 8:37 …) at exactly the
     numbers our ids use, which is corroboration that its numbering is ours. */
  'eng-asv':   { id: 'eng-asv',   language: 'English',    lang: 'en' },

  /* SHIPPED. Public Domain, Redistributable and Certified, completed 1912,
     66 books, 1187 of 1189 chapters numbered identically to ours. */
  'deu1912':   { id: 'deu1912',   language: 'Deutsch',    lang: 'de' },

  /* HELD — and not for anything wrong with the Bible.

     Rights, canon and numbering all pass: Public Domain, Redistributable,
     Certified, 66 books, numbering identical to ours in 1187 of 1189
     chapters. The problem is its name. The archive's `abbreviationLocal` is
     "DO885" and its rights page carries the line "The Diodati Bible was
     published in 1885" — both of which belong to ita1885, a DIFFERENT
     Italian edition that eBible publishes separately.

     Four other publisher identifiers agree the text itself is the Riveduta:
     title "Riveduta Bibbia 1927", dateCompleted 1927, swordName ita1927eb,
     FCBHID ITARIV. So the words are almost certainly right. But the only
     authoritative abbreviation this pipeline has for it names another
     translation, and the two honest options are to print "DO885" beside
     "Riveduta Bibbia 1927" — which tells a reader the wrong thing — or to
     type an abbreviation by hand, which is the one thing rule 52 forbids.

     It holds until the archive names it correctly. Nothing else about it
     needs to change. */
  'ita1927':   { id: 'ita1927',   language: 'Italiano',   lang: 'it',
                 held: 'the archive’s abbreviation belongs to a different Italian edition' },

  /* HELD — eBible marks it Certified: False.

     Every edition this app has ever shipped is Certified: True, and so is
     the French one it holds for other reasons, so certification is the
     standard here rather than a detail. It is not a rubber stamp either:
     only 59% of the 1550 editions in the catalogue carry it.

     There is no alternative. eBible publishes exactly two full Dutch Bibles
     and the other one — NBG-vertaling 1951 — is under copyright. So Dutch
     holds, and holds honestly, rather than being filled with the only thing
     available. */
  'nld':       { id: 'nld',       language: 'Nederlands', lang: 'nl',
                 held: 'the publisher has not certified this edition' },

  /* SHIPPED, both scripts. Public Domain, Redistributable and Certified.
     Two separate publications, not one text transformed: eBible builds each
     from its own source, and converting between scripts here would be this
     app rewriting Chinese.

     They bridge 70 verse spans — one block of text printed across two verse
     numbers, `<v v="20-21">` — which the VPL parser used to drop on the
     floor. See verses(). The audit that found it is why these ship with 141
     addresses of text rather than 141 blanks. */
  'cmn-cu89s': { id: 'cmn-cu89s', language: '中文（简体）', lang: 'zh-Hans' },
  'cmn-cu89t': { id: 'cmn-cu89t', language: '中文（繁體）', lang: 'zh-Hant' }
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
    /* The edition's own name for itself: 'Lutherbibel 1912' beside the
       catalogue's English 'German Luther Bible 1912'. Both are the
       publisher's; the picker leads with this one and keeps the English
       underneath, so a reader sees the name the edition actually goes by. */
    titleLocal: pick(ident, 'nameLocal'),
    abbr: pick(ident, 'abbreviationLocal') || pick(ident, 'abbreviation'),
    scope: pick(ident, 'scope'),
    languageName: pick(langBlock, 'name'),
    iso: pick(langBlock, 'iso'),
    script: pick(langBlock, 'script'),
    direction: pick(langBlock, 'scriptDirection'),
    copyright: one('statement')
  };
}

/* Verse text, keyed "BOOK C:V" with standard SIL/UBS book codes.

   BRIDGED VERSES. A publisher may print one block of text for a span of
   verses — `<v b="NUM" c="1" v="20-21">` — where separating them would mean
   inventing a sentence break the translator did not make. The Chinese Union
   Version does this 70 times; WEB Classic does it 6 times in Sirach.

   This regex required `v="(\d+)"`, so every one of those blocks failed to
   match and was DROPPED ENTIRELY. Nothing reported it: the address simply
   had no text, which is indistinguishable from a publisher leaving it blank.

   In WEB Classic that cost exactly one verse — 4 Maccabees 8:28-29. Its five
   other bridged spans are empty in the archive itself, so those really are
   publisher omissions and always were. The Chinese Union Version bridges 70
   times and every one of them carries text, which is how this surfaced: 141
   addresses would have shipped blank.

   The text is anchored at the FIRST verse of the span, which is where the
   publisher's own USFX puts it (`bcv="NUM.1.20"` on that same block). The
   remaining addresses in the span genuinely have no separate text, so they
   stay absent — an absence is an absence, and inventing a split here would
   be writing Scripture. */
function verses(id){
  const map = new Map();
  const re = /<v b="([A-Z0-9]{3})" c="(\d+)" v="(\d+)(?:-\d+)?">([\s\S]*?)<\/v>/g;
  const xml = cachedFile(id || DEFAULT_EDITION, '_vpl.xml');
  let m;
  while((m = re.exec(xml)) !== null) map.set(m[1] + ' ' + m[2] + ':' + m[3], m[4]);
  if(!map.size) throw new Error('no verses parsed from the cached corpus for ' + (id || DEFAULT_EDITION));
  return map;
}

/* The spans a publisher printed as one block, keyed "BOOK C:first" -> last.
   Carried so a reader can be told the verse they are looking at covers 20-21
   rather than being left to wonder why 21 is missing. */
function bridgedSpans(id){
  const out = new Map();
  const re = /<v b="([A-Z0-9]{3})" c="(\d+)" v="(\d+)-(\d+)">/g;
  const xml = cachedFile(id || DEFAULT_EDITION, '_vpl.xml');
  let m;
  while((m = re.exec(xml)) !== null) out.set(m[1] + ' ' + m[2] + ':' + m[3], Number(m[4]));
  return out;
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

module.exports = { EDITIONS, DEFAULT_EDITION, shippedEditions, archivesFor, bookNames, bridgedSpans, CACHE, cacheDir, LOCK, readLock,
                   sha256, verses, superscriptions, unzip, cachedFile, derivedMeta };
