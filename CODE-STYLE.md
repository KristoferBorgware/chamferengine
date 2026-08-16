# Code style

Formatting and comment conventions for the engine, once it exists. Applies to
TypeScript source; the comment rules also apply to the prose in `README.md`.

Not part of the specification. [`ARCHITECTURE.md`](ARCHITECTURE.md) decides
what is built; this page decides how it is written.

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
