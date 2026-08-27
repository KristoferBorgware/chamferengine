# CLAUDE.md

Compact reference for automated agents working on this repository. Humans should
read [`README.md`](README.md) and `docs/` instead; this file is deliberately terse
and duplicates information found there.

## Working agreements

- **Write to be acted on.** These rules govern replies to the owner, not
  repository prose — [`HOW-TO-WRITE-DOCS.md`](HOW-TO-WRITE-DOCS.md) governs
  that, and the two want different things.
  - **Name every label at every use.** `I-5, the map editor`, never `I-5` alone;
    `F-023, the selection reaching for the planet's tallest mountain`, never
    `F-023`. The number is a filing reference and carries no meaning on its own.
  - **Carry a number through to what it causes.** `0.31 m` decides nothing.
    `0.31 m, a third of a block, and only above 1,200 m where nobody stands`
    does. A measurement that stops before its consequence is half-reported.
  - **Assume nothing earlier in the conversation is loaded.** A question that
    needs an answer carries the whole picture with it: what the thing is, what
    the options are, what each one costs. Detail established twenty messages ago
    is not available to the reader.
  - **Short sentences, ordinary words.** Explain the mechanism rather than
    naming it. If a reply cannot be acted on, it failed, however accurate it is.

- **Push to `master`.** That is the default and does not need asking for each
  time. Work may be staged on a feature branch first, but it is not finished
  until `master` has it, because `master` is what publishes the site.
- **Run `node tools/build-docs.js` before pushing docs.** It fails on dead links
  and dead heading anchors, and the Pages workflow runs it — a broken link
  turns the deploy red. Note the renderer does **not** nest `*italic*` inside
  `**bold**`; it reports `unconverted bold` when you try.
- **Write findings down as they turn up.** Anything noticed during other work
  that is not in the plan and is not being fixed in the same turn goes in
  [`FINDINGS.md`](FINDINGS.md) before the turn ends.
- **Wait to be asked before writing engine source.** Every gap that blocked code
  is closed — doc 26 Part 1 is empty and doc 28 picked **TypeScript** — so the
  constraint here is scope, not readiness.
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

## Project shape

- The repository holds a prose specification, generated figures, runnable demos,
  verification scripts, and the engine. `plans/` holds one file per release —
  `v0.1.0.md` is the greenfield build, organised by project, and every file
  after it is organised by item and worked through the three steps in
  [`HOW-TO-WRITE-PLANS.md`](HOW-TO-WRITE-PLANS.md).
  [`ARCHITECTURE.md`](ARCHITECTURE.md) defines the milestones they feed.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — **the stack, the four-part runtime split
  and the milestone definitions, stated rather than argued.** Read it before
  anything in `docs/` when the question is *what are we building with* or *what is
  in which version*. It is not part of the specification and carries no reasoning;
  every entry links to the document that owns the decision.
- [`CODE-STYLE.md`](CODE-STYLE.md) — **structure, naming, formatting and comment
  conventions.** It governs **all code**, not comments alone: the package split,
  the folder tree, filenames, where tests live, when a class is right, and the
  spelling. Not part of the specification. **Read it before writing or editing
  any code**, including in `verification/` and `tools/`, and any code inside an
  artifact produced for this project.
- `packages/engine` is the engine, published as `chamfer`; `packages/client` is
  the browser app. Subsystems are reached by subpath — `chamfer/math`,
  `chamfer/addressing`, `chamfer/generation`, `chamfer/mesh`, `chamfer/edit`,
  `chamfer/render` —
  and each is a folder under `src/` with a barrel. Tests are in
  `packages/engine/tests/`, mirroring `src/` path for path, and import through
  those subpaths rather than reaching into `src/`.
- **A filename is its primary export, spelled the same way**: `Vec3.ts`,
  `hexRound.ts`, `DIRECTIONS.ts`. One exported function per file.
- **`color`, never `colour`** — American spelling in code and in prose.
- [`HOW-TO-WRITE-DOCS.md`](HOW-TO-WRITE-DOCS.md) — **voice, structure and figure
  rules for every Markdown file here**, `docs/` and reference pages alike.
  **Read it before writing or editing any Markdown.** Linked rather than
  inlined so a coding session loads it when it writes prose.
  **`docs/` argues each decision from a measurement. Every other page states
  what is true today and stops**: no history, no reasoning, no justification,
  no naming the alternative that was not chosen. When the project changes, the
  page changes with it; git holds what it used to say.
- [`HOW-TO-WRITE-PLANS.md`](HOW-TO-WRITE-PLANS.md) — **the three steps every
  release after 0.1.0 is worked through**: discuss until one or two candidate
  solutions are named, try each one outside the engine until a measurement
  chooses between them, then implement the whole release at once. **Read it
  before opening a file in `plans/`.** Steps 1 and 2 run per item; step 3 takes
  no decisions, and an item that turns one up goes back to step 1. **Step 1
  requires searching [`FINDINGS.md`](FINDINGS.md)** for entries touching the same
  subsystem, files or cause, and offering them one at a time with why each fits.
  Offer, never fold in: widening a release is the owner's decision.
- [`FINDINGS.md`](FINDINGS.md) — **the register of things noticed while doing
  other work** that are not in the plan and were not fixed on the spot: bugs,
  dead code, unverified claims, ideas nobody has decided on. Not part of the
  specification. **Add to it the moment something turns up**, in the same
  session — a finding carried to the end of a task is a finding that gets
  dropped. [`HOW-TO-WRITE-FINDINGS.md`](HOW-TO-WRITE-FINDINGS.md) gives the
  entry format and the vocabularies for `Kind`, `Milestone`, `Priority` and
  `Effort`; **read it before adding or editing an entry**. Findings are the one
  place outside `docs/` that argues, because a register whose entries do not say
  why they are there cannot be triaged.
- [`HOW-TO-TAKE-A-FRAME.md`](HOW-TO-TAKE-A-FRAME.md) — **the client runs in this
  container, and a frame of it can be read pixel by pixel.** Headless Chromium
  on a software adapter, driven over the DevTools protocol; four flags, all of
  them needed. Every knob is a URL parameter, so two frames from two URLs
  attribute an artifact to its cause. **Read it before claiming anything about
  how the world looks**, and before writing a probe that measures a mesh
  instead of a picture. A frame here settles what is drawn, never how fast.
- `docs/` — prose specification, ordered 00 through 32.
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
  executes everything, so run it when the maths changes. **A script whose
  question is closed goes in its `SETTLED` list**: kept, cited and readable,
  run by hand instead of on every build. `language.js` is the one there — the
  language is chosen, and it spawns six toolchains to re-derive that.
- `tools/check-coverage.js` — reports facts (numbers, identifiers, links, bold
  terms) that an edit dropped from the corpus. Run it after rewriting prose.
- `tools/take-frame.mjs` — launches headless Chromium on a software adapter,
  drives the client over the DevTools protocol, waits for the readout to stop
  saying it is building, and writes a PNG. `node tools/take-frame.mjs <url>
  <out.png> [--wait ms] [--read selector]`. It settles what is drawn and never
  how fast. See [`HOW-TO-TAKE-A-FRAME.md`](HOW-TO-TAKE-A-FRAME.md).
- `tools/bench.ts`, `tools/trial-*.ts` — wall-clock and count measurements over
  the real engine, run by hand. They are not part of `make-reference.js`, whose
  scripts must be plain Node and whose output is quoted in `docs/`.
- `tools/probe-shaders.mjs` — loads the client in headless Chromium with every
  pipeline's switch turned on and fails if the browser complains or the frame
  presents nothing. **A shader that will not compile draws a black window, not
  an error**: its module is invalid, every pipeline from it is invalid, and a
  refused command buffer takes the whole frame with it while the readout keeps
  updating over the top. Nothing in the unit tests exercises the WGSL at all —
  the recording device takes any string as a shader — so this is the check.
  Needs `npm run dev`.
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
| [08](docs/08-terrain-generation.md) | the two layers and their curves; one noise basis; why there is no detail tier | `volume.js` |
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
| [21](docs/21-rivers-and-erosion.md) | the one stored map, droplet erosion; rivers designed and not built | `rivers.js` |
| [22](docs/22-multiplayer-interest.md) | who to tell about an edit; why a patch is not an ID range | `interest.js` |
| [23](docs/23-determinism.md) | which arithmetic is bit-identical everywhere, and what that forbids | `determinism.js` |
| [24](docs/24-edits-and-global-processes.md) | the coarse map is read-only; what a dammed river actually does | `edits.js` |
| [25](docs/25-water.md) | the ocean is a surface, not blocks; water as a material; floating vs colliding | `water.js` |
| [26](docs/26-implementation-readiness.md) | what blocks the first line of code, and the order to build in | — |
| [27](docs/27-block-state.md) | what a block IS as bits; the registry; palette vs delta record | `blockstate.js` |
| [28](docs/28-language-and-runtime.md) | the language: Rust, and why determinism did not decide it | `language.js` |
| [29](docs/29-what-runs-where.md) | the four parts; the server generates nothing; Rust → wasm | `language.js` |
| [30](docs/30-authority-and-cheating.md) | what the server must know per cheat; mobs; intents not outcomes | `authority.js` |
| [31](docs/31-deployment.md) | **plan, not decision.** V1 local; DynamoDB; fan-out is the cost | — |
| [32](docs/32-sky-clouds-and-moon.md) | skybox is world-fixed; clouds are the grid higher up; wind is one axis | `sky.js` |

Doc 04 owns **position → cell** (`hexround.js`) and doc 18 owns **where the edge
is drawn** (`boundary.js`). Both are load-bearing for docs 07, 09 and 14 — read
them before touching either the lookup or the mesher.

[`docs/REFERENCE.md`](docs/REFERENCE.md) is every script's actual output in one
generated page — the fastest way to look a number up without reading the
argument around it. A settled script names its reason there in place of output.

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
    and `taper.js` priced it at 371% more crust against an interior seam crossing
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
    a frame — recompute it from anchor plus offset. **A surface radius is a world
    position** — it carries the planet's whole magnitude, and the layer it names
    is a `ceil`, so a `float32` one moves 48 µm at the shipped radius and lands a
    **whole block** away (`precision.js` §10, doc 15). That reaches 0.020% of
    arbitrary ground and **every** column of a world whose ground is at sea
    level.
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
| delta record | `29 + 11 + 16` = `56` of 64 bits | planet implied by the file; 8 spare | `blockstate.js` |
| chunk palette | `2` bits/cell typical = `8.8` KB | 12.5% of a flat 16-bit field | `blockstate.js` |
| stored edit record | `[slot 12][layer 11][state 16]` = `39` bits | 6 bytes; the row's key supplies the chunk | `delta.js` |
| re-cut across chunk sizes | `1,666,320` records, `0` moved | the store's one header is what allows it | `delta.js` |
| coarse cell of a fine one | `hexRound` on the weights ÷ `2^lod` | a shift is wrong for `43.9–79.3%` of cells | `delta.js` |
| ray walk, 12-block reach | `7.85` cells; `8.42` to `7.75` over `4,096x` planet | a third of the steps are radial | `ray.js` |
| walk against a march | same hit on `99.90%`; refine `25x` and all agree | the march is wrong, not the walk | `ray.js` |
| a cell's three boundary families | pairs `(a−b)`, `(b−c)`, `(c−a)` | one coordinate alone holds for `75%` | `ray.js` |
| face reflection on a direction | `2.28°` mean, `6.47°` worst | names a cell, does not re-frame a ray | `ray.js` |
| side table entry | chest `~108` B, sign `~240` B | 1,000 in a chunk = 117 KB | `blockstate.js` |
| entity rekey rate | every `0.71` s = 21 frames | why entities are NOT keyed by cell | `blockstate.js` |
| planet field | `12` bits = 4,096 worlds | word is 52 of 64 at D11 | `id.js` |
| code space used | `≈ 7.81%` | `0.625` face × `0.75` corner × `1/6` canonical | `id.js` |
| max levels in 64 bits | `17` | `12 + 5 + 2D + 2 + 11 ≤ 64`, exactly 64 at 17 | `scale.js` |
| share code | `8` base-36 chars | address + layer = 40 bits; 11 with planet | `coords.js` |
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
| layer field | `11` bits = `2,048` layers | the last bit the word has; taper binds to `D` 13 | `id.js`, `taper.js` |
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
| density-term face cost | `≈11×`, mostly roughening | caves need gradient > 1 | `volume.js` |
| multi-span columns with caves | `13–32%` | what the seam rule must handle | `volume.js` |
| holes at a LOD seam | `1150` naive, `1074` aproned, `0` seam-owned | over 385 rim columns | `seam.js` |
| skirt walls in the cap plane | `85%` of rim columns at a LOD seam | 100% at a same-level one; why the skirt went | `seam.js` |
| density term vs height term | `51×` full crust, `26×` banded | per chunk, noise evaluations | `volume.js` |
| water faces drawn | `0.89%` of the naive count | 113,455 of 12,717,512; **0** sides | `water.js` |
| ocean as blocks vs a shell | `1,188:1` at D11 | 29,044,127 faces against 24,448 | `water.js` |
| ocean's share of block slots | `15.2%` | 1,589,689 of 10,485,888, 64-layer crust | `water.js` |
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
  use. Merging buys **1,613 addressable layers, 371%** (the layer field is 11
  bits, so it stops at 2,048) and costs an interior seam crossing **every column on the
  planet** — cell *centres* nest exactly, cell *areas* do not, so 3 of every 4 columns dead-end
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
- **A CHUNK KEY MEANS A DIFFERENT TRIANGLE AT EVERY LEVEL** (`rowsUnder`,
  `coarseChunkKey`, `plans/v0.4.1.md` I-12). A key is
  `face x 4^chunkLevel + path`, and the delta store is filed at **one** level --
  the finest -- so anything holding chunks at more than one level at once must
  **convert rather than compare**. The mesh pool asked the store for a chunk's
  records with that chunk's own key: right at full detail, and at every coarser
  level a key naming some other triangle, which returned **0 rows at lod 1, 2
  and 3**. So a change was drawn while its chunk was finest and vanished the
  moment the selection dropped it a level -- a **distance**, not an event, which
  reads as edits evaporating as you walk away. Two faults hid behind it: a slot
  is a rank inside a triangle whose side the chunk level sets, so a coarse chunk
  must decode against `chunk.chunkLevel + lod` (**the two always sum to the
  finest**) and not its own; and an edit must drop `selectionId` at **every**
  level, or the chunk actually on screen is never rebuilt. **A coarse triangle
  contains exactly the fine ones whose path begins with its own**, so gathering
  its rows is a filter over what the store holds -- there may be a million fine
  chunks under it and only ever as many rows as chunks somebody touched.
  **A coarse chunk drops its chunk level as well as its depth**, which is what
  keeps every chunk the same slot count while four become one; a test building
  one with the finest level and a reduced depth is modelling a chunk that does
  not exist, and that is what hid all three.
- **A COARSE CHUNK'S OWN RING REACHES FURTHER THAN A FINE CHASE CAN FOLLOW**
  (`chunkReaders`, `rowsUnder`, `plans/v0.4.1.md` I-13). Fixing the routing
  (I-12) left the *reach* wrong: `rowsUnder` chased the store's fine-level "who
  reads whom" relationships, which only ever span **one fine cell** across a
  boundary -- the reach a chunk at the store's own finest level has. A chunk
  drawn `lod` levels coarse generates at a **reduced subdivision depth**, so its
  own outside ring is one **coarse** cell, roughly `4^lod` fine cells, not one.
  An edit a few fine cells deep in the neighbour, past the shared fine
  boundary, has no relationship recorded at any level and is invisible forever
  at every coarse level -- not "not yet close enough", genuinely unreachable.
  Measured (`tools/probe-coarse-reach.ts`): over every outside-ring cell of one
  chunk at lod 1-3, a one-hop fine chase never reaches **47%** of them. The fix
  computes the ring **in the lattice the chunk is actually drawn at**: walk the
  chunk's own rim at its reduced depth, and whichever same-level chunk holds
  each boundary point's six neighbours is a reader -- the same primitive
  `chunksHolding` already verifies, just run over a whole rim instead of one
  cell. Cross-checked at chunk level 0 against the icosahedron's own
  face-adjacency table, a wholly independent definition.
