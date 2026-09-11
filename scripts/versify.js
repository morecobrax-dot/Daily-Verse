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

   HOW A SHIFT IS DETECTED WITHOUT READING THE TEXT
   ------------------------------------------------
   A chapter that gained a verse gained it from somewhere. The one structural
   explanation the archives can actually prove is the superscription: the
   publisher's own `<d style="d">` markup says whether a psalm's title line is
   apparatus or verse 1. When the canonical edition marks a title as apparatus
   and the candidate does not, and the candidate's chapter is exactly one
   verse longer, every verse after the title is displaced by one. That is read
   out of two publishers' markup, not guessed from two languages' words.

   Anything else that adds addresses is reported as UNEXPLAINED and holds the
   edition. Not because it is certainly wrong, but because "probably fine" is
   not the standard a Bible gets to be held to.
   ========================================================= */

const corpus = require('./corpus.js');

/* Our canonical ids were derived against this edition, so its numbering is
   the numbering they mean. Not "the correct" numbering — there is no such
   thing — just the one this app's addresses were minted from. */
const CANON = corpus.DEFAULT_EDITION;

function chapterMap(id){
  const out = new Map();                       // "BOOK C" -> Set(verse numbers)
  for(const key of corpus.verses(id).keys()){
    const sp = key.indexOf(' ');
    const code = key.slice(0, sp);
    const cv = key.slice(sp + 1).split(':');
    const ch = code + ' ' + cv[0];
    if(!out.has(ch)) out.set(ch, new Set());
    out.get(ch).add(Number(cv[1]));
  }
  return out;
}

/* Text present and non-empty at an address. An address the publisher left
   blank counts as an absence, not as a verse. */
function liveVerses(id){
  const out = new Map();
  for(const [key, text] of corpus.verses(id)){
    if(String(text).trim()) out.set(key, text);
  }
  return out;
}

