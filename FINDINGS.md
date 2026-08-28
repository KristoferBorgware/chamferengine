# Findings

Things noticed while doing other work, that are not in the plan and are not
being fixed right now. Written down so they are not lost and not rediscovered.

[`HOW-TO-WRITE-FINDINGS.md`](HOW-TO-WRITE-FINDINGS.md) says what belongs here
and how to write one. The open list stays in the order things were found.

---

## Open

### F-092 — The multi-noise and vegetation labs draw the patch as a mirror of their own map

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-28, tracking down why the biomes lab's patch disagreed with
the picture of the same ground
**Where:** `demos/multi-noise-lab.html`, `demos/vegetation-lab.html`

**What happens.** Both labs build a patch-local frame as `east`, `up`, `north`
and hand the renderer `[east, up, north]` as `[x, y, z]`. That triple is
**left-handed** — measured in the biomes lab before the fix,
`cross(east, up) · north` is exactly **−1** — and a left-handed basis given to a
right-handed renderer draws the mirror image. Projected from overhead at yaw
zero, the frame's east lands at screen **+0.104** (the right, where the picture
puts it) and its north lands at **−0.185**, the bottom, where the picture puts
the top. So the view is the map flipped top to bottom, which is a reflection
rather than a turn: no camera angle recovers it.

**Why it matters.** Both labs draw the same ground twice, once as a picture of
the patch from above and once as hexagon columns, and the two are meant to be
read against each other. They disagree about which side of a hill a cliff is on.
It is invisible on a symmetric landscape and obvious on a coastline, which is
where a person looks.

**What would fix it.** One line in each: `local()` writes the negated north
component into `localP[2]`, so the renderer's third axis is south and the triple
is right-handed. That also makes yaw zero the view from the south looking north,
which is the orientation the map already draws — north away from the eye, east
on the right. `demos/biomes-lab.html` carries the fix and the comment that
explains it.

### F-091 — The labs measure latitude from the Y axis, and the engine's pole is a pair of icosahedron vertices

**Kind:** risk
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-27, giving `demos/biomes-lab.html` a temperature field that
falls off with latitude
**Where:** `demos/biomes-lab.html`, `demos/multi-noise-lab.html`,
`demos/vegetation-lab.html`, `packages/engine/src/coordinates/`

**What happens.** `directionOf(latitude, longitude)` in all three labs returns
`[cos φ cos λ, sin φ, cos φ sin λ]`, so the pole it measures from is `+Y`. The
engine's polar axis runs through icosahedron vertices **0 and 3**, which is
`normalize(-1, φ, 0)` and its antipode — not `+Y`, and not anything near it. The
same is true of the equirectangular projection every lab picture is drawn in.

**Why it matters.** It was cosmetic while latitude only chose where the patch
stood: a place is a place under any naming, and the pictures are a viewing
convenience. A climate field ends that. Temperature in the biomes lab is
`1 - 2|dir · pole|`, so the pole decides where the ice is, and a world built
from the lab's numbers has its ice caps in different places from a world built
from the engine's. **The twelve pentagons sit on exact multiples of 36° of
longitude about the engine's axis and nowhere in particular about `+Y`**, so
the two also disagree about whether a pentagon is at a pole — which is the one
fact doc 20 chose the axis to get.

**What would fix it.** One constant and one projection. `POLE` becomes
`VERTICES[0]`, `directionOf` builds its frame from that axis with the prime
meridian through vertex 11, and `pictureDirection` inverts the same construction
so a picture's rows are the engine's own parallels. The cost is that a latitude
and longitude written in a link mean a different place than they did, across
every lab at once — which is an argument for doing all three in one change
rather than for leaving it.

### F-090 — Nothing in the vegetation lab checks any more that a chunk generates the same stand alone

**Kind:** risk
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-27, rebuilding `demos/vegetation-lab.html` around vegetation
layers
**Where:** `demos/vegetation-lab.html`

**What happens.** The lab still cuts the patch into chunks and still grows every
plant within reach of a chunk's rim from the address and the seed alone -- that
part is unchanged and is not a switch any more, because the other way is not on
offer. What is gone is the **audit**: the second pass that generated the same
ground in one piece and compared it cell for cell, which read **0 cells differ**
and climbed to **704** at an 8 m reach and **10,702** at none. It was a
checkbox in the `Chunks` section, and that section came off the panel with the
`Ground` one when the layers arrived.

**Why it matters more now than it did.** Every rule the audit was watching is
now **per layer**: a layer's hash salt, its own noise stack, its own curve, the
order the layers are offered a cell in. Any of those read from something a
chunk cannot know -- a list position, a neighbour's answer, the patch's own
frame -- and two chunks would disagree about a tree on their boundary. The rank
rule alone once took the audit from 0 to 10 differing cells, and it was one line.

**What it would take.** The pass itself is thirty lines and it still exists in
git; what it needs is somewhere to live now that its section is gone. The
honest place is the readout in the left panel, as a fact rather than a knob --
it belongs with the other things read back off the ground after the fact. The
cost is what took it off in the first place: a second full generation, which
roughly doubles a rebuild. So it wants to run on a settled draft only, the way
it used to, or behind a key nobody presses by accident.

### F-089 — Growing a stand of plants is one synchronous stretch, and it is already cut into the pieces a worker pool wants

**Kind:** gap
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-27, profiling `demos/vegetation-lab.html` before porting it
into the engine
**Where:** `demos/vegetation-lab.html`, `packages/engine/src/mesh/worker/`

**What happens.** The lab rebuilds the whole stand inside one animation-frame
callback. At level 0 that is **1,595 ms** of unbroken JavaScript on the thread
that draws, so nothing on the page answers for the whole of it -- a slider
dragged across its range queues one of these per settle and the panel locks up.
Nine algorithmic fixes took it from **4,990 ms**, and the shape did not change:
it is still one task, and the next factor of two would not change it either.

**Why the shape is the answer rather than the constant.** Vegetation here is
terrain -- a plant is blocks, drawn by the chunk's own mesher at the chunk's own
level. So it belongs where terrain already goes:
`WorkerMeshSource` hands a pool of workers one chunk at a time, tells each one
the world once as a `MeshWorkerSetup`, and takes a mesh back. **A chunk already
generates its whole stand alone and audits to zero cells differing**, which is
the property that pool requires and the one thing a lab is most likely to fake.
Nothing about the plants would have to move: `MeshWorkerSetup` grows the fields
a species table needs, `meshChunk` grows a call, and the plants are written into
the block array the mesher already reads.

**What it would cost, measured.** Cutting the patch into chunks looks like it
should cost time -- a chunk grows every plant within reach of its rim, **6.84x**
the roots it owns at the shipped 24 m -- and measured it costs none, because a
chunk refuses to write what it does not own and that refusal pays for what it
grows twice: the same stand runs **6.1 s cut into chunks against 6.9 s in one
piece**. So a pool over `n` cores divides the wall
clock by very nearly `n`, and the freeze goes away outright at `n = 1`.

**What this is not.** It is not a reason to stop optimising: a worker pool moves
the work off the drawing thread and does not make it smaller, and the engine
runs a chunk mesher on those same cores already. What is left in the profile is
flat -- the leaf stamp is still the largest single term at about a quarter of
the rebuild, and after it come terrain noise, the position-to-cell pipeline the
rod walk runs at every step, and the mesher, none of them far apart. The one
named lead is that pipeline: `faceOf` searches all twenty face centroids at
every step of every rod, where the shadow march already **rechecks the face it
was last in** rather than searching, which is three dot products against
twenty.

### F-088 — The multi-noise lab evaluates terrain noise at every block; the engine reads a coarse map and ramps between readings

**Kind:** unverified claim
**Milestone:** 0.5.0
**Priority:** low
**Effort:** small
**Found:** 2026-08-26, moving `demos/multi-noise-lab.html` onto the block grid
**Where:** `demos/multi-noise-lab.html`, `packages/engine/src/generation/coarse/`

**What happens.** The lab's patch is now cut at the block level rather than the
map's, and every column reads the three noise stacks **at its own direction**.
The engine does not: `columnAt` reads a height off the coarse map, which holds
one value per map cell, and the ground between two readings is a straight ramp.
So at **Block detail 2** the lab draws four blocks across a map cell, each with
its own noise reading, where the engine would draw four blocks on one ramp.

**Why it may not matter.** The narrowest octave any layer is allowed is two map
cells, so the field is smooth at the scale the ramp spans and the two ought to
be within a fraction of a block of each other almost everywhere. Nothing has
measured that. What it would take is one probe reading a layer both ways over a
patch and reporting the distribution of the difference in blocks -- and a
straight answer would either close this or say what **Block detail** costs in
honesty above the level the map is at.

**What it is not.** It is not the reason the carve reads the same at every block
detail (70.8% of columns overhang at detail 2 against 71.4% at detail 3): the
density layer is 3D and is read per point at every setting, so it never goes
through the map at all.

### F-078 — The cave function in the engine is not the cave function the corpus measured

**Kind:** risk
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-25, reading the generator before discussing cave generation
**Where:** `packages/engine/src/generation/terrain/caveDensity.ts`; the
measurements are `verification/volume.js` section 3 and doc 14's cave table

**What happens.** Two different carving rules share one name. Doc 08 and
`verification/volume.js` argue a **signed density** — solid where
`(surfaceRadius − r) + noise × strength > 0` — whose first term is a bias
growing 1 per metre of depth, which is where the rule *an enclosed void needs
the noise gradient, amplitude over feature size, to beat 1* comes from, and
where doc 14's `11×` face bill and `13–32%` multi-span columns were measured.
`caveDensity` does not do that. It is a **band around zero**: hollow where
`|fbm| < caveThreshold`, three octaves at a `caveScale` of 24 m, with a hard
refusal inside `caveCeiling`, 6 m, of the surface. There is no bias term, so
there is no gradient to beat, and the doc comment on the function states the
gradient rule anyway.

**Why it matters.** Every number the project holds about caves describes the
form that is not running. A band of fixed width carves **sheets of roughly one
thickness everywhere**, and the two knobs a person would reach for move it in
ways the corpus does not predict: raising `caveThreshold` widens every passage
at once rather than opening more of them, and `caveScale` moves feature size
with no coupled amplitude. So the first attempt to tune caves will be tuned
against measurements taken of something else, and the face and column counts
that F-025 and doc 14 rest on — `1,074` cave mouths, `13–32%` of columns with
more than one span — are counts of the density field's caves, not of these.

**What would fix it.** Decide which form ships, then make one of the two match
the other. If the band stays, `volume.js` gains a section measuring it — face
cost, multi-span share, mouth count — and the gradient sentence comes off
`caveDensity`'s comment. If the density field is wanted instead, the band goes
and the function becomes the expression doc 08 already draws. Either way it is
one function and one verification section; what it must not stay is two forms
under one name.

---

### F-082 — `--bad` is defined as itself, so nothing the panel refuses is drawn in red

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** low
**Effort:** small
**Found:** 2026-08-25, while putting the readout behind a button in the corner
**Where:** `packages/client/src/planet.css`, the palette at `:root`

**What happens.** The palette reads `--bad: var(--bad);`. A custom property
whose value names itself is invalid at computed-value time, so it resolves to
nothing and every declaration reading it falls back. Measured in the browser
against a `div` given both: `color: var(--bad)` computes to
`rgb(232, 236, 242)`, which is the same as an element given no colour at all,
and `border-left: 2px solid var(--bad)` computes to `none` at `0px`. The
sibling `--warn` resolves to `rgb(255, 180, 84)` in the same page, so this is
one entry and not the whole palette.

**Why it matters.** The two readers are `.knobs-problems p` and
`.knobs-problems.some`, which are how the parameter panel says a world cannot
be built — a crust too shallow for its own sea, a map too coarse for its
narrowest octave. Both are drawn as ordinary body text with no left bar, so a
refusal looks like a sentence somebody added rather than a stop, and the
`some` class marks nothing. Every other state in the panel has a colour that
says what it is: amber for a knob pulled to a wall, green for a toggle that is
on.

**What would fix it.** One literal in the palette. The value is a decision
rather than a lookup — the other four are hand-picked against this blue-grey
— so it wants an eye on it beside `--warn`'s amber and `--good`'s green rather
than a red taken from anywhere.

### F-072 — `erodeFreeDroplets`'s slicing test fails under load and passes on its own

**Kind:** risk
**Milestone:** 0.5.0
**Priority:** low
**Effort:** small
**Found:** 2026-08-23, running the suite while auditing the seam routing
**Where:** `packages/engine/tests/generation/coarse/erodeFreeDroplets.test.ts`

**What happens.** *leaves the same field whether it runs in one call or in
slices* failed once in a full-suite run and passed immediately afterwards, both
alone and in another full run. Nothing in that run touched erosion.

**Why it matters.** The claim under test is a **determinism** claim — that
slicing the work changes nothing — and doc 23 makes bit-identical arithmetic a
requirement the whole multiplayer design rests on. A test of that which is
sometimes true is either a real non-determinism, which matters a great deal, or
a test that measures something other than what it says, which will mislead
whoever next changes the erosion. Both are worth an hour.

**What would fix it.** Run it a few hundred times under parallel load and see
whether it is the arithmetic or the harness. If the field really differs, the
first suspects are a shared accumulator that survives between slices and a
reduction whose order depends on how the work was cut — the same order-of-
accumulation hazard `noise.js` measured for fBm, where 4 and 5 octaves differ by
`1.4e-17` and 6 and 8 do not. If the field is identical every time, the failure
is in the timing and the test needs to say so.

---

### F-070 — The ground pyramid stops two levels above the map, so the smallest chunks are over-credited

**Kind:** limitation
**Milestone:** 0.5.0
**Priority:** low
**Effort:** small
**Found:** 2026-08-23, measuring why the cull balls were larger than the chunks
inside them
**Where:** `packages/engine/src/generation/chunk/ChunkPeaks.ts`, `CAPPED_LEVEL`

**What happens.** `ChunkPeaks` records how high and how low the ground reaches
under each triangle, as a pyramid, and the pyramid stops at level 6. A triangle
finer than that has no entry and reads its deepest ancestor's, which is
conservative in the safe direction — a parent's ground is never lower than a
child's, so nothing visible is dropped.

What it costs is measured (`tools/trial-bounds.ts`). On a world cut at 16 cells
a chunk — chunk level 9 — a chunk reads a triangle **64 times its own size** and
is credited with **1.62×** the floor-to-peak span its own ground has, 45.2 m
against 27.8 m. That shows up as the ball it is culled by: **2.53×** its own
half-width at the finest level against **1.13 to 1.20×** at every coarser one,
because the coarser chunks are nearer the cap or above it.

**Why it matters.** Less than it looks, for two reasons, which is why it was
left. **The default world is cut at chunk level 7**, one level below the cap, so
the borrowing is a single step and the effect is small; it took a deliberately
small chunk size to make it visible. And the frustum change took the large
slack out already — the balls were 8.2× before the margin moved off them and
onto the view.

**What would fix it, and what it costs.** Carry the pyramid to level 8, which
is **1,747,626 entries and about 7 MB** against level 6's 109,220 and 437 KB,
plus the build time at world load.

**Level 8 is the whole of the fix, and there is no point going further.** The
coarse map is itself level 8 on the shipped world — one cell is 52.8 m — so a
pyramid deeper than the map copies the same numbers into more slots and records
nothing new. Whatever is decided here, the cap belongs at the map's level and
never below it.

A side table for the levels under the cap, filled only for triangles a
selection actually visits, would buy the same thing for a fraction of the
memory. Nobody has priced it.

---

### F-067 — The chunk selection reads the ground the seed made, not the ground a player built

**Kind:** gap
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-22, wiring the edit path into the residency loop
**Where:** `packages/engine/src/generation/chunk/ChunkPeaks.ts`, and
`selectChunks` where it reads them

**What happens.** Which chunks are drawn, and at what level, comes from how high
the ground stands under each triangle. `ChunkPeaks` builds that pyramid once,
from the coarse map, which is a picture of the **generated** world -- no placed
block is in it and none can be. A tower a player builds a hundred metres up
stands over a triangle whose recorded peak is the hillside it was built on.

**Why it matters.** The selection uses the peak to decide whether a chunk is
worth drawing at all and which level to draw it at. Ground that stands higher
than the pyramid says is ground the selection under-reaches for, so a tall build
can be dropped or coarsened at a distance where the hill beside it is not. The
same gap is what the cascade shadows exist for -- they render anything that draws
itself, exactly because the map cannot hold a placed block -- so the shape of the
answer is known and the selection has not been given it.

**What would fix it.** Raise the pyramid where a chunk holds changes: the delta
store knows which chunks those are and the highest layer written in each, and a
layer is a radius. It is one number per changed chunk, maintained on write, and
the selection already reads a number per triangle. What is undecided is where it
lives, since the pyramid is built on the thread that draws and the store is
loaded after it.

---

### F-068 — Every click rewrites the whole world's record

**Kind:** performance
**Milestone:** 0.5.0
**Priority:** low
**Effort:** small
**Found:** 2026-08-22, writing `EditDb`
**Where:** `packages/client/src/EditDb.ts`, `save`

**What happens.** One record per world holds every chunk's changes, so `save`
packs every row and writes all of them. A click writes one cell and rewrites the
lot.

**Why it matters.** Not at all yet: a record is six bytes, and a world somebody
has played in for an evening is tens of kilobytes, which the browser writes
without noticing. It grows with the world rather than with the change, so it is
the shape of the problem rather than its size -- ten million edits is 76 MB
rewritten per click, and nothing warns on the way there.

**What would fix it.** One database record per chunk rather than per world,
keyed by the world's name and the chunk's key together. That is the shape the
hosted store already commits to -- chunk ID to a blob, one `get` and one `put` --
so it is the migration arriving early rather than a new idea. What it costs is
that opening a world becomes a range query rather than one read, and the header
needs a record of its own.

---

### F-069 — A change is written into two or three chunks and nothing collapses them

**Kind:** limitation
**Milestone:** 0.5.0
**Priority:** low
**Effort:** medium
**Found:** 2026-08-22, making an edit on a chunk border reach every chunk that
reads it
**Where:** `packages/engine/src/edit/DeltaStore.ts`, `write`

**What happens.** A chunk generates the slots on its own rim so the mesher can
decide whether to emit a face there without fetching a neighbour, so a cell on a
chunk border is read by two or three chunks and the record is written into each.
`rank.js` measures 17% of a chunk's slots as sitting on its border.

**Why it matters.** The store is a little larger than the count of changed cells
-- around 17% of edits stored twice or three times, so a few per cent overall --
and `count` reports records rather than cells. Neither is wrong, and both are
easy to read as a bug by whoever next opens the file. The duplicates stay in
step because every write goes through one call; a second writer, or a merge
between two clients, would have to keep them in step by hand.

**What would fix it.** Either say so where it can be seen -- a `cells` alongside
`count` -- or store canonically and gather a chunk's neighbours' rows when a job
is posted, which moves the work from the write to the read and needs each record
to carry the chunk it was written under.

---

### F-077 — The cloud decks stand outside the atmosphere

**Kind:** question
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-23, while building the atmosphere and looking at the planet
from outside it
**Where:** `packages/client/src/PlanetSettings.ts`

*(Written down as F-067 in the commit that found it, then F-072, both of which
turned out to be spent already -- the first by master, the second by the
erosion entry at the top of this list.)*

**What happens.** The low cloud deck sits `3,000 m` over the crust top, which on
a planet `6,801 m` in radius puts it at a radius of `10,901 m` — **1.6 times the
planet's own**. The high deck is at `2.0` times. The air reaches `1.3` times. So
both decks are outside the atmosphere entirely.

**Why it matters.** Nothing shows it from the ground, and it is the whole
picture from outside: the clouds are a second shell half again as wide as the
planet, so they read as hexagons scattered across black space rather than as
weather lying on a world. Lowering the decks to `900` and `1,700 m` puts the low
one inside the air and the high one just past it, and the same view then shows
cloud hugging the planet. It also decides something real about the world's
scale — a cloud four kilometres up on a planet you can walk around in two hours
is a cloud in orbit.

**What would fix it.** Either number can move and neither choice is made here.
Lowering the decks costs nothing but changes how big a cloud looks from the
ground, since a nearer puff of the same size covers more sky; raising **Air
reaches** past `7,100 m` would enclose both decks but makes the shell taller
than the planet is wide.

---

### F-066 — A steep slope is a staircase with no antialiasing, and it crawls

**Kind:** idea
**Milestone:** unscheduled
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-22, while checking whether banding on a mountainside was a
shadow artifact
**Where:** `packages/engine/src/render/gpu/GpuContext.ts`,
`packages/engine/src/render/terrain/ChunkRenderer.ts`

**What happens.** A hillside steeper than about 40° is a staircase one block
per step, and at a low sun the flat top of each step takes `sin(elevation)` of
the direct light while the vertical face of the same step takes
`cos(elevation)`. At an 8° sun that is a factor of seven between two surfaces
one metre apart, so the slope reads as hard alternating stripes. Under a moving
camera the stripes crawl, because a mountain a kilometre off packs each step
into two or three pixels and there is no antialiasing anywhere in the renderer
— no pipeline sets `multisample`, and the scene target is single-sampled.

**Why it matters.** It reads as a rendering fault, and the first guess is
always shadow acne or depth fighting. It is neither: taking the same view with
every shadow turned off leaves the stripes untouched, and rendering it at 2×
and box-filtering back down leaves them untouched as well, so the pattern is
real geometry rather than pixel aliasing. What the camera adds is only the
crawl.

*(Written when the shadows were a coarse-map march plus the cascades, turned
off by `mapShadows`, `cascadeShadows` and a shared `sunShadow` depth. F-074
has since removed the march and the depth knob with it, so the check today is
**Shadow maps** off. The reading is unaffected — nothing here was ever a
shadow.)*

*(Partly addressed 2026-08-25. The **moiré** half — the interference rings a
distant hillside draws once each step lands inside a pixel — is damped by
turning the face normal toward the column's up as that happens, `stepBlur` in
`TERRAIN_SHADER`. The stripes and the crawl below are untouched, and remain
what this entry is about.)*

**What would fix it.** Two separate things, and they are worth separating.
The crawl is antialiasing: 4× MSAA on the scene target and a resolve in the
tone pass, which every in-frame pipeline would have to declare. The stripes
themselves are the terracing, and the only things that touch them are a
smaller block, a mesher that chamfers a step, or accepting them as what a
voxel world looks like.

### F-005 — Nothing checks that the renderer produces a picture

**Kind:** gap
**Milestone:** 0.5.0
**Priority:** high
**Effort:** large
**Found:** 2026-08-17, after the sky pass turned the whole screen black for four
projects without any test failing
**Where:** `packages/engine/tests/render/`

**What happens.** The renderer's tests record the order of commands sent to a
stub device and check that every draw has the bind groups its pipeline declares.
They never run a real adapter and never look at a pixel. A frame that encodes
perfectly and draws nothing passes every test.

**Why it matters.** This is exactly how the black screen survived. The sky pass
drew before the frame's bind group was set, WebGPU refused the draw, the refusal
invalidated the whole command buffer, and everything went black from Project 12
until someone looked at it by eye. The command-order test now catches that one
mistake. It cannot catch a wrong matrix, an inverted winding, a shader that
writes black, or a depth comparison the wrong way round.

**What would fix it.** A render test that runs against a software adapter,
draws one known scene, reads the color attachment back, and compares it to a
stored image within a tolerance. The obstacle is finding an environment where
WebGPU composites — Dawn's own software backend can be driven headlessly, but
that is a build and a harness rather than a test file.

---

### F-006 — The chunk store and residency budget are written and unused

**Kind:** cleanup
**Milestone:** 0.5.0
**Priority:** low
**Effort:** small
**Found:** 2026-08-17, checking what the engine still exports after removing the
lattice scaffolding
**Where:** `packages/engine/src/generation/chunk/ChunkStore.ts` and
`residentChunks.ts`, both exported from `chamfer/generation`

