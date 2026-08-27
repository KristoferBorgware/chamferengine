# Demos

Thirty-six self-contained HTML files. No build step, no `npm install`, no
server required — open any of them directly in a browser. All are mobile-friendly
and touch-enabled.

Most of the 3D demos load Three.js r128 from a CDN and need an internet
connection. The 2D ones are fully offline, and so are
[`noise-lab.html`](noise-lab.html), [`multi-noise-lab.html`](multi-noise-lab.html),
[`vegetation-lab.html`](vegetation-lab.html) and
[`cave-lab.html`](cave-lab.html), which draw their own WebGL2.

---

## Start here

### [`how-it-works.html`](how-it-works.html)
An illustrated walkthrough of the whole construction, for someone meeting it for
the first time: start with twenty triangles, split each into four, push the
corners onto a ball, and put the blocks **on the corners rather than in the
triangles**. Ten diagrams, no interaction, no dependencies.

It then carries that one idea through to the parts it decides — why there are
exactly twelve pentagons, why an address is just the route down the splits, what
a cell costs to draw, why level of detail has to resample rather than decimate,
and why an apron closes a chunk seam at the surface but not where a cave runs
into it.

**Docs:** [02 — Choosing the geometry](../docs/02-geometry-choice.md),
[03 — Addressing](../docs/03-addressing.md),
[14 — Meshing and LOD](../docs/14-meshing-and-lod.md)

---

## Geometry

### [`sphere-tiling-shapes.html`](sphere-tiling-shapes.html)
Six tilings side by side, color-coded by where the curvature defect lands.
Blue = regular cells, red = major defect, amber = minor.

Compare *Quads · cube* against *Quads · rhombic 30* at the same resolution: same
720° total, but the cube dumps 90° into 8 corners while the rhombic-30 spreads it
across 32 points. The last two buttons show the space-filling lattice cells.

**Docs:** [02 — Choosing the geometry](../docs/02-geometry-choice.md)

### [`subdivision-explorer.html`](subdivision-explorer.html)
Two things in one ball: how the subdivision works, and what level of detail does
with it. **The splits go deep only where the player stands.** Right click to
stand somewhere and the triangles halve their way toward you — and every one of
them draws its own cells, at its own level. Coarse hexagons on the far side,
fine ones underfoot, and the step between them is the level-of-detail seam.

**A chunk always holds the same number of cells.** One level coarser covers four
times the area at half the resolution, so it is the same count at a wider
spacing — level of detail is re-sampling the ground, never dropping cells out of
a fine mesh. A few hundred triangles then cover a planet of hundreds of millions
of cells: at depth 13 with 8-cell chunks, **1,115 triangles against
20,971,520** if every one were at full detail.

**Chunk decides how much ground is at full detail, and not how many chunks
there are.** At `detail` 2 the full-detail region reaches two chunk widths, so
8-cell chunks reach 16 m and 64-cell chunks reach 128 m — while the count of
full-detail chunks stays near 150 either way.

**The red lines are the seam** — every edge where a triangle meets a finer one.
Both sides tile at their own spacing, so their cells do not meet along it: the
coarse side's hexagons reach past the line and the fine side's stop short of it.
There is one ring per band and the bands double in width going out, so the
default world draws **163 seam edges** in four rings around the player. **Apron**
shows what closes them: every triangle draws the ring of cells one step past its
own rim, at its own level, so both sides cover the strip neither of them tiled.

**Altitude lifts the eye, and the finest bands go first.** Distance is measured
from the eye, so the ground under the feet is that far away and everything
coarsens at once. At eye height **156** triangles reach full detail; at 215 m
**none** do, because full detail reaches two chunk widths — 16 m — and the eye is
past it. The seam rings go with them: 163 edges on the ground, 101 at 215 m, and
**0 from 27 km up**, where the selection is the twenty bare faces. **Horizon**
adds the cull the engine runs, `acos(R / (R + altitude))` widened by a triangle's
own half-width: at eye height that leaves a 152 m cap of a 6.80 km planet, and
rising opens it.

**Left click a cell** for its address — which face, the route down the splits
with the chunk's own digits marked off, which corner of the last triangle, and
whether it is one of the twelve pentagons. Under it the stored word is drawn to
scale: `planet 12`, `face 5`, `path 2 x depth`, `corner 2`, `layer 11`, and
whatever is left of the 64. Depth 4 leaves 26 bits over, depth 13 leaves 8, and
depth 17 leaves none.

**Depth and Cell size are the knobs and Radius follows**, the way the engine has
it: `radius = cell x 2^depth / 1.20459`. Depth alone does not fix it — at depth
13 the radius still runs from 3.40 km to 27.20 km, which is the range of cell
sizes — so the readout carries both the radius and the range its depth allows.
The ball is drawn to a compressed scale, because the radius spans four orders of
magnitude across the knobs.

**Docs:** [02 — Choosing the geometry](../docs/02-geometry-choice.md),
[03 — Addressing](../docs/03-addressing.md),
[14 — Meshing and LOD](../docs/14-meshing-and-lod.md)

### [`goldberg-voxel-sphere.html`](goldberg-voxel-sphere.html)
The chosen tiling, generated as the dual of a subdivided icosahedron. Four
resolutions from 12 to 2,562 cells. At the highest setting the twelve pentagons
become hard to spot.

**Docs:** [02 — Choosing the geometry](../docs/02-geometry-choice.md)

### [`s2-vs-h3.html`](s2-vs-h3.html)
The prior art. Switch S2's projection between linear, quadratic and tangent and
watch the **measured** area ratio drop from ~5.1 to ~2.1 to ~1.4 — computed live
from the cells on screen with l'Huilier's formula, not quoted. The red cells are
the eight cube corners that no projection fixes. The gold thread is the Hilbert
order.

The second tab shows the H3-family structure with icosahedron face edges
overlaid. Structurally accurate; real H3 cells are rotated relative to these
because of aperture-7 subdivision.

**Docs:** [01 — Prior art](../docs/01-prior-art.md)

---

## Addressing

### [`subdivision-and-chunks.html`](subdivision-and-chunks.html)
The two sliders side by side, on real hexagons. Icosahedron faces unfolded flat,
with terrain sampled from each cell's true 3D position using the noise function
[doc 08](../docs/08-terrain-generation.md) pins.

**Move chunk level and nothing on the ground moves** — only the teal lines. Move
subdivision depth and everything does, because level of detail here is resampling
rather than smoothing. That is doc 03's "chunk size stays tunable after launch",
visible rather than asserted, with the bit bar re-cutting the same `5 + 2D` width
underneath.

Tap a hexagon for its face, `(i, j)`, path digits and `(q, r)`, with the nested
triangles that name it drawn one per level and every cell filed under the same
chunk washed white. That wash is `rank.js`'s ownership rule on screen: a chunk of
15 slots owns anywhere from 6 to 15 cells depending on which edges it won. Put two
or more faces up and the terrain crosses the seam without a break.

**Docs:** [03 — Addressing](../docs/03-addressing.md),
[07 — Data structures](../docs/07-data-structures.md),
[08 — Terrain generation](../docs/08-terrain-generation.md)

### [`chunk-hierarchy.html`](chunk-hierarchy.html)
Triangles carrying the hierarchy, hexes sitting on their vertices. Raise the
depth and watch the colors stay put — exact containment. Switch to *Hex cells*
and color boundaries cut *through* hexagons; the readout gives the live
border-cell percentage.

**Docs:** [03 — Addressing](../docs/03-addressing.md)

### [`flat-cells-chunks.html`](flat-cells-chunks.html)
The same idea flat, in four tap-through steps: scaffolding → cells on corners →
chunk division → ownership. The simplest entry point to the whole design.

