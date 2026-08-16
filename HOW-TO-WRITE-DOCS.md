# How to write docs

Voice, structure and figure rules for **every Markdown file in this
repository** — the `docs/` specification, `README.md`, `ARCHITECTURE.md`,
`CODE-STYLE.md`, `CLAUDE.md`, `plans/`, and every `README` beside a folder of
scripts. Linked from [`CLAUDE.md`](CLAUDE.md) rather than kept there, so a
coding session loads it when it writes prose and not before.

Two sections apply to `docs/` alone, and say so where they begin: **Figures**
and the parts of **Structure and honesty** that name "Still open" and "In one
breath". Everything else applies to all of it.

---

## Reference pages state, they do not argue

`docs/` is a specification: it argues each decision from a measurement, and the
measurement is the point of the page.

Every other Markdown file states what is true today and stops.

- **No history.** A reference page describes the project as it stands. When the
  project changes, the page changes with it. Git holds what it used to say.
- **No reasoning.** State the arrangement, not the case for it. "The engine is
  one package, and subsystems are subpath exports" — not "one package rather
  than several, for two reasons".
- **No self-justification.** The page owes the reader no defence of its
  contents. Cut "which is why", "the reason is", "this matters because", and
  any sentence whose job is to make the previous sentence acceptable.
- **No alternatives.** Do not name the arrangement that was not chosen in order
  to contrast it. A reader wants the shape of the thing, not the shape of the
  thing it is not.

Where a fact genuinely has to carry a reason — a constant that would look
arbitrary and get changed — give it as one plain sentence of fact, not as an
argument. "`float32` steps by `1.2e-7` at this magnitude" states a number; "we
chose this so that the lake would not go flat, because otherwise" argues.

## Who is reading

A working programmer who has never done any of this before. They read a bit
layout, a complexity bound or a code block without help. They have never met a
Goldberg polyhedron, a gnomonic projection or holonomy, and they will not go and
look them up — if a document needs one, that document teaches it, in that
document, however many times it has been taught elsewhere.

Nothing may rest on prior knowledge of spheres, tilings or graphics. Everything
may rest on ordinary programming.

[`demos/how-it-works.html`](demos/how-it-works.html) is the reference for voice —
match it. Docs [02](docs/02-geometry-choice.md), [03](docs/03-addressing.md) and
[04](docs/04-position-lookup.md) show that voice carrying a full specification.

## Voice

- **Build it with the reader, in the imperative.** "Take one triangle. Mark the
  middle of each of its three edges. Join those three marks." Short commands they
  can follow in their head, then the result. This beats any amount of description.
- **Let the key beats be very short.** "It is lumpy. That is fine." A three-word
  sentence after a long one is the strongest tool available here. Use it on the
  turn of the argument, not for decoration.
- **Gloss every identifier in ordinary words** the first time it appears —
  "`normalize(position)`, meaning keep the direction and set the length to the
  radius". Code that is not glossed is skipped.
- **Compare to what they already know.** Cube worlds, a filing system, a globe.
  One familiar anchor early is worth a paragraph of definition. Never Minecraft —
  this is not a Minecraft clone, and the comparison sets an expectation the
  project does not intend to meet. And not H3: it is real prior art (doc 01
  says what this design takes from it), but most readers do not already know
  it, which fails the one job this technique has.
- **Say what a number feels like**, not only what it is. "By level 5 or 6 it looks
  like a ball; by level 11 you could not tell it from one." "About 21,000 cells —
  nothing at all." A number the reader cannot feel does not land.

## Sentences and words

- **Plain first, formal second, maths third.** "Barycentric coordinates are mixing
  ratios", then the definition, then the formula. Never let a term appear before
  the sentence that lets the reader picture it. If the formal name adds nothing,
  leave it out — or park it at the end, as doc 02 does with "gnomonic".
- **Use the ordinary word.** "Shrinks", not "attenuates". "The same at every
  layer", not "radially invariant". Never reach for jargon to shorten a sentence.
- **One idea per sentence, conclusion at the front.** A full stop beats a
  semicolon; a second sentence beats a subordinate clause. Do not write a sentence
  you could not say out loud.
- **Split a dense sentence into several plain ones, even if the paragraph gets
  longer.** A sentence that chains a claim, a number, a citation and an
  instruction with commas and an em-dash asks the reader to hold all of it at
  once. Give each part its own sentence instead: "Doc 19 checked this at every
  centre and radius. Not one exception." beats "Doc 19 checked this at every
  centre and radius, with 0 exceptions — and the demo lets you see it
  yourself." Four short sentences read faster than one long one, and drop
  nothing the long one had.
- **Headings are claims, not labels.** "The blocks are the corners, not the
  triangles", not "Cell placement". A reader who reads only the headings should
  come away with the design.
