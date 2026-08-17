# How to write a follow-up plan

Every release after the first is planned the same way: **discuss, try, then
implement**. This page says what each step is, what ends it, and what a plan
file looks like while it is being worked through.

Read this before opening a new file in [`plans/`](plans/).

[`plans/v0.1.0.md`](plans/v0.1.0.md) is organised by project rather than by
item, because it was building an engine that did not exist. Everything after it
is organised by item, because everything after it starts from something that is
already there and is wrong.

---

## Why three steps

A patch is where the temptation to fix something before understanding it is
strongest, because the problem is usually visible and usually annoying. The
three steps exist to put a measurement between the annoyance and the commit.

Each step answers one question and nothing else:

| Step | Question | Ends with |
|---|---|---|
| 1. Discussion | What is wrong, and what could be done about it? | One or two candidate solutions, written down |
| 2. Trial | Which candidate is right, and how is that known? | One chosen solution and the measurement that chose it |
| 3. Implementation | — | The engine changed to match |

**Steps 1 and 2 run per item.** Items move through them one at a time and may
sit at different steps.

**Step 3 runs once, for the whole release.** It begins when the scope is agreed
and every item in it has cleared step 2.

---

## Step 1 — Discussion

The problem is stated and the ways out of it are named.

**What happens.** The item is read out from wherever it came — an entry in
[`FINDINGS.md`](FINDINGS.md), something seen while playing, a report. The
existing code is read. Candidate fixes are proposed and argued about.

**What comes out.** **One or two candidate solutions**, each written into the
item in enough detail that someone else could build it.

**Two is the default.** One is allowed only where there is no real second way to
do the thing — not where one candidate merely looks better than another. "The
other option is obviously worse" is a step 2 conclusion reached without doing
step 2, and it is how a plan ends up defending a choice nobody tested. When in
doubt, name two.

**No engine code is written in this step.** Reading it is the work.

**The step ends** when the candidates are written down and named, and both sides
agree they are the candidates.

---

## Step 2 — Trial

Each candidate is built somewhere that is not the engine, and measured.

**What happens.** Each candidate gets a plan, then whichever of these apply:

- **A verification script** in [`verification/`](verification/), plain Node with
  no dependencies, in the style of everything already there. This is where a
  candidate that turns on a number is settled.
- **A demo** in [`demos/`](demos/), standalone HTML with no dependencies, where
  a candidate turns on how something looks or feels rather than on a count.
- **A test** in `packages/engine/tests/`, where the candidate has a behaviour
  that can be stated and checked without a device.
- **A branch that is not merged**, where a candidate cannot be tried outside the
  engine at all. This is the last resort, and the branch is a trial, not a
  half-finished implementation.

**What comes out.** **One chosen solution**, and the measurement that chose it,
both written into the item. The measurement is the point. A decision recorded
without one is a preference, and the next person to read it cannot tell the
difference.

**The engine is not changed in this step.** A trial that has quietly become the
implementation has skipped the decision.

**The step ends** when one candidate is chosen and the number or the picture
that chose it is in the item.

**A candidate that fails is written down too.** What was tried and what it cost
is the most useful thing in the file a year later.

**An item where both candidates fail leaves the release.** It goes back to
[`FINDINGS.md`](FINDINGS.md) with what was learned, and the scope is re-cut
without it.

---

## Step 3 — Implementation

Step 2's results are applied to the engine, for every item in the release.

**What happens.** Each chosen solution is built, in whatever order suits the
code. The verification scripts, demos and tests from step 2 stay — they move
from being a trial to being part of the corpus, and
[`tools/make-reference.js`](tools/make-reference.js) runs them from then on.

**No decisions are taken in this step.** Step 3 is the mechanical part on
purpose. If implementing an item turns up a choice nobody made, **the item goes
back to step 1** and the release scope is re-cut around it. That is the whole
value of splitting the steps: it makes going backwards cheap and visible rather
than a quiet redesign inside a commit.

**The step ends** when every item is implemented, every gate is green, and the
release is on `master`.

---

## The gates

The same ones as every other change, and they all have to pass before step 3
ends:

```
npm run typecheck      the workspace compiles
npm test               every test
npm run bench          the reference scenes, against the numbers 0.1.0 recorded
npm run reference      every verification script runs and is cited
npm run docs           no dead link, no dead anchor
npm run style          every page matches the writing rules
npm run coverage       nothing dropped out of the corpus
npx prettier --check . formatting
```

`bench` is on that list because a patch that fixes a bug and costs 4 ms a chunk
has traded one problem for another.

---

## What a plan file looks like

One file per release, `plans/v<version>.md`. It opens with the release's scope
and the state of every item, then carries one section per item.

An item is written **as it is worked through**, not afterwards. The file is the
working surface, so at any moment it says which step each item is at.

```markdown
# v0.1.1

Patch: fixes to what 0.1.0 shipped, no new capability.

| Item | Title | Step | State |
|---|---|---|---|
| I-1 | Water is drawn over the sky at the horizon | 3 | chosen: B |
| I-2 | The terminator has a hard edge | 2 | trialling A and B |
| I-3 | Chunks pop in at the same distance they pop out | 1 | discussing |

---

## I-1 — Water is drawn over the sky at the horizon

**From:** visual inspection, 2026-08-18
**Step:** 3

### The problem

...what is wrong, with numbers where there are any...

### Candidates

**A — Sort water against the sky as one list.** ...what it is, and what it
would cost...

**B — Draw the sky after the opaque pass instead of before it.** ...

### Trial

`verification/horizon.js` measures ... A gives ..., B gives ...

**Chosen: B.** ...the measurement that decided it...

### Implementation

...only after the whole release reaches step 3...
```

### The state table

The table at the top is the file's index and is updated whenever an item moves.
`State` is a short phrase, not a status word: *discussing*, *trialling A and B*,
*chosen: B*, *implemented*, *dropped — see F-014*.

### Item numbers

`I-1` onwards, per release file, **never reused within it**. An item that leaves
the release keeps its number and its section, marked dropped, so the file
records what was considered and not only what was done.

---

## Which releases this covers

**Every release after 0.1.0**, at any level.

- **Patch** (`0.1.1`, `0.1.2`) — fixes to what shipped. Every item comes from
  something observed: a finding, a bug, a measurement that came out wrong. No
  item adds a capability.
- **Minor and major** (`0.5.0`, `1.0.0`) — the same three steps, and items may
  also be new work with nothing wrong behind them. Those enter at step 1 with a
  goal in place of a problem, and are held to the same rule: candidates named
  before anything is tried, a measurement before anything is chosen.

[`ARCHITECTURE.md`](ARCHITECTURE.md) is authoritative for what belongs in which
milestone. A plan file carries the work; it does not decide the milestone.
