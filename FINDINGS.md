# Findings

Things noticed while doing other work, that are not in the plan and are not
being fixed right now. Written down so they are not lost and not rediscovered.

[`HOW-TO-WRITE-FINDINGS.md`](HOW-TO-WRITE-FINDINGS.md) says what belongs here
and how to write one. The open list stays in the order things were found.

---

## Open

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

---

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

## Closed

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