- **Nothing is "free."** Reusing a table, a predicate or a value that already
  exists for another reason is convenient, not free — name what it reuses.
  "`isPentagon` is already free" hides the fact behind a word that means zero
  cost; "`isPentagon` reads the constant table the adjacency check already
  reads" states it.
- **`color`, never `colour`.** American spelling throughout, matching the
  engine's identifiers and the web platform's own names.

## Numbers and maths

- **Never soften the maths, never hide it.** State the result in words, give the
  formula in a code block, then say what it costs in metres, layers or bytes on
  the worked planet. A formula with no worked value is half-written.
- **Every abstract claim gets a concrete handle** — a number from the worked
  planet, something to try ("draw a hexagon and try to fill it with smaller
  hexagons"), or a metaphor that survives being pushed ("triangles are the filing
  system, hexagons are the floor"). Drop a metaphor the moment it stops being true
  rather than stretching it.
- **Cite a script or do not state a number.** If a figure has no script behind it,
  say so in the sentence that uses it — doc 03's 6% border-cell figure is the
  model. A number quoted from another document is not verified; follow the chain
  to a script.
- **Bold marks a load-bearing term or a decision**, never emphasis.
  `check-coverage.js` reads bold runs as facts.

## Figures

`docs/` only.

**Every document earns at least one, and the harder the document the more it
needs.** A reader who is lost in prose is rescued by a picture; a reader who is
lost in prose about three-dimensional space is not rescued by more prose. Docs
13 through 25 carry the hardest material in the specification and are the ones
most in need of pictures — treat one figure per major claim as the target there,
not one per document.

- **The first figure shows the problem, not the solution.** Draw what goes wrong
  without the design, so the difficulty is visible before the fix is described.
- **Generated by `tools/make-figures.js`**, never hand-drawn and never
  hand-edited, so the geometry comes from the same construction the prose
  describes. Add a generator function, re-run the tool, commit the SVG.
- **The caption carries an argument, not a label.** It says the thing the picture
  cannot: what to look at, why it matters, and the number it settles. Captions
  run two or three sentences and are worth as much as the paragraph above them.
  A caption that only names the picture is wasted.
- **Point at a demo** in `demos/` whenever one lets the reader move the thing
  themselves. A figure shows one case; a demo shows the family.
- **No label may overlap a line, a shape, or another label.** Check the
  generated SVG at the size it actually renders, not just the generator code —
  wrap or shorten any string that collides, break a long label onto multiple
  `<tspan>` lines rather than letting it run into the geometry, and move a
  label's anchor point before shrinking its font to make it fit. A figure a
  reader has to squint at or guess the boundaries of has failed at its one job.

## Structure and honesty

- **Open with the problem**, in one plain sentence about what the player or the
  program is trying to do — not with context or history.
- **State facts, don't announce findings.** Write the conclusion, not the
  discovery of it. "Addressing runs on the client and server", not "both sides,
  unavoidably".
- **Define what something is, not what it isn't.** Avoid "not a database",
  "never RPC", "no second language" as the definition of a thing. Say what it is
  instead.
- **Don't justify decisions with narrative reasoning.** Cut connective tissue
  like "and that is why this shape fits", "which is why", "already scoped".
  State the fact; if a supporting detail is needed, give it as a separate plain
  sentence, not as an argument for the decision.
- **The body is current-state.** A claim reads as true now, not as a step in a
  story about what it used to say. Do not narrate a correction where the claim
  itself appears — state the current value and move on. Future intent and
  migration plans belong in the section that is explicitly about what's
  deferred, never folded as justification into the section about what is true
  now.
- **Cut a number that doesn't serve the sentence it's in.** Don't restate a
  figure a second time for effect — say it once, where it is load-bearing.
- **"Still open" holds the history and the caveats, in one place.** `docs/`
  only; a reference page carries no history at all. A
  superseded value, a soft caveat, or an assumption the numbers make goes in a
  single **Still open** section, near the end of the document and immediately
  before "In one breath" — never scattered through the body. Strike the old
  value there and say what it turned out to be; "earlier drafts of this
  document said ..." belongs in that section and nowhere else on the page.
  "Honest caveat", "Two things the numbers assume", and anything not yet
  designed live there too. A weak number stated confidently in the body is the
  expensive kind of mistake here — the fix is to move it to "Still open", not
  to soften it in place.
- **This is documentation, not copy.** No persuasive framing, no "worth
  stating", no rhetorical flourish — plain prose a reader consults, not an
  argument a reader is walked through.
- **Leave no trace of how the page was written.** No "worth stating
  explicitly", no flagging a sentence as notable before saying it, no
  referring to how a decision was reached or revised. State the fact the way
  it would read if it had always read that way.
- **Close with In one breath** — five or six bullets that carry the argument
  alone. `docs/` only.
