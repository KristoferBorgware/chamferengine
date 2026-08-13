# 14 — Meshing and level of detail

## The problem

Turn a chunk of hexagonal prisms into triangles, cheaply enough to stream, with
a level-of-detail scheme that keys on **altitude** rather than distance
([doc 13](13-gravity-and-orientation.md)), and without cracks where two levels
meet.

## The received wisdom is half wrong

[Doc 11](11-open-topics.md) said hex prisms have 8 faces to a cube's 6, that
greedy meshing mostly does not apply, and to expect meaningfully more vertices.
The first is true, the second needs qualifying, and the third is smaller than it
sounds.

> **[verified]** `verification/mesh.js` builds the real dual mesh at levels 1–5
> and counts. A fully exposed hex surface costs **2 vertices and 4 triangles per
> cell** — converging to exactly that, since the dual of a triangulation with `V`
> cells has `2V − 4` vertices and a fan triangulation gives `4V − 12` triangles.
> An unmerged square grid costs 1 vertex and 2 triangles per cell.

So an unmerged hex surface is **exactly 2× an unmerged cube surface**. Not a
disaster — a flat, predictable factor of two. The whole difference is about
*merging*, and even there the loss is narrower than expected.

---

## Three kinds of face, three different answers

**Caps** — the top and bottom of a prism. A hexagon fans into 4 triangles from
one of its own corners; a pentagon into 3. Do not add a centre vertex: it buys
nothing on a near-regular cell and costs a vertex per cell. Corners are shared
by three cells, which is where the 2-vertices-per-cell figure comes from.

**Side faces, vertically** — merge perfectly.

> **[verified]** `verification/mesh.js` — the side face of a prism lies in the
> radial plane through the shared edge, and stacked cells share that plane. Over
> three layers the four corners deviate from a single plane by **1.5e-16**
> radii. A run of exposed side faces down a column collapses to one quad,
> exactly, at no geometric cost.

**Side faces, horizontally** — do not merge. In a hex lattice the faces of
neighbouring cells pointing the same way are parallel but offset; they zigzag
rather than lining up, so there is no run to collapse.

That is the honest summary of what transfers: **run-length merging along the
radial axis is free and exact; the rectangle-growing part of greedy meshing has
no hex equivalent.** Which is the same shape as everything else in this design —
the radial axis is easy, the horizontal one is not ([doc 13](13-gravity-and-orientation.md)).

---

## Merging caps is limited by curvature, not by the algorithm

You *can* merge coplanar same-material cells: take the union of a patch and
triangulate its boundary polygon. Nothing about hexagons forbids it. What
forbids it is the sphere.

Merging drops the interior vertices that were following the surface, so a flat
patch sags away from it by `s² / 8R`.

> **[verified]** `verification/mesh.js`, R = 1,700 m, 1 m blocks.

| Patch span | Sag | Cells across |
|---|---|---|
| 8 m | 0.005 m | 8 |
| 16 m | 0.019 m | 16 |
| 32 m | 0.075 m | 32 |
| 37 m | 0.101 m | 37 |
| 64 m | 0.301 m | 64 |
| 128 m | 1.205 m | 128 |

Allow a tenth of a block of sag and a patch may span **37 m**; allow a quarter
and it may span 58 m. A chunk at `C = 6` spans 32 cells — which lands just
inside the tighter budget, by coincidence rather than design.

**Rule: never merge across a chunk boundary.** Not for the usual bookkeeping
reasons, but because the chunk is already about the largest flat patch the
curvature permits.

---

## You probably should not merge at all in the near field

This is the part that changes the plan.

> **[verified]** `verification/mesh.js`, R = 1,700 m at full depth D = 11.

| Altitude | Horizon | Visible cells | Cap triangles |
|---|---|---|---|
| 1.7 m | 76 m | 20,951 | 0.08 M |
| 10 m | 184 m | 122,640 | 0.49 M |
| 50 m | 407 m | 599,186 | 2.40 M |
| 200 m | 787 m | 2,207,529 | 8.83 M |
| 1,700 m | 1.8 km | 10,485,761 | 41.9 M |

A standing player can see about **21,000 cells — 84,000 triangles**, at full
resolution, unmerged, with no cleverness whatsoever. That is a rounding error on
any GPU made this century.

**The 76 m horizon is the greedy mesher.** It has already thrown away
everything a merge pass would have, and it did it for free, before the mesher
ran. Build the naive version, ship it, and spend the effort on altitude instead —
which is where the numbers actually go bad.

---

## Level of detail

Key on altitude, as [doc 13](13-gravity-and-orientation.md) establishes. Within a
2 M-triangle budget:

| Altitude | Finest level that fits |
|---|---|
| 1.7 m | 11 — full detail |
| 10 m | 11 — full detail |
| 50 m | 10 |
| 200 m | 9 |
| 850 m | 9 |
| 1,700 m | 8 |

