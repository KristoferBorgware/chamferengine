# 21 — Rivers, erosion and continents

## The problem

Everything the generator has done so far is a **pure function of position**. Hand
it a point, it hands back terrain, and it never needs to look at anything else.
That is what makes chunks independent, level-of-detail possible
([doc 14](14-meshing-and-lod.md)), and a fresh planet a hundred bytes on disk
([doc 07](07-data-structures.md)).

A river cannot be written that way. Here is exactly why.

![A terrain profile with a window drawn over part of it, and an arrow at a hilltop inside the window asking which way water leaves](figures/no-local-rule-for-rivers.svg)

*The generator only ever sees the window. Where the water on that hilltop ends up
depends on ground outside it — possibly kilometres outside it. No amount of local
noise can answer the question, because the answer is not local.*

The same is true of the other two. **Erosion** carves a valley in proportion to
how much water passes through it, which means knowing everything upstream.
**Continents** are shaped by plates colliding across the whole planet. All three
are global, and local generation is exactly the thing that cannot do global.

[Doc 08](08-terrain-generation.md) named the three and sketched a fix in a
paragraph. This document designs it.

---

## The two-tier fix

**Compute a coarse map of the whole planet once, at world creation, and store it.**
Then let the per-chunk generator read it as an input, exactly as it reads the
seed.

That is the only stored terrain in the design, and it does not break the pure-
function property — it moves the global work to a moment when the whole planet is
in memory, and leaves the runtime generator local.

> **[verified]** `verification/rivers.js`, section 2.
>
> | Coarse level | Cells | At 4 bytes | One coarse cell, R = 1,700 m |
> |---|---|---|---|
> | 6 | 40,962 | 0.16 MB | 32.0 m |
> | 7 | 163,842 | 0.63 MB | 16.0 m |
> | **8** | **655,362** | **2.50 MB** | **8.0 m** |
> | 9 | 2,621,442 | 10.0 MB | 4.0 m |
> | 10 | 10,485,762 | 40.0 MB | 2.0 m |

Read that table as a size, not as a level. A level is a property of the grid: it
says how many times a face has been split, and it means a different distance on
a different planet. Level 8 is an 8 m cell on the 1,700 m worked planet and a
32 m cell on a 6,800 m one.

**Ask for the coarse map in metres and let the level follow from the radius.**
The number the design cares about is how wide a coarse cell is, because a river
channel is about one coarse cell wide before the fine generator adds detail to
its banks. On the worked planet 8 m is the right width, at 2.5 MB.

### Resolution decides how wide a river is, and nothing else

Draw the same seed at three resolutions and most of the map does not move.

> **[verified]** `verification/rivers.js`, section 7. One seed, three levels,
> R = 1,700 m:
>
> | Level | Spacing | Land | Longest river | Largest catchment | Land inside a 40,000 m² catchment |
> |---|---|---|---|---|---|
> | 5 | 64.0 m | 30.0% | 1.22 km | 141 cells = 0.50 km² | 9.08% |
> | 6 | 32.0 m | 30.0% | 1.38 km | 482 cells = 0.43 km² | 4.23% |
> | 7 | 16.0 m | 30.0% | 1.38 km | 1,900 cells = 0.42 km² | 2.10% |

Land is **30.0%** at all three. The longest river is **1.38 km** at two of them
and 1.22 km at the coarsest, where a cell is wide enough to swallow a bend. The
map's conclusions are not a function of its resolution.

Two columns do move, in opposite directions, and both for the same reason.

The **largest catchment quadruples** in cells — 141, 482, 1,900 — while the
ground it drains stays at about **0.42 km²**. A cell is four times smaller at
each finer level, so a count of cells is not an area. Anything that compares one
channel against another writes its threshold in **square metres**.

The **share of land inside a fixed catchment halves** — 9.08%, 4.23%, 2.10%.
That is the same river drawn narrower. A channel is one coarse cell wide, so
halving the cell halves the ground the channel covers while its length holds.

So the resolution buys exactly one thing: **how wide a river is to somebody
standing next to it.** At 32 m cells a channel is 32 blocks across, at 16 m it
is 16, and neither figure changes where the water goes.

### The lookup, and a correction to doc 08

[Doc 08](08-terrain-generation.md) says the coarse map is found by "masking its
ID". Stated precisely: truncating an ID's **path digits** gives the containing
*triangle* — a chunk — not a coarse *cell*.

What actually lines up is the lattice.

> **[verified]** `verification/rivers.js`, section 1. A level-8 lattice point
> `(i, j)` and the level-11 point `(8i, 8j)` are the **same point** — separation
> `0.00e+0` over every sample tested. This is the nesting `taper.js` found: cell
> *centres* nest exactly even though cell *areas* never do.

