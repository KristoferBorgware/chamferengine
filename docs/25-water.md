# 25 — Water

## What water is

**Two things, and the split is between the ocean and everything else.**

The **ocean is a surface**: one translucent shell at the sea-level radius,
drawn around the camera, with waves on it. It is not made of anything. Below it
the world is bare sea floor and air, and there is no water block anywhere in a
generated world.

**Water is also a block type** — translucent, placeable, with no collision,
written once and never simulated. That is the material a bucket carries, an
aquarium is built from, and a lake or a river will be made of when
[doc 21](21-rivers-and-erosion.md) grows them. It is not what the sea is made
of.

There is no flow, no pressure, no spreading, no level-seeking, in either.
**This is a construction toy, not a planetary simulator** — the nearest thing
to it is a box of hexagonal Lego, and water is one of the pieces. A translucent
one you can swim in.

[Doc 21](21-rivers-and-erosion.md)'s erosion still runs. It runs **once**, at
world creation, to decide where valleys go. After that it is finished and what
it leaves behind is ground.
[Doc 24](24-edits-and-global-processes.md) takes that decision and says why.

Three things follow, and they are the three parts of this document.

The first is **why the ocean is not blocks**, which is not the answer the
measurements first suggested.

The second is what a world 69% covered in translucent blocks *would have* cost
to **draw** — because transparency is the one thing a renderer genuinely finds
hard, [doc 14](14-meshing-and-lod.md) has carried it as an open question since
it was written, and the answer still governs every lake and every aquarium.

The third is what it means to **move** through a block that does not collide.
No collision sounds like water should not be there at all — but you do not fall
through water, you float in it. That turns out to be a different question from
collision, asked of a different thing, and answered by machinery the design
already has.

---

## The ocean is not blocks, and the faces were never why

Everything in the next four sections prices the ocean as blocks and finds it
**cheap**. Interior faces cull, so 1.6 million water cells draw 113,455 faces —
0.89% of the naive count. Nothing about that argument is wrong, and none of it
saved the block ocean.

What decides it is that the two do not scale the same way. A sea built out of
blocks is drawn out of columns, and columns quadruple with every level of
subdivision. A sea drawn as a shell is one fixed mesh, at every planet size and
every altitude.

> **[verified]** `verification/water.js`, section 6. Level 7, 60 m of relief,
> 1 m blocks, sea level set for 30% land; the shell is the disc the engine
> actually draws, 96 rings by 128 sectors:
>
> | | |
> |---|---|
> | Water cells | 1,589,689 |
> | Block slots in a 64-layer crust | 10,485,888 |
> | Share of the world that was water | **15.2%** |
> | Sea faces as blocks, level 7 | 113,455 |
> | Sea faces as blocks, level 11 | **29,044,127** |
> | One shell, any planet | **24,448 triangles** |
> | Ratio at the shipped depth | **1,188×** |

The 15.2% is memory a chunk holds rather than work a frame does, and the 0.89%
is genuinely small. **The last row is the whole argument.**

And there is a second reason that no amount of block work reaches. **A shell
can carry a wave, a sun sitting on it, and a colour that deepens with how much
water the look passes through. A block is one flat quad of one colour.**

**The shell is a layer of the world, not something carried around the camera.**
Sea level is a radius, so the sea is a sphere, and that sphere is cut into the
same triangles everything else is: each chunk the terrain selected gets a patch
of water at the level of detail the terrain chose for it. A chunk's triangle
subdivided is the same shape for every chunk at a level, so the meshes are
built once per level and a chunk is one instance carrying three corner
directions — which the vertex shader blends, one barycentric blend evaluated
once, the same construction every cell centre in the world is placed by.

Geometry that followed the camera instead is not what this is, and two things
went wrong with it that no tuning reaches. **A disc has a centre**, and the
sectors converging on the point under the viewer draw a starburst across the
whole ocean from any height. And **its vertices move through the wave field as
the player walks**, so the crests slide rather than staying where they are: a
wave has to be a function of the place it is at, or it is not in the world.

What the camera still decides is how far the swell is flattened, because a wave
shorter than the gap between two vertices is noise. **That is read off distance
and never off the level itself.** A point kept by both a fine patch and a
coarse one has to stand at the same height in each, or the water moves whenever
a chunk changes level — the same rule
[doc 14](14-meshing-and-lod.md) found for the ground, arriving here for the
same reason.

