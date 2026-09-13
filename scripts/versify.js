/* =========================================================
   VERSIFICATION AUDIT
   ---------------------------------------------------------
   `npm run versify` — compare an edition's verse numbering against the
   numbering this app's canonical ids are built on.

   WHY THIS EXISTS
   ---------------
   A canonical id names a LOCATION. `PSA.20.7` is a place, and every edition
   is expected to supply the words that live there. That assumption is the
   whole basis of saved verses, highlights, the daily ledger and every
   deep link in the app — and it is FALSE for some perfectly legitimate
   Bibles.

   Louis Segond 1910 numbers a psalm's title line as verse 1. From there its
   numbering runs one ahead of ours for the rest of the chapter, so `PSA.20.7`
   resolves in Segond to what we call 20:6. The words are not wrong; they are
   the wrong words for that address. The first time this was found by hand,
   Psalm 20:7 was that day's reading.

   The check was done ad-hoc that time and thrown away. This file exists so
   it never has to be done from memory again, and so a candidate cannot ship
   without it.

   WHAT IT WILL AND WILL NOT DO
   ----------------------------
   It compares NUMBERING against NUMBERING, using each publisher's own
   markup. It never compares meaning: matching an English sentence to a
   Chinese one to decide whether an address lines up is inventing a mapping,
   which is the one thing this pipeline may never do.

   Two outcomes are distinguished, and the difference is the whole point:

     SAFE ABSENCE  the address exists in our numbering and the publisher has
                   no text there. Nothing is shown. An absence is an absence,
                   and saying so is honest.

     UNSAFE SHIFT  the address exists in both, and the publisher's text at it
                   is a DIFFERENT SENTENCE from the one our id means. This is
                   undetectable to a reader and it is how a Bible app quietly
                   lies. Any edition with one holds.

   And a third, because numbering genuinely cannot always tell the first two
   apart, and pretending otherwise is how the first version of this file went
   wrong:

     REVIEW        the chapter ends EARLIER than ours and nothing in the
                   publisher's markup explains why. That is what an omitted
                   last verse looks like — and it is also exactly what a
                   chapter looks like when two verses were merged in the middle
                   and everything after the merge moved up by one. Only a
                   person can tell which. An edition with an unresolved REVIEW
                   item has not passed.

   WHAT GATE 4 FOUND WRONG WITH THE FIRST VERSION
   ----------------------------------------------
   Four gaps, each proven on real data before it was closed.

   1. Every shortfall was called SAFE ABSENCE. The Ostervald Bible (fra_fob)
      merges our 2 Corinthians 13:12 and 13:13 into its 13:12 with no bridge
      markup, so its 13:13 is "La grâce du Seigneur Jésus-Christ…" — our
      13:14 — and the chapter ends one short. Its Psalm 66:1-19 are our
      66:2-20. Both were reported as one harmless missing verse each.

   2. BOUNDARY SPLIT looked forward but not back. When a chapter's last verse
      is renumbered as the first verse of the next — the Hebrew tradition's
      Numbers 29:40 = 30:1 — the next chapter looks "appended to" and was
      called SAFE while every address in it was shifted. Segond had fifteen
      of these, including Numbers 30, 1 Samuel 24, Jonah 2 and Ezekiel 21.

   3. The superscription rule only matched a chapter exactly one verse
      longer. A two-verse Hebrew title (Psalm 51, 52, 54, 60) makes it two
      longer, and fell through to the rules above.

   4. A book with a different number of chapters was reported and then
      ignored by the verdict. That is the Joel 3/4 and Malachi 3/4 problem.

   And one more that the fix for (2) exposed: a chapter one verse longer at
   the END, with both neighbours unchanged, was still called SAFE. Segond's
   Mark 10 is exactly that and is safe — it splits the last verse, so nothing
   follows to move. Segond's 1 Kings 22 is exactly that too and is not — it
   splits verse 43, so its 45 is our 44 and ten addresses hold the wrong
   sentence. Numbering cannot tell those two apart, so an append is only SAFE
   when it is PAIRED with a shortfall earlier in the same book (the Romans
   doxology: fewer verses at the end of 14, more at the end of 16). An
   unpaired append goes to REVIEW.

   None of these let an unsafe edition ship: the one that exposed them was
   caught by its psalm shifts anyway, and every shipped edition was re-checked
   against the stricter rules. But a trust tool that says SAFE when it means
   "I cannot see this" is the failure this app exists to avoid, so the verdicts
   are stricter now and the controls prove it.
   ========================================================= */

