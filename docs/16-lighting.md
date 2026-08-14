# 16 — Lighting

## The problem

Minecraft-style lighting is a flood fill: every cell holds a light level, light
spreads to neighbours losing one level per step, and solid cells block it. There
are two independent channels — **sky light** from above and **block light** from
torches — and they are stored per cell and recomputed when a block changes.

[Doc 11](11-open-topics.md) listed three things that make this different on a
sphere: cells have **8 neighbours** rather than 6, sky light arrives along the
**radial** direction rather than straight down, and a sun direction dotted
against cell normals gives **a real terminator for free**.

All three turn out to be true, and the document's shape is unusual for this
project: **this is the system where the sphere costs least.** Two of the three
are free, one costs a flat 1.5×, and the twelve pentagons — expensive everywhere
else — cost nothing whatsoever.

---

## Why the sphere is nearly free here

Every other document has had to work around something the sphere does to
*direction*. [Doc 13](13-gravity-and-orientation.md) found that a heading carried
around a loop comes back rotated, and that a pentagon costs one direction index
forever. [Doc 05](05-face-adjacency.md) exists entirely to re-express directions
when you cross a face.

**Light is a scalar.** It has a level and nothing else — no heading, no frame, no
orientation to transport. So holonomy does not apply to it, the direction-index
deficit does not apply to it, and face crossings are handled by `neighbour()`
exactly as they are for everything else.

That leaves only one thing that changes: **the number of neighbours.**

> **[verified]** `verification/light.js`, level 4. 2,550 cells have six lateral
> neighbours and 12 have five, plus up and down always — the radial axis never
> branches. So a cell has **8 neighbours**, and exactly **12 cells in the entire
> world** have 7, at any subdivision depth.

---

## What the extra neighbours cost

A hexagonal disc holds more cells than a square one of the same radius, so a
torch reaches further into more world.

> **[verified]** `verification/light.js`, light level 15 dropping 1 per step, in
> open air.
>
> | Grid | Cells reached |
> |---|---|
> | Hex prism, 6 lateral + 2 vertical | **7,471** |
> | Cube, 6 neighbours | 4,991 |
> | Ratio | **1.497×** |
>
> A hex disc of radius `r` holds `3r² + 3r + 1` cells against `2r² + 2r + 1` on
> squares, so the ratio tends to **1.5** as the light range grows. Confirmed by
> breadth-first search on the real level-7 grid, starting at least 19 cells from
> any pentagon: **721 cells** within 15 steps, against a closed form of exactly
> 721.

So lighting costs a flat **1.5×** a cube world. That is the same *kind* of answer
[doc 14](14-meshing-and-lod.md) found for meshing — a small constant factor, not
a blow-up — and it is the entire price.

**The cheapest lever is the light range, because cost grows as its cube.**

> **[verified]** Same script.
>
> | Light range | Cells possibly touched | vs a cube world |
> |---|---|---|
> | 4 | 189 | 1.465× |
> | 8 | 1,241 | 1.490× |
> | 15 | 7,471 | 1.497× |
>
> Dropping the range from 15 to 8 costs **83% less** work per light.

---

## The pentagons cost nothing, and the reason is worth following

This is the one place in the specification where the twelve pentagons are free,
and the measurement looks alarming until you read it correctly.

> **[verified]** `verification/light.js`, level 7, range 15.
>
> | Torch stands on | Cells lit | Closed form |
> |---|---|---|
> | a hexagon | **721** | `1 + 3r(r+1)` |
> | a pentagon | **601** | `1 + 5r(r+1)/2` |
>
> Identical at all twelve pentagons. The ratio is 0.8336 at range 15, tending to
> **5/6** as the range grows.

A torch on a pentagon lights **17% fewer cells**. The obvious reading is that
pentagons are dimmer and need a special case. That reading is wrong.

A ring at radius `k` around a hexagon holds `6k` cells; around a pentagon it
holds `5k`. **There is simply one sixth less world within reach.** Every cell
that exists gets exactly the light level it should. Nothing is dimmer, nothing is
missing, and no code needs to know.

![Two light discs: rings of 6k cells around a hexagon and 5k around a pentagon, covering five sixths of the area](figures/light-discs.svg)

*Same light, same radius, same rule. The pentagon's disc is smaller because the
sphere has less room there — which is the 720° again, showing up as area instead
of as a lost direction.*

This is Gauss–Bonnet for the fourth time in the specification, and it is
instructive to line the appearances up:

| Where | What the 60° costs | Shrinks with depth? |
|---|---|---|
| [Doc 02](02-geometry-choice.md) | twelve pentagons must exist | no |
| [Doc 13](13-gravity-and-orientation.md), geometry | a visible corner | yes, ~4× per level |
| [Doc 13](13-gravity-and-orientation.md), machinery | **one direction index, forever** | **no** |
| **This document** | **⅙ less area within reach — nothing** | **not applicable** |