### The waves, and why a sphere changes the recipe

The wave field is the standard stylized one: fold a sine at its own zero
crossing so a crest is a crease rather than a dome, fold two bands that do not
line up and multiply them so a crest has a length and a width, then stack
three octaves at rising frequency and falling amplitude with two samples
travelling opposite ways in each. One direction alone slides the whole ocean
past the viewer like a conveyor; against each other they churn.

Fold two bands and you get a grid. That is not a flaw in the recipe, it is
what the recipe is: a crest stands where both bands fold at once, so the
crests sit on the crossings of two families of parallel lines, and if the two
bands run the same way everywhere then the whole planet is one sheet of graph
paper. Fly over it and you can see the weave.

**Count it rather than argue about it.** Take a patch of the field, work out
which way the surface tilts at every point, and sort those directions into 36
bins of five degrees each. A field with no preferred direction fills every bin
equally, so the fullest bin is 1.0 times the average. A field folded along two
fixed axes piles into a few: measured over a 400 m patch of the two-band form
the fullest bin runs **2.7 times** the average, and over 1600 m **2.9 times**.
A second reading agrees: shift the patch sideways by a wavelength and see how
well it still matches itself, and it comes back **0.46** — half the ocean
lands back on top of itself one wave over.

**The step that gets it wrong is the domain warp, and it gets it wrong by
being one warp.** The recipe bends its sample point by a noise field before
folding, which is what stops everything above being exactly periodic — sines
folded and multiplied are still sines. But bending the *sample point* moves
both bands together. The pattern slides to a new place with the angle its two
families cross at exactly as it was. That is a lattice carried, not a lattice
broken.

Give each band its own bend instead and the lattice shears. The crossing angle
is one thing here and another a few wavelengths away, so the crests curve and
fan the way a real swell does. Same measurement: the fullest bin drops to
**1.8** over 400 m and **1.9** over 1600 m, and the shifted-patch reading
falls from 0.46 to **0.04**.

Two numbers set how far the bend reaches. It carries **12 radians** of phase
and it is read off a noise field a **sixteenth** of the octave's own
frequency — one rise and fall of the bend across sixteen waves. Read it at the
octave's own frequency instead and the bend has a slope of its own comparable
to the wave's, so it stops turning crests and starts inventing them: the
surface goes from water to crumpled foil. Only the **first two** octaves are
bent. Bending all three measures 1.80 against 1.85 and each bent octave is two
more noise lookups; bending only the first reads 2.13, which is a weave again.

**And three octaves, not four.** A patch of sea is cut to at most 16 pieces a
side and a chunk is 64 m, so a vertex stands every 4 m. The third octave is a
12.5 m wave — three vertices across it, which is the last one the geometry can
draw. A fourth would be 6.6 m, under two vertices, and a wave with two
vertices across it is not a wave: its crests would sit wherever the sampling
happened to land and move as the camera does. Measured, adding it changes the
shifted-patch reading from 0.101 to 0.102, which is nothing.

**On a sphere the bend has to be 3D noise on the direction vector.** On flat
ground it would be 2D noise over the xz plane. There is no such plane here: a
sphere has no seamless two-dimensional parameterisation, which is the hairy
ball theorem again, the same one that forbids a global north
([doc 13](13-gravity-and-orientation.md)). So it is noise sampled from the
direction in three dimensions, exactly as the terrain samples in 3D world
space rather than in face-local coordinates, and for exactly the same reason:
a texture laid across a sphere tears along a seam, and a dot product against a
fixed axis does not.

A phase being a dot product is what makes the bands themselves seamless. A
wave is a band wrapping the whole planet, continuous everywhere, with no face
edge to cross and no pole to pinch.

### A wave that rocks is a wave with one clock

Lay the crests out well and the water can still look wrong the moment it
moves. The recipe drifts its bands by adding `speed × time` to the phase, and
that one line has two problems in it.

