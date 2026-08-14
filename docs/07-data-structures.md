# 07 — Data structures

## Four layers, and only one of them grows

That sentence is the whole document. Everything a running world holds falls into
one of four places, and three of them have a ceiling you choose.

![Four stacked layers: constant tables, pure functions, chunk cache, delta store](figures/four-layers.svg)

*Constant tables and pure functions never change size. The chunk cache is bounded
by view distance. Only the delta store grows, and it grows only with what players
actually changed.*

**Demo:** [`demos/data-structures.html`](../demos/data-structures.html) — three
tabbed diagrams: what lives where, inside a chunk, and the lookup path.

---

## 1. Constant tables — a few KB, never change

- 12 icosahedron vertices, 20 faces
- Face adjacency, 20 × 3 with edge rotations — 180 bytes ([doc 05](05-face-adjacency.md))
- The 12 pentagon cell IDs

Fixed at build time. **This is where all the spherical awkwardness lives, and the
only place it lives.** It does not grow with subdivision depth.

## 2. Pure functions — no storage

- `encode` / `decode`: ID ↔ face, path, q, r, layer
- `idToPosition(id)` → 3D position, by walking the path digits
- `neighbour(id, direction)` → ID

Face crossing and the pentagon cases are handled here, using the tables above,
so the rest of the codebase never learns the world is a sphere.

## 3. RAM — the chunk cache

```
HashMap<chunkId, Chunk>
LRU eviction list
per-chunk mesh + LOD handle
```

Bounded by view distance, so it has a ceiling you choose.

## 4. Disk — the delta store

```
sorted map: cellID → block state
side table:  chests, signs, entities, keyed by the same cellID
```

**The only structure that grows.** It holds what players changed and nothing
else.

---

## Anatomy of a chunk

```
chunkId    the key — face + path bits, nothing else stored
palette    which block types appear in THIS chunk: [air, stone, dirt, grass]
blocks     packed indices into the palette, bit width = ceil(log2(paletteSize))
           index = rank(q, r) × layerCount + layer
```

**Chunks store no IDs.** Cells sit in canonical `q,r,layer` order, so an address
is implied by array position — the same way a Minecraft chunk is a flat array.
Storing a 64-bit ID beside a one-byte block type would be 8× overhead for
something already known from where the byte sits.

**The order is column-major, and that is deliberate.** `layer` varies fastest, so
one cell's whole vertical column is a contiguous run of bytes. The alternative —
layer-major, all of layer 0 then all of layer 1 — makes a column a strided walk
across the entire array, and columns are what everything actually iterates:
the height field is evaluated once per column and reused down it
([doc 08](08-terrain-generation.md)), side faces are run-length merged down a
column ([doc 14](14-meshing-and-lod.md)), and seam ownership compares solidity
down a rim column. It also matches the ID layout, where
[doc 03](03-addressing.md) puts the layer bits at the bottom of the word for the
same reason. Array order and ID order agree, and both favour the column.

**The palette trick matters.** Most chunks contain three or four block types, so
two bits per cell beats sixteen:

| Encoding | 4,096 cells × 64 layers |
|---|---|
| 2-bit palette index | **64 KB** |
| naive 16-bit type field | 512 KB |

Widen the packing only when a chunk earns it.

---

## The lookup path

```
player position
   ↓
cellID                         (see doc 04)
   ↓
chunkID = cellID >> localBits  one shift
   ↓
chunk cache lookup
   ↓                     ↘
HIT                       MISS
use it, zero I/O          generate from seed,
                          then apply deltas for this ID range
                              ↓
                          chunk in RAM → mesh → render
```

**The whole point of the addressing scheme is the third step.** Finding the chunk
is one shift; loading its edits is one range query, because every cell inside it
shares the same prefix. No spatial index, no quadtree walk, no lookup table.

That is the payoff for the bit layout in [doc 03](03-addressing.md), collected
here.

---

## What is actually on disk

For a brand-new planet:

```
seed                            8 bytes
blockSize, subdivisionDepth,
chunkLevel, radius             ~16 bytes
delta log                       empty
```

Under a hundred bytes. A whole planet, before anyone has touched it.

---

## Multiplayer note

"Which players care about this chunk update" is an ID range comparison. Interest
management falls out of the addressing scheme for free.

---

## In one breath

- Four layers: **constant tables, pure functions, chunk cache, delta store**.
  Only the last one grows.
- All the sphere's irregularity lives in a few hundred bytes of constant table.
- A chunk stores **no IDs** — position in the array is the address.
- Finding a chunk is **one shift**; loading its edits is **one range query**.
- A fresh planet is **under a hundred bytes** on disk.
