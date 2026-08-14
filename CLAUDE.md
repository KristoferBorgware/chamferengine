# CLAUDE.md

Compact reference for automated agents working on this repository. Humans should
read [`README.md`](README.md) and `docs/` instead; this file is deliberately terse
and duplicates information found there.

## Working agreements

- **Push to `master`.** That is the default and does not need asking for each
  time. Work may be staged on a feature branch first, but it is not finished
  until `master` has it, because `master` is what publishes the site.
- **Run `node tools/build-docs.js` before pushing docs.** It fails on dead links
  and dead heading anchors, and the Pages workflow runs it — a broken link
  turns the deploy red. Note the renderer does **not** nest `*italic*` inside
  `**bold**`; it reports `unconverted bold` when you try.
- **No engine source yet.** The design is still being closed out. Do not start
  implementing from these documents without being asked to.
- Commit as `KristoferBorgware <kristofer@borgware.se>`, with no co-authoring
  trailer and no model identifier in the message.

## How the documents are written

### Who is reading

A working programmer who has never done any of this before. They read a bit
layout, a complexity bound or a code block without help. They have never met a
Goldberg polyhedron, a gnomonic projection or holonomy, and they will not go and
look them up — if a document needs one, that document teaches it, in that
document, however many times it has been taught elsewhere.

Nothing may rest on prior knowledge of spheres, tilings or graphics. Everything
may rest on ordinary programming.

[`demos/how-it-works.html`](demos/how-it-works.html) is the reference for voice —
match it. Docs [02](docs/02-geometry-choice.md), [03](docs/03-addressing.md) and
[04](docs/04-position-lookup.md) show that voice carrying a full specification.

### Voice

- **Build it with the reader, in the imperative.** "Take one triangle. Mark the
  middle of each of its three edges. Join those three marks." Short commands they
  can follow in their head, then the result. This beats any amount of description.
- **Name the wrong guess before correcting it.** "You might assume each little
  triangle is a block. It isn't." The reader is usually about to make a specific
  mistake; say what it is, then take it away.
- **Let the key beats be very short.** "It is lumpy. That is fine." A three-word
  sentence after a long one is the strongest tool available here. Use it on the
  turn of the argument, not for decoration.
- **Gloss every identifier in ordinary words** the first time it appears —
  "`normalize(position)`, meaning keep the direction and set the length to the
  radius". Code that is not glossed is skipped.
- **Compare to what they already know.** Minecraft, cube worlds, a filing system,
  H3. One familiar anchor early is worth a paragraph of definition.
- **Say what a number feels like**, not only what it is. "By level 5 or 6 it looks
  like a ball; by level 11 you could not tell it from one." "About 21,000 cells —
  nothing at all." A number the reader cannot feel does not land.

### Sentences and words

- **Plain first, formal second, maths third.** "Barycentric coordinates are mixing
  ratios", then the definition, then the formula. Never let a term appear before
  the sentence that lets the reader picture it. If the formal name adds nothing,
  leave it out — or park it at the end, as doc 02 does with "gnomonic".
- **Use the ordinary word.** "Shrinks", not "attenuates". "The same at every
  layer", not "radially invariant". Never reach for jargon to shorten a sentence.
- **One idea per sentence, conclusion at the front.** A full stop beats a
  semicolon; a second sentence beats a subordinate clause. Do not write a sentence
  you could not say out loud.
- **Headings are claims, not labels.** "The blocks are the corners, not the
  triangles", not "Cell placement". A reader who reads only the headings should
  come away with the design.

### Numbers and maths

- **Never soften the maths, never hide it.** State the result in words, give the
  formula in a code block, then say what it costs in metres, layers or bytes on
  the worked planet. A formula with no worked value is half-written.
