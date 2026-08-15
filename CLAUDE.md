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
- **No engine source yet.** Nothing in the specification blocks it any more
  (doc 26 Part 1 is empty, doc 28 picked **Rust**), but do not start implementing
  from these documents without being asked to.
- Commit as `KristoferBorgware <kristofer@borgware.se>`, with no co-authoring
  trailer and no model identifier in the message. **Set this in the repo config,
  once, at the start of a session** — `git config user.name` / `user.email`. Passing
  `-c user.name=...` per commit is not enough: it sets the committer for that
  command only, and a later `git rebase` or `git commit --amend` re-stamps the
  committer from the ambient config. That is how `Claude <noreply@anthropic.com>`
  ends up in the committer field of a commit whose author is correct.
- **Never rewrite pushed history.** No rebase, amend or force-push on anything
  that has left this machine — SHAs are not to change. If `master` has moved under
  you, **merge it** rather than rebasing onto it: a merge leaves every existing
  commit's SHA intact, and other sessions may already be working from them.

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
13 through 25 carry the hardest material in the specification and are the ones
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
- `docs/` — prose specification, ordered 00 through 29.
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
| [20](docs/20-player-coordinates.md) | lat/long/altitude, the axis through a pentagon pair, what to share | `coords.js` |
| [21](docs/21-rivers-and-erosion.md) | the one stored map, flow routing, pit filling, why continents come first | `rivers.js` |
| [22](docs/22-multiplayer-interest.md) | who to tell about an edit; why a patch is not an ID range | `interest.js` |
| [23](docs/23-determinism.md) | which arithmetic is bit-identical everywhere, and what that forbids | `determinism.js` |
| [24](docs/24-edits-and-global-processes.md) | the coarse map is read-only; what a dammed river actually does | `edits.js` |
| [25](docs/25-water.md) | water is a block type; drawing a translucent ocean; floating vs colliding | `water.js` |
| [26](docs/26-implementation-readiness.md) | what blocks the first line of code, and the order to build in | — |
| [27](docs/27-block-state.md) | what a block IS as bits; the registry; palette vs delta record | `blockstate.js` |
| [28](docs/28-language-and-runtime.md) | the language: Rust, and why determinism did not decide it | `language.js` |
| [29](docs/29-what-runs-where.md) | the three layers; what crosses the wire; Rust → wasm | `language.js` |

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
   starting at the step from the cell's own face vertex **`A` toward `B`** — the
   `(i, j)` offset `(+1, 0)` (`neighbour.js`) — and never derived from `(q, r)` sign. Deriving them from local coordinates leaks
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
| ID width | `5 + 2·D + 2` bits | the last 2 name a corner, not a triangle | `id.js` |
| block state | `12` type + `4` rotation = 16 bits | 4,096 types = `3.5x` Minecraft's 1,159 | `blockstate.js` |
| fixed-split cost | `40–68%` of type slots at MC scale | flat index would be 40%; still fits | `blockstate.js` |
| type-name hash | **unusable** — 50% collision at `75` types | registry in the save instead | `blockstate.js` |
| cross-language digest | `6` of 6 identical | JS, C, Rust, Java, Go, Python; 80,000 float64s | `language.js` |
| one C source, flags moved | `4` distinct digests | `-march=haswell` alone changes the world | `language.js` |
| `hypot` vs `sqrt` | `hypot` differs `1` ULP between runtimes | `sqrt(x*x+y*y+z*z)` never does | `language.js` |
| delta record | `29 + 10 + 16` = `55` of 64 bits | planet implied by the file; 9 spare | `blockstate.js` |
| chunk palette | `2` bits/cell typical = `8.8` KB | 12.5% of a flat 16-bit field | `blockstate.js` |
| side table entry | chest `~108` B, sign `~240` B | 1,000 in a chunk = 117 KB | `blockstate.js` |
| entity rekey rate | every `0.71` s = 21 frames | why entities are NOT keyed by cell | `blockstate.js` |
| planet field | `12` bits = 4,096 worlds | word is 51 of 64 at D11 | `id.js` |
| code space used | `≈ 7.81%` | `0.625` face × `0.75` corner × `1/6` canonical | `id.js` |
| max levels in 64 bits | `17` | `12 + 5 + 2D + 2 + 10 ≤ 64`; 1.6 cm blocks | `scale.js` |
| share code | `8` base-36 chars | address + layer = 39 bits; 10 with planet | `coords.js` |
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
| float32 spacing at R | `2^(e-23)` for `R` in `[2^e, 2^(e+1))` | doubles at each binade | `precision.js` |
| float32 at R 1700 / Earth | `122 µm` / `500 mm` | 8192 / **2** positions per 1 m block | `precision.js` |
| float64 at Earth radius | `0.93 nm` | never the binding constraint | `precision.js` |
| offset representation | **`float64`**, not fixed-point | `7.1e-15 m` over a 32 m chunk | `precision.js` |
| float32 inter-entity vector | fine to `~16 km`, `0.12 mm` at R 1700 | breaks at Earth radius (`0.5 m`) | `precision.js` |
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
| water faces drawn | `0.89%` of the naive count | 113,455 of 12,717,512; **0** sides | `water.js` |
| water surfaces in one view | `82.3%` see one, `0.6%` two | worst 3, over a 76 m horizon | `water.js` |
| sea-surface merge span | `37` cells into one quad | sea level is a radius, so exactly flat | `water.js` |
| depth at the water's edge | `85.3%` one block, `13.9%` two | over 4,189 shore columns | `water.js` |
| shore you can step out at | `99.9%`; `58/58` bodies | worst bank 1.23 m; nothing traps a swimmer | `water.js` |
| wade/swim threshold | **one cell**, no chest-deep | 1.8 m player, 1 m blocks | `water.js` |
| noise hash | 3 wrapping `uint32` multiplies, 2 xor-shifts | `/2^32`; never a float multiply past `2^53` | `noise.js` |
| fade curve | quintic `6t⁵−15t⁴+10t³` | smoothstep jumps curvature **12** per plane | `noise.js` |
| fBm | lacunarity 2, gain 0.5, **low octave first** | ÷ summed amplitude; sd is `0.244` of it | `noise.js` |
| pentagon ring latitude | `atan(1/2)` = `26.565°` | 1 pole + 5 + 5 + 1 pole, every world | `coords.js` |
| distinct axis choices | `1` of 6 pairs | all six are the same world, rotated | `coords.js` |
| polar axis | vertices `0`–`3`, north `0`, meridian `v11` | the only pair with contiguous face caps | `coords.js` |
| direction index 0 | the step from the face's `A` toward `B` | `(i,j)` offset `(+1,0)`; ring CCW from there | `neighbour.js` |
| face crossing | `(α,β,γ) → (α+γ, β+γ, −γ)` | integer weights on global vertex ids | `neighbour.js` |
| pentagon ring length | `5`, not 6 with a hole | `k = 5` is not a direction | `neighbour.js` |
| `rank(q, r)` | `q + r·(2m+3−r)/2`, `m = 2^(D−C)` | over the whole triangle; a bijection | `rank.js` |
| chunk slots | `(m+1)(m+2)/2` = `561` at D11/C6 | same stride for every chunk | `rank.js` |
| cells a chunk owns | `(m−1)(m−2)/2 + e(m−1) + c` | `e` edges, `c` corners won | `rank.js` |
| wasted slots per chunk | `(3m+2)/2` = `49` of 561 | `8.7%`, 784 bytes; buys a uniform stride | `rank.js` |

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
- **Doc 15's last two entries are closed, and both by removing a reason rather
  than adding one** (`precision.js` §8–9). **Fixed-point offsets are declined**:
  the entry rested on them making positions reproducible across machines, and
  doc 23 had already shown `float64` positions *are* bit-identical, after which
  precision could not discriminate — over a 32 m chunk `float64` gives `7.1e-15 m`
  against millimetre fixed-point's `1e-3 m`, and every candidate resolves a 1 m
  block thousands of times over. Fixed-point would still defend against compiler
  contraction, but the flag is a one-line defence and integers have no `sqrt` —
  and `normalize` is the runtime's most-called function. **An anchor may be
  trusted at any distance the worked planet contains**: `float32` on an
  inter-entity vector holds `0.12 mm` at the 1,700 m antipode and only fails past
  **~16 km**. Keep the vectors in `float64` anyway — they are per-entity and rare,
  while the `float32` budget exists for per-vertex data.
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
- **Rivers, erosion and continents need one stored map** (`rivers.js`, doc 21) —
  2.5 MB at level 8, computed once at world creation, read as an input so the
  runtime generator stays a pure function of position. Flow routing needs **no
  pentagon case and no face case** (0 of 12 pentagons were pits); the work is
  **pit filling**, and a flat filled lake stops every river reaching it — fill
  with a tiny slope and 0 dead ends remain. **Continents decide rivers**: the same
  routing gives a 31-cell river on small blobs and 86 on a large landmass, so
  build the continent tier first. The coarse lookup is masking the low bits of
  **`(i, j)`**, not the path digits — those give a triangle, not a cell.
