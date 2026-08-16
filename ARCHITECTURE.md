# Architecture, technology and scope

The stack, the runtime layout, and the definition of each release milestone, in
one place.

The `docs/` specification decides the mathematics and argues every choice from
measurements. This page states the conclusions as they apply to a build: what is
used, where each part runs, and what is in which version. It links to the
document that owns each decision, and it does not repeat the reasoning.

**No engine source exists yet.** This describes the target, not a codebase.

---

## Technology

| Layer | Choice | Owned by |
|---|---|---|
| Language | **TypeScript**, one source tree, no second language | [doc 28](docs/28-language-and-runtime.md) |
| Build and dev server | **Vite** — dev with HMR, `vite build` to static assets | this page |
| Primary client | **the browser** | [doc 28](docs/28-language-and-runtime.md), [doc 29](docs/29-what-runs-where.md) |
| Graphics | **WebGPU**, and only WebGPU | [doc 31](docs/31-deployment.md) |
| Server runtime | **Node** | [doc 31](docs/31-deployment.md) |
| Tooling runtime | **Node**, zero dependencies | this repository |

Four consequences of that list are worth stating explicitly.

- **WebGPU is the whole graphics layer.** It is itself the abstraction over
  Vulkan, Metal and D3D12. A desktop client is the same TypeScript inside Tauri
  or Electron, running the same shaders against the same API.
- **One source tree covers all four parts.** The server, the client, the
  generator and the tooling are the same language. The measured cost against C
  is `1.75×` on the generator and `1.5×` on the mesher.
- **Node is on both sides.** It runs the verification scripts and the doc build
  today, it hosts the local server in V0.5, and it is the Lambda runtime in V1.
- **Vite applies to the engine only.** `demos/`, `verification/` and `tools/` are
  zero-dependency plain HTML and plain Node, and stay that way — a demo opens by
  double-clicking the file, a script runs under bare `node`.

### Build rules the language choice imposes

These are correctness constraints, not style. The first three come from
[doc 28](docs/28-language-and-runtime.md), the last two from
[doc 23](docs/23-determinism.md) and [doc 08](docs/08-terrain-generation.md).

| Rule | Why |
|---|---|
| `normalize` is `sqrt(x*x + y*y + z*z)` — never `Math.hypot` | `hypot` is a library routine and differs by 1 ULP between runtimes |
| Typed arrays for anything per-cell or per-vertex — never an array of objects | measured at `15×`, larger than any language gap in the study |
| Wrapping `uint32` is `Math.imul(a, b) >>> 0` — the `>>> 0` is not optional | the noise hash is three wrapping multiplies and two xor-shifts |
| No transcendental where the result is stored or shared | `sin`, `cos`, `pow` are not pinned by IEEE 754; `+ − × ÷ sqrt` are |
| Fixed reduction order in fBm, low octave first | 4 and 5 octaves move by `1.4e-17` if the order changes |

If a hot path is ever moved to C or Rust compiled to WebAssembly, two more apply,
and only the second of them shows up in a wasm-only test:

```
-ffp-contract=off            on the NATIVE build only
never -Ofast / -ffast-math   on BOTH
```

Baseline WebAssembly has no FMA instruction, so a wasm build cannot contract and
is correct whatever the flags say. A native build of the same source on `aarch64`
contracts by default. [Doc 28](docs/28-language-and-runtime.md) carries the
per-toolchain table and the per-target codegen measurement.

---

## Architecture

Four parts. The split is by **who may differ from whom**, not by module
convenience.

| Part | Runs on | Constraint |
|---|---|---|
| **Addressing** | client **and** server | integer work plus one blend and one `normalize`; no noise |
| **Generation** | client only | must be **bit-identical** across clients |
| **Presentation** | client only | deliberately free; every transcendental lives here |
| **World state** | server only | the only thing that grows |

[Doc 29](docs/29-what-runs-where.md) owns this split and carries the diagram.

### Addressing — both sides, unavoidably

Cell ID encode, decode and truncate-to-chunk; position → cell and ID → position;
`neighbour(id, k)` and face crossing; `rank(q, r)` and chunk ownership.

The server cannot avoid it: the delta store is keyed by cell ID and interest is a
dot product against a chunk's direction. It is also very little code — integer
shuffling, one barycentric blend, one `normalize`, and no terrain.

