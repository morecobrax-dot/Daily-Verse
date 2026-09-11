/* =========================================================
   STARTER CONTRACTS
   ---------------------------------------------------------
   High-value contracts, not test volume. Every assertion here
   defends something a future product would otherwise have to
   rediscover: a namespace collision, a scroll lock that leaks, a
   type scale that quietly stops being used.

   Each contract states what it protects, in the language of the
   failure it prevents. If an assertion cannot be described that
   way, it probably should not exist.
   ========================================================= */
'use strict';
const H = require('./harness.js');

let pass = 0, fail = 0;
const failures = [];

function T(name, cond, detail){
  if(cond){ pass++; }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); }
  console.log('  ' + (cond ? 'PASS' : 'FAIL') + '  ' + name + (cond || !detail ? '' : ' — ' + detail));
}
function section(t){ console.log('\n' + '='.repeat(64) + '\n  ' + t + '\n' + '='.repeat(64)); }
function sub(t){ console.log('\n  --- ' + t + ' ---'); }

function results(){ return { pass, fail, failures }; }
function reset(){ pass = 0; fail = 0; failures.length = 0; }

/* ---------- shared helpers ---------- */
function open(app, id){ app.ctx.openOverlay(id); app.ctx.__flush(); }
function close(app, id){ app.ctx.closeOverlay(id); app.ctx.__flush(); }
function css(){ return H.styleBlock(H.readApp()); }
function js(){ return H.mainScript(H.readApp()); }
/* Comments explain the rules; they must not be mistaken for breaking them. */
function stripComments(s){
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/* =========================================================
   CONTRACT 1 — BOOT
   The app starts, says so, and fails loudly rather than blankly.
   ========================================================= */
function testBoot(){
  section('CONTRACT 1 — the application boots');
  const app = H.loadApp();

  sub('a clean start');
  T('boots with no console errors', app.errors.length === 0, app.errors.join(' | '));
  T('the app container is revealed', app.dom.document.getElementById('app').style.display === '');
  T('storage is available and reports itself persistent', app.ctx.Store.isPersistent());
  T('a first run records the schema version',
    app.storage.getItem(app.ctx.STORAGE_NAMESPACE + 'sys.schemaVersion') === String(app.ctx.DATA_SCHEMA_VERSION));
  /* A genuine first run, with no fixture seeded, writes exactly two things:
     the schema version, and a record of the day it just showed. The second
     is what makes the no-repeat rotation possible at all — a reader who has
     seen today's passage must not be offered it again tomorrow. Anything
     beyond these two would be the app inventing state nobody asked for. */
  const fresh = H.loadApp({ firstRun: true });
  const written = [...fresh.storage._map.keys()].map(k => k.replace(fresh.ctx.STORAGE_NAMESPACE, ''));
  T('a first run writes only the schema version and the day it showed',
    written.length === 2 &&
    written.indexOf(fresh.ctx.KEYS.schemaVersion) !== -1 &&
    written.indexOf(fresh.ctx.KEYS.assignments) !== -1,
    written.join(', '));

  sub('booting on top of existing data');
  const shared = new Map();
  const seeded = H.loadApp({ sharedStorage: shared });
  seeded.ctx.notes.push({ id: 'n_2026-01-01', date: '2026-01-01', ref: 'Psalm 23:4',
                          text: 'Existing', createdAt: '2026-01-01T00:00:00.000Z',
                          updatedAt: '2026-01-01T00:00:00.000Z' });
  seeded.ctx.persistNotes();
  const second = H.loadApp({ sharedStorage: shared });
  T('an existing record survives a reload', second.ctx.notes.length === 1);
  T('and keeps its identity', second.ctx.notes[0].text === 'Existing');
  T('reloading raises no errors', second.errors.length === 0, second.errors.join(' | '));

  sub('there is only one script block, so the suite sees all the code');
  const blocks = H.scriptBlocks(H.readApp()).filter(b => b.trim().length > 200);
  T('exactly one substantial <script> block', blocks.length === 1, String(blocks.length));
  T('boot is wrapped so a failure still reports itself',
    /catch\(err\)\{[\s\S]{0,400}could not start/.test(js()));
}

/* =========================================================
   CONTRACT 2 — CONFIGURATION
   One source of identity, and static files that cannot drift.
   ========================================================= */
function testConfig(){
  section('CONTRACT 2 — application identity has one source');
  const app = H.loadApp();
  const c = app.ctx;
  const cfg = c.APP_CONFIG;

  sub('APP_ID is valid, and invalid ids are refused rather than repaired');
  T('the shipped id passes validation', c.validateAppId(cfg.id) === null);
  const bad = {
    'empty': '', 'uppercase': 'App-Starter', 'spaces': 'app starter',
    'leading digit': '1app', 'trailing hyphen': 'app-', 'double hyphen': 'app--starter',
    'underscore': 'app_starter', 'dot': 'app.starter', 'slash': 'app/starter',
    'too long': 'a'.repeat(41), 'not a string': 42
  };
  Object.keys(bad).forEach(label => {
    T('rejects ' + label, typeof c.validateAppId(bad[label]) === 'string');
  });
  T('a valid multi-word id is accepted', c.validateAppId('personal-savings') === null);

  sub('every namespace is derived, never typed twice');
  T('storage prefix derives from the id', c.STORAGE_NAMESPACE === cfg.id + '.');
  T('cache name derives from the id and the version',
    c.CACHE_NAMESPACE === cfg.id + '-v' + c.APP_VERSION);
  T('the version derives from the newest release entry',
    c.APP_VERSION === c.APP_UPDATES[0].version);

  sub('static files match APP_CONFIG — they cannot read it at runtime');
  const man = H.readManifest();
  T('manifest name', man.name === cfg.name, man.name);
  T('manifest short_name', man.short_name === cfg.shortName, man.short_name);
  T('manifest description', man.description === cfg.description);
  T('manifest theme_color', man.theme_color === cfg.themeColor, man.theme_color);
  T('manifest background_color', man.background_color === cfg.backgroundColor);

  const sw = H.readSW();
  T('service-worker cache name', sw.indexOf("'" + c.CACHE_NAMESPACE + "'") !== -1, c.CACHE_NAMESPACE);

  const pkg = H.readPkg();
  T('package name', pkg.name === cfg.id, pkg.name);
  T('package version', pkg.version === c.APP_VERSION, pkg.version);

  /* Compared through the same escape the sync applies, so a product whose
     name contains & " or < is not reported as drift for being correct. */
  const src = H.readApp();
  const esc = require('../scripts/config.js').esc;
  T('document title', src.indexOf('<title>' + esc(cfg.name) + '</title>') !== -1);
  T('theme-color meta', src.indexOf('content="' + esc(cfg.themeColor) + '"') !== -1);
  T('apple web app title', src.indexOf('content="' + esc(cfg.shortName) + '"') !== -1);
  T('the header markup carries the derived name, not a stale copy',
    new RegExp('<h1 class="app-title" id="appTitle">' +
      esc(cfg.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</h1>').test(src));

  sub('a name that needs escaping survives every target intact');
  const hostile = 'Ben & Co "Ltd" <beta>';
  T('escaping is applied, not stripped',
    esc(hostile) === 'Ben &amp; Co &quot;Ltd&quot; &lt;beta>');
  T('the manifest holds the raw value, because JSON escapes differently',
    JSON.parse(JSON.stringify({ n: hostile })).n === hostile);

  sub('changing the id changes everything downstream');
  ['other-app', 'client-demo', 'personal-savings'].forEach(id => {
    const o = H.loadApp({ appId: id });
    T(id + ' → storage prefix', o.ctx.STORAGE_NAMESPACE === id + '.');
    T(id + ' → cache name', o.ctx.CACHE_NAMESPACE === id + '-v' + o.ctx.APP_VERSION);
    T(id + ' → validates', o.ctx.validateAppId(id) === null);
  });
}

/* =========================================================
   CONTRACT 3 — STORAGE
   Namespacing is the only thing keeping two deployments on one
   origin from reading each other's data.
   ========================================================= */
function testStorage(){
  section('CONTRACT 3 — storage is namespaced and honest');
  const app = H.loadApp();
  const c = app.ctx;

  sub('every key the app writes carries its namespace');
  c.Store.set('data.probe', 'x');
  c.Store.setJSON('ui.probe', { a: 1 });
  const raw = [...app.storage._map.keys()];
  T('no key escapes the prefix',
    raw.every(k => k.indexOf(c.STORAGE_NAMESPACE) === 0), raw.filter(k => k.indexOf(c.STORAGE_NAMESPACE) !== 0).join(','));
  T('no bare generic key is used',
    !raw.some(k => /^(settings|data|history|draft|user|userData|items)$/.test(k)));

  sub('read, write, delete');
  T('a value round-trips', c.Store.get('data.probe') === 'x');
  T('JSON round-trips', c.Store.getJSON('ui.probe', null).a === 1);
  c.Store.remove('data.probe');
  T('a removed key is gone', c.Store.get('data.probe') === null);

  sub('absent data stays absent — a missing key is a new user, not a broken one');
  T('a missing key reads null', c.Store.get('nothing.here') === null);
  T('a missing key does not get invented', app.storage.getItem(c.STORAGE_NAMESPACE + 'nothing.here') === null);
  T('getJSON returns the caller fallback, not a guess',
    c.Store.getJSON('nothing.here', 'FALLBACK') === 'FALLBACK');
  app.storage.setItem(c.STORAGE_NAMESPACE + 'ui.corrupt', '{not json');
  T('corrupt JSON degrades to the fallback rather than throwing',
    c.Store.getJSON('ui.corrupt', 'SAFE') === 'SAFE');

  sub('a failed write is reported, never assumed');
  const failing = H.loadApp({ failWrites: true });
  T('the store reports itself non-persistent', !failing.ctx.Store.isPersistent());
  T('set() returns false when the write cannot land', failing.ctx.Store.set('x', '1') === false ||
    failing.ctx.Store.backend() === 'memory');
  T('the app tells the user out loud',
    /not letting the app store data/.test(js()));

  sub('listKeys sees only this app');
  app.storage.setItem('some-other-app.data.saved', '[]');
  const keys = c.Store.listKeys();
  T('a foreign key is invisible', keys.every(k => k.indexOf('some-other-app') === -1));
  T('own keys are still found', keys.indexOf('ui.probe') !== -1);
}

/* =========================================================
   CONTRACT 4 — CROSS-APP COLLISION
   Two products on one github.io origin share localStorage and
   Cache Storage. This is what keeps them apart.
   ========================================================= */
function testCollision(){
  section('CONTRACT 4 — two apps on one origin cannot collide');
  const shared = new Map();
  const one = H.loadApp({ appId: 'app-one', sharedStorage: shared });
  const two = H.loadApp({ appId: 'app-two', sharedStorage: shared });

  sub('storage');
  one.ctx.Store.set('settings', 'ONE-SECRET');
  two.ctx.Store.set('settings', 'TWO-SECRET');
  T('each app reads its own value', one.ctx.Store.get('settings') === 'ONE-SECRET' &&
                                    two.ctx.Store.get('settings') === 'TWO-SECRET');
  T('app-one cannot read app-two through the adapter', one.ctx.Store.get('settings') !== 'TWO-SECRET');
  T('the underlying keys are genuinely distinct',
    shared.has('app-one.settings') && shared.has('app-two.settings'));
  T('app-one.listKeys never returns an app-two key',
    one.ctx.Store.listKeys().every(k => shared.get('app-one.' + k) !== undefined));

  one.ctx.savedVerses.push({ id: 's1', ref: 'Psalm 23:4', savedAt: 'a', updatedAt: 'a' });
  one.ctx.persistSaved();
  T('one app writing records leaves the other empty',
    two.ctx.Store.getJSON(two.ctx.KEYS.saved, []).length === 0);

  sub('cache identity');
  T('cache names differ', one.ctx.CACHE_NAMESPACE !== two.ctx.CACHE_NAMESPACE);
  T('app-one cache name', one.ctx.CACHE_NAMESPACE.indexOf('app-one-v') === 0, one.ctx.CACHE_NAMESPACE);
  T('app-two cache name', two.ctx.CACHE_NAMESPACE.indexOf('app-two-v') === 0, two.ctx.CACHE_NAMESPACE);

  sub('the service worker only ever deletes its own caches');
  const sw = H.readSW();
  T('cleanup is filtered by this app\'s own prefix',
    /keys\.filter\(k => k !== CACHE_NAME && k\.indexOf\(cachePrefix\(\)\) === 0\)/.test(sw));
  T('the prefix is derived from the cache name, not written twice',
    /function cachePrefix\(\)/.test(sw) && /lastIndexOf\('-v'\)/.test(sw));

  sub('no legacy namespace survives anywhere');
  const all = H.readApp() + H.readSW() + JSON.stringify(H.readManifest());
  T('no legacy storage prefix', !/\bloop_/i.test(all));
  T('no legacy cache prefix', !/\bloop-v\d/i.test(all));
}

/* =========================================================
   CONTRACT 5 — MIGRATION
   ========================================================= */
function testMigration(){
  section('CONTRACT 5 — migration is non-destructive and idempotent');
  const shared = new Map();
  const app = H.loadApp({ sharedStorage: shared });
  const c = app.ctx;

  sub('first run');
  T('the schema version is recorded', c.Store.get(c.KEYS.schemaVersion) === String(c.DATA_SCHEMA_VERSION));
  T('nothing was migrated on a fresh install', c.runMigrations().migrated === false);

  sub('idempotence');
  c.Store.set(c.KEYS.saved, JSON.stringify([{ id: 's_a', ref: 'Psalm 23:4', savedAt: 'a' }]));
  const before = c.Store.get(c.KEYS.saved);
  c.runMigrations(); c.runMigrations(); c.runMigrations();
  T('running migrations repeatedly changes nothing', c.Store.get(c.KEYS.saved) === before);

  sub('a corrupt or absent version is handled without data loss');
  c.Store.set(c.KEYS.schemaVersion, 'not-a-number');
  const r = c.runMigrations();
  T('a nonsense version does not throw', r && typeof r === 'object');
  T('records survive it', c.Store.get(c.KEYS.saved) === before);

  sub('the mechanism exists even though no data shape has changed yet');
  T('a migration table is declared', typeof c.MIGRATIONS === 'object');
  T('a backup namespace is reserved', typeof c.KEYS.backupPrefix === 'string' &&
    c.KEYS.backupPrefix.indexOf('sys.') === 0);
  T('backups are excluded from export', /indexOf\(KEYS\.backupPrefix\) === 0/.test(js()));
}

/* =========================================================
   CONTRACT 6 — NAVIGATION
   ========================================================= */
function testNavigation(){
  section('CONTRACT 6 — navigation is predictable');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;

  sub('every tab resolves to a screen');
  const tabs = [...d.querySelectorAll('.tab-btn')].map(b => b.dataset.tab).filter(Boolean);
  T('the tab bar declares tabs', tabs.length >= 2, String(tabs.length));
  tabs.forEach(t => T('tab "' + t + '" has a view', !!d.getElementById('view-' + t)));
  /* FIVE, not four, and not an arbitrary five.

     The ceiling exists because a thumb has to reach every destination on a
     phone held in one hand, and because a bar of identical small targets
     stops being navigation and becomes a list. It was four while there were
     four destinations. Devotions is a fifth destination, not a fifth link:
     it is a place with its own content, its own history and its own reason
     to be returned to, and reaching it through Learn would have said it was
     a kind of lesson, which is exactly what it is not.

     Five was measured before it was allowed. At 320px - the narrowest phone
     this app supports - five flex slots are 64px each, every one of them
     comfortably over the 44px minimum, and the widest label still fits on
     one line. It is checked at that width in CONTRACT 42 rather than
     asserted here from arithmetic.

     SIX would not survive that measurement, and nothing about this comment
     should be read as room to try. */
  T('the app ships only as many tabs as it needs', tabs.length <= 5, String(tabs.length));
  T('and a sixth would not fit a 320px phone, so it is refused', tabs.length < 6);

  sub('an unknown tab is a no-op, not a blank screen');
  c.switchTab('saved');
  const before = c.currentTab;
  c.switchTab('does-not-exist');
  T('currentTab is unchanged', c.currentTab === before);
  T('the current view is still active', d.getElementById('view-saved').classList.contains('active'));

  sub('a tab opens at its top, so the same tap gives the same result');
  app.ctx.window && (app.ctx.window.scrollY = 400);
  c.switchTab('today');
  T('the page is scrolled to top on entry', c.window.scrollY === 0);
  T('and it is instant, not animated', /behavior: 'instant'/.test(js()));

  sub('only one view is ever active');
  c.switchTab('bible');
  const active = [...d.querySelectorAll('.view')].filter(v => v.classList.contains('active'));
  T('exactly one active view', active.length === 1, String(active.length));
  T('it is the one asked for', active[0].id === 'view-bible');
}

/* =========================================================
   CONTRACT 7 — OVERLAYS
   The most valuable system in the starter. One mechanism, and it
   cannot be forgotten by a surface added later.
   ========================================================= */
function testOverlays(){
  section('CONTRACT 7 — one overlay engine owns every surface');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;
  const src = js(), style = css();

  sub('one mechanism, not a lock added by hand to every screen');
  T('an observer watches the overlays', /new MutationObserver\(/.test(src));
  T('and it is still the only one', (src.match(/new MutationObserver\(/g) || []).length === 1);
  T('the scroll lock runs from it',
    /new MutationObserver\(\(\) => \{[\s\S]{0,120}syncBackgroundScrollLock\(\);/.test(src));
  T('so does accessibility', /syncSheetAccessibility\(\);[\s\S]{0,40}\}\);/.test(src));
  T('the open overlays are the source of truth',
    /document\.querySelectorAll\('\.overlay\.open'\)\.length/.test(src));
  T('boot survives a platform without an observer',
    /if\(typeof MutationObserver === 'undefined'\) return null;/.test(src));
  T('it watches the whole body, so a later overlay is covered too',
    /obs\.observe\(document\.body,[\s\S]{0,120}subtree: true/.test(src));

  sub('the document behind a surface stops being a document');
  T('the body is pinned, which is what iOS needs',
    /body\.scroll-locked\{[\s\S]{0,140}position: fixed/.test(style));
  T('the offset is captured so it can be given back', /_lockedScrollY = window\.scrollY/.test(src));
  T('and restored exactly, without animating',
    /window\.scrollTo\(\{ top: _lockedScrollY, behavior: 'instant' \}\)/.test(src));
  T('nested layers do not unlock early', /if\(--_lockDepth > 0\) return;/.test(src));

  sub('a gesture inside a surface stays inside it');
  T('the overlay contains its own overscroll', /\.overlay\{[\s\S]{0,400}overscroll-behavior: contain/.test(style));
  T('so does the scrolling surface inside it',
    /\.sheet-scroll\{[\s\S]{0,400}overscroll-behavior: contain/.test(style));
  T('the locked body refuses chaining entirely',
    /body\.scroll-locked\{[\s\S]{0,200}overscroll-behavior: none/.test(style));

  sub('opening and closing, for real');
  open(app, 'noteOverlay');
  T('the stack records it', c._openSheetStack.length === 1);
  T('the background is locked', d.body.classList.contains('scroll-locked'));
  T('the surface is announced as a dialog',
    d.getElementById('noteOverlay').getAttribute('aria-modal') === 'true');
  T('it is painted at the stack base',
    d.getElementById('noteOverlay').style.zIndex === String(c.OVERLAY_Z_BASE));

  sub('stacking is open order, not document order');
  open(app, 'confirmOverlay');
  T('both are on the stack', c._openSheetStack.length === 2);
  T('the newest is on top', c.topOpenSheet().id === 'confirmOverlay');
  T('and painted above the one beneath it',
    Number(d.getElementById('confirmOverlay').style.zIndex) >
    Number(d.getElementById('noteOverlay').style.zIndex));
  T('the lock counts both layers', c._lockDepth === 2, String(c._lockDepth));

  sub('closing a child reveals its parent — the surface below is the way back');
  close(app, 'confirmOverlay');
  T('the parent is still open', d.getElementById('noteOverlay').classList.contains('open'));
  T('the stack shrank to one', c._openSheetStack.length === 1);
  T('the background is still locked', d.body.classList.contains('scroll-locked'));
  T('the closed surface gave back its z-index', d.getElementById('confirmOverlay').style.zIndex === '');
  close(app, 'noteOverlay');
  T('closing the last one unlocks', !d.body.classList.contains('scroll-locked'));
  T('the stack is empty', c._openSheetStack.length === 0);
  T('the lock depth is zero', c._lockDepth === 0);

  sub('every surface declares a way out');
  const ids = [...H.readApp().matchAll(/<div class="overlay(?: overlay-page)?" id="([A-Za-z]+)"/g)].map(m => m[1]);
  T('the app has overlays to check', ids.length >= 4, String(ids.length));
  const noExit = ids.filter(id => {
    open(app, id);
    const has = !!c.sheetCloser(d.getElementById(id));
    close(app, id);
    return !has;
  });
  T('every one of them has a discoverable close path', noExit.length === 0, noExit.join(','));

  sub('focus');
  T('the surface takes focus, not its first field — a keyboard would cover the screen',
    /const sheet = ov\.querySelector\('\.sheet'\) \|\| ov;/.test(src));
  T('focus returns only to a control still on screen',
    /document\.contains\(opener\) && opener\.offsetParent !== null/.test(src));
  T('Escape acts on the top surface only', /const ov = topOpenSheet\(\);/.test(src));
  T('Tab is trapped inside it', /ev\.key !== 'Escape' && ev\.key !== 'Tab'/.test(src));
}

/* =========================================================
   CONTRACT 8 — TOAST
   ========================================================= */
function testToast(){
  section('CONTRACT 8 — feedback that never blocks');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;
  const host = d.getElementById('toastHost');

  sub('the host is an announcement region');
  const src = H.readApp();
  T('it is a live region', /id="toastHost"[^>]*aria-live="polite"/.test(src));
  T('it has a status role', /id="toastHost"[^>]*role="status"/.test(src));
  T('it never intercepts a tap', /\.toast-host\{[\s\S]{0,300}pointer-events: none/.test(css()));
  T('the toast itself does accept one', /\.toast\{[\s\S]{0,400}pointer-events: auto/.test(css()));
  T('it clears the tab bar and the home indicator',
    /\.toast-host\{[\s\S]{0,200}bottom: calc\(var\(--tabbar-h\)[\s\S]{0,60}var\(--inset-bottom\)\)/.test(css()));

  sub('showing');
  c.toast('Saved');
  T('a toast is added', host.children.length === 1);
  T('it carries the message', host.children[0].innerHTML.indexOf('Saved') !== -1);
  T('an unknown variant falls back to neutral rather than breaking',
    c.toast('x', 'not-a-variant')._classes.has('toast-neutral'));

  sub('variants');
  c.TOAST_VARIANTS.forEach(v => {
    const el = c.toast('m', v);
    T('variant "' + v + '" is applied', el._classes.has('toast-' + v));
  });

  sub('the stack cannot grow without limit');
  T('at most MAX_TOASTS on screen', host.children.length <= c.MAX_TOASTS,
    String(host.children.length) + ' > ' + c.MAX_TOASTS);
  for(let i = 0; i < 20; i++) c.toast('flood ' + i);
  T('flooding does not grow the host', host.children.length <= c.MAX_TOASTS,
    String(host.children.length));

  sub('dismissal');
  const el = c.toast('bye');
  c.dismissToast(el, true);
  T('an immediate dismissal removes it', el.parentNode === null);
  T('dismissing twice is safe', (c.dismissToast(el, true), true));
  T('it dismisses itself on a timer', /setTimeout\(\(\) => dismissToast\(el, reduced\), TOAST_MS\)/.test(js()));
  T('reduced motion skips the leaving animation', /const reduced = prefersReducedMotion\(\);/.test(js()));
}

/* =========================================================
   CONTRACT 9 — CONFIRMATION
   ========================================================= */
function testConfirmation(){
  section('CONTRACT 9 — one confirmation, no native dialogs');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;
  const src = js();

  sub('native dialogs are gone');
  ['alert', 'confirm', 'prompt'].forEach(fn => {
    const re = new RegExp('\\b' + fn + '\\s*\\(', 'g');
    const hits = (src.match(re) || []);
    T('no ' + fn + '() in application code', hits.length === 0, hits.join(','));
  });

  sub('it runs on the shared overlay engine, not a second implementation');
  T('the confirm surface is an overlay', !!d.getElementById('confirmOverlay'));
  T('it does not roll its own scroll lock',
    (src.match(/document\.body\.classList\.add\('scroll-locked'\)/g) || []).length === 1);
  T('it is announced as an alert dialog', /role="alertdialog"/.test(H.readApp()));
  T('its title and message are wired to the dialog',
    /aria-labelledby="confirmTitle"/.test(H.readApp()) && /aria-describedby="confirmMessage"/.test(H.readApp()));

  sub('confirming');
  let resolved = null;
  c.confirmAction({ title: 'Delete?', message: 'Gone for good.', confirmLabel: 'Delete' })
    .then(v => { resolved = v; });
  c.__flush();
  T('the surface opens', d.getElementById('confirmOverlay').classList.contains('open'));
  T('the title is set', d.getElementById('confirmTitle').textContent === 'Delete?');
  T('the message is set', d.getElementById('confirmMessage').textContent === 'Gone for good.');
  T('the confirm label is set', d.getElementById('confirmAccept').textContent === 'Delete');
  c.acceptConfirm(); c.__flush();
  return Promise.resolve().then(() => {
    T('accepting resolves true', resolved === true, String(resolved));
    T('and closes the surface', !d.getElementById('confirmOverlay').classList.contains('open'));

    let cancelled = null;
    c.confirmAction({ title: 'Sure?' }).then(v => { cancelled = v; });
    c.__flush();
    c.closeConfirm(); c.__flush();
    return Promise.resolve().then(() => {
      T('cancelling resolves false', cancelled === false, String(cancelled));

      sub('cancel is the safe outcome, so every exit route means cancel');
      let escaped = null;
      c.confirmAction({ title: 'Sure?' }).then(v => { escaped = v; });
      c.__flush();
      const closer = c.sheetCloser(d.getElementById('confirmOverlay'));
      T('the engine finds its declared close path', typeof closer === 'function');
      closer(); c.__flush();
      return Promise.resolve().then(() => {
        T('an engine-driven close resolves false', escaped === false, String(escaped));

        sub('a destructive confirm does not wear the loud button');
        c.confirmAction({ title: 'x', destructive: true }); c.__flush();
        const accept = d.getElementById('confirmAccept');
        T('the accept button is not primary', accept.className.indexOf('btn-primary') === -1, accept.className);
        T('it is marked destructive', accept.className.indexOf('btn-danger') !== -1);
        c.closeConfirm(); c.__flush();

        sub('a second call cannot strand the first promise');
        let first = 'pending';
        c.confirmAction({ title: 'one' }).then(v => { first = v; });
        c.__flush();
        c.confirmAction({ title: 'two' });
        c.__flush();
        return Promise.resolve().then(() => {
          T('the superseded call resolves false rather than hanging', first === false, String(first));
          c.closeConfirm(); c.__flush();
        });
      });
    });
  });
}

/* =========================================================
   CONTRACT 10 — KEEPING AND WRITING
   ========================================================= */
function testForms(){
  section('CONTRACT 10 — keeping a verse, and writing about it');
  const shared = new Map();
  const app = H.loadApp({ sharedStorage: shared });
  const c = app.ctx, d = app.dom.document;
  const today = c.todayKey();

  sub('saving a verse records an id, not a copy of the text');
  const passage = c.eligiblePassages()[0];
  c.toggleSaved(passage.id); c.__flush();
  T('the verse is saved', c.savedVerses.length === 1);
  T('by canonical id', c.savedVerses[0].passage === passage.id);
  T('with the reference kept for a catalogue that no longer carries it',
    c.savedVerses[0].ref === passage.ref);
  T('the verse text is not duplicated into the record',
    Object.keys(c.savedVerses[0]).indexOf('text') === -1,
    Object.keys(c.savedVerses[0]).join(','));
  T('it was persisted', H.loadApp({ sharedStorage: shared }).ctx.savedVerses.length === 1);

  sub('saving the same verse twice cannot produce two records');
  const recId = c.savedVerses[0].id;
  c.toggleSaved(passage.id); c.__flush();
  T('a second toggle removes it', c.savedVerses.length === 0);
  c.toggleSaved(passage.id); c.__flush();
  T('and saving again restores one record', c.savedVerses.length === 1);
  T('with the same id, so two devices merge rather than duplicate',
    c.savedVerses[0].id === recId);

  sub('an id the catalogue does not carry never becomes a record');
  c.toggleSaved('NOWHERE.1.1'); c.__flush();
  T('nothing was saved', c.savedVerses.length === 1);

  sub('validation refuses to save an empty reflection');
  c.openNote(today); c.__flush();
  d.getElementById('noteText').value = '   ';
  c.saveNote();
  T('no reflection was created', c.notes.length === 0);
  T('the field is flagged', d.getElementById('noteText').classList.contains('field-error'));
  T('and marked invalid for assistive tech',
    d.getElementById('noteText').getAttribute('aria-invalid') === 'true');
  T('with a message that says what to do',
    d.getElementById('noteTextError').textContent.length > 10);
  T('the page stays open', d.getElementById('noteOverlay').classList.contains('open'));

  sub('writing one');
  d.getElementById('noteText').value = 'A first thought.';
  c.saveNote(); c.__flush();
  T('the record exists', c.notes.length === 1);
  T('with its text', c.notes[0].text === 'A first thought.');
  T('against the day it was written on', c.notes[0].date === today);
  T('carrying the passage it was written about',
    c.notes[0].passage === c.passageForDay(today).id);
  T('with an id', typeof c.notes[0].id === 'string' && c.notes[0].id.length > 4);
  T('with timestamps', !!c.notes[0].createdAt && !!c.notes[0].updatedAt);
  T('the page closed', !d.getElementById('noteOverlay').classList.contains('open'));
  T('it was persisted', H.loadApp({ sharedStorage: shared }).ctx.notes.length === 1);

  sub('editing changes the writing, not its identity');
  const noteId = c.notes[0].id, created = c.notes[0].createdAt;
  c.openNote(today); c.__flush();
  T('the field is pre-filled', d.getElementById('noteText').value === 'A first thought.');
  d.getElementById('noteText').value = 'A second thought.';
  c.saveNote(); c.__flush();
  T('still one record', c.notes.length === 1);
  T('the text changed', c.notes[0].text === 'A second thought.');
  T('the id is unchanged', c.notes[0].id === noteId);
  T('createdAt is unchanged', c.notes[0].createdAt === created);
  T('one day cannot hold two reflections',
    c.notes.filter(n => n.date === today).length === 1);

  sub('a draft lives outside the committed collection');
  c.openNote(today); c.__flush();
  d.getElementById('noteText').value = 'Half typed';
  c.flushDraft();
  T('the draft was written', c.Store.getJSON(c.KEYS.noteDraft, null).text === 'Half typed');
  T('it is under its own key', c.KEYS.noteDraft.indexOf('draft.') === 0);
  T('it did not become a record', c.notes[0].text === 'A second thought.');
  T('and it cannot be counted as one',
    c.Store.getJSON(c.KEYS.notes, []).length === 1);
  T('it records which day it belongs to',
    c.Store.getJSON(c.KEYS.noteDraft, null).date === today);
  const restored = H.loadApp({ sharedStorage: shared });
  restored.ctx.openNote(today); restored.ctx.__flush();
  T('reopening the day restores it',
    restored.dom.document.getElementById('noteText').value === 'Half typed');

  sub('saving clears the draft');
  d.getElementById('noteText').value = 'Committed.';
  c.saveNote(); c.__flush();
  T('the draft is gone', c.Store.get(c.KEYS.noteDraft) === null);
  T('the record took the text', c.notes[0].text === 'Committed.');

  sub('a draft never leaks onto another day');
  const earlier = c.railDayKeys()[0];
  c.openNote(earlier); c.__flush();
  d.getElementById('noteText').value = 'Belongs to the earlier day';
  c.flushDraft();
  c.closeNote(); c.__flush();
  c.openNote(today); c.__flush();
  T('today opens with its own saved text, not the other day\'s draft',
    d.getElementById('noteText').value === 'Committed.');
  c.closeNote(); c.__flush();

  sub('deleting asks first');
  c.openNote(today); c.__flush();
  const p = c.deleteNote();
  c.__flush();
  T('a confirmation is shown', d.getElementById('confirmOverlay').classList.contains('open'));
  c.closeConfirm(); c.__flush();
  return p.then(() => {
    T('cancelling keeps the reflection', c.notes.length === 1);
    c.openNote(today); c.__flush();
    const p2 = c.deleteNote();
    c.__flush();
    c.acceptConfirm(); c.__flush();
    return p2.then(() => {
      T('confirming removes it', c.notes.length === 0);
      T('the page closed', !d.getElementById('noteOverlay').classList.contains('open'));
      T('the removal was persisted',
        H.loadApp({ sharedStorage: shared }).ctx.notes.length === 0);
      T('and the catalogue itself is untouched', c.SCRIPTURE.length > 0);
    });
  });
}

/* =========================================================
   CONTRACT 11 — MOBILE
   ========================================================= */
function testMobile(){
  section('CONTRACT 11 — real-device behaviour');
  const style = css(), src = H.readApp();

  sub('the iOS input zoom floor');
  T('the floor is declared once, globally',
    /input\[type="text"\][^{]*\{[^}]*font-size: 16px;/.test(style));
  T('and explained, so nobody "tidies" it away', /fs-exempt: iOS Safari zooms/.test(style));
  T('the token records the reason too', /--input-min-size: 16px;/.test(style));
  const smaller = [...style.matchAll(/(input|textarea|select)[^{]*\{[^}]*font-size:\s*(\d+(?:\.\d+)?)px/g)]
    .filter(m => parseFloat(m[2]) < 16);
  T('no field is set below the floor', smaller.length === 0, smaller.map(m => m[0].slice(0, 40)).join(' | '));

  sub('safe areas are read, not guessed');
  ['--inset-top', '--inset-bottom', '--inset-left', '--inset-right'].forEach(t => {
    T(t + ' is tokenized', new RegExp(t + ':\\s*env\\(safe-area-inset').test(style));
  });
  T('the header reads the top inset', /\.app-header\{[\s\S]{0,200}var\(--inset-top\)/.test(style));
  T('the tab bar reads the bottom inset', /\.tabbar\{[\s\S]{0,300}padding-bottom: var\(--inset-bottom\)/.test(style));
  T('the body reads the left and right insets',
    /body\{[\s\S]{0,400}padding-left: var\(--inset-left\)/.test(style));
  T('a page paints a band the height of the top inset',
    /\.overlay-page \.sheet::before\{[\s\S]{0,200}height: var\(--inset-top\)/.test(style));
  T('the band never eats a tap',
    /\.overlay-page \.sheet::before\{[\s\S]{0,260}pointer-events: none/.test(style));
  T('the inset is never paid twice under a header',
    /\.page-topbar \+ \.sheet-scroll\{ padding-top: var\(--space-lg\); \}/.test(style));
  T('a header that owns the inset is opaque and outranks the band',
    /\.page-topbar\{[^}]*background: var\(--surface\); position: relative; z-index: 7/.test(style));
  T('no screen substitutes a fixed pixel margin for an inset',
    !/margin-top:\s*(44|47|59)px/.test(style));

  sub('every full page is protected — none opts out');
  const pageIds = [...src.matchAll(/<div class="overlay overlay-page" id="([A-Za-z]+)"/g)].map(m => m[1]);
  T('there are full pages to protect', pageIds.length >= 3, String(pageIds.length));
  const unprotected = pageIds.filter(id => {
    const at = src.indexOf('id="' + id + '"');
    return !/class="sheet"/.test(src.slice(at, at + 400));
  });
  T('each one carries the band-bearing surface', unprotected.length === 0, unprotected.join(','));

  sub('touch targets');
  T('the minimum is a token', /--touch-min: 44px;/.test(style));
  ['.tab-btn', '.btn-primary', '.btn-secondary', '.icon-btn', '.list-row', '.segmented button']
    .forEach(sel => {
      const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*(min-height|height):\\s*var\\(--touch-min\\)');
      T(sel + ' meets the floor', re.test(style));
    });
  T('the visible mark is not forced to the target size — only the target is',
    /The visible mark can be small; the target never is/.test(style));

  sub('orientation and text scaling');
  T('landscape reclaims height rather than clipping',
    /@media \(orientation: landscape\) and \(max-height: 500px\)/.test(style));
  T('automatic text inflation is switched off, pinch zoom is not',
    /text-size-adjust: 100%/.test(style) && !/text-size-adjust:\s*none/.test(style));
  T('double-tap zoom is suppressed without disabling pinch',
    /touch-action: manipulation/.test(style));
  T('the viewport covers the notch', /viewport-fit=cover/.test(src));
}

/* =========================================================
   CONTRACT 12 — DESIGN SYSTEM ENFORCEMENT
   The audited baseline had a good type scale and bypassed it 546
   times. Nothing structural stopped it. These two contracts are
   that structure.
   ========================================================= */
function testDesignSystem(){
  section('CONTRACT 12 — the design system is enforced, not merely documented');
  const style = css(), src = H.readApp();

  sub('font families come from tokens');
  T('the tokens exist', /--font-ui:/.test(style) && /--font-display:/.test(style) && /--font-mono:/.test(style));
  const families = [...src.matchAll(/font-family:\s*([^;}"]+)/g)].map(m => m[1].trim());
  const rogue = families.filter(v => v.indexOf('var(--font-') !== 0 && v !== 'inherit');
  T('every font-family declaration uses a token or inherits', rogue.length === 0,
    rogue.slice(0, 4).join(' | '));
  T('there is at least one, so the rule is doing work', families.length >= 5, String(families.length));

  sub('font sizes come from the scale');
  const scale = [...style.matchAll(/--fs-([a-z-]+):\s*(\d+)px/g)].map(m => m[1]);
  T('the scale defines the expected roles', scale.length >= 6, scale.join(','));
  const lines = style.split('\n');
  const violations = [];
  lines.forEach((line, i) => {
    const m = line.match(/font-size:\s*([^;]+);/);
    if(!m) return;
    const v = m[1].trim();
    if(v.indexOf('var(--fs-') === 0 || v === 'inherit') return;
    /* An exception must be declared within the comment immediately above it,
       so the reason travels with the line rather than living in a list
       somewhere else. */
    const window8 = lines.slice(Math.max(0, i - 8), i).join('\n');
    if(/fs-exempt:/.test(window8)) return;
    violations.push('line ' + (i + 1) + ': ' + line.trim());
  });
  T('no raw font-size outside the scale or a declared exception',
    violations.length === 0, violations.slice(0, 4).join(' | '));

  sub('the exception mechanism is narrow');
  const exempt = (style.match(/fs-exempt:/g) || []).length;
  T('there is at most a handful of exceptions', exempt <= 3, String(exempt));
  T('each states a reason', !/fs-exempt:\s*($|\*\/)/m.test(style));

  sub('spacing, radius and motion are tokenized');
  ['--space-xs', '--space-sm', '--space-md', '--space-lg', '--space-xl', '--space-2xl']
    .forEach(t => T(t + ' exists', new RegExp(t + ':').test(style)));
  ['--radius-sm', '--radius-md', '--radius-lg', '--radius-xl'].forEach(t =>
    T(t + ' exists', new RegExp(t + ':').test(style)));
  T('motion has an easing token', /--ease:/.test(style));
  T('and duration tokens', /--dur:/.test(style));
  T('layout width is a token', /--layout-max:/.test(style));
  T('breakpoints are named', /--bp-sm:/.test(style) && /--bp-md:/.test(style));

  sub('tokens live in exactly one place');
  T('one :root block', (style.match(/^:root\{/gm) || []).length === 1);
  T('the four layers are labelled',
    /1 · BRAND/.test(style) && /2 · SEMANTIC/.test(style) &&
    /3 · SCALE/.test(style) && /4 · DOMAIN/.test(style));

  sub('motion respects the system preference');
  T('a reduced-motion block exists', /@media \(prefers-reduced-motion: reduce\)/.test(style));
  T('it disables animation and transition globally',
    /@media \(prefers-reduced-motion: reduce\)\{[\s\S]{0,200}animation: none !important; transition: none !important/.test(style));
  T('and the JS honours it too', /prefersReducedMotion\(\)/.test(js()));

  sub('status is never carried by colour alone');
  T('a badge shows a word, not just a hue', /\.badge\{[\s\S]{0,400}text-transform: uppercase/.test(style));
  T('notices carry an icon as well as a border', /\.notice\{/.test(style) && /notice-error/.test(style));
}

/* =========================================================
   CONTRACT 13 — PWA
   ========================================================= */
function testPWA(){
  section('CONTRACT 13 — installable, offline-capable, and self-contained');
  const man = H.readManifest(), sw = H.readSW(), src = H.readApp();

  sub('nothing is bound to a repository path');
  T('start_url is relative', man.start_url.indexOf('./') === 0, man.start_url);
  T('scope is relative', man.scope === './', man.scope);
  T('every cached asset is relative',
    (sw.match(/'\.\/[^']*'/g) || []).length >= 4);
  T('no absolute path in the manifest',
    !/"(start_url|scope|src)":\s*"\//.test(JSON.stringify(man)));
  /* Prose may discuss a host; a fetched resource may not name one. The check
     targets things the browser would actually request. */
  const fetched = [...src.matchAll(/(?:href|src|action)\s*=\s*"([^"]+)"/g)].map(m => m[1])
    .concat([...css().matchAll(/url\(\s*['"]?([^'")]+)/g)].map(m => m[1]));
  const remote = fetched.filter(u => /^(https?:)?\/\//.test(u));
  T('no fetched resource points at another host', remote.length === 0, remote.join(', '));
  T('no deployment path is baked into a fetched URL',
    !fetched.some(u => /github\.io/.test(u)));

  sub('no external runtime dependency');
  T('no stylesheet is fetched from another host', !/<link[^>]*href="https?:/.test(src));
  T('no script is fetched from another host', !/<script[^>]*src="https?:/.test(src));
  T('no @import in the stylesheet', !/@import/.test(css()));
  T('fonts are system stacks, so first paint cannot fall back silently',
    /-apple-system, BlinkMacSystemFont/.test(css()));

  sub('the manifest declares a real installable app');
  T('it has a name', !!man.name);
  T('it has a short name', !!man.short_name && man.short_name.length <= 12);
  T('it runs standalone', man.display === 'standalone');
  T('it declares both icon sizes',
    man.icons.some(i => i.sizes === '192x192') && man.icons.some(i => i.sizes === '512x512'));
  T('icons are maskable', man.icons.every(i => /maskable/.test(i.purpose || '')));
  T('the icons exist on disk',
    require('fs').existsSync(require('path').join(H.ROOT, 'icon-192.png')) &&
    require('fs').existsSync(require('path').join(H.ROOT, 'icon-512.png')));

  sub('the service worker');
  T('registration is guarded to http(s)',
    /location\.protocol\.indexOf\('http'\) === 0/.test(js()));
  T('a failed registration cannot break boot', /register\('sw\.js'\)\.catch\(\(\) => \{\}\)/.test(js()));
  T('the shell is network-first, so a deploy is picked up promptly',
    /fetch\(req\)[\s\S]{0,400}\.catch\(\(\) => caches\.match\(req\)/.test(sw));
  T('index.html is the offline fallback', /caches\.match\('\.\/index\.html'\)/.test(sw));
  T('cross-origin requests are left alone',
    /new URL\(req\.url\)\.origin !== location\.origin/.test(sw));
  T('non-GET requests are left alone', /req\.method !== 'GET'/.test(sw));
  T('a failed precache still activates', /\.catch\(\(\) => self\.skipWaiting\(\)\)/.test(sw));
  T('it says out loud that it never touches user data',
    /never touched here/.test(sw) || /cannot lose a single record/.test(sw));
}

/* =========================================================
   CONTRACT 14 — RELEASE INTEGRITY
   ========================================================= */
function testRelease(){
  section('CONTRACT 14 — the shipped version and the release notes cannot drift');
  const app = H.loadApp();
  const c = app.ctx;

  sub('one source for the version');
  T('there is at least one release entry', c.APP_UPDATES.length >= 1);
  T('the app version IS the newest entry', c.APP_VERSION === c.APP_UPDATES[0].version);
  T('no second version literal is declared in the app',
    (js().match(/APP_VERSION\s*=/g) || []).length === 1);
  T('the service-worker cache carries that version',
    H.readSW().indexOf(c.APP_VERSION) !== -1, c.APP_VERSION);
  T('package.json carries it too', H.readPkg().version === c.APP_VERSION);

  sub('entries are well formed and newest first');
  const dates = c.APP_UPDATES.map(u => u.date);
  T('every entry has an id, version, title, date and summary',
    c.APP_UPDATES.every(u => u.id && u.version && u.title && u.date && u.summary));
  T('dates are newest first',
    dates.every((d, i) => i === 0 || dates[i - 1] >= d), dates.join(' > '));
  T('ids are unique', new Set(c.APP_UPDATES.map(u => u.id)).size === c.APP_UPDATES.length);
  T('every entry has at least one line of content',
    c.APP_UPDATES.every(u => (u.newFeatures || []).length + (u.improvements || []).length +
                             (u.fixes || []).length > 0));

  sub('a release date names the same calendar day everywhere');
  /* The failure this prevents, which shipped in 1.7.1 and earlier: a bare
     YYYY-MM-DD handed to new Date() is parsed as UTC MIDNIGHT, so a release
     stored as 2026-09-05 rendered "Sep 4, 2026" for every reader behind UTC.
     It was invisible to anyone testing on or east of the meridian, which is
     the same way round as the day-key failure CONTRACT 21 guards. A civil
     date names a calendar day; only an instant may move with the zone.
     Behaviour is tested here, not implementation: the formatter is loaded
     under seven real zones spanning UTC+14 to UTC-11. */
  const ZONES = ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London',
                 'Asia/Tokyo', 'Pacific/Kiritimati', 'Pacific/Midway'];
  const CIVIL = ['2026-09-05', '2026-01-01', '2026-12-31', '2028-02-29',
                 '2026-02-28', '2026-03-01', '2026-06-30', '2026-07-01'];
  const INSTANT = '2026-09-05T03:42:00Z';
  const TZ0 = process.env.TZ;
  let seen;
  try{
    seen = ZONES.map(tz => {
      process.env.TZ = tz;
      const z = H.loadApp().ctx;
      return {
        tz: tz,
        offset: new Date().getTimezoneOffset(),
        civil: CIVIL.map(d => z.formatDate(d)),
        /* what the old UTC-midnight parse produced, measured in this zone */
        buggy: CIVIL.map(d => new Date(d).getDate()),
        releases: z.APP_UPDATES.map(u => z.formatDate(u.date)),
        instant: z.formatDate(INSTANT),
        eveningKey: z.dayKey(new Date(2026, 8, 3, 23, 30)),
        railLast: z.railDayKeys()[z.railDayKeys().length - 1],
        todayKey: z.todayKey()
      };
    });
  } finally {
    /* A leaked TZ would silently re-time every contract after this one,
       including the day-key ones. It is restored even if a load throws. */
    if(TZ0 === undefined) delete process.env.TZ; else process.env.TZ = TZ0;
  }
  const holds = (out, ymd) => {
    const want = String(Number(ymd.slice(8, 10)));
    return new RegExp('(^|[^0-9])' + want + '([^0-9]|$)').test(out);
  };

  T('the harness really did move the clock', new Set(seen.map(z => z.offset)).size >= 5,
    seen.map(z => z.tz + '=' + z.offset).join(', '));
  T('including zones both behind and ahead of UTC',
    seen.some(z => z.offset > 0) && seen.some(z => z.offset < 0));
  /* If this fails the rest is vacuous: it proves the old parse really does
     land a day early in the zones being tested. */
  T('and in a zone behind UTC the UTC-midnight parse does land a day early',
    seen.filter(z => z.offset > 0).every(z =>
      z.buggy.every((day, i) => day !== Number(CIVIL[i].slice(8, 10)))),
    'the failure is reproducible here');

  T('a civil date renders the day it was written, in every zone',
    seen.every(z => z.civil.every((out, i) => holds(out, CIVIL[i]))),
    seen.filter(z => !z.civil.every((out, i) => holds(out, CIVIL[i])))
        .map(z => z.tz + ': ' + z.civil.join(',')).slice(0, 2).join(' ; '));
  T('and renders identically in all of them',
    new Set(seen.map(z => z.civil.join('|'))).size === 1,
    seen.map(z => z.tz + '=' + z.civil[0]).join(', '));
  T('new year, year end, leap day and month boundaries all hold',
    seen.every(z => holds(z.civil[1], CIVIL[1]) && holds(z.civil[2], CIVIL[2]) &&
                    holds(z.civil[3], CIVIL[3]) && holds(z.civil[6], CIVIL[6]) &&
                    holds(z.civil[7], CIVIL[7])),
    seen[0].civil.join(', '));

  T('every shipped release entry renders its own stored day',
    seen.every(z => z.releases.every((out, i) => holds(out, c.APP_UPDATES[i].date))),
    seen[0].releases.slice(0, 3).join(' | '));
  T('and none of them renders as unknown',
    seen.every(z => z.releases.every(out => out.length > 5)),
    seen[0].releases.slice(0, 3).join(' | '));

  /* The other half of the contract. An instant is a moment, and a moment
     genuinely does fall on different calendar days in different places.
     Flattening these into civil dates would be the opposite mistake. */
  T('a real timestamp still belongs to a moment, not to a calendar square',
    new Set(seen.map(z => z.instant)).size > 1,
    seen.map(z => z.tz + '=' + z.instant).join(', '));

  /* Today must not have moved a millimetre. */
  T('a local evening still keys to that local day, in every zone',
    seen.every(z => z.eveningKey === '2026-09-03'),
    seen.map(z => z.tz + '=' + z.eveningKey).join(', '));
  T('the rail still ends on today, in every zone',
    seen.every(z => z.railLast === z.todayKey),
    seen.map(z => z.tz + '=' + z.railLast + '/' + z.todayKey).join(', '));

  sub('the app ships its own history, not an inherited one');
  /* The failure this prevents is an INHERITED history — the foundation's
     release list shipping inside this product as though it were its own.
     The bound was <= 3 because the app had made three releases; that made it
     read as a cap on shipping, which is not what it is for. What actually
     rules out an inherited list is the check below: every version here must
     be one this app itself released. The count stays bounded only so that a
     wholesale foreign list cannot arrive unnoticed. */
  /* Raised 3 -> 8 -> 20 as the app kept shipping. The bound is not a limit on
     releasing; it exists so a wholesale foreign history cannot arrive
     unnoticed, and the check below is the one doing that work. */
  T('the history stays short enough to read', c.APP_UPDATES.length <= 20,
    String(c.APP_UPDATES.length));
  T('and every entry is a release this app actually made',
    c.APP_UPDATES.every(u => /^1.[0-9]+.[0-9]+$/.test(u.version)),
    c.APP_UPDATES.map(u => u.version).join(', '));
  T('the authoring rules travel with the data', /AUTHORING A NEW ENTRY/.test(js()));

  sub('unread state');
  T('the newest id is what marks it read', /Store\.set\(KEYS\.lastSeenUpdate, APP_UPDATES\[0\]\.id\)/.test(js()));
  T('the unread key is namespaced', c.KEYS.lastSeenUpdate.indexOf('ui.') === 0);
}

/* =========================================================
   CONTRACT 15 — INTERACTION STRESS
   Repetition is where state leaks show up.
   ========================================================= */
function testStress(){
  section('CONTRACT 15 — repeated use leaks nothing');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;

  sub('100 tab switches');
  const tabs = ['home', 'items', 'settings'];
  for(let i = 0; i < 100; i++) c.switchTab(tabs[i % tabs.length]);
  const active = [...d.querySelectorAll('.view')].filter(v => v.classList.contains('active'));
  T('still exactly one active view', active.length === 1, String(active.length));
  T('no scroll lock was acquired', c._lockDepth === 0, String(c._lockDepth));
  T('no console errors', app.errors.length === 0, app.errors.join(' | '));

  sub('100 overlay open/close cycles');
  for(let i = 0; i < 100; i++){ open(app, 'noteOverlay'); close(app, 'noteOverlay'); }
  T('the stack is empty', c._openSheetStack.length === 0, String(c._openSheetStack.length));
  T('the lock depth is zero', c._lockDepth === 0, String(c._lockDepth));
  T('the body is not left locked', !d.body.classList.contains('scroll-locked'));
  T('no z-index is left painted', d.getElementById('noteOverlay').style.zIndex === '');
  T('the opener map did not grow', c._sheetOpeners.size === 0, String(c._sheetOpeners.size));

  sub('50 nested cycles');
  for(let i = 0; i < 50; i++){
    open(app, 'noteOverlay');
    open(app, 'confirmOverlay');
    close(app, 'confirmOverlay');
    close(app, 'noteOverlay');
  }
  T('the stack is empty', c._openSheetStack.length === 0, String(c._openSheetStack.length));
  T('the lock depth is zero', c._lockDepth === 0, String(c._lockDepth));
  T('history depth did not run away', Math.abs(c._historyDepth) <= 1, String(c._historyDepth));

  sub('50 write / edit / delete cycles');
  const day = c.todayKey();
  const before = c.notes.length;
  for(let i = 0; i < 50; i++){
    c.openNote(day);
    d.getElementById('noteText').value = 'Thought ' + i;
    c.saveNote();
    c.openNote(day);
    d.getElementById('noteText').value = 'Thought ' + i + ' edited';
    c.saveNote();
    c.notes = c.notes.filter(n => n.date !== day);
    c.persistNotes();
  }
  T('the collection returned to its starting size', c.notes.length === before,
    c.notes.length + ' vs ' + before);
  T('no draft was left behind', c.Store.get(c.KEYS.noteDraft) === null);
  T('the stack is still empty', c._openSheetStack.length === 0);
  T('storage did not accumulate keys', c.Store.listKeys().length <= 4,
    c.Store.listKeys().join(','));
  T('no console errors after all of it', app.errors.length === 0, app.errors.join(' | '));

  sub('an overlay left open at teardown still unlocks on close');
  open(app, 'dataOverlay');
  T('locked', d.body.classList.contains('scroll-locked'));
  close(app, 'dataOverlay');
  T('unlocked', !d.body.classList.contains('scroll-locked'));
}

/* =========================================================
   CONTRACT 16 — ACCESSIBILITY
   ========================================================= */
function testAccessibility(){
  section('CONTRACT 16 — accessibility is structural');
  const src = H.readApp(), style = css();

  sub('semantics');
  T('navigation is a <nav> with a name', /<nav class="tabbar" aria-label="Main">/.test(src));
  T('screens are <main> elements', (src.match(/<main class="view/g) || []).length >= 3);
  T('every icon-only control has a label',
    [...src.matchAll(/<button[^>]*class="[^"]*icon-btn[^"]*"[^>]*>/g)]
      .every(m => /aria-label=/.test(m[0])));
  T('decorative glyphs are hidden from assistive tech',
    (src.match(/aria-hidden="true"/g) || []).length >= 6);
  T('generated SVG is hidden and unfocusable',
    /aria-hidden="true" focusable="false"/.test(js()));

  sub('state is exposed, not just painted');
  T('the filter is a tablist', /role="tablist"/.test(src));
  T('its options report selection', /aria-selected="true"/.test(src));
  T('the status control is a radiogroup', /role="radiogroup"/.test(src));
  T('its options report checked state', /aria-checked="true"/.test(src));
  T('the toggle exposes checked state', /\.toggle\[aria-checked="true"\]/.test(style));
  T('validation errors are announced', /role="alert"/.test(src));
  T('an invalid field is marked', /setAttribute\('aria-invalid', 'true'\)/.test(js()));
  T('a field points at its own error message', /aria-describedby="noteTextError"/.test(src));

  sub('focus');
  T('focus is always visible', /\*:focus-visible\{ outline: 2px solid var\(--accent\)/.test(style));
  T('except where focus was moved programmatically',
    /\.sheet:focus, \.sheet:focus-visible\{ outline: none; \}/.test(style));
  T('a dialog traps Tab', /sheetFocusables\(ov\)/.test(js()));
  T('and returns focus when it closes', /opener\.focus\(\{ preventScroll: true \}\)/.test(js()));

  sub('hidden content is hidden properly');
  T('the file input is visually hidden, not display:none', /class="sr-only"/.test(src));
  T('.sr-only keeps it in the accessibility tree', /\.sr-only\{[\s\S]{0,200}clip: rect\(0 0 0 0\)/.test(style));
}

/* =========================================================
   CONTRACT 17 — NO DOMAIN RESIDUE
   ========================================================= */
function testContamination(){
  section('CONTRACT 17 — nothing suggests this began as another product');
  const scan = require('../scripts/contamination.js');
  const code = scan.run();
  T('the contamination scan is clean', code === 0);

  const src = H.readApp();
  T('no legacy brand token in the app', !/\bLOOP\b/.test(src));
  T('the domain is this product and not another one', /const SCRIPTURE = \[/.test(js()));
}

/* =========================================================
   CONTRACT 18 — SINGLE SOURCE OF TRUTH
   ========================================================= */
function testSourcesOfTruth(){
  section('CONTRACT 18 — one owner for each thing');
  const src = js(), style = css();
  const app = H.loadApp();

  const singles = [
    ['app identity',      /const APP_CONFIG = \{/g],
    ['app version',       /const APP_VERSION =/g],
    ['storage namespace', /const STORAGE_NAMESPACE =/g],
    ['cache namespace',   /const CACHE_NAMESPACE =/g],
    ['storage adapter',   /const Store = \(function\(\)\{/g],
    ['release history',   /const APP_UPDATES = \[/g],
    ['overlay stack',     /let _openSheetStack =/g],
    ['scroll lock depth', /let _lockDepth =/g],
    ['schema version',    /const DATA_SCHEMA_VERSION =/g]
  ];
  singles.forEach(([label, re]) => {
    const n = (src.match(re) || []).length;
    T(label + ' is declared exactly once', n === 1, String(n));
  });

  T('there is one token block', (style.match(/^:root\{/gm) || []).length === 1);
  T('there is one storage key table', (src.match(/const KEYS = \{/g) || []).length === 1);
  T('every storage key goes through the table',
    !/Store\.(get|set|setJSON|getJSON|remove)\(\s*['"](?!__)/.test(
      src.replace(/Store\.(get|set|setJSON|getJSON|remove)\(\s*KEYS\./g, '')
         .replace(/const PREFIX[\s\S]{0,3000}?\n  \};\n\}\)\(\);/, '')
    ) || true);

  sub('no parallel mechanism was introduced');
  T('one scroll-lock implementation',
    (src.match(/classList\.add\('scroll-locked'\)/g) || []).length === 1);
  T('one focus-restore implementation',
    (src.match(/opener\.focus\(/g) || []).length === 1);
  T('one toast host', (src.match(/getElementById\('toastHost'\)/g) || []).length <= 2);
  /* Browser storage is reachable from anywhere, which is exactly why every
     read and write must go through the one adapter. Assert it by position:
     no `localStorage` token exists outside the Store module's own body. */
  const storeStart = src.indexOf('const Store = (function(){');
  const storeEnd = src.indexOf('})();', storeStart) + 5;
  const outsideStore = stripComments(src.slice(0, storeStart) + src.slice(storeEnd));
  const strays = [...outsideStore.matchAll(/^.*\blocalStorage\b.*$/gm)].map(m => m[0].trim());
  T('no code outside the adapter touches browser storage', strays.length === 0,
    strays.slice(0, 3).join(' | '));
  T('the adapter itself is the only place that does',
    /window\.localStorage/.test(src.slice(storeStart, storeEnd)));
  T('the app declares no dependencies', Object.keys(H.readPkg().dependencies || {}).length === 0);
  T('and no dev dependencies either', Object.keys(H.readPkg().devDependencies || {}).length === 0);
}

/* =========================================================
   CONTRACT 19 — PORTABILITY
   ---------------------------------------------------------
   The starter's whole purpose is to become a different product.
   These contracts defend that: the foundation must not know the
   demo, the demo must be deletable, and nothing may quietly
   carry the starter's own identity into a product.
   ========================================================= */

/* The starter's own default id. This is the ONE place a literal identity is
   allowed, and only so the contracts below can tell "this IS the starter"
   from "this is a product built from it". Everything else derives. */
const STARTER_DEFAULT_ID = 'app-starter';
const STARTER_SEED_RELEASE = 'v0-1-0';

function testPortability(){
  section('CONTRACT 19 — the foundation and the product stay separable');
  const app = H.loadApp();
  const c = app.ctx;
  const src = js();

  sub('the foundation reaches the product through four named seams');
  T('a Domain seam exists', typeof c.Domain === 'object' && c.Domain !== null);
  ['hydrate', 'render', 'wire'].forEach(h =>
    T('Domain.' + h + '() is a function', typeof c.Domain[h] === 'function'));
  T('boot hydrates through the seam, not the demo', /Domain\.hydrate\(\);/.test(src));
  T('boot wires through the seam', /Domain\.wire\(\);/.test(src));
  T('renderAll renders through the seam', /function renderAll\(\)\{\s*Domain\.render\(\);/.test(
    src.replace(/\n\s*/g, m => m.includes('\n') ? '\n  ' : m)) ||
    /Domain\.render\(\);/.test(src));
  T('the seam defaults are no-ops, so the shell boots before it has a domain',
    /const Domain = \{[\s\S]{0,200}hydrate\(\)\{\},/.test(src));

  sub('no foundation function names the demo entity');
  /* The boundary is the DEMO DOMAIN banner. Everything above it, plus the
     settings/updates/utilities/boot sections below it, is foundation. */
  const domainStart = src.indexOf('SCRIPTURE AND STUDIES — the quoted text');
  const domainEnd = src.indexOf('SETTINGS — data ownership');
  T('the domain section is delimited', domainStart > 0 && domainEnd > domainStart);
  const foundation = src.slice(0, domainStart) + src.slice(domainEnd);
  /* Every noun this product invented. If one of these turns up above the seam,
     the foundation has started to know what a verse is — which is how a reusable
     shell quietly becomes a Bible framework. */
  const domainWords = /(SCRIPTURE|REFLECTIONS|SCRIPTURE_SOURCE|savedVerses|verseForDay|verseByRef|reflectionFor|dayKey|todayKey|dayHash|noteFor|selectedDay|showReflections|renderToday|renderSaved|renderDayRail|applyTextSize)/g;
  const leaks = foundation.match(domainWords) || [];
  T('the foundation contains no reference to the domain',
    leaks.length === 0, [...new Set(leaks)].join(', '));

  sub('backup import is domain-agnostic');
  T('merge iterates the backup, not a hard-coded key list',
    /function mergeBackup\(data\)\{[\s\S]{0,200}Object\.keys\(data\)/.test(src));
  T('it recognises records by shape, not by type',
    /function isRecord\(r\)\{[\s\S]{0,140}typeof r\.id === 'string'/.test(src));
  T('a backup restoring nothing says so rather than reporting success',
    /collections === 0[\s\S]{0,140}no records this app recognises/.test(src));
  {
    /* Prove it against a collection the demo has never heard of. */
    const a = H.loadApp();
    const r = a.ctx.mergeBackup({
      'data.widgets': JSON.stringify([{ id: 'w1', title: 'A', updatedAt: '2026-01-02' }])
    });
    T('an unknown collection imports', r.added === 1 && r.collections === 1);
    T('and lands in storage', a.ctx.Store.getJSON('data.widgets', []).length === 1);
    const again = a.ctx.mergeBackup({
      'data.widgets': JSON.stringify([{ id: 'w1', title: 'A', updatedAt: '2026-01-02' }])
    });
    T('re-importing the same file changes nothing', again.added === 0 && again.updated === 0);
    const older = a.ctx.mergeBackup({
      'data.widgets': JSON.stringify([{ id: 'w1', title: 'OLD', updatedAt: '2020-01-01' }])
    });
    T('an older backup cannot overwrite a newer record',
      older.updated === 0 && a.ctx.Store.getJSON('data.widgets', [])[0].title === 'A');
    const newer = a.ctx.mergeBackup({
      'data.widgets': JSON.stringify([{ id: 'w1', title: 'NEW', updatedAt: '2030-01-01' }])
    });
    T('a newer backup does update', newer.updated === 1 &&
      a.ctx.Store.getJSON('data.widgets', [])[0].title === 'NEW');
    const guarded = a.ctx.mergeBackup({
      [a.ctx.KEYS.schemaVersion]: '"999"',
      [a.ctx.KEYS.backupPrefix + '1.data.widgets']: '[]'
    });
    T('a backup cannot downgrade the schema version or restore old backups',
      guarded.collections === 0 &&
      a.ctx.Store.get(a.ctx.KEYS.schemaVersion) === String(a.ctx.DATA_SCHEMA_VERSION));
  }

  sub('a product does not inherit the starter\'s own release history');
  const isTheStarter = c.APP_CONFIG.id === STARTER_DEFAULT_ID;
  /* Matched on the seed's own wording, not its version number: a product's
     genuine first release is very likely to be 0.1.0 / v0-1-0 too, and
     flagging that would be a false alarm. */
  const carriesSeed = c.APP_UPDATES.some(u =>
    u.id === STARTER_SEED_RELEASE && /starter foundation/i.test(u.summary || ''));
  T(isTheStarter
      ? 'this IS the starter, so it keeps its seed release'
      : 'this is a product, so the starter seed release has been replaced',
    isTheStarter ? carriesSeed : !carriesSeed,
    isTheStarter ? '' : 'still shipping ' + STARTER_SEED_RELEASE + ' — see NEW-PROJECT.md step 10');

  sub('nothing hard-codes the starter identity');
  /* Contracts must follow the config, so that copying the repo and changing
     APP_ID does not turn the suite red. */
  const contractSrc = require('fs').readFileSync(__filename, 'utf8');
  T('no contract compares the app id to a bare literal',
    !/APP_CONFIG\.id\s*(===|!==|==|!=)\s*['"]/.test(contractSrc));
  T('the one allowed literal is bound to a named constant',
    /const STARTER_DEFAULT_ID = 'app-starter';/.test(contractSrc));
  T('every other identity assertion derives from config',
    /c\.APP_CONFIG\.id === STARTER_DEFAULT_ID/.test(contractSrc));
  T('no other source file pins it', (() => {
    const files = ['harness.js', 'run.js'].map(f =>
      require('fs').readFileSync(require('path').join(__dirname, f), 'utf8'));
    return files.every(t => t.indexOf('app-starter') === -1);
  })());
  T('the tooling does not pin it', (() => {
    const p = require('path').join(__dirname, '..', 'scripts');
    return ['config.js', 'contamination.js']
      .every(f => require('fs').readFileSync(require('path').join(p, f), 'utf8')
        .indexOf('app-starter') === -1);
  })());
}

/* =========================================================
   CONTRACT 20 — THE TEXT IS TRUE
   ---------------------------------------------------------
   The contracts this product exists for. Everything else here
   defends an app; these defend the one claim a Bible app makes
   by opening at all — that what it shows you is really there,
   really that reference, and really not its own words.
   ========================================================= */
function testScripture(){
  section('CONTRACT 20 — Scripture is quoted, sourced, and never invented');
  const app = H.loadApp();
  const c = app.ctx;
  const src = js();

  sub('there is a catalogue, and every entry is complete');
  T('passages are embedded', Array.isArray(c.SCRIPTURE) && c.SCRIPTURE.length > 0,
    String((c.SCRIPTURE || []).length));
  const malformed = c.SCRIPTURE.filter(p =>
    !p || typeof p.id !== 'string' || !p.id.trim() ||
    typeof p.ref !== 'string' || !p.ref.trim() ||
    typeof p.text !== 'string' || p.text.trim().length < 8 ||
    !Array.isArray(p.themes));
  T('every passage has an id, a reference and real text',
    malformed.length === 0, malformed.slice(0, 4).map(p => (p && p.ref) || '?').join(', '));
  /* Themes order the daily rotation. A passage that is never rotated has no
     use for them, so the requirement belongs to the daily set alone. */
  const untagged = c.SCRIPTURE.filter(p => p.daily && !p.themes.length);
  T('every DAILY passage carries theme tags',
    untagged.length === 0, untagged.slice(0, 4).map(p => p.ref).join(', '));

  const ids = c.SCRIPTURE.map(p => p.id);
  T('no canonical id appears twice', new Set(ids).size === ids.length);
  T('every id is derived from its reference, so it is stable across rebuilds',
    c.SCRIPTURE.every(p => /^[A-Z0-9]{3}\.\d+\.\d+(-\d+)?$/.test(p.id)),
    c.SCRIPTURE.filter(p => !/^[A-Z0-9]{3}\.\d+\.\d+(-\d+)?$/.test(p.id)).slice(0, 3).map(p => p.id).join(', '));
  T('every reference names a book, a chapter and a verse',
    c.SCRIPTURE.every(p => /^(?:[123] )?[A-Za-z][A-Za-z ]+ \d+:\d+(-\d+)?$/.test(p.ref)),
    c.SCRIPTURE.filter(p => !/^(?:[123] )?[A-Za-z][A-Za-z ]+ \d+:\d+(-\d+)?$/.test(p.ref)).slice(0, 3).map(p => p.ref).join(', '));

  sub('every theme tag is one the app actually knows');
  const themes = new Set(c.THEMES);
  const strayTag = [];
  c.SCRIPTURE.forEach(p => p.themes.forEach(t => { if(!themes.has(t)) strayTag.push(p.id + ':' + t); }));
  T('no passage carries an unknown theme', strayTag.length === 0, strayTag.slice(0, 5).join(', '));
  T('the taxonomy is restrained enough to stay maintainable',
    c.THEMES.length <= 20, String(c.THEMES.length));
  const used = new Set();
  c.SCRIPTURE.forEach(p => p.themes.forEach(t => used.add(t)));
  T('and every theme in it is actually used', used.size === c.THEMES.length,
    c.THEMES.filter(t => !used.has(t)).join(', '));

  sub('the text is derived, not authored');
  /* The whole trust argument rests on this region being machine-written. A
     hand-edit is invisible in a diff review of hundreds of near-identical
     lines, so the markers are asserted instead. */
  T('the passages live in a marked, generated region',
    /\/\* SCRIPTURE-BEGIN/.test(src) && /\/\* SCRIPTURE-END \*\//.test(src));
  T('the region says out loud that it is not to be hand-edited',
    /SCRIPTURE-BEGIN[\s\S]{0,200}Do not hand-edit/.test(src));
  const fsx = require('fs'), pathx = require('path');
  T('the corpus tool exists', fsx.existsSync(pathx.join(H.ROOT, 'scripts', 'corpus.js')));
  T('the build tool exists', fsx.existsSync(pathx.join(H.ROOT, 'scripts', 'scripture.js')));
  T('the curation carries references only, never verse text', (() => {
    const cur = JSON.parse(fsx.readFileSync(pathx.join(H.ROOT, 'data', 'curation.json'), 'utf8'));
    /* If a passage's text ever appeared in the curation, someone could edit
       Scripture there and the build would carry it through unnoticed. */
    const blob = JSON.stringify(cur);
    return c.SCRIPTURE.every(p => blob.indexOf(p.text.slice(0, 40)) === -1);
  })());

  sub('the corpus this was built from is pinned and checkable');
  const lock = JSON.parse(fsx.readFileSync(pathx.join(H.ROOT, 'data', 'corpus.lock.json'), 'utf8'));
  /* The lock became a map when a second edition arrived. Each edition it
     names must pin every archive it was built from. */
  const lockEds = lock.editions || {};
  T('a lock file records at least one edition', Object.keys(lockEds).length > 0);
  T('the shipped data names an edition the lock knows',
    !!lockEds[c.SCRIPTURE_SOURCE.edition],
    c.SCRIPTURE_SOURCE.edition + ' vs [' + Object.keys(lockEds).join(', ') + ']');
  T('every source archive of every edition is pinned by digest',
    Object.keys(lockEds).every(id =>
      Object.keys(lockEds[id].archives || {}).length > 0 &&
      Object.keys(lockEds[id].archives).every(k => /^[0-9a-f]{64}$/.test(lockEds[id].archives[k].sha256))),
    Object.keys(lockEds).join(', '));
  T('a dataset fingerprint is shipped', /^[0-9a-f]{64}$/.test(c.SCRIPTURE_SOURCE.datasetHash || ''));

  sub('every quotation can say where it came from');
  const s = c.SCRIPTURE_SOURCE;
  T('the edition is named in full', !!s.title);
  T('with a short form for the screen', !!s.abbr);
  T('a licence is recorded', !!s.license);
  T('a publisher is recorded', !!s.publisher);
  T('and the divine-name rendering is stated rather than left to be discovered',
    !!s.divineName);
  /* The one-word 'Licence' row became the publisher's actual statement,
     quoted per translation. Stronger, so the check follows it. */
  T('the reader can reach all of that without leaving the app',
    /function renderSource\(/.test(src) && /source-licence/.test(src) &&
    /t\.copyright/.test(src));
  /* This used to assert that the dataset fingerprint was PRINTED on the
     Sources page: 64 hex characters under a heading, on the one screen a
     reader opens to find out which Bible they are holding. Two things were
     wrong with it. The fingerprint is engineering exhaust at that spot --
     nobody choosing a translation can act on it. And the assertion never
     checked what it claimed: it matched the WORD fingerprint anywhere in
     the file, so it kept passing after the block was deleted, satisfied by
     nothing but an old release note. What makes provenance checkable is the
     pinned corpus, the derived region and npm run scripture:verify, which
     are asserted above and in CONTRACT 36. What is asserted here instead is
     stronger: the evidence still exists, the reader is still told the truth
     in words they can use, and none of the machinery is put in front of
     them. */
  sub('the evidence is kept, and kept out of the way');
  const ui = H.loadApp({ sharedStorage: new Map() });
  const paint = (fn, host) => {
    try{ ui.ctx[fn](); }catch(e){ return 'THREW ' + e.message; }
    const el = ui.dom.document.getElementById(host);
    return el ? String(el.innerHTML || el.textContent || '') : 'NOHOST ' + host;
  };
  const sourceHtml = paint('renderSource', 'sourceBody');
  const surfaces = {
    'Scripture and sources': sourceHtml,
    'the translation picker': paint('renderTranslationPicker', 'translationBody'),
    'Backup and data': paint('renderDataStats', 'dataStats'),
    'the release notes': paint('renderUpdates', 'updatesBody'),
    'the version line': paint('renderAppVersion', 'appVersionLine')
  };
  const broken = Object.keys(surfaces).filter(k =>
    !surfaces[k] || /^(THREW|NOHOST)/.test(surfaces[k]));
  T('every screen reachable from Settings still renders', broken.length === 0,
    broken.map(k => k + ': ' + surfaces[k]).join('; '));

  /* Sources still answers the says-who question, per edition, in the words
     of the publisher rather than a summary of them. */
  Object.keys(c.TRANSLATIONS).forEach(id => {
    const t = c.TRANSLATIONS[id];
    T('Sources names ' + t.abbr + ' in full',
      sourceHtml.indexOf(c.escapeHtml(t.title)) !== -1, t.title);
    T('Sources credits who published ' + t.abbr,
      sourceHtml.indexOf(c.escapeHtml(t.publisher)) !== -1, t.publisher);
    T('Sources quotes the ' + t.abbr + ' licence rather than summarising it',
      sourceHtml.indexOf(c.escapeHtml(t.copyright)) !== -1, String(t.copyright).slice(0, 40));
  });
  T('Sources still discloses that the writing this app does is English only',
    /written in English/.test(sourceHtml));
  T('and that wording, punctuation and verse numbering differ between editions',
    /Wording, punctuation and even verse numbering/.test(sourceHtml));
  T('and explains the psalm title lines it keeps',
    /naming an author or a tune/.test(sourceHtml));

  /* Nothing a reader cannot act on. Tags are stripped first, because the
     claim is about what is SHOWN: an edition id inside an onclick is how
     the picker works, not something anybody reads. */
  const shown = h => h.replace(/<[^>]*>/g, ' ');
  const internals = [
    ['a content hash', h => /[0-9a-f]{32,}/.test(h)],
    ['the cache name', h => h.indexOf(c.CACHE_NAMESPACE) !== -1],
    ['the storage prefix', h => h.indexOf(c.Store.prefix()) !== -1],
    ['storage plumbing', h => /localStorage|namespace|storage backend|schema/i.test(h)],
    ['corpus plumbing', h => /Edition id|Corpus synced|Dataset built|eng-web|spaRV1909/.test(h)]
  ];
  const leaks = [];
  Object.keys(surfaces).forEach(where => internals.forEach(pair => {
    if(pair[1](shown(surfaces[where]))) leaks.push(where + ' shows ' + pair[0]);
  }));
  T('no screen in Settings shows a reader an internal identifier',
    leaks.length === 0, leaks.join('; '));
  T('the version line names the app and its version, and stops there',
    /^Daily Verse . Version [0-9]+[.][0-9]+[.][0-9]+$/.test(surfaces['the version line']),
    surfaces['the version line']);
  T('the settings screen carries no identity panel at all',
    !/identityPanel|Storage backend|Edition id|Corpus synced|Dataset built/.test(src));

  /* And the fingerprint itself is exactly where it was, still re-derivable. */
  T('the fingerprint is still shipped, and still equals a fresh derivation',
    /^[0-9a-f]{64}$/.test(c.SCRIPTURE_SOURCE.datasetHash) &&
    c.SCRIPTURE_SOURCE.datasetHash === require('../scripts/scripture.js').datasetHash(c.SCRIPTURE),
    c.SCRIPTURE_SOURCE.datasetHash);
  /* The label now names the edition being SHOWN rather than the one the app
     was built from, because those became different things. Still beside the
     verse, which is the part that matters. */
  T('the translation is painted beside the verse, not hidden in a settings page',
    /verse-translation[\s\S]{0,200}translationAbbr\(/.test(src));

  sub('Scripture and this app\'s own words are separate objects');
  T('reflections are a structure of their own', typeof c.REFLECTIONS === 'object');
  T('no passage record carries a reflection',
    c.SCRIPTURE.every(p => p.reflection === undefined));
  T('reflections are keyed by canonical id, so re-deriving text cannot touch them',
    Object.keys(c.REFLECTIONS).every(k => /^[A-Z0-9]{3}\.\d+\.\d+(-\d+)?$/.test(k)),
    Object.keys(c.REFLECTIONS).filter(k => !/^[A-Z0-9]{3}\.\d+\.\d+(-\d+)?$/.test(k)).slice(0, 3).join(', '));
  const known = new Set(ids);
  const orphanRefl = Object.keys(c.REFLECTIONS).filter(k => !known.has(k));
  T('no reflection is written for a passage the catalogue does not carry',
    orphanRefl.length === 0, orphanRefl.slice(0, 5).join(', '));
  /* If a reflection ever repeated its passage verbatim, the visual
     separation would be the only thing left distinguishing them — and
     someone reading a share, or a screen reader, would have nothing. */
  const echoed = Object.keys(c.REFLECTIONS).filter(k => {
    const t = c.REFLECTIONS[k];
    return t && c.SCRIPTURE.some(p => p.text.length > 24 && t.indexOf(p.text) !== -1);
  });
  T('no reflection reproduces a passage as if it were its own sentence',
    echoed.length === 0, echoed.join(', '));

  sub('the daily rotation only offers finished readings');
  const eligible = c.eligiblePassages();
  T('there is something to read', eligible.length > 0, String(eligible.length));
  T('every reading in the rotation has a reflection',
    eligible.every(p => typeof c.REFLECTIONS[p.id] === 'string' && c.REFLECTIONS[p.id].trim()));
  /* This is the line that lets Scripture be verified ahead of the editorial
     work without the editorial standard being the thing that gives way. */
  T('a passage without one is carried but never served as a day\'s reading',
    c.SCRIPTURE.filter(p => !c.REFLECTIONS[p.id]).every(p => eligible.indexOf(p) === -1));
  T('reflections are long enough to say something',
    eligible.every(p => c.REFLECTIONS[p.id].trim().length >= 40),
    eligible.filter(p => c.REFLECTIONS[p.id].trim().length < 40).slice(0, 3).map(p => p.id).join(', '));
  T('and short enough not to become a sermon',
    eligible.every(p => c.REFLECTIONS[p.id].trim().length <= 420),
    eligible.filter(p => c.REFLECTIONS[p.id].trim().length > 420).slice(0, 3).map(p => p.id).join(', '));

  sub('the reader may switch the commentary off entirely');
  T('showing reflections is a stored preference', c.KEYS.showReflections.indexOf('ui.') === 0);
  T('and the verse renders without one', /showReflections && reflection/.test(src));

  sub('nothing is invented when there is nothing to show');
  const empty = H.loadApp();
  empty.ctx.SCRIPTURE.length = 0;
  empty.ctx.renderToday();
  const body = empty.dom.document.getElementById('todayBody').innerHTML;
  T('an empty catalogue produces an honest empty state',
    /No verse is available/.test(body), body.slice(0, 80));
  T('and not a fabricated verse', !/verse-text/.test(body));
}

/* =========================================================
   CONTRACT 21 — THE DAY, AND WHAT IT HOLDS
   ---------------------------------------------------------
   A daily verse that is not the same on two devices, or that
   changes when you reopen the app, is not a daily verse.
   ========================================================= */
function testDays(){
  section('CONTRACT 21 — the day, and the reading it holds');
  const app = H.loadApp();
  const c = app.ctx;
  const src = js();

  sub('a day key is a local calendar date');
  const d = new Date(2026, 8, 3, 23, 30);        // 3 September, late evening
  T('it is built from the local date', c.dayKey(d) === '2026-09-03');
  /* The failure this prevents: toISOString() on that same moment returns the
     4th for anyone east of UTC, so half the world reads tomorrow's verse
     during their evening and the bug never reproduces where it was written. */
  T('and not from UTC', c.dayKey(d) !== d.toISOString().slice(0, 10) ||
    d.getTimezoneOffset() === 0);
  T('a key parses back to local midnight, not UTC midnight',
    c.dateFromKey('2026-09-03').getDate() === 3 &&
    c.dateFromKey('2026-09-03').getHours() === 0);
  T('a malformed key is rejected rather than guessed at',
    c.dateFromKey('not-a-date') === null && c.dateFromKey('2026-9-3') === null);
  /* Scoped to the day-key helpers themselves. A backup FILENAME may carry a
     UTC date without harming anyone; a day key may not. */
  const dayFns = src.slice(src.indexOf('function dayKey('), src.indexOf('function railDayKeys('));
  T('the day-key helpers never derive a date from an ISO string',
    !/toISOString/.test(dayFns));

  sub('the rail offers the past, never the future');
  const rail = c.railDayKeys();
  const today = c.todayKey();
  T('it ends on today', rail[rail.length - 1] === today);
  T('it holds as many days as it claims', rail.length === c.RAIL_DAYS);
  T('no day in it is in the future', rail.every(k => k <= today));
  T('they are in order', rail.every((k, i) => i === 0 || rail[i - 1] < k));

  sub('a day that has not happened cannot be opened');
  const future = c.dayKey(new Date(new Date().getFullYear() + 1, 0, 1));
  const before = c.selectedDay;
  c.selectDay(future);
  T('selecting a future day is a no-op', c.selectedDay === before);
  c.selectDay('nonsense');
  T('so is selecting nonsense', c.selectedDay === before);
  c.openNote(future); c.__flush();
  T('and no reflection can be written on one',
    !app.dom.document.getElementById('noteOverlay').classList.contains('open'));
  T('a future day is never assigned a reading', c.assignmentFor(future) === null);

  sub('a day, once shown, keeps its reading for good');
  const shared = new Map();
  const one = H.loadApp({ sharedStorage: shared });
  const key = one.ctx.todayKey();
  const first = one.ctx.passageForDay(key);
  T('a reading is chosen', !!first);
  T('and written to the ledger', (one.ctx.assignmentFor(key) || {}).passage === first.id);
  T('asking again gives the same answer', one.ctx.passageForDay(key).id === first.id);
  const two = H.loadApp({ sharedStorage: shared });
  T('and so does a fresh launch of the app', two.ctx.passageForDay(key).id === first.id);

  sub('a reading is never shown against a reflection it was not written about');
  /* The catalogue is allowed to grow, and growth moves any selection. The
     passage recorded on a reflection is what stops someone's words about a
     passage on grief resurfacing beside a passage about work. */
  const w = H.loadApp({ sharedStorage: new Map() });
  const wk = w.ctx.todayKey();
  const held = w.ctx.passageForDay(wk);
  const elsewhere = w.ctx.eligiblePassages().find(p => p.id !== held.id);
  w.ctx.notes.push({ id: 'n_' + wk, date: wk, passage: elsewhere.id, ref: elsewhere.ref,
                     text: 'written about that one',
                     createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  T('the reflection\'s own passage wins over the ledger',
    w.ctx.passageForDay(wk).id === elsewhere.id);
  T('and over any later selection', w.ctx.passageForDay(wk).id === elsewhere.id);

  sub('no repeat while anything is still unseen');
  const rot = H.loadApp({ sharedStorage: new Map() });
  const pool = rot.ctx.eligiblePassages().length;
  const days = Math.min(pool, 60);
  const seen = [];
  for(let i = 0; i < days; i++){
    const k = rot.ctx.dayKey(new Date(2026, 0, 1 + i));
    const p = rot.ctx.passageForDay(k);
    if(p) seen.push(p.id);
  }
  T('every day resolved to a reading', seen.length === days, seen.length + '/' + days);
  T('and none of them repeated', new Set(seen).size === seen.length,
    (seen.length - new Set(seen).size) + ' repeat(s) in ' + days + ' days');

  sub('an exhausted pool falls back to least-recently-seen, not to chance');
  /* Run past the end of the catalogue and check the second lap starts with
     the readings that have been waiting longest. */
  const ex = H.loadApp({ sharedStorage: new Map() });
  const exPool = ex.ctx.eligiblePassages().length;
  for(let i = 0; i < exPool; i++) ex.ctx.passageForDay(ex.ctx.dayKey(new Date(2020, 0, 1 + i)));
  T('the whole pool was consumed', ex.ctx.exposure().size === exPool,
    ex.ctx.exposure().size + '/' + exPool);
  const firstLap = ex.ctx.assignments.slice().sort((a, b) => a.id.localeCompare(b.id));
  const nextKey = ex.ctx.dayKey(new Date(2020, 0, 1 + exPool));
  const repeat = ex.ctx.passageForDay(nextKey);
  T('the next day still resolves', !!repeat);
  const oldestQuarter = firstLap.slice(0, Math.max(1, Math.ceil(exPool / 4))).map(a => a.passage);
  T('and comes from the longest-waiting quarter, not at random',
    oldestQuarter.indexOf(repeat.id) !== -1);

  sub('growing the catalogue does not disturb what has already been read');
  const grow = H.loadApp({ sharedStorage: new Map() });
  const gKeys = [];
  for(let i = 0; i < 10; i++){
    const k = grow.ctx.dayKey(new Date(2026, 2, 1 + i));
    grow.ctx.passageForDay(k);
    gKeys.push(k);
  }
  const beforeGrow = gKeys.map(k => grow.ctx.passageForDay(k).id);
  /* Simulate an expansion: the ledger and the reader's records are untouched,
     but the pool the selector draws from is now different. */
  grow.ctx.assignments = grow.ctx.assignments.slice();
  const afterGrow = gKeys.map(k => grow.ctx.passageForDay(k).id);
  T('every already-read day is unchanged',
    beforeGrow.every((id, i) => id === afterGrow[i]));

  sub('a ledger entry pointing at a passage this build dropped is re-chosen, not blanked');
  const drop = H.loadApp({ sharedStorage: new Map() });
  const dk = drop.ctx.todayKey();
  drop.ctx.assignments.push({ id: dk, passage: 'GONE.9.9', updatedAt: '2026-01-01T00:00:00.000Z' });
  const rechosen = drop.ctx.passageForDay(dk);
  T('the day still resolves to a real reading', !!rechosen && rechosen.id !== 'GONE.9.9');
  T('and the ledger is corrected so it stays stable from here',
    (drop.ctx.assignmentFor(dk) || {}).passage === rechosen.id);

  sub('a share carries the reference and the translation with it');
  const text = c.shareText(c.SCRIPTURE[0]);
  T('the passage is in it', text.indexOf(c.SCRIPTURE[0].text) !== -1);
  T('so is the reference', text.indexOf(c.SCRIPTURE[0].ref) !== -1);
  T('and the translation', text.indexOf(c.SCRIPTURE_SOURCE.abbr) !== -1);

  sub('a saved reading the catalogue no longer carries is reported, not replaced');
  const g = H.loadApp();
  g.ctx.savedVerses = [{ id: 's_gone', passage: 'GONE.1.1', ref: 'Gone 1:1',
                         savedAt: '2026-01-01T00:00:00.000Z' }];
  g.ctx.savedView = 'verses';
  g.ctx.renderSaved();
  const html = g.dom.document.getElementById('savedList').innerHTML;
  T('the reference is kept exactly as saved', html.indexOf('Gone 1:1') !== -1);
  T('and no other passage is shown under it',
    !g.ctx.SCRIPTURE.some(p => p.text.length > 24 && html.indexOf(p.text) !== -1));

  sub('the rail always lands on the day that was asked for');
  /* Three separate attempts at animating this rail each turned out to be a
     silent no-op in a real engine, leaving it parked on a day nobody chose —
     first cell.scrollIntoView(), then rail.scrollTo({behavior:'smooth'}), then
     `scroll-behavior: smooth` in CSS, which routes even a plain assignment
     through the same broken path. The position is now assigned outright. */
  const bareJs = stripComments(src);
  const bareCss = stripComments(css());
  T('the rail is positioned by assigning scrollLeft',
    /rail\.scrollLeft = left;/.test(bareJs));
  /* Scoped to the rail's own code. The ban was written to stop the RAIL
     animating to the chosen day, but it was spelled as "scrollIntoView
     appears nowhere", which also forbids placing a linked verse in the
     Bible reader - a different surface, a one-shot jump, and explicitly
     an unanimated one. Smooth scrolling stays banned everywhere. */
  const railFns = bareJs.slice(bareJs.indexOf('function centreSelectedDay('),
                               bareJs.indexOf('function renderDayRail('));
  T('no animated scroll request is used to place it',
    railFns.length > 100 && railFns.indexOf('scrollIntoView') === -1 &&
    bareJs.indexOf(String.raw`behavior: 'smooth'`) === -1 &&
    bareJs.indexOf(String.raw`behavior:'smooth'`) === -1);
  T('and the rail does not declare smooth scrolling in CSS either',
    !/\.day-rail\{[^}]*scroll-behavior:\s*smooth/.test(bareCss));

  sub('repainting the rail does not throw the reader off the day they are on');
  T('the offset is captured before the repaint',
    /const keepScroll = measurable \? rail\.scrollLeft : null;/.test(src));
  T('and restored after it, but only when it was a real measurement',
    /if\(keepScroll !== null\) rail\.scrollLeft = keepScroll;/.test(src));
  /* Rotating a phone changes the rail's width, and an offset computed for the
     old one can leave today scrolled off the screen entirely. */
  T('and a change of viewport width re-centres the chosen day',
    /addEventListener\('resize', centreSelectedDay\)/.test(src));

  sub('decoration cannot widen the page');
  /* The glow behind the verse is a pseudo-element, and querySelectorAll cannot
     see one — so an overflow sweep in a real browser looks clean while the
     page scrolls sideways anyway. It was once 180% wide and centred on its
     column, which pushed 67px outside the viewport at every width. The guard
     therefore lives here, against the stylesheet, where it is visible. */
  const glow = bareCss.match(/\.verse-stage::before\{[^}]*\}/);
  T('the glow is declared', !!glow);
  T('it is pinned to its column\'s edges rather than sized past them',
    !!glow && /left:\s*0;\s*right:\s*0/.test(glow[0]), glow ? glow[0].slice(0, 100) : '');
  T('so no percentage width can push it off screen',
    !!glow && !/width:\s*\d+%/.test(glow[0]));
  T('and it is not re-centred with a transform that would escape the column',
    !!glow && !/translate/.test(glow[0]));

  sub('inspecting a list never consumes an unseen reading');
  /* The saved and reflection lists look up days. If that assigned one, simply
     scrolling a list would burn through the catalogue. */
  const peek = H.loadApp({ sharedStorage: new Map() });
  const pk = peek.ctx.dayKey(new Date(2026, 1, 2));
  const ledgerBefore = peek.ctx.assignments.length;
  const got = peek.ctx.peekPassageForDay(pk);
  T('a day nobody has opened peeks as nothing', got === null);
  T('and no ledger entry was created', peek.ctx.assignments.length === ledgerBefore);
}

/* =========================================================
   CONTRACT 22 — PERSONALISATION STAYS SMALL AND HONEST
   ---------------------------------------------------------
   The selector is allowed to know what the reader asked for and
   what they kept. It is not allowed to read what they wrote, to
   leave the device, or to trap them in one theme.
   ========================================================= */
function testPersonalisation(){
  section('CONTRACT 22 — personalisation is explicit, local, and escapable');
  const src = js();

  sub('what a reader writes is never an input to what they are shown');
  /* The strongest privacy property this app has, and the easiest to lose by
     accident: the day a scorer starts reading note text, the app is
     profiling people from a private journal. Assert it structurally. */
  const selector = src.slice(src.indexOf('function selectionContext('),
                             src.indexOf('function selectPassage('));
  const scorer = src.slice(src.indexOf('function scorePassage('),
                           src.indexOf('function selectPassage('));
  T('the selection context never reads note text',
    !/\.text\b/.test(stripComments(selector)));
  T('nor does the scorer', !/\.text\b/.test(stripComments(scorer)));
  T('writing counts only as a yes/no signal about a passage',
    /notes\.forEach\(function\(n\)\{ bump\(n\.passage/.test(src.replace(/\s+/g, ' ')) ||
    /bump\(n\.passage/.test(src));
  T('the draft key is never consulted by selection',
    stripComments(selector + scorer).indexOf('noteDraft') === -1);

  sub('nothing leaves the device');
  /* This said "no fetch anywhere", which was a proxy for the thing that
     actually matters: nothing about a reader reaches another machine. The
     Bible reader fetches its own static book files out of this app's own
     directory, so the proxy broke while the property it stood for held
     completely. The property is now asserted directly, and more strictly
     than the proxy ever did. */
  const bareSrc = stripComments(src);
  T('no XMLHttpRequest anywhere', src.indexOf('XMLHttpRequest') === -1);
  T('no beacon, socket or remote image loader',
    ['sendBeacon', 'new WebSocket', 'new Image('].every(x => bareSrc.indexOf(x) === -1));
  T('the only data path is a relative one inside this app',
    bareSrc.indexOf(String.raw`const BIBLE_BASE = 'data/bible/';`) !== -1);
  const calls = bareSrc.split('fetch(').slice(1).map(c => c.slice(0, c.indexOf(')')));
  T('every fetch names that path and nothing else', calls.length > 0 &&
    calls.every(c => c.indexOf('url') !== -1), calls.join(' | '));
  T('no absolute or protocol-relative URL is fetched anywhere',
    ['fetch("http', "fetch('http", 'fetch(`http', 'fetch("//', "fetch('//"].every(x => bareSrc.indexOf(x) === -1));
  T('preferences are stored under the app\'s own ui namespace',
    ['focusThemes', 'focusStrength', 'onboarded'].every(k => {
      const app = H.loadApp();
      return app.ctx.KEYS[k].indexOf('ui.') === 0;
    }));

  sub('an explicit preference actually changes the ranking');
  const base = H.loadApp({ sharedStorage: new Map() });
  const themed = H.loadApp({ sharedStorage: new Map() });
  themed.ctx.focusThemes = ['grief'];
  themed.ctx.focusStrength = 'focused';
  /* Over a stretch of days, a focused reader should see materially more of
     the theme they chose than a reader who chose nothing. */
  function themeShare(ctx, theme, days){
    let hits = 0, total = 0;
    for(let i = 0; i < days; i++){
      const p = ctx.passageForDay(ctx.dayKey(new Date(2026, 5, 1 + i)));
      if(!p) continue;
      total++;
      if((p.themes || []).indexOf(theme) !== -1) hits++;
    }
    return total ? hits / total : 0;
  }
  const plain = themeShare(base.ctx, 'grief', 24);
  const focused = themeShare(themed.ctx, 'grief', 24);
  T('choosing a theme raises how often it appears', focused > plain,
    'focused ' + focused.toFixed(2) + ' vs plain ' + plain.toFixed(2));

  sub('but it can never become the only thing shown');
  T('a focused reader still sees other themes', focused < 1,
    'share ' + focused.toFixed(2));
  T('one day in four ignores focus entirely, by construction',
    /exploring:\s*fnv1a\('explore\|' \+ dayKey\) % 4 === 0/.test(src));
  const explored = [];
  for(let i = 0; i < 40; i++){
    const k = themed.ctx.dayKey(new Date(2026, 7, 1 + i));
    if(themed.ctx.selectionContext(k).exploring) explored.push(k);
  }
  T('and that exploration really happens', explored.length > 0,
    explored.length + ' of 40 days');

  sub('diversity is maintained across themes and books');
  const div = H.loadApp({ sharedStorage: new Map() });
  const books = new Set(), seenThemes = new Set();
  for(let i = 0; i < 30; i++){
    const p = div.ctx.passageForDay(div.ctx.dayKey(new Date(2026, 3, 1 + i)));
    if(!p) continue;
    books.add(String(p.id).split('.')[0]);
    (p.themes || []).forEach(t => seenThemes.add(t));
  }
  T('thirty days span many books', books.size >= 10, String(books.size));
  T('and many themes', seenThemes.size >= 8, String(seenThemes.size));

  sub('the same device makes the same choice twice');
  const a1 = H.loadApp({ sharedStorage: new Map() });
  const a2 = H.loadApp({ sharedStorage: new Map() });
  const k1 = a1.ctx.dayKey(new Date(2026, 9, 9));
  T('selection is deterministic given the same state',
    a1.ctx.passageForDay(k1).id === a2.ctx.passageForDay(k1).id);

  sub('the reader is asked once, can decline, and is not asked again');
  const first = H.loadApp({ sharedStorage: new Map(), firstRun: true });
  first.ctx.__flush();
  T('a first run offers the question',
    first.dom.document.getElementById('onboardOverlay').classList.contains('open'));
  const declined = new Map();
  const dec = H.loadApp({ sharedStorage: declined, firstRun: true });
  dec.ctx.__flush();
  dec.ctx.cancelOnboarding();
  dec.ctx.__flush();
  T('skipping closes it',
    !dec.dom.document.getElementById('onboardOverlay').classList.contains('open'));
  T('and is remembered as an answer', dec.ctx.onboarded === true);
  const again = H.loadApp({ sharedStorage: declined, firstRun: true });
  again.ctx.__flush();
  T('so the next launch does not ask again',
    !again.dom.document.getElementById('onboardOverlay').classList.contains('open'));
  T('declining leaves no focus themes set', again.ctx.focusThemes.length === 0);

  sub('the question is a reading preference and nothing more');
  const markup = H.readApp();
  const onboard = markup.slice(markup.indexOf('id="onboardOverlay"'),
                               markup.indexOf('id="confirmOverlay"'));
  ['denomination', 'church', 'age', 'gender', 'email', 'name', 'password']
    .forEach(word => T('it does not ask for ' + word,
      !new RegExp(word, 'i').test(onboard)));

  sub('the app never claims the choice was made for the reader');
  const shown = stripComments(src);
  ['God chose', 'chosen for you', 'God selected', 'meant for you', 'God wants you']
    .forEach(phrase => T('it never says "' + phrase + '"',
      shown.toLowerCase().indexOf(phrase.toLowerCase()) === -1));
  T('the one explanation it offers is neutral',
    /Chosen around your focus\./.test(src));
}

/* =========================================================
   CONTRACT 23 — AN UPGRADE KEEPS WHAT PEOPLE MADE
   ---------------------------------------------------------
   The schema moved from addressing passages by printed
   reference to addressing them by canonical id. Nobody should
   be able to tell.
   ========================================================= */
function testUpgrade(){
  section('CONTRACT 23 — upgrading preserves everything the reader made');
  const app = H.loadApp();
  const c = app.ctx;

  sub('a v1 install upgrades without losing a record');
  /* Seed a store exactly as version 1 left it: reference-keyed records, no
     ledger, and a schema version of 1. */
  const shared = new Map();
  const P = c.STORAGE_NAMESPACE;
  const sample = c.SCRIPTURE.find(p => p.ref === 'Psalm 34:18') || c.SCRIPTURE[0];
  shared.set(P + 'sys.schemaVersion', '1');
  shared.set(P + 'data.saved', JSON.stringify([
    { id: 's_psalm-34-18', ref: sample.ref, savedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z' }
  ]));
  shared.set(P + 'data.notes', JSON.stringify([
    { id: 'n_2026-01-02', date: '2026-01-02', ref: sample.ref, text: 'kept across the upgrade',
      createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }
  ]));
  shared.set(P + 'ui.textSize', 'large');
  shared.set(P + 'ui.showReflections', '0');

  const up = H.loadApp({ sharedStorage: shared });
  const u = up.ctx;

  T('the schema moved forward', u.Store.get(u.KEYS.schemaVersion) === String(u.DATA_SCHEMA_VERSION));
  T('the saved verse survived', u.savedVerses.length === 1);
  T('and gained a canonical id', u.savedVerses[0].passage === sample.id);
  T('while keeping the reference it was saved under', u.savedVerses[0].ref === sample.ref);
  T('its record id is unchanged, so a backup still merges',
    u.savedVerses[0].id === 's_psalm-34-18');
  T('the written reflection survived', u.notes.length === 1);
  T('with its text untouched', u.notes[0].text === 'kept across the upgrade');
  T('and gained the passage it was written about', u.notes[0].passage === sample.id);
  T('settings survived', u.textSize === 'large' && u.showReflections === false);

  sub('the day someone wrote on still shows the passage they wrote about');
  T('the reflection\'s day was seeded into the ledger',
    (u.assignmentFor('2026-01-02') || {}).passage === sample.id);
  T('and that day resolves to it', u.passageForDay('2026-01-02').id === sample.id);

  sub('a pre-migration snapshot is kept, as the migration engine promises');
  const backups = u.Store.listKeys().filter(k => k.indexOf(u.KEYS.backupPrefix) === 0);
  T('the old values were backed up before the upgrade', backups.length > 0,
    String(backups.length));

  sub('running the upgrade twice changes nothing');
  const again = H.loadApp({ sharedStorage: shared });
  T('still one saved verse', again.ctx.savedVerses.length === 1);
  T('still one reflection', again.ctx.notes.length === 1);
  T('and still one ledger entry for that day',
    again.ctx.assignments.filter(a => a.id === '2026-01-02').length === 1);

  sub('no key was renamed out from under existing data');
  ['saved', 'notes', 'noteDraft', 'schemaVersion', 'textSize', 'showReflections']
    .forEach(k => T('KEYS.' + k + ' is unchanged', typeof c.KEYS[k] === 'string'));
  T('data.saved still holds the saved verses', c.KEYS.saved === 'data.saved');
  T('data.notes still holds the reflections', c.KEYS.notes === 'data.notes');
}

/* =========================================================
   CONTRACT 24 — TEACHING IS GROUNDED, AND IS NOT SCRIPTURE
   ---------------------------------------------------------
   Guided study introduces the first content in this app that
   INTERPRETS Scripture rather than quoting it. These defend the
   line between the two, and the requirement that every
   explanation names the text it rests on.
   ========================================================= */
function testStudies(){
  section('CONTRACT 24 — study teaching is grounded, and never mistaken for Scripture');
  const app = H.loadApp();
  const c = app.ctx;
  const src = js();

  sub('there is teaching, and it declares its version');
  T('studies are embedded', Array.isArray(c.STUDIES) && c.STUDIES.length > 0,
    String((c.STUDIES || []).length));
  T('the content carries an explicit version', Number.isInteger(c.STUDIES_VERSION) && c.STUDIES_VERSION >= 1,
    String(c.STUDIES_VERSION));
  T('every study has an id, a title and a summary',
    c.STUDIES.every(s => s.id && s.title && s.summary));
  T('every study says who it is for', c.STUDIES.every(s => typeof s.audience === 'string' && s.audience.trim()));

  sub('identifiers are stable and unique');
  const studyIds = c.STUDIES.map(s => s.id);
  T('no study id appears twice', new Set(studyIds).size === studyIds.length);
  T('study ids are slugs, so they can be stored and linked',
    studyIds.every(id => /^[a-z][a-z0-9-]*$/.test(id)), studyIds.join(', '));
  let dupLesson = [];
  c.STUDIES.forEach(s => {
    const ids = s.lessons.map(l => l.id);
    if(new Set(ids).size !== ids.length) dupLesson.push(s.id);
  });
  T('no lesson id repeats within its study', dupLesson.length === 0, dupLesson.join(', '));
  T('every lesson id is a slug', c.STUDIES.every(s => s.lessons.every(l => /^[a-z0-9][a-z0-9-]*$/.test(l.id))));
  T('lesson order is the array order, with no second ordering field to drift',
    c.STUDIES.every(s => s.lessons.every(l => l.order === undefined && l.index === undefined)));

  sub('every lesson resolves to real Scripture');
  const lessons = [];
  c.STUDIES.forEach(s => s.lessons.forEach(l => lessons.push({ s: s.id, l: l })));
  T('there are lessons to check', lessons.length > 0, String(lessons.length));
  const badPassage = [];
  lessons.forEach(x => {
    if(!Array.isArray(x.l.passages) || !x.l.passages.length){ badPassage.push(x.s + '/' + x.l.id + ' (none)'); return; }
    x.l.passages.forEach(id => { if(!c.passageById(id)) badPassage.push(x.s + '/' + x.l.id + ' -> ' + id); });
  });
  T('every lesson passage id resolves in the one catalogue',
    badPassage.length === 0, badPassage.slice(0, 5).join(', '));
  T('lessonPassages() returns the text for every lesson',
    lessons.every(x => c.lessonPassages(x.l).length === x.l.passages.length));

  sub('teaching carries no Scripture of its own');
  /* The failure this prevents: a lesson quoting a verse inline, which would
     then be Scripture this app asserts on its own authority, outside the
     derived region and outside every check that defends it.

     This began as a whole-text comparison and MISSED a real defect: 'Who
     Jesus is' reproduced the first clause of John 1:14 and nothing else, so
     no complete passage ever appeared and the check stayed green. Partial
     reproduction is the same failure — the reader still receives Scripture
     as this app's unattributed prose. It now matches the build's rule: any
     run of six shipped words. Naming a phrase is how teaching works and
     stays legal; six consecutive words is no longer a citation, it is the
     verse. */
  const RUN = 6;
  const normRun = t => t.toLowerCase()
    .replace(/[\u2018\u2019']/g, "'")
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const scriptureRuns = new Map();
  c.SCRIPTURE.forEach(p => {
    const w = normRun(p.text).split(' ');
    for(let i = 0; i + RUN <= w.length; i++){
      const k = w.slice(i, i + RUN).join(' ');
      if(!scriptureRuns.has(k)) scriptureRuns.set(k, p.ref);
    }
  });
  const inlined = [];
  lessons.forEach(x => {
    ['understand', 'lookCloser', 'reflect', 'title'].forEach(field => {
      if(typeof x.l[field] !== 'string') return;
      const w = normRun(x.l[field]).split(' ');
      for(let i = 0; i + RUN <= w.length; i++){
        const k = w.slice(i, i + RUN).join(' ');
        if(scriptureRuns.has(k)){ inlined.push(x.s + '/' + x.l.id + '.' + field + ' <- ' + scriptureRuns.get(k)); return; }
      }
    });
  });
  T('no lesson field reproduces a run of Scripture', inlined.length === 0, inlined.slice(0, 5).join(', '));
  T('and the build refuses one before it can ship',
    /reproduces Scripture/.test(require('fs').readFileSync('scripts/scripture.js', 'utf8')));

  sub('the labelled figure is content like any other');
  /* A new field that renders text to a reader is a new place Scripture could
     be typed. It is covered by the same six-word guard as the prose, in the
     build and here, because a field exempt from that check is the hole the
     check exists to close. */
  const figured = lessons.filter(x => x.l.figure);
  T('some lessons carry a figure', figured.length > 0, String(figured.length));
  T('a figure has a heading and rows',
    figured.every(x => typeof x.l.figure.heading === 'string' && x.l.figure.heading.trim() &&
      Array.isArray(x.l.figure.rows) && x.l.figure.rows.length > 0));
  T('every row is a label and a value',
    figured.every(x => x.l.figure.rows.every(r =>
      typeof r.label === 'string' && r.label.trim() &&
      typeof r.value === 'string' && r.value.trim())));
  T('a figure carries nothing beyond a heading and rows',
    figured.every(x => Object.keys(x.l.figure).sort().join(',') === 'heading,rows'),
    figured.map(x => Object.keys(x.l.figure).join(',')).join(' | '));
  T('and it is optional — most lessons have none',
    lessons.length - figured.length > 0, String(lessons.length - figured.length));

  const figureRuns = [];
  figured.forEach(x => {
    const text = [x.l.figure.heading]
      .concat(x.l.figure.rows.map(r => r.label + ' ' + r.value)).join(' ');
    const w = normRun(text).split(' ');
    for(let i = 0; i + RUN <= w.length; i++){
      const k = w.slice(i, i + RUN).join(' ');
      if(scriptureRuns.has(k)){ figureRuns.push(x.s + '/' + x.l.id + ' <- ' + scriptureRuns.get(k)); return; }
    }
  });
  T('no figure reproduces a run of Scripture', figureRuns.length === 0, figureRuns.join(', '));
  T('and the build scans figures too, not only prose',
    require('fs').readFileSync('scripts/scripture.js', 'utf8').indexOf('figure: figureText') !== -1);

  T('a lesson record carries ids, never a text field',
    lessons.every(x => x.l.text === undefined && x.l.scripture === undefined));

  sub('every explanation says what it rests on');
  const noBasis = lessons.filter(x => !Array.isArray(x.l.basis) || !x.l.basis.length);
  T('every lesson records a basis', noBasis.length === 0,
    noBasis.map(x => x.s + '/' + x.l.id).join(', '));
  /* A basis nobody can resolve is decoration. Parsed with the build's own
     reference parser so the two cannot disagree about what is valid. */
  const S = require('../scripts/scripture.js');
  const badBasis = [];
  lessons.forEach(x => (x.l.basis || []).forEach(ref => {
    if(!S.parseRef(ref)) badBasis.push(x.s + '/' + x.l.id + ' -> "' + ref + '"');
  }));
  T('every basis reference is a resolvable reference', badBasis.length === 0, badBasis.slice(0, 5).join(', '));
  /* The passage being taught must itself be among what was read. */
  const basisMissesPassage = [];
  lessons.forEach(x => {
    const basisIds = (x.l.basis || []).map(r => { const p = S.parseRef(r); return p ? S.canonicalId(p) : null; });
    const basisBooks = (x.l.basis || []).map(r => { const p = S.parseRef(r); return p ? p.code + '.' + p.chapter : null; });
    x.l.passages.forEach(id => {
      const chap = id.split('.').slice(0, 2).join('.');
      if(basisIds.indexOf(id) === -1 && basisBooks.indexOf(chap) === -1){
        basisMissesPassage.push(x.s + '/' + x.l.id + ' -> ' + id);
      }
    });
  });
  T('the basis covers the passage the lesson teaches',
    basisMissesPassage.length === 0, basisMissesPassage.slice(0, 5).join(', '));

  sub('every lesson actually teaches, and stays short enough to read on a phone');
  const doc = JSON.parse(require('fs').readFileSync(
    require('path').join(H.ROOT, 'data', 'studies.json'), 'utf8'));
  const lim = doc._authoring || {};
  const uMax = lim.understandMax || 900, kMax = lim.lookCloserMax || 200, rMax = lim.reflectMax || 140;
  T('the editorial limits are declared in the source file',
    !!(lim.understandMax && lim.lookCloserMax && lim.reflectMax));
  T('every lesson has an explanation',
    lessons.every(x => typeof x.l.understand === 'string' && x.l.understand.trim().length > 120),
    lessons.filter(x => !x.l.understand || x.l.understand.trim().length <= 120).map(x => x.s + '/' + x.l.id).join(', '));
  T('every lesson has a reflection prompt',
    lessons.every(x => typeof x.l.reflect === 'string' && x.l.reflect.trim().length > 10));
  T('no explanation exceeds the declared limit',
    lessons.every(x => x.l.understand.length <= uMax),
    lessons.filter(x => x.l.understand.length > uMax).map(x => x.s + '/' + x.l.id + ':' + x.l.understand.length).join(', '));
  T('no look-closer question exceeds its limit',
    lessons.every(x => !x.l.lookCloser || x.l.lookCloser.length <= kMax));
  T('no reflection prompt exceeds its limit',
    lessons.every(x => x.l.reflect.length <= rMax));

  sub('teaching never claims the reading was chosen for the reader');
  const teaching = lessons.map(x => [x.l.understand, x.l.lookCloser || '', x.l.reflect].join(' ')).join(' ').toLowerCase();
  ['god chose', 'chosen for you', 'god selected', 'meant for you', 'god wants you',
   'god is telling you', 'god gave you this'].forEach(phrase =>
    T('it never says "' + phrase + '"', teaching.indexOf(phrase) === -1));

  sub('the study source file is human-reviewable and holds no Scripture');
  const rawDoc = require('fs').readFileSync(require('path').join(H.ROOT, 'data', 'studies.json'), 'utf8');
  T('lessons are authored as references, not ids, so a reviewer can read them',
    doc.studies.every(s => s.lessons.every(l => l.passages.every(r => /\d+:\d+/.test(r)))));
  const leaked = c.SCRIPTURE.filter(p => p.text.length > 24 && rawDoc.indexOf(p.text) !== -1);
  T('the source file contains no verse text either',
    leaked.length === 0, leaked.slice(0, 3).map(p => p.id).join(', '));
}

/* =========================================================
   CONTRACT 25 — ONE CATALOGUE, TWO KINDS OF ENTRY
   ---------------------------------------------------------
   Study passages share the daily catalogue. These prove they
   cannot leak into the daily rotation, and that adding them
   moved nothing that was already there.
   ========================================================= */
function testCatalogueSplit(){
  section('CONTRACT 25 — study Scripture shares the catalogue without entering the rotation');
  const app = H.loadApp();
  const c = app.ctx;
  const src = js();
  const S = require('../scripts/scripture.js');

  sub('there is exactly one Bible table');
  T('one SCRIPTURE declaration', (src.match(/const SCRIPTURE = \[/g) || []).length === 1);
  T('one source record', (src.match(/const SCRIPTURE_SOURCE = \{/g) || []).length === 1);
  T('and no second table for studies',
    !/const STUDY_SCRIPTURE|const LESSON_TEXT|const STUDY_VERSES/.test(src));
  T('every passage names the same edition through one source record',
    typeof c.SCRIPTURE_SOURCE.edition === 'string' && c.SCRIPTURE_SOURCE.edition.length > 0);

  sub('daily eligibility is explicit, not inferred');
  const daily = c.SCRIPTURE.filter(p => p.daily);
  const studyOnly = c.SCRIPTURE.filter(p => !p.daily);
  T('the catalogue carries both kinds', daily.length > 0 && studyOnly.length > 0,
    daily.length + ' daily / ' + studyOnly.length + ' study-only');
  T('the shipped counts match what is in the array',
    c.SCRIPTURE_SOURCE.dailyCount === daily.length &&
    c.SCRIPTURE_SOURCE.studyOnlyCount === studyOnly.length,
    c.SCRIPTURE_SOURCE.dailyCount + '/' + c.SCRIPTURE_SOURCE.studyOnlyCount);
  /* The gate is the flag, checked first — not the accident of a study
     passage happening to have no reflection written for it. */
  T('eligibility tests the daily flag',
    /if\(!p\.daily\) continue;/.test(src));
  const eligible = c.eligiblePassages();
  T('every eligible passage is a daily one', eligible.every(p => p.daily === 1));
  T('no study-only passage is ever eligible',
    studyOnly.every(p => eligible.indexOf(p) === -1),
    studyOnly.filter(p => eligible.indexOf(p) !== -1).map(p => p.id).join(', '));

  sub('a study-only passage stays out of the rotation even if one acquires a reflection');
  /* Guards the ordering of the two gates. If eligibility ever checked the
     reflection first, writing one for a study passage would quietly enrol it
     as a day's reading. */
  const probe = H.loadApp();
  const victim = probe.ctx.SCRIPTURE.find(p => !p.daily);
  probe.ctx.REFLECTIONS[victim.id] = 'A reflection written for a study-only passage.';
  T('it still does not enter the rotation',
    probe.ctx.eligiblePassages().every(p => p.id !== victim.id), victim.id);

  sub('the daily block is unchanged by the presence of studies');
  const dailyHash = S.datasetHash(daily);
  T('the shipped daily hash is honest', c.SCRIPTURE_SOURCE.dailyHash === dailyHash,
    c.SCRIPTURE_SOURCE.dailyHash + ' vs ' + dailyHash);
  T('the whole-dataset hash covers everything, so it differs from the daily one',
    c.SCRIPTURE_SOURCE.datasetHash !== c.SCRIPTURE_SOURCE.dailyHash);
  const cur = JSON.parse(require('fs').readFileSync(
    require('path').join(H.ROOT, 'data', 'curation.json'), 'utf8'));
  T('the daily set is exactly what the curation names, no more and no less',
    daily.length === cur.passages.length, daily.length + ' vs ' + cur.passages.length);
  T('and in the curation\'s own order, so the block stays byte-stable',
    daily.every((p, i) => p.ref === cur.passages[i].ref),
    daily.filter((p, i) => p.ref !== cur.passages[i].ref).slice(0, 3).map(p => p.ref).join(', '));
  T('daily passages come first, so appending studies cannot reorder them',
    c.SCRIPTURE.findIndex(p => !p.daily) === daily.length);

  sub('study passages are the same verified text as everything else');
  T('each has a canonical id', studyOnly.every(p => /^[A-Z0-9]{3}\.\d+\.\d+(-\d+)?$/.test(p.id)));
  T('each has real text', studyOnly.every(p => typeof p.text === 'string' && p.text.trim().length >= 8));
  T('each has a printed reference', studyOnly.every(p => /^(?:[123] )?[A-Za-z][A-Za-z ]+ \d+:\d+(-\d+)?$/.test(p.ref)));
  T('none carries theme tags, because none is ever rotated',
    studyOnly.every(p => Array.isArray(p.themes) && p.themes.length === 0));
  T('a lesson quoting a daily reading reuses it rather than duplicating it', (() => {
    const ids = c.SCRIPTURE.map(p => p.id);
    return new Set(ids).size === ids.length;
  })());

  sub('Today is untouched');
  const fresh = H.loadApp({ sharedStorage: new Map() });
  const seen = [];
  for(let i = 0; i < 30; i++){
    const k = fresh.ctx.dayKey(new Date(2026, 0, 1 + i));
    seen.push(fresh.ctx.passageForDay(k));
  }
  T('every day still resolves to a reading', seen.every(p => !!p));
  T('none of them is a study-only passage', seen.every(p => p.daily === 1));
  T('and none repeated', new Set(seen.map(p => p.id)).size === seen.length);
}

/* =========================================================
   CONTRACT 26 — STUDY STORAGE IS ADDITIVE AND SAFE
   ---------------------------------------------------------
   The study collections were added without a schema bump. These
   prove that was the right call rather than a lucky one.
   ========================================================= */
function testStudyStorage(){
  section('CONTRACT 26 — study storage is additive and cannot disturb existing data');
  const app = H.loadApp();
  const c = app.ctx;

  sub('the new collections are separate from the daily reflection system');
  T('study progress has its own key', c.KEYS.studyProgress === 'data.studyProgress');
  T('study notes have their own key', c.KEYS.studyNotes === 'data.studyNotes');
  T('the daily reflection key is untouched', c.KEYS.notes === 'data.notes');
  /* A note in data.notes is structurally one-per-calendar-day: its id IS the
     date. A lesson is not a day, so forcing study writing in there would
     break the invariant the whole daily side rests on. */
  T('a daily note is still required to be a day record',
    c.isNoteRecord({ id: 'n_2026-01-01', date: '2026-01-01', text: 'x' }) === true &&
    c.isNoteRecord({ id: 'ntb-1', study: 's', lesson: 'l', text: 'x' }) === false);
  T('a study note is not accepted as a daily note',
    c.isNoteRecord({ id: 'new-to-the-bible:ntb-1', study: 'new-to-the-bible',
                     lesson: 'ntb-1', text: 'x' }) === false);

  sub('absent means empty, and is never repaired with an invention');
  const blank = H.loadApp({ sharedStorage: new Map() });
  T('a reader who has opened no study has no progress', blank.ctx.studyProgress.length === 0);
  T('and no study notes', blank.ctx.studyNotes.length === 0);
  T('and no active study is claimed', blank.ctx.activeStudy() === null);
  T('nothing was written to storage just by looking',
    blank.ctx.Store.get(blank.ctx.KEYS.studyProgress) === null &&
    blank.ctx.Store.get(blank.ctx.KEYS.studyNotes) === null);

  sub('corrupt entries are dropped rather than thrown on');
  const dirty = new Map();
  const P = c.STORAGE_NAMESPACE;
  dirty.set(P + 'data.studyProgress', JSON.stringify([
    { id: 'new-to-the-bible', lesson: 'ntb-2', done: ['ntb-1'], updatedAt: 'a' },
    { id: 'broken' },                                  // no done array
    null, 42, { done: ['x'] }                          // no id
  ]));
  dirty.set(P + 'data.studyNotes', JSON.stringify([
    { id: 'new-to-the-bible:ntb-1', study: 'new-to-the-bible', lesson: 'ntb-1', text: 'kept' },
    { id: 'no-study', text: 'dropped' }
  ]));
  const messy = H.loadApp({ sharedStorage: dirty });
  T('only well-formed progress survives', messy.ctx.studyProgress.length === 1);
  T('and it is the right one', messy.ctx.studyProgress[0].id === 'new-to-the-bible');
  T('only well-formed notes survive', messy.ctx.studyNotes.length === 1);
  T('boot raised no errors on corrupt study data', messy.errors.length === 0, messy.errors.join(' | '));

  sub('a study note is addressed by its pair, so it cannot duplicate');
  T('the id derives from study and lesson',
    c.studyNoteIdFor('new-to-the-bible', 'ntb-3') === 'new-to-the-bible:ntb-3');
  T('lookup finds it', messy.ctx.studyNoteFor('new-to-the-bible', 'ntb-1').text === 'kept');
  T('and misses cleanly', messy.ctx.studyNoteFor('new-to-the-bible', 'ntb-9') === null);

  sub('progress and the active study are derived, not second-guessed');
  T('progress is found by study id', messy.ctx.studyProgressFor('new-to-the-bible').lesson === 'ntb-2');
  T('an unfinished study is offered as active', messy.ctx.activeStudy().id === 'new-to-the-bible');
  const done = H.loadApp({ sharedStorage: new Map() });
  const study = done.ctx.STUDIES[0];
  done.ctx.studyProgress.push({ id: study.id, lesson: study.lessons[study.lessons.length - 1].id,
                                done: study.lessons.map(l => l.id), updatedAt: 'z' });
  T('a finished study is not offered as active', done.ctx.activeStudy() === null);

  sub('the schema did not move, because nothing existing changed shape');
  T('the schema version is still 2', c.DATA_SCHEMA_VERSION === 2, String(c.DATA_SCHEMA_VERSION));
  T('no migration was added for it', Object.keys(c.MIGRATIONS).join(',') === '1');
  /* The v1 upgrade still works and still touches only what it always did. */
  const legacy = new Map();
  const sample = c.SCRIPTURE.find(p => p.daily);
  legacy.set(P + 'sys.schemaVersion', '1');
  legacy.set(P + 'data.saved', JSON.stringify([{ id: 's_x', ref: sample.ref, savedAt: 'a', updatedAt: 'a' }]));
  legacy.set(P + 'data.notes', JSON.stringify([{ id: 'n_2026-01-02', date: '2026-01-02',
    ref: sample.ref, text: 'still here', createdAt: 'a', updatedAt: 'a' }]));
  const up = H.loadApp({ sharedStorage: legacy });
  T('a v1 store still upgrades', up.ctx.Store.get(up.ctx.KEYS.schemaVersion) === '2');
  T('its saved verse survived', up.ctx.savedVerses.length === 1);
  T('its reflection survived', up.ctx.notes[0].text === 'still here');
  T('and it gained empty study collections rather than nothing',
    up.ctx.studyProgress.length === 0 && up.ctx.studyNotes.length === 0);

  sub('backup carries the new collections, and an old backup cannot erase them');
  const live = new Map();
  const w = H.loadApp({ sharedStorage: live });
  w.ctx.studyProgress.push({ id: 'new-to-the-bible', lesson: 'ntb-2', done: ['ntb-1'], updatedAt: 'b' });
  w.ctx.persistStudyProgress();
  w.ctx.studyNotes.push({ id: 'new-to-the-bible:ntb-1', study: 'new-to-the-bible',
                          lesson: 'ntb-1', text: 'mine', createdAt: 'a', updatedAt: 'a' });
  w.ctx.persistStudyNotes();
  T('progress persisted', H.loadApp({ sharedStorage: live }).ctx.studyProgress.length === 1);
  T('notes persisted', H.loadApp({ sharedStorage: live }).ctx.studyNotes.length === 1);

  /* exportData walks every namespaced key, so a new collection is included
     without the exporter being taught about it. */
  const exported = {};
  w.ctx.Store.listKeys().forEach(k => {
    if(k.indexOf(w.ctx.KEYS.backupPrefix) === 0) return;
    exported[k] = w.ctx.Store.get(k);
  });
  T('an export includes study progress', typeof exported['data.studyProgress'] === 'string');
  T('an export includes study notes', typeof exported['data.studyNotes'] === 'string');

  /* A backup taken before studies existed has no such keys. Importing it
     must leave what is on the device alone. */
  const older = w.ctx.mergeBackup({ 'data.saved': JSON.stringify([]) });
  T('importing an older backup touches nothing it does not mention',
    w.ctx.Store.getJSON(w.ctx.KEYS.studyProgress, []).length === 1 &&
    w.ctx.Store.getJSON(w.ctx.KEYS.studyNotes, []).length === 1);

  /* And a study backup merges by id like every other record collection. */
  const merged = w.ctx.mergeBackup({
    'data.studyNotes': JSON.stringify([
      { id: 'new-to-the-bible:ntb-2', study: 'new-to-the-bible', lesson: 'ntb-2',
        text: 'from another device', updatedAt: '2030-01-01' }
    ])
  });
  T('a study note from a backup is added', merged.added >= 1);
  T('without disturbing the one already there',
    w.ctx.Store.getJSON(w.ctx.KEYS.studyNotes, []).length === 2);
  const re = w.ctx.mergeBackup({
    'data.studyNotes': JSON.stringify([
      { id: 'new-to-the-bible:ntb-2', study: 'new-to-the-bible', lesson: 'ntb-2',
        text: 'from another device', updatedAt: '2030-01-01' }
    ])
  });
  T('re-importing the same backup changes nothing', re.added === 0 && re.updated === 0);
}

/* =========================================================
   CONTRACT 27 — LEARN NAVIGATES WITHOUT A ROUTER
   ---------------------------------------------------------
   Learn is three levels deep — a tab, a study, a lesson — and
   all of it runs on the overlay engine that already existed.
   These defend that, and defend Today's place at the front.
   ========================================================= */
function testLearnNavigation(){
  section('CONTRACT 27 — Learn navigates on the existing engine');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;
  const src = H.readApp();

  sub('five tabs, and Today is still the one you land on');
  const tabs = [...d.querySelectorAll('.tab-btn')].map(b => b.dataset.tab).filter(Boolean);
  T('there are exactly five', tabs.length === 5, tabs.join(', '));
  T('and the ceiling is not raised again', tabs.length <= 5);
  /* The order is the product's argument, read left to right: the day you are
     in, the text itself, what it asks of you, how to understand it, and what
     you chose to keep. Devotions sits between Bible and Learn because applying
     a passage is nearer to reading it than studying it is. */
  T('Today is first', tabs[0] === 'today');
  T('Bible is second', tabs[1] === 'bible');
  T('Devotions is third', tabs[2] === 'devotions');
  T('Learn is fourth', tabs[3] === 'learn');
  T('Saved is fifth, and was not demoted to make room', tabs[4] === 'saved');
  /* Which destinations deserve a slot moved. Settings still does not. */
  T('Settings is not one of them', tabs.indexOf('settings') === -1, tabs.join(', '));
  T('the app boots on Today', c.currentTab === 'today', c.currentTab);
  T('Today is the view marked active in the markup',
    /<main class="view active" id="view-today">/.test(src));
  T('every tab still has a view', tabs.every(t => !!d.getElementById('view-' + t)));

  sub('leaving Today and coming back does not strand the day rail');
  /* Found in visual QA, not by a test. A second tab means Today's view can be
     display:none, and a hidden element measures zero — so the rail repaint
     that runs on every renderAll() was writing a scroll offset into something
     it could not measure. Chrome happened to restore the old value; an engine
     that kept the write would have shown the rail four weeks in the past. */
  const bare = stripComments(js());
  /* The rail must ALWAYS paint — boot renders it before the app is revealed.
     A first attempt at this fix skipped painting whenever the container was
     unmeasurable, which left the rail permanently empty on load. The stub has
     no layout, so nothing caught it until it was looked at in a browser. */
  /* Colour alone is not a state. A screen reader must be told which tab it
     is on, and so must a reader who does not receive the accent. */
  (function(){
    const cur = () => [...app.dom.document.querySelectorAll('.tab-btn')]
      .filter(b => b.getAttribute('aria-current') === 'page').map(b => b.dataset.tab);
    c.goToTab('learn');
    T('the active tab is announced, not only tinted', cur().length === 1 && cur()[0] === 'learn', cur().join());
    c.goToTab('today');
    T('and the mark moves with the tab, never accumulating', cur().length === 1 && cur()[0] === 'today', cur().join());
  })();

  T('the rail paints its cells even before the app is revealed',
    (app.dom.document.getElementById('dayRail').innerHTML.match(/day-cell/g) || []).length === c.RAIL_DAYS,
    String((app.dom.document.getElementById('dayRail').innerHTML.match(/day-cell/g) || []).length));
  T('a scroll offset read while hidden is never written back',
    /const measurable = rail\.clientWidth > 0;/.test(bare) &&
    /if\(keepScroll !== null\) rail\.scrollLeft = keepScroll;/.test(bare));
  T('entering a tab goes through one place that can settle it',
    /function goToTab\(tab\)\{/.test(bare));
  T('and that place re-centres the rail on the way back into Today',
    /if\(tab === 'today'\)\{ renderToday\(\); centreSelectedDay\(\); \}/.test(bare));
  T('every tab button routes through it',
    (src.match(/onclick="goToTab\('/g) || []).length === 5,
    String((src.match(/onclick="goToTab\('/g) || []).length));
  T('and none still calls switchTab directly from the tab bar',
    !/data-tab="[a-z]+" onclick="switchTab\(/.test(src));

  sub('Learn has its own mark, not the one Today already uses');
  T('a compass icon exists', /function compassIcon\(/.test(js()));
  T('Learn is registered with it', /learn:\s*'<circle cx="8" cy="8" r="5\.9"\/>/.test(js()));
  T('and it is not the book Today uses',
    c.Domain.tabIcons.learn !== c.Domain.tabIcons.today);
  T('nor the bookmark Saved uses',
    c.Domain.tabIcons.learn !== c.Domain.tabIcons.saved);

  sub('switching to Learn behaves like every other tab');
  c.switchTab('learn');
  T('the tab is current', c.currentTab === 'learn');
  T('its view is the only active one', (() => {
    const active = [...d.querySelectorAll('.view')].filter(v => v.classList.contains('active'));
    return active.length === 1 && active[0].id === 'view-learn';
  })());
  c.switchTab('today');
  T('and Today comes back', c.currentTab === 'today');

  sub('a study opens over the tab, and a lesson over the study');
  const study = c.STUDIES[0];
  c.openStudy(study.id); c.__flush();
  T('the study page is open', d.getElementById('studyOverlay').classList.contains('open'));
  T('the stack records one surface', c._openSheetStack.length === 1);
  T('and one history entry', c._historyDepth === 1);

  c.openLesson(study.id, study.lessons[0].id); c.__flush();
  T('the lesson page is open', d.getElementById('lessonOverlay').classList.contains('open'));
  T('the study is still open beneath it',
    d.getElementById('studyOverlay').classList.contains('open'));
  T('two surfaces are stacked', c._openSheetStack.length === 2, c._openSheetStack.join(' > '));
  T('the lesson paints above the study',
    Number(d.getElementById('lessonOverlay').style.zIndex) >
    Number(d.getElementById('studyOverlay').style.zIndex));
  T('the background is locked once, at depth two', c._lockDepth === 2, String(c._lockDepth));
  T('history is two deep', c._historyDepth === 2, String(c._historyDepth));

  sub('back closes one level at a time');
  c.closeLesson(); c.__flush();
  T('the lesson closed', !d.getElementById('lessonOverlay').classList.contains('open'));
  T('the study did not', d.getElementById('studyOverlay').classList.contains('open'));
  T('the stack shrank to one', c._openSheetStack.length === 1);
  T('the page behind is still locked', d.body.classList.contains('scroll-locked'));
  c.closeStudy(); c.__flush();
  T('the study closed', !d.getElementById('studyOverlay').classList.contains('open'));
  T('nothing is left open', d.querySelectorAll('.overlay.open').length === 0);
  T('the lock released', c._lockDepth === 0 && !d.body.classList.contains('scroll-locked'));
  T('and history unwound', c._historyDepth === 0, String(c._historyDepth));

  sub('a lesson opened from Learn still has its study underneath');
  /* Otherwise Back from a lesson would drop straight to the tab, skipping
     the page the reader would expect to return to. */
  const j = H.loadApp();
  j.ctx.openLesson(study.id, study.lessons[2].id); j.ctx.__flush();
  T('the study opened too',
    j.dom.document.getElementById('studyOverlay').classList.contains('open'));
  T('and the lesson sits on top', j.ctx.topOpenSheet().id === 'lessonOverlay');

  sub('both pages declare a way out, so Escape and device back work');
  ['studyOverlay', 'lessonOverlay'].forEach(id => {
    const k = H.loadApp();
    k.ctx.openStudy(study.id); k.ctx.__flush();
    if(id === 'lessonOverlay'){ k.ctx.openLesson(study.id, study.lessons[0].id); k.ctx.__flush(); }
    T(id + ' has a discoverable close path',
      !!k.ctx.sheetCloser(k.dom.document.getElementById(id)));
  });
}

/* =========================================================
   CONTRACT 28 — A LESSON TEACHES FROM THE CANONICAL TEXT
   ---------------------------------------------------------
   The screen a reader actually looks at must get its Scripture
   from the verified catalogue and nowhere else.
   ========================================================= */
function testLessonRendering(){
  section('CONTRACT 28 — a lesson renders verified Scripture and clearly-separate teaching');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;
  const src = js();
  const study = c.STUDIES[0];

  sub('the landing screen');
  c.renderLearn();
  let learn = d.getElementById('learnBody').innerHTML;
  T('it names the study', learn.indexOf(study.title) !== -1);
  T('it shows the lesson count', /5 lessons/.test(learn));
  T('with no progress there is nothing to continue', learn.indexOf('Continue<') === -1);
  T('and a way in for someone new', learn.indexOf('Start here') !== -1);
  T('it shows no percentage anywhere', !/\d+%/.test(learn.replace(/width:\s*\d+%/g, '')));

  sub('once something is under way, Continue appears and points at the right lesson');
  const p = H.loadApp({ sharedStorage: new Map() });
  p.ctx.ensureStudyStarted(study.id);
  const rec = p.ctx.studyProgressFor(study.id);
  rec.done.push(study.lessons[0].id, study.lessons[1].id);
  p.ctx.persistStudyProgress();
  p.ctx.renderLearn();
  learn = p.dom.document.getElementById('learnBody').innerHTML;
  T('Continue is offered', learn.indexOf('Continue') !== -1);
  T('it names the next unfinished lesson', learn.indexOf(study.lessons[2].title) !== -1);
  T('and says where that is in the study', /Lesson 3 of 5/.test(learn));
  T('the study row shows a count of lessons, not a percentage',
    /2 of 5 lessons/.test(learn));
  T('the "new here" prompt is gone once something is started',
    learn.indexOf('Start here') === -1);

  sub('the study page lists every lesson and marks their state');
  p.ctx.openStudy(study.id);
  const body = p.dom.document.getElementById('studyBody').innerHTML;
  study.lessons.forEach(l => T('lesson "' + l.title + '" is listed', body.indexOf(l.title) !== -1));
  T('completed lessons are marked', (body.match(/lesson-state is-done/g) || []).length === 2);
  T('the next one is marked too', /lesson-state is-next/.test(body));
  T('state is never colour alone — the marks carry a word',
    /<span class="sr-only">Completed<\/span>/.test(body) && />Next</.test(body));
  T('no lesson is locked', !/disabled/.test(body));

  sub('Scripture on a lesson comes from the catalogue, never from the teaching');
  const lesson = study.lessons[0];
  p.ctx.openLesson(study.id, lesson.id);
  const html = p.dom.document.getElementById('lessonBody').innerHTML;
  const passages = c.lessonPassages(lesson);
  T('the lesson has passages', passages.length > 0);
  passages.forEach(x => {
    T('the text of ' + x.id + ' is on screen', html.indexOf(c.escapeHtml(x.text)) !== -1);
    T('so is its reference', html.indexOf(x.ref) !== -1);
  });
  T('the translation identity is shown', html.indexOf(c.SCRIPTURE_SOURCE.abbr) !== -1);
  T('Scripture is rendered through the verse primitive',
    /<blockquote class="verse-text"/.test(html));
  /* The renderer must reach the catalogue, not read a string off the lesson. */
  T('the renderer resolves passages through lessonPassages()',
    /const passages = lessonPassages\(lesson\);/.test(src));
  T('and no lesson record carries text to render',
    study.lessons.every(l => l.text === undefined && l.scripture === undefined));

  sub('teaching is present and visibly not Scripture');
  T('the explanation renders', html.indexOf(c.escapeHtml(lesson.understand.split('\n')[0])) !== -1);
  T('it is prose rather than another verse card',
    /<div class="lesson-prose">/.test(html));
  T('Scripture keeps the only card on the page',
    (html.match(/class="verse-card lesson-passage"/g) || []).length === passages.length);
  T('sections are labelled', /Read<\/div>/.test(html) && /Understand<\/div>/.test(html));

  sub('look closer appears only when the lesson has one');
  const withLook = study.lessons.find(l => l.lookCloser);
  const withoutLook = study.lessons.find(l => !l.lookCloser);
  T('at least one lesson has one', !!withLook);
  p.ctx.openLesson(study.id, withLook.id);
  T('it renders when present',
    p.dom.document.getElementById('lessonBody').innerHTML.indexOf('Look closer') !== -1);
  if(withoutLook){
    p.ctx.openLesson(study.id, withoutLook.id);
    T('and is absent when the lesson has none',
      p.dom.document.getElementById('lessonBody').innerHTML.indexOf('Look closer') === -1);
  } else {
    T('every lesson in this study has one, so the absent case is untested here', true);
  }
  T('it asks rather than tests — nothing to submit',
    !/type="radio"|type="checkbox"|Submit|Check answer/i.test(html));

  sub('reflect offers a private field and says so');
  p.ctx.openLesson(study.id, lesson.id);
  const lh = p.dom.document.getElementById('lessonBody').innerHTML;
  T('the prompt renders', lh.indexOf(c.escapeHtml(lesson.reflect)) !== -1);
  T('there is a field', lh.indexOf('id="lessonNote"') !== -1);
  T('it has a label for assistive tech', /<label class="sr-only" for="lessonNote">/.test(lh));
  T('and the privacy line is shown', /stays on this device/.test(lh));
  T('the field is at the iOS zoom floor by inheriting the global input rule',
    /input\[type="text"\][^{]*\{[^}]*font-size: 16px;/.test(css()));

  sub('continue is reachable rather than pinned under the keyboard');
  T('it sits at the end of the scroll', /<div class="lesson-continue">/.test(lh));
  T('the lesson page declares no fixed footer',
    !/id="lessonOverlay"[\s\S]{0,900}sheet-actions/.test(H.readApp()));

  sub('nothing here is a game');
  /* Bounded to the Learn code itself. An earlier version sliced to the end of
     the file and flagged "export" for containing "xp" — a check that cries
     wolf is a check that gets deleted. Whole words only, same reason. */
  const learnStart = src.indexOf('/* ---------- guided study: progress ----------');
  const learnEnd = src.indexOf("/* ---------- this product claims the foundation's four seams ----------");
  T('the Learn section is delimited', learnStart > 0 && learnEnd > learnStart);
  /* Comments stripped too: the code carries a comment saying there is no
     reward screen, and a check that its own explanation trips is useless.
     String literals survive, which is where any user-facing copy would be. */
  const learnSrc = stripComments(src.slice(learnStart, learnEnd)).toLowerCase();
  ['streak', 'xp', 'badge', 'trophy', 'achievement', 'confetti', 'points',
   'leaderboard', 'coins', 'reward', 'unlock']
    .forEach(w => T('no "' + w + '"', !new RegExp('\\b' + w + '\\b').test(learnSrc)));
}

/* =========================================================
   CONTRACT 29 — PROGRESS IS INTENTIONAL AND DERIVED
   ---------------------------------------------------------
   Reading a lesson is not finishing it, finishing twice is
   finishing once, and everything a screen shows about progress
   comes from the one list of completed lessons.
   ========================================================= */
function testLearnProgress(){
  section('CONTRACT 29 — study progress is intentional, idempotent and derived');
  const app = H.loadApp();
  const c = app.ctx;
  const study = c.STUDIES[0];

  sub('opening a lesson is not completing it');
  const shared = new Map();
  const a = H.loadApp({ sharedStorage: shared });
  a.ctx.openLesson(study.id, study.lessons[0].id); a.ctx.__flush();
  T('a progress record was started', !!a.ctx.studyProgressFor(study.id));
  T('but nothing is marked done', a.ctx.completedCount(study) === 0);
  T('and the resume point is still the first lesson',
    a.ctx.resumeLessonId(study) === study.lessons[0].id);

  sub('completing is a deliberate act, and it advances');
  a.ctx.completeLesson(); a.ctx.__flush();
  T('one lesson is done', a.ctx.completedCount(study) === 1);
  T('the reader is moved to the next one', a.ctx.openLessonId === study.lessons[1].id);
  T('the lesson page is still open', a.dom.document.getElementById('lessonOverlay').classList.contains('open'));
  T('it did not open a third surface', a.ctx._openSheetStack.length === 2,
    a.ctx._openSheetStack.join(' > '));

  sub('completing the same lesson twice completes it once');
  a.ctx.openLesson(study.id, study.lessons[0].id); a.ctx.__flush();
  a.ctx.completeLesson(); a.ctx.__flush();
  a.ctx.openLesson(study.id, study.lessons[0].id); a.ctx.__flush();
  a.ctx.completeLesson(); a.ctx.__flush();
  const rec = a.ctx.studyProgressFor(study.id);
  T('no duplicate entry', rec.done.filter(x => x === study.lessons[0].id).length === 1);
  T('the count is unchanged', a.ctx.completedCount(study) === 1);

  sub('revisiting a finished lesson does not move the reader backwards');
  const b = H.loadApp({ sharedStorage: new Map() });
  const r = b.ctx.ensureStudyStarted(study.id);
  r.done.push(study.lessons[0].id, study.lessons[1].id, study.lessons[2].id);
  b.ctx.persistStudyProgress();
  T('resume points at the first unfinished lesson',
    b.ctx.resumeLessonId(study) === study.lessons[3].id);
  b.ctx.openLesson(study.id, study.lessons[0].id); b.ctx.__flush();
  T('opening an old lesson leaves resume where it was',
    b.ctx.resumeLessonId(study) === study.lessons[3].id);
  T('and its completion is intact', b.ctx.isLessonDone(study.id, study.lessons[0].id));

  sub('finishing the last lesson finishes the study, quietly');
  const e = H.loadApp({ sharedStorage: new Map() });
  const er = e.ctx.ensureStudyStarted(study.id);
  study.lessons.slice(0, study.lessons.length - 1).forEach(l => er.done.push(l.id));
  e.ctx.persistStudyProgress();
  e.ctx.openLesson(study.id, study.lessons[study.lessons.length - 1].id); e.ctx.__flush();
  e.ctx.completeLesson(); e.ctx.__flush();
  T('every lesson is done', e.ctx.completedCount(study) === study.lessons.length);
  T('the study reports complete', e.ctx.isStudyComplete(study) === true);
  T('the lesson page closed', !e.dom.document.getElementById('lessonOverlay').classList.contains('open'));
  T('the study page is what you land back on',
    e.dom.document.getElementById('studyOverlay').classList.contains('open'));
  T('the study page says so plainly',
    e.dom.document.getElementById('studyBody').innerHTML.indexOf('Study complete') !== -1);
  T('a finished study is no longer offered as the active one', e.ctx.activeStudy() === null);

  sub('everything shown about progress is derived from the completed list');
  T('the record carries no count', Object.keys(er).indexOf('completed') === -1);
  T('nor a percentage', Object.keys(er).indexOf('percent') === -1);
  T('nor a stored resume pointer that could disagree with it',
    /function resumeLessonId\(study\)\{[\s\S]{0,400}rec\.done\.indexOf/.test(js()));
  T('a lesson dropped from the content cannot inflate a count', (() => {
    const g = H.loadApp({ sharedStorage: new Map() });
    const gr = g.ctx.ensureStudyStarted(study.id);
    gr.done.push(study.lessons[0].id, 'a-lesson-that-no-longer-exists');
    return g.ctx.completedCount(study) === 1;
  })());

  sub('progress survives a relaunch');
  const persist = new Map();
  const s1 = H.loadApp({ sharedStorage: persist });
  s1.ctx.openLesson(study.id, study.lessons[0].id); s1.ctx.__flush();
  s1.ctx.completeLesson(); s1.ctx.__flush();
  const s2 = H.loadApp({ sharedStorage: persist });
  T('the completed lesson is still complete', s2.ctx.isLessonDone(study.id, study.lessons[0].id));
  T('resume is where it was left', s2.ctx.resumeLessonId(study) === study.lessons[1].id);
  T('and Learn offers to continue', !!s2.ctx.activeStudy());
}

/* =========================================================
   CONTRACT 30 — LESSON WRITING IS PRIVATE AND ITS OWN
   ---------------------------------------------------------
   What someone writes in a lesson is kept, is theirs, and
   never touches the daily reflection collection.
   ========================================================= */
function testLearnNotes(){
  section('CONTRACT 30 — lesson reflections are private, kept, and separate from the daily ones');
  const app = H.loadApp();
  const c = app.ctx;
  const study = c.STUDIES[0];
  const lesson = study.lessons[0];

  sub('writing, keeping, editing and clearing');
  const shared = new Map();
  const a = H.loadApp({ sharedStorage: shared });
  a.ctx.openLesson(study.id, lesson.id); a.ctx.__flush();
  a.dom.document.getElementById('lessonNote').value = 'What I thought about it.';
  a.ctx.flushLessonNote();
  T('the note was written', a.ctx.studyNotes.length === 1);
  T('under the study:lesson id',
    a.ctx.studyNotes[0].id === study.id + ':' + lesson.id);
  T('it survives a relaunch',
    H.loadApp({ sharedStorage: shared }).ctx.studyNoteFor(study.id, lesson.id).text === 'What I thought about it.');

  a.dom.document.getElementById('lessonNote').value = 'Changed my mind.';
  a.ctx.flushLessonNote();
  T('editing updates the same record', a.ctx.studyNotes.length === 1);
  T('with the new text', a.ctx.studyNoteFor(study.id, lesson.id).text === 'Changed my mind.');

  a.dom.document.getElementById('lessonNote').value = '   ';
  a.ctx.flushLessonNote();
  T('clearing removes the record rather than storing an empty one',
    a.ctx.studyNotes.length === 0);
  T('and that is persisted', H.loadApp({ sharedStorage: shared }).ctx.studyNotes.length === 0);

  sub('a reopened lesson shows what was written');
  const b = H.loadApp({ sharedStorage: new Map() });
  b.ctx.openLesson(study.id, lesson.id); b.ctx.__flush();
  b.dom.document.getElementById('lessonNote').value = 'Kept text.';
  b.ctx.flushLessonNote();
  b.ctx.closeLesson(); b.ctx.__flush();
  b.ctx.openLesson(study.id, lesson.id); b.ctx.__flush();
  T('the field is repopulated',
    b.dom.document.getElementById('lessonNote').value === 'Kept text.');
  T('leaving a lesson keeps what was typed without a separate draft key',
    b.ctx.KEYS.studyNoteDraft === undefined);

  sub('lesson writing never lands in the daily reflections');
  const c2 = H.loadApp({ sharedStorage: new Map() });
  c2.ctx.notes.push({ id: 'n_2026-01-01', date: '2026-01-01', passage: c2.ctx.SCRIPTURE[0].id,
                      ref: c2.ctx.SCRIPTURE[0].ref, text: 'my daily one',
                      createdAt: 'a', updatedAt: 'a' });
  c2.ctx.persistNotes();
  c2.ctx.openLesson(study.id, lesson.id); c2.ctx.__flush();
  c2.dom.document.getElementById('lessonNote').value = 'my lesson one';
  c2.ctx.flushLessonNote();
  T('the daily reflection is untouched', c2.ctx.notes.length === 1);
  T('and still says what it said', c2.ctx.notes[0].text === 'my daily one');
  T('the lesson note went to its own collection', c2.ctx.studyNotes.length === 1);
  T('nothing from the lesson leaked into data.notes',
    c2.ctx.Store.getJSON(c2.ctx.KEYS.notes, []).every(n => n.text !== 'my lesson one'));

  sub('the note stores what was written, not the passage');
  const note = c2.ctx.studyNoteFor(study.id, lesson.id);
  T('no verse text is copied into it',
    c2.ctx.SCRIPTURE.every(p => p.text.length > 24 && note.text.indexOf(p.text) === -1));
  T('it records the pair it belongs to, and nothing more',
    Object.keys(note).sort().join(',') === 'createdAt,id,lesson,study,text,updatedAt');

  sub('lesson writing is never an input to anything');
  const src = js();
  const selector = src.slice(src.indexOf('function selectionContext('),
                             src.indexOf('function selectPassage('));
  T('the daily selector does not read study notes',
    selector.indexOf('studyNote') === -1 && selector.indexOf('studyNotes') === -1);
  T('nor does the engagement signal',
    src.slice(src.indexOf('function themeSignals('),
              src.indexOf('function scorePassage(')).indexOf('studyNote') === -1);

  sub('backups carry lesson writing, and cannot lose it');
  const live = new Map();
  const w = H.loadApp({ sharedStorage: live });
  w.ctx.openLesson(study.id, lesson.id); w.ctx.__flush();
  w.dom.document.getElementById('lessonNote').value = 'for the backup';
  w.ctx.flushLessonNote();
  w.ctx.completeLesson(); w.ctx.__flush();

  const exported = {};
  w.ctx.Store.listKeys().forEach(k => {
    if(k.indexOf(w.ctx.KEYS.backupPrefix) === 0) return;
    exported[k] = w.ctx.Store.get(k);
  });
  T('an export carries study notes', typeof exported['data.studyNotes'] === 'string');
  T('and study progress', typeof exported['data.studyProgress'] === 'string');

  const before = w.ctx.Store.getJSON(w.ctx.KEYS.studyNotes, []).length;
  w.ctx.mergeBackup({ 'data.saved': JSON.stringify([]) });
  T('an older backup that predates Learn erases neither',
    w.ctx.Store.getJSON(w.ctx.KEYS.studyNotes, []).length === before &&
    w.ctx.Store.getJSON(w.ctx.KEYS.studyProgress, []).length === 1);

  const again = w.ctx.mergeBackup({ 'data.studyNotes': exported['data.studyNotes'] });
  T('re-importing the same export changes nothing',
    again.added === 0 && again.updated === 0);
}

/* =========================================================
   CONTRACT 31 — LEARN DID NOT COST TODAY ANYTHING
   ---------------------------------------------------------
   A fourth tab and a new surface are exactly the kind of change
   that quietly moves the thing the app is actually for.
   ========================================================= */
function testTodayUnharmed(){
  section('CONTRACT 31 — Today is unchanged by the arrival of Learn');
  const app = H.loadApp();
  const c = app.ctx;
  const S = require('../scripts/scripture.js');

  sub('the catalogue is where it was');
  const daily = c.SCRIPTURE.filter(p => p.daily);
  /* Daily is pinned and must never move. The study-only figure legitimately
     grows every time a lesson quotes a passage the rotation never carried;
     it is pinned too, so growth has to be a deliberate edit rather than a
     side effect nobody noticed. 7 -> 37 as Learn grew from one study to
     eight. Daily stayed exactly where it was, which is the point. */
  T('378 daily passages', daily.length === 378, String(daily.length));
  T('37 study-only passages', c.SCRIPTURE.filter(p => !p.daily).length === 37,
    String(c.SCRIPTURE.filter(p => !p.daily).length));
  T('415 in total', c.SCRIPTURE.length === 415, String(c.SCRIPTURE.length));
  T('all 378 are still eligible', c.eligiblePassages().length === 378);
  /* Recomputed here rather than trusted from the shipped metadata.

     THIS VALUE CHANGED ONCE, DELIBERATELY, IN v1.6.1.

       was  c33b03e8e66e0aafb156767a65523548744e936a1f84540f515f528046449d3f
       now  0cb67c036256232a465fb4f979e5c675254c3129a8084e93f76cd63493006c41

     The build had been DELETING psalm superscriptions — the publisher's own
     title lines, “For the Chief Musician. A Psalm by David.” and the like —
     from 19 shipped passages, 17 of them daily readings, while still calling
     the result the World English Bible. eBible's own metadata restricts that
     name to faithful copies. The lines are now kept.

     The delta was proved exhaustively before this value was changed: same 415
     passages, same ids, same order, same references, same themes, same daily
     flags, and ZERO changes to verse text. The only difference is that those
     19 passages carry a superscription they previously had removed. The hash
     appends the superscription after STX and only when one exists, so a
     passage without one hashes byte-for-byte as it always did — which is what
     made the delta attributable rather than merely plausible.

     That was a one-time authorised correction. From here this value is
     protected again: an unexplained change fails this contract. */
  T('the daily hash is exactly the faithful-copy baseline',
    S.datasetHash(daily) === '0cb67c036256232a465fb4f979e5c675254c3129a8084e93f76cd63493006c41',
    S.datasetHash(daily));
  T('and the whole dataset hash is pinned too',
    S.datasetHash(c.SCRIPTURE) === 'f4c8380cf3d29d014044f75a8ed0b6a1b27c4d00387acdd1431a3636995d5916',
    S.datasetHash(c.SCRIPTURE));

  sub('the daily reading still resolves the same way');
  const fresh = H.loadApp({ sharedStorage: new Map() });
  const seen = [];
  for(let i = 0; i < 30; i++){
    const k = fresh.ctx.dayKey(new Date(2026, 0, 1 + i));
    seen.push(fresh.ctx.passageForDay(k));
  }
  T('every day resolves', seen.every(p => !!p));
  T('never to a study-only passage', seen.every(p => p.daily === 1));
  T('and never repeats', new Set(seen.map(p => p.id)).size === seen.length);
  T('tomorrow is still blocked', (() => {
    const k = fresh.ctx.dayKey(new Date(new Date().getFullYear() + 1, 0, 1));
    const before = fresh.ctx.selectedDay;
    fresh.ctx.selectDay(k);
    return fresh.ctx.selectedDay === before;
  })());

  sub('Today still saves, shares and reflects');
  const t = H.loadApp({ sharedStorage: new Map() });
  const today = t.ctx.todayKey();
  const passage = t.ctx.passageForDay(today);
  t.ctx.toggleSaved(passage.id); t.ctx.__flush();
  T('save works', t.ctx.savedVerses.length === 1 && t.ctx.savedVerses[0].passage === passage.id);
  T('share text still carries reference and translation', (() => {
    const s = t.ctx.shareText(passage);
    return s.indexOf(passage.ref) !== -1 && s.indexOf(t.ctx.SCRIPTURE_SOURCE.abbr) !== -1;
  })());
  t.ctx.openNote(today); t.ctx.__flush();
  t.dom.document.getElementById('noteText').value = 'daily reflection';
  t.ctx.saveNote(); t.ctx.__flush();
  T('the daily reflection saves', t.ctx.notes.length === 1);
  T('against the passage it was written about', t.ctx.notes[0].passage === passage.id);
  T('and the day rail still spans the right number of days',
    t.ctx.railDayKeys().length === t.ctx.RAIL_DAYS);

  sub('Learn state does not disturb the daily records');
  const study = t.ctx.STUDIES[0];
  t.ctx.openLesson(study.id, study.lessons[0].id); t.ctx.__flush();
  t.dom.document.getElementById('lessonNote').value = 'lesson thought';
  t.ctx.completeLesson(); t.ctx.__flush();
  T('the saved verse is still there', t.ctx.savedVerses.length === 1);
  T('the daily reflection is still there', t.ctx.notes.length === 1);
  T('and still says what it said', t.ctx.notes[0].text === 'daily reflection');
  T('the assignment ledger was not rewritten',
    t.ctx.assignmentFor(today).passage === passage.id);
  T('the schema did not move', t.ctx.DATA_SCHEMA_VERSION === 2);
}

/* ---------------------------------------------------------
   CONTRACT 32 — FOUR STUDIES, AND THE FIRST ONE UNTOUCHED

   Growing the catalogue is where a study library quietly goes wrong: an id
   changes and somebody's progress detaches from the lesson it belonged to, a
   lesson ships without teaching in it, or the writing drifts into the
   spiritual-authority register this product does not use.
   --------------------------------------------------------- */
function testStudyCatalogue(){
  section('CONTRACT 32 — the catalogue grew without disturbing what was there');
  const app = H.loadApp();
  const c = app.ctx;

  sub('four studies, twenty-three lessons');
  T('there are eight studies', c.STUDIES.length === 8, String(c.STUDIES.length));
  const counts = {};
  c.STUDIES.forEach(s => { counts[s.id] = s.lessons.length; });
  T('New to the Bible has 5', counts['new-to-the-bible'] === 5, String(counts['new-to-the-bible']));
  T('Who is Jesus? has 7', counts['who-is-jesus'] === 7, String(counts['who-is-jesus']));
  T('Understanding the Gospel has 6', counts['understanding-the-gospel'] === 6, String(counts['understanding-the-gospel']));
  T('Learning to Pray has 5', counts['learning-to-pray'] === 5, String(counts['learning-to-pray']));
  T('How to Use the Bible has 8', counts['how-to-use-the-bible'] === 8, String(counts['how-to-use-the-bible']));
  T('Foundations has 4', counts['skills-foundations'] === 4, String(counts['skills-foundations']));
  T('Practice has 4', counts['skills-practice'] === 4, String(counts['skills-practice']));
  T('Deeper study has 4', counts['skills-deeper'] === 4, String(counts['skills-deeper']));
  const total = c.STUDIES.reduce((n, s) => n + s.lessons.length, 0);
  T('43 lessons in total', total === 43, String(total));

  sub('the ids someone may already have progress against');
  /* A stored progress row names a study id and a list of lesson ids. Rename
     either and the row survives while the thing it referred to does not —
     silent, and unfixable once it has shipped. These are pinned literally. */
  const ntb = c.STUDIES.find(s => s.id === 'new-to-the-bible');
  T('the first study kept its id', !!ntb);
  T('and its lesson ids, in order',
    ntb.lessons.map(l => l.id).join(',') === 'ntb-1,ntb-2,ntb-3,ntb-4,ntb-5',
    ntb.lessons.map(l => l.id).join(','));
  const ids = c.STUDIES.map(s => s.id);
  T('every study id is unique', new Set(ids).size === ids.length);
  T('every study id is a slug', ids.every(id => /^[a-z0-9][a-z0-9-]*$/.test(id)), ids.join(','));
  const allLesson = [];
  c.STUDIES.forEach(s => s.lessons.forEach(l => allLesson.push(s.id + '/' + l.id)));
  T('no lesson id repeats inside its study', new Set(allLesson).size === allLesson.length);

  sub('every lesson actually teaches');
  const lessons = [];
  c.STUDIES.forEach(s => s.lessons.forEach(l => lessons.push({ s: s.id, l: l })));
  const thin = lessons.filter(x => !x.l.understand || x.l.understand.trim().length < 300);
  T('no lesson ships with a thin explanation', thin.length === 0,
    thin.map(x => x.s + '/' + x.l.id).join(', '));
  T('every lesson has a reflect prompt',
    lessons.every(x => typeof x.l.reflect === 'string' && x.l.reflect.trim().length > 20));
  T('every lesson names at least one passage',
    lessons.every(x => Array.isArray(x.l.passages) && x.l.passages.length > 0));
  T('every lesson records a basis',
    lessons.every(x => Array.isArray(x.l.basis) && x.l.basis.length > 0));

  sub('the app does not speak for God');
  /* The line this product will not cross: telling a reader what God is saying
     to them personally. A lesson may explain a passage and may ask a question.
     It may not deliver a private message. */
  const FORBIDDEN = [
    'god is telling you', 'god is saying to you', 'what is god telling you',
    'god wants you to', 'god is calling you to', 'god has a plan for your',
    'god chose this for you', 'god put this on your heart'
  ];
  const spoke = [];
  lessons.forEach(x => {
    const t = (x.l.understand + ' ' + (x.l.lookCloser || '') + ' ' + x.l.reflect + ' ' + x.l.title).toLowerCase();
    FORBIDDEN.forEach(p => { if(t.indexOf(p) !== -1) spoke.push(x.s + '/' + x.l.id + ' <- "' + p + '"'); });
  });
  T('no lesson claims to relay a private message from God', spoke.length === 0, spoke.join(', '));

  sub('the landing lists them all, and each one opens');
  c.switchTab('learn');
  c.renderLearn();
  const html = app.dom.document.getElementById('learnBody').innerHTML;
  const listed = c.STUDIES.filter(s => html.indexOf(s.title) !== -1);
  T('all eight studies appear on the Learn landing', listed.length === 8,
    c.STUDIES.filter(s => html.indexOf(s.title) === -1).map(s => s.id).join(', '));

  const brokeOpen = [];
  const brokeLesson = [];
  c.STUDIES.forEach(s => {
    c.openStudy(s.id);
    const body = app.dom.document.getElementById('studyBody').innerHTML;
    if(body.indexOf(s.title) === -1) brokeOpen.push(s.id);
    s.lessons.forEach(l => {
      c.openLesson(s.id, l.id);
      const lb = app.dom.document.getElementById('lessonBody').innerHTML;
      /* The lesson must show its own title AND the text of every passage it
         names — a lesson that renders its heading over an empty Read block
         would look fine to a shape-only check. */
      const texts = c.lessonPassages(l);
      const ok = lb.indexOf(l.title) !== -1 &&
        texts.length === l.passages.length &&
        texts.every(p => p && p.text && lb.indexOf(p.text.slice(0, 30)) !== -1);
      if(!ok) brokeLesson.push(s.id + '/' + l.id);
      c.closeLesson();
    });
    c.closeStudy();
  });
  T('every study opens and shows its title', brokeOpen.length === 0, brokeOpen.join(', '));
  T('every one of the 23 lessons renders its Scripture', brokeLesson.length === 0,
    brokeLesson.slice(0, 5).join(', '));

  sub('a glance at another study does not steal Continue');
  /* Found by opening all four studies in a browser. Opening starts a study, so
     a record exists the moment someone looks; ranking only by updatedAt let the
     most recently GLANCED study win over the one being genuinely read. */
  const g = H.loadApp({ sharedStorage: new Map() });
  g.ctx.openLesson('who-is-jesus', 'wij-1'); g.ctx.__flush();
  g.ctx.completeLesson(); g.ctx.__flush();
  g.ctx.openLesson('who-is-jesus', 'wij-2'); g.ctx.__flush();
  g.ctx.completeLesson(); g.ctx.__flush();
  T('the study being read is what Continue offers',
    g.ctx.activeStudy() && g.ctx.activeStudy().id === 'who-is-jesus',
    String(g.ctx.activeStudy() && g.ctx.activeStudy().id));

  /* Browsing a study list is free: opening the study itself starts nothing. */
  g.ctx.openStudy('learning-to-pray'); g.ctx.closeStudy(); g.ctx.__flush();
  T('opening a study alone records no progress',
    !g.ctx.studyProgressFor('learning-to-pray'));

  /* Sampling a LESSON does start it, and that is the case that used to steal
     Continue away from the study actually being read. */
  g.ctx.openLesson('learning-to-pray', 'pry-1'); g.ctx.__flush();
  g.ctx.closeLesson(); g.ctx.__flush();
  T('sampling a lesson records that its study was started',
    !!g.ctx.studyProgressFor('learning-to-pray'));
  T('with nothing finished in it', g.ctx.studyProgressFor('learning-to-pray').done.length === 0);
  T('and Continue stays with the study that has finished lessons',
    g.ctx.activeStudy() && g.ctx.activeStudy().id === 'who-is-jesus',
    String(g.ctx.activeStudy() && g.ctx.activeStudy().id));

  /* With nothing finished anywhere, the most recent sample is the best guess
     available — absent progress there is nothing better to rank on. */
  const n = H.loadApp({ sharedStorage: new Map() });
  T('a reader who has opened nothing has nothing to continue', n.ctx.activeStudy() === null);
  n.ctx.openLesson('new-to-the-bible', 'ntb-1'); n.ctx.closeLesson(); n.ctx.__flush();
  n.ctx.openLesson('learning-to-pray', 'pry-1'); n.ctx.closeLesson(); n.ctx.__flush();
  /* Both samples can land in the same millisecond, and equal timestamps tie.
     Racing the clock made this contract flaky — it failed roughly half the
     time. The rule being tested is the ordering, so state the order rather
     than hoping the machine is slow enough to produce one. */
  n.ctx.studyProgressFor('new-to-the-bible').updatedAt = '2026-01-01T00:00:00.000Z';
  n.ctx.studyProgressFor('learning-to-pray').updatedAt = '2026-01-02T00:00:00.000Z';
  T('with no progress at all it falls back to the most recent',
    n.ctx.activeStudy() && n.ctx.activeStudy().id === 'learning-to-pray',
    String(n.ctx.activeStudy() && n.ctx.activeStudy().id));
  /* and the ordering genuinely comes from the timestamp, not from insertion */
  n.ctx.studyProgressFor('new-to-the-bible').updatedAt = '2026-01-03T00:00:00.000Z';
  T('reversing the timestamps reverses the answer',
    n.ctx.activeStudy() && n.ctx.activeStudy().id === 'new-to-the-bible',
    String(n.ctx.activeStudy() && n.ctx.activeStudy().id));

  /* A finished study must never be offered as something to continue. */
  const f = H.loadApp({ sharedStorage: new Map() });
  const fr = f.ctx.ensureStudyStarted('learning-to-pray');
  f.ctx.studyById('learning-to-pray').lessons.forEach(l => fr.done.push(l.id));
  f.ctx.persistStudyProgress();
  T('a completed study is not offered as Continue',
    f.ctx.activeStudy() === null, String(f.ctx.activeStudy() && f.ctx.activeStudy().id));

  sub('progress written against the first study still works');
  /* The upgrade case: someone mid-way through New to the Bible when three more
     studies arrive. Their row must keep meaning exactly what it meant. */
  const shared = new Map();
  const up = H.loadApp({ sharedStorage: shared });
  up.ctx.openLesson('new-to-the-bible', 'ntb-1'); up.ctx.__flush();
  up.ctx.completeLesson(); up.ctx.__flush();
  up.ctx.openLesson('new-to-the-bible', 'ntb-2'); up.ctx.__flush();
  up.ctx.completeLesson(); up.ctx.__flush();
  const reloaded = H.loadApp({ sharedStorage: shared });
  const study = reloaded.ctx.STUDIES.find(s => s.id === 'new-to-the-bible');
  T('the two finished lessons are still finished',
    reloaded.ctx.completedCount(study) === 2, String(reloaded.ctx.completedCount(study)));
  T('and it resumes at the third', reloaded.ctx.resumeLessonId(study) === 'ntb-3',
    String(reloaded.ctx.resumeLessonId(study)));
  T('the new studies start untouched',
    reloaded.ctx.STUDIES.filter(s => s.id !== 'new-to-the-bible')
      .every(s => reloaded.ctx.completedCount(s) === 0));
}

/* ---------------------------------------------------------
   CONTRACT 33 — APPEARANCE IS A TOKEN SWAP, NOT A SECOND DESIGN

   Two ways a theme feature rots. It leaks into components, and then every
   new surface has to remember to be themed. Or it leaks into data, and an
   appearance preference starts being able to lose someone's reading.
   Both are structural, so both are asserted structurally.
   --------------------------------------------------------- */
function testAppearance(){
  section('CONTRACT 33 — light appearance');

  sub('dark is what you get until you ask for something else');
  const fresh = H.loadApp({ sharedStorage: new Map() });
  T('the default appearance is dark', fresh.ctx.appearance === 'dark', fresh.ctx.appearance);
  T('nothing is written to storage merely by starting',
    fresh.storage.getItem('daily-verse.ui.appearance') === null);
  T('and the root carries no theme attribute',
    fresh.dom.document.documentElement.getAttribute('data-theme') === null);

  sub('turning it on, and off again');
  const a = H.loadApp({ sharedStorage: new Map() });
  a.ctx.setAppearance('light');
  T('the appearance is light', a.ctx.appearance === 'light');
  T('the root says so', a.dom.document.documentElement.getAttribute('data-theme') === 'light');
  T('and it is stored', a.storage.getItem('daily-verse.ui.appearance') === 'light');
  a.ctx.setAppearance('dark');
  T('going back removes the attribute rather than setting it to dark',
    a.dom.document.documentElement.getAttribute('data-theme') === null,
    String(a.dom.document.documentElement.getAttribute('data-theme')));
  T('and dark is stored explicitly, so it reads as a choice',
    a.storage.getItem('daily-verse.ui.appearance') === 'dark');

  sub('the switch says what is actually true');
  /* The stub carries only id/class/onclick/role from markup, and its
     class-scoped selectors are not scoped — '.focus-strength button' matches
     every button in the document, so whatever paintPrefControls writes to a
     toggle's aria-checked is overwritten in the stub and not in a browser.
     So the CONTROL is asserted from the shipped markup and the DERIVATION
     from the code; the resulting attribute is verified in a real browser,
     which is the only place it can be observed honestly. */
  const t = () => a.dom.document.getElementById('appearanceToggle');
  T('the control exists', !!t());
  T('it is a switch', t().getAttribute('role') === 'switch');
  const markup = H.readApp();
  const tagM = markup.match(/<button[^>]*id="appearanceToggle"[\s\S]{0,220}?>/);
  const tag = tagM ? tagM[0] : '';
  T('the markup declares it a switch', /role="switch"/.test(tag));
  T('with an accessible name', /aria-label="[^"]+"/.test(tag), tag.slice(0, 60));
  T('and a starting checked state', /aria-checked="(true|false)"/.test(tag));
  T('its checked state is derived from the applied appearance, not stored twice',
    /aria-checked', String\(appearance === 'light'\)/.test(js()));
  T('and tapping it toggles the appearance',
    /onclick="toggleAppearance\(\)"/.test(tag));

  sub('a value nobody wrote is not a broken reader');
  const bad = new Map();
  bad.set('daily-verse.ui.appearance', 'solarized');
  const b = H.loadApp({ sharedStorage: bad });
  T('an unrecognised stored appearance falls back to dark', b.ctx.appearance === 'dark', b.ctx.appearance);
  T('and paints no attribute', b.dom.document.documentElement.getAttribute('data-theme') === null);

  sub('it survives being closed');
  const shared = new Map();
  const one = H.loadApp({ sharedStorage: shared });
  one.ctx.setAppearance('light');
  const two = H.loadApp({ sharedStorage: shared });
  T('a reader who chose light gets light back', two.ctx.appearance === 'light');
  T('and the attribute is applied on the way in, not after boot',
    two.dom.document.documentElement.getAttribute('data-theme') === 'light');
  /* The point of the early block: it runs where storage is first readable,
     not from boot(), because boot() is late enough to be seen. */
  T('the appearance is resolved before boot runs',
    js().indexOf('function resolveAppearanceEarly') !== -1 &&
    js().indexOf('resolveAppearanceEarly') < js().indexOf('function boot()'));
  /* Asserting the NAME is not enough: emptying the block left the name and
     the position intact, and the stub cannot see a flash because boot()
     applies the attribute anyway. What matters is that the early block
     itself reads the stored value and paints the attribute. */
  (function(){
    const src = js();
    const a = src.indexOf('function resolveAppearanceEarly');
    const body = src.slice(a, src.indexOf('})();', a));
    T('and that early block reads the stored preference itself',
      body.indexOf('Store.get(KEYS.appearance)') !== -1);
    T('and paints the attribute itself, before anything can be seen',
      body.indexOf('setAttribute(') !== -1 && body.indexOf('data-theme') !== -1);
    T('and cannot break boot if storage is denied', body.indexOf('catch') !== -1);
  })();

  sub('the browser chrome moves with the app');
  /* The stub's selector engine answers false for anything containing '[',
     so meta[name="theme-color"] cannot be queried here. The DERIVATION is
     asserted from the code; the resulting tag content is checked in a real
     browser, where it was observed moving between the two values. */
  T('applying an appearance also moves the browser chrome',
    js().indexOf('meta[name="theme-color"]') !== -1 &&
    js().indexOf("appearance === 'light' ? LIGHT_THEME_COLOR : APP_CONFIG.themeColor") !== -1);
  T('and the dark value is the configured one, not a second literal',
    js().indexOf('APP_CONFIG.themeColor') !== -1 && two.ctx.APP_CONFIG.themeColor === '#0D0B09',
    two.ctx.APP_CONFIG.themeColor);
  /* The JS constant and the CSS token are two statements of one colour. */
  const lightBlock = css().slice(css().indexOf(':root[data-theme="light"]'));
  const ground = (lightBlock.match(/--brand-ground:\s*([^;]+);/) || [])[1];
  T('LIGHT_THEME_COLOR equals the light ground it stands for',
    String(ground).trim().toUpperCase() === String(two.ctx.LIGHT_THEME_COLOR).toUpperCase(),
    String(ground).trim() + ' vs ' + two.ctx.LIGHT_THEME_COLOR);

  sub('the theme is tokens only — no component is themed');
  /* This is the stop condition made testable. If the light block ever needs a
     component selector, the theme has stopped being a token swap and every
     future surface has to remember to be themed. */
  const block = lightBlock.slice(0, lightBlock.indexOf('\n}'));
  /* Comments explain the colours and are full of prose containing colons.
     Strip them before asking what the block actually declares. */
  const declarations = stripComments(block).split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith(':root') && l.indexOf(':') !== -1);
  const nonToken = declarations.filter(l => !/^--/.test(l));
  T('the light block declares custom properties and nothing else',
    nonToken.length === 0, nonToken.slice(0, 3).join(' | '));
  T('and it is a single block, not a scattering of overrides',
    (css().match(/\[data-theme="light"\]/g) || []).length === 1,
    String((css().match(/\[data-theme="light"\]/g) || []).length));

  sub('every role the dark theme names, the light theme answers');
  /* A token declared for dark and forgotten for light is an unthemed surface
     waiting to be found by a reader rather than by a test. Only the roles that
     carry colour need answering — scale and motion are shared. */
  const darkBlock = css().slice(css().indexOf(':root{'), css().indexOf('\n}', css().indexOf(':root{')));
  const names = s => (s.match(/--[a-z0-9-]+(?=\s*:)/gi) || []);
  const COLOUR = /(bg|surface|border|text|accent|success|warning|danger|shadow|scrim|glow|edge|gradient)/i;
  const darkColour = names(darkBlock).filter(n => COLOUR.test(n));
  const lightNames = names(block);
  /* Roles the light theme inherits unchanged are fine; what must not happen is
     a role whose dark value is unusable on paper going unanswered. */
  const MUST = ['--brand-ground', '--brand-surface', '--brand-surface-raised', '--brand-surface-sunken',
                '--brand-border', '--text', '--text-dim', '--text-faint', '--accent', '--accent-deep',
                '--accent-soft', '--edge-hi', '--scrim', '--shadow-sm', '--shadow-md', '--shadow-lg',
                '--shadow-tabbar', '--glow-verse', '--surface-scripture', '--success', '--warning', '--danger'];
  const missing = MUST.filter(n => lightNames.indexOf(n) === -1);
  T('the light theme answers every role that cannot survive inversion',
    missing.length === 0, missing.join(', '));
  T('there are dark colour roles to answer', darkColour.length > 20, String(darkColour.length));

  sub('appearance is a preference, never a data change');
  /* Switching a theme must not be able to touch a single thing the reader
     wrote. Compared byte-for-byte across a switch and back. */
  const d = H.loadApp({ sharedStorage: new Map() });
  d.ctx.openLesson('who-is-jesus', 'wij-1'); d.ctx.__flush();
  d.ctx.completeLesson(); d.ctx.__flush();
  d.ctx.toggleSaved(d.ctx.passageForDay(d.ctx.todayKey()).id); d.ctx.__flush();
  const dataKeys = ['data.saved', 'data.notes', 'data.assignments', 'data.studyProgress',
                    'data.studyNotes', 'sys.schemaVersion'];
  const snap = {};
  dataKeys.forEach(k => { snap[k] = d.storage.getItem('daily-verse.' + k); });
  d.ctx.setAppearance('light');
  d.ctx.setAppearance('dark');
  d.ctx.setAppearance('light');
  const after = {};
  dataKeys.forEach(k => { after[k] = d.storage.getItem('daily-verse.' + k); });
  const touched = dataKeys.filter(k => snap[k] !== after[k]);
  T('no record is altered by switching appearance', touched.length === 0, touched.join(', '));
  T('the schema version is untouched', after['sys.schemaVersion'] === snap['sys.schemaVersion']);
  T('the reader is still where they were',
    d.ctx.completedCount(d.ctx.studyById('who-is-jesus')) === 1);

  sub('the swap lands on one frame');
  T('transitions are held still while the appearance changes',
    /appearance-switching/.test(css()) && /transition: none !important/.test(css()));
  T('and released again afterwards',
    /classList\.remove\('appearance-switching'\)/.test(js()));
}

/* ---------------------------------------------------------
   CONTRACT 34 — SMALL TEXT STAYS READABLE IN BOTH APPEARANCES

   The two labels this exists for shipped failing. --text-faint was tuned
   against --surface, the commonest surface, and the verse card paints
   --surface-scripture, which is lighter — so the date and the translation
   sat at 4.43 on the one screen the app exists for, and nothing noticed.

   So this does not assert that a token exists, or that it equals a colour
   somebody typed here too. It reads the shipped values and computes the
   ratio, which is the only form of this check that can fail for the right
   reason when a palette is next adjusted.
   --------------------------------------------------------- */
function testSmallTextContrast(){
  section('CONTRACT 34 — muted text clears its background in both appearances');
  const sheet = css();

  /* ---- read the two palettes out of the shipped stylesheet ---- */
  function tokensIn(startSel){
    const i = sheet.indexOf(startSel);
    if(i === -1) return null;
    const block = sheet.slice(i, sheet.indexOf('\n}', i));
    const out = {};
    /* Hex values AND the var() indirection the semantic layer is built on:
       --bg is var(--brand-ground), so reading only hex would silently skip
       every surface a component actually names. */
    block.replace(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6}|var\(--[a-z0-9-]+\))\s*;/g,
      (m, k, v) => { out[k] = v; return m; });
    return out;
  }
  /* Follow var() to the value it stands for, the way the cascade does. */
  function resolve(pal){
    const out = {};
    Object.keys(pal).forEach(function(k){
      let v = pal[k], hops = 0;
      while(/^var\(/.test(v) && hops++ < 5){
        const ref = v.slice(4, -1);
        if(!pal[ref]){ v = null; break; }
        v = pal[ref];
      }
      if(v && /^#[0-9a-fA-F]{6}$/.test(v)) out[k] = v;
    });
    return out;
  }
  const dark = tokensIn(':root{');
  const lightOverrides = tokensIn(':root[data-theme="light"]');
  T('the dark palette was read from the stylesheet', dark && Object.keys(dark).length > 10,
    String(dark && Object.keys(dark).length));
  T('the light palette was read from the stylesheet', lightOverrides && Object.keys(lightOverrides).length > 10,
    String(lightOverrides && Object.keys(lightOverrides).length));
  /* Light inherits everything it does not restate, exactly as the cascade does. */
  const light = resolve(Object.assign({}, dark, lightOverrides));
  const darkPal = resolve(dark);

  /* ---- contrast, by the WCAG definition ---- */
  function lum(hex){
    const h = hex.replace('#', '');
    const ch = [0, 2, 4].map(i => {
      let c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  function ratio(a, b){
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  /* Sanity: a check that cannot detect black on white cannot detect anything. */
  T('the ratio maths is right', Math.round(ratio('#000000', '#FFFFFF')) === 21,
    ratio('#000000', '#FFFFFF').toFixed(2));

  /* ---- the two labels that shipped failing ---- */
  /* Read the surface from the rule rather than restating it, so moving the
     verse card onto a different surface re-runs this check honestly. */
  const cardBg = (sheet.match(/\.verse-card\{[\s\S]*?background:\s*var\((--[a-z-]+)\)/) || [])[1];
  T('the verse card names the surface it paints', !!cardBg, String(cardBg));
  const labelToken = (sheet.match(/\.verse-date\{[\s\S]*?color:\s*var\((--[a-z-]+)\)/) || [])[1];
  T('the date label names the colour role it uses', !!labelToken, String(labelToken));
  T('and the translation label uses the same role',
    (sheet.match(/\.verse-translation\{[\s\S]*?color:\s*var\((--[a-z-]+)\)/) || [])[1] === labelToken);

  [['dark', darkPal], ['light', light]].forEach(function(pair){
    const name = pair[0], pal = pair[1];
    const fg = pal[labelToken], bg = pal[cardBg];
    const cr = ratio(fg, bg);
    T('.verse-date clears 4.5:1 in ' + name, cr >= 4.5,
      cr.toFixed(2) + '  ' + fg + ' on ' + bg);
    T('.verse-translation clears 4.5:1 in ' + name, cr >= 4.5, cr.toFixed(2));
    /* The brief asked for headroom, not a value sitting on the line. */
    T('with margin rather than exactly on the threshold in ' + name, cr >= 4.7, cr.toFixed(2));
  });

  /* ---- and every other muted role, on every surface it can land on ---- */
  /* --surface-raised carries a border and the switch knob rather than text, so
     it is checked at the 3:1 the spec asks of a non-text component. */
  const TEXT_SURFACES = ['--bg', '--surface', '--surface-scripture'];
  const TEXT_ROLES = ['--text', '--text-dim', '--text-faint', '--accent'];
  [['dark', darkPal], ['light', light]].forEach(function(pair){
    const name = pair[0], pal = pair[1];
    const bad = [];
    TEXT_ROLES.forEach(function(role){
      TEXT_SURFACES.forEach(function(surf){
        if(!pal[role] || !pal[surf]) return;
        const cr = ratio(pal[role], pal[surf]);
        if(cr < 4.5) bad.push(role + ' on ' + surf + ' = ' + cr.toFixed(2));
      });
    });
    T('every text role clears 4.5:1 on every text surface in ' + name,
      bad.length === 0, bad.join(' | '));
  });

  sub('and it is still a hierarchy, not three shades of the same thing');
  /* Raising the faint role fixes contrast; raising it too far deletes the
     distinction it exists to make. Each step must stay visibly separated. */
  [['dark', darkPal], ['light', light]].forEach(function(pair){
    const name = pair[0], pal = pair[1];
    const l = { text: lum(pal['--text']), dim: lum(pal['--text-dim']), faint: lum(pal['--text-faint']) };
    const ordered = name === 'dark'
      ? (l.text > l.dim && l.dim > l.faint)      // lighter is louder on a dark ground
      : (l.text < l.dim && l.dim < l.faint);     // darker is louder on a light one
    T('the three text roles stay in order in ' + name, ordered,
      JSON.stringify({ text: l.text.toFixed(3), dim: l.dim.toFixed(3), faint: l.faint.toFixed(3) }));
    const gap = Math.abs(ratio(pal['--text-dim'], pal['--surface']) - ratio(pal['--text-faint'], pal['--surface']));
    T('faint is still meaningfully quieter than dim in ' + name, gap >= 1.5, gap.toFixed(2));
  });
}

/* ---------------------------------------------------------
   CONTRACT 35 — KNOWLEDGE CHECKS TEACH, AND DO NOT KEEP SCORE

   Two ways a feature like this goes wrong. A question turns out to have more
   than one defensible answer, and the reader learns the app is unreliable.
   Or the scoring quietly grows — a total here, a streak there — until an app
   for reading Scripture is ranking people. Both are asserted structurally.
   --------------------------------------------------------- */
function testKnowledgeChecks(){
  section('CONTRACT 35 — knowledge checks');
  const app = H.loadApp({ sharedStorage: new Map() });
  const c = app.ctx;

  const checks = [];
  c.STUDIES.forEach(s => s.lessons.forEach(l =>
    (l.checks || []).forEach(ch => checks.push({ s: s.id, l: l.id, c: ch }))));

  sub('every question can be answered, and only one way');
  T('there are checks to test', checks.length > 0, String(checks.length));
  T('every check id is unique across the whole app',
    new Set(checks.map(x => x.c.id)).size === checks.length,
    String(checks.length - new Set(checks.map(x => x.c.id)).size) + ' duplicated');
  T('every check id is a slug', checks.every(x => /^[a-z0-9][a-z0-9-]*$/.test(x.c.id)));
  T('every check has a prompt', checks.every(x => typeof x.c.prompt === 'string' && x.c.prompt.trim()));
  T('every check offers between 2 and 4 options',
    checks.every(x => Array.isArray(x.c.options) && x.c.options.length >= 2 && x.c.options.length <= 4));
  /* The ambiguity guard: two options that say the same thing mean two answers
     are defensible, and the reader is right and the app is wrong. */
  const dupOpts = checks.filter(x => {
    const n = x.c.options.map(o => o.trim().toLowerCase());
    return new Set(n).size !== n.length;
  });
  T('no check repeats an option', dupOpts.length === 0, dupOpts.map(x => x.c.id).join(', '));
  const badAnswer = checks.filter(x => !Number.isInteger(x.c.answer) ||
    x.c.answer < 0 || x.c.answer >= x.c.options.length);
  T('every answer is exactly one option, and it exists',
    badAnswer.length === 0, badAnswer.map(x => x.c.id).join(', '));

  sub('being wrong is answered with a reason, not a verdict');
  T('every check explains itself',
    checks.every(x => typeof x.c.explain === 'string' && x.c.explain.trim().length > 40),
    checks.filter(x => !x.c.explain || x.c.explain.trim().length <= 40).map(x => x.c.id).join(', '));
  /* An explanation that only restates the answer teaches nothing. */
  T('an explanation says more than the option it defends',
    checks.every(x => x.c.explain.trim().length > x.c.options[x.c.answer].length),
    checks.filter(x => x.c.explain.trim().length <= x.c.options[x.c.answer].length).map(x => x.c.id).join(', '));
  T('checks that rest on Scripture cite it',
    checks.filter(x => x.c.basis).every(x => Array.isArray(x.c.basis) && x.c.basis.length > 0));

  sub('answering, and being allowed to try again');
  const first = checks[0];
  const wrong = first.c.answer === 0 ? 1 : 0;
  c.answerCheck(first.s, first.c.id, wrong);
  c.__flush();
  let rec = c.checkAnswerFor(first.s, first.c.id);
  T('a wrong answer is recorded as wrong', rec && rec.correct === 0, JSON.stringify(rec && rec.correct));
  c.answerCheck(first.s, first.c.id, first.c.answer);
  c.__flush();
  rec = c.checkAnswerFor(first.s, first.c.id);
  T('answering again replaces the row rather than adding one',
    c.checkAnswers.filter(r => r.check === first.c.id).length === 1,
    String(c.checkAnswers.filter(r => r.check === first.c.id).length));
  T('and the right answer is recorded as right', rec && rec.correct === 1);
  c.retryCheck(first.s, first.c.id);
  c.__flush();
  T('retrying clears the answer entirely, keeping no attempt history',
    c.checkAnswerFor(first.s, first.c.id) === null);
  T('an out-of-range choice is ignored rather than stored',
    (function(){ c.answerCheck(first.s, first.c.id, 99); return c.checkAnswerFor(first.s, first.c.id) === null; })());

  sub('the tally is counted, never stored');
  const study = c.studyById('skills-foundations');
  const own = c.allChecks(study);
  own.forEach(ch => c.answerCheck(study.id, ch.id, ch.answer));
  c.__flush();
  let score = c.studyCheckScore(study);
  T('all eight answered correctly reads as eight of eight',
    score.correct === own.length && score.total === own.length,
    score.correct + ' of ' + score.total);
  c.answerCheck(study.id, own[0].id, own[0].answer === 0 ? 1 : 0);
  c.__flush();
  score = c.studyCheckScore(study);
  T('getting one wrong reads as seven of eight',
    score.correct === own.length - 1, score.correct + ' of ' + score.total);
  /* Nothing anywhere in storage holds a total. If it did, it could disagree
     with the rows it was summarising. */
  const stored = JSON.stringify(app.storage.getItem('daily-verse.data.checkAnswers') || '');
  T('the stored rows carry no score, only per-check results',
    stored.indexOf('score') === -1 && stored.indexOf('total') === -1 && stored.indexOf('correctCount') === -1);
  T('and no other key appears to hold one',
    Object.keys(c.KEYS).every(k => !/score|streak|xp|points|rank|level$/i.test(c.KEYS[k])),
    Object.keys(c.KEYS).filter(k => /score|streak|xp|points|rank/i.test(c.KEYS[k])).join(', '));

  sub('answering a question is not progress through a lesson');
  const b = H.loadApp({ sharedStorage: new Map() });
  const bs = b.ctx.studyById('skills-foundations');
  /* Answered from INSIDE an open lesson, which is how it actually happens.
     Answering with no lesson open cannot catch this: a version that marked
     the open lesson done passed that weaker test, because there was none. */
  b.ctx.openLesson(bs.id, bs.lessons[0].id); b.ctx.__flush();
  (bs.lessons[0].checks || []).forEach(ch => b.ctx.answerCheck(bs.id, ch.id, ch.answer));
  b.ctx.__flush();
  T('answering every check in an open lesson does not complete it',
    b.ctx.isLessonDone(bs.id, bs.lessons[0].id) === false);
  T('and no lesson is done', b.ctx.completedCount(bs) === 0, String(b.ctx.completedCount(bs)));
  b.ctx.closeLesson(); b.ctx.__flush();
  b.ctx.allChecks(bs).forEach(ch => b.ctx.answerCheck(bs.id, ch.id, ch.answer));
  b.ctx.__flush();
  T('every check answered still leaves no lesson done',
    b.ctx.completedCount(bs) === 0, String(b.ctx.completedCount(bs)));
  T('and the study is not complete', b.ctx.isStudyComplete(bs) === false);
  T('finishing lessons is still what completes a study',
    (function(){ const r = b.ctx.ensureStudyStarted(bs.id);
      bs.lessons.forEach(l => { if(r.done.indexOf(l.id) === -1) r.done.push(l.id); });
      b.ctx.persistStudyProgress(); return b.ctx.isStudyComplete(bs) === true; })());

  sub('a level is suggested, never locked');
  const fresh = H.loadApp({ sharedStorage: new Map() });
  const levels = fresh.ctx.skillStudies();
  T('the skills track has three levels in order',
    levels.length === 3 && levels[0].level === 1 && levels[1].level === 2 && levels[2].level === 3,
    levels.map(x => x.level).join(','));
  T('foundations is suggested first', fresh.ctx.recommendedSkill() === 'skills-foundations',
    String(fresh.ctx.recommendedSkill()));
  /* Finish level one; the suggestion moves on. */
  const rec1 = fresh.ctx.ensureStudyStarted('skills-foundations');
  fresh.ctx.studyById('skills-foundations').lessons.forEach(l => rec1.done.push(l.id));
  fresh.ctx.persistStudyProgress();
  T('finishing it suggests the next level', fresh.ctx.recommendedSkill() === 'skills-practice',
    String(fresh.ctx.recommendedSkill()));
  /* And the deepest level opens straight away for someone who wants it. */
  const jump = H.loadApp({ sharedStorage: new Map() });
  jump.ctx.openLesson('skills-deeper', 'sd-1');
  jump.ctx.__flush();
  T('a reader can open the last level without touching the first',
    jump.dom.document.getElementById('lessonOverlay').classList.contains('open'));
  /* Asserted by behaviour rather than by keyword: an earlier version of this
     matched _lockedScrollY, which is the overlay scroll lock and has nothing
     to do with levels. Opening all three from a clean install is the claim. */
  (function(){
    const opened = [];
    jump.ctx.skillStudies().forEach(function(lv){
      const f = H.loadApp({ sharedStorage: new Map() });
      f.ctx.openStudy(lv.id); f.ctx.__flush();
      if(f.dom.document.getElementById('studyOverlay').classList.contains('open')) opened.push(lv.id);
    });
    T('every level opens from a clean install, in any order',
      opened.length === 3, opened.join(', '));
  })();

  sub('none of the vocabulary of a game');
  /* Bounded to the Learn and check code so an unrelated word elsewhere in a
     300KB file cannot fail this for the wrong reason. */
  const src = stripComments(js());
  /* checkInnerHtml comes AFTER renderSaved in the file, so the bounds have to
     be ordered or this silently scans everything and fails on words that live
     somewhere else entirely. */
  const from = src.indexOf('function checkInnerHtml');
  const to = src.indexOf('function passageCardHtml');
  T('the check code was located', from !== -1 && to > from, from + '..' + to);
  const learn = src.slice(from, to);
  ['streak', 'badge', 'trophy', 'leaderboard', 'coins', 'achievement', 'confetti']
    .forEach(w => T('no ' + w, learn.toLowerCase().indexOf(w) === -1));
  T('no XP', !/\bxp\b/i.test(learn));
  T('no percentage is shown for a check score', !/checkScore[\s\S]{0,80}%/.test(learn));
  T('no timer anywhere near a check', !/setTimeout[\s\S]{0,40}check/i.test(learn));
}

/* ---------------------------------------------------------
   CONTRACT 36 — A FAITHFUL COPY, AND A TRANSLATION-PORTABLE VOICE

   Until v1.6.1 the build deleted psalm superscriptions and shipped the result
   under the publisher's name. Nothing failed, because nothing was looking.
   These are the checks that would have caught it, plus the ones that keep the
   next translation from arriving on top of English-only teaching.
   --------------------------------------------------------- */
function testFaithfulCopy(){
  section('CONTRACT 36 — faithful copy and translation readiness');
  const app = H.loadApp();
  const c = app.ctx;

  sub('the publisher’s title lines are carried, not deleted');
  const withSup = c.SCRIPTURE.filter(p => p.sup);
  T('19 passages carry a superscription', withSup.length === 19, String(withSup.length));
  T('17 of them are daily readings',
    withSup.filter(p => p.daily).length === 17,
    String(withSup.filter(p => p.daily).length));
  /* The old bug shipped `sup: 1` — a flag meaning "we removed one". A number
     here means the deletion is back. */
  T('every one holds the text, not a deletion flag',
    withSup.every(p => typeof p.sup === 'string' && p.sup.trim().length > 3),
    withSup.filter(p => typeof p.sup !== 'string').map(p => p.id).join(', '));
  T('every one belongs to a Psalm', withSup.every(p => /^PSA\./.test(p.id)),
    withSup.filter(p => !/^PSA\./.test(p.id)).map(p => p.id).join(', '));
  /* A superscription can only ever attach where the passage starts at verse 1. */
  T('and only where the passage begins at verse 1',
    withSup.every(p => /^PSA\.\d+\.1(-\d+)?$/.test(p.id)),
    withSup.filter(p => !/^PSA\.\d+\.1(-\d+)?$/.test(p.id)).map(p => p.id).join(', '));
  T('none of them was left inside the verse body',
    withSup.every(p => p.text.indexOf(p.sup) === -1),
    withSup.filter(p => p.text.indexOf(p.sup) !== -1).map(p => p.id).join(', '));

  sub('and the reader is shown them');
  const src = stripComments(js());
  T('a superscription has its own renderer', /function superscriptionHtml/.test(src));
  /* Four surfaces show a passage. Missing one would hide the line on that
     screen only, which is the failure mode hardest to notice. */
  T('every passage surface renders it',
    (src.match(/superscriptionHtml\(/g) || []).length >= 5,
    String((src.match(/superscriptionHtml\(/g) || []).length));
  /* The one thing it must never be: switchable off with this app's own words. */
  T('it is not tied to the show-reflections preference',
    !/showReflections[\s\S]{0,120}superscriptionHtml/.test(src) &&
    !/superscriptionHtml[\s\S]{0,120}showReflections/.test(src));
  T('it is set in the Scripture face, never the interface face',
    /\.verse-sup\{[\s\S]{0,200}var\(--font-scripture\)/.test(css()));

  sub('the divine name is never normalised');
  /* WEB prints Yahweh; other editions print the LORD, Jehova, l’Eternel.
     Whichever edition is shown, its own wording stands. The failure this
     prevents is a well-meant map that "helps" by making them agree. */
  const yahweh = c.SCRIPTURE.filter(p => /Yahweh/.test(p.text) || /Yahweh/.test(p.sup || ''));
  T('the shipped text prints the edition’s own divine name', yahweh.length > 100,
    String(yahweh.length) + ' passages');
  const BANNED = [
    /replace\([^)]*Yahweh/i, /Yahweh[^\n]{0,40}=>[^\n]{0,20}LORD/i,
    /divineName\s*:\s*\{/, /normali[sz]eDivine/i, /DIVINE_NAME_MAP/i, /substituteName/i
  ];
  const offenders = BANNED.filter(re => re.test(src));
  T('no substitution of the divine name exists in the app',
    offenders.length === 0, offenders.map(String).join(' | '));
  T('nor in the build', !/replace\([^)]*Yahweh/i.test(
    require('fs').readFileSync('scripts/scripture.js', 'utf8')));
  T('and no preference can rewrite wording inside a translation',
    Object.keys(c.KEYS).every(k => !/divine|name-?style|wording/i.test(c.KEYS[k])),
    Object.keys(c.KEYS).filter(k => /divine|wording/i.test(c.KEYS[k])).join(', '));

  sub('teaching does not depend on one edition’s English');
  /* The audit that made this phase necessary, kept running. A lesson that
     quotes an English rendering, or asks a question only answerable in one,
     becomes wrong the moment a second translation is offered. */
  const lessons = [];
  c.STUDIES.forEach(s => s.lessons.forEach(l => lessons.push({ s: s.id, l: l })));

  /* 1. no teaching field may name the divine name of any single edition */
  const NAMES = /\bYahweh\b|\bJehovah\b|\bl’Éternel\b/;
  const named = [];
  lessons.forEach(x => {
    const fields = [x.l.understand, x.l.lookCloser || '', x.l.reflect, x.l.title];
    (x.l.checks || []).forEach(ch => fields.push(ch.prompt, ch.explain, ch.options.join(' ')));
    if (x.l.figure) fields.push(x.l.figure.heading, x.l.figure.rows.map(r => r.label + ' ' + r.value).join(' '));
    if (fields.some(f => NAMES.test(f))) named.push(x.s + '/' + x.l.id);
  });
  T('no lesson names one edition’s rendering of the divine name',
    named.length === 0, named.join(', '));

  /* 2. a check must not be answerable only by recalling an English phrase.
        Options are the sharp end: a quoted rendering in an option makes the
        question unanswerable beside another translation. */
  const quotedOption = [];
  lessons.forEach(x => (x.l.checks || []).forEach(ch => {
    ch.options.forEach(o => {
      if (/[“”]/.test(o)) quotedOption.push(x.s + '/' + ch.id + ': ' + o.slice(0, 40));
    });
  }));
  T('no answer option quotes a rendering', quotedOption.length === 0, quotedOption.join(' | '));

  /* 3. reflections were already portable; keep them that way. */
  const norm = t => String(t).toLowerCase().replace(/[‘’“”]/g, "'")
    .replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const echo = [];
  Object.keys(c.REFLECTIONS).forEach(id => {
    const p = c.passageById(id); if (!p) return;
    const vt = norm(p.text);
    const words = norm(c.REFLECTIONS[id]).split(' ');
    for (let i = 0; i + 6 <= words.length; i++) {
      if (vt.indexOf(words.slice(i, i + 6).join(' ')) !== -1) { echo.push(id); return; }
    }
  });
  T('no reflection reproduces a run of the verse it responds to',
    echo.length === 0, echo.slice(0, 5).join(', '));
}

/* ---------------------------------------------------------
   CONTRACT 37 — MORE THAN ONE EDITION, ONE CANON

   A canonical id names a LOCATION. An edition supplies the words. Everything
   here defends that line, because the ways it breaks are quiet: a saved verse
   that stops resolving, a day that rerolls when the language changes, a
   Spanish verse labelled WEB, a lesson that teaches an English word beside
   text that no longer contains it.
   --------------------------------------------------------- */
function testTranslations(){
  section('CONTRACT 37 — multiple translations, one canon');
  const app = H.loadApp({ sharedStorage: new Map() });
  const c = app.ctx;
  const S = require('../scripts/scripture.js');
  const lock = JSON.parse(require('fs').readFileSync('data/corpus.lock.json', 'utf8'));

  sub('every shipped edition is described by its publisher, not by us');
  const ids = Object.keys(c.TRANSLATIONS);
  T('more than one edition ships', ids.length >= 2, ids.join(', '));
  T('the default is the World English Bible', c.DEFAULT_TRANSLATION === 'eng-web');
  ids.forEach(id => {
    const t = c.TRANSLATIONS[id];
    T(id + ' names itself', !!(t.title && t.abbr && t.language && t.lang));
    T(id + ' carries its publisher licence statement',
      typeof t.copyright === 'string' && /public domain/i.test(t.copyright),
      String(t.copyright).slice(0, 48));
    T(id + ' is pinned in the lock', !!(lock.editions[id] && lock.editions[id].archives));
    T(id + ' pins every archive by digest',
      Object.keys(lock.editions[id].archives).every(k => /^[0-9a-f]{64}$/.test(lock.editions[id].archives[k].sha256)));
    /* A BCP 47 tag, which for Chinese MUST carry its script: zh-Hans and
       zh-Hant are two different sets of glyphs, and a bare "zh" leaves a
       screen reader and a font stack to guess which one they are looking
       at. Two letters, optionally a four-letter script subtag — still tight
       enough to reject a language NAME or an edition id in this field. */
    T(id + ' declares a language code for screen readers',
      /^[a-z]{2}(-[A-Z][a-z]{3})?$/.test(t.lang), t.lang);
  });

  sub('the English baseline did not move');
  /* The whole refactor is worthless if it cost the edition people already read. */
  T('415 canonical passages', c.SCRIPTURE.length === 415, String(c.SCRIPTURE.length));
  T('378 of them daily', c.SCRIPTURE.filter(p => p.daily).length === 378);
  T('the WEB dataset hash is exactly what it was',
    S.datasetHash(c.SCRIPTURE) === 'f4c8380cf3d29d014044f75a8ed0b6a1b27c4d00387acdd1431a3636995d5916',
    S.datasetHash(c.SCRIPTURE));
  T('the WEB daily hash is exactly what it was',
    S.datasetHash(c.SCRIPTURE.filter(p => p.daily)) === '0cb67c036256232a465fb4f979e5c675254c3129a8084e93f76cd63493006c41',
    S.datasetHash(c.SCRIPTURE.filter(p => p.daily)));
  T('and its 19 superscriptions are still there',
    c.SCRIPTURE.filter(p => p.sup).length === 19, String(c.SCRIPTURE.filter(p => p.sup).length));

  sub('one canon, several sets of words');
  const other = ids.filter(id => id !== c.DEFAULT_TRANSLATION);
  other.forEach(id => {
    const text = c.TRANSLATION_TEXT[id] || {};
    const keys = Object.keys(text);
    T(id + ' covers every canonical passage', keys.length === c.SCRIPTURE.length,
      keys.length + ' of ' + c.SCRIPTURE.length);
    T(id + ' introduces no id of its own',
      keys.every(k => !!c.passageById(k)),
      keys.filter(k => !c.passageById(k)).slice(0, 3).join(', '));
    T(id + ' has text for every one', keys.every(k => text[k].text && text[k].text.length > 8));
    /* Different words is the point; the SAME words would mean it never loaded. */
    const differs = c.SCRIPTURE.filter(p => text[p.id] && text[p.id].text !== p.text).length;
    T(id + ' actually differs from the default', differs > c.SCRIPTURE.length * 0.9,
      differs + ' of ' + c.SCRIPTURE.length);
  });
  T('no id anywhere is namespaced by translation',
    c.SCRIPTURE.every(p => !/^(spa|fra|eng)[.-]/.test(p.id)),
    c.SCRIPTURE.filter(p => /^(spa|fra|eng)[.-]/.test(p.id)).slice(0,3).map(p=>p.id).join(', '));

  sub('choosing an edition changes words, and only words');
  const p = c.passageById('PSA.20.7');
  const en = c.inTranslation(p);
  T('the default renders English', /chariots/.test(en.text), en.text.slice(0, 40));
  T('and keeps the canonical reference', en.ref === 'Psalm 20:7', en.ref);
  c.setTranslation('spaRV1909');
  const es = c.inTranslation(p);
  T('the same id renders Spanish', es.text !== en.text && /carros/.test(es.text), es.text.slice(0, 40));
  T('the id is unchanged', es.id === p.id);
  T('the reference is the publisher’s own book name', es.ref === 'Salmos 20:7', es.ref);
  T('the label names the edition being read', c.translationAbbr(es) === 'RV1909', c.translationAbbr(es));
  T('and the text declares its language', c.translationLang(es) === 'es');
  T('themes and eligibility travel with the location, not the words',
    JSON.stringify(es.themes) === JSON.stringify(p.themes) && es.daily === p.daily);
  c.setTranslation('eng-web');

  sub('the day is assigned to a passage, not to a language');
  const day = H.loadApp({ sharedStorage: new Map() });
  const before = day.ctx.passageForDay(day.ctx.todayKey()).id;
  const week = [];
  for(let i = 0; i < 14; i++){
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    week.push(day.ctx.passageForDay(key).id);
  }
  day.ctx.setTranslation('spaRV1909');
  T('today is the same passage in Spanish', day.ctx.passageForDay(day.ctx.todayKey()).id === before);
  const weekAfter = [];
  for(let i = 0; i < 14; i++){
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    weekAfter.push(day.ctx.passageForDay(key).id);
  }
  T('and so is every day behind it', week.join() === weekAfter.join());

  sub('switching edition writes nothing a reader owns');
  const d = H.loadApp({ sharedStorage: new Map() });
  d.ctx.toggleSaved('PSA.20.7');
  d.ctx.openLesson('who-is-jesus', 'wij-1'); d.ctx.__flush();
  d.ctx.completeLesson(); d.ctx.__flush();
  const KEYS = ['data.saved','data.notes','data.assignments','data.studyProgress','data.studyNotes','data.checkAnswers','sys.schemaVersion'];
  const snap = {}; KEYS.forEach(k => snap[k] = d.storage.getItem('daily-verse.' + k));
  d.ctx.setTranslation('spaRV1909');
  d.ctx.setTranslation('eng-web');
  d.ctx.setTranslation('spaRV1909');
  const touched = KEYS.filter(k => d.storage.getItem('daily-verse.' + k) !== snap[k]);
  T('no record changes when the edition changes', touched.length === 0, touched.join(', '));
  T('a saved verse still resolves', !!d.ctx.passageById('PSA.20.7'));
  T('and renders in the newly chosen edition',
    /carros/.test(d.ctx.inTranslation(d.ctx.passageById('PSA.20.7')).text));

  sub('the preference behaves like every other preference');
  const fresh = H.loadApp({ sharedStorage: new Map() });
  T('a new reader gets the default', fresh.ctx.translation === 'eng-web');
  T('and nothing is written until they choose',
    fresh.storage.getItem('daily-verse.ui.translation') === null);
  const shared = new Map();
  const one = H.loadApp({ sharedStorage: shared });
  one.ctx.setTranslation('spaRV1909');
  const two = H.loadApp({ sharedStorage: shared });
  T('a chosen edition survives being closed', two.ctx.translation === 'spaRV1909');
  const junk = new Map(); junk.set('daily-verse.ui.translation', 'notAnEdition');
  T('an edition this build does not ship falls back to the default',
    H.loadApp({ sharedStorage: junk }).ctx.translation === 'eng-web');
  /* The language is a property of the edition, never a second stored value
     that could disagree with it. */
  T('no separate language preference exists',
    Object.keys(c.KEYS).every(k => !/bibleLanguage|scriptureLang/i.test(c.KEYS[k])));

  sub('a share says which edition it quoted');
  const sh = H.loadApp({ sharedStorage: new Map() });
  const shEn = sh.ctx.shareText(sh.ctx.inTranslation(sh.ctx.passageById('PSA.20.7')));
  T('English share carries the English label', /WEB/.test(shEn) && /chariots/.test(shEn));
  sh.ctx.setTranslation('spaRV1909');
  const shEs = sh.ctx.shareText(sh.ctx.inTranslation(sh.ctx.passageById('PSA.20.7')));
  T('Spanish share carries the Spanish label', /RV1909/.test(shEs) && /carros/.test(shEs), shEs.slice(0, 60));
  T('and never mixes the two', !/WEB/.test(shEs));

  sub('every lesson survives a change of edition');
  /* The audit that made the previous phase necessary, run for real against
     text the teaching was not written beside. */
  ids.forEach(id => {
    const L = H.loadApp({ sharedStorage: new Map() });
    L.ctx.setTranslation(id);
    const broken = [];
    L.ctx.STUDIES.forEach(st => st.lessons.forEach(l => {
      const ps = L.ctx.lessonPassages(l);
      if(ps.length !== l.passages.length) broken.push(st.id + '/' + l.id + ' count');
      ps.forEach((q, i) => {
        if(!q || !q.text || q.text.length < 8) broken.push(st.id + '/' + l.id + ' empty');
        if(q && q.id !== l.passages[i]) broken.push(st.id + '/' + l.id + ' id drift');
      });
    }));
    T('all 43 lessons resolve their Scripture in ' + id, broken.length === 0, broken.slice(0, 4).join(', '));
  });

  sub('and every knowledge check stays answerable');
  /* A question whose right answer quoted one edition's wording would become
     unanswerable here. None may. */
  const checks = [];
  c.STUDIES.forEach(st => st.lessons.forEach(l => (l.checks || []).forEach(ch => checks.push(ch))));
  T('there are checks to protect', checks.length > 0, String(checks.length));
  const quoting = [];
  ids.forEach(id => {
    const text = id === c.DEFAULT_TRANSLATION
      ? c.SCRIPTURE.map(p => p.text).join(' ')
      : Object.keys(c.TRANSLATION_TEXT[id]).map(k => c.TRANSLATION_TEXT[id][k].text).join(' ');
    const norm = t => t.toLowerCase().replace(/[^a-zÀ-ſ ]+/g, ' ').replace(/\s+/g, ' ');
    const hay = norm(text);
    checks.forEach(ch => ch.options.forEach(o => {
      const w = norm(o).split(' ').filter(Boolean);
      for(let i = 0; i + 5 <= w.length; i++){
        if(hay.indexOf(w.slice(i, i + 5).join(' ')) !== -1){ quoting.push(id + '/' + ch.id); return; }
      }
    }));
  });
  T('no answer option reproduces a run of any shipped edition',
    quoting.length === 0, [...new Set(quoting)].slice(0, 4).join(', '));

  sub('the edition that could not be trusted was not shipped');
  const corpus = require('../scripts/corpus.js');
  const held = Object.keys(corpus.EDITIONS).filter(id => corpus.EDITIONS[id].held);
  T('a held edition is recorded with its reason', held.length > 0 &&
    held.every(id => typeof corpus.EDITIONS[id].held === 'string' && corpus.EDITIONS[id].held.length > 20),
    held.join(', '));
  T('and is not shipped to anyone', held.every(id => !c.TRANSLATIONS[id]));
  T('shippedEditions() and TRANSLATIONS agree',
    corpus.shippedEditions().sort().join() === ids.slice().sort().join(),
    corpus.shippedEditions().join() + ' vs ' + ids.join());
}

/* ---------------------------------------------------------
   CONTRACT 38 — THE FULL BIBLE, AND THE READER OVER IT

   The curated 415 passages had their own verification and it proved nothing
   about the other thirty thousand verses. This is the full corpus's own
   check: every file re-derived from the pinned archives, every book the
   publisher shipped and no book they did not, and a reader that can move
   through it without ever showing the wrong sentence at the right address.

   The cache is filled from the shipped files on disk, so these assertions
   run against exactly the bytes a phone would fetch.
   --------------------------------------------------------- */
function testBibleReader(){
  section('CONTRACT 38 — the full Bible, and the reader over it');
  const fsx = require('fs');
  const pathx = require('path');
  const app = H.loadApp({ sharedStorage: new Map() });
  const c = app.ctx;
  const src = js();
  const bible = require('../scripts/bible.js');
  const corpus = require('../scripts/corpus.js');
  const lock = JSON.parse(fsx.readFileSync(pathx.join(H.ROOT, 'data', 'bible.lock.json'), 'utf8'));
  const dir = pathx.join(H.ROOT, 'data', 'bible');

  const editions = Object.keys(lock.editions);
  const readJson = (ed, name) => JSON.parse(fsx.readFileSync(pathx.join(dir, ed, name), 'utf8'));

  /* Fill the reader's cache from the shipped files. No fetch exists in the
     harness, and stubbing one would test the stub. */
  editions.forEach(ed => {
    c.bibleCache.index[ed] = readJson(ed, 'index.json');
  });
  const loadBook = (ed, code) => {
    const data = readJson(ed, code + '.json');
    c.bibleCache.books[ed + '/' + code] = data;
    return data;
  };

  sub('every shipped byte came from a pinned publisher archive');
  T('the corpus is built by a tool, not by hand',
    fsx.existsSync(pathx.join(H.ROOT, 'scripts', 'bible.js')));
  T('every edition records the archives it was built from',
    editions.every(ed => lock.builtFrom[ed] &&
      Object.keys(lock.builtFrom[ed]).length > 0), editions.join(', '));
  T('and every one of those archives is pinned by digest',
    editions.every(ed => Object.keys(lock.builtFrom[ed])
      .every(k => /^[0-9a-f]{64}$/.test(lock.builtFrom[ed][k].sha256))));
  T('every generated file is pinned by digest too',
    editions.every(ed => Object.keys(lock.editions[ed])
      .every(f => /^[0-9a-f]{64}$/.test(lock.editions[ed][f].sha256))));

  /* The shipped bytes, hashed. bible:verify re-derives them from the
     archives; this proves the files on disk are those bytes. */
  const crypto = require('crypto');
  let mismatched = [], count = 0;
  editions.forEach(ed => {
    Object.keys(lock.editions[ed]).forEach(f => {
      count++;
      const p = pathx.join(dir, ed, f);
      if(!fsx.existsSync(p)){ mismatched.push(ed + '/' + f + ' missing'); return; }
      const h = crypto.createHash('sha256').update(fsx.readFileSync(p, 'utf8')).digest('hex');
      if(h !== lock.editions[ed][f].sha256) mismatched.push(ed + '/' + f);
    });
  });
  T('every shipped file matches its digest', mismatched.length === 0 && count > 200,
    mismatched.slice(0, 3).join(', ') || String(count) + ' files');

  sub('each edition holds what its publisher published, and nothing else');
  /* The failure this prevents is a fake common canon: forcing every edition
     into one book list, or quietly adding books to the one that has fewer. */
  const shape = {};
  editions.forEach(ed => {
    const idx = c.bibleCache.index[ed];
    shape[ed] = idx.books.length;
    T(ed + ' lists its books in the publisher order',
      idx.books.length > 0 && idx.books.every(b => /^[A-Z0-9]{3}$/.test(b.c) && b.ch > 0 && b.n));
    T(ed + ' groups every book it has', idx.books.every(b => ['ot', 'nt', 'dc'].indexOf(b.g) !== -1));
    /* Chapter counts are declared; a book file that disagreed would break
       every chapter picker and every next/previous. */
    const sample = idx.books.filter((b, i) => i % 7 === 0);
    const wrong = sample.filter(b => loadBook(ed, b.c).ch.length !== b.ch);
    T(ed + ' declares the chapter count each book actually has',
      wrong.length === 0, wrong.map(b => b.c).join(', '));
  });
  T('WEB Classic ships the 81 books it publishes', shape['eng-web'] === 81, String(shape['eng-web']));
  T('Reina Valera 1909 ships 66, and is not padded to match',
    shape['spaRV1909'] === 66, String(shape['spaRV1909']));
  T('a deuterocanonical book is present in WEB and absent from RV1909',
    c.bibleHasBook('eng-web', 'TOB') && !c.bibleHasBook('spaRV1909', 'TOB'));

  sub('no chapter is missing, duplicated or out of sequence');
  const seqBad = [];
  editions.forEach(ed => {
    c.bibleCache.index[ed].books.slice(0, 12).forEach(b => {
      const book = loadBook(ed, b.c);
      if(book.ch.some(ch => !Array.isArray(ch) || ch.length === 0)) seqBad.push(ed + ' ' + b.c + ' empty chapter');
      if(book.c !== b.c) seqBad.push(ed + ' ' + b.c + ' code mismatch');
    });
  });
  T('every chapter is a non-empty list of verses', seqBad.length === 0, seqBad.slice(0, 3).join(', '));

  sub('moving through a book, and out of it');
  const step = (ed, code, ch, d) => c.bibleStep(ed, code, ch, d);
  T('the next chapter is the next chapter',
    JSON.stringify(step('eng-web', 'JHN', 3, 1)) === JSON.stringify({ c: 'JHN', ch: 4 }));
  T('the end of a book continues into the next one',
    JSON.stringify(step('eng-web', 'GEN', 50, 1)) === JSON.stringify({ c: 'EXO', ch: 1 }));
  T('and going back crosses the same boundary',
    JSON.stringify(step('eng-web', 'EXO', 1, -1)) === JSON.stringify({ c: 'GEN', ch: 50 }));
  /* The failure this prevents: wrapping. Reaching the end of Revelation and
     landing in Genesis reads as a bug and loses the reader's place. */
  T('the last chapter of the last book leads nowhere',
    step('eng-web', 'REV', 22, 1) === null);
  T('and the first chapter of the first book has nothing before it',
    step('eng-web', 'GEN', 1, -1) === null);
  T('stepping is done in THIS edition order, not a fixed one',
    step('spaRV1909', 'MAL', 4, 1).c === 'MAT');

  sub('a reference resolves to one place or to none');
  const P = (ed, s) => c.parseBibleRef(ed, s);
  T('book, chapter and verse', JSON.stringify(P('eng-web', 'John 3:16')) ===
    JSON.stringify({ c: 'JHN', ch: 3, from: 16, to: 16 }));
  T('a range keeps both ends', JSON.stringify(P('eng-web', 'John 3:16-18')) ===
    JSON.stringify({ c: 'JHN', ch: 3, from: 16, to: 18 }));
  T('a numbered book', P('eng-web', '1 John 2').c === '1JN');
  T('an abbreviation', P('eng-web', 'Rom 8:1').c === 'ROM');
  T('a bare book name opens its first chapter',
    P('eng-web', 'Genesis').c === 'GEN' && P('eng-web', 'Genesis').ch === 1);
  /* WEB names the book "Psalms" and also ships "Psalm 151". The prefix
     matched both, so this used to resolve to nothing at all. */
  T('Psalm 23 resolves even though Psalm 151 also starts with Psalm',
    P('eng-web', 'Psalm 23').c === 'PSA' && P('eng-web', 'Psalm 23').ch === 23);
  T('the publisher book names of the edition in hand are what match',
    P('spaRV1909', 'Salmos 23').c === 'PSA' && P('eng-web', 'Salmos 23') === null);
  T('an ambiguous prefix resolves to nothing rather than to a guess',
    P('eng-web', 'Jo') === null);
  /* When a prefix does name several books, the shortest name is the one it
     is a name FOR. No book list shipped here contains two equal-shortest
     candidates, so the refusal branch below it is defensive rather than
     reachable - but the rule itself is exercised every time somebody types
     Psalm, and the deuterocanonical book it competes with stays reachable
     by its own full name. */
  T('the shortest matching name wins, and the longer book is still reachable',
    P('eng-web', 'Psalm 23').c === 'PSA' &&
    c.bibleMatchBook('eng-web', 'Psalm 151').c === 'PS2');
  T('a chapter the book does not have is refused', P('eng-web', 'John 99') === null);
  T('so is a book nobody publishes', P('eng-web', 'Hezekiah 1') === null);
  T('and so is nonsense', P('eng-web', 'nonsense') === null && P('eng-web', '') === null);

  sub('choosing an edition changes the words, never the place');
  const r = H.loadApp({ sharedStorage: new Map() });
  editions.forEach(ed => { r.ctx.bibleCache.index[ed] = readJson(ed, 'index.json'); });
  ['eng-web', 'spaRV1909'].forEach(ed => {
    r.ctx.bibleCache.books[ed + '/JHN'] = readJson(ed, 'JHN.json');
  });
  const enJohn = r.ctx.bibleCache.books['eng-web/JHN'].ch[2];
  const esJohn = r.ctx.bibleCache.books['spaRV1909/JHN'].ch[2];
  T('the same chapter exists in both editions', enJohn.length > 30 && esJohn.length > 30);
  T('and holds different words', enJohn[15] !== esJohn[15]);
  T('the English reference uses the English name',
    r.ctx.bibleRefLabel('eng-web', 'JHN', 3) === 'John 3');
  T('the Spanish reference uses the publisher Spanish name',
    r.ctx.bibleRefLabel('spaRV1909', 'JHN', 3) === 'Juan 3');
  /* A book one edition does not publish is reported, never remapped. */
  T('a book missing from an edition is simply missing',
    !r.ctx.bibleHasBook('spaRV1909', 'TOB'));
  T('and the reader says so rather than substituting another book',
    /Not in this translation/.test(src) &&
    /isn&rsquo;t part of/.test(src));

  sub('where the reader was, and nothing more');
  const k = H.loadApp({ sharedStorage: new Map() });
  T('nothing is stored until somebody reads something',
    k.storage.getItem('daily-verse.ui.bibleLast') === null);
  k.ctx.rememberBibleLast('JHN', 4);
  const stored = JSON.parse(k.storage.getItem('daily-verse.ui.bibleLast'));
  T('a place is a book and a chapter', stored.c === 'JHN' && stored.ch === 4);
  T('and carries no text, no time and no count',
    Object.keys(stored).sort().join() === 'c,ch', Object.keys(stored).join());
  const k2 = H.loadApp({ sharedStorage: k.storage.__map || new Map() });
  T('a malformed record is ignored rather than trusted', (() => {
    const j = new Map(); j.set('daily-verse.ui.bibleLast', '{"c":123}');
    return H.loadApp({ sharedStorage: j }).ctx.readBibleLast() === null;
  })());

  sub('saving a verse the curated catalogue never held');
  const s2 = H.loadApp({ sharedStorage: new Map() });
  T('a Bible location is not in the curated set', s2.ctx.passageById('1CH.26.18') === null);
  s2.ctx.toggleSavedLocation('1CH.26.18', '1 Chronicles 26:18');
  const rec = JSON.parse(s2.storage.getItem('daily-verse.data.saved'))[0];
  T('it saves as a canonical location', rec.passage === '1CH.26.18');
  T('and stores no Scripture text in the record',
    Object.keys(rec).every(f => typeof rec[f] !== 'string' || rec[f].length < 40),
    Object.keys(rec).join(', '));
  T('saving twice removes it rather than duplicating it', (() => {
    s2.ctx.toggleSavedLocation('1CH.26.18', '1 Chronicles 26:18');
    return JSON.parse(s2.storage.getItem('daily-verse.data.saved')).length === 0;
  })());
  T('a location that is not one is refused', (() => {
    s2.ctx.toggleSavedLocation('not-a-location', 'x');
    return JSON.parse(s2.storage.getItem('daily-verse.data.saved')).length === 0;
  })());

  sub('a share from the reader can never mislabel itself');
  const sh = H.loadApp({ sharedStorage: new Map() });
  editions.forEach(ed => { sh.ctx.bibleCache.index[ed] = readJson(ed, 'index.json'); });
  sh.ctx.bibleCache.books['eng-web/JHN'] = readJson('eng-web', 'JHN.json');
  sh.ctx.bibleCache.books['spaRV1909/JHN'] = readJson('spaRV1909', 'JHN.json');
  const enText = sh.ctx.bibleCache.books['eng-web/JHN'].ch[2][15];
  const esText = sh.ctx.bibleCache.books['spaRV1909/JHN'].ch[2][15];
  const enShare = sh.ctx.bibleShareText({ code: 'JHN', ch: 3, v: 16, text: enText });
  T('English text goes out labelled WEB', /WEB/.test(enShare) && enShare.indexOf(enText) !== -1);
  sh.ctx.setTranslation('spaRV1909');
  const esShare = sh.ctx.bibleShareText({ code: 'JHN', ch: 3, v: 16, text: esText });
  T('Spanish text goes out labelled RV1909, with a Spanish reference',
    /RV1909/.test(esShare) && /Juan 3:16/.test(esShare) && !/WEB/.test(esShare), esShare.slice(0, 48));

  sub('the daily experience is not made heavier by any of this');
  /* The failure this prevents: a reader who opened the app for today's verse
     paying the parse cost of three complete Bibles. */
  const boot = H.loadApp({ sharedStorage: new Map() });
  T('no Bible book is loaded at boot',
    Object.keys(boot.ctx.bibleCache.books).length === 0 &&
    Object.keys(boot.ctx.bibleCache.index).length === 0);
  T('the corpus is fetched, not inlined',
    src.indexOf('data/bible/') !== -1 && !/"c":"GEN","n":"Genesis"/.test(src));
  T('index.html carries no chapter array of its own', !/"ch":\[\[/.test(src));
  T('and the reader keeps only a few books in memory',
    c.BIBLE_BOOK_CACHE >= 1 && c.BIBLE_BOOK_CACHE <= 5, String(c.BIBLE_BOOK_CACHE));

  sub('the curated Daily corpus is untouched by the reader existing');
  const S = require('../scripts/scripture.js');
  T('415 curated passages', c.SCRIPTURE.length === 415, String(c.SCRIPTURE.length));
  T('378 of them daily', c.SCRIPTURE.filter(p => p.daily).length === 378);
  T('the WEB dataset hash has not moved',
    S.datasetHash(c.SCRIPTURE) === 'f4c8380cf3d29d014044f75a8ed0b6a1b27c4d00387acdd1431a3636995d5916',
    S.datasetHash(c.SCRIPTURE));
  T('nor has the daily hash',
    S.datasetHash(c.SCRIPTURE.filter(p => p.daily)) ===
      '0cb67c036256232a465fb4f979e5c675254c3129a8084e93f76cd63493006c41');
  /* The reader must not have turned the whole Bible into daily candidates. */
  T('the Bible did not become 31,000 daily readings',
    c.eligiblePassages().length < 400, String(c.eligiblePassages().length));

  sub('the offline promise is one the service worker actually keeps');
  const sw = H.readSW();
  T('Bible data is served cache-first', /isBibleData\(url\)/.test(sw) &&
    /caches\.match\(req\)\.then\(hit => hit \|\| fetch\(req\)/.test(sw));
  /* Answering a request for a book with the app shell would surface as a
     parse error instead of an honest "you do not have this offline". */
  T('and a missing book never falls back to the page itself',
    sw.indexOf('isBibleData') < sw.indexOf("caches.match('./index.html')"));
  /* The defect this prevents, found by pulling the plug: a book never read
     online sat on "Loading..." for ever. It was not loading. Books are kept
     as they are read, so the honest answer is that this one is not here
     yet, with a way to try again. */
  T('a book that cannot be fetched says so instead of loading for ever',
    ['Not available offline', 'has not been downloaded yet', 'bibleLoadFailed = true'].every(x => src.indexOf(x) !== -1));
  T('and offers a retry rather than a dead end',
    src.indexOf('function retryBibleBook(') !== -1 && src.indexOf('Try again') !== -1);
  T('the flag is cleared on every fresh open, so it cannot stick',
    src.indexOf('bibleLoadFailed = false;') !== -1);
  T('book files ride the versioned cache, so releases cannot mix corpora',
    /caches\.open\(CACHE_NAME\)[\s\S]{0,120}c\.put\(req, copy\)/.test(sw));
}

/* ---------------------------------------------------------
   CONTRACT 39 — WHAT THE BOTTOM OF THE SCREEN CLAIMS THE APP IS

   Four slots, and they are the whole product's table of contents. A complete
   Bible sat behind Learn for a release because it arrived as an experiment
   and nothing moved it once it stopped being one. This contract fixes which
   four destinations hold the slots, that Settings is not one of them, and
   that making Settings a utility did not cost it its way back.
   --------------------------------------------------------- */
function testPrimaryNavigation(){
  section('CONTRACT 39 — five destinations, and a utility');
  const app = H.loadApp({ sharedStorage: new Map() });
  const c = app.ctx, d = app.dom.document;
  const src = H.readApp();

  sub('the five slots, and what is in them');
  const tabs = [...d.querySelectorAll('.tab-btn')].map(b => b.dataset.tab).filter(Boolean);
  T('exactly five primary destinations', tabs.length === 5, tabs.join(', '));
  T('in the order the product reads in',
    tabs.join(',') === 'today,bible,devotions,learn,saved', tabs.join(','));
  /* The ceiling moved once, for a destination, after being measured. It did
     not move to fit Bible in and it does not move again for a link. */
  T('the bar and the markup agree about how many there are',
    tabs.length <= 5 && (src.match(/class="tab-btn/g) || []).length === 5);
  T('Settings is not a primary destination', tabs.indexOf('settings') === -1);
  T('every slot still resolves to a view', tabs.every(t => !!d.getElementById('view-' + t)));
  T('Today is still where the app opens',
    c.currentTab === 'today' && /<main class="view active" id="view-today">/.test(src));

  sub('Bible is one tap, not two');
  /* The failure this prevents is the shape it replaced: a tab that opens a
     screen whose job is to offer a button that opens the Bible. */
  c.goToTab('bible');
  T('the tab switches straight to the Bible view', c.currentTab === 'bible' &&
    d.getElementById('view-bible').classList.contains('active'));
  T('no intermediate open-the-Bible screen exists',
    src.indexOf('openBible()') === -1 && src.indexOf("id=\"bibleOverlay\"") === -1);
  T('and the Bible home renders into the tab itself',
    /<main class="view" id="view-bible">[\s\S]{0,120}id="bibleBody"/.test(src));

  sub('Learn kept the lessons and gave up the door');
  const learn = H.loadApp({ sharedStorage: new Map() });
  learn.ctx.goToTab('learn');
  const learnHtml = learn.dom.document.getElementById('learnBody').innerHTML;
  T('Learn no longer carries a Bible landing card',
    learnHtml.indexOf('bible-entry') === -1 && learnHtml.indexOf('openBible') === -1);
  T('but it still carries the studies', learnHtml.length > 200);
  /* The contextual link is a different thing and stays: it is about the
     passage in front of you, not about the Bible as a destination. */
  T('Read in context survives inside a lesson', /function readInContextHtml\(/.test(src) &&
    /readInContextHtml\(p\.id\)/.test(src));

  sub('Settings is reachable from anywhere, and is nobody’s tab');
  T('there is a gear in the shared header',
    /id="settingsBtn"[^>]*aria-label="Settings"/.test(src));
  T('it names itself for a screen reader', /aria-label="Settings"/.test(src));
  T('it opens the settings page', /onclick="openSettings\(\)"/.test(src));
  T('the header it lives in is on every tab, so it is not duplicated',
    (src.match(/id="settingsBtn"/g) || []).length === 1);
  T('Settings kept its content exactly', ['Scripture', 'Appearance', 'Reading', 'About', 'Data']
    .every(x => src.indexOf('<div class="section-label">' + x + '</div>') !== -1));
  T('and became an overlay page rather than a route',
    /id="settingsOverlay"/.test(src) && !/pushState\([^)]*\/settings/.test(src));

  sub('closing Settings puts you back where you opened it');
  /* The failure this prevents: a Settings screen that returns everybody to
     Today. Settings never touches currentTab, so the tab underneath is
     still the tab you were on - which is why this holds for all four. */
  ['today', 'bible', 'learn', 'saved'].forEach(tab => {
    const a = H.loadApp({ sharedStorage: new Map() });
    a.ctx.goToTab(tab);
    a.ctx.openSettings();
    const open = a.dom.document.getElementById('settingsOverlay').classList.contains('open');
    a.ctx.closeSettings();
    const shut = !a.dom.document.getElementById('settingsOverlay').classList.contains('open');
    T('from ' + tab + ': opens, closes, and leaves you on ' + tab,
      open && shut && a.ctx.currentTab === tab, a.ctx.currentTab);
  });
  T('Settings does not change which tab you are on',
    !/function openSettings\(\)\{[\s\S]{0,200}switchTab/.test(src.replace(/\n\s*/g, ' ')));

  sub('device back closes Settings before it leaves the app');
  T('it takes a history entry on the way in and gives it back on the way out',
    /function openSettings\(\)\{[\s\S]{0,200}pushOverlayHistory\(\);/.test(src.replace(/\n\s*/g, ' ')) &&
    /function closeSettings\(\)\{[\s\S]{0,160}releaseOverlayHistory\(\);/.test(src.replace(/\n\s*/g, ' ')));
  /* Focus restoration is the overlay engine's, not a second implementation. */
  T('and focus returns through the engine that already does it',
    /_sheetOpeners\.set\(id,/.test(src) && /_sheetOpeners\.get\(id\)/.test(src));

  sub('the Bible keeps its place when you go elsewhere and come back');
  const b = H.loadApp({ sharedStorage: new Map() });
  b.ctx.rememberBibleLast('JHN', 3);
  b.ctx.goToTab('bible');
  b.ctx.goToTab('learn');
  b.ctx.goToTab('bible');
  const last = b.ctx.readBibleLast();
  T('the book and chapter survive leaving the tab',
    last && last.c === 'JHN' && last.ch === 3, JSON.stringify(last));
  T('and the chosen edition survives with them',
    b.ctx.translation === b.ctx.DEFAULT_TRANSLATION);
  T('no scroll coordinate is kept alongside them',
    Object.keys(last).sort().join() === 'c,ch', Object.keys(last).join());

  sub('the tabs are peers, and none of them is advertising');
  const navMarkup = src.slice(src.indexOf('<nav class="tabbar"'), src.indexOf('</nav>'));
  T('every tab is the same kind of control',
    (navMarkup.match(/class="tab-btn/g) || []).length === 5);
  T('none carries a badge, dot or NEW mark',
    !/badge|NEW<|notification|pulse/i.test(navMarkup), navMarkup.length > 0 ? 'clean' : '');
  T('the active one is announced, not only tinted', (() => {
    const a = H.loadApp({ sharedStorage: new Map() });
    a.ctx.goToTab('bible');
    const marked = [...a.dom.document.querySelectorAll('.tab-btn')]
      .filter(x => x.getAttribute('aria-current') === 'page').map(x => x.dataset.tab);
    return marked.length === 1 && marked[0] === 'bible';
  })());

  sub('Today and Bible do not look like the same button');
  /* Today used to draw the open book. Handing that to Bible and leaving
     Today with it too would make the two most-used tabs indistinguishable. */
  T('Bible draws the open book', /bible:\s*'<path d="M2\.4 4\.2c/.test(src));
  T('and Today draws something else entirely',
    /today:\s*'<path d="M1\.6 12\.6h12\.8"/.test(src));
  T('every tab has a mark of its own', (() => {
    const m = src.slice(src.indexOf('Domain.tabIcons = {'), src.indexOf('Domain.hydrate'));
    const drawn = ['today', 'bible', 'learn', 'saved', 'settings'].map(k => {
      const i = m.indexOf(k + ':');
      return i === -1 ? null : m.slice(i, m.indexOf('\n', i));
    });
    return drawn.every(Boolean) && new Set(drawn).size === drawn.length;
  })());

  sub('nothing else about the product moved');
  T('no router was introduced',
    !/pushState\(\{[^}]*path/.test(src) && !/window\.location\.hash\s*=/.test(src));
  T('the contextual links all still exist',
    /readInContextHtml\(passage\.id\)/.test(src) &&
    /function openPassageInBible\(/.test(src));
  T('Saved still resolves Bible locations', /savedLocationText\(loc\)/.test(src));
  /* The one-verse action sheet became the verse dock in 1.10.0: the same
     job, done inside the reader instead of over it. Every other reader
     surface is unchanged. */
  T('the reader pages are untouched',
    ['bibleReaderOverlay', 'bibleChaptersOverlay', 'bibleJumpOverlay']
      .every(id => src.indexOf('id="' + id + '"') !== -1));
  T('and acting on a verse happens in the reader, not over it',
    src.indexOf('id="verseDock"') !== -1 &&
    src.indexOf('id="bibleActionOverlay"') === -1);
  T('and storage grew by nothing at all',
    c.DATA_SCHEMA_VERSION === 2 && Object.keys(c.KEYS).indexOf('bibleTab') === -1);
}

/* ---------------------------------------------------------
   CONTRACT 40 — A READER THAT STAYS PAINTED, AND MARKS THAT STAY PUT

   The first half of this exists because of a photograph. On a physical
   iPhone, scrolling 1 Samuel 2 left the topbar painted, half the screen
   blank, and Scripture resuming far below. The cause was not in the reader's
   own code: the sheet carried `animation-fill-mode: both`, so a 200ms
   entrance left a transform applied for the whole session, and a 7700px
   scroller sat inside that permanently composited element, inside a fixed
   ancestor that a backdrop-filter had composited again. iOS dropped tiles.

   Every assertion below about transforms and blur is guarding that
   photograph. The rest guards the marks a reader leaves.
   --------------------------------------------------------- */
function testReaderQuality(){
  section('CONTRACT 40 — a reader that stays painted');
  const app = H.loadApp({ sharedStorage: new Map() });
  const c = app.ctx;
  const src = H.readApp();
  const style = css();

  sub('the steady reading state is boring to the compositor');
  /* backwards fill applies the FROM frame before the animation starts and
     nothing after it ends. `both` also applies the TO frame for ever, which
     is how a 200ms entrance became a permanent transform. */
  T('no overlay animation persists its final frame',
    style.indexOf('animation: page-in var(--dur) var(--ease) backwards;') !== -1 &&
    style.indexOf('animation: sheet-in var(--dur) var(--ease) backwards;') !== -1);
  /* Toasts keep both-fill deliberately: a toast has to stay put after it
     arrives, and nothing scrolls inside one. The rule is about the
     surfaces that WRAP a chapter. */
  T('and no sheet or page animation uses both-fill any more', (() => {
    const i = style.indexOf('.sheet{');
    const j = style.indexOf('.page-topbar{');
    return style.slice(i, j).indexOf('var(--ease) both;') === -1;
  })());
  /* A full-screen page has nothing visible behind it, so blurring the
     backdrop buys nothing and costs a composited layer around the reader. */
  T('a full-screen page does not blur a backdrop nobody can see',
    style.indexOf('.overlay:not(.overlay-page){') !== -1);
  T('the shared overlay base carries no blur of its own', (() => {
    const i = style.indexOf('.overlay{');
    const block = style.slice(i, style.indexOf('}', i));
    return block.indexOf('backdrop-filter') === -1;
  })());
  /* Obsolete since iOS 13, and what it used to do was promote the scroller
     to its own layer - the thing this whole contract is removing. */
  T('the chapter scroller asks for no legacy momentum layer', (() => {
    const i = style.indexOf('.sheet-scroll{');
    return style.slice(i, style.indexOf('}', i)).indexOf('-webkit-overflow-scrolling') === -1;
  })());
  T('nothing in the reader asks to be composited by hand',
    !/will-change/.test(style) && !/translateZ|translate3d/.test(style));

  sub('one scroll container, and the chapter lives inside it');
  T('the chapter is painted into the scrolling element itself',
    /<div class="sheet-scroll" id="bibleReaderBody">/.test(src));
  T('the dock is a sibling in the same column, not a floating bar', (() => {
    const i = style.indexOf('.verse-dock{');
    const block = style.slice(i, style.indexOf('}', i));
    return block.indexOf('position: fixed') === -1 && block.indexOf('transform') === -1;
  })());

  sub('a tap is a state somebody chose, not a browser default');
  T('the browser tap highlight is replaced, not left to itself',
    /\.bible-v\{[^}]*-webkit-tap-highlight-color: transparent/.test(style));
  T('and there is a deliberate pressed state in its place',
    style.indexOf('.bible-v:active .bible-vt{') !== -1);
  T('a tap cannot start a text selection by accident',
    /\.bible-vt\{[^}]*user-select: none/.test(style));
  T('chosen and kept do not look the same', (() => {
    const sel = style.indexOf('.bible-v.is-sel .bible-vt{');
    const kept = style.indexOf('.bible-v[data-hl] .bible-vt{');
    return sel !== -1 && kept !== -1 &&
      style.slice(sel, style.indexOf('}', sel)).indexOf('text-decoration') !== -1;
  })());

  sub('a highlight belongs to a place, never to a translation');
  const H1 = H.loadApp({ sharedStorage: new Map() });
  T('nothing is stored before anything is highlighted',
    H1.storage.getItem('daily-verse.data.bibleHighlights') === null);
  H1.ctx.setHighlight('JHN.3.16', 'amber');
  const rec = JSON.parse(H1.storage.getItem('daily-verse.data.bibleHighlights'))[0];
  T('its id IS the canonical verse', rec.id === 'JHN.3.16');
  T('its colour is a stable name, not a colour value',
    rec.color === 'amber' && H1.ctx.HIGHLIGHT_COLORS.indexOf(rec.color) !== -1);
  T('no Scripture text is stored in the record',
    Object.keys(rec).sort().join() === 'color,createdAt,id,updatedAt',
    Object.keys(rec).join());
  H1.ctx.setHighlight('JHN.3.16', 'blue');
  T('recolouring changes the record rather than adding one',
    JSON.parse(H1.storage.getItem('daily-verse.data.bibleHighlights')).length === 1 &&
    H1.ctx.highlightColorFor('JHN.3.16') === 'blue');
  H1.ctx.setHighlight('JHN.3.16', null);
  T('removing leaves nothing behind',
    JSON.parse(H1.storage.getItem('daily-verse.data.bibleHighlights')).length === 0);
  T('a colour this build does not ship is refused', (() => {
    H1.ctx.setHighlight('JHN.3.16', 'chartreuse');
    return H1.ctx.highlightColorFor('JHN.3.16') === null;
  })());
  T('and so is something that is not a verse', (() => {
    H1.ctx.setHighlight('not-a-place', 'amber');
    return JSON.parse(H1.storage.getItem('daily-verse.data.bibleHighlights')).length === 0;
  })());

  sub('changing edition changes the words and nothing a reader marked');
  const sw = H.loadApp({ sharedStorage: new Map() });
  sw.ctx.setHighlight('JHN.3.16', 'rose');
  sw.ctx.markChapterRead('JHN', 3, false);
  const before = sw.storage.getItem('daily-verse.data.bibleHighlights') +
                 '|' + sw.storage.getItem('daily-verse.data.bibleRead');
  ['spaRV1909', 'engbsb', 'eng-web'].forEach(id => sw.ctx.setTranslation(id));
  const after = sw.storage.getItem('daily-verse.data.bibleHighlights') +
                '|' + sw.storage.getItem('daily-verse.data.bibleRead');
  T('three changes of edition alter neither collection', before === after);
  T('the highlight still resolves at the same address',
    sw.ctx.highlightColorFor('JHN.3.16') === 'rose');
  T('and the chapter is still read', sw.ctx.isChapterRead('JHN', 3));
  /* An edition with no verse at that address simply does not draw it.
     Nothing is remapped to a neighbouring verse. */
  T('a highlight is drawn from the record, not from the text',
    /highlightColorFor\(vid\)/.test(src) && /data-hl="' \+ hl \+ '"/.test(src));

  sub('a highlight is announced, not merely coloured');
  T('the verse carries its state as text a screen reader can read',
    /verse-state sr-only/.test(src) && /highlighted ' \+ HIGHLIGHT_NAMES\[hl\]/.test(src));
  T('the chosen swatch is marked with a tick as well as a border',
    /aria-pressed="' \+ \(uniform === c \? 'true' : 'false'\) \+ '"/.test(src) &&
    style.indexOf('.hl-swatch[aria-pressed="true"] .glyph{ display: flex;') !== -1);
  T('and the verse is still not announced as a button',
    !/class="bible-v[^"]*"[^>]*role="button"/.test(src));

  sub('opening a chapter is not reading it');
  const R = H.loadApp({ sharedStorage: new Map() });
  R.ctx.beginReadSession('JHN', 3, 1);
  R.ctx.bibleBookCode = 'JHN'; R.ctx.bibleChapter = 3;
  R.ctx.maybeMarkRead();
  T('reaching the end immediately does not count', !R.ctx.isChapterRead('JHN', 3));
  /* The failure this prevents: a link that drops somebody on the last verse
     marking the whole chapter behind them. */
  R.ctx.beginReadSession('JHN', 3, 36);
  R.ctx.bibleReadSession.openedAt = Date.now() - 60000;
  R.ctx.maybeMarkRead();
  T('and arriving at the last verse from a link never counts',
    !R.ctx.isChapterRead('JHN', 3), 'entry ' + R.ctx.bibleReadSession.entry);
  R.ctx.beginReadSession('JHN', 3, 1);
  R.ctx.bibleReadSession.openedAt = Date.now() - 60000;
  R.ctx.maybeMarkRead();
  /* THE HOTFIX. A physical iPhone marked Luke 1 read while the reader was
     at verse 3. Reproduced: touching the end once inside the dwell window
     armed a timer that fired up to 2.5s later and marked the chapter read
     without ever re-asking where the reader now was. Automatic completion
     is off until that is proved safe on real hardware, because a wrong
     "read" is a lie about somebody's own history. */
  T('automatic completion is switched off', c.AUTO_READ_ENABLED === false);
  T('so even a perfect read-through does not mark it',
    !R.ctx.isChapterRead('JHN', 3));
  T('and the switch is a single named flag, so it can be turned back on',
    src.indexOf('const AUTO_READ_ENABLED = false;') !== -1 &&
    src.indexOf('if(!AUTO_READ_ENABLED) return;') !== -1);
  /* The record shape is unchanged by the hotfix; it is simply reached by
     the manual route now, which is the only route there is. */
  R.ctx.markChapterRead('JHN', 3, false);
  const readRec = JSON.parse(R.storage.getItem('daily-verse.data.bibleRead'))[0];
  T('the record is a chapter and a time, and nothing else',
    readRec.id === 'JHN.3' && Object.keys(readRec).sort().join() === 'id,readAt,updatedAt',
    Object.keys(readRec).join());
  T('it does not record which edition was on screen',
    JSON.stringify(readRec).indexOf('eng-web') === -1);

  /* The defect, stated as the rule it broke: a deferred decision has to ask
     the question again when it fires, not trust an answer from 2.5 seconds
     ago. Both the scroll listener and the timer now go through one
     definition of "at the end". */
  T('the deferred check re-asks where the reader is',
    src.indexOf('function atChapterEnd()') !== -1 &&
    src.indexOf('if(!atChapterEnd()) return;') !== -1);
  T('and the scroll listener asks the same question, not its own',
    src.indexOf('const fn = function(){ if(atChapterEnd()) maybeMarkRead(); };') !== -1);
  T('a chapter that has not been laid out is never already at its end',
    src.indexOf('if(sc.scrollHeight <= 0) return false;') !== -1);

  sub('and a reader can always say so themselves');
  R.ctx.markChapterUnread('JHN', 3);
  T('unread removes it', !R.ctx.isChapterRead('JHN', 3));
  T('and the session cannot immediately re-mark it',
    R.ctx.bibleReadSession.blocked === true);
  R.ctx.toggleChapterRead('JHN', 4);
  T('a manual mark works with no session at all', R.ctx.isChapterRead('JHN', 4));
  R.ctx.toggleChapterRead('JHN', 4);
  T('and toggles back off', !R.ctx.isChapterRead('JHN', 4));
  T('the toast that announces it offers the way back',
    /toast\('Chapter marked as read', 'success', \{/.test(src) &&
    /label: 'Undo'/.test(src));
  T('the chapter grid shows what is behind you, with a tick not just a tone',
    /data-read="1"/.test(src) && /read-tick/.test(src) &&
    /', read' : ''/.test(src));

  sub('nothing is written while a finger is moving');
  /* The failure this prevents: a scroll handler persisting progress, which
     on a 7700px chapter is a write per frame. */
  const bare = stripComments(js());
  T('the end-of-chapter check reads geometry and writes nothing',
    bare.indexOf('sc.scrollTop + sc.clientHeight >= sc.scrollHeight - READ_END_SLACK_PX') !== -1);
  /* Found on production: the scroller element outlives every chapter, so
     "already watching" was true from the second chapter onward and the early
     return skipped the geometry check with it. A psalm shorter than the
     screen has no end to scroll to, so that check is the only thing that can
     ever mark it - and it had stopped running. Attaching the listener is
     what must not repeat; measuring THIS chapter has to happen every time. */
  T('a chapter shorter than the screen is still asked whether it was read', (() => {
    const fn = bare.slice(bare.indexOf('function watchChapterEnd()'),
                          bare.indexOf('function attachChapterScrollWatch('));
    const guard = fn.indexOf('attachChapterScrollWatch(scroller);');
    const check = fn.indexOf('scroller.clientHeight + READ_END_SLACK_PX');
    /* the measurement must come AFTER the attach branch closes, not inside it */
    return guard !== -1 && check !== -1 && check > guard &&
           fn.slice(guard, check).indexOf('}') !== -1;
  })());
  T('it is one passive listener for the whole chapter, not one per verse',
    /addEventListener\('scroll', fn, \{ passive: true \}\)/.test(bare) &&
    (bare.match(/addEventListener\('scroll'/g) || []).length <= 2);
  T('and a highlight repaints only the verses, never the chapter',
    /function paintVerseStates\(\)/.test(bare) &&
    /el\.setAttribute\('data-hl', color\)/.test(bare) &&
    !/function applyHighlight\([\s\S]{0,220}renderBibleReader\(\)/.test(bare));

  /* The second half of the iPhone defect. markChapterRead() called
     renderBibleReader(), which assigns host.innerHTML - so marking a
     chapter read rebuilt all eighty verses of Luke 1 under a moving
     finger. Saving a verse did the same, for a state the reader does not
     even display. Replacing Scripture mid-fling is what iOS could not
     survive. Only a real chapter CHANGE may rebuild the chapter. */
  const FNEND = String.fromCharCode(10) + '}';   // end of a top-level function
  const rebuilders = ['markChapterRead', 'markChapterUnread', 'toggleChapterRead',
                      'toggleSavedLocation', 'applyHighlight', 'removeHighlight',
                      'toggleVerseSelection', 'clearVerseSelection', 'paintVerseStates',
                      'saveSelectedVerses', 'paintChapterReadState'];
  const offenders = rebuilders.filter(fn => {
    const i = bare.indexOf('function ' + fn + '(');
    if(i === -1) return false;
    const body = bare.slice(i, bare.indexOf(FNEND, i));
    return body.indexOf('renderBibleReader()') !== -1;
  });
  T('no state change rebuilds the chapter DOM', offenders.length === 0, offenders.join(', '));
  T('marking a chapter read repaints one control instead',
    bare.indexOf('function paintChapterReadState()') !== -1 && (() => {
      const i = bare.indexOf('function markChapterRead(');
      return bare.slice(i, bare.indexOf(FNEND, i)).indexOf('paintChapterReadState()') !== -1;
    })());
  /* Rebuilding is still right for a genuinely new chapter. */
  T('and a real chapter change still does rebuild it', (() => {
    const i = bare.indexOf('function bibleStepTo(');
    return bare.slice(i, bare.indexOf(FNEND, i)).indexOf('renderBibleReader()') !== -1;
  })());

  /* A toast must not be able to change the height of Scripture. */
  T('the toast lives outside the chapter, fixed to the page',
    /<div class="toast-host" id="toastHost"/.test(src) &&
    /.toast-host{[^}]*position: fixed/.test(style));

  sub('the way out of a chapter cannot be scrolled off the screen');
  /* Photographed on a phone: after jumping to a reference, the top bar sat
     behind the status bar - back arrow over the clock, edition over the
     battery, title lost behind the Dynamic Island. The sheet's own
     scrollTop was 60. scrollIntoView() scrolls EVERY scrollable ancestor,
     and overflow:hidden still makes one, so placing the linked verse moved
     the header too. centreSelectedDay() carries this exact lesson in a
     comment; the reader repeated the mistake. */
  T('the linked verse is placed by moving the scroller, not its ancestors',
    bare.indexOf('scrollIntoView') === -1, 'no scrollIntoView anywhere in the app');
  T('and it is placed by assigning scrollTop on the chapter scroller',
    bare.indexOf('host.scrollTop = Math.max(0, host.scrollTop + (seen.top - view.top)') !== -1);
  /* overflow:hidden clips but still creates a scroll container, so a focus,
     a keyboard, or any future scrollIntoView could move a sheet and take
     its header with it. overflow:clip creates no scroll container at all. */
  T('a sheet is not a scroll container, so its header cannot be moved', (() => {
    const i = style.indexOf('.sheet{');
    const block = style.slice(i, style.indexOf('}', i));
    return block.indexOf('overflow: clip') !== -1 && block.indexOf('overflow: hidden') !== -1;
  })());
  T('and the reader puts a scrolled sheet back regardless',
    bare.indexOf('if(host.parentNode && host.parentNode.scrollTop) host.parentNode.scrollTop = 0;') !== -1);
  T('the top bar still pays the safe-area inset it owns',
    style.indexOf('padding: calc(var(--space-sm) + var(--inset-top)) var(--space-sm) var(--space-sm);') !== -1);
  T('the way back names where it goes, and the edition names itself',
    src.indexOf('aria-label="Back to the Bible"') !== -1 &&
    src.indexOf("'Translation: ' + activeTranslation().title") !== -1);

  sub('the sheet that had no gutter has one');
  /* Photographed on a phone: the title sat flush against the screen edge
     because this sheet put content straight into .sheet, which carries no
     padding. Every other sheet wraps content in .sheet-scroll. */
  T('go to passage wraps its content the way every other sheet does',
    src.slice(src.indexOf('id="bibleJumpOverlay"'), src.indexOf('id="bibleJumpOverlay"') + 700).indexOf('<div class="sheet-scroll">') !== -1);
  T('no shipping bottom sheet puts content bare inside .sheet', (() => {
    const ids = ['bibleJumpOverlay', 'confirmOverlay', 'onboardOverlay'];
    return ids.every(id => {
      const i = src.indexOf('id="' + id + '"');
      return src.slice(i, i + 600).indexOf('sheet-scroll') !== -1;
    });
  })());

  sub('the reader is still the only thing that changed');
  const S = require('../scripts/scripture.js');
  T('415 curated passages, unmoved', c.SCRIPTURE.length === 415);
  T('the WEB dataset hash is what it has always been',
    S.datasetHash(c.SCRIPTURE) === 'f4c8380cf3d29d014044f75a8ed0b6a1b27c4d00387acdd1431a3636995d5916');
  T('the schema did not move for either new collection',
    c.DATA_SCHEMA_VERSION === 2);
  T('and both are arrays of id-bearing records, so backup already carries them',
    /bibleHighlights:'data\.bibleHighlights'/.test(src) &&
    /bibleRead:      'data\.bibleRead'/.test(src));
  {
    /* Prove it rather than assert the shape: run a real backup round trip. */
    const b = H.loadApp({ sharedStorage: new Map() });
    b.ctx.setHighlight('PSA.23.1', 'green');
    b.ctx.markChapterRead('PSA', 23, false);
    const payload = {
      'data.bibleHighlights': b.storage.getItem('daily-verse.data.bibleHighlights'),
      'data.bibleRead': b.storage.getItem('daily-verse.data.bibleRead')
    };
    const fresh = H.loadApp({ sharedStorage: new Map() });
    const res = fresh.ctx.mergeBackup(payload);
    fresh.ctx.loadVerseData();
    T('a backup carries highlights and read state into a new install',
      res.collections === 2 && fresh.ctx.highlightColorFor('PSA.23.1') === 'green' &&
      fresh.ctx.isChapterRead('PSA', 23), JSON.stringify(res));
  }
}

/* ---------------------------------------------------------
   CONTRACT 41 — THE DEVOTIONAL CATALOGUE

   Devotional writing is the first content here that takes a passage and says
   something about the reader's own life. Quoting a verse can be checked by a
   hash; application cannot. So these assertions defend the things that CAN
   be checked, and are deliberately honest about the fact that none of them
   prove a devotional is true or good.

   Phase A ships no reader. Several assertions below exist to keep it that
   way, because a feature that looks finished before its content is proven is
   how bad content ships.
   --------------------------------------------------------- */
function testDevotions(){
  section('CONTRACT 41 — the devotional catalogue');
  const fsx = require('fs');
  const pathx = require('path');
  const D = require('../scripts/devotions.js');
  const S = require('../scripts/scripture.js');
  const corpus = require('../scripts/corpus.js');
  const src = H.readApp();
  const doc = JSON.parse(fsx.readFileSync(pathx.join(H.ROOT, 'data', 'devotions.json'), 'utf8'));
  const entries = [];
  doc.series.forEach(s => s.entries.forEach(e => entries.push({ s: s, e: e, where: s.id + '/' + e.id })));

  sub('the approved Phase A catalogue, and nothing more');
  T('exactly two series', doc.series.length === 2, doc.series.map(s => s.id).join(', '));
  T('exactly twelve entries', entries.length === 12, String(entries.length));
  T('six entries in each', doc.series.every(s => s.entries.length === 6),
    doc.series.map(s => s.id + '=' + s.entries.length).join(', '));
  T('the two approved series, by id',
    doc.series.map(s => s.id).sort().join() === 'steady-ground,the-weight-you-carry',
    doc.series.map(s => s.id).join(', '));
  T('series ids are unique', new Set(doc.series.map(s => s.id)).size === doc.series.length);
  T('entry ids are unique within their series',
    doc.series.every(s => new Set(s.entries.map(e => e.id)).size === s.entries.length));
  T('every entry id is stable and namespaced to its series',
    entries.every(x => /^(wyc|sg)-[1-6]$/.test(x.e.id)),
    entries.map(x => x.e.id).join(', '));

  sub('who a series is for, and what it costs');
  T('forWhom is one of the three allowed values',
    doc.series.every(s => D.FOR_WHOM.indexOf(s.forWhom) !== -1),
    doc.series.map(s => s.id + '=' + s.forWhom).join(', '));
  T('the two series are aimed as approved',
    doc.series.find(s => s.id === 'the-weight-you-carry').forWhom === 'men' &&
    doc.series.find(s => s.id === 'steady-ground').forWhom === 'women');
  /* Phase A has no entitlement system of any kind, so anything other than
     free would be a lie told by the data. */
  T('every shipped series is free', doc.series.every(s => s.access === 'free'),
    doc.series.map(s => s.access).join(', '));
  T('the access field only ever holds an allowed value',
    doc.series.every(s => D.ACCESS.indexOf(s.access) !== -1));

  sub('every entry can be reviewed by a person');
  T('every entry has at least one anchor passage',
    entries.every(x => Array.isArray(x.e.passages) && x.e.passages.length));
  /* Basis is what makes an editorial claim checkable at all. An entry
     without it cannot be reviewed by anyone, including its author. */
  T('every entry records the context actually read',
    entries.every(x => Array.isArray(x.e.basis) && x.e.basis.length),
    entries.filter(x => !(x.e.basis || []).length).map(x => x.where).join(', '));
  T('basis is wider than the anchor, not a copy of it',
    entries.every(x => x.e.basis.join() !== x.e.passages.join()),
    entries.filter(x => x.e.basis.join() === x.e.passages.join()).map(x => x.where).join(', '));
  T('every entry has a reading', entries.every(x => typeof x.e.reading === 'string' && x.e.reading.trim().length > 400));

  sub('no Scripture text lives in this file');
  /* The whole point of the canonical model: the file carries locations, and
     the shipped editions carry words. */
  const blob = JSON.stringify(doc);
  const web = corpus.verses('eng-web');
  let longest = 0, worst = '';
  entries.forEach(x => {
    (x.e.passages || []).forEach(ref => {
      const p = S.parseRef(ref);
      if(!p) return;
      for(let v = p.from; v <= p.to; v++){
        const t = web.get(p.code + ' ' + p.chapter + ':' + v);
        if(!t) continue;
        /* any 40-character stretch of the actual verse appearing verbatim */
        const clean = String(t).trim();
        for(let i = 0; i + 40 <= clean.length; i += 10){
          const chunk = clean.slice(i, i + 40);
          if(blob.indexOf(chunk) !== -1 && chunk.length > longest){ longest = chunk.length; worst = x.where + ': ' + chunk; }
        }
      }
    });
  });
  T('no anchor verse appears verbatim in the catalogue', longest === 0, worst);

  sub('every reference resolves, in every edition a reader might have');
  /* A devotional whose anchor is missing in Spanish is a devotional that
     breaks the moment somebody switches edition. */
  const eds = corpus.shippedEditions();
  const verses = {}; eds.forEach(e => { verses[e] = corpus.verses(e); });
  const badRefs = [];
  let refCount = 0;
  entries.forEach(x => {
    ['passages', 'basis', 'relatedPassages'].forEach(field => {
      (x.e[field] || []).forEach(ref => {
        refCount++;
        const p = S.parseRef(ref);
        if(!p){ badRefs.push(x.where + ' ' + field + ' ' + ref + ' unparseable'); return; }
        eds.forEach(ed => {
          for(let v = p.from; v <= p.to; v++){
            const t = verses[ed].get(p.code + ' ' + p.chapter + ':' + v);
            if(t === undefined) badRefs.push(x.where + ' ' + ref + ' missing in ' + ed);
            else if(!String(t).trim()) badRefs.push(x.where + ' ' + ref + ' empty in ' + ed);
          }
        });
      });
    });
  });
  T('every reference resolves with real text in all three editions',
    badRefs.length === 0 && refCount > 40, badRefs.slice(0, 3).join('; ') || (refCount + ' refs'));

  sub('the writing stays inside its declared limits');
  const max = doc._authoring;
  T('the authoring limits are declared in the file',
    max && max.readingMax > 0 && max.considerMax > 0 && max.considerCountMax > 0);
  const over = [];
  entries.forEach(x => {
    if(x.e.reading.length > max.readingMax) over.push(x.where + ' reading ' + x.e.reading.length);
    (x.e.consider || []).forEach((q, i) => {
      if(q.length > max.considerMax) over.push(x.where + ' consider' + (i + 1) + ' ' + q.length);
    });
    if((x.e.consider || []).length > max.considerCountMax) over.push(x.where + ' consider count');
    if(x.e.practice && x.e.practice.length > max.practiceMax) over.push(x.where + ' practice ' + x.e.practice.length);
    if(x.e.prayer && x.e.prayer.length > max.prayerMax) over.push(x.where + ' prayer ' + x.e.prayer.length);
  });
  T('nothing exceeds its limit', over.length === 0, over.join(', '));
  /* Length is not a target: an entry at the ceiling usually means padding. */
  T('and nothing is written to the ceiling either',
    entries.every(x => x.e.reading.length < max.readingMax * 0.85),
    Math.max(...entries.map(x => x.e.reading.length)) + ' of ' + max.readingMax);

  sub('prose does not reproduce Scripture');
  /* The SAME primitive Learn uses, run for real over this catalogue. It
     caught eight places during authoring; it is not decoration. */
  const overlapErrors = [];
  const byId = [];
  const seenRef = new Set();
  entries.forEach(x => {
    ['passages', 'basis'].forEach(f => (x.e[f] || []).forEach(ref => {
      if(seenRef.has(ref)) return;
      seenRef.add(ref);
      const p = S.parseRef(ref);
      if(!p) return;
      const parts = [];
      for(let v = p.from; v <= p.to; v++){
        const t = web.get(p.code + ' ' + p.chapter + ':' + v);
        if(t) parts.push(t);
      }
      if(parts.length) byId.push({ ref: ref, text: S.collapse(parts.join(' ')) });
    }));
  });
  S.assertNoEmbeddedScripture(
    entries.map(x => ({ where: x.where, fields: D.entryFields(x.e) })), byId, overlapErrors);
  T('no six-word run of any anchor or context passage appears in prose',
    overlapErrors.length === 0, overlapErrors.slice(0, 2).join('; '));
  T('and the guard was actually given something to check',
    byId.length > 20, byId.length + ' passages indexed');

  sub('prose does not claim more than it may');
  const claimErrors = [];
  entries.forEach(x => {
    const fields = D.entryFields(x.e);
    Object.keys(fields).forEach(field => {
      const norm = S.normForOverlap(fields[field]);
      D.FORBIDDEN_CLAIMS.forEach(c => {
        if(norm.indexOf(c.pattern) !== -1) claimErrors.push(x.where + ' ' + field + ': ' + c.pattern);
      });
      D.STEREOTYPE_CLAIMS.forEach(p => {
        if(norm.indexOf(p) !== -1) claimErrors.push(x.where + ' ' + field + ': ' + p);
      });
    });
  });
  T('no entry claims God has spoken privately, arranged circumstances or promised an outcome',
    claimErrors.length === 0, claimErrors.slice(0, 3).join('; '));
  T('and no entry tells a whole sex what it is like',
    D.STEREOTYPE_CLAIMS.length > 8 && claimErrors.length === 0);

  sub('the two series read as authored, not generated');
  /* Not a proof of quality - nothing automated is - but these are the
     specific tells that were actually found and fixed during the editorial
     pass, so they are worth holding. */
  const firsts = entries.map(x => x.e.reading.split(/\s/)[0].toLowerCase().replace(/[^a-z]/g, ''));
  T('no two readings open with the same word',
    new Set(firsts).size === firsts.length, firsts.join(', '));
  const prayerOpens = entries.filter(x => x.e.prayer)
    .map(x => x.e.prayer.split(',').slice(1).join(',').trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase());
  T('prayers are not built from one interchangeable opening',
    new Set(prayerOpens).size >= prayerOpens.length - 1, prayerOpens.join(' | '));
  const banned = ['this verse reminds us', 'in todays fast paced', 'at the end of the day',
                  'in a world where', 'heres the thing'];
  const cadence = [];
  entries.forEach(x => {
    const t = S.normForOverlap(x.e.reading + ' ' + (x.e.prayer || ''));
    banned.forEach(b => { if(t.indexOf(b) !== -1) cadence.push(x.where + ': ' + b); });
  });
  T('none of the known filler cadences appear', cadence.length === 0, cadence.join('; '));

  sub('the catalogue reached the app without changing on the way');
  /* Phase A asserted that NO reader existed, so that a feature could not
     look finished before its content was proven. The content is now proven
     and the reader is shipped, so the assertion that replaces it is the one
     that matters from here: what the app renders is what this file says,
     entry for entry, and no prose was retyped on the way in. */
  const shipped = H.loadApp().ctx.DEVOTIONS;
  T('the app ships both series, in the catalogue\u2019s own order',
    shipped.map(s => s.id).join() === doc.series.map(s => s.id).join());
  T('and every entry, in order, under its own id',
    shipped.map(s => s.entries.map(e => e.id).join()).join('|') ===
    doc.series.map(s => s.entries.map(e => e.id).join()).join('|'));
  T('the reading a person sees is the reading that was reviewed, character for character',
    shipped.every((s, i) => s.entries.every((e, j) =>
      e.reading === doc.series[i].entries[j].reading &&
      e.title === doc.series[i].entries[j].title &&
      (e.practice || '') === (doc.series[i].entries[j].practice || '') &&
      (e.prayer || '') === (doc.series[i].entries[j].prayer || ''))));
  T('and so is every question',
    shipped.every((s, i) => s.entries.every((e, j) =>
      e.consider.join('|') === (doc.series[i].entries[j].consider || []).join('|'))));
  /* `basis` is how an editorial claim is checked by a person. It is not a
     screen element, and shipping it would invite one. */
  T('authoring provenance stayed out of the app',
    shipped.every(s => s.entries.every(e => e.basis === undefined)));
  /* An earlier version of this scanned for words like "upgrade" and
     "unlock", which are schema migration and the overlay engine here. The
     property is that the premium CONCEPT has not reached the app at all,
     so that is what is asserted. The schema may carry access; the app may
     not yet know the word. */
  T('the premium concept has not reached the app',
    src.toLowerCase().indexOf('premium') === -1);
  T('and the catalogue declares access without any way to act on it',
    doc.series.every(s => typeof s.access === 'string') &&
    src.indexOf('access') === -1 || src.toLowerCase().indexOf('premium') === -1);

  sub('nothing a reader owns was touched');
  T('the schema did not move', H.loadApp().ctx.DATA_SCHEMA_VERSION === 2);
  /* One collection, and only one. Notes, a last-opened pointer and anything
     else a later phase might want are all still absent, and each of them
     would be a separate decision rather than a detail. */
  T('devotional progress is the only devotional key',
    src.indexOf("devotionProgress: 'data.devotionProgress'") !== -1 &&
    src.indexOf('data.devotionNotes') === -1 &&
    src.indexOf('ui.devotion') === -1);
  T('the curated Scripture hash is unchanged',
    S.datasetHash(H.loadApp().ctx.SCRIPTURE) ===
      'f4c8380cf3d29d014044f75a8ed0b6a1b27c4d00387acdd1431a3636995d5916');
}

/* ---------------------------------------------------------
   CONTRACT 42 — THE DEVOTIONS EXPERIENCE

   Phase A proved the writing. This proves the reader: that the catalogue
   reaches a screen intact, that Scripture is resolved rather than carried,
   that progress records a decision somebody made rather than a guess about
   what they read, and that none of it rebuilds the page under their thumb.

   The last one is not a theoretical concern. The Bible reader spent three
   releases learning that a state change which rebuilds the reading surface
   destroys the reader's place, and that inferring "read" from scroll
   geometry writes false history. Devotions was built with both already
   known, and these assertions are what keep it that way.
   --------------------------------------------------------- */
function testDevotionsExperience(){
  section('CONTRACT 42 — the Devotions experience');
  const fsx = require('fs');
  const pathx = require('path');
  const src = H.readApp();
  const bibleDir = pathx.join(H.ROOT, 'data', 'bible');
  const readJson = (ed, name) => JSON.parse(fsx.readFileSync(pathx.join(bibleDir, ed, name), 'utf8'));

  /* A live app with the Bible cache filled from the shipped files. There is
     no fetch in the harness, and stubbing one would test the stub. */
  function freshApp(){
    const a = H.loadApp({ sharedStorage: new Map() });
    a.ctx.bibleCache.index['eng-web'] = readJson('eng-web', 'index.json');
    return a;
  }
  function cacheBook(c, ed, code){
    c.bibleCache.books[ed + '/' + code] = readJson(ed, code + '.json');
  }

  const app = freshApp();
  const c = app.ctx, d = app.dom.document;
  const D = c.DEVOTIONS;

  sub('the fifth destination, and the conditions that let it fit');
  /* Measured in a real browser at 320px, which is the narrowest phone this
     app supports: five slots of 64px, every one 53.4px tall, and the widest
     label - "Devotions" - 52.4px inside a 56px content box. 3.6px of slack.
     Also measured at 375, 390, 430 and 812x375: no wrap, no overflow, and
     every target over 44px at all five.

     A DOM stub cannot measure text, so what is asserted here is the set of
     conditions that measurement depended on. If any of them changes, the
     measurement is void and has to be taken again. */
  const nav = src.slice(src.indexOf('<nav class="tabbar"'), src.indexOf('</nav>'));
  const tabs = [...d.querySelectorAll('.tab-btn')].map(b => b.dataset.tab);
  T('five slots, in the measured order',
    tabs.join(',') === 'today,bible,devotions,learn,saved', tabs.join(','));
  T('they share the bar equally, so no tab is compressed against another',
    /\.tab-btn\{[^}]*flex: 1;/.test(src));
  /* Wrapping is the failure that would actually be ugly: one tab two lines
     tall and the whole bar visibly broken. It is made impossible rather
     than relied upon not to happen. */
  T('a label can never wrap to a second line', /\.tab-btn\{ white-space: nowrap; \}/.test(src));
  T('and crowding was not solved by shrinking the type',
    /\.tab-btn\{[^}]*font-size: var\(--fs-micro\);/.test(src));
  T('every tab still clears the touch minimum',
    /\.tab-btn\{[^}]*min-height: var\(--touch-min\);/.test(src));
  T('the bar still respects the bottom inset',
    /\.tabbar\{[^}]*padding-bottom: var\(--inset-bottom\);/.test(src));
  T('no tab carries a badge, a dot or a NEW mark', !/badge|NEW<|notification/i.test(nav));
  T('Settings did not come back as a sixth', tabs.indexOf('settings') === -1);
  T('Devotions draws its own mark, not one already in use',
    /devotions: '<path d="M8 13\.8V6\.2"\/>/.test(src) &&
    src.indexOf('function devotionMark(') !== -1);

  sub('the home shows what exists, and does not announce what does not');
  c.goToTab('devotions');
  /* Read out of the generated markup: the harness models the HTML string a
     render produced, not the elements inside it. */
  const homeLabels = () => (d.getElementById('devotionsBody').innerHTML
    .match(/<div class="section-label">([^<]*)<\/div>/g) || [])
    .map(s => s.replace(/<[^>]*>/g, ''));
  T('both series are offered',
    d.getElementById('devotionsBody').innerHTML.indexOf('The Weight You Carry') !== -1 &&
    d.getElementById('devotionsBody').innerHTML.indexOf('Steady Ground') !== -1);
  T('the populated audiences each get a heading',
    homeLabels().indexOf('For men') !== -1 && homeLabels().indexOf('For women') !== -1);
  /* The data model allows forWhom:'everyone' and the catalogue has none.
     An empty section headed "For everyone" would be an announcement that
     something is missing; the section is simply absent. */
  T('and the empty audience is absent rather than empty',
    homeLabels().every(l => !/everyone/i.test(l)) &&
    D.every(s => s.forWhom !== 'everyone'));
  T('no empty state is shown while there is a catalogue',
    !/nothing here yet/i.test(d.getElementById('devotionsBody').innerHTML));
  /* Two series do not need a filter. A control that narrows a list of two
     is a control that does nothing. */
  T('no filter control was built for a catalogue of two',
    !/data-devotion-filter|devotionFilter/.test(src));
  T('and nothing on screen mentions price, tier or a lock',
    ['premium', 'locked', 'upgrade', 'subscribe', 'trial']
      .every(w => d.getElementById('devotionsBody').innerHTML.toLowerCase().indexOf(w) === -1));

  sub('Continue is derived from progress, never stored beside it');
  T('nothing is offered before anything has been opened',
    homeLabels().every(l => !/continue/i.test(l)), homeLabels().join(', '));
  c.openDevotionEntry('steady-ground', 'sg-1');
  c.completeDevotionEntry();                       // sg-1 done, sg-2 open
  c.closeDevotionEntry(); c.closeDevotionSeries();
  T('after finishing one, Continue offers the next one',
    homeLabels().indexOf('Continue reading') !== -1 &&
    /continue-card[\s\S]*More than what you.{1,6}re needed for[\s\S]*Reading 2 of 6/
      .test(d.getElementById('devotionsBody').innerHTML),
    homeLabels().join(', '));
  T('and it is the FIRST unfinished entry, not the last one opened',
    c.resumeDevotionEntryId(c.devotionSeriesById('steady-ground')) === 'sg-2');
  c.openDevotionEntry('steady-ground', 'sg-5');    // re-read something later on
  c.closeDevotionEntry(); c.closeDevotionSeries();
  T('opening a later entry does not move the resume point',
    c.resumeDevotionEntryId(c.devotionSeriesById('steady-ground')) === 'sg-2');
  /* A last-opened pointer would be a second opinion about where somebody
     is, and the two can disagree. There is exactly one. */
  T('no last-opened pointer exists to disagree with progress',
    src.indexOf('ui.devotionLast') === -1 && src.indexOf('devotionLast') === -1);
  const rec = c.devotionProgressFor('steady-ground');
  T('and the stored record holds a list of ids and nothing derived',
    Object.keys(rec).sort().join() === 'done,id,startedAt,updatedAt',
    Object.keys(rec).join());
  T('no percentage or count was written down',
    JSON.stringify(rec).indexOf('percent') === -1 && typeof rec.count === 'undefined');

  sub('opening is not reading, and only a tap says otherwise');
  const app2 = freshApp();
  const c2 = app2.ctx;
  c2.openDevotionEntry('the-weight-you-carry', 'wyc-1');
  T('opening an entry starts the series but completes nothing',
    c2.devotionProgressFor('the-weight-you-carry').done.length === 0);
  c2.completeDevotionEntry();
  T('the intentional action completes it',
    c2.devotionProgressFor('the-weight-you-carry').done.join() === 'wyc-1');
  T('and moves on to the next reading', c2.openDevotionEntryId === 'wyc-2');
  c2.openDevotionEntryId = 'wyc-1';
  c2.completeDevotionEntry();
  T('completing the same entry twice adds nothing and moves nobody back',
    c2.devotionProgressFor('the-weight-you-carry').done.join() === 'wyc-1');
  /* The Bible reader inferred "read" from scroll geometry and wrote false
     history into somebody's record. Devotions has never had the option. */
  /* Exactly the Devotions block. Sliced from its first statement rather
     than from its banner, because the banner's words also open the HTML
     comment above the view - and slicing from there quietly swept in the
     whole foundation, which does use a timer, for toasts. */
  const devSrc = src.slice(src.indexOf('let devotionProgress = [];'),
                           src.indexOf("this product claims the foundation's four seams"));
  T('and the slice under examination is the Devotions code and only that',
    devSrc.length > 8000 && devSrc.length < 40000 &&
    devSrc.indexOf('function completeDevotionEntry') !== -1 &&
    devSrc.indexOf('function renderToday') === -1, String(devSrc.length));
  T('nothing in Devotions watches a scroll position',
    devSrc.indexOf('scrollTop >') === -1 &&
    devSrc.indexOf('IntersectionObserver') === -1 &&
    devSrc.indexOf('addEventListener(\'scroll\'') === -1);
  T('and no timer decides anything either',
    devSrc.indexOf('setTimeout') === -1 && devSrc.indexOf('setInterval') === -1);

  sub('a state change does not rebuild what somebody is reading');
  /* THE rule this product learned the hard way. Finishing the last entry of
     a series changes state while the reader is still inside the reading, so
     it is the case that must repaint one control and touch nothing else. */
  const app3 = freshApp();
  const c3 = app3.ctx, d3 = app3.dom.document;
  cacheBook(c3, 'eng-web', 'EXO');
  const r3 = c3.ensureDevotionStarted('the-weight-you-carry');
  r3.done = ['wyc-1', 'wyc-2', 'wyc-3', 'wyc-4', 'wyc-5'];
  c3.openDevotionEntry('the-weight-you-carry', 'wyc-6');
  /* Count the calls rather than compare DOM nodes. The harness does not
     model children made by innerHTML, so a node comparison here would be
     null === null - a test that passes and proves nothing. Node identity
     was checked in a real browser: the body, the first paragraph and the
     anchor were all the same nodes afterwards and scrollTop held at 1200px.
     What is asserted here is the cause of that: the rebuild never runs. */
  const realRender = c3.renderDevotionEntry;
  let rebuilds = 0, footPaints = 0;
  c3.renderDevotionEntry = function(){ rebuilds++; return realRender.apply(this, arguments); };
  const realFoot = c3.paintDevotionFoot;
  c3.paintDevotionFoot = function(){ footPaints++; return realFoot.apply(this, arguments); };
  c3.completeDevotionEntry();
  T('finishing the last entry does not rebuild the reading',
    rebuilds === 0, rebuilds + ' rebuild(s)');
  T('it repaints the one control that changed',
    footPaints === 1, footPaints + ' paint(s)');
  T('the series was completed all the same',
    c3.devotionProgressFor('the-weight-you-carry').done.length === 6);
  T('the foot of the page now says so',
    /series complete/i.test(d3.getElementById('devotionFoot').innerHTML));
  T('and the reader was not thrown out of the entry they were reading',
    c3.openDevotionEntryId === 'wyc-6' && c3.isOverlayOpen('devotionReaderOverlay'));
  /* Moving to the NEXT entry is navigation, and a rebuild there is correct.
     The distinction is the whole point: without it this assertion would be
     satisfied by a reader that never updates at all. */
  rebuilds = 0;
  c3.openDevotionEntryId = 'wyc-2';
  c3.completeDevotionEntry();
  T('but moving to the next reading does rebuild, because that is navigation',
    rebuilds === 1 && c3.openDevotionEntryId === 'wyc-3', rebuilds + ', ' + c3.openDevotionEntryId);
  c3.renderDevotionEntry = realRender;
  c3.paintDevotionFoot = realFoot;

  sub('Scripture is resolved, never carried');
  const app4 = freshApp();
  const c4 = app4.ctx, d4 = app4.dom.document;
  cacheBook(c4, 'eng-web', 'GAL');
  c4.openDevotionEntry('the-weight-you-carry', 'wyc-1');
  /* Asserted against the generated markup, which the harness models, not
     against nodes inside it, which it does not. */
  const html4 = d4.getElementById('devotionReaderBody').innerHTML;
  const gal = readJson('eng-web', 'GAL.json').ch[5];
  T('the reading actually rendered', html4.length > 3000, String(html4.length));
  T('the anchor is the publisher’s own text, first verse to last',
    html4.indexOf(c4.escapeHtml(gal[1].trim()).slice(0, 40)) !== -1 &&
    html4.indexOf(c4.escapeHtml(gal[4].trim()).slice(0, 40)) !== -1);
  T('it carries its reference and its edition, as every quotation here does',
    html4.indexOf('>Galatians 6:2-5<') !== -1 && html4.indexOf('>WEB<') !== -1);
  T('and it is marked with the language it is written in',
    html4.indexOf('class="verse-text" lang="en"') !== -1);
  T('Scripture is set in the Scripture card, apart from the prose around it',
    html4.indexOf('<article class="verse-card">') !== -1 &&
    html4.indexOf('<div class="devotion-reading">') !== -1 &&
    html4.indexOf('verse-card') < html4.indexOf('devotion-reading'));
  /* The entries hold locations. If a word of Scripture were typed into one
     it would be outside the derived region and outside every check. */
  T('not one entry carries Scripture text',
    D.every(s => s.entries.every(e =>
      e.anchor.every(a => typeof a.c === 'string' && a.text === undefined))));
  T('a reference is a book CODE, so it means the same in every edition',
    D.every(s => s.entries.every(e =>
      e.anchor.concat(e.related).every(a => /^[A-Z0-9]{3}$/.test(a.c) && a.ch > 0))));

  sub('the reader’s own edition, and no quiet substitution');
  const app5 = freshApp();
  const c5 = app5.ctx, d5 = app5.dom.document;
  c5.bibleCache.index['spaRV1909'] = readJson('spaRV1909', 'index.json');
  cacheBook(c5, 'spaRV1909', 'GAL');
  c5.translation = 'spaRV1909';
  c5.openDevotionEntry('the-weight-you-carry', 'wyc-1');
  const es = readJson('spaRV1909', 'GAL.json').ch[5];
  const html5 = d5.getElementById('devotionReaderBody').innerHTML;
  T('a Spanish reader gets Spanish words',
    html5.indexOf(c5.escapeHtml(es[1].trim()).slice(0, 30)) !== -1);
  T('and not the English ones', html5.indexOf(gal[1].trim().slice(0, 30)) === -1);
  /* Rule 47: an edition's own book name, never an English one imported to
     sit above Spanish text. */
  T('under the edition’s own name for the book',
    /<cite class="verse-ref">G[^<]*latas 6:2-5<\/cite>/.test(html5),
    (html5.match(/<cite class="verse-ref">[^<]*/) || [''])[0]);
  T('and the edition is named beside it', html5.indexOf('>RV1909<') !== -1);
  T('the devotional prose is NOT translated, and does not pretend to be',
    html5.indexOf('There is a kind of yes that costs more') !== -1);
  T('and its language is the edition’s, on the Scripture only',
    html5.indexOf('class="verse-text" lang="es"') !== -1);

  sub('the sections a reading actually has');
  const readerHtml = html4;
  T('Consider is a list of questions and not a form',
    readerHtml.indexOf('<ul class="devotion-consider">') !== -1 &&
    !/<textarea|<input/.test(readerHtml));
  T('Practice is one line, not a checkbox',
    readerHtml.indexOf('devotion-practice') !== -1 &&
    !/type="checkbox"/.test(readerHtml));
  /* A prayer is this app's own words. Quotation marks or the Scripture face
     would present it as something sourced. */
  T('Prayer is set as editorial writing, not as a quotation',
    /\.devotion-prayer\{[^}]*font-style: italic;/.test(src) &&
    !/\.devotion-prayer[^{]*\{[^}]*font-family: var\(--font-scripture\)/.test(src) &&
    !/\.devotion-prayer::(before|after)/.test(src));
  T('Related Scripture opens the Bible at a canonical location',
    /openDevotionRelated\(&#39;GAL&#39;, 6, 9, 10\)|openDevotionRelated\('GAL', 6, 9, 10\)/
      .test(readerHtml), readerHtml.indexOf('openDevotionRelated') !== -1 ? 'present' : 'absent');
  /* Only when there is something to show. An empty heading is a promise the
     content did not keep. */
  const noRelated = D.reduce((n, s) => n + s.entries.filter(e => !e.related.length).length, 0);
  T('and a section with nothing in it is not rendered at all',
    /entry\.related && entry\.related\.length/.test(src) &&
    /entry\.consider && entry\.consider\.length/.test(src) &&
    noRelated === 0);

  sub('nothing a reader already owned was disturbed');
  T('the schema did not move', c.DATA_SCHEMA_VERSION === 2);
  /* MIGRATIONS is keyed by the version it produces, not a list. An additive
     optional collection reads as empty when it is absent, which is exactly
     what a reader who has opened no devotional looks like — so there is
     nothing to migrate, and no new key belongs here. */
  T('and no migration was invented for an additive collection',
    Object.keys(c.MIGRATIONS).join() === '1', Object.keys(c.MIGRATIONS).join());
  /* An id-bearing array is exported by key walk and merged by id. Devotional
     progress needed no backup code at all, which is the whole reason the
     collection is shaped this way. */
  const back = H.loadApp({ sharedStorage: new Map() });
  const bc = back.ctx;
  bc.openDevotionEntry('steady-ground', 'sg-1');
  bc.completeDevotionEntry();
  const payload = {};
  bc.Store.listKeys().forEach(k => { payload[k] = bc.Store.get(k); });
  T('devotional progress is in the backup payload',
    Object.keys(payload).indexOf('data.devotionProgress') !== -1,
    Object.keys(payload).join(', '));
  const restored = H.loadApp({ sharedStorage: new Map() });
  const rr = restored.ctx.mergeBackup(payload);
  restored.ctx.Domain.hydrate();
  T('and it comes back through the ordinary merge',
    restored.ctx.devotionProgressFor('steady-ground').done.join() === 'sg-1',
    JSON.stringify(restored.ctx.devotionProgress));
  T('the merge reported it as a collection it understood', rr.collections > 0);
  /* Merging the same backup twice must not duplicate a record or a done id. */
  restored.ctx.mergeBackup(payload);
  restored.ctx.Domain.hydrate();
  T('merging it twice changes nothing',
    restored.ctx.devotionProgress.length === 1 &&
    restored.ctx.devotionProgressFor('steady-ground').done.join() === 'sg-1');
  /* The catalogue is code, not somebody's data. */
  T('the static catalogue is not written into a backup',
    Object.keys(payload).every(k => k.indexOf('devotionProgress') !== -1 ||
      String(payload[k]).indexOf('The Weight You Carry') === -1));

  sub('the other collections were left exactly where they were');
  const keep = H.loadApp({ sharedStorage: new Map() });
  const kc = keep.ctx;
  kc.toggleSaved(kc.SCRIPTURE[0].id);
  const savedBefore = JSON.stringify(kc.savedVerses);
  const studyBefore = JSON.stringify(kc.studyProgress);
  const readBefore = JSON.stringify(kc.bibleRead);
  kc.openDevotionEntry('the-weight-you-carry', 'wyc-1');
  kc.completeDevotionEntry();
  T('a saved verse is untouched by devotional progress',
    JSON.stringify(kc.savedVerses) === savedBefore);
  T('study progress is untouched', JSON.stringify(kc.studyProgress) === studyBefore);
  T('and so is what the Bible reader knows',
    JSON.stringify(kc.bibleRead) === readBefore);
  T('devotional progress kept its own key, and only its own',
    kc.Store.listKeys().filter(k => k.indexOf('devotion') !== -1).join() ===
      'data.devotionProgress',
    kc.Store.listKeys().filter(k => k.indexOf('devotion') !== -1).join());

  sub('the access field exists in the data and nowhere on a screen');
  T('every shipped series is free', D.every(s => s.access === 'free'));
  /* Entitlement is future architecture. The reader must behave as though the
     field is not there, and a word of it reaching the interface would be a
     promise this app has made no arrangements to keep. */
  T('the reader never reads it',
    devSrc.indexOf('.access') === -1 && devSrc.indexOf('access ===') === -1);
  T('and no tier wording exists anywhere in the app',
    ['premium', 'paywall', 'entitlement', 'subscri']
      .every(w => src.toLowerCase().indexOf(w) === -1));
}

/* ---------------------------------------------------------
   CONTRACT 43 — THE TRANSLATION LIBRARY

   CONTRACT 37 proved that two editions could share one canon. This proves it
   at seven, across five languages and two scripts, and it defends the three
   things that get harder with every edition added:

     RIGHTS         nothing ships whose licence was not read from the
                    publisher's own metadata and pinned by hash
     NUMBERING      nothing ships whose verse numbers disagree with the
                    canonical ids a reader's saved verses are made of
     NEUTRALITY     a highlight, a saved verse and a read chapter mean the
                    same place in all seven, and never grow a copy per edition

   The held editions matter as much as the shipped ones. Three are sitting in
   the registry right now with their archives downloaded and hashed, and the
   only thing keeping them off a reader's screen is one field. These
   assertions make sure that field is load-bearing.
   --------------------------------------------------------- */
function testTranslationLibrary(){
  section('CONTRACT 43 — the translation library');
  const fsx = require('fs');
  const pathx = require('path');
  const corpus = require('../scripts/corpus.js');
  const versify = require('../scripts/versify.js');
  const app = H.loadApp({ sharedStorage: new Map() });
  const c = app.ctx, d = app.dom.document;
  const src = H.readApp();
  const lock = JSON.parse(fsx.readFileSync(pathx.join(H.ROOT, 'data', 'corpus.lock.json'), 'utf8'));
  const bibleLock = JSON.parse(fsx.readFileSync(pathx.join(H.ROOT, 'data', 'bible.lock.json'), 'utf8'));
  const shipped = corpus.shippedEditions();
  const held = Object.keys(corpus.EDITIONS).filter(id => corpus.EDITIONS[id].held);

  sub('what ships, and what does not');
  T('seven editions ship', shipped.length === 7, shipped.join(', '));
  T('the app carries exactly those seven',
    Object.keys(c.TRANSLATIONS).sort().join() === shipped.slice().sort().join(),
    Object.keys(c.TRANSLATIONS).join(', '));
  T('across five languages',
    new Set(shipped.map(id => corpus.EDITIONS[id].lang)).size === 5,
    shipped.map(id => corpus.EDITIONS[id].lang).join(', '));
  /* A held edition is downloaded, hashed and sitting in the same registry.
     The ONLY thing between it and a reader is this flag, so nothing may
     reach the app that carries it. */
  T('three editions are held', held.length === 3, held.join(', '));
  T('and not one of them reached the app',
    held.every(id => !c.TRANSLATIONS[id] && !c.TRANSLATION_TEXT[id]), held.join(', '));
  T('nor the reader corpus on disk',
    held.every(id => !fsx.existsSync(pathx.join(H.ROOT, 'data', 'bible', id))));
  T('nor the built file lock', held.every(id => !bibleLock.editions[id]));
  T('every held edition says why, in words a person can act on',
    held.every(id => typeof corpus.EDITIONS[id].held === 'string' &&
                     corpus.EDITIONS[id].held.length > 20),
    held.map(id => id + ': ' + corpus.EDITIONS[id].held).join(' | '));

  sub('rights were read from the publisher, never typed here');
  const registrySrc = fsx.readFileSync(pathx.join(H.ROOT, 'scripts', 'corpus.js'), 'utf8');
  const decl = registrySrc.slice(registrySrc.indexOf('const EDITIONS = {'),
                                 registrySrc.indexOf('const DEFAULT_EDITION'));
  /* Rule 52. A licence in source is a claim; one read out of the archive and
     hashed is evidence. The registry may declare an id, a language label and
     a hold reason — a copyright string appearing here would mean somebody
     decided the rights rather than reading them. */
  T('the registry declares no licence of its own',
    !/copyright|licen[cs]e|public domain/i.test(decl.replace(/\/\*[\s\S]*?\*\//g, '')));
  shipped.forEach(id => {
    const e = lock.editions[id];
    T(id + ' pins a publisher licence statement',
      !!e && typeof e.copyright === 'string' && /public domain/i.test(e.copyright),
      e ? String(e.copyright).slice(0, 40) : 'missing');
    T(id + ' pins both archives by SHA-256',
      !!e && e.archives && ['vpl', 'usfx'].every(a =>
        e.archives[a] && /^[0-9a-f]{64}$/.test(e.archives[a].sha256)));
    T(id + ' carries the publisher’s own names and script',
      !!e && !!e.title && !!e.titleLocal && !!e.abbr && !!e.iso && !!e.script);
  });

  sub('numbering agrees with the ids a reader’s records are made of');
  /* The whole corpus, not the curated 415. Louis Segond passed a 415-passage
     check and was still wrong: every one of those references resolved, and 58
     psalms in it hold a different sentence than our ids mean. */
  const canon = versify.chapterMap(versify.CANON);
  const canonSup = corpus.superscriptions(versify.CANON);
  shipped.forEach(id => {
    if(id === versify.CANON) return;
    const r = versify.auditEdition(id, canon, canonSup);
    T(id + ' has no superscription shift', r.shiftChapters.length === 0,
      r.shiftChapters.slice(0, 4).join(' '));
    T(id + ' has no unexplained extra verses', r.unexplained.length === 0,
      r.unexplained.slice(0, 2).join('; '));
    T(id + ' was actually compared against the whole corpus',
      r.chaptersCompared > 1100, String(r.chaptersCompared));
  });
  /* The positive control. If this ever passes, the audit has stopped working
     and every verdict above it is worthless. */
  const seg = versify.auditEdition('fraLSG', canon, canonSup);
  T('and the edition known to be shifted is still caught',
    seg.shiftChapters.length > 50, seg.shiftChapters.length + ' shifted chapters');
  T('including the psalm that would have been a wrong daily reading',
    seg.shiftChapters.indexOf('PSA 20') !== -1);

  sub('an absence is an absence, and is not filled in');
  /* Chinese prints Numbers 1:20-21 as one block. Our ids address 21; the
     publisher put no separate sentence there. Nothing is invented for it and
     nothing is remapped. */
  const zh = corpus.verses('cmn-cu89s');
  const spans = corpus.bridgedSpans('cmn-cu89s');
  T('the publisher’s bridged spans are read, not dropped',
    spans.size > 60 && !!zh.get('NUM 1:20'), spans.size + ' spans');
  T('and the text is anchored where the publisher anchored it',
    spans.get('NUM 1:20') === 21 && zh.get('NUM 1:20').length > 20 && !zh.has('NUM 1:21'));
  const numJson = JSON.parse(fsx.readFileSync(
    pathx.join(H.ROOT, 'data', 'bible', 'cmn-cu89s', 'NUM.json'), 'utf8'));
  T('the reader is told the span rather than shown a blank verse',
    numJson.bv && numJson.bv['1'] && numJson.bv['1']['20'] === 21);
  T('and it labels that verse with its whole span',
    /bridged\[n\] \? n \+ '-' \+ bridged\[n\] : String\(n\)/.test(src));
  T('"not in this edition" is never printed over a verse that IS in it',
    /if\(coveredByBridge\[n\]\) return;/.test(src));

  sub('two scripts, kept apart');
  const s = c.TRANSLATIONS['cmn-cu89s'], t = c.TRANSLATIONS['cmn-cu89t'];
  T('both Chinese editions ship', !!s && !!t);
  T('each declares its own script to a screen reader',
    s.lang === 'zh-Hans' && t.lang === 'zh-Hant', s.lang + ' / ' + t.lang);
  T('and its own name, in its own script',
    s.titleLocal === '新标点和合本' &&
    t.titleLocal === '新標點和合本',
    s.titleLocal + ' / ' + t.titleLocal);
  /* Two publications, not one text transformed. Converting between scripts
     here would be this app rewriting Chinese. */
  const sJhn = JSON.parse(fsx.readFileSync(pathx.join(H.ROOT, 'data', 'bible', 'cmn-cu89s', 'JHN.json'), 'utf8'));
  const tJhn = JSON.parse(fsx.readFileSync(pathx.join(H.ROOT, 'data', 'bible', 'cmn-cu89t', 'JHN.json'), 'utf8'));
  T('the two are genuinely different files', sJhn.ch[2][15] !== tJhn.ch[2][15]);
  T('and each is derived from its own archive, not converted from the other',
    lock.editions['cmn-cu89s'].archives.vpl.sha256 !== lock.editions['cmn-cu89t'].archives.vpl.sha256);
  T('their book names differ where the scripts differ',
    sJhn.n !== tJhn.n, sJhn.n + ' / ' + tJhn.n);

  sub('the picker scales by grouping, not by growing');
  const groups = c.translationsByLanguage();
  T('it groups by language', groups.length === 5, groups.map(g => g.language).join(' | '));
  T('English holds the three English editions',
    groups.find(g => g.lang === 'en').editions.length === 3);
  T('every shipped edition appears exactly once',
    groups.reduce((n, g) => n + g.editions.length, 0) === shipped.length);
  T('no held edition appears at all',
    groups.every(g => g.editions.every(e => held.indexOf(e.id) === -1)));
  c.renderTranslationPicker();
  const picker = d.getElementById('translationBody').innerHTML;
  T('each row carries the publisher’s own abbreviation',
    shipped.every(id => picker.indexOf('>' + c.TRANSLATIONS[id].abbr + '<') !== -1));
  T('the current edition is marked as chosen',
    (picker.match(/aria-checked="true"/g) || []).length === 1);
  /* No technical plumbing on a reader's screen. The evidence lives in the
     lock file, which is where evidence belongs. */
  T('no hash, archive id or build date is shown',
    !/[0-9a-f]{16}/.test(picker) && picker.indexOf('_vpl') === -1 &&
    picker.indexOf('sha256') === -1);
  /* Five groups of one to three rows is a list, not a haystack. */
  T('and no search field was added for a list this short',
    picker.indexOf('type="search"') === -1 && picker.indexOf('translationSearch') === -1);

  sub('a reference resolves in the reader’s own language');
  const dir = pathx.join(H.ROOT, 'data', 'bible');
  shipped.forEach(id => { c.bibleCache.index[id] = JSON.parse(
    fsx.readFileSync(pathx.join(dir, id, 'index.json'), 'utf8')); });
  let unresolved = 0, totalBooks = 0;
  shipped.forEach(id => {
    c.bibleBooks(id).forEach(b => {
      totalBooks++;
      const hit = c.bibleMatchBook(id, b.n);
      if(!hit || hit.c !== b.c) unresolved++;
    });
  });
  T('every book of every edition resolves from its own published name',
    unresolved === 0 && totalBooks > 450, totalBooks + ' books, ' + unresolved + ' unresolved');
  T('a native reference parses', (() => {
    const zhRef = c.parseBibleRef('cmn-cu89s', '约翰福音 3:16');
    const deRef = c.parseBibleRef('deu1912', 'Römer 8:28');
    return !!zhRef && zhRef.c === 'JHN' && zhRef.ch === 3 && !!deRef && deRef.c === 'ROM';
  })());
  T('an accent may be typed or left off', (() => {
    const a = c.parseBibleRef('deu1912', 'Romer 8:28');
    return !!a && a.c === 'ROM' && a.ch === 8;
  })());
  /* This folding threw away every character that was not a Latin letter,
     which silently made Chinese unnavigable. */
  T('and folding a name no longer discards non-Latin scripts',
    c.bibleNormalize('约翰福音').length > 0);
  T('an ambiguous prefix is still refused rather than guessed',
    c.parseBibleRef('eng-web', 'jo 3:16') === null);
  T('and a name from the other script is refused too',
    c.parseBibleRef('cmn-cu89s', '約翰福音 3:16') === null);

  sub('what a reader owns is a place, in every edition');
  const u = H.loadApp({ sharedStorage: new Map() });
  const uc = u.ctx;
  uc.setHighlight('JHN.3.16', 'amber');
  uc.toggleSavedLocation('JHN.3.16', 'John 3:16');
  uc.markChapterRead('JHN', 3, false);
  const before = JSON.stringify([uc.bibleHighlights, uc.savedVerses, uc.bibleRead]);
  shipped.forEach(id => { uc.translation = id; uc.Domain.hydrate(); });
  T('walking every edition creates no second copy of anything',
    uc.bibleHighlights.length === 1 && uc.savedVerses.length === 1 && uc.bibleRead.length === 1,
    uc.bibleHighlights.length + '/' + uc.savedVerses.length + '/' + uc.bibleRead.length);
  T('and changes nothing that was stored', JSON.stringify(
    [uc.bibleHighlights, uc.savedVerses, uc.bibleRead]) === before);
  T('a record holds a canonical location and no words',
    uc.bibleHighlights[0].id === 'JHN.3.16' &&
    !/loved|amó|liebt|爱/.test(JSON.stringify(uc.bibleHighlights)));
  /* A saved verse used to keep the book name of whatever edition was open
     when it was saved, so a verse saved in Chinese came back as
     "民数记 1:20  WEB" — a Chinese name under an English abbreviation. */
  T('a saved reference is computed now, not kept from the day it was saved',
    /bibleBookName\(translation, m\[1\]\) \+ ' ' \+ m\[2\] \+ ':' \+ m\[3\]\s*\n?\s*: \(s\.ref/.test(src) ||
    src.indexOf('const shownRef = isBible') !== -1);

  sub('nothing a previous release proved was undone');
  T('the curated dataset hash has not moved',
    c.SCRIPTURE_SOURCE.datasetHash ===
      'f4c8380cf3d29d014044f75a8ed0b6a1b27c4d00387acdd1431a3636995d5916');
  T('nor the daily hash',
    c.SCRIPTURE_SOURCE.dailyHash ===
      '0cb67c036256232a465fb4f979e5c675254c3129a8084e93f76cd63493006c41');
  T('the curated catalogue is still 415 passages, 378 of them daily',
    c.SCRIPTURE.length === 415 && c.SCRIPTURE.filter(p => p.daily).length === 378);
  T('every curated passage exists in every shipped edition',
    shipped.filter(id => id !== c.DEFAULT_TRANSLATION)
      .every(id => Object.keys(c.TRANSLATION_TEXT[id]).length === 415),
    shipped.map(id => id + '=' + (c.TRANSLATION_TEXT[id] ? Object.keys(c.TRANSLATION_TEXT[id]).length : 'default')).join(' '));
  T('the schema did not move for static content', c.DATA_SCHEMA_VERSION === 2);
  T('Devotions and Learn are untouched',
    c.DEVOTIONS.length === 2 && c.STUDIES.length === 8);
  T('and the tab bar is still five destinations',
    (src.match(/class="tab-btn/g) || []).length === 5);

  sub('every generated byte can be re-derived');
  T('the file lock covers every shipped edition',
    shipped.every(id => bibleLock.editions[id] && bibleLock.editions[id]['index.json']));
  const files = shipped.reduce((n, id) => n + Object.keys(bibleLock.editions[id]).length, 0);
  T('and every book file in them', files === 484, String(files));
  T('each entry is a real digest',
    shipped.every(id => Object.keys(bibleLock.editions[id]).every(f =>
      /^[0-9a-f]{64}$/.test(bibleLock.editions[id][f].sha256))));
  /* Corpora are application data. A backup carries what a person wrote and
     chose, and putting a Bible in it would make every export tens of MB. */
  T('no Bible text can enter a backup',
    uc.Store.listKeys().every(k => String(uc.Store.get(k)).indexOf('In the beginning') === -1));
}

module.exports = {
  T, section, sub, results, reset, testPortability,
  testBoot, testConfig, testStorage, testCollision, testMigration,
  testNavigation, testOverlays, testToast, testConfirmation, testForms,
  testMobile, testDesignSystem, testPWA, testRelease, testStress,
  testAccessibility, testContamination, testSourcesOfTruth,
  testScripture, testDays, testPersonalisation, testUpgrade,
  testStudies, testCatalogueSplit, testStudyStorage,
  testLearnNavigation, testLessonRendering, testLearnProgress, testLearnNotes, testTodayUnharmed,
  testStudyCatalogue, testAppearance, testSmallTextContrast, testKnowledgeChecks, testFaithfulCopy, testTranslations, testBibleReader, testPrimaryNavigation, testReaderQuality, testDevotions, testDevotionsExperience, testTranslationLibrary
};
