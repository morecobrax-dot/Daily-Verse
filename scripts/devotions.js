#!/usr/bin/env node
/* =========================================================
   DEVOTIONS — the catalogue, and what has to be true of it

   Devotional writing is the first content in this app that takes a passage
   and says something about the reader's life. That is a different kind of
   risk from quoting a verse, and this file is where the risk is checked.

   It does NOT build anything into index.html. Phase A ships no reader, so
   nothing here touches the SCRIPTURE region or the dataset hash. The anchors
   are resolved in memory, for validation only.

   Three things are checked that no other content in this repo needs:

     1. Every passage and every basis reference resolves in EVERY shipped
        edition. A devotional whose anchor is missing in Spanish is a
        devotional that breaks for a Spanish reader.
     2. No prose reproduces six consecutive words of any shipped passage,
        using the same primitive Learn uses. Devotional prose is long and
        discursive, so the temptation to retype a verse is higher here than
        anywhere else in the app.
     3. No prose makes the specific claims devotional writing fails by:
        that God has spoken privately to the reader, arranged their
        circumstances, or promised them an outcome.

   What this cannot check is whether a devotional is TRUE, or good, or
   pastorally wise. That needs a person, and the report says so.
   ========================================================= */

const fs = require('fs');
const path = require('path');
const S = require('./scripture.js');
const corpus = require('./corpus.js');

const ROOT = path.join(__dirname, '..');
const CATALOGUE = path.join(ROOT, 'data', 'devotions.json');

const FOR_WHOM = ['everyone', 'men', 'women'];
const ACCESS = ['free', 'premium'];

/* Claims a devotional may not make. Deliberately short: this catches the
   obvious failures of the genre, and pretends nothing about orthodoxy.
   Matched against normalised prose, so punctuation and case do not matter. */
const FORBIDDEN_CLAIMS = [
  { pattern: 'god is telling you', why: 'presents a private revelation as Scripture' },
  { pattern: 'god told me to tell you', why: 'presents a private revelation as Scripture' },
  { pattern: 'god is saying to you', why: 'presents a private revelation as Scripture' },
  { pattern: 'god put this in front of you', why: 'claims God arranged the reader\'s circumstances' },
  { pattern: 'god brought you here because', why: 'claims God arranged the reader\'s circumstances' },
  { pattern: 'god wants to give you', why: 'promises an outcome Scripture has not promised' },
  { pattern: 'god is about to give you', why: 'promises an outcome Scripture has not promised' },
  { pattern: 'your breakthrough', why: 'prosperity framing' },
  { pattern: 'claim your', why: 'prosperity framing' },
  { pattern: 'speak it into', why: 'prosperity framing' },
  { pattern: 'god is preparing you for', why: 'claims knowledge of the reader\'s future' }
];

/* Blanket statements about a whole sex. A series may be written TOWARD a set
   of life patterns; the Scripture in it belongs to everyone, and no entry
   gets to tell half the human race what it is like. */
const STEREOTYPE_CLAIMS = [
  'men always', 'men never', 'men naturally', 'men are wired',
  'women always', 'women never', 'women naturally', 'women are wired',
  'every man wants', 'every woman wants',
  'as a man you', 'as a woman you',
  'real men', 'a real woman', 'godly men always', 'godly women always'
];

function readCatalogue(){
  return JSON.parse(fs.readFileSync(CATALOGUE, 'utf8'));
}

/* Every reader-visible string on an entry, named, so the overlap guard and
   the claim lints scan exactly what a person can actually see. A field that
   renders and is exempt from these checks is the hole they exist to close. */
function entryFields(e){
  return {
    title: e.title,
    reading: e.reading,
    consider: (e.consider || []).join(' — '),
    practice: e.practice || '',
    prayer: e.prayer || ''
  };
}

