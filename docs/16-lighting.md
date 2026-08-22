# 16 — Lighting

## The problem

Voxel lighting is a flood fill: every cell holds a light level, light
spreads to neighbours losing one level per step, and solid cells block it. There
are two independent channels — **sky light** from above and **block light** from
torches — and they are stored per cell and recomputed when a block changes.

[Doc 11](11-open-topics.md) listed three things that make this different on a
sphere: cells have **8 neighbours** rather than 6, sky light arrives along the
**radial** direction rather than straight down, and a sun direction dotted
against cell normals gives **a real terminator from one dot product**.

All three turn out to be true, and the document's shape is unusual for this
project: **this is the system where the sphere costs least.** Two of the three
cost nothing, one costs a flat 1.5×, and the twelve pentagons — expensive
everywhere else — cost nothing whatsoever.

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

This is the one place in the specification where the twelve pentagons cost
nothing, and the measurement looks alarming until you read it correctly.

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

## The terminator is one dot product

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

A flat world cannot have this. Its day and night are a single global number,
because there is nowhere for a terminator to be. Here it falls out of the
geometry at no cost, and it is the most visible thing the sphere gives back.

### The terminator is not the shading, and using one for both gives ambient light

`dot(sunDirection, up)` answers one question: **is the sun over this place's
horizon?** It is a property of where you are standing, and it changes over
hundreds of metres as the planet curves away.

How bright a *surface* is asks something else: **how square is this face to the
sun?** That is `dot(sunDirection, faceNormal)`, and it changes from one side of
a block to the other.

The two are easy to conflate, because on a sphere the ground's normal *is* `up`
— for flat ground. For the wall of a block it is not, and a shader that uses
`up` for both gives every face of every block the same light. A north-facing
cliff and a south-facing cliff read identically. The sun then does nothing but
turn a global dimmer, which is ambient light with a day/night cycle attached.

There is a test that settles it in two frames. Take one picture with the sun in
the morning sky and one with it in the evening, from the same camera at the
same height of sun, and divide them pixel by pixel. Light that comes from a
direction moves *between* faces — one side of every block gains what the other
loses — so the ratios spread out. Light that does not is one number over the
whole picture.

> **[measured]** `tools/frame-diff.mjs`, 916,000 pixels of one view.
>
> | Normal used for the sun | Ratio, morning ÷ evening | Spread |
> |---|---|---|
> | `up` — the place's own | 1.198 | **0.6%** |
> | the face's own | 0.803 | **58.6%** |
>
> With `up`, every pixel moved by the same factor: the fifth percentile is
> 1.187 and the ninety-fifth 1.209. With the face's own normal the fifth is
> 0.394 and the ninety-fifth 1.533 — some faces went two and a half times
> darker while others went half again brighter.

**The face normal is not stored.** Every face in this world is flat — a cell's
cap is a planar hexagon and the wall between two cells is a planar quad — so
two neighbouring pixels of one face differ by a step along its plane, and the
cross product of the two steps *is* the normal, exactly. A graphics API gives
those steps directly, as the change of any value across one pixel. So the
mesher writes no normal, the vertex keeps its six floats, and nothing about the
mesh format changes.

One catch, and it is a precision one. The change across a pixel has to be taken
on the **chunk-relative** position, never the world one. A world position here
is a number near 6,800, where `float32` steps by about a millimetre; the change
across one pixel of ground underfoot is a few millimetres, so the difference
between two of them is two or three representable steps and the normal it gives
is noise. Chunk-relative keeps the magnitude under a few hundred, where the
step is 60 micrometres.

### Light comes from two places, and only one of them has a direction

Once the sun is directional, a wall facing away from it gets nothing, and
"nothing" is wrong: it is a wall on a planet with a sky over it. So the light
splits in two.

- **The sun**, one direction, `max(0, dot(faceNormal, sunDirection))`, switched
  off when the terminator says the sun is down.
- **The sky**, no direction at all. A face looking straight up sees all of it,
  one looking sideways sees half, and one looking down sees only what the
  ground throws back. That is `dot(faceNormal, up)` again — the same quantity
  the terminator uses, doing a different job.

The two shares sum to 1, so flat ground under a noon sun reads the same
whatever the balance, and only surfaces standing at an angle to the sun move
when it is changed.

The sky term takes the sky's **hue and not its brightness**. The color the sky
is drawn in already fades from day to night, so multiplying by it whole would
dim the ambient twice — once by that fade and once by the terminator — and
would turn a dim blue sky into a dim light rather than a blue one. Dividing out
its own luminance leaves a tint, and half of that tint is enough to read as sky
without turning grey stone blue.

Direct sunlight also carries a color of its own: a low sun is seen through more
air, and air scatters the blue out of it first. That height is measured against
the place's own up, so the light turns orange as the day runs **and** as a
player walks around the planet — which on a world you can walk around in 2.12
hours is the same motion.

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

