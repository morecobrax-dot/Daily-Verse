/* =========================================================
   SCRIPTURE MEMORY — the curated suggestion catalogue
   ---------------------------------------------------------
     node scripts/memory.js      check data/memory.json

   What this file defends:

   1. NO SCRIPTURE WORDS. The catalogue carries canonical
      locations and editorial metadata. The words a reader
      memorises are read out of data/bible/ in the edition they
      locked, like everything else here. A verse typed into this
      file would be a verse the app asserts on its own authority,
      outside the derived region and outside every check that
      defends it. Only the fields named below may appear, so a
      "text" field cannot be added quietly.

   2. EVERY REFERENCE RESOLVES IN EVERY SHIPPED EDITION. A
      suggestion that exists only in English is a suggestion that
      breaks for the reader who changed translation.

   3. LENGTH IS JUDGED ON THE REFERENCE, NEVER ON A RENDERING.
      Verse count is a property of the location and is identical
      in every edition; a character or word count is not. If the
      limit were measured in rendered text, the same passage
      would be offerable in Chinese and refused in German, which
      is precisely the class of bug CLAUDE.md rule 50 exists to
      prevent.

   4. A PERSON HAS READ IT. Every entry is `proposed` until
      somebody has read it in its own paragraph and approved it.
      This prints what is still waiting; it cannot tell you
      whether a passage is wisely chosen. See MEMORY-REVIEW.md.
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const corpus = require('./corpus.js');
const S = require('./scripture.js');

const ROOT = path.join(__dirname, '..');
const CATALOGUE = path.join(ROOT, 'data', 'memory.json');
const APP = path.join(ROOT, 'index.html');

/* The only fields an entry may carry. Anything else is refused rather than
   ignored, which is what stops a "text" field appearing one day. */
const ENTRY_FIELDS = ['id', 'ref', 'theme', 'status'];
const STATUS = ['proposed', 'approved'];
const ID_PATTERN = /^mem-[a-z0-9-]+$/;
/* A theme is a label on a chip, not a sentence. Three words is already
   generous; prose here would be editorial content nobody reviewed. */
const THEME_MAX = 24;

function readCatalogue(){ return JSON.parse(fs.readFileSync(CATALOGUE, 'utf8')); }

function validate(doc, errors, notes){
  if(!doc || typeof doc !== 'object'){ errors.push('catalogue — not an object'); return; }
  if(!Number.isInteger(doc.version) || doc.version < 1) errors.push('catalogue — version must be a positive integer');

  const max = doc.maxVerses;
  if(!Number.isInteger(max) || max < 1 || max > 10){
    errors.push('catalogue — maxVerses must be a small positive integer; it is the limit a reader is held to');
  }

  const list = doc.passages;
  if(!Array.isArray(list) || !list.length){ errors.push('catalogue — no passages'); return; }

  const ids = new Set();
  const refs = new Set();
  list.forEach((e, i) => {
    const at = 'passage ' + (i + 1) + ' (' + (e && e.id ? e.id : '?') + ')';

    Object.keys(e || {}).forEach(k => {
      if(ENTRY_FIELDS.indexOf(k) === -1){
        errors.push(at + ' — carries "' + k + '", which is not a field of this catalogue. ' +
          'Only ' + ENTRY_FIELDS.join(', ') + ' may appear. Scripture is never stored here.');
      }
    });

    if(!e || !ID_PATTERN.test(e.id || '')) errors.push(at + ' — needs an id of the form mem-<something>');
    else if(ids.has(e.id)) errors.push(at + ' — duplicate id');
    else ids.add(e.id);

    if(!e.theme || String(e.theme).length > THEME_MAX){
      errors.push(at + ' — needs a short theme, at most ' + THEME_MAX + ' characters');
    }
    if(STATUS.indexOf(e.status) === -1){
      errors.push(at + ' — status must be one of ' + STATUS.join(' | '));
    }

    const p = S.parseRef(e.ref || '');
    if(!p){ errors.push(at + ' — "' + e.ref + '" cannot be parsed as a reference'); return; }
    if(refs.has(e.ref)) errors.push(at + ' — "' + e.ref + '" is already offered by another entry');
    else refs.add(e.ref);

    const span = p.to - p.from + 1;
    if(span > max){
      errors.push(at + ' — ' + e.ref + ' is ' + span + ' verses, and the limit is ' + max +
        '. Memory passages are short on purpose.');
    }
  });

  notes.push(list.length + ' passages, ' + refs.size + ' distinct references, at most ' + max + ' verses each');
}

