# 08 — Terrain generation

## Where it fits

Everything before this document is addressing — ways of naming a cell. This is
the only step that **invents content**, and it happens in exactly one place: the
cache miss.

```
chunkID
  → for each cell: ID → 3D position
  → density(seed, position)        → solid or not
  → material(seed, position, ...)  → stone / dirt / grass / water
  → apply deltas from disk         ← overrides all of the above
```

**Delta application is last and it wins.** That ordering is the whole persistence
model: the generator produces a pristine world, and the delta store records every
divergence from it.

---

## The one rule that matters on a sphere

**Sample noise in 3D world space, never in `(i, j)`.**

This is where most spherical worlds go wrong. Feeding face-local coordinates into
2D noise produces visible discontinuities at all 30 face edges, because
neighbouring faces have unrelated coordinate frames — the same problem the
adjacency table in [doc 05](05-face-adjacency.md) exists to paper over.

3D noise takes a position vector, and a cell's position is a position regardless
of which face's bookkeeping found it. **Terrain generated from 3D noise has no
idea faces or pentagons exist.** All of that structure vanishes from the
generator entirely.

That is not a small convenience. It is also what makes level-of-detail possible
at all in [doc 14](14-meshing-and-lod.md), because a function of position can be
asked at any spacing, by any grid.

**Demo:** [`demos/planet-3d-noise.html`](../demos/planet-3d-noise.html) — spin it
and hunt for the twelve pentagons or the twenty face seams in the terrain. They
are geometrically present (raise resolution to 10K and the pentagons are findable
by shape) but no mountain range, coastline, or biome boundary lines up with them.

---

## Two levels of ambition

![A radial slice: a height field gives one surface per column, a density field opens caves and overhangs](figures/height-field-vs-density.svg)

*The height field asks one question per column and gets one answer. The density
field asks at every cell, and lets noise fight the radial bias — which is what
opens a void.*

### Height field

```
surfaceRadius = R * (1 + amplitude * fbm(direction * frequency))
solid         = |position| < surfaceRadius
```

One noise evaluation per column, shared by every layer beneath it. Cheap. **No
caves or overhangs, ever.**

### Density field

```
density(p) = (surfaceRadius - |p|) + noise3D(p) * strength
solid      = density > 0
```

The first term is a bias pulling toward a sphere; the noise carves into it. Caves,
overhangs, and floating islands all fall out.

Costs a 3D sample per cell, so run it only in a band near the surface and let
everything deeper be solid by default.

**Watch the balance:** as `strength` rises, the noise begins to overpower the
radial bias. Low values give pockets and tunnels; higher values give overhangs,
then detached floating chunks, then swiss cheese.

And watch it in the right units. The bias grows by 1 per metre of depth, so
**enclosed voids only appear when the noise gradient beats that** — amplitude
divided by feature size must exceed 1. Raising `strength` alone, without raising
frequency, buys a rougher surface and a much larger triangle bill while carving
nothing at all. [Doc 14](14-meshing-and-lod.md) measures both.

**Demo:** [`demos/planet-slice-noise.html`](../demos/planet-slice-noise.html) — a
cross-section through a planet with live sliders. The *Cave carving* slider is
literally the `strength` term; watching it lose the fight against the bias term
is the clearest way to feel what a density field is.

---

## Choosing the material

A second pass over cells already known to be solid, keyed on depth below the
surface:

```
depth 0                        → grass, sand, or snow
depth 1–4                      → dirt
deeper                         → stone
not solid, and |p| < seaRadius → water
otherwise                      → air
```

Surface material comes from two more low-frequency 3D fields — temperature and
humidity — sampled on the direction vector.

**Sea level is a radius, not a height.** And "up" is `normalize(position)`. Both
of these ripple far beyond terrain — see [doc 13](13-gravity-and-orientation.md).

---

## On "destroyed"

This is where the delta store earns its existence. You must distinguish
**never touched** from **touched and now air**, or a mined-out cave regenerates on
reload.

