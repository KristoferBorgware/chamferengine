# 26 — What is left before the first line of code

## The problem

Someone wants to open an editor and start the engine, and needs to know what to
type first — and whether anything in the twenty-six documents before this one will
stop them three days in.

This document is the answer. It is not new design. It reads every **Still open**
section in the specification, sorts what is there by what it actually blocks, and
then names the things that block code and are on **no list at all**.

---

## The design is closed. The kernel is not written.

[Doc 11](11-open-topics.md) is fully struck through — every structural question
it ever raised has been answered, and each answer has a script behind it. There
are twenty-seven documents and twenty-seven verification scripts, and
[`REFERENCE.md`](REFERENCE.md) is every one of those scripts' output, regenerated
on each push.

So the honest summary is: **the arguing is done and the typing has not started.**
That is a good place to be, and it is not the same as being ready. A
specification is ready for code when someone can implement its core functions
without making a design decision. Four things stop that today, and only one of
them appears on any open-topics list.

---

## Four functions carry everything, and one of them does not exist

[Doc 07](07-data-structures.md) lists the pure functions the whole engine rests
on. Take them one at a time and ask what a programmer would have to invent:

| Function | Specified in | Verified by | Ready? |
|---|---|---|---|
| `encode` / `decode` — ID ↔ face, path, `(q,r)`, layer | [doc 03](03-addressing.md) | `qr.js` | yes |
| `idToPosition(id)` | [doc 04](04-position-lookup.md), [doc 15](15-precision-and-origin.md) | `precision.js` | yes |
| `positionToId(p)` | [doc 04](04-position-lookup.md) | `lookup.js`, `hexround.js` | yes |
| `neighbour(id, k)` | — | — | **no** |

Three of the four are specified down to the arithmetic. `qr.js` round-trips
`(i, j)` against path digits and `(q, r)` exactly. `hexround.js` states what a
cell *is* and measures the one place the definition could have gone wrong.
`precision.js` shows `idToPosition` does not accumulate error at any depth.

The fourth has nothing at all.

![Eight document chips arranged around a dashed, empty hexagon labelled neighbour(id, k), each with an arrow pointing into it](figures/hollow-centre.svg)

*Docs 03, 05, 07, 10, 13, 16, 19 and 21 all delegate to `neighbour(id, k)` — it
is where face crossings live, where the half-turn flip is absorbed, where
pentagons become a degree-5 case, and what the pathfinder and the flood fill
walk. The hexagon in the middle is drawn empty because that is the accurate
picture: nothing in this repository says what it returns.*

---

## `neighbour(id, k)` has never been called, not even by the scripts

That is the part worth sitting with, because it is easy to miss. The
specification does not merely lack a written definition — **no verification
script has ever used one.**

Look at how `rivers.js`, `water.js`, `light.js` and `pentagon.js` find a cell's
neighbours. Every one of them builds the entire planet first: it walks all 20
faces, computes each lattice point's position, rounds the coordinates, and stores
them in a hash map keyed on that rounded triple. Two faces that produce the same
point land on the same key, so the map merges them, and the shared edge closes
itself. Adjacency is then read off the resulting graph.

That is a perfectly good way to *measure* a sphere, and it is the reason those
scripts are trustworthy. It is not something an engine can do. An engine holds
one ID and needs its six neighbours in a few nanoseconds, without a planet in
memory and without a hash map keyed on floating-point coordinates.

So the 180-byte adjacency table from [doc 05](05-face-adjacency.md) is in an odd
position. `adj.js` proves it is **complete and consistent** — all 60 edges match,
every entry comes out `reversed`, which is the signature of consistent outward
winding. Nobody has ever used it to cross an edge.

### Three decisions hide inside that one function

**Where the neighbour ring starts.** [Invariant 9](../CLAUDE.md) says order the
six directions counter-clockwise as seen from outside, never from the sign of
`(q, r)`. That fixes the *order*. It does not fix the *start*. `pentagon.js`
takes whichever neighbour the graph happened to list first as its reference and
measures angles from there — fine for counting a ring, useless as a stored value.
[Doc 19](19-directional-blocks.md) puts a **3-bit rotation on disk** and requires
that byte to mean the same thing forever, in every chunk, in every world. Index 0
has to be anchored to something every cell has and nothing can change. Nothing
here says what.

**How `(i, j)` re-expresses across a face edge.** Doc 05's table says which face
you land on, which of its three edges you arrive at, and that the shared edge runs
the other way. It does not give the map from your `(i, j)` to theirs. Doc 05 says
"re-expressing your coordinates in a frame that has no relationship to the one
you came from" is the entire job of the table — and then stops one step short of
the formula that does it.