**Docs:** [03 — Addressing](../docs/03-addressing.md)

### [`cell-id-bits.html`](cell-id-bits.html)
The stored 64-bit word, live: `[planet 12][face 5][path 2×D][corner 2][layer 10]`.
Drag the chunk-level slider and watch the dashed line move while the binary string
below it does not change at all — that is the whole of what the encoding buys.
Drag depth instead and the word runs out of room at `D` 17. Tap the truncate
buttons to see the tail go dark and the surviving prefix's coverage reported.

**Docs:** [03 — Addressing](../docs/03-addressing.md)

### [`address-split.html`](address-split.html)
Tap any lattice point to see `(i, j)` carved into path digits plus `(q, r)`.
*Find a flipped one* demonstrates the middle-child orientation flip that affects
~46% of cells.

**Docs:** [03 — Addressing](../docs/03-addressing.md)

### [`adjacency-table-2d.html`](adjacency-table-2d.html)
One icosahedron face laid flat with its three neighbours folded out. Each ringed
circle is a triangle's `0,0` origin with its `i`/`j` axes. The gold dot is one
physical cell on the seam, with its address in **both** frames — the gap between
those numbers is what the table exists to close.

**Docs:** [05 — Face adjacency](../docs/05-face-adjacency.md)

### [`barycentric.html`](barycentric.html)
Drag a point in a triangle. The shaded regions *are* the coordinates — each one's
area equals the opposite corner's weight. The table shows rounding breaking the
sum and being repaired. Drag outside and a weight goes negative: that is the
face-boundary test.

**Docs:** [04 — Position lookup](../docs/04-position-lookup.md)

---

### [`patch-vs-range.html`](patch-vs-range.html)
Doc 11 claimed multiplayer interest was "an ID range comparison; the addressing
scheme does the work". This is what that actually looks like. One face, split into
4,096 chunks, with a player's view drawn over it and **each color one unbroken
run of consecutive IDs**. A single range would be a single color. Drag it
anywhere and it never is.

The second control shows it. Widen the view and the chunk count grows with
the **area** while the run count grows only with the **rim** — 2.4 chunks per run
at close range, 26 at long range. So ID ranges get *better* with distance, which
is why they earn their keep on disk and not on the network. The order toggle shows
doc 03's `[0,3,1,2]` beating the naive walk by around 10%, and no more.

**Docs:** [22 — Multiplayer interest management](../docs/22-multiplayer-interest.md),
[03 — Addressing](../docs/03-addressing.md)

---

## Sizing and structure

### [`planet-size-calculator.html`](planet-size-calculator.html)
Block size and travel time in; subdivision level, snapped radius, cell count,
total voxels, and crust taper out. Drag the time slider slowly to watch the level
tick over and the rounding penalty swing up to ±40%.

**Docs:** [06 — World sizing](../docs/06-world-sizing.md)

### [`detail-with-distance.html`](detail-with-distance.html)
Block size, radius and chunk cells in; the depth, the chunk level and the rings
where the ground coarsens out. The picture is the ground from above with you on
the left, banded by how big a cell is drawn there — the hexagons double band to
band. Drop Chunk from 32 cells to 8 and watch the first step come in from 154 m
to 38 m.

Answers the two questions the panel's own wording does not: which settings are
fixed when the world is made, and which one is chosen again every frame.

**Docs:** [06 — World sizing](../docs/06-world-sizing.md),
[14 — Meshing and LOD](../docs/14-meshing-and-lod.md)

### [`data-structures.html`](data-structures.html)
Three tabbed diagrams: what lives where (constant / pure / RAM / disk), inside a
chunk (palette and packed indices), and the lookup path with its hit/miss branch.

**Docs:** [07 — Data structures](../docs/07-data-structures.md)

---

### [`lat-long-on-a-ball.html`](lat-long-on-a-ball.html)
Spin the planet; the crosshair is where you are standing. The readout gives
latitude, longitude and the exact cell, and says whether **the rounded readout
would have named the same cell** — which is the point of doc 20. It usually does
and sometimes does not, so you show lat/long and send the ID.

The lookup is doc 04's real pipeline (nearest face centroid → barycentric →
`hexRound`), not a nearest-centre search, and the survey in the corner is measured
live on load: two decimals name the right cell **87.5%** of the time, three
**98.8%** — the same numbers `coords.js` reports. The red dots are the twelve
pentagons. The axis runs through an antipodal pair, so both poles are pentagons
and the other ten sit at exactly ±26.565°, in every world that will ever exist.

**Docs:** [20 — Player-facing coordinates](../docs/20-player-coordinates.md)

---

## Terrain

### [`noise-lab.html`](noise-lab.html)
**The place to go when the ground looks wrong.** One patch of the real planet,
drawn as a plane you can turn and zoom, with the map above the knobs. Every
slider redraws it while you are still moving it.

The plane's quads are the coarse map's own cells — 32 m at the shipped settings —
so the ratio of how wide a cell is to how tall the ground gets is the engine's,
and a slope that reads as a hillside here reads as one in the world. It opens at
true scale and says so, with the relief as a percentage of the patch. The last
group of knobs is marked **not the world**: **Height ×** and the contour lines
change the picture and leave the ground where it was, and the readout warns
whenever the plane is drawn taller than the world builds it.

**The world is two noise layers and two curves, and nothing else.** A single
octave stack makes one kind of landscape, because fBm is homogeneous — every
octave applies everywhere at one amplitude, so one statistic describes the whole
planet and nothing in it can say *be different here*. Ridge did not help: it
folds every octave everywhere, moving the character of the world rather than
carving regions out of it, so it is gone and the mountain layer replaces it.

- **Terrain & continents** is one layer because it is one question at two sizes.
  Its widest octaves are where the land is; its narrowest are what the ground
  does underfoot. Its curve decides the coast — a shelf, a short steep rise,
  then land that keeps climbing.
- **Mountains** is the second layer, with its own frequency, octaves,
  persistence, lacunarity and offsets. Nothing is shared between the two: a
  layer that borrowed its neighbour's falloff could only say the same thing at a
  different size.

**Each curve is a lookup table you drag**: across is that layer's own noise
value, up is what it controls. The four points it opens with are a starting
shape, not the shape — click the empty curve to add a point, shift-click one to
take it away, and only the two ends are pinned, in x alone, so the curve always
covers the whole range. **Behind the curve is where the world actually lands on
it**: noise clusters around its own middle, so equal widths of a curve cover
wildly unequal amounts of planet, and half the map sits inside a quarter of the
axis. A drag near the middle repaints a fifth of the world; the same drag out at
the end reaches about two percent of it. The curve is what puts an *edge* on a
region — a coastal shelf, a mountain front — where a control read straight is
one long fade.

**Two ways for the mountain layer to reach the ground, and which is right is a
measurement rather than an argument.**

- **gated** is the shipped one. The mountain layer is let through in proportion
  to how far the terrain already stands above **Mountain line** — nothing at or
  below it, all of it at the top of the terrain's own range — so a range can
  only grow where the ground was already high. The terrain layer draws the land
  and says where it may become mountain; the mountain layer says what the
  mountain looks like. The line is a fraction of the terrain curve's **own**
  range rather than a height on a fixed axis, so dragging that curve's top down
  does not slowly close the gate, and it is **drawn across that curve** in amber
  — where the gate opens is a place on a picture, not a number in another group.
  The edge is smoothed, because a hard cut draws a contour line across every
  hillside at exactly the same height.
- **roughen** keeps it a per-place multiplier on the terrain layer's own noise,
  so a range is rougher ground rather than taller ground — and because the bumps
  and the base come out of one field, they line up instead of crossing.

