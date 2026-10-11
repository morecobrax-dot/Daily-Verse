# Scripture Memory — content review

`npm run memory:verify` proves every suggestion is a real location that
resolves in all seven shipped editions, that nothing in the catalogue could
hold Scripture, and that no passage is longer than the limit.

It cannot tell you whether a passage is **wise to carry out of its paragraph**.
That is what this file is for, and it is the gate before a public release.

Every entry in `data/memory.json` is `"status": "proposed"` until a person has
read it. The app offers proposed passages so that the thing being reviewed is
the thing you can actually see; `memory:verify` prints what is still waiting.

## What to check, for each passage

1. **Read the paragraph it sits in**, not the verse.
2. **Does it still say the same thing alone?** If carrying it in memory would
   teach something the author did not write, it does not belong here.
3. **Is the boundary honest?** A range that stops mid-argument is a
   misquotation with a reference attached.
4. **Is it a reasonable length to memorise** — in German and Chinese as well as
   in English?
5. If it passes, change its `status` to `"approved"`.

## Deliberately excluded, and why

These are the passages people most often ask for. They are left out on
purpose, and the reasons are recorded in `data/memory.json` so nobody adds
them back without meeting the argument.

- **Jeremiah 29:11** — addressed to exiles in Babylon about a seventy-year
  timeline. It is the most reliably proof-texted verse in English-speaking
  Christianity, and memorised alone it teaches close to the opposite of what
  it says.
- **Philippians 4:13** — in context it is about contentment in plenty and in
  want. Alone it reads as a promise about performance.
- **Proverbs 22:6** — a proverb is a genre of general truth, not a guarantee,
  and it is routinely carried as a guarantee by parents who then blame
  themselves.

## The 22 proposed passages

Joshua 1:9 · Psalm 23:1 · Psalm 46:1 · Psalm 119:105 · Proverbs 3:5-6 ·
Isaiah 41:10 · Lamentations 3:22-23 · Micah 6:8 · Matthew 6:33 ·
Matthew 11:28 · John 3:16 · Romans 5:8 · Romans 8:28 · Romans 12:2 ·
1 Corinthians 10:13 · 2 Corinthians 5:17 · Galatians 5:22-23 ·
Ephesians 2:8-9 · Philippians 4:6-7 · Hebrews 11:1 · James 1:5 · 1 John 1:9

All 22 are one or two verses, span Law and History through the Prophets, the
Gospels, Paul and the General Epistles, and resolve in every shipped edition.

## What a reviewer does not need to check

Resolution, length, duplicate references, duplicate ids, and the absence of
Scripture text in the catalogue are all checked by `npm run memory:verify`
and by CONTRACT 55. A build that passes has already settled those.