**A folded band repeats every half wavelength of phase.** `1 - |sin(p)|` comes
back to itself every `pi` of `p`, and `p` is `dot(direction, axis) × k + speed
× time`. So after `pi / speed` seconds every band is exactly where it was — and
if all six bands of all three octaves share one `speed`, the whole planet is.
At the shipped speed that is **3.93 seconds**. Measure it the same way as the
layout, along the clock instead of across the water: hold three thousand points
still, sample them now and again later, and correlate. The one-clock field
comes back to a match of **1.000**. Not nearly, not mostly — the same ocean,
four seconds later, forever.

**And a pattern added to its own time-reverse is a standing wave.** The recipe
samples each octave twice, once drifting each way, on the argument that one
direction alone slides the whole ocean past like a conveyor. That is true, and
two mirrored copies of the *same* clock is the other failure: the crests go
nowhere at all. They rise and fall in place. Rocking.

Three changes, each removing one way the field can repeat, and none of them
costing a lookup:

- **A clock per band.** The two bands of an octave run at rates with no
  whole-number ratio between them (0.76), so their crossings travel instead of
  pulsing. That alone takes the 3.93-second reading from 1.000 to **0.498**.
- **A clock per octave, from the dispersion of deep water.** A wave travels at
  the square root of its wavelength, so an octave at 1.9 times the frequency
  runs `sqrt(1.9)` times as fast. Physical, and it leaves the three octaves
  sharing no period: **0.416**, and the worst match anywhere in thirty seconds
  drops to 0.78.
- **The bend travels too.** The crests move; so do the groups they arrive in.
  Sliding the bend field along at 3.4 m/s is the largest single part of the
  reading — with it held still the surface still comes back to **0.84** of a
  moment fifteen seconds earlier, and with it moving the best match anywhere in
  thirty seconds is **0.31**.

The mirrored second sample stays, because with two different clocks it is no
longer a mirror: it is the same water travelling the other way, and the two
interfere and churn, which is what the original argument wanted. Only the
clocks are mirrored and never the bend — the bend says *where* the crests are,
and both copies are the same sea.

The layout is untouched by all of this. Sampled at one instant the field is
the same field, so the slope-direction reading stays at 1.7 and 1.9 and the
shifted-patch reading at 0.09 and 0.04.

### Two patches that meet are not the same size

Sea patches are cut from the chunks the terrain picked, and the selection drops
a chunk's level with distance: a chunk twice as wide as its neighbour cuts the
shared edge into vertices twice as far apart. Where the finer side puts a
vertex halfway along one of the coarser side's segments, the wave lifts it off
the straight line the coarser side draws, and the two surfaces part along a
slit that goes right through to the sea floor. From the air that reads as
dotted lines of sand colour running along every chunk edge, and it gets worse
the taller the waves — a cap on the one knob a player is most likely to raise.

Set the wave height to zero and the lines all but vanish, which is what says
they are the waves and not the shading.

The fix is a **curtain**: each patch hangs a strip from each of its three rims,
straight down, as deep as the swell is tall. A curtain vertex stands where its
rim vertex stands and carries the rim's own wave, so the strip closes whatever
gap the neighbour left.

Hanging it is the easy half. **The order it is drawn in is the whole of the
rest.** The sea is translucent and it writes depth, so two layers of water over
one pixel is a dark band, and a curtain that blends before a neighbour's
surface is drawn over it produces exactly that — a dark outline of every chunk,
which is worse than the slit it closed. So the draw goes in two passes over the
same patches: **every surface, then every curtain**. By the time a curtain is
rasterized the depth buffer already holds the nearest water everywhere, so the
depth test throws the curtain away wherever the sea is closed and keeps it only
in the slits. It costs one extra draw call and 96 triangles a patch against
256, and nothing at all where there is no gap.

### Below the last wave the geometry can draw, the slope is painted on

Stop at three octaves and the water between two crests is a sheet of glass.
Everything from 12.5 m down — the metre-scale texture that makes water look
wet — is missing, and it cannot be put back as geometry, because there are no
vertices to put it on.

Put it back as a **slope** instead. Nothing about shading needs a vertex to
have moved: the sun on the water is a dot product against the surface normal,
so tilting the normal at each pixel is indistinguishable from having bent the
surface, right up until the silhouette. At 12.5 m and under there is no
silhouette to get wrong.

