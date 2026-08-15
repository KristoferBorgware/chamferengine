# 29 — What runs where

## The problem

[Doc 28](28-language-and-runtime.md) said **Rust** and never said Rust for *what*.

That is not a small omission. "The engine is written in Rust" and "the shared
deterministic core is written in Rust" are different projects with different
costs, and the argument doc 28 actually ran only supports one of them. This
document says which parts exist, which parts must be identical on two machines,
and what "compiles to WebAssembly" buys once you are specific about it.

---

## First, a correction: nothing in this specification asks for a browser

Doc 28 gave five reasons for Rust, and leaned hardest on the fourth:

> **One source compiles to native and to WebAssembly**, which is requirement 8
> and is the sharpest of the four. […] a browser client and a native server only
> agree if they are **the same code**.

**No document requires a browser client.** The word does not appear anywhere in
docs 00–27 except in a note about opening the demos. What
[doc 22](22-multiplayer-interest.md) actually says is:

> a **client** reproduces the map exactly, provided the noise uses an integer
> hash and the erosion exponents come from the exact set. The 2.5 MB never goes
> on the wire.

That is a statement about **determinism**, not about deployment. A native client
regenerating the coarse map satisfies doc 22 completely and needs no WebAssembly
at all. Doc 28 read "client", inferred "browser client", and then promoted the
inference to the deciding argument. Earlier drafts of this document would have
repeated it; it is corrected here instead, and doc 28 now points at this page.

**Whether there is a browser client is a product decision nobody has made.** It
is listed as open at the bottom. Rust survives either way — it just has two
reasons rather than four if the answer is no.

---

## Three layers, and the line between them is drawn by determinism

The engine divides in one natural place, and it is not a matter of taste:
[doc 23](23-determinism.md) demands that some code produce identical bits on
every machine, and the rest is free. That demand *is* the architecture.

![Server and client side by side, both holding the same four core boxes, with the delta store and interest on the server only and meshing and rendering on the client only, and only edits and positions crossing between them](figures/what-runs-where.svg)

*Both sides hold the same core, and it is the same compiled code, not two
implementations kept in step. What crosses the wire is **edits and player
positions and nothing else** — no terrain, and not the 2.5 MB coarse map either,
because the client rebuilds it from the seed. That is the entire return on doc
23, drawn as a picture. Single player is this diagram running in one process.*

### Layer 1 — the core: must be bit-identical

| What | Owned by |
|---|---|
| the ID: encode, decode, truncate to a chunk | [03](03-addressing.md), `id.js` |
| position → cell, and ID → position | [04](04-position-lookup.md), `hexround.js` |
| `neighbour(id, k)` and face crossing | [05](05-face-adjacency.md), `neighbour.js` |
| `rank(q, r)` and chunk ownership | [07](07-data-structures.md), `rank.js` |
| the noise function | [08](08-terrain-generation.md), `noise.js` |
| terrain: the height field and the density term | [08](08-terrain-generation.md), `volume.js` |
| continents, flow routing, erosion — the coarse map | [21](21-rivers-and-erosion.md), `rivers.js` |
| the ray walk | [09](09-ray-traversal.md) |

Every one of these is a **pure function of the seed and a position**. No I/O, no
allocation, no GPU, no clock. That is not a style rule — it is what
[doc 08](08-terrain-generation.md) means by *terrain is generated, not stored*,
and it is why `language.js`'s kernel allocates nothing in any of six languages.

**This is the layer doc 28's determinism argument was about, and it is the whole
of it.** Everything below is free to differ between machines.

### Layer 2 — world state: server-authoritative, and the only thing that grows

| What | Owned by |
|---|---|
| the delta store: cell ID → block state | [07](07-data-structures.md), [27](27-block-state.md) |
| the side table: cell ID → a tagged blob | [27](27-block-state.md) |
| the block registry, in the save | [27](27-block-state.md) |
| entities, per chunk by containment | [27](27-block-state.md) |
| interest: who to tell about an edit | [22](22-multiplayer-interest.md), `interest.js` |

This is the mutable half of the world, and it is small: doc 07 calls the delta
store "the only structure that grows", and ten million player edits are
[76 MB](07-data-structures.md) before compression.

The split between layers 1 and 2 is the one that makes the whole design work.
**The server knows what the world would be by running layer 1, and what it
actually is by applying layer 2 on top.** It never stores the terrain, so there is
no terrain to send.

### Layer 3 — presentation: client only, and deliberately not deterministic

| What | Owned by |
|---|---|
| meshing, merging, LOD selection, seam ownership | [14](14-meshing-and-lod.md), `mesh.js`, `seam.js` |
| lighting | [16](16-lighting.md), `light.js` |
| the three local frames, camera, input | [13](13-gravity-and-orientation.md), `frame.js` |
| the anchor-and-offset rebase | [15](15-precision-and-origin.md), `precision.js` |
| drawing water back to front | [25](25-water.md), `water.js` |
| lat/long readout, the horizon, bearings | [20](20-player-coordinates.md), `coords.js` |

Doc 23 is explicit that this layer is off the hook:

> GPU determinism is a separate question and mostly a non-question. Vertex
> positions are `float32` and chunk-local, and nothing computed on the GPU feeds
> back into world state — so it may differ freely.