- **The runtime is bit-identical across machines by construction**
  (`determinism.js`, doc 23). IEEE 754 pins `+ − × ÷ sqrt` and comparisons to the
  bit — **including `sqrt`, so `normalize` is safe** and doc 15's stated worry is
  withdrawn. Position → cell, ID → position, gravity, the ray walk and
  integer-hashed noise are all in that set; transcendentals appear only in display
  code. A last-bit disagreement is `3.8e-13` of a cell against `1.21e-6` for the
  closest of 400,000 sampled positions, even after the pipeline's 286× growth.
  **Flow routing is not the hair trigger it looks like** — one ULP reroutes 0 of
  40,962 cells and nothing moves until `1e-3`. So the rule is about **function
  calls, not tolerances**: never call a transcendental where the result is stored
  or shared, hash noise with integers not `sin`, and take erosion exponents from
  `{0.5, 1, 1.5, 2}` (products of `sqrt` and multiply). Then doc 22's client
  regenerates the coarse map instead of downloading it. Also: disable
  floating-point contraction in the build, and fix reduction order.
- **The coarse map is read-only, and that is a decision** (`edits.js`, doc 24).
  It states where water would flow across the **generated** world, never the
  current one — which keeps it a pure function of the seed, so doc 23's client can
  still regenerate it. Measured reasons: **one block dams nothing** (a cell has six
  ways out; 1 cell floods 0, a 5-cell wall floods 29 and reaches 144 m), upstream
  is **bounded by terrain** while downstream is not, and **where you dam decides
  whether the change is local at all** — a headwater dam's deficit fades to 4%
  within 20 cells, a main-stem dam runs to the coast. So there is no radius to
  partially recompute within. The accepted cost: a dammed river still has water
  below the dam.
