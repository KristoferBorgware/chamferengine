# Code style

Structure, naming, formatting and comment conventions for the engine. Applies
to all TypeScript source, not to comments alone. The comment rules also apply
to the prose in `README.md`.

Not part of the specification. [`ARCHITECTURE.md`](ARCHITECTURE.md) decides
what is built; this page decides how it is written.

This is a professional open source project. Someone who has never seen the
codebase should be able to find a thing by its name and read it without loading
the rest of the engine into their head.

---

## Structure

### KISS

Keep it simple, stupid. The straightforward version is the one to write. A
technique earns its place by a measured number, never by being more capable in
principle.

### Two packages

`packages/engine` is the engine, published as `chamfer`.
`packages/client` is the application that consumes it, and is not published.

One published package rather than several, for two reasons.

**A consumer installs one thing at one version.** Splitting the engine across
`@chamfer/core`, `@chamfer/render` and the rest means several publishes whose
version numbers have to move together, and a consumer who lands `render@0.2` on
`core@0.1` gets a combination nobody tested.

**A package boundary is a wall, and subsystems have to reach across it.** A
matrix type living in the renderer is reachable from the mesher only by
depending on the whole renderer, WebGPU types included. Inside one package it is
`math/Mat4.ts` and there is no wall to route around. Shared code ends up
duplicated or misfiled every time the wall is in the wrong place, and the wall
is always eventually in the wrong place.

The separation that matters is kept by **subpath exports** instead:

```
chamfer              the whole engine
chamfer/math         vectors and matrices
chamfer/addressing   cell IDs, the lattice, neighbours, the lookup
chamfer/generation   noise, terrain, the coarse map
chamfer/mesh         surface extraction, and the geometry it produces
chamfer/render       WebGPU device, pipelines, passes
```

A server imports `chamfer/addressing` and pulls in nothing that mentions a GPU.
Each entry point is a barrel that re-exports its subsystem, and it is the only
thing outside that subsystem may import.

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

A file is found by its name, and the name is the export spelled the way the
export is spelled. `hexRound.ts` exports `hexRound`, `Vec3.ts` exports `Vec3`,
`DIRECTIONS.ts` exports `DIRECTIONS`. Casing follows the export: PascalCase for
a class or a type, camelCase for a function, SCREAMING_SNAKE for a constant.
Folder names are lowercase.

That is one rule, not three. A tree with `Vec3.ts` beside `hexRound.ts` beside
`DIRECTIONS.ts` is consistent, because in each case the filename is what you
would type to import it.

Types and constants that describe one thing may share a file. Functions may not:
prefer more files over larger ones — splitting is close to no work, and a file
that accumulated four unrelated functions is the one nobody can navigate. A
function's own result type belongs beside it; a type two subsystems both name
does not.

### Declare a shared type or constant away from its use

A file that both defines a shared constant and consumes it hides the definition
from every other file that wants it, and the second consumer copies it. Put
shared types and constants in their own file, and import them.

### Classes where there is a value with operations on it

A class when a value has a set of operations over it, or when there is state to
hold: `Vec3`, `Mat4`, `LatticeRenderer`. The operations belong on the class —
`v.normalize()`, not `normalize(v)` from a second file — because that is where
someone looks for them.

A class is for per-entity and per-frame work. **Per-cell and per-vertex data is
typed arrays and bare numbers**, never an array of objects: one object per
vertex measures 15x slower on a mesh buffer build, which is a larger gap than
any two languages in the study. The two rules do not conflict — they describe
different data.

Plain functions where there is no value to hang them on. `hexRound`, `faceOf`
and `neighbour` take numbers and return numbers.

### Separate systems with interfaces

A system takes what it needs through an interface it defines, and nothing else
crosses the boundary.

The mesher is the worked example. `mesh/Geometry.ts` is two typed arrays and
two counts, and that is the whole contract: the mesher fills them, the renderer
uploads them. The mesher holds no `GPUDevice`, no `GPUBuffer` and no renderer
object of any kind, so it runs under plain Node with no GPU, and the renderer
can change without touching it.

The interface lives with the system that produces the data, and the consumer
imports it. `Geometry` sits in `mesh/`, and `render/` imports it.

### Tests mirror the source and sit outside it

Tests live in `packages/engine/tests/`, in a tree that mirrors `src/` path for
path. `src/addressing/lattice/rank.ts` is tested by
`tests/addressing/lattice/rank.test.ts`.

Two reasons they are not beside the source. `src/` is exactly what ships, and a
co-located test compiles into the published output — the declarations for the
tests were being emitted alongside the engine's own. And a test names the file
it covers by its path, so finding one is a mechanical rewrite rather than a
search.

**Tests import through the package's entry points**, not through relative paths
into `src/`. A test reads `import { rank } from "chamfer/addressing"`. That
exercises the surface a consumer gets, and it means moving a file inside a
subsystem does not touch a single test.

---

## Spelling

**American English in code**, in identifiers and in comments alike. `color`,
never `colour`. `normalize`, never `normalise`. One spelling across the
codebase, and it is the one the platform already uses: WebGPU has
`colorAttachments`, CSS has `color`, WGSL has `vec4f` colors.

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