The same 60° that permanently breaks a conveyor line is, for lighting, not a
defect at all. **The difference is entirely that light carries no direction.**

---

## Sky light is still one downward pass

The worry in [doc 11](11-open-topics.md) was that "sky light arrives along the
radial direction, not straight down" makes the sky pass harder. It does not, and
the reason is an invariant that keeps paying out.

The tessellation is **identical at every layer** — same face, same path, same
`(q, r)`, evaluated at a smaller radius ([doc 03](03-addressing.md), invariant
10). So a column of cells running toward the core is a **straight line of cells
sharing one address**, differing only in the layer index.

Sky light travels down that column. One downward pass, no face crossings, no
pentagon cases, no curvature — **exactly as cheap as it is in a flat world.**
"Radial rather than straight down" turns out to be a distinction without a
difference, because the grid was built radially in the first place.

Compare [doc 13](13-gravity-and-orientation.md), which found the same thing about
gravity, and [doc 14](14-meshing-and-lod.md), which found it about vertical face
merging. The radial axis is easy; it is always the horizontal one that costs.

---

## Storage is the real cost, and it is bigger than the blocks

Nobody flags this in advance, and it is the largest number in the document.

> **[verified]** `verification/light.js`, one chunk at `D = 11`, `C = 6`, 64
> layers — 561 columns, 35,904 voxels, matching `volume.js`.
>
> | Data | Per chunk |
> |---|---|
> | Light, 1 byte per cell (4 bits sky + 4 bits block) | **35 KB** |
> | Block data, 2-bit palette ([doc 07](07-data-structures.md)) | 9 KB |
>
> **Light costs 4× the blocks it lights.**

The palette trick that makes block storage cheap does not apply to light, because
light levels are genuinely varied — that is the whole point of them.

But half of it can be reclaimed, and the same invariant does it again:

> **[verified]** Sky light down a column is **monotone** — full strength until
> the first solid cell, then attenuating. So store the depth it reaches, one byte
> per column, instead of a value per cell.
>
> | Sky light stored as | Per chunk |
> |---|---|
> | a value per cell | 18 KB |
> | a depth per column | **0.5 KB** |
>
> **32× smaller**, and it needs columns to be straight — invariant 10, again.

**Recommendation:** store block light per cell and sky light per column. That
takes the chunk's light budget from 35 KB to about 18 KB, which is roughly twice
the block data rather than four times it.

---

## The terminator is free

This is the part worth designing toward rather than around.

```
lit = dot(sunDirection, up) > 0        where up = normalize(position)
```

`up` is already computed per cell for gravity ([doc 13](13-gravity-and-orientation.md)).
So a **real terminator** — a day/night line sweeping across a globe, with dawn
arriving somewhere while dusk falls elsewhere — costs **one dot product per cell
and no shadow map at all**.

![A planet circle with a sun direction, the lit hemisphere, and up vectors at three cells showing the dot product changing sign at the terminator](figures/terminator.svg)

*The lit set is just the hemisphere facing the sun. On a flat world day and
night are a global clock value; here they are a place.*

A flat world cannot have this. Minecraft's day/night is a single global number,
because there is nowhere for a terminator to be. Here it falls out of the
geometry at no cost, and it is the most visible thing the sphere gives back.

### Day length is a gameplay dial, and it has a natural anchor

The terminator sweeps at `circumference / dayLength`.

> **[verified]** `verification/light.js`, R = 1,700 m, circumference 10,681 m,
> walking speed 1.4 m/s.
>
> | Day length | Terminator speed | Against a walking player |
> |---|---|---|
> | 10 min | 17.80 m/s | 12.7× faster — dawn overtakes you |
> | 20 min | 8.90 m/s | 6.4× faster |
> | 1 hour | 2.97 m/s | 2.1× faster |
> | **2.12 h** | **1.40 m/s** | **exactly walking pace** |
> | 6 hours | 0.49 m/s | 2.8× slower — you can outrun it |
> | 24 hours | 0.12 m/s | 11.3× slower |

That 2.12 hours is [doc 06](06-world-sizing.md)'s circumnavigation time, and the
coincidence is not one — both are circumference divided by walking speed. Which
gives the design rule:

> **Choose the day length in units of "how long it takes to walk around".**
> Shorter than that and the sun always wins. Longer and a player can chase the
> sunset, or flee the dawn, for as long as they can keep walking.

That is a real gameplay decision with a real number attached, and it is only
askable because the world is small enough to walk around.

### Twilight does not depend on planet size

> **[verified]** Taking twilight as 12° of sun elevation: a band **356 m** wide
> on the doc-06 planet, which is **3.3%** of the circumference — and lasting 40 s
> with a 20-minute day, 4.2 min with a 2.12-hour day, 48 min with a 24-hour day.