**What happens.** `ChunkStore` holds chunks under a byte budget and evicts the
least recently used. `residentChunks` works out how many chunks a viewer needs.
Neither is called by the client or by any other engine code. Their only caller
is their own test.

**Why it matters.** They are in the published surface of `chamfer`, so anyone
installing the engine has to read past them, and after 0.1.0 ships, removing
them is a breaking change. They also do not fit what the client now does: the
client holds meshes on the GPU and never holds a `Chunk` at all, because blocks
stay inside the worker.

**What would fix it.** Decide what they are for. If a delta store or a physics
query needs blocks resident on the main thread later, they are the right shape
and should carry a note saying so. If not, take them out before 0.1.0 is tagged,
the same way the lattice scaffolding came out.

---

### F-007 — `InlineMeshSource` and the `MeshSource` interface have no user

**Kind:** cleanup
**Milestone:** 0.5.0
**Priority:** low
**Effort:** small
**Found:** 2026-08-17, same check as F-006
**Where:** `packages/engine/src/mesh/worker/InlineMeshSource.ts` and
`MeshSource.ts`

**What happens.** `MeshSource` is the interface behind which a caller does not
learn whether chunks are built on this thread or on workers. The client uses
`WorkerMeshSource` directly and names the concrete class, not the interface.
`InlineMeshSource` is used by one test.

**Why it matters.** Very little today. The interface exists so a build without
workers can fall back to the calling thread, and nothing exercises that path, so
the fallback is untested. It would be found broken at the worst moment, on a
browser that refuses to start workers.

**What would fix it.** Either have the client choose between the two at startup
and type the variable as `MeshSource`, which makes the fallback real, or drop
both and let `WorkerMeshSource` be the only answer.

---

### F-008 — `columnBand` is only reached from a test

**Kind:** cleanup
**Milestone:** 0.1.0
**Priority:** low
**Effort:** small
**Found:** 2026-08-17, after generation started recording each column's band as
it writes it
**Where:** `packages/engine/src/generation/chunk/columnBand.ts`

**What happens.** `columnBand` reads a column's first non-air and last non-solid
layer by scanning the blocks. Generation now records both while writing the
column, so the sampler no longer scans. The only caller left is the mesher's
test, which builds columns by hand.

**Why it matters.** It is a small function in the published surface with no
production caller. It is also genuinely the right function for any caller that
has blocks from somewhere other than the generator — a delta store, or a save
file — and neither of those exists yet.

**What would fix it.** Keep it and say in its comment that it is for blocks
that did not come from the generator, or take it out and let the test compute
its own bands. Do not leave it undecided.

---

### F-012 — Every chunk build allocates and discards half a megabyte of blocks

**Kind:** idea
**Milestone:** 0.5.0
**Priority:** low
**Effort:** medium
**Found:** 2026-08-17, profiling the chunk build for Project 16
**Where:** `packages/engine/src/generation/chunk/Chunk.ts`, the constructor

**What happens.** A chunk at the worked planet's settings is 561 slots by 435
layers, which is 244,035 block types and 478 KB. Each one is a fresh
`Uint16Array`. The worker builds the chunk, meshes it, sends the geometry back,
and drops the chunk. Filling a view is 200 to 330 of these.

**Why it matters.** It is 100 to 160 MB of allocation to fill one view, all of
it garbage within milliseconds. It has not been shown to cost anything —
generation measured 4 to 7 ms a chunk and the profile did not point at the
collector — so this is a suspicion rather than a problem.

**What would fix it.** Each worker keeps one chunk buffer and reuses it, since
it only ever builds one chunk at a time. The buffer is the same size for every
chunk at a level, which is what the uniform slot count was chosen for. Measure
before and after: if it makes no difference, write that down and stop.

---

### F-013 — Two verification scripts quoted a wall-clock timing as a headline

**Kind:** risk
**Milestone:** unscheduled
**Priority:** low
**Effort:** small
**Found:** 2026-08-17, regenerating `docs/REFERENCE.md` after switching three
scripts to the pinned noise hash
**Where:** `verification/language.js` and `verification/authority.js` are fixed;
the rest of `verification/` has not been swept

**What happens.** `language.js` divided a live JavaScript timing by a stored
Rust one to report a language gap, which measures whichever machine runs the
script rather than the languages. `authority.js` built its CPU-per-player table
from a live query cost, so the headline moved from 0.062% to 0.081% of a core
between two machines. Both now quote a recorded figure and print the live one
beside it, marked as a timing.

**Why it matters.** `docs/` quotes these numbers in prose. When the reference is
regenerated on a different machine the prose and the generated page disagree,
and a reader cannot tell whether that is drift or a real change. The remaining
scripts have not been checked for the same pattern.

**What would fix it.** Read every `verification/*.js` for a printed millisecond
or nanosecond figure, and for each one decide whether it is quoted in `docs/`.
Anything quoted gets a recorded value with the live one printed beside it.
Anything not quoted gets the words "a timing, so it moves run to run", which
several scripts already carry.

---

### F-015 — A large river is a chain of pools, not a continuous ribbon

**Kind:** question
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-18, measuring channel widths for I-5
**Where:** `packages/engine/src/generation/coarse/buildCoarseMap.ts`, the `water`
field; `packages/engine/src/generation/terrain/TerrainGenerator.ts`, `columnAt`

**What happens.** Water is written into a column wherever the coarse map's water
surface is above its ground surface. The map's water surface is the pit-filled
height, so it is above the ground only in a basin the fill raised, or below sea
level. A cell that drains — which is what a river cell is — was not raised, so
its water surface equals its ground surface and no water block is written.

Measured on a 6,800 m planet at a 32 m coarse cell: of the **785 cells draining
more than a square kilometre, 354 carry water** and 431 do not. So the biggest
rivers on the planet are about 45% water. They read as a chain of ponds with dry
channel between them.

The dry stretches are not flat. They are incised valleys 11 to 37 m deep, so the
landform is there. What is missing is water in it.

**Why it matters.** Nobody is hurt today, because there is no water simulation
and nothing depends on a river being continuous. It matters for how the world
looks: standing in one of these valleys, there is an obvious river bed with no
river in it. It also makes "how wide is a river" hard to answer by looking,
which is the question I-5 asks.

It may also be correct. A dry wash between pools is a real landform, and this
planet has no rainfall model to say otherwise. Nothing has decided.

**What would fix it.** Two shapes, and they are different decisions.

The small one: write water wherever the catchment is above a threshold in square
metres, at a depth that follows from the catchment, rather than only where the
fill raised the ground. `TerrainColumn.catchment` already carries the number.
That gives a continuous ribbon and costs one comparison per column.

The large one: leave it, and decide that rivers on this planet are pools. That
is free to do and needs somebody to look at the world and say so.

---


---

### F-019 — A candidate judged by eye can turn out to be a planet parameter, not a release decision

**Kind:** idea
**Milestone:** unscheduled
**Priority:** low
**Effort:** small
**Found:** 2026-08-19, closing I-5 and the remaining half of I-1
**Where:** `HOW-TO-WRITE-PLANS.md`, the step for candidates judged in the
engine rather than argued from a measurement

**What happens.** I-5 asked "32 m or 16 m coarse cells", built both behind a
switch, and set out to pick a winner and remove the loser — the standard
close for a candidate judged by looking rather than by a script. Looking
answered a different question than expected: which spacing reads better does
not depend on anything about this release, only on the planet being looked
at. A small calm world can afford a narrower river than a large dramatic one
wants, the same way I-3 found that a bigger planet needs a wider landform to
read as one. I-1's remaining question — how tall B2's atmosphere should be —
turned out to be the same shape once it was named: the demo shows the range,
and nothing here picks one height as *the* answer.

Both closed by leaving the knob exactly as it was, default included, rather
than by choosing a winner. Nothing in the process document currently expects
that outcome — it only describes "pick one, remove the other."

**Why it matters.** The process as written pushes toward manufacturing a
decision even when the honest answer is "this varies by world, and both
sides already coexist as one knob." Following it as written would have
picked an arbitrary default and quietly narrowed what a later world author
could set. Nothing is broken today — both items closed correctly once this
was noticed — but the next candidate judged in the engine will ask the same
question again unless the process names it.

**What would fix it.** Add a line to `HOW-TO-WRITE-PLANS.md`'s step for
engine-judged candidates: before removing the losing side, ask whether the
difference is a property of the world or a property of the release. If it is
the world's, the close is "confirmed as a per-planet knob, no default
chosen" rather than "A wins, B comes out." Small — one paragraph, and two
worked examples already exist to cite.

---

### F-021 — Daylight is measured at the spawn point, not where the player is

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-17, holding the light at noon for v0.1.2's pause
**Where:** `packages/client/src/planet.ts`, the `ground` variable and the
`daylight(...)` call in the frame loop

**What happens.** `ground` is a direction assigned three times while the world
is being set up, and never again. The frame loop passes it to `daylight()`
every frame, so how lit the world is gets measured at the place the player
started rather than the place they are standing.

**Why it matters.** Walking the 10,681 m round this planet takes 2.12 hours,
which is inside a single day at most settings, so a player can walk to the
night side and stay in full daylight, or stand at their spawn point at dusk
and watch the far side darken instead. The terminator is one of the few things
on a planet this small that a player can outrun, which is most of what makes
it interesting, and it does not move relative to them at all.

**What would fix it.** Pass the player's own up, which the frame loop already
holds as `up` a few lines above. One argument. It has gone unnoticed because
the opening view and the first minutes of walking are near the spawn point,
where the two agree.

**Neither fixed nor visible under v0.1.2's pause.** That release holds daylight
at 1 and never calls `daylight()`, so this cannot be seen until the pause is
lifted. It is written down rather than fixed there because the day is one of
the paused features, and judging a fix would mean turning it back on.

---

### F-023 — The selection's peak term assumes the tallest ground is everywhere

**Kind:** idea
**Milestone:** 0.5.0
**Priority:** low
**Effort:** medium
**Found:** 2026-08-17, pricing v0.1.2's I-4 fix on the bench
**Where:** `packages/engine/src/generation/chunk/selectChunks.ts`, the
`peakHeight` term; the numbers are in `plans/v0.1.2.md`, I-4

**What happens.** The selection reaches
`horizonAngle(eye) + horizonAngle(peak)` with one planet-wide `maxElevation`
as the peak, so it selects every chunk that could hold visible ground if the
tallest mountain on the planet stood in it. Most chunks hold nothing near
that tall. On the un-paused world (`maxElevation` ~120 m, its own horizon
~1.3 km) the bench's eye-height flat-ground scene went from 286 to 552
chunks and 2.4 to 3.9 s to fill a view.

**Why it matters.** Roughly half the chunks built at eye height are in a ring
that is mostly below the horizon, built and uploaded for nothing. It is the
correct conservative bound — nothing visible is ever dropped, which is what
I-4 restored — but the cost is paid on every world with relief, every frame
the player moves.

**What would fix it.** A height bound per chunk rather than per planet. The
coarse map already knows the height field; the maximum over a chunk's
footprint, computed once at world creation for the chunk levels that matter,
would let the walk use each triangle's own tallest ground. The walk already
visits parents before children, so a bound per face triangle refined
downward fits the existing recursion.

---

### F-024 — The column cache key collides at the deepest world the word allows

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** low
**Effort:** small
**Found:** 2026-08-17, writing v0.1.2's apron, whose own key packs with
262,144 for exactly this reason
**Where:** `packages/engine/src/generation/chunk/ChunkColumnSampler.ts`, the
`key` in `columnAt`

**What happens.** The cache key is `(face * 65536 + i) * 65536 + j`, and a
lattice coordinate runs to `2^depth`. The address word allows depth 17, where
`n` is 131,072 — twice the multiplier — so two different cells can share a
key and the sampler would hand one cell the other's blocks.

**Why it matters.** Nobody yet: the shipped worlds sit at depth 10 to 13 and
the panel caps what a person can ask for below the collision. It is a trap
armed for whoever first builds a depth-17 world, and it would surface as
subtly wrong terrain rather than an error.

**What would fix it.** Multiply by 262,144 — `2^18`, one step above the
deepest lattice — the way the apron's key in `meshChunk.ts` already does.
The product stays under `2^53` with room to spare: 20 faces times `2^36` is
`1.4e12`.

---

### F-025 — A cave mouth crossing a level join is still an open hole

**Kind:** gap
**Milestone:** 0.5.0
**Priority:** low
**Effort:** large
**Found:** 2026-08-17, deepening v0.1.2's skirts to the seam floor
**Where:** `packages/engine/src/mesh/meshChunk.ts` and
`packages/engine/src/mesh/seamFloor.ts`; the design is doc 14's seam
ownership, priced by `verification/seam.js`

**What happens.** The skirts now reach the lowest surface a neighbouring
level might put beside a rim column, which closes the join's surface slit at
any relief. A skirt is still a wall hanging from the surface: a cave mouth
that crosses the join sits deeper than any skirt hangs, and `seam.js`
measured that 13 to 32% of columns have more than one span once caves are
on. The full design — the finer chunk emits a face wherever its solidity
differs from the coarse neighbour's, which `seam.js` measured at 0 holes —
is not built.

**Why it matters.** Nobody today: caves are off by default and off under
v0.1.2's pause, so no shipped world has a multi-span column. The first
release that turns caves on gets sky-through-the-planet back, at exactly the
joins v0.1.2 closed for the surface.

**What would fix it.** Seam-owned faces need to know the neighbour's level,
which the mesher deliberately does not: a blind guess emits walls above a
same-level neighbour's ground, standing into the air. The selection knows
every chunk's level, so the road is to tell the mesher its neighbours'
levels and re-mesh the rim when a neighbour changes level — a residency and
worker-protocol change, not a mesher formula.

---

### F-027 — The container can present WebGPU after all, and nothing takes a frame

**Kind:** gap
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-18, chasing v0.1.2 I-8's dark lines to a horizon band whose
color turned out to be a ratio
**Where:** the container; nothing in the repository, which is the point

**What happens.** F-011 recorded that headless Chromium here acquires a WebGPU
device and then fails on the swap chain, and that every visual claim has to be
confirmed on real hardware. That is no longer true. Chromium started with
`--headless=new --enable-unsafe-webgpu --enable-features=Vulkan
--use-angle=swiftshader --use-vulkan=swiftshader` runs the client on a software
adapter, reports around 100 frames a second, and hands a real frame back
through the DevTools protocol — `Page.captureScreenshot` on a page driven by
`Page.navigate` and `Input.dispatchKeyEvent`. All three WebGPU flags are
needed, and dropping any one of them gives a blank canvas on a page that
otherwise runs, which is what F-011 saw. The pixels are the client's own:
reading the rows at the horizon gave the artifact's brightness as 0.58 of the
ground's own color, which is what identified it.

**Why it matters.** Two things were held back by the old answer. **F-005** —
nothing checks that the renderer produces a picture — was filed as needing
hardware, and it does not: a frame taken here can be asserted on, and a first
test as blunt as "the middle of the canvas is not the clear color" would have
caught the black screen that survived four projects. And every seam item in
v0.1.2 was argued from meshes and raycasts because looking was thought to be
impossible; I-8 was three passes of measuring the wrong thing until the frame
itself was read.

**What would fix it.** `HOW-TO-TAKE-A-FRAME.md` now carries the flags, the
protocol calls and the way to read the pixels back, so a session can rebuild
the harness in a few minutes. What is left is the harness itself: about eighty
lines in `tools/`, beside the other checks that run before a push, which is
what makes F-005 a small piece of work rather than a large one. The frames it
takes are a software rasteriser's, so it settles what is drawn and never how
fast.

---

### F-028 — A grazing ray slips through a chunk boundary at the horizon

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** low
**Effort:** medium
**Found:** 2026-08-18, reading frames of the paused planet after v0.1.2 I-8 took
the cliffs out of it
**Where:** `packages/engine/src/mesh/meshChunk.ts`, the apron

**What happens.** On the paused planet — no relief at all — the horizon carries
occasional single sky-colored pixels **below** the skyline, one or two in a
frame at 1,280 by 800. Turning the seam overlay on puts every one of them on a
cell the overlay paints as a chunk boundary or an apron ring. Radially the
surface is closed: 200,000 rays out from the planet's centre across a
mixed-level scene found **0** directions with no cover. These leak at a grazing
angle, not a radial one.

**Why it matters.** It is one pixel of sky where there should be ground, at the
one place a player looks at for minutes on end. Nobody will see it on a still
frame; a moving camera makes single pixels twinkle, which is how a distant
horizon reads as noisy rather than solid. It is also the last visible remnant of
the same class the apron was built to close, so leaving it unexplained means the
next seam artifact starts from a boundary nobody trusts.

**What would fix it.** First find out which of two it is, because the fix
differs. The apron sits a centimetre below the surface it duplicates, so at a
grazing angle the step between a chunk's own rim cap and its apron is a
centimetre of wall that nothing draws — a ray entering there passes into the
crust and out the far side, and every interior face is culled. That would be
fixed by walling the apron's own outer edge, which is a few triangles a chunk.
The other candidate is the wedge between two levels' caps: a coarse cap is a
chord of a bigger cell, so it sags further below the sphere than the fine caps
beside it, and a ray can pass over one and under the other. That one is not
closed by a wall and needs the levels to meet on one surface, which is F-025's
seam ownership. A grazing raycast against a two-level scene, counting entries
that exit the planet, separates them in an afternoon.

---

### F-029 — The skyline steps by a pixel where the level changes

**Kind:** bug
**Milestone:** unscheduled
**Priority:** low
**Effort:** medium
**Found:** 2026-08-18, in the same frames as F-028
**Where:** `packages/engine/src/mesh/meshChunk.ts`, `emitCap`

**What happens.** The horizon of the paused planet is not one line. Every few
tens of pixels it steps up or down by one, with solid ground on both sides of
the step, in a pattern that follows the chunk grid rather than the cells.

**Why it matters.** A cell's cap is a flat polygon with its corners on the
sphere and its middle below it, so a cap's silhouette sits below the sphere's by
the sag — and the sag goes as the square of the cell's width. A cell twice as
wide sags four times as far. Two levels meeting near the tangent point therefore
draw two different horizons, and the taller one wins. This is a property of
drawing a sphere as flat faces at more than one resolution, not a defect in any
one chunk, and it is why it is filed as unscheduled: it costs a pixel and the
fixes cost geometry.

**What would fix it.** Nothing cheap. Lifting each cap to the sphere at its
centre rather than inscribing it hides the sag from the silhouette and puts the
error back on the shared edges, which is worse. Splitting a cap into more
triangles reduces the sag and multiplies doc 14's 2-verts-4-tris, which is the
number the whole mesh budget rests on. The honest options are to accept it, or
to hold the level fixed within the band around the horizon where it shows —
which the selection could do, since it already knows the horizon angle.

---



### F-032 — The terrain generator must not be told which level of detail is asking

**Kind:** risk
**Milestone:** unscheduled
**Priority:** medium
**Effort:** small
**Found:** 2026-08-18, trialling an item that was opened to do exactly this
and was dropped when it was measured; it left the plan and this entry is what
remains of it
**Where:** `packages/engine/src/generation/terrain/TerrainGenerator.ts`,
`columnAt`; the numbers are in `verification/lod.js`

**What happens.** `columnAt(face, i, j)` takes a face and a lattice offset and
nothing else. A chunk drawn coarsely calls it for a subset of the points a fine
chunk calls it for, and every one of those points gets the same answer either
way.

That looks like an oversight and it is the property the level of detail rests
on. Because a point's height does not depend on which chunk asked, **a chunk
changing level moves no ground at all.** The points it keeps hold exactly the
height they had. What appears and disappears is the ground between them, which
a coarse chunk draws as a flat span.

**Why it matters.** The oversight reading is easy to reach, and acting on it
makes the engine worse. Passing the level in so the detail term can drop or fade
the octaves a wide cell cannot represent is the obvious anti-aliasing fix. It
would give a retained point one height in the coarse chunk and a different one
in the fine chunk, so ground that never moves today would move every time a
chunk changed level — trading a blurred span, which nobody has complained about,
for a popping surface, which is the thing people do complain about.

Measured against the average of the ground each cell covers, at 190 places on
one face: leaving it alone is **0.31 m** at LOD 6, dropping octaves is
**1.02 m**, fading them is **0.50 m**. The two fixes are worse than the problem
at every level tested, not only at the extreme.

And the span it blurs is small where anyone stands. `selectChunks` on the
shipped planet draws nothing coarser than LOD 4 at eye height, where the figure
is **0.06 m** on 1 m blocks. LOD 6 needs 1,200 m of altitude, which nothing in
the game reaches.

**What would fix it.** Nothing. This entry exists so the next person to notice
that `columnAt` ignores the level finds the measurement instead of the fix.

Two things would make it worth measuring again, and only these two: a much
taller detail term, since the blur is bounded by the amplitude the term carries
below the cell; or a way for a player to get high enough to see LOD 6 — flying,
a map view, or a much smaller planet. The same two conditions decide whether
the coarse map needs a mip pyramid, which is undecided for the same reason and
priced at a third more memory by the same trial.

---

### F-033 — Lowering Chunk coarsens the ground it does not resize

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-18, explaining the Chunk knob to the owner from a screenshot
of enormous cells at Chunk = 8
**Where:** `packages/client/src/PlanetSettings.ts` (`chunkLevel`),
`packages/engine/src/generation/chunk/selectChunks.ts`

**What happens.** The panel's own words for Chunk say it is a packaging size —
"how many cells along one edge of a chunk" — and "it does not appear in a cell
address." Lowering it from 32 to 8 instead changed the ground itself: at the
same real distances from the camera, measured with `selectChunks` directly,
Chunk 32 draws 1 m cells out to 150 m and Chunk 8 draws 1 m at 20 m, 2 m at
60 m, and 4 m at 150 m.

The cause is that `chunkLevel` — where "native resolution" sits in the
triangle hierarchy — is derived from Chunk (`depth -
round(log2(chunkCells))`), and `selectChunks` defines `lod` as how many levels
a drawn chunk sits *below* that level. Its own stopping rule, distance versus
the current triangle's width, does not read Chunk and lands on roughly the
same absolute hierarchy level regardless. So shrinking Chunk pushes native
resolution deeper without moving that stopping level, and the gap between them
— which is what `lod` counts, and each step of `lod` doubles the block size —
opens up. The knob meant to bound storage per chunk ends up setting how far
the near, full-detail patch of ground reaches.

**Why it matters.** A player moving the slider to save memory or bandwidth
gets a visibly coarser world as a side effect the panel's own description does
not mention, and there is no separate control for the falloff distance itself
— it is Chunk or nothing.

**What would fix it.** Either decouple `lod` from `chunkCells` — measure it
against a fixed physical width rather than a level count relative to a
Chunk-dependent zero point — or say in the panel that Chunk also sets how far
full detail reaches. The first is the real fix; the second is one sentence and
buys time to design it.

---

### F-035 — The poles stand on the terminator all day, every day

**Kind:** question
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-18, the owner noticing that parts of the planet never come
into the light as the time of day is turned
**Where:** `packages/engine/src/light/sunDirection.ts`; the client calls it as
`sunDirection(t, NORTH)` in `packages/client/src/planet.ts`

**What happens.** The sun swings a full circle about the polar axis, and
`sunDirection` takes a `tilt` saying what angle it keeps to that axis. Nothing
sets it, so it is zero and the sun stays in the plane through the planet's
middle.

Measured over one whole day, as `dot(up, sun)` where 1 is the sun overhead and
0 is the horizon:

| latitude | brightest the sun gets | hours of light |
|---|---|---|
| 0° | 1.000 | 12.0 |
| 45° | 0.707 | 12.0 |
| 75° | 0.259 | 12.0 |
| 85° | **0.087** | 12.0 |
| 90° | **0.000** | 11.8 |

