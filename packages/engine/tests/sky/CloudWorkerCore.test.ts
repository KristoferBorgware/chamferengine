import { describe, expect, it } from "vitest";
import { CloudField, CloudWorkerCore, buildCloudMesh } from "chamfer/sky";
import { Vec3 } from "chamfer/math";

const SEED = 91;
const AXIS = new Vec3(0.31, 0.87, 0.38).normalize();

function setup() {
	return {
		kind: "setup",
		seed: SEED,
		decks: [
			{
				level: 3,
				shells: 3,
				baseRadius: 1920,
				shellSpan: 15,
				featureSize: 60,
			},
			{
				level: 3,
				shells: 4,
				baseRadius: 2400,
				shellSpan: 20,
				featureSize: 60,
			},
		],
	} as const;
}

/** What the calling thread would have produced for one deck. */
function here(
	level: number,
	shells: number,
	baseRadius: number,
	shellSpan: number,
	featureSize: number,
	angle: number,
) {
	const field = new CloudField(level, shells);
	field.blow(AXIS, angle, SEED, baseRadius, shellSpan, featureSize);
	return buildCloudMesh(field, baseRadius, shellSpan);
}

describe("CloudWorkerCore", () => {
	it("produces what the calling thread would have produced, both decks concatenated", () => {
		const core = new CloudWorkerCore(setup());
		const result = core.run({
			kind: "blow",
			id: 1,
			angle: 0.4,
			axis: [AXIS.x, AXIS.y, AXIS.z],
		});

		const low = here(3, 3, 1920, 15, 60, 0.4);
		const high = here(3, 4, 2400, 20, 60, 0.4);

		expect(result.puffs).toBe(low.puffs + high.puffs);
		expect(result.vertices.length).toBe(
			low.vertices.length + high.vertices.length,
		);
		expect(result.indices.length).toBe(
			low.indices.length + high.indices.length,
		);
		// The low deck's own indices are unshifted; the high deck's start
		// after the low deck's vertices.
		expect(result.indices.slice(0, low.indices.length)).toEqual(
			low.indices,
		);
	});

	it("hands back exactly the two buffers a caller transfers", () => {
		const core = new CloudWorkerCore(setup());
		const result = core.run({
			kind: "blow",
			id: 2,
			angle: 0,
			axis: [AXIS.x, AXIS.y, AXIS.z],
		});
		const buffers = CloudWorkerCore.buffers(result);
		expect(buffers.length).toBe(2);
		expect(new Set(buffers).size).toBe(2);
	});

	it("refills in place: two jobs on one core do not accumulate geometry", () => {
		const core = new CloudWorkerCore(setup());
		const first = core.run({
			kind: "blow",
			id: 1,
			angle: 0,
			axis: [AXIS.x, AXIS.y, AXIS.z],
		});
		const second = core.run({
			kind: "blow",
			id: 2,
			angle: 0,
			axis: [AXIS.x, AXIS.y, AXIS.z],
		});
		expect(second.vertices.length).toBe(first.vertices.length);
		expect(second.puffs).toBe(first.puffs);
	});
});
