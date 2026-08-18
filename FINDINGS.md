# Findings

Things noticed while doing other work, that are not in the plan and are not
being fixed right now. Written down so they are not lost and not rediscovered.

[`HOW-TO-WRITE-FINDINGS.md`](HOW-TO-WRITE-FINDINGS.md) says what belongs here
and how to write one. The open list stays in the order things were found.

---

## Open

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

---

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

That was going to be a checkbox in v0.2.0. Writing the item showed the switch
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
by side, and say which one this game wants. v0.2.0's I-5 builds the editor that
makes that a knob rather than a rebuild, so this is cheap to answer after that
release and not before.

If the answer is that rivers stay, the shape is already chosen: **a ribbon, not
a chain of pools**. Write water wherever the catchment is above a threshold in
square metres, at a depth that follows from the catchment.
`TerrainColumn.catchment` already carries the number, so it is one comparison
per column. That closes F-015 at the same time.

If the answer is that they go, the flow field and the routing stay anyway,
because erosion reads them to cut the valleys. What goes is the water.

---


## Closed

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
