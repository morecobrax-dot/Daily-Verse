/* =========================================================
   TEST RUNNER
   ---------------------------------------------------------
     npm test              contracts only  (~1s)
     npm run verify        contracts + config + contamination

   `verify` is the one command to remember. It is the gate before
   any commit or deploy: it proves the contracts hold, that the
   static PWA files still match APP_CONFIG, and that no domain
   residue has crept back in.

   Exit code 0 = pass, 1 = failure. Failures are listed at the end.

   SAFETY: this suite loads index.html as text and runs it against
   an in-memory store. No real browser storage is read or written.
   ========================================================= */
'use strict';
const C = require('./contracts.js');
const { isAbsence } = require('../scripts/corpus.js');

const TIER = (process.argv[2] || 'contracts').toLowerCase();
/* Suites that could not run, and why. Never empty on a machine that has not
   synced the publisher's archives — see the loop in main(). */
const unrun = [];

/* Contracts run in dependency order: identity and storage first, because
   everything above them is meaningless if those are wrong. */
const SUITES = [
  C.testBoot,
  C.testConfig,
  C.testStorage,
  C.testCollision,
  C.testMigration,
  C.testNavigation,
  C.testOverlays,
  C.testToast,
  C.testConfirmation,
  C.testForms,
  C.testScripture,
  C.testDays,
  C.testPersonalisation,
  C.testUpgrade,
  C.testStudies,
  C.testCatalogueSplit,
  C.testStudyStorage,
  C.testLearnNavigation,
  C.testLessonRendering,
  C.testLearnProgress,
  C.testLearnNotes,
  C.testTodayUnharmed,
  C.testStudyCatalogue,
  C.testAppearance,
  C.testSmallTextContrast,
  C.testKnowledgeChecks,
  C.testFaithfulCopy,
  C.testTranslations,
  C.testBibleReader,
  C.testPrimaryNavigation,
  C.testReaderQuality,
  C.testDevotions,
  C.testDevotionsExperience,
  C.testHelpMe,
  C.testColdSaved,
  C.testDeviceMove,
  C.testHelpProduct,
  C.testTranslationLibrary,
  C.testNumberingAudit,
  C.testSourceRevision,
  C.testBrandIdentity,
  C.testBackNavigation,
  C.testInteractionQuality,
  C.testMobile,
  C.testDesignSystem,
  C.testPWA,
  C.testRelease,
  C.testAccessibility,
  C.testStress,
  C.testSourcesOfTruth,
  C.testPortability,
  C.testContamination
];

/* A run that never finishes must never look like a run that passed.
 *
 * THE DEFECT, found by mutation-testing the service worker: an async contract
 * awaiting a promise that never settles leaves the event loop with nothing in
 * it. Node treats that as a clean finish and exits 0. The RESULT block is
 * never printed, two real FAIL lines scroll past above it, and `npm run
 * verify` reports success — so the mutation was caught by the contracts and
 * reported as a pass by the runner, which is the worse of the two failures.
 *
 * The flag is set only where the run reaches its own conclusion. Anything
 * else that empties the event loop lands here instead.
 *
 * The markers are so a contract can lift this block out and run it in a
 * child process against a promise that never settles, rather than asserting
 * that the text of it is present. */
/* COMPLETION-GUARD-BEGIN */
let finished = false;
process.on('exit', code => {
  if(finished || code !== 0) return;
  console.log('\n' + '='.repeat(64));
  console.log('  RUNNER NEVER FINISHED');
  console.log('='.repeat(64));
  console.log('  A suite stopped before the result block. Almost always an');
  console.log('  await on a promise that never settles — a response the code');
  console.log('  under test never produces.');
  console.log('');
  console.log('  This is NOT a pass. Any PASS above it is incomplete, and any');
  console.log('  FAIL above it is real.\n');
  process.exitCode = 1;
});
/* COMPLETION-GUARD-END */

async function main(){
  const started = Date.now();
  console.log('\n' + '='.repeat(64));
  console.log('  NEW COVENANT CONTRACTS — tier: ' + TIER);
  console.log('='.repeat(64));

  /* A check that could not be made is reported, not crashed over, and never
     counted as a pass.

     THE DEFECT: the Scripture provenance contracts read the publisher's
     corpus out of .corpus-cache, which is gitignored — and eBible replaces
     its archives in place, so the pinned bytes cannot be downloaded again.
     On any machine but the one that synced them, the whole run died on a
     stack trace at whichever contract reached for the corpus first. Roughly
     twenty contracts after it never ran, and nothing said so: a clone of
     this repository could not satisfy its own release gate, and could not
     see why.

     Absence is a distinct condition from a fault, so only absence is caught
     here. Anything else is a real error and still stops the run. */
  for(const suite of SUITES){
    try{
      await suite();
    }catch(err){
      if(!isAbsence(err)) throw err;
      unrun.push({ suite: suite.name || '(anonymous)', why: err.message });
    }
  }

  const r = C.results();
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log('\n' + '='.repeat(64));
  console.log('  RESULT');
  console.log('='.repeat(64));
  console.log('  passed: ' + r.pass + ' | failed: ' + r.fail +
    (unrun.length ? ' | NOT CHECKED: ' + unrun.length + ' contract ' +
      (unrun.length === 1 ? 'suite' : 'suites') : ''));
  console.log('  duration: ' + seconds + 's');

  if(r.fail){
    console.log('\n  FAILURES');
    r.failures.forEach(f => console.log('    - ' + f));
  }

  /* Not a failure and not a pass. The contracts that prove the shipped text
     really is the publisher's could not be run, so this run says nothing
     about whether it is — which is the one thing this app must not guess at. */
  if(unrun.length){
    console.log('\n  NOT CHECKED — these contracts never ran');
    unrun.forEach(u => console.log('    - ' + u.suite + ': ' + u.why));
    console.log('');
    console.log('  The publisher\'s archives live in .corpus-cache/, which is not in git,');
    console.log('  and eBible replaces its archives in place — so the pinned bytes cannot');
    console.log('  simply be downloaded again. `npm run corpus:sync` will fetch the CURRENT');
    console.log('  release and stage it as a candidate without moving any pin; adopting it');
    console.log('  is a decision with its own gate (CLAUDE.md rule 53).');
    console.log('');
    console.log('  Everything above this block did run. Nothing below the line was proved');
    console.log('  either way, so this is not a green run.');
  }

  if(TIER === 'verify'){
    console.log('\n' + '='.repeat(64));
    console.log('  CONFIG INTEGRITY');
    console.log('='.repeat(64));
    const { execFileSync } = require('child_process');
    try{
      const out = execFileSync(process.execPath, [__dirname + '/../scripts/config.js', 'verify'],
                               { encoding: 'utf8' });
      process.stdout.write('  ' + out.trim() + '\n');
    }catch(e){
      process.stdout.write((e.stdout || '') + (e.stderr || ''));
      console.log('\n  VERIFY FAILED — application identity has drifted.');
      process.exit(1);
    }
  }

  console.log('\n  This suite loaded index.html as text and ran it against an in-memory');
  console.log('  store. No real user data was read or written.\n');

  finished = true;
  process.exit(r.fail || unrun.length ? 1 : 0);
}

main().catch(err => {
  console.error('\n  RUNNER ERROR — ' + (err && err.stack || err));
  process.exit(1);
});
