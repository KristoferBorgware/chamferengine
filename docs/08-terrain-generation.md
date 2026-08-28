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

And one requirement on how the noise itself is written, which
[doc 23](23-determinism.md) makes load-bearing: **hash with integers, never with
`sin`.** Some implementations use a trigonometric function as a cheap hash. That
one choice makes terrain differ between machines, because no standard pins down
what `sin` returns.

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

## Which noise function, exactly

The rule above says what not to do. It does not say what to *do*, and for the
whole life of this specification neither did anything else — which
[doc 11](11-open-topics.md) records as the third of the four things blocking the
first line of code. **Two implementations of "fBm" are two different planets**,
and the difference is not subtle: it is every coastline.

That was not hypothetical. This repository already contained **two** value hashes
that call themselves the same thing.

> **[verified]** `verification/noise.js`, section 1. `rivers.js`, `water.js` and
> `determinism.js` use a `Math.imul` step — a true 32-bit multiply. `volume.js`,
> `mesh.js` and `seam.js` use a plain float multiply. Over 8,000 lattice points
> the two **disagree on 98.2%** of them.

### Why the float one loses, and it is not the reason you would guess

The obvious guess is that a float multiply is fine while the coordinates stay
small and only breaks once `x · 374761393` runs past `2^53`. That is not what
happens. The **second** multiply takes a value already up to `2^32` and multiplies
it by `1.27e9` — a product of `2^62`, nine bits past what `float64` carries — and
then truncates it back to 32 bits.

> **[verified]** `verification/noise.js`, section 2. That second multiply loses
> bits on **99.1%** of inputs, at every coordinate. Truncating an out-of-range
> `double` is a defined operation in JavaScript and **undefined behaviour in C and
> C++**, so those low nine bits are whatever one language happens to round to.

The natural next thought is that a hash throwing away nine bits must mix badly,
and that this will show as a grid in the terrain. **Measured, it does not.**

> **[verified]** Section 3. Flip one input bit and count the output bits that
> move: both hashes sit within **0.0014** of the ideal 0.5, and the float one is
> marginally the closer of the two. Rounding a `2^62` product still scrambles bits
> perfectly well.

So the case against it is **portability alone** — it has no definition outside one
language. That is the whole argument, and it is not a quality argument.

### The pinned function

Normative. Every operation is either 32-bit wrapping integer arithmetic — exactly
specified in every language that has `uint32` — or `float64` `+ − × ÷`, which
IEEE 754 pins to the bit ([doc 23](23-determinism.md)). No transcendentals, no
float multiply past `2^53`, no reliance on any language's coercion rules.

```
hash3(x, y, z) -> [0, 1)          all steps uint32
    h = x·374761393 + y·668265263 + z·1274126177
    h = h XOR (h >> 13)
    h = h · 1274126177
    h = h XOR (h >> 16)
    return h / 2^32

fade(t)   = 6t⁵ − 15t⁴ + 10t³
value3(p) = trilinear blend of hash3 at the 8 surrounding lattice corners,
            weighted by fade on each axis, mapped to [−1, 1]

fbm(p, frequency, octaves)
    lacunarity 2, gain 0.5, LOW OCTAVE FIRST,
    divided by the summed amplitude
```

**Frequency and octave count are per-field tuning** and belong in the world file
beside the seed, because changing either changes the planet.

### Write the frequency as a size in metres

`frequency` counts features across the **whole sphere**, because the noise is
sampled from a unit direction. One feature is therefore `radius / frequency`
metres, and the same number grows a different hill on every planet.

That is not a unit inconvenience. Split the ground a standing player can see
into two parts — how far it **tilts** across the view, and how far it departs
from that tilt — and only the second reads as a landform. The first reads as
standing on a slope.

