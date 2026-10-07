# Help Me — review packet

Seven paths, twenty-eight steps, complete. Phase C built the feature on this
catalogue and Phase C.1 closed the editorial gate. It is on the
`feature/help-me` branch and is **not released**.

Source: [data/help.json](data/help.json). Checks: `npm run help:verify`, and
CONTRACT 49 in the suite.

- **Phase A** authored Start Here and Coming Back to God.
- **Phase A.1** adjudicated six editorial risks in them; all resolved.
- **Phase B** added the remaining five paths: Heavy Heart, Fear & Uncertainty,
  Guilt & Repeated Sin, Hurt/Anger/Forgiveness, Direction & Decisions.

## What the checks already prove

So review time goes where a machine cannot help:

- **85 references** resolve with real text in **all seven shipped editions**.
- **No Scripture text is stored**, and no prose reproduces six consecutive
  words of any anchor or context passage in **any of the three shipped English
  editions** (252 renderings indexed). This caught 22 real retypings during
  authoring, including four in Wave 1 and eighteen in Wave 2.
- No prose claims private revelation, arranged circumstances, a promised
  outcome or a guaranteed feeling; none diagnoses anybody; none pronounces on
  where a reader stands with God in either direction; none makes a historical
  claim with nothing behind it; none counsels staying within reach of harm.
- No number to dial appears outside the verified crisis block.
- No two readings, arrivals or prayers open the same way, across all 28.
- Nothing is near its ceiling: 313–427 words against a limit of 520.

CONTRACT 49 is **62 assertions**; **56 mutations** fail by name.

**None of that says the writing is true, wise or pastorally right.**

---

## HUMAN CONTENT GATE: APPROVED — NO OPEN ITEMS

Phase C.1 adjudicated the five items this packet carried. Three were edited,
two were approved as written, and none of them now needs a decision from
anybody. The record of what was decided and why is below, because the
reasoning is worth keeping; the items themselves are closed.

**This gate covers the writing only.** The physical-device check of the Help
Me feature is separate and is still required before release.

### 1. Psalm 88 opens Heavy Heart — APPROVED, unchanged