- **A patch is not an ID range** (`interest.js`, doc 22). A contiguous range IS
  one compact patch (doc 03), but the converse fails: a player's disc breaks into
  **10.9** runs at a 76 m horizon and **155.6** at a kilometre, and the child
  order buys 13% at most because `order.js` already proved the four children
  cannot be walked edge-to-edge. Runs scale with the region's **rim**, chunks with
  its **area**. So interest is **one dot product per player** (over 100M/s; the exact
  rate is a wall-clock timing and moves run to run), and the ID ordering earns its
  keep on **disk** — 5 runs fetch 62% of a region.
- **Water is a block type, and there is no fluid system** (`water.js`, doc 25) —
  translucent, no collision, written once by the generator, never simulated.
  Doc 21's erosion still runs, at world creation, and what it leaves behind is
  blocks. Transparency turns out to be cheap in three separate ways: interior
  faces cull like stone's, so 1,589,689 water cells draw **113,455 faces —
  0.89%**; generated water has **0 exposed sides**, because it is always held in
  by land at or above its own level (a vertical water face only exists where a
  player built one); and a view crosses **one** surface **82.3%** of the time,
  two 0.6%, because water fills a column from the floor up. So doc 14's open
  transparency question is opaque pass, then water back to front, and the sort is
  of one thing. Sea level is a **radius**, making the ocean the only exactly flat
  surface on the planet and doc 14's best merge candidate: **37 cells into one
  quad**. Editing water costs exactly what editing stone costs.
