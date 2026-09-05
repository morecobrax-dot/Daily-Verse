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
const STUDIES = path.join(ROOT, 'data', 'studies.json');

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
function readStudies(){ return JSON.parse(fs.readFileSync(STUDIES, 'utf8')); }

/* Derive one passage from the corpus. The single place text is produced, so
   a daily reading and a study reading cannot be built by different rules and
   drift apart. Returns a record or pushes a reason and returns null. */
function derivePassage(ref, verses, supers, errors){
  const p = parseRef(ref);
  if(!p){ errors.push(ref + ' — cannot be parsed as a reference'); return null; }

  const parts = [];
  for(let v = p.from; v <= p.to; v++){
    const key = p.code + ' ' + p.chapter + ':' + v;
    if(!verses.has(key)){ errors.push(ref + ' — ' + key + ' is not in the corpus'); return null; }
    parts.push(verses.get(key));
  }

  let text = collapse(parts.join(' '));
  let stripped = null;

  /* Rule 2. SEPARATED, never removed.

     This used to delete the superscription outright, which made 19 shipped
     passages something other than a faithful copy of the publisher's text
     while still carrying the publisher's name for it. The line is now kept
     in its own field and rendered above the verse body.

     Separating rather than merging follows the source: USFX marks these as
     <d> title elements, distinct from verse content, so a distinct field is
     closer to what the publisher released than running it into verse 1
     would be. Nothing is rewritten, and nothing is typed here.

     Still only ever at verse 1, only where the publisher recorded a title,
     and only as an exact prefix. Anything else is a failure. */
  const sup = p.from === 1 ? supers.get(p.code + ' ' + p.chapter) : null;
  if(sup){
    const prefix = collapse(sup);
    if(text.indexOf(prefix) !== 0){
      errors.push(ref + ' — a superscription is recorded for this chapter but the ' +
                  'passage does not begin with it; refusing to guess');
      return null;
    }
    text = collapse(text.slice(prefix.length));
    stripped = prefix;
  }

  if(text.length < 8){ errors.push(ref + ' — derived text is implausibly short'); return null; }

  const rec = { id: canonicalId(p), ref: ref, text: text };
  if(stripped) rec.sup = stripped;
  return rec;
}

/* One catalogue, two sources.

   data/curation.json names the passages eligible for the daily rotation.
   data/studies.json names the passages its lessons quote. Both are resolved
   against the same pinned corpus, in one pass, into one SCRIPTURE array — so
   there is one Bible table, one verification path and one dataset hash.

   Daily eligibility is EXPLICIT: only a passage the curation named carries
   `daily: 1`. A passage a lesson quotes is real Scripture, is looked up by
   the same id, and is never offered as a day's reading. Study text entering
   the rotation would put passages in front of readers as standalone daily
   readings when they were chosen to be read inside an argument.

   Daily passages are emitted first and in curation order, so the daily block
   stays byte-stable when studies are added or changed. */