An ungated **add** was tried and taken out. Nothing told it where it was, so a
range could start in the sea, and on the shipped world it did.

**Detail on top** is the balance between the two layers. It is a ratio and not a
number of metres, which is F-052 and is open.

**Peak scale is the one scale that survives the fit.** Every knob upstream of
the metre step is divided back out by it — the tallest point is Relief whatever
they say — so `Detail on top` can only change the balance between the two
layers, never how tall a peak is in metres. Peak scale multiplies what the
mountain layer contributed **after** the fit, and only the part it pushed *up*,
so the extra is continuous across the shoreline and a peak grows where a hollow
does not. Measured on the shipped world, the summit goes 1,100 m at ×1 to
1,924 m at ×2 and 4,004 m at ×4.5 while the sea cut does not move by a
thousandth and the planet stays exactly 35% sea. It is the one knob that takes
the world above Relief; the note under it says the tallest point and by how far.

**Every knob that has a value meaning "off" carries a switch.** Persistence 0
leaves one octave, an offset of 0 is the lattice unshifted; unticking sets the
knob to that value, so what is left on screen is the ground the knob was not
contributing to. Relief and Sea depth use their slider's own bottom rather than
zero — zero multiplies every height by nothing, which leaves a full field of
noise and no ground at all. The switch names the value it uses. Frequency,
lacunarity and map cell have no such value and get no switch — a switch that
quietly meant "back to the default" would look like a measurement and not be
one.

**Frequency is a frequency, not a distance in metres.** It is how many times the
widest octave repeats across the planet: 1 is a single hump from pole to pole,
40 is forty of them. The engine's own panel asks for the widest feature in
metres, which divides out to the same number and hides how small it gets: a
scale of 29,400 m on a 6,801 m planet is a frequency of `0.23`, less than one
whole feature across the world. A coarse slider carries the decade and a fine
one picks the value inside it, and the readout gives each layer's widest and
narrowest octave in metres so a setting found here can be typed into the engine.

**A slider cannot be moved into a refusal.** The world is the map, so an octave
narrower than a map cell is ground the map cannot carry — so each layer's octave
count and coarse frequency stop where its own narrowest octave is still two
cells wide, against its own lacunarity, and the ends move as the rest of the
draft moves. Sea level is bounded the same way: it cannot be pulled below Sea
depth, which is a planet with no ocean and a slider position meaning the same as
the one beside it.

**Land and Sea level are different questions, and the second is why there are
beaches.** Land is the percentile that decides how much of the planet stands
above the water, and moving it moves the ground, because every height is
measured from it. Sea level moves only the water, downward, leaving every height
exactly where it was — the same picture as draining that much off the ocean. On
the shipped world, dropping it 60 m takes the patch from **31%** land to **59%**,
and what comes out from under the water is the shallow shelf that was already
there, drawn as sand. The note under the slider says how much of the patch it
just handed back, because that number is different on every world and on every
part of one.

**Three things are pinned rather than offered.** The octave sum is always
divided by the summed amplitude; metres are always **fitted**, so the tallest
point is Relief exactly; and there is no domain warp. The first two were on the
panel as choices and neither changed a world, because the fit renormalises
whatever the stack hands it.

**Each section of the panel folds.** Two whole noise layers do not fit on one
screen — each carries a frequency pair, an octave count, a falloff, two offsets
and a curve — so the panel is long by construction, and the layer being tuned is
the one that needs to be open.

**A row with no meaning comes off the panel; a row that cannot reach the world
goes grey.** Those are different states. Mountain line is hidden under a merge
that has no gate, because a disabled row is a question the reader has to answer
before dismissing. Switching the mountain layer off greys its eleven rows
instead, because each still means something and is turned off elsewhere — and
the switch that turned them off stays live beside them.

**The readout says what the whole planet is made of**, not what this patch is:
the material lines are absolute metres and a patch is a place, so a patch can be
all snow on a world that is mostly grass. That share is the number the balance
between the layers is tuned against. The shipped set gives **35% sea, 50%
grass, 8% rock, 7% snow**; a `Detail on top` of 1.5 in the same world gives 22%
grass and 36% snow.

**Map shows** switches the picture above the knobs between the **patch** and
the whole **planet** — longitude across, latitude down, at the same sea level
and the same metre scale the plane is using, with the patch outlined in amber
where it stands. **Click the planet to stand somewhere on it.** A latitude and a
longitude are a place and two sliders are not, so finding a range by dragging
them is a search with the answer already on screen. A patch a few kilometres across says what the ground does
underfoot and cannot say where the continents are; the planet answers the second
question and stays flat, because a globe drawn small hides half of itself.

**Picture** draws the ground as the world's four blocks, as a grey ramp in
metres, as the raw unitless field before sea level has been taken off it, or as
either layer on its own. **A layer's own picture is the layer**, never the layer
after something else has had a say: the mountain field draws where it is loud
whether or not the gate is letting it through there. **Surface** draws it solid,
as a wireframe, or both. The **Contour** panel at the bottom draws every line of the
patch over one another, so the silhouette carries where the ground stands as
well as what shape it is.

**Every knob is in the address bar**, switches included, and only where it
differs from the default — so a world found by dragging is a link, and the link
restores the panel as well as the ground.

The noise is a hand copy of the engine's, kept honest by a test that digests the
two against each other.

**Docs:** [08 — Terrain generation](../docs/08-terrain-generation.md)

### [`multi-noise-lab.html`](multi-noise-lab.html)
**Three noise fields, three curves, and one line of arithmetic between them.**
The construction is Henrik Kniberg's, from his talk on reinventing a voxel
game's world generation ([video](https://www.youtube.com/watch?v=ob3VwY4JyzE)).
Four pictures sit above the knobs — one per field and one of the ground they
make together — and a patch of the planet stands in the middle as hexagon
columns you can turn and zoom.

**One stack of octaves makes one kind of landscape.** fBm is homogeneous: every
octave applies everywhere at one amplitude, so one statistic describes the whole
planet and nothing in it can say *be different here*. Three stacks sharing no
parameter can, and the order they are read in is the whole construction:

- **Continentalness** sets the level, and its curve **is a height, not a
  land-or-sea switch**. Its **middle is the waterline**, and the two halves
  scale apart — up to `Relief` above it, down to `Sea depth` below — so its
  answer is already in metres: an ocean floor at one end, the top of a plateau
  at the other. Which of those is coast falls out of it rather than being
  decided by it, and **only the curve decides it**: sea level is drawn across
  the curve and labelled there, and where the curve crosses that line is the
  shore. It is the level the other two layers then work on, so it is where the
  ground would stand before erosion wears it and before peaks and valleys is
  added.
- **Erosion** decides how much of the relief is cut away. Its curve answers a
  fraction from none of it to all of it — **higher `y` is more cut away**, because the
  layer is called erosion and erosion is removal. What survives is `1 - cut(E)`
  and it **multiplies**, so a region the curve sends to `1` is flat whatever the
  third field is doing. Drag the whole curve to the top and the patch is a
  smooth continental ramp with a clean shoreline and no ridge anywhere on it.
- **Peaks & valleys** is the relief. Half way up its curve is the level the
  continent already set: below cuts a valley, above raises a peak.

So high continentalness with low erosion and high peaks is a steep ridge, and
the same continentalness and the same peaks under high erosion is a plain. The
recipe under the pictures is the arithmetic, with the metres the knobs are set
to.

