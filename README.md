# New Covenant

Read the Bible, understand what you read, and grow into deeper study.

An installable, offline-capable Bible app, formerly called Daily Verse. It is
built for someone opening Scripture for the first time and stays useful to
someone who has read it for years. Everything you create stays on your device.

> **Name and id.** The product is New Covenant; its internal id is still
> `daily-verse`. That id is the storage prefix, the cache name and the identity
> every backup is checked against, so it did not change with the name and must
> not change without a migration. See ARCHITECTURE.md, "Application identity".

---

## What it does

- **Today** — a passage for the day, set in serif and carrying its reference and
  translation, with a short reflection beside it. A rail of the last four weeks
  sits above it, so yesterday is one tap away.
- **Bible** — the whole Bible, from Genesis onward, in several public-domain
  editions and languages, each checked against its publisher's release.
- **Devotions** — short series that take a passage and stay with it for a week.
- **Learn** — guided lessons in reading and understanding Scripture.
- **Saved** — the verses you kept, your highlights, and what you wrote, in one
  place.
- **Offline** — the app, and every book you have opened, works with no
  connection.

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
npm run corpus:sync        # download the publisher corpus; never moves a pin
npm run corpus:adopt       # adopt a reviewed revision (ARCHITECTURE.md)
npm run scripture:build    # derive the dataset from the cached corpus
npm run scripture:verify   # re-derive and diff what is shipped
npm run scripture:audit    # report on the catalogue, offline
npm run icons              # redraw the app icons
```

`npm run verify` is offline and deterministic, and so are `scripture:build`,
`scripture:verify` and `scripture:audit` once the corpus is cached. Only
`corpus:sync` and `corpus:adopt` touch the network.

## Shape of the code

```
index.html               the entire application: tokens, shell, engine, domain
sw.js                    offline shell, cache identity derived from APP_CONFIG
manifest.webmanifest     install metadata, derived from APP_CONFIG
icon-192/512.png         the install icons, generated by scripts/icons.js
apple-touch-icon.png     the iOS home-screen icon, generated
favicon.svg, -32.png     the browser tab icon, generated
brand/                   App Store master and vector masters, generated
data/curation.json       which passages are daily readings, and their themes
data/studies.json        guided study content - references and teaching, no verse text
data/corpus.lock.json    the pinned edition and the digest of every archive
scripts/config.js        sync / verify static files against APP_CONFIG
scripts/corpus.js        download and pin the publisher's corpus
scripts/scripture.js     derive, verify and audit the dataset
scripts/icons.js         draw every icon from one description; `verify` checks them
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