Kept, deliberately. A reader whose heart is heavy has usually been handed
consolation too early by somebody already, and this is the psalm that refuses
to do it. Checked against the three things that would have forced a change,
and the prose does none of them: it promises no relief (*"no promise is made
that the dark lifts by morning. Here it does not lift at all"*), it does not
turn the psalm into despair without faith (*"it is a prayer the whole way…
Every bitter line of it is said to God rather than about him"*), and it blocks
the transfer of the psalmist's circumstances to the reader (*"Nothing here
licenses the conclusion that your suffering is God's anger"*).

### 2. gs-3, "worldly sorrow produces death" — RESOLVED BY EDIT

Paul's distinction is kept in full, including the word *deadly*. What changed
is the closing paragraph, which used to describe a texture — circling,
reviewing the failure, feeling the shame, arriving back a week later more
tired — and then attach *deadly* to it. A reader whose sorrow will not switch
off reads that as a verdict on their own state, and the paragraph two above it
had already said the opposite (*"The difference is not how sharp the feeling
is but whether anything happens as a result"*).

It now sorts sorrow by where it ends rather than by how it feels, and says so
plainly: *"the word is about where that sorrow ends up, not about how much it
hurts — sorrow that is heavy, or that will not lift when you want it to, is
not what Paul is naming here."* No clinical language was introduced, and the
path's last step still points to a doctor or a crisis service where shame has
reached self-harm.

### 3. ha-2, Romans 12–13 and lawful justice — RESOLVED BY EDIT

The safety-critical conclusion is untouched and still explicit: reporting,
making a statement and letting a court decide are not private revenge and not
a failure to forgive. Without it, a reader who has been assaulted can read *do
not avenge yourself* as *do not report it*.

What was narrowed is the theological claim carrying it. *"Scripture's own
route for wrongdoing runs through lawful authority"* asserted a complete
doctrine of the state in one sentence — that this is **the** route, implicitly
that authorities act justly, and it settled a question traditions genuinely
dispute. The step never needed that. It now says what the text needs and no
more: Paul moves from private revenge to public office, *"Whatever else those
verses settle — and they have been argued over for centuries — they put that
answering somewhere other than your own hands."*

### 4. ha-4, the six distinctions — APPROVED, unchanged

Read word by word against every requirement, and it meets all of them.
Forgiveness stays a genuine Christian category rather than self-care —
*"releasing the debt"*, grounded in *"forgiving as God in Christ forgave you"*
and asked for *"on the basis of what you have received"*. Bitterness is
*"something to put down rather than something to justify"*, so resentment is
not left without a spiritual response. Reconciliation *"takes two people and
real change in the one who did the harm"*; trust is *"rebuilt by evidence,
over time, or not at all"*; access *"is yours to make"*; consequences
*"belong to justice"*; *"Safety outranks every item on this list."*

Nothing in it implies that boundaries, legal protection or separation from
danger are unforgiving, or that trust is owed on demand — the step ends
*"you can forgive somebody you will never be alone with again. You can forgive
and still give a statement. You can forgive and still change the locks."*

### 5. hh-2, the wording check — RESOLVED BY EDIT

The flagged phrase was *"the one person in Scripture with no shortage of
faith"*, which measures Jesus on a scale of faith-quantity. The step's
argument does not need that frame and cannot defend it in passing; what the
argument needs is that no spiritual deficiency can be alleged, and sinlessness
carries that more directly. It now reads *"the one person in Scripture who
never fell short"* — the same sentence otherwise, and a cleaner inference to
*"Whatever heaviness is, it is not proof that something has gone wrong in you
spiritually."*

Checked against the rest of the list and clear on all of it: the step does not
suggest Jesus lacked faith, does not name a modern condition (*"grieved to the
edge of death"* is Mark's own measure), does not make submission into
pretending (*"He does not open with acceptance and he does not pretend to want
it"*), does not overclaim what the cup means, and does not equate his
suffering with the reader's — the inference runs the other way, from his case
to theirs.

### What these edits did not touch

No canonical passage changed. No Scripture text entered the data. The dataset
hash is `f4c8380cf3d29d01` and the daily hash `0cb67c036256232a`, both
unchanged. Three `notice` fields were edited and nothing else — not a title,
arrive, consider, prayer, nextStep, passage or basis anywhere in the
catalogue.

---

## Crisis geography — RESOLVED

Decision taken: **Option A**.

- **United States:** the verified 988 Suicide & Crisis Lifeline, always shown
  with its territory named. Call 988, text 988, chat at chat.988lifeline.org;
  Spanish by calling 988 and pressing 2 or texting AYUDA; TTY via relay or 711
  then 988; ASL by dialling 988 from a videophone. Administered by Vibrant
  Emotional Health with SAMHSA.
- **Outside the United States:** restrained general guidance only — local
  emergency or crisis services, and a trusted person. No invented numbers.
- **Never inferred** from Bible edition, Scripture language, app language, or
  any stored preference. No geolocation in Help Me V1.
- **Expiry preserved:** verified 2026-10-06, review due 2027-04-06, and
  `help:verify` fails once that date passes.
- **Later:** more territories may be added only as independently verified,
  maintained records. The configuration takes them without redesign.

This is no longer an open question. Contracts hold the territory labelling, the
no-inference rule, and that no crisis resource is keyed to a translation id.

---

## Phase B steps, for reference

Each line: thesis · interpretive move · application · prayer · next step.
Flags only where there is one.

### Heavy Heart — "My heart feels heavy" → ends at the Psalms (Bible)

**hh-1 Say the whole thing** — Psalm 88:1–5 (basis 88:6–12, 88:13–18)
Thesis: the bleakest prayer in Scripture never resolves, and it was given a
tune and kept. · Move: reads the psalm's refusal to turn as the point, and its
address to God as the thing that makes it faith. · Application: say the part
you have not said. · Prayer: lament without tidying it. · Next: Gethsemane.
*Safety:* names that suffering is not evidence of God's anger (Job cited), and
promises no lifting. *Flagged above.*

**hh-2 He asked to be spared** — Mark 14:32–36 (basis 14:26–31, 14:37–42)
Thesis: Jesus asks for rescue plainly, then hands it over — in that order. ·
Move: the sequence of the two sentences, and the fact that he wanted company. ·
Application: ask for what you want. · Prayer: asks for the thing, then yields. ·
Next: hope that does not require grief to end.
*Theological:* see wording check 5 above. *Safety:* "not proof that something
has gone wrong in you spiritually"; the cup did not pass.

**hh-3 Hope you have to call to mind** — Lamentations 3:19–26 (basis 3:1–18, 3:27–33)
Thesis: hope here is produced by deliberate recollection, not by a change of
mood, and the grief stays in the paragraph. · Move: v21's "I call this to mind"
read against v18 and v20. · Application: repeat what you know. · Prayer: says it
without feeling it. · Next: not doing this alone.

**hh-4 Not carried alone** — 2 Corinthians 1:3–7 (basis 1:8–11)
Thesis: comfort is God's first, and it travels between people. · Move: the
chain in v4 read against Paul's own despair in v8. · Application: let one
person know. · Prayer: asks for the receivable kind. · Next: tell someone the
real answer — and if you are not safe, a doctor or crisis service today.
*Safety:* the crisis pointer lives here, without a number and without
diagnosis.

### Fear & Uncertainty — "I'm afraid or uncertain" → ends at Today

**fu-1 Afraid, and saying so** — Psalm 56:3–4 (basis 56:1–2, 56:8–13)
Thesis: "when I am afraid" assumes recurrence, and trust is what he does with
fear rather than instead of it. · Move: holds v3 and v4 together unreconciled. ·
Application: name the fear in one sentence. · Prayer: hands it over knowing it
will return. · Next: what Jesus said to people who could not stop calculating.

**fu-2 What your Father already knows** — Matthew 6:25–34 (basis 6:19–24)
Thesis: Jesus argues from the Father's knowledge of need, not from good
outcomes. · Move: "you of little faith" read as an instruction to look at
something, not to try harder at believing; v34 grants that tomorrow has
trouble. · Application: put down tomorrow's share. · Prayer: today only. ·
Next: something specific to do.

**fu-3 Something to do with it** — Philippians 4:4–7 (basis 4:1–3, 4:8–9)
Thesis: a swap — specific requests for anxiety — with a promise of guarding
rather than of feeling. · Move: written into a named church quarrel; "the Lord
is near" as the hinge; peace as a garrison. · Application: ask for one specific
thing. · Prompt: make the request particular. · Next: when you still do not know
how it ends.

**fu-4 But if not** — Daniel 3:16–18 (basis 3:8–15, 3:19–27)
Thesis: their refusal does not depend on being rescued. · Move: v18 carries the
step; the step says explicitly that the clause introducing v17 is rendered three
different ways in the shipped editions, so nothing rests on it. · Application:
decide what faithfulness is regardless of outcome. · Prayer: refuses to predict
God. · Next: read what happened, with eyes open — the rescue came inside the
fire.
*Editorial:* the edition divergence is named in the prose by design (rule 49).

### Guilt & Repeated Sin — "I'm carrying guilt or stuck in sin" → ends at Learn / Understanding the Gospel

**gs-1 What the silence costs** — Psalm 32:1–5 (basis 32:6–7, 32:8–11)
Thesis: forgiveness lands on the decision to stop hiding, with no interval. ·
Move: the physical cost of silence, then the speed of v5; explicitly refuses the
reverse inference from suffering to guilt. · Application: name what you have
kept quiet. · Prayer: says it without grading it. · Next: the record.

**gs-2 The record, and what happened to it** — Colossians 2:13–14 (basis 2:6–12, 2:15)
Thesis: the charge against you was removed, not reduced. · Move: dead/alive,
then the three verbs about the document; shame re-reads a cancelled file. ·
Application: stop consulting your own copy. · Prayer: addressed to Jesus. ·
Next: sorry versus turning.
*Theological:* says plainly that a cancelled record is not a rewritten past and
consequences do not evaporate.

**gs-3 Sorry is not the same as turning** — 2 Corinthians 7:8–11 (basis 7:5–7, 7:12–13)
Thesis: the two sorrows are told apart by what they produce, not by how bad
they feel. · Move: Paul's list of outcomes in v11 as the test. · Application: has
this produced any movement? · Prayer: offers the turn instead of the feeling. ·
Next: where the strength comes from. *Flagged above.*

**gs-4 Grace is the teacher** — Titus 2:11–14 (basis 2:1–10, 3:3–7)
Thesis: grace is the subject of the verb — it trains; effort is its curriculum,
not its price. · Move: the single sentence read as one movement, with 3:3–7
keeping it from becoming a wage. · Application: the next obedient thing you
already know. · Prayer: asks to be trained. · Next: tell one trusted Christian
if this is a pattern; and if shame has reached self-harm, a doctor today.
*Safety:* the second clause is deliberately short and does not turn conviction
into a crisis screen.

### Hurt, Anger & Forgiveness — "I'm hurt, angry, or struggling to forgive" → ends at Matthew (Bible)

**ha-1 It was not a stranger** — Psalm 55:12–14 (basis 55:1–8, 55:15–19)
Thesis: betrayal by an intimate is its own injury, and the psalm says so
without rounding it down. · Move: the wish to flee and the curse in v15 read as
things handed to God rather than acted on. · Application: say the uncareful
version to God. · Prayer: holds the wish without acting. · Next: what you are
tempted to do with it.
*Safety:* the imprecation is explicitly not offered as an instruction.

**ha-2 Not yours to repay** — Romans 12:17–21 (basis 12:9–16, 13:1–4)
Thesis: vengeance is reassigned, not abolished; and lawful justice is its
route. · Move: the two qualifiers in v18; Romans 13 read as the channel for
wrongdoing. · Application: stop settling the score yourself. · Prayer: admits
wanting them to suffer. · Next: what forgiveness is. *Flagged above.*

**ha-3 What forgiveness actually is** — Matthew 18:21–27 (basis 18:15–20, 18:28–35)
Thesis: forgiveness is releasing a debt — giving up the right to collect. ·
Move: the king cancels but does not reinstate; 18:15–20 shows forgiving is not
the same as saying nothing. · Application: name what you are still collecting. ·
Prompt: say whether you are willing to stop, or that you are not there yet. ·
Next: what forgiving does not carry with it.

**ha-4 Living next to it** — Ephesians 4:29–32 (basis 4:17–28, Romans 12:18)
Thesis: forgiveness, trust, reconciliation, access, consequences and safety are
six different things. · Move: bitterness addressed on the basis of what you
received; Scripture's own qualifiers limit peace-making. · Application: stop
treating them as one. · Prayer: forgive without pretending to be safe. · Next:
if you are not safe, that is the next thing — emergency services if immediate.
*Flagged above. Safety:* highest-risk step in the catalogue.

### Direction & Decisions — "I need direction" → ends at Proverbs (Bible)

**dd-1 Wisdom is looked for** — Proverbs 2:1–6 (basis 2:7–15)
Thesis: wisdom is dug for and given, and what is found is God rather than an
answer. · Move: the long conditional, then v6 refusing to let it become
self-help. · Application: what digging looks like this week. · Prayer: asks for
wisdom rather than a door. · Next: how little of this is hidden.
*Safety:* refuses any method for extracting a private instruction.

**dd-2 Most of it is not secret** — Micah 6:8 (basis 6:1–7, 6:9–16)
Thesis: the largest part of God's will is published, and it shapes the person
rather than the decision. · Move: the courtroom and the escalating offers, then
the past tense of "he has told you". · Application: are you avoiding one of the
three while waiting for guidance? · Prayer: asks to get on with what is known. ·
Next: counsel.
*Safety:* says the three are not a mechanism for producing a sign.

**dd-3 Counsel, and the plan that stands** — Proverbs 19:20–21 (basis 19:16–19, 15:22)
Thesis: plan seriously, take counsel honestly, hold the outcome loosely. ·
Move: the two lines read together rather than as a warning against planning. ·
Application: ask the person who will disagree. · Prompt: name them, and name
what you hope they will say. · Next: deciding without certainty.
*Safety:* no counsellor is presented as having God's hidden plan.

**dd-4 Decide, and hold it loosely** — James 4:13–17 (basis 4:6–12, 5:7–8)
Thesis: the plan survives; the certainty does not; and the good you already
know is still owed. · Move: the business plan is not criticised, only the
assumption under it; v17 closes the paragraph on known duty. · Application: the
decision you have been delaying. · Prayer: holds the plan openly. · Next: James
1 on asking for wisdom.

---

## The pilots (already adjudicated in Phase A.1)

**Start Here** — sh-1 Psalm 62:5–8, sh-2 Matthew 11:28–30, sh-3 Luke 11:1–4.
Ends at Learn / Learning to Pray.

**Coming Back to God** — cb-1 Hosea 14:1–4, cb-2 Luke 15:17–24, cb-3 1 John
1:8–10, cb-4 Romans 8:26–27, cb-5 Hebrews 10:19–25. Ends at Today.

All six Phase A.1 flags were resolved by edit; none has been reopened by Phase
B, and the pilots were not rewritten.

## Catalogue shape

- **Anchors:** 18 different books. 11 Old Testament, 17 New Testament. Psalms
  carries 5 of 28 — the largest share, and not a dependency.
- **Christ:** present through the Gospels (Mark 14, Matthew 6, 11, 18, Luke 11,
  15) and through Colossians 2, Titus 2, Ephesians 4 and Hebrews 10, rather
  than inserted mechanically into every step.
- **Form:** 23 steps carry a written prayer, 5 a prompt. Next steps use
  continue, openPassage, support and today; completions use Today twice, the
  Bible three times and Learn twice.