**Erosion does two things: it flattens, and it lowers.** It takes the relief
outright, so what survives is `1 - cut(E)`; and it takes the level in proportion
to **Wears the level down**, because water wears a range down as well as
smoothing it, and in a nested spline — where the height is one function of all
three fields — erosion changes the level by construction.

Both are one minus a share of the same cut. The relief keeps `1 - cut(E)`, and
the level keeps that same cut scaled by whatever **Wears the level down** is set
to. Turn that knob all the way up and the two are the same number, so land the
curve fully cuts is flattened and lowered together and ends at sea level; turn
it off and the level keeps all of its height while only the bumps go.

Measured over the planet, the knob moves the top of the distribution and leaves
the bottom exactly where it is. From `0` to `0.55` to `1`, the 95th percentile
of height falls `552 m` → `403 m` → `337 m` and the snow band goes
`13.8%` → `5.2%` → `2.7%` of the surface while grass grows `19.0%` → `30.3%`.
The median stays at `-136 m` and the lowest point at `-417 m` on all three,
because **below sea level nothing is worn** — the ocean floor is not what the
rain is falling on, and wearing it would lift the sea bed toward the surface.

**Each layer carries a whole stack, not a frequency** — its own feature size in
metres, octave count, falloff, step between octaves and fold. A layer that
borrowed its neighbour's falloff could only say the same thing at a different
size. **The fold is what makes a ridge**: `1 - |n|` creases an octave at its own
zero crossing, and it is turned up on peaks and valleys alone, since folding
either of the others creases the coast of every continent at once.

**A layer's section reads curve, picture, knobs**, in that order. The curve is
what the layer is for — the stack's own rows only say how coarse or fine the
reading is, so they are the setup and the curve is the decision — and the
picture sits between them because it is what both are judged against.

**Each layer has a switch on its section, and every off is an exact statement
about what that layer contributes.** Erosion off cuts nothing, so all of the
relief survives — the multiply's own neutral; peaks off adds none, which is the sum's; and the
recipe shows the term as the `1` or the `0` it became rather than removing it.
Continentalness has no neutral, because something has to set the level — off
reads its curve at the middle of the field, which is the one level a field with
nothing to say would give. On the shipped world that turns the planet into an
ocean with a scatter of ridge crests breaking the surface: **0.5% land** against
38.3%, ground `-381` to `64 m`. It is the clearest statement of what the first
layer is for, since without it nothing tells the mountains where they are. A
layer that is off still draws its own picture and its own histogram, because
what it would put back is the thing being decided.

**Behind every curve is the histogram of where the world actually lands on it**,
counted over the planet's own cells rather than over the patch — a curve governs
the planet, and a patch is a place that can sit entirely on one side of it. Noise
clusters around its own middle, so equal widths of a curve cover wildly unequal
amounts of ground — and a field reaches nowhere near either end of its own
range, so where the bars pile up is the part of the curve governing most of the
planet, and a stretch with no bars under it is a shape nobody will ever stand
on. Click a curve to add a point, shift-click one to remove it;
only the two ends are pinned, in x alone.

**Each curve names its two axes as two statements, and only `y` may claim a
consequence.** `x` is that layer's field and its range, `-1` to `+1`, and
nothing else: the field is a raw reading, and the curve is the only thing that
says what a reading costs. Naming the ends of `x` *untouched* and *most eroded*
reads as a fact about the ground and is not one — drag the curve flat and
nothing is eroded anywhere while the label still says otherwise. `y` is where
the consequence goes, and it runs the way the layer's own word does: erosion is
removal, so `y` is how much is cut away and a curve that rises to the right
takes more. **It points at the dashed line rather than saying where the line
sits**: sea level is halfway up the continentalness axis only while the sea is
undrained, and Sea level and Sea depth both move it, so a label reading *sea
level in the middle* is true at the shipped knobs and wrong one drag later.
**And it never reprints a knob** — Relief, Sea depth and Peaks say what the ends
of an axis are worth in metres, and putting them under the curve as well is the
same three numbers on screen twice.

**The patch is drawn on the block grid, not on the map's.** A map cell is a
reading and a block is a hexagon one layer tall; between two readings the engine
lays blocks up a ramp, and a cliff, an overhang and a floating island are all
shapes in that grid. Drawn a hexagon per map reading there is nowhere for any of
them to stand. **Block detail** is how many levels finer than the map that is —
at 0 it is the map's own level again, and each step is four times the columns:

| Block detail | block | columns in the patch | rebuild |
|---|---|---|---|
| 0 | 32 m | 817 | 206 ms |
| 1 | 16 m | 3,169 | 260 ms |
| 2 (shipped) | 8 m | 12,481 | 485 ms |
| 3 | 4 m | 49,537 | 2,040 ms |

Those are software-adapter timings — read the ratio. What the block size does to
the carve is further down, and it is not a cost question.

**A fourth layer carves the terrain the other three placed, and it only ever
takes rock away.** Once the three fields have placed a column, every hexagon in
it gets one reading from a 3D noise field and is air where that reading is not
positive. **One thing is added to the reading and it is not a knob**: the density
gains a full `1` over four shape widths of depth, so nothing deeper than that is
ever air — *do not cut below the crust* written as arithmetic rather than as a
rule, and the depth the whole layer works in rather than a slider of its own.

```
air under height where  density(D) + (height − y) ÷ 480 m  ≤  0
```

**Four widths, because a reading is not `−1`.** An octave stack is normalised to
its own peak and its standard deviation is about a quarter of that, so an
ordinary negative reading sits near `−0.25` and is cancelled after a *quarter* of
whatever span it is given. At one shape width the layer all but disappears —
**0.7%** of columns holding rock over air over rock, against **34%** at a quarter
of that rate. Four puts a typical reading's reach at about one width and the
deepest readings at three, which is a cave system rather than a dimple.

**It is measured in the layer's own scale**, so widening the shapes lets them
reach deeper by the same factor and there is no second slider that has to be kept
in agreement with the first.

**It is a layer like the other three and is built by the same function**, so it
has a field, a curve on that field, a picture of it, and the same four noise
rows. **What it has not got is a fold**: a fold creases a whole world at once, which is
what makes it a landform knob, and a crease in a cave field is one nobody can see
from inside the cave.

**Feature is the one number the noise function cannot supply.** It is smooth per
unit of *its own input* and has no idea what a metre is; dividing the world
position by Feature before the lookup is the only conversion there is, and it
decides whether the sign of the field changes every block — speckle — or every
few tens of metres, which is a cavern. **Octaves** then ragged-edge those shapes
into passages and side chambers without moving the widest one, **Falloff** says
how loud each narrower octave is against the one above and **Step between
octaves** how much narrower. Both rows' ends move so the narrowest octave stays
something the block grid can draw — **the carve's are measured against the block
and the first three layers' against the map cell**, because this field is read at
every block and theirs are read once a place.

| | out from under rock | columns that overhang | floating masses |
|---|---|---|---|
| Falloff 0.20 | 41.5% | 28.3% | 0 |
| **0.50 (shipped)** | **43.9%** | **33.6%** | **9** |
| Falloff 0.80 | 50.1% | 45.2% | 24 |
| Step 1.5× | 36.0% | 21.1% | 3 |
| Step 3.0× | 45.2% | 34.6% | 9 |

**The curve is on the field and its middle line is where air becomes rock.** `x`
is the reading at that point and `y` is the density it becomes, over the line
rock and under it air. **It ships as a straight line**, which is the field itself
handed through untouched — the right place for a reader to start, because then
every shape in the world came from the noise rather than from something done to
it afterwards. Standing the middle up sends ordinary readings to both ends and
opens the world out:

