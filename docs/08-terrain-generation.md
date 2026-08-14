# 08 — Terrain generation

## Where it fits

Noise slots into exactly one place: **the cache miss.** Everything else in this
design is addressing; this is the only step that invents content.

```
chunkID
  → for each cell: ID → 3D position
  → density(seed, position)        → solid or not
  → material(seed, position, ...)  → stone / dirt / grass / water
  → apply deltas from disk         ← overrides all of the above
```

**Delta application is last and it wins.** That ordering is the whole persistence
model.

---

## The one rule that matters on a sphere

**Sample noise in 3D world space, never in `(i, j)`.**

This is where most spherical worlds go wrong. Feeding face-local coordinates into
2D noise produces visible discontinuities at all 30 face edges, because
neighbouring faces have unrelated coordinate frames — the same problem the
adjacency table exists to paper over.

3D noise takes a position vector, and a cell's position is a position regardless
of which face's bookkeeping found it. **Terrain generated from 3D noise has no
idea faces or pentagons exist.** All of that structure vanishes from the
generator entirely.

**Demo:** [`demos/planet-3d-noise.html`](../demos/planet-3d-noise.html) — spin it
and hunt for the twelve pentagons or the twenty face seams in the terrain. They
are geometrically present (raise resolution to 10K and the pentagons are findable
by shape) but no mountain range, coastline, or biome boundary lines up with them.

---

## Two levels of ambition

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
of these ripple far beyond terrain — see [doc 11](11-open-topics.md).

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

The term means two different things.

**As stored authoring data: no.** You do not need a painted texture. The
`surfaceRadius(direction)` function *is* the heightmap, evaluated lazily. That is
the whole point of the seed-based approach.

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

**And the lookup is free:** the coarse map is your own cell grid truncated to
level 8, so finding a cell's coarse height is masking its ID. No second spatial
structure, no interpolation scheme to invent — the hierarchy built for streaming
does this job unchanged.

**Recommendation:** start with pure noise, ship something, and add the coarse tier
when the terrain starts looking like fractal lumps instead of a world.