### The map is already the answer, so a shadow costs no second pass

The usual way to shadow terrain is to render it again from the sun's point of
view and compare depths. That is a second pass over every chunk in view, three
or four times over for cascades, against a world made entirely of hard edges.

There is a cheaper answer here, and it comes from something this design already
has. **The coarse map is the terrain** ([doc 08](08-terrain-generation.md)):
one height per coarse cell, and the generator reads a height off it and adds
nothing. So the question a shadow asks — *is anything between this point and
the sun* — is a question the map can answer directly. Walk from the point
toward the sun, and at each step ask whether the ground stands above the walk.

The map is small enough to hand to the GPU whole. One layer per icosahedron
face, each holding that face's triangle of lattice points in the corner of a
square: **2.6 MB** at the shipped map level, with just under half of each
square wasted and no indirection to read it. A direction gives a face and two
lattice coordinates, and those *are* the texture coordinates.

Three things make the walk cheap:

- **The steps grow.** Near ground has to be sampled finely enough to catch the
  bank a few metres away; far ground has to be reached at all. Twenty-four
  steps spread geometrically from 6 m to the reach cover both.
- **The face rarely changes.** A face edge is 7,100 m long and a shadow ray is
  a kilometre or two, so a ray almost never leaves the face it started in.
  Checking the face it was last in is three dot products; finding a new one is
  twenty.
- **A near miss softens for nothing.** Divide how far the ray cleared the
  ground by how far it had travelled and that is the angle it missed by. Take
  the smallest such angle along the walk and a shadow has a soft edge with no
  second sample. One over that number is the width of the penumbra: 60 puts it
  at a degree either side, against the sun's own half-degree.

The march starts on the **map's** own surface, not on the block the fragment
belongs to. The two agree to within the block the height was rounded into, and
a ray starting under the map is in shadow from its first step.

What this cannot give is a block shadowing the block beside it: a map cell is
32 m and a block is 1 m. It gives the shadows that carry the shape of a
landscape and leaves the metre-scale ones to the corner darkening the mesher
already bakes.

**The ground and the sea run the same walk**, as one piece of shader source
both include. It declares its own bind group and takes the sun as an argument,
so it depends on nothing either shader has to hand it — and the sea needs it
most, being at sea level and therefore in the shade of anything at all
([doc 25](25-water.md)).

### A gentle world has almost nowhere for a shadow to fall

Ground shadows itself only where its own slope is steeper than the sun is
high. That makes the shipped world's shadows a dawn and dusk feature, and the
measurement says so plainly.

> **[measured]** `tools/trial-shadow.ts`, a 3,000 m patch of the shipped
> world, 65,536 points, shadow reach 1,600 m.
>
> | Sun above the horizon | Fully shadowed | Partly |
> |---|---|---|
> | 5° | **22.7%** | 13.9% |
> | 10° | **15.2%** | 7.1% |
> | 20° | 4.6% | 2.1% |
> | 35° | 0.1% | 0.1% |
> | 60° | 0.0% | 0.0% |

That is the terrain's own gradient answering: the shipped ground runs
**11.1°** at the median and 38.1° at the 99th percentile
([doc 08](08-terrain-generation.md)), so by the time the sun is a third of the
way up the sky there is almost nothing left standing steeply enough to shade
anything.

It also explains why a shadow is easy to under-sell. The direct term is
`sin(elevation)` of what the sun would give overhead, so at 8° a shadow can
only take away 14% of the light that was there — and the light that was there
is the smaller half of a lit surface's total. The shadow is doing its job; what
makes it read is the exposure applied afterwards, not the shadow.

### After dark the moon is the only thing with a direction

Take the sun away and the two-term model has one term left, and that term has
no direction: every face of every block reads the same all night. A block
becomes a silhouette rather than a shape.

The moon fixes it and costs one more dot product. It is a directional source
like the sun, gated the same way — by whether it is over *this place's*
horizon, so it sets over a walking player as well as over a waiting one — and
faded out as the day comes up rather than switched. Its colour is a colder
white than the sun's.

One structural detail decides whether it reads at all. The light after dark
has a floor, so nothing is ever pure black, and the floor has to sit **under
the sky term alone**. Put it under the total and the moon has to beat it
before it shows, which at any believable moonlight it does not.

> **[measured]** `tools/frame-diff.mjs`, one night view of moonlit ground,
> 830,666 pixels. With the moon: mean 20.2. Without: **12.6**. The fifth
> percentile of the ratio is 0.455, so the faces turned toward the moon are
> more than twice as bright as they are without it.

### A picture is exposed, and that is why a shadow at sunrise is visible

The world is drawn in light rather than in colour, so ground at dawn is
genuinely a fraction as bright as ground at noon: the direct term carries
`sin(elevation)`, which at 8° is 0.14. Left alone, that is what reaches the
screen, and a dawn is a dark picture in which nothing can be seen — including
the shadow that is correctly being cast across it.