- **THE STORE AND THE MESHER MUST AGREE ON HOW FAR A CHUNK READS, AND THE
  MESHER IS THE AUTHORITY** (`MESHER_REACH`, `chunksReading`, `chunkReaders`).
  A rim cell asks its own ring -- one step past the triangle -- and the apron
  then draws that ring, and an **apron cell asks its own ring** for the band to
  walk, the corner occlusion and the sky exposure. That is **two** steps.
  Routing one reached the apron cells and not the cells they read: measured by
  wrapping the real sampler (`tools/probe-mesher-reach.ts`), a chunk samples
  **254** distinct columns and **16.3%** of them were cells no edit was ever
  routed to. At two steps, **0%**. The number is written once and read by both
  ends, because it is the one thing the two have to agree on.
- **A CELL ON A FACE EDGE HAS SEVERAL NAMES, AND A KEY MUST PICK ONE**
  (`cellSlot`, `STORE_VERSION` 2). Five faces meet at an icosahedron vertex and
  two along every edge, and `positionToCell` produces both names -- splitting one
  hexagon roughly in half, so ordinary aiming and ordinary standing name the same
  cell differently. `cellSlot` keyed the row by whichever face the caller handed
  in, giving one cell **two rows**: a break written under one name never reached
  the block drawn from the other, so the ray read air through rock that was on
  screen. Every sibling rule already reconciled the names -- `encodeCell` and
  `owns` canonicalise, `chunksHolding` enumerates -- and this was the one that
  did not. **Canonicalise before keying anything.**
- **A JOB'S IDENTITY IS THE CHUNK AND THE STORE IT WAS POSTED WITH**
  (`WorkerMeshSource.invalidate`). The rows are read as a job leaves, so a chunk
  on a worker carries the store as it was then; `request` treated a repeat as
  the same job and chained onto the promise without posting anything, and the
  caller had already marked the chunk built, so nothing asked again. **The
  commonest case is a world opening** -- the first jobs go out against an empty
  store while the save is still loading, so a saved world's buildings are
  missing from exactly the chunks nearest the player. A job whose world moved is
  re-posted when its stale result arrives, rather than cancelled: the worker is
  most of the way through.
- **A PATCHED COLUMN IS NOT THE TERRAIN'S SURFACE ANY MORE** (`applyDeltas`,
  `ChunkColumnSampler`). `chunk.surface` is where the generator put the ground
  before it was rounded to a layer, and the mesher snaps the surface cap to it
  so two levels of detail agree about one hillside. `applyDeltas` rewrote the
  blocks and the band and left it, so a block placed on the ground had its cap
  lifted to where the ground's surface was and **the ground's own wall was drawn
  inside the block**. Clear both radii whenever the column's top moves -- in the
  held column and in the generated one alike, or the two disagree.
- **A LIVE REBUILD REPLACES THE WHOLE WORLD, AND EVERYTHING HOLDING A PIECE OF
  IT MUST FOLLOW** (`flushTerrain`, `worldBlocks`, `Player.shape`). Moving a
  terrain knob makes a new map, shape, generator and worker pool. The delta hook
  was never re-attached, so **every chunk built after any terrain knob moved
  carried no edit at all** until the page was reloaded; and `worldBlocks` and
  `Player` held the shape and the generator by value, so the player collided
  with the planet as it was before the knob -- `maxElevation` moves the crust
  top, so every layer boundary moves with it. **Take a replaceable thing as a
  function, never as a value.**
- **A CHUNK KEY OUTGROWS A 32-BIT SHIFT** (`ChunkPeaks`). A key is
  `face x 4^chunkLevel + path`, which passes `2^31` at chunk level 14 -- depth
  17 with 8-cell chunks, a world the panel accepts. `>>` is signed, so **12 of
  the 20 faces folded to a negative index**, which reads `undefined` straight
  past the non-null assertion and compares false against everything: the
  triangle is credited with no ground and culled. Convert a key between levels
  by **division**, the way `coarseChunkKey` already did.
- **HOLDING A CELL AND OWNING IT ARE DIFFERENT QUESTIONS**
  (`ChunkColumnSampler`, `owns`, `plans/v0.4.1.md` I-14). A border cell sits in
  two or three triangles; the border rule awards it to the lowest key and that
  decides **only who draws it**. Every chunk containing the cell generates and
  patches a slot for it, which is the whole reason a chunk can mesh its rim
  without fetching a neighbour. `applyDeltas` writes by **containment**
  (`offsetIn`); the sampler decided whether to read that slot back by
  **ownership** (`splitPath`, the same descent `owns` uses) -- and the two
  disagree on exactly the chunk's own border. Measured at depth 8 cut at chunk
  level 4: a chunk holds **153** cells, the sampler served **120** from the
  chunk's own array and regenerated **33** from the seed, and those 33 are
  precisely the cells it holds but does not own. **The whole rim.** An edit was
  written into the array and read back out of the generator three lines away.
  Both symptoms follow: the neighbour's **apron** drew the seed's cap, so a
  broken block kept a lid floating a centimetre over the hole; and a rim cell
  asking its ring whether to draw a wall was told solid where the player had
  dug, so the view ran through the planet -- worsening with depth, because the
  stale column also gives a stale **band** and the layer walk stopped above the
  bottom of the shaft. **The invariant that makes a stale cap impossible rather
  than merely unobserved is that two chunks both holding a cell serve the
  identical column for it after an edit.** `owns` is right and must stay: which
  chunk *draws* a shared cell is still the border rule, or two would draw the
  same cap.
- **A CHUNK MESHES MORE CELLS THAN IT HOLDS, AND AN EDIT HAS TO REACH ALL OF
  THEM** (`chunksReading`, `ChunkColumnSampler`, F-071). A chunk's rim cells ask
  the ring around them whether to draw a side face and its apron draws that ring
  outright, and a cell one step past the rim sits **inside the neighbour's
  triangle** -- so `chunksHolding`, which names every chunk whose triangle
  *contains* a cell, is the right set for the store and the wrong one for the
  mesher. Measured at depth 11 cut at chunk level 6 the ratio is the same shape
  as at depth 8 / level 4, where a chunk holds **153** slots and reads **54**
  more, and a change reached it for **0** of them
  (`tools/probe-seam-edit.ts`). Two symptoms, one cause: break a block across a
  boundary and the neighbour's apron went on drawing the seed's cap, so mining
  across a chunk edge left a **one-cell ridge along it**; and a rim cell asking
  about a column somebody had dug was told there was rock, emitted no wall, and
  the far side of the planet showed through the tunnel. The fix is
  `chunksReading` -- every chunk holding the cell **or any neighbour of it** --
  plus `applyDeltas` handing back what fell outside the triangle for the sampler
  to write over the columns it generates. **The invariant to test is that the
  column a chunk GENERATES for a cell past its rim equals the column the chunk
  that OWNS it holds**, blocks and band alike; generating rather than fetching
  is only sound while that is true, and terrain is a pure function of the
  address while a player's changes are not.
- **A TRIANGLE'S OWN CORNER CAN BE INVISIBLE TO A RING WALK** (`chunksHolding`,
  F-071). Finding the chunks containing a cell by asking the cell's ring which
  chunks **own** those neighbours misses the triangle whose **corner** the cell
  is: a corner's only neighbours inside its own triangle sit on that triangle's
  two edges, so both are shared, and where the border rule awards both to
  lower-keyed chunks that triangle never becomes a candidate. **155 of 39,168**
  cell-and-chunk pairs went unreported over one face at depth 8 cut at chunk
  level 4. **Descend the triangles instead**: they nest, so a chunk containing a
  point has an ancestor containing it at every level above, and at most six
  paths stay live however deep the cut -- **0 of 39,168**.
- **A CHUNK IS A WEDGE INTO THE PLANET, AND A BALL CANNOT HOLD ONE**
  (`Box`, `chunkWedge`, `Frustum.holdsBox`, `plans/v0.4.1.md`). Every volume a
  chunk was tested against was a ball -- the selection's, the renderer's and the
  shadow cascade's -- and a ball fits the *ground*, which is a thin cap. It does
  not fit the *world* a chunk holds: a small triangle extruded straight down
  through as much crust as anybody has dug. **A ball cannot be grown downward
  alone.** Measured on the shipped world (`tools/trial-bounds.ts`), a 76 m chunk
  over a 1,232 m crust: holding the ground it needs a box 44 m deep and a ball
  round that is **3x** the volume; dug a quarter of the way down, **13x**; dug
  to the bottom the ball is **640 m** in radius against a 76 m chunk, **148x**
  the volume, every cubic metre voting to be drawn. A `Box` is a centre, three
  perpendicular unit axes and a half-width along each, and a plane test is the
  sphere test with the box's reach along the normal -- the sum of each
  half-width scaled by how much its axis points that way -- standing in for the
  radius. The mesh sink measures itself along **axes it is handed** rather than
  the world's, three dot products a vertex against three comparisons. The
  cascade's cylinder takes the same box: a **cosine** per axis for how far it
  reaches along the light and a **sine** for how far it stands off the axis, so
  a shaft under a low sun barely widens the second. **And breaking counts as
  much as placing**: `DeltaStore` left broken blocks out of a chunk's reach on
  the reasoning that taking ground away adds no geometry, and the walls of a
  hole are geometry standing where the map says solid ground is -- which culled
  a player at the bottom of their own mine and left them in an empty room.
- **THE MAP IS THE TERRAIN, and there is no detail term** (doc 08, doc 21,
  `plans/v0.3.0.md`). `columnAt` reads a height off the coarse map and adds
  **nothing** — no second noise field, no multiplier. The map is stored in
  **metres above sea level**, so sea level is zero by construction and land is
  `height > 0`. What that removes is three knobs that moved the ground and
  appeared nowhere in the editor's picture: `heightScale`, `detailAmplitude` and
  `detailFeature`. The detail tier existed because a map cell is coarser than a
  block — a 32 m cell is a straight ramp **32 blocks long** — and the ramp turns
  out to rise **4.0 m at the median** of land cells, 9.1 m at the 90th
  percentile and 27.1 m at the 99th. One block of climb every eight reads as a
  hillside, not a facet; the answer for the steep 1% is **Map cell**, which
  moves the picture. **Never add a term the map does not show.**
- Terrain is still **generated, not stored** for LOD purposes — a coarse chunk
  re-reads the same map at the same place, so LOD is re-generation and cuts
  noise cost 4× per level as well as draw cost (`volume.js`). The density term
  costs 51× the height term over a full crust, so **far chunks run the height
  field alone**: a coarse mesh cannot represent a cave anyway (a 3 m cave is gone
  by level 10). That makes a LOD-2 chunk ~330× cheaper to generate.
- Cave geometry is culled **by enclosure, never by simplification**. It costs
  build time and memory, not draw time.
- The density term only carves **enclosed** voids when its noise gradient
  (amplitude / feature size) exceeds 1 — the bias grows 1 per metre of depth
  (`volume.js`). Raising `strength` without raising frequency buys a rougher
  surface and an 11x face bill and **zero caves**. Caves are what create
  multi-span columns (13-32% of them); rough surfaces do not.
- **THE APRON IS A LID, AND A LID HAS AN OUTER EDGE** (`meshApronCell`,
  `SEAM_JUMP`, `plans/v0.4.1.md` I-16). A chunk draws its own cells and one ring
  past them, and that ring emits up-caps plus a wall wherever a ring cell stands
  over another cell **the same chunk drew**. At the ring's outer edge there is
  no such cell: what is over there belongs to a neighbouring chunk, which may be
  drawing it a level coarser, and **a level draws the ground at the points it
  kept rather than at the points between them**. Measured over the joins a real
  selection makes, **254 of 1,267** outer edges — **20.0%** — stand over the
  neighbour's ground with nothing between, by **5.13 m** on average and **20 m**
  at worst on a 2 m block world, 230 of them taller than a whole block. The
  apron's centimetre settles a tie between two copies of one cell; it cannot
  bridge a step. **It is not a hole, and looking for one is what hid it** — the
  neighbour's own surface carries on underneath, so grazing rays from inside the
  crust escape at **0.07%** at a join against **0.00%** away from one and the
  fix moves neither (`tools/probe-seam-leak.ts`). What a viewer sees is the lid
  ending in mid-air with ground metres lower behind it. The fix is a **curtain
  hung from the apron's own outer edge**, and it needs no protocol change
  because **a point's height does not depend on who asks**: a coarse
  generator's `columnAt(i, j)` and a fine one's `columnAt(i << lod, j << lod)`
  agree to the bit, so a chunk can evaluate what **every** candidate level would
  draw rather than being told which one is there. Which coarse point a cell
  falls into is `hexRound` on its weights, never a shift. How many levels to
  consider is measured: **one**, over every adjacent pair in a real selection at
  three altitudes and across the whole range of the `detail` knob, 1 to 8. **It
  hangs from the apron and never from a rim cell** — a wall from a rim cell
  starts in the cap plane and speckles through a level neighbour's own cap,
  while an apron cell is already a centimetre low, so the curtain starts under
  that cap instead. Where it is not needed it hangs inside
  the neighbouring column's rock, which nothing can see into. The curtain alone is
  **not** the whole fix: it hangs from the lower of the two own-level caps, and
  the step walls between fine cells across the boundary stand above it — its
  own probe measured the band from that same lower cap, so it was green while
  the slits were on screen. Measured over the whole frontier face, own cap down
  to coarse ground at four heights: **554 of 1,267** outer edges stand open
  (7.25 m mean, 40 m worst), the curtain alone leaves **324 of 554** holed, and
  with the apron drawing, **for every edge of every ring cell**, the side runs
  a same-level neighbour would draw there — reproduced exactly, same canonical
  cell, same ring, same colors, no drop — it is **0 of 554**, and **0 of
  1,958** steps between two ring cells inside coarser territory (53.8% of
  which stood open when the runs covered only the ring's outer edges: the ring
  is drawn at this chunk's own heights inside the coarser chunk's territory,
  so its internal steps are this chunk's job too, and the run condition — a
  wall belongs to its more opaque side — is the whole duplicate rule). Two copies of one wall land on one another where
  the neighbour really is at this level, and a depth fight between identical
  colors paints one color. The whole seam closing costs **7.5%** more faces,
  and `MESHER_REACH` stays 2 (measured, not assumed).
- **A WALL RUNS PAST ITS OWN CORNERS, OR THE CORNER LINE LEAKS PINPRICKS OF
  SKY** (`WALL_WELD` in `emitSide`, `plans/v0.4.1.md` I-18). The vertical line
  where two side faces meet holds vertices from both, and the two sets rarely
  agree: each wall is a run merged over its own neighbour's transitions, and
  across a chunk boundary one corner is computed against two chunk origins, two
  `float32` roundings of one line. A rasterizer given two edges on one line
  with different vertices leaves pinprick holes along it, and behind a wall's
  side edge is the undrawn inside of the planet — a dotted line of bright
  pixels down the corner of every dark cliff, one per layer boundary one side
  has and the other does not. Every side face runs **4 mm past each corner
  along its own plane**, so what meets it there is overlapped, never abutted.
  The extension is never visible: where the corner's third cell is air the wall
  toward it exists — the cell this face stands on is solid there — and the
  extension lands behind it; where the third cell is solid it is inside rock.
  **A face widened past its corners must also run past its own ends**: the
  wall's end vertices used to be the cap's corner vertices to the bit, exact
  sharing kept those junctions watertight, and moving the corners broke it —
  every cap grew a dotted rim, brinks from above and block bottoms from below.
  So a face also runs 4 mm past each end where no other face of the same wall
  continues there; where one does, the extension would lie in that face's own
  plane and fight it, and exact is enough there because stacked runs share
  their corner directions. Zero faces added.