So the fragment shader reads three octaves of noise, takes their **gradient**
rather than their value, and tilts the normal by it. The gradient is the
useful trick: value noise mixes eight hashed lattice corners, and the
derivative of that mix falls out of the same eight corners. One lookup gives
both. Measuring the slope by sampling the height four times instead would cost
four.

How much tilt is the whole decision. A ripple is read as a slope and never as
a height, so what it changes is how far the surface leans — the widest octave
is set to about **0.06** of tilt. Past roughly 0.2 the sun's highlight
stops being a path and breaks into separate lit pixels, and the water reads as
glitter rather than as water. It fades out over the same stretch of distance
the swell flattens over, and for the same reason: a wave narrower than the
pixels drawing it is a shimmer.

The same noise does one more job. Foam is a band drawn where the surface
stands near the top of a wave, and how near is one number carried per vertex,
so a band cut straight across it has the straight edges of the triangle it was
interpolated over — foam in polygons. Moving the edge of the band by a noise
field a few metres across gives it the ragged outline foam has.

### The sea is in the shade of everything, being the lowest thing there is

Sea level is the bottom of the world, so anything standing anywhere between the
water and the sun is between the water and the sun. A headland at sunrise
throws its shadow across the bay beside it as surely as across the ground
behind it — and the shoreline is exactly where a person standing on a beach is
looking, so a shadow that stopped there would stop in the one place it is most
obvious.

The water therefore walks the coarse map toward the sun, the same walk the
ground takes ([doc 16](16-lighting.md)). It is the same walk in the literal
sense: one piece of shader source, included by both, declaring its own bind
group and taking the sun as an argument so it depends on nothing either shader
has to hand it. Two copies of a march that reads a height map and steps toward
a light would drift apart at the first tuning.

What the shadow takes from the water is the sun's share and not the sky's: the
hard highlight and the sunlit half of the tint go, and the sky the surface
reflects stays exactly where it was. That is the same split the ground uses,
and it is why shadowed water reads as darker water rather than as a hole.

> **[measured]** `tools/frame-diff.mjs`, 48,400 pixels of a lake under a
> mountain range at a low sun. Lit: mean 60.0. Shadowed: **53.5**, with the
> ninety-fifth percentile of the ratio at **1.376** — the deepest part of the
> shadow is more than a third darker than the same water in the open.

### At night the moon lays a path across it

The sun's highlight has a twin. The same half-vector, the moon's direction, a
colder colour and a much dimmer one, gated by whether the moon is over this
place's horizon and faded in as the day goes down.

It is cut looser than the sun's — 0.975 against 0.985 — because a moon path on
real water is a broad smear rather than a hard glint, and a threshold as tight
as the sun's on a light that dim draws a handful of lit pixels rather than a
path.

### Swell arrives in groups

One more thing separates open water from a texture: real swell is not the same
height everywhere. A stretch of sea runs its full height and the next stretch
is half of it.

That is one noise lookup over about twelve wavelengths, scaling the whole
swell. It only ever scales **down**, from 1 to `1 - depth`, so the height a
person asks for stays the tallest wave on the planet rather than an average
the field wanders either side of. And it is a scale over the surface rather
than a term inside it, so the vertex shader applies the one value to the
height and to both slopes and the wave field is evaluated no more often than
before.

Three consequences:Three consequences:

- **The sea floor is bare.** Ground below sea level is sand and stone with air
  above it. Anything drawn there is drawn through the shell.
- **A player cannot remove the ocean**, and nothing had to be written to refuse
  it. There is no block there to break.
- **Being in water is a radius test**, not a block read: below the sea surface
  radius and not inside something solid is in the sea. The surface radius is
  snapped to the layer grid the ground is built on, or flat ground at sea level
  measures a block under water and a player swims on the beach.

---

## A body of water is a skin, not a solid

**This section and the four after it measure a body of water made of blocks**,
which is what a lake, a river and a player-built aquarium are. A body of water
is a body of water; the ocean's size is the only thing that put it on the other
side of the scaling line above.

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

## You float in it, and you can always get out

No collision does not mean nothing happens. **You do not fall through water** —
you float in it and move freely, in any direction, which is the one place water
behaves unlike every other block in the world.

That is a rule about the *mover*, not about the terrain, and the distinction is
worth being precise about because they are two different queries:

- **Collision asks about a face.** Can I pass through the boundary between these
  two cells? For water the answer is always yes.
