# Development method

Instructions for AI coding sessions in this repository. These override default
behaviour.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing architecture, and
[PRODUCT-DESIGN.md](PRODUCT-DESIGN.md) before changing anything a user sees.

**This app is Daily Verse: one passage of Scripture per day, a short reflection
beside it, and a private place to keep both.** It was built on a general mobile
app foundation, and the two halves of `index.html` are still distinct — the
foundation above the `FOUNDATION → DOMAIN SEAM` banner, this product below it.

---

## The rules that outrank everything else here

These are first because getting them wrong does a kind of damage the rest of
the list cannot.

1. **Never write, edit, or "fix" a verse by hand.** Not a typo, not a line that
   wraps badly, not a trailing semicolon that looks untidy. The `SCRIPTURE`
   region of `index.html` is written only by `npm run scripture:build`. A verse
   edited by hand is a verse this app asserts on its own authority.
2. **Never write Scripture from memory.** Remembered verses are usually close
   and occasionally wrong, and a Bible app does not get to be approximately
   right. If a passage should change, change `data/curation.json` and rebuild.
3. **A reflection may respond to a verse and may never extend it.** It does not
   put words in Scripture's mouth, does not promise what the passage does not,
   and never opens with a phrase that could read as continuing the quotation.
4. **Scripture and this app's own words stay structurally separate.**
   `SCRIPTURE` and `REFLECTIONS` are different objects, keyed independently, set
   in different typefaces, under different labels. Do not merge them for
   convenience.
5. **Every quotation carries its reference and its translation.** On screen, in
   a share, in a saved row. An unsourced verse is the thing this product exists
   not to produce.

## The foundation-modification rule

**A product-specific need stays in the product.** Do not change generic
foundation code because this app wants something. Add it below the seam.

Only change the foundation when the change is right *on its own terms* — when
an unrelated app would want it identically. Never add a domain concept — a
verse, a reflection, a day key — to the storage adapter, the overlay engine,
toast, confirmation, or navigation.

## No dependency linkage

This app is **independent** of the foundation it came from. Never introduce a
git submodule, an npm package, a shared remote runtime, or any automation that
pulls foundation changes in or pushes changes back.

## Workflow

```
AUDIT → UNDERSTAND → IMPLEMENT → ADVERSARIAL VERIFY → DIFF AUDIT → SHIP → REPORT → STOP
```

- **Audit** the existing code before proposing a change. Read the thing you are
  about to modify, and the thing that calls it.
- **Understand** why it is the way it is. Nearly every unusual line here carries
  a comment naming the failure that caused it. If you are about to remove
  something that looks redundant, find that comment first.
- **Implement** the requested change, and only that change.
- **Adversarially verify.** Try to break what you built. Repeat it a hundred
  times. Open it, close it, rotate it, refresh mid-edit, deny it storage.
- **Diff audit** before shipping. Read the whole diff. Every surviving line
  should have a reason to exist.
- **Report** what you did, what you verified, and what you did not.
- **Stop** at the requested phase. Do not begin the next one.

### The default release path

An implementation phase does not stop at a green suite. Unless something below
says otherwise, carry it through to production:

```
BUILD → VERIFY → BROWSER QA → COMMIT → PUSH → VERIFY PRODUCTION
```

Deploy only when **all** of these hold:

- every test passes
- Scripture verification passes and the daily hash is unchanged
- no migration or data-safety question is open
- no explicit STOP condition was given
- the brief did not ask for review before deployment

If any one of them fails, **do not deploy**. Stop and report the reason. A
push is not a deployment: confirm production actually serves the new version
before calling a release done.


## Before changing anything

1. **Run the baseline first.** `npm run verify` before you start, so you know
   whether a failure is yours.
2. **Find the current source of truth before adding another one.** If you are
   about to declare a value, search for it first. Identity, tokens, storage
   keys, release history and overlay state each have exactly one owner, and a
   contract enforces it.
3. **Prefer extending an existing system to creating a parallel one.** A second
   overlay mechanism, a second storage wrapper or a second version constant is
   a defect, not an addition.
4. **Do not redesign unrelated surfaces during targeted work.** If you notice
   something else, say so; do not fix it in the same change.

## Hard rules

1. **New code goes in the largest inline `<script>` block.** A second block or
   a linked file is invisible to every contract, and the suite will still pass.
2. **Never hard-code a font size, font family, or colour.** Use the tokens. A
   genuine exception is marked `/* fs-exempt: reason */` on the lines above it.
3. **Never add a lock/unlock pair to an overlay.** The engine's observer handles
   scroll lock, focus, stacking and ARIA. A hand-rolled pair reintroduces the
   bug the engine exists to prevent.
4. **Never touch `localStorage` outside the storage adapter.** Anything else is
   an unnamespaced key and an origin collision waiting to happen.
5. **Never edit `sw.js`, `manifest.webmanifest` or the derived `<head>` block by
   hand.** Edit `APP_CONFIG`, run `npm run config:sync`.
6. **Never reference a path outside the repository** in application or tooling
   code. The starter is self-contained.
7. **No `alert()`, `confirm()` or `prompt()`.** Use `toast()` and
   `confirmAction()`.
8. **No new dependency, framework, or build step** without the user explicitly
   asking for one. The value here is proven behaviour, not stack novelty.

## Product rules

9. **Mobile first.** Design for a phone, then let it widen.
10. **≥44px actionable touch targets.** The visible mark may be smaller.
11. **≥16px editable inputs**, or iOS Safari zooms and does not zoom back.
12. **Respect safe areas** on all four edges, through the `--inset-*` tokens.
13. **Respect `prefers-reduced-motion`** on every animation, not most of them.
14. **One visible action, one predictable outcome.** Validate before mutating.
15. **Truthful empty and unknown states.** Absent is not zero. A missing key is
    a new user, not a corrupted one, and is never repaired with a default.