const corpus = require('./corpus.js');

/* Our canonical ids were derived against this edition, so its numbering is
   the numbering they mean. Not "the correct" numbering — there is no such
   thing — just the one this app's addresses were minted from. */
const CANON = corpus.DEFAULT_EDITION;

function chapterMapFrom(verses){
  const out = new Map();                       // "BOOK C" -> Set(verse numbers)
  for(const key of verses.keys()){
    const sp = key.indexOf(' ');
    const code = key.slice(0, sp);
    const cv = key.slice(sp + 1).split(':');
    const ch = code + ' ' + cv[0];
    if(!out.has(ch)) out.set(ch, new Set());
    out.get(ch).add(Number(cv[1]));
  }
  return out;
}
function chapterMap(id){ return chapterMapFrom(corpus.verses(id)); }

/* Text present and non-empty at an address. An address the publisher left
   blank counts as an absence, not as a verse. */
function liveFrom(verses){
  const out = new Map();
  for(const [key, text] of verses){
    if(String(text).trim()) out.set(key, text);
  }
  return out;
}

const maxOf = set => (set && set.size ? Math.max(...set) : 0);

/* REVIEW items a person has already looked at in a SHIPPED edition, with what
   they found. Numbering will never be able to prove these, so they would
   otherwise be reported on every run forever — and a warning that is always
   there is a warning nobody reads.

   This does not make anything safe. It records that a person checked, and it
   turns every NEW review item in a shipped edition into a failure: a publisher
   revision that introduces an unexplained shortfall or append cannot slip in
   under a list that was already non-empty.

   It lives here rather than in the registry because scripts/corpus.js copies
   registry fields into data/corpus.lock.json on every sync, and a review
   record should not be rewritten as a side effect of downloading an archive. */
const REVIEWED = {
  'cmn-cu89s': {
    'JHN 7':  'Our 7:53 is carried at the start of CUV 8:1, which otherwise is our 8:1. 7:1-52 align. ' +
              'Our 7:53 is absent; no address holds a different sentence. (Gate 4)',
    '3JN 1':  'CUV splits our 1:14 into 14 and 15. Its 14 is the first half of ours; nothing follows. (Gate 3)',
    'REV 12': 'CUV prints the dragon on the sand of the sea as 12:18; we carry it at the start of 13:1. ' +
              '12:1-17 and 13:1-18 align. (Gate 3)'
  },
  'cmn-cu89t': {
    'JHN 7':  'As cmn-cu89s: our 7:53 is carried at the start of CUV 8:1. (Gate 4)',
    '3JN 1':  'As cmn-cu89s: our 1:14 is split into 14 and 15. (Gate 3)',
    'REV 12': 'As cmn-cu89s: the sand-of-the-sea clause is printed as 12:18. (Gate 3)'
  }
};

/* `source` lets a test hand in a constructed edition — the only way to prove
   a rule catches a failure that no shipped Bible happens to have. Real audits
   leave it out and read the publisher's archive. */
