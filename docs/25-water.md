# 25 — Water

## What water is

A block type. Translucent, with no collision, written by the generator at world
creation and never simulated.

That is the whole model, and it is worth stating first because every instinct
about water in a game pulls the other way. There is no flow, no pressure, no
spreading, no level-seeking. **This is a construction toy, not a planetary
simulator** — the nearest thing to it is a box of hexagonal Lego, and water is one
of the pieces.

[Doc 21](21-rivers-and-erosion.md)'s erosion and flow routing still run. They run
**once**, at world creation, to decide where valleys go and where water sits.
After that they are finished and what they leave behind is blocks.
[Doc 24](24-edits-and-global-processes.md) takes that decision and says why.

So this document is not about how water behaves. It is about what a world 69%
covered in translucent blocks costs to draw — because transparency is the one
thing a renderer genuinely finds hard, and [doc 14](14-meshing-and-lod.md) has
carried it as an open question since it was written.

The answer is that it costs much less than it sounds, in three separate ways.

---

## The ocean is a skin, not a solid

A block that is completely surrounded by other blocks emits no faces. That rule
already exists for stone ([doc 14](14-meshing-and-lod.md)), and nothing about
being transparent changes it: a water cell with water on all sides is invisible
from everywhere, so it is not drawn.

![Two stacks of columns filled with water: on the left every cell outlined individually, on the right only the top surface drawn as a single line](figures/water-is-a-skin.svg)

*Left is what people picture when they hear "the ocean is made of blocks". Right is
what actually gets drawn. The interior of the sea is enclosed by more sea, so it
emits nothing at all.*

> **[verified]** `verification/water.js`, section 1. Level 7, 60 m of relief, 1 m
> blocks, sea level set for 30% land:
>
> | | |
> |---|---|
> | Columns holding water | **69.2%** |
> | Water cells in the world | 1,589,689 |
> | Faces if every prism were drawn | 12,717,512 |
> | Faces actually drawn | **113,455** |
> | Ratio | **0.89%** |

A hundred and thirteen thousand faces for every drop of water on the planet, and
they are all in one layer.

**And the side count is zero**, which is worth a sentence of its own. Generated
water never has an exposed vertical face: it is always held in by land at or above
its own level, or by more water. A wall of water standing in open air exists only
where **a player built one** — an aquarium, or a trench dug beside a lake.

---

## The sea is the flattest surface in the world

Sea level is a **radius**, not a height ([doc 08](08-terrain-generation.md)). So
the ocean surface is not approximately flat — it is exactly a sphere, and it is
the only surface on the planet that is.

That matters because [doc 14](14-meshing-and-lod.md) bounds flat-patch merging by
curvature rather than by the algorithm: a merged patch sags `s²/8R` away from the
surface, so at 0.1 m of tolerable sag a patch may span **37 m**.

> **[verified]** `verification/water.js`, section 2. On the worked planet that is
> **37 cells across, merged into one quad.**

Terrain never gets close to that, because terrain has relief and merging stops at
the first bump. The ocean has none anywhere. **The largest single surface in the
world is also the cheapest one to draw**, which is a pleasant inversion of what
you would expect from covering two thirds of a planet in water.

---

## You almost never look through more than one

This is the question that decides whether transparency is a problem. Translucent
surfaces cannot be drawn in an arbitrary order — they have to go back to front —
and the cost of sorting is driven by how many of them overlap in one view.

Water fills a column from the floor upward. So a sight line entering water leaves
it through the bottom, into rock. There is nothing behind it to sort against.

![A curved horizon with a water-filled basin and an eye above the shore, its sight line crossing the water surface once and stopping at the bottom](figures/one-surface-deep.svg)

*The line crosses one surface and hits the floor. To cross two, a player would
have to see one body of water past another — which needs a lake at one level and
the sea beyond it, both inside the same 76 m horizon.*

> **[verified]** `verification/water.js`, section 3. Distinct bodies of water
> within a standing player's 76 m horizon ([doc 13](13-gravity-and-orientation.md)),
> over 3,000 viewpoints, on a world with lakes above sea level as
> [doc 21](21-rivers-and-erosion.md) produces them:
>
> | Bodies in view | Share of viewpoints |
> |---|---|
> | 0 | 17.1% |
> | **1** | **82.3%** |
> | 2 | 0.6% |
> | 3 | 0.0% |
>
> 58 separate bodies of water on the planet. Worst case seen in one view: **3**.