![A subdivided triangle with every lattice point marked, and every fourth one drawn larger as a stored coarse sample, with one fine cell joined to the three coarse samples around it](figures/coarse-lattice.svg)

*A coarse sample is not a different kind of thing — it is one of the fine cells,
the ones whose `(i, j)` are multiples of the step. So finding the three that
surround any cell is masking the low bits off `(i, j)`, and the bits you masked
off are the blend weights between them.*

So the lookup is: **mask the low bits of `(i, j)` to get the three surrounding
coarse samples, and use the remainder as barycentric weights.** No second spatial
structure, no interpolation scheme to invent, and it costs a shift and a blend.

---

## Routing water downhill

Give every coarse cell one rule: **flow to your lowest neighbour.** That is the
whole of flow routing, and on this grid it comes out unusually clean.

> **[verified]** `verification/rivers.js`, section 3. Level 7, 163,842 cells, sea
> level set so 30% of the surface is land as on Earth.
>
> Of the twelve pentagons, **0 are pits** — against 0.2 expected if they behaved
> like any other cell.

**A pentagon picks the lowest of five instead of six. That is the entire
difference.** No special case, no correction, nothing to write. This is the same
result [doc 16](16-lighting.md) got for light, and for the same reason: the rule
only ever compares a cell against its own neighbours, so it never has to know how
many there are. Face crossings are equally invisible, because `neighbour()`
already absorbs them ([doc 05](05-face-adjacency.md)).

### The real algorithm is filling the holes

Routing is trivial. What is not trivial is that **1.39% of land cells have no
lower neighbour at all** — noise makes dips, and water arriving in one has nowhere
to go. Leave them and most of the planet drains into a hole rather than the sea,
and there is no connected network to speak of.

The fix is standard and worth naming: **priority-flood**. Start from the ocean and
grow inward, raising each cell to the lowest level that still lets it drain. A
raised region is a lake.

But there is a trap inside it that is easy to leave out and fatal to leave out.

![Two terrain cross-sections, each with a basin filled with water: on the left the water surface is perfectly flat and the outflow arrow stops, on the right it is very slightly tilted and the arrow continues over the lip](figures/fill-and-epsilon.svg)

*Fill a basin to a perfectly flat level and no cell in it has a lower neighbour —
so every river that reaches the lake stops dead in it. Add a tiny slope while
filling and the water has somewhere to go. The slope is far too small to see; it
exists only so the "flow to your lowest neighbour" rule keeps working.*

> **[verified]** `verification/rivers.js`, section 4. After a priority-flood with
> that slope: **2,369 cells raised into lakes** (4.8% of land), largest single
> raise 0.10 of the height range, and **0 cells left with nowhere to go.**

Without the slope, every one of those 2,369 lake cells is a dead end. With it,
the network is connected from every hilltop to the sea.

**Watch it happen:** [`demos/rivers-and-lakes.html`](../demos/rivers-and-lakes.html)
runs this routing live on a real level-6 planet and switches the fill between flat
and sloped. Flat leaves **914** dead ends, ringed in red where the rivers stop in
the lake; sloped leaves **0**, and a trunk river appears running out of the lake
system to the sea. The lake cells are **the same cells** either way — the slope
changes nothing about which cells hold water, only whether they can be sorted.

### Drainage, and what counts as a river

Once every cell has a downhill neighbour, sort by height and accumulate: each cell
passes 1 plus everything above it to the cell below. One pass, and the number that
comes out is a **count of cells**, which is a fact about the graph and holds at any
planet size.

> **[verified]** `verification/rivers.js`, section 5. Cells whose upstream count
> exceeds a threshold, as a share of land:
>
> | Upstream cells | Qualifying cells | Share of land |
> |---|---|---|
> | 20 | 3,703 | 7.53% |
> | 100 | 563 | 1.15% |
> | 500 | 29 | 0.06% |

The threshold is the design knob: it decides what is a stream and what is a river.
**Write it in square metres**, and turn the count into an area on the way out by
multiplying by `4πR² / cellCount`. The same physical valley scores four times
higher at each finer level, so a threshold of 500 upstream cells is a major river
on one map and a ditch on another.

The whole pass — noise, routing, filling, accumulation — runs in **well under a
second for 163,842 cells**. The script also prints the reading it saw, but that is
a wall-clock timing and moves between runs, so the bound is the claim. Level 8 is
four times the cells, so a few seconds, once, at world creation. **This is not a
runtime cost.**

---

## The finding: continents decide rivers