function auditEdition(id, canon, canonSup, source){
  const verses = (source && source.verses) || corpus.verses(id);
  const sup = (source && source.superscriptions) || corpus.superscriptions(id);
  const spans = (source && source.spans) || corpus.bridgedSpans(id);
  const mine = chapterMapFrom(verses);
  const live = liveFrom(verses);

  const canonBooks = new Set([...canon.keys()].map(k => k.split(' ')[0]));
  const myBooks = new Set([...mine.keys()].map(k => k.split(' ')[0]));
  const shared = [...canonBooks].filter(b => myBooks.has(b));

  const r = {
    id: id,
    booksCanonOnly: [...canonBooks].filter(b => !myBooks.has(b)),
    booksEditionOnly: [...myBooks].filter(b => !canonBooks.has(b)),
    chaptersCompared: 0,
    chaptersAligned: 0,
    absenceChapters: [],      // fewer addresses, explained — safe
    absentAddresses: 0,
    reviewChapters: [],       // numbering cannot decide — a person must
    reviewKeys: [],           // the same, as bare chapter ids
    shiftChapters: [],        // extra addresses explained by a superscription — unsafe
    boundaryChapters: [],     // extra addresses appended past our last verse — safe
    unexplained: [],          // extra addresses with no structural explanation — unsafe
    chapterCountDiff: []      // the book has a different number of chapters — unsafe
  };

  shared.forEach(book => {
    const canonCh = [...canon.keys()].filter(k => k.split(' ')[0] === book).length;
    const myCh = [...mine.keys()].filter(k => k.split(' ')[0] === book).length;
    if(canonCh !== myCh) r.chapterCountDiff.push(book + ': ours ' + canonCh + ', theirs ' + myCh);
  });

  const key = (book, n) => book + ' ' + n;
  const numOf = ch => Number(ch.split(' ')[1]);

  /* A superscription shift, of any size. Our edition marks the psalm's title
     as apparatus, theirs does not, and theirs is LONGER — so the title became
     one or more numbered verses and everything after it moved down. */
  function isSuperscriptionShift(ch){
    const c = canon.get(ch), m = mine.get(ch);
    return !!c && !!m && canonSup.has(ch) && !sup.has(ch) && maxOf(m) > maxOf(c);
  }

  /* Extra addresses appended past our last verse, with nothing pushed across
     either boundary: the next chapter is as long as ours AND the previous one
     did not lose verses. Checking only forwards is the gap that let Segond's
     Numbers 30 through — its first verse is our 29:40, which looks exactly like
     an appended verse unless you notice 29 is one short.

     This is the SHAPE of an append. It is not yet a verdict: see pairedWith(). */
  function isAppend(ch){
    const c = canon.get(ch), m = mine.get(ch);
    if(!c || !m) return false;
    const extra = [...m].filter(v => !c.has(v));
    if(!extra.length || !extra.every(v => v > maxOf(c))) return false;
    if(isSuperscriptionShift(ch)) return false;
    const book = ch.split(' ')[0], n = numOf(ch);
    const cNext = canon.get(key(book, n + 1)), mNext = mine.get(key(book, n + 1));
    if(cNext && (!mNext || maxOf(mNext) !== maxOf(cNext))) return false;
    const cPrev = canon.get(key(book, n - 1)), mPrev = mine.get(key(book, n - 1));
    if(cPrev && mPrev && maxOf(mPrev) < maxOf(cPrev)) return false;
    return true;
  }

  /* A chapter that ends before ours is SAFE only when the publisher has said
     why, in one of two ways the archives can actually show:
       - the tail is inside a bridged span it declared (<v v="17-18">), or
       - the tail was relocated to a LATER chapter of the same book that is a
         clean boundary split, with every chapter between them unchanged —
         the Romans doxology, which we carry at 14:24-26 and eight other
         editions carry at 16:25-27.
     Anything else goes to REVIEW. The chapter being the last in its book does
     NOT explain it: 2 Corinthians 13 is a last chapter, and it is where the
     Ostervald's unmarked merge is. */
  function shortfallExplanation(ch){
    const c = canon.get(ch), m = mine.get(ch);
    const book = ch.split(' ')[0], n = numOf(ch);
    const myMax = maxOf(m), canonMax = maxOf(c);
    let covered = true;
    for(let t = myMax + 1; t <= canonMax; t++){
      let inSpan = false;
      for(let a = 1; a <= myMax; a++){
        const last = spans.get(ch + ':' + a);
        if(last && last >= t){ inSpan = true; break; }
      }
      if(!inSpan){ covered = false; break; }
    }
    if(covered) return 'bridged';
    for(let j = n + 1; canon.has(key(book, j)); j++){
      const cj = canon.get(key(book, j)), mj = mine.get(key(book, j));
      if(!mj) return null;
      if(maxOf(mj) === maxOf(cj)) continue;
      return isAppend(key(book, j)) ? 'relocated to ' + key(book, j) : null;
    }
    return null;
  }

  /* An append is SAFE only when it is where a shortfall earlier in the same
     book went: walking back over unchanged chapters, the first chapter that
     differs ends early and its tail was relocated to THIS chapter. That is
     verses moving, which is visible in the numbering. An unpaired append is a
     split verse — safe if it was the last verse, a shift of everything after
     it if it was not — and the numbering cannot say which. */
  function pairedWith(ch){
    const book = ch.split(' ')[0], n = numOf(ch);
    for(let k = n - 1; canon.has(key(book, k)); k--){
      const ck = canon.get(key(book, k)), mk = mine.get(key(book, k));
      if(!mk) return null;
      if(maxOf(mk) === maxOf(ck)) continue;
      if(maxOf(mk) > maxOf(ck)) return null;
      return shortfallExplanation(key(book, k)) === 'relocated to ' + ch ? key(book, k) : null;
    }
    return null;
  }

  for(const [ch, canonSet] of canon){
    const book = ch.split(' ')[0];
    if(!myBooks.has(book)) continue;           // canon difference, not a shift
    const mySet = mine.get(ch);
    if(!mySet) continue;                       // chapter absent entirely
    r.chaptersCompared++;

    const canonMax = maxOf(canonSet);
    const myMax = maxOf(mySet);
    const extra = [...mySet].filter(v => !canonSet.has(v));
    const missing = [...canonSet].filter(v => !mySet.has(v) || !live.has(ch + ':' + v));

    if(!extra.length){
      if(!missing.length){ r.chaptersAligned++; continue; }
      if(myMax < canonMax){
        const why = shortfallExplanation(ch);
        if(!why){
          r.reviewChapters.push(ch + ' ends at ' + myMax + ', ours at ' + canonMax);
          r.reviewKeys.push(ch);
          continue;
        }
        r.absenceChapters.push(ch + ' (' + missing.length + ', ' + why + ')');
      } else {
        r.absenceChapters.push(ch + ' (' + missing.length + ')');
      }
      r.absentAddresses += missing.length;
      continue;
    }

    if(isSuperscriptionShift(ch)){
      r.shiftChapters.push(ch + (myMax - canonMax > 1 ? ' (+' + (myMax - canonMax) + ')' : ''));
      continue;
    }

    if(isAppend(ch) && pairedWith(ch)){
      /* A chapter can be appended to AND have an absence in it at the same
         time. Berean Standard Bible's Romans 16 is exactly that: it carries
         the doxology at 26-27 that we hold at 14:24-26, and it omits 16:24,
         the "grace" verse the critical texts drop. An absence below our last
         verse displaces nothing, so it is counted as what it is rather than
         disqualifying the chapter. */
      r.boundaryChapters.push(ch + ' +' + extra.join(',') + ' (from ' + pairedWith(ch) + ')' +
        (missing.length ? '  (and ' + missing.length + ' absent)' : ''));
      if(missing.length) r.absentAddresses += missing.length;
    } else if(isAppend(ch)){
      r.reviewChapters.push(ch + ' gains ' + extra.join(',') + ' at the end — a split last verse is safe, ' +
                            'a verse split earlier in the chapter shifts everything after it');
      r.reviewKeys.push(ch);
    } else {
      r.unexplained.push(ch + ' ours 1-' + canonMax + ', theirs 1-' + myMax +
                         ' extra ' + extra.slice(0, 4).join(','));
    }
  }

  /* DUPLICATED VERSES. Not a numbering problem, and invisible to every rule
     above: the chapter has exactly our verse numbers and still shows the wrong
     thing. The Ostervald Bible prints Luke 10:41 and 10:42 as the same 187
     characters — both verses' words, twice — and the same at Acts 19:40-41.
     Luke 10:41-42 is one of this app's daily readings, so a French reader's
     Today card would have printed the passage twice, and "every curated
     passage resolves" would have passed it.

     Two adjacent addresses holding identical text is a defect in the source,
     not a translation choice: across eleven editions and roughly 340,000
     verses it occurs nowhere else. Refrains repeat a clause, never a whole
     verse. */
  r.duplicates = [];
  let prevKey = null, prevText = null;
  for(const [k, t] of verses){
    const text = String(t).replace(/\s+/g, ' ').trim();
    const sameBook = prevKey && prevKey.split(' ')[0] === k.split(' ')[0];
    if(text && sameBook && text === prevText) r.duplicates.push(prevKey + ' = ' + k.split(' ')[1]);
    prevKey = k; prevText = text;
  }

  /* SAFE is structural agreement. It deliberately says nothing about REVIEW
     items, which are a separate question a person has to answer. */
  r.safe = r.unexplained.length === 0 && r.shiftChapters.length === 0 &&
           r.chapterCountDiff.length === 0 && r.duplicates.length === 0;
  const reviewed = REVIEWED[id] || {};
  r.unreviewed = r.reviewKeys.filter(k => !reviewed[k]);
  r.clean = r.safe && r.unreviewed.length === 0;
  return r;
}