An eye does not work that way. It opens.

So the frame is drawn into a floating-point image and exposed on the way to
the screen. Two things happen there:

- **An exposure**, from the light there actually is. Flat ground takes the
  sky's share whenever the sun is up at all and the sun's share in proportion
  to how high it stands, which runs from 1 at noon to the sky's share alone at
  sunrise. One over that, raised to how far the eye is allowed to adapt, is
  the multiplier. At full adaptation every hour comes out equally bright and
  nothing reads as evening; at none, the picture stays as dark as the light
  it was drawn in. There is a floor, or a night with no sun in it asks for all
  the exposure there is.
- **A roll-off**, because a surface can now be brighter than white and a
  screen has no such value. Everything under the knee passes through exactly
  as it is — the great majority of any frame — and above it the curve bends
  toward 1 and never reaches it. At a knee of 0.85 a surface at exactly white
  comes out at 0.925 and one at three times white at 0.990, so a cloud stays a
  cloud and sun on snow keeps its shape instead of clipping to a flat patch.

The roll-off is per channel rather than on the brightness, which is what makes
a colour the exposure pushed past white lose its colour as it goes — the way a
glint on water reads as white rather than as a saturated blue.

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
- **Whether sky light should know the sun's angle.** The usual voxel approach
  makes sky light directionless and then modulates it globally by time of day. Here the modulation
  is per-cell and gives the terminator — but a cell in a deep valley still gets
  full sky light at noon and at dusk alike, which is wrong in a way players will
  see on a small planet where the sun visibly moves.
- **Colored light**, which triples the per-cell storage that is already 4× the
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
- **The terminator is one dot product**: `dot(sun, up) > 0`, reusing gravity's
  `up`, with no shadow map. A flat world cannot have one at all.
- **The terminator is not the shading.** `up` says whether the sun is over this
  place's horizon; the **face's own normal** says how square a surface is to
  it. Using `up` for both lights every face of a block the same, which is
  ambient light with a day/night dimmer on it: two frames with the sun on
  opposite sides of the sky divide out to one ratio with a **0.6%** spread,
  against **58.6%** once each face has its own normal.
- **No normal is stored.** Every face here is flat, so the change of position
  across one pixel gives the plane's normal exactly — taken on the
  chunk-relative position, because a world position on this planet steps by a
  millimetre in `float32` and a pixel of ground underfoot spans a few.
- **Light comes from two places and only one has a direction**: the sun, and a
  sky whose share a face takes from `dot(faceNormal, up)`. The two sum to 1, so
  flat ground at noon reads the same at any balance.
- **A shadow needs no second pass.** The coarse map is the terrain, so a
  fragment walks toward the sun and asks the map whether the ground ever stands
  above the walk — 24 growing steps, one texture per face, **2.6 MB**. It
  cannot shadow a block by its neighbour; it gives the shadows that carry the
  shape of a landscape.
- **Shadows here are a dawn and dusk feature.** Ground shades itself only where
  its slope beats the sun's height, and the shipped ground runs 11.1° at the
  median: **22.7%** of a patch is in full shadow at a 5° sun, **4.6%** at 20°
  and **0.0%** at 60°.
- **After dark the moon is the only thing with a direction.** Without it every
  face reads the same all night. The floor under the light has to sit under the
  sky term alone, or the moon has to beat it before it shows: measured, moonlit
  ground reads **20.2** against **12.6** without, and the faces turned toward
  it are more than twice as bright.
- **The frame is exposed on its way to the screen**, from the light there
  actually is — which is why a shadow at sunrise is visible at all, since the
  shadow takes the same fraction either way and the fraction only reads once
  the picture is exposed for the light that is there. Above a knee of **0.85**
  a roll-off bends toward 1: white comes out at 0.925 and three times white at
  0.990, so nothing clips to a flat patch.
- Set the day length in units of **how long it takes to walk around** — equal
  means the sun moves at exactly walking pace.
- **Twilight lasts a fixed fraction of the day** whatever the planet's size.

---

**Demo:** [`demos/lighting.html`](../demos/lighting.html) — two tabs. **Torch**
runs the same flood fill on a hex field and a square field side by side, light
levels drawn into every cell, with a range slider. The counts track `3r²+3r+1`
against `2r²+2r+1`, so the **1.5×** is visible rather than asserted, and the
readout carries the pentagon figure alongside — a sixth less area for the same
brightness.

**Terminator** spins a planet under a fixed sun with a day-length slider. A
walker stands still on the surface while the terminator sweeps over them, which
is the point: day and night are a *place* here, not a clock value. It opens on
the anchor — a 2.12-hour day, where the terminator moves at exactly walking
pace — and the readout says whether you could have outrun it.
