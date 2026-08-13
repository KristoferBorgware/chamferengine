# 12 — Glossary and constants

## Terms

**Aperture** — the ratio by which cell count grows per subdivision step. This
project uses aperture 4 (triangles split into four). H3 uses aperture 7.

**Barycentric coordinates** — three mixing ratios summing to 1, describing a
point as a blend of a triangle's three corners. See [doc 04](04-position-lookup.md).

**Chamfer** — the polyhedron operation taking `GP(m,n)` to `GP(2m,2n)`. Iterated
chamfering of a dodecahedron generates exactly this project's subdivision
sequence, and is the source of the project's name.

**Cell** — one hexagon (or one of the twelve pentagons) at one radial layer. The
equivalent of a Minecraft block.

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

**Geodesic sphere** — a recursively subdivided icosahedron with vertices
normalised to the sphere. The dual of a Goldberg polyhedron.

**Gnomonic projection** — central projection from the sphere's centre onto a
plane. Maps great circles to straight lines, which is what makes ray traversal
exact.

**Goldberg polyhedron** — hexagons plus exactly twelve pentagons; the dual of a
geodesic sphere. The chosen tiling.

**`(i, j)`** — lattice coordinates across a whole face.

**Layer** — radial index, counted downward from the crust top.

**Path digits** — quaternary digits selecting a child triangle at each level.
Together with the face, these form the chunk ID.

**`(q, r)`** — lattice coordinates within a chunk. The leftover after path digits
are stripped from `(i, j)`.

**Subdivision depth (`D`)** — how many times triangles are split. Sets horizontal
grid fineness. **Unrelated to crust depth.**

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
| Cell area variation | ≈ 1.3 : 1 | across the sphere |
| ID width | `5 + 2D` bits | independent of chunk level |
| Code space used | ≈ 31.25% | `20/32 × 1/2` |
| Max levels in 64 bits | 29 | `(64 − 5) / 2` |
| Adjacency table | 60 entries, 180 bytes | 20 × 3 × 3 bytes |
| Flipped-frame cells | ≈ 46% | descended through a middle child |
| Border cells needing ownership rule | ~6% at D3/C0 | falls as chunks grow |

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