| Curve | out from under rock | columns that overhang | floating masses |
|---|---|---|---|
| straight (shipped) | 43.9% | 33.6% | 9 |
| middle at ×1.75 | 49.4% | 42.1% | 19 |
| middle at ×5 | 57.4% | 62.6% | 15 |

| Feature | octaves | out from under rock | columns that overhang | floating masses |
|---|---|---|---|---|
| 60 m | 2 | 38.8% | 30.9% | 7 |
| **120 m (shipped)** | **3** | **43.9%** | **33.6%** | **9** |
| 200 m | 3 | 24.3% | 25.8% | 4 |
| 300 m | 4 | 15.2% | 10.8% | 2 |

**Roughly a third of what goes is under the sea**, which is the ocean covering
what was opened rather than the layer having skipped the low ground.

**Turning the layer off leaves the block grid, because the grid is the world's
and not the layer's.** The ground is then the height field rounded to the nearest
layer boundary — the terracing the engine builds, and the shape a carve is cut
out of.

**And it turned up a hole the height field had had all along.** Each column is
drawn down to a lip under its own ground rather than down to one floor under the
patch, because a floor makes the block a plinth taller than the terrain on it;
but the wall between two columns was drawn to *this* column's lip, so a neighbour
more than a lip lower left a gap between the bottom of one and the top of the
other, with the inside of the planet behind it. The lip is 6% of the patch, so it
opens as soon as the patch is small enough to look at closely: at **Patch 16**,
512 m across ground running −136 m to 234 m, **6.23% of the drawn ground was
showing through**. The fix is one term — a wall reaches whichever of the two
lips is lower. It has nothing to do with the density layer, and turning that
layer off does not close it.

**Three knobs are metres and each moves one thing.** **Relief** scales the land
half of the curve and **Sea depth** the sea half, each to its own knob, so
neither moves the coast — measured, Relief from `400 m` to `1,600 m` leaves the
sea side at `-417` / `-315` / `-136 m` untouched while the land goes `196 m` to
`824 m` at the 95th percentile, and Sea depth from `200 m` to `1,200 m` leaves
the land side at `403` / `615 m` while the floor drops `-283 m` to `-1,141 m`.
One scale for the whole axis looks obvious and is what makes Sea depth flood the
world: it rescales what a curve point is worth, dragging sea level across the
curve. **Sea level only drains**, because heights are metres above sea level and
so sea level is zero by construction — dropping it uncovers the shallow floor
that was already there and moves no ground at all, `-100 m` taking the planet
from `37.9%` land to `44.0%` with every height identical.

**The world is set the way the engine states it.** Subdivision depth and block
size fix the radius — `radius = blockSize × 2^depth / K` — so the radius is not
a knob: it is quantised to powers of two, and a slider for it would have
positions that build the same planet. **Map cell** picks the level nearest the
spacing asked for, and the cell is then whatever that level gives, because a
level is a whole number and a spacing is not. At the shipped settings that is
depth 13 with 1 m blocks — the same depth, block and map cell the client opens
with — giving a radius of 6,801 m, level 8, and a map cell of 32.0 m. Every slider's own ends move with the rest of the draft, so an octave
narrower than two map cells cannot be reached — ground the map cannot carry is
ground the world does not have.

**The patch runs from 16 map cells across to 1,024**, and past a point it stops
being a patch: the walk keeps going until it has enumerated every cell there is,
and the readout says **the whole planet**. Which pair of knobs gets you there is
the whole trick, because the two ends trade against each other — the patch is a
count of map cells, so coarsening the map buys reach and spends detail:

| Map cell | Patch | hexagons | |
|---|---|---|---|
| 128 m | 512 | 40,962 | the whole planet, 1.9 s |
| 64 m | 1,024 | 163,842 | the whole planet at four times the detail, 2.6 s |
| 32 m | 512 | 183,546 | a landmass and its ocean, visibly curved, 9.9 s |
| 32 m | 1,024 | 540,806 | still not all of it, 20.6 s |
| 16 m | 1,024 | 732,700 | the most it will build, 32.1 s |

Read the ratios; those are software-adapter timings, and the readout says how
long every time. **The note under the slider counts what the walk reached
against what the planet holds**, and names no threshold. A threshold here is two
different measurements: the knob is a count *across* and the walk's own limit is
a *radius*, so a wrap figure taken from the half-circumference says half of what
it means — at a 128 m map cell it names 167 where the planet needs 334, and
following it hands you **20,057 of 40,962** hexagons. A hemisphere, drawn as
confidently as a planet. A count cannot be out by a factor.

**The patch is the engine's own lattice at the map's own level**, not a hex grid
that resembles one. The map is the terrain, so a hexagon here is a map cell,
which is what a map cell already is. Cells come from `directionToCell`, the ring
from `neighbour` and the polygons from `cellCorners`, so a patch that reaches a
face edge crosses it the way the engine does and a patch that reaches one of the
twelve pentagons gets a five-sided cell. Each cell draws a cap at its own radius
and a wall wherever it stands over a neighbour, and the sea is one translucent
sheet at its own radius with no block under it. **Three lights, because the badly lit part of a patch and the badly lit part of
a globe are not the same surfaces.** A patch's dark faces are the walls turned
away from the light, and their normals point the opposite way, so a fill
opposite the key is exactly what reaches them — rendered alone it lights the
anti-sun walls and leaves every cap in the picture black. A globe's dark part is
the terminator, and a light opposite the key cannot reach it: those normals are
square to the key, so both clamped terms are zero there by construction. Adding
the opposite fill alone moved a whole-planet frame's mean from **49.7 to 50.4**
of 255 and left the dark limb where it was. What reaches it is a light that
wraps — half the dot product plus a half, still 0.5 where the clamped one has
gone to nothing. All three together take the same frame to **53.0**, with the
95th percentile of the per-pixel ratio at **1.000**: nothing anywhere gets
darker, and a face square to the key reads exactly what it read before.
**The normal is stored, and it
is stored as three bytes** — taking it from the change of position across a
pixel is what the engine's terrain shader does and it is wrong at this scale,
because a derivative is a difference over a two-by-two block of pixels and a map
cell is a few pixels across, so most pixels straddle the line where a cap meets
a wall and average the two into a normal belonging to neither. A face normal
quantised to one part in 127 is far finer than any shading can show. A test digests both ported
blocks against the engine, cell for cell and corner for corner.

**A picture of a field sits where that field is tuned.** The ground the three
make together stays in the head, where scrolling to reach a knob cannot carry it
off; each layer's own field goes in that layer's section, under the curve it is
read through. All four show the planet or the patch. Over the planet
they are longitude across and latitude down with the patch outlined in red, and
clicking one moves the patch there. **Click any of them for a large version** —
right-click over the planet, where a plain click already means go there. A field
at panel width says where its features are; at a thousand pixels it says what
they look like, and which of those a curve is being dragged against is the whole
question.

The three field pictures are cut into grey bands: a smooth wash shows a field's
brightness and hides its shape, and the band edges are its contours.

**Every knob is in the address bar**, curves included, and only where it differs
from the default.

**Docs:** [08 — Terrain generation](../docs/08-terrain-generation.md)

### [`cave-lab.html`](cave-lab.html)
**The engine's own cave carve, on a patch of hexagon columns.** The panel
carries a plan of the caves as a picture and the volume as a block of ground you
can turn, cut open and look into; **Draw · void** turns the world inside out and
draws the caves themselves as the solid, which is the only view that shows a
network from outside it.