The first run produced rivers that were far too short — a longest flow path of 46
cells, 0.74 km, on a planet 10.68 km around. That looked like a bug and was not.

> **[verified]** `verification/rivers.js`, section 6. Same sea level, same
> everything, only the noise frequency changed:
>
> | Noise frequency | Biggest landmass | Longest river |
> |---|---|---|
> | 6.0 | 6,206 cells | 31 cells = 0.50 km |
> | 3.0 | 15,352 cells | 46 cells = 0.74 km |
> | 1.5 | 31,615 cells | 85 cells = 1.36 km |
> | 0.8 | 33,433 cells | 86 cells = 1.38 km |

![Two strips of coastline, one broken into many small islands and one a single large landmass, each labelled with its land area and longest river](figures/continents-decide-rivers.svg)

*Lower the frequency, the continents grow, and the rivers grow with them. A river
cannot be longer than the land it crosses, so the length of your rivers is decided
before any water is routed.*

**So the three problems doc 08 lists are not independent — they are ordered.**
Plain fBm makes many small blobs, and small blobs give streams no matter how good
the routing is. Fix the continents first, and the same routing gives rivers.

That reorders the work, and it is the most useful thing this document found.

---

## Continents, and where they come from

The tier that has to exist before the others are worth building. Two approaches,
and this document recommends the second.

**Low-frequency noise.** Cheap: turn the frequency down until the landmasses are
large. The table above shows it works — 0.8 gives a 33,433-cell landmass. What it
does not give is *structure*: no shelves, no mountain ranges along collision
boundaries, no reason for anything to be where it is.

**Plates.** Scatter a few dozen seed points, assign each cell to its nearest seed
— which is a Voronoi diagram on the sphere, and the nearest-seed test is the same
`argmax` of dot products doc 04 uses for faces. Give each plate a drift direction
and an elevation bias. Where two plates push together, raise a range along the
boundary; where they pull apart, drop a rift.

Plates cost one extra field on the coarse map and buy the thing noise cannot
fake: **geography that has a reason.** They also compose with everything above —
the plate field raises the coarse heights, and routing, filling and accumulation
run on the result unchanged.

**Recommendation:** plates set the coarse heights, erosion carves them, rivers
follow. In that order, because each stage needs the one before it.

**Neither plates nor grown land is built.** The engine draws its surface from one
field of octave noise, warped or not, over a choice of five noise bases
([doc 08](08-terrain-generation.md)) — and the plate and grown-land builders that
these measurements were taken from are gone from it. The numbers below stand as
measurements of what those approaches give; they are not a description of what
the editor offers. What removed them was the count of knobs each needed against
what it moved in the picture, not any of the figures here.

**A plate is laid out from hashed directions, not from angles.** A seed, a
rotation axis and a rate are each three hashed components divided by their own
length — a wrapping multiply and a square root, both pinned to the bit by IEEE
754. Placing seeds with `sin` and `cos` instead would put a transcendental in a
field two clients have to agree on exactly, which doc 23 forbids. Plate motion
at a cell is then the cross product of the plate's axis with the cell, which is
how plate motion is described anyway.

**What plates cost is river length.** A range raised along every seam cuts the
interior into separate basins, so a river runs from a ridge to the nearest coast
rather than across the continent.

> **[verified]** `verification/coastline.js`, sections 2 and 4. Level 7, one
> seed, land fraction 0.3, 36 plates. The largest landmass holds **34,359**
> cells against **27,305** for the noise field that ships — the largest of the
> four, so the land is there — and the longest river on it is **114** cells
> against **172**. The limit is the ground, not the coast.

**A plate's elevation bias is a step, and that is what decides how tall its
interior stands.** Sea level is a percentile, and with most plates set to ocean
floor it lands just above their band — so land comes out a flat *twice the bias*
above the water across a whole plate, however far inland. At a bias of `0.5` that
is a step of `1.0` on a field whose other landforms all stay inside `1`, and the
whole continent draws past the top of any color ramp built for them. The bias is
`0.15` for that reason and not by taste. The uplift a seam carries is divided by
the fastest two plates can close — twice the largest spin rate — so `upliftWeight`
is the height of the tallest range this world can grow, rather than a multiplier
on a raw closing speed that runs to `2.3`.

### A percentile cut through smooth noise draws a smooth coast

Low-frequency noise is what the engine runs, and it decides the coastline as
well as the landmasses. Sea level is the height that leaves the intended
fraction of the surface standing, so the coast is a contour line of the height
field — and a contour of a smooth field is a smooth curve.

