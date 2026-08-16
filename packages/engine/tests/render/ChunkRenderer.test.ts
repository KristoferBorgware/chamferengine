import { describe, expect, it } from "vitest";
import { ChunkRenderer, SkyRenderer } from "chamfer/render";
import { Mat4, Vec3 } from "chamfer/math";
import type { ChunkMesh } from "chamfer/mesh";
import type { Frame } from "chamfer/render";
import { RecordingGpu } from "./recordingGpu.js";

const VIEW_PROJ = Mat4.perspective(1, 1.6, 0.1, 4000);

const FRAME: Frame = {
	viewProj: VIEW_PROJ,
	eye: [0, 0, 1700],
	sun: [0, 1, 0],
	fog: [0, 0, 0, 1e9],
	daylight: 1,
	nightLight: 0.09,
};

/** One chunk's worth of geometry, with a triangle in each of the two buffers. */
function mesh(key: number): ChunkMesh {
	const geometry = () => ({
		vertices: new Float32Array(3 * 6),
		indices: new Uint32Array([0, 1, 2]),
		cellCount: 1,
		triangleCount: 1,
	});
	return {
		key,
		origin: new Vec3(0, 0, 1700),
		opaque: geometry(),
		translucent: geometry(),
		tally: { cells: 1, faces: 2, merged: 0 },
	};
}

describe("what a frame encodes", () => {
	it("binds every group a draw's pipeline declares", () => {
		// WebGPU refuses a draw whose pipeline declares a group that is not
		// bound, and one refused command invalidates the whole buffer -- so a
		// single unbound group anywhere in a frame draws nothing at all, not
		// just the one thing that was missing it.
		const gpu = new RecordingGpu();
		const ctx = gpu.context;
		const renderer = new ChunkRenderer(ctx);
		const sky = new SkyRenderer(ctx, {
			direction: new Vec3(0, 1, 0),
			angularRadius: 0.01,
		});
		sky.inverseViewProj = VIEW_PROJ.inverse();
		sky.setClouds(new Float32Array(4 * 3), new Uint32Array([0, 1, 2]));
		renderer.layer = sky;
		renderer.upload(mesh(1));

		renderer.render(FRAME);

		const draws = gpu.draws();
		expect(draws.length).toBeGreaterThan(0);
		for (const drawn of draws)
			for (let group = 0; group < drawn.groups; group++)
				expect(drawn.bound.has(group)).toBe(true);
	});

	it("draws the sky before the ground and the clouds after it", () => {
		const gpu = new RecordingGpu();
		const ctx = gpu.context;
		const renderer = new ChunkRenderer(ctx);
		const sky = new SkyRenderer(ctx, {
			direction: new Vec3(0, 1, 0),
			angularRadius: 0.01,
		});
		sky.inverseViewProj = VIEW_PROJ.inverse();
		sky.setClouds(new Float32Array(4 * 3), new Uint32Array([0, 1, 2]));
		renderer.layer = sky;
		renderer.upload(mesh(1));

		renderer.render(FRAME);

		const kinds = gpu.commands
			.filter((c) => c.what === "draw" || c.what === "drawIndexed")
			.map((c) => c.what);
		// The sky is the unindexed one: three vertices covering the screen.
		expect(kinds[0]).toBe("draw");
		expect(kinds[kinds.length - 1]).toBe("drawIndexed");
		expect(kinds.length).toBe(4);
	});

	it("draws nothing but the sky when no chunk is resident", () => {
		const gpu = new RecordingGpu();
		const ctx = gpu.context;
		const renderer = new ChunkRenderer(ctx);
		const sky = new SkyRenderer(ctx, {
			direction: new Vec3(0, 1, 0),
			angularRadius: 0.01,
		});
		sky.inverseViewProj = VIEW_PROJ.inverse();
		renderer.layer = sky;

		renderer.render(FRAME);

		const draws = gpu.draws();
		expect(draws.length).toBe(1);
		expect(draws[0]!.bound.has(0)).toBe(true);
	});
});