Roughly **one level per doubling of altitude** above 50 m, and full detail below
it. A view-distance slider is the wrong control; the right one is a function of
`|position| − surfaceRadius`.

### LOD is resampling, not decimation

Goldberg levels do not nest into each other at all — [doc 01](01-prior-art.md)
states this as the trade the design accepts. So a coarse mesh is **not** a subset
of the fine one, and you cannot drop every other cell.

Instead, evaluate the same terrain function on the coarser grid. This works
because terrain is a pure function of world position ([doc 08](08-terrain-generation.md)),
so any grid can sample it and no grid is privileged. The rule that keeps seams
out of terrain is the same rule that makes LOD possible at all — it earns its
keep twice.

---

## Cracks, and which cause actually matters

Two things could open a seam where levels meet. Only one of them does.

**The base sphere: almost nothing.**

> **[verified]** `verification/mesh.js` compares hexagon corners at level 3
> against level 4. Every coarse corner lands within **0.72% mean, 0.97% max** of
> a fine corner, as a fraction of coarse cell spacing. They are near-coincident
> because the middle child of a triangle split shares its parent's centroid —
> exactly so only when the triangle is equilateral, and subdivided triangles are
> not quite.

**Terrain sampled at two spacings: everything.**

> **[verified]** Same script, 60 m of relief on the doc-06 planet. The height
> difference between a level and the one above it:
>
> | Level | Spacing | Mean Δh | Max Δh | Covered by a one-cell skirt? |
> |---|---|---|---|---|
> | 11 | 1 m | 0.26 m | 1.52 m | yes |
> | 10 | 2 m | 0.53 m | 3.20 m | yes |
> | 9 | 4 m | 1.04 m | 6.76 m | yes |
> | 8 | 8 m | 2.00 m | 12.84 m | yes |
> | 7 | 16 m | 3.60 m | 19.89 m | yes |

**Fix: skirts, one coarse cell deep.** A vertical apron hanging from the chunk's
boundary cells, 2 triangles each. Verified to cover the worst case at every
level tested.

Skirts beat stitching here for a specific reason: with LOD driven by altitude
rather than distance, **neighbouring chunks can differ by more than one level**,
and a stitching scheme has to enumerate the cases. A skirt does not care what the
neighbour chose. It is also the only option that survives a chunk being remeshed
after an edit while its neighbour is not.

---

## Pentagons

A pentagon cap is 3 triangles rather than 4, and a pentagon column has 5 side
faces rather than 6. That is the entire impact.

Meshing is the one system in this design where the twelve pentagons cost nothing
beyond a loop bound — no special case, no deflection, no lost direction. Compare
[doc 13](13-gravity-and-orientation.md), where they cost a permanent 60°.

---

## The chunk-local frame

Mesh in chunk-local space with the chunk's centre as the origin. Two reasons,
both already on the table:

- `up` varies about **1.08°** across a `C = 6` chunk ([doc 13](13-gravity-and-orientation.md)),
  so a single chunk normal is wrong for lighting but fine for culling. Compute
  normals per cell — one `normalize`, and never wrong.
- It is the same rebasing that floating origin needs ([doc 11](11-open-topics.md)).
  One transform, applied once, in one place.

---

## What to build, in order

1. **Naive mesher.** 4 triangles per cap, run-length merged side faces, no cap
   merging at all. The horizon table says this is enough to ship.
2. **Skirts** at chunk boundaries, one coarse cell deep.
3. **Altitude-driven LOD** by resampling the terrain function at a coarser level.
4. **Cap merging**, only for high-altitude shells, bounded to a 37 m patch.

Steps 1 and 2 are a working planet. Steps 3 and 4 are for flight.

---

## Still open

- **Texture coordinates.** Hexagons are near-regular but **not congruent** —
  area varies about 1.3:1 ([doc 02](02-geometry-choice.md)) — so a tiled texture
  cannot be identical per cell. Either accept slight per-cell distortion, or use
  triplanar projection in world space and let the addressing scheme stay out of
  it, which is the same answer terrain generation reached.
- **Ambient occlusion** with 8 neighbours rather than 6, and what a corner even
  means when three hexagons meet.
- **Water and transparency**, which need sorting and therefore an ordering rule
  on a surface with no global direction.
- **Remesh or store.** Whether a chunk's mesh is rebuilt on edit or cached, and
  what that costs when a player mines one cell.

---

**Demo:** [`demos/mesh-lod.html`](../demos/mesh-lod.html) — the tiling at five
resolutions, reporting its own vertex and triangle counts so you can watch them
converge on 2 and 4 per cell. The altitude slider draws the true horizon ring and
colours the cells inside it: at eye height that is **one hexagon on the whole
planet**, 0.05% of the surface, and the readout gives the real figures for a
level-11 world.
