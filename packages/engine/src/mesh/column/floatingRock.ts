import type { ColumnPatch } from "./ColumnPatch.js";
import type { ColumnGround } from "./columnPatchMesh.js";

/** Rock that touches nothing reaching the bedrock, and how much of it there is. */
export interface FloatingRock {
	/** Separate masses hanging in the air. */
	readonly masses: number;

	/** How many column-spans those masses are made of. */
	readonly spans: number;
}

/**
 * Which rock in a patch is attached to the ground and which is hanging.
 *
 * **A floating island is a question a column cannot answer.** How many spans a
 * column holds says there is air under some rock; whether that rock is
 * *attached to anything* is a fact about the patch, so it takes a walk over the
 * whole of it. Every column's lowest span reaches the bedrock under the carve
 * -- below one reach nothing is ever dug -- so those are the ground, and any run
 * of rock that never joins one is hanging in the air.
 *
 * Two spans in neighbouring columns are one piece of rock when they share a
 * block layer. **Half a block of overlap is the test**, because the spans are
 * already on the grid and a touch of exactly zero is two floors meeting rather
 * than rock joining.
 */
export function floatingRock(
	patch: ColumnPatch,
	ground: ColumnGround,
	blockMetres: number,
): FloatingRock {
	const { count, ring } = patch;
	const { at, spans } = ground;
	const pieces = spans.length / 2;
	const owner = new Int32Array(pieces);
	for (let p = 0; p < pieces; p++) owner[p] = p;
	const rootOf = (of: number): number => {
		let root = of;
		while (owner[root] !== root) root = owner[root]!;
		// Flattened on the way back, or a patch this size walks the same chain
		// thousands of times.
		let walk = of;
		while (owner[walk] !== root) {
			const up = owner[walk]!;
			owner[walk] = root;
			walk = up;
		}
		return root;
	};
	const join = (a: number, b: number): void => {
		const ra = rootOf(a);
		const rb = rootOf(b);
		if (ra === rb) return;
		owner[ra < rb ? rb : ra] = ra < rb ? ra : rb;
	};

	const touch = blockMetres * 0.5;
	for (let c = 0; c < count; c++)
		for (let d = 0; d < 6; d++) {
			const found = ring[c * 6 + d]!;
			if (found <= c) continue;
			for (let a = at[c]!; a < at[c + 1]!; a += 2)
				for (let b = at[found]!; b < at[found + 1]!; b += 2)
					if (
						Math.min(spans[a + 1]!, spans[b + 1]!) -
							Math.max(spans[a]!, spans[b]!) >
						touch
					)
						join(a / 2, b / 2);
		}

	const grounded = new Uint8Array(pieces);
	for (let c = 0; c < count; c++) grounded[rootOf(at[c]! / 2)] = 1;
	let masses = 0;
	let hanging = 0;
	for (let p = 0; p < pieces; p++) {
		const root = rootOf(p);
		if (grounded[root]) continue;
		hanging++;
		if (root === p) masses++;
	}
	return { masses, spans: hanging };
}