The same freedom covers the whole layer. Two clients may mesh differently, light
differently and round differently, and nothing breaks, because none of it is ever
compared. **This is also where every transcendental in the design lives** — the
lat/long readout, the horizon, the compass — which is exactly why doc 23's rule
*"never call a transcendental where the result is stored or shared"* costs
nothing: the calls are all in the layer that shares nothing.

---

## So: how much of the engine is Rust?

**All of it, and doc 28's reasoning covers about a fifth of it.** Those are both
worth saying.

- The **determinism** argument (§1–3 of doc 28) constrains **layer 1 only**.
- The **layout and allocation** argument (§5) is about **layer 3**, the mesher.
- **Layer 2** is ordinary data structures with no exotic requirement at all.

Writing the whole engine in one language is a practical choice, not a derived
one. The alternative — a Rust core with a client in something else — is a real
option, and it costs a foreign-function boundary on the hottest path in the
design plus two build systems. It buys nothing this specification asks for.

What the layering *does* give you is the honest scope of the risk: **if the
language choice turns out to be wrong, layer 1 is the part that is expensive to
move**, because it is the part that must not change behaviour by a single bit.
Layers 2 and 3 are ordinary code and can be rewritten in anything, any time.

---

## Rust → WebAssembly, concretely

If there *is* a browser client, this is what the phrase means.

### What compiles to both targets unchanged

**Layer 1 does, and it is measured, not assumed.**

> **[verified]** `verification/language.js`, section 1. The same Rust source
> compiled to `wasm32-unknown-unknown` and run inside node produces
> **the identical 64-bit digest** as native Rust, native C, Java, Go, Python and
> JavaScript. **7 of 7.**

That is the row doc 22 actually needs: a browser regenerating the coarse map gets
the same map, to the bit, as the server that never sent it. And it is not slow —
on the generator kernel the wasm build runs at about **1.2× native Rust**, which
is still faster than the same algorithm written in JavaScript.

**Layer 3 mostly does too.** The mesher is buffer building and is pure
computation. Rendering goes through `wgpu`, which targets WebGPU in the browser
and Vulkan, Metal or DX12 natively from one source.

### What does not: the platform edge

This is the part "one source, two targets" quietly hides, and it is the honest
cost of the decision:

| | Native | Browser |
|---|---|---|
| networking | TCP / UDP sockets | WebSocket or WebTransport |
| storage | the filesystem | IndexedDB or OPFS |
| threads | OS threads | wasm threads — needs `SharedArrayBuffer`, which needs specific HTTP headers |
| windowing and input | `winit` | `winit` on canvas |
| binary size | irrelevant | a download, and `wgpu` is not small |

So the shape is a **core crate that knows nothing about the platform**, and a thin
trait with two implementations for everything at the edge. That is a normal
amount of work, and it is not free, and doc 28 implied it was.

### Single player is the same picture in one process

Because the client already contains the core, a single-player game is a server
instance in the same process with the network replaced by a function call. This
falls out; nobody has to design it. It is also the reason to keep the layer-1/2
boundary sharp even before multiplayer exists.

---

## Still open

- **Whether there is a browser client at all.** This is a product decision and
  nobody has made it. Doc 28's fourth reason for Rust evaporates if the answer is
  no — the decision still holds on the other reasons, with a thinner margin.
- **The protocol.** Doc 22 decides *who* to tell about an edit and says nothing
  about the format, the transport, or the tick rate.
- **Authority and conflict.** Doc 22 lists this as open and it still is: two
  players editing one cell, and what the client is allowed to predict.
- **Where the coarse map is computed for a joining client.** It is 2.5 MB and
  computed once at world creation ([doc 21](21-rivers-and-erosion.md)); a client
  regenerating it pays that cost on join, and nobody has measured how long it
  takes. If it is slow, "regenerate rather than download" is still right but needs
  a loading screen.
- **Whether layer 1 should be `no_std`.** It has no reason to allocate, and a
  `no_std` core compiles to a 1.6 KB wasm module against 1.35 MB with the standard
  library linked in. That is a build-shape question, not a design one, but it is
  the kind that gets much harder to change later.

---

## In one breath

- **Doc 28 said Rust and did not say Rust for what.** This page says: all of it,
  while noting that doc 28's argument only ever constrained the core.
- **Nothing in docs 00–27 requires a browser.** Doc 22 says a *client*
  regenerates the coarse map, which is a claim about determinism, not deployment.
  Doc 28 read that as a browser and made it the deciding reason; that is
  corrected.
- **Three layers, and determinism draws the lines.** The **core** must be
  bit-identical and is pure functions of seed and position. **World state** is
  server-authoritative and the only thing that grows. **Presentation** is
  client-only and deliberately free to differ — which is where every
  transcendental in the design lives, and why doc 23's rule costs nothing.
- **The wire carries edits and positions.** No terrain, and not the 2.5 MB coarse
  map, because both sides run the same core on the same seed.
- **Rust → wasm is real and measured**: the same source gives the **identical
  digest**, at about **1.2×** native. What does not port is the platform edge —
  sockets, storage, threads — and that needs a trait with two implementations.
- **Single player is this diagram in one process**, with the network replaced by
  a function call.
