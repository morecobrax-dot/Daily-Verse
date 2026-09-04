# Architecture

How the pieces fit, and where the two halves meet.

The app was built on a general mobile foundation. Everything above the
`FOUNDATION → DOMAIN SEAM` banner in `index.html` is that foundation and knows
nothing about Scripture; everything below it is Daily Verse.

---

## The shape of `index.html`

The whole application is one file with four blocks, in this order:

| Block | Contains |
|---|---|
| `<head>` | Meta, viewport, manifest link. The block between `APP-META-BEGIN/END` is **derived** — written by `config:sync`. |
| One `<style>` | Design tokens, then base, shell, controls, surfaces, overlay presentation, toast, responsive. |
| `<body>` markup | The shell, the tab views, and every overlay declared statically. All other DOM is generated. |
| One `<script>` | Config, release notes, storage, migration, overlay engine, toast, confirmation, icons, navigation, the Daily Verse domain, boot. |

**Keep it to one substantial `<script>` block.** The test harness evaluates
only the largest one. Code in a second block, or in a linked `.js` file, is
invisible to every contract and the suite will still pass. A contract asserts
this, so you will be told if it slips.

This is not a stylistic preference — it is what makes a zero-build application
fully testable in Node without a browser, a bundler or a dependency.

## Application identity

`APP_CONFIG` near the top of the script is the single source. Everything else
derives from it:

```
APP_CONFIG.id ──┬── STORAGE_NAMESPACE   `<id>.`
                ├── CACHE_NAMESPACE     `<id>-v<version>`
                └── package.json name

APP_UPDATES[0].version ── APP_VERSION ──┬── CACHE_NAMESPACE
                                        └── package.json version

APP_CONFIG.name/shortName/description/themeColor
                └── <head> meta, manifest.webmanifest
```

Static files cannot read a JavaScript object at runtime, so
`npm run config:sync` writes the derived values into them, and
`npm run config:verify` (part of `npm run verify`) fails if they drift. There
is no build step: the app runs from source either way.

Adding a new derived value means one entry in `targets()` in
`scripts/config.js`.

`APP_ID` is validated, not sanitised. An invalid id fails loudly, because an id
quietly rewritten into something you did not choose is how two products end up
sharing a namespace.

## Design tokens

Four layers in one `:root`, meant to be edited in order:

1. **Brand** — fonts, accent, and the ground-and-surface ramp. This is the
   whole dial: retheming is editing this block and nothing else. The surface
   steps are literal values rather than computed from the ground, because the
   distances between them were chosen for contrast, not arithmetic.
2. **Semantic** — `--bg`, `--surface`, `--text`, `--success`… Roles, aliased
   onto layer 1. Components reference only these, so no component ever needs
   editing to change the look.
3. **Scale** — type, space, radius, shadow, motion, layout, touch, safe-area
   insets, breakpoints. Rarely changed.
4. **Domain** — this app's own: the one warm glow behind the verse, and the
   slightly warmer paper tone Scripture sits on. Deliberately few.

Two contracts keep the system real rather than aspirational: no `font-family`
literal outside layer 1, and no `font-size` outside the type scale. Genuine
exceptions are marked inline with `/* fs-exempt: reason */` in the eight lines
above the declaration, so the reason travels with the line.

Fonts are system stacks — no network request, nothing to cache offline, no
silent fallback. To use a webfont, add one `<link>` and change `--font-ui`.

## The overlay engine

The most valuable system here. One `MutationObserver` on the body subtree
drives everything that must happen when any surface opens or closes:

- **Scroll lock** — `position: fixed` on the body (what iOS needs), offset
  captured and restored instantly, depth-counted so nested layers do not
  unlock early.
- **Focus** — the surface takes focus, not its first field, so a keyboard does
  not cover the screen. Tab is trapped. Focus returns to the opening control if
  that control still exists.
- **Stacking** — z-index is painted from open order, not document order, so a
  surface opened from another is always on top.
- **ARIA** — `role="dialog"` and `aria-modal` applied and removed with the stack.
- **Escape** — closes the top surface through *that surface's own* declared
  close path, found from its `backdropDismiss(event, fn)` handler or its
  `close*()` button. Nothing is invented; a surface with no declared exit is
  left alone.

Two presentations share it: `.overlay` is a bottom sheet, `.overlay.overlay-page`
is a full page. There is no second implementation of any of the above, and a
contract asserts there is only one observer.

**To add a surface:** declare a `.overlay` div with an id and a `.sheet` inside
it, give it a `close*()` function, and toggle `.open`. Everything above happens
for free. Do not add a lock/unlock pair.

## Storage

One adapter. Every key is prefixed with `APP_ID` inside the module, so no call
site can write an unnamespaced key.

```
<APP_ID>.sys.schemaVersion      migration state
<APP_ID>.sys.backup.<v>.<key>   pre-migration snapshots
<APP_ID>.ui.<name>              per-viewer preferences
<APP_ID>.draft.<form>           in-progress input, never committed data
<APP_ID>.data.<collection>      committed records
```

