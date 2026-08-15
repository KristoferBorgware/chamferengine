# Chamfer

> **Why "Chamfer":** chamfering is not a loose metaphor here — it is the exact
> operation that generates this world at every level. Chamfering a Goldberg
> polyhedron `GP(m,n)` produces `GP(2m,2n)`. Start from a dodecahedron and
> chamfer repeatedly:
>
> ```
> dodecahedron   GP(1,0)     12 cells
> chamfer     →  GP(2,0)     42
> chamfer     →  GP(4,0)    162
> chamfer     →  GP(8,0)    642
> ```
>
> Those are precisely this project's cell counts, `10·4^L + 2`. The subdivision
> sequence *is* iterated chamfering.

A design specification for a **spherical voxel world**: a planet built from
hexagonal cells that wraps seamlessly, with no distorted cells at the seams
and no polar singularities.

This repository currently contains **documentation and interactive demos only**.
No engine code has been written yet. Everything here is the reasoning, the
mathematics, and the verified constants that an implementation should be built
against.

---

## The one-paragraph summary

The planet's surface is a **Goldberg polyhedron** — hexagonal cells plus exactly
twelve pentagons, which topology makes unavoidable. Cells sit on the *vertices*
of a recursively subdivided icosahedron, so the triangles underneath provide an
**exactly nesting hierarchy** for chunking, streaming, and level-of-detail, while
the hexagons provide **uniform six-neighbour adjacency** for gameplay. A single
integer addresses any cell; truncating its low bits yields its ancestor chunk.
Terrain is generated on demand from 3D noise sampled in world space, so no seam
or pentagon is ever visible in the terrain. Only player modifications are stored.

---

## Documentation

Read in order. Each document states a problem, the approach taken, and links to
a runnable demo where one exists.

| # | Document | Covers |
|---|---|---|
| 00 | [Introduction](docs/00-introduction.md) | Goals, non-goals, the core constraint |
| 01 | [Prior art](docs/01-prior-art.md) | Google S2, Uber H3, why H3 is the inspiration |
| 02 | [Choosing the geometry](docs/02-geometry-choice.md) | Why not cubes; the shape survey; Gauss–Bonnet |
| 03 | [Addressing](docs/03-addressing.md) | Cell IDs, chunk IDs, path digits, bit layout |
| 04 | [Position lookup](docs/04-position-lookup.md) | World position → cell, barycentric coordinates |
| 05 | [Face adjacency](docs/05-face-adjacency.md) | Crossing between the 20 faces; the 180-byte table |
| 06 | [World sizing](docs/06-world-sizing.md) | Block size, radius, subdivision level, crust depth |
| 07 | [Data structures](docs/07-data-structures.md) | What lives in RAM, on disk, and in code |
| 08 | [Terrain generation](docs/08-terrain-generation.md) | Noise, density fields, materials, deltas |
| 09 | [Ray traversal](docs/09-ray-traversal.md) | Block picking without physics |
| 10 | [Pathfinding](docs/10-pathfinding.md) | A* on hexes, hierarchical search |
| 11 | [Open topics](docs/11-open-topics.md) | Identified but not yet designed |
| 12 | [Glossary](docs/12-glossary.md) | Terms and constants |
| 13 | [Gravity and orientation](docs/13-gravity-and-orientation.md) | Local frames, holonomy, horizon, what pentagons cost directions |
| 14 | [Meshing and LOD](docs/14-meshing-and-lod.md) | Triangle cost, relief and caves, altitude-driven LOD, seam ownership |
| 15 | [Precision and the floating origin](docs/15-precision-and-origin.md) | Where floats run out, the anchor-and-offset rule, one-shot vs recursive |
| 16 | [Lighting](docs/16-lighting.md) | 8 neighbours, sky light down a column, the free terminator |
| 17 | [Pentagons as a place](docs/17-pentagons.md) | The gameplay decision: protected landmarks, and the loop that no option fixes |
| 18 | [The cell boundary](docs/18-cell-boundary.md) | Which curve a cell edge is, and why the mesh and the lookup now draw the same one |
| 19 | [Directional blocks](docs/19-directional-blocks.md) | Six states, placing by facing, and the circuit that does not close |
| 20 | [Player-facing coordinates](docs/20-player-coordinates.md) | Latitude, longitude and altitude, with the poles on two pentagons |
| 21 | [Rivers, erosion and continents](docs/21-rivers-and-erosion.md) | The one stored map, flow routing, and why continents come first |
| 22 | [Multiplayer interest management](docs/22-multiplayer-interest.md) | Who to tell about an edit, and why it is not an ID range |
| 23 | [Determinism across machines](docs/23-determinism.md) | Which arithmetic is pinned to the bit, and the one rule that follows |
| 24 | [Player edits and global processes](docs/24-edits-and-global-processes.md) | What happens when someone dams a river the coarse map still describes |
| 25 | [Water](docs/25-water.md) | Water as a block type, and what a translucent ocean costs to draw |
| — | [Reference](docs/REFERENCE.md) | **Generated.** Every measured number with the script that produced it |