How smooth is a number, and the useful form of it does not depend on how finely
the map is drawn. Take the coastline of the largest landmass and count the cell
edges along it. Halve the cells and count again. A curve with no detail below
the map's own resolution doubles its count exactly: the ruler halved, so it
takes twice as many. A ragged curve more than doubles, because halving the
ruler finds inlets the coarser one stepped over. The excess is what ragged
means as a number.

> **[verified]** `verification/coastline.js`, section 1. Levels 5, 6 and 7 on
> one seed at a land fraction of 0.3. The coastline steps go 781, 1,623 and
> 3,523 — growing by **2.08** and then **2.17** — so the shipped coast sits at
> a fractal dimension of **1.06 to 1.12**. Published figures for real coasts,
> quoted rather than measured here, run from about 1.05 for South Africa
> through 1.25 for Britain to about 1.52 for Norway.

Perimeter over the square root of area says the same thing in one number:
**13.23** at level 7, against **3.24** for a round cap holding the same land.
That figure is not comparable between resolutions, and the growth rate above
is, which is why the growth rate is the one to quote.

So the coast this planet has is at the smooth end of the real range rather than
outside it. **The relief tier is what keeps it off 1.0** — a second tier of
noise at frequency 6 roughens the contour the continent tier draws, and without
it the coast would double exactly.

---

## Erosion

Erosion is what makes ground look like ground, and it is the one thing on this
page that ships. It runs on the map, once, at world creation.

**Not the stream-power law, and that is a change.** This document argued for
`lower each cell by k · (upstream area)^m · (local slope)^n`, which needs the
drainage network computed first: fill every basin, point every cell downhill,
count what drains through it, and re-do all three between iterations because
erosion moves the heights. Three passes and two stored fields, and what they
produced was lakes nobody asked for and rivers nobody could see.

**Droplets instead.** A droplet starts on a hashed cell and walks downhill, cell
to cell, taking the steepest step it can find. How much it can carry depends on
how fast it is going and how steeply the ground falls; where it can carry more
than it holds it cuts, and where it slows or runs onto flat ground it puts
material back down. It looks only at the cell it stands on and the six around
it — **no routing, no pit filling, no stored flow.**

Two constants earn their place, and both were found by measuring the wrong
answer first.

**Capacity is a gradient, never a fall in metres times a cell width.** With the
second form a droplet crossing flat ground on a 100 m map wanted to carry `15 m`
of material, and cut it out: erosion moved **15 m per cell** before it had done
anything useful. The gradient form means the same hillside erodes by the same
amount whatever the map's cell size is.

**A droplet may take a tenth of one step's fall, and no more.** Uncapped, it
meets a tall step, takes the whole thing at once, and leaves a pit for the next
one to fall into. Measured at level 7 on the shipped ground, uncapped erosion
**multiplied the median slope by four and the 90th percentile by seven** — the
opposite of what water does to a hillside.

> **[verified]** Level 7, 100 m cells, 300 m of relief. Slope is metres of fall
> per metre travelled; the last column is how far the ground moved on average.
>
> | Erosion | median slope | 90th | 99th | steepest | moved |
> |---|---|---|---|---|---|
> | 0 | 0.077 | 0.144 | 0.209 | 0.30 | — |
> | 0.1 | 0.078 | 0.149 | 0.223 | 0.46 | 1.07 m |
> | 0.3 | 0.078 | 0.160 | 0.298 | 0.92 | 2.89 m |
> | 0.6 | 0.080 | 0.178 | 0.452 | 1.08 | 5.27 m |
> | 1 | 0.083 | 0.208 | 0.577 | 1.24 | 8.04 m |

The median barely moves and the tail grows: that is the shape of a channel
network being cut into ground that is otherwise left alone. A knob whose median
climbed with it would be adding roughness, not carving.

Every draw is hashed from the seed and the droplet's number rather than taken
from a running generator, and droplets run one after another, so the result is a
function of the seed and nothing else.

---

## Rivers and lakes are not generated

Everything above about routing, filling and drainage is **designed and not
built**. At the resolutions the map is drawn at, the channels the routing found
were one cell wide and the lakes were flat discs. A river you cannot see is a
stored field, a flood fill and three passes over the planet, paid for at every
world creation, for nothing.

So the map carries **one field**: the height. Water is wherever that height is
under zero, which makes the ocean the only water and a radius the only thing
that describes it. What this page designs stays here for when somebody decides
the game has rivers — **F-030** holds that question — and the erosion above is
what was worth keeping from it.

---

## What the fine generator does with it

The per-chunk generator reads the map and adds nothing:

```
elevation     = blend of the three surrounding coarse samples     ← masked (i,j)
surfaceRadius = seaLevelRadius + elevation
```