> **[verified]** `verification/noise.js`, section 8. One field, 200 m of
> amplitude, frequency 6, eye height 1.7 m. Only the planet grows:
>
> | Radius | Horizon | One feature | Features in view | Tilt | Landform |
> |---|---|---|---|---|---|
> | 1,700 m | 76 m | 283 m | 0.27 | 59.4 m | 39.8 m |
> | 3,400 m | 107 m | 567 m | 0.19 | 52.8 m | 25.7 m |
> | 6,800 m | 152 m | 1,133 m | 0.13 | 43.2 m | 15.0 m |
> | 13,600 m | 215 m | 2,267 m | 0.09 | 33.2 m | 8.2 m |

The horizon is `R·acos(R/(R+h))`, which goes as the **square root** of the
radius, while a feature goes as the radius. So every doubling of the planet puts
about **30% less landform** in view, on the same field with the same amplitude.

Amplitude cannot undo it. It multiplies the whole field, so tilt and landform
rise together and the ratio between them does not move. Hold the planet still
and ask for a feature size instead, and the ratio is the only thing that moves:

> **[verified]** `verification/noise.js`, section 8. R = 6,800 m:
>
> | Feature | Frequency | Tilt | Landform | Landform ÷ tilt |
> |---|---|---|---|---|
> | 1,133 m | 6.0 | 43.3 m | 15.0 m | 0.35 |
> | 567 m | 12.0 | 71.3 m | 39.9 m | 0.56 |
> | 283 m | 24.0 | 90.5 m | 84.1 m | 0.93 |
> | 142 m | 47.9 | 89.1 m | 129.1 m | 1.45 |

At a feature of 283 m — about twice the horizon — tilt and landform are equal.
Below that the ground reads as hills; above it, as a hillside.

So a world file carries **metres**, and `frequency = radius / metres` is applied
on the way in. [Doc 21](21-rivers-and-erosion.md) states the same rule for the
coarse map's resolution, for the same reason: a level and a frequency are both
properties of the grid, and what a person sees is a distance.

### Why the quintic fade rather than smoothstep

`t²(3 − 2t)` is the cheaper and more familiar curve, and it is smooth in the
first derivative — which is enough for the surface to have no visible kink. It is
*not* smooth in the second, and shading reads the second.

![Two fade curves that look identical, above their second derivatives: one ends at plus and minus six, the other ends at zero](figures/fade-curve.svg)

*The two curves are indistinguishable by eye. Their second derivatives are not:
smoothstep arrives at a lattice plane with a curvature of ±6 and the next cell
starts at the opposite sign, so curvature **jumps by 12** at every integer plane.
The quintic reaches zero at both ends, so it matches whatever is next door.*

> **[verified]** `verification/noise.js`, section 5. Worst jump in curvature
> across a lattice plane, over 40 planes: **7.05** for smoothstep against
> **0.08** for the quintic — two orders of magnitude, for two extra multiplies per
> axis, paid once per sample rather than once per octave.

A lit surface displays a curvature discontinuity as a faint regular grid. That is
exactly the artefact [doc 08](08-terrain-generation.md) exists to avoid, arriving
by a different route than the face seams.

### Two things that have to be written down or they will differ

**Accumulation order.** Float addition is not associative, so summing the same
octaves the other way round need not give the same number.

> **[verified]** Section 6. At 4 and 5 octaves the two orders differ by
> `1.4e-17`; at 6 and 8 they happen to agree exactly. **That is the trap** — an
> order dependence that shows up only sometimes is one nobody finds by testing.
> [Doc 23](23-determinism.md) is not about tolerances but about whether a
> difference is introduced at all, so pin it: **low octave first**.

**What the amplitude means.** Dividing by the summed amplitude keeps the output in
`[−1, 1]` whatever the octave count — but fBm does not *fill* that range.

> **[verified]** Section 4. Over 200,000 directions the standard deviation is
> **0.244** of the amplitude. So "60 m of relief" means a typical swing of about
> 15 m, with the full 60 m only where several octaves happen to align. Worth
> knowing before anyone tunes a mountain by eye.

### Every script measures the same planet

`volume.js`, `mesh.js` and `seam.js` run the hash and the fade pinned here, so
their figures describe the world the generator actually produces.