- **You do not fall through water, and that is a different query from collision**
  (`water.js`, doc 25). No collision is a **face** test, always yes for water;
  floating is a **cell** test — doc 04's position → cell lookup plus a block-type
  read, both of which already exist. The generated world makes it playable without
  anyone designing it to: **85.3%** of the water's edge is one block deep, you can
  step out at **99.9%** of shore columns, and **58 of 58** bodies of water have an
  exit, because water fills a valley and a valley has sides. At 1 m blocks a 1.8 m
  player stands in one block and swims in two, so walking↔swimming is a
  **threshold one cell wide** — never write a partial-buoyancy case. The one real
  trap: a non-colliding block is one a fast mover passes through, and at 30 Hz a
  falling player crosses 1.67 m per frame, so test the **swept segment** with doc
  09's ray walk, never the endpoint.
- **Water is placeable** (doc 25) — a bucket exists, and a placed block stays put,
  in mid-air if that is where it was put. This is the only source of an exposed
  vertical water face and the only way a view crosses two surfaces, so `water.js`'s
  **0 sides** and **82.3% one surface** describe the **generated** world and do not
  bound what a player builds. Neither changes the renderer's design.
- **`neighbour(id, k)` is buildable from the table and integers alone**
  (`neighbour.js`, doc 05), and agrees with the geometric graph at **every cell**
  of depths 3–5: same neighbours, same direction round the ring, exactly 12 cells
  at degree 5. Three findings. **Index 0** is the step from the face's `A` toward
  `B` — a property of the cell's own face, so it never depends on how the cell was
  reached, which is what doc 19's 3 stored bits needed. **Crossing an edge is a
  reflection in three additions**, because a lattice point is integer weights on
  *global vertex ids* — a description that never mentions a face — so
  `(α,β,γ) → (α+γ, β+γ, −γ)` and the point never moves, only its name does; 60/60
  edges round-trip over 900/900 steps, and the table's **`reversed` field is never
  read**. **A pentagon's ring is 5 long**: `k = 5` is not a direction, never a
  duplicate and never a null mid-ring. The half turn also arrives from inside the
  function — a `(q,r)`-derived index is **+0 or +3 and nothing else**, +0 in every
  unflipped chunk and +3 in every flipped one, no crossover.
- **Doc 03's border rule had never been checked, and it holds** (`rank.js`,
  doc 07). Awarding each cell to the lowest chunk ID containing it sums to exactly
  `10·4^D + 2` on four `D`/`C` cuts — one home per cell, none without. `rank` is
  `q + r·(2m+3−r)/2` over the **whole** triangle: a chunk is a uniform
  `(m+1)(m+2)/2` slots (**561** at D11/C6) of which it owns
  `(m−1)(m−2)/2 + e(m−1) + c`, an edge being won or lost whole. The dense
  alternative saves exactly `(3m+2)/2` slots — 49 of 561, **8.7%**, 784 bytes a
  chunk — and costs the uniform stride that made `index = rank × layerCount +
  layer` a single sentence. Take the waste.
- **The noise function is pinned** (`noise.js`, doc 08): a `uint32` hash, trilinear
  value noise with the **quintic** fade, fBm at lacunarity 2 / gain 0.5 / **low
  octave first**, ÷ summed amplitude. Three findings. The float-multiply hash this
  repo also contains was expected to lose on *quality* and does not — both
  avalanche within `0.0014` of ideal — so it loses on **portability alone**: its
  second multiply makes a `2^62` product, and truncating that is defined in JS and
  **undefined behaviour in C**. Smoothstep would leave a **curvature jump of 12**
  at every lattice plane (7.05 measured against 0.08), which shading shows as a
  grid. And accumulation order differs *only sometimes* — exact at 6 and 8 octaves,
  `1.4e-17` apart at 4 and 5 — which is the kind of bug testing never finds.
  **Debt:** `volume.js`, `mesh.js` and `seam.js` still use the old hash and so
  describe a different planet (**1.28 m mean, 5.85 m worst** over 60 m of relief);
  their conclusions are statistical and unaffected, but switch them before sizing
  an engine.
