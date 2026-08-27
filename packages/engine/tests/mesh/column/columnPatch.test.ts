import { describe, expect, it } from "vitest";
import {
	CARVE_LAYER_DEFAULT,
	carveSeed,
	layerNoiseSettings,
} from "chamfer/generation";
import type { Carved, ColumnGround } from "chamfer/mesh";
import {
	PATCH_STRIDE,
	columnDepth,
	columnPatchLayout,
	columnPatchMesh,
	columnSpans,
	floatingRock,
	plainSpan,
} from "chamfer/mesh";
import { Vec3 } from "chamfer/math";

const AT = new Vec3(0.3, 0.7, 0.5).normalize();
const RADIUS = 1700;
const BLOCK = 1;

const layout = (level = 4, rings = 3) =>
	columnPatchLayout({ at: AT, level, rings });

describe("columnPatchLayout", () => {
	it("walks out ring by ring, and every column names itself once", () => {
		const patch = layout();
		expect(patch.count).toBeGreaterThan(0);
		const seen = new Set<string>();
		for (let c = 0; c < patch.count; c++)
			seen.add(`${patch.face[c]}/${patch.i[c]}/${patch.j[c]}`);
		expect(seen.size).toBe(patch.count);
	});

	/**
	 * **A ring walk on hexagons grows by six a ring**, so `1 + 3r(r + 1)` is
	 * what a patch away from a pentagon holds. Fewer means the walk stopped
	 * early or entered a column twice under a second name.
	 */
	it("holds the hexagonal disc the ring count asks for", () => {
		for (const rings of [1, 2, 3, 5]) {
			const patch = layout(6, rings);
			const disc = 1 + 3 * rings * (rings + 1);
			// A pentagon in reach costs the disc a few cells and never adds any.
			expect(patch.count).toBeLessThanOrEqual(disc);
			expect(patch.count).toBeGreaterThan(disc - 6 * rings);
		}
	});

	it("gives every column its own polygon and a ring that points back", () => {
		const patch = layout();
		for (let c = 0; c < patch.count; c++) {
			const deg = patch.degree[c]!;
			expect(deg === 5 || deg === 6).toBe(true);
			for (let d = 0; d < deg; d++) {
				const found = patch.ring[c * 6 + d]!;
				if (found < 0) continue;
				let back = false;
				for (let e = 0; e < 6; e++)
					if (patch.ring[found * 6 + e] === c) back = true;
				expect(back, `column ${c} direction ${d}`).toBe(true);
			}
		}
	});

	/** Corners are unit directions, because a cap is drawn at a radius. */
	it("puts every corner on the sphere", () => {
		const patch = layout();
		for (let c = 0; c < patch.count; c++)
			for (let m = 0; m < patch.degree[c]!; m++) {
				const at = c * 18 + m * 3;
				const len = Math.hypot(
					patch.corner[at]!,
					patch.corner[at + 1]!,
					patch.corner[at + 2]!,
				);
				expect(len).toBeCloseTo(1, 12);
			}
	});
});

describe("columnSpans", () => {
	const settings = layerNoiseSettings(CARVE_LAYER_DEFAULT, RADIUS);
	const seed = carveSeed(7);

	const walk = (surface: number): { out: number[]; carved: Carved } => {
		const out: number[] = [];
		const carved: Carved = { under: 0, above: 0, drowned: 0 };
		columnSpans(
			AT.x,
			AT.y,
			AT.z,
			surface,
			RADIUS,
			BLOCK,
			seed,
			CARVE_LAYER_DEFAULT,
			settings,
			out,
			carved,
		);
		return { out, carved };
	};

	it("hands back pairs, low to high, that never overlap", () => {
		const { out } = walk(120);
		expect(out.length % 2).toBe(0);
		expect(out.length).toBeGreaterThan(0);
		for (let p = 0; p < out.length; p += 2) {
			expect(out[p + 1]!).toBeGreaterThan(out[p]!);
			if (p > 0) expect(out[p]!).toBeGreaterThan(out[p - 1]!);
		}
	});

	/**
	 * **Below the carve's own reach nothing can be air**, whatever the field
	 * says: the density gains a full `1` over it. So the lowest span always
	 * starts at the bottom of the walk.
	 */
	it("leaves the bedrock under the carve solid", () => {
		const surface = 120;
		const { out } = walk(surface);
		const deep = columnDepth(CARVE_LAYER_DEFAULT, BLOCK);
		expect(out[0]!).toBeLessThanOrEqual(surface - deep + BLOCK);
	});

	/** Every block is on the layer grid, so two columns cut on the same planes. */
	it("cuts on the block grid and never between two layers", () => {
		const { out } = walk(83.4);
		for (const y of out)
			expect(Math.abs(y / BLOCK - Math.round(y / BLOCK))).toBeLessThan(
				1e-9,
			);
	});

	/**
	 * **The waterline holds the layer off.** At and below sea level the density
	 * is `1` outright, so a column whose whole surface is under water comes back
	 * as one unbroken span.
	 */
	it("carves nothing at or below the waterline", () => {
		const { out, carved } = walk(-40);
		expect(out.length).toBe(2);
		expect(carved.above + carved.under).toBe(0);
	});

	it("splits what it took into holes and lowered ground", () => {
		const { out, carved } = walk(200);
		const top = out.length > 0 ? out[out.length - 1]! : 0;
		// Everything above the topmost rock is ground that moved down; the rest
		// is a hole with rock still over it. Counted the way the walk counts
		// it: block middles between the top of the rock and the surface.
		let above = 0;
		for (let y = top + BLOCK / 2; y < 200; y += BLOCK) above++;
		expect(carved.above).toBe(above);
		expect(carved.under).toBeGreaterThanOrEqual(0);
	});

	it("gives one span on the block grid with the layer off", () => {
		const out: number[] = [];
		const top = plainSpan(83.4, BLOCK, CARVE_LAYER_DEFAULT, out);
		expect(top).toBe(83);
		expect(out).toEqual([83 - columnDepth(CARVE_LAYER_DEFAULT, BLOCK), 83]);
	});
});