So the arithmetic is right and the consequence is real: **at the poles the sun
never rises above the horizon and never sets below it.** At 85° it reaches five
degrees up. The polar caps are in permanent twilight, which is what looks like
part of the planet never being lit.

**Why it matters.** It is a twelfth of the surface above 75°, held at a
brightness nothing a player does can change. It also makes the two pentagons on
the axis — which doc 17 protects as landmarks and doc 20 puts the poles on —
the two places on the planet that can never be seen properly.

Nobody is hurt beyond that. Every other latitude gets a full day and night, and
the terminator is the thing this planet is small enough to outwalk, which still
works.

**What would fix it.** Three shapes, and they are different worlds.

Leave it, and say in doc 32 that this planet has no axial tilt, so it has no
seasons and its poles live in permanent dusk. Free, and it is a real
configuration — a planet with no tilt is not an error.

Set a fixed tilt. One line, since the parameter is already there. It trades
permanent dusk for **one pole in permanent day and the other in permanent
night**, which is worse rather than better, and the docstring already says so.

Give the tilt a year: a second, slower cycle turning the sun's angle to the
axis, so the poles get a real midnight sun and a real polar night. That is what
a tilted planet actually does, it needs one more knob and one more clock, and
it is the only one of the three that makes the poles worth standing on.

---

### F-036 — The whole Puff slider is unreachable on a planet the shipped size

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-18, chasing a report that the cloud Puff knob does nothing
**Where:** `packages/client/src/PlanetSettings.ts` — `CLOUD_POINT_SHELL_BUDGET`,
`cloudLevelBudget`, `PlanetSettings.cloudLevel`

**What happens.** Puff asks for a cloud lump in metres and is answered as a
lattice level, and the level is capped so one deck stays under 700,000 lattice
points times shells. At 4 shells that cap is level 7. On a 20,402 m radius,
level 7 is a **192 m** puff — coarser than the slider's own maximum of 128 m.
So every value from 8 m to 128 m gives the same clouds, and the knob is not
stiff at one end, it is dead across its whole travel.

It is not the radius alone. At 1 shell the cap is level 8, which is 96 m — the
top quarter of the slider and nothing else. The default 1,700 m radius is where
the range was chosen and there the slider works, because the same level is a
16 m puff.

**Why it matters.** This was reported as a broken knob, and looking at it that
is exactly what it is. The panel now prints what was given and why underneath
the slider, so nobody has to guess again, but a knob that prints an excuse
across its whole range is still a knob nobody can use. Cloud size is one of the
few things about this sky that is an art decision rather than a measurement, so
it is a knob that has to work.

**What would fix it.** Two candidates, and they cost different things. Scale
the slider's range with the radius, so it offers what the planet can give
rather than a fixed 8 to 128 m — cheap, and it means the same number means a
different cloud on two planets. Or raise the budget, which is a real
measurement rather than a guess: 700,000 came from the heaviest deck anyone has
run, and 2 decks at level 9 and 3 shells did fill a 256 MiB buffer on real
hardware. Raising it needs a device that draws, a build of every combination,
and the number where it stops.

---
---

### F-043 — Nothing says the bottom layer of the crust cannot be dug through

**Kind:** gap
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-19, working out how deep a player could dig on the shipped
world
**Where:** `packages/engine/src/generation/terrain/TerrainGenerator.ts`,
`fillColumn`; [`docs/06-world-sizing.md`](docs/06-world-sizing.md), the crust
depth section

**What happens.** The crust is a shell: it runs from the planet's tallest ground
down a fixed number of layers, and under the last one there is no world at all.
On the shipped settings that floor sits `360 m` under sea level. Every layer of
it is ordinary stone, and two documents already use bedrock as the example of a
rule a player discovers by trying — but no rule exists. Breaking the last layer
opens a hole through the bottom of the planet into space.

**Why it matters.** Digging is the thing a voxel game is for, and the floor is
the one place the world ends rather than continues. A hole through it is not a
graphical glitch: the ray walk, gravity and the mesher all assume a column has a
bottom, and a player standing over one falls out of the world with nothing under
them to land on. It costs nothing to prevent and cannot be repaired in a save
that already has holes in it.

**What would fix it.** A block type the edit path refuses to remove, written
into the deepest layer of every column, the same way the twelve pentagon columns
already refuse placement. It needs a name in the registry, one comparison in
whatever validates an edit, and a line in doc 06 saying the crust's last layer
is not stone. The alternative — refusing the edit by layer number rather than by
block type — is cheaper still but invisible to a player looking at the block.

### F-040 — `tools/bench.ts` still names three knobs that no longer exist

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** low
**Effort:** small
**Found:** 2026-08-19, grepping for landform references while adding the noise
basis dropdown
**Where:** `tools/bench.ts`, the settings summary line near the end

**What happens.** The line reads `settings.knobs.reliefFeature`,
`settings.smallestLandform` and `settings.reliefOctaves`. The first and third
were removed with the detail tier, so the line prints `undefined` twice. It does
not fail the build because `tools/` is outside the TypeScript project and
`npm run typecheck` never compiles it.

**Why it matters.** The bench is run by hand to compare timings between
sessions, and its own header line is what says which world was timed. A header
naming knobs that do not exist makes two runs look comparable when nothing
records whether they were.

**What would fix it.** Replace the three with the knobs that decide the ground
now — the two layers' scales and octave counts — and add `tools/` to a typecheck
so the next removal fails loudly. Half an hour, and the removal it would have
caught has since happened twice.

---

### F-039 — Droplet erosion cuts straight lattice-aligned gashes, not valleys

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** high
**Effort:** medium
**Found:** 2026-08-18, hillshading an eroded map to show what erosion does to
the ground
**Where:** `packages/engine/src/generation/coarse/erodeDroplets.ts` — the
steepest-neighbour loop

**What happens.** A droplet moves by picking the steepest of the six cells
around it. That is a choice between six fixed directions, and on ground whose
gradient is gentle and smooth the same direction keeps winning, so the droplet
marches in a straight line along one axis of the lattice. Droplets starting near
each other pick the same line, and what they cut is a long straight trench.

Measured over 20,000 droplets on the shipped map, recording which of the six a
step took: **60.2% of all steps are part of a run of eight or more steps in one
unchanged direction**, and the longest run is **48** — a droplet's entire life in
one straight line. The mean run is 3.7 steps. A walk that followed the ground
rather than the lattice would sit near 1.4.

Hillshaded, the result is unmistakable: at Erosion 0 the ground is smooth noise,
and at 0.3 and 1 it is crossed by straight gashes in three directions, tens of
map cells long, with square ends.

**Why it matters.** Erosion is the only pass that shapes the ground in a way
noise cannot, and it is now the only such pass at all — rivers and lakes are
gone. What it is meant to produce is graded valleys and sharpened ridges; what it
produces is a lattice pattern that looks like a rendering artifact. It used to
show a second way too, as bare grey rock wherever the gashes ran steep, until
the cliff rule and the slope field it read were removed. Every measurement taken of it is still true —
the median slope barely moves, the tail grows, the ground shifts 8 m a cell at
full strength — those numbers just do not say what shape the moved ground took.

**Erosion ships off because of this.** `erosion` defaults to `0` and its row is
off the panel, so `erodeDroplets` returns on its first line and nothing here
reaches a world. It is still reachable as `?erosion=0.5` for whoever comes back
to it, and the code is untouched.

**What would fix it.** The standard droplet algorithm does not step cell to
cell. It carries a **continuous position and a direction with momentum**,
computes the height gradient by interpolating the field around that position,
and moves along the gradient — which is what stops a walk from locking to an
axis. On this grid that means a position in a face's `(i, j)` lattice
coordinates, the existing three-corner blend for the height, and a direction
carried between steps rather than re-chosen. Two cheaper half-measures worth
measuring first: give the choice a hashed tie-break among near-equal neighbours,
or blend the step direction with the previous one so a droplet cannot turn
instantly. Neither is as good as momentum and both are an afternoon rather than
a rewrite.

**Re-measured on 2026-08-21, and the headline number is no longer true.** The
map this was found on was a single octave stack; the map now is two layers, a
mountain gate and 1,100 m of relief, and it is much rougher ground for a droplet
to walk over. Re-run at level 8 on a 32 m cell at strength 1 — 983,043 droplets,
21,221,363 steps — **18.3%** of steps are part of a run of eight or more in one
direction, not 60.2%, and the mean run is **2.42**, not 3.7. The longest run is
still 48, a whole droplet life. Hillshaded, the straight gashes are no longer
what the picture shows: at 1,100 m of relief the ground is already steeper than
anything erosion adds, and at 300 m the eroded map reads as finer dendritic
texture rather than as trenches. **The walk is still locked** — a walk that
follows the ground rather than the lattice sits at a mean run of 1.09 to 1.49,
measured below — but the visible symptom this entry is named for has been
covered up by a rougher world rather than fixed. What is now the louder problem
is F-053, and it has the same cause.

**One of the two cheap half-measures above is measured and it is worse than
doing nothing.** Blending the step direction with the previous one was tried on
the six-way step, scoring each neighbour by its gradient plus an inertia term
against the carried direction. At level 7 on a static field the shipped walk
runs 7.0% of steps in runs of eight or more; the same walk at inertia 0.25 runs
**62.7%**, at 0.5 **79.8%**, at 1 **89.8%** and at 2 **94.8%**. The reason is
that momentum on a six-way choice cannot bend a walk — the result is still one
of six directions, and the inertia term simply holds it on whichever one it
picked. **Momentum only helps once the position is continuous.** The same
inertia applied to a continuous position in `(i, j)` runs 3.0% at 0.3 and 7.4%
at 0.6, against 1.4% for pure gradient descent. The hashed tie-break is still
unmeasured.

### F-044 — The ocean surface disappears at levels whose block is deeper than the sea

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-19, while chasing empty coarse chunks in the far field
**Where:** `packages/engine/src/generation/terrain/TerrainGenerator.ts`,
`blockAt`; `packages/engine/src/mesh/buildChunkMesh.ts`

**What happens.** Water exists in a column only as whole layers between the
water surface's first layer and the ground's, so it needs the sea to be at
least one block deep at the level asking. A world with a 100 m sea keeps its
water to level of detail 6 -- 64 m blocks -- and loses it at 7 and beyond,
where a 128 m block is deeper than the sea it should hold. The far ocean then
draws as its sand floor, at the floor's own radius: a tan sea visibly below
the blue one, switching to blue along the level boundary as the viewer
approaches. On a 1,640 m relief world with 8-cell chunks the far field runs
to level 10, so most of a distant hemisphere's ocean shows as floor.

**Why it matters.** The ocean is the largest single surface on any world with
land under 100%, and it is the one surface a viewer at altitude is mostly
looking at. A sea that changes color with distance marks every coarse level's
boundary on the water, which is exactly what level of detail is supposed to
never do -- the ground's own levels blend because resampling moves nothing,
and the water's do not because the water is simply gone.

**What would fix it.** The mesher already carries every column's true water
radius in `chunk.surface`, separately from the blocks. A water cap could be
drawn from `waterRadius > groundRadius` directly, the way the ground cap is
drawn from the ground radius, rather than from whether any whole layer of
water fits under it. The generated world guarantees no vertical water faces,
so the cap is the whole of the far ocean's geometry; what needs care is the
shore column, where the cap must stop exactly where the ground cap rises past
sea level or the two z-fight.

### F-045 — "Full detail out to" understates the reach by 2.6 times

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** low
**Effort:** small
**Found:** 2026-08-19, while explaining how a chunk's level is chosen
**Where:** `demos/subdivision-explorer.html`, `readout`; `demos/README.md`

**What happens.** The readout states the full-detail reach as `detail x chunk
span` -- 16 m at the demo's defaults. Measured against the engine's own
`selectChunks` on the shipped planet, the furthest chunk drawn at full detail
sits **2.6 times** that: 23 m where 8 m is stated, 169 m where 64 m is, 185 m
where 64 m is. The ratio holds across chunk spans of 8, 32 and 64 m and detail
settings of 1, 2 and 3, until the horizon caps it instead.

**Why it matters.** The figure is wrong in the direction that makes the demo
look worse than the engine is. Someone reading it concludes that full detail
stops three times nearer than it does, and reaches for a bigger Chunk or a
higher Full detail to fix a problem that is not there. The same 2 m sentence
went into `demos/README.md` and into an explanation given to the owner.

**What would fix it.** The stated figure is the split test's threshold, and the
test is applied to a triangle's **parent**, so a chunk is kept at full detail
when its parent is inside `detail x parentWidth` -- twice the span. The width
in the test is centre-to-corner rather than edge, another 1.155, and the
measurement is to a child's own centre, which sits off the parent's. Multiply
the three and it is 2.6. Either state `2.6 x detail x chunkSpan` and say it is
approximate, or -- better, since the number is already in hand -- report the
furthest full-detail chunk the selection actually returned, which is exact and
moves with the horizon when the horizon is what binds.

---

### F-049 — The sea reads its water thickness from camera distance, not from what is behind it

**Kind:** approximation
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** large
**Found:** 2026-08-20, while building the sea as a surface
**Where:** `packages/engine/src/render/sea/SEA_SHADER.ts`

**What happens.** How opaque the water reads, and which of its two colors it
takes, both come from how far the fragment is from the camera -- `smoothstep(0,
clarity, length(eye - world))`. The quantity that decides both in the technique
this is drawn from is the **thickness of water the look passes through**: the
depth of whatever is behind the surface, minus the depth of the surface itself,
put through Beer-Lambert absorption. Distance stands in for thickness, and the
two agree only when the eye is near the surface.

**Why it matters.** They part company exactly where a player looks at water
worth looking at. Standing on a beach the two are close, because a look that
travels far also travels far through water. From 300 m up, looking straight
down at a metre of water over a sandbar, the distance is 300 m and the water
draws fully opaque -- the sandbar disappears. The same error hides every reef,
shoal and river mouth from the air, which is the altitude the shape of a coast
is read from. It also blocks three things outright: **refraction** (offset the
screen sample by the wave normal), **caustics** (project a moving pattern onto
the sea floor, faded by thickness), and **shoreline foam** (a band drawn where
thickness is under a metre, which is the foam a person actually notices --
crest foam is the other kind and is already drawn).

**What would fix it.** A depth texture the sea can sample, which it cannot do
today: `SeaRenderer` is a `PassLayer`, so it draws **inside the same render
pass as the terrain**, and a pass cannot read the depth attachment it is
testing against. Either a depth prepass whose result is resolved to a sampled
texture, or move the sea out into a second pass of its own after the opaque
one, which also gives it the color attachment for refraction. The second is
the smaller change and costs one extra pass; it would want measuring against
the frame budget first, since the sea is one draw call today.

---

### F-050 — Cloud formation culling stops working as a formation's bound approaches the planet

**Kind:** limitation
**Milestone:** 0.5.0
**Priority:** low
**Effort:** medium
**Found:** 2026-08-20, while culling the billboard clouds per formation
**Where:** `packages/engine/src/render/BillboardClouds.ts`

**What happens.** Formations are frustum-tested by a bounding sphere around
their puffs and the surviving index runs are coalesced. A formation's spread is
a knob, and at the shipped `cloudSpread` of 2,340 m against a planet radius of
1,700 m a formation's bound is larger than the world it sits on. Every such
sphere intersects every frustum, so the test passes everything and the
coalescing then draws one run covering the whole buffer.

**Why it matters.** Not a correctness problem -- the right pixels are drawn --
but the cull is paid for and buys nothing at exactly the settings the shipped
world uses, which is the case it was added for. It reads as working because
the frame rate is fine; the frame rate is fine because the billboards are
cheap, not because the cull is doing anything.

**What would fix it.** Split a formation into several bounds when its spread
passes some fraction of the radius, so a cluster on the far side of the planet
is a separate sphere from one overhead. The subdivision is what costs the
effort; the test itself is unchanged. Worth measuring first whether the cull
earns anything at all at spreads where it *does* work, since the alternative is
to take it out.

---

### F-051 — Nearly two thirds of the shipped world's land is above the snow line

**Kind:** tuning
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-20, while checking the noise lab's bands against the generator
**Where:** `packages/client/src/PlanetSettings.ts`, `GROUND_LINES`

**What happens.** The material lines are absolute metres -- grass to 300, bare
stone to 400, snow over it -- and the shipped `relief` is 1,100 m. Measured over
the 31,329 columns of one 5.6 km patch at 45,-175, the surface comes out
**63.4% snow**, 18.9% grass, 10.0% stone and 7.8% sea floor. The three land
bands are drawn exactly where the generator puts them; there is nothing wrong
with the rule. There is simply very little of the world under 400 m.

**Why it matters.** It is most of why the terrain reads as one thing everywhere.
Three of the four materials share 29% of the surface between them, and a player
walking that patch is on snow almost the whole time -- so the bands, which exist
to make one place look unlike another, are doing almost no work. It also wastes
the rock band, which is 100 m wide against a 1,100 m range and shows as a thin
collar under every summit rather than as terrain.

**What would fix it.** Three candidates and nobody has measured between them.
Lower `relief` until the bands share the range, which shortens the mountains.
Raise the two lines with it, which gives up the property that a colour on the
map names the block the world builds at that elevation on every planet. Or make
the lines a stated fraction of `relief`, which was the rule before absolute
metres replaced it and was dropped because fractions agreed at one relief and
drifted everywhere else. `demos/noise-lab.html` shows the share for any setting,
which is what the choice needs.

---

### F-052 — `Detail on top` is a ratio, so what it means in metres depends on the other layer's curve

**Kind:** design
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-21, while answering what `Detail on top` does
**Where:** `demos/noise-lab.html`, `fieldAt`; `tools/trial-layer-relief.ts`

**What happens.** The world is two layers summed, `base + mountains x detail`,
and the metre scale then divides the whole sum by its own peak. So `detail` is
a bare ratio between two terms, and the metres it buys depend on how far the
*terrain* curve happens to span. Measured on the arrangement this replaced,
with `detail` pinned at 1.5 and `relief` pinned at 1,100 m and only the base
curve moving: the second term reached **1,093 m**, **1,611 m** and **1,130 m**
under three curves -- a **47% swing** in what one knob does, caused by a knob
about the other layer.

**Why it matters.** The ground bands are absolute metres, so "how many metres
does the mountain layer add" is the question a person is actually asking when
they drag this slider -- it decides whether a range can reach the rock line on
its own. A ratio cannot answer it, and the answer moves under them while they
shape the terrain curve.

