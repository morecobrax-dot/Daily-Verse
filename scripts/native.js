/* =========================================================
   NATIVE STAGING — the runtime package, and nothing else
   ---------------------------------------------------------
     node scripts/native.js plan      resolve the allowlist, write nothing
     node scripts/native.js stage     write dist-native/
     node scripts/native.js verify    check an existing dist-native/

   A native shell needs a directory of exactly the files this app
   asks for at runtime. Capacitor copies its whole `webDir` and
   has no include or exclude filter, so pointing it at the
   repository root would put the vendored publisher archives under
   data/corpus — many times the size of the app itself — plus
   every script, test and document, inside a shipped iOS app.

   So this selects POSITIVELY. There is no "copy everything and
   then delete the dangerous parts": a file reaches dist-native
   only by being named in SHELL below, or by being a Bible file
   that data/bible.lock.json already records. Everything else is
   absent by construction, and the refusals are a second,
   independent check on top of that.

   WHY LINE ENDINGS ARE NORMALISED
   This repository is developed on Windows with core.autocrlf=true,
   so the working copy of a text file is CRLF while the object git
   stores — and GitHub Pages serves — is LF. index.html alone
   differs by about 19 KB between the two. Staging the working copy
   as-is would give the native app different Scripture-bearing bytes
   than the web app serves, and would produce a different bundle on
   Windows than on a Mac from the same commit.

   So a text shell file is staged with CRLF collapsed to LF, which
   is precisely git's own checkout transformation reversed, and the
   result is checked to contain no carriage return at all — proving
   every CR belonged to a CRLF pair rather than to the content. On
   a Mac the working copy is already LF and the step does nothing.
   Binary files are recognised by a NUL byte and are never touched.
   Bible data is copied verbatim and held to the hash the build lock
   records, so a normalisation there would be caught rather than
   trusted.

   It is the same trap CLAUDE.md rule 24 names for comparing a
   deployment, met from the other side.

   NO NETWORK, NO SUBPROCESS
   This script reads files and writes files. It requires no
   network module and spawns nothing — the same rule every script
   here but corpus.js is held to, because a script that can shell
   out is a script that can download.
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist-native');
/* The manifest is a development artefact. It is deliberately NOT written
   inside dist-native, because everything in there is copied into the iOS
   app: a build receipt does not belong in a shipped bundle. */
const RECEIPT_DIR = path.join(ROOT, '.native-stage');

/* ---------- the shell: named, with the reason each one is runtime ---------- */
/* Every entry is cross-checked below against what the app actually asks for.
   A reference the app makes that is not listed here stops the build, so this
   list cannot quietly fall behind the product. */
const SHELL = [
  ['index.html',           'the app'],
  ['manifest.webmanifest', 'link rel=manifest, and the PWA identity'],
  ['sw.js',                'registered only on http(s); inert under a native scheme, and staged so one tree serves both targets'],
  ['icon-192.png',         'manifest icon, and precached by sw.js'],
  ['icon-512.png',         'manifest icon, and precached by sw.js'],
  ['apple-touch-icon.png', 'link rel=apple-touch-icon'],
  ['favicon-32.png',       'link rel=icon'],
  ['favicon.svg',          'link rel=icon']
];

/* ---------- what may never be staged, whatever an allowlist says ---------- */
const NEVER_PREFIX = [
  'data/corpus/',     /* the publisher archives: verification input, not runtime */
  'scripts/',
  'test/',
  'brand/',           /* icon masters, not shipped assets */
  '.git/',
  '.github/',
  '.claude/',
  'node_modules/',
  '.corpus-cache/',
  'dist-native/',
  '.native-stage/',
  'ios/'
];
const NEVER_EXACT = [
  'CLAUDE.md', 'AGENTS.md', 'ARCHITECTURE.md', 'PRODUCT-DESIGN.md', 'README.md',
  'NOTIFICATIONS.md', 'HELP-ME-REVIEW.md', 'NATIVE-IOS.md',
  'PROJECT-STATUS.json', 'package.json', 'package-lock.json',
  '.gitignore', '.gitattributes', '.nojekyll'
];
/* Signing material and local credentials. Not a general secret scanner — just
   a refusal to carry the file types an Apple build produces or consumes. */