- **Every abstract claim gets a concrete handle** — a number from the worked
  planet, something to try ("draw a hexagon and try to fill it with smaller
  hexagons"), or a metaphor that survives being pushed ("triangles are the filing
  system, hexagons are the floor"). Drop a metaphor the moment it stops being true
  rather than stretching it.
- **Cite a script or do not state a number.** If a figure has no script behind it,
  say so in the sentence that uses it — doc 03's 6% border-cell figure is the
  model. A number quoted from another document is not verified; follow the chain
  to a script.
- **Bold marks a load-bearing term or a decision**, never emphasis.
  `check-coverage.js` reads bold runs as facts.

### Figures

**Every document earns at least one, and the harder the document the more it
needs.** A reader who is lost in prose is rescued by a picture; a reader who is
lost in prose about three-dimensional space is not rescued by more prose. Docs
13 through 19 carry the hardest material in the specification and are the ones
most in need of pictures — treat one figure per major claim as the target there,
not one per document.

- **The first figure shows the problem, not the solution.** Draw what goes wrong
  without the design, so the difficulty is visible before the fix is described.
- **Generated by `tools/make-figures.js`**, never hand-drawn and never
  hand-edited, so the geometry comes from the same construction the prose
  describes. Add a generator function, re-run the tool, commit the SVG.
- **The caption carries an argument, not a label.** It says the thing the picture
  cannot: what to look at, why it matters, and the number it settles. Captions
  run two or three sentences and are worth as much as the paragraph above them.
  A caption that only names the picture is wasted.
- **Point at a demo** in `demos/` whenever one lets the reader move the thing
  themselves. A figure shows one case; a demo shows the family.

### Structure and honesty

- **Open with the problem**, in one plain sentence about what the player or the
  program is trying to do — not with context or history.
- **Close with In one breath** — five or six bullets that carry the argument
  alone.
- **Keep the wrong version visible.** Corrections read "earlier drafts of this
  document said ...", and superseded entries are struck through rather than
  deleted. What a claim turned out to be worth is usually the most useful thing on
  the page.
- **Say plainly what is still soft.** "Honest caveat", "Still open", "Two things
  the numbers assume". A weak number stated confidently is the expensive kind of
  mistake here.

## Project shape

- Documentation and demos only. No engine source code exists yet.
- `docs/` — prose specification, ordered 00 through 19.
- `demos/` — standalone HTML, zero dependencies, opened directly in a browser.
  `how-it-works.html` is the illustrated primer; point newcomers there first.
- `verification/` — plain Node scripts, zero dependencies, that check the
  mathematical claims made in `docs/`.
- `docs/figures/` — generated SVG diagrams. Do not hand-edit; they come from
  `tools/make-figures.js`, which computes their geometry from the same
  constructions the docs describe.
- `tools/make-figures.js` — regenerates every diagram.
- `tools/make-reference.js` — runs every verification script and writes
  `docs/REFERENCE.md`. Also fails if a script does not run, is cited by no
  document, or is named somewhere but missing. Not part of the doc build: it
  executes everything, so run it when the maths changes.
- `tools/check-coverage.js` — reports facts (numbers, identifiers, links, bold
  terms) that an edit dropped from the corpus. Run it after rewriting prose.
- `tools/build-docs.js` — renders all Markdown to a linked site in `site/`
  (`--watch`, `--serve`). Generated output is gitignored; Markdown is the
  source of truth. It fails the build on dead links and dead heading anchors,
  so run it after editing docs.

## Where to look

Read one document, not fifteen. This table says what each one decides and which
script owns its numbers.

| Doc | Decides | Maths in |
|---|---|---|
| [00](docs/00-introduction.md) | goals, non-goals, why the 720° forces everything | — |
| [01](docs/01-prior-art.md) | what to take from S2 and H3, and what not to | `s2.js` |
| [02](docs/02-geometry-choice.md) | the tiling: Goldberg, dual of a subdivided icosahedron | `check.js`, `uniform.js` |
| [03](docs/03-addressing.md) | ID layout, path digits, the flip flag, border ownership | `qr.js`, `order.js`, `winding.js` |
| [04](docs/04-position-lookup.md) | position → cell, exactly and without storage | `lookup.js` |
| [05](docs/05-face-adjacency.md) | crossing between the 20 faces; the 180-byte table | `adj.js` |
| [06](docs/06-world-sizing.md) | block size ↔ radius ↔ level, crust depth, taper | `calc.js`, `scale.js`, `taper.js` |
| [07](docs/07-data-structures.md) | what lives in RAM, on disk, and in code | — |
| [08](docs/08-terrain-generation.md) | the noise model, height vs density term, deltas | `volume.js` |
| [09](docs/09-ray-traversal.md) | block picking as a grid walk | — |
| [10](docs/10-pathfinding.md) | A* on hexes, hierarchical search on the triangle tree | — |
| [11](docs/11-open-topics.md) | what is **not** designed yet | — |
| [12](docs/12-glossary.md) | terms and constants, as a lookup | — |
| [13](docs/13-gravity-and-orientation.md) | the three local frames, holonomy, what pentagons cost | `frame.js` |
| [14](docs/14-meshing-and-lod.md) | mesh cost, merge limits, LOD, chunk seams | `mesh.js`, `volume.js`, `seam.js` |
| [15](docs/15-precision-and-origin.md) | float budget, the anchor+offset rule, one-shot vs recursive | `precision.js` |
| [16](docs/16-lighting.md) | 8 neighbours, sky light, the free terminator, light storage | `light.js` |
| [17](docs/17-pentagons.md) | the pentagon decision: protected landmarks, and why | `pentagon.js` |
| [18](docs/18-cell-boundary.md) | which curve a cell edge is; the mesh and the lookup reconciled | `boundary.js` |
| [19](docs/19-directional-blocks.md) | 6-state rotation, placing by facing, the loop that does not close | `rotation.js` |

Doc 04 owns **position → cell** (`hexround.js`) and doc 18 owns **where the edge
is drawn** (`boundary.js`). Both are load-bearing for docs 07, 09 and 14 — read
them before touching either the lookup or the mesher.

[`docs/REFERENCE.md`](docs/REFERENCE.md) is every script's actual output in one
generated page — the fastest way to look a number up without reading the
argument around it.

## Hard invariants

Violating any of these breaks the design. They are not tunable.

1. The base solid is an **icosahedron**: 20 triangular faces, 12 vertices,
   30 edges. This count is fixed by geometry, not by configuration.
2. There are **exactly 12 pentagonal cells**, one per icosahedron vertex, at
   every subdivision level. Required by Gauss–Bonnet. Total angular defect on
   any closed surface topologically a sphere is 720°.
3. Cells are **vertices of the subdivided icosahedron**, not its faces. The
   triangles are the hierarchy; the hexagons are the playfield.
4. Terrain noise is sampled in **3D world space** from a cell's position or
   direction vector, never from its face-local `(i, j)`. Sampling in face
   coordinates produces visible discontinuities at all 30 face edges.
5. A cell's ID is **computed from position**, never enumerated or stored.
6. The delta store distinguishes *never modified* from *modified to air*. An
   explicit "air" entry is meaningful.
7. Block size is fixed at world creation. Radius absorbs level rounding.
8. Up is `normalize(position)`. There is no global up and no global north — the
   hairy ball theorem forbids one. Never store a heading as a world vector.
9. Direction indices are ordered **counter-clockwise as seen from outside**,
   never derived from `(q, r)` sign. Deriving them from local coordinates leaks
   the middle-child half turn into ~46% of chunks and reverses every rail in
   them. That flip is a **rotation, not a mirror** (`winding.js`): determinant
   +1, a uniform **+3** on every direction, ring still CCW. Nothing is ever
   mirrored, so no chirality bug is possible.
10. The tessellation is **identical at every layer** — same face, same path,
    same `(q, r)`, evaluated at a smaller radius. This is what makes vertical
    neighbours free, gravity tractable, and vertical face merging exact. Do not
    change horizontal resolution with depth; doc 06 raised it as a taper remedy
    and `taper.js` priced it at 18% more crust against an interior seam crossing
    every column on the planet, so doc 11 now files it as **struck**, not open.
11. Every adjacency is a **shared edge**, never a bare corner. That is the exact
    guarantee. "Six neighbours, all equidistant" is the *approximation* — 12
    cells have five, and spacing varies **1.41:1** (1.48:1 counting pentagons),
    not the 1.14:1 claimed until it was measured. Never state the approximation
    as the guarantee; doc 00's design goal 3 used to, and doc 10 inherited it.
    Anything dividing by "the" cell spacing divides by **1.098 × nominal**.
12. Vertex positions come from the **one-shot** construction: `(i, j)` maps to
    `normalize(A·a + B·b + C·c)`, a single barycentric blend evaluated once at
    full depth. **Never** build positions by repeated arc-midpoint subdivision —
    that is a different sphere, off by a fixed 38.97 m on the worked planet (39
    cells at level 11), and it breaks doc 04's rounding and doc 09's straight-line
    ray walk. Midpoint splitting is the *index* hierarchy only.
13. Identity is integer, world positions are `float64`, and anything GPU-facing is
    `float32` **relative to its chunk**. Never cache a world-space position across
    a frame — recompute it from anchor plus offset.
14. A cell **is** the set of directions `hexRound` maps to it — the radial
    projection of the planar Voronoi hexagon, and the **mesh draws that same
    curve** (doc 18): a corner is the lattice point `(3i+2, 3j+1)` at `3n` for an
    up-triangle, `(3i+1, 3j+2)` for a down-triangle. Average the flat lattice
    points and then project — never project and then average. Not "the nearest centre on the
    sphere", which differs on ~1% of the sphere. Position → cell must go through
    `hexRound`, never through a nearest-centre search, or the two disagree at
    boundaries.
15. The **twelve pentagon columns are protected** — no player placement or
    removal, at any layer (doc 17). In exchange, directional machinery **may
    assume degree 6**: it can never sit on a five. Do not write the degree-5
    case into rails, pipes or conveyors; write the placement refusal instead.
16. A heading carried along a path **must not be assumed to close** when the path
    does. A loop enclosing an odd number of pentagons returns rotated by one
    direction index — measured at **any radius and any offset** (`rotation.js`),
    so the slip depends only on what is **inside** the loop, not its width or its
    centre. No exclusion zone, ocean or distance fixes it. Recompute headings
    from the grid per step, and never carry one round a loop.
17. A block rotation is a **direction index into the cell's own neighbour ring**,
    6 states in 3 bits (doc 19). Never a world vector, never derived from
    `(q, r)` sign — 46% of chunks are turned half a turn, so a stored value would
    mean the opposite direction in half the world, on disk as well as on screen.

## Verified constants

| Symbol | Value | Meaning | Script |
|---|---|---|---|
| `N(L)` | `10 * 4^L + 2` | surface cells at level `L` | `scale.js` |
| `K` | `sqrt(8π / (10√3))` = `1.20459` | `blockSize ≈ K · radius / 2^L` | `calc.js` |
| hex area | `(√3 / 2) · d²` ≈ `0.866 d²` | `d` = centre-to-centre spacing | — |
| ID width | `5 + 2·D` bits | `D` = world subdivision depth | — |
| code space used | `≈ 31.25%` | `20/32` faces × `1/2` triangle-in-square | — |
| adjacency table | 60 entries, 180 bytes | 20 faces × 3 edges × 3 bytes | `adj.js` |
| S2 area ratios | linear `5.20`, quadratic `2.08`, tangent `1.41` | asymptotic | `s2.js` |
| RT defect split | `20 × 10.3°` + `12 × 42.8°` = `720°` | rhombic triacontahedron | `check.js` |
| cube defect split | `8 × 90°` = `720°` | why cube spheres pinch | — |
| hexagon area variation | `1.99 : 1` | `sec³(θᵥ)`, `θᵥ = 37.3774°`; NOT 1.3:1 | `uniform.js` |
| area variation with pentagons | `2.74 : 1` | across the whole sphere | `uniform.js` |
| cell spacing variation | `1.41 : 1` | `sec^1.5(θᵥ)`; 1.48:1 counting pentagons | `uniform.js` |
| largest edge ÷ nominal | `1.098` | the admissible A* divisor; doc 10 had 1.07 | `uniform.js` |
| narrowest cell ÷ nominal | `0.744` | at a pentagon; anchors the taper budget | `uniform.js` |
| taper budget | `25.6%` of `R` | `maxCrust = (1−0.744)·2^D/K` layers; `R` cancels | `taper.js` |
| max crust at `D` 11 | `435` layers | vs 64 in use — 6.8× headroom | `taper.js` |
| max levels in 64 bits | `24` with a 10-bit layer, `29` without | layer shares the word | — |
| float32 spacing at R | `2^(e-23)` for `R` in `[2^e, 2^(e+1))` | doubles at each binade | `precision.js` |
| float32 at R 1700 / Earth | `122 µm` / `500 mm` | 8192 / **2** positions per 1 m block | `precision.js` |
| float64 at Earth radius | `0.93 nm` | never the binding constraint | `precision.js` |
| one-shot vs recursive | `38.97 m` = `1.3133°` | fixed in metres; 39 cells at L11 | `precision.js` |
| ID → position error | flat in depth | path walk is integers; one blend, one normalise | `precision.js` |
| float32 `up` error | `0.005″` at every radius | directions are precision-robust | `precision.js` |
| hexRound vs nearest centre | `≈1%` of the sphere, plateaus | always edge-adjacent, ≤ `0.11` spacing | `hexround.js` |
| hex light disc | `3r² + 3r + 1` cells | vs `2r² + 2r + 1` on squares | `light.js` |
| lighting cost vs a cube | `1.497×` at range 15 | tends to `1.5`; cost grows as range³ | `light.js` |
| pentagon light disc | `1 + 5r(r+1)/2` = `5/6` area | less world in reach, NOT dimmer | `light.js` |
| light storage | `4×` the block data | 35 KB vs 9 KB per chunk, D11/C6 | `light.js` |
| sky light per column | `32×` smaller than per cell | monotone down a column | `light.js` |
| terminator speed | `circumference / dayLength` | `= 1.4 m/s` at doc 06's 2.12 h walk time | `light.js` |
| pentagon separation | `1,882 m`, cover radius `1,109 m` | never far from one; mean `663 m` | `pentagon.js` |
| loop slip around a pentagon | `1` index at **every** radius | topological; no exclusion zone helps | `pentagon.js` |
| tour of all twelve | `22,586 m` = `2.11×` around | 4.5 h walk; they are NOT inter-visible | `pentagon.js` |
| flipped-frame share | `≈ 46%` of cells | middle-child descent | `qr.js` |
| holonomy | `enclosedArea / R²` | rotation of a carried heading | `frame.js` |
| pentagon direction deficit | `1` index = `60°` | 12 × 60° = 720° | `frame.js` |
| pentagon deflection | `36.07°` | no straight exit exists | `frame.js` |
| pentagon antipodal pairs | 6 | poles can sit on two pentagons | `frame.js` |
| horizon, 1.7 m eye, R 1700 m | `76 m` | `R·acos(R/(R+h))` | `frame.js` |
| tilt between two points | `s / R` | 3.37° at 100 m on R 1700 m | `frame.js` |
| mesh cost, unmerged | `2` verts, `4` tris per cell | exactly 2× a cube surface | `mesh.js` |
| flat-patch sag | `s² / 8R` | bounds how far merging may reach | `mesh.js` |
| max merge span | `37 m` | at 0.1 m sag, R 1700 m | `mesh.js` |
| visible cells at eye height | `≈ 21,000` | 84k triangles, D 11, R 1700 m — a FLOOR | `mesh.js` |
| range to a peak of height h | `R·acos(R/(R+1.7)) + R·acos(R/(R+h))` | 60 m hill → 521 m, 47× the cells | `volume.js` |
| triangles per cell, real terrain | `4.0` flat → `9.5` at 120 m relief | saturates; merging absorbs relief | `volume.js` |
| density-term face cost | `≈10×`, mostly roughening | caves need gradient > 1 | `volume.js` |
| multi-span columns with caves | `8–24%` | what the seam rule must handle | `volume.js` |
| holes at a LOD seam | `1041` naive, `961` skirted, `0` seam-owned | over 385 rim columns | `seam.js` |
| density term vs height term | `51×` full crust, `26×` banded | per chunk, noise evaluations | `volume.js` |

## Established results

- Nearest face centroid **is** the containing icosahedron face. Exact, not an
  approximation: face boundaries are the perpendicular bisectors between
  adjacent centroids. Checked on 200,000 random directions, 0 mismatches
  (`lookup.js`). That covers step 1 of the doc-04 pipeline; step 3 is below.
- **A cell is what `hexRound` says it is** (`hexround.js`) — the radial projection
  of the lattice point's *planar* Voronoi hexagon, adopted as the normative
  definition. Measured against nearest-centre-on-the-sphere they disagree on
  **~1%** of the sphere, and the rate **plateaus rather than falling with depth**
  (3.56% at L2 → ~1% by L5–7), because a face triangle's shape is scale-free.
  Every disagreement is with an **edge-adjacent** cell and never more than **0.11
  of a spacing**. Adopting the projected diagram makes doc 04's rounding and doc
  09's ray walk exact by construction; the alternative makes both ~1% approximate
  and buys nothing.
- **The mesh and the lookup draw the same curve** (`boundary.js`, doc 18). What
  separated them was never circumcentre-vs-centroid — a face is equilateral, so
  inside it those coincide **exactly** — but the order of two operations:
  **average the flat lattice points, then project**, never project then average.
  The gap was `3.85e-5` of a cell at L11 (**0.038 mm**) and **halves every level**,
  the only discrepancy here that does not plateau. Doc 11 had it as "~0.1 of a
  cell", out by **2,600×**; that 0.1 belongs to spherical Voronoi (`hexround.js`).
  The fix is free: a corner is the lattice point `(3i+2, 3j+1)` at `3n`
  (up-triangle) or `(3i+1, 3j+2)` (down), so doc 14's 2-verts-4-tris is untouched.
  **No seam at the 30 face edges** and **no reflex corners** — both were where the
  cost was expected.
- Every cell is an **exactly regular hexagon in its own face plane**
  (`boundary.js`) — twelve decimal places. So all of the 1.99:1 area spread is
  what radial projection does, and none of it is irregularity in the polygon.
- `(i, j)` ↔ `path digits + (q, r)` round-trips exactly (`qr.js`).
- **The middle-child flip is a half turn, not a mirror** (`winding.js`). The
  descent negates *both* axes, so the determinant is **+1** and handedness is
  never changed — no chirality bug is possible anywhere. A naive `(q, r)`-derived
  direction is shifted by a uniform **+3**, ring still CCW; a reflection would
  reverse the order and fix two directions, and nothing is fixed. Docs said
  "mirrored" until it was measured. Separately, listing a downward triangle by the
  same rising-index rule as an upward one winds it **inward** — doc 14's two
  emit patterns are already correct, and reusing one for both holes the mesh.
- A 4-way midpoint triangle split admits **no** continuous edge-adjacent
  traversal. The child adjacency graph is a star; best achievable is 2 of 3
  steps adjacent (`order.js`). Do not attempt a Sierpiński curve on 4-way
  refinement — it requires bisection refinement, which destroys the geodesic
  geometry the hexagons depend on. Plain depth-first ordering is correct and
  sufficient.
- Hexagons in a Goldberg polyhedron are **near-regular, not congruent**, and by
  twice what this file used to say (`uniform.js`). Hexagon area varies
  **1.99:1**, 2.74:1 counting the pentagons; spacing varies **1.41:1**. The limit
  is the closed form `sec³(θᵥ)`, `θᵥ = 37.3774°` — one-shot barycentric *is*
  gnomonic projection, so this is gnomonic area distortion across a face. It
  **rises with level and settles**; depth is not a fix. The old 1.3:1 was a
  level-2 reading (the ratio really is 1.17 there), it propagated into eight
  documents unverified, and it had made doc 10's A* heuristic **inadmissible** —
  that document divided by nominal + 7% when the true maximum is nominal + 9.84%.
  Do not write code assuming uniform cell area, and divide by `1.098 × nominal`.
- **Layer merging is struck, not open** (`taper.js`). The taper budget is 25.6%
  of the radius — `(1−0.744)·2^D/K` layers, and **the radius cancels**, so the
  crust cap is a property of `D` alone: 435 layers at `D` 11 against the 64 in
  use. Merging buys **77 addressable layers, 18%** (the ID's layer field stops at
  512) and costs an interior seam crossing **every column on the planet** — cell
  *centres* nest exactly, cell *areas* do not, so 3 of every 4 columns dead-end
  at the shell — plus all four results invariant 10 pays for. Cap the crust.
- The 720° shows up **twice**, and the two forms behave oppositely under
  refinement (`frame.js`). The *geometric* defect at a pentagon shrinks ~4× per
  level (15.69° at L1 → 0.042° at L5); the *combinatorial* deficit is 1 direction
  index = 60° at every level, forever. Raising subdivision depth hides pentagons
  from terrain and walking players, and does **nothing** for rails, pipes or any
  other directional machinery. Do not propose depth as a fix for the second.
- There are **three** local frames, for three jobs, and they must not be
  interconverted casually: axis (coordinates), transported (camera), grid
  (machinery). See `docs/13-gravity-and-orientation.md`.
- Meshing is **not** the disaster doc 11 originally implied (`mesh.js`). Unmerged,
  a hex surface costs 2 verts and 4 tris per cell — a flat 2× a cube surface.
  Run-length merging down a column is exact and free; only the rectangle-growing
  half of greedy meshing has no hex equivalent. Cap merging is bounded by
  curvature (37 m at 0.1 m sag), not by the algorithm.
- Terrain is **generated, not stored** — there is no heightmap, so LOD is
  re-generation and cuts noise cost 4× per level as well as draw cost
  (`volume.js`). The density term costs 51× the height term over a full crust,
  so **far chunks run the height field alone**: a coarse mesh cannot represent a
  cave anyway (a 3 m cave is gone by level 10). That makes a LOD-2 chunk ~330×
  cheaper to generate.
- Cave geometry is culled **by enclosure, never by simplification**. It costs
  build time and memory, not draw time.
- The density term only carves **enclosed** voids when its noise gradient
  (amplitude / feature size) exceeds 1 — the bias grows 1 per metre of depth
  (`volume.js`). Raising `strength` without raising frequency buys a rougher
  surface and a 10x face bill and **zero caves**. Caves are what create
  multi-span columns (8-24% of them); rough surfaces do not.
- **A skirt does not close a cave mouth** (`seam.js`). At a LOD boundary a skirt
  closes the surface slit and ~1% of cave mouths; 99% sit deeper than it reaches,
  because a skirt hangs downward and a cave mouth is a horizontal hole. One skirt
  per span is NOT the fix. The finer chunk must **own the seam**: emit a face
  wherever its solidity differs from the coarse neighbour's, both directions,
  costing 2.7 faces and one height-field evaluation per rim column. Keep the
  skirt too, as cover for the frames after a neighbour changes level.
- LOD is **resampling, not decimation** — Goldberg levels do not nest, so a
  coarse mesh re-evaluates the terrain function rather than dropping cells. LOD
  seams come from terrain sampled at two spacings, not from geometry; skirts one
  coarse cell deep cover them and do not care what level the neighbour chose.
- **The ID is already a floating origin** (`precision.js`). Every field is an
  integer, so identity never drifts at any planet size, and floating point enters
  only when an ID is turned into a position — against any origin you choose. The
  rebase is per-entity renormalisation of an anchor and a bounded offset, not a
  world-shift event. Velocities, orientations and mesh buffers are all unaffected.
- **Directions survive what positions do not.** `up` holds 0.005″ at every radius
  while position error grows linearly with `R`, so gravity and all three frames
  need no precision handling — and doc 04's pipeline is already right, because its
  first line is `dir = normalize(pos)` and every later step works on the direction.
- **The pentagon loop slip is topological** (`pentagon.js`). Measured at loop radii
  1 through 16: **one index, every time**. It counts the pentagons enclosed, not
  the distance kept, so no exclusion zone or ocean removes it — doc 13's claim that
  burial "removes the problem" is corrected in doc 17. Burial removes only the
  *local* problem. That is why doc 17 protects the cell (cheap, reversible, keeps
  seed variety) rather than flooding it (1% of the surface, fixes the macro map of
  every world, cannot be undone).
- **Lighting is where the sphere costs least** (`light.js`). Light is a *scalar*,
  so holonomy and the pentagon direction deficit simply do not apply. 8 neighbours
  cost a flat 1.5×; radial sky light is as cheap as a flat world's because
  invariant 10 makes a column straight; the terminator is one dot product against
  gravity's `up`. The twelve pentagons cost **nothing** — a torch there lights 5/6
  as many cells only because a ring holds `5k` instead of `6k`. The real bill is
  storage: 4× the block data, halved again by storing sky light per column.
- **ID → position does not accumulate error.** Flat across depths 4 to 23: the
  path walk is integer arithmetic, so the float work is one barycentric blend and
  one normalise however deep the world goes. A deeper world is not a less accurate
  one.

## Naming conventions

| Term | Means |
|---|---|
| `face` | one of the 20 icosahedron faces; 5-bit ID field |
| `path` | quaternary digits selecting a child triangle per level |
| `depth` / `D` | **subdivision** depth — horizontal grid fineness |
| `chunkLevel` / `C` | where the ID is cut into chunk prefix and local part |
| `layer` | radial index, downward from the crust top |
| `crust depth` | how many layers deep the world is; unrelated to `depth` |
| `(i, j)` | lattice coordinates across a whole face |
| `(q, r)` | lattice coordinates within a chunk |
| `cell` | one hexagon (or one of the 12 pentagons) at one layer |
| `chunk` | one triangle at `chunkLevel`, the load/store unit |
| `direction index` | 0–5 (0–4 on a pentagon) into a cell's CCW neighbour ring |
| `holonomy` | rotation a carried heading gains around a closed loop |

`depth` is overloaded in casual speech. In code and docs, always qualify:
`subdivisionDepth` versus `crustDepth`.

## Known gaps

Do not assume these are solved. See [`docs/11-open-topics.md`](docs/11-open-topics.md).

- ~~Layer merging~~ — **struck** (`taper.js`, doc 06). Cap the crust; do not
  reopen this without reading the price
- Light across a **LOD seam** — doc 14's "finer chunk owns the seam" was for
  geometry; a flood fill propagates inward, so the rule may not transfer
- Player-facing coordinates (latitude / longitude / altitude)
- Rivers, erosion, and plate-scale continents — all global processes
