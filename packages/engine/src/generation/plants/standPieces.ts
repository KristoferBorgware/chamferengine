import type { Stand, StandPatch } from "./growStand.js";
import { PLANT_WOOD } from "./growStand.js";

/** How many separate pieces the wood is in, and how much of it reaches down. */
export interface StandPieces {
	readonly pieces: number;

	/** The share of wood cells belonging to a piece that stands on the ground. */
	readonly rooted: number;
}

/**
 * Whether the wood is one piece standing on the ground, or debris in the air.
 *
 * **This is the measurement the whole approach turns on.** Growing wood
 * wherever a noise field crosses a threshold gives 172 separate pieces with
 * 1.7% of the wood touching the ground over a 64 m box at 4% fill -- a cloud of
 * fragments. Two fields intersected reach 10.0%, and gating either by height
 * takes both to 0.0%, because the gate's job is to delete wood near the ground
 * and the trunk is the wood near the ground. A hashed skeleton is one piece
 * with 100% of it standing down.
 *
 * The repair for a disconnected field is a flood fill from the trunk, and a
 * flood fill is a global query: whether a cell survives depends on a chain of
 * cells that may run three chunks away. **Nothing that needs a flood fill can
 * be terrain**, so this is a check on the construction rather than a filter
 * over its output.
 *
 * A slot index is counted from each column's own ground, so a step sideways
 * converts the index rather than reusing it.
 */
export function standPieces(
	patch: StandPatch,
	groundLayer: Int32Array,
	stand: Stand,
): StandPieces {
	const { blocks, layers, sunk } = stand;
	const { ring } = patch;
	if (stand.wood === 0) return { pieces: 0, rooted: 0 };

	const seen = new Uint8Array(blocks.length);
	const stack = new Int32Array(blocks.length);
	let pieces = 0;
	let rooted = 0;
	for (let start = 0; start < blocks.length; start++) {
		if (blocks[start] !== PLANT_WOOD || seen[start]) continue;
		pieces++;
		let deep = 0;
		let size = 0;
		let down = false;
		stack[deep++] = start;
		seen[start] = 1;
		while (deep > 0) {
			const p = stack[--deep]!;
			size++;
			const c = (p / layers) | 0;
			const slot = p - c * layers;
			if (slot === sunk) down = true;
			const push = (q: number): void => {
				if (q < 0 || q >= blocks.length) return;
				if (blocks[q] !== PLANT_WOOD || seen[q]) return;
				seen[q] = 1;
				stack[deep++] = q;
			};
			if (slot + 1 < layers) push(p + 1);
			if (slot > 0) push(p - 1);
			for (let d = 0; d < 6; d++) {
				const nb = ring[c * 6 + d]!;
				if (nb < 0) continue;
				const across = slot + groundLayer[c]! - groundLayer[nb]!;
				if (across < 0 || across >= layers) continue;
				push(nb * layers + across);
			}
		}
		if (down) rooted += size;
	}
	return { pieces, rooted: rooted / stand.wood };
}
