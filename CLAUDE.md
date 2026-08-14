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

## Project shape

- Documentation and demos only. No engine source code exists yet.
- `docs/` — prose specification, ordered 00 through 16.
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
| [02](docs/02-geometry-choice.md) | the tiling: Goldberg, dual of a subdivided icosahedron | `check.js` |
| [03](docs/03-addressing.md) | ID layout, path digits, the flip flag, border ownership | `qr.js`, `order.js` |
| [04](docs/04-position-lookup.md) | position → cell, exactly and without storage | `lookup.js` |
| [05](docs/05-face-adjacency.md) | crossing between the 20 faces; the 180-byte table | `adj.js` |
| [06](docs/06-world-sizing.md) | block size ↔ radius ↔ level, crust depth, taper | `calc.js`, `scale.js` |
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

Doc 04 also owns the **definition of a cell boundary** (`hexround.js`), which is
load-bearing for docs 07, 09 and 14 — read it before touching position → cell.

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
   the middle-child mirror into ~46% of chunks and reverses every rail in them.
10. The tessellation is **identical at every layer** — same face, same path,
    same `(q, r)`, evaluated at a smaller radius. This is what makes vertical
    neighbours free, gravity tractable, and vertical face merging exact. Do not
    change horizontal resolution with depth; doc 06 mentions it as a taper
    remedy, and doc 11 files it as unsolved for exactly this reason.
11. Every adjacency is a **shared edge**, never a bare corner. That is the exact
    guarantee. "Six neighbours, all equidistant" is the *approximation* — 12
    cells have five, and spacing varies ~1.14:1. Never state the approximation
    as the guarantee; doc 00's design goal 3 used to, and doc 10 inherited it.
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
    projection of the planar Voronoi hexagon. Not "the nearest centre on the
    sphere", which differs on ~1% of the sphere. Position → cell must go through
    `hexRound`, never through a nearest-centre search, or the two disagree at
    boundaries.

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
| cell spacing variation | `≈ 1.14 : 1` | √(1.3:1 area); divide by MAX, not nominal | — |
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
- `(i, j)` ↔ `path digits + (q, r)` round-trips exactly (`qr.js`).
- A 4-way midpoint triangle split admits **no** continuous edge-adjacent
  traversal. The child adjacency graph is a star; best achievable is 2 of 3
  steps adjacent (`order.js`). Do not attempt a Sierpiński curve on 4-way
  refinement — it requires bisection refinement, which destroys the geodesic
  geometry the hexagons depend on. Plain depth-first ordering is correct and
  sufficient.
- Hexagons in a Goldberg polyhedron are **near-regular, not congruent**. Area
  varies roughly 1.3:1 across the sphere. Do not write code assuming uniform
  cell area.
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

- **Which boundary the mesh draws.** Three definitions are now in play and they
  differ by ~0.1 of a cell: the projected planar Voronoi diagram (doc 04 lookup,
  doc 09 ray walk — **normative**), spherical Voronoi (nobody, now), and the dual
  polyhedron's centroid corners (doc 14 meshing). A player clicks the mesh and the
  lookup answers from a different curve. Small, well-posed, close it before
  building on the mesh
- **Layer merging is proposed but never designed** and contradicts invariant 10.
  Cap the crust instead unless someone designs the interior seam
- Light across a **LOD seam** — doc 14's "finer chunk owns the seam" was for
  geometry; a flood fill propagates inward, so the rule may not transfer
- Six-state block rotation for directional blocks
- Pentagon handling as a *gameplay* problem, not just a maths one
- Player-facing coordinates (latitude / longitude / altitude)
- Rivers, erosion, and plate-scale continents — all global processes