**What a pentagon returns for `k = 5`.** [Doc 17](17-pentagons.md) protects the
twelve columns from placement, and in exchange [doc 19](19-directional-blocks.md)
lets directional machinery assume degree 6. That is a rule about *building*. The
pathfinder ([doc 10](10-pathfinding.md)) still walks through pentagons, the light
flood fill ([doc 16](16-lighting.md)) still spreads through them, and flow routing
([doc 21](21-rivers-and-erosion.md)) still drains them. All three need an answer
for the direction that is not there.

---

## Two more things code needs that no document names

**`rank(q, r)`.** [Doc 07](07-data-structures.md) gives a chunk's storage layout
as `index = rank(q, r) × layerCount + layer`. That is the only appearance of
`rank` in the specification. It is not defined, and it is not as simple as a
triangular number, because [doc 03](03-addressing.md)'s border rule — *the lowest
chunk ID wins* — means a chunk owns some of its edge cells and not others. The
chunk's cell count and its array index both fall out of that rule, and neither has
been written down or counted.

**Which noise function.** [Doc 08](08-terrain-generation.md) is precise about
*where* to sample — 3D world space, never `(i, j)` — and about one thing to avoid:
hash with integers, never with `sin`. [Doc 23](23-determinism.md) then makes the
choice load-bearing to the bit, because the client regenerates the coarse map
rather than downloading it. But no document names an algorithm. Two
implementations of "fBm" are two different planets, and the difference is not
subtle: it is every coastline.

---

## Forty-seven open questions, and exactly one of them blocks you

Docs 13 through 25 carry **47** open bullets between them, plus 8 already struck
through — one of which this document strikes, below. Sorted by what they actually
block:

![Three bars sized by count: 1 blocks code, 25 waits on code, 21 neither; below the rule, three unlisted items that all block the first line](figures/what-actually-blocks.svg)

*The backlog is not where the blockers are. One open bullet in the whole
specification stops you writing code — the language choice. Twenty-five are
waiting for code to exist before they can be answered at all. The three items
that genuinely gate the kernel appear on no Still open list, because nobody
noticed they were missing.*

**Blocks the first line — 1.** [Doc 23](23-determinism.md)'s "which language and
runtime". It matters more here than in most projects: that document's whole
argument is that `+ − × ÷ sqrt` and comparisons are pinned by IEEE 754 and
transcendentals are not, and languages differ in exactly how much of that they
guarantee. JavaScript pins the five and explicitly does not pin `Math.sin`. Pick
knowing that, and check the build disables floating-point contraction.

**Waits on code — 25.** These cannot be closed by another document, because the
thing they ask about does not exist yet:

- **Generator (6)** — how many plates and how they drift, the stream-power
  exponents `m` and `n`, whether lakes survive the fill, rivers below the coarse
  resolution ([doc 21](21-rivers-and-erosion.md), [doc 25](25-water.md)), where
  the density band sits under 60 m of relief ([doc 14](14-meshing-and-lod.md)).
- **Mesher and renderer (9)** — terrain height at a mesh corner and whether the
  ray walk wants the `3n` lattice ([doc 18](18-cell-boundary.md)); texture
  coordinates, ambient occlusion, remesh-or-store, culling by enclosure
  ([doc 14](14-meshing-and-lod.md)); ambient occlusion again and light across a
  LOD seam ([doc 16](16-lighting.md)); shorelines at a LOD seam
  ([doc 25](25-water.md)).
- **Water detail (2)** — how light behaves in water, what a player sees from
  underwater ([doc 25](25-water.md)).
- **Precision (2)** — integer versus `float64` for the offset, how far an anchor
  may be trusted ([doc 15](15-precision-and-origin.md)).
- **Determinism (2)** — nothing verifies the rule on two real platforms, and GPU
  determinism ([doc 23](23-determinism.md)).
- **Server (3)** — interest radius versus render distance, entities rather than
  blocks, authority and conflict ([doc 22](22-multiplayer-interest.md)).
- **Block format (1)** — two-ended blocks, and whether they fit the spare rotation
  bit ([doc 19](19-directional-blocks.md)).

**Neither — 21.** Game design, plus one free decision. What the twelve pentagons
contain, whether players are told about the loop rule, how fast a swimmer sinks,
whether light is coloured, what happens in creative mode. All real questions.
None of them is between anyone and a working planet, and none needs a decision
before the first commit.

### The one free decision, which gets more expensive every day

[Doc 20](20-player-coordinates.md) needs **which of the six antipodal pentagon
pairs is the axis**. Its own words: any of them works, the choice is arbitrary,
and it should be written down once and never changed, *because it fixes where the
equator falls in every world*. Today it costs one line. After the first world is
generated and shared, changing it moves every latitude anyone has ever written
down. Pick a pair, write it in doc 20, and stop thinking about it.

---

## One entry that is no longer true