**For agents:** [`CLAUDE.md`](CLAUDE.md) holds invariants, verified constants,
and naming conventions in a compact form intended for machine consumption.

---

## Reading it as a site

**Published at <https://kristoferborgware.github.io/chamferengine/>** — the whole
specification, every diagram, every demo and every verification script, rebuilt
and deployed by GitHub Actions on each push to `master`. The proofs are the gate:
`make-reference.js` runs all twenty-seven verification scripts and fails the build if
one stops running, so the site cannot publish unless the maths still holds.

The Markdown is written to be read on GitHub, but the same generator produces a
linked, cross-referenced HTML version — sidebar, per-page contents, prev/next,
`[verified]` claims rendered as callouts that link to the script that proves
them:

```bash
node tools/build-docs.js            # build once, into site/
node tools/build-docs.js --serve    # rebuild on save and serve with live reload
node tools/make-figures.js          # regenerate the diagrams in docs/figures/
node tools/make-reference.js        # rerun every verification script -> docs/REFERENCE.md
node tools/check-coverage.js        # report any fact an edit dropped
```

Regenerate everything after a change to the maths:

```bash
node tools/make-figures.js && node tools/make-reference.js && node tools/build-docs.js
```

`make-reference.js` is deliberately *not* part of the doc build — it executes
every verification script, which is far too slow for `--watch`. It also fails if
a script stops running, is cited by no document, or is named somewhere but
missing.

The diagrams are **generated, not drawn** — their geometry comes from the same
barycentric lattices and duals the text describes, so a figure cannot quietly
disagree with the maths. Each is a standalone theme-aware SVG, so it renders on
GitHub, in the site, and inlined into the single-file bundle.

`check-coverage.js` compares every document against its committed version and
reports each number, identifier, link and defined term that no longer appears
anywhere. It is how the rewrite was kept honest.

Zero dependencies, like everything else here. `site/` is generated and ignored
by git; the Markdown is the source of truth. The build fails loudly on a dead
link, a dead heading anchor, or any Markdown the generator does not understand.

---

## Demos

Eighteen self-contained HTML files. No build step, no dependencies to install —
open any of them directly in a browser. All are mobile-friendly.

**New to this?** Start with
[`demos/how-it-works.html`](demos/how-it-works.html) — an illustrated walkthrough
of the whole construction in ten diagrams, from twenty triangles to chunk seams.

See [`demos/README.md`](demos/README.md) for the annotated index.

---

## Verification scripts

Every non-obvious mathematical claim in the documentation was checked
numerically before being written down. Those scripts are in
[`verification/`](verification/README.md) and run under plain Node with no
dependencies:

```bash
node verification/check.js     # rhombic triacontahedron is planar and golden
node verification/s2.js        # S2 projection area ratios
node verification/lookup.js    # nearest face centroid == containing face
node verification/qr.js        # (i,j) <-> path + (q,r) round-trips exactly
node verification/adj.js       # face adjacency table is complete and consistent
node verification/order.js     # no continuous curve through 4-way triangle children
node verification/calc.js      # sizing formula matches exact cell-area maths
node verification/scale.js     # cell counts and spacings per level
node verification/frame.js     # holonomy == enclosed area; the 720° in two forms
node verification/mesh.js      # 2 verts / 4 tris per cell; sag, seams, LOD budget
node verification/volume.js    # relief, caves, and what noise generation costs
node verification/seam.js      # a skirt does not close a cave mouth; what does
```

Claims in the documentation marked **[verified]** have a corresponding script.

---

## Status

| Area | State |
|---|---|
| Geometry and tiling | Decided, verified |
| Addressing scheme | Decided, verified |
| Position lookup | Decided, verified |
| World sizing | Decided, tooling exists |
| Data structures | Specified, not implemented |
| Terrain generation | Approach chosen, prototype only |
| Ray traversal | Approach chosen, 2D prototype only |
| Pathfinding | Approach chosen, 2D prototype only |
| Gravity and orientation | Decided, verified |
| Meshing and LOD | Decided, verified |
| Lighting, precision | **Not yet designed** — see doc 11 |

## Licence

Not yet chosen. Pick one before the first public commit.
