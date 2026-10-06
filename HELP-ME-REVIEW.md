# Help Me — review packet

Two pilot paths, eight steps, written to establish the voice before the
remaining five paths are authored. **Nothing here is user-visible.** There is
no Help Me tab, no reader and no stored progress.

Source: [data/help.json](data/help.json). Checks: `npm run help:verify`, and
CONTRACT 49 in the suite.

**Status: adjudicated.** The six items the first draft flagged have been
worked through. Five are resolved in the text; one product decision is left,
and it is below. You do not need to reread all eight steps.

## The six flags, and what happened to them

| # | Item | Outcome |
|---|---|---|
| 1 | cb-5 — Hebrews 10:26–31 | **Resolved by edit.** Rewritten. |
| 2 | cb-4 — whose groaning, Romans 8:26 | **Resolved by edit.** The question is gone. |
| 3 | cb-3 — confession without a named mode | **Resolved by edit.** Sharpened, repentance strengthened. |
| 4 | cb-1 — Hosea's covenant setting | **Resolved by edit.** Over-identification removed. |
| 5 | sh-2 — rabbi's yoke, "only place he describes his own heart" | **Resolved by edit.** Both claims removed. |
| 6 | Crisis architecture | **Resolved by edit, except geography — one decision below.** |

### 1. cb-5 — the warning in Hebrews 10

The old paragraph told the reader the warning pointed "the opposite direction
from the one you are walking in by reading this at all". That reassured on the
basis of an app interaction, which is a diagnostic move in friendly clothes,
and it blunted a warning the writer means seriously.

It now does three things instead: says what the warning actually describes
(repudiating the sacrifice — v26, v29), then what the writer does next with the
same readers (vv32–39: reminds them what they endured, tells them not to throw
away their confidence, and places himself with them among those who do not
shrink back), then names that Christians read it differently and that a pastor
is the place for it if it keeps troubling you. Hebrews 10:32–39 was added to
the step's `basis`, because it is now the context the explanation rests on.

Nothing decides perseverance. Nothing tells the reader where they stand.

### 2. cb-4 — Romans 8:26

"the Spirit's own intercession is made in groans too deep for words" did two
unnecessary things: it took a side in a commentators' question, and it sat a
word away from the Berean's rendering.

It now reads that the Spirit "intercedes for us at a depth that never reaches
speech", and the following paragraph was completed with the half of v27 the
draft had dropped — that what the Spirit asks for is what God wants. The step
now says exactly what the passage safely supports: we are weak, we do not know
how to pray as we ought, the Spirit helps, and the Spirit asks according to
God's will.

### 3. cb-3 — confession

Mode is still deliberately unspecified; that was the approved direction. Two
corrections: the draft said the passage "does not say where, or to whom", which
is not quite true — the one who forgives is God, and that is now stated. And
repentance was thin, so one line was added: agreeing with God about something
is not the same as intending to keep it, which is what makes confession more
than a form of words. "the just thing for God to do rather than the generous
thing" became "just, and not only kind", which drops a false either/or.

### 4. cb-1 — Hosea 14

"he writes the apology for you" transferred a national covenant promise onto
one modern reader. The closing paragraph now says Hosea is speaking to a nation
under that covenant, and then names what carries across: God does not wait for
a polished return, he supplies words to people who have none, and he treats the
wandering itself as the thing he means to heal. One sentence shorter, and no
academic detour.

### 5. sh-2 — Matthew 11

Both claims are gone. The rabbinic-discipleship framing is replaced by what the
verse itself says — take it, and learn from me. The "only place in the Gospels"
claim is replaced by the plain point: the reason he gives for coming is his own
character, as he describes it. The physical sense of a yoke stays, because
without it the image is opaque to a modern reader, and a farm implement is a
dictionary fact rather than a historical reconstruction.

**Also found and fixed:** two more unsourced background claims of the same
kind — "which was not what dignity looked like in that world" (cb-2) and
"Groups around a teacher often had a form they prayed" (sh-3). The first is cut;
the second is replaced by what Luke 11:1 itself says about John. A lint now
rejects this class of claim, because the content type has no citation field and
building one to keep a sentence would be the wrong trade.

### 6. Crisis architecture

Kept: the quiet "Need urgent help?" label, the home-level route, contextual
offers on two paths only, the verified 988 data, the review date that makes
`help:verify` fail once it passes, and separate emergency guidance.