- **Buoyancy asks about a cell.** What am I inside right now? That is
  [doc 04](04-position-lookup.md)'s position → cell lookup, which is exact and
  already written, plus one block-type read.

So swimming needs no new system. It needs the lookup that already exists,
answering a question the collision pass never asks.

### The shore is a ramp, not a wall

For "float and swim" to be playable rather than annoying, two things have to be
true of the world the generator makes: shallow water has to exist, or every
shoreline is a plunge, and the bank has to be climbable, or a swimmer is trapped.

Neither was designed. Both fall out of water filling a valley, because a valley
has sides.

![A blocky cross-section through a shoreline: land stepping down into a basin, one block of water at the edge where a figure stands, deeper water where a figure floats](figures/wade-or-swim.svg)

*The wading band is the single ring of columns where the water is one block deep.
Step one cell further out and the floor is 2 m down, past a 1.8 m player's feet.
That is the whole transition — there is no chest-deep state to model, because a
1 m block cannot represent one.*

> **[verified]** `verification/water.js`, section 4. Over the 4,189 shore columns
> — wet columns with dry land next to them — on the same world:
>
> | | |
> |---|---|
> | One block deep at the edge | **85.3%** |
> | Two blocks | 13.9% |
> | Three or more | 0.7% |
> | Shore columns you can step out at (bank ≤ 1 m) | **99.9%** |
> | Bodies of water with at least one exit | **58 of 58** |
> | Worst bank anywhere | 1.23 m |

**Nothing traps a swimmer.** Every one of the 58 bodies of water on the planet
has a bank you can step out at, and almost every column of its shore is one.

### The threshold is one cell wide

Look again at the depth table. At 1 m blocks a 1.8 m player stands in one block
of water and swims in two — there is no depth in between, because there is no
block in between.

**So walking and swimming is a threshold, not a gradient.** The mover reads the
cell it is in, and gets one of two answers. No partial buoyancy, no waterline
fraction, no blending between two movement models.

**Walk into it yourself:** [`demos/wade-or-swim.html`](../demos/wade-or-swim.html)
draws a shoreline at block scale and lets you drag a player across it. Dry land,
one block standing, two blocks swimming — and no third state on any shoreline it
generates, because the band's width is a fact about block size against player
height rather than about any particular coast.

### Test the step, not the end of it

One bug follows directly: a block with no collision is exactly a block a fast
mover can pass straight through.

> **[verified]** `verification/water.js`, section 4. A player falling at roughly
> terminal velocity, 50 m/s:
>
> | Frame rate | Distance per frame |
> |---|---|
> | 144 Hz | 0.35 m |
> | 60 Hz | 0.83 m |
> | 30 Hz | **1.67 m — skips a cell** |
> | 20 Hz | **2.50 m — skips two** |

Sample only where the player *ends up* and a diver at 30 Hz lands on the bottom
of a shallow pond having never been in the water. **Walk the swept segment
instead** — which is [doc 09](09-ray-traversal.md)'s ray traversal, cell by cell,
with the block test changed from solid to water. The machinery is already there.

---

## Water is placeable

A bucket exists. Players can place water as well as remove it, and a placed water
block stays exactly where it was put — floating in mid-air if that is where it was
put, because nothing spreads and nothing falls.

This is the same rule as every other block, and it is the rule
[doc 24](24-edits-and-global-processes.md) already argued for. **A world of
translucent Lego is one where a wall of water is as buildable as a wall of stone.**

It costs two of the measurements above their generality. Exactly which:

- **"Zero exposed sides" describes the generated world only.** It was always
  stated that way — generated water is held in by land at or above its own level
  — and placement is precisely the thing that creates the other kind. An aquarium
  has four sides, and the mesher draws them the same way it draws any other
  water face.
- **"One surface in view" is a measurement of generated water too.** Build an
  aquarium in front of a lake and a sight line crosses two. That is fine: the
  draw order is back to front either way, and it is a per-chunk distance sort.
  **No measurement of the generated world can bound what someone chooses to
  build** — but the sort was never the expensive part, and a player who builds a
  hall of glass tanks has chosen that cost knowingly.

Neither changes the renderer's design. They change how tight the numbers in it
are, which is a different thing, and only where a player has been.