The map is stated in **metres above sea level**, so there is no level to subtract
and no multiplier to apply, and sea level is zero by construction. Water stands
at the sea-level radius wherever the ground is under it.

**There is no detail term.** [Doc 08](08-terrain-generation.md) has the
measurement that removed it: a second tier of noise moves ground the map does not
show, and the ramp it was there to fill turns out to rise 4 m across a 32 m map
cell at the median — a hillside, not a facet.

The map is still an input, like the seed, so nothing about chunk independence,
level-of-detail or determinism changes.

---

## What this forces elsewhere

- **[Doc 07](07-data-structures.md)** gains one stored artefact: a 2.5 MB coarse
  map, written once at world creation and read-only thereafter. It is the only
  terrain on disk that is not a player delta.
- **[Doc 08](08-terrain-generation.md)**'s height field *becomes* the coarse
  blend rather than gaining it, and its "masking its ID" sentence needs the correction above.
- **World creation** gains a step measured in seconds, which did not exist before.
- **[Doc 14](14-meshing-and-lod.md)** is unaffected: a coarse chunk reads the same
  coarse map at the same place, so LOD still works by re-evaluating a function.
- **Sea level** becomes a parameter of the coarse pass rather than a constant,
  since it decides how much land there is and therefore how long the rivers get.

---

## Still open

- **How many plates, and how they drift.** This document argues for plates and
  does not size them. Too few gives a world of continents the size of oceans; too
  many gives noise with extra steps.
- **What the stream-power exponents should be.** `m` and `n` are the shape of
  every valley on the planet and are usually tuned by eye. Nothing here measures
  what they should be — but [doc 23](23-determinism.md) narrows the choice: take
  them from `{0.5, 1, 1.5, 2}`, which are products of `sqrt` and multiplication
  and therefore bit-identical on every machine, rather than an arbitrary real
  exponent that needs `pow`.
- **Whether lakes should survive.** The fill turns 4.8% of land into lakes, which
  is a lot of lakes. Some of them are real features and some are artefacts of the
  noise; nothing distinguishes them yet.
- **Rivers below the coarse resolution.** At an 8 m coarse cell a channel is 8 m
  wide. A stream narrower than that has nowhere to live in the coarse map, so
  either the fine generator invents small tributaries locally — with no
  guarantee they connect — or small streams simply do not exist. No resolution
  fixes this: halving the cell halves the smallest channel and never produces
  one narrower than a cell.
- **A big channel is half pools.** Filling the pits raises basins along a
  channel, and standing water is written wherever the fill raised the ground.
  Measured on a 6,800 m planet at a 32 m coarse cell, **354 of the 785 cells
  draining more than a square kilometre carry water** — so a large river reads
  as a chain of pools with dry channel between them rather than a continuous
  ribbon. Nothing here decides whether that is right.
- ~~What happens where a river meets a player's edits~~ — settled by
  [doc 24](24-edits-and-global-processes.md). The coarse map **stays read-only**:
  it is a statement about the *generated* world, not the current one, which is
  what keeps it a pure function of the seed for
  [doc 23](23-determinism.md). Water becomes a local simulation on top of it. The
  measured reason a partial recompute cannot work: a headwater dam's effect fades
  within twenty cells while a main-stem dam is felt to the coast, so there is no
  radius to recompute within.

---

## In one breath

- Rivers, erosion and continents are **global**, and local generation cannot do
  global. The fix is one **coarse map, computed once and stored** — an **8 m
  coarse cell** on the worked planet, which is 2.5 MB.
- **Ask for the map in metres and let the level follow from the radius.** The
  resolution decides one thing only: **how wide a river is.** Land share and
  river length in kilometres are the same at 64 m, 32 m and 16 m; a channel is
  one coarse cell across at every one of them.
- The lookup is masking the **low bits of `(i, j)`**, not the path digits, because
  a coarse sample is literally one of the fine cells and the bits you mask off are
  the blend weights.
- **Flow routing needs no pentagon case and no face case** — 0 of the 12 pentagons
  were pits, because the rule only compares a cell to its own neighbours.
- The real algorithm is **filling the pits**, and the trap inside it is that a
  perfectly flat lake stops every river that reaches it. Fill **with a tiny
  slope**: 2,369 lake cells and **0 dead ends**.
- **Continents decide rivers.** The same routing gives a 31-cell river on small
  blobs and an 86-cell river on a large landmass, so build the continent tier
  first — the three problems are ordered, not independent.
- All of it is **world-creation cost**, seconds once, and the runtime generator
  stays a pure function of position.