- **A LOD seam is closed by the APRON, and a cave mouth by neither** (`seam.js`,
  doc 14). Each chunk draws the ring of cells one step past its own rim, at its
  own level, a centimetre low — both levels' surfaces then cover the strip and
  the step reads as one standing over the other. **The skirt was tried and
  removed.** A curtain hangs from the **cap plane**, so wherever the two sides
  put their surface on one layer it is coplanar with the neighbour's own cap and
  no depth buffer separates them: measured, **85%** of rim columns at a 2 m LOD
  seam and **100%** at a same-level seam, which is most of them — a dashed dark
  outline of every chunk boundary. Skirt and apron leave the same holes: both
  close all 76 surface-slit layers, the skirt reaches 14 of 1,074 cave mouths
  and the apron none, and **99% sit deeper than any curtain reaches** because a
  curtain hangs downward and a cave mouth is a horizontal hole. Depth is not the
  axis. The finer chunk must **own the seam**: emit a face wherever its solidity
  differs from the coarse neighbour's, both directions, costing 2.99 faces and
  one height-field evaluation per rim column. Not built — F-025. What covers the
  frames while a neighbour changes level is the **residency loop**, which keeps a
  retiring chunk drawing until its replacements are uploaded, not geometry.
- LOD is **resampling, not decimation** — Goldberg levels do not nest, so a
  coarse mesh re-evaluates the terrain function rather than dropping cells. LOD
  seams come from terrain sampled at two spacings, not from geometry; an apron
  one cell past the rim covers them and does not care what level the neighbour
  chose.
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
  *local* problem. Doc 17 protects the cell (cheap, reversible, keeps
  seed variety) rather than flooding it (1% of the surface, fixes the macro map of
  every world, cannot be undone).
- **THE TERMINATOR IS NOT THE SHADING** (`TERRAIN_SHADER`, doc 16,
  `tools/frame-diff.mjs`). `dot(sun, up)` answers *is the sun over this place's
  horizon*; `dot(sun, faceNormal)` answers *how square is this face to it*. The
  shader used `up` for both, so **every face of every block took the same
  light** and the sun was a global dimmer -- ambient light with a day and night
  cycle on it. Measured over 916,000 pixels by taking one frame with the sun in
  the morning sky and one in the evening and dividing them: with `up` the ratio
  is **1.198 with a 0.6% spread** (5th 1.187, 95th 1.209), every pixel moving
  together; with the face's own normal it is **0.803 with a 58.6% spread** (5th
  **0.394**, 95th **1.533**), light moving *between* faces. **No normal is
  stored**: every face here is flat, so the change of position across one pixel
  gives the plane's normal exactly, and the mesher's six floats a vertex are
  untouched. It must be taken on the **chunk-relative** position -- a world
  position near 6,800 steps by a millimetre in `float32` and a pixel of ground
  underfoot spans a few, so the difference of two world positions is two or
  three representable steps and the normal is noise.
- **LIGHT COMES FROM TWO PLACES AND ONLY ONE HAS A DIRECTION**
  (`lightOn` in `TERRAIN_SHADER`, doc 16). The sun is
  `max(0, dot(faceNormal, sun))` gated by the terminator; the sky is
  `dot(faceNormal, up)`, from all of it looking up to `0.42` of it looking
  down. The two shares sum to 1 (**Sun against sky**, default `0.58`), so flat
  ground at noon reads the same at any balance and only what stands at an angle
  moves. **`FACE_SHADE` is gone from the mesher** -- its 1 / 0.82 / 0.5 was a
  three-step hemisphere the shader now computes continuously and correctly for
  a face pointing any way, and baking it also dimmed **direct** sun on a wall
  by 0.82 for no reason. The vertex color keeps albedo, the column's own sky
  exposure and the corner's ambient occlusion, which are facts a shader cannot
  see. The sky term takes the sky's **hue and not its brightness** -- the sky
  color already fades with the day, so taking it whole dims the ambient twice
  and makes a dim blue sky a dim light rather than a blue one. Direct sun
  reddens below `0.30` of elevation, measured against the place's own up, so it
  turns as the day runs **and** as a player walks around the planet.
- **A SHADOW NEEDS NO SECOND PASS, BECAUSE THE MAP IS ALREADY THE ANSWER**
  (`SunShadow`, `sunReach` in `TERRAIN_SHADER`, doc 16, F-062).
  The coarse map is the terrain, so *is anything between this point and the
  sun* is a question the map answers directly: walk toward the sun and ask
  whether the ground ever stands above the walk. It goes to the GPU whole as
  **one `r32float` layer per icosahedron face** -- that face's triangle of
  lattice points in the corner of a square, just under half of it wasted,
  **2.6 MB** at the shipped level -- so a direction gives a face and two
  lattice coordinates and those *are* the texture coordinates. **24 steps
  spread geometrically** from 6 m to the reach. **The face is rechecked, not
  searched**: an edge is 7,100 m and a ray is a kilometre or two, so testing
  the face the ray was last in is three dot products against twenty for a new
  one. **A near miss softens for nothing** -- the clearance over the distance
  travelled is the angle the ray missed by, and the smallest one along the
  walk is the penumbra, `1/60` of a radian against the sun's own half degree.
  The march starts on the **map's** own surface, not the block's, or a ray
  begins under the ground it came from. The row past each face's long edge is
  filled from the face over it, which is the only place a blend can reach
  outside the triangle. It cannot shadow a block by its neighbour: a map cell
  is 32 m and a block is 1 m.
- **THE GROUND AND THE SEA RUN ONE MARCH, NOT TWO** (`SHADOW_WGSL`, doc 16,
  doc 25, F-065). The walk lives in `render/light/SHADOW_WGSL.ts` as one piece
  of shader source both `TERRAIN_SHADER` and `SEA_SHADER` include; it declares
  its own **group 2** and takes the sun as an **argument**, so it depends on
  nothing an including shader has to hand it, and `SunShadow` moved to
  `render/light/` because a resource two subsystems read does not belong inside
  one of them. **Sea level is the bottom of the world**, so the water is in the
  shade of anything at all -- and the shoreline is where a person on a beach is
  looking, so a shadow stopping there stops where it is most obvious. The
  shadow takes the sun's share and leaves the sky's, so shadowed water is
  darker water rather than a hole: a lake under a range reads **53.5** against
  **60.0** in the open, the 95th percentile of the ratio **1.376**. The moon
  gets the sun's half-vector with its own direction, cut looser (**0.975**
  against 0.985) because a moon path is a smear and the sun's threshold on a
  light that dim draws a handful of pixels. **Each pipeline sets group 2
  itself** -- one with a shorter layout drops every binding past its own end.
- **THE MAP CANNOT SEE WHAT WAS NOT GENERATED, SO THE SUN TAKES ITS OWN
  PICTURE** (`CascadeShadow`, `cascadeReach` in `SHADOW_WGSL`, doc 16). The
  coarse map holds one height per 32 m cell **of the generated world** -- no
  placed block, no mob, no player, ever. So a depth buffer is rendered from
  the sun as well, and **anything that draws itself can be in it**
  (`ShadowCaster`; `ChunkRenderer` is the first and pushes itself onto
  `casters`). **Three cascades**, each covering four times the span of the one
  before: at the shipped 260 m reach the splits are **16 / 65 / 260 m**, which
  at 1,024 texels is **2 cm** a texel near and **23 cm** far against a 1 m
  block, `depth32float`, **12.6 MB**. **Fitted to a sphere, not to the frustum
  slice** -- a slice changes shape as the camera turns and the box would grow
  and shrink -- and the sphere's centre is **snapped to whole texels** along the
  light's two lateral axes, or the box slides as the player walks and every
  shadow edge crawls. The sample is pushed off the surface **along its own
  normal** by ~1.7 texels: a surface records its own depth, so reading it at
  itself is a coin toss that comes out as stripes, and pushing *deeper* instead
  detaches a shadow from what casts it. The read is **nine comparisons, not
  nine depths** -- a comparison sampler filters the answers, and filtering the
  depths would put a shadow halfway up a wall. The depth pass culls **nothing**
  (`cullMode: "none"`): a chunk mesh is a shell with no underside, so culling
  by facing would drop the faces whose own shadow this records.
- **THE TWO SHADOWS ARE EACH OTHER'S BLIND SPOT, AND THE COMBINATION IS ONE
  `min`** (`sunLight` in `SHADOW_WGSL`, doc 16). The walk reaches the horizon at
  32 m resolution and sees generated terrain only; the cascades reach 260 m at
  centimetres and see anything drawn. The walk carries a range's shadow across a
  valley a kilometre off, which no cascade has the box for; the cascades carry
  one block's shadow on the next, which the map cannot represent. They **hand
  over rather than meeting at a line** -- the furthest cascade fades over the
  last 15% of its reach. **Each is switched on its own, and each row names its
  own technique** (**Marching shadows**, **Shadow maps**) rather than the
  distance it happens to cover, because a reader who wants one of them off is
  looking for the technique: they cost different things: the walk is the
  per-fragment expense and the maps are three more passes over the geometry.
  **How dark** is one setting over both. Measured at a 18° sun over terraced ground, turning the
  cascades off leaves the 95th percentile of the ratio at **1.429**: some faces
  are 43% brighter without them.
- **THE CLOUDS ARE THE ONLY MOVING THING, SO THEY GET A THIRD SHADOW**
  (`CloudShadow`, `CLOUD_SHADOW_SHADER`, `cloudReach` in `SHADOW_WGSL`, doc 16).
  Neither ground shadow can put a cloud on the ground: the coarse map is a
  picture of the **generated** ground, and the cascades reach 260 m while the
  low deck stands **3,000 m** over a planet **6,801 m** in radius. **It is a
  coverage map, not a shadow map** -- a shadow map holds how far the nearest
  surface is, which is a yes or a no, and a cloud is translucent, thinner at its
  rim, and darker where two stack. So a puff writes **how much light it stops**,
  one composited over the last, **no depth buffer at all**, and the total
  saturates at all of the light. **It multiplies where the two ground shadows
  take the darker**: a hill is in the way or it is not, a cloud leaves a
  *fraction*, so a cloud shadow inside a hill's shadow takes its share of what
  the hill left. Its own darkness knob, because one number right on a mountain
  blacks the ground out under a cumulus. One orthographic box along the sun,
  centred on the ground **under** the camera and spanning the planet's diameter;
  the cull is a **cylinder open at the far end and closed at the near one** --
  a cloud shadowing ground in the box is up-sun of it, so its distance from the
  axis is the ground's own, while a cloud on the night side would otherwise
  shadow ground it stands under. The puff drawn into the cover is the **same
  run of indices and the same wind** as the drawn one, turned to face the sun.
  **How much it darkens is the sky's property, not the shadow's**
  (`tools/trial-cloud-shadow.ts`): the shipped sky is **3.50%** cloud straight
  up, and a 4,000 m patch runs **0.00%** shaded at a 10° sun, 1.40% at 40° and
  **3.24%** at 70% -- nothing under about 30° because the beam leaves the deck
  **17 km** away over a different sky. At 5,000 clusters against the shipped
  1,200 the fifth percentile of the on-against-off ratio is **0.915**.
- **A GENTLE WORLD HAS ALMOST NOWHERE FOR A SHADOW TO FALL**
  (`tools/trial-shadow.ts`, doc 16). Ground shades itself only where its own
  slope beats the sun's height, and the shipped ground runs **11.1°** at the
  median. Over a 3,000 m patch: **22.7%** in full shadow at a 5° sun, 15.2% at
  10°, 4.6% at 20°, **0.1%** at 35° and **0.0%** at 60°. So shadows here are a
  dawn and dusk feature, and that is the terrain's property rather than the
  march's. It is also why a shadow is easy to under-sell: the direct term is
  `sin(elevation)` of the overhead figure, so at 8° a shadow can only take away
  14% of a light that was already the smaller half of the total. What makes it
  read is the exposure applied afterwards.
- **AFTER DARK THE MOON IS THE ONLY THING WITH A DIRECTION** (`lightOn` in
  `TERRAIN_SHADER`, doc 16). Take the sun away and the two-term model has one
  term left and that term has no direction, so every face of every block reads
  the same all night and a block is a silhouette. The moon is a second
  directional source, one more dot product, gated by whether it is over **this
  place's** horizon and faded out as the day comes up. **The floor under the
  light has to sit under the sky term alone** -- `max(night, sky) + sun + moon`
  rather than `max(night, sky + sun + moon)` -- or the moon has to beat 0.09
  before it shows at all, which at any believable moonlight it does not.
  Measured over 830,666 pixels of one night view: mean **20.2** with the moon
  against **12.6** without, and the fifth percentile of the ratio is **0.455**,
  so moon-facing faces are more than twice as bright.
- **A PICTURE IS EXPOSED, AND A SHADOW AT SUNRISE NEEDS IT TO BE**
  (`TonePass`, `TONE_SHADER`, doc 16). The world is drawn in light, so ground
  at dawn is genuinely `sin(8°)` = **0.14** of the direct light noon ground
  gets -- and a shadow across it takes the same fraction either way, so it only
  reads once the picture is exposed for the light that is there. The frame goes
  into an **`rgba16float`** image (`GpuContext.sceneFormat`; every pipeline
  inside the frame's pass declares it and only the tone pass declares the
  canvas format) and a full-screen pass exposes and rolls it off. **The
  exposure comes from the light there actually is**: flat ground takes the
  sky's share whenever the sun is up and the sun's share in proportion to its
  height, and one over that raised to **Eye adapts** is the multiplier, floored
  at `0.35` so a night does not ask for all the exposure there is. **The
  roll-off is identity under the knee** and bends toward 1 above it, per
  channel so a colour pushed past white loses its colour: at a knee of
  **0.85** white comes out **0.925** and three times white **0.990**. The
  drawing order matters -- `setBindGroup(2, ...)` goes on **after** the layers,
  because a pipeline whose layout is shorter drops every binding past its own
  end and the next terrain draw would be refused.
- **Lighting is where the sphere costs least** (`light.js`). Light is a *scalar*,
  so holonomy and the pentagon direction deficit simply do not apply. 8 neighbours
  cost a flat 1.5×; radial sky light is as cheap as a flat world's because
  invariant 10 makes a column straight; the terminator is one dot product against
  gravity's `up`. The twelve pentagons cost **nothing** — a torch there lights 5/6
  as many cells only because a ring holds `5k` instead of `6k`. The real bill is
  storage: 4× the block data, halved again by storing sky light per column.
- **The map carries one field, and rivers and lakes are NOT generated**
  (doc 21, F-030 closed). At the resolutions the map is drawn at the routed
  channels were one cell wide and the lakes were flat discs, so `fillPits`,
  `routeFlow`, `accumulateFlow`, the `flow` field and the `water` field are all
  gone. **Water is wherever the map reads under zero**, which makes the ocean the
  only water and a radius the only thing that describes it. `rivers.js` still
  holds the routing results — no pentagon case, no face case, fill with a tiny
  slope for 0 dead ends, continents decide river length — for whoever revisits
  it. The coarse lookup is masking the low bits of **`(i, j)`**, not the path
  digits — those give a triangle, not a cell.
- **Erosion is droplets, it SHIPS OFF, and both its constants came from
  measuring the wrong answer** (`erodeDroplets`, doc 21, F-017 closed, F-039
  open). `erosion` defaults to `0` and its row is off the panel, because what
  the droplets cut is **lattice-aligned gashes rather than valleys** — 60.2% of
  their steps run eight or more cells in one unchanged direction, longest run
  48, a whole droplet life in a straight line. The pass returns on its first
  line at zero; `?erosion=0.5` still reaches it. Everything below still holds
  and describes what it does when turned on. A droplet walks downhill cell
  to cell, cutting where it moves fast and depositing where it slows; it reads
  only its own cell and the six around it. **Capacity is a gradient, never a fall
  in metres times a cell width** — the second form made a droplet on flat ground
  want `15 m` of material and cut it out, moving **15 m per cell**. **A droplet
  may take a tenth of one step's fall and no more** — uncapped it **multiplied
  the median slope by 4 and the 90th percentile by 7**, which is the opposite of
  what water does. Tuned: at strength 1 the median slope moves `0.077 → 0.083`
  while the 99th goes `0.209 → 0.577`, and the ground moves `8.04 m` a cell. A
  knob whose median climbs with it is adding roughness, not carving.
