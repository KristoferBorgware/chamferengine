import type { CoarseMap } from "../coarse/CoarseMap.js";
import { ChunkAddress } from "./ChunkAddress.js";
import { joinPath } from "../../addressing/lattice/joinPath.js";

/**
 * How high the ground reaches under each triangle of the chunk hierarchy.
 *
 * The selection has to know how far a chunk's own ground pokes back over the
 * horizon. One planet-wide figure answers that for every chunk, which reaches
 * every peak and selects a ring of chunks whose ground is nowhere near that
 * tall: measured at 7 to 9% of the chunks at the shipped settings, and 32% on a
 * world with a tenth of its surface above water.
 *
 * Built once, from the coarse map, and read per triangle during the walk.
 * Asking the map during the walk instead would cost about six million reads a
 * selection, because a face-sized triangle covers 33,153 coarse cells and the
 * walk visits every level.
 *
 * **Levels below {@link CAPPED_LEVEL} read their ancestor's figure.** A parent's
 * tallest ground is never lower than a child's, so a child reading it is
 * conservative in the same direction the planet-wide figure was: nothing
 * visible is ever dropped. What it saves is the table — the pyramid to level 6
 * is 109,220 entries and 437 KB, and carrying it to level 8 would be
 * 1,747,626 and 7 MB for triangles 32 m across, whose peaks barely differ.
 */
export const CAPPED_LEVEL = 6;

export class ChunkPeaks {
	/** Metres above the sea-level radius, one per triangle, level by level. */
	private readonly levels: Float32Array[];

	/**
	 * The other end of the same range: the lowest ground under each triangle.
	 *
	 * The peak alone says how far a chunk pokes over the horizon, which is what
	 * the reach needs. Bounding a chunk to cull it needs both ends, or every
	 * chunk on a tall world gets a sphere reaching from sea level to the
	 * planet's tallest mountain -- 550 m of radius for a triangle 32 m across
	 * at the shipped relief, which refuses almost nothing.
	 *
	 * Negative under the sea, and the sea floor is drawn through the water, so
	 * it belongs inside the bound rather than being clamped away.
	 */
	private readonly floors: Float32Array[];

	/**
	 * @param margin metres to add to every figure. The map is the whole of the
	 * terrain now, so nothing is missing from it and this can be zero; it stays
	 * because a chunk's own interpolation reaches a shade past the coarse
	 * samples it mixes, and because an upper bound is what the selection wants.
	 */
	constructor(map: CoarseMap, margin: number, finestChunkLevel: number) {
		const deepest = Math.min(CAPPED_LEVEL, finestChunkLevel);
		this.levels = [];
		this.floors = [];
		for (let level = 0; level <= deepest; level++) {
			this.levels.push(new Float32Array(20 * 4 ** level));
			this.floors.push(new Float32Array(20 * 4 ** level));
		}

		// The deepest level reads the map; every coarser one is the largest of
		// its four children, so the map is walked once rather than once a level.
		const mapLevel = map.level;
		const deep = this.levels[deepest]!;
		const deepFloor = this.floors[deepest]!;
		const m = 1 << Math.max(0, mapLevel - deepest);
		for (let face = 0; face < 20; face++)
			for (let value = 0; value < 4 ** deepest; value++) {
				const address = ChunkAddress.fromKey(
					face * 4 ** deepest + value,
					deepest,
				);
				let highest = -Infinity;
				let lowest = Infinity;
				for (let q = 0; q <= m; q++)
					for (let r = 0; q + r <= m; r++) {
						const [i, j] = joinPath(address.path, q, r, mapLevel);
						const h = map.heightAt(face, i, j, mapLevel);
						if (h > highest) highest = h;
						if (h < lowest) lowest = h;
					}
				deep[address.key] = Math.max(0, highest + margin);
				deepFloor[address.key] = lowest - margin;
			}

		for (let level = deepest - 1; level >= 0; level--) {
			const here = this.levels[level]!;
			const below = this.levels[level + 1]!;
			const hereFloor = this.floors[level]!;
			const belowFloor = this.floors[level + 1]!;
			for (let key = 0; key < here.length; key++) {
				let highest = 0;
				let lowest = Infinity;
				for (let child = 0; child < 4; child++) {
					const value = below[key * 4 + child]!;
					if (value > highest) highest = value;
					const floor = belowFloor[key * 4 + child]!;
					if (floor < lowest) lowest = floor;
				}
				here[key] = highest;
				hereFloor[key] = lowest;
			}
		}
	}

	/**
	 * Widen a triangle's range to hold ground the map cannot know about.
	 *
	 * The map is a picture of the generated world, so no placed block is in it
	 * and none can be. The selection reads these figures three times -- whether
	 * a triangle pokes back over the horizon, how big a ball to test against
	 * the view, and how far away its ground is -- and the first two decide
	 * whether a chunk is drawn at all. A tower standing out of the top of the
	 * ball built for the hillside under it is culled with the hillside.
	 *
	 * Every ancestor is widened too, because a parent's figures are the
	 * envelope of its children's and the walk refuses a whole subtree on the
	 * parent's.
	 *
	 * `high` and `low` are metres above the sea-level radius, the same as
	 * everything else here.
	 */
	raise(key: number, chunkLevel: number, high: number, low: number): void {
		// A triangle below the table is answered by its deepest ancestor, so
		// that is the entry to widen.
		const deepest = this.levels.length - 1;
		let at = chunkLevel <= deepest ? chunkLevel : deepest;
		let where = fold(key, chunkLevel, at);
		for (; at >= 0; at--) {
			const peaks = this.levels[at]!;
			const floors = this.floors[at]!;
			if (high > peaks[where]!) peaks[where] = high;
			if (low < floors[where]!) floors[where] = low;
			where = Math.floor(where / 4);
		}
	}

	/** Metres of ground above the sea-level radius under one triangle. */
	peakOf(key: number, chunkLevel: number): number {
		if (chunkLevel < this.levels.length)
			return this.levels[chunkLevel]![key]!;
		// Below the table, read the deepest ancestor that is in it.
		const deepest = this.levels.length - 1;
		return this.levels[deepest]![fold(key, chunkLevel, deepest)]!;
	}

	/**
	 * Metres of the lowest ground under one triangle, negative under the sea.
	 *
	 * Read the same way {@link ChunkPeaks.peakOf} is, and conservative in the
	 * same direction: a triangle below the table reads an ancestor's figure,
	 * which is never higher than its own.
	 */
	troughOf(key: number, chunkLevel: number): number {
		if (chunkLevel < this.floors.length)
			return this.floors[chunkLevel]![key]!;
		const deepest = this.floors.length - 1;
		return this.floors[deepest]![fold(key, chunkLevel, deepest)]!;
	}
}

/**
 * A chunk key read at a coarser level of the table.
 *
 * **Division, not a shift.** A key is `face x 4^chunkLevel + path`, which at
 * chunk level 14 runs past `2^31` -- and `>>` is a 32-bit signed operator, so
 * it wraps the top faces to negative indices. A negative index into a
 * `Float32Array` reads `undefined`, which the non-null assertion does not
 * catch, and every comparison against it is false: the triangle is credited
 * with no ground at all and culled. Depth 17 with 8-cell chunks is a world the
 * panel accepts, and 12 of the 20 faces fold negative there.
 *
 * This is the same conversion `coarseChunkKey` makes, and it uses float
 * arithmetic for the same reason.
 */
function fold(key: number, chunkLevel: number, level: number): number {
	if (level >= chunkLevel) return key;
	return Math.floor(key / 4 ** (chunkLevel - level));
}
