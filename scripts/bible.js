#!/usr/bin/env node
/* =========================================================
   BIBLE — the full reader corpus, derived from the pinned archives

   The curated Daily corpus (scripts/scripture.js) and this are different
   things and must stay different things. The curated set is 415 chosen
   passages carrying themes, reflections and daily eligibility. This is the
   publisher's complete Bible, and it carries none of that: it is the text
   resolver behind the reader and nothing else. Turning every verse into a
   daily candidate is the failure this separation exists to prevent.

   Everything here is DERIVED. No verse is typed, edited or reordered. The
   inputs are the same SHA-256-pinned eBible archives the curated build uses,
   so the reader cannot disagree with the daily verse about what a passage
   says — both read the same bytes.

   OUTPUT
     data/bible/<edition>/index.json   book list, publisher names, chapter counts
     data/bible/<edition>/<CODE>.json  one file per book
     data/bible.lock.json              SHA-256 of every generated file

   One file per book was measured against the alternatives:
     whole edition   WEB 4.75MB raw / 1.45MB gzip — a parse cost every reader
                     pays even if they only wanted today's verse
     per book        81 + 66 files, avg 60KB, max 221KB (Psalms)
     per chapter     2591 files — too many for a reliable offline cache
   ========================================================= */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const corpus = require('./corpus.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'bible');
const LOCK = path.join(ROOT, 'data', 'bible.lock.json');

/* The deuterocanonical book codes of the USFM/SIL registry. This is a
   published standard list, not a judgement made here: it exists so the
   picker can group what an edition actually contains without pretending
   every edition contains the same thing. WEB Classic ships all 15; Reina
   Valera 1909 ships none. Both are shown exactly as published. */
const DC_CODES = ['TOB', 'JDT', 'ESG', 'WIS', 'SIR', 'BAR', '1MA', '2MA',
                  '1ES', 'MAN', 'PS2', '3MA', '2ES', '4MA', 'DAG'];
const NT_FIRST = 'MAT';

function sha256(s){ return crypto.createHash('sha256').update(s).digest('hex'); }

/* Collapse runs of whitespace. The same normalisation the curated build
   applies, so a verse read here is byte-identical to the same verse read
   through the daily pipeline. */
function collapse(s){ return String(s).replace(/\s+/g, ' ').trim(); }

/* Books in the order the publisher's own archive lists them, each with the
   chapters it actually contains. Nothing is added, removed or reordered. */
function structure(id){
  const verses = corpus.verses(id);
  const order = [];
  const books = new Map();
  for(const [key, text] of verses){
    const sp = key.indexOf(' ');
    const code = key.slice(0, sp);
    const cv = key.slice(sp + 1).split(':');
    const c = Number(cv[0]), v = Number(cv[1]);
    if(!books.has(code)){ books.set(code, new Map()); order.push(code); }
    const ch = books.get(code);
    if(!ch.has(c)) ch.set(c, new Map());
    ch.get(c).set(v, collapse(text));
  }
  return { order, books };
}

function groupOf(code, order){
  if(DC_CODES.indexOf(code) !== -1) return 'dc';
  return order.indexOf(code) < order.indexOf(NT_FIRST) ? 'ot' : 'nt';
}

function buildEdition(id, report){
  const { order, books } = structure(id);
  const names = corpus.bookNames(id);
  const supers = corpus.superscriptions(id);
  /* Verse spans the publisher printed as one block. Carried so the reader can
     label that verse "20-21" and draw nothing at 21, instead of printing an
     empty line there and claiming the verse is "not in this edition" — which
     would be a false statement about the publisher's own text. The Chinese
     Union Version does this 70 times. */
  const spans = corpus.bridgedSpans(id);
  const files = {};
  const index = { edition: id, books: [] };
  let chapterCount = 0, verseCount = 0, supCount = 0, emptyCount = 0;

  for(const code of order){
    const chapters = books.get(code);
    const nums = [...chapters.keys()].sort((a, b) => a - b);

    /* A gap in the chapter numbering would mean the archive was parsed
       wrongly, not that the publisher skipped a chapter. Refuse rather
       than ship a Bible with a hole in it. */
    nums.forEach((n, i) => {
      if(n !== i + 1) throw new Error(id + ' ' + code + ': chapter ' + n + ' out of sequence');
    });

    const ch = [];
    const sup = {};
    const bridged = {};
    for(const n of nums){
      const vs = chapters.get(n);
      const max = Math.max(...vs.keys());
      const arr = [];
      for(let v = 1; v <= max; v++){
        /* An address the publisher left empty stays empty. RV1909 does this
           where the Hebrew tradition ends a chapter one verse earlier than
           the English one; deleting the address would hide a real
           difference, and inventing text for it is unthinkable. */
        const t = vs.has(v) ? vs.get(v) : '';
        if(!t) emptyCount++;
        arr.push(t);
      }
      /* Record the spans this chapter carries, first verse -> last. */
      for(let v = 1; v <= max; v++){
        const last = spans.get(code + ' ' + n + ':' + v);
        if(last && last > v){ bridged[n] = bridged[n] || {}; bridged[n][v] = last; }
      }
      verseCount += arr.length;
      chapterCount++;

      /* Rule 48 and the curated build's own convention: a superscription is
         SEPARATED from verse 1, never deleted and never merged. Only where
         the publisher marked one, and only as an exact prefix. */
      const title = supers.get(code + ' ' + n);
      if(title){
        const prefix = collapse(title);
        if(arr[0].indexOf(prefix) === 0){
          arr[0] = collapse(arr[0].slice(prefix.length));
          sup[n] = prefix;
          supCount++;
        } else {
          report.warnings.push(id + ' ' + code + ' ' + n +
            ' — superscription recorded but verse 1 does not begin with it; left inline');
        }
      }
      ch.push(arr);
    }

    const name = names[code] || code;
    files[code] = { c: code, n: name, ch: ch };
    if(Object.keys(sup).length) files[code].sup = sup;
    if(Object.keys(bridged).length) files[code].bv = bridged;
    index.books.push({ c: code, n: name, g: groupOf(code, order), ch: ch.length });
  }

  report.editions[id] = {
    books: index.books.length,
    chapters: chapterCount,
    verses: verseCount,
    superscriptions: supCount,
    emptyVerses: emptyCount
  };
  return { index, files };
}

function write(id, built, lock){
  const dir = path.join(OUT, id);
  fs.mkdirSync(dir, { recursive: true });
  const entries = {};
  const put = (name, obj) => {
    const json = JSON.stringify(obj);
    fs.writeFileSync(path.join(dir, name), json);
    entries[name] = { sha256: sha256(json), bytes: json.length };
  };
  put('index.json', built.index);
  Object.keys(built.files).forEach(code => put(code + '.json', built.files[code]));
  lock[id] = entries;
}

/* Every generated byte re-derived from the pinned archives and compared to
   the lock. This is the full corpus's own verification: the curated set's
   415-passage check proves nothing about the other 30,000 verses. */
function verify(){
  if(!fs.existsSync(LOCK)){
    console.error('bible:verify  no data/bible.lock.json — run bible:build first');
    return 1;
  }
  const lock = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
  const report = { editions: {}, warnings: [] };
  let bad = 0, checked = 0;
  for(const id of Object.keys(lock.editions)){
    const built = buildEdition(id, report);
    const fresh = {};
    fresh['index.json'] = JSON.stringify(built.index);
    Object.keys(built.files).forEach(c => { fresh[c + '.json'] = JSON.stringify(built.files[c]); });
    const pinned = lock.editions[id];
    const names = new Set([...Object.keys(pinned), ...Object.keys(fresh)]);
    for(const name of names){
      checked++;
      const onDisk = path.join(OUT, id, name);
      if(!pinned[name]){ console.error('  ' + id + '/' + name + ' — generated but not pinned'); bad++; continue; }
      if(fresh[name] === undefined){ console.error('  ' + id + '/' + name + ' — pinned but no longer derives'); bad++; continue; }
      if(sha256(fresh[name]) !== pinned[name].sha256){
        console.error('  ' + id + '/' + name + ' — re-derived bytes differ from the lock'); bad++; continue;
      }
      if(!fs.existsSync(onDisk)){ console.error('  ' + id + '/' + name + ' — missing from data/bible'); bad++; continue; }
      if(sha256(fs.readFileSync(onDisk, 'utf8')) !== pinned[name].sha256){
        console.error('  ' + id + '/' + name + ' — shipped file does not match the lock'); bad++;
      }
    }
    const s = report.editions[id];
    console.log('  ' + id.padEnd(11) + s.books + ' books, ' + s.chapters + ' chapters, ' +
                s.verses + ' verses, ' + s.superscriptions + ' superscriptions, ' +
                s.emptyVerses + ' addresses the publisher left empty');
  }
  report.warnings.forEach(w => console.log('  note: ' + w));
  if(bad){ console.error('bible:verify  FAILED — ' + bad + ' of ' + checked + ' files'); return 1; }
  console.log('bible:verify  ok — ' + checked + ' files re-derived from the pinned archives, byte for byte');
  return 0;
}

function build(){
  const ids = corpus.shippedEditions();
  const report = { editions: {}, warnings: [] };
  const lock = { editions: {}, builtFrom: {}, generator: 'scripts/bible.js' };
  fs.rmSync(OUT, { recursive: true, force: true });
  for(const id of ids){
    const built = buildEdition(id, report);
    write(id, built, lock.editions);
    const s = report.editions[id];
    console.log('  ' + id.padEnd(11) + s.books + ' books, ' + s.chapters + ' chapters, ' +
                s.verses + ' verses, ' + s.superscriptions + ' superscriptions, ' +
                s.emptyVerses + ' empty addresses');
  }
  /* The archives these bytes came from, so a reader's Bible can be traced to
     a publisher file with a known digest. */
  const corpusLock = corpus.readLock();
  ids.forEach(id => {
    const e = corpusLock.editions && corpusLock.editions[id];
    if(e) lock.builtFrom[id] = e.archives;
  });
  fs.writeFileSync(LOCK, JSON.stringify(lock, null, 2));
  report.warnings.forEach(w => console.log('  note: ' + w));
  const total = Object.keys(lock.editions).reduce((n, id) => n + Object.keys(lock.editions[id]).length, 0);
  console.log('bible:build  ' + total + ' files written to data/bible');
  return 0;
}

if(require.main === module){
  const mode = (process.argv[2] || 'build').toLowerCase();
  try{
    process.exit(mode === 'verify' ? verify() : build());
  }catch(e){
    console.error('bible:' + mode + '  ERROR — ' + e.message);
    process.exit(1);
  }
}

module.exports = { buildEdition, structure, groupOf, DC_CODES, OUT, LOCK };