- **A block type number cannot be a hash of its name** (`blockstate.js`, doc 27).
  In doc 03's 12-bit type field the birthday problem gives **even odds on a
  collision at 75 types** and 99.2% at 200 — and a collision is two blocks sharing
  a number, so every save holding both is unreadable. Widening does not fix it:
  24 bits still collides 2.9% of the time at 1,000 types. **The save carries a
  registry** — names in order, index is the number, append only, never reuse a
  slot, 96 KB for a full one. Rotation stays a **mask not a lookup** (doc 19 reads
  it per block per frame), and the 16-variant cap is **not** cheap: against
  Minecraft's yardstick of 1,159 types and ~26,000 states (quoted from the wiki,
  not measured) the fixed split spends **40–68%** of the type space where a flat
  index spends 40%. It fits with headroom; the space was never the argument.
  **The side table** is cell ID → a tagged, length-prefixed blob — the length so
  an unknown tag is **stepped over** rather than crashing an older build.
  **Entities do not belong in it** — doc 07 lists them there, but a mob changes
  cell every **0.71 s**, so keying one by cell is a rekey every 21 frames forever.
  Entities are held per chunk by containment; the cell a mob stands in is a query,
  not its address.
- **The table answers "does this cell have side data", not the type**
  (`blockstate.js` §8, doc 27). Doc 27 first said the **type** does — cheap, and
  the wrong shape: it settles a per-**cell** question from a per-**type** fact, so
  a stone block could never carry a name. **Nothing on the frame path asks the
  question.** The mesher reads the type for a model, the renderer reads a palette
  index, lighting and physics and the ray walk read solidity, save/load iterates
  the **table**; the only asker is a player opening or breaking a block, **twice a
  second, one cell**. So a **flag bit** is free in width and not in **palette** —
  three flagged types take a chunk from 4 distinct states to 7, 2 bits a cell to 3,
  **8.8 → 13.1 KB** — and a **bitmap** is **4.4 KB per chunk resident**, the same
  whether it holds a thousand chests or none, which almost every chunk does. Worse,
  the type-gate **orphans the blob**: replace the chest with stone and stone says
  "no side data", so nothing reads it and nothing frees it, and the next chest
  there opens full of someone else's ore. One rule instead, no cases: **writing a
  block clears that cell's side data.** The type still says what a fresh block is
  **born** with and what a tag **means**. Doc 19's spare rotation bit stays spare.
- **The language was never a determinism question** (`language.js`, doc 28). Doc
  23 said a real check "cannot be done from inside one script"; it can, one level
  down. The pinned kernel — noise hash, quintic fade, fBm, barycentric blend,
  `normalize` — written in **six languages** and run on one machine gives **one
  64-bit digest** over 80,000 `float64`s: JavaScript, C, Rust, Java, Go and
  Python, **6 of 6**. They are not "similar but not identical" as docs 11, 23 and
  26 all said; they are the same. **The only thing that breaks bit-identity in the
  whole experiment is a C build with FMA contraction on** — one source, **four
  distinct digests**, `-march=haswell` alone flips it, and **gcc and clang do not
  even fuse the same way**. That is the *default* build on `aarch64`, where FMA is
  baseline, so an x86 server and an ARM client from one source generate two
  planets. `-ffp-contract=off` is **necessary and not sufficient**: `-Ofast`
  undoes it. Also measured: **`hypot` is not `sqrt`** — a library routine, not an
  IEEE operation, **1 ULP** apart between runtimes on one machine, as is `pow`,
  while `sqrt(x*x+y*y+z*z)` agrees everywhere. **`normalize` must be written the
  long way.** So determinism eliminated nobody, and **Rust** was chosen on the
  four requirements left: no flag needed at any `-O`, `wrapping_mul` in the
  language, the fast data layout being the **default** one, and **one source
  compiling to native and WebAssembly** — which is what doc 22's client
  regenerating the coarse map actually requires.