/** A patch of flat ground, which is the one shape the mesh can be checked against. */
function flat(count: number, top: number, deep: number): ColumnGround {
	const at = new Int32Array(count + 1);
	const spans: number[] = [];
	const height = new Float64Array(count);
	for (let c = 0; c < count; c++) {
		at[c] = spans.length;
		spans.push(top - deep, top);
		height[c] = top;
	}
	at[count] = spans.length;
	return {
		at,
		spans: Float64Array.from(spans),
		height,
		raw: new Float32Array(count),
		continent: new Float32Array(count),
		erosion: new Float32Array(count),
		peaks: new Float32Array(count),
	};
}

describe("columnPatchMesh", () => {
	it("draws a cap a column and no wall between two columns at one height", () => {
		const patch = layout(4, 2);
		const mesh = columnPatchMesh(patch, flat(patch.count, 40, 100), {
			radius: RADIUS,
			seaLevel: 0,
		});
		expect(mesh.groundVertices % 3).toBe(0);
		let sides = 0;
		for (let c = 0; c < patch.count; c++)
			for (let d = 0; d < 6; d++)
				if (patch.ring[c * 6 + d]! < 0 && d < patch.degree[c]!) sides++;
		// One cap of `degree` triangles a column, plus two triangles for each
		// rim edge -- and nothing at all between two columns standing level.
		let caps = 0;
		for (let c = 0; c < patch.count; c++) caps += patch.degree[c]!;
		expect(mesh.groundVertices / 3).toBe(caps + sides * 2);
	});

	/** Flat ground above the water draws no sea at all. */
	it("draws water only where the ground is under it", () => {
		const patch = layout(4, 2);
		const dry = columnPatchMesh(patch, flat(patch.count, 40, 100), {
			radius: RADIUS,
			seaLevel: 0,
		});
		expect(dry.waterVertices).toBe(0);
		const wet = columnPatchMesh(patch, flat(patch.count, -40, 100), {
			radius: RADIUS,
			seaLevel: 0,
		});
		expect(wet.waterVertices).toBeGreaterThan(0);
		expect(wet.landShare).toBe(0);
	});

	/**
	 * **The water carries the ground under it, not the surface it is drawn at.**
	 * How much water a look passes through is what decides its colour, and the
	 * sheet is one radius everywhere -- so the depth has to ride on the vertex.
	 */
	it("gives a water vertex the ground's own height", () => {
		const patch = layout(4, 1);
		const mesh = columnPatchMesh(patch, flat(patch.count, -40, 100), {
			radius: RADIUS,
			seaLevel: 0,
		});
		for (let v = mesh.groundVertices; v < mesh.groundVertices + 3; v++)
			expect(mesh.vertices[v * PATCH_STRIDE + 6]).toBeCloseTo(-40, 4);
	});

	it("writes a whole vertex for every triangle corner", () => {
		const patch = layout(4, 1);
		const mesh = columnPatchMesh(patch, flat(patch.count, 40, 100), {
			radius: RADIUS,
			seaLevel: 0,
		});
		expect(mesh.vertices.length).toBe(
			(mesh.groundVertices + mesh.waterVertices) * PATCH_STRIDE,
		);
		for (let v = 0; v < mesh.groundVertices; v++) {
			const at = v * PATCH_STRIDE;
			const len = Math.hypot(
				mesh.vertices[at + 3]!,
				mesh.vertices[at + 4]!,
				mesh.vertices[at + 5]!,
			);
			expect(len).toBeCloseTo(1, 4);
		}
	});
});

describe("floatingRock", () => {
	it("calls every column's lowest span ground", () => {
		const patch = layout(4, 2);
		const found = floatingRock(patch, flat(patch.count, 40, 100), BLOCK);
		expect(found).toEqual({ masses: 0, spans: 0 });
	});

	/**
	 * **A floating island is a question a column cannot answer.** One span with
	 * air under it, touching nothing that reaches the bedrock, is hanging --
	 * and a patch of them all at one height is one mass rather than many.
	 */
	it("finds a slab that touches nothing on the ground", () => {
		const patch = layout(4, 2);
		const count = patch.count;
		const at = new Int32Array(count + 1);
		const spans: number[] = [];
		const height = new Float64Array(count);
		for (let c = 0; c < count; c++) {
			at[c] = spans.length;
			spans.push(-100, 0);
			// Every column carries a slab well clear of the ground, and the
			// slabs touch each other.
			spans.push(60, 64);
			height[c] = 64;
		}
		at[count] = spans.length;
		const ground: ColumnGround = {
			at,
			spans: Float64Array.from(spans),
			height,
			raw: new Float32Array(count),
			continent: new Float32Array(count),
			erosion: new Float32Array(count),
			peaks: new Float32Array(count),
		};
		const found = floatingRock(patch, ground, BLOCK);
		expect(found.masses).toBe(1);
		expect(found.spans).toBe(count);
	});
});
