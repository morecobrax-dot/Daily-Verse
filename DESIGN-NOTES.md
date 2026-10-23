# Visual system

What the Home redesign established, for the passes that will follow on Bible,
Learn, Devotions, Help Me, Saved and Settings. Small on purpose: this records
what already exists in `index.html`, it does not propose a second system.

PRODUCT-DESIGN.md remains the product's own rules. This is the visual layer
under them.

## The one rule everything else serves

**Scripture is the largest, highest-contrast thing on any screen it appears
on, and nothing is painted over it.** Decoration goes behind an opaque surface
or below the content, never across the words. A contract holds this for Home
(CONTRACT 56); a later pass should extend the same assertions rather than
write new ones.

## Tokens added

| Token | What it is for |
|---|---|
| `--mark-ink` | The logo silhouette as a watermark. Light on dark, dark on light, both at six to eight per cent. |
| `--mark-light` | The column of light out of the mark, warmer and slightly stronger than the ink. |
| `--stage-wash` | A radial warmth behind the top of a page. A gradient, not an image: one paint, no asset, any width. |

Each is redefined in the light theme. A surface that needs atmosphere uses
these; it does not invent a new alpha.

## Components

**`.continue-row`** — the way this app offers to resume something. Glyph,
title, one line of quiet meta, chevron. 56px minimum, `:active` dims. It is a
row and not a card on purpose: a card competes with the content above it, and
resuming is always secondary to the thing you came to the screen for.

Use it wherever a surface offers to pick something back up. Do not add a
progress bar, a percentage or a count of days to it — see below.

**`.today-art`** — the closing mark. In the document flow with a fixed height,
masked so it emerges rather than being cut out, `pointer-events: none` and
`aria-hidden`. Any screen that wants the same treatment should copy the
structure rather than position something absolutely over the page.

## Motion

One animation on Home: a fourteen-second opacity breath on the light column.

- **Opacity only.** A transform or a layout property here would cost a frame
  budget this app has no reason to spend.
- **No compositing hint.** The browser promotes an opacity animation on its
  own; asking by hand pins the memory for ever, and a contract in the reader
  already forbids it across the whole stylesheet.
- **Reduced motion is already handled globally.** `@media
  (prefers-reduced-motion: reduce)` switches off every animation and
  transition in one rule. Never add a second, local mechanism.
- **Off-tab costs nothing.** Inactive views are `display: none`, so an
  animation on another tab composites nothing at all.

## Density

Home's order is fixed and worth copying: **the thing itself, its actions, its
context, then anything about carrying on.** Continuation is last because it is
about a different day.

- At most two continuation rows. Three is a dashboard.
- Nothing is shown for a reader with no history. An empty section is the
  honest state, not a prompt to go and make one.

## What this system refuses

No streaks, no percentages, no day counts, no fabricated recommendations, no
badges, no progress rings. Not a style preference — a product one, and
CONTRACT 56 asserts that no continuation row claims progress the data cannot
support.

## The logo

`scripts/icons.js` is the only place the mark is drawn. It emits the icons,
the vector masters, and now the Home silhouette, which it writes into
`index.html` between `HOME-MARK-BEGIN` and `HOME-MARK-END`.

Never hand-edit that region and never paste the paths anywhere else. `npm run
icons` rewrites it; `npm run icons verify` fails if the watermark and the app
icon have stopped being the same drawing.