> **[verified]** Section 7. The float-multiply variant differs from the pinned
> hash by a mean of **1.28 m** and a worst of **5.85 m** over 50,000 directions
> at 60 m of relief. That is a different world, not a rounding difference, which
> is why a script measuring terrain has to run the pinned one.

Which hash a script runs decides the size of its counts and not the shape of
its argument. Every conclusion in [doc 14](14-meshing-and-lod.md) rests on a
ratio over hundreds of thousands of cells — face counts, span counts, seam holes
— and none of them turns on which world it measured. The counts themselves do
move, by a tenth or so, which is why they are quoted from a script that runs the
pinned function rather than from one that runs anything else.

---

### One basis ships, and four were measured before that was decided

Everything above pins **one** noise function, and that function is the only one
the generator now carries. Four others were built and measured first — ports of
published implementations, each named for the work it comes from: **Perlin**,
**OpenSimplex2**, **psrdnoise** and **cellular**. `verification/noise.js` still
measures all five, because the reason for keeping one is a comparison and a
comparison needs the other four to exist.

They were interchangeable because they agreed on their interface. Each takes a
point in 3D and a seed and returns a scalar in `[-1, 1]`, so frequency, octave
count, persistence, lacunarity and offset mean the same thing under all five,
and so does the sea-level percentile downstream.

| Basis | Lattice | One octave draws |
|---|---|---|
| value | cubic, a value per corner | round blobs with a faint square weave |
| Perlin | cubic, a gradient per corner | the same weave with a zero at every corner |
| OpenSimplex2 | body-centred cubic | blobs with no direction to them |
| psrd | simplex, gradients that turn | blobs whose lobes all face one way |
| cellular | scattered feature points | plates with hard seams between them |

**The same frequency did not mean the same feature size**, and while five
shipped that had to be corrected rather than documented. A frequency counts
lattice cells, and the five do not draw one feature per cell.

> **[verified]** Zero crossings along an 8,000-unit walk at frequency 1. One
> feature runs **1.99** units in value noise, **1.30** in Perlin, **0.89** in
> cellular, **0.82** in OpenSimplex2 and **0.78** in psrd — so a **Noise scale**
> of 4,500 m drew continents 4,500 m across in one basis and **1,800 m** across
> in another. Each basis's frequency was multiplied by its own width over value
> noise's, which brought all five to within **0.9%** of each other and left
> value noise at exactly 1.

That correction reached further than the label. The editor refuses a map too
coarse to carry the narrowest octave, and it works that octave's width out in
metres from the scale and the lacunarity alone. Uncorrected, the refusal would
have been right for one basis and wrong for the other four. With one basis it
is a division and there is nothing to correct.

**What was left to choose between them was the shape of one octave and the
spread of the sum**, both of which show in the map picture.

> **[verified]** 2,000,000 samples of one octave. Every basis fills `[-1, 1]`:
> the extremes run `-0.999` to `1.000` for value, `-0.995` to `0.979` for
> Perlin, `-0.996` to `1.000` for OpenSimplex2, `-1.000` to `1.000` for
> cellular, and `-1.030` to `1.014` for psrd, which overshoots because the
> reference's own normaliser does. Standard deviation separates them: **0.401**
> for value, **0.389** OpenSimplex2, **0.380** psrd, **0.369** cellular and
> **0.274** for Perlin — so a Perlin world keeps more of itself near the middle
> and reaches the top in fewer places.