**So the sort is of one thing, almost always.** Four in five viewpoints see a
single body of water; fewer than one in a hundred sees two.

That reduces [doc 14](14-meshing-and-lod.md)'s open transparency question to
something ordinary:

- **Draw all opaque geometry first**, depth buffer on, in any order.
- **Then draw water back to front.** With one surface in view that is not a sort
  at all; with two or three it is a comparison of chunk distances.
- **No per-triangle sorting is needed**, because the surfaces do not
  interpenetrate — they sit at distinct radii.

The sphere makes none of this harder. Sorting is per camera and always was, and
"back to front" is a distance comparison that never needed a global axis.

---

## What an edit costs

Nothing beyond the edit itself, which is the point of
[doc 24](24-edits-and-global-processes.md)'s decision.

> **[verified]** `verification/water.js`, section 4.
>
> | Action | Cost |
> |---|---|
> | Remove one water block | one delta, 57 bits ([doc 03](03-addressing.md)) |
> | Wall across a river | one delta per block placed, and nothing else |
> | Drain a lake by hand | one delta per block removed, no propagation |

Because water never moves, editing it costs exactly what editing stone costs.
**No flood fill, no re-route, no cascade, and no second system to keep
consistent** — and no risk that a player's edit triggers work proportional to
anything but the edit.

The one place it shows is meshing: removing a water block exposes the faces around
it, so the chunk is remeshed. That is the same remesh mining a stone block already
triggers ([doc 14](14-meshing-and-lod.md)), at the same cost.

---

## What this forces elsewhere

- **[Doc 08](08-terrain-generation.md)**'s material pass gains water as a block
  type: below the water surface and above the ground, place water. It is already
  written that way — "not solid, and `|p| < seaRadius` → water".
- **[Doc 14](14-meshing-and-lod.md)**'s open "water and transparency" question is
  closed: two draw passes, and a sort of one thing.
- **The mesher needs two vertex streams per chunk** — opaque and translucent —
  which is standard and costs one extra buffer.
- **Physics gains one rule**: water blocks do not collide. Whether a player
  swims, sinks or walks along the bottom is a movement question, not a
  terrain one.
- **[Doc 16](16-lighting.md)** is unaffected in structure, but water should
  attenuate sky light with depth if it is to look like water at all — which is a
  per-block multiplier in the existing downward pass, not a new mechanism.

---

## Still open

- **How light behaves in water.** Doc 16's sky pass runs down a column; making
  water dim it is one multiplier, but nothing measures what that costs or how it
  interacts with the depth-per-column storage trick.
- **What a player sees from underwater.** Looking up through the surface crosses
  one water face from the other side. Nothing here measures whether the same
  one-surface result holds looking outward rather than inward.
- **Whether water is placeable.** Removing a water block is obviously allowed.
  Whether a bucket exists — and so whether players can build their own lakes and
  aquariums, which is the only way an exposed vertical water face is ever created
  — is a game design question ([doc 24](24-edits-and-global-processes.md) leaves
  it open too).
- **Shorelines at a LOD seam.** A coarse chunk and a fine one both put the sea at
  the same radius, so the surfaces agree exactly — but where the *shore* falls
  depends on the terrain height, which is resampled. Doc 14's seam ownership
  should cover it; nothing has checked.
- **Rivers narrower than a cell.** [Doc 21](21-rivers-and-erosion.md) carves
  channels about one coarse cell wide. A stream narrower than a block cannot be
  represented as blocks at all, so small watercourses either widen to one cell or
  do not exist.

---

## In one breath

- Water is **a block type** — translucent, no collision, generated once, never
  simulated. There is no fluid system in this design.
- **The ocean is a skin.** Interior faces cull like any other material: 1,589,689
  water cells draw **113,455 faces — 0.89%** of the naive count.
- **Generated water has no exposed sides at all.** A vertical face of water only
  exists where a player built one.
- **The sea surface is the only exactly flat surface on the planet**, because sea
  level is a radius — so it merges to doc 14's full curvature limit, **37 cells
  into one quad**.
- **You look through one surface, almost always**: **82.3%** of viewpoints see one
  body of water and 0.6% see two. Transparency sorting is a sort of one thing.
- Editing water costs **exactly what editing stone costs**, because nothing
  propagates.
