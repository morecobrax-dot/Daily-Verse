# Native iOS

Decisions that outlive the conversation that produced them. The audit behind
them is not repeated here.

**Status:** prepared, not begun. No Capacitor package is installed, no
`capacitor.config.*` exists, and there is no `ios/` project. The web app is
unaffected and remains the product that ships.

---

## The shape of it

**Capacitor, wrapping the same frontend the web serves.** Not a rewrite, and
not a remote wrapper pointed at the live site: the app is a local bundle, so
it works with no network at all and cannot be changed under a reader by a
deploy they did not install.

The repository is an unusually good fit for this. There is no bundler, no
framework, no router and no API origin, and the whole app makes exactly one
`fetch()` — a relative read of a bundled Bible file, which a native shell
serves from the app itself.

**One frontend, two consumers.** The web artifact is the source of truth and
native is a second consumer of identical bytes. Nothing is forked.

## The bundle

`npm run native:stage` writes `dist-native/`, which is the Capacitor `webDir`.
It is generated, gitignored, and selected from an explicit allowlist — never
copied wholesale and pruned.

- **All seven shipped editions are bundled.** The whole library is offline on
  install, which is better than the web gets: the service worker precaches
  only the shell, so a web reader is offline-capable only for chapters they
  have already opened.
- **`data/corpus/**` is never staged.** It is the vendored publisher archives —
  verification input, many times the size of the app. A contract asserts its
  absence, and the allowlist makes it unreachable in the first place.
- **The catalogues are not staged.** They are inlined into `index.html` at
  build time and nothing fetches them at runtime.
- **Scripts, tests, documents, brand masters, project metadata and anything
  resembling signing material are excluded**, and each of those is a contract.

**Line endings are normalised to LF.** This repository is developed on Windows
with `core.autocrlf=true`, so a text file's working copy is CRLF while the
object git stores — and GitHub Pages serves — is LF. `index.html` alone differs
by about 19 KB. Staging the working copy as-is would give the native app
different Scripture-bearing bytes than the web serves, and would produce a
different bundle on Windows than on a Mac from the same commit. Binary files
are detected by a NUL byte and never touched; Bible data is copied verbatim and
held to the hash in `data/bible.lock.json`.

The staging receipt is written to `.native-stage/manifest.json`, deliberately
**outside** `webDir`, because everything inside it is copied into the app.

## The platform seam

Four behaviours differ between a browser and a native shell, and they live
behind one small object below the `FOUNDATION → DOMAIN` seam:

| | web today | native later |
|---|---|---|
| `share` / `copy` | `navigator.share`, clipboard fallback | `@capacitor/share` |
| `saveTextFile` | `Blob` + `a.download` | `@capacitor/filesystem` + share |
| `externalLinkAttrs` | `target="_blank"` | `@capacitor/browser` |
| `onLifecycle` | `pagehide`, `visibilitychange` | `@capacitor/app` |

Nothing else is abstracted. Storage, the Bible fetch, the clipboard and the
file picker behind import behave the same in both, and a capability with one
implementation is worse than the call it replaced.

`Platform.kind` is the constant `'web'`. **Nothing sniffs a user agent, a
platform string or standalone mode** — the only honest way to know you are in a
native shell is to ask a bridge, and that is added when the bridge exists.

## Storage

Unchanged for M1: the existing `Store` adapter, `localStorage`, schema 2.
Measured heavy use is about 25 KB against a multi-megabyte quota, so there is
no case for SQLite. If `@capacitor/preferences` is ever adopted it goes *inside*
`Store` as a second backend with a real migration, never as a parallel wrapper.

**A native install starts empty.** `capacitor://localhost` and the web origin
are different origins with no shared storage, so PWA data cannot carry over
automatically. The bridge is the existing backup: export in the installed web
app, import in the native one. That path is already proven to move every key
with nothing missing. Readers must be told this rather than discovering it.

## Permissions and privacy

**None expected.** No camera, photos, location, contacts, microphone, calendar
or notifications. Import uses the document picker, which needs no permission.
Zero permission prompts.

App Privacy answers are "Data Not Collected" across the board, truthfully: no
analytics, no account, no telemetry, no AI, no remote personalisation. A
`PrivacyInfo.xcprivacy` is required; its required-reason entries follow from the
plugins actually installed and are read from their own manifests, not guessed.

## Plugins expected at M1

`@capacitor/app`, `@capacitor/browser`, `@capacitor/filesystem`,
`@capacitor/share`, `@capacitor/status-bar`, `@capacitor/splash-screen`.

Refused: any analytics, crash-reporting or Firebase SDK; push notifications;
device, geolocation, camera, contacts, microphone and photos; any sign-in or
cloud-sync plugin.

## Art

`brand/app-icon-1024.png` is the App Store icon: 1024 square, RGB, no alpha —
already exactly what the store requires.

`brand/native/ios-launch-1024.png` and `ios-launch-mark-1024.png` are the launch
sources, the same mark at the same placement, one on the app's own background
and one transparent. The background is read from `APP_CONFIG.backgroundColor`
rather than written a second time, so a launch screen cannot drift out of step
with the app it opens into.

**Final placement into `Assets.xcassets` is deliberately deferred to M1.** The
slot schema belongs to the Xcode version that generates the project, and
guessing an obsolete one is worse than waiting. Regenerate at any size by
adding it to `ASSETS` in `scripts/icons.js`.

## The boundary this repository cannot cross

An iOS build and a TestFlight upload require **macOS with Xcode**. There is no
route from Windows. Everything above was done without one; everything below
needs one.

A free Apple ID can sign a development build onto your own device for 7 days,
so the first build needs no paid enrolment. The $99/year Apple Developer
Program is first required for TestFlight.

## Still open — decisions that are the user's

- **The build route.** A Mac (recommended for the first build), or macOS CI.
- **Apple Developer enrolment**, and Individual vs Organisation. Individual
  publishes under a legal name; Organisation needs a legal entity and a D-U-N-S
  number. Permanent and public.
- **The bundle identifier.** Not decided and not registered. It is permanent
  once registered, and it is **not** `APP_CONFIG.id`: `daily-verse` remains the
  storage, cache and backup identity, and rule 54 forbids moving it.
- **The App Store name.** Listing names are globally unique; availability can
  only be checked in App Store Connect.

## M1 — definition of done

An iOS build on a real iPhone that: launches to Today with the correct local
date; reads all seven editions offline from the bundle with networking
disabled and no warm-up; passes every Help Me journey with call, text and chat
handing off to the right app; imports a backup exported from the production web
app and restores it completely; exports a backup through a native path; lands
Back and swipe-back where rule 55 requires; renders safe areas and the status
bar correctly; and leaves `npm run verify` green with the web bytes unchanged.

## Known trade-off

`native:stage` reads the working tree, not a git revision, so it stages
uncommitted work. That is the normal expectation for a build, and determinism
across platforms is preserved by the line-ending normalisation rather than by
reading from git. The release discipline of comparing deployed bytes to the
committed blob (rule 24) still applies on the web side and should be repeated
once, on the Mac, against the staged bundle.