**What would fix it.** Three candidates, measured. **A readout** reuses the
scale the fit has already worked out, so the panel can print both halves in
metres under the slider and update them live, changing no model. **A share**
replaces `detail` with the mountain layer's percentage of the relief and solves
back for the raw ratio in closed form, which holds steady while the terrain
curve moves -- over the same three curves it took the spread from **47%** to
**4.0%**. **Two metre knobs**, one per layer, is the honest form and cannot keep
the fit: dividing by the field's own peak leaves only their ratio, so `(600,
300)` and `(1200, 600)` give a bit-identical world, and without the fit the
tallest point lands **25-31%** below the two knobs added together, because the
two peaks are not in the same place. That last one gives up "Relief is how tall
the tallest mountain is", which is the property the fit exists for.

**Tried and reverted.** The share and the readout both shipped on 2026-08-21 and
both came back out the same day, along with the arrangement they were built for.
They are recorded here because the measurements stand and the candidates are
still the candidates. What they solved was the wrong problem: the ratio was
between a *control layer* and a shared base octave stack, and that stack no
longer exists -- the panel now holds two peer layers, each its own noise, and
the reason for having layers at all is to shape where the ground does what,
which a balance knob does not touch. The share is also a worse knob to reach for
first, because it reads as though it decides something about the *world* when it
only decides a mix.

---

### F-053 — Droplet erosion raises the median hillslope by 41%, which is roughening and not carving

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** high
**Effort:** medium
**Found:** 2026-08-21, while measuring what it would take to put erosion back on
the panel
**Where:** `packages/engine/src/generation/coarse/erodeDroplets.ts`, the cut
branch and its `CUT_SHARE` spread

**What happens.** Doc 21 states the test this pass has to pass: the median slope
holds and the tail grows, because that is the shape of a channel network cut
into ground that is otherwise left alone, and "a knob whose median climbed with
it is adding roughness, not carving". On the map the engine ships it fails that
test. Measured at level 8 on a 32 m cell with the shipped knobs, seed `chamfer`,
erosion at strength 1, slope being the steepest of a cell's six neighbours over
land cells:

| Relief | median | 90th | 99th | steepest | ground moved |
|---|---|---|---|---|---|
| 1,100 m, no erosion | 0.427 | 1.378 | 2.921 | 6.66 | — |
| 1,100 m, erosion 1 | 0.602 (x1.41) | 1.939 (x1.41) | 3.833 (x1.31) | 13.10 | 12.46 m a cell |
| 300 m, no erosion | 0.119 | 0.377 | 0.797 | 1.82 | — |
| 300 m, erosion 1 | 0.164 (x1.38) | 0.576 (x1.53) | 1.188 (x1.49) | 3.56 | 4.95 m a cell |

The median and the 99th grow by nearly the same factor, which is what a uniform
roughening looks like. Doc 21's own table has the median moving `0.077` to
`0.083`, a factor of 1.08, and it was taken at level 7 on a **100 m** cell. The
shipped map is a 32 m cell, so a hillside is drawn three times more finely and
every cut lands on three times less ground.

**The cause is the shape of a single cut, not the amount of it.** `CUT_SHARE` is
`0.5`, so half of every cut is taken from the cell the droplet stands on and the
other half is divided over its six neighbours — one sixth of a half each. The
centre therefore drops **six times** as far as any neighbour, which is a negative
spike, and a pass built out of negative spikes adds high-frequency roughness by
construction. Sweeping it at 1,100 m of relief, with everything else held: the
median multiplier is x1.41 at `CUT_SHARE` 0.5, x1.30 at 0.25, x1.23 at 0.10 and
x1.17 at 0. Halving `MAX_CUT` from 0.1 to 0.03 takes it to x1.15 on its own, and
both together to **x1.07** — which is doc 21's number, reached by making the
kernel flatter rather than by cutting less in total.

**Why it matters.** Erosion is the only pass that shapes ground in a way noise
cannot, and it is currently off. F-039 is the reason given for that, and F-039's
symptom has faded while this one has not — so a fix aimed only at the walk would
turn erosion back on and still hand back a rougher planet rather than a carved
one. The two share a cause: a droplet that stands on exactly one cell can only
ever cut a spike into it, and a droplet with a position between cells cannot.
A continuous droplet spreading each cut over the three lattice points around it
runs at **x1.10** on the median at 1,100 m of relief and moves 7.66 m a cell
against 12.46 m, measured on the same map.

**What would fix it.** Two, and they are not exclusive. The small one is to flatten
the cut kernel — `CUT_SHARE` toward 0 and `MAX_CUT` toward 0.03 — which is two
constants and gets the median multiplier to 1.07 without changing any structure.
The large one is the continuous droplet F-039 asks for, which fixes the kernel as
a side effect because a fractional position has three lattice points under it and
no single cell to spike. Prefer the second, and measure the first first, because
it says how much of the problem is the kernel alone.

---

### F-054 — The noise lab has no grid, so erosion cannot be shown in the tool the knobs are tuned in

**Kind:** gap
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-21, while reading the lab to see where an erosion row would go
**Where:** `demos/noise-lab.html`, `fieldAt` and `generate`

**What happens.** Every picture the lab draws is a pure function of a direction.
`fieldAt` takes `(x, y, z)` and returns a height; `generate` calls it once per
patch vertex and once per sphere sample, and the planet map calls it once per
pixel. Nothing in the file ever asks a sample about its neighbours, and there is
no cell numbering, no ring and no coarse grid. Erosion is a pass over a
neighbourhood, so there is nowhere in the lab to put it. The lab has no erosion
row for that reason and not by choice.

**Why it matters.** The lab is where the two layers, the two curves and the
material bands were tuned, and it is the only place a knob can be dragged
against a picture. Erosion is the one pass that would change the shape of the
ground rather than its height, so it is exactly the knob that needs a picture —
and it is the only world parameter the lab cannot show. The client's map editor
does have the real grid and the real `erodeDroplets`, so the two tools would
disagree about what the same query string builds the moment an erosion row
appeared in one of them.

**What would fix it.** Two, and they answer different questions. Erode the
**patch** — the lab already lays out an `(n+1)` by `(n+1)` grid of heights at
exactly one map cell per step, so a droplet walk over that array is a few dozen
lines and needs no cell IDs. It would be wrong at the patch edges, because a
droplet in the engine crosses ground the patch does not hold, and the lab's
patch is 176 cells across against a droplet life of 48 steps, so a margin of 48
cells makes the interior right. It also cannot show what erosion does to a
coastline, because the sea level and the metre fit are read off the sphere and
the sphere is not eroded. The other is to stop having two tools: the client's
map editor already runs the real `CoarseMapBuilder` with the real erosion stage,
and what it lacks against the lab is the curve editors and the contour graph.
Prefer the second if the lab is going to keep growing, and the first if erosion
is the last thing it needs.

---

### F-055 — Erosion costs more than the noise field it cuts into

**Kind:** risk
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-21, timing a full map build with the erosion stage turned on
**Where:** `packages/engine/src/generation/coarse/erodeDroplets.ts`;
`packages/client/src/MapPanel.ts`

**What happens.** A full build at level 8 costs 401 ms for the grid, 2,388 ms
for the two noise layers and **3,354 ms** for erosion at strength 1. Turning the
knob off zero therefore more than doubles a map build. `MapPanel` already says
erosion is the slow step; this is the number. The droplet count is
`strength x 1.5 x cellCount`, so it grows with the map exactly as the noise does
and the ratio holds at every level: 60 ms against 168 ms at level 6, 381 ms
against 689 ms at level 7.

**Why it matters.** The map editor redraws while a knob is dragged, and the
build chain is arranged so a change to a late option does not recompute the
early ones — that arrangement is what makes Height redraw in 1.2 s against
Ground's 5.5 s. Erosion is the last stage, so dragging its own knob pays only
for erosion, which is the good case. Every other case is worse: a change to
Relief now costs the metre fit plus 3.4 s of water. Nobody is hurt today because
the knob is pinned at zero and `erodeDroplets` returns on its first line, and
everybody is hurt the day it moves.

**What would fix it.** The droplet count and the step count are both knobs
nothing has swept — the pass runs 983,043 droplets of up to 48 steps at level 8
and no measurement says either number is needed. Sweep them against the slope
statistics in F-053 and take the cheapest pair that still carves. Beyond that
the pass is a scalar walk over typed arrays with no allocation, so what is left
is running it in the map worker at a lower level and resampling, or accepting
the second and a half.

---

### F-056 — Live rebuild flushes the terrain and nothing that follows from its shape

**Kind:** gap
**Milestone:** 0.5.0
**Priority:** low
**Effort:** medium
**Found:** 2026-08-21, adding a way to rebuild the terrain without reloading
**Where:** `packages/client/src/planet.ts`, `flushTerrain`; `PlanetSettings.LIVE_TERRAIN_KNOBS`

**What happens.** **Live rebuild**, a checkbox on the parameter panel, replaces
the coarse map and every chunk built from it the moment a terrain knob settles,
with no page reload. It is deliberately narrow: `LIVE_TERRAIN_KNOBS` admits only
the knobs that decide the map itself -- the two layers, Land, Relief, Sea depth,
Sea level, Peak scale, Detail, the merge, erosion, the seed. Everything the
*shape* of the world feeds into afterwards stays exactly where it was: the sea's
own surface radius, the sky's atmosphere depth, the cloud decks' radii and the
crust top are all computed once at page load from the old map's true peak and
never revisited. A Relief raised far enough to move `crustTopRadius` a long way
shows the new ground with the old sea floating at the wrong height above or
through it, until the page is actually rebuilt with **Rebuild**.

**Why it matters.** It is easy to read "live rebuild" as "the world updates" and
drag Relief past where that stops being true. Nothing crashes and nothing looks
obviously wrong at a glance from orbit -- the mismatch shows up as the sea
sitting at the wrong height relative to the coastline, which is the kind of
thing a person notices as "looks a bit off" rather than as a named bug, unless
this entry tells them what to check.

**What would fix it.** Recompute `shape.seaSurfaceRadius`, the atmosphere's
`planetAtmosphere` inputs and the two cloud deck radii from the new map inside
`flushTerrain`, the way `map`, `shape`, `peaks` and the generators already are,
and hand the new numbers to `sea`, `sky` and `billboardClouds` -- each already
exposes a live setter for its own look, so this is wiring rather than new
machinery. Left undone because Relief is not in the default draft's habit of
moving far enough to notice, and because it is a straightforward follow-up
once someone is actually leaning on Live rebuild rather than trying it once.


---

### F-063 — Two things the noise lab does that the terrain bench does not

**Kind:** gap
**Milestone:** 0.5.0
**Priority:** low
**Effort:** small
**Found:** 2026-08-22, closing F-060's first item and finding the other two
still standing
**Where:** `packages/client/src/terrain.ts`;
`packages/engine/src/render/patch/PATCH_SHADER.ts`

**What happens.** The bench carries every knob the lab has, both flat pictures,
the contour graph, the curve editors and every line of the readout but two.
F-060 named three; the note under **Mountain line** is now there, counted over
the map's own cells while it is built and shown as *40.3% of the planet is
above it* on the shipped world.

**A note under Sea level** saying how much of the patch draining just handed
back. It is the number that says what the knob bought, and what a person wants
to know about a knob stated in metres.

**The erosion picture in the plane.** Picking *What the water did* redraws the
flat map in red and blue and leaves the patch drawn as ground. The lab does the
same -- its plane shader carries four pictures and the erosion one is not among
them -- so this is parity rather than a regression, and it is still the one
picture that has to be read on a map instead of on the ground.

**Why it matters.** Nobody is hurt while the lab is still there. It matters the
day the lab is deleted, because these are the two things somebody would go back
to it for, and going back would mean tuning against a page whose metres are
fitted differently from the engine's.

**What would fix it.** The note is the same shape as the bench's other readout
lines: count the patch's own cells that came out from under the water when the
drain moved. The picture is a fifth branch in `PATCH_SHADER` reading the cut in
metres, which is an eleventh float on the vertex -- the mesh already rebuilds
when the ground moves, so nothing else has to change.

---

---

### F-076 — The in-scattered light is not blocked by terrain, so there are no shafts of light through a gap in a ridge

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** large
**Found:** 2026-08-25, looking at a low sun standing behind a ridge
**Where:** `packages/engine/src/render/sky/ATMOSPHERE_SHADER.ts`, `scatter()`
and `inPlanetShadow()`

**What happens.** Every in-scattering sample asks whether the sun reaches it,
and the only thing that can answer no is the planet's own sphere.
`inPlanetShadow` is a ray test against a ball of radius `planetRadius`;
terrain is invisible to it, and so is the sun-leg optical depth the same
sample reads out of the baked table. So the column of air between the camera
and a mountain is lit as though the mountain were not there. With the haze
thrown **30x** forward at `g = 0.76`, that paints a warm disc of glow across
the mountain's face at exactly the place the sun stands behind it.

**Why it matters.** It reads as the sun shining through solid rock, and it is
the one place an otherwise convincing sky breaks. It is worst at a low sun
against a near ridge, which is when somebody is most likely to be looking at
the sky at all. The same gap is why there are no crepuscular rays: shafts of
light through a gap in terrain **are** this shadowing, so the feature and the
artifact are one question.

**Haze on distance** dims it, because the airlight is scaled by it -- but
that is a mitigation over the whole picture rather than a fix here.

**What would fix it.** An occlusion test per march step, which is volumetric
shadowing. Three shapes, cheapest last:

- Sample the **cascade shadow maps** where the step falls inside one. Correct
  and nearly free, since the maps are already bound for the ground -- but
  they reach `260 m` by default and the ridge in question is kilometres off,
  so it fixes the near field only.
- Bring back a **coarse-map lookup on the sun leg**, which is the walk F-074
  removed. The map answers *is ground above this point* in one texture read
  rather than a march, so the cost is one lookup per in-scattering step --
  ten a pixel at the shipped count, against the twenty-four a pixel the old
  per-fragment walk cost. It reaches the horizon, which is the range this
  needs, and it does not bring back what F-074 struck: that entry removed the
  march because it duplicated the cascades for **surface** shading, and this
  is the volumetric job the cascades cannot reach.
- Do neither, and hold **Haze** and **Haze forward** low enough that the
  spike never gets bright. That is what ships today.

**Tried, and reverted:** 2026-08-25, `ce77f5b`, reverted the same day. The
second shape above, built and then taken out again. Three things it taught,
all of which the next attempt has to answer:

- **The walk is far too expensive for what it draws.** The bill is the
  **product** of two step counts -- six readings toward the sun per
  in-scattering sample, times the march's own ten, is sixty dependent texture
  reads a fragment. On this project's software adapter ten-by-eight stops
  presenting altogether, ten-by-seven draws at **915 ms** of GPU against the
  rest of the frame's 140, and five-by-eight at **302 ms**. The estimate in
  this entry of *one lookup per in-scattering step* is wrong and is the reason
  the shape looked affordable: one reading of the map says how high the ground
  is under one point, and whether a ridge stands between a point and the sun
  is a walk, not a reading.
- **A map cell is 32 m and the walk had six steps, so the shadow it drew was a
  coarse copy of the ridge** rather than light. It reads as a dark shape laid
  over the hillside, with the map's own cell size and the walk's own step
  spacing both visible in its edge.
- **The elevation fade was wrong, and the wrongness is instructive.** The walk
  was faded out above a 20 to 35 degree sun on the measurement that ground
  shades *itself* only where its own slope beats the sun -- which is a fact
  about **ground**, and says nothing about a 300 m mountain seen from its
  foot, which subtends a huge angle and blocks a high sun outright. So the
  case a person actually stands in -- at the base of a mountain, sun behind
  the summit -- was the one case the fade switched off.

**And the artifact has a second half this entry never named**, which is now
fixed. With the sun behind a near mountain the disc and its bloom are correctly
hidden, and a soft bright patch still marked where the sun was, so it could be
tracked straight through the rock. That patch is the Mie term: at `g = 0.76`
the phase is 30x brighter straight at the sun than even scattering.

**Fixed** 2026-08-25, by asking one question per pixel instead of one per
sample. The forward spike only exists near the sun -- 30x straight at it, 3.2x
at 30 degrees, 0.57x at 60 -- and where a ray points at the sun the sun leg
from every sample along it runs along the ray itself, so whatever the ray hits
is exactly what stands between those samples and the sun. The depth buffer
already holds that and is the same buffer that hides the disc. The airlight now
fades out where a ray within 45 degrees of the sun has something drawn in it:
zero texture reads, one `smoothstep`. Over a sunrise ridge the face falls from
**54.6 to 31.8** of 255, fifth percentile of the ratio **1.000**, against
**31.1** for turning the haze off outright -- so it takes the spike and nothing
else. Midday is unchanged at **123.1 against 123.6**.

**What is still open is narrower than this entry started with.** Air shadowed
by terrain a ray is *not* pointed at is untouched, which is exactly where
crepuscular rays live: shafts through a gap in a ridge, seen from the side.
Nothing cheap has been found for that, and the walk above is what expensive
looks like.

### F-081 — Three fields with three curves reach landforms the shipped two-layer merge cannot

**Kind:** idea
**Milestone:** unscheduled
**Priority:** low
**Effort:** large
**Found:** 2026-08-25, while building `demos/multi-noise-lab.html`
**Where:** `packages/engine/src/generation/height/layeredHeight.ts`,
`demos/multi-noise-lab.html`

**What happens.** The engine builds a surface from two noise stacks and two
curves: a terrain layer that decides where the land is, and a mountain layer let
through in proportion to how far the terrain already stands above **Mountain
line**. The lab builds one from three, and the third field does a job neither of
the two can. Continentalness sets the level, erosion decides what fraction of
the relief survives at that place, and peaks and valleys is the relief. Erosion
**multiplies**, so a region its curve sends to zero is flat whatever the peaks
field says there.

Measured over the planet's own cells at level 6 with the lab's shipped knobs,
the fraction of the relief erosion cuts away on land runs `0.05` at the tenth
percentile, `0.46` at the median and `0.90` at the ninetieth — the whole range,
across one world. Two frames of one place with the erosion curve pinned to each
end: cutting nothing, the patch is ridges everywhere, ground `-288` to `659 m`;
cutting all of it, a smooth continental ramp with a clean shoreline and no ridge
on it, `-236` to `230 m`. Over the planet that is a 95th percentile of height
falling `537 m` to `256 m` while the land share moves `37.7%` to `38.2%`,
because what erosion takes is relief and — in proportion to its own second
term — level, never the coastline.

**Why it matters.** The gated merge answers *may this place be mountain* with a
yes or a no read off the terrain layer's own height, so how rough a place is and
how high it stands are one question. A third field separates them: a low plain
can be rough and a high plateau can be flat, and neither is reachable now. That
is the difference between a planet with one texture and a planet with regions.

It is not free of cost, and the cost is a whole noise stack — a third set of
octaves evaluated at every point the height field is asked for, against the two
the engine runs today, plus a third curve on the panel and in every stored
world's identity. `volume.js` prices the height term against the density term
and not against itself, so what a third layer costs per chunk is not measured.

**It also takes a metre budget the two-layer merge does not.** Peaks and
valleys is applied about the level continentalness set, so wherever the
continent curve is shallower in metres than the peak height, the third field
decides land-or-sea rather than relief and the coastline speckles. Measured on
the lab's own world: with the continent curve spanning `771 m` over the range
continentalness actually reaches and a peak of `420 m`, peaks flipped **7.8%**
of the planet from what the continent said and **89.9%** of it sat within one
peak of sea level. Steepening the curve's coastal segment and widening its
axis to `2,000 m` takes that to **0.9%** and **50.8%**. A shipped world would
need the same care, and nothing in the engine currently states that budget.

**What would fix it.** Nothing is broken, so this is a decision rather than a
repair, and it belongs in a release worked through the three steps of
[`HOW-TO-WRITE-PLANS.md`](HOW-TO-WRITE-PLANS.md): the lab is step 2 for one
candidate and the shipped merge is the other. What step 1 would have to settle
is whether the erosion field replaces the gate or sits beside it, and whether a
curve that multiplies is the right shape for it — the lab's erosion curve only
ever takes relief away, and a curve that could also lower the base would let a
worn region sit lower as well as flatter.


### F-086 — A tree is wider than the reach an edit is routed over, and nothing generates a structure across a chunk rim

**Kind:** gap
**Milestone:** beyond 1.0.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-26, building `demos/vegetation-lab.html`
**Where:** `packages/engine/src/generation/chunk/chunksReading.ts`,
`MESHER_REACH`, `packages/engine/src/generation/ChunkColumnSampler.ts`

**What is missing.** The vegetation lab grows plants from a hash of the cell
they stand on and rasterises them into the block grid, and it does that over a
whole patch at once, which a lab may do and a chunk may not. In the engine a
chunk generates its own contents alone -- `columnAt(face, i, j)` takes an
address and no neighbour -- and a plant does not fit inside one column. A
canopy measured in the lab reaches **3 to 4 m** on the shipped 1 m block, and a
redwood's reaches **6 m**; a chunk at depth 13 cut at chunk level 6 is 64 cells
a side. So every chunk holds parts of plants rooted in the chunks around it,
out to the widest canopy the species table allows.

**Why it is not the reach that already exists.** `MESHER_REACH` is **2** -- a
rim cell asks its own ring and an apron cell asks its own ring, which is the
furthest a *face* decision reaches. A plant is not a face decision: it is
content, generated from an address that may be six cells outside the triangle.
The two numbers are unrelated and the plant one is set by the species table
rather than by the mesher, so it moves whenever somebody adds a bigger tree.

**What it costs to close.** A root is a hash test on a cell, so a chunk can
enumerate candidate roots over its own triangle grown by the widest canopy and
grow the ones that hit. It stays a pure function of the address -- no flood
fill, no fetch -- and the bill is the rim: at 64 cells a side, growing the
triangle by 6 cells is about **1.4x** the cells to test for a root, and only
the ones that hit cost anything after that. What has to be written down
somewhere both ends read is the widest canopy, the way `MESHER_REACH` is
written down once, or a chunk and its neighbour disagree about whether a tree
exists.

**The lab now does it, and it holds.** `demos/vegetation-lab.html` cuts its
patch into the same triangles -- a cell's scaled barycentric weights floored,
one level of the hierarchy `coarseCorners` already descends -- and generates
each one alone, writing only the cells it owns. The check is the patch against
itself: the same ground generated a second time in one piece, compared cell for
cell. At 48 blocks a chunk and 24 m of reach it reads **0 cells differ**, and
the reach is load-bearing rather than decorative -- **10,702** cells differ at
no reach at all, **704** at 8 m, **0** from 16 m up. The cost is the rim:
**27,360** roots tested against **7,057** owned, **3.88x**.

**Three things had to change for that to hold**, and all three are the same
mistake in different places: reading something the patch knows and a chunk does
not. A plant is grown in **world coordinates** rather than the patch's own
east/up/north frame, because two chunks would each grow one tree about their own
middle. Layers count from a **world datum** rather than the lowest ground in
view. And the bend and the leaf cut are read at the cell's own place in the
world. **Any of the three left in place makes a tree change shape at a chunk
boundary**, which is the failure this finding is about.

**It also priced the reach, which turned up a defect.** The widest plant in the
shipped stand reaches **19.8 m** sideways from its trunk -- but only after
fixing the bend, which was a nudge added to each step and so a random walk in
direction: an 86 m trunk at a 0.4 m step is 215 steps, and a nudge of 0.075
wanders about a radian, measuring **40.8 m** of sideways reach on a crown twenty
across. A displacement from the heading a limb set out on is bounded by the knob
and leans a stand together just the same.

**Level of detail is the same mechanism and it holds too.** A plant is blocks,
so it is drawn by the chunk's own mesher at the chunk's own level -- there is
nothing to bake and nothing separate to fade. The lab draws the same ground at a
shallower depth and rasterises the same skeleton, which is in world metres and
knows nothing about resolution, into whatever lattice is there. Over five
levels the hexagons drop fourfold a level, the rebuild falls from **4,990 ms to
580 ms**, and the chunk audit reads **0 cells differ at every one**.

**But the roots do not get cheaper, and that is structural.** A root is a cell,
and a coarse chunk's cells are not a fine chunk's cells -- hashing its own would
choose a different forest at every level and a tree would come and go as a
player walked. So the planting lattice is the **finest** one whatever is being
drawn, and the root walk is the same size at every level: **the one part of a
chunk whose cost does not fall with distance**. Plant counts across levels 0 to
4 are 186, 185, 185, 186, 182 -- the drift is only plants shorter than one
block, which are not grown because a rod's own minimum radius would draw a 0.9 m
heather as a whole 8 m block.

**Three rules came out of it, and all three are things a chunk must not read.**
A planting test that reads the drawn level makes the forest depend on it: the
slope limit divided by the drawn cell rather than the finest, which refused
**6,544 of 7,045** roots at level 2 against none at level 0, and the waterline
was read off the drawn cell, which resamples the surface. And **material
precedence must be a rank fixed before any plant is grown, never a permission**
-- past a cell wider than a trunk the canopy has to win or a forest draws as
bare poles (**2,938 wood cells against 62 leaf** at level 3), but letting a leaf
overwrite wood where it happens to arrive second makes the answer depend on the
order plants are grown in, and a chunk grows them in a different order from its
neighbour. Measured, that alone took the audit from **0 cells differing to 10**.

**What is left for the engine.** The reach has to be written down once where
both the store and the mesher read it, the way `MESHER_REACH` is, or a chunk and
its neighbour disagree about whether a tree exists. And the root walk not
falling with distance is a real bill nobody has priced against a real frame: a
coarse chunk covers four times the ground of the one a level finer, so it grows
four times as many plants while its terrain costs the same. Whether that wants a
coarser planting lattice -- one tree possible per four or eight cells rather
than per cell, which would make the walk fall with the level and cost the
density of small plants -- is undecided.

### F-085 — `tools/bench.ts` crashes before it measures anything, and its header reads knobs that no longer exist

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-25, trying to measure `canonicalCell`'s guard against a real frame
**Where:** `tools/bench.ts`, `packages/engine/src/generation/chunk/ChunkPeaks.ts`
`peakOf`

**What happens.** `npx vite-node tools/bench.ts` builds the coarse map, prints
its header, and then throws on the first scene:

```
TypeError: Cannot read properties of undefined (reading '0')
    at ChunkPeaks.peakOf (ChunkPeaks.ts:144)
    at walk (selectChunks.ts:113)
    at selectChunks (selectChunks.ts:194)