function build(){
  const cur = readCuration();
  const studyDoc = readStudies();
  const verses = corpus.verses();
  const supers = corpus.superscriptions();
  const lock = corpus.readLock();
  if(!lock) throw new Error('no data/corpus.lock.json — run `npm run corpus:sync` first');

  const themes = new Set(cur._themes);
  const errors = [];
  const daily = [];
  const study = [];
  const byId = new Map();

  /* ---- 1. the daily rotation ---- */
  cur.passages.forEach(entry => {
    const p = parseRef(entry.ref);
    if(!p){ errors.push(entry.ref + ' — cannot be parsed as a reference'); return; }
    const id = canonicalId(p);
    if(byId.has(id)){ errors.push(entry.ref + ' — duplicate canonical id ' + id); return; }

    if(!entry.themes || !entry.themes.length){ errors.push(entry.ref + ' — no theme tags'); return; }
    const badTheme = entry.themes.filter(t => !themes.has(t));
    if(badTheme.length){ errors.push(entry.ref + ' — unknown theme(s): ' + badTheme.join(', ')); return; }

    const rec = derivePassage(entry.ref, verses, supers, errors);
    if(!rec) return;
    rec.themes = entry.themes.slice();
    rec.daily = 1;
    byId.set(id, rec);
    daily.push(rec);
  });

  /* ---- 2. everything the lessons quote ---- */
  const built = buildStudies(studyDoc, errors);
  built.passageRefs.forEach(ref => {
    const p = parseRef(ref);
    if(!p) return;                       // already reported by buildStudies
    const id = canonicalId(p);
    if(byId.has(id)) return;             // a lesson quoting a daily reading reuses it
    const rec = derivePassage(ref, verses, supers, errors);
    if(!rec) return;
    /* No theme tags: themes exist to order the daily rotation, and a passage
       that is never rotated has no use for them. */
    rec.themes = [];
    byId.set(id, rec);
    study.push(rec);
  });

  assertNoEmbeddedScripture(built.studies, byId, errors);

  if(errors.length){
    const e = new Error(errors.length + ' passage(s) failed to derive');
    e.detail = errors;
    throw e;
  }
  return { passages: daily.concat(study), daily: daily, study: study,
           studies: built.studies, studyDoc: studyDoc, lock: lock, curation: cur };
}

/* Validate the teaching content and resolve its references to canonical ids.
   Scripture is NOT copied in here — a lesson carries ids, and the text comes
   from SCRIPTURE at render time, so teaching and Scripture cannot drift. */