/* Every suggestion must resolve everywhere, or it is a suggestion that
   breaks for whoever changed edition. */
function checkReferences(doc, errors, notes){
  const eds = corpus.shippedEditions();
  const verses = {};
  eds.forEach(e => { verses[e] = corpus.verses(e); });
  let checked = 0;
  (doc.passages || []).forEach(e => {
    const p = S.parseRef(e.ref || '');
    if(!p) return;
    eds.forEach(ed => {
      for(let v = p.from; v <= p.to; v++){
        checked++;
        const key = p.code + ' ' + p.chapter + ':' + v;
        const text = verses[ed].get(key);
        if(text === undefined){
          errors.push(e.id + ' — ' + e.ref + ' does not exist in ' + ed + ' (' + key + ')');
        } else if(!String(text).trim()){
          errors.push(e.id + ' — ' + e.ref + ' is published empty in ' + ed + ' (' + key + ')');
        }
      }
    });
  });
  notes.push(checked + ' verse lookups resolve across all ' + eds.length + ' shipped editions');
}

/* The catalogue reaches the app through the derived region and nowhere else.
   A reference retyped into UI source is a second source of truth, and the
   one somebody edits by hand is the one that goes wrong. */
function checkNoUI(doc, errors, notes){
  let app = '';
  try{ app = fs.readFileSync(APP, 'utf8'); }catch(e){ return; }
  const region = (app.match(/const MEMORY = \[[\s\S]*?\n\];/) || [''])[0];
  if(!region){
    errors.push('index.html carries no derived MEMORY region — run `npm run scripture:build`');
    return;
  }
  (doc.passages || []).forEach(e => {
    const outside = app.split("'" + e.id + "'").length - 1 - (region.split("'" + e.id + "'").length - 1);
    if(outside > 0){
      errors.push('the id "' + e.id + '" appears ' + outside + ' time(s) outside the derived region');
    }
  });
  notes.push('the app carries one memory catalogue, and it came from this file');
}

/* A person still has to read these. */
function reviewQueue(doc, notes){
  const waiting = (doc.passages || []).filter(e => e.status !== 'approved');
  if(!waiting.length){ notes.push('every passage has been reviewed and approved'); return; }
  notes.push(waiting.length + ' of ' + doc.passages.length + ' passages are still PROPOSED and await human review:');
  waiting.forEach(e => notes.push('    ' + e.ref + '  (' + e.theme + ')'));
}

function run(){
  let doc;
  try{ doc = readCatalogue(); }
  catch(e){
    console.error('memory:verify  FAILED — data/memory.json could not be read: ' + e.message);
    return 1;
  }
  const errors = [], notes = [];
  validate(doc, errors, notes);
  if(!errors.length) checkReferences(doc, errors, notes);
  checkNoUI(doc, errors, notes);
  reviewQueue(doc, notes);

  notes.forEach(n => console.log('  ' + n));
  if(errors.length){
    console.error('');
    console.error('memory:verify  FAILED — ' + errors.length + ' problem(s):');
    errors.slice(0, 20).forEach(e => console.error('    ' + e));
    if(errors.length > 20) console.error('    ... and ' + (errors.length - 20) + ' more');
    return 1;
  }
  console.log('memory:verify  ok — every suggestion is a canonical location that resolves in every shipped edition');
  console.log('  (this proves nothing about whether a passage is wisely chosen, or safe to carry');
  console.log('   out of its paragraph. That needs a person. See MEMORY-REVIEW.md.)');
  return 0;
}

if(require.main === module) process.exit(run());
module.exports = { readCatalogue, validate, checkReferences, checkNoUI, reviewQueue, run,
                   ENTRY_FIELDS, STATUS, THEME_MAX, CATALOGUE };