function validate(doc, errors, notes){
  const max = doc._authoring || {};
  const readingMax = max.readingMax || 5200;
  const considerMax = max.considerMax || 200;
  const considerCountMax = max.considerCountMax || 2;
  const practiceMax = max.practiceMax || 320;
  const prayerMax = max.prayerMax || 600;

  if(typeof doc.version !== 'number'){ errors.push('catalogue — version must be a number'); }
  if(!Array.isArray(doc.series) || !doc.series.length){
    errors.push('catalogue — no series'); return { entries: [], refs: [] };
  }

  const seriesIds = new Set();
  const allEntries = [];
  const allRefs = [];

  doc.series.forEach(s => {
    const at = 'series ' + (s.id || '?');
    if(!s.id || !s.title || !s.summary){ errors.push(at + ' — missing id, title or summary'); return; }
    if(seriesIds.has(s.id)){ errors.push(at + ' — duplicate series id'); return; }
    seriesIds.add(s.id);
    if(FOR_WHOM.indexOf(s.forWhom) === -1){
      errors.push(at + ' — forWhom must be one of ' + FOR_WHOM.join(' | ') + ', got ' + JSON.stringify(s.forWhom));
    }
    if(ACCESS.indexOf(s.access) === -1){
      errors.push(at + ' — access must be one of ' + ACCESS.join(' | ') + ', got ' + JSON.stringify(s.access));
    }
    if(typeof s.audience !== 'string' || !s.audience){
      errors.push(at + ' — missing audience (who this is written toward)');
    }
    if(!Array.isArray(s.entries) || !s.entries.length){ errors.push(at + ' — no entries'); return; }

    const entryIds = new Set();
    s.entries.forEach(e => {
      const where = s.id + '/' + (e.id || '?');
      if(!e.id){ errors.push(where + ' — missing entry id'); return; }
      if(entryIds.has(e.id)){ errors.push(where + ' — duplicate entry id within its series'); return; }
      entryIds.add(e.id);
      if(!e.title){ errors.push(where + ' — missing title'); }

      /* The two required fields. An entry with no anchor is not a devotional,
         and an entry with no basis cannot be reviewed by anyone. */
      if(!Array.isArray(e.passages) || !e.passages.length){
        errors.push(where + ' — no anchor passages');
      }
      if(!Array.isArray(e.basis) || !e.basis.length){
        errors.push(where + ' — no basis: record the context actually read');
      }
      if(typeof e.reading !== 'string' || !e.reading.trim()){
        errors.push(where + ' — no reading');
      } else if(e.reading.length > readingMax){
        errors.push(where + ' — reading is ' + e.reading.length + ' characters, over ' + readingMax);
      }

      const consider = e.consider || [];
      if(!Array.isArray(consider)){ errors.push(where + ' — consider must be a list'); }
      else {
        if(consider.length > considerCountMax){
          errors.push(where + ' — ' + consider.length + ' consider questions, over ' + considerCountMax);
        }
        consider.forEach((q, i) => {
          if(typeof q !== 'string' || !q.trim()) errors.push(where + ' — consider ' + (i + 1) + ' is empty');
          else if(q.length > considerMax) errors.push(where + ' — consider ' + (i + 1) + ' is ' + q.length + ' characters, over ' + considerMax);
        });
      }
      if(e.practice !== undefined){
        if(typeof e.practice !== 'string' || !e.practice.trim()) errors.push(where + ' — practice present but empty');
        else if(e.practice.length > practiceMax) errors.push(where + ' — practice is ' + e.practice.length + ' characters, over ' + practiceMax);
      }
      if(e.prayer !== undefined){
        if(typeof e.prayer !== 'string' || !e.prayer.trim()) errors.push(where + ' — prayer present but empty');
        else if(e.prayer.length > prayerMax) errors.push(where + ' — prayer is ' + e.prayer.length + ' characters, over ' + prayerMax);
      }

      /* Every reference, from every field that holds one. */
      ['passages', 'basis', 'relatedPassages'].forEach(field => {
        (e[field] || []).forEach(ref => {
          if(typeof ref !== 'string' || !S.parseRef(ref)){
            errors.push(where + ' — ' + field + ' has an unparseable reference: ' + JSON.stringify(ref));
            return;
          }
          allRefs.push({ where: where + ' ' + field, ref: ref });
        });
      });

      allEntries.push({ series: s, entry: e, where: where });
    });
  });

  notes.push(doc.series.length + ' series, ' + allEntries.length + ' entries');
  return { entries: allEntries, refs: allRefs };
}

/* Every reference must resolve, with real text, in EVERY shipped edition.
   A reference that resolves only in English is a devotional that breaks the
   moment somebody reads it in Spanish. */