const SECRET_PATTERNS = [
  /\.p12$/i, /\.pem$/i, /\.key$/i, /\.cer$/i, /\.der$/i, /\.p8$/i,
  /\.keystore$/i, /\.jks$/i, /\.mobileprovision$/i, /\.provisionprofile$/i,
  /\.xcarchive(\/|$)/i, /(^|\/)\.env($|\.)/i, /(^|\/)id_(rsa|dsa|ecdsa|ed25519)/i,
  /(^|\/)\.netrc$/i, /exportoptions[^/]*\.plist$/i, /(^|\/)\.npmrc$/i
];

const CR = 13, NUL = 0;
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const posix = p => p.split(path.sep).join('/');
const isBinary = buf => buf.indexOf(NUL) !== -1;

/* git's checkout transformation, reversed. */
function toLF(buf){
  return Buffer.from(buf.toString('binary').split('\r\n').join('\n'), 'binary');
}

/* ---------- refusals ---------- */
/* Tagged, so a test can assert WHY staging refused rather than matching a
   sentence. The code is the contract; the message is for the person. */
function Refusals(){
  const list = [];
  list.add = function(code, message){ list.push({ code: code, message: message }); };
  list.codes = function(){ return list.map(function(r){ return r.code; }); };
  list.except = function(skip){ return list.filter(function(r){ return skip.indexOf(r.code) === -1; }); };
  return list;
}

/* ---------- what the app actually asks for at runtime ---------- */
/* Read out of the shipped files rather than assumed, so a new runtime
   reference cannot be introduced without this noticing. */
function runtimeReferences(appSrc, swSrc, manifestSrc){
  const refs = new Set();
  const local = v => v && !/^(https?:|data:|mailto:|tel:|sms:|blob:|javascript:|#)/i.test(v);
  const clean = v => v.replace(/^\.\//, '').split('?')[0].split('#')[0];

  /* Literal href/src attributes in the shipped HTML. Anything built by string
     concatenation is skipped: it is not a static asset reference. */
  const attr = /(?:href|src)="([^"'<>+]+)"/g;
  let m;
  while((m = attr.exec(appSrc))){
    const v = m[1].trim();
    if(local(v) && v && !/\s/.test(v)) refs.add(clean(v));
  }
  /* The service worker is registered by name. */
  const reg = appSrc.match(/serviceWorker\s*\.\s*register\(\s*'([^']+)'/);
  if(reg) refs.add(clean(reg[1]));

  /* The shell the service worker precaches. */
  const assets = swSrc.match(/const ASSETS = \[([\s\S]*?)\]/);
  if(assets){
    (assets[1].match(/'([^']+)'/g) || []).forEach(q => {
      const v = clean(q.slice(1, -1));
      if(v) refs.add(v);
    });
  }
  /* Manifest icons and start_url. */
  try{
    const mf = JSON.parse(manifestSrc);
    (mf.icons || []).forEach(i => { if(local(i.src)) refs.add(clean(i.src)); });
    if(local(mf.start_url)) refs.add(clean(mf.start_url));
  }catch(e){ /* a malformed manifest is caught by config:verify */ }

  refs.delete('');
  return refs;
}

/* ---------- the one version, read from the three places that carry it ------- */
/* A bundle built from an index.html that disagrees with its own cache name is
   a bundle whose provenance nobody can state. This is the narrow precondition
   staging enforces; `npm run verify` remains the gate for the repository. */
