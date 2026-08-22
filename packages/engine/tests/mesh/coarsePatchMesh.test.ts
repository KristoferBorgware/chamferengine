import { describe, expect, it } from "vitest";
import {
	CoarseGrid,
	layerNoise,
	metreHeight,
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
	const field = shapeLayers(noise, {});
	return {
		height: Float32Array.from(
			metreHeight(field.raw, {
				landFraction: 0.65,
				relief,
				seaDepth: 130,
				seaLevel,
			}),
		),
		raw: Float32Array.from(field.raw),
		terrain: field.terrain,
		mountain: field.mountain,
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