**Twilight duration is a fixed fraction of the day and does not depend on the
planet's radius at all**, because it is an angle rather than a distance. A tiny
planet does not get shorter sunsets; it gets sunsets that sweep past faster in
metres while lasting exactly as long in minutes.

---

## Shadows run off the edge of the world

The terminator gives day and night. It does not give a mountain casting a shadow,
which needs real occlusion — and here the small planet bounds the problem the way
it bounded the render budget in [doc 14](14-meshing-and-lod.md).

> **[verified]** `verification/light.js`. Shadow length is `h / tan(elevation)`,
> against the **76 m** ground horizon from [doc 13](13-gravity-and-orientation.md).
>
> | Sun elevation | Shadow of a 10 m tower | Past the horizon? |
> |---|---|---|
> | 45° | 10 m | no |
> | 20° | 27 m | no |
> | 10° | 57 m | no |
> | 5° | 114 m | **yes** |
> | 2° | 286 m | yes |
> | 1° | 573 m | yes |

Below about 6° of elevation a 10 m tower's shadow is **longer than the visible
world**. So a shadow scheme never needs to reach further than the horizon —
beyond that, curvature has already hidden both the shadow and whatever cast it.

---

## What this forces elsewhere

- **`neighbour(id, k)` gains two radial cases**, up and down, which are `layer ±
  1` and need no table.
- **Light is a scalar everywhere.** Never store a light *direction* per cell; the
  sun direction is global and `up` is per-cell, and those two are enough.
- **Block light per cell, sky light per column** ([doc 07](07-data-structures.md)
  gains a per-column array alongside the palette).
- **A chunk's light depends on its neighbours**, so the same "who owns the seam"
  question [doc 14](14-meshing-and-lod.md) answered for geometry has to be
  answered again for light — see below.
- **The terminator wants `up` per cell, not per chunk.** Doc 13 measured `up`
  varying **1.08°** across a `C = 6` chunk; at the terminator that is a visible
  band of cells lit wrongly, so use the per-cell value there even if coarse LOD
  shells use the chunk value.

---

## Still open

- **Light across a LOD seam.** A coarse chunk's cells do not correspond to a fine
  chunk's, so light levels cannot simply be copied across the boundary. Doc 14
  solved the geometry version by making the finer chunk own the seam; whether the
  same rule works for a flood fill is unexamined, and a flood fill propagates
  *inward* from the boundary rather than just being drawn at it.
- **Ambient occlusion with 8 neighbours**, carried over from
  [doc 14](14-meshing-and-lod.md), including what a corner means where three
  hexagons meet rather than four squares.
- **Whether sky light should know the sun's angle.** Minecraft's sky light is
  direction-free and then modulated globally by time of day. Here the modulation
  is per-cell and gives the terminator — but a cell in a deep valley still gets
  full sky light at noon and at dusk alike, which is wrong in a way players will
  see on a small planet where the sun visibly moves.
- **Coloured light**, which triples the per-cell storage that is already 4× the
  blocks.
- **Whether the twelve pentagons need a gameplay note.** Mechanically they cost
  nothing here. But a torch at a pentagon lights 17% fewer cells, and a player
  who counts torches may notice.

---

## In one breath

- A cell has **8 neighbours**; exactly **12 cells in the world** have 7.
- Lighting costs a flat **1.5×** a cube world — `3r²+3r+1` against `2r²+2r+1` —
  and light range is the lever, because cost grows as its cube.
- **Pentagons cost nothing.** A torch there lights 5/6 as many cells because
  there is 1/6 less world within reach, not because anything is dimmer. Light
  carries no direction, so doc 13's permanent 60° penalty simply does not apply.
- **Sky light is one downward pass**, exactly as in a flat world, because
  invariant 10 makes a column a straight line of cells.
- **Light storage is 4× the block storage** — the largest hidden cost here — but
  sky light is monotone down a column, so storing a depth per column instead of a
  value per cell shrinks that part **32×**.
- **The terminator is free**: `dot(sun, up) > 0`, reusing gravity's `up`, no
  shadow map. A flat world cannot have one at all.
- Set the day length in units of **how long it takes to walk around** — equal
  means the sun moves at exactly walking pace.
- **Twilight lasts a fixed fraction of the day** whatever the planet's size.

---

**Demo:** [`demos/lighting.html`](../demos/lighting.html) — a torch you can drag
across a hex field with the light levels drawn in, side by side with the same
torch on a square grid so the 1.5× is visible rather than asserted. Drop the
torch on the pentagon to watch the disc lose a sixth of its area without losing
any brightness. The second tab spins a planet with a live terminator and a day
length slider, marked with the speed a player can walk.