function auditEdition(id, canon, canonSup){
  const mine = chapterMap(id);
  const sup = corpus.superscriptions(id);
  const live = liveVerses(id);

  const canonBooks = new Set([...canon.keys()].map(k => k.split(' ')[0]));
  const myBooks = new Set([...mine.keys()].map(k => k.split(' ')[0]));
  const shared = [...canonBooks].filter(b => myBooks.has(b));

  const r = {
    id: id,
    booksCanonOnly: [...canonBooks].filter(b => !myBooks.has(b)),
    booksEditionOnly: [...myBooks].filter(b => !canonBooks.has(b)),
    chaptersCompared: 0,
    chaptersAligned: 0,
    absenceChapters: [],      // fewer addresses — safe
    absentAddresses: 0,
    shiftChapters: [],        // extra addresses explained by a superscription
    boundaryChapters: [],     // extra addresses appended past our last verse
    unexplained: [],          // extra addresses with no structural explanation
    chapterCountDiff: []      // the book has a different number of chapters
  };

  shared.forEach(book => {
    const canonCh = [...canon.keys()].filter(k => k.split(' ')[0] === book).length;
    const myCh = [...mine.keys()].filter(k => k.split(' ')[0] === book).length;
    if(canonCh !== myCh) r.chapterCountDiff.push(book + ': ours ' + canonCh + ', theirs ' + myCh);
  });

  for(const [ch, canonSet] of canon){
    const book = ch.split(' ')[0];
    if(!myBooks.has(book)) continue;           // canon difference, not a shift
    const mySet = mine.get(ch);
    if(!mySet) continue;                       // chapter absent entirely
    r.chaptersCompared++;

    const canonMax = Math.max(...canonSet);
    const myMax = Math.max(...mySet);
    const extra = [...mySet].filter(v => !canonSet.has(v));
    const missing = [...canonSet].filter(v => !mySet.has(v) || !live.has(ch.replace(' ', ' ') + ':' + v));

    if(!extra.length){
      if(!missing.length) r.chaptersAligned++;
      else {
        r.absenceChapters.push(ch + ' (' + missing.length + ')');
        r.absentAddresses += missing.length;
      }
      continue;
    }

    /* The chapter gained addresses. Two explanations are accepted, and
       nothing else is.

       1. SUPERSCRIPTION SHIFT — the publisher numbers a psalm's title as
          verse 1 where ours treats it as apparatus. Everything after the
          title is displaced by one. Read out of two publishers' own <d>
          markup. This is the Segond failure and it is UNSAFE.

       2. BOUNDARY SPLIT — every extra address lies ABOVE our last verse,
          every one of our addresses is still present, and the NEXT chapter
          is exactly as long as ours. An address appended past the end of a
          chapter cannot displace the verses before it, and an unchanged
          following chapter shows nothing was pushed across the boundary
          either. This is the Romans doxology, and the sand-of-the-sea line
          that the Chinese Union Version prints as Revelation 12:18 while we
          carry it inside 13:1. SAFE, and every instance is listed so a
          person sees them rather than trusting the word "safe".

       Numbering alone cannot tell an appended verse from one inserted at the
       top of a chapter — both make the chapter one longer. Test 1 is the only
       insertion mechanism these archives document, so anything that is not
       clearly 1 or 2 is reported as UNEXPLAINED and holds the edition. Not
       because it is certainly wrong, but because "probably fine" is not a
       standard a Bible gets to be held to. */
    const canonHasSup = canonSup.has(ch);
    const mineHasSup = sup.has(ch);
    const oneLonger = myMax === canonMax + 1;
    if(canonHasSup && !mineHasSup && oneLonger){
      r.shiftChapters.push(ch);
      continue;
    }

    const allAbove = extra.every(v => v > canonMax);
    const nextKey = book + ' ' + (Number(ch.split(' ')[1]) + 1);
    const canonNext = canon.get(nextKey), myNext = mine.get(nextKey);
    const nextUnchanged = !canonNext
      ? true                                   // last chapter: nothing downstream
      : !!myNext && Math.max(...myNext) === Math.max(...canonNext);

    if(allAbove && nextUnchanged){
      /* A chapter can be appended to AND have an absence in it at the same
         time. Berean Standard Bible's Romans 16 is exactly that: it carries
         the doxology at 26-27 that we hold at 14:24-26, and it omits 16:24,
         the "grace" verse the critical texts drop. An absence below our last
         verse displaces nothing, so it is counted as what it is rather than
         disqualifying the chapter. Requiring no absences here failed a
         shipped, hand-audited edition, which is how the flaw was found. */
      r.boundaryChapters.push(ch + ' +' + extra.join(',') +
        (missing.length ? '  (and ' + missing.length + ' absent)' : ''));
      if(missing.length) r.absentAddresses += missing.length;
    } else {
      r.unexplained.push(ch + ' ours 1-' + canonMax + ', theirs 1-' + myMax +
                         ' extra ' + extra.slice(0, 4).join(','));
    }
  }
  return r;
}

/* Every canonical id the app actually ships, checked for real text at that
   exact address. A curated passage that cannot resolve is not a statistic:
   it is a day on the home screen with nothing on it. */
function curatedCheck(id){
  const H = require('../test/harness.js');
  const S = require('./scripture.js');
  const shipped = H.loadApp().ctx.SCRIPTURE || [];
  const live = liveVerses(id);
  const missing = [];
  shipped.forEach(p => {
    const ref = S.parseRef(p.ref);
    if(!ref) return;
    for(let v = ref.from; v <= ref.to; v++){
      if(!live.has(ref.code + ' ' + ref.chapter + ':' + v)){
        missing.push(p.ref + ' v' + v);
        break;
      }
    }
  });
  return { total: shipped.length, missing: missing };
}