- **A SUM OF SMOOTH THINGS IS SMOOTH, and a mountain is a crease** (`ridge`,
  doc 08). fBm gives hills at any steepness and that is not a tuning failure:
  every octave is smooth in its first and second derivative, so every summit is
  a dome. Measured, the shipped ground already ran **11.1° at the median, 38.1°
  at the 99th and 56.0° at its steepest** — steep, and still hills, because none
  of it has an edge. **The only place a crease comes from is an absolute
  value**: `1 - |n|` folds an octave at its own zero crossing, squaring sharpens
  the fold, and weighting each ridged octave by the one above it keeps the flats
  flat. Over a 3,400 m patch sampled every 13.3 m at 300 m of relief, a fold of
  0.6 takes the median from `13.8°` to **21.2°** and the 99th from `47.9°` to
  **60.9°**. **At 0 it is bit-for-bit the plain sum.**
- **THE SEA FLOOR WAS SPENDING THE MOUNTAINS' BUDGET** (`metreHeight`, doc 08).
  One scale for the whole field looks obvious and caps the peaks: noise is
  symmetric about its own middle and sea level is a percentile **above** it, so
  the floor ran **1.92x** deeper than the peaks were tall — 300 m of relief gave
  a `-575 m` sea floor and a `942 m` span out of a 1,024-layer budget, on ground
  doc 25 never draws. Land and sea scale **apart** now, each to its own knob, so
  the span is `relief + seaDepth` and the tallest mountain a 1 m block allows
  goes from **320 m to 900 m**. Never bind Relief to the crust; bind the ocean.
- **THE SURFACE IS TWO NOISE LAYERS AND TWO CURVES** (`layeredHeight`, doc 08).
  A single octave stack makes one kind of landscape: fBm is homogeneous, so one
  statistic describes the whole planet — the spread of local roughness over one
  map is **1.3x** plain and **1.4x** ridged (`trial-layers.ts`), and no term in
  it can say *be different here*. So there are two whole stacks sharing **no**
  parameter, each read through a **curve**: across is that layer's own noise, up
  is what it controls. **Terrain and continents are one layer**, one question at
  two sizes; the mountain layer is the second. `gated` lets the mountain layer
  through in proportion to how far the terrain already stands above **Mountain
  line** — a fraction of the terrain curve's **own** reach, so dragging that
  curve's top down does not slowly close the gate — and `roughen` keeps it a
  multiplier on the terrain layer's own noise. An ungated **add** was built and
  removed: nothing told it where it was, so a range could start in the sea.
  Shipped, that gives **35%** sea, **55%** grass, **5%** rock, **5%** snow
  (`probe-bands.ts`); with the mountain layer off it is 14% grass and **47%**
  snow, because the terrain layer alone then owns the whole range.
- **ONE BASIS SHIPS, AND FOUR WERE MEASURED BEFORE THAT WAS DECIDED**
  (`octaveNoise`, doc 08). Perlin, OpenSimplex2, psrdnoise and cellular are
  **gone from the engine**; `verification/noise.js` still measures all five,
  because the reason to keep one is a comparison. Their measurements stand and
  none of them is a reason to carry five: every basis fills `[-1, 1]` and the
  standard deviation of one octave is `0.401` value, `0.389` OpenSimplex2,
  `0.380` psrd, `0.369` cellular and `0.274` Perlin — a difference **sea level
  and the metre fit both renormalise away**, since one is a percentile and the
  other divides by the field's own peak. Two of the four also cost something:
  **`psrd` was the one basis not guaranteed bit-identical across runtimes** (a
  rotating gradient is a sine, and a library sine is not an IEEE operation), and
  **`cellular` is not smooth**, with a crease along every plate boundary the
  octave stack has nothing to round off. What went with them is the per-basis
  frequency correction — one feature ran `1.99` units in value noise and `0.78`
  in psrd, so `BASIS_PITCH` existed to bring all five within `0.9%`, and with
  one basis the widest octave is `radius / frequency` and there is nothing to
  correct. **The domain warp went too**: `warpAmplitude` moved a coastline and
  the layers decide where land is, so it was a second answer to a question that
  now has one.
- **RIDGE IS IN THE ENGINE AND NOTHING SETS IT** (`octaveNoise`, doc 08). The
  fold is real and measured — over a 3,400 m patch sampled every 13.3 m at
  300 m of relief, 0.6 takes the median land gradient from `13.8°` to `21.2°`
  and the 99th from `47.9°` to `60.9°` — and it creases the **whole world at
  once**, moving the character of every place together, which is the one thing
  a landscape must not do. The mountain layer replaced it because a layer says
  *where*. The parameter stays because doc 08 argues it from that measurement
  and this is the function the measurement is of.
- **A FOLD MOVES ITS CREST; IT IS NEVER MIXED WITH THE SHAPE IT REPLACES**
  (`octaveNoise`, doc 08, `tools/trial-fold.ts`, F-087 closed). A plain octave
  peaks where it reads `+1` and a fold peaks where it reads `0`, so the two
  **disagree about which end is high**: adding them in proportion subtracts on
  the positive half and adds on the negative one. Measured over the planet,
  that cost the positive half its range across the middle of the dial — the
  spread of the top tenth against the bottom tenth ran **bottom ×2.47 at a fold
  of 0.35**, the field's maximum fell to `0.337` against the plain sum's
  `0.735`, and **which end of the field carried its range reversed near 0.72**
  with nothing saying so. A little fold also made the ground *flatter* than
  none: `10.9°` at the median against `13.8°` at zero. `octaveNoise` moves the
  crest instead — `pivot` is where `+1` sits, at `n = 1` unfolded and `n = 0`
  fully folded, and the crease is measured from there, so the field reaches
  `+1` at the crest and `-1` at the far end **at every setting**. The top leads
  at every setting (×1.08 to ×2.20) and the gradient rises monotonically.
  **Both ends are unchanged to the bit** — 200,000 of 200,000 samples identical
  at 0 and at 1, largest gap zero — so no shipped world moves: `layeredHeight`
  passes `ridge: 0`, and nothing else in the engine sets it.
- **THE ONE SCALE THE FIT CANNOT DIVIDE OUT IS PEAK SCALE** (`metreHeight`,
  doc 08). The metre step divides by the field's own peak, so the tallest point
  is Relief whatever the shape knobs say — which is what makes Relief
  answerable, and also why the balance between the layers can never make a peak
  taller. **Peak scale multiplies the mountain layer's contribution after that
  division**, and only the part it pushed *up*, so the extra is continuous
  across the shoreline and a peak grows where a hollow does not. At `x3` the
  tallest point runs `1,100 m` to **`2,808 m`** while the sea keeps exactly its
  35% of the surface; at `x1` the term is multiplied by zero and the world is
  bit-for-bit the one without it.
- **LAND AND SEA LEVEL ARE DIFFERENT QUESTIONS** (`metreHeight`, doc 08).
  `landFraction` is the percentile every height is measured from, so moving it
  moves the ground. **Sea level moves only the water**, downward, leaving every
  height where it was — the same picture as draining that much ocean. Dropping
  it `60 m` takes the shipped world from **35% sea to 14%**, and what comes out
  from under it is the shallow floor that was already there.
- **TWO ELEVATIONS CUT THE LAND INTO THREE BANDS, IN ABSOLUTE METRES**
  (`GROUND_LINES`, `material`, doc 08). Water under 0, grass to **300 m**, bare
  stone to **400 m**, snow over it — and over the rock line the soil is gone
  through its **whole** depth, so a hillside that high is rock where it is cut
  into as well as where it is walked on. **The metres are absolute because the
  map is**: the Ground picture bands on the same 100 m grid, in the blocks'
  **own colors**, so a color on the map names the block the world builds there.
  Fractions of relief agreed at one relief and drifted everywhere else. What
  absolute costs is that a low world never reaches the lines — at relief `300 m`
  the ground tops out on the rock line and the world is **grass to its summit**
  — so the shipped Relief is **600 m**, giving 89.2% grass, 8.1% rock, 2.7%
  snow; 450 m gives 97.3/2.6/0.1 and 750 m gives 79.8/11.9/8.3. **The rule this
  replaces was a slope**, carrying a `2.5 MB` field for one boolean test and
  reading the **map cell's** gradient rather than the block's; an elevation
  needs no field, because the column already knows how high it stands.
- **A BLENDED RAMP INVENTS BLOCKS THAT DO NOT EXIST** (`CoarseRamp.hard`). The
  Ground picture is bands, not a gradient: every pixel of it is a block, so a
  color mixed from two stops is a material nothing builds. **Water is one band
  because water is one block** — depth is how much of it a look passes through,
  not a second material, so shading it drew sea floors the world does not have,
  and Height is the picture depth is read from. `Height` keeps its blend,
  because it answers a different question.
- **THE LAYER FIELD IS 11 BITS, AND THE ELEVENTH IS THE LAST ONE THE WORD HAS**
  (`cellIdLayout`, doc 03). `[planet 12][face 5][path 2D][corner 2][layer 11]` is
  `30 + 2D`, which at `D` 17 comes to **exactly 64** — so this bit was free and a
  twelfth would cost a level of subdivision. What it buys is the crust: at ten
  bits a 1 m block was held to **1,024** layers where the taper allowed
  **1,740**, and the tallest mountain to `900 m` against `1,620 m`. Above `D` 13
  the field still binds. Three numbers moved with it — the share code is **11**
  base-36 characters with a planet field rather than 10, the delta record is
  **56 of 64** bits rather than 55, and layer merging would now buy **1,613**
  layers rather than 589, which does not change that it is struck.
- **DEPTH IS A KNOB AND THE RADIUS FOLLOWS** (`PlanetKnobs.subdivisionDepth`).
  Depth, block size and radius are one quantity written three ways —
  `radius = blockSize x 2^depth / K` — so any two fix the third, and the pair a
  person can set is the one where every value means a different world. Asking
  for a radius did not: measured, the Radius slider had **484 positions and
  reached 6 distinct worlds**, because a radius is quantised to powers of two
  and every position between two of them built the same planet. Depth is a whole
  number from 4 to 17, radius is what it gives, and there is no rounding left
  for the radius to absorb. A link written with `radius=` still works — the
  depth that radius meant is recoverable exactly.
- **A CRUST IS A COUNT OF LAYERS, AND THE SLIDER WAS STATING IT IN METRES**
  (`KNOB_RANGES.crustMetres`). The layer field holds **2,048** layers and a
  layer is a block tall, so the crust reaches `2,048 m` at a 1 m block and
  **`8,192 m`** at a 4 m one — the largest any radius and block size in the
  panel allow. **Crust reaches** was capped at `1,024` **metres**, which is the
  layer count wearing the wrong unit, and because `rangeFor` only ever narrows
  it could never widen back: every world with a block over a metre was held to
  a fraction of the depth it could carry. The cap is the largest ceiling any world reaches now, and each
  world is narrowed to its own.
- **A LINK COULD BUILD WHAT A SLIDER COULD NOT REACH** (`fromParams`). Every
  slider's ends move with the rest of the draft, and `fromParams` went straight
  past that — while **Copy link** is how a world travels. A query string naming
  a crust too shallow for its own sea built a planet whose ocean columns sat
  **entirely under the bottom of the world**: no blocks, nothing drawn, space
  where the water should be, and low land missing with it. `fromParams` settles
  now; `problems()` stays for what settling cannot reach.
- **A KNOB THE FRAME READS MUST BE READ FROM THE LIVE DRAFT, NEVER THE LOADED
  ONE** (`current` in `planet.ts`). The panel hands the whole draft to
  `onLiveKnob` whenever a row moves, and the frame loop was reading the
  module-level `settings` -- the settings the **page loaded with**. So every row
  in **The light** did nothing at all in the panel while still working from a
  query string, which is the hardest kind of dead control to notice: a link
  proves the feature works and the checkbox proves nothing. Ten rows were dead
  this way, both shadow toggles among them. The frame reads `current`, which
  `onLiveKnob` reassigns; anything else that a frame reads goes there too.
- **NEEDING THE MESHES AGAIN IS NOT NEEDING THE MAP AGAIN** (`BAKED_KNOBS`,
  `flushMeshes`, `WorkerMeshSource.retune`, F-083). Four knobs -- speckle,
  corner shading, sky exposure and full light -- change a number the mesher
  multiplies into a vertex colour, which no shader can divide back out, so
  every chunk has to be built again. They were routed down `flushTerrain`, the
  path a **terrain** knob takes, which regenerates the coarse map from the
  seed and rebuilds the shape, the peak pyramid, all the generators and the
  whole worker pool first. **Not one input to any of that is a function of any
  of the four**: the terrain reads a face and a lattice offset and has never
  been told about one of them. Measured on the shipped world at depth 13
  (`tools/trial-remesh.ts`), that is **978 ms** before a single chunk is
  meshed -- **835 ms** of coarse map, **139 ms** of peak pyramid, 4 ms for the
  shape and the eight generators. `flushMeshes` keeps all of it and **retunes
  the pool in place**, which also stops the map's five typed arrays being
  structured-cloned once per worker, and it is not `async`: there is no long
  synchronous stretch to yield the thread before. **A retune folds into the
  setup the pool holds**, or a worker spawned to replace a dead one quietly
  goes back to the switches the player has just turned off. **And a job
  already ON a worker was posted under the old switches** -- `request` chains
  onto a job in flight rather than posting a second one, so the caller asking
  again is handed exactly that stale mesh and nothing ever asks a third time.
  Up to one chunk per worker keeps the old lighting for good, scattered
  wherever the pool was busy, which is the shape of lighting that looks wrong
  and cannot be pointed at. `retune` marks every running job **stale**, the
  same way `invalidate` handles a job whose store moved; a job still in the
  **queue** needs nothing, because it is posted after the retune. Replacing
  the pool never needed this -- `dispose` rejects everything in flight -- so
  keeping it is what created the case. **And the readout
  has to say which ran** -- it claimed "rebuilding the terrain" for a knob
  that rebuilds no terrain, which is what made the two paths impossible to
  tell apart from outside and is how `tools/probe-remesh-path.mjs` checks the
  routing in the real client. What is left is the re-mesh, which is the work
  the knob actually asked for.
- **A row with no meaning comes off the panel, it is not greyed out**
  (`Knob.shownWhen`, `ParameterPanel`). **Mountain line** shows only under the
  gated merge, which is the only one with a gate. A disabled row is a question
  the reader has to answer before
  dismissing; `enabledWhen` stays for a knob that still means something and is
  turned off elsewhere, such as every map row under **Plain planet**.
- **The noise is the reference implementation's parameter set** (`octaveNoise`,
  doc 08): seed, frequency, octaves, persistence, lacunarity, offset X and Y,
  divided by the summed amplitude and low octave first. **Every octave gets its
  own hashed offset** or two octaves of one seeded lattice share zero crossings
  wherever their frequencies land near a whole multiple and the ground grows a
  repeating grain. `relief` scales the field so its **tallest point is exactly
  that many metres**, which makes it "how tall is the highest mountain" rather
  than a multiplier on whatever this seed reached. The narrowest octave is
  `scale / lacunarity^(octaves−1)` and the panel **refuses** a map too coarse to
  carry it: ground the map cannot draw is ground the world does not have.
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
- **THE OCEAN IS A SURFACE AND THE FACES WERE NEVER WHY** (`water.js` §6, doc
  25, `SeaRenderer`). One translucent shell at the sea-level radius, drawn
  around the camera; `blockAt` returns **air** above the ground even below sea
  level, so a generated world holds **no water block at all** and the sea floor
  is bare. Every measurement below still says blocks were cheap — 0.89% of the
  naive faces, 15.2% of the crust's block slots — and none of it decided
  anything. **What decides it is that the two scale apart**: block faces
  quadruple per level while the shell does not, so at the shipped depth 11 it is
  **29,044,127 faces against 24,448**, a factor of **1,188**. The second reason
  reaches further than any number: **a shell carries a wave, a sun sitting on
  it, and a colour that deepens with what the look passes through; a block is
  one flat quad of one colour.** Two consequences that cost nothing: a player
  **cannot remove the sea**, because there is no block there to break, and
  being in water is a **radius test** rather than a block read. **A surface
  radius must be snapped to the layer grid** (`seaSurfaceRadius`) or flat ground
  at sea level measures a block under water and the player swims on the beach.
  **Lakes and rivers are unaffected** — a bounded body's face count does not
  grow with the planet — and water stays a block type for them and for the
  bucket.
