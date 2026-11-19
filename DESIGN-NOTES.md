# Visual system

What the Home redesign established and the app-wide polish pass extended
across Bible, Learn, Devotions, Help Me, Saved and Settings. Small on
purpose: this records what already exists in `index.html`, it does not
propose a second system.

PRODUCT-DESIGN.md remains the product's own rules. This is the visual layer
under them.

## The one rule everything else serves

**Scripture is the largest, highest-contrast thing on any screen it appears
on, and nothing is painted over it.** Decoration goes behind an opaque surface
or below the content, never across the words. A contract holds this for Home
(CONTRACT 56); a later pass should extend the same assertions rather than
write new ones.

## Headers

Four patterns, and no screen invents a fifth. They are defined and described
together above `.app-header` in the stylesheet. Each lands its first content
16px below its own bar, measured at 390px, so moving between screens does not
move the content.

| Pattern | Where | Shape |
|---|---|---|
| Primary tab | the five tabs | 60px, no rule, **names the screen** |
| Detail | most overlay pages | 61px, back, centred 17px title, spacer |
| Reader | the Bible reader | the same bar, 20px title, edition in the third slot |
| Utility sheet | decisions, short forms | no bar; the sheet’s own `h2` titles it |

**The primary-tab header names the screen.** It used to show the product name
on all five tabs, which answers a question nobody has after the first launch
and leaves four screens with no title at all — so each had improvised its own
opening, and Help Me started 24px lower than Bible. Today keeps the product
name because Today is the front door (rule 54, CONTRACT 46). The other four
read the label off their own tab, so those five words have one owner.

A screen that cannot find its name shows the product rather than an empty bar.

## Tokens added

| Token | What it is for |
|---|---|
| `--mark-ink` | The logo silhouette as a watermark. Light on dark, dark on light, both at six to eight per cent. |
| `--mark-light` | The column of light out of the mark, warmer and slightly stronger than the ink. |
| `--stage-wash` | A radial warmth behind the top of a page. A gradient, not an image: one paint, no asset, any width. |
| `--measure-read` | The longest a line of reading gets, anywhere. Scripture on Today and Scripture in the reader are the same words at the same size, and were running to different line lengths because only one of them capped. |

Each is redefined in the light theme. A surface that needs atmosphere uses
these; it does not invent a new alpha.

## Components

**`.continue-row`** — the way this app offers to resume something. Glyph,
title, one line of quiet meta, chevron. 56px minimum, `:active` dims. It is a
row and not a card on purpose: a card competes with the content above it, and
resuming is always secondary to the thing you came to the screen for.

Use it wherever a surface offers to pick something back up. Do not add a
progress bar, a percentage or a count of days to it — see below.

**`.today-art`** — the mark behind the Scripture. Absolute, **pinned to both
edges of its stage**, masked so it emerges rather than being cut out,
`pointer-events: none` and `aria-hidden`.

Pinned to both edges is the whole of it: it was once 152% wide and centred
with a negative translate, which put the page 77px wider than a 390px phone
and made it scroll sideways. The mark keeps its size by being **cropped** —
the svg shows the middle 658 of its 1000-unit viewBox — not by overhanging.
Because the mask is a percentage of the box, shrinking the box shrinks the
fade with it, so the mark still reaches zero before the crop.

Any screen that wants the same treatment copies this structure. Nothing
decorative is ever given a width its container cannot hold.

**`.release`** — an entry in a list of releases. A hairline between entries,
none after the last. What’s New was seven bordered panels around content its
own version numbers already separated; the boxes added nothing a reader could
use. Reach for this shape whenever a screen is a log: a label, a heading, a
summary, lists. Not a card each.

## Motion

Two animations outside the overlay engine: a fourteen-second opacity breath
on Home’s light column, and a 200ms arrival on a tab change.

**The tab arrival** is hung on `.view.active` — the class `switchTab()` adds
and nothing else touches. `renderAll()` rewrites what is *inside* a view
without touching the view, so saving a verse or importing a backup does not
replay it.

**It carries no fill mode, deliberately.** Written with `both` it held the
from-state until it ran, and an animation does not run while its tab is in
the background: measured 2.5s after a load in a backgrounded tab, the whole
of Today sat at `opacity: 0` under a working tab bar. Without a fill, the
un-animated state is the view’s own. Never give an entrance a fill mode on
anything a reader has to be able to see.

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

## Measurements that must agree

`--tabbar-h` is what `body` reserves at the foot of every screen, so the bar
has to actually be that tall — it measured 55px against a token of 58, which
made the clearance a guess that happened to be generous. `.tab-btn` derives
its height from the token now. A contract checks both the derivation and that
the result still clears the 44px floor; a literal token match would have
passed a `--tabbar-h` of 30px.

## The logo

`scripts/icons.js` is the only place the mark is drawn. It emits the icons,
the vector masters, and now the Home silhouette, which it writes into
`index.html` between `HOME-MARK-BEGIN` and `HOME-MARK-END`.

Never hand-edit that region and never paste the paths anywhere else. `npm run
icons` rewrites it; `npm run icons verify` fails if the watermark and the app
icon have stopped being the same drawing.