/* Every canonical id the app actually ships, checked for real text at that
   exact address. A curated passage that cannot resolve is not a statistic:
   it is a day on the home screen with nothing on it.

   A verse printed inside a publisher's bridged span counts as present, the
   same way the build counts it (scripture.js insideCollectedSpan). Without
   that, the Chinese Union Version's Luke 1:1-2 was reported absent when every
   word of it is on screen. */
function curatedCheck(id){
  const H = require('../test/harness.js');
  const S = require('./scripture.js');
  const shipped = H.loadApp().ctx.SCRIPTURE || [];
  const live = liveFrom(corpus.verses(id));
  const spans = corpus.bridgedSpans(id);
  const missing = [];
  shipped.forEach(p => {
    const ref = S.parseRef(p.ref);
    if(!ref) return;
    for(let v = ref.from; v <= ref.to; v++){
      if(live.has(ref.code + ' ' + ref.chapter + ':' + v)) continue;
      let covered = false;
      for(let a = ref.from; a < v; a++){
        const last = spans.get(ref.code + ' ' + ref.chapter + ':' + a);
        if(last && last >= v){ covered = true; break; }
      }
      if(covered) continue;
      missing.push(p.ref + ' v' + v);
      break;
    }
  });
  return { total: shipped.length, missing: missing };
}

