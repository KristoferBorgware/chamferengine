import { describe, expect, it } from "vitest";
import { ChunkRenderer, SkyRenderer } from "chamfer/render";
import { Mat4, Vec3, type Box } from "chamfer/math";
import type { ChunkMesh } from "chamfer/mesh";
import type { Frame } from "chamfer/render";
import { planetAtmosphere } from "chamfer/sky";
import { RecordingGpu } from "./recordingGpu.js";

const AIR = planetAtmosphere(1700, 400, 0.134);

/** A camera standing sixty metres out, looking down at the surface. */
const EYE: [number, number, number] = [0, 0, 1760];
const VIEW_PROJ = Mat4.perspective(1, 1.6, 0.1, 4000).multiply(
	Mat4.lookAt(EYE, [0, 0, 1700], [0, 1, 0]),
);

const FRAME: Frame = {
	viewProj: VIEW_PROJ,
	eye: EYE,
	sun: [0, 1, 0],
	fog: [0, 0, 0, 1e9],
	daylight: 1,
	nightLight: 0.09,
	sunShare: 0.58,
	moon: [0, -1, 0],
	moonLight: 0.16,
	exposure: 1,
};

/** One chunk's worth of geometry, with a triangle in each of the two buffers. */
/** A cube on the world axes, which is every bound these tests need. */
function ball(center: [number, number, number], half: number): Box {
	return {
		center,
		axes: [
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
		],
		halves: [half, half, half],
	};
}

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
		bound: ball([0, 0, 1700], 20),
		opaque: geometry(),
		translucent: geometry(),
		tally: { cells: 1, faces: 2, merged: 0, apron: 0 },
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
		renderer.layers = [sky];
		renderer.upload(mesh(1));

		renderer.render(FRAME);

		const draws = gpu.draws();
		expect(draws.length).toBeGreaterThan(0);
		for (const drawn of draws)
			for (let group = 0; group < drawn.groups; group++)
				expect(drawn.bound.has(group)).toBe(true);
	});

	it("draws the sky first, behind everything the ground puts over it", () => {
		const gpu = new RecordingGpu();
		const ctx = gpu.context;
		const renderer = new ChunkRenderer(ctx);
		const sky = new SkyRenderer(ctx, {
			direction: new Vec3(0, 1, 0),
			angularRadius: 0.01,
		});
		sky.inverseViewProj = VIEW_PROJ.inverse();
		renderer.layers = [sky];
		renderer.upload(mesh(1));

		renderer.render(FRAME);

		const kinds = gpu.commands
			.filter((c) => c.what === "draw" || c.what === "drawIndexed")
			.map((c) => c.what);
		// The sky is the unindexed one: three vertices covering the screen,
		// drawn before any of the indexed geometry that stands in front of it.
		// The last two are full-screen again and in this order -- the air
		// marched over the finished frame, then the tone curve over that --
		// because the air has to be in the picture before it is exposed.
		expect(kinds[0]).toBe("draw");
		expect(kinds[kinds.length - 2]).toBe("draw");
		expect(kinds[kinds.length - 1]).toBe("draw");
		expect(kinds.slice(1, -2).every((kind) => kind === "drawIndexed")).toBe(
			true,
		);
		expect(kinds.length).toBeGreaterThan(3);
	});

	it("skips a chunk the camera is not looking at", () => {
		// A chunk out of view stays resident and goes undrawn. Dropping it
		// instead would put a hole in the world every time someone turned:
		// turning is instant and building a chunk is not.
		const gpu = new RecordingGpu();
		const ctx = gpu.context;
		const renderer = new ChunkRenderer(ctx);
		renderer.upload(mesh(1));
		// Behind the camera: it looks inward from 1760 toward the surface.
		renderer.upload({ ...mesh(2), bound: ball([0, 0, 2400], 20) });

		renderer.render(FRAME);

		expect(renderer.count).toBe(2);
		expect(renderer.drawn).toBe(1);
		// One opaque and one water buffer, from the one chunk in view, and
		// the air and the tone curve over the screen after them.
		expect(gpu.draws().length).toBe(4);
	});

	it("culls against a frozen matrix while drawing with the live one", () => {
		// The whole point of freezing a view: what is drawn is what *that*
		// camera could see, from a camera that has since moved. Without this
		// the decision is invisible, because flying out of it re-takes it.
		const gpu = new RecordingGpu();
		const ctx = gpu.context;
		const renderer = new ChunkRenderer(ctx);
		renderer.upload(mesh(1));

		// Turned right round, away from the one chunk there is.
		const turned = Mat4.perspective(1, 1.6, 0.1, 4000).multiply(
			Mat4.lookAt(EYE, [0, 0, 2400], [0, 1, 0]),
		);

		renderer.render({
			...FRAME,
			viewProj: turned,
			cullViewProj: VIEW_PROJ,
		});
		expect(renderer.drawn).toBe(1);

		// The same frame with nothing frozen draws nothing, which is what says
		// the frozen matrix was the one read.
		renderer.render({ ...FRAME, viewProj: turned });
		expect(renderer.drawn).toBe(0);
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
		renderer.layers = [sky];

		renderer.render(FRAME);

		// The sky, the air marched over it, and the tone pass that puts the
		// two on the canvas.
		const draws = gpu.draws();
		expect(draws.length).toBe(3);
		expect(draws[0]!.bound.has(0)).toBe(true);
	});
});
