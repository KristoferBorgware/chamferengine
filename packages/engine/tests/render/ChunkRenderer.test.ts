import { describe, expect, it } from "vitest";
import { ChunkRenderer } from "chamfer/render";
import { Mat4, Vec3, type Box } from "chamfer/math";
import type { ChunkMesh } from "chamfer/mesh";
import type { Frame } from "chamfer/render";
import { RecordingGpu } from "./recordingGpu.js";

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
	sunLight: 1,
	skyShading: 1,
	skyLight: 1,
	fullbright: 0,
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
		renderer.upload(mesh(1));

		renderer.render(FRAME);

		const draws = gpu.draws();
		expect(draws.length).toBeGreaterThan(0);
		for (const drawn of draws)
			for (let group = 0; group < drawn.groups; group++)
				expect(drawn.bound.has(group)).toBe(true);
	});

	it("draws the ground first, then the air and the tone curve over it", () => {
		const gpu = new RecordingGpu();
		const ctx = gpu.context;
		const renderer = new ChunkRenderer(ctx);
		// The glare is its own chain of full-screen draws between the two, and
		// this is about where the world's own geometry falls against them.
		renderer.bloom.enabled = false;
		renderer.upload(mesh(1));

		renderer.render(FRAME);

		const kinds = gpu.commands
			.filter((c) => c.what === "draw" || c.what === "drawIndexed")
			.map((c) => c.what);
		// The two full-screen passes come last and in this order -- the air
		// marched over the finished frame, then the tone curve over that --
		// because the air has to be in the picture before it is exposed. Every
		// indexed draw before them is the ground's own geometry, opaque then
		// water, with no separate sky layer standing behind it any more.
		expect(kinds[kinds.length - 2]).toBe("draw");
		expect(kinds[kinds.length - 1]).toBe("draw");
		expect(kinds.slice(0, -2).every((kind) => kind === "drawIndexed")).toBe(
			true,
		);
		expect(kinds.length).toBeGreaterThan(2);
	});

	describe("the two screen-space terms", () => {
		/** One frame's draws, split into geometry and full-screen passes. */
		function count(tune: (renderer: ChunkRenderer) => void) {
			const gpu = new RecordingGpu();
			const renderer = new ChunkRenderer(gpu.context);
			renderer.bloom.enabled = false;
			tune(renderer);
			renderer.upload(mesh(1));
			renderer.render(FRAME);
			const kinds = gpu.commands
				.filter((c) => c.what === "draw" || c.what === "drawIndexed")
				.map((c) => c.what);
			return {
				geometry: kinds.filter((k) => k === "drawIndexed").length,
				screen: kinds.filter((k) => k === "draw").length,
				draws: gpu.draws(),
			};
		}

		it("costs nothing at all while both are off", () => {
			// They ship off, and off has to mean the frame this renderer drew
			// before either existed -- not a pass that runs and returns 1.
			const off = count(() => {});
			const bare = count((r) => {
				r.ssaoOn = false;
				r.ssgiOn = false;
			});
			expect(off.geometry).toBe(bare.geometry);
			expect(off.screen).toBe(bare.screen);
		});

		it("draws the geometry a second time for SSAO", () => {
			// **This is what the occlusion costs**, and the reason it is a
			// switch rather than always on: the sky's share is decided while
			// the world is being drawn, so where the geometry is has to be
			// known before that pass, which means finding out twice.
			const off = count(() => {});
			const on = count((r) => {
				r.ssaoOn = true;
			});
			expect(on.geometry).toBe(off.geometry + 1);
			// Occlusion, then the blur that makes it usable.
			expect(on.screen).toBe(off.screen + 2);
		});

		it("adds SSGI without drawing the geometry again", () => {
			// The bounce gathers from the lit colour the world pass already
			// wrote, so it needs no second look at the geometry -- which is
			// the whole difference between the two in what they cost.
			const off = count(() => {});
			const on = count((r) => {
				r.ssgiOn = true;
			});
			expect(on.geometry).toBe(off.geometry);
			// Gather, blur, and add it back over the frame.
			expect(on.screen).toBe(off.screen + 3);
		});

		it("still binds every group a draw declares, with both on", () => {
			// The occlusion joins the group the shadows already share, so
			// switching it on changes what every terrain pipeline reads. One
			// unbound group refuses the whole command buffer.
			const { draws } = count((r) => {
				r.ssaoOn = true;
				r.ssgiOn = true;
			});
			expect(draws.length).toBeGreaterThan(0);
			for (const drawn of draws)
				for (let group = 0; group < drawn.groups; group++)
					expect(drawn.bound.has(group)).toBe(true);
		});
	});

	it("blurs the glare down a chain and back up again, once bloom is on", () => {
		// Every level halves, so the chain is a fixed shape rather than a
		// number worth pinning: down to the smallest level and back up, plus
		// the one that lays the result over the picture it came from.
		const gpu = new RecordingGpu();
		const ctx = gpu.context;
		const renderer = new ChunkRenderer(ctx);
		renderer.upload(mesh(1));

		renderer.render(FRAME);
		const withGlare = gpu.draws().length;

		const bare = new RecordingGpu();
		const plain = new ChunkRenderer(bare.context);
		plain.bloom.enabled = false;
		plain.upload(mesh(1));
		plain.render(FRAME);

		// A chain that goes down and back up is an even number of steps, and
		// it is the only thing between the two runs.
		const added = withGlare - bare.draws().length;
		expect(added).toBeGreaterThan(2);
		expect(added % 2).toBe(0);
	});

	it("skips a chunk the camera is not looking at", () => {
		// A chunk out of view stays resident and goes undrawn. Dropping it
		// instead would put a hole in the world every time someone turned:
		// turning is instant and building a chunk is not.
		const gpu = new RecordingGpu();
		const ctx = gpu.context;
		const renderer = new ChunkRenderer(ctx);
		renderer.bloom.enabled = false;
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

	it("draws nothing but the air and the tone pass when no chunk is resident", () => {
		const gpu = new RecordingGpu();
		const ctx = gpu.context;
		const renderer = new ChunkRenderer(ctx);
		renderer.bloom.enabled = false;

		renderer.render(FRAME);

		// The air marched over the empty frame, and the tone pass that puts it
		// on the canvas -- there is no separate sky layer to draw first.
		const draws = gpu.draws();
		expect(draws.length).toBe(2);
		expect(draws[0]!.bound.has(0)).toBe(true);
	});
});