function versionDrift(refusals){
  const read = p => { try{ return fs.readFileSync(path.join(ROOT, p), 'utf8'); }catch(e){ return ''; } };
  const app = read('index.html');
  const sw = read('sw.js');
  let pkg = '';
  try{ pkg = JSON.parse(read('package.json')).version; }catch(e){}
  const release = (app.match(/const APP_UPDATES = \[\s*\{[\s\S]{0,400}?version:\s*'([^']+)'/) || [])[1];
  const cache = (sw.match(/const CACHE_NAME = '[^']*-v([^']+)'/) || [])[1];
  if(!release) refusals.add('config-drift', 'no release version could be read from APP_UPDATES');
  else if(release !== pkg || release !== cache){
    refusals.add('config-drift', 'version drift: APP_UPDATES says ' + release +
      ', package.json says ' + pkg + ', the cache name says ' + cache +
      '. Run `npm run config:sync`.');
  }
  return release || null;
}

/* ---------- the commit, read without asking git to run ---------- */
function headCommit(){
  try{
    const head = fs.readFileSync(path.join(ROOT, '.git', 'HEAD'), 'utf8').trim();
    if(head.indexOf('ref: ') !== 0) return head;
    const ref = head.slice(5).trim();
    const loose = path.join(ROOT, '.git', ref.split('/').join(path.sep));
    if(fs.existsSync(loose)) return fs.readFileSync(loose, 'utf8').trim();
    const packed = fs.readFileSync(path.join(ROOT, '.git', 'packed-refs'), 'utf8');
    const line = packed.split('\n').filter(l => l.indexOf(' ' + ref) !== -1)[0];
    return line ? line.split(' ')[0] : null;
  }catch(e){ return null; }
}

/* ---------- the plan: which files, and every rule that needs no contents ----
   Deliberately independent of file contents, so the rules can be tested on a
   working tree that is mid-edit. resolve() below adds everything that needs
   the bytes themselves. */
function plan(){
  const refusals = Refusals();
  const corpus = require('./corpus.js');

  /* Bible data is taken from the build lock, not from a directory walk: the
     lock is what `npm run bible:verify` trusts, so a file on disk the lock
     does not record cannot reach a reader, and one the lock records but disk
     has lost stops the build. */
  let lock;
  try{ lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bible.lock.json'), 'utf8')); }
  catch(e){ refusals.add('lock-read', 'data/bible.lock.json could not be read: ' + e.message); lock = { editions: {} }; }

  const shipped = corpus.shippedEditions().slice().sort();
  const locked = Object.keys(lock.editions || {}).sort();
  if(shipped.join() !== locked.join()){
    refusals.add('lock-editions', 'the editions in data/bible.lock.json (' + locked.join(', ') +
      ') are not the shipped editions (' + shipped.join(', ') + ')');
  }

  const files = [];
  SHELL.forEach(([p, why]) => files.push({ path: p, why: why, kind: 'shell' }));
  locked.forEach(ed => {
    Object.keys(lock.editions[ed]).sort().forEach(f => {
      files.push({
        path: 'data/bible/' + ed + '/' + f,
        why: 'Bible data for ' + ed,
        kind: 'bible',
        edition: ed,
        lockSha: lock.editions[ed][f].sha256
      });
    });
  });

  /* --- refusal: a path that is never allowed to be staged --- */
  files.forEach(f => {
    if(NEVER_PREFIX.some(p => f.path.indexOf(p) === 0)){
      refusals.add('never-prefix', '"' + f.path + '" is under a path that must never be staged');
    }
    if(NEVER_EXACT.indexOf(f.path) !== -1){
      refusals.add('never-exact', '"' + f.path + '" is a development file and must never be staged');
    }
    if(SECRET_PATTERNS.some(re => re.test(f.path))){
      refusals.add('secret', '"' + f.path + '" looks like signing material or a credential');
    }
    if(path.isAbsolute(f.path) || f.path.split('/').indexOf('..') !== -1){
      refusals.add('escape', '"' + f.path + '" escapes the repository');
    }
  });

  /* --- refusal: a duplicate, or a pair that collide on a case-insensitive
         filesystem. macOS and iOS are case-insensitive by default, so two
         paths differing only in case would overwrite one another there while
         looking fine here. --- */
  const seen = new Map();
  files.forEach(f => {
    const key = f.path.toLowerCase();
    if(seen.has(key)){
      refusals.add('case-collision', '"' + f.path + '" collides with "' + seen.get(key) +
        '" on a case-insensitive filesystem (macOS, iOS)');
    } else seen.set(key, f.path);
  });

  /* --- refusal: the app asks for something the allowlist does not carry --- */
  const byPath = new Set(files.map(f => f.path));
  const read = p => { try{ return fs.readFileSync(path.join(ROOT, p), 'utf8'); }catch(e){ return null; } };
  const app = read('index.html'), sw = read('sw.js'), mf = read('manifest.webmanifest');
  if(app && sw && mf){
    const refs = runtimeReferences(app, sw, mf);
    refs.forEach(r => {
      if(r === '' || r === './' || r === '.') return;
      if(r.indexOf('data/bible/') === 0) return;   /* resolved from the lock */
      if(!byPath.has(r)){
        refusals.add('missing-reference', 'the app asks for "' + r + '" at runtime, which is not staged. ' +
          'Add it to SHELL in scripts/native.js, with the reason it is runtime.');
      }
    });
    /* And the mirror: a shell entry nothing asks for is dead weight. sw.js is
       the one deliberate exception, named in its own reason. */
    SHELL.forEach(([p]) => {
      if(p === 'sw.js' || p === 'index.html') return;
      if(!refs.has(p)) refusals.add('unreferenced-shell', '"' + p + '" is staged but nothing references it');
    });
  }

  const version = versionDrift(refusals);
  return { files: files, refusals: refusals, editions: locked, version: version };
}

/* ---------- resolve: the bytes, and the rules that need them ---------- */
function resolve(){
  const p = plan();
  const files = p.files, refusals = p.refusals;

  files.forEach(f => {
    const abs = path.join(ROOT, f.path.split('/').join(path.sep));
    let st;
    try{ st = fs.lstatSync(abs); }
    catch(e){ refusals.add('missing-worktree', '"' + f.path + '" is missing'); return; }
    /* A link is a pointer, and a pointer into a bundle is a file that is not
       there. Staging copies content only. */
    if(st.isSymbolicLink()){ refusals.add('symlink', '"' + f.path + '" is a symbolic link'); return; }

    let buf = fs.readFileSync(abs);
    if(f.kind === 'shell' && !isBinary(buf)){
      buf = toLF(buf);
      if(buf.indexOf(CR) !== -1){
        /* A carriage return that was not part of a CRLF pair is content, and
           this would have altered it. Refuse rather than guess. */
        refusals.add('cr-remains', '"' + f.path + '" still contains a carriage return after ' +
          'line-ending normalisation, so its bytes are not safe to normalise');
        return;
      }
      f.normalised = buf.length !== fs.statSync(abs).size;
    }
    f.bytes = buf.length;
    f.sha256 = sha(buf);
    f.buf = buf;
  });

  /* --- refusal: the Bible bytes must be the bytes the lock records --- */
  files.filter(f => f.kind === 'bible').forEach(f => {
    if(f.sha256 && f.lockSha && f.sha256 !== f.lockSha){
      refusals.add('lock-hash', '"' + f.path + '" does not match the hash in data/bible.lock.json');
    }
  });

  const totals = files.reduce((t, f) => {
    t.bytes += f.bytes || 0;
    t[f.kind] = (t[f.kind] || 0) + (f.bytes || 0);
    return t;
  }, { bytes: 0 });

  return { files: files, refusals: refusals, totals: totals, editions: p.editions, version: p.version };
}

/* ---------- writing it out ---------- */
function stage(outDir, quiet){
  const dir = outDir || OUT;
  const p = resolve();
  if(p.refusals.length) return quiet ? p : report(p, 'stage');

  if(fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  p.files.forEach(f => {
    const dest = path.join(dir, f.path.split('/').join(path.sep));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, f.buf);
  });

  /* Read every file back and prove it is what was planned. A copy truncated,
     re-encoded or line-ending-converted on the way out is exactly the failure
     this whole script exists to prevent. */
  const drift = p.files.filter(f => {
    const dest = path.join(dir, f.path.split('/').join(path.sep));
    return sha(fs.readFileSync(dest)) !== f.sha256;
  }).map(f => f.path);
  if(drift.length){
    if(quiet) return Object.assign(p, { drift: drift });
    console.error('native:stage  FAILED — ' + drift.length + ' staged file(s) do not match their source:');
    drift.slice(0, 10).forEach(d => console.error('  - ' + d));
    return 1;
  }

  /* And nothing else may be in there. */
  const planned = new Set(p.files.map(f => f.path));
  const extra = walk(dir).filter(r => !planned.has(r));
  if(extra.length){
    if(quiet) return Object.assign(p, { extra: extra });
    console.error('native:stage  FAILED — unexpected file(s) in dist-native:');
    extra.slice(0, 10).forEach(d => console.error('  - ' + d));
    return 1;
  }

  if(quiet) return Object.assign(p, { drift: [], extra: [] });
  fs.mkdirSync(RECEIPT_DIR, { recursive: true });
  fs.writeFileSync(path.join(RECEIPT_DIR, 'manifest.json'), JSON.stringify({
    stagedAt: new Date().toISOString(),
    commit: headCommit(),
    version: p.version,
    editions: p.editions,
    files: p.files.map(f => ({ path: f.path, bytes: f.bytes, sha256: f.sha256 }))
  }, null, 2) + '\n');

  return report(p, 'stage');
}

function walk(dir, base){
  base = base || dir;
  if(!fs.existsSync(dir)) return [];
  const out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const abs = path.join(dir, e.name);
    if(e.isDirectory()) out.push(...walk(abs, base));
    else out.push(posix(path.relative(base, abs)));
  });
  return out;
}

function verify(){
  if(!fs.existsSync(OUT)){
    console.error('native:verify  FAILED — dist-native does not exist. Run `npm run native:stage`.');
    return 1;
  }
  const p = resolve();
  const problems = p.refusals.map(r => '[' + r.code + '] ' + r.message);
  const planned = new Set(p.files.map(f => f.path));

  walk(OUT).forEach(r => {
    if(!planned.has(r)) problems.push('[staged-extra] "' + r + '" is in dist-native but is not part of the runtime package');
  });
  p.files.forEach(f => {
    const dest = path.join(OUT, f.path.split('/').join(path.sep));
    if(!fs.existsSync(dest)){ problems.push('[staged-missing] "' + f.path + '" is missing from dist-native'); return; }
    if(sha(fs.readFileSync(dest)) !== f.sha256){
      problems.push('[staged-drift] "' + f.path + '" in dist-native does not match its source');
    }
  });

  if(problems.length){
    console.error('native:verify  FAILED — ' + problems.length + ' problem(s):');
    problems.slice(0, 20).forEach(d => console.error('  - ' + d));
    return 1;
  }
  console.log('native:verify  ok — ' + p.files.length + ' files, ' +
    (p.totals.bytes / 1048576).toFixed(2) + ' MB, every one identical to its source');
  return 0;
}

function report(p, verb){
  if(p.refusals.length){
    console.error('native:' + verb + '  FAILED — ' + p.refusals.length + ' problem(s):');
    p.refusals.slice(0, 20).forEach(d => console.error('  - [' + d.code + '] ' + d.message));
    if(p.refusals.length > 20) console.error('  ... and ' + (p.refusals.length - 20) + ' more');
    return 1;
  }
  const mb = b => (b / 1048576).toFixed(2) + ' MB';
  const bible = p.files.filter(f => f.kind === 'bible');
  const shell = p.files.filter(f => f.kind === 'shell');
  const norm = p.files.filter(f => f.normalised).length;
  console.log('native:' + verb + '  ok');
  console.log('  version       ' + p.version + '   commit ' + String(headCommit()).slice(0, 7));
  console.log('  files         ' + p.files.length + '   (' + shell.length + ' shell, ' + bible.length + ' Bible)');
  console.log('  size          ' + mb(p.totals.bytes) + '   (shell ' + mb(p.totals.shell || 0) +
              ', Bible ' + mb(p.totals.bible || 0) + ')');
  console.log('  editions      ' + p.editions.length + ': ' + p.editions.join(' '));
  if(norm) console.log('  line endings  ' + norm + ' text file(s) staged LF, as the web serves them');
  console.log('');
  console.log('  largest:');
  p.files.slice().sort((a, b) => b.bytes - a.bytes).slice(0, 5).forEach(f => {
    console.log('    ' + mb(f.bytes).padStart(9) + '  ' + f.path);
  });
  if(verb === 'stage'){
    console.log('');
    console.log('  dist-native/ is the Capacitor webDir. It is generated and gitignored;');
    console.log('  the staging receipt is in .native-stage/manifest.json, deliberately');
    console.log('  outside the staged tree so it cannot ship inside an iOS app.');
  }
  return 0;
}

function run(cmd){
  if(cmd === 'stage') return stage();
  if(cmd === 'verify') return verify();
  if(cmd === 'plan') return report(resolve(), 'plan');
  console.error('usage: node scripts/native.js plan|stage|verify');
  return 1;
}

if(require.main === module) process.exit(run((process.argv[2] || 'plan').toLowerCase()));
module.exports = { plan, resolve, stage, verify, walk, runtimeReferences, toLF, isBinary,
                   headCommit, SHELL, NEVER_PREFIX, NEVER_EXACT, SECRET_PATTERNS, OUT, RECEIPT_DIR };