function buildStudies(doc, errors){
  const studies = [];
  const passageRefs = [];
  const studyIds = new Set();
  const max = (doc._authoring || {});
  const understandMax = max.understandMax || 900;
  const lookMax = max.lookCloserMax || 200;
  const reflectMax = max.reflectMax || 140;
  const promptMax = max.checkPromptMax || 200;
  const optionMax = max.checkOptionMax || 90;
  const explainMax = max.checkExplainMax || 260;
  const figureHeadingMax = max.figureHeadingMax || 40;
  const figureRowsMax = max.figureRowsMax || 6;
  const figureLabelMax = max.figureLabelMax || 24;
  const figureValueMax = max.figureValueMax || 90;

  (doc.studies || []).forEach(s => {
    if(!s.id || !s.title || !s.summary){ errors.push('study ' + (s.id || '?') + ' — missing id, title or summary'); return; }
    if(studyIds.has(s.id)){ errors.push('study ' + s.id + ' — duplicate study id'); return; }
    studyIds.add(s.id);
    if(!Array.isArray(s.lessons) || !s.lessons.length){ errors.push('study ' + s.id + ' — no lessons'); return; }

    const lessonIds = new Set();
    const checkIds = new Set();
    const lessons = [];

    s.lessons.forEach((l, i) => {
      const where = s.id + '/' + (l.id || ('#' + (i + 1)));
      if(!l.id){ errors.push(where + ' — missing lesson id'); return; }
      if(lessonIds.has(l.id)){ errors.push(where + ' — duplicate lesson id within its study'); return; }
      lessonIds.add(l.id);
      if(!l.title){ errors.push(where + ' — missing title'); return; }

      if(!Array.isArray(l.passages) || !l.passages.length){ errors.push(where + ' — no passages'); return; }
      const ids = [];
      l.passages.forEach(ref => {
        const p = parseRef(ref);
        if(!p){ errors.push(where + ' — cannot parse passage reference "' + ref + '"'); return; }
        passageRefs.push(ref);
        ids.push(canonicalId(p));
      });

      if(!Array.isArray(l.basis) || !l.basis.length){
        errors.push(where + ' — no basis recorded; an explanation with no stated ground cannot be audited');
        return;
      }
      l.basis.forEach(ref => {
        if(!parseRef(ref)) errors.push(where + ' — basis reference "' + ref + '" does not resolve');
      });

      if(!l.understand || !l.understand.trim()){ errors.push(where + ' — no understand text'); return; }
      if(!l.reflect || !l.reflect.trim()){ errors.push(where + ' — no reflect prompt'); return; }

      if(l.understand.length > understandMax){
        errors.push(where + ' — understand is ' + l.understand.length + ' chars, over the ' + understandMax + ' limit');
      }
      if(l.lookCloser && l.lookCloser.length > lookMax){
        errors.push(where + ' — lookCloser is ' + l.lookCloser.length + ' chars, over the ' + lookMax + ' limit');
      }
      if(l.reflect.length > reflectMax){
        errors.push(where + ' — reflect is ' + l.reflect.length + ' chars, over the ' + reflectMax + ' limit');
      }

      /* An optional labelled figure. It exists because some of what a
         beginner needs is mechanical — which part of John 3:16 is the
         chapter — and a labelled layout teaches that faster than a
         sentence about it. Deliberately not free-form: a heading and a
         short list of label/value pairs, so it cannot grow into a place
         where arbitrary content (or Scripture) gets typed. */
      let figure = null;
      if(l.figure){
        const f = l.figure;
        if(!f.heading || !Array.isArray(f.rows) || !f.rows.length){
          errors.push(where + ' — figure needs a heading and at least one row');
        } else if(f.rows.length > figureRowsMax){
          errors.push(where + ' — figure has ' + f.rows.length + ' rows, over the ' + figureRowsMax + ' limit');
        } else if(f.heading.length > figureHeadingMax){
          errors.push(where + ' — figure heading is ' + f.heading.length + ' chars, over the ' + figureHeadingMax + ' limit');
        } else {
          const badRow = f.rows.filter(r => !r || !r.label || !r.value ||
            String(r.label).length > figureLabelMax || String(r.value).length > figureValueMax);
          if(badRow.length){
            errors.push(where + ' — figure row must be a label and a value within ' +
              figureLabelMax + '/' + figureValueMax + ' chars');
          } else {
            figure = { heading: f.heading, rows: f.rows.map(r => ({ label: r.label, value: r.value })) };
          }
        }
      }

      /* Knowledge checks. Validated hard, because a question with two
         defensible answers teaches the reader that the app is unreliable,
         which is worse than asking nothing. Options must be distinct, the
         answer must be in range, and an explanation is required — the
         explanation is the actual product here; the score is not. */
      let checks = null;
      if(l.checks){
        if(!Array.isArray(l.checks) || !l.checks.length){
          errors.push(where + ' — checks must be a non-empty array');
        } else {
          const out = [];
          l.checks.forEach((c, ci) => {
            const cw = where + ' check#' + (ci + 1);
            if(!c.id || !/^[a-z0-9][a-z0-9-]*$/.test(c.id)){ errors.push(cw + ' — missing or non-slug id'); return; }
            if(checkIds.has(c.id)){ errors.push(cw + ' — duplicate check id "' + c.id + '"'); return; }
            checkIds.add(c.id);
            if(!c.prompt || !c.prompt.trim()){ errors.push(cw + ' — no prompt'); return; }
            if(c.prompt.length > promptMax){ errors.push(cw + ' — prompt is ' + c.prompt.length + ' chars, over ' + promptMax); return; }
            if(!Array.isArray(c.options) || c.options.length < 2 || c.options.length > 4){
              errors.push(cw + ' — needs between 2 and 4 options'); return;
            }
            if(c.options.some(o => typeof o !== 'string' || !o.trim() || o.length > optionMax)){
              errors.push(cw + ' — every option must be text within ' + optionMax + ' chars'); return;
            }
            const norm = c.options.map(o => o.trim().toLowerCase());
            if(new Set(norm).size !== norm.length){
              errors.push(cw + ' — two options say the same thing, so more than one could be right'); return;
            }
            if(typeof c.answer !== 'number' || !Number.isInteger(c.answer) ||
               c.answer < 0 || c.answer >= c.options.length){
              errors.push(cw + ' — answer must be an index into options'); return;
            }
            if(!c.explain || !c.explain.trim()){
              errors.push(cw + ' — no explanation. A check that cannot say why is a quiz, not teaching'); return;
            }
            if(c.explain.length > explainMax){ errors.push(cw + ' — explanation is ' + c.explain.length + ' chars, over ' + explainMax); return; }
            const rec = { id: c.id, prompt: c.prompt, options: c.options.slice(),
                          answer: c.answer, explain: c.explain };
            if(c.basis){
              if(!Array.isArray(c.basis) || !c.basis.length){ errors.push(cw + ' — basis must be a non-empty array'); return; }
              c.basis.forEach(ref => { if(!parseRef(ref)) errors.push(cw + ' — basis "' + ref + '" does not resolve'); });
              rec.basis = c.basis.slice();
            }
            out.push(rec);
          });
          if(out.length === l.checks.length) checks = out;
        }
      }

      const lesson = { id: l.id, title: l.title, passages: ids,
                       basis: l.basis.slice(), understand: l.understand, reflect: l.reflect };
      if(l.lookCloser) lesson.lookCloser = l.lookCloser;
      if(figure) lesson.figure = figure;
      if(checks) lesson.checks = checks;
      lessons.push(lesson);
    });

    /* An optional track groups a study on the Learn landing. Nothing about
       navigation changes — it is a heading, and a study without one simply
       stays where studies have always been. */
    const study = { id: s.id, title: s.title, summary: s.summary,
                    audience: s.audience || '', lessons: lessons };
    if(s.track){
      if(!/^[a-z][a-z-]*$/.test(s.track)) errors.push('study ' + s.id + ' — track must be a slug');
      else study.track = s.track;
      if(typeof s.level !== 'number' || !Number.isInteger(s.level) || s.level < 1){
        errors.push('study ' + s.id + ' — a study in a track needs an integer level');
      } else study.level = s.level;
    }
    studies.push(study);
  });

  return { studies: studies, passageRefs: passageRefs };
}