**None of that is a reason to carry five.** A spread of `0.401` against `0.389`
is not a landscape anyone can tell apart once sea level is a percentile and the
metre scale divides by the field's own peak — both of which renormalise exactly
the difference the table measures. What decides where a world's regions are is
[the second layer](#two-layers-and-two-curves), and that is a decision about
*where* rather than about the shape of one octave.

Two of the four also cost something. **psrdnoise** builds each gradient by
rotating a hashed direction, and a rotation is a sine and a cosine. A library
sine is not an IEEE operation and two runtimes may return results a bit apart,
so a psrd world was **the one not guaranteed identical on two machines** — the
exposure was bounded rather than removed, four tables of `289` entries built
once with nothing on the sampling path, but it was still the only part of the
generator that needed that argument made. And **cellular is not smooth**: it has
a crease along every plate boundary, because the nearest feature point changes
there, and the octave stack has nothing that rounds it off.

**Nothing about dropping them weakens the pinned hash.** Four of the five
indexed their gradients with the `hash3` above, including the two whose
references use a 64-bit multiply, which is several operations in a runtime whose
integers are 32 bits and whose numbers are doubles. Cellular and psrd carried
the polynomial permutation their references use, which is `+ − × ÷` and `floor`
over integers under `289` — inside the set [doc 23](23-determinism.md) pins. The
one that survives is the one that never needed the argument.

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
under water, depth 0-4         → sand
over the snow line, depth 0    → snow
over the rock line, depth 0-4  → stone
otherwise depth 0              → grass
otherwise depth 1-4            → dirt
deeper                         → stone
not solid, and |p| < seaRadius → water
otherwise                      → air
```

**Two elevations cut the land into three bands, and nothing else is read.** The
column already knows how high it stands, so a band costs one comparison and no
stored field. Under the rock line the soil is grass over dirt; over it the soil
is gone and the stone the ground is made of shows, through the whole soil band
rather than only its top layer, so a hillside that high is rock where it is cut
into as well as where it is walked on; over the snow line one layer of snow lies
on that same rock.

**Both lines are absolute metres, and that is what makes the map and the world
one drawing.** The editor's Ground picture paints in metres above sea level, and
it bands on the same 100 m grid these sit on — water under zero, grass to 300,
bare stone to 400, snow over it — so a colour on the map names the block the
world will build there. Stating them as fractions of the relief instead would
make them agree at exactly one relief and drift everywhere else.

What absolute metres cost is that a low world never reaches them, and that is
the honest reading of a low world rather than a failure.

> **[verified]** Land in each band on the shipped seed, at a land fraction of
> 0.3. At a relief of `300 m` the ground tops out on the rock line, so the world
> is **grass to its summit**: no rock and no snow anywhere on it. At `450 m` it
> is 97.3% grass, 2.6% rock, 0.1% snow. At **`600 m`**, which is what ships,
> **89.2% grass, 8.1% rock, 2.7% snow**. At `750 m`, 79.8% / 11.9% / 8.3%.
> Relief is the knob that walks a world up through the bands.

**A third rule was tried and removed, and it is the reason these two are
elevations.** Ground past a cliff *gradient* came out as bare stone — which
meant carrying a slope field of `2.5 MB` for one boolean test, and the slope it
read was the map cell's rather than the block's, so its rock arrived in patches
the size of map cells instead of down a cliff face. An elevation needs no field
at all.

**Sea level is a radius, not a height.** And "up" is `normalize(position)`. Both
of these ripple far beyond terrain — see [doc 13](13-gravity-and-orientation.md).
The first also makes the sea the only exactly flat surface on the planet, which
[doc 25](25-water.md) cashes in.

Water written here is an ordinary block: translucent, no collision, and never
simulated afterwards ([doc 24](24-edits-and-global-processes.md)).

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

**As stored authoring data: no.** You do not need a painted texture. The map
below is computed from the seed at world creation, not authored, so a fresh
planet is still under a hundred bytes on disk ([doc 07](07-data-structures.md))
and every client builds the same one.

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

### A sum of smooth things is smooth, and a mountain is a crease

fBm gives hills at any steepness, and that is not a tuning failure. Every octave
is `valueNoise3`, which the quintic fade makes smooth in its first and second
derivative, and **a sum of smooth functions is smooth**: every summit is a dome,
every valley a bowl. A photograph of a mountain range is a photograph of
**creases** — knife ridges, faceted faces, a sharp line where two slopes meet.

Steepness is not what separates them.

> **[verified]** Land gradient over a single-stack map, 300 m of relief at a
> 32 m map cell: median **11.1°**, 90th **25.2°**, 99th **38.1°**, steepest
> **56.0°**. That is steep ground. It still reads as hills, because none of it
> has an edge.

**One place a crease can come from is an absolute value.** `1 - |n|` folds an
octave at its own zero crossing, and the fold is the ridge. Squaring it sharpens
the fold and pulls the low ground down. Each ridged octave is then weighted by
the one above it, so the fine detail lands on ground the coarse octaves already
raised — which is what leaves the flats flat instead of crinkling the whole
planet.

**The crest slides, and the two shapes are never mixed.** A plain octave peaks
where it reads `+1` and a fold peaks where it reads `0`, so the two disagree
about which end is high: adding them in proportion subtracts on the positive
half and adds on the negative one. `octaveNoise` moves the crest instead —
`pivot` is where the field's `+1` sits, at `n = 1` unfolded and `n = 0` fully
folded, and the crease is measured from there. Both ends are the arithmetic
they would be either way, to the bit.

> **[verified]** Gradient over a 3,400 m patch sampled every 13.3 m, at 300 m
> of relief, four octaves of a 600 m field. Blending the two shapes against
> moving one crest:
>
> | Fold | blended, median | crest moved, median | blended, 99th | crest moved, 99th |
> |---|---|---|---|---|
> | 0 | 13.8° | 13.8° | 47.9° | 47.9° |
> | 0.2 | **10.9°** | 15.1° | 48.7° | 51.3° |
> | 0.4 | 13.8° | 17.5° | 55.2° | 55.6° |
> | 0.6 | 18.6° | 21.2° | 61.9° | 60.9° |
> | 0.8 | 22.9° | 25.6° | 67.3° | 66.8° |
> | 1 | 26.9° | 26.9° | 71.3° | 71.3° |

**Blended, a little fold made the ground flatter than none at all** — 10.9°
against 13.8° at the median. Moving the crest, the fold steepens the ground at
every setting it is turned to, which is the only behaviour a dial can be read
from. At `0` and at `1` the field is bit-for-bit what it always was; measured
over 200,000 directions at each end, every sample is identical and the largest
gap is zero.

> **[verified]** What the cancellation cost the field itself, over the whole
> planet: the spread of the top tenth of values against the spread of the
> bottom tenth. Blended, the positive half loses its range in the middle of the
> dial and the ridges pile against a ceiling; with the crest moved, the top
> leads at every setting.
>
> | Fold | blended | crest moved |
> |---|---|---|
> | 0 | top ×1.08 | top ×1.08 |
> | 0.2 | **bottom ×1.78** | top ×1.35 |
> | 0.35 | **bottom ×2.47** | top ×1.35 |
> | 0.5 | **bottom ×1.39** | top ×1.43 |
> | 0.8 | top ×1.32 | top ×1.49 |
> | 1 | top ×2.20 | top ×2.20 |

Which end of a field carries its range decides which way a curve read against
it has to rise. Blended, that answer **reversed** somewhere near a fold of
`0.72`, and nothing said so.

**The generator sets this to zero everywhere, and the next section is why.**
`octaveNoise` takes the parameter and every measurement above describes what it
does. What it cannot do is say *where*: a fold creases the **whole world at
once**, moving the character of every place together, which is the one thing a
landscape must not do.

### Two layers and two curves

**A single octave stack makes one kind of landscape.** fBm is homogeneous: every
octave applies everywhere at one amplitude, so one statistic describes the whole
planet and no term in it can say *be different here*.

> **[verified]** `tools/trial-layers.ts`, the spread of local roughness —
> calmest tenth against roughest tenth, over one map. One stack gives **1.3×**
> plain and **1.4×** ridged. Ridge does not help, because it folds every octave
> everywhere.

So the surface is **two** stacks, each whole and neither borrowing from the
other, and each read through a **curve**: across is that layer's own noise, up
is what it controls. The curve is what puts an *edge* on a region — a coastal
shelf, a mountain front — where a control read straight is one long fade. Where
a drag on it matters is where the world actually lands on it: noise clusters
around its own middle, so equal widths of a curve cover wildly unequal amounts
of planet, and half a map sits inside a quarter of the axis.

**Terrain and continents are one layer**, because they are one question at two
sizes: its widest octaves are where the land is and its narrowest are what the
ground does underfoot. Its curve decides the coast.

**The mountain layer is the second**, and it reaches the ground one of two ways.

`gated` lets it through in proportion to how far the terrain already stands
above a **mountain line** — nothing at or below it, all of it at the top of the
terrain curve's own range, smoothed between. A range can only grow where the
ground was already high: the terrain layer draws the land and says where it may
become mountain, the mountain layer says what the mountain looks like. The line
is a fraction of that curve's **own** reach rather than a height on a fixed
axis, so dragging the curve's top down does not slowly close the gate. The edge
is smoothed because a hard cut draws a contour line across every hillside at
exactly the same height.

`roughen` keeps it a per-place multiplier on the terrain layer's own noise: a
range is rougher ground rather than taller ground, and because the bumps and the
base come out of one field they line up instead of crossing.

An ungated third rule — the mountain layer simply added — was built and removed.
Nothing told it where it was, so a range could start in the sea, and on the
shipped world it did.

**The two layers share no parameter.** A layer that borrowed its neighbour's
octave count or falloff could only say the same thing at a different size, and
saying different things is the reason there are two. It costs one refusal:
[the map has to be fine enough](#the-map-is-the-terrain-and-there-is-no-second-tier)
for the narrowest octave, and that is now asked of each layer against its own
falloff rather than once against a shared one.

> **[verified]** `tools/probe-bands.ts` over the shipped world at level 6:
> **35%** sea, **55%** grass, **5%** bare rock, **5%** snow, tallest point
> exactly the 1,100 m Relief asks for. The same world with the mountain layer
> switched off is **14%** grass and **47%** snow — the terrain layer alone owns
> the whole range, so the fit walks ordinary ground up through both material
> lines.

### The one scale the fit cannot divide out

The metre step divides the field by its own peak, so **the tallest point is
Relief whatever the shape knobs say**. That is what makes Relief answerable —
"how tall is the highest mountain" rather than a multiplier on however far this
seed happened to reach — and it is also why the balance between the two layers
can never make a peak taller. Raise it and everything else gets shorter.

**Peak scale multiplies the mountain layer's contribution after that division**,
and only the part it pushed *up*, so the extra is continuous across the
shoreline and a peak grows where a hollow does not.

> **[verified]** `tools/probe-bands.ts`. At `×3` the tallest point goes from
> 1,100 m to **2,808 m** while the sea keeps exactly its **35%** of the surface.
> At `×1` the term is multiplied by zero, so the world is bit-for-bit the one
> without it.

### Land and sea level are different questions

`landFraction` is the percentile every height is measured from, so moving it
moves the ground. **Sea level moves only the water**, downward, leaving every
height exactly where it was — the same picture as draining that much ocean, and
what comes out from under it is the shallow floor that was already there.

> **[verified]** `tools/probe-bands.ts`. Dropping the water 60 m takes the
> shipped world from **35%** sea to **14%**, and the tallest point rises by
> exactly the 60 m the field was lifted.

### The sea floor was spending the mountains' budget

One scale for the whole field is the obvious way to turn noise into metres, and
it caps the mountains. Noise is roughly symmetric about its own middle and sea
level is a percentile **above** that middle, so the floor runs further below sea
level than the peaks run above it — measured, **1.92x**: 300 m of relief gave a
sea floor at **−575 m**, and the crust had to span all **942 m** of a
1,024-layer budget.

The ocean was spending twice what the mountains got, on ground that is never
seen: [doc 25](25-water.md) draws water from above, and a sea floor is visible
only where it meets the shore.

**So land and sea are scaled apart**, each to its own number. The crust spans
`relief + seaDepth`, and the tallest mountain a 1 m block allows goes from
**320 m to 900 m** without touching the block size.

### The map is the terrain, and there is no second tier

Generate a **coarse global heightmap once at world creation** — at, say, level 8
— and store it. Run erosion on it offline, when the whole planet is visible at
once. Then read it, and add **nothing**.

| Coarse level | Cells | At 4 bytes |
|---|---|---|
| 7 | 164K | 640 KB |
| 8 | 655K | 2.6 MB |
| 9 | 2.6M | 10 MB |

Two and a half megabytes buys erosion, and the argument for a second tier of
noise laid on top is where this document was wrong.

**The argument was that a map is too coarse to stand on.** A level-8 cell on the
worked planet is 32 m, so between two samples the ground is one straight ramp 32
blocks long, and a per-chunk noise term was going to fill that in. What the term
actually costs is that **it moves ground the map does not show**. Its amplitude,
its feature size, and the multiplier turning map units into metres are three
numbers that decide the surface and appear nowhere in the picture, so setting any
one of them means walking the planet to find out what happened — and raising one
means lowering another to keep the crust from clipping.

**And the ramp is not what it sounds like.** Measured on the shipped map, over
every land cell:

| Land slope | Metres of rise across one 32 m map cell |
|---|---|
| median | 4.0 |
| 90th percentile | 9.1 |
| 99th percentile | 27.1 |
| steepest | 78.5 |

A 32-block run rising 4 m is one block of climb every eight, which reads as a
hillside and not as a facet. The place a ramp shows is the steep 1%, and the
answer there is the map's own resolution — **Map cell**, which is a knob that
moves the picture — not an invisible term.

So the octave stack does the work a detail tier was going to do, and does it
where it can be seen. Five numbers describe the whole surface:

| Knob | Decides |
|---|---|
| noise scale | how wide the widest feature is |
| octaves | how many narrower copies are summed |
| persistence | how much height each one keeps |
| lacunarity | how much narrower each one is |
| relief | how far the tallest ground stands above sea level, in metres |

The narrowest octave is `scale / lacunarity^(octaves−1)`, and it has to be wider
than two map cells or the map cannot carry it. **That refusal is the whole of the
rule that used to need three knobs balanced against each other**: ground the map
cannot draw is ground the world does not have, so the panel says so rather than
building it invisibly.

**And the lookup is a mask.** Truncating an ID's *path digits* gives the containing
triangle — a chunk — not a coarse cell. What lines up is the lattice: a level-8
lattice point `(i, j)` and the level-11 point `(8i, 8j)` are the **same point**,
so a coarse sample is literally one of the fine cells. Mask the low bits off
`(i, j)` to find the three that surround a cell, and the bits you masked off are
the blend weights between them. No second spatial structure and no interpolation
scheme to invent.

This is the **only** stored terrain the design contemplates, and with the second
tier gone it is not an input to the height field — it **is** the height field.
[Doc 21](21-rivers-and-erosion.md) designs it.

---

## In one breath

- Terrain is invented at exactly one moment: the **cache miss**. Deltas are
  applied last and win.
- **Sample in 3D world space**, never in face coordinates — otherwise all 30 face
  seams show, and level-of-detail becomes impossible.
- **The noise function is pinned**, because doc 23 makes it bit-load-bearing:
  a `uint32` hash (three wrapping multiplies, two xor-shifts), trilinear value
  noise with the **quintic** fade, fBm at lacunarity 2 and gain 0.5, **low octave
  first**. The float-multiply hash this repository also contains is rejected for
  **portability alone** — it mixes just as well and has no meaning outside
  JavaScript.
- Smoothstep would leave a **curvature jump of 12** at every lattice plane, which
  shading shows as a grid; the quintic ends at **0** and costs two multiplies.
- **Height field** = one evaluation per column, no caves. **Density field** = one
  per cell, caves and overhangs, and **51×** the cost.
- Enclosed voids need the noise gradient to beat the bias; more `strength` alone
  gives roughness, not caves.
- **There is no stored heightmap** — the function is the heightmap. The one
  exception is a coarse level-8 map for rivers and erosion, at 2.6 MB.
