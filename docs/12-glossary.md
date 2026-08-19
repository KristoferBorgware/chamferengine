# 12 — Glossary and constants

## What this is

A lookup, not a read. Every term the specification uses in a precise sense, and
every number it relies on, in one place — so that a word like "depth" or "frame"
can be checked rather than guessed at.

If you are meeting the design for the first time, this is the wrong door: start
with [`demos/how-it-works.html`](../demos/how-it-works.html) or
[doc 00](00-introduction.md).

## Terms

**Aperture** — the ratio by which cell count grows per subdivision step. This
project uses aperture 4 (triangles split into four). H3 uses aperture 7.

**Axis frame** — the stateless local frame `east = normalize(cross(N, up))`,
`north = cross(up, east)`, for a chosen pole axis `N`. Singular at two points.
Used for lat/long, maps and sun position. See [doc 13](13-gravity-and-orientation.md).

**Barycentric coordinates** — three mixing ratios summing to 1, describing a
point as a blend of a triangle's three corners. See [doc 04](04-position-lookup.md).

**Cap** — the top or bottom face of a hexagonal prism. Four triangles on a
hexagon, three on a pentagon, fanned from one of its own corners.

**Chamfer** — the polyhedron operation taking `GP(m,n)` to `GP(2m,2n)`. Iterated
chamfering of a dodecahedron generates exactly this project's subdivision
sequence, and is the source of the project's name.

**Cell** — one hexagon (or one of the twelve pentagons) at one radial layer. The
cell a cube world would call a block.

**Cell boundary** — defined as the radial projection of the lattice point's
*planar* Voronoi hexagon: a cell **is** the set of directions `hexRound` maps to
it ([doc 04](04-position-lookup.md)). Deliberately **not** "everywhere
equidistant between two centres on the sphere", which is a different curve — the
two disagree on about 1% of the sphere, always with an edge-adjacent cell and
never by more than 0.11 of a cell spacing. The projected definition is chosen
because it makes the lookup and the ray walk exact by construction.

**Chunk** — one triangle at the chunk level, spanning all layers beneath it. The
unit that is loaded, generated, meshed, and stored.

**Chunk level (`C`)** — where the ID is cut into chunk prefix and local part.
Tunable after launch; does not change addresses.

**Crust depth** — how many radial layers deep the world is. **Unrelated to
subdivision depth.**

**DDA** — Digital Differential Analyzer. The grid-walking algorithm used for ray
traversal.

**Delta store** — the sorted map of `cellID → block state` holding only what
players changed. The only structure that grows.

**Density field** — `(surfaceRadius − |p|) + noise3D(p) × strength`. Solid where
positive. Produces caves and overhangs.

**Face** — one of the 20 icosahedron faces. Always 20.

**fBm** — fractional Brownian motion. Summed octaves of noise at doubling
frequency and halving amplitude.

**Geodesic sphere** — an icosahedron subdivided `2^D` times per edge, with
vertices normalised to the sphere. The dual of a Goldberg polyhedron. The
subdivision is **one-shot**: a vertex's position is a single barycentric blend of
its face's three corners, normalised once. It is *not* built by repeatedly
splitting at arc midpoints, which is a different and incompatible point set — see
[doc 15](15-precision-and-origin.md).

**One-shot construction** — placing lattice point `(i, j)` at
`normalize(A·a + B·b + C·c)` in one step, so the lattice is uniform in the flat
face plane. Required by [doc 04](04-position-lookup.md), which inverts it by
rounding, and by [doc 09](09-ray-traversal.md), which needs cell boundaries
straight in that plane. Differs from recursive arc-midpoint subdivision by a
fixed **38.97 m** on the worked planet, regardless of depth.

**Gnomonic projection** — central projection from the sphere's centre onto a
plane. Maps great circles to straight lines, which is what makes ray traversal
exact.

**Goldberg polyhedron** — hexagons plus exactly twelve pentagons; the dual of a
geodesic sphere. The chosen tiling.

**Grid frame** — a direction expressed as an index into a cell's neighbour ring,
ordered counter-clockwise as seen from outside. Discrete, stateless, defined
everywhere. The frame directional blocks and rails must use.

**Hairy ball theorem** — every continuous tangent vector field on a sphere
vanishes somewhere. Why no global "north" exists. The same 720° as Gauss–Bonnet,
since 4π steradians is χ · 2π.

**Holonomy** — the rotation a parallel-transported heading picks up around a
closed loop, equal to the solid angle the loop encloses. Not an error.

**`(i, j)`** — lattice coordinates across a whole face.

**Layer** — radial index, counted downward from the crust top.

**Path digits** — quaternary digits selecting a child triangle at each level.
Together with the face, these form the chunk ID.

**`(q, r)`** — lattice coordinates within a chunk. The leftover after path digits
are stripped from `(i, j)`.