---

## What an edit costs

Nothing beyond the edit itself, which is the point of
[doc 24](24-edits-and-global-processes.md)'s decision.

> **[verified]** `verification/water.js`, section 5.
>
> | Action | Cost |
> |---|---|
> | Remove one water block | one delta, 57 bits ([doc 03](03-addressing.md)) |
> | Place one water block | one delta, and it stays where it was put |
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

- **[Doc 08](08-terrain-generation.md)**'s material pass places **nothing**
  below sea level: above the ground is air, whichever side of the sea it is on.
  The water line still decides the shore's material, so a beach is sand.
- **[Doc 14](14-meshing-and-lod.md)**'s open "water and transparency" question is
  closed: two draw passes, and a sort of one thing.
- **The sea is a handful of instanced draws, one per level of detail in view,
  and it is the layer after the opaque terrain.** It tests against the
  terrain's depth, so ground above the water hides it without anything being
  sorted, and it **writes** depth, so a cloud on the far side of the water does
  not draw through it.
- **The mesher needs two vertex streams per chunk** — opaque and translucent —
  which is standard and costs one extra buffer.
- **Physics gains two rules, and they are separate.** Water blocks do not
  collide — that is the face test. And a body inside one floats rather than
  falling — that is a cell test, [doc 04](04-position-lookup.md)'s lookup plus a
  block-type read. Neither needs a new system.
- **[Doc 09](09-ray-traversal.md)'s ray walk gains a second caller.** The mover
  has to walk its swept step to find the water it entered part-way through, with
  the same traversal and a different block test.
- **[Doc 07](07-data-structures.md)**'s delta store gains nothing at all. A placed
  water block is a delta like any other, and it never moves afterwards.
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
- ~~Whether water is placeable~~ — **decided: it is.** A bucket exists, and a
  placed block stays where it was put. Earlier drafts of this document left it
  open on the grounds that placement is the only way an exposed vertical water
  face is ever created. That is still true; it is simply now a face the mesher
  has to draw, which it does the same way it draws every other one.
- **How a swimmer moves, as opposed to whether they do.** Speed, drag, how fast
  you sink or rise, whether there is a breath limit. All game design, none of it
  constrained by the geometry here.
- **Water you can build against gravity.** Placement allows a column of water
  with nothing under it. That is the consistent answer and it is the one every
  other block gives, but nothing here asks whether it is the *fun* one.
- **Shorelines at a LOD seam.** A coarse chunk and a fine one both put the sea at
  the same radius, so the surfaces agree exactly — but where the *shore* falls
  depends on the terrain height, which is resampled. Doc 14's seam ownership
  should cover it; nothing has checked.
- **Rivers narrower than a cell.** [Doc 21](21-rivers-and-erosion.md) carves
  channels about one coarse cell wide. A stream narrower than a block cannot be
  represented as blocks at all, so small watercourses either widen to one cell or
  do not exist.
- **The shell reads its water depth from the wrong quantity.** How opaque the
  sea is, and which of its two colours it takes, both come from how far the
  fragment is from the camera. What decides both in every stylized water shader
  is the **thickness of water the look passes through** — the depth of what is
  behind the surface, minus the surface's own, through Beer-Lambert absorption.
  The two agree standing on a beach and part company from the air, where a
  metre of water over a sandbar draws as opaque as a kilometre of ocean. It
  also blocks refraction, caustics and shoreline foam, which all want the same
  number. The obstacle is structural: the sea draws inside the terrain's own
  pass, and a pass cannot sample the depth it is testing against. Filed as
  F-049 with what the two ways out cost.
- **What a lake and a river are drawn as.** Neither exists yet. The scaling
  argument that took the ocean out of blocks does not reach them — a lake is a
  bounded thing whose face count does not grow with the planet — but nothing
  has measured whether one shell per body is cheaper than the blocks, or how
  two water surfaces at different radii meet where a river runs into the sea.

---

## In one breath

- **The ocean is a surface**, one translucent shell at the sea-level radius with
  waves on it. Below it is bare sea floor and air. Water is **also a block
  type** — translucent, no collision, never simulated — and that is what a
  bucket carries and what a lake will be. There is no fluid system in this
  design.
