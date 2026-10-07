#!/usr/bin/env node
/* =========================================================
   HELP ME — the catalogue, and what has to be true of it

   Help Me takes someone who does not know where in Scripture to begin and
   walks them into a passage. The reader may be exhausted, ashamed, grieving
   or frightened, and that is a different kind of risk again from a lesson or
   a devotional: the same sentence that would be merely clumsy on Today can
   land on somebody at two in the morning.

   This file does NOT build anything into index.html. Phase A ships no reader,
   no tab and no stored progress, so nothing here touches the SCRIPTURE region
   or any hash. References are resolved in memory, for validation only.

   What is checked here that nothing else in this repo needs:

     1. Every reference resolves, with real text, in EVERY shipped edition.
        Help Me stores no words; the edition on screen supplies them, so a
        passage that is missing in Chinese is a step that breaks in Chinese.
     2. No prose reproduces six consecutive words of a passage — checked
        against every shipped ENGLISH edition, not just the default, because
        the prose is English and a reader can be in any of them.
     3. No prose makes the claims this genre fails by: that God has spoken
        privately, arranged a circumstance or promised an outcome; that
        distress proves weak faith; that a feeling is guaranteed; that a
        reader should stay where they are in danger.
     4. No prose diagnoses anybody, and no field in this file is the start of
        a psychological record.
     5. Crisis resources carry the source they were read from and the date,
        and go stale on a date this script enforces.

   What it cannot check is whether the writing is TRUE, wise or pastorally
   right. That needs a person, and HELP-ME-REVIEW.md exists for them.

   This lint is a REJECTION FILTER. Passing it is not theological approval.
   ========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const S = require('./scripture.js');
const corpus = require('./corpus.js');
const D = require('./devotions.js');

const ROOT = path.join(__dirname, '..');
const CATALOGUE = path.join(ROOT, 'data', 'help.json');
const STUDIES = path.join(ROOT, 'data', 'studies.json');
const APP = path.join(ROOT, 'index.html');

const STATUS = ['authored', 'outline'];
/* What a step may hand a reader next. Deliberately small: every value here
   is used by the two authored paths, because an enum value nothing renders
   is a feature invented early. */
const NEXT_KINDS = ['continue', 'openPassage', 'today', 'learn', 'support'];
const COMPLETION_KINDS = ['today', 'learn', 'bible', 'devotions'];

/* Claims Help Me may not make, over and above the ones devotional writing
   is already held to (those are imported, not retyped). Matched against
   normalised prose, so punctuation and case do not matter. */
const HELP_CLAIMS = [
  { pattern: 'if you really trusted god', why: 'makes distress evidence of weak faith' },
  { pattern: 'if you had more faith', why: 'makes distress evidence of weak faith' },
  { pattern: 'you don\'t trust god enough', why: 'makes distress evidence of weak faith' },
  { pattern: 'you do not trust god enough', why: 'makes distress evidence of weak faith' },
  { pattern: 'means you don\'t trust god', why: 'reads a feeling as a verdict on someone\'s faith' },
  { pattern: 'means you do not trust god', why: 'reads a feeling as a verdict on someone\'s faith' },
  { pattern: 'anxiety is a sin', why: 'treats an experience as guilt' },
  { pattern: 'depression is a sin', why: 'treats an illness as guilt' },
  { pattern: 'pray harder', why: 'makes prayer a performance that earns an outcome' },
  { pattern: 'faith over fear', why: 'slogan that reads fear as faithlessness' },
  { pattern: 'god won\'t give you more than you can handle', why: 'promises what Scripture does not' },
  { pattern: 'god will not give you more than you can handle', why: 'promises what Scripture does not' },
  { pattern: 'everything happens for a reason', why: 'claims to know why this happened' },
  { pattern: 'god needed another angel', why: 'false comfort, and not what Scripture says' },
  { pattern: 'god has a plan for your', why: 'claims knowledge of this reader\'s circumstances' },
  { pattern: 'this is god\'s plan for', why: 'claims knowledge of this reader\'s circumstances' },
  { pattern: 'you will feel better', why: 'promises a feeling' },
  { pattern: 'you will feel peace', why: 'promises a feeling' },
  { pattern: 'by the end of this you will', why: 'promises an outcome of using the app' },
  { pattern: 'stop taking your', why: 'interferes with medical treatment' },
  { pattern: 'you don\'t need medication', why: 'interferes with medical treatment' },
  { pattern: 'instead of therapy', why: 'presents Scripture as a replacement for care' },
  { pattern: 'instead of a doctor', why: 'presents Scripture as a replacement for care' }
];