This prefix is the only thing separating two apps deployed under the same
`username.github.io` — `localStorage` and Cache Storage are keyed by origin,
not by path. A contract runs two app ids against one shared store and proves
they cannot see each other.

`set()` returns a real boolean. `getJSON()` returns your fallback on corrupt
data rather than throwing. A missing key reads `null` and is never repaired
with a default.

**Migrations** are keyed by the version they upgrade *from* and run in
sequence. Every key is backed up first; a failure restores it and surfaces a
warning. Bump `DATA_SCHEMA_VERSION` only when the *shape* of stored data
changes.

## Feedback

- `toast(message, variant)` — non-blocking, one `aria-live` region, capped at
  three, auto-dismissing, reduced-motion aware. Use it after something
  succeeded.
- `confirmAction({ title, message, confirmLabel, destructive })` — returns
  `Promise<boolean>`, runs on the overlay engine. Use it *before* something
  consequential and destructive.

There is no `alert()`, `confirm()` or `prompt()`, and a contract keeps it that
way.

## PWA

Every path is relative, so the app works from any deployment sub-path without
modification. The service worker is network-first with a cache fallback, so a
fresh deploy is picked up as soon as there is a connection.

Cache cleanup on activate is filtered to this app's own prefix — deleting by
anything looser is how one deployment wipes another's cache on a shared origin.

The worker caches application code only. Everything a person creates lives in
`localStorage` and is never touched, so clearing caches cannot lose a record.

## Testing

`test/harness.js` reads `index.html` as text, extracts the largest `<script>`
block, and evaluates it in a Node `vm` against a DOM stub and an in-memory
`localStorage`. No browser, no jsdom, no dependency.

Top-level `const`/`let` create lexical bindings that do not attach to
`globalThis`, so a bootstrap bridges each name in `BRIDGE` to a live accessor.
**If you add a top-level binding a test needs to reach, add its name to
`BRIDGE`.**

`loadApp({ appId, sharedStorage, failWrites })` is how the collision and
storage-failure contracts run: two identities against one store, or a store
that refuses writes.

Contracts are grouped by what they protect, in dependency order — identity and
storage first, because everything above them is meaningless if those are wrong.
Aim for high-value contracts, not volume.

## The foundation → domain seam

The foundation reaches the product through exactly four points, declared
together just above the domain section:

```js
const Domain = {
  hydrate(){},   // read your state out of Store
  render(){},    // paint your screens
  wire(){},      // attach your own listeners, once, at boot
  tabIcons: {}   // { <data-tab value>: '<svg path markup>' }
};
```

They are no-ops by default, so **deleting the whole domain leaves an app that
still boots**, into a working but empty shell. `boot()` and `renderAll()` call
only these, and a contract asserts that no foundation code names anything the
domain defines.

Two more things follow the same rule rather than being special-cased:

- **Which tabs exist** is declared once, in the markup. `paintStaticIcons()`
  reads `data-tab` off each `.tab-btn` and looks the glyph up in
  `Domain.tabIcons`, so adding a tab is a markup edit plus one icon entry.
- **Backup import** merges whatever collections the backup file itself
  declares, recognising a record by it having an `id`. Adding a collection does
  not mean rewriting import — and, more importantly, import cannot silently
  restore nothing while reporting success.

## Where new code goes

| You are adding | Put it |
|---|---|
| A screen | A `.view` in the body, a tab button, a render function |
| A destination opened from a row | A `.overlay.overlay-page` + `open*/close*` pair |
| A decision or short form | A `.overlay` sheet |
| Persistent state | A key in `KEYS`, under `data.` or `ui.` |
| A data shape change | Bump `DATA_SCHEMA_VERSION`, add a migration |
| A domain colour or light | Token layer 4 |
| A new primitive | Only if a screen in this app actually uses it |
| A release | An `APP_UPDATES` entry, then `npm run config:sync` |

Nothing above the seam depends on anything below it, which is what makes the
domain replaceable and the foundation auditable on its own.


## The Daily Verse domain

What sits below the seam, and the reasoning that is easy to undo by accident.

### Two structures, never one

```js
const SCRIPTURE   = [ { id, ref, themes, text, sup? }, ... ]; // derived, never typed
const REFLECTIONS = { "<id>": "..." };                        // original writing
```

Kept apart on purpose. `SCRIPTURE` is rewritten wholesale by
`npm run scripture:build` between the `SCRIPTURE-BEGIN`/`SCRIPTURE-END`
markers; `REFLECTIONS` is keyed by canonical id, so a rebuild — or a change of
edition — cannot touch a line of it. Merging them would make a rebuild
destructive and would put quoted text and authored text in one object, which is
exactly the confusion this product exists to prevent.

### Where the text comes from