16. **No fake precision.** Do not present a number the data cannot support.
17. **Do not persist derived values.** Store the record; compute the
    presentation. A stored total can disagree with its parts.
18. **Preserve backward compatibility** wherever product data already exists.
    A shape change means a migration, not a reinterpretation.

## Testing

19. **Add regression coverage for every real defect**, in the same session that
    fixes it. Name the contract after the failure it prevents, not the function
    it calls.
20. **Run adversarial tests** — repetition, nesting, refresh mid-action, denied
    storage, corrupt input, empty and enormous collections.
21. **A contract that cannot be described as "this prevents X" should not
    exist.** Optimise for value, not for count.
22. **If you add a top-level `const`/`let` a test must reach**, add its name to
    `BRIDGE` in `test/harness.js`, or it will be invisible.

## Shipping

23. **Verify live behaviour**, not just the local file. Install it, load it
    offline, check the cache and storage names in DevTools.
24. **Compare the deployed bytes to committed source**, not to a
    line-ending-modified working copy — on Windows the working tree is CRLF and
    will report a false mismatch. Compare the git blob.
25. **Update `APP_UPDATES` on every real release**, then run
    `npm run config:sync`. The newest entry is the version; the cache name
    derives from it. Skipping this ships an app that cannot invalidate its own
    cache.
26. **`npm run verify` must be green before any commit or push.**

## Scope

27. **A product-specific need stays in the product.** See the
    foundation-modification rule above. Do not generalise on the first use.
28. **Stop at the requested phase.** Finish it completely, report, and wait.
    Do not start the next phase, do not "while I'm here", do not polish a
    demo into a product.

## Daily Verse specifics

29. **The day key is a local calendar date**, never derived from
    `toISOString()`. A UTC-derived "today" gives half the world the wrong
    verse for part of every day, and the bug is invisible on the machine it
    was written on.
30. **The date → verse mapping is a pure function of the date string.** Nothing
    about the device, the locale, the install or the boot order may enter it,
    or the same day gives two people two verses.
31. **A reflection stores the reference it was written against.** The catalogue
    may grow; if it does, `dayHash % length` moves every past day. A note that
    carries its own reference can never be re-paired with a passage its author
    never saw.
32. **Reflections are opt-out and the app must still be complete without
    them.** Someone reading Scripture alone is a supported way to use this,
    not a degraded one.
33. **Never invent a verse when the catalogue cannot supply one.** An honest
    empty state is the correct output. Improvising is the single worst failure
    this product has available to it.
34. **Re-source, never re-type.** `npm run scripture:build` after any curation
    change; `npm run scripture:verify` to prove the shipped bytes still match
    the published edition.
35. **Never change WEB edition casually.** `eng-web` (Classic) prints "Yahweh";
    `engwebp` and `engwebu` print "the LORD". They are different texts under
    similar names. Changing the pin in `scripts/corpus.js` silently rewrites
    Scripture for everyone who already reads this app, and is a decision to be
    announced, never a side effect of a rebuild.
36. **A passage is only a daily reading once it has a reflection.** Verified
    Scripture may sit in the catalogue ahead of the editorial work;
    `eligiblePassages()` is the gate. Never widen the gate to hit a number.
37. **Personalisation may never read a private note.** Saving and writing are
    signals about a passage; the words inside a reflection are not an input to
    anything. A contract asserts it structurally — keep it that way.
38. **The assignment ledger is the only exposure history.** How often something
    has been seen is derived from it. A second counter would be a parallel
    source of truth that can disagree.

## Guided study (Learn)

The first content in this app that *interprets* Scripture rather than quoting
it. That is a different kind of risk and these rules exist because of it.

39. **A lesson never contains Scripture text.** `STUDIES` carries canonical
    passage ids; the words come from `SCRIPTURE` at render time. A verse typed
    into an explanation is a verse this app asserts on its own authority,
    outside the derived region and outside every check that defends it.
    The build refuses any run of six shipped words in lesson prose, and a
    contract checks the shipped bytes too. Naming a phrase is how teaching
    works and stays legal; six consecutive words is the verse. This is
    enforced because it happened — John 1:14 shipped inside an explanation.
40. **Every explanation records its `basis`** — the passages actually read to
    write it, including the surrounding context. An explanation whose ground
    cannot be checked cannot be reviewed, and the build refuses one.
41. **Daily eligibility is the `daily` flag, tested first.** The catalogue
    holds passages that exist only because a study quotes them. Never rely on
    such a passage merely happening to have no reflection — that is an
    accident standing in for a rule.
42. **Study Scripture goes in `data/studies.json`, never in
    `data/curation.json`.** Adding it to the curation would enrol it in the
    Today rotation, where it was never meant to be read alone.
43. **Teaching stays inside the declared limits** in `data/studies.json`
    (`understandMax`, `lookCloserMax`, `reflectMax`). The build fails over
    them. They are the mechanism that keeps a lesson readable on a phone;
    raising one to fit an explanation is the wrong direction — cut the
    explanation.
44. **Where a reading is genuinely disputed**, state it conservatively or keep
    it off the centre of the lesson. Do not present one tradition's reading as
    the only one. Equally, do not strip a lesson of all interpretation — a
    lesson that teaches nothing is not safe, it is useless.
45. **Study writing is not a daily reflection.** `data.notes` is
    one-per-calendar-day by construction (`isNoteRecord` requires a day key and
    the id *is* the date). Lesson writing lives in `data.studyNotes`. Show them
    together if that helps a reader; never merge the collections.
46. **Study progress is derived where it can be.** The active study and
    completion counts come from `data.studyProgress`; do not add a second
    field that can disagree with it.