- **"It has a garbage collector" is the wrong test** (`language.js` §5, doc 28).
  Doc 28's first draft made "no GC pause in a frame" a requirement and used it to
  push Java and TypeScript down; it does not survive measurement. **The generator
  allocates nothing** in any language — scalar maths end to end — so nothing
  collects, and on it JavaScript is **1.75×** C and Java **1.60×**. On doc 14's
  84,000-triangle buffer build the **language gap is 1.5×** (Rust `Vec` 0.18 ms,
  JS typed arrays 0.27 ms) and the **layout gap is 15×** (JS with one object per
  vertex, 4.13 ms — and that is the version that allocates 42,000 objects a
  rebuild). **Data layout matters ~10× more than language.** The real difference
  is which layout you get by writing the obvious thing: a `Vec<struct>` is
  contiguous, an array of objects is not. **TypeScript is the strongest case
  against Rust** — it satisfies doc 22's native-and-browser requirement for
  **free** where Rust needs `wasm32` — and the margin is thin enough to say so.
  These are wall-clock timings; read ratios, and note nothing measures a whole
  frame because there is no mesher yet.
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

**Doc 11 refilled.** Its original twelve entries are all struck through, and
**Part 1 of that page is now the kernel gap list** — the four things that block
the first line of code. Doc 26 triages the rest: of the **46** open bullets across
docs 13–25, **one** blocks code, 25 are waiting for code to exist, and 20 block
nothing.

**The gaps that actually block the kernel were on no Still open list** — they are
doc 11 Part 1, and doc 26 is the triage that found them. **All five are now
closed**, every one by building and measuring rather than arguing. **Part 1 is
empty; nothing in the specification blocks the first line of code.**

- ~~`neighbour(id, k)`~~ — **closed** by `neighbour.js`, see doc 05.
- ~~`rank(q, r)`~~ — **closed** by `rank.js`, see doc 07.
- ~~`noise`~~ — **closed** by `noise.js`, see doc 08.
- **The ID word — REOPENED** by adding a planet field (`id.js`, doc 03). Packing
  the bits for the first time broke three claims. `[face][path][q][r]` as doc 03
  draws it: **2,144 of 2,145** cells change value when `C` moves, so the chunk
  level would be baked into every stored ID and doc 06's "tunable after launch"
  is false. Carrying the path to full depth does not fix it — **path digits name
  triangles and a cell is a vertex** (invariant 3), so three corners always
  remain. And `q`, `r` need `(D−C)+1` bits, not `(D−C)`, because a side-`m`
  triangle has `m+1` lattice points per edge. **The address is `5 + 2D + 2`.**
  Three encodings are priced in doc 03; **C** (path to depth `D` + 2-bit corner,
  canonicalised by lowest ID) is the decision and **is verified** — `id.js` §5–6.
  Word at D11: planet 12 + address 29 + layer 10 = **51 of 64**.
- ~~`The ID word`~~ — **closed** by `id.js` §5–6: option C verified, see doc 03.
- ~~`Which language and runtime`~~ — **closed** by `language.js`, see doc 28.
  **Rust.**

**Decided, and it was free only until the first world shipped:** the polar axis
(doc 20). All six antipodal pentagon pairs give **one** distinct latitude
signature — the same world seen from six angles — so the choice provably cannot be
made on merit. Broken on the face table instead: `0-3` is the only pair whose
polar caps are contiguous runs of face indices. **Axis through vertices 0 and 3,
north at vertex 0, prime meridian through vertex 11.** That puts all twelve
pentagons on exact multiples of 36° of longitude. Never change any of the three.

The furthest-reaching items that are waiting on code rather than blocking it:
**nothing verifies determinism on two real `aarch64`-vs-`x86` platforms** (doc 23
— six *languages* now agree, `language.js`), **terrain height
at a mesh corner** (doc 18), and light across a **LOD seam** (doc 16) — doc 14's
"finer chunk owns the seam" was for geometry, and a flood fill propagates inward.