```

`peakOf` reads `this.levels[deepest]`, and at the shipped settings — depth 13
cut at chunk level 7 — `deepest` lands past the end of the pyramid, which is
capped at level 6. Nothing is measured: the run dies before the first scene is
timed.

The header is stale in the same direction. It prints `height scale undefined`
and `landforms undefined m down to 75 m in undefined octaves`, because it reads
`heightScale` and the landform rows that went when the map became the terrain
and the detail tier was removed.

**Why it matters.** This is the only harness that measures what a frame costs
on a CPU — selection, generation and meshing over the reference scenes — and
the numbers 0.1.0 recorded were read off it. While it throws, there is no way
to answer *is this change faster* about the thing that actually runs, and the
temptation is to answer it from a micro-benchmark instead. That is exactly what
happened here: F-084 was closed on a ratio that turned out not to reach a
frame, and it took writing a second harness to find that out.

**What would fix it.** Two repairs, neither large. Clamp `deepest` to the
pyramid's own cap in `peakOf` — the cap is deliberate (F-023 built it that way,
finer triangles read their ancestor) and the reader is what has not been told.
Then take the dead knob names out of the header, or read them off
`PlanetSettings` the way the world itself is read, so the header cannot drift
from the world again.

---

---


## Closed

### F-087 — Under a fold of 0.72 the range was in the field's negative half, so a ridged layer's peaks were its low values

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-26, tuning peaks and valleys in `demos/multi-noise-lab.html`
**Where:** `packages/engine/src/generation/noise/octaveNoise.ts`,
`demos/multi-noise-lab.html`, `demos/vegetation-lab.html`

**What happens.** The fold blends two functions of the raw octave:

```
signal = n * (1 - ridge) + (crease * 2 - 1) * ridge
```

`n` is **odd** and `crease * 2 - 1` is **even**, so on the positive side the
two partly cancel and on the negative side they add. The field stays correctly
shaped -- the high values really are the thin ridge network, measured over the
whole planet as a top-tenth neighbour agreement of **71.9%** against the bottom
tenth's **87.5%**, where a plain sum gives 87.1% and 87.6% -- but the positive
half is left with **no room above the ridges**. They pile against a ceiling.

Measured, the spread of the top tenth against the spread of the bottom tenth
over 20 faces at level 7:

| fold | max | top tail | bottom tail | |
|---|---|---|---|---|
| 0.00 | 0.807 | 0.486 | 0.496 | even |
| 0.20 | 0.429 | 0.198 | 0.467 | bottom **x2.35** |
| 0.35 | 0.338 | 0.129 | 0.431 | bottom **x3.34** |
| 0.50 | 0.474 | 0.227 | 0.391 | bottom x1.72 |
| 0.65 | 0.613 | 0.311 | 0.346 | bottom x1.11 |
| 0.80 | 0.755 | 0.390 | 0.297 | top x1.31 |
| 0.85 | 0.802 | 0.415 | 0.280 | top x1.48 |
| 1.00 | 0.944 | 0.490 | 0.234 | top **x2.10** |

**The crossover is near 0.72**, and the worst setting is around **0.35**, where
the maximum falls to `0.338` -- lower than the plain sum's `0.807` -- and the
top tenth is squeezed into `0.129` of range.

**What it costs.** A curve read against that field has to rise to the **left**
to get a spread of peak heights, which is the opposite of what a layer called
peaks and valleys leads a reader to expect, and the opposite of what the same
knob asks for above 0.72. Turning one knob past `0.72` reverses which end of
another control means *high ground*. Nothing warns of it.

**What is not wrong.** The picture is not inverted -- `bandGrey` is monotone in
the value, so `+1` is white. And the shipped world is above the crossover: peaks
and valleys ships at **0.85**, where the top has x1.48 the range. This bites
only a reader who turns the fold down.

**Closed:** 2026-08-26 -- **the crest moves and the two shapes are never
mixed.** `pivot` is where the field's `+1` sits, at `n = 1` unfolded and
`n = 0` fully folded, and the crease is measured from there:

```
pivot  = 1 - ridge
away   = |n - pivot| / (1 + pivot)
crease = (1 - away) * (1 - ridge * away)
```

One shape at every setting rather than a proportion of two, so nothing can
cancel: the field reaches `+1` at the crest and `-1` at the far end whatever
the dial says. The top tenth leads at every setting -- **x1.08 just off zero
rising to x2.20 at 1** -- and the gradient rises monotonically where the blend
made a light fold *flatter* than none (`10.9°` against `13.8°` at the median).

**Both ends are unchanged to the bit.** At `1` the pivot is `0`, `away` is
`|n|` and the crease is `(1 - away) * (1 - away)` -- the same two operands the
squared fold multiplied. At `0` the branch is not taken. Checked over 200,000
directions at each end: every sample identical, largest gap exactly zero. So no
shipped world moves -- `layeredHeight` passes `ridge: 0` and nothing else in
the engine sets it -- and only a lab with the fold strictly between 0 and 1
draws a different field.

`tools/trial-fold.ts` measures both forms side by side and is what the tables
above and in doc 08 come from.

### F-084 — `canonicalCell` scans twenty faces to hand back the cell it was given, and almost every call is that scan

**Kind:** cleanup
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-25, raising the multi-noise lab's patch to half a million cells
**Where:** `packages/engine/src/addressing/neighbours/canonicalCell.ts`,
`packages/engine/src/addressing/neighbours/cellRepresentations.ts`

**What happens.** `canonicalCell` asks `cellRepresentations` for every name a
lattice point has and keeps the one on the lowest face. `cellRepresentations`
builds a `Map` of the point's non-zero weights and then walks all twenty faces,
testing each against that map with `includes` and building an array for the ones
that match. It does this on every call.

A point has more than one name only when it sits on a face edge or at an
icosahedron vertex, and that is exactly when one of its three weights
`(n - i - j, i, j)` is zero — three comparisons. Everywhere else the answer is
the cell that was passed in.

**Why it matters.** The share of points that need the search is small and gets
smaller with depth. A face at subdivision `n` holds `(n+1)(n+2)/2` lattice
points and `3n` of them sit on an edge, so at level 8 it is **768 of 33,153**,
or `2.32%`; at level 11 it is `0.29%`. **Better than 97% of the calls walk
twenty faces and allocate a map and an array to return their own argument.**

Measured over one patch of 180,589 cells at level 8, taking the ring of all six
neighbours of every cell — 1.08 million steps, which is what a mesher or a
delta write does: **1,207 ms canonicalising every step against 70 ms
canonicalising only where a weight is zero, and the same answer on all of
them.** That is **17x**, and `neighbour` itself is 52 ms of the total, so the
canonicalisation is not a cost beside the walk — it *is* the walk.

It is on hot paths. `cellSlot` canonicalises before keying a row, `owns` and
`chunksHolding` canonicalise while descending, and `DeltaStore.write` reaches
`chunksReading`, which is the ring of every cell it touches.

**What would fix it.** One guard at the top of `canonicalCell`: if no weight is
zero, return `{ face, i, j }`. The search below it is then reached only by the
points that have something to search for, and nothing else changes — the
function's answer is identical, which is what makes this a cleanup rather than a
decision. `cellRepresentations` keeps its full behaviour for the callers that
want every name.

`demos/multi-noise-lab.html` already guards at its own call sites rather than
inside its port of the function, so the ported block still matches the engine
line for line and the guard can be dropped there once the engine carries it.

**Closed:** 2026-08-25, by one guard at the top of `canonicalCell`: with no
zero weight the point is strictly inside its own face, so `{ face, i, j }` is
the answer and the search below is never reached. `cellRepresentations` keeps
its full behaviour for the callers that want every name.

**The entry above overstates what this is worth, and the measurement that
closed it is what showed that.** The function itself is `9.4x` cheaper —
1,083,531 calls go from `1,790 ms` to `191 ms`, same answer on every one — and
**the engine does not get faster**, because nothing in it canonicalises in
bulk without already guarding:

- `CoarseGrid` is the one path that walks the whole lattice, and it *already
  carried the identical test at its call site* — `shared` is the same
  zero-weight check. World creation does not move: **2,923 ms against
  2,907 ms** for the coarse map at level 8.
- A chunk build asks only **1,550** times, about **1.4%** of its own 175 ms,
  so generating and meshing does not move either: **183 ms a chunk against
  176 ms**, inside a run-to-run spread of 4,025–4,694 ms over the same 24
  chunks.

So the claim in the entry — that `encodeCell`, `cellSlot` and the mesher's
rings would each get their share of `9x` — was reasoning from a micro-benchmark
to a frame, and the frame says no. What the guard actually buys is that a
caller no longer has to know any of this: bulk canonicalising was a footgun,
and `CoarseGrid` is a call site that had to carry the test itself to avoid it.
`demos/multi-noise-lab.html` is the caller that met the footgun, canonicalising
every cell of a patch that can be the whole planet.

Kept anyway on that ground, at no cost: it is three comparisons, the answer is
identical, and `packages/engine/tests/addressing/neighbours/canonicalCell.test.ts`
pins it against the search it replaces over **every** cell of the whole lattice
at levels 1, 2, 4 and 8 rather than over a sample, and checks the implication it
rests on — a cell with a second name always has a zero weight. The lab carries
the same guard in its port, so that block still matches the engine line for
line.

`tools/trial-canonical.ts` runs all three measurements and is the thing to
re-run before believing a ratio like this one again.

---

### F-083 — Switching Full light rebuilds the coarse map, which the switch cannot move

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-25, asked what flipping the switch actually costs
**Where:** `packages/client/src/planet.ts` (`flushTerrain`, `onLiveRebuild`),
`packages/client/src/PlanetSettings.ts` (`REMESH_KNOBS`)

**What happens.** **Full light**, **Sky exposure**, **Corner shading** and
**Speckle** are in `REMESH_KNOBS` because the mesher bakes them into the
vertex colours, so moving one has to build the meshes again. The panel routes
every one of them to `onLiveRebuild`, which is `flushTerrain` -- and
`flushTerrain` is the path a *terrain* knob takes. It regenerates the coarse
map from the seed, rebuilds the shape, the peaks pyramid and all seven
generators, and disposes and recreates the whole worker pool, before a single
chunk is meshed. None of that is a function of the four knobs that took the
path.

> **[measured]** The shipped world, before any chunk is meshed: coarse map
> **1,144 ms**, peaks pyramid **127 ms**, shape and the seven generators
> **4 ms** together -- **1,276 ms** of work whose every input the four baked
> knobs leave exactly as it was. The re-mesh that follows is the only part
> the knob asked for.

**Why it matters.** It reads as a switch that hangs the tab for over a second
for no reason a player can see, and it is the same second whether the world
is a shipped one or a plain one. It also makes the four baked knobs feel
like world settings rather than view settings, which is the opposite of what
they are: not one of them moves a block.

**What would fix it.** Two candidates, and they are not the same size.

**A: a re-mesh path that is not `flushTerrain`.** Keep the map, the shape,
the peaks and the generators; hand the pool a new `meshSetup` and rebuild
the meshes. The obstacle is that a worker's setup is fixed for its life, so
either the pool is recreated (cheap next to the map) or the setup becomes a
message the pool can take. Removes the 1,271 ms and leaves the re-mesh.

**B: stop baking the sky exposure at all.** Carry it as its own vertex
attribute rather than multiplied into the colour, and the shader can ignore
it on a uniform -- which makes **Full light** and **Sky exposure** take
effect on the next frame with no rebuild of any kind. It costs **4 bytes a
vertex** on the current 24-byte stride, a sixth more vertex memory, and it
does not help **Speckle** or **Corner shading**, which vary per vertex and
so cannot be divided back out by a uniform. B is the better answer for the
two knobs a player actually reaches for underground; A is the one that
helps all four.

F-056, *Live rebuild flushes the terrain and nothing that follows from its
shape*, is the same function seen from the other side: that entry is about
what `flushTerrain` fails to update, this one about what it updates and did
not need to.

**Closed:** 2026-08-25, candidate A. `BAKED_KNOBS` is now a set of its own
and takes its own path: `flushMeshes` retunes the worker pool in place and
drops every chunk, where `flushTerrain` still rebuilds the map for a knob that
moves the ground. What the cheap path skips is **978 ms** on the shipped world
at depth 13 -- 835 ms of coarse map, 139 ms of peak pyramid, 4 ms for the shape
and the eight generators (`tools/trial-remesh.ts`) -- and not one input to any
of them is a function of a baked knob.

The pool is retuned rather than replaced, so the map's five typed arrays are
not structured-cloned once per worker either. A `retune` message carries the
three switches; `WorkerMeshSource` folds them into the setup it holds, so a
worker spawned later to replace a dead one gets them too rather than quietly
going back to what the player has just turned off.

**Keeping the pool is what made a job in flight a problem.** Replacing it
rejected everything a worker was holding; keeping it means those jobs finish
under the switches they were posted with, and `request` chains onto a job in
flight rather than posting a second one -- so the caller asking again is
handed exactly that stale mesh and nothing asks a third time. Up to one chunk
per worker would have kept the old lighting until something else rebuilt it,
scattered wherever the pool happened to be busy. `retune` marks every running
job stale, which `finish` already knows how to re-post.

What is left is the re-mesh itself, which is the work the knob actually asked
for. Confirmed in the real client (`tools/probe-remesh-path.mjs`): Full light
and Corner shading take the mesh path, Relief takes the terrain path, and the
readout now says which -- it claimed "rebuilding the terrain" for a knob that
rebuilds no terrain, which is what made the two impossible to tell apart from
outside.

Candidate B -- carrying the sky exposure as its own vertex attribute, so no
rebuild is needed at all -- is untouched and still costs 4 bytes a vertex. It
is worth less now than it was: what it removes is a re-mesh rather than a
re-mesh plus a map.

---

### F-080 — The Prettier range is a caret, so two machines disagree about what formatted means

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** low
**Effort:** trivial
**Found:** 2026-08-25, running `npm run format:check` before a push
**Where:** `package.json`, the `prettier` devDependency

**What happens.** `format:check` reports `packages/client/src/PatchLook.ts`
and `packages/client/src/SphereView.ts` as unformatted on a clean tree.
Neither file has been edited since the merge that brought it in, and it was
formatted when it was written. What changed is the formatter: the dependency
is pinned as `^3.4.2`, this container resolved it to **3.9.6**, and 3.9
lays a union type out differently -- a short union that 3.4 broke onto one
line per member, 3.9 collapses onto a single line.

**Why it matters.** Running `--write` here fixes the check on this machine
and breaks it on any machine that resolved 3.4.x, so the two files would
flip back and forth with every session and every diff would carry
whitespace nobody chose. The formatter is a tool whose whole value is that
everybody gets the same answer, and a caret range is the one thing that
stops it giving one. It also means `format:check` is red for reasons
unrelated to whatever a session is actually doing, which trains people to
ignore it.

**What would fix it.** Pin the exact version -- `"prettier": "3.9.6"`, no
caret -- and run `--write` once over the whole repo in the same commit, so
the tree and the pin agree from that point on. A lockfile alone is not
enough, because `npm install` in a fresh container with no lockfile entry
for a transitively hoisted tool still picks the newest match. Nothing else
in the toolchain has this shape: `typecheck`, `check-style.js` and
`build-docs.js` all run code that lives in this repository.

**Closed:** 2026-08-25, pinned to `3.9.6` exactly, with the three files
reformatted in the same commit. The flip-flop is not hypothetical: while this
entry was being written another session pushed a commit reformatting
`meshChunk.test.ts` in the **opposite** direction -- expanding a union its
Prettier wanted expanded -- which turned a file that passed here into a third
failure the moment it was merged. `package-lock.json` already resolved
`3.9.6`, so the tree and the lock now agree and the range can no longer drift
under a fresh install.
---

### F-079 — Speckle is part of a world's identity, so turning it off loses every block the player placed

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-25, wiring a live rebuild for the two shading knobs
**Where:** `packages/client/src/PlanetSettings.ts` (`LIVE_TERRAIN_KNOBS`,
`WORLD_SHAPE_KNOBS`, `worldShape`), `packages/client/src/planet.ts`
(`editWorld`)

**What happens.** `WORLD_SHAPE_KNOBS` spreads `LIVE_TERRAIN_KNOBS`, and
`worldShape()` turns that set into the record `worldKey` hashes into
`editWorld` -- the key a player's stored edits are filed under. `speckle` sits
in `LIVE_TERRAIN_KNOBS`, with a comment saying it is there only because seeing
it change takes the same work a terrain knob takes. So it is in the world's
identity as well, and turning it on or off files every future edit under a
different world and leaves the existing ones behind.

**Why it matters.** Speckle moves no block. It drifts a cell's colour off its
block's own by up to 6%, and `WORLD_SHAPE_KNOBS`'s own doc says the knobs that
decide only how the world is drawn are deliberately absent for exactly this
reason -- `chunkCells` is named there as the case that was got right. A player
who builds something, toggles Speckle to compare the ground against the map
picture, and toggles it back does get their world returned; a player who
leaves it toggled has silently started a second one.

**What would fix it.** The reason `speckle` was put in `LIVE_TERRAIN_KNOBS` is
gone: `REMESH_KNOBS` now exists for knobs that need every chunk meshed again
and move no block, which is what the two shading knobs use. Moving `speckle`
out of `LIVE_TERRAIN_KNOBS` and into `REMESH_KNOBS`'s own list keeps its live
rebuild and takes it out of the world's identity, and is two lines.

**It is not free, which is why it is filed rather than done.** Dropping a
field changes the key for *every* existing world, not only the ones with the
switch turned, so the edits already on disk are orphaned once on the way past.
That is a save-compatibility call rather than a code one.

**Closed:** 2026-08-25, fixed. `speckle` moves out of `LIVE_TERRAIN_KNOBS` and
into `REMESH_KNOBS`'s own list, beside the corner shading and the sky
exposure. It keeps its live rebuild and leaves the world's identity, and
`WORLD_SHAPE_KNOBS` now names the ground alone.

**The save cost was real and was paid.** Dropping a field changes the record
`worldKey` hashes, so the key moves for **every** world rather than only the
ones with the switch turned, and the edits already on disk are orphaned once
on the way past. Nothing is deleted -- the old rows keep sitting under the old
name -- so what it costs is one world's buildings, once, per world already
saved.

Pinned by a test that flips each of the three baked knobs and asserts the
record does not move, with a terrain knob flipped alongside to prove the
record is not simply empty.

---

### F-073 — Two chunks at different levels of detail sample the ground at different heights, and the apron only ever covered the gap between their tilings

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** high
**Effort:** large
**Found:** 2026-08-24, chasing screenshots of triangular notches along real
chunk seams, always where a fine chunk meets a coarser one
**Where:** `packages/engine/src/mesh/meshChunk.ts` (`meshApronCell`,
`APRON_DROP`), `packages/engine/src/generation/chunk/selectChunks.ts`
(`DETAIL`); measured with a new script, `tools/probe-seam-height.ts`

**What happens.** A fine chunk and a coarse neighbour each sample the terrain
function at their own spacing, so on sloped ground they land on different
points and get different heights back — the apron was built to paper over a
different problem, a tiling gap between two different-sized hexagon grids,
by drawing one side's cap 1 cm lower so the other side wins the depth test.
On flat ground the two heights agree and the trick works. On real relief
they do not: `probe-seam-height.ts` walked 115 real fine/coarse chunk pairs
across five faces and found mismatches up to 22 m on mountainous ground
(face 7), with 15 to 35% of a boundary's cells more than a full block apart.
A 1 cm drop cannot bridge a 22 m one, so the two sides' caps show through
each other as a jagged edge — the notches in the screenshots. Separately,
`selectChunks`'s recursion has no step that keeps two chunks that end up
next to each other within one level of detail of each other, so the gap at
any given seam is not even bounded to a single level's worth of difference.

**Why it matters.** This is what the user is seeing today, on the shipped
default world, with caves off and nothing unusual turned on — it needs
sloped ground and a level join, and the reference planet has both
everywhere. It is the surface form of F-025's cave-mouth gap: same missing
piece, but visible on every hillside instead of behind a feature that ships
off.

**What would fix it.** F-025 already named the real fix and it applies here
unchanged: the mesher does not know a neighbouring chunk's level, so it
cannot ask what height the neighbour actually drew and bridge to it. Telling
each chunk its neighbours' levels, and re-meshing a rim when a neighbour's
level changes, lets the finer chunk emit a wall down to the coarse
neighbour's real height instead of assuming the two already agree. That is a
residency and worker-protocol change, not a tweak to `APRON_DROP` or the
apron's reach.

**Closed:** 2026-08-24, promoted to `plans/v0.4.1.md`, I-16, and built there.

The diagnosis held and the remedy did not. The two levels really do stand at
different heights and the apron's centimetre really cannot bridge it, but the
apron's coverage was never the thing that failed: what failed is that the apron
is a **lid**, with no wall at its outer edge. And the fix needs no protocol
change at all, because **a point's height does not depend on who asks** — a
coarser neighbour's ground is this chunk's own reading of the coarse lattice
point a cell falls into, so each chunk can compute what every candidate level
would draw and wall down to it from one side. `probe-seam-height.ts`'s 22 m is
the size of the difference; `probe-seam-crack.ts` finds where it opens a band,
and that number is 20.0% of the outer edges at a level join, 5.13 m on average.

The worry about the gap being unbounded is also measured away: over every pair
of adjacent cells in a real selection, at three altitudes and across the whole
range of the `detail` knob, two neighbouring chunks are **never** more than one
level apart.

---

### F-071 — A chunk meshes 54 cells it can never be told about, so an edit at a chunk border leaves a wall standing and a hole to see through

**Kind:** bug
**Milestone:** 0.1.0
**Priority:** high
**Effort:** medium
**Found:** 2026-08-23, from the owner digging into a mountain and getting
triangle-shaped ridges along every chunk edge
**Where:** `packages/engine/src/generation/chunk/ChunkColumnSampler.ts`,
`packages/engine/src/edit/chunksHolding.ts`,
`packages/engine/src/mesh/meshChunk.ts`

**What happens.** A chunk meshes more cells than it holds. Its rim cells ask the
ring around them whether to draw a side face, and the apron draws that ring
outright — and those cells sit one step past the rim, which puts them **strictly
inside the neighbouring chunk's triangle**. `ChunkColumnSampler` generates them
on demand from the terrain function, which is a pure function of the seed and
knows nothing about any change a player made.

`chunksHolding` hands a change to every chunk whose triangle **contains** the
cell. That is the right set for the delta store and the wrong set for the
mesher, which reads a ring wider than its own triangle.

> **[measured]** `tools/probe-seam-edit.ts`, at depth 8 cut at chunk level 4.
> A chunk holds **153** slots and reads **54** more from one step past its rim.
> Of those 54, a change is handed to it for **0**. The first of them belongs to
> chunks 878 and 879; the chunk reading it is 867.

Two symptoms, one cause, and they are the two the owner saw.

**A wall left standing.** Break a block just across a chunk boundary and the
neighbour's apron still draws the seed's cap there, a centimetre low. Mine out a
region spanning several chunks and what is left is a one-cell ridge along every
chunk edge — a triangle outline of ground nobody removed.

**A hole to see through.** A rim cell decides whether to emit a side face by
asking the column across the boundary. If a player dug that column away the rim
cell still reads solid ground and emits **no** face, so the wall of the tunnel
is missing and the far side of the planet shows through it. The mirror case is
the same bug: place a block across the boundary and the rim cell reads air and
emits a face that should not be there.

**Why it matters.** It is not a corner case. **17%** of a chunk's slots sit on a
border (`rank.js`), and the ring past the rim is a third as many cells again as
the chunk holds. Digging is the second thing a player does, and a tunnel that
cannot be dug through a chunk edge without breaking the picture is the whole
feature. It is also the one class of artefact that does not heal: the geometry
is wrong on both sides and stays wrong until something else forces a rebuild.

**Closed:** 2026-08-23, and it turned out to be two bugs rather than one.
`chunksReading` is the wider set the store now routes by, and `applyDeltas`
hands back what fell outside the triangle for `ChunkColumnSampler` to write over
the columns it generates. So a chunk generating a cell past its rim gets the
same column the chunk that owns it holds -- which is the invariant the whole
scheme rests on, and there is now a test for it.

**The second bug was underneath.** `chunksHolding` found its candidates by
asking the cell's own ring which chunks owned them, and that misses a chunk at
its own triangle's **corner**: the only neighbours a corner has inside its
triangle sit on that triangle's two edges, so both are shared, and where the
border rule awards both to lower-keyed chunks the triangle whose corner it is
never appears. Measured over every chunk of one face at depth 8 cut at chunk
level 4, **155 of 39,168** cell-and-chunk pairs went unreported. It descends the
triangles now -- they nest, so a chunk containing a point has an ancestor
containing it at every level, and at most six paths stay live however deep the
cut. **0 of 39,168** now.

**What fixed it.** The records have to reach the chunk, and then the sampler
has to apply them.

1. **Widen who is told.** A second set beside `chunksHolding` — every chunk
   whose *mesher reads* the cell, which is every chunk holding any neighbour of
   it. The store already walks the ring to find the holders, so this is the
   candidate list it currently throws away.
2. **Patch the sampler, not the chunk.** `applyDeltas` writes into
   `chunk.blocks`, which has no slot for a cell outside the triangle. The
   generated-column path in `ChunkColumnSampler` is where the same records
   belong: build the column from the terrain, then write the records naming it.

The alternative — holding the neighbouring chunks resident before meshing — is
the one `ChunkColumnSampler` exists to avoid, and it should stay avoided.

**Not to be confused with the LOD seam**, F-025, the cave mouth crossing a
level join. That is two levels
disagreeing about generated ground. This is one level disagreeing about ground a
player changed, and it happens with every chunk at the same level.

---

### F-065 — The sea takes neither the shadow nor the moon

**Kind:** gap
**Milestone:** 0.5.0
**Priority:** low
**Effort:** small
**Found:** 2026-08-22, adding the shadow march and the moon to the terrain
**Where:** `packages/engine/src/render/sea/SEA_SHADER.ts`

**What happens.** The terrain now walks the coarse map toward the sun and
darkens what the walk runs into, and it takes a second directional term from
the moon after dark. The sea shell does neither. Its shader has its own bind
groups -- the frame and its own look -- and neither the height map nor the
moon reaches it, so a mountain's shadow stops dead at the shoreline and the
water is lit at night by one flat number.

**Why it matters.** A headland at sunrise throws its shadow across the ground
and not across the bay beside it, which is exactly the join a person is looking
at from a beach. And the sea is the largest single surface in view from most
places, so at night it is the largest flat-lit thing on screen.

**What would fix it.** The march is already a function of a world position and
an up, and the map's bind group is a public field on the renderer. Giving the
sea pipeline the same group 2 and calling `sunReach` from its fragment is
mostly a copy -- the two shaders would then hold the same march twice, which
argues for lifting the map read and the walk into a WGSL string both include.
The moon is smaller still: one more `vec4f` in the sea's uniform and one dot
product beside the sun's. What neither answers is whether a wave should shadow
the wave in front of it, which the coarse map cannot see and is a separate
question.

**Closed:** 2026-08-22, and the march is shared rather than copied. It lives in
`render/light/SHADOW_WGSL.ts` as one piece of shader source both the ground and
the water include: it declares its own bind group and takes the sun as an
argument, so it depends on nothing an including shader has to hand it. The
`SunShadow` that owns the height map moved to `render/light/` with it, because
a resource two subsystems read does not belong inside one of them.

The sea's pipeline gains group 2 and sets it itself rather than relying on
whatever drew before -- a pipeline with a shorter layout drops every binding
past its own end. The shadow takes the sun's share of the water and leaves the
sky's, so shadowed water reads as darker water rather than as a hole: measured
over a lake under a mountain range at a low sun, 53.5 against 60.0 in the open,
with the deepest part of the shadow more than a third darker.

The moon gets its own highlight on the water, the sun's half-vector with the
moon's direction and a colder, dimmer colour, cut looser at 0.975 against 0.985
because a moon path is a broad smear and a threshold as tight as the sun's on a
light that dim draws a handful of lit pixels. The sea reads the moon out of the
frame the ground already writes, so nothing was added to its own uniform.

Still unanswered, and a different question: whether a wave should shadow the
wave in front of it. The coarse map cannot see one.


---

### F-062 — Nothing casts a shadow, and the coarse map could do it in one march

**Kind:** gap
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-22, after making the sun a directional light
**Where:** `packages/engine/src/render/terrain/TERRAIN_SHADER.ts`

**What happens.** The sun now lights a face by how square it is to the sun, so
a slope facing the morning sun is bright and the slope behind it is dark. What
it still does not do is ask whether anything stands between the face and the
sun. A mountain lays no shadow across the valley beside it, a cliff none on the
ground under it, and a block none on its neighbour. At a low sun this is at its
most visible, because that is exactly when the shadow would be longest and when
the lit faces are at their brightest against the unlit ones.

**Why it matters.** Shape reads from shading, and half the shading is missing.
A range of hills at sunrise is drawn with each face correctly lit and the whole
range flat, because nothing in front occludes anything behind. It is the
largest remaining gap between what the light does and what a person expects it
to do.

**What would fix it.** Two shapes, and the second is much the better fit here.

**A shadow map** renders the terrain again from the sun and compares depths. It
is the general answer and it costs a second geometry pass over every chunk in
view, three or four times over for cascades, plus bias tuning against a world
made entirely of hard edges. Doc 16 already bounds how far it would have to
reach: below about 6 degrees of elevation a 10 m tower's shadow is longer than
the 76 m horizon, so nothing needs to reach past the horizon.

**A march against the coarse map** costs no second pass at all. The map is one
height per coarse cell, it is small, the client already regenerates it rather
than downloading it, and a shadow ray is a walk along the sun direction asking
whether the ground ever stands above the ray. Uploaded as a texture it would
give mountain-across-valley shadows -- the ones that carry the shape of a
landscape -- for one loop in the fragment shader and no change to the mesher or
the chunk pipeline. What it cannot give is a block shadowing the block beside
it, because the map is coarser than a block; that is the shadow map's half of
the job, and it is the half a player notices least at a distance.

Worth measuring before choosing: how many steps the march needs to reach the
horizon at the shipped map resolution, and what that costs a fragment on real
hardware rather than on this container's software adapter.

**Closed:** 2026-08-22, by the march. The coarse map goes to the GPU as one
`r32float` layer per icosahedron face -- each face's triangle of lattice points
in the corner of a square, 2.6 MB at the shipped level -- and a fragment walks
24 growing steps toward the sun asking whether the ground ever stands above the
walk. No second pass over the geometry and nothing rendered from the sun's
point of view. The face is rechecked rather than searched at each step, because
a face edge is 7,100 m and a ray is a kilometre or two. A near miss softens for
free: the clearance over the distance travelled is the angle the ray missed by,
and the smallest one along the walk is the penumbra.

What it turned up is that this world has almost nowhere for a shadow to fall.
Ground shades itself only where its own slope beats the sun's height, and the
shipped ground runs 11.1 degrees at the median -- so a 3,000 m patch is 22.7%
fully shadowed at a 5 degree sun, 4.6% at 20 and 0.0% at 60. Shadows here are a
dawn and dusk feature, which is a property of the terrain rather than of the
march.


---

### F-064 — The patch mesh is rebuilt whole whenever the ground moves, and only its heights changed

**Kind:** performance
**Milestone:** 0.5.0
**Priority:** low
**Effort:** medium
**Found:** 2026-08-22, timing a curve drag on the terrain bench after taking the
noise pass out of it
**Closed:** 2026-08-22, fixed — `patchLayout` and `patchVertices`, held under
two keys in the bench's worker; measured in the browser the mesh in a curve
update went from `200 ms` to `30 ms`
**Where:** `packages/engine/src/mesh/coarsePatchMesh.ts`;
`packages/client/src/BenchWorkerCore.ts`, the `patchKey` cache

**What happens.** A knob that moves the ground rebuilds the patch from nothing:
a scan of every cell on the planet to find the ones in the patch (660,000 dot
products at level 8), then `cellCorners` and six `neighbour` calls per selected
cell, then 190,000 vertices pushed into a plain array. Measured in the browser
on the shipped world, that is about **130 ms of a 410 ms** live update, and in
node against the other stages it is `513 ms` where the whole surface pass is
`1,465 ms`.

**None of it depends on the heights.** Which cells the patch holds, where their
corners sit in the flat frame, which three cells meet at each corner, and every
index and line — all of that answers to where the patch stands and how wide it
is. A curve drag moves the patch not at all. What changes is four floats a
vertex: the height, the field, and the two layers.

**Why it matters.** It is the largest remaining cost of a live drag now that
the octave stacks are cached, and it is paid on every update of every knob that
touches the ground — which on this page is nearly all of them.

**What would fix it.** The same split the surface pass just took: a
`patchLayout(grid, {at, cells, radius})` holding the cell list, the flat
positions, the corner triples, the indices and the lines, and a
`patchVertices(layout, fields)` that fills the buffer. The worker already
carries a `patchKey` saying whether the patch moved, so it would hold the
layout under exactly that key and refill under the ground's. `coarsePatchMesh`
stays as the two of them called together, the way `layeredHeight` now is.

---

### F-060 — Three things the noise lab does that the terrain bench does not

**Kind:** gap
**Milestone:** 0.5.0
**Priority:** low
**Effort:** small
**Found:** 2026-08-22, checking the bench against the lab row by row before the
lab is retired
**Closed:** 2026-08-22, part fixed — the Mountain line note is on the bench;
the other two carry on as F-063
**Where:** `packages/client/src/terrain.ts`;
`packages/client/src/ParameterPanel.ts`, the bench's groups

**What happens.** The bench carries every knob the lab has, both flat pictures,
the contour graph, the curve editors and every line of the readout but three.

**A note under Mountain line** saying what share of the planet stands above it.
The lab counts that while it samples the sphere; the bench would have to count
it over the map's cells, which is a pass it does not otherwise make.

**A note under Sea level** saying how much of the patch draining just handed
back. It is the number that says what the knob bought, and what a person wants
to know about a knob stated in metres.

**The erosion picture in the plane.** Picking *What the water did* redraws the
flat map in red and blue and leaves the patch drawn as ground. The lab does the
same -- its plane shader carries four pictures and the erosion one is not among
them -- so this is parity rather than a regression, and it is still the one
picture that has to be read on a map instead of on the ground.

**Why it matters.** Nobody is hurt while the lab is still there. It matters the
day the lab is deleted, because these are the three things somebody would go
back to it for, and going back would mean tuning against a page whose metres are
fitted differently from the engine's.

**What would fix it.** The two notes are the same shape as the bench's other
readout lines: count the cells above the line while the map is built, and count
the patch's own cells that came out from under the water when the drain moved.
The picture is a fifth branch in `PATCH_SHADER` and a tenth float on the vertex,
which is the cut in metres -- the mesh already rebuilds when the ground moves,
so nothing else has to change.

---

### F-061 — The bench builds its map on the thread that draws

**Kind:** risk
**Milestone:** 0.5.0
**Priority:** low
**Effort:** medium
**Found:** 2026-08-22, timing the terrain bench against the map editor beside it
**Where:** `packages/client/src/BenchWorld.ts`;
`packages/client/src/mapWorker.ts`

**What happens.** The map editor runs its builds on a worker, and the bench does
not: `BenchWorld` calls `layeredHeight`, `metreHeight` and the droplet pass on
the page's own thread, yielding between slices so the panel stays live. Measured
on the shipped world at level 8, the field is `0.7 s` and a full-strength
erosion run is another `7.9 s`. The status line moves and the knobs answer
throughout, because the erosion pass is sliced 40,000 droplets at a time and the
page gets a frame between slices.

**Why it matters.** The field is one call and is not sliced, so a level-8 build
holds the frame for its whole `0.7 s` -- long enough to feel as a stall when a
noise knob settles. Nothing is wrong with what is drawn; what is wrong is that
the page is deaf for that stretch. The erosion pass, which is ten times longer,
does not have the problem at all, because it is the one that is sliced.

**What would fix it.** The same worker the map editor already has. It builds the
same three stages from the same options and hands back each one as it lands, so
what the bench needs from it is the two layer fields it does not currently send.
Slicing `layeredHeight` by cell range instead would keep the page live without a
worker and is the smaller change, at the cost of a second copy of the loop.

**Closed:** 2026-08-22, fixed. `BenchWorkerCore` runs the grid, the noise, the
water, the hexagon mesh and the flat picture on a worker, and hands back what a
picture is made of -- a mesh, a row of heights and a rectangle of pixels -- with
the buffers moved rather than copied. The thread that draws holds no grid and no
field.

Measured by watching the frame clock while a fresh world is built at level 8:
the build takes `1,546 ms` with the water off and `4,195 ms` with it on, and the
page runs frames throughout. The one long gap left, `1,380 ms`, is **not the
build**: uploading the mesh is `8 ms` and drawing the contour graph is `5 ms`,
and the same gap appears with nothing being built at all -- turning the camera
over a 176-cell patch costs a worst frame of `1,257 ms` and a median of `83 ms`,
against `54 ms` and `34 ms` over a 48-cell one. That is the software rasteriser
drawing 163,476 triangles, which is what this container has instead of a
graphics card, and it says nothing about how fast the same frame is elsewhere.


---

### F-057 — The noise lab draws every world 11% taller than the engine builds it

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-21, while giving the lab a coarse grid so it could show
erosion
**Where:** `demos/noise-lab.html`, `SPHERE_SAMPLES` and `generate`;
`packages/engine/src/generation/coarse/metreHeight.ts`

**What happens.** Both the lab and the engine turn a unitless field into metres
the same way: subtract the height that leaves `landFraction` of the surface
above it, then divide by the field's own peak and multiply by `relief`, so the
tallest point stands exactly `relief` metres up. They read that peak off
different numbers of samples. The engine reads it off **every cell of the map**
— 655,362 at level 8. The lab reads it off **6,000 directions** spread over the
sphere by the golden angle.

A peak is the largest of what you looked at, so a smaller sample finds a smaller
one, and dividing by a smaller peak makes every height larger. Measured on the
shipped world by drawing samples from the map's own field: 6,000 samples see a
peak **11.7%** below the true one, 12,000 see 7.0% below, 24,000 4.3%, 96,000
1.5%. So a mountain the lab draws at `1,100 m` is `1,219 m` of ground when the
engine builds the same knobs.

**Sea level is not affected, and that is why nobody has noticed.** It is a
percentile rather than an extreme, and a percentile is what a few thousand
samples are good at: the two readings differ by `2.45e-3` of the field, which is
**0.7 m** of ground. The coastline the lab draws is the coastline the engine
builds. Only the height above it is wrong.

**Why it matters.** The lab is where Relief, the mountain balance and the two
material lines were tuned, and the material lines are **absolute metres** — grass
to 300 m, rock to 400 m, snow over it. A world tuned in the lab to 89% grass
stands 11% higher when the engine builds it, which moves ground across both
lines. The panel also states the shares of each material as a fact about the
planet, and those shares are read off the same 6,000 samples, so the number on
screen is not the number the world comes out at.

**What would fix it.** Raising the sample count is the obvious one and it is
poor: 96,000 samples is sixteen times the noise the sphere pass costs on every
redraw and is still 1.5% out. The better one is now available: the lab builds a
real coarse grid for erosion, so the fit can be read off that grid — the same
cells the engine reads — whenever it exists. That leaves the question of what
the fit is when erosion is off and there is no grid, and the honest answer is to
build the grid anyway at the level Map cell names, which is 2.4 s at level 8 and
would have to move off the redraw path. A third option is to leave the reading
alone and say on the panel that heights are a sample and carry a percentage,
which costs nothing and fixes nothing.

**Closed:** 2026-08-22, fixed. The lab builds the planet's map -- the same grid
at the same level the engine builds, staged and in slices so the panel stays
live -- and reads sea level and the two scales off it with the same arithmetic
`metreHeight` runs. Measured on the shipped world the two now agree to the bit:
sea `-0.3439934551715851` and a land scale of `258.40559000034904` on both
sides. The patch's tallest ground goes from `748 m` to `662 m`, which is the
11% coming off. What it costs is a pass over every cell of the planet on every
change to a shape knob, `2.6 s` at level 8 and `0.1 s` at level 6; the pictures
keep the last map's fit until the new one lands, and the readout says which
cells the metres were fitted over.


---


### F-059 — The lab and the engine no longer take the same set of knobs

**Kind:** gap
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-21, cutting the lab's panel down to the knobs that decide
something visible
**Where:** `demos/noise-lab.html`, `layerSettings` and `KNOBS`;
`packages/engine/src/generation/coarse/TerrainLayer.ts`;
`packages/engine/src/generation/coarse/CoarseMapOptions.ts`;
`packages/client/src/PlanetSettings.ts`

**What happens.** The lab's panel now sets each noise layer with a **feature
size in metres and a scale**, and it holds the rest of the stack fixed: the
falloff is `0.5`, the step between octaves is `2`, and there is no offset. It
also has no **Peak scale**. The engine still carries all five: `TerrainLayer`
has `persistence`, `lacunarity`, `offsetX` and `offsetY`, `CoarseMapOptions` has
`peakScale`, and the client's panel exposes every one of them.

Three of the shipped defaults differ as a result. The engine's mountain layer
runs a falloff of **0.55** where the lab now runs 0.5. The engine's two layers
are offset by `(15, 9)` and `(-22, 61)` where the lab uses `(0, 0)`, which makes
them different fields rather than the same field moved — the same seed draws a
different planet in each. And the lab's layer sizes are `2,400 m` and `960 m`
against the client's `2,267 m` and `945 m`.

**Why it matters.** The lab exists so a setting can be found by dragging and
then built by the engine. A setting found there cannot be carried across now: it
names a world the engine will not draw, and the engine's own defaults name a
world the lab's panel cannot reach. The lab also has no way to show what
`peakScale` does, so the one knob that takes a world above Relief has no picture
anywhere.

**What would fix it.** Take the same four out of the engine and the client. The
falloff and the octave step are what fBm is, and the metre fit renormalises
whatever the stack reaches, so both move how rough the ground is and not how
tall — a question the two layers and their curves already answer where it can be
seen. Offsets slide a field sideways, which is what the seed already does and
with every octave moved rather than the stack as a whole. `peakScale` is the
harder one and it is a real knob, the only thing that takes the tallest point
past Relief; taking it out means Relief is the whole answer to how tall a world
is. Whichever way that goes, the two panels have to agree, and the client's
single metre slider should become the same metres-and-scale pair, because one
slider cannot hold a hundred metres and a hundred kilometres at a resolution
anybody can drag.

**Closed:** 2026-08-22, fixed. The four knobs are out of `TerrainLayer` and
`CoarseMapOptions`, `TerrainLayer` carries `metres` rather than a frequency, and
the client's single metre slider is the same feature-and-scale pair the lab
uses. Both panels build the same world from the same numbers.


---


### F-058 — Sea patches split along a chunk seam wherever a wave lifts them

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-21, from the air over open ocean while measuring the wave field
**Where:** `packages/engine/src/render/sea/SeaRenderer.ts`, `seaPatch.ts`

**What happens.** Looking down at the sea from 140 m, thin dotted lines of sand
colour run across the water in straight segments. They follow chunk edges. Set
**Wave height** to 0 and all but three isolated pinholes vanish, so they are
the waves opening the surface, not the shading.

A patch is cut into `min(16, 2^(depth - chunkLevel) >> lod)` pieces a side, and
two chunks that meet may have chosen different numbers. Where a fine patch puts
a vertex halfway along an edge, the coarse patch beside it draws the straight
line between its own two. The wave lifts the fine patch's middle vertex off
that line, and the gap is a hole straight through to the sea floor. It is the
ordinary T-junction crack, and the sea has none of the defences the ground has:
no apron, no seam ownership, no skirt.

**Why it matters.** The ocean covers a third of the surface and every one of
these is a hole in it, so from any altitude the chunk grid is drawn on the
water in dotted lines. It is worse the taller the waves, so it is a cap on the
one knob a player is most likely to raise. The three pinholes that survive a
flat sea are the same defect at a shared corner, where the two patches disagree
about the corner direction itself.

**What would fix it.** Either of two, and both are small. **Snap the edge**:
have a patch build its rim vertices from the coarsest level any neighbour could
have chosen, so a shared edge is the same polyline on both sides -- which needs
the neighbour levels passed to `seaPatch`, and a mesh per rim combination
rather than per level. Or **hang a skirt**: extend each patch a metre past its
own rim, downward and outward, so the two overlap along the seam. A skirt is
wrong on the ground because a curtain from the cap plane is coplanar with the
neighbour's cap, but the sea has no cap plane and no depth-buffer tie to lose,
so the objection does not carry over. The skirt is an hour; the snap is a day
and gives an exactly closed surface.

**Closed:** 2026-08-21, by a curtain. Each patch hangs a strip from each of its
three rims, straight down, as deep as the swell is tall, carrying the rim
vertex's own wave. Neither of the two fixes above: the snap needs neighbour
levels the renderer does not have, and a plain skirt was the shape of the
answer without the part that makes it work. **What makes it work is the draw
order.** The sea is translucent and writes depth, so a curtain blended before a
neighbour's surface is drawn over it leaves two layers of water on one pixel --
a dark outline of every chunk, worse than the slit. The patch therefore puts
its curtain last in the index list and `SeaRenderer` draws in two passes over
the same instances, every surface and then every curtain, so the depth buffer
already holds the nearest water by the time a curtain is rasterized and the
test throws it away wherever the sea is closed. One extra draw call, 96
triangles a patch against 256, and no dark band in shallow water where the
curtain hangs into the sand.



---


### F-041 — The psrd noise basis is the one field two machines may not agree on

**Kind:** risk
**Milestone:** 1.0.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-19, porting psrdnoise for the noise basis dropdown
**Where:** `packages/engine/src/generation/noise/psrdNoise3.ts`, the four angle
tables built at module load

**What happens.** psrdnoise builds each gradient by rotating a hashed direction,
and a rotation is a sine and a cosine. `Math.sin` is a library routine rather
than an IEEE operation — one C source and one JavaScript runtime measured `1`
ULP apart on `hypot` and `pow` in `verification/language.js`, and nothing says
sine is better behaved. Every other basis indexes a gradient table or a
polynomial permutation and stays inside the arithmetic
[`docs/23-determinism.md`](docs/23-determinism.md) pins.

The exposure is already bounded. There are only `289` distinct hashed indices,
so the whole trigonometric part of the field is four tables of `289` entries
built once at module load, and the spin angle becomes a sine and a cosine once
per map build. Nothing on the sampling path computes one. But two runtimes may
still fill those `1,156` table entries a bit apart, and a last-bit difference in
a gradient moves a coastline somewhere on a planet of 41 million cells.

**Why it matters.** Two clients regenerate the same planet from a seed and
exchange no terrain, so a field they compute differently is two different
worlds. It is not a crash and not visible on one machine, which is what makes it
worth writing down rather than discovering from a player standing in someone
else's ocean.

**What would fix it.** Either fill the four tables from a pinned polynomial for
sine and cosine over `[0, 2pi)` — the tables are built once, so cost is not the
question and only reproducibility is — or refuse the basis for a shared world
and leave it as a single-player choice. The first keeps the basis and needs a
minimax polynomial written and its error measured against the reference; the
second is a line in the panel. Nobody has decided which.

**Closed:** 2026-08-21, by removing the basis. `psrdNoise3` is gone, along with
`perlinNoise3`, `simplexNoise3`, `cellularNoise3`, `basisNoise3`, `BASIS_PITCH`
and the **Noise** dropdown: the generator carries value noise and nothing else,
so there is no sine anywhere in it and no table to fill two ways. What decided
that was not this risk -- it was that the four extra bases differed only in the
spread of one octave, `0.401` value against `0.274` Perlin, and sea level is a
percentile while the metre step divides by the field's own peak, so both
renormalise exactly that difference away. Where a world's regions are is now the
second layer's job. `verification/noise.js` still measures all five, because the
reason to keep one is a comparison.

---

### F-042 — The map's colors and the world's materials are on two different scales

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-19, adding the rock band between grass and snow
**Where:** `packages/engine/src/generation/coarse/COARSE_FIELDS.ts`, the `ground`
ramp; `packages/client/src/PlanetSettings.ts`, `terrainOptions()`

**What happens.** The Ground map paints in **absolute metres** — a fixed ramp
from `-400` to `400` with a stop every 100 m, grey rock at `300` and snow at
`400`. The world picks its materials as **fractions of the relief** — rock at
`0.45` and snow at `0.72`. The two agree only where relief is about `555 m`.
On the shipped world, relief `300`, the map draws its highest ground as grass
going on for dry earth and the world puts bare rock at `135 m` and snow at
`216 m`. A player standing on white ground is looking at a green pixel on the
map beside them.

**Why it matters.** The release this sits in exists to make the world look like
the map: *"the goal is to make the in game planet look like the maps"*. Colour
is the one thing both of them draw, and it is the one thing they disagree
about. The ramp's own comment states the intent that is not met — *"the shipped
300 m of relief reaches bare rock and raising it walks the peaks up into
snow"* — which is what the ramp does and not what the world does.

**What would fix it.** One of the two has to move, and the ramp is the one with
a written reason to stay absolute: a ramp scaled to each world would draw every
world the same and make Relief a knob with no picture. So the world's two lines
become the same absolute metres the ramp's stops use — rock at `300 m`, snow at
`400 m`. That is a two-line change in `terrainOptions()` and it removes a knob's
worth of coupling, but it is a visible change to every existing world: at the
shipped relief of `300 m` nothing would reach snow at all, which is exactly what
the ramp says should happen and is not what anyone has seen yet. Worth one look
in a frame before it is taken.

**Closed:** 2026-08-19, fixed in the same session it was written. `GROUND_LINES`
holds both elevations and both sides read it: the world picks materials by them
and the Ground ramp bands on the same 100 m grid, in the blocks' own colors, so
a color on the map names the block the world builds. The ramp is **banded**
rather than blended, because a color mixed between two stops is a material
nothing builds, and **water is one band** because water is one block. A test
fails if either line moves without the ramp. The visible change was the one
predicted: at the shipped relief of `300 m` the world came out grass to its
summit, so the default Relief moves to `600 m`, where land is 89.2% grass, 8.1%
rock and 2.7% snow.

### F-017 — Erosion depth follows the map's resolution

**Kind:** risk
**Milestone:** 0.5.0
**Priority:** low
**Effort:** medium
**Found:** 2026-08-18, comparing 32 m and 16 m coarse cells for I-5
**Where:** `packages/engine/src/generation/coarse/erode.ts`

**What happens.** `erode` lowers a cell by `rate * sqrt(flow) * drop`, where
`flow` is a count of upstream cells and `drop` is the height difference to the
downhill neighbour. Neither is in metres. At a finer level `flow` is four times
larger for the same ground and `drop` is about half, so the two errors mostly
cancel and the result is nearly resolution-independent — but only nearly.

Measured over five large valleys on the 6,800 m planet, floor-to-rim depth is
11 to 37 m at a 32 m coarse cell and 20 to 43 m at 16 m: about **a quarter
deeper** at the finer resolution, on the same seed.

**Why it matters.** `erosionRate` is a knob somebody will tune by eye, and it
means a different amount of cutting on every planet size and every coarse
spacing. Tuning it on one world and changing the radius silently changes the
terrain. Nothing is wrong today because only one spacing ships.

Re-measured after the relief tier was stated in metres, the gap closed to
**35.4 m against 34.4 m** — the tier now stops at 70 m, which both a 32 m and a
16 m map carry, so neither has fine content the other lacks. The units in
`erode` are still grid units, so the symptom comes back for anyone who moves the
smallest landform below twice a coarse cell.

**What would fix it.** Write the incision against metres: divide `drop` by the
coarse spacing to get a real gradient, and multiply `flow` by the cell area to
get a catchment, then scale the rate so the shipped worlds keep the terrain they
have. That needs `erode` to know the planet's radius, which the coarse map
deliberately does not — so the alternative is to normalise by level inside
`buildCoarseMap`, where the level is already known. Measure the valley depths
before and after; they should stop moving with resolution.

**Closed:** 2026-08-18, fixed. `erode` is gone with the drainage network it
needed. `erodeDroplets` replaced it, and the map is stated in metres on a grid
stated in metres, so every constant in it means something on the ground rather
than in grid units. Valley depth no longer follows the map's resolution because
nothing in the pass is counted in cells. See [`plans/v0.3.0.md`](plans/v0.3.0.md),
I-2.

---

### F-030 — Nobody has decided whether this game has rivers

**Kind:** question
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-18, scoping v0.2.0, where a rivers checkbox was proposed and
turned out to need this answer first
**Where:** `packages/engine/src/generation/coarse/buildCoarseMap.ts` — the
`fillPits`, `routeFlow` and `accumulateFlow` calls and the `water` field;
`packages/engine/src/generation/terrain/TerrainGenerator.ts`, `columnAt`

**What happens.** Rivers always run. `buildCoarseMap` fills the basins, routes
every cell downhill and accumulates what drains through it, on every world,
with no way to ask for a planet without them. There is no switch and no
setting.

That was going to be a checkbox in a release it has since left. Writing the item showed the switch
cannot be built without saying what "on" means, because what "on" produces
today is a chain of pools rather than a river — F-015 has the numbers. And what
"on" should mean depends on a question nobody has answered: whether a river is
something this game wants.

**Why it matters.** Nobody is hurt today. The cost is carried in three places
and none of it is visible. Every world pays for the routing whether or not
anything reads it. Erosion runs four passes that each re-flood and re-route, so
the flow field decides the shape of every valley on the planet even on a world
that would rather not have rivers. And the coarse map holds a `flow` field of
2.5 MB at level 8 whose only consumers are erosion and the water surface.

Removing rivers is therefore not removing a feature — it changes what the
landscape looks like, because the valleys are cut by the same numbers. Anyone
answering this has to decide about the valleys as well as the water in them.

**What would fix it.** Look at a planet with rivers and a planet without, side
by side, and say which one this game wants. v0.2.0's I-1, the map editor, builds the surface that
makes that a knob rather than a rebuild, so this is cheap to answer after that
release and not before.

If the answer is that rivers stay, the shape is already chosen: **a ribbon, not
a chain of pools**. Write water wherever the catchment is above a threshold in
square metres, at a depth that follows from the catchment.
`TerrainColumn.catchment` already carries the number, so it is one comparison
per column. That closes F-015 at the same time.

If the answer is that they go, the flow field and the routing stay anyway,
because erosion reads them to cut the valleys. What goes is the water.

**Closed:** 2026-08-18, decided. This game does not have rivers, for now. The
flow field, the water field, the pit filling and the flow routing are all
removed: at the resolutions the map is drawn at, the channels were one cell wide
and the lakes were flat discs. Water is wherever the map reads under zero, which
makes the ocean the only water. The design stays in doc 21 for whoever revisits
it, and reopening this is a new finding rather than this one.

---

### F-037 — The grown landform states its shore profile in cells, so its shelf is twice as wide in metres on a coarser map

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-18, measuring coarse slope across map levels while fixing the
slope ramp
**Where:** `packages/engine/src/generation/coarse/grownHeight.ts` — `PROFILE`
and `alongProfile`

**What happens.** `grownHeight` turns its land mask into a height by reading the
distance to the coast off a table of named points: `-60` cells offshore at the
deepest shelf, then `-6`, `-1`, `1`, `40` and `200` cells inland at full height.
Those are **cells**, and a cell is a different distance at every map level. Drawn
one level coarser the same profile reaches twice as far in metres, so the
continental shelf, the beach and the rise inland are all double the width they
were.

Measured through the slope field, which is now level-independent: `noise` holds
still at `2.50`, `2.65`, `2.63` across levels 6, 7 and 8, while `grown` moves
`3.52`, `3.62`, `3.80` at the median and `4.85`, `7.62`, `12.62` at the 75th
percentile. The plate landform already solved exactly this, by stating
`upliftReach` at a reference level and doubling it for every level finer.

**Why it matters.** Moving the Coarse cell slider is meant to change how finely
the map is drawn and nothing else — the panel says so, and for the shipped noise
landform it is true. On `grown` it also reshapes every coast on the planet. That
is on top of the `2.2%` of cells the grown mask already disagrees with itself
about across levels (`coastline.js` section 5), which is inherent to growing a
mask on the grid; this part is not inherent and is one line.

**What would fix it.** The same shape `plateHeight` uses: a `PROFILE_LEVEL`
constant, and scale the distance by `2 ** (grid.level - PROFILE_LEVEL)` before
reading the table. Ten minutes, and it needs `coastline.js` re-run because its
section 3 quotes the profile's effect on the grown mask.

**Closed:** 2026-08-18, moot. The profile is still stated in cells, and the
landform it belongs to now shares the octave stack with the other three — but the
release that would have judged the four against each other has not happened, and
`grown` is no longer the only thing between the noise and the ground. Reopen it
if `grown` is chosen.

---

### F-038 — The shipped Landform across default draws a coast made of foam

**Kind:** question
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-18, comparing the four landforms at the panel's own defaults
**Where:** `packages/client/src/PlanetSettings.ts` — `reliefFeature` in the knob
defaults

**What happens.** Landform across defaults to `280 m` on a `6,800 m` radius,
which is a relief feature repeating about **24 times around the planet** at an
amplitude of `0.35` against a continent tier of `1`. The coastline is a contour
of the sum, so at that ratio the relief decides where the water stops over most
of the shore: a continent comes out as a green core inside a wide band of specks,
and every landform does it — `noise` and `plates` drawn at the default are
equally speckled, so this is not a property of any one of them.

**Why it matters.** It is the first thing anybody sees when they open the editor,
and it makes all four ways of deciding where the land is look about the same and
all four look wrong. Judging between them is what the editor was built for.
Nothing is broken: turning Landform across up to a couple of thousand metres
gives coasts with shape, and the panel already says this knob moves `17%` of the
surface.

**What would fix it.** Decide what the default should be by looking, which is a
minute in the editor now that the maps draw honestly, and change one number. The
open question is whether the default should be a fixed metre count at all, since
what matters is its ratio to the planet's circumference and the radius slider
moves that by thirty times across its range.

**Closed:** 2026-08-18, fixed. The knob it named no longer exists. Noise scale
replaces Landform across and ships at `4,500 m` on a `6,800 m` radius — the
widest feature repeating about one and a half times around the planet rather
than twenty-four — and the finer ground is octaves of it rather than a separate
tier. The coast the shipped defaults draw is continents with shores, not
foam.

---

### F-031 — The coverage gate reports a dropped fact every time a timing moves

**Kind:** bug
**Milestone:** unscheduled
**Priority:** low
**Effort:** small
**Found:** 2026-08-18, regenerating `docs/REFERENCE.md` after adding
`verification/coastline.js` for the coastline trial now in
`plans/v0.3.0.md`, I-1
**Where:** `tools/check-coverage.js`; the number comes from
`verification/language.js` section 5, printed into `docs/REFERENCE.md`

**What happens.** `check-coverage.js` reads every number in the corpus and
reports the ones an edit removed. `docs/REFERENCE.md` is generated by running
every verification script, and some of those scripts print a live wall-clock
timing beside their recorded figure. Regenerating the reference on a different
machine, or on the same machine at a different moment, changes those timings, so
the old numbers are gone and the gate reports them as dropped facts.

Seen on a tree whose only edit was in a different document: `num "0.39"`
reported as dropped, from the line "This machine, now: typed arrays 0.39 ms",
which had become 0.68 ms. Nothing was dropped. The script ran again.

**Why it matters.** The gate cries wolf, and a gate that reports something on a
clean tree stops being read. The report is also the one place a genuinely
dropped fact would show up, so a real loss now arrives in a list that the
reader has learned to dismiss.

It is narrow today: `language.js` is the only script printing a live timing into
a line the reference carries, and F-013 records that the rest of `verification/`
has not been swept for the same pattern. Every script that gains one widens
this.

**What would fix it.** Two shapes. The narrow one: have `check-coverage.js`
skip `docs/REFERENCE.md`, since it is generated and the Markdown is the source
of truth — the facts in it are already checked in the documents that quote
them. The wider one: have the scripts mark a live timing so the reference can
emit it in a form the fact reader ignores, which also gives F-013 somewhere to
put the values it is sweeping for. The narrow one is minutes; the wider one
needs a convention agreed across `verification/`.

**Closed:** 2026-08-18, fixed — `tools/check-coverage.js` no longer reads facts
out of `docs/REFERENCE.md`. It is the combined output of running every
verification script, so its numbers move whenever a script runs again, and every
number in it the specification relies on is quoted by a document that is still
on the list.

---

### F-018 — A second planet loses the low bits of every cell address at the shipped depth

**Kind:** bug
**Milestone:** beyond 1.0.0
**Priority:** low
**Effort:** medium
**Found:** 2026-08-18, answering whether a panel setting can build an invalid
cell address
**Where:** `packages/engine/src/addressing/id/encodeCell.ts`, and every caller
that stored or compared a cell ID as a `number`

**What happens.** A cell ID is `[planet 12][face 5][path 2 x depth][corner
2][layer 10]`, packed with plain multiplication into a JavaScript `number`. A
`number` only counts integers exactly up to `2^53`. The word is `29 + 2 x
depth` bits, which passes 53 at **depth 13** — the depth this release ships.
Depth 12 is exactly 53 bits and stays safe; depth 13 is 55 and does not.

With the planet field at 0, which every world built so far has, the top 12
bits are unused and the value never reached `2^53`, so nothing had gone wrong
yet. Setting the planet field to anything from 1 upward did: encoding cell
`(planet 4095, face 7, i 100, j 5, layer 800)` at depth 13 and reading it back
returned the wrong layer, because the low bits were rounded off on the way to
a `number`. Verified directly — `Number.isSafeInteger` was `false` on the
encoded ID.

**Why it mattered.** Nothing set the planet field above 0 in any shipped
world, so nothing playing the game as it stood could hit this. It would have
become real the day a second planet was added, and would have looked like
data corruption on one planet rather than an addressing bug, because planet 0
kept working.

**Closed:** 2026-08-18, fixed. `encodeCell` and `decodeCell` no longer return
or take a `number` — the packed cell is a `CellId`
(`packages/engine/src/addressing/id/CellId.ts`), two unsigned 32-bit halves.
Both functions build and read the word as a `bigint` internally, which is
exact arbitrary-precision integer arithmetic and never rounds at any width,
then split the result into the two halves at the end. `chunkOf` follows the
same shape. The two production callers, `shareCode` and `placeFromShareCode`,
combine or split the halves through a `bigint` as well, which incidentally
fixed a second, milder version of the same bug in `shareCode` — its own base-36
encoding used `Number.prototype.toString(36)` on the packed value, which is
exact only up to 53 bits and was already approaching that limit on deep
worlds even with the planet field left off. Every call site is now exact at
every depth the address word reaches, 63 bits, with no `number` anywhere in
the path. `packages/engine/tests/addressing/id/CellId.test.ts` pins the
planet-4095, depth-13 round trip directly.

---

### F-016 — Four panel knobs still reach nothing

**Kind:** gap
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-18, wiring the ground knobs through for I-5
**Where:** `packages/client/src/PlanetSettings.ts` and `ParameterPanel.ts`

**What happens.** The panel shows *Air reaches*, *Depth overhead*, *High deck*
and *Shells*. All four move, all four appear in the URL, and none of them
changes anything on screen.

The reason is not an oversight. The atmosphere model I-1 chose and the two cloud
decks I-2 chose are not built yet, so there is nothing in the engine for those
four numbers to be passed to. The other knobs are all wired: seed, radius, block
size, chunk, coarse cell, crust, height scale, detail, land, skirt, low deck,
puff, day, and full detail to.

**Why it matters.** A slider that moves and changes nothing is worse than no
slider, because somebody turning it concludes the parameter does not matter. It
is currently possible to spend a minute deciding that the atmosphere height has
no effect.

**What would fix it.** Either build I-1 and I-2, which is the plan and which
makes all four live, or mark the four as not yet connected in the panel until
then. Marking them is under an hour: the `Knob` interface takes a `pending` flag
and the row draws greyed with a note.

**Closed:** 2026-08-18, marked. Every knob now carries a description of what it
does, and the four unconnected ones end theirs with "Not connected yet." Building
I-1 and I-2 is the real fix and is still open in `plans/v0.1.1.md`.

---

### F-010 — The level-of-detail chain stops at the icosahedron faces

**Kind:** idea
**Milestone:** unscheduled
**Priority:** low
**Effort:** medium
**Found:** 2026-08-17, answering a question about whether the deleted lattice
builder could have been a space view
**Where:** `packages/engine/src/generation/chunk/selectChunks.ts`

**What happens.** Chunk selection walks down from the 20 faces, so chunk level 0
is the floor. Measured from a camera at various distances, with the planet
radius `R`:

| Distance | Chunks | Tessellation | Planet on screen | One cell |
|---|---|---|---|---|
| 3R | 28 | level 6, 32 m cells | 38.9° | 5.97 px |
| 10R | 15 | level 5, 64 m cells | 11.5° | 3.58 px |
| 50R | 16 | level 5, 64 m cells | 2.29° | 0.72 px |
| 200R | 16 | level 5, 64 m cells | 0.57° | 0.18 px |

Past 10R nothing changes. Flying to 200R still generates about 9,000 columns of
noise and about 36,000 triangles to draw a dot 0.57° wide.

**Why it matters.** Not much today, because the cost is flat rather than growing
— 36,000 triangles is nothing. What is wasted is roughly 110 ms of terrain
generation every time someone flies out and comes back, for a picture in which
no cell is a whole pixel.

**What would fix it.** A single globe mesh built straight from the coarse map
rather than from the chunk chain. The map is already in memory on the client and
on every worker: level 7, 163,842 cells, with height and water per cell. At
level 4 the whole planet is 2,562 cells and about 10,000 triangles, from array
reads and no noise at all. The coarse map has no fine detail in it, so the two
meshes disagree by a few metres — which is 0.28 px at 10R, so handing over at
10R or further is invisible. No texture and no new stored data are needed.

**Closed:** 2026-08-18, promoted to `plans/v0.1.1.md`, I-3 — the planet
grows to a 6,800 m radius, which makes the chain's floor four times coarser in
angle, so the two are decided together.

---

### F-011 — WebGPU in the development container cannot present

**Kind:** risk
**Milestone:** unscheduled
**Priority:** medium
**Effort:** large
**Found:** 2026-08-17, trying to confirm the black-screen fix by screenshot
**Where:** the container, not the repository

**What happens.** Headless Chromium in this container acquires a WebGPU adapter
and a device, and reports its features correctly, including `timestamp-query`.
Anything that touches the swap chain then fails with `A valid external Instance
reference no longer exists`. A screenshot of the canvas is fully transparent,
and reading the canvas back through `toDataURL` gives one color with zero alpha.
The oldest screenshot in the repository's history shows the same blank canvas,
so this has always been true here.

**Why it matters.** Nothing after Project 3 can be checked by eye in the
container it is written in. That is how the black screen survived four projects.
Every visual claim has to be confirmed on the author's own machine, and any
session that forgets this will spend an hour rediscovering it.

**What would fix it.** Either a container with a working software rasteriser for
WebGPU — Dawn built with its own software backend, driven headlessly rather than
through Chromium — or accepting that visual confirmation happens on real
hardware and saying so wherever it matters. The second is what happens today,
undocumented.

**Closed:** 2026-08-18, promoted to `plans/v0.1.1.md` — not as work but as a
constraint on the release. Every item in 0.1.1 turns on how something looks, so
every trial is a demo run on real hardware rather than a screenshot taken here.

---

### F-014 — Refilling the clouds stalls the frame for 12.7 ms

**Kind:** bug
**Milestone:** 0.1.0
**Priority:** high
**Effort:** medium
**Found:** 2026-08-18, pricing volumetric clouds during step 1 of v0.1.1
**Where:** `packages/engine/src/sky/CloudField.ts`, the `blow` method, called
from the frame loop in `packages/client/src/planet.ts`

**What happens.** The cloud field is thrown away and refilled every 0.7 seconds
as the wind turns, on the thread that draws. Measured at the level the client
uses: **12.7 ms for 10,242 points**, one noise evaluation each. Building the
mesh from the refilled field is on top of that. The frame budget at 60 frames a
second is 16.6 ms.

**Why it matters.** Every 0.7 seconds the client spends three quarters of a
frame's budget on clouds and cannot draw. That is a visible hitch twice a
second, and it is the largest single thing on the main thread now that chunks
are built on workers. It also caps what the clouds can ever become: 40,962
points costs 52.7 ms and 163,842 costs 192.6 ms, so smaller puffs are
unaffordable before anything is added to them.

**What would fix it.** The same move chunks took. The field and its mesh are a
pure function of the wind angle and the seed, so a worker can build both and
send back the two typed arrays. Nothing on the main thread needs the field
itself — it uploads the buffers and draws them.

**Closed:** 2026-08-18, promoted to `plans/v0.1.1.md`, I-2 — moving the field
and its mesh to a worker is a requirement of that item, and it is this finding's
fix.

---

### F-020 — A fine coarse cell on a large radius asks for a map with hundreds of millions of cells

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-17, capping the cloud lattice level after a fine puff and
three shells crashed the renderer with a 307 MB vertex buffer
**Where:** `packages/client/src/PlanetSettings.ts`, the `coarseLevel` getter;
read by `packages/engine/src/generation/coarse/buildCoarseMap.ts`

**What happens.** `coarseLevel` is `Math.min(this.depth, levelFor(...))` —
capped by the subdivision depth and nothing else. Radius (up to 25,000 m) and
Coarse cell (down to 4 m) are both on the panel, and the two together are not
checked against each other the way Puff and Shells now are. Radius 25,000 m, Coarse cell 4 m and Block size 0.5 m together ask for
depth 16 and coarse level 13: `10 * 4^13 + 2` = **671,088,642 cells**, and
the coarse cell this actually rounds to is exactly 4 m. `problems()` already
refuses a coarse cell finer than twice the block size and finer than half
the smallest landform, and neither refusal fires on this combination —
verified directly against `PlanetSettings`, `problems()` returns empty. The
panel would accept Apply and try to build the map.

**Why it matters.** This is the same shape of bug the cloud lattice just had
— a global buffer sized by two knobs multiplied together, with only one of
them bounded — except the coarse map is CPU memory and a build-time cost
rather than a GPU buffer, so it would not throw the same clear "invalid
buffer" error. It would allocate several arrays a few cells short of a
billion entries long and hang or run out of memory, on a combination nobody
has to know is dangerous to reach: nothing on the panel says 25,000 m and 4 m
do not go together.

**What would fix it.** The same pattern `cloudLevelBudget` just used: cap
`coarseLevel` to whatever level keeps `10 * 4^level + 2` under a measured
cell-count budget, calibrated from the largest coarse map this project has
actually built and timed (`buildCoarseMap.test.ts` and the plan's own bench
notes give a starting number). Update the panel's derived readout and the
`Coarse cell` knob's description the same way `Puff`'s was, so a value
silently rounded coarser reads honestly rather than looking granted.

**Closed:** 2026-08-17, fixed in the same turn — `MAX_COARSE_LEVEL = 9` caps
`coarseLevel`, calibrated from the 13.8 s, 2,621,442-cell map I-5 already
measured and kept as a live knob value. The shipped default's level (8) is
unchanged; the exact combination above now caps to level 9 and, at the coarse
cell that rounds to, trips the existing "cannot carry the hills" refusal
instead of building anything. The `Coarse cell` knob's description and the
panel's derived readout were updated the way `Puff`'s were.

---

### F-001 — The residency loop never cancels work it no longer wants

**Kind:** bug
**Milestone:** 0.1.0
**Priority:** high
**Effort:** small
**Found:** 2026-08-17, auditing the worker pool after moving chunk building off
the main thread
**Where:** `packages/client/src/planet.ts`, the `refresh` function

**What happens.** `refresh()` asks the worker pool for every chunk in the new
selection. It never tells the pool about chunks that have dropped out of the
selection since the last call. `WorkerMeshSource.cancel()` exists and is
covered by two tests, and nothing in the client calls it.

**Why it matters.** Flying 200 m along the ground replaces 222 of 333 chunks.
Every one of the chunks left behind is still generated, still meshed, and still
sent back, so the seven workers spend their time on ground the player has
already crossed. The ground ahead waits behind it in the queue. This shows up
as the world filling in late while flying, and it gets worse the faster you go.

**What would fix it.** In `refresh()`, keep the previous selection, and call
`source.cancel(selection)` for every chunk that was wanted and no longer is.
The pool already drops a queued chunk on cancel and lets an in-flight one
finish, so nothing else has to change.

**Closed:** 2026-08-17, promoted to `plans/v0.1.2.md`, I-2 -- the release strips the
world back to its lattice so the level of detail can be looked at, and this is
the finding that most distorts what there is to look at. Fixed with the
`cancel()` the register said was already there and unused.

---

### F-002 — A mesh that arrives for a chunk you already left is still uploaded

**Kind:** bug
**Milestone:** 0.1.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-17, same audit as F-001
**Where:** `packages/client/src/planet.ts`, the `arrived` array and the upload
loop at the top of `draw`

**What happens.** Finished meshes go into an `arrived` array and two a frame are
uploaded to the GPU. Nothing checks, at upload time, whether the chunk is still
in the current selection. A mesh that finished after the player moved away is
uploaded anyway, and only dropped on the next `refresh()`.

**Why it matters.** It wastes a GPU upload and a buffer allocation, and until
the next `refresh()` the renderer holds and draws a chunk nobody wants. Because
`refresh()` only runs on a movement key (see F-003), a player who stops moving
can be left drawing stale chunks indefinitely.

**What would fix it.** Hold the current selection as a set on the outer scope,
and skip any arrival whose key is not in it. Two lines. Fixing F-001 reduces how
often this happens but does not remove it, because a chunk already in flight is
allowed to finish.

**Closed:** 2026-08-17, promoted to `plans/v0.1.2.md`, I-2 -- the selection is now held
on the outer scope and an arrival not in it is dropped rather than uploaded.

---

### F-003 — Residency is only recalculated when a movement key is held

**Kind:** bug
**Milestone:** 0.1.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-17, same audit as F-001
**Where:** `packages/client/src/planet.ts`, the line
`if (ahead !== 0 || aside !== 0 || lift !== 0) refresh();`

**What happens.** `refresh()` runs only when the player is pressing a direction
key. The player also moves without any key held: gravity pulls them down every
frame until they land, and the fall can be long.

**Why it matters.** Altitude decides which level a chunk is drawn at, so a
player falling off a 150 m ridge changes level several times on the way down and
none of it is noticed until they touch a key. The visible effect is the world
around the landing point being at the wrong resolution for a moment, and then
snapping.

**What would fix it.** Call `refresh()` whenever the player's position has moved
more than some small distance since the last call, rather than when a key is
held. The distance test is cheap and it covers falling, swimming, and teleports
in one rule.

**Closed:** 2026-08-17, promoted to `plans/v0.1.2.md`, I-2 -- the selection is now
recalculated on distance moved rather than on a key being held, which covers
falling, swimming and teleports in one rule.

---

### F-009 — The exported `DETAIL` default does not match what the client uses

**Kind:** cleanup
**Milestone:** 0.1.0
**Priority:** low
**Effort:** small
**Found:** 2026-08-17, reading `selectChunks` while measuring the reference
scenes
**Where:** `packages/engine/src/generation/chunk/selectChunks.ts` exports
`DETAIL = 3`; `packages/client/src/planet.ts` defines its own `DETAIL = 2` and
passes it in

**What happens.** Two constants of the same name hold different values. The
engine's is the default when a caller passes nothing. The client always passes
its own, so the engine's value is never used by anything that ships.

**Why it matters.** Anyone reading the engine to find out how detailed the world
is gets 3, and the answer is 2. The client's comment records that 2 was chosen
by measuring chunk counts at 60 m of altitude — that measurement is what the
default should be, and it is recorded in the wrong package.

**What would fix it.** Move the measured value and its reasoning into
`selectChunks.ts` as the default, and delete the client's constant, or delete
the engine's default and require the argument.

**Closed:** 2026-08-17, promoted to `plans/v0.1.2.md`, I-3 -- the measured value and its
reasoning moved into `selectChunks.ts` as the default, which is now 2 and
agrees with what the client ships.

---

### F-026 — The specification still describes a skirt the engine no longer has

**Kind:** gap
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-17, retiring the skirt in v0.1.2's I-6
**Where:** [`docs/14-meshing-and-lod.md`](docs/14-meshing-and-lod.md) and
`CLAUDE.md`'s established results; the code is
`packages/engine/src/mesh/meshChunk.ts`

**What happens.** Doc 14 and `CLAUDE.md` both hold that a LOD seam is covered
by a skirt one coarse cell deep, and `CLAUDE.md` adds "Keep the skirt too, as
cover for the frames after a neighbour changes level." The engine has no
skirt any more. Level joins are covered by the apron -- each chunk drawing the
ring of cells beyond its own rim -- and by cap-step walls between neighbours,
both added in v0.1.2's I-5, and the frames after a level change are covered by
I-6's retire-until-replaced instead.

**Why it matters.** The specification is the thing this project is for, and it
now describes a mechanism that was measured out of the engine for putting a
dark wall in the cap plane at every chunk boundary. Anyone reading doc 14 to
learn how seams are handled gets an answer that is two mechanisms out of date,
and `verification/seam.js` prices skirts against seam ownership without the
apron being in the comparison at all.

**What would fix it.** Doc 14's seam section rewritten around the apron and
the cap step, with the measurements that chose them: 372 coplanar wall
triangles a chunk on a flat world, and 0 failures over 3,899 outward and 1,446
grazing rays with skirts off. `seam.js` should grow the apron as a third
candidate beside the skirt and seam ownership. That is a documentation item
with a script behind it, so it belongs in a release rather than a patch's
margin.

---

**Closed:** 2026-08-17, fixed in the same turn. `seam.js` grew the apron as a
fourth policy and a new measurement of what a skirt costs where nothing is
wrong -- **85%** of rim columns at a 2 m LOD seam put both levels on the same
cap, and **100%** do at a same-level seam, so the wall is coplanar with the
neighbour's own cap. Doc 14's seam section is rewritten around the apron, with
the skirt kept as the candidate that was tried and removed; the `lod-seam`
figure draws an apron rather than a curtain; `CLAUDE.md`'s constant table and
established results follow. Both mechanisms leave the same holes -- all 76
surface-slit layers closed, 99% of cave mouths open -- so seam ownership is
still the only exact answer, and still F-025.

---

### F-004 — The GPU pass timer has never produced a reading

**Kind:** risk
**Milestone:** 0.1.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-17, adding frame instrumentation for Project 16
**Where:** `packages/engine/src/render/gpu/GpuClock.ts`

**What happens.** `GpuClock` asks the adapter for `timestamp-query`, writes a
timestamp at each end of the render pass, resolves them into a buffer and maps
that buffer to read the difference. The client shows the number on the budget
line when at least one reading has come back. In the development container the
adapter reports the feature and no reading has ever arrived, so the `gpu` figure
never appears.

**Why it matters.** The container's WebGPU cannot present at all (see F-011), so
there is no way to tell here whether the timing path works or is quietly broken.
It is the only measurement of the draw half of a frame, which is the half
Project 16's target depends on. If it is broken, the frame budget cannot be
checked at all.

**What would fix it.** Run the client on a machine with a working adapter and
look at the budget line. If no `gpu` figure appears, the likely causes in order
are: the platform quantises both timestamps to the same value so the span is
zero and gets skipped; `mapAsync` rejects because the buffer is still in use;
or the resolve is being encoded on a command buffer that never submits.

**Closed:** 2026-08-18, answered — the reading arrives. Running the client in
this container (`HOW-TO-TAKE-A-FRAME.md`) puts a `gpu` figure of 50 to 80 ms on
the budget line, beside 100 fps at 1280 by 800. The timing path resolves, maps
and reads as written; a configuration that presents nothing shows no `gpu`
figure at all, which is what this entry was seeing. The numbers belong to a
software rasteriser and say nothing about a real adapter's frame cost.

---

### F-034 — The illustrated primer still teaches the skirt

**Kind:** gap
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-18, adding the `detail-with-distance.html` demo and reading
what the other demos already say about level of detail
**Where:** [`demos/how-it-works.html`](demos/how-it-works.html), the "Which is
why the seams need skirts" section and its figure; the summary line in
[`demos/README.md`](demos/README.md)

**What happens.** F-026 followed the engine off the skirt through
[`docs/14-meshing-and-lod.md`](docs/14-meshing-and-lod.md), `CLAUDE.md` and the
`lod-seam` figure. It did not reach `demos/`. The primer still gives a skirt its
own step in the meshing list, its own heading, and its own drawn figure with the
caption "a short vertical curtain hanging down from a chunk's rim... it just has
to hang deeper than the worst possible mismatch". The engine has drawn no skirt
since v0.1.2's I-6, and the measurement that retired it says a curtain hangs
from the cap plane, which puts it coplanar with the neighbouring chunk's own cap
on 85% to 100% of rim columns.

**Why it matters.** `how-it-works.html` is where newcomers are pointed first,
and `CLAUDE.md` names it as the reference for voice. It is the one page in the
repository that a reader meets before any of the documents that correct it, so
it teaches the retired mechanism to exactly the audience least able to notice.

**What would fix it.** The section and its figure become the apron: each chunk
draws the ring of cells one step past its own rim, at its own level, a
centimetre low, so both levels' surfaces cover the strip. The figure is
hand-drawn SVG inside the demo rather than generated, so it is redrawn by hand
there — the `lod-seam` figure in `docs/figures/` already shows the apron and is
the model. The README's summary line needs the same word changed.

**Closed:** 2026-08-18, fixed in the same turn, and renumbered from F-030, which
another session took for the rivers question while this one stood. The primer's
meshing list, its seam section and both of its seam figures are the apron now:
the ring of cells just past a chunk's rim, drawn at that chunk's own level and a
centimetre low. The cave figure carries `seam.js`'s current counts -- **1,074**
holes left by the apron and **0** by seam ownership, where it had said 961 --
and the measured claim, which is that the apron reaches **none** of the cave
mouths rather than the skirt's 14. The README's summary line follows. The same
pass corrected what the page said about how a level is chosen, which was
altitude and is distance.

### F-047 — `RESELECT_DISTANCE` throttles by metres moved, and nothing bounds how often that fires

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-20, reading a trace where the frame rate collapsed while
the player was moving and recovered while standing still
**Where:** `packages/client/src/planet.ts`, `refresh`, `RESELECT_DISTANCE`;
`packages/engine/src/generation/chunk/selectChunks.ts`

**What happens.** `refresh()` re-runs `selectChunks()` every time the player
has moved `RESELECT_DISTANCE` (`max(1, blockSize * 2)`, 2 m at the shipped
block size) since the last selection, with no floor on how often that check
can fire. `selectChunks()`'s own cost is not constant: at the trace's own
settings (Full detail to 5 -- the knob's own maximum -- 1,100 m of relief,
a 1,232 m crust) it returned **3,008 chunks** and cost **~13 ms**, measured
against the real engine with the exact query string, against 201 chunks and
2.6 ms at detail 1. The traced session was flying (`flySpeed` 24 m/s at
ground level, faster with altitude), so 2 m of travel passed every ~80 ms --
faster than one `selectChunks()` call returns. The main thread's own
`RunTask` total went from 20-38% busy to 97-102% busy the moment the trace's
flight reached the ground, sustained for 1.5 s, and a CPU profile of that
window (decoded against a matching sourcemap) attributes 22.5% of it to the
selection-and-drop pipeline by name -- `selectChunks`, `chunkCenter`,
`joinPath`, `ChunkAddress`'s constructor and `fromKey`, `refresh` and
`dropReplaced`/`addressesOverlap` -- against 61.3% in `(program)` and
`postMessage`, consistent with a main thread saturated dispatching and
bookkeeping several thousand chunk requests several times a second rather
than drawing anything.

**Why it matters.** The comment above `RESELECT_DISTANCE` already reasons
about this trade-off -- "a selection costs up to 4.9 ms... too much to spend
every frame" -- but the number it bounds against is the cost `selectChunks`
had when that comment was written, at Full detail up to 3 (633 chunks). Full
detail's own range goes to 5, is a live knob with no rebuild, and nothing
connects its value to `RESELECT_DISTANCE`. A player who raises it, or opens a
rough, tall world at the default, can cross the distance threshold faster
than a single selection call returns, which turns an intentional "reselect
every couple of metres" throttle into an unthrottled "reselect every frame,
however long that takes."

**What would fix it.** Add a time floor alongside the distance one, so
`refresh()` cannot fire more than some bounded rate regardless of how far the
player has travelled since the last one -- the existing retiring-chunk
mechanism already draws stale chunks until their replacements arrive, so a
throttled reselect costs a bounded amount of staleness under fast movement,
not incorrectness. A distance-only threshold has no such bound because it
assumes a roughly constant per-call cost, which this measurement shows is not
true.

**Closed:** 2026-08-20, fixed in the same session it was written. The
movement-triggered call to `refresh()` in the frame loop now also checks
`performance.now() >= nextReselectAt`, a deadline `refresh()` itself pushes
out after every call by `cost * (1 / RESELECT_BUDGET - 1)`, `RESELECT_BUDGET`
being 0.25 -- so a movement-triggered reselect can spend at most a quarter of
the time since the one before it, self-scaling to whatever the selection
actually costs at the settings in play rather than a distance threshold sized
against a cost that goes stale. The teleport, knob-change and unfreeze call
sites stay unconditional, since those are rare and deliberate rather than
continuous.

### F-022 — The chase camera does not drive the chunk selection

**Kind:** bug
**Milestone:** 0.5.0
**Priority:** low
**Effort:** small
**Found:** 2026-08-17, fixing v0.1.2's I-4, where which radius the horizon
belongs to was the whole item
**Where:** `packages/client/src/planet.ts` — `refresh` reads `player.eye`, the
frame loop's `from` is the camera, and the wheel handler changes `chase`

**What happens.** The mouse wheel moves the camera up to 60 m up and behind
the player. The selection keeps reading the player's eye, whose horizon at
eye height is a tenth of the camera's from 60 m, and turning the wheel does
not trigger a reselect at all — `refresh` runs on player movement alone.

**Why it matters.** Zoomed out, the camera sees past the selection's rim: the
mesh edge and the unselected ground beyond it are on screen until the player
happens to walk two metres. The chase view exists for judging the level of
detail from outside, which is v0.1.2's whole purpose, so the one view the
release is for is the one the selection serves worst.

**What would fix it.** Pass the camera's own radius to `selectChunks` — the
frame loop already computes `from` — and call `refresh` when `chase` changes
by more than a couple of metres, the same rule movement already uses.

**Closed:** 2026-08-20, fixed while culling the selection to the view. The
frame loop keeps the camera it drew with -- position, radius and frustum --
and `refresh` reads that rather than `player.eye`, falling back to the player
only for the first selection, which runs before any frame. The reselect test
moved to the camera's own movement as well, so pulling the view back on the
wheel reselects the way walking does, and a turn counts too when the
selection is culled to the view.

### F-046 — Twice the chunk workers exist as `WORKERS` names, and half never build anything

**Kind:** question
**Milestone:** 0.5.0
**Priority:** low
**Effort:** medium
**Found:** 2026-08-20, reading a performance trace of the deployed client
**Where:** `packages/engine/src/mesh/worker/WorkerMeshSource.ts`

**What happens.** A 24.4 s DevTools trace of the shipped build carries 19
distinct `DedicatedWorker thread`s running `chunkWorker-*.js`, `mapWorker-*.js`
and `cloudWorker-*.js`, each with its own genuine Chromium `workerId` (not a
tracing artifact -- confirmed by a `TracingSessionIdForWorker` entry per
thread) and no navigation event anywhere in the trace to explain a second
generation. That is **16 chunk-tagged threads** against the `WORKERS` constant
of 8, and **2** map-tagged against the one `MapPanel` creates. Of the 16, only
8 ever do real work -- the other 8 run from the first millisecond to the last
at under 0.1% CPU, every one of their ~53 recorded tasks empty (`RunTask` with
no nested GC, no `SchedulePostMessage`, no function calls), evenly spaced
roughly every 500 ms for the whole capture. `WorkerMeshSource`'s constructor is
the only place `new Worker(...chunkWorker...)` is called, in a loop of exactly
`count`, and `main()` is called exactly once with no retry.

**Why it matters.** It costs nothing measurable today -- the idle 8 threads
sit at 0.8-3.3 ms of CPU a second in the trace's own busy-time table, against
hundreds to low thousands of ms/s on the real 8 -- so it is not what makes
this trace's stall (see the dropReplaced fix in the same session). But a
genuinely doubled worker pool is 8 extra V8 isolates' worth of resident memory
for the session's whole life, and if the mechanism ever changes to something
that DOES cost CPU, it would be invisible until measured the same way this
was.

**What would fix it.** Not chased down: whether Chromium double-threads a
`{type:"module"}` dedicated worker as a matter of course (a loader thread plus
an execution thread, both long-lived and both carrying a `workerId`), or
whether something really does construct two `WorkerMeshSource`s over this
build's lifetime, wants a trace of a *fresh, controlled* load -- one `Rebuild`
click, one `?panel=1` toggle, nothing else -- checked the same way: count
`TracingSessionIdForWorker` entries against `WORKERS`, and check whether the
same 1-real-to-1-idle pairing shows up for `MapPanel`'s single worker too.

**Closed:** 2026-08-20, found and fixed. It is not a Chromium quirk and it is
not two threads per worker: it is **one whole pool leaked per rebuild**. A
later trace of a longer session carried **55** worker threads, each with its
own `workerId` -- 48 `chunkWorker` against the 8 `WORKERS` asks for, 6
`mapWorker` against the one `MapPanel` makes, and 1 `cloudWorker` -- which is
six complete generations of 8 + 1, all alive from the first millisecond of the
capture to the last and none of them doing any work. Rebuilding the world is a
fresh load of the page through `location.href`, and a page leaving the screen
is not a page whose workers have gone: the browser may keep it whole and
frozen so going back is instant, and every worker held with it keeps its own
thread and its own heap for as long as the tab lives. `planet.ts` now collects
everything holding a thread and gives it up on `pagehide` -- the chunk pool,
the cloud worker and the map panel's own worker, which gained a `dispose` for
it. Driven through five rebuilds in the browser, live worker targets stay flat
at 4 where they had been growing by nine each time.

---

### F-048 — The volumetric cloud deck costs a second to build and the billboards cost forty milliseconds

**Kind:** question
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-20, adding the billboard clouds beside the volumetric ones
**Where:** `packages/engine/src/sky/CloudField.ts`,
`packages/engine/src/sky/buildCloudMesh.ts`,
`packages/engine/src/render/clouds/BillboardClouds.ts`; the **Style** knob in
`packages/client/src/ParameterPanel.ts`

**What happens.** Two cloud systems ship, and one of them is 30 times the
work of the other. The volumetric decks sample noise at 163,842 lattice
points each and mesh hexagonal prisms from the result: 460 ms of noise and
755 ms of meshing for both decks, **1,215 ms a rebuild**, on a wind that
turns every 700 ms. The billboards scatter 22,481 camera-facing hexagons
into one buffer in **45 ms**, once, and then move only a `f32` of elapsed
time per frame. Both draw at the same frame rate.

**Why it matters.** Style is now the one cloud knob that still reloads the
world, because it decides which renderer is constructed at all; every other
cloud knob became live in the same session. So the expensive system is also
the awkward one to compare against, which is backwards -- the comparison is
the only reason both exist.

**What would fix it.** Decide. If the billboards are what ships, the
volumetric field, its mesher, its worker and its four knobs come out
together and `CLOUD_INTERVAL`, `CLOUD_POINT_SHELL_BUDGET` and the whole
skip-a-tick-while-busy dance go with them. If both stay, construct both
renderers at startup and make Style a live knob like the rest, which costs
one idle worker and one buffer and removes the last cloud reload. Either is
under an hour; what is not free is leaving it undecided, because the
volumetric path is a second of CPU that only pays for itself if somebody
prefers how it looks.

**Closed:** 2026-08-20, decided and removed. The billboards ship and the
volumetric system is gone: `CloudField`, `buildCloudMesh`, `CloudWorkerCore`,
`WorkerCloudSource`, `CloudJob`, the client's `cloudWorker`, `CLOUD_SHADER`
and `SkyRenderer.setClouds` with its pipeline, and with them the **Style**
and **Shells** knobs, `CLOUD_POINT_SHELL_BUDGET`, `cloudLevel`,
`cloudLevelCapped`, `cloudDecks` and `CLOUD_INTERVAL`. `cloudPuff` stays, as
metres across one billboard rather than a request rounded to a lattice level,
so it no longer has a level to be capped at. Every cloud knob is live and no
cloud work happens on a worker at all.

---

### F-074 — Two ground shadows covered the same ground, and one of them cost a march per fragment

**Kind:** cleanup
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** medium
**Found:** 2026-08-24, replacing the panel's sun, moon, sky and exposure
knobs after doc 16's cascades shipped alongside the older coarse-map walk
**Where:** `packages/engine/src/render/light/SHADOW_WGSL.ts`,
`packages/engine/src/render/light/SunShadow.ts` (removed),
`packages/client/src/PlanetSettings.ts`, `packages/client/src/planet.ts`

**What happens.** Doc 16 shipped two independent ground shadows: a fragment
march toward the sun over the 32 m coarse map (**Marching shadows**, up to 24
steps a pixel, every frame), and three cascaded depth maps of anything that
draws itself (**Shadow maps**). Both were on by default and both fed the same
**How dark** knob, so a player who left both on paid for the march on every
lit pixel and the three extra geometry passes at once, for one shadow that
was never darker than either alone.

**Why it matters.** The march could only ever shadow *generated terrain* — a
map cell is 32 m, so it could never draw a block shadowing its neighbour, a
placed block, or anything moving — which is exactly what the cascades already
cover, at centimetres rather than 32 m, out to the cascades' own reach. Past
that reach the map bought real range the cascades do not have, but the
panel's own **How dark** knob made "how much of a shadow" and "which
technique found it" the same number, so nobody comparing the two techniques
could isolate what either one contributed. The march also ran unconditionally
whenever `mapShadows` was on, at the fragment stage, on every visible pixel
of ground and sea alike — the more expensive of the two per pixel, for the
coarser of the two results.

**What would fix it.** Remove the march and keep the cascades: they already
draw everything the march could, at higher resolution, and reach anything
that draws itself rather than only what the coarse map generated. The
remaining gap — a shadow beyond the cascades' reach, cast by distant terrain
the map still holds — is unclaimed; nothing in the shipped panel replaces it.

**Closed:** 2026-08-24, removed. `SunShadow.ts`, the coarse-map march inside
`SHADOW_WGSL.ts` and its `@group(2)` bindings, and the **Marching shadows**,
**Marching reach** and **How dark** knobs are gone — `renderer.cascades` now
takes a fixed full-strength shadow whenever **Shadow maps** is on, rather
than a knob shared with a technique that no longer exists.

---

### F-075 — Haze over a few kilometres washes the terrain out, and it cannot be turned down without dimming the sky

**Kind:** question
**Milestone:** 0.5.0
**Priority:** medium
**Effort:** small
**Found:** 2026-08-25, taking eye-level frames to judge the retuned atmosphere
**Where:** `packages/engine/src/render/sky/ATMOSPHERE_SHADER.ts`,
`fragmentMain`'s `dimmed` term

**What happens.** The colour behind the air is multiplied by
`exp(-viewDepth * extinction)`, which is the aerial perspective and is correct
single scattering. On this planet it is very strong: at eye level a ridge two
or three kilometres off is drawn nearly the colour of the sky, with its own
material colour almost gone. A frame at 196 m over the shipped seed shows the
far mountains as pale blue silhouettes rather than as ground.

**Why it matters.** The strength follows from the geometry rather than from a
setting anybody chose. The air is `1,700 m` deep on a planet `6,801 m` in
radius, so a horizontal look of a few kilometres crosses a large fraction of
the whole atmosphere's optical depth -- where the same distance on Earth
crosses a small one. Every knob that would weaken it is a knob that also
weakens the sky, because the sky's colour and the haze are the same
coefficients: turning the extinction down to clear the distance turns the
zenith pale at the same time. So there is currently no setting that gives a
blue sky and readable distant ground together.

Nobody is blocked. It reads as a deliberate hazy look and several people
would prefer it. It is written down because it is the one part of the
atmosphere that cannot be tuned from the panel, and because the fix is small
if it is ever wanted.

**What would fix it.** Give the surface term its own multiplier on the view
depth -- `exp(-viewDepth * extinction * aerialPerspective)` -- so the distance
haze can be dialled back without touching what the sky is worth. One uniform,
one knob, no change to the march. The alternative is to give the haze its own
lower scale height the way real air does, which would concentrate it near the
ground and is more faithful, but needs a second baked table and so is a
larger change than the picture is likely to justify.

**Closed:** 2026-08-25, fixed by giving the surface term its own scale. **Haze
on distance** multiplies both halves of what air does to a surface -- the
extinction that dims it and the airlight added in front of it. Scaling only
the first was tried and is worse than nothing: the ground clears and the glow
stays sitting on top of it, which reads as fog no knob controls. The sky
itself is never scaled, so the stars, the moon and the sun disc stay dimmed
by the air they are really seen through, and the planet's limb from outside
shows no step where the two meet.

