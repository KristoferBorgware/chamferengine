# Code style

Structure, naming, formatting and comment conventions for the engine. Applies
to all TypeScript source, not to comments alone.

[`ARCHITECTURE.md`](ARCHITECTURE.md) decides what is built; this page decides
how it is written. [`HOW-TO-WRITE-DOCS.md`](HOW-TO-WRITE-DOCS.md) governs the
prose, including this page.

This is a professional open source project. Someone who has never seen the
codebase should be able to find a thing by its name and read it without loading
the rest of the engine into their head.

---

## Structure

### KISS

Keep it simple, stupid. The straightforward version is the one to write. A
technique earns its place by a measured number.

### Two packages

`packages/engine` is the engine, published as `chamfer`. `packages/client` is
the browser application, and is not published.

Subsystems are reached by subpath export:

```
chamfer              the whole engine
chamfer/math         vectors and matrices
chamfer/addressing   cell IDs, the lattice, neighbours, the lookup
chamfer/generation   noise, terrain, the coarse map
chamfer/mesh         surface extraction, and the geometry it produces
chamfer/edit         block state, the delta store, the block registry
chamfer/render       WebGPU device, pipelines, passes
```

A server imports `chamfer/addressing` and pulls in nothing that mentions a GPU.
Each entry point is a barrel over its subsystem, and it is the only thing
outside that subsystem may import.

### Folders, one subsystem per folder

`src/` holds one folder per subsystem, and a subsystem groups again when it
grows past what a directory listing shows at a glance:

```
src/addressing/solid/        the icosahedron: vertices, faces, edges, the axis
src/addressing/lattice/      points on a face, chunk-local coordinates, rank
src/addressing/neighbours/   the direction ring, face crossing, pentagons
src/addressing/id/           the packed word and its fields
src/addressing/lookup/       position to cell
```

Add a folder whenever it makes the tree clearer. Depth is a smaller obstacle
than a folder holding forty files with no grouping.

### One exported function per file, named exactly for its export

A file is named for its export, spelled the way the export is spelled.
`hexRound.ts` exports `hexRound`, `Vec3.ts` exports `Vec3`, `DIRECTIONS.ts`
exports `DIRECTIONS`. Casing follows the export: PascalCase for a class or a
type, camelCase for a function, SCREAMING_SNAKE for a constant. Folder names
are lowercase.

Types and constants that describe one thing may share a file. Functions get one
file each. A function's own result type sits beside it; a type two subsystems
both name gets its own file.

### Declare a shared type or constant away from its use

Shared types and constants live in their own file and are imported. A file that
both defines and consumes one hides it from the next file that needs it.

### Classes where there is a value with operations on it

A class when a value has a set of operations over it, or when there is state to
hold: `Vec3`, `Mat4`, `LatticeRenderer`. The operations are methods on it —
`v.normalize()`, not `normalize(v)` from a second file.

A class is for per-entity and per-frame work. **Per-cell and per-vertex data is
typed arrays and bare numbers.** One object per vertex measures 15x slower on a
mesh buffer build.

Plain functions where there is no value to hang them on. `hexRound`, `faceOf`
and `neighbour` take numbers and return numbers.

### Separate systems with interfaces

A system takes what it needs through an interface it defines, and nothing else
crosses the boundary. The interface lives with the system that produces the
data, and the consumer imports it.

`mesh/Geometry.ts` is the worked example: two typed arrays and two counts, and
that is the whole contract between a mesher and a renderer. The mesher fills
them and holds no `GPUDevice`, no `GPUBuffer` and no renderer object, so it runs
under plain Node with no GPU. `render/` imports the type.

### Tests mirror the source and sit outside it

Tests live in `packages/engine/tests/`, in a tree that mirrors `src/` path for
path. `src/addressing/lattice/rank.ts` is tested by
`tests/addressing/lattice/rank.test.ts`. `src/` is exactly what ships.

**Tests import through the package's entry points**, not through relative paths
into `src/`. A test reads `import { rank } from "chamfer/addressing"`, which
exercises the surface a consumer gets and leaves every test untouched when a
file moves inside a subsystem.

---

## Spelling

**American English in code**, in identifiers and comments alike. `color`, never
`colour`. `normalize`, never `normalise`.

---

## Formatting

A Prettier config, checked in at the root once the source tree exists. Two
settings are fixed:

```json
{
  "tabWidth": 4,
  "useTabs": true
}
```

Indentation is **4**, not Prettier's default of 2. Every other option is
Prettier's default until a reason to change one is written down here.

---

## Comments

Comments in this codebase are dense and explanatory by design. Match that. The
rules below are about what a comment says, not how much.

### The comment stands alone

A comment explains the code it sits beside. It does not point elsewhere to make
its case — not to `docs/`, not to a document number, not to an issue or a design
discussion. A reader with only this file open gets the full explanation.

```ts
// NO  - Doc 08's pinned kernel: a uint32 hash, quintic-faded trilinear value noise.
// YES - A uint32 hash, quintic-faded trilinear value noise.
```

The fact belongs in the comment. The pointer to where it was decided does not.

### Document the present, not the past

A comment describes the code as it is. It is not a changelog, a migration
note, or a record of what something used to be. A reader arriving today has no
memory of a previous version and does not need one. Comments are not a
conversation, and therefore shall not be written as if they were.

Do not write: `used to`, `no longer`, `any more`, `previously`, `now means`,
`all along`, `finally`, `has been changed to`, `this replaces`.

```ts
// NO  - The engine no longer bundles a fallback font, so `fonts` is now required for text.
// YES - The engine ships no typeface. `Text` draws once `fonts` supplies a set.
```

History belongs in git — those commits describe what changed.

### State the behaviour, not the disaster averted

Say what the code does. Do not build a case for it out of what would happen
otherwise. Skip the counterfactual chain and the argument; the reader wants
the fact.

```ts
// NO  - Without this the layer size would be -Infinity, and every uv would scale wrong, so we
//       return 1x1 instead.
// YES - An empty set is 1x1, the size the placeholder texture is allocated at.
```

A short "so that" clause is fine when it names a real constraint (`Held here
rather than passed through the scene contract, because build() is
synchronous`). An escalating if-then-therefore is not.

### Code is not a monetary system

No economic metaphors. Not `pay`, `pays for itself`, `buy`, `worth it`,
`budget`, `price`, `dividend`, `tax`, `free`. Excluded are words like `cost`,
`expensive`, and `cheap`, but only when they address performance, memory, or
other things related to programming.

Name the actual resource — bytes, a fetch, a round trip, a draw call, an
allocation, a frame, milliseconds.

```ts
// NO  - A scene of rectangles pays nothing for the text lane, and the placeholder is the
//       cheapest thing that satisfies the bind group.
// YES - A scene of rectangles issues no font request, and the placeholder is one texel, the
//       smallest thing the bind group accepts.
```

`free` carries its own trap. Reusing a table or a value that already exists for
another reason is convenient, not free — name what is reused instead of calling
the reuse a savings.

```ts
// NO  - isPentagon is already free -- the constant table exists for the adjacency check.
// YES - isPentagon reads the same constant table the adjacency check already reads.
```

### Keep the register plain

Technical documentation, not prose. Avoid flourishes that carry no
information — `that is the whole shape of the thing`, `the honest
demonstration`, `not optional politeness`, `is the point`. If deleting a
clause loses no fact, delete it.

---

## Applying this

These rules apply to code comments, doc comments, and the prose in
`README.md`. When editing an existing comment, bring it into line. Do not
sweep unrelated comments in files you are not otherwise touching unless
asked.