**Seam ownership** — the rule that at a boundary with a coarser neighbour, the
**finer** chunk emits a face wherever its own solidity differs from the coarse
neighbour's, in both directions, and the coarser chunk emits nothing. The only
thing that closes a cave mouth at a LOD boundary; a skirt does not. Costs 2.7
faces and one height-field evaluation per rim column. See
[doc 14](14-meshing-and-lod.md).

**Skirt** — a vertical apron hanging from a chunk's boundary cells, one coarse
cell deep, that hides the **surface step** where two LOD levels meet. Two
triangles per boundary cell, and indifferent to which level the neighbour chose.
Closes the surface slit and essentially nothing else — it hangs downward, so it
cannot cover a cave mouth, which is a horizontal hole. Correctness at a seam is
seam ownership; the skirt is insurance for the frames in between.

**Subdivision depth (`D`)** — how many times triangles are split. Sets horizontal
grid fineness. **Unrelated to crust depth.**

**Swing rotation** — the minimal, twist-free rotation carrying one unit vector to
another. How a carried orientation is updated as the player walks and `up`
changes. Also called parallel transport.

**Transported frame** — orientation held as a quaternion and updated by swing
rotation rather than recomputed. No singularity anywhere, but path-dependent.
Camera and controller state only; never a stored coordinate.

---

## Constants

| Symbol | Value | Meaning |
|---|---|---|
| Faces | 20 | icosahedron faces, fixed |
| Pentagons | 12 | required by Gauss–Bonnet, at every level |
| Total angular defect | 720° | fixed for any sphere-topology surface |
| `N(L)` | `10 · 4^L + 2` | surface cells at level `L` |
| `K` | `sqrt(8π / (10√3))` = 1.20459 | `blockSize ≈ K · radius / 2^L` |
| Hexagon area | `(√3/2)·d²` ≈ 0.866 d² | `d` = centre-to-centre spacing |
| Hexagon vs square footprint | 0.87× | same nominal width |
| Hexagon corner-to-corner | 1.15× | vs flat-to-flat |
| Cell area variation | ≈ 1.99 : 1 | hexagons; `sec³(37.3774°)` |
| Cell area variation, with pentagons | ≈ 2.74 : 1 | across the sphere |
| Cell spacing variation | ≈ 1.41 : 1 | hexagons; `sec^1.5(37.3774°)` |
| Largest edge ÷ nominal spacing | 1.098 | the admissible A* divisor |
| Address width | `5 + 2D + 2` bits | 29 at `D` 11; the last 2 name a corner |
| Stored word | `[planet 12][face 5][path 2×D][corner 2][layer 11]` | 52 of 64 at `D` 11 |
| Code space used | ≈ 7.81% | `0.625 × 0.75 × 1/6`; was 31.25% under the `q,r` draft |
| Max levels in 64 bits | 17 | `12 + 5 + 2D + 2 + 10 ≤ 64` — the real ceiling |
| Adjacency table | 60 entries, 180 bytes | 20 × 3 × 3 bytes |
| Flipped-frame cells | ≈ 46% | descended through a middle child |
| Border cells needing ownership rule | ~6% at D3/C0 | demo-measured, extreme case; falls as chunks grow |
| Pentagon direction deficit | 1 index = 60° | never shrinks with depth |
| Pentagon deflection | 36.07° | a straight line cannot pass through one |
| Pentagon antipodal pairs | 6 | so poles can be placed on two of them |
| Holonomy of a closed walk | enclosed area / R² | rotation of a carried heading |
| Mesh cost, unmerged | 2 verts, 4 tris per cell | exactly 2× a cube surface |
| Flat-patch sag | `s² / 8R` | why merging is bounded |
| Max merge span, 0.1 m sag | 37 m | on a 1,700 m planet |

## Orientation reference — 1,700 m planet

| Quantity | Value |
|---|---|
| Horizon, 1.7 m eye | 76 m (Earth: 4.7 km) |
| Horizon, 50 m eye | 407 m |
| Tilt between builds 100 m apart | 3.37° |
| `up` variation across a chunk, D 11 / C 6 | 1.08° |
| Gravity at a 64-block crust floor | 96.2% of surface |

## Defect distribution by tiling

| Tiling | Points | Worst | Total |
|---|---|---|---|
| Cube sphere | 8 | 90° | 720° |
| Rhombic triacontahedron | 20 + 12 | 42.8° | 720° |
| Goldberg | 12 pentagons | shrinks with level | 720° |

## S2 projection area ratios

| Projection | Ratio |
|---|---|
| Linear | 5.20 |
| Quadratic (S2 default) | 2.08 |
| Tangent | 1.41 |

## Sizing reference — 10 km planet

| Level | Cells | Block size |
|---|---|---|
| 10 | 10.5M | 11.8 m |
| 12 | 168M | 2.9 m |
| 13 | 671M | 1.5 m |
| 14 | 2.7B | 74 cm |

## Coarse heightmap storage

| Level | Cells | At 4 bytes |
|---|---|---|
| 7 | 164K | 640 KB |
| 8 | 655K | 2.6 MB |
| 9 | 2.6M | 10 MB |