/* Pronouncing on where somebody stands with God. Help Me may teach what a
   passage says about forgiveness, faith or judgement; it may not tell the
   person holding the phone which side of it they are on, in either
   direction. Added after the Hebrews 10 adjudication, where reassurance was
   as much of a risk as condemnation. */
const SALVATION_STATUS = [
  'you are saved', 'you are not saved', 'you\'re not saved', 'you are still saved',
  'if you were truly saved', 'if you were really saved', 'if you were a real christian',
  'this proves you are', 'that proves you are', 'you have lost your salvation',
  'you are not a real christian', 'you were never really', 'you are going to hell',
  'you are right with god', 'you are not right with god'
];

/* Historical and cultural background, asserted with nothing behind it. Help
   Me has no way to source such a claim — there is no citation field and
   building one to save a sentence is the wrong trade — so the point has to
   come out of the text instead. */
const HISTORICAL_CLAIMS = [
  'teachers of his day', 'rabbis taught', 'the rabbis', 'in that world',
  'in the ancient world', 'scholars believe', 'scholars think', 'scholars say',
  'historians', 'in the first century', 'first century readers', 'custom of the time',
  'groups around a teacher', 'in those days people', 'archaeologists'
];

/* Telling a reader what they have. Help Me may use the words people use
   about themselves; it never decides that somebody HAS a condition. */
const DIAGNOSIS_CLAIMS = [
  'you are depressed', 'you have depression', 'you are clinically',
  'you have anxiety', 'you are suffering from', 'your condition',
  'what you have is', 'this is trauma', 'you are traumatised', 'you are traumatized'
];

/* Keeping someone within reach of harm, for a spiritual reason. Blunt
   patterns catch only the blunt failures; the rule in the catalogue and a
   human reviewer are what actually defend this. */
const UNSAFE_RECONCILIATION = [
  'you must stay', 'you have to stay', 'forgiveness means staying',
  'forgiveness requires you to stay', 'reconcile no matter', 'go back to him no matter',
  'give them another chance to hurt', 'stay in the marriage no matter',
  'god wants you to stay with',
  /* Forgiveness collapsed into renewed access, which is the specific way
     this path gets somebody hurt a second time. A step may still NAME these
     in order to deny them: the denial clearing above is what makes that
     possible, and the forgiveness path depends on it. */
  'restore contact', 'must restore the relationship', 'let them back in',
  'give them access again', 'forgiving means letting'
];

/* The register that makes writing sound generated. Not forbidden English in
   every conceivable context — these are the specific tells, and if one is
   genuinely the right sentence, the reviewer says so and it comes off this
   list deliberately rather than by accident. */
const GENERIC_COPY = [
  'you\'re not alone', 'you are not alone', 'take a moment to breathe',
  'it\'s okay to not be okay', 'it is okay to not be okay',
  'your feelings are valid', 'embrace this season', 'in this season of life',
  'in today\'s fast paced world', 'this passage reminds us', 'this verse reminds us',
  'at the end of the day', 'whatever you\'re going through',
  'whatever you are going through', 'god\'s got this', 'you\'ve got this',
  'let that sink in', 'your journey', 'this journey', 'lean into',
  'dear friend', 'stay strong', 'self care', 'take heart friend'
];

function readCatalogue(){ return JSON.parse(fs.readFileSync(CATALOGUE, 'utf8')); }

/* Every reader-visible string on a step, named. A field that renders and is
   exempt from these scans is exactly the hole they exist to close. */
function stepFields(st){
  return {
    title: st.title || '',
    arrive: st.arrive || '',
    notice: st.notice || '',
    consider: (st.consider || []).join(' — '),
    prayer: st.prayer || '',
    prayerPrompt: st.prayerPrompt || '',
    nextStep: (st.nextStep && st.nextStep.text) || ''
  };
}

function pathFields(p){
  return { title: p.title || '', entry: p.entry || '', summary: p.summary || '',
           completion: (p.completion && p.completion.text) || '' };
}

function words(s){ return S.normForOverlap(s).split(' ').filter(Boolean).length; }

function stepWordCount(st){
  const f = stepFields(st);
  return Object.keys(f).reduce((n, k) => n + words(f[k]), 0);
}

/* ---------- structure ---------- */