`caveDensity` is a **band around zero** of a noise field, moved onto flat ground
and otherwise untouched: three octaves at a **Feature size**, hollow inside a
**Band width** either side of zero. **The zero set of a field in space is a set
of surfaces, and the band round it is a slab** — so what this carves is not a
network of corridors but one folded sheet running through the crust, and every
number on the readout follows from that. The shipped settings put a passage
under **69.8%** of columns and the narrowest way through one is **20 cells**:
those are caverns, and squeezing them down to a 3-cell corridor shatters the
sheet into **1,976** separate systems.

A sheet carve has no plan of its own, so the picture is one horizontal **slice**
at a depth you name, and it is a different picture at every depth.

**A constant ceiling is why the engine's caves have no way in.** The gate is a
yes or a no on one number, so at 6 m nothing ever breaks the ground and at 0 m
the sheet is near the surface everywhere and opens it everywhere: there is no
setting between the two. **Rock kept over the roof** is that constant, and the
ceiling here **dips** below it where a second field clears a rarity you set, so
a mouth opens where the ground allows one **and** the sheet happens to be there — two conditions rather than one, and
the cave stays one system with holes in its roof rather than gaining
disconnected pockets. Set **Ceiling dips by up to** to zero to get the constant
back.

**Where the rarity starts has to be set rather than assumed.** A borrowed figure
does not work: the standard deviation of noise depends on how many octaves it
has, and over a patch this size the field never sees its own full range — at a
60 m feature over 95 m of ground the median reading is `0.461` and **46.5%** of
it clears `0.5`.

**The contour is drawn twice, and the two are worth comparing.** Blue is
marching squares over a square raster — sixteen cases, two of them
saddles the four corners cannot decide. Orange is the same contour taken on the
**lattice the world is built on**: three adjacent cells are a triangle, so the
cases are eight and **none of them is ambiguous**, because three points have no
saddle.

The readout is the point of the page. **Narrowest way through** is how many
cells wide a passage is where it pinches, which is what says whether it is a
corridor or a cavern; **separate systems** and **half the void is in the
biggest** say whether what reads as a network survives being drawn in hexagons;
**faces per column** prices the caves against the same ground with none; and
**noise lookups a column** is the generation bill, which is where a carve free
to put a passage at any depth pays for that freedom.

**Docs:** [08 — Terrain generation](../docs/08-terrain-generation.md)

### [`vegetation-lab.html`](vegetation-lab.html)
**Trees grown from the planet seed, as blocks, with nothing authored and
nothing placed.** Twelve species from pine to heather, a stand of them on a
hillside of hexagon columns, and every number that decides a shape on the
panel beside it.

**A tree is a skeleton, not a threshold, and that was measured rather than
argued.** Growing wood wherever a noise field crosses a threshold is the
obvious idea. Over a 64 m box at 4% fill it gives **172 separate pieces with
1.7% of the wood touching the ground** — a cloud of floating fragments, which
is debris rather than a tree. Two fields intersected reach **10.0%**, because
the crossing of two level sets really is a curve in three dimensions and noise
really does hold long filaments; they are still rooted nowhere. And gating the
field by height, which is the natural way to say *no branches near the ground*,
takes it to **0.0% both times** — the gate's job is to delete wood near the
ground, and the trunk is the wood near the ground. The same measurement over a
hashed skeleton is **one piece, 100% of it standing on the ground**.

**That matters beyond looks.** The repair for a disconnected field is a flood
fill from the trunk, and a flood fill is a global query: whether a cell survives
depends on a chain of cells that may run three chunks away. Terrain here is a
pure function of the address — a chunk generates its own rim rather than asking
the chunk next door, which is what the mesher, the apron and every level of
detail rest on. **Nothing that needs a flood fill can be terrain.**

**Grown from** switches between the two on the same grid, and the readout says
**how many separate pieces** the wood is in and **how much of it is standing on
the ground**. At the shipped thickness the field mode reads **429 pieces, 2.7%
rooted** against the skeleton's **100%**, and the picture is the finding: brown
fragments hanging in the air over a bare hillside.

**So noise does the other job, which is the one it is good at.** It bends the
branches — each step of a limb leans by a lookup at its own position, so no two
branches repeat and a whole stand leans together, off the same field the ground
was read from. It
cuts the leaf clusters, which is what makes a canopy rather than a ball. And
the height gate survives, pointed at how much splitting is allowed rather than
at what is wood: **First branch** is bare trunk under a fraction of the height.

**A branch is a direction in three dimensions, never a walk along the neighbour
ring.** A heading carried along a path here does not close — a loop round an odd
number of pentagons comes back rotated one index at any radius — and 46% of
chunks are turned half a turn, so a branch stepping by direction index would
grow one shape in one chunk and its mirror in the next. Cells come from
`directionToCell` on the branch's own position, which also means the twelve
pentagons never need a case: nothing asks for neighbour `k = 5`, and nothing is
planted on a five in the first place.

**A rod thinner than a cell rasterises to a dotted line, and a dotted branch is
not connected to anything.** Measured on one tree: at a radius of 0.45 of a cell
it comes out as **66 pieces with 74.7% rooted**, and at 0.87 it is **one piece
and 100%**. The rod's centreline is written whatever the radius, and where a
step moves sideways and upward at once the corner between the two is written as
well — the ring is six neighbours and the column is two, a diagonal is neither,
and one missed corner is a branch in two pieces.

**The hexagons are blocks here, not map cells.** The other labs draw the coarse
map, because the map is the terrain and a landscape is what they are about. A
plant is metres tall and blocks wide, so this patch is the block grid at the
full subdivision depth with the map read underneath it through `hexRound` on
scaled barycentric weights — and **a map cell is a straight ramp, not a
plateau**: one height per map cell handed to every block under it builds a
staircase of 16 m treads with a cliff at every edge.

**A species is a bundle of numbers, never a model.** Picking one writes its
numbers into the rows below and they stay editable, so the list is a set of
starting points. **Mixed stand** hashes a species per plant out of the twelve,
and the one named in **Species** is the one the panel is editing. **Size
spread** scales each plant off its own hash, so a stand has saplings in it.

**Collision is not a second system.** A plant is blocks, so what a player walks
into is the block test the world already runs, and whether a leaf stops them is
a property of the block type the way water's is. **Leaves are solid** turns that
over and the readout says what it costs: how much of the ground you could still
step onto.

**Leaves are the expense, not wood.** A canopy is a shell of one-block-thick
surface, so almost every leaf cell it holds is drawn on several sides — at the
shipped stand the leaf faces outnumber the wood faces several times over, and
that, not the skeleton, is what decides whether a forest is affordable.
**Branches** carries its own switch now, next to **Leaves'** — off, a plant
grows as a bare trunk and no leaf cluster is asked for either, because a
cluster hangs at a branch tip or the top of a bare trunk and there is nowhere
left for one to sit. The panel greys the whole group rather than hiding it, the
same rule a shown-or-not row already follows elsewhere on this page.

**The patch is cut into chunks and every chunk generates alone.** This is the
property the engine needs and the one a lab is most likely to fake: a chunk
there gets an address and the seed and nothing else, so a plant whose canopy
crosses a boundary has to be grown twice, identically, by two chunks that never
speak. Three things had to change for that to hold. A plant is grown in **world
coordinates**, not in the patch's own east/up/north frame, because that frame is
one no chunk has — two chunks would each grow the tree about their own middle.
Layers count from a **world datum**, not from the lowest ground in view, which
is the one thing a chunk generating alone cannot know. And the bend and the leaf
cut are read at the cell's own place in the world, so two chunks agree about the
air inside one canopy.

**The check is the patch against itself.** Asking whether two chunks agree about
a cell neither owns is the wrong question — a chunk answers for its own
territory and what a plant spills past that is the neighbour's business. So the
same ground is generated a second time in one piece and the two are compared
cell for cell. At the shipped reach it reads **0 cells differ**, and the ladder
down is what says the reach is load-bearing rather than decoration:

| reach past the rim | cells that differ |
|---|---|
| 0 m | **10,702** |
| 8 m | 704 |
| 16 m | **0** |
| 24 m (shipped) | **0** |

**What it costs is the rim.** A chunk tests every root within reach of its own
cells, which at 48 blocks a side and 24 m of reach is **27,360 roots against
7,057 owned — 3.88x**. Bigger chunks amortise it; the whole point of the number
being on the panel is that it moves when you drag either slider.

**The reach has to cover the widest canopy, and the lab measures that too.** The
shipped stand's widest plant reaches **19.8 m** sideways from its own trunk, and
that number is why **the bend is a displacement from the heading a limb set out
on and never a nudge added to each step**. Accumulated it is a random walk in
direction: an 86 m trunk at a 0.4 m step is 215 steps, and a nudge of 0.075
wanders about a radian, which draws as a redwood sprawling **40.8 m** sideways
from a crown twenty across. Read as a displacement it is bounded by the knob,
and a stand still leans together because the field is the same.

**Level of detail is a subdivision depth, and vegetation follows it because
vegetation is terrain.** A plant is blocks, so it is drawn by the chunk's own
mesher at the chunk's own level — there is nothing to bake and nothing separate
to fade. **Level of detail** draws the same ground at a shallower depth, and the
skeleton, which is in world metres and knows nothing about resolution, is
rasterised into whatever lattice is there. Over the shipped stand, with the
chunk audit still reading zero at every level:

| level | blocks | hexagons | plants | wood cells | leaf cells | rebuild |
|---|---|---|---|---|---|---|
| 0 | 1 m | 7,057 | 186 | 30,084 | 35,841 | 4,990 ms |
| 1 | 2 m | 1,801 | 185 | 6,792 | 2,655 | 1,669 ms |
| 2 | 4 m | 469 | 185 | 658 | 1,266 | 1,006 ms |
| 3 | 8 m | 127 | 186 | 77 | 429 | 917 ms |
| 4 | 16 m | 37 | 182 | 11 | 106 | 580 ms |

**The plant count barely moves, and that is the point.** A root is a cell, and a
coarse chunk's cells are not a fine chunk's cells — hashing its own would choose
a different forest at every level and a tree would come and go as the player
walked. So **the planting lattice is the finest one at every level**, which
makes the same ground hold the same trees however coarsely it is drawn. It also
means the root walk is the same size at every level: **the one part of a chunk
whose cost does not fall with distance**. The hexagons drop fourfold a level and
the roots do not.

**Anything a planting test reads from the drawn level makes the forest depend on
it.** Two did. The slope limit divided by the drawn cell rather than the finest,
which made the same hillside four times steeper a level out and refused **6,544
of 7,045** roots at level 2 against none at level 0. And the waterline was read
off the drawn cell, which resamples the surface, so plants at the shore came and
went with the level. Both read the world instead now — how steep the ground is
and how high it stands do not depend on who is asking.

**Past a certain cell size the canopy wins.** A twig is centimetres thick and a
cluster is metres across, so wood beating leaf is right at the block scale and
wrong once a block is wider than a trunk: with wood always winning, level 3 drew
**2,938 wood cells against 62 leaf** — bare brown poles at exactly the distance
a forest should read as green. **The rule is a rank and not a permission**, and
that distinction is the whole of it: letting a leaf overwrite wood where it
happens to arrive second makes the answer depend on the order plants are grown
in, and a chunk grows them in a different order from its neighbour. Measured,
that alone took the audit from **0 cells differing to 10**. A rank fixed before
any plant is grown gives the same cell whatever order it is written in.

**A plant shorter than one block is not grown at all.** Left in, its rod's own
minimum radius draws it as a whole block — a 0.9 m heather bigger at level 3
than it is at level 0, standing where nothing should be. Skipping it takes its
skeleton off the bill as well, which is the only part of the plant cost that
falls with distance.

**On hills it holds.** Over a hillside with 36 m of relief across the patch and
198 plants standing on it, the chunk audit reads **0 cells differ**. Steeper
than that and the slope limit refuses everything — at 134 m of relief across
96 m, **no plant stands at all**, which is the rule working rather than failing.

**Two panels, one on each side, because a plant and the ground it stands on
are different questions.** The right panel is the plant alone — planting rules,
trunk, branches, leaves. The left panel is everything about the world it is
planted in: the terrain knobs, how the patch is cut into chunks, and the
readout that says what grew — a fact read back off the ground after the fact,
so it sits with the world rather than with the knobs that shaped one plant.
Moving a slider in one never has to be cross-referenced against a heading in
the other, because the heading already says which question it answers.

**On a phone each panel is its own shut drawer, with its own button.** 340 px of
knobs against a 390 px screen means only one drawer can usefully be open at a
time, so **Plants** and **World** sit at opposite corners and answer for their
own panel alone — opening one never closes the other. Each button moves above
its own drawer when open, so the way out is never under the thing it opened. On
a desktop neither button is on the page — the panels sit either side of the
view and never cover it.

**Docs:** [08 — Terrain generation](../docs/08-terrain-generation.md)

### [`planet-slice-noise.html`](planet-slice-noise.html)
A cross-section through a planet, showing the density field in volume. Push
*Cave carving* up slowly to watch noise overpower the radial bias: pockets →
overhangs → floating islands → swiss cheese. Sea level is visibly a radius.

**Docs:** [08 — Terrain generation](../docs/08-terrain-generation.md)

### [`planet-3d-noise.html`](planet-3d-noise.html)
The same generator on the real hex grid. The thing to look for is what you
*don't* see: no mountain range, coastline, or biome boundary lines up with a face
seam or pentagon, because the generator samples 3D world space and never sees the
addressing scheme.

**Docs:** [08 — Terrain generation](../docs/08-terrain-generation.md)

---

### [`rivers-and-lakes.html`](rivers-and-lakes.html)
Doc 21's flow routing, run live on a real level-6 planet — 40,962 cells, filled,
routed and accumulated in about half a second. One button, and it is the whole
argument: **fill lakes flat** and 914 rivers stop dead where they meet the water,
ringed in red. **Fill with a slope** — a ten-thousandth of a metre per cell — and
there are none, with a trunk river running out of the lake system to the sea.

The lake cells are the same cells in both modes. The slope does not change what
holds water; it changes whether "flow to your lowest neighbour" has an answer.

**Docs:** [21 — Rivers, erosion and continents](../docs/21-rivers-and-erosion.md)

---

### [`dam-a-river.html`](dam-a-river.html)
Click to build a wall across a river. **Nothing happens** — the river runs where
it ran, the water above stays, the water below keeps flowing. That is doc 24's
decision and doc 25's rule seen from the inside: water is a block type, and blocks
do not move.

Then press the other button and the demo runs the simulation that is *not* being
built, so you can see what was given up. Two things show up immediately. **One
block dams nothing**, because a cell has six ways out and the water goes round —
it takes a wall that spans the channel before anything floods at all. And when it
does flood, the amber cells are only the upstream half: every cell below the wall
has lost its flow, and terrain bounds the lake while nothing bounds the deficit.

Level 7, the same resolution `verification/edits.js` measures at — at level 6 a
river is one cell wide and one block really would dam it.

**Docs:** [24 — Player edits and global processes](../docs/24-edits-and-global-processes.md),
[21 — Rivers, erosion and continents](../docs/21-rivers-and-erosion.md)

---

## Orientation