function status(id){
  const ed = corpus.EDITIONS[id];
  if(!ed) return '(NOT IN THE REGISTRY — audit only)';
  return ed.held ? '(HELD: ' + ed.held + ')' : '(shipped)';
}

function report(id, canon, canonSup, withCurated){
  const r = auditEdition(id, canon, canonSup);

  console.log('');
  console.log('--- ' + id + ' ' + status(id));
  console.log('    chapters compared        : ' + r.chaptersCompared);
  console.log('    numbering identical      : ' + r.chaptersAligned);
  console.log('    chapters with ABSENCES   : ' + r.absenceChapters.length +
              '  (' + r.absentAddresses + ' addresses)   SAFE');
  if(r.absenceChapters.length) console.log('      ' + r.absenceChapters.slice(0, 12).join('  ') +
    (r.absenceChapters.length > 12 ? '  …' : ''));
  console.log('    boundary SPLITS          : ' + r.boundaryChapters.length + '   SAFE');
  if(r.boundaryChapters.length) r.boundaryChapters.forEach(b => console.log('      ' + b));
  console.log('    numbering cannot decide  : ' + r.reviewChapters.length + '   REVIEW' +
    (r.reviewChapters.length ? '  (' + r.unreviewed.length + ' not yet looked at by a person)' : ''));
  const reviewed = REVIEWED[id] || {};
  r.reviewChapters.slice(0, 12).forEach((x, i) => {
    const note = reviewed[r.reviewKeys[i]];
    console.log('      ' + x);
    console.log('        ' + (note ? 'reviewed: ' + note : 'NOT REVIEWED'));
  });
  if(r.reviewChapters.length > 12) console.log('      … and ' + (r.reviewChapters.length - 12) + ' more');
  console.log('    superscription SHIFTS    : ' + r.shiftChapters.length + '   UNSAFE');
  if(r.shiftChapters.length) console.log('      ' + r.shiftChapters.slice(0, 12).join('  ') +
    (r.shiftChapters.length > 12 ? '  … and ' + (r.shiftChapters.length - 12) + ' more' : ''));
  console.log('    UNEXPLAINED extra verses : ' + r.unexplained.length + '   UNSAFE');
  if(r.unexplained.length) r.unexplained.slice(0, 10).forEach(u => console.log('      ' + u));
  console.log('    chapter-count differences: ' + r.chapterCountDiff.length + '   UNSAFE' +
    (r.chapterCountDiff.length ? '  ' + r.chapterCountDiff.join('; ') : ''));
  console.log('    DUPLICATED adjacent verses: ' + r.duplicates.length + '  UNSAFE' +
    (r.duplicates.length ? '  ' + r.duplicates.join('; ') : ''));
  if(r.booksCanonOnly.length)
    console.log('    books we have, it lacks  : ' + r.booksCanonOnly.length + '  ' + r.booksCanonOnly.slice(0, 20).join(' '));
  if(r.booksEditionOnly.length)
    console.log('    books it has, we lack    : ' + r.booksEditionOnly.join(' '));

  if(withCurated){
    const cur = curatedCheck(id);
    console.log('    curated passages         : ' + (cur.total - cur.missing.length) + ' of ' +
                cur.total + ' resolve with text');
    if(cur.missing.length) console.log('      absent: ' + cur.missing.slice(0, 8).join('; ') +
      (cur.missing.length > 8 ? ' … and ' + (cur.missing.length - 8) + ' more' : ''));
  }
  console.log('    VERDICT                  : ' + (!r.safe
    ? 'DOES NOT AGREE — this edition must not ship'
    : r.unreviewed.length
      ? 'REVIEW REQUIRED — ' + r.unreviewed.length + ' chapter(s) the numbering cannot classify; ' +
        'a person must confirm no address holds a different sentence'
      : r.reviewKeys.length
        ? 'numbering agrees with our canonical ids; ' + r.reviewKeys.length +
          ' chapter(s) it cannot classify were checked by a person'
        : 'numbering agrees with our canonical ids'));
  return { id: id, safe: r.safe, clean: r.clean, r: r };
}