- **The sea is a layer of the world**, cut into the same chunks as the ground
  and drawn at the levels the ground picked — finer underfoot, coarser at the
  horizon. Nothing about it follows the camera.
- **Two folded bands multiplied make a grid, and one domain warp does not
  break it.** Warping the sample point slides the lattice somewhere else with
  its crossing angle intact. Giving each band its own bend shears it: the
  slope directions of a 400 m patch go from piling into one bin **2.7×** the
  average to **1.8×**, and the patch shifted a wavelength matches itself
  **0.46 → 0.04**. Twelve radians of bend, read over sixteen wavelengths, on
  the first two octaves of three.
- **Three octaves and no more.** A vertex stands every 4 m, so the third is a
  12.5 m wave at three vertices across and a fourth would be 6.6 m at under
  two — crests that move with the camera. Adding it moves the repeat reading
  from 0.101 to 0.102.
- **One clock makes the whole planet repeat.** A folded band comes back to
  itself every `pi` of phase, so one drift rate for every band and octave means
  the same ocean every `pi / speed` seconds — **3.93 s** at the shipped speed,
  measured as a **1.000** match against four seconds earlier. A rate per band,
  a rate per octave from deep-water dispersion, and a bend field that travels
  at 3.4 m/s take the worst match anywhere in thirty seconds to **0.31**. The
  travelling bend is the biggest of the three: held still, the surface still
  comes back to **0.84**.
- **The sea is in the shade of everything**, being the lowest thing there is.
  It walks the coarse map toward the sun with the same shader source the ground
  uses, and the shadow takes the sun's share and leaves the sky's: a lake under
  a range reads **53.5** against **60.0** in the open, and the deepest part of
  it is more than a third darker.
- **At night the moon lays a path across it** — the sun's highlight with the
  moon's direction, cut looser because a moon path is a smear rather than a
  glint.
- **A curtain closes the seams, and the draw order is the whole of it.** Two
  patches that meet are different sizes, so the finer one lifts a vertex off
  the line the coarser one draws and the water splits. Each patch hangs a strip
  from its rim as deep as the swell is tall — and every surface is drawn before
  any curtain, so the depth test keeps a curtain only in the slits. Interleaved,
  a second layer of translucent water outlines every chunk in the dark.
- **Below 12.5 m the slope is painted, not built.** Three octaves of noise read
  for their **gradient** — which falls out of the same eight lattice corners
  as the value, so one lookup does both — tilt the normal per pixel. About
  **0.06** of tilt at the widest; past 0.2 the sun's path breaks into separate
  lit pixels and the water reads as glitter.
- **The faces were never why.** As blocks the ocean drew **113,455 faces —
  0.89%** of the naive count, and held **15.2%** of the crust's block slots.
  What decided it is that block faces quadruple per level while a shell does
  not: **29,044,127 against 24,448** at the shipped depth, a factor of
  **1,188×**. And a shell carries a wave and a sun; a block is one flat quad.
- **A player cannot remove the sea**, and nothing was written to refuse it.
  There is no block there.
- **A body of water is a skin.** Interior faces cull like any other material —
  which is what governs every lake, river and aquarium.
- **Generated water has no exposed sides at all.** A vertical face of water only
  exists where a player built one.
- **The sea surface is the only exactly flat surface on the planet**, because sea
  level is a radius — so it merges to doc 14's full curvature limit, **37 cells
  into one quad**.
- **You look through one surface, almost always**: **82.3%** of viewpoints see one
  body of water and 0.6% see two. Transparency sorting is a sort of one thing.
- **You do not fall through it.** No collision is a face test; floating is a cell
  test, and the cell test is doc 04's lookup that already exists.
- **The shore is a ramp.** **85.3%** of the water's edge is one block deep, you
  can step out at **99.9%** of it, and all **58** bodies of water have an exit.
  Nothing traps a swimmer, and nobody designed that — a valley has sides.
- **Walking and swimming is a threshold, not a gradient**, one cell wide: at 1 m
  blocks a 1.8 m player stands in one block of water and swims in two.
- **Water is placeable.** Which is what creates the only exposed vertical water
  faces in the world, and the only views through two surfaces — both of those
  numbers describe the **generated** world and cannot bound what a player builds.
- Editing water costs **exactly what editing stone costs**, because nothing
  propagates.