function checkReferences(refs, errors, notes){
  const eds = corpus.shippedEditions();
  const verses = {};
  eds.forEach(e => { verses[e] = corpus.verses(e); });
  let checked = 0;
  refs.forEach(r => {
    const p = S.parseRef(r.ref);
    if(!p) return;
    eds.forEach(ed => {
      for(let v = p.from; v <= p.to; v++){
        const key = p.code + ' ' + p.chapter + ':' + v;
        const text = verses[ed].get(key);
        if(text === undefined){
          errors.push(r.where + ' — ' + r.ref + ' does not exist in ' + ed + ' (' + key + ')');
        } else if(!String(text).trim()){
          errors.push(r.where + ' — ' + r.ref + ' is published empty in ' + ed + ' (' + key + ')');
        }
      }
    });
    checked++;
  });
  notes.push(checked + ' references resolve in all ' + eds.length + ' shipped editions');
}

/* The anchors and their context, derived in memory so prose can be checked
   against the very passages it discusses. Nothing is written anywhere. */
function passagesForOverlap(refs){
  const verses = corpus.verses(corpus.DEFAULT_EDITION);
  const out = [];
  const seen = new Set();
  refs.forEach(r => {
    if(seen.has(r.ref)) return;
    seen.add(r.ref);
    const p = S.parseRef(r.ref);
    if(!p) return;
    const parts = [];
    for(let v = p.from; v <= p.to; v++){
      const t = verses.get(p.code + ' ' + p.chapter + ':' + v);
      if(t) parts.push(t);
    }
    if(parts.length) out.push({ ref: r.ref, text: S.collapse(parts.join(' ')) });
  });
  return out;
}

function checkClaims(entries, errors, notes){
  let scanned = 0;
  entries.forEach(item => {
    const fields = entryFields(item.entry);
    Object.keys(fields).forEach(field => {
      const norm = S.normForOverlap(fields[field]);
      if(!norm) return;
      scanned++;
      FORBIDDEN_CLAIMS.forEach(c => {
        if(norm.indexOf(c.pattern) !== -1){
          errors.push(item.where + ' — ' + field + ' says "' + c.pattern + '": ' + c.why);
        }
      });
      STEREOTYPE_CLAIMS.forEach(p => {
        if(norm.indexOf(p) !== -1){
          errors.push(item.where + ' — ' + field + ' says "' + p + '": a series is written toward ' +
                      'life patterns, and never tells a whole sex what it is like');
        }
      });
    });
  });
  notes.push(scanned + ' prose fields scanned for forbidden claims and stereotypes');
}

function run(){
  const errors = [];
  const notes = [];
  const doc = readCatalogue();

  const { entries, refs } = validate(doc, errors, notes);

  if(refs.length) checkReferences(refs, errors, notes);

  if(entries.length){
    /* The SAME primitive Learn uses, over the curated catalogue plus the
       passages these devotionals actually discuss. */
    const curated = require(path.join(ROOT, 'scripts', 'scripture.js'));
    const byId = passagesForOverlap(refs);
    const items = entries.map(item => ({ where: item.where, fields: entryFields(item.entry) }));
    const before = errors.length;
    curated.assertNoEmbeddedScripture(items, byId, errors);
    notes.push(items.length + ' entries scanned against ' + byId.length +
               ' passages for six-word Scripture runs' +
               (errors.length === before ? '' : ' — ' + (errors.length - before) + ' found'));
    checkClaims(entries, errors, notes);
  }

  notes.forEach(n => console.log('  ' + n));

  if(errors.length){
    console.error('\ndevotions:verify  FAILED — ' + errors.length + ' problem(s)');
    errors.slice(0, 40).forEach(e => console.error('    ' + e));
    if(errors.length > 40) console.error('    ... and ' + (errors.length - 40) + ' more');
    return 1;
  }
  console.log('devotions:verify  ok — the catalogue is structurally sound and ' +
              'no prose reproduces Scripture or claims more than it may');
  console.log('  (this proves nothing about whether the writing is TRUE or good. ' +
              'That needs a reader.)');
  return 0;
}

if(require.main === module){
  try{ process.exit(run()); }
  catch(e){ console.error('devotions:verify  ERROR — ' + e.message); process.exit(1); }
}

module.exports = { readCatalogue, entryFields, FOR_WHOM, ACCESS,
                   FORBIDDEN_CLAIMS, STEREOTYPE_CLAIMS, CATALOGUE };