function validate(doc, errors, notes){
  const lim = doc._authoring || {};
  if(typeof doc.version !== 'number') errors.push('catalogue — version must be a number');
  if(!doc._about) errors.push('catalogue — no _about: say what this file is and what it never holds');
  if(!Array.isArray(lim.rules) || !lim.rules.length) errors.push('catalogue — no authoring rules declared');
  if(!Array.isArray(doc.paths) || !doc.paths.length){
    errors.push('catalogue — no paths'); return { steps: [], refs: [], paths: [] };
  }

  const ids = new Set();
  const steps = [];
  const refs = [];

  doc.paths.forEach(p => {
    const at = 'path ' + (p.id || '?');
    if(!p.id || !p.title || !p.entry || !p.summary){
      errors.push(at + ' — needs id, title, entry and summary'); return;
    }
    if(ids.has(p.id)){ errors.push(at + ' — duplicate path id'); return; }
    ids.add(p.id);
    if(STATUS.indexOf(p.status) === -1){
      errors.push(at + ' — status must be one of ' + STATUS.join(' | ') + ', got ' + JSON.stringify(p.status));
    }
    if(typeof p.plannedSteps !== 'number' || p.plannedSteps < 1){
      errors.push(at + ' — plannedSteps must say how long this path is meant to be');
    }
    if(p.summary && p.summary.length > (lim.summaryMax || 220)){
      errors.push(at + ' — summary is ' + p.summary.length + ' characters, over ' + lim.summaryMax);
    }
    if(!Array.isArray(p.covers) || !p.covers.length){
      errors.push(at + ' — covers must name the situations this path is for');
    }

    if(p.status === 'outline'){
      if(p.steps) errors.push(at + ' — an outline path must not carry steps');
      return;
    }

    if(!Array.isArray(p.steps) || !p.steps.length){ errors.push(at + ' — authored path has no steps'); return; }
    if(p.steps.length !== p.plannedSteps){
      errors.push(at + ' — ' + p.steps.length + ' steps, but plannedSteps says ' + p.plannedSteps);
    }
    if(!p.completion || COMPLETION_KINDS.indexOf(p.completion.kind) === -1 || !p.completion.text){
      errors.push(at + ' — an authored path must hand the reader somewhere: completion.kind one of ' +
        COMPLETION_KINDS.join(' | ') + ' with text');
    }

    const stepIds = new Set();
    p.steps.forEach((st, i) => {
      const where = p.id + '/' + (st.id || ('#' + (i + 1)));
      if(!st.id){ errors.push(where + ' — missing step id'); return; }
      if(stepIds.has(st.id)){ errors.push(where + ' — duplicate step id'); return; }
      stepIds.add(st.id);
      if(!st.title) errors.push(where + ' — missing title');

      if(!Array.isArray(st.passages) || !st.passages.length){
        errors.push(where + ' — no passage: a step without Scripture is not a Help Me step');
      }
      if(!Array.isArray(st.basis) || !st.basis.length){
        errors.push(where + ' — no basis: record the context actually read');
      } else if(Array.isArray(st.passages) && st.basis.join() === st.passages.join()){
        errors.push(where + ' — basis repeats the anchor instead of widening it');
      }

      const need = [['arrive', lim.arriveMax], ['notice', lim.noticeMax]];
      need.forEach(([field, max]) => {
        if(typeof st[field] !== 'string' || !st[field].trim()) errors.push(where + ' — no ' + field);
        else if(st[field].length > max) errors.push(where + ' — ' + field + ' is ' + st[field].length + ' characters, over ' + max);
      });

      const consider = st.consider || [];
      if(!Array.isArray(consider) || !consider.length) errors.push(where + ' — no consider question');
      else {
        if(consider.length > (lim.considerCountMax || 2)){
          errors.push(where + ' — ' + consider.length + ' questions, over ' + lim.considerCountMax + '. This is not a worksheet.');
        }
        consider.forEach((q, n) => {
          if(typeof q !== 'string' || !q.trim()) errors.push(where + ' — consider ' + (n + 1) + ' is empty');
          else if(q.length > (lim.considerMax || 220)) errors.push(where + ' — consider ' + (n + 1) + ' is ' + q.length + ' characters, over ' + lim.considerMax);
        });
      }

      /* Booleans, not the strings themselves: comparing the trimmed text
         meant two different strings were "different", and a step carrying
         BOTH a prayer and a prompt sailed through. Found by mutation. */
      const hasPrayer = !!(typeof st.prayer === 'string' && st.prayer.trim());
      const hasPrompt = !!(typeof st.prayerPrompt === 'string' && st.prayerPrompt.trim());
      if(hasPrayer === hasPrompt){
        errors.push(where + ' — a step carries exactly one of prayer or prayerPrompt');
      }
      [['prayer', st.prayer], ['prayerPrompt', st.prayerPrompt]].forEach(([field, v]) => {
        if(typeof v === 'string' && v.length > (lim.prayerMax || 900)){
          errors.push(where + ' — ' + field + ' is ' + v.length + ' characters, over ' + lim.prayerMax);
        }
      });

      const ns = st.nextStep;
      if(!ns || NEXT_KINDS.indexOf(ns.kind) === -1 || !ns.text){
        errors.push(where + ' — nextStep.kind must be one of ' + NEXT_KINDS.join(' | ') + ', with text');
      } else {
        if(ns.text.length > (lim.nextStepMax || 360)){
          errors.push(where + ' — nextStep is ' + ns.text.length + ' characters, over ' + lim.nextStepMax);
        }
        if(ns.kind === 'openPassage' && !ns.ref) errors.push(where + ' — nextStep opens a passage but names none');
        if(ns.kind === 'continue' && i === p.steps.length - 1){
          errors.push(where + ' — the last step cannot continue to a step that does not exist');
        }
      }

      const total = stepWordCount(st);
      if(total > (lim.stepWordsMax || 520)){
        errors.push(where + ' — ' + total + ' words of editorial prose, over ' + lim.stepWordsMax);
      }

      ['passages', 'basis', 'relatedPassages'].forEach(field => {
        (st[field] || []).forEach(ref => {
          if(typeof ref !== 'string' || !S.parseRef(ref)){
            errors.push(where + ' — ' + field + ' has an unparseable reference: ' + JSON.stringify(ref));
            return;
          }
          refs.push({ where: where + ' ' + field, ref: ref });
        });
      });
      if(ns && ns.ref){
        if(!S.parseRef(ns.ref)) errors.push(where + ' — nextStep names an unparseable reference: ' + JSON.stringify(ns.ref));
        else refs.push({ where: where + ' nextStep', ref: ns.ref });
      }

      steps.push({ path: p, step: st, where: where, n: i + 1 });
    });
  });

  const authored = doc.paths.filter(p => p.status === 'authored');
  notes.push(doc.paths.length + ' paths (' + authored.length + ' authored, ' +
             (doc.paths.length - authored.length) + ' outlined), ' + steps.length + ' steps');
  return { steps: steps, refs: refs, paths: doc.paths };
}

