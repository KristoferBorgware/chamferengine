import type { CaveVolume } from "./caveVolume.js";
import type { ColumnPatch } from "chamfer/mesh";
import { AIR, CUT, ROCK, VOID } from "./CaveBlock.js";

/** What a volume of blocks came to, as the numbers that decide a cave rule. */
export interface CaveMeasure {
	readonly caveCells: number;
	readonly caveColumns: number;
	readonly mouths: number;
	readonly multiSpan: number;
	readonly systems: number;
	readonly largest: number;
	readonly half: number;
	readonly medianWidth: number;
	readonly thinShare: number;
	readonly faces: number;
	readonly facesBare: number;
}

/**
 * What a patch of caves is worth, counted rather than looked at.
 *
 * **A cave you cannot walk down is a texture, not a cave**, so these are about
 * reach: how much of the patch a passage touches, how many separate systems it
 * breaks into, and how many cells wide the narrowest way through one is. A plan
 * that reads as a network on paper can rasterise into a hundred disconnected
 * pockets, and that is exactly the failure a picture hides and a count does
 * not.
 *
 * **The walk is the lattice's own.** The neighbours come from the patch's ring,
 * so a passage crossing one of the thirty face edges is followed across it and
 * a cell at one of the twelve icosahedron vertices is walked with five
 * neighbours rather than six, with nothing here saying so.
 */
export function measureCaves(
	patch: ColumnPatch,
	volume: CaveVolume,
): CaveMeasure {
	const { count, layers, kind } = volume;
	const { ring, degree } = patch;

	let caveCells = 0;
	let caveColumns = 0;
	let mouths = 0;
	let multiSpan = 0;
	const hasCave = new Uint8Array(count);

	for (let c = 0; c < count; c++) {
		const base = c * layers;
		let cave = 0;
		let topCave = -1;
		let spans = 0;
		let wasRock = false;
		let shut = false;
		for (let L = 0; L < layers; L++) {
			const v = kind[base + L]!;
			if (v === VOID) {
				cave++;
				if (topCave < 0) topCave = L;
			}
			// **A mouth is a way in, so what is over the passage has to be
			// open all the way to the sky.** Air is the sky itself and a block
			// the cliffs layer took is a hole in a hillside; rock is not.
			if (v === ROCK && topCave < 0) shut = true;
			const rock = v === ROCK;
			if (rock && !wasRock) spans++;
			wasRock = rock;
		}
		caveCells += cave;
		if (cave > 0) {
			caveColumns++;
			hasCave[c] = 1;
			if (!shut) mouths++;
		}
		if (spans > 1) multiSpan++;
	}

	// Connected systems, over the six lateral neighbours plus up and down.
	const seen = new Uint8Array(count * layers);
	const stack = new Int32Array(count * layers);
	const sizes: number[] = [];
	for (let start = 0; start < count * layers; start++) {
		if (kind[start] !== VOID || seen[start]) continue;
		let size = 0;
		let head = 0;
		stack[head++] = start;
		seen[start] = 1;
		while (head > 0) {
			const at = stack[--head]!;
			size++;
			const L = at % layers;
			const c = (at - L) / layers;
			if (L > 0 && kind[at - 1] === VOID && !seen[at - 1]) {
				seen[at - 1] = 1;
				stack[head++] = at - 1;
			}
			if (L < layers - 1 && kind[at + 1] === VOID && !seen[at + 1]) {
				seen[at + 1] = 1;
				stack[head++] = at + 1;
			}
			// **A neighbour's layers are not this column's layers.** Every
			// column is walked from its own ground down, so two columns at
			// different heights hold the same world layer at different indices
			// -- and joining them by index would run a passage up a hillside.
			for (let k = 0; k < degree[c]!; k++) {
				const to = ring[c * 6 + k]!;
				if (to < 0) continue;
				const layer = volume.topLayer[c]! - L;
				const there = volume.topLayer[to]! - layer;
				if (there < 0 || there >= layers) continue;
				const index = to * layers + there;
				if (kind[index] === VOID && !seen[index]) {
					seen[index] = 1;
					stack[head++] = index;
				}
			}
		}
		sizes.push(size);
	}

	// The narrowest way through a passage, in cells. Three lattice axes, the
	// run of cave columns through this one along each, and the smallest of the
	// three -- so a column in a wide chamber reports the chamber and a column
	// in a slot reports the slot.
	const widths: number[] = [];
	for (let c = 0; c < count; c++) {
		if (!hasCave[c]) continue;
		let narrowest = Infinity;
		for (let axis = 0; axis < 3; axis++) {
			let run = 1;
			for (const k of [axis, axis + 3]) {
				let at = c;
				for (;;) {
					// A pentagon has no direction 5, so a walk that reaches one
					// stops there rather than turning a corner.
					if (k >= degree[at]!) break;
					const next = ring[at * 6 + k]!;
					if (next < 0 || !hasCave[next]) break;
					at = next;
					run++;
				}
			}
			if (run < narrowest) narrowest = run;
		}
		widths.push(narrowest);
	}

	// **One count is not enough.** A rule that makes a few real passages and a
	// hundred specks reports the same system count as one that makes a hundred
	// real passages; how many of the biggest hold half the void separates them.
	sizes.sort((a, b) => b - a);
	let running = 0;
	let half = 0;
	while (half < sizes.length && running * 2 < caveCells) {
		running += sizes[half]!;
		half++;
	}

	widths.sort((a, b) => a - b);
	const medianWidth = widths.length ? widths[widths.length >> 1]! : 0;
	const thin = widths.filter((w) => w < 2).length;

	/**
	 * Faces where what is drawn meets what is not.
	 *
	 * **Asked by world layer rather than by index**, because two columns at
	 * different heights hold one world layer at different indices -- asked by
	 * index, a hillside would report no cliff face at all.
	 *
	 * Off the patch and below the walked band both stand in as filled, so the
	 * rim the patch was cut at is not charged to the caves. Above a column's
	 * own ground is sky, which is a face.
	 */
	const faces = (fillCaves: boolean): number => {
		let total = 0;
		const solid = (c: number, worldLayer: number): boolean => {
			if (c < 0) return true;
			const L = volume.topLayer[c]! - worldLayer;
			if (L >= layers) return true;
			if (L < 0) return false;
			const v = kind[c * layers + L]!;
			if (v === AIR || v === CUT) return false;
			return fillCaves || v === ROCK;
		};
		for (let c = 0; c < count; c++) {
			const top = volume.topLayer[c]!;
			for (let L = 0; L < layers; L++) {
				const worldLayer = top - L;
				if (!solid(c, worldLayer)) continue;
				if (!solid(c, worldLayer + 1)) total++;
				if (!solid(c, worldLayer - 1)) total++;
				for (let k = 0; k < degree[c]!; k++) {
					const to = ring[c * 6 + k]!;
					if (to < 0) continue;
					if (!solid(to, worldLayer)) total++;
				}
			}
		}
		return total;
	};

	return {
		caveCells,
		caveColumns,
		mouths,
		multiSpan,
		systems: sizes.length,
		largest: sizes[0] ?? 0,
		half,
		medianWidth,
		thinShare: widths.length ? thin / widths.length : 0,
		faces: faces(false),
		facesBare: faces(true),
	};
}
