import { describe, expect, it } from "vitest";
import { ChunkAddress, selectChunks } from "chamfer/generation";
import { Vec3 } from "chamfer/math";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import { positionToCell, splitPath } from "chamfer/addressing";

const RADIUS = 1700;
const DEPTH = 9;
const FINEST = 4;
const VIEWER = new Vec3(0.3, 0.7, 0.5).normalize();

/** A repeatable spread of directions over the sphere. */
function* directions(count: number) {
	let s = 987654321;
	const rnd = () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
	for (let n = 0; n < count; n++) {
		const z = 2 * rnd() - 1;
		const phi = 2 * Math.PI * rnd();
		const r = Math.sqrt(1 - z * z);
		yield new Vec3(r * Math.cos(phi), r * Math.sin(phi), z).normalize();
	}
}

/** Whether a chunk's triangle holds a direction. */
function holds(
	selection: { chunkLevel: number; key: number },
	direction: Vec3,
): boolean {
	const address = ChunkAddress.fromKey(selection.key, selection.chunkLevel);
	const cell = positionToCell(direction, 1 << DEPTH);
	if (cell.face !== address.face) return false;
	const split = splitPath(cell.i, cell.j, DEPTH, selection.chunkLevel);
	for (let level = 0; level < selection.chunkLevel; level++)
		if (split.path[level] !== address.path[level]) return false;
	return true;
}

describe("selectChunks", () => {
	it("drops the chunk level as it drops the sampling level", () => {
		// A chunk one level coarser covers four times the area at half the
		// resolution, so it holds the same slots and there are four times fewer.
		for (const altitude of [2, 100, 4000]) {
			for (const selection of selectChunks(
				DEPTH,
				FINEST,
				VIEWER,
				RADIUS + altitude,
				RADIUS,
			)) {
				expect(selection.chunkLevel).toBe(FINEST - selection.lod);
				expect(selection.lod).toBeGreaterThanOrEqual(0);
				expect(selection.chunkLevel).toBeGreaterThanOrEqual(0);
			}
		}
	});

	it("never selects a chunk inside another", () => {
		// One triangle inside another would draw the same ground twice, and the
		// two copies would fight over the depth buffer.
		const chosen = selectChunks(
			DEPTH,
			FINEST,
			VIEWER,
			RADIUS + 200,
			RADIUS,
		);
		const paths = chosen.map((selection) => ({
			face: ChunkAddress.fromKey(selection.key, selection.chunkLevel)
				.face,
			path: ChunkAddress.fromKey(selection.key, selection.chunkLevel)
				.path,
		}));
		for (let a = 0; a < paths.length; a++)
			for (let b = a + 1; b < paths.length; b++) {
				if (paths[a]!.face !== paths[b]!.face) continue;
				const shorter =
					paths[a]!.path.length <= paths[b]!.path.length
						? paths[a]!
						: paths[b]!;
				const longer = shorter === paths[a]! ? paths[b]! : paths[a]!;
				let prefix = true;
				for (let level = 0; level < shorter.path.length; level++)
					if (shorter.path[level] !== longer.path[level])
						prefix = false;
				expect(prefix).toBe(false);
			}
	});

	it("covers what the viewer can see, exactly once", () => {
		// Children tile their parent, so however the levels fall the surface is
		// covered with no gap and no overlap.
		const chosen = selectChunks(
			DEPTH,
			FINEST,
			VIEWER,
			RADIUS + 400,
			RADIUS,
		);
		let checked = 0;
		for (const direction of directions(400)) {
			// Well inside the horizon, so a direction on the rim is not what is
			// under test.
			if (direction.dot(VIEWER) < 0.75) continue;
			checked++;
			let covering = 0;
			for (const selection of chosen)
				if (holds(selection, direction)) covering++;
			expect(covering).toBe(1);
		}
		expect(checked).toBeGreaterThan(10);
	});

	it("draws the ground underfoot finer than the skyline", () => {
		const chosen = selectChunks(
			DEPTH,
			FINEST,
			VIEWER,
			RADIUS + 300,
			RADIUS,
		);
		const nearest = chosen[0]!;
		const furthest = chosen[chosen.length - 1]!;
		expect(nearest.distance).toBeLessThan(furthest.distance);
		expect(nearest.lod).toBeLessThan(furthest.lod);
	});

	it("takes the whole planet from far enough out", () => {
		const chosen = selectChunks(DEPTH, FINEST, VIEWER, RADIUS * 4, RADIUS);
		// Half the sphere and a little, at the coarsest levels, and few enough
		// to draw. Holding the chunk level fixed would give 20 * 4^FINEST.
		expect(chosen.length).toBeGreaterThan(10);
		expect(chosen.length).toBeLessThan(20 * 4 ** FINEST);
		for (const selection of chosen)
			expect(selection.chunkLevel).toBeLessThan(FINEST);
	});

	it("leaves the far side of the planet out", () => {
		const chosen = selectChunks(DEPTH, FINEST, VIEWER, RADIUS + 50, RADIUS);
		const away = VIEWER.scale(-1);
		for (const selection of chosen)
			expect(holds(selection, away)).toBe(false);
	});
});

describe("WorldShape.atLod", () => {
	const base = new WorldShape(RADIUS, DEPTH, 150, maxCrustDepth(DEPTH));

	it("doubles the cell and halves the layers each level", () => {
		for (let lod = 1; lod <= 4; lod++) {
			const at = base.atLod(lod);
			expect(at.subdivisionDepth).toBe(DEPTH - lod);
			expect(at.blockSize).toBeCloseTo(base.blockSize * 2 ** lod, 9);
			expect(at.crustDepth).toBe(Math.ceil(base.crustDepth / 2 ** lod));
		}
	});

	it("keeps every layer boundary a boundary at the finest level", () => {
		// A seam between two levels can only open horizontally, because both
		// agree about where every layer boundary is.
		for (let lod = 1; lod <= 4; lod++) {
			const at = base.atLod(lod);
			for (const layer of [0, 1, 5, 20]) {
				expect(at.radiusOfLayer(layer)).toBeCloseTo(
					base.radiusOfLayer(layer * 2 ** lod),
					9,
				);
			}
		}
	});

	it("returns itself at level 0", () => {
		expect(base.atLod(0)).toBe(base);
	});
});
