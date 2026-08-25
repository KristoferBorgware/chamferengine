# Demos

Thirty-four self-contained HTML files. No build step, no `npm install`, no
server required — open any of them directly in a browser. All are mobile-friendly
and touch-enabled.

Most of the 3D demos load Three.js r128 from a CDN and need an internet
connection. The 2D ones are fully offline, and so is
[`noise-lab.html`](noise-lab.html) and [`cave-lab.html`](cave-lab.html), which
draw their own WebGL2.

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

### [`cave-lab.html`](cave-lab.html)
**A cave system drawn as a plan in 2D, then extruded into a volume of hexagon
columns.** The panel carries the plan as a picture and the volume as a block of
ground you can turn, cut open and look into; **Draw · void** turns the world
inside out and draws the caves themselves as the solid, which is the only view
that shows a network from outside it.

The plan is a **band around zero** of a noise field over the ground: a passage
is where the field sits near zero, so the passages are the field's own contour
lines and they wind, branch and join. **Passage families** is how many
independent fields are laid over one another — one field's contours can never
cross each other, and a second field's can cross the first's.

**One field gives both the shape on the ground and the shape across it.** How
far inside the band a column sits says how tall the passage is there, so
**Cross-section** shapes the roof from the same lookup that decided the plan:
below 1 a domed tube, above it a pointed one. **Floor below the surface** and
**Depth varies by** put the passage in the crust, and where the roof pushes
through the ground a passage opens a mouth in a hillside.

**The contour is drawn twice, and the two are worth comparing.** Blue is
marching squares over a square raster — sixteen cases, two of them saddles the
four corners cannot decide. Orange is the same contour taken on the **lattice
the world is built on**: three adjacent cells are a triangle, so the cases are
eight and **none of them is ambiguous**, because three points have no saddle.

The readout is the point of the page. **Narrowest way through** is how many
cells wide a passage is where it pinches, which is what says whether it can be
walked; **separate systems** and **half the void is in the biggest** say whether
a plan that reads as a network on paper survives being drawn in hexagons; and
**faces per column** prices the caves against the same ground with none.

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