### [`sky-on-a-small-planet.html`](sky-on-a-small-planet.html)
Drag a walker round the planet and watch the sky turn — because `up` is
`normalize(position)`, and 10,681 m of walking rotates it through a full 360°.
Switch the sky to *locked to the camera* and the view freezes however far you go,
which is what a flat-world skybox does, and why it cannot be used here.
The moon is drawn **to scale**, so 0.52° really is a speck, and it slides against
the stars as you move — parallax a skybox at infinity does not have.

**Docs:** [32 — The sky, the clouds and the moon](../docs/32-sky-clouds-and-moon.md)

### [`atmosphere-scale.html`](atmosphere-scale.html)
Two ways to give a planet 3.4 km across a sky, side by side, with one sun and one
camera between them. The left half is Earth's atmosphere with the camera's
altitude multiplied into it; the right half is air of the planet's own, as tall
as the slider says. Both carry the same optical depth straight up, so the two
differ in geometry alone.

Raise the camera and the halves part company: at **46 m** — a modest hill — the
left one is black, because 46 m scaled into Earth's air is 171 km. The right one
is a daytime sky. Push the air thinner and the right half's sunset comes back,
which is the trade the height slider actually makes: the horizon path is 70.7
times the zenith path on Earth, 20 times at a 200 m atmosphere and 10 times at
800 m.

**Docs:** [32 — The sky, the clouds and the moon](../docs/32-sky-clouds-and-moon.md)

### [`local-frame.html`](local-frame.html)
Why there is no global north, made physical. Drag the walker and the two frames
separate: the blue one is carried and updated, the red one recomputed from the
pole axis — watch it go undefined as the walker crosses a pole.

The four loop presets are the point. Each walks a closed path and reports the
heading rotation beside the area enclosed; they agree to two decimals every time
— 0.65°, 90°, 180°, and a full turn for the equator. That is holonomy, and it is
why a carried heading is a camera state and never a stored coordinate.

The gold ring is the true horizon for a 1.7 m eye, drawn to scale: **76 m** on
the doc-06 planet. Switch the planet to Earth and it shrinks below drawable.
The violet dots are the twelve pentagons; the two gold ones are the antipodal
pair carrying the lat/long poles.

**Docs:** [13 — Gravity and orientation](../docs/13-gravity-and-orientation.md)

---

### [`pentagon-loop.html`](pentagon-loop.html)
The claim that costs the most elsewhere in the specification, made touchable.
Carry a heading right around a closed loop of cells and it comes back **turned by
one direction index — 60°** — but only if a pentagon is inside the loop. Drag the
loop away and it closes perfectly.

The grid is the real one (a subdivided icosahedron at level 5) and the transport
rule is lifted from `verification/rotation.js`, so what you see is what the script
measures. Two things worth watching: the loop is a **pentagon** when it wraps the
defect and a **hexagon** when it does not, and the flip happens exactly as the
pentagon crosses the loop — not as it gets further away.

**Docs:** [17 — Pentagons as a place](../docs/17-pentagons.md),
[19 — Directional blocks](../docs/19-directional-blocks.md)

---

## Rendering

### [`mesh-lod.html`](mesh-lod.html)
The tiling at five resolutions, reporting its own vertex and triangle counts.
Watch them converge on exactly **2 vertices and 4 triangles per cell** — the real
cost of an unmerged hex surface, twice a cube's and no worse.

The altitude slider is the argument. It draws the true horizon ring and colors
the cells inside it; at eye height that is **one hexagon on the whole planet**,
0.05% of the surface. The readout gives the figures for a real level-11 world and
the level that fits a 2M-triangle budget.

**Docs:** [14 — Meshing and LOD](../docs/14-meshing-and-lod.md)

### [`flat-map-of-a-sphere.html`](flat-map-of-a-sphere.html)
The whole planet drawn flat, twice, from the same cells and the same
projection. One picture keeps whichever cell reached a pixel last; the other
averages every cell that reached it. At subdivision 5 there are fewer cells
than pixels and the two agree. By subdivision 8 there are **ten cells to a
pixel**, and keeping one of them throws away 90% of what the map holds — which
reads as speckle, and is a rough reading of a planet rather than a rough
planet.

The point it settles is what a map pane has to do to be worth looking at. It is
also the reason the poles look the way they do: a row of pixels there is far
wider than the ring of cells under it, so a projection that stretches is
showing you something true about drawing a ball flat.

### [`precision-scale.html`](precision-scale.html)
A player taking twenty-four 10 cm steps, on a planet you can resize. Hollow
outlines are where the steps really are; solid bars are where a `float32` can
actually put them, and the number on a bar counts how many steps collapsed onto
it.

Drag the radius. All twenty-four land somewhere different on the worked-example
planet, on **six** positions at Earth radius, and on a **single** position by
Jupiter. The same twenty-four steps are drawn again underneath in chunk-local
coordinates, where nothing moves however far the slider goes — which is the whole
argument for anchoring positions to a chunk.

**Docs:** [15 — Precision and the floating origin](../docs/15-precision-and-origin.md)

### [`lighting.html`](lighting.html)
Two tabs. **Torch** puts the same flood fill on a hex field and a square field
side by side, light levels drawn in each cell, with a range slider. The counts
track `3r²+3r+1` against `2r²+2r+1`, so the **1.5×** is visible rather than
asserted, and the readout gives the pentagon figure — 5/6 of the area for the
same light.

**Terminator** spins a planet with a live day/night line and a day-length slider.
A walker stands still on the surface while the terminator sweeps over them, so
you watch day and night arrive as a *place* rather than as a clock value. It
opens on the anchor: a **2.12-hour** day, doc 06's circumnavigation time, where
the terminator moves at exactly walking pace. Slide it shorter and dawn overtakes
you; longer and you can outwalk the sunset indefinitely. Twilight is marked on
both terminators, and its duration is a fixed fraction of the day whatever the
planet's size.

**Docs:** [16 — Lighting](../docs/16-lighting.md)


---

### [`wade-or-swim.html`](wade-or-swim.html)
A shoreline in section, at the size the blocks really are. Drag the player into
the water and watch the states: dry land, then **one block — standing**, then
**two blocks — swimming**. There is no third state, because at 1 m blocks a 1.8 m
player has no depth available between 1 and 2.

That is the point. Walking and swimming is a **threshold exactly one cell wide**,
not a gradient, so the mover never needs a partial-buoyancy case. *Another
shoreline* reseeds the terrain — the band is one cell wide on every one of them,
because it is a fact about block size and player height, not about this coastline.

**Docs:** [25 — Water](../docs/25-water.md)

---

## Interaction

### [`ray-traversal.html`](ray-traversal.html)
Block picking as a grid walk. Drag the eye or aim point; numbered cells show the
walk order. Compare *cells walked* against *cells in field*. The white bar on the
hit cell is the entry edge, ready for placement. Aim through the triangle edge to
trigger the face-exit case.

**Docs:** [09 — Ray traversal](../docs/09-ray-traversal.md)

### [`pathfinding.html`](pathfinding.html)
A* on hexes versus squares on the same map. Watch the *Illegal cuts* column go
red on squares — structurally always zero on hexes. The *Chunks* toggle shows
hierarchical corridor search cutting the explored node count.

**Docs:** [10 — Pathfinding](../docs/10-pathfinding.md)

---

## A note on what is missing

Two earlier demos were built during design exploration and are deliberately not
included: an early Platonic-solids viewer superseded by `sphere-tiling-shapes`,
and a hardcoded truncated-icosahedron attempt that was **geometrically wrong** —
its vertex coordinates and face indices were invented rather than computed, and
it rendered as disconnected triangles.

Every demo here generates its geometry algorithmically from first principles.
That is the standard for anything added to this folder.