Owned by docs [03](docs/03-addressing.md), [04](docs/04-position-lookup.md),
[05](docs/05-face-adjacency.md), [07](docs/07-data-structures.md).

### Generation — client only, and the only part pinned to the bit

The noise function, the height field and the density term, the coarse map
(continents, flow routing, erosion), and the ray walk. Pure functions of the seed
and a position: no I/O, no allocation, no GPU, no clock.

**The server never generates terrain.** Terrain is generated rather than stored,
so a server that generated it would be computing something only a screen can use.
This makes determinism a **client-to-client** requirement: the two machines that
must agree are two players, and they exchange no bytes about terrain. The
requirement therefore survives any server shape.

Owned by docs [08](docs/08-terrain-generation.md),
[21](docs/21-rivers-and-erosion.md), [09](docs/09-ray-traversal.md),
[23](docs/23-determinism.md).

### Presentation — client only, and free

Meshing, merging, LOD selection and seam ownership; lighting; the three local
frames, camera and input; the anchor-and-offset rebase; drawing water back to
front; the latitude, longitude and altitude readout; the sky, the clouds and the
moon.

Nothing here is ever compared between machines, which is why
[doc 23](docs/23-determinism.md)'s ban on transcendentals costs nothing — every
call it forbids is in this layer, where nothing is shared.

Owned by docs [14](docs/14-meshing-and-lod.md), [16](docs/16-lighting.md),
[13](docs/13-gravity-and-orientation.md),
[15](docs/15-precision-and-origin.md), [25](docs/25-water.md),
[20](docs/20-player-coordinates.md), [32](docs/32-sky-clouds-and-moon.md).

### World state — server only

The delta store (cell ID → block state), the side table (cell ID → a tagged,
length-prefixed blob), the block registry, entities held per chunk by
containment, and interest — who to tell about an edit.

Ten million player edits are `76 MB` before compression. Everything else in the
world is a function of the seed.

Owned by docs [07](docs/07-data-structures.md), [27](docs/27-block-state.md),
[22](docs/22-multiplayer-interest.md).

### The transport interface

Two functions, written on the first day and never bypassed:

```
onMessage(playerId, message)      how a message arrives
send(playerId, message)           how one leaves
```

Everything above them is the game. Below them is either a `ws` socket (V0.5) or a
Lambda handler and `postToConnection` (V1). **Changing the transport must not
touch game code.** This is the whole of what makes V0.5 → V1 a deployment change
rather than a rewrite.

### The wire

A closed message set, never RPC. Two rules on its shape, both cheap now and
unrepairable later:

- **An edit names a cell and a resulting block state.** That is what a
  storage-only server needs to write, and exactly what a validating server would
  need to check. Adding authority later is inserting a check before the store.
- **A rejection message exists from the first version, unused.** A client that
  assumes every edit succeeds has no code path for refusal, and adding one later
  touches every place the client predicts a change.

Owned by [doc 30](docs/30-authority-and-cheating.md).

### Single player

The delta store and interest in the same process, with the network replaced by a
function call. It falls out of the four-part split and needs no separate design.

---

## Scope

Three milestones. **The server's behaviour is the same in V0.5 and V1** — it
stores, it routes, and it validates nothing. What changes between them is where
it runs and what it writes to.

### V0.5 — local only

| | |
|---|---|
| Client | browser, WebGPU, served by Vite |
| Server | a Node process on the same machine, or in-process |
| Transport | a local socket, or a function call |
| Storage | the filesystem |
| Authority | none |
| Players | one, or several on one machine or one network |

This is enough to play, and it defers every hosting question. Terrain, meshing,
lighting, water, rivers and the sky are all client-side and therefore all present
in V0.5 — the milestone is small on the server side and not on the game side.

### V1 — hosted, and still not authoritative

| | |
|---|---|
| Client | the same static bundle, served from **S3** behind CloudFront |
| Connection | **API Gateway WebSocket** |
| Compute | **Lambda**, Node runtime |
| Hot storage | **DynamoDB** — key is the chunk ID, value is that chunk's deltas |
| Cold storage | **S3** — chunks nobody has visited, and anything over DynamoDB's item limit |
| Authority | **none. There is no authoritative tick loop.** |
| Inventory | client-side, never synced |