Added: a display rule — no resource is ever shown without the territory it
belongs to, and 988 is never presented as though it worked anywhere else; an
explicit list of what territory must **never** be inferred from (the reader's
edition, the app's language, any stored preference); and a line in the policy
saying urgent help is an escape hatch rather than a Help Me path. Contracts
hold all three, and assert that no crisis resource is keyed to a translation id.

---

## The one decision still required

**Crisis coverage is United States only, in an app that ships Spanish, German
and Chinese Scripture.**

- **Where:** `safety.crisis` in data/help.json.
- **Current wording, verbatim:** "Outside the United States, New Covenant does
  not print a number it has not verified. Contact your local emergency number,
  or a crisis line in your own country." With the reason recorded beside it: "A
  wrong number given to someone in crisis is worse than no number. A global
  directory assembled from memory would be exactly that."
- **The question:** is honest generic guidance acceptable for a first release,
  or must at least one more territory be verified before any Help Me surface
  ships?

**Option A — ship US-only, with the generic guidance above.**
Nothing is invented, the limitation is explicit, and no reader is handed a
number that does not work. A reader in Berlin or Shanghai in real distress gets
a sentence telling them to find local services themselves, at the worst moment
to be researching anything.

**Option B — verify one or two more territories before any Help Me release.**
Each territory is real work: finding the authoritative publisher, confirming
call/text/chat capability and hours, and committing to re-verify it on a date.
Spain, Germany and mainland China have different providers, different
languages, and in some cases no single national line. It delays the UI phase
and it adds a standing maintenance obligation for every territory added.

**My recommendation: Option A for the first release, with the limitation stated
in the interface, not only in the data.** Adding one country at a time, badly
researched, is how a crisis directory becomes wrong. Option B is the right
*second* move, chosen deliberately with the time to do it properly — and the
configuration is already shaped to take more territories without redesign.

**Consequence of A:** a non-US reader in crisis gets honest generic guidance and
nothing more. **Consequence of B:** the Help Me UI phase waits on research that
has nothing to do with the content, and the maintenance burden grows with each
territory.

This decision gates a **user-visible Help Me release**. It does not block Phase B
authoring.

---

## What the automated checks prove

So review time goes where a machine cannot help:

- Every reference — now 26 — resolves with real text in **all seven shipped
  editions**.
- **No Scripture text is stored**, and no prose reproduces six consecutive words
  of any anchor or context passage in **any of the three shipped English
  editions** (78 passage renderings indexed).
- No prose claims private revelation, arranged circumstances, a promised
  outcome or a guaranteed feeling; none diagnoses anybody; none pronounces on
  where a reader stands with God **in either direction**; none makes a
  historical claim with nothing behind it; none counsels staying within reach
  of harm.
- No number to dial appears outside the verified crisis block.
- No two readings, arrivals or prayers open the same way.
- Nothing is near its ceiling. The longest step is cb-5 at 427 words of 520 —
  it is the longest because it carries the warning, not because it is padded.

CONTRACT 49 is 56 assertions. 50 deliberate mutations fail by name.

**None of that says the writing is true, wise or pastorally right.**

## Reference — the two paths

### Start Here — "I don't know where to start"

Ends at **Learn → Learning to Pray**, whose second lesson is the prayer sh-3
introduces.

| Step | Passage | Basis | Thesis |
|---|---|---|---|
| sh-1 Begin where you actually are | Psalm 62:5–8 | 62:1–4, 62:9–12 | A psalm written under pressure tells everyone to bring God what they actually have. |
| sh-2 An invitation, not a summons | Matthew 11:28–30 | 11:20–24, 11:25–27 | The welcome comes from someone who has just spoken severely, and offers a shared load rather than none. |
| sh-3 Something ordinary to do next | Luke 11:1–4 | 11:5–10, 11:11–13 | Not knowing how to pray was ordinary among his own disciples, and the answer was short words. |

### Coming Back to God — "I feel far from God"

Ends at **Today**.

| Step | Passage | Basis | Thesis |
|---|---|---|---|
| cb-1 Come back with words | Hosea 14:1–4 | 14:1–9, 11:1–4 | A book of accusation ends with directions home, and God supplies the words. |
| cb-2 Met before you arrive | Luke 15:17–24 | 15:1–3, 15:25–32 | The father moves first and restores a son rather than hiring a servant. |
| cb-3 Say it, and let it be said | 1 John 1:8–10 | 1:5–10, 2:1–2 | Confession is agreement, and forgiveness rests on a cost met elsewhere. |
| cb-4 When you cannot pray | Romans 8:26–27 | 8:18–25, 8:28–30 | Inability to pray is the ordinary condition, and the Spirit carries it. |
| cb-5 Keep going, and not alone | Hebrews 10:19–25 | 10:11–18, 10:26–31, 10:32–39 | Confidence rests on a finished sacrifice; hold on, and do not do it alone. |

Both paths progress rather than repeating: bring what you have → who you are
bringing it to → something ordinary to keep doing; and return → grace →
confession → prayer when words fail → continuing with others.

## Crisis configuration

Verified **2026-10-06**, review due **2027-04-06**; `help:verify` fails once that
date passes.

United States only. 988 Suicide & Crisis Lifeline, administered by Vibrant
Emotional Health with SAMHSA: call 988, text 988, chat at chat.988lifeline.org,
Spanish by calling 988 and pressing 2 or texting AYUDA, TTY via relay or 711
then 988, ASL by dialling 988 from a videophone. Read from four pages on
988lifeline.org and samhsa.gov, each recording what it confirmed. Emergency
guidance is separate and marked as the app's own wording.

## The rest of V1

Five paths are outlined and unauthored: Heavy Heart (4 steps), Fear &
Uncertainty (4), Guilt & Repeated Sin (4), Hurt, Anger & Forgiveness (4),
Direction & Decisions (4). Each records what it covers and the safety rules that
bind it — forgiveness never requiring a reader to stay in danger, and direction
never claiming God is telling them which option to pick.

Deliberately **not** created: a separate path per feeling.