function report(id, canon, canonSup, withCurated){
  const r = auditEdition(id, canon, canonSup);
  const ed = corpus.EDITIONS[id] || { id: id };
  const safe = r.unexplained.length === 0 && r.shiftChapters.length === 0;

  console.log('');
  console.log('--- ' + id + ' ' + (ed.held ? '(HELD: ' + ed.held + ')' : '(shipped)'));
  console.log('    chapters compared        : ' + r.chaptersCompared);
  console.log('    numbering identical      : ' + r.chaptersAligned);
  console.log('    chapters with ABSENCES   : ' + r.absenceChapters.length +
              '  (' + r.absentAddresses + ' addresses)   SAFE');
  if(r.absenceChapters.length) console.log('      ' + r.absenceChapters.slice(0, 12).join('  ') +
    (r.absenceChapters.length > 12 ? '  …' : ''));
  console.log('    boundary SPLITS          : ' + r.boundaryChapters.length + '   SAFE');
  if(r.boundaryChapters.length) r.boundaryChapters.forEach(b => console.log('      ' + b));
  console.log('    superscription SHIFTS    : ' + r.shiftChapters.length + '   UNSAFE');
  if(r.shiftChapters.length) console.log('      ' + r.shiftChapters.slice(0, 12).join('  ') +
    (r.shiftChapters.length > 12 ? '  … and ' + (r.shiftChapters.length - 12) + ' more' : ''));
  console.log('    UNEXPLAINED extra verses : ' + r.unexplained.length + '   UNSAFE');
  if(r.unexplained.length) r.unexplained.slice(0, 10).forEach(u => console.log('      ' + u));
  if(r.booksCanonOnly.length)
    console.log('    books we have, it lacks  : ' + r.booksCanonOnly.length + '  ' + r.booksCanonOnly.slice(0, 20).join(' '));
  if(r.booksEditionOnly.length)
    console.log('    books it has, we lack    : ' + r.booksEditionOnly.join(' '));
  if(r.chapterCountDiff.length)
    console.log('    chapter-count differences: ' + r.chapterCountDiff.join('; '));

  if(withCurated){
    const cur = curatedCheck(id);
    console.log('    curated passages         : ' + (cur.total - cur.missing.length) + ' of ' +
                cur.total + ' resolve with text');
    if(cur.missing.length) console.log('      absent: ' + cur.missing.slice(0, 8).join('; ') +
      (cur.missing.length > 8 ? ' … and ' + (cur.missing.length - 8) + ' more' : ''));
  }
  console.log('    VERDICT                  : ' + (safe
    ? 'numbering agrees with our canonical ids'
    : 'DOES NOT AGREE — this edition must not ship'));
  return { id: id, safe: safe, r: r };
}

function run(only){
  const canon = chapterMap(CANON);
  const canonSup = corpus.superscriptions(CANON);
  const ids = only ? [only] : Object.keys(corpus.EDITIONS).filter(id => id !== CANON);

  console.log('versify  numbering compared against ' + CANON + ', which our canonical ids were minted from');
  console.log('  ' + canon.size + ' chapters in the reference edition');

  const results = ids.map(id => report(id, canon, canonSup, true));

  console.log('');
  console.log('  SAFE   : ' + results.filter(x => x.safe).map(x => x.id).join(', '));
  console.log('  UNSAFE : ' + (results.filter(x => !x.safe).map(x => x.id).join(', ') || 'none'));
  console.log('');
  console.log('  A SAFE verdict means the numbering lines up. It says nothing about');
  console.log('  rights, completeness or whether the edition should be offered at all.');

  /* An edition that is SHIPPING must be safe. A held one may be anything —
     that is what held means. */
  const shippingAndUnsafe = results.filter(x => !x.safe && !(corpus.EDITIONS[x.id] || {}).held);
  if(shippingAndUnsafe.length){
    console.error('versify  FAILED — shipped edition(s) with numbering that does not agree: ' +
      shippingAndUnsafe.map(x => x.id).join(', '));
    return 1;
  }
  return 0;
}

if(require.main === module){
  try{ process.exit(run(process.argv[2])); }
  catch(e){ console.error('versify  ERROR — ' + e.message); process.exit(1); }
}

module.exports = { auditEdition, chapterMap, curatedCheck, CANON };