/* ---------- Scripture ---------- */

function checkReferences(refs, errors, notes){
  const eds = corpus.shippedEditions();
  const verses = {};
  eds.forEach(e => { verses[e] = corpus.verses(e); });
  const seen = new Set();
  refs.forEach(r => {
    const p = S.parseRef(r.ref);
    if(!p) return;
    seen.add(r.ref);
    eds.forEach(ed => {
      for(let v = p.from; v <= p.to; v++){
        const key = p.code + ' ' + p.chapter + ':' + v;
        const text = verses[ed].get(key);
        if(text === undefined) errors.push(r.where + ' — ' + r.ref + ' does not exist in ' + ed + ' (' + key + ')');
        else if(!String(text).trim()) errors.push(r.where + ' — ' + r.ref + ' is published empty in ' + ed + ' (' + key + ')');
      }
    });
  });
  notes.push(refs.length + ' references (' + seen.size + ' distinct) resolve in all ' + eds.length + ' shipped editions');
}

/* The passages these steps discuss, in every shipped ENGLISH edition. The
   prose is English; a six-word run of the Berean or the ASV is just as much
   a retyped verse as a run of the default edition. */
function passagesForOverlap(refs){
  const eds = corpus.shippedEditions().filter(e => e.indexOf('eng') === 0);
  const out = [];
  const seen = new Set();
  eds.forEach(ed => {
    const verses = corpus.verses(ed);
    refs.forEach(r => {
      const key = ed + '|' + r.ref;
      if(seen.has(key)) return;
      seen.add(key);
      const p = S.parseRef(r.ref);
      if(!p) return;
      const parts = [];
      for(let v = p.from; v <= p.to; v++){
        const t = verses.get(p.code + ' ' + p.chapter + ':' + v);
        if(t) parts.push(t);
      }
      if(parts.length) out.push({ ref: r.ref + ' (' + ed + ')', text: S.collapse(parts.join(' ')) });
    });
  });
  return { byId: out, editions: eds };
}

