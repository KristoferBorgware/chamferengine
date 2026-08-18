import { describe, expect, it } from "vitest";
import {
	CAPPED_LEVEL,
	ChunkAddress,
	ChunkPeaks,
	buildCoarseMap,
	selectChunks,
} from "chamfer/generation";

const DEPTH = 9;
const FINEST = 5;
const RADIUS = 1700;

const map = buildCoarseMap(4242, { level: 6 });
const peaks = new ChunkPeaks(map, 0, FINEST);

/** The tallest ground the map holds anywhere, which is metres already. */
const planetWide = (() => {
	let highest = 0;
	for (let cell = 0; cell < map.count; cell++)
		if (map.height[cell]! > highest) highest = map.height[cell]!;
	return highest;
})();

describe("ChunkPeaks", () => {
	it("never exceeds the planet's own tallest ground", () => {
		// The table is float32, so a figure that equals the planet's tallest
		// ground can round a few parts in ten million above the float64 one.
		const ceiling = planetWide * (1 + 1e-6);
		for (let level = 0; level <= Math.min(CAPPED_LEVEL, FINEST); level++)
			for (let key = 0; key < 20 * 4 ** level; key++)
				expect(peaks.peakOf(key, level)).toBeLessThanOrEqual(ceiling);
	});

	it("gives a parent at least what every child gives", () => {
		const deepest = Math.min(CAPPED_LEVEL, FINEST);
		for (let level = 0; level < deepest; level++)
			for (let key = 0; key < 20 * 4 ** level; key++)
				for (let child = 0; child < 4; child++)
					expect(
						peaks.peakOf(key, level),
						`level ${level} key ${key} child ${child}`,
					).toBeGreaterThanOrEqual(
						peaks.peakOf(key * 4 + child, level + 1),
					);
	});

	it("hands a level below the table its nearest ancestor's figure", () => {
		const deepest = Math.min(CAPPED_LEVEL, FINEST);
		if (deepest >= FINEST) return;
		for (let key = 0; key < 20 * 4 ** (deepest + 1); key++)
			expect(peaks.peakOf(key, deepest + 1)).toBe(
				peaks.peakOf(key >> 2, deepest),
			);
	});

	/**
	 * The margin is added before the figure is held at zero, not after, so a
	 * triangle whose ground sits under the sea gains only the part of the margin
	 * that reaches back above it. That is the conservative direction: ground the
	 * detail term could lift over the water is covered, and ground far below it
	 * still reports nothing.
	 */
	it("adds the margin, and holds the result at zero", () => {
		const margin = 37;
		const wider = new ChunkPeaks(map, margin, FINEST);
		let raised = 0;
		for (let key = 0; key < 20; key++) {
			const bare = peaks.peakOf(key, 0);
			const with_ = wider.peakOf(key, 0);
			expect(with_).toBeGreaterThanOrEqual(bare);
			expect(with_).toBeLessThanOrEqual(bare + margin + 1e-3);
			if (bare > 0) {
				expect(with_).toBeCloseTo(bare + margin, 2);
				raised++;
			}
		}
		expect(
			raised,
			"no face stands above the sea to check against",
		).toBeGreaterThan(0);
	});

	/**
	 * The point of the whole table. A selection using it must not lose a chunk
	 * the planet-wide bound would have drawn for a reason -- only the ones whose
	 * own ground cannot reach over the horizon.
	 */
	it("drops chunks, and never one whose own ground could be seen", () => {
		const viewer = { x: 0, y: 0, z: 1 };
		for (const eye of [1.7, 40, 200]) {
			const r = RADIUS + eye;
			const wide = selectChunks(
				DEPTH,
				FINEST,
				viewer,
				r,
				RADIUS,
				2,
				planetWide,
			);
			const tight = selectChunks(
				DEPTH,
				FINEST,
				viewer,
				r,
				RADIUS,
				2,
				planetWide,
				peaks,
			);
			const kept = new Set(tight.map((c) => c.key));
			expect(tight.length).toBeLessThanOrEqual(wide.length);

			// Everything the tight walk kept, the wide one kept too: the table
			// only ever shortens the reach.
			const wideKeys = new Set(wide.map((c) => c.key));
			for (const c of tight)
				expect(wideKeys.has(c.key), `eye ${eye}, key ${c.key}`).toBe(
					true,
				);

			// Everything it dropped had ground too low to clear the horizon.
			for (const c of wide) {
				if (kept.has(c.key)) continue;
				const address = ChunkAddress.fromKey(c.key, c.chunkLevel);
				expect(
					peaks.peakOf(address.key, c.chunkLevel),
					`eye ${eye}: dropped a chunk whose own peak is not below the planet's`,
				).toBeLessThan(planetWide);
			}
		}
	});

	it("selects the same chunks as before when it is not passed", () => {
		const viewer = { x: 0, y: 0, z: 1 };
		const before = selectChunks(
			DEPTH,
			FINEST,
			viewer,
			RADIUS + 40,
			RADIUS,
			2,
			planetWide,
		);
		const after = selectChunks(
			DEPTH,
			FINEST,
			viewer,
			RADIUS + 40,
			RADIUS,
			2,
			planetWide,
			undefined,
		);
		expect(after.map((c) => c.key)).toEqual(before.map((c) => c.key));
	});
});