[Doc 15](15-precision-and-origin.md)'s Still open list says the `hexRound`
question is "sharper, not answered" and that whether planar rounding finds the
right cell is "still unmeasured". That was true when it was written and has not
been true since `hexround.js` ran.

It **is** measured. `hexRound` and nearest-centre-on-the-sphere disagree on about
**1%** of the sphere; the rate **plateaus** rather than shrinking with depth,
because a face triangle's shape is scale-free; every disagreement is with an
**edge-adjacent** cell and never more than **0.11 of a spacing**. And
[doc 04](04-position-lookup.md) turned the measurement into a definition — a cell
**is** the set of directions `hexRound` maps to, which makes the lookup exact by
construction rather than approximate. [Doc 18](18-cell-boundary.md) then showed
the mesh draws that same curve to 0.038 mm at level 11. That bullet is struck as
of this document.

---

## Build it in four steps, and each one settles something no document can

**1. The kernel.** Constant tables, `encode`/`decode`, `idToPosition`,
`positionToId`, `neighbour(id, k)`. Nothing else. This is where the three unlisted
gaps get closed, and there is an obvious way to close the hard one: the scripts
already build the whole planet geometrically, so a new `neighbour.js` alongside
them can implement `neighbour(id, k)` from **the table and integer arithmetic
alone** and check it against that geometric graph, cell by cell, at several
levels. Three things it should report: that all 60 face edges round-trip, that
the flipped chunks come out `+3` and not reversed, and that exactly 12 cells come
back degree 5. That is the same method every closed question in this repository
used, and it turns the last structural gap into a measurement.

**2. A chunk, and a height field.** `rank(q, r)`, the palette, column-major order,
the height-field generator only — no caves, no water, no deltas. The first thing
anyone can look at. It settles where the density band goes by making the
alternative visible.

**3. The mesher.** 2 vertices and 4 triangles per cell, run-length merging down a
column, corners at the `3n` lattice points. This is the step that answers *terrain
height at a mesh corner*, which is currently the furthest-reaching open item in
the specification and cannot be answered any other way.

**4. Everything else, in any order.** LOD and seam ownership, lighting, water,
the delta store, the server. Each one has a document, a script and a number
waiting for it.

**Do not build the coarse map before step 2.** [Doc 21](21-rivers-and-erosion.md)
already priced the ordering the other way round: continents decide rivers, and
rivers are 2.5 MB computed once. It is a world-creation step, not a runtime one,
and it needs terrain to sit on.

---

## Honest caveat

**The triage above is a judgement, not a measurement.** The count of 47 is exact
and reproducible — it is the number of un-struck bullets under a *Still open*
heading in `docs/`. Which bucket each one goes in is an opinion about what
"blocks" means, and a reasonable person could move several items between the last
two columns. The claims to hold this document to are the narrow ones: `neighbour`
is defined in no document and called by no script, `rank` appears exactly once and
is defined nowhere, and no document names a noise algorithm. Those are checkable
by grep, and they are the ones that matter.

**And the sample size for "how ready is a document" is one.** Every prediction in
this repository about how hard something would be has been wrong — usually in the
optimistic direction for design and the pessimistic direction for cost
([doc 11](11-open-topics.md) collects the pattern). Expect step 1 to surface a
question nobody on this list has thought of. That is what steps are for.

---

## Still open

- **Whether the kernel is one module or four.** The four functions share the
  constant tables and nothing else. Splitting them is tidier; keeping them
  together means `neighbour` can inline the path walk.
- **Whether to write the neighbour script before the engine or as part of it.**
  Writing it first follows this repository's method and produces a number.
  Writing it as a test of real engine code produces the same number and a working
  function, and risks the design decisions being made by whoever is typing.
- **What "done" means for step 1.** A kernel that passes against the geometric
  graph is correct. Whether it is *fast enough* is a different measurement, and
  nothing here has a target for it.

---

## In one breath

- **The design is closed and the kernel is not written.** Doc 11 is fully struck,
  27 scripts back the numbers, and no engine source exists.
- **Three of the four core functions are specified and verified.** The fourth,
  `neighbour(id, k)`, is **defined in no document and called by no script** —
  every script builds the whole planet and reads adjacency off the mesh instead.
- **Two more gaps are on no list**: `rank(q, r)` appears exactly once and is never
  defined, and no document names a noise algorithm even though
  [doc 23](23-determinism.md) makes the choice bit-load-bearing.
- **Of 47 open questions, one blocks code** (which language), 25 are waiting for
  code to exist, and 21 block nothing at all.
- **One decision is free today and expensive forever after**: which pentagon pair
  is the polar axis.
- **Build the kernel first**, and close `neighbour` the way everything else here
  was closed — by measuring it against the planet the scripts already build.