An explicit delta entry saying "air" is meaningful and different from having no
entry. The same applies to placing a block in mid-air. The generator produces the
pristine world; the delta store records every divergence, in both directions.

---

## Performance

Noise dominates chunk generation. This is the part you will optimise, not the
addressing.

- Compute the surface radius **once per column** and reuse it down the whole
  column.
- Restrict 3D density sampling to the band where it can actually change the
  answer.
- Generate per chunk in a batch so it can be vectorised.

> **[verified]** `verification/volume.js` measures what those first two are
> worth. On one chunk at depth 11, chunk level 6, with a 64-layer crust: the
> density field costs **51×** the height field over the full crust, and **26×**
> when restricted to a band around the surface. [Doc 14](14-meshing-and-lod.md)
> takes this further — distant chunks can skip the density term altogether,
> because a coarse mesh cannot represent a cave in the first place.

---

## Do you need heightmaps?

The term means two different things, and the answer differs for each.

**As stored authoring data: no.** You do not need a painted texture. The
`surfaceRadius(direction)` function *is* the heightmap, evaluated lazily. That is
the whole point of the seed-based approach, and the reason a fresh planet is
under a hundred bytes ([doc 07](07-data-structures.md)).

**As a cached intermediate: yes, and you already have it.** Compute the surface
radius once per column and reuse it for layers, meshing, water, spawn placement,
and pathfinding costs. A pure optimisation on something derived, not new data.

### Where noise genuinely runs out

Three things fBm cannot produce, because all three are **global** processes and
therefore collide head-on with local on-demand generation:

- **Rivers.** Connected networks that flow consistently downhill to the sea.
  There is no local rule that gets you this.
- **Erosion.** Real mountains have V-shaped valleys carved by water. Raw fBm
  gives fractal lumps that look subtly wrong to everyone, even people who cannot
  articulate why.
- **Coherent continents.** Noise gives blobs. Plates, shelves, and mountain
  ranges running along collision boundaries need structure noise does not have.

### The two-tier fix

Generate a **coarse global heightmap once at world creation** — at, say, level 8 —
and store it. Run erosion, river tracing, and plate assignment on that offline,
when the whole planet is visible at once. Per-chunk noise then adds local detail
on top, interpolating between coarse samples.

| Coarse level | Cells | At 4 bytes |
|---|---|---|
| 7 | 164K | 640 KB |
| 8 | 655K | 2.6 MB |
| 9 | 2.6M | 10 MB |

Two megabytes buys rivers and erosion.

**And the lookup is free**, though not quite in the way this document first said.
Truncating an ID's *path digits* gives the containing triangle — a chunk — not a
coarse cell. What lines up is the lattice: a level-8 lattice point `(i, j)` and the
level-11 point `(8i, 8j)` are the **same point**, so a coarse sample is literally
one of the fine cells. Mask the low bits off `(i, j)` to find the three that
surround a cell, and the bits you masked off are the blend weights between them.
No second spatial structure and no interpolation scheme to invent.
See [doc 21](21-rivers-and-erosion.md).

This is the **only** stored terrain the design contemplates, and it is an *input*
to the height-field term rather than a mesh.

**Recommendation:** start with pure noise, ship something, and add the coarse tier
when the terrain starts looking like fractal lumps instead of a world.
[Doc 21](21-rivers-and-erosion.md) designs that tier, and finds that the three
problems above are **ordered rather than independent** — continents decide how long
rivers can be, so that is the one to build first.

---

## In one breath

- Terrain is invented at exactly one moment: the **cache miss**. Deltas are
  applied last and win.
- **Sample in 3D world space**, never in face coordinates — otherwise all 30 face
  seams show, and level-of-detail becomes impossible.
- **Height field** = one evaluation per column, no caves. **Density field** = one
  per cell, caves and overhangs, and **51×** the cost.
- Enclosed voids need the noise gradient to beat the bias; more `strength` alone
  gives roughness, not caves.
- **There is no stored heightmap** — the function is the heightmap. The one
  exception is a coarse level-8 map for rivers and erosion, at 2.6 MB.