function run(only){
  const canon = chapterMap(CANON);
  const canonSup = corpus.superscriptions(CANON);
  const ids = only ? [only] : Object.keys(corpus.EDITIONS).filter(id => id !== CANON);

  console.log('versify  numbering compared against ' + CANON + ', which our canonical ids were minted from');
  console.log('  ' + canon.size + ' chapters in the reference edition');

  const results = ids.map(id => report(id, canon, canonSup, true));

  console.log('');
  console.log('  SAFE   : ' + (results.filter(x => x.clean).map(x => x.id).join(', ') || 'none'));
  console.log('  REVIEW : ' + (results.filter(x => x.safe && !x.clean).map(x => x.id).join(', ') || 'none'));
  console.log('  UNSAFE : ' + (results.filter(x => !x.safe).map(x => x.id).join(', ') || 'none'));
  console.log('');
  console.log('  A SAFE verdict means the numbering lines up. It says nothing about');
  console.log('  rights, completeness or whether the edition should be offered at all.');

  /* An edition that is SHIPPING must be structurally safe AND have no review
     item that a person has not looked at. A held one may be anything — that
     is what held means. The second condition is what stops a publisher's
     revision from introducing an ambiguity into a shipped Bible unnoticed. */
  const shipping = x => corpus.EDITIONS[x.id] && !corpus.EDITIONS[x.id].held;
  const failing = results.filter(x => shipping(x) && !x.clean);
  if(failing.length){
    console.error('versify  FAILED — shipped edition(s) that are unsafe or carry an unreviewed ambiguity: ' +
      failing.map(x => x.id + (x.safe ? ' (unreviewed: ' + x.r.unreviewed.join(', ') + ')' : ' (unsafe)')).join('; '));
    return 1;
  }
  return 0;
}

if(require.main === module){
  try{ process.exit(run(process.argv[2])); }
  catch(e){ console.error('versify  ERROR — ' + e.message); process.exit(1); }
}

module.exports = { auditEdition, chapterMap, chapterMapFrom, curatedCheck, CANON, REVIEWED };