**The server is stateless between messages, and that is why this shape fits.**
Receive a message, write it, fan it out to the connections the interest test
selects, exit. Everything an invocation needs is in the message and the store, so
each one can start cold — which is the demand serverless meets and the reason
simulation is the thing it cannot hold.

**The delta store is one key and one blob.** Chunk ID in, that chunk's deltas
out: one `get`, one `put`, and the access pattern is exact-key or key-range. That
is what makes DynamoDB and S3 the same store at two latencies, and it is the
whole of what the storage layer has to provide.

**The number to instrument from the first day is messages per second**, not
storage. Interest management is fan-out, and API Gateway bills per message:

```
messages/second  ≈  players × edits per player per second × interested recipients
```

Storage is `76 MB` and requests are pennies. Fan-out is what grows, and it is not
the number anyone watches by default.

**The migration out of serverless is already scoped.** The easy direction is
serverless → box: Lambda forces connection and player state into an external
store, which a long-lived process can read on day one and move into memory
whenever it likes. The trigger is the arrival of an authoritative tick loop,
which is the workload Lambda cannot hold.

### Beyond V1

Each of these is designed and priced. None needs more thinking before it can be
started; each is a decision to wait.

| | Priced at | In |
|---|---|---|
| Edit validation — a point query per edit on virgin ground | `0.06%` of a core at 1,000 players | [30](docs/30-authority-and-cheating.md) |
| Server-side simulation: mobs, a tick loop, resident chunks | `158×` what edit validation costs | [30](docs/30-authority-and-cheating.md) |
| Entity interest | load-bearing only once mobs are server-side | [22](docs/22-multiplayer-interest.md) |
| Moving from Lambda to a long-lived process | same event as the tick loop | [31](docs/31-deployment.md) |
| A native desktop client — the same TypeScript in Tauri or Electron | same bundle, same shaders | [31](docs/31-deployment.md) |
| Moving a hot path to C or Rust for wasm | `1.5–1.75×` available, and a build trap if also compiled natively | [28](docs/28-language-and-runtime.md) |
| Space travel | the 12-bit planet field is the only part that exists | [03](docs/03-addressing.md) |

### What every version keeps

Three properties hold from V0.5 onward and are expensive or impossible to add
later:

1. **Inventory never travels client → server.** A storage-only server cannot
   issue drops, so the client decides them. Syncing an unauthoritative inventory
   for persistence leaves no way to make it authoritative later without
   re-deriving every player's items from nothing. If it must persist, persist it
   as an opaque blob marked *not authoritative*.
2. **The edit message and the rejection message keep their shape**, per the wire
   rules above.
3. **Generation stays bit-identical.** Every rule in the build-rules table is a
   V0.5 rule. A single-player build is where forgetting one costs nothing until
   the day it costs everything.

---

## Not settled

Nothing here blocks V0.5. All of it is V1 or later, and none of it is measured.

- **Latency and prediction.** API Gateway plus Lambda plus a DynamoDB round trip
  is not fast, which makes client-side prediction and rollback load-bearing
  rather than optional.
- **How chunks batch into DynamoDB items.** One item per chunk is the obvious
  answer and it has not been checked against the `400 KB` item limit or against
  how deltas actually clump.
- **Authentication.** Not designed anywhere in this specification, and the first
  thing a hosted deployment needs.
- **What moves a chunk between DynamoDB and S3**, and which one owns it.
- **Two players editing one cell.** Conflict resolution is undesigned.
- **How long a joining client takes to regenerate the `2.5 MB` coarse map.**
  Regenerating rather than downloading is still right; if it is slow it needs a
  loading screen.
- **WebGPU availability on Linux.** It shipped in Chrome and Edge first, then
  Safari, then Firefox. This is the one claim on this page with a shelf life.

---

## Relation to the specification

Docs [11](docs/11-open-topics.md), [26](docs/26-implementation-readiness.md),
[30](docs/30-authority-and-cheating.md) and [31](docs/31-deployment.md) call the
local milestone **V1** and everything after it **V2**. This page splits that
first milestone in two — **V0.5** is local, **V1** is hosted — because the
transport and the storage change while the server's behaviour does not. Where
those documents say *"V1"*, read **V0.5**; where they say *"V2"*, read
**beyond V1**. No decision in them changes.