/* Refuse a lesson that reproduces Scripture inside its own prose.

   A lesson carries passage ids and the words are pulled from SCRIPTURE at
   render time — that is what keeps teaching and Scripture from drifting, and
   what puts every quoted word under scripture:verify. A verse retyped into an
   explanation escapes all of it: it sits outside the derived region, carries
   no reference and no translation, and reads to a reader as this app's own
   sentence. One got through review (John 1:14, in 'Who Jesus is') and was
   only found by scanning for it, so the scan is now part of the build.

   Six words is the threshold, and it is a judgement rather than a constant.
   Naming a phrase is how teaching works — a lesson may say the book opens
   with \"In the beginning\" — and short marked citations sit beside the verse
   card that carries the reference. A six-word run of the shipped text is no
   longer a citation; it is the verse. */
function assertNoEmbeddedScripture(studies, byId, errors){
  const RUN = 6;
  const norm = t => t.toLowerCase()
    .replace(/[‘’']/g, "'")
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ').trim();

  /* Every run of the whole catalogue, not merely of the passages this lesson
     quotes — a lesson reproducing some other passage is the same failure. */
  const runs = new Map();
  byId.forEach(p => {
    const w = norm(p.text).split(' ');
    for(let i = 0; i + RUN <= w.length; i++){
      const k = w.slice(i, i + RUN).join(' ');
      if(!runs.has(k)) runs.set(k, p.ref);
    }
  });

  studies.forEach(s => {
    s.lessons.forEach(l => {
      /* The figure is scanned too. A field that renders text to a reader and
         is exempt from the Scripture check is exactly the hole this guard
         exists to close. */
      const figureText = l.figure
        ? [l.figure.heading].concat(l.figure.rows.map(r => r.label + ' ' + r.value)).join(' ')
        : '';
      /* Checks render text to a reader, so they are scanned like everything
         else. An option or an explanation is exactly where a verse would
         get retyped without anyone noticing. */
      const checkText = Array.isArray(l.checks)
        ? l.checks.map(c => [c.prompt, c.explain].concat(c.options || []).join(' ')).join(' ')
        : '';
      const fields = { understand: l.understand, lookCloser: l.lookCloser,
                       reflect: l.reflect, title: l.title, figure: figureText,
                       check: checkText };
      Object.keys(fields).forEach(field => {
        if(typeof fields[field] !== 'string') return;
        const w = norm(fields[field]).split(' ');
        const seen = new Set();
        for(let i = 0; i + RUN <= w.length; i++){
          const k = w.slice(i, i + RUN).join(' ');
          if(runs.has(k) && !seen.has(k)){
            seen.add(k);
            errors.push(s.id + '/' + l.id + ' — ' + field + ' reproduces Scripture (' +
              runs.get(k) + '): "' + k + '". Cite the passage; do not retype it.');
          }
        }
      });
    });
  });
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
/* The superscription is appended after STX, and ONLY when one exists. A
   passage without one therefore hashes byte-for-byte as it always did,
   which is what makes the delta from the previous dataset attributable:
   exactly the passages that regained a superscription can change, and
   nothing else can change without the difference being visible. */
function datasetHash(passages){
  const canon = passages
    .map(p => p.id + '\u0000' + p.text + (p.sup ? '\u0002' + p.sup : ''))
    .join('\u0001');
  return crypto.createHash('sha256').update(canon, 'utf8').digest('hex');
}

/* ---------------------------------------------------------
   EMIT
   --------------------------------------------------------- */
const BEGIN = '/* SCRIPTURE-BEGIN';
const END = '/* SCRIPTURE-END */';

/* Newlines are escaped rather than stripped: a paragraph break in a lesson
   explanation is meaningful, and the renderer splits on it. Scripture text
   has already been collapsed to one line, so this only ever affects teaching. */
function esc(s){
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n');
}

function passageRow(p){
  return "  { id: '" + esc(p.id) + "', ref: '" + esc(p.ref) + "'," +
    " themes: [" + p.themes.map(t => "'" + esc(t) + "'").join(', ') + "]," +
    (p.daily ? " daily: 1," : "") +
    (p.sup ? " sup: '" + esc(p.sup) + "'," : "") + "\n" +
    "    text: '" + esc(p.text) + "' }";
}

function region(built){
  const hash = datasetHash(built.passages);
  /* A second digest over the daily block alone. The whole-dataset hash moves
     whenever a study quotes a new passage, which is correct but useless for
     answering the one question that matters after such a change: did the
     daily readings move? This one answers it. */
  const dailyHash = datasetHash(built.daily);
  const ed = built.lock.edition;

  const rows = built.passages.map(passageRow).join(',\n');

  const studyRows = built.studies.map(s => {
    const lessons = s.lessons.map(l =>
      "      { id: '" + esc(l.id) + "', title: '" + esc(l.title) + "',\n" +
      "        passages: [" + l.passages.map(x => "'" + esc(x) + "'").join(', ') + "],\n" +
      "        basis: [" + l.basis.map(x => "'" + esc(x) + "'").join(', ') + "],\n" +
      "        understand: '" + esc(l.understand) + "',\n" +
      (l.lookCloser ? "        lookCloser: '" + esc(l.lookCloser) + "',\n" : "") +
      (l.checks ? "        checks: [" + l.checks.map(function(c){
        return "{ id: '" + esc(c.id) + "', prompt: '" + esc(c.prompt) + "', options: [" +
          c.options.map(function(o){ return "'" + esc(o) + "'"; }).join(', ') +
          "], answer: " + c.answer + ", explain: '" + esc(c.explain) + "'" +
          (c.basis ? ", basis: [" + c.basis.map(function(b){ return "'" + esc(b) + "'"; }).join(', ') + "]" : "") +
        " }";
      }).join(', ') + "],\n" : "") +
      (l.figure ? "        figure: { heading: '" + esc(l.figure.heading) + "', rows: [" +
        l.figure.rows.map(function(r){
          return "{ label: '" + esc(r.label) + "', value: '" + esc(r.value) + "' }";
        }).join(', ') + "] },\n" : "") +
      "        reflect: '" + esc(l.reflect) + "' }"
    ).join(',\n');
    return "  { id: '" + esc(s.id) + "', title: '" + esc(s.title) + "',\n" +
           (s.track ? "    track: '" + esc(s.track) + "', level: " + s.level + ",\n" : "") +
           "    summary: '" + esc(s.summary) + "',\n" +
           "    audience: '" + esc(s.audience) + "',\n" +
           "    lessons: [\n" + lessons + "\n    ] }";
  }).join(',\n');

  return [
    ' — derived by `npm run scripture:build` from the corpus in data/corpus.lock.json',
    '   and the content in data/curation.json and data/studies.json.',
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
    "  dailyHash: '" + dailyHash + "',",
    "  dailyCount: " + built.daily.length + ',',
    "  studyOnlyCount: " + built.study.length + ',',
    "  built: '" + new Date().toISOString().slice(0, 10) + "'",
    '};',
    '',
    '/* One catalogue. `daily: 1` marks the passages the Today rotation may',
    '   draw from; the rest are quoted by a study and are never offered as a',
    "   day's reading. Both are the same verified text from the same corpus. */",
    'const SCRIPTURE = [',
    rows,
    '];',
    '',
    "/* Teaching content — this app's own words, never Scripture. Lessons carry",
    '   canonical passage ids; the text itself is looked up in SCRIPTURE, so a',
    '   lesson and the passage it teaches cannot drift apart. `basis` records',
    '   the passages actually read to author each explanation. */',
    'const STUDIES_VERSION = ' + Number(built.studyDoc.version || 1) + ';',
    '',
    'const STUDIES = [',
    studyRows,
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
    console.log('  daily        : ' + built.daily.length + ' passages (Today rotation)');
    console.log('  study-only   : ' + built.study.length + ' passages (quoted by lessons)');
    console.log('  total        : ' + built.passages.length);
    console.log('  superscript. : ' + built.passages.filter(p => p.sup).length + ' preserved');
    console.log('  studies      : ' + built.studies.length + ' (' +
      built.studies.reduce((n, s) => n + s.lessons.length, 0) + ' lessons), content v' +
      Number(built.studyDoc.version || 1));
    console.log('  dataset hash : ' + datasetHash(built.passages));
    console.log('  daily hash   : ' + datasetHash(built.daily));
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
    /* Reported separately, because after a study is added the only question
       anyone actually has is whether the DAILY readings moved. */
    const haveDaily = have.filter(p => p.daily);
    console.log('  daily     : ' + haveDaily.length + ' shipped / ' + built.daily.length + ' re-derived, hash ' +
                datasetHash(haveDaily).slice(0, 16) + '… vs ' + datasetHash(built.daily).slice(0, 16) + '…');
    if(datasetHash(haveDaily) !== datasetHash(built.daily)){
      console.error('  DAILY DRIFT — the Today rotation is not what the curation produces.');
    }
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
    const dailyPassages = s.passages.filter(p => p.daily);
    const studyOnly = s.passages.filter(p => !p.daily);
    const withRefl = dailyPassages.filter(p => typeof s.reflections[p.id] === 'string' && s.reflections[p.id].trim());
    const themes = {};
    s.passages.forEach(p => (p.themes || []).forEach(t => { themes[t] = (themes[t] || 0) + 1; }));
    const books = new Set(s.passages.map(p => p.id.split('.')[0]));
    console.log('scripture:audit');
    console.log('  edition      : ' + s.source.title + ' (' + s.source.edition + ')');
    console.log('  dataset hash : ' + s.source.datasetHash);
    console.log('  daily hash   : ' + s.source.dailyHash);
    console.log('  passages     : ' + s.passages.length + '  (daily ' + dailyPassages.length +
                ', study-only ' + studyOnly.length + ')');
    console.log('  daily with a reflection (rotation-eligible) : ' + withRefl.length);
    console.log('  daily awaiting a reflection                 : ' + (dailyPassages.length - withRefl.length));
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