/* ---------- claims, diagnosis, safety, register ---------- */

/* Normalised the way the lints match, but with sentence punctuation left in,
   so a match can be read in the sentence it belongs to. */
function scanText(t){
  return String(t).toLowerCase()
    .replace(/[‘’']/g, "'")
    .replace(/[^a-z'.!?;:—-]+/g, ' ')
    .replace(/ +/g, ' ').trim();
}

const NEGATORS = /\b(not|never|nothing|nobody|cannot|can't|won't|doesn't|don't|isn't|aren't|refuses?|rather than|instead of|no promise|says nothing)\b/;

/* A claim this app must not MAKE is one a step may still NAME in order to
   deny it — and saying what a passage does not promise is most of the work
   these readings do. The forgiveness path cannot say "forgiveness does not
   require you to stay" if the lint fires on the words it has to use.

   So for the classes where a denial is legitimate, a match is cleared when
   the sentence it sits in is a denial. Sentence, not a window of characters:
   "It does not promise the pressure lifts. Your breakthrough is coming."
   must still fail on the second sentence. Register and unsourced-history
   patterns are NOT cleared this way: naming them is a style problem whether
   or not they are negated. */
function deniedInSentence(text, at){
  const start = Math.max(
    text.lastIndexOf('.', at), text.lastIndexOf('!', at),
    text.lastIndexOf('?', at), text.lastIndexOf(';', at), text.lastIndexOf(':', at));
  return NEGATORS.test(text.slice(start + 1, at));
}

function scanProse(items, errors, notes){
  let scanned = 0;
  const hit = (where, field, pattern, why) =>
    errors.push(where + ' — ' + field + ' says "' + pattern + '": ' + why);

  items.forEach(item => {
    Object.keys(item.fields).forEach(field => {
      const norm = S.normForOverlap(item.fields[field]);
      const sentenced = scanText(item.fields[field]);
      const asserted = pattern => {
        const at = sentenced.indexOf(pattern);
        return at !== -1 && !deniedInSentence(sentenced, at);
      };
      if(!norm) return;
      scanned++;
      D.FORBIDDEN_CLAIMS.forEach(c => { if(asserted(c.pattern)) hit(item.where, field, c.pattern, c.why); });
      HELP_CLAIMS.forEach(c => { if(asserted(c.pattern)) hit(item.where, field, c.pattern, c.why); });
      DIAGNOSIS_CLAIMS.forEach(p => {
        if(asserted(p)) hit(item.where, field, p, 'tells a reader what they have; Help Me does not diagnose');
      });
      SALVATION_STATUS.forEach(p => {
        if(asserted(p)) hit(item.where, field, p,
          'pronounces on where this reader stands with God, which the app cannot know and must not assert');
      });
      /* Not cleared by a denial: an unsourced period claim is unsourced
         either way, and the register is a style problem in any sentence. */
      HISTORICAL_CLAIMS.forEach(p => {
        if(norm.indexOf(p) !== -1) hit(item.where, field, p,
          'a historical claim with nothing behind it. Let the text make the point instead');
      });
      UNSAFE_RECONCILIATION.forEach(p => {
        if(asserted(p)) hit(item.where, field, p, 'keeps somebody within reach of harm for a spiritual reason');
      });
      GENERIC_COPY.forEach(p => {
        if(norm.indexOf(p) !== -1) hit(item.where, field, p, 'reads as generated rather than written');
      });
    });
  });
  notes.push(scanned + ' prose fields scanned for claims, diagnosis, unsafe counsel and canned copy');
}

/* No number a person might dial belongs anywhere except the verified crisis
   block. A number in a reading is a number nobody checked. */
function checkNumbersInProse(items, errors){
  items.forEach(item => {
    Object.keys(item.fields).forEach(field => {
      const m = String(item.fields[field]).match(/\d{3,}/g);
      if(m) errors.push(item.where + ' — ' + field + ' contains "' + m[0] +
        '". Numbers to dial live only in safety.crisis, where they carry a source and a date.');
    });
  });
}

/* ---------- the catalogue must not become a record about a person ---------- */

/* `confession[-_]?mode` and the rest: Help Me teaches that confession is
   asked for, and never encodes WHICH tradition's practice counts. A field
   for it would be this app adjudicating a difference it has no business
   settling. */
const FORBIDDEN_KEYS = /diagnos|severity|symptom|risk[-_]?level|mood|sentiment|profile|analytic|telemetry|streak|score|confession[-_]?mode|sacrament|absolution|denomination/i;

function checkNoProfileFields(node, errors, trail){
  if(!node || typeof node !== 'object') return;
  if(Array.isArray(node)){ node.forEach((v, i) => checkNoProfileFields(v, errors, trail + '[' + i + ']')); return; }
  Object.keys(node).forEach(k => {
    if(FORBIDDEN_KEYS.test(k)){
      errors.push('catalogue — field "' + trail + '.' + k + '" is the start of a record about a person. Help Me does not keep one.');
    }
    checkNoProfileFields(node[k], errors, trail + '.' + k);
  });
}

/* ---------- crisis resources ---------- */

function checkSafety(doc, errors, notes){
  const s = doc.safety;
  if(!s){ errors.push('catalogue — no safety block'); return; }
  if(!s.escalation || !s.escalation.homeEntry || !s.escalation.policy){
    errors.push('safety — escalation must say what is always available and what is contextual');
  }
  if(!s.unsafeRelationship || !s.unsafeRelationship.rule || !Array.isArray(s.unsafeRelationship.appliesTo)){
    errors.push('safety — the unsafe-relationship rule must be stated, with the paths it binds');
  }
  if(!Array.isArray(s.neverBuild) || s.neverBuild.length < 5){
    errors.push('safety — neverBuild must name what this feature will not become');
  }

  const c = s.crisis;
  if(!c){ errors.push('safety — no crisis configuration'); return; }
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if(!iso.test(c.verifiedOn || '')) errors.push('safety.crisis — verifiedOn must be an ISO date');
  if(!iso.test(c.reviewBy || '')) errors.push('safety.crisis — reviewBy must be an ISO date');
  if(iso.test(c.verifiedOn || '') && iso.test(c.reviewBy || '') && c.reviewBy <= c.verifiedOn){
    errors.push('safety.crisis — reviewBy must fall after verifiedOn');
  }
  const today = new Date().toISOString().slice(0, 10);
  if(iso.test(c.reviewBy || '') && today > c.reviewBy){
    errors.push('safety.crisis — the resources were last verified on ' + c.verifiedOn + ' and were due for review by ' +
      c.reviewBy + '. Re-read every source below, update verifiedOn and reviewBy, and only then ship Help Me content.');
  }

  if(!Array.isArray(c.sources) || c.sources.length < 2){
    errors.push('safety.crisis — list the sources these resources were read from');
  } else {
    c.sources.forEach((src, i) => {
      if(!/^https:\/\//.test(src.url || '')) errors.push('safety.crisis — source ' + (i + 1) + ' has no https url');
      if(!iso.test(src.checked || '')) errors.push('safety.crisis — source ' + (i + 1) + ' does not say when it was checked');
      if(!src.confirms) errors.push('safety.crisis — source ' + (i + 1) + ' does not say what it confirmed');
    });
  }

  if(!Array.isArray(c.territories) || !c.territories.length){
    errors.push('safety.crisis — no territory is configured');
  } else {
    c.territories.forEach(t => {
      const at = 'safety.crisis ' + (t.code || '?');
      if(!t.code || !t.name || !t.line) errors.push(at + ' — needs code, name and the service it names');
      if(!Array.isArray(t.actions) || !t.actions.length) errors.push(at + ' — no way to reach it');
      (t.actions || []).forEach(a => {
        if(!a.kind || !a.label || !a.value) errors.push(at + ' — an action needs kind, label and value');
        if(a.kind === 'chat' && !/^https:\/\//.test(a.value)) errors.push(at + ' — a chat action must be an https url');
      });
    });
  }
  if(!c.emergency || !c.emergency.text || !c.emergency.sourceNote){
    errors.push('safety.crisis — emergency guidance must say where its wording comes from');
  }
  if(!c.outsideListedTerritories || !c.outsideListedTerritories.guidance){
    errors.push('safety.crisis — say what a reader outside the listed territories is told, rather than inventing a number for them');
  }
  /* A number shown without its territory is a number somebody will dial in
     the wrong country. */
  if(!c.displayRule){
    errors.push('safety.crisis — state the rule that a resource is never shown without the territory it belongs to');
  }
  /* The edition of the Bible somebody reads says nothing about where they
     are. Guessing a country from it would put a US number in front of a
     reader in Shanghai. */
  if(!Array.isArray(c.neverInferTerritoryFrom) || !c.neverInferTerritoryFrom.length){
    errors.push('safety.crisis — name what territory must never be inferred from (edition, language, stored preference)');
  }
  /* Keying a resource to an edition is how the inference gets built by
     accident: a Spanish reader is not a reader in Spain, and a reader in
     Shanghai may well be reading the Berean. */
  corpus.shippedEditions().forEach(ed => {
    if(JSON.stringify(c).indexOf('"' + ed + '"') !== -1 || JSON.stringify(c).indexOf(ed + ':') !== -1){
      errors.push('safety.crisis — a resource is keyed to the edition "' + ed + '". Territory is never inferred from what somebody is reading.');
    }
  });
  notes.push('crisis resources verified ' + c.verifiedOn + ', review by ' + c.reviewBy + ', ' +
             (c.sources || []).length + ' sources, ' + (c.territories || []).length + ' territory');
}

/* ---------- the register ---------- */

function checkCadence(steps, errors, notes){
  const firsts = steps.map(x => S.normForOverlap(x.step.notice).split(' ')[0]);
  const dupes = firsts.filter((w, i) => firsts.indexOf(w) !== i);
  if(dupes.length) errors.push('two readings open with the same word (' + [...new Set(dupes)].join(', ') + ')');

  const arriveFirsts = steps.map(x => S.normForOverlap(x.step.arrive).split(' ')[0]);
  const aDupes = arriveFirsts.filter((w, i) => arriveFirsts.indexOf(w) !== i);
  if(aDupes.length) errors.push('two arrivals open with the same word (' + [...new Set(aDupes)].join(', ') + ')');

  const opens = steps.filter(x => x.step.prayer).map(x =>
    S.normForOverlap(x.step.prayer.split(',').slice(1).join(',')).split(' ').slice(0, 3).join(' '));
  const pDupes = opens.filter((w, i) => opens.indexOf(w) !== i);
  if(pDupes.length) errors.push('prayers share an opening (' + [...new Set(pDupes)].join(' | ') + ')');

  notes.push(steps.length + ' steps checked for repeated openings');
}

/* ---------- Phase A has no reader ---------- */

/* Phase A asserted the opposite of this: that index.html carried no Help Me
   catalogue, tab or stored progress, because the content had to be proven
   before anything could be opened. Phase C shipped the feature, so the check
   became the integration's own invariants rather than a phase gate.

   What matters now is that the app has ONE catalogue and it came from here.
   A second copy — a path entry retyped into UI source, a crisis number
   written into a template, a verse pasted into a step — is the failure this
   replaces, and it is the same failure in a different place. */
function checkNoUI(errors, notes, text){
  const app = typeof text === 'string' ? text : fs.readFileSync(APP, 'utf8');
  const doc = readCatalogue();
  const region = (app.match(/const HELP = \[[\s\S]*?\n\];/) || [''])[0];

  if(!region) errors.push('index.html carries no derived HELP region — run `npm run scripture:build`');
  if(app.indexOf('data-tab="help"') === -1) errors.push('index.html has no Help Me tab');

  /* Every path's human-facing entry must appear exactly once in the app, and
     inside the derived region. Twice means somebody wrote it into a template
     or a comment as well, and two copies of a sentence drift apart.

     Matched in the form the emitter writes: these entries contain straight
     apostrophes, which are escaped into the region as \\' — searching for the
     raw sentence finds nothing and reports a false absence. */
  const asEmitted = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  (doc.paths || []).forEach(p => {
    const needle = asEmitted(p.entry);
    const hits = app.split(needle).length - 1 + (needle === p.entry ? 0 : app.split(p.entry).length - 1);
    if(hits === 0) errors.push('path ' + p.id + ' — its entry does not reach the app');
    else if(hits > 1) errors.push('path ' + p.id + ' — its entry appears ' + hits +
      ' times in index.html; the UI should read the catalogue, not restate it');
    else if(region.indexOf(needle) === -1){
      errors.push('path ' + p.id + ' — its entry is in the app but outside the derived region');
    }
  });

  /* A crisis resource is read from the configuration, never typed into a
     template. Checked by VALUE, because a number is what a person dials. */
  const crisis = ((doc.safety || {}).crisis || {});
  const urgentRegion = (app.match(/const HELP_URGENT = \{[\s\S]*?\n\};/) || [''])[0];
  (crisis.territories || []).forEach(t => {
    (t.actions || []).forEach(a => {
      const outside = app.split(a.value).length - 1 - (urgentRegion.split(a.value).length - 1);
      if(outside > 0){
        errors.push('the resource value "' + a.value + '" appears ' + outside +
          ' time(s) outside HELP_URGENT; it must be read from the configuration');
      }
    });
  });

  /* Authoring provenance is not shipped: nothing on screen derives from it. */
  if(/\bbasis:\s*\[/.test(region)) errors.push('the derived HELP region ships `basis`, which nothing renders');

  notes.push('the app carries one Help Me catalogue, and it came from this file');
}

function checkCrossReferences(doc, errors){
  let studies = null;
  try{ studies = JSON.parse(fs.readFileSync(STUDIES, 'utf8')); }catch(e){ return; }
  const ids = new Set((studies.studies || studies).map(s => s.id));
  doc.paths.forEach(p => {
    if(!p.completion) return;
    if(p.completion.kind === 'learn'){
      if(!p.completion.study) errors.push('path ' + p.id + ' — completion points at Learn but names no study');
      else if(!ids.has(p.completion.study)){
        errors.push('path ' + p.id + ' — completion names study "' + p.completion.study + '", which does not exist');
      }
    } else if(p.completion.study){
      /* A study id on a completion that does not go to Learn is a pointer
         nothing follows, and the next person to move the completion will
         trust it. */
      errors.push('path ' + p.id + ' — completion names a study but does not hand the reader to Learn');
    }
  });
}

/* ---------- run ---------- */

function run(){
  const errors = [];
  const notes = [];
  const doc = readCatalogue();

  const { steps, refs } = validate(doc, errors, notes);
  checkNoProfileFields(doc, errors, 'help');
  checkSafety(doc, errors, notes);
  checkCrossReferences(doc, errors);
  checkNoUI(errors, notes);

  if(refs.length) checkReferences(refs, errors, notes);

  if(steps.length){
    const { byId, editions } = passagesForOverlap(refs);
    const items = steps.map(x => ({ where: x.where, fields: stepFields(x.step) }));
    doc.paths.forEach(p => items.push({ where: 'path ' + p.id, fields: pathFields(p) }));
    const before = errors.length;
    S.assertNoEmbeddedScripture(items, byId, errors);
    notes.push(items.length + ' prose groups scanned against ' + byId.length + ' passage renderings in ' +
               editions.length + ' English editions for six-word Scripture runs' +
               (errors.length === before ? '' : ' — ' + (errors.length - before) + ' found'));
    scanProse(items, errors, notes);
    checkNumbersInProse(items, errors);
    checkCadence(steps, errors, notes);
  }

  notes.forEach(n => console.log('  ' + n));

  if(errors.length){
    console.error('\nhelp:verify  FAILED — ' + errors.length + ' problem(s)');
    errors.slice(0, 40).forEach(e => console.error('    ' + e));
    if(errors.length > 40) console.error('    ... and ' + (errors.length - 40) + ' more');
    return 1;
  }
  console.log('help:verify  ok — the catalogue is structurally sound, every reference resolves in ' +
              'every shipped edition, and no prose reproduces Scripture, diagnoses anybody or ' +
              'claims more than it may');
  console.log('  (this proves nothing about whether the writing is TRUE, wise or pastorally right.');
  console.log('   That needs a person. See HELP-ME-REVIEW.md.)');
  return 0;
}

if(require.main === module){
  try{ process.exit(run()); }
  catch(e){ console.error('help:verify  ERROR — ' + e.message); process.exit(1); }
}

/* Exported so the contracts and the mutation suite drive the SAME code a
   release runs, rather than a second copy of it that can agree with itself
   while the real one is broken. */
module.exports = { readCatalogue, stepFields, pathFields, stepWordCount, run,
                   validate, checkReferences, passagesForOverlap, scanProse,
                   checkNumbersInProse, checkNoProfileFields, checkSafety,
                   checkCadence, checkNoUI, checkCrossReferences,
                   STATUS, NEXT_KINDS, COMPLETION_KINDS,
                   HELP_CLAIMS, DIAGNOSIS_CLAIMS, UNSAFE_RECONCILIATION, GENERIC_COPY,
                   SALVATION_STATUS, HISTORICAL_CLAIMS,
                   FORBIDDEN_KEYS, CATALOGUE };
