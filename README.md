# Daily Verse

A verse, a reflection, and a quiet moment each day.

An installable, offline-capable mobile web app. It shows one passage of
Scripture per day, a short reflection beside it, and gives you somewhere to
save the verses worth keeping and write your own thoughts. Everything you
create stays on your device.

---

## What it does

- **Today** — the day's reading, set in serif and carrying its reference and
  translation. A rail of the last four weeks sits above it, so yesterday is one
  tap away and today is always one tap back.
- **378 readings** across 54 books, drawn from a pool that never repeats while
  anything in it is still unseen.
- **Reading focus** — optionally pick themes you would like more of. It nudges;
  one day in four ignores it entirely so the collection never narrows.
- **Saved** — the verses you kept, and the reflections you wrote, in one place.
- **Reflections** — an optional private note against any day, with the verse it
  was written about kept alongside it.
- **Offline** — the whole app, including every verse, works with no connection.

> Guided study content ships in the app but has no interface yet. The data,
> the Scripture pipeline and the storage are in place and under contract; see
> `data/studies.json`.

## Where the Scripture comes from

Every verse is quoted from the **World English Bible Classic** (eBible.org id
`eng-web`), which is in the public domain. Nothing is paraphrased and nothing
is typed from memory.

> **Which WEB?** eBible.org publishes several editions under similar names and
> they disagree on the divine name: `eng-web` (Classic) prints "Yahweh", while
> `engwebp` and `engwebu` print "the LORD". This app quotes Classic. That is
> not a judgement about which is better — it is the edition the text has always
> been, and changing it would silently rewrite Scripture under people who had
> memorised it.

The text is *derived*, not authored. `scripts/corpus.js` downloads the
publisher's own release and records the SHA-256 of every archive in
`data/corpus.lock.json`. `scripts/scripture.js` then builds the dataset from
that cache. Two files name references — `data/curation.json` for the daily
readings and `data/studies.json` for the passages its lessons quote — and the
build resolves the **union** of them against the one corpus. Every character
of text comes from there. A build that cannot derive every passage, or that
finds a lesson over its length limit, writes nothing at all.

One catalogue, two kinds of entry: `daily: 1` marks a passage the curation
named, and only those are candidates for the Today rotation. The rest are the
same verified text, resolved by the same id, quoted by a study, and never
offered as a standalone daily reading.

Two normalisations are applied, both recorded per passage: whitespace runs are
collapsed, and a psalm superscription is removed where a passage starts at
verse 1 of a psalm that carries one — by exact match against the publisher's
own `<d>` markup, never by guessing at the text.

```bash
npm run scripture:verify
```

re-derives the whole dataset from the cached corpus and compares it, byte for
byte, against what is shipped. It also prints a fingerprint — a SHA-256 over
every reference and every character of text — which the app itself displays
under Settings → Scripture &amp; sources. The claim above is checkable rather
than promised.

A **Reflection** is this app's own writing and is not Scripture. It is
labelled, set in the interface typeface rather than the serif, kept in a
separate structure in the source, and can be switched off entirely in Settings.

## Run it

```bash
npx --yes http-server -p 8181 -c-1 .
```

Then open `http://localhost:8181`. A service worker needs `http(s)`, so opening
the file directly works but will not exercise offline behaviour.

## Verify it

```bash
npm run verify
```

The one command to remember. It runs the contract suite, checks that the static
PWA files still match `APP_CONFIG`, and scans for residue from the foundation
this was built on. Run it before every commit and every deploy.

```bash
npm test                   # contracts only
npm run config:verify      # identity drift only
npm run contamination      # residue scan only
npm run config:sync        # write derived values into the static files
npm run corpus:sync        # download the publisher corpus and write the lock
npm run scripture:build    # derive the dataset from the cached corpus
npm run scripture:verify   # re-derive and diff what is shipped
npm run scripture:audit    # report on the catalogue, offline
npm run icons              # redraw the app icons
```

`npm run verify` is offline and deterministic, and so are `scripture:build`,
`scripture:verify` and `scripture:audit` once the corpus is cached. Only
`corpus:sync` touches the network.

## Shape of the code

```
index.html               the entire application: tokens, shell, engine, domain
sw.js                    offline shell, cache identity derived from APP_CONFIG
manifest.webmanifest     install metadata, derived from APP_CONFIG
icon-192/512.png         generated by scripts/icons.js
data/curation.json       which passages are daily readings, and their themes
data/studies.json        guided study content - references and teaching, no verse text
data/corpus.lock.json    the pinned edition and the digest of every archive
scripts/config.js        sync / verify static files against APP_CONFIG
scripts/corpus.js        download and pin the publisher's corpus
scripts/scripture.js     derive, verify and audit the dataset
scripts/icons.js         draw the app icon
scripts/contamination.js residue guard
test/                    the harness and the contract suite
```

No framework, no build step, no dependencies. `npm` is used only for the test
and tooling — the app itself runs by opening `index.html`.

## Releasing

Add an entry to `APP_UPDATES` in `index.html`, then run `npm run config:sync`.
The newest entry *is* the version, and the service-worker cache name derives
from it. Skipping this ships an app that cannot invalidate its own cache.

## The rest of the documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — how the pieces fit and where new code goes.
- [PRODUCT-DESIGN.md](PRODUCT-DESIGN.md) — the UX and visual rules this app obeys.
- [NOTIFICATIONS.md](NOTIFICATIONS.md) — why there is no daily reminder, and
  what it would cost to add one.
- [CLAUDE.md](CLAUDE.md) — development method for AI coding sessions.
