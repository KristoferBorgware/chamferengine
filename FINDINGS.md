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

### F-064 — The patch mesh is rebuilt whole whenever the ground moves, and only its heights changed

**Kind:** performance
**Milestone:** 0.5.0
**Priority:** low
**Effort:** medium
**Found:** 2026-08-22, timing a curve drag on the terrain bench after taking the
noise pass out of it
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

## Closed

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