`scripts/corpus.js` downloads eBible.org's own release of **World English Bible
Classic** (`eng-web`) and pins each archive by SHA-256 in
`data/corpus.lock.json`. The cache is gitignored; the lock is not, so any
machine can re-download and prove it received the same bytes.

Two archives are needed, and each carries something the other does not:

| Archive | Used for |
|---|---|
| `_vpl.xml` | verse text, one verse per element, standard SIL/UBS book codes |
| `_usfx.xml` | the `<d style="d">` elements — the only place a psalm superscription is *marked* as one rather than guessed at from the sentence |

**Edition matters more than it looks.** `engwebp` and `engwebu` are also called
World English Bible, and both print "the LORD" where Classic prints "Yahweh".
Repointing the id in `corpus.js` would silently rewrite Scripture for every
existing reader. It is a decision to be announced, never a side effect.

### Normalisation — the only two changes made to the source text

1. **Whitespace.** Runs collapse to a single space, then trim. The corpus keeps
   poetry line structure as whitespace; collapsing it changes no word.
2. **Psalm superscriptions.** "For the Chief Musician. By the sons of Korah."
   is liturgical apparatus attached to verse 1, not the sentence a reader came
   for. Removed where a passage starts at verse 1 of a psalm that carries one,
   by exact prefix match against the publisher's own `<d>` markup. A recorded
   superscription that is *not* found at the start is a build failure, not a
   silent pass. Passages this touched carry `sup: 1`.

### Canonical ids

`PSA.34.18`, `1CO.13.4-7` — USFM book code, chapter, verse or range, derived
from the reference. Stable across rebuilds, retagging and edition changes,
which is what lets a saved verse or a written reflection keep pointing at the
right passage however the catalogue moves underneath it.

### Eligibility

`eligiblePassages()` returns only passages that have a reflection. Verified
Scripture may sit in the catalogue ahead of the editorial work; it is simply
not served as a day's reading. This is the seam that lets the collection grow
without the editorial standard being the thing that gives way.

### The day is a local date

`dayKey()` builds `YYYY-MM-DD` from `getFullYear/getMonth/getDate`. Using
`toISOString()` would hand everyone east of UTC tomorrow's reading during their
evening. `dateFromKey()` parses back to **local midnight** for the same reason.

### What a day holds, in strict order

1. **A reflection written that day** records the passage it was written
   against. That wins over everything — without it, someone's words about a
   passage on grief could resurface beside a passage about work.
2. **The assignment ledger** (`data.assignments`, one record per day shown),
   for a day already seen.
3. **Otherwise choose one**, and write it to the ledger, so the day is never in
   question again.

`peekPassageForDay()` is the read-only form, used wherever a day is inspected
rather than opened, so that scrolling the saved list cannot silently consume
unseen readings.

### Selection

Deterministic given (day, stored state). No model, no randomness.

- **No repeat while anything is unseen** — a hard gate rather than a score, so
  no preference can out-argue it.
- **Explicit focus** (`ui.focusThemes`) adds 3 or 6 per matching tag, depending
  on `ui.focusStrength`.
- **Learned signal** from saves (weight 2) and reflections written (weight 1),
  capped so it can never outvote what the reader actually asked for.
- **Diversity** subtracts for themes and books seen in the last fortnight.
- **Exploration** — one day in four drops focus weighting entirely, so a reader
  cannot be sealed into a single theme.
- **Tie-break** from a hash of day and id: small, and decisive on a flat field.

With the pool exhausted it falls back to the longest-waiting quarter rather
than restarting at random.

**The text of a private reflection is never an input.** Writing counts as a
yes/no signal about a passage; the words inside it are read by nothing.
Contract 22 asserts this against the source of the selector, not merely against
its behaviour.

### Records

| Key | Shape | Why |
|---|---|---|
| `data.saved` | `{ id: "s_<slug>", passage, ref, savedAt, updatedAt }` | id derived from the passage, so saving twice is idempotent; `ref` survives a passage leaving the catalogue |
| `data.notes` | `{ id: "n_<date>", date, passage, ref, text, createdAt, updatedAt }` | one per day; `passage` is a fact about what was being read, not a cached derivation |
| `data.assignments` | `{ id: <dayKey>, passage, updatedAt }` | the day ledger, and the only exposure history — how often something has been seen is derived from it |
| `draft.note` | `{ date, text }` | in-progress input, outside the committed collection |
| `ui.*` | preferences | absent means never chosen, and the app answers with its own default |

Preference defaults are defaults for *preferences*. Absent **data** is still
never repaired with a plausible value.

### Migration v1 → v2

v1 addressed passages by printed reference. v2 adds `passage` (canonical id) to
saved records and reflections, **keeping `ref`**, and seeds the assignment
ledger from existing reflections so every day someone wrote on keeps the
passage it actually held. Idempotent, and the migration engine takes its own
backup first.

### Type

`--fs-verse` and `--fs-reflect` are the only two sizes the reader can change,
and `:root[data-text-size="large"]` is the only thing that changes them. The
shell keeps its size so muscle memory survives the switch.
