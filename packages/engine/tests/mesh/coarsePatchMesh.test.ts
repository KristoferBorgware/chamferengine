import { describe, expect, it } from "vitest";
import {
	CoarseGrid,
	layerNoise,
	seedFromString,
	shapeLayers,
} from "chamfer/generation";
import {
	PATCH_STRIDE,
	coarsePatchMesh,
	patchLayout,
	patchVertices,
} from "chamfer/mesh";
import { Vec3 } from "chamfer/math";
import { positionOf } from "chamfer/coordinates";

const LEVEL = 5;
const grid = new CoarseGrid(LEVEL);
const noise = layerNoise(grid, seedFromString("chamfer"), { level: LEVEL });
const place = {
	at: (() => {
		const p = positionOf({ latitude: 45, longitude: 20, altitude: 0 }, 1);
		return new Vec3(p.x, p.y, p.z);
	})(),
	cells: 24,
	radius: 6801,
};

/** One world, as the four fields a patch is drawn from. */
function ground(
	relief: number,
	seaLevel = 0,
): {
	height: Float32Array;
	raw: Float32Array;
	terrain: Float32Array;
	mountain: Float32Array;
} {
	// **No erosion bite, so draining is a drain.** Erosion wears land toward
	// the waterline, so moving the waterline with the bite on moves how far
	// each place is worn as well as where the water is -- which is right, and
	// not the thing this file is about.
	const field = shapeLayers(noise, { relief, seaLevel, erosionBite: 0 });
	return {
		height: Float32Array.from(field.raw),
		raw: Float32Array.from(field.raw),
		terrain: field.continent,
		mountain: field.peaks,
	};
}

describe("the two halves of the patch", () => {
	const tall = ground(1100);
	const flat = ground(300);

	// Draining the sea lifts every height by one number and leaves the shape
	// alone, which is the one change that is guaranteed to move every vertex
	// of a patch whether it stands on land or on the sea floor.
	const drained = ground(1100, -60);

	it("draws something to compare", () => {
		const patch = coarsePatchMesh(grid, { ...place, ...tall });
		expect(patch.cellCount).toBeGreaterThan(100);
		expect(patch.triangleCount).toBeGreaterThan(600);
		// Every cell puts down its middle and its rim, so a hexagon is seven
		// vertices and a pentagon six.
		const vertices = patch.vertices.length / PATCH_STRIDE;
		expect(vertices).toBeLessThanOrEqual(patch.cellCount * 7);
		expect(vertices).toBeGreaterThanOrEqual(patch.cellCount * 6);
	});

	/**
	 * The whole point of holding a layout: a patch that has not moved is filled
	 * again rather than found again, and what comes out has to be what a fresh
	 * build gives -- exactly, not nearly.
	 */
	it("fills a held layout into the same mesh a fresh build makes", () => {
		const layout = patchLayout(grid, place);
		patchVertices(layout, tall);
		const again = patchVertices(layout, flat);
		const fresh = coarsePatchMesh(grid, { ...place, ...flat });
		expect(again.vertices.length).toBe(fresh.vertices.length);
		for (let at = 0; at < fresh.vertices.length; at++)
			expect(again.vertices[at]).toBe(fresh.vertices[at]);
		expect(again.lowest).toBe(fresh.lowest);
		expect(again.highest).toBe(fresh.highest);
		expect(again.rawLow).toBe(fresh.rawLow);
		expect(again.rawHigh).toBe(fresh.rawHigh);
		expect(again.landShare).toBe(fresh.landShare);
		expect([...layout.indices]).toEqual([...fresh.indices]);
		expect([...layout.lines]).toEqual([...fresh.lines]);
	});

	/**
	 * **A normal pointing into the ground is a surface no light reaches.** A
	 * cell's rim is wound counter-clockwise as seen from outside the sphere, in
	 * east and north, and a patch vertex is laid out as `(east, up, north)` --
	 * which swaps two axes and flips the handedness. Taken the wrong way round,
	 * every land normal came out more than 90 degrees from vertical, the sun's
	 * dot product clamped to zero over the whole surface, and the preview was
	 * lit by its ambient term alone.
	 */
	it("points its normals at the sky", () => {
		const layout = patchLayout(grid, place);
		const fill = patchVertices(layout, tall);
		let up = 0;
		let down = 0;
		for (let v = 0; v < layout.of.length; v++) {
			const y = fill.vertices[v * PATCH_STRIDE + 4]!;
			if (y > 0) up++;
			else down++;
		}
		expect(down).toBe(0);
		expect(up).toBe(layout.of.length);

		// And a normal is a unit vector, because the light divides by nothing.
		for (let v = 0; v < layout.of.length; v += 37) {
			const at = v * PATCH_STRIDE;
			const x = fill.vertices[at + 3]!;
			const y = fill.vertices[at + 4]!;
			const z = fill.vertices[at + 5]!;
			expect(Math.sqrt(x * x + y * y + z * z)).toBeCloseTo(1, 5);
		}
	});

	it("moves the ground and nothing else", () => {
		const layout = patchLayout(grid, place);
		const high = patchVertices(layout, tall);
		const low = patchVertices(layout, drained);
		let moved = 0;
		for (let v = 0; v < layout.of.length; v++) {
			const at = v * PATCH_STRIDE;
			// East and north are laid out, never filled.
			expect(low.vertices[at]).toBe(high.vertices[at]);
			expect(low.vertices[at + 2]).toBe(high.vertices[at + 2]);
			if (low.vertices[at + 1] !== high.vertices[at + 1]) moved++;
		}
		expect(moved).toBe(layout.of.length);
		expect(low.highest).toBeCloseTo(high.highest + 60, 3);
	});
});