- **THE SEA IS A LAYER OF THE WORLD, NOT A DISC ROUND THE CAMERA**
  (`SeaRenderer`, `seaPatch`, doc 25). It is cut into the **same chunks the
  terrain is**, at the **levels the terrain already picked** — so the water is
  finer underfoot than at the horizon and nothing here decides that twice. A
  chunk's triangle subdivided is the same shape for every chunk at a level, so
  the meshes are built **once per level** and a chunk is **one instance
  carrying its three corner directions**: the whole ocean in view is a handful
  of instanced draws. The vertex shader does **one barycentric blend**, which is
  invariant 12 arriving here unchanged. **Camera-following geometry was tried
  and fails two ways no tuning reaches**: a disc has a **centre**, and the
  sectors converging under the viewer draw a **starburst across the whole
  ocean**; and its vertices **move through the wave field as the player walks**,
  so crests slide instead of staying put. A wave must be a function of the place
  it is at. What the camera still decides is how far the swell is flattened —
  **off distance, never off the LOD level**, because a point kept by a fine
  patch and a coarse one has to stand at the same height in each or the water
  moves whenever a chunk changes level (doc 14's own rule, `lod.js`). Two
  consequences that cost nothing: a triangle whose **lowest** ground is above
  sea level is skipped with one `troughOf` read, and the sea **writes depth**
  so a cloud on the far side of the water does not draw through it.
- **TWO FOLDED BANDS MULTIPLIED ARE A GRID, AND ONE DOMAIN WARP DOES NOT BREAK
  IT** (`SEA_SHADER`, doc 25, `tools/trial-waves.ts`). A crest stands where both
  bands fold at once, so the crests sit on the crossings of two families of
  parallel lines and the whole planet is one sheet of graph paper. Warping the
  **sample point** moves both bands together: the lattice arrives somewhere else
  with its crossing angle intact. Measured by sorting every slope direction in a
  patch into 36 bins, the fullest bin runs **2.7x** the average over 400 m and
  **2.9x** over 1600 m, and the patch shifted a wavelength matches itself
  **0.46**. **Give each band its own bend and the lattice shears**: 1.8x and
  1.9x, and the shifted reading falls to **0.04**. Twelve radians of phase, read
  off noise a **sixteenth** of the octave's own frequency -- read at the
  octave's own frequency the bend has a slope of its own comparable to the
  wave's and the surface goes from water to crumpled foil. **Only the first two
  octaves are bent**: three measures 1.80 against 1.85 for two and costs two
  more noise lookups, one reads 2.13 and is a weave again. **And three octaves,
  never four** -- a vertex stands every 4 m, so the third is a 12.5 m wave at
  three vertices across and a fourth is 6.6 m at under two, which is crests that
  move with the camera; adding it moves the repeat reading from 0.101 to 0.102.
  **On a sphere the bend has to be 3D noise on the direction vector**: a 2D
  texture over a ground plane has no seamless spherical form (the hairy ball
  theorem again), which is invariant 4's rule arriving from a second direction.
  A phase stays a **dot product against a fixed axis** so the bands themselves
  never seam. **Show the mesh** is a live toggle that draws the sea as lines --
  WebGPU has no fill mode, so it is a second `line-list` pipeline over its own
  index buffer, and it is how you see whether a wavelength has the vertices to
  be a wave. A patch is cut to at most **16 pieces a side** (`FINEST`): a chunk
  is 64 m and the default swell is 45 m between crests, so that is a vertex
  every **4 m** -- eleven samples across a wave -- where cutting to the block
  grid would cost **4,096 triangles a chunk** to draw the same curve.
- **BELOW THE LAST WAVE THE GEOMETRY CAN DRAW, THE SLOPE IS PAINTED ON**
  (`ripple` in `SEA_SHADER`, doc 25). Three octaves stop at a 12.5 m wave and
  the water between two crests is a sheet of glass, and it cannot be put back as
  geometry because there are no vertices to put it on. Shading needs no vertex
  to have moved: the sun on the water is a dot product against the normal, so
  tilting the normal per pixel is indistinguishable from bending the surface
  until the silhouette, and at 12.5 m and under there is no silhouette. The
  fragment reads three octaves of noise for their **gradient**, which falls out
  of the same eight hashed lattice corners as the value -- **one lookup where a
  difference would take four**. **How much tilt is the whole decision**: about
  **0.06** at the widest octave, and past roughly **0.2** the sun's highlight
  stops being a path and breaks into separate lit pixels, which reads as
  glitter. It fades over the same distance the swell flattens over. The same
  noise ragged-edges the **foam**, whose band is cut across a per-vertex number
  and otherwise has the straight edges of the triangle it was interpolated over.
- **A WAVE THAT ROCKS IS A WAVE WITH ONE CLOCK** (`swell` in `SEA_SHADER`, doc
  25, `tools/trial-waves.ts`). `1 - |sin(p)|` repeats every `pi` of phase and
  the phase is `dot(dir, axis) * k + speed * t`, so **one drift rate for every
  band and octave makes the whole planet repeat every `pi / speed` seconds** --
  **3.93 s** at the shipped speed, and measured by holding 3,000 points still
  and correlating, it comes back to **1.000**. Sampling each octave twice, once
  drifting each way, is a **standing wave** on top of that: the crests go
  nowhere and rise and fall in place. Three fixes, none of them a lookup: a rate
  per band (0.76, no whole-number ratio) takes the 3.93 s reading to **0.498**;
  a rate per octave from **deep-water dispersion** (`sqrt(1.9)` per octave,
  because a wave travels as the root of its wavelength) takes it to **0.416**;
  and **the bend field travelling at 3.4 m/s** is the largest of the three --
  held still the surface still returns to **0.84** of a moment 15 s earlier,
  moving it the worst match in 30 s is **0.31**. The mirrored sample **stays**,
  because with two clocks it is no longer a mirror but the same water going the
  other way, which interferes and churns. **Only the clocks are mirrored, never
  the bend** -- the bend says where the crests are and both copies are the same
  sea. The layout is untouched: at one instant it is the same field, so the
  slope-direction and shifted-patch readings do not move.
- **A CURTAIN CLOSES A SEA SEAM, AND THE DRAW ORDER IS THE WHOLE OF IT**
  (`seaPatch`, `SeaRenderer.after`, doc 25, F-058). Chunk level and lod drop
  together, so every patch is cut **16 pieces a side** whatever its level -- and
  a chunk twice as wide as its neighbour therefore spaces the shared edge twice
  as far apart. The finer side lifts a mid-edge vertex off the line the coarser
  side draws and the water **splits to the sea floor**: dotted sand-coloured
  lines along every chunk edge, gone at **Wave height 0**, which is what says it
  is the waves. Each patch now hangs a strip from each of its three rims,
  straight down, `waveHeight + 0.25` m deep, carrying the rim vertex's own wave.
  **Neither of the fixes the finding priced**: a rim snap needs neighbour levels
  the renderer does not have, and a plain skirt is the shape of the answer
  without the part that works. **The sea is translucent and writes depth**, so a
  curtain blended before a neighbour's surface draws over it is two layers of
  water on one pixel -- a dark outline of every chunk, worse than the slit. So
  the curtain is **last in the index list** and the renderer draws **every
  surface, then every curtain**: by then the depth buffer holds the nearest
  water everywhere and the test throws the curtain away except in a slit. One
  extra draw call, **96 triangles a patch against 256**, and no dark band in
  shallow water where the curtain hangs into the sand. The wireframe draws the
  surface indices alone.
- **SWELL ARRIVES IN GROUPS** (`grouping` in `SEA_SHADER`, doc 25). One noise
  lookup over about twelve wavelengths scales the whole swell, and it only ever
  scales **down**, from 1 to `1 - depth`, so **Wave height** stays the tallest
  wave on the planet rather than an average the field wanders either side of. A
  scale over the surface rather than a term inside it, so the vertex shader
  applies the one value to the height and to both slopes and the wave field is
  evaluated no more often than before.
- **Water is still a block type, and there is no fluid system** (`water.js`,
  doc 25) — translucent, no collision, written once, never simulated. What
  follows describes a **body of water made of blocks**, which is what a lake, a
  river and a player-built aquarium are; the ocean is the one that outgrew it.
  Doc 21's erosion still runs, at world creation, and what it leaves behind is
  ground. Transparency turns out to be cheap in three separate ways: interior
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
  **Every script measures the pinned planet**: `volume.js`, `mesh.js` and
  `seam.js` run the same hash and the same fade as `noise.js`. Which hash a
  script runs decides the size of its counts by a tenth or so and decides none
  of its conclusions, which is what a statistical result over hundreds of
  thousands of cells is supposed to do.
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
  language, the fast data layout being the **default** one, and one source
  compiling to native and WebAssembly. **THAT VERDICT WAS LATER REVERSED — the
  decision is TypeScript**, see the entry below; every measurement above still
  holds and only the weighing changed.
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
- **THE LANGUAGE IS TYPESCRIPT** (doc 28, `language.js` §2b). Doc 28 first chose
  Rust; the reversal came from three things. A **browser client is now a stated
  requirement**, which TypeScript satisfies for free and Rust needs `wasm32` plus
  bindings for. The measured gap is **1.75×** on the generator and **1.5×** on the
  mesher — a margin, not a wall. And **the C escape hatch has a trap that points
  the other way**: one C source compiled `--target=wasm32` matches every other
  target, because **baseline wasm has no FMA instruction and so cannot contract**,
  while the same source at `-march=native` **disagrees**. So a project with *both*
  a wasm build and a native build of one C core generates **two planets** — which
  is exactly the configuration people reach for this hatch to get.
  **Staying in the scripting language is the safer option for determinism.** What
  TypeScript costs: data layout is a discipline not a default (**15×**, §5),
  `wrapping_uint32` is `Math.imul` plus a `>>> 0` you can forget, and no compiler
  enforces the frame budget. Build rules: `normalize` is
  `sqrt(x*x+y*y+z*z)` never `Math.hypot`; typed arrays for anything per-cell or
  per-vertex; and if a hot path is ever moved to C or Rust for wasm, its **native**
  build must set `-ffp-contract=off`, and **neither** build may see
  `-Ofast`/`-ffast-math` — that one re-associates and breaks the **wasm** build
  too, where contraction was impossible. Two rules, and only the second shows up
  in a wasm-only test. **Which targets contract by default is measured from the
  codegen** (`language.js` §2b): **every `aarch64` target fuses, every `x86-64`
  one does not** — so an Intel Mac and an Apple Silicon Mac running the same
  source with the same compiler and the same default flags do two different
  pieces of arithmetic. For a native C/C++ client: `-ffp-contract=off` on
  gcc/clang, `/fp:precise` explicit on MSVC (whose default has moved between
  versions — verify by digest, not by reading), never `-ffast-math`/`-Ofast`/
  `/fp:fast` anywhere. Simplest is **clang on all three platforms**. Flags do not
  fix the **libm** difference (glibc vs Apple vs CRT) — doc 23's transcendental
  rule does — and nothing but **diffing the digest in CI per target** tells you it
  worked.
- **Deployment is sketched and NOT decided** (doc 31). **V1 is local** — browser,
  WebGPU, filesystem. The delta store is **not a database**: it is `chunk ID → a
  blob of deltas`, one `get` and one `put`, and a well-played world is **76 MB**,
  so **DynamoDB** (or S3 for cold chunks) rather than a document store. API Gateway
  WebSocket → Lambda fits *unusually well* because doc 30 scoped the server to
  storage, so there is no tick loop. **The cost is fan-out, not storage** —
  interest management *is* fan-out — so instrument messages/second from day one.
  Serverless first, box later; **the migration trigger is the same event as V2
  simulation**, and the insurance is keeping `onMessage` and `send` behind an
  interface. **WebGPU only** — it is already the abstraction over Vulkan, Metal and
  D3D12, so a native client is the same TypeScript in Tauri or Electron, never a
  second renderer.
- **The server never generates terrain, and determinism is a client-to-client
  rule** (doc 29). Doc 22 already said it — "a player position per client, and
  nothing else" — and doc 29's first draft drew the server holding the whole core
  anyway. Four parts, not three: **addressing** (both sides, unavoidably — the
  delta store is keyed by cell ID and interest is a dot product against a chunk
  direction, so integer shuffling plus one blend and one `normalize`, and **no
  noise**); **generation** (client only, and the only part that must be
  bit-identical); **presentation** (client only, deliberately free, and where every
  transcendental lives, so doc 23's rule reaches nothing here); **world state**
  (server, the only thing that grows). The two machines that must agree are **two
  players**, and they exchange no bytes about terrain — so the requirement survives
  any server shape. **Open, and the biggest question left about the system's
  shape:** whether the server also generates in order to validate edits and
  simulate mobs. Doc 22 assumes it does not; that is a trusted-client trade nobody
  has actually made.
- **Most cheating is refused with what the server already holds** (`authority.js`,
  doc 30). Doc 29 asked "does the server generate?" as a binary; it has **three**
  answers spanning four orders of magnitude. **Stores-and-routes** already refuses
  reach, rate, protected pentagon columns, malformed IDs, unknown block types, and
  anything about a cell a player has touched — the delta store *is* the record of
  every modification ever made, so the built world is under authority for free.
  **The one blind spot is virgin ground**, and it costs a **point query**, not a
  chunk: `solidity(cell)` is `310 ns` in JS / `~200 ns` in Rust against **561**
  evaluations for a height-field chunk and **35,904** for a full crust — so
  validating every edit at 1,000 players is **0.062% of one core**. Assume it;
  doc 29's trusted-client default is withdrawn. **Mobs are the expensive
  decision, not honesty**: a pathfinding mob touches `3r²+3r+1` = **3,169** cells,
  100 mobs cost **158×** what 1,000 players do, and they need chunks **resident**
  plus a tick loop plus doc 22's open entity-interest question. Server-side mobs
  **remove** a determinism requirement (replicated positions are not recomputed).
  **The farming cheat is not about terrain** — no server CPU can check "I now have
  3 iron". **The client sends intents, never outcomes**: it names a cell and an
  action, the server reads the type it removed and issues the drop from doc 27's
  registry. The wire is a **closed message set, never RPC**. And
  **x-ray is unpreventable by construction** — every client generates the whole
  planet — so this design polices **actions**, never **knowledge**.
- **V1 SCOPE: the server is a point of storage only** (doc 30). It holds the delta
  store, routes edits, and validates nothing; server-side simulation and the
  input-driven authority that goes with it are **V2**. This is the first V1 scope
  line drawn anywhere in the specification. Doc 30 recommended the point query and
  the decision went the other way, which is fine — nothing is lost, because every
  free check stays available and the upgrade is a check inserted *before* a store,
  not an architecture change. **Three rules keep that door open and cost V1
  nothing:** (1) an edit message names a **cell and a resulting block state**, so
  V2 can check reach and solidity without a protocol change; (2) **player inventory
  never travels client → server** — this is the one thing that cannot be repaired
  later, so keep it client-side, and if it must persist, persist it as an opaque
  blob marked *not authoritative*; (3) **ship the rejection message in V1 unused**,
  because a client that assumes every edit succeeds has to be rewritten when V2
  starts refusing them.
- **AN ATMOSPHERE IS MARCHED OVER THE FRAME; A SKY IS DRAWN BEHIND IT**
  (`AtmospherePass`, `ATMOSPHERE_SHADER`, doc 32). A sky pass fills the pixels
  nothing else covers, so air drawn in one exists **only where the world does
  not**: no haze over a distant mountain, because the mountain was drawn over
  the sky, and no shell around the planet from outside, because every pixel of
  the planet was drawn over the sky rather than through it. The scattering runs
  **after the world is drawn**, reads the depth that pass left, and is bounded
  by the nearest of three things -- where the ray leaves the air, where it meets
  the planet, and where the depth buffer says a surface already is. One model
  then answers three questions: the sky overhead, the **haze** on far ground
  (the colour behind the air multiplied by the optical depth the march already
  accumulated, so it costs one exponential), and the shell seen from space.
  **The depth is why it is a pass and not a layer** -- inside the frame's own
  pass the depth buffer is an attachment and cannot also be read, so the frame
  depth is `depth32float` with `TEXTURE_BINDING` and the pass sits between the
  world and the tone curve, owning the image on each side of itself. Single
  scattering, Rayleigh plus Cornette-Shanks Mie at `g = 0.76`, 16 view steps and
  4 sun steps. **Both legs are paid for and each buys something**: the sun leg
  reddens a low sun (at 8° the light has crossed ~7 scale heights, leaving 0.72
  of the red against 0.15 of the blue) and draws the terminator as a **ray test
  rather than a fade**; the view leg dims the far end of its own march and is
  the haze. **Nothing in the march knows how bright the sun is** -- it gives a
  fraction of light turned toward the eye -- so **Sunlight on the air** is a
  knob, and at the shipped 45 the daytime sky reads `85, 188, 248` where 22 read
  `24, 52, 110` and 200 washes to `212, 250, 253`. No multiple scattering, no
  ozone band, no sun disc.
- **THE STARS CANNOT BE HIDDEN BY THE AIR IN FRONT OF THEM** (`SKY_SHADER`).
  The air dims them by its own optical depth, which overhead is about a tenth;
  what hides a star by day is a sky ten thousand times brighter than it, and
  that is a dynamic range this picture does not carry. The day takes them out,
  and the air is left to take out the rest near the horizon where its depth is
  enough to do it.
- **The sky is not decoration on a planet this small** (`sky.js`, doc 32). Walking
  turns your own `up` by `s/R`: **3.37°** per 100 m and a full **360°** over the
  10,681 m circumference, in **2.12 h** — so **the skybox is fixed in WORLD space,
  not view space**, or the stars follow the player around the planet. The same
  number says **a player outwalks the sun** for any day longer than 2.12 h and can
  hold a sunset in place by walking west. **Clouds borrow the LATTICE and are NOT
  cells**: invariant 10's construction is radius-independent so the hexagons are
  free above the surface, but a cloud has **no address** — no cell ID, no chunk,
  and **no layer, because `layer` counts downward from the crust top**. That is
  load-bearing rather than pedantic: the delta store, the side table, interest
  routing and edit messages are **all keyed by cell ID**, so an address is what
  makes a thing storable, and withholding it keeps "cosmetic, never stored" true
  by construction instead of by discipline. A cloud is a lattice point indexed by
  `(face, i, j)` into a transient buffer — the way a vertex is, not the way a
  block is. Level 5 is a 64 m puff and **10,242 points for the whole sky** against
  41,943,042 cells for one surface layer, under **9%** in view at 300 m — a
  buffer, not a data structure. **Wind is ONE AXIS AND ONE RATE**, rotating the
  sample point before the noise lookup: the hairy ball theorem (invariant 8's own
  theorem) forbids a uniform wind, and of the two obvious fields only **rigid
  rotation is divergence-free** — mean `|div|` **3.3e-12** against **0.9988** for a
  projected world vector, which would stretch a cloud pattern at one pole and bunch
  it at the other forever. Calm patches are **0.5%** of the surface, at the axis
  poles. **The moon's angular size is an art decision** — a faithfully scaled real
  moon is still **0.52°**, because scaling preserves angles — **but its distance is
  not**: walking round the planet shifts it **1.9°** against the stars, so a
  skybox-painted moon loses the parallax. **And the atmosphere is the one sky
  feature that does NOT survive scaling**: optical depth is *(a property of air) ×
  (a path length)* and only the path shrinks, so correctly scaled air gives a
  zenith `τ` of **6.4e-5** against Earth's **0.241** — **3,748× too thin**, a
  **black** daytime sky. An Earth-like sky needs air 3,748× denser or an atmosphere
  **5× the planet's radius**; neither is physical, so **run the scattering model on
  a fictional Earth-sized atmosphere** (Preetham / Hosek-Wilkie / Bruneton are all
  parameterised by radius and scale height — feed them Earth's) and take **only the
  sun direction** from the real world. Horizon glow has no geometry either: Earth's
  grazing path is **329 km** of air, here it is **88 m** and doc 13's horizon is
  76 m. **Angles scale and path lengths do not**: the moon survives
  shrinking and the sky does not, and why both are invented anyway. All three are **presentation**, so they
  are client-only and may spend the transcendentals doc 23 forbids in the
  generator; doc 32 is the first place that freedom is actually used.
- **The terrain generator must not be told which level of detail is asking**
  (`lod.js`, doc 14, F-032). `columnAt` takes a face and a lattice offset and no
  level, which looks like an oversight and is the property the whole scheme
  rests on: a coarse chunk draws a subset of a fine chunk's points, and because
  a point's height does not depend on who asked, **the points it keeps hold
  exactly the height the fine chunk gives them**. A chunk changing level moves
  no ground. What a coarse chunk loses is the surface *between* its points,
  which it draws flat — so it is **not inaccurate, it is incomplete**, and a
  hill between two of its points is missing rather than misplaced. Measured
  against the average of the ground each cell covers, that flat span misses
  `0.02 m` at LOD 1 and `0.31 m` at LOD 6. **Band-limiting it by level is the
  obvious fix and the wrong one**: a retained point would then hold one height
  in the coarse chunk and another in the fine one, so ground that never moves
  would start moving at every level change. Both attempts measured **worse than
  doing nothing** — `1.02 m` dropping octaves and `0.50 m` fading them, against
  `0.31 m` for leaving it alone. And it happens where nobody stands: the
  selection draws nothing coarser than **LOD 4 at eye height**, where the figure
  is `0.06 m`, and LOD 6 needs `1,200 m` of altitude. The coarse map's own mip
  pyramid is undecided for the same reason — it is read more widely than its own
  cell only from LOD 6.
- **A coastline is a contour of a smooth field, and that is a number**
  (`coastline.js`, doc 21). Count the cell edges along the largest landmass,
  halve the cells, count again: a curve carrying no detail below the map's
  resolution doubles exactly, and the excess is what ragged means. What ships
  grows **`x2.08` then `x2.17`** — a fractal dimension of **1.06 to 1.12**, the
  smooth end of the real range rather than outside it. Warping the sample
  direction reaches 1.13 to 1.17, which nobody would see. Growing a mask level
  by level reaches **1.40 to 1.45** and gives up the land fraction as a number
  that can be asked for, halving the largest landmass. **Plates** reach 1.25 to
  1.66, keep an exact land fraction and the **largest** continent of the four —
  34,359 cells against 27,305 — and lose river length a different way: a range
  along every seam cuts the interior into basins, so `114` cells against `172`.
  A plate is laid out from **hashed directions, never angles**: `sin` and `cos`
  would put a transcendental in a field two clients must agree on to the bit.
  **A plate's elevation bias is a step, so land stands a flat `2 x biasWeight`
  above sea level across a whole plate** — at `0.5` that is a `1.0` step on a
  terrain ramp `0.7` wide and every continent drew as one saturated slab. It is
  `0.15`, and a seam's uplift is divided by the fastest two plates can close so
  `upliftWeight` is the tallest range rather than a multiplier on a raw closing
  speed that runs to `2.3`.
- **THE MAP CARRIES ONE FIELD, and the editor draws two pictures of it**
  (`COARSE_FIELDS`, `plans/v0.3.0.md`). Water, drainage and slope are all gone:
  the last of them, slope, had **one reader** — a cliff rule turning steep ground
  to bare stone — and that reader cost `2.5 MB` for one boolean test, read the
  **map cell's** gradient rather than the block's, and drew grey patches the size
  of map cells instead of cliff faces. The rule went with the field. **A picture
  names the step of the build it stops at**: Height stops at the metre scale and
  Ground runs the erosion, so dragging a noise knob on the Height pane redraws in
  `1.2 s` against `5.5 s` — **4.4x** — and turning Erosion while Height is open
  runs nothing at all. Read the ratio; those are software-adapter timings.
- **A SLIDER THAT CANNOT REACH A REFUSAL beats a refusal that explains itself**
  (`PlanetSettings.rangeFor`, `settle`). Several knobs bound each other — the
  crust must reach past the ground, the map must be fine enough for the narrowest
  octave, a chunk must be smaller than a face — and every pair used to be found by
  hitting it. Each slider's own ends now move with the rest of the draft, and
  `settle` pulls every value inside, **in dependency order and inward only**, so
  lowering Relief never drags the crust back down behind it. Relief tops out at
  `320 m` on the shipped planet because `1,024` layers is all the address can name
  and the sea floor runs `3.14x` Relief at Land `0.3`; raise Block size to go
  taller. `problems()` stays as a backstop for a hand-edited query string.
- **The selection reaches for ground each triangle actually holds** (`ChunkPeaks`,
  F-023). One planet-wide `maxElevation` selects a ring of chunks whose ground is
  nowhere near that tall. A pyramid of tallest ground per triangle, built once
  from the coarse map and capped at level 6 with finer triangles reading their
  ancestor, is **437 KB** and cuts the reference scenes from **615 chunks to 434**
  at the shore and 610 to 407 under water, against 5 to 7% inland. **The land
  fraction decides the size of the win, not the relief**: 600 m of relief moves
  9% to 10%, while 10% land moves it to 32%.
- **Only three knobs move a coastline** (`trial-knobs.ts`). Swept across their
  whole ranges against the land-or-sea state of every cell: Land `25–50%`,
  Landform across `17%`, Radius `16%`, and **every other knob 0%**. The rest are
  not useless. They decide how tall the ground stands, how finely it is drawn,
  and how deep it runs. The panel groups by what a knob decides and folds all
  but the first group; nothing is cut.
- **DOC 09 NAMED THE WRONG HEXAGON, AND IT IS THE ROTATED ONE** (`ray.js`, doc
  09). The walk's three horizontal families were given as one per barycentric
  **coordinate** -- a cell being `|x − x₀| ≤ ½` on each -- and those three slabs
  cut out the hexagon turned **30°** from the cell: measured over 200,000 points
  rounded by `hexRound`, it holds for **75%**, so a quarter of every cell falls
  outside it and part of every neighbour falls inside, and a walk stepping on
  those planes crosses where no boundary is. A bisector between two lattice
  points is where a **difference** of two weights is halfway, so the families are
  the three **pairs** -- `|(a−b) − (A−B)| ≤ 1` and its rotations, **100%** -- and
  crossing one moves `+1` on one weight and `−1` on another, exactly the six
  neighbours `neighbour.js` lists.
- **A FACE EDGE IS NOT A CELL BOUNDARY, AND THE REFLECTION IS AN UNFOLDING**
  (`ray.js`, `rayWalk`, doc 09). Cells straddle a face edge, so nothing is
  entered and nothing is left -- the same cell is written under the other face's
  name. Two things change and one tool does not do both. Doc 05's
  `(α,β,γ) → (α+γ, β+γ, −γ)` lands on the right **cell** every time, and on a
  continuous point it moves the direction **2.28° on average and 6.47° at
  worst**, because it unfolds the two faces flat rather than turning one frame
  into the other; used for the frame it changes the cells walked on **52%** of
  the rays that cross an edge. Solve the neighbour's three weights from the ray
  again -- one 3×3 solve at **0.02** crossings a ray, the rarest step in the
  loop. And **rename** the cell rather than rounding the position into one
  again, which skips a cell wherever the edge and a hexagon boundary fall within
  a step of each other.
- **THE WALK IS WHAT A MARCH CONVERGES TO, AND ITS COST DOES NOT KNOW HOW BIG
  THE PLANET IS** (`ray.js`, doc 09). Against a march at 1/400 of a block over
  3,000 rays it reports the same hit cell on **99.90%**, and refining the march
  **25×** removes every disagreement -- it is not close to the sampled answer, it
  is the answer the sampling converges to. The march is wrong on **43.0%** of
  hits at one sample a block, **11.4%** at a quarter and **1.1%** at a
  twenty-fifth, which costs **102** cell lookups a ray; the walk carries its cell
  and looks nothing up. The same twelve-block reach at depths 6, 8, 10 and 12 --
  40,962 surface cells up to **167,772,162** -- steps **8.42, 7.83, 7.74** and
  **7.75** cells. A third of the steps are **radial**, and doc 09's "about five
  cells" counts the hexagons alone.
- **A CHANGE IS STORED RELATIVE TO ITS ROW, AND ONE HEADER MAKES THAT SAFE**
  (`delta.js`, `DeltaStore`, doc 27). The store is a row per chunk, so an address
  naming the whole planet repeats what the key already said: `[slot 12][layer
  11][state 16]` is **39 bits, 6 bytes** against the full word's 8, and a million
  edits is 5.7 MB rather than 7.6 MB. **The size is not the argument** -- the
  mesher lays a slot straight into the chunk's own array and reads every record
  on every build, where a whole word has to be taken apart first. **A slot means
  nothing on its own**: it is a rank inside a triangle whose side the chunk level
  sets, and the chunk level is the `chunkCells` knob, which **moves no block**
  -- the terrain is `columnAt(face, i, j)` and never sees where the address is
  cut. So the store carries **one header** naming the depth and the chunk level
  its slots were counted against, and a change of chunk size converts rather than
  being lost: **1,666,320 records over every pair of cuts at depths 4, 5 and 6,
  0 landed on a different cell.** One header for the store and not one per row,
  because both numbers are properties of the world.
- **CARRYING AN EDIT INTO A COARSE CHUNK IS NOT A SHIFT** (`delta.js`,
  `coarseCell`, doc 14). A coarse chunk keeps its path and drops the subdivision
  depth, so its lattice points really are the fine ones scaled by a power of two
  -- which makes shifting `(i, j)` right by the level look like the answer. It
  names the wrong cell for **43.9%** of cells one level out and **79.3%** four
  levels out, because a cell is a Voronoi region and a shift is a floor; rounding
  `i` and `j` apart is worse again at the first level, **53.8%**, for the reason
  doc 04 gives `hexRound`. **Scale the three barycentric weights and repair
  them**: a lattice point's barycentric recovers its own `(n−i−j, i, j)` exactly,
  because the one-shot blend is gnomonic projection, so the coarse lookup is
  `hexRound` on those three divided by `2^lod`. It disagrees on **2.4% to 32%**
  of cells and **every one of those is a tie** -- the point sits exactly on the
  boundary and both cells are the same distance away -- with **zero** landing
  further off. The layer is the one place a shift is right, because layers stack
  at a fixed thickness from a crust top that does not move with the level.
- **A CHANGE GOES TO EVERY CHUNK THAT READS THE CELL, NOT THE ONE THAT OWNS IT**
  (`DeltaStore.write`, `chunksHolding`). A chunk generates the slots on its own
  rim so the mesher can decide whether to emit a face there without fetching a
  neighbour, and **17%** of a chunk's slots sit on a border (`rank.js`). Writing
  to the owner alone leaves the others deciding from ground that has moved, which
  draws as a face missing or standing along a chunk edge. What a coarse cell
  reads when several changes land in it is **a placed block beats a broken one**:
  it is air only when every change inside it was a break, so a wall stays a wall
  at distance and a one-block hole in a hillside closes up. At `4^lod` cells
  across and `2^lod` down, a lone placed block reads as an **8 m** cube three
  levels out and **16 m** at LOD 4, the coarsest anybody stands at.
- **ID → position does not accumulate error.** Flat across depths 4 to 23: the
  path walk is integer arithmetic, so the float work is one barycentric blend and
  one normalise however deep the world goes. A deeper world is not a less accurate
  one.
- **THE ATMOSPHERE IS ONE RAYLEIGH TERM AND A BAKED TABLE, REPLACED RATHER THAN
  TUNED** (`ATMOSPHERE.ts`, `bakeOpticalDepth.ts`, `ATMOSPHERE_SHADER.ts`,
  `AtmospherePass.ts`, doc 32). The earlier model here was Sean O'Neil's, with
  separate Rayleigh and Mie terms and a phase function; this project now runs
  Sebastian Lague's simpler one instead -- a single density-falloff curve, no
  Mie term, wavelengths and a scattering strength a person can read straight off
  a panel. The **optical-depth table** is baked on the CPU, not the GPU as
  Lague's own project does it, and in the **planet's real metres** rather than a
  unit sphere -- his own bake is at radius 1, so his table holds values on the
  order of 1 and his `scatteringStrength` knob is calibrated against that.
  Measured at the shipped knobs (radius 1,700 m, falloff 4.3, scale 0.322):
  straight up from the ground this table holds **97.26**, and straight through
  the planet from the same point **3,488.43** -- thousands of times bigger than
  Lague's own table, because the table is honestly in metres. **The read site
  has to undo that scale, not the bake.** Multiplying a metres-scale depth
  straight against his order-1 `beta` sends the transmittance exponent to
  thousands and every sample comes back extinguished to black -- measured: the
  whole sky rendered as flat black, no stars, no sun disc, until
  `opticalDepthBaked` divided its texture read by `air.shape.x` (the planet's
  own radius) before returning it, which is exactly the conversion `scatter`'s
  own final line already applied to the in-scattered sum for the same reason.
  One line, caught only by actually rendering a frame -- nothing in the unit
  tests exercises the WGSL math at all. **The stars, the
  sun disc and the moon disc are drawn in the SAME pass** as the scattering,
  reading the pass's own already-computed luminance to fade the stars, rather
  than a second full-screen pass sampling the finished frame the way Lague's
  does it -- one shader, one draw call, for the whole sky. **A per-pixel hash
  stands in for Lague's blue-noise texture**, breaking the visible banding ten
  integration steps leave across a smooth sky into noise too fine to read as a
  band, with no binary asset to ship.
- **A MARCH IS DITHERED BY WHERE IT STARTS, NOT BY WHAT IT RETURNS**
  (`scatter`, `sunReach`, doc 32). Noise added to the in-scattered sum -- which
  is what Lague's shader does and what was ported -- masks fine grain and
  cannot touch a band, because by then the band is already in the number.
  Every pixel marching from the same place samples the same heights, so
  wherever the sum gains a sample's worth of light the whole screen gains it
  along one line. **Offset each pixel's first sample by a fraction of a step**
  and that transition is scattered over neighbouring pixels instead --
  **banding and grain are one quantity spent either way**, and **Sky dither**
  is which. Nothing is added to the result on top of that; grain there buys
  nothing the offset has not. **The pattern decides how much of the noise can
  be seen**: a hash is white noise and clumps by definition, so a tenth of the
  signal's worth of jitter reads as coarse grain over the whole sky.
  `ditherAt` is Jimenez's **interleaved gradient noise** -- three constants and
  two `fract`s, nearly as well distributed as the blue-noise texture Lague
  ships as a binary, with no file to carry. What made the banding visible in
  the first place was the planet's own shadow: a
  **yes-or-no** `inPlanetShadow` crossing a hard boundary at ten samples drew
  the terminator inside the atmosphere as one clean arc across a twilight sky
  -- confirmed by frames, since the arc vanished at 40 steps and was there at
  `aerialPerspective` 1 and 0.45 alike. `sunReach` softens that edge over
  **2%** of the planet's radius, which is better physics as well: the sun has
  an angular size, so its shadow has a penumbra rather than an edge.
- **BRIGHTNESS AND COLOUR NEED SEPARATE KNOBS, AND ONE OF THEM WAS NEVER
  PORTED** (`intensity` in `ATMOSPHERE.ts`, `skyIntensity` on the panel,
  `tools/trial-sky.ts`, doc 32). Lague's shader ends
  `inScatteredLight *= scatteringCoefficients * intensity * stepSize /
  planetRadius`, and `intensity` was dropped in the port -- leaving
  **Scattering strength** doing two jobs at once, because it scales both the
  light scattered toward the eye **and** the exponent that takes light out
  along the way. Blue scatters `6.4x` harder than red and so extinguishes
  `6.4x` faster, so turning it up for a brighter sky kills the blue first:
  measured at the zenith under a 60-degree sun, strength 5 gives `5.26`
  blue-over-red, 20 gives `2.91`, 40 gives `1.33` and 80 gives `0.28` -- blue,
  cyan, green, orange, brightening the whole way. **There is no setting of it
  that is bright and blue at once**, which is exactly why the sky could not be
  tuned and why raising it to brighten the day brought the stars out. Every
  other thickness knob (**Density falloff**, **Atmosphere scale**) has the same
  coupling. Thickness now picks the colour and `intensity` picks the
  brightness.
- **THE HAZE IS WHAT MAKES A SUNSET WARM, AND IT NEEDS NO SECOND TABLE**
  (`phaseMie`, `phaseRayleigh` in `ATMOSPHERE_SHADER.ts`, doc 32). A
  Rayleigh-only sky is blue in **every** direction, so looking at a low sun
  reads blue too -- measured, `(0.62, 1.44, 1.92)` toward a 2-degree sun. Grey
  forward-thrown haze is what turns that warm: at `g = 0.76` the
  Henyey-Greenstein phase is **30x** brighter straight at the sun than even
  scattering and a fifth of it across the sky. **Both species share one
  density curve and one baked table**, because a baked optical depth is a path
  length and carries no colour -- what separates them is the coefficient it is
  multiplied by and the phase that aims it, so the haze costs two multiplies a
  step. The Rayleigh phase `3/(16pi)(1+cos^2)` was **missing entirely**, which
  is why the sky was one flat sheet: measured, toward and away from the sun
  differed by `0.5%` without it. **Both phases are normalised to average 1
  over the sphere**, not `1/4pi`, so switching them on redistributes light
  rather than dimming it by `4pi`.
- **A SCREEN HAS ONE WHITE, SO A SUN MUST BE DRAWN AS GLARE** (`BloomPass`,
  `BLOOM_SHADER`, doc 16). A disc drawn near white is a sticker and no tone
  curve rescues it: ACES maps 6 to `0.95` and 1 to `0.80`, so a sun and a
  cloud arrive a tenth apart and both flat. The sun disc is now **120** and
  the part of the frame over a threshold is blurred very wide and added back
  **before** the curve -- after it there is nothing left to tell the two
  apart. Six halvings from a half-size base, each a quarter the cost of the
  last, reaching a radius no single pass would pay for. Measured over 303,414
  pixels on a low sun (`tools/frame-diff.mjs`), glare on against off moves the
  mean from **94.3 to 101.5** at a **50.7%** spread, fifth percentile
  **1.000** and ninety-fifth **1.147** -- most of the frame untouched and what
  moves moving a long way, which is the shape that says it is a glare and not
  a brightness knob. Two details stop it flickering: a **soft knee** at the
  threshold, and a first halving that averages its thirteen taps in **four
  overlapping groups** so one very bright pixel stops depending on which texel
  it landed in. **Every step owns its own uniform buffer** -- `writeBuffer`
  queues against the queue and not the encoder, so steps sharing one buffer
  would all read whichever value was written last and the whole chain would
  blur at one level's texel size.
- **A SUN-LEG QUERY PER SAMPLE COLLAPSES TO ONE PER PIXEL WHERE IT MATTERS**
  (`BEAM_WIDE`/`BEAM_NEAR` in `ATMOSPHERE_SHADER`, doc 32, F-076). Nothing
  shadows the air, so the column in front of a mountain is lit as though the
  mountain were not there and a hidden sun leaves a soft patch marking where
  it is -- the disc and its bloom go behind the rock and the glow does not.
  **A walk over the coarse map from every sample was built and reverted**: the
  bill is the **product** of two step counts, six readings toward the sun
  times the march's own ten, and what a 32 m map cell draws in six steps is a
  coarse copy of the ridge laid over the hillside rather than light. Its
  elevation fade was wrong as well, and instructively: faded out above a 20-35
  degree sun on the measurement that **ground** shades itself only where its
  slope beats the sun, which says nothing about a 300 m mountain seen from its
  foot that subtends a huge angle and blocks a high sun outright -- so the one
  case a person stands in was the one case it switched off. **The term needing
  the answer only exists near the sun**: the forward-thrown haze is 30x the
  even value straight at it, 3.2x at 30 degrees and 0.57x at 60. **And where a
  ray points at the sun, the sun leg from every sample on it runs along the
  ray** -- so whatever the ray hits is exactly what stands between those
  samples and the sun, which the depth buffer already holds and is the same
  buffer that hides the disc. The airlight fades out where a ray within **45
  degrees** of the sun has something drawn in it: **0** texture reads, one
  `smoothstep`. Measured over a sunrise ridge the face falls **54.6 to 31.8**
  of 255 with a fifth percentile of **1.000** -- it only ever takes light away
  -- against **31.1** for turning the haze off outright, so it removes the
  spike and nothing else; midday is unchanged at **123.1 against 123.6**. What
  is left open is air shadowed by terrain a ray is **not** pointed at, which
  is where crepuscular rays live.
- **A CLAMPED STAR FADE HAS A SETTING AT WHICH IT SNAPS** (`celestialAt`, doc
  32). Stars faded by `clamp(luminance * 3, 0, 1)`, and every knob that moved
  the sky's brightness moved where that clamp landed, so retuning the air put
  stars in a midday sky. It is `1 / (1 + luminance * k)` now: no edge, and
  right at both ends -- a world given almost no atmosphere **shows** its stars
  in daylight, the way an airless one does.
- **HAZE OVER GROUND IS TWO TERMS, AND A THICKNESS KNOB MUST MOVE BOTH**
  (`aerialPerspective`, **Haze on distance**, F-075). Air dims what is behind
  it **and** adds the light it scatters in front of it. Scaling only the
  extinction was tried and is worse than nothing -- the ground clears and the
  glow stays sitting on top of it, which reads as fog no knob controls. One
  factor over both is what makes it a thickness rather than a contrast
  slider. **It rides on how much air a surface cut short, not on whether one
  is there at all**: a yes-or-no test says the same thing about a mountain two
  kilometres off and a cloud deck standing above the whole atmosphere, and a
  cloud is not seen *through* the air -- the air is under it, so thinning its
  haze cuts it out of the sky it belongs to. `1 - through / shellLength` gives
  a cloud beyond the air the sky's own full measure, gives ground underfoot
  all of the reduction, and leaves no step at a silhouette where a surface
  first appears -- including the planet's own limb from outside. The scale is
  needed because the geometry is not Earth's -- a horizontal look of two or
  three kilometres here crosses a large share of the whole atmosphere's
  optical depth, where the same distance on Earth crosses very little.
- **NOTHING SHADOWS THE AIR, SO A LOW SUN GLOWS THROUGH A MOUNTAIN** (F-076,
  `inPlanetShadow`). An in-scattering sample asks whether the sun reaches it
  and the only thing that can answer no is the planet's own **sphere** --
  terrain is invisible to that test and to the sun-leg table read beside it.
  So the column of air in front of a ridge is lit as though the ridge were
  not there, and with the haze thrown **30x** forward a low sun behind it
  paints a warm disc across its face. **The same gap is why there are no
  crepuscular rays**: shafts through a gap in terrain *are* that shadowing,
  so the feature and the artifact are one question. The cascades are already
  bound and would fix the near field for nearly nothing; the far field needs
  a coarse-map lookup on the sun leg, which is **one texture read per step**
  rather than the per-fragment march F-074 struck.
- **NOT EVERYTHING IN THE WORLD PASS WRITES DEPTH, SO ALPHA HAS TO CARRY
  COVERAGE** (`ChunkRenderer` clear, `fragmentMain` in `ATMOSPHERE_SHADER`).
  A cloud is translucent and must not write depth, which leaves it looking to
  the air pass **exactly like empty space** -- and that pass decided what a
  pixel was by depth alone, then **replaced** the colour with the stars. So
  every cloud with sky rather than ground behind it was erased: cut off at the
  planet's limb seen from outside, and gone altogether from the sky overhead,
  so a daytime sky held no clouds at all. The scene target
  now clears to **alpha 0**, the cloud's existing `one / one-minus-src-alpha`
  alpha blend accumulates coverage, and the air composites **under** what was
  drawn: `worldColor + sky * (1 - alpha)`, premultiplied. Nothing else had to
  change -- every opaque pipeline already writes alpha 1 and writes depth, so
  its pixels never reach this path.
- **SKY EXPOSURE IS A FACT ABOUT A LAYER, NOT ABOUT A COLUMN** (`skyAt` in
  `meshChunk`, `SKY_FLOOR`, doc 16). The mesher bakes how much sky a cell takes
  from the ground around it, and it read that **once per cell at the column's
  own top** and painted it over every face the column produced. Right for the
  cap sitting on that top, wrong for everything under it -- and **a wall
  belongs to the solid side**, so the wall of a dug shaft took the exposure of
  the surface it was dug from, at full daylight, however deep it ran. A cave
  inside a hill took it too, because the column's top is still the hillside
  over the cave. Measured on a flat world with a twelve-block shaft, sky factor
  recovered per vertex by dividing the block's own registry colour out: **1.000
  at every depth** top to bottom, and only the floor cap darkened, to 0.350.
  Read at each face's **own layer** it runs 1.000 at the surface, 0.511-0.633
  halfway down and **0.120-0.267** at the floor. A wall takes its **two ends**
  -- top vertices at the run's first layer, bottom at its last -- so one merged
  run carries the gradient for nothing, and ground under the open sky does not
  move because a cap on its column's top is read at that same layer. **What an
  enclosed cell keeps is a decision**: there is no torch in this world, so the
  curve's floor is the whole of what a cave gets. It is **0.12** against the
  0.35 it was, and that costs a surface frame's mean **136.0 against 136.1** of
  255, a mean per-pixel move of 3.08 -- the floor only reaches a cell shut in
  on every side. **Sky exposure** switches the term off entirely, which is the
  only way to see what you dug. **A baked knob has to be in the panel's remesh
  set or it does nothing at all** (`REMESH_KNOBS`): `touch` routes a
  `rebuilds` knob to a live rebuild only for a key in that set, and a knob left
  out of it marks the world dirty and changes no frame until a full reload --
  which reads as a switch that is simply broken. It is a set of its own rather
  than `LIVE_TERRAIN_KNOBS`, because `WORLD_SHAPE_KNOBS` spreads that one and
  a world's stored edits are named by it: a knob joining it files a player's
  buildings under a different world every time it is turned. **`speckle` was
  in it and is not any more** (F-079) -- it had been put there with a comment
  saying it was only for the rebuild, and it moves no block, so turning it
  orphaned every block the player had placed. **Needing the same work as a
  terrain knob is not the same thing as being one**, and the three baked
  knobs -- speckle, corner shading, sky exposure -- are the set that says so.
  Taking it out re-keys **every** world rather than only the ones with the
  switch turned, so the edits already on disk are orphaned once; nothing is
  deleted, they sit under the old name.
- **FULL LIGHT TAKES AWAY THE BLOCKING, NOT THE LIGHTING**
  (`frame.sun.w` in `TERRAIN_SHADER`, `fullbright`, doc 16). There is no torch,
  so a hole gets the sky's 42% times a wall's own `openness` of 0.71 -- about
  **0.30** of open ground, the sun's 58% having been refused by the shadow
  maps -- and the 0.12 an enclosed cell is baked to takes that to **0.036**.
  **Full light means the sun reaches every face as though no block stood in the
  way**: the shadow lookup is simply not asked for, and every other term still
  does its own work, so `dot(faceNormal, sun)` still says which way a face
  points and the sky term still says how much sky is over it. A cave keeps its
  shape. **Pinning every surface to 1 was tried and is the wrong shape** -- with
  no term left that varies by face, a floor, a wall and a ceiling all come out
  at exactly the block they are made of and the room reads as a flat sheet of
  colour with edges; the brightness was never the problem, the blocking was.
  **A shader flag alone still cannot do the whole of it**: the sky exposure is
  multiplied into the vertex colours by the mesher and nothing computed
  afterwards can divide a number back out, so full light stops that one being
  baked and therefore wants a rebuild. **The corner shading stays baked and
  stays on** -- it says how much sky a corner sees rather than whether the sun
  arrives, it bottoms out at 0.55 rather than 0.12, and it is what keeps a
  cave's edges legible. Measured on high-relief open ground with the air and
  clouds off: mean **74.9 to 76.7** of 255, fifth percentile of the ratio
  **1.000** -- it only ever gives light back. **Nearly a no-op above ground is
  the point**: almost nothing up there was blocked.
- **A BLOCKED DIRECTION POINTS AT A LIT SURFACE** (`skyExposure`, **Sky
  bounce**, `tools/trial-skybounce.ts`, doc 16). The sky walk counts how much
  taller each of a face's six neighbours is and clamps to a floor, and a
  blocked direction was worth **nothing** -- so once every direction is
  blocked there is nothing left to vary and **a shaft reads the same number at
  its mouth and forty layers down**. Measured at reach 6, floor 0.12: every
  depth from **6 layers and below shared one number, 0.120**. A blocked
  direction now returns a share of what it intercepted, faded by how far the
  blocker rises -- the part of a wall a cell sees from ten layers down is
  itself ten layers into shadow. At **0.35** that is `0.295` at six layers
  (**2.46x**), `0.237` at twelve, `0.166` at forty and `0.144` at eighty: a
  gradient where there was a constant. **At zero it is the old reading to the
  bit**, and an open face never moves at any setting, because it blocks
  nothing so nothing is intercepted. **It costs nothing** -- the walk already
  ran over data already in hand. Two things it does not do, both by
  construction: it **carries no colour**, so a red wall does not tint the floor
  beside it, and it is **the sky's bounce and never the sun's** -- it is baked
  into the mesh and the sun moves, so a sunlit rim throws no warm patch on the
  wall opposite. Both need light computed while the world is looked at rather
  than while it is built, which is a light field and a milestone rather than a
  term in a function. It joins `BAKED_KNOBS`, so it takes the re-mesh path and
  stays out of a world's identity.
- **A PROBE STORES WHAT THE SUN DOES NOT MOVE, AND THE SUN IS APPLIED WHERE
  THE PROBE IS READ** (`probeVolume`, **Light probes**,
  `tools/trial-probes.ts`, doc 16). A sparse grid inside every chunk holding
  how much of the environment reaches a point and **which way it comes from**
  -- neither of which knows about the sun. So a sunlit rim throws a warm patch
  onto the wall opposite and **the patch moves across the day**, out of a
  volume built once at mesh time. Storing irradiance would bake the sun in and
  be wrong the moment it moved, which is the ceiling every baked term hits.
  **Light is passed between probes, never traced**: open probes start full,
  rock starts empty, and a few rounds of each taking its neighbours' **best**
  -- an average dims a corridor along its length, because half of every
  probe's neighbours are the rock beside it. The direction is the **gradient**
  of the field and costs nothing once the field exists. **The band is what
  makes it small**: the shipped world's crust is 1,232 layers and a chunk's
  band spans **71**, so at 4-cell spacing a volume is **6,156 probes, 24 KB
  and 3.1 ms** beside a chunk's **917 KB** of mesh and **150 ms** of
  generation -- **2.6%** of the mesh it rides with. Three things only a frame
  showed. **Probes may only ADD**: scaling the sky term by what a probe
  carries double-counts the mesher's own sky exposure and open ground comes
  out *dimmer* for switching them on. **Fill the rock in from the air beside
  it** and lift the lookup half a spacing along `up`, or a surface samples
  between a lit probe and one inside the ground and every face in the world
  goes halfway to black. **And the direction has to leave the lattice** -- it
  is a gradient over `(q, r, layer)` and the shader was dotting it against a
  world-space sun, two different spaces, giving exactly nothing; a step across
  the triangle is the difference of two corner directions and a step down is
  the column's own up. **A PROBE HAS NO ADDRESS**: it is filed by the lattice
  point it was built at, the way a vertex is, so the delta store, the side
  table, interest routing and edit messages -- all keyed by cell ID -- never
  see one, and the 64-bit word is untouched. **Show probes** draws each one
  where it stands from the same texture the shader reads, which is the only
  way to see a volume otherwise visible only through the light it makes.
- **SSAO MUST RUN BEFORE THE LIGHT IT CHANGES, AND SSGI IS THE ONE INDIRECT
  TERM THAT CAN RUN AFTER** (`Ssao`, `Ssgi`, `ScreenDepth`, doc 16). Two screen-space terms, and the difference between
  them decides everything about what each one costs. **Occlusion scales the
  sky's share of a surface**, and that share is decided inside
  `TERRAIN_SHADER` while the world is being drawn -- so a pass reading the
  depth **that** pass wrote is a frame too late to touch it. The occlusion has
  to exist first, which means finding out where the geometry is **twice**: a
  depth-only pass with no fragment stage (`ScreenDepth`, the cascades' own
  shader with the view matrix in place of the light's), then the occlusion,
  then the world. That second geometry pass is the whole of what the switch is
  for. **A bounce adds rather than scaling**, so it needs nothing separated
  out of a finished pixel and runs after the world pass -- which is also what
  lets it read the lit colour at all, since it is downstream of the shading it
  gathers from. It costs no second look at the geometry. **Never multiply a
  whole pixel by an occlusion factor**: the sun either reaches a face or does
  not and the cascades already answer that, so scaling everything draws dirt
  across ground in full sunlight. **OCCLUSION IS MEASURED AGAINST
  THE TANGENT PLANE, NEVER BY COMPARING TWO DISTANCES FROM THE EYE**: stepping
  into a hemisphere and calling it blocked where the surface there is nearer
  self-occludes, because on any surface seen at an angle a step **along** the
  ground lands further from the eye than it started -- and how much depends on
  which way that sample pointed, so a flat hillside comes out covered in
  hatching **no blur can remove, because it is signal rather than noise**.
  Ask instead whether a neighbour stands **above the plane this surface lies
  in**: a neighbour on the same flat ground is in that plane and contributes
  nothing however the samples were turned. **The normal is reconstructed,
  never stored** -- the terrain shader derives its own the same way, so the
  two agree by construction -- but **a plain derivative straddles a
  silhouette** and averages two surfaces metres apart, so each axis takes
  whichever neighbour is closer in depth. **HOW SSGI'S SUM IS NORMALISED
  DECIDES WHETHER THE TERM EXISTS**: dividing by the sample count is the
  hemisphere average and is correct and useless -- on a voxel hillside two or
  three samples in sixteen find a surface turned back toward this one, so the
  answer lands at a few percent of a colour that was itself dark and arrives
  as a rounding error. Divide by the accumulated **weight** instead, which is
  the colour bouncing in, and multiply by **how much of the ring found
  anything**. Its falloff is **linear, never inverse-square** -- a physical
  falloff belongs to a point source, and every sample here is a patch whose
  area grows with distance in the same proportion. Both are
  blurred before anything reads them, and **neither blur may cross a depth
  step**. The occlusion joins **group 2**, which `SunViews` owns and both the
  terrain and the sea declare -- there is no fourth bind group left -- and it
  is read through a **clamped** `textureLoad`, because the off case is one
  texel wide and a load outside a texture returns **zero**, which here means
  fully shut in and would black the world out rather than leave it alone. **Each row names its own technique** -- calling SSAO
  **Contact shadows** was worse than a rename, since that is a different
  effect with a light direction in it. Both ship **off**.
- **A STEP TOO SMALL TO SEE IS A STEP THAT ALIASES** (`stepBlur` in
  `TERRAIN_SHADER`, F-066). A voxel hillside is a staircase, and at a low sun
  the flat top of a step takes `sin(elevation)` of the direct light while the
  riser beside it takes `cos(elevation)` -- a factor of **seven** at an 8
  degree sun, two surfaces a metre apart. Near the eye that is terracing,
  which is what the world is. Far off, where a whole step lands inside one
  pixel, it beats against the pixel grid and draws **moire rings** across a
  hillside. The face normal is turned toward the column's own up as that
  happens, which damps the alternation the rings are made of. **The measure is
  metres of world per pixel, not distance** -- a step is unresolvable when the
  pixel covering it is wider than the step is tall, and that depends on the
  resolution and the field of view as much as on range, so it is read off
  `fwidth` rather than guessed from metres. Taken on the **chunk-relative**
  position, for the same `float32` reason the normal itself is. It never turns
  the whole way: a hillside that reads as completely smooth is a different lie
  from one that strobes. **Post-processing cannot fix this** -- bloom and the
  tone curve run after the image is sampled, and moire is information already
  gone by then.
- **DAMPING THE VARIATION IS NOT SAMPLING IT, SO THERE IS A SUPERSAMPLE KNOB
  AS WELL** (`ChunkRenderer.superSample`, `resolve` in `TONE_SHADER`, doc 16).
  Turning the normal toward the column's up removes the *cause* of the moire
  and leaves the sampling as coarse as it was; drawing the world into a larger
  image and averaging it back helps that and every other hard edge in the
  frame -- a block against the sky, a cloud's rim, the sun's own disc. **Nothing
  here sets `multisample`, and it would not have helped**: most of what aliases
  on a voxel hillside is the *shading* across its steps, and multisampling
  shades once a pixel. The resolve lands in the tone pass because that is the
  one pass already reading every pixel once. Measured over the distant band of
  one eye-level view, the mean jump from one pixel to the next along a row goes
  from **7.75 of 255 to 2.78** at a scale of 2 while the frame's mean
  brightness holds at **127.2 against 124.9** -- the same picture, sampled more
  finely. It costs the **square** of itself, so it ships **off**, and off is
  exact: a `textureLoad` of one texel, filtered by nothing.
- **HOW HARD THE SUN LANDS IS THE OTHER HALF OF A SKY'S BRIGHTNESS**
  (`Frame.sunLight`, `frame.night.z`, doc 16). The air's own brightness knob
  moves the sky and nothing on the ground, because the ground's sun term never
  reads it -- so half of the balance had no control at all, and it is the half
  deciding whether a world reads as an overcast afternoon or a hard noon.
  **It cannot be the share between sun and sky**: that share sums to 1 so flat
  ground at noon does not move when it is turned, which is exactly what makes
  it useless as a brightness. **Sunlight** is a plain multiplier on the direct
  term alone, on land and on the sea's two highlights alike. Measured with the
  air off, `2.5` against `0.2` moves a frame's mean from **56.7 to 106.7**, and
  the shape is the point: 95th percentile of the per-pixel ratio **3.425**, 5th
  **0.947** -- lit faces gain nearly all of it and sky-lit ones do not move.
- **THE SKY TERM READS A FACE'S OWN ANGLE, AND THAT ALONE LOOKS DIRECTIONAL**
  (`Frame.skyShading`, `frame.night.w`, doc 16). Zeroing `sunLight` removes the
  sun term outright and a ridge still shades one side darker than the other --
  which reads as the sun still being on, because it looks exactly like what a
  directional light does. It is not: `openness`, the sky term's own fraction,
  is `dot(faceNormal, up)`, a face looking sideways seeing half the sky a face
  looking straight up does, with nothing in the scene pointing anywhere in
  particular. **Sky shading** blends `openness` toward the open-sky reading for
  every face alike -- not a brightness knob, since turning it down does not dim
  the world, it makes every face agree about how much sky is over it. Measured
  with the sun, air, clouds and both ground shadows off: the terrain band's
  mean moves **38.3 to 40.1** turning it off, 95th percentile of the ratio
  **1.000**, 5th **0.727** -- it only ever brightens a face. **At its natural
  strength this is subtle almost everywhere**: `byAngle` bottoms out at
  `0.42` only for a face pointing straight down, a sheer vertical wall only
  reaches `0.71`, and the shipped ground runs `11.1°` of slope at the
  median -- so ordinary terrain has barely left `1` regardless of the knob.
  `mix` does not clamp to its own ends, so a value **past 1** extrapolates
  past `byAngle` for a stronger effect than the physical derivation gives --
  `2` reaches `0` on a sheer wall rather than `0.71` -- and the final
  `clamp(..., 0.0, 1.0)` is what keeps that inside range. Flat ground never
  moves at any strength: `byAngle` is `1` there regardless.
- **THE AMBIENT TERM ITSELF HAD NO BRIGHTNESS KNOB, DISTINCT FROM SKY
  SHADING** (`Frame.skyLight`, `frame.sky.w`, doc 16). Zeroing `sunLight` and
  `skyShading` together still leaves a flat, uniform ambient light with
  nothing to turn it down -- `ambient` in `fromSky` is a fixed share of
  `SUN_SHARE`, never a knob. **Also distinct from the atmosphere's own Sky
  brightness** (`skyIntensity`), which is how bright the marched sky dome
  reads and which the ground's sun term never read either -- the same gap
  Sunlight closed for the direct term, now closed for the ambient one.
  **Ambient brightness** is a plain multiplier on `fromSky` alone, leaving the
  after-dark floor and the sea untouched. Measured with the sun and air off:
  `1` against `0.2` moves a terrain band's mean **113.6 to 87.8**.
- **THE AIR HAS TO CONTAIN THE ALTITUDES PEOPLE ARE AT** (`atmosphereScale`).
  The colour sweep's best corner was `0.15`, which is `1,020 m` of air on the
  shipped planet -- and the world opens with the camera **`1,100 m` up**,
  looking at the sky from outside it, which draws as black space with a blue
  rim. Shipped at `0.25`, `1,700 m`, which holds the opening view and costs
  `0.35` of blue-over-red at the zenith. Doc 32's own F-077 is the same
  measurement from the other side: the cloud decks at `3,000 m` and `6,000 m`
  stand outside the air at any scale that keeps the sky blue.
- **TWO GROUND SHADOWS COVERED THE SAME GROUND, AND ONLY ONE OF THEM PAYS FOR
  ITSELF** (F-074, doc 16). The coarse-map march this project shipped first
  could only ever shadow *generated terrain* -- a map cell is 32 m, so a block
  could never shadow its own neighbour -- which is exactly what the cascades
  already draw, at centimetres rather than metres, out to the cascades' own
  reach. The march ran every frame on every lit pixel regardless, the more
  expensive of the two per pixel for the coarser of the two results. Removed:
  `SunShadow.ts`, the map walk inside `SHADOW_WGSL.ts`, and the **Marching
  shadows**, **Marching reach** and **How dark** knobs that shared one number
  across both techniques. The cascades now take a fixed full-strength shadow
  whenever **Shadow maps** is on.
- **EXPOSURE READ THE SCENE IT WAS ABOUT TO EXPOSE, AND THE ROLL-OFF READ
  NOTHING** (`TonePass.ts`, `TONE_SHADER.ts`, doc 16). The knee-rolloff curve
  clipped nothing but had no headroom past its knee worth trusting, and the
  exposure that fed it was derived from the sun's share of the light times how
  high it stood, raised to a separate **Eye adapts** figure -- three knobs
  whose combined effect none of them stated alone, and turning any one changed
  what the other two did. Replaced with **one plain multiplier** and the
  **ACES filmic curve** (the Narkowicz fit), which bends anything over white
  toward it per channel rather than clipping -- a colour pushed past white
  loses saturation as it goes, which is what keeps a sun-glint on water reading
  as a white highlight rather than a clipped saturated blue. **Sun against
  sky** is gone the same way: the ground shader now reads the fixed
  `SUN_SHARE` constant `PATCH_SHADER.ts` already used for the map-editor bench
  preview, rather than a knob that could disagree with it.

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

**The V1 line is drawn, and doc 11 now holds it.** Two states that were being
written down the same way are now separated: **open** (needs thinking) and
**deferred** (has an answer, a price, and a decision not to spend it yet).
**The milestones are numbered in [`ARCHITECTURE.md`](ARCHITECTURE.md), and that
file is authoritative for them** — docs 11, 26, 30 and 31 predate the split and
call the local milestone *V1*. **0.5.0** = TypeScript, browser with WebGPU, Vite,
local filesystem storage, a Node server on the same machine that stores and routes
and validates nothing, inventory client-side and never synced. **1.0.0** = the same
server behaviour hosted on AWS — API Gateway WebSocket → Lambda → DynamoDB, S3 for
cold chunks and the client bundle — and still **no authoritative tick loop**.
**Beyond 1.0.0** = edit validation (the point query, `0.06%` of a core at 1,000
players), server-side simulation and mobs (**158×** that), entity interest, the
move off Lambda, a native desktop client, and any move of a hot path to C/Rust+wasm.
**Unscoped and in no document at all**: only **space travel** now — the skybox,
clouds and the moon are doc 32. Doc 03's 12-bit **planet field** is still the only
part of space travel that exists, added early because it would have been expensive
later. Doc 26's triage gains a second axis from this:
*blocks code* and *in V1* are different questions, and the first build is
**smaller** than doc 26 assumed — "the server" on its step-4 list is now a file.

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
