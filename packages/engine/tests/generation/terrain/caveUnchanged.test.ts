import { describe, expect, it } from "vitest";
import { NoiseCorners, caveDensity, caveField } from "chamfer/generation";
import { Vec3 } from "chamfer/math";

const RADIUS = 6801;
const SCALE = 24;
const THRESHOLD = 0.12;
const CEILING = 6;
const REACH = 200;
const SEED = 977261;

/** Directions spread over the whole sphere, so the sample is not one place. */
function everywhere(count: number): Vec3[] {
	const golden = Math.PI * (3 - Math.sqrt(5));
	const out: Vec3[] = [];
	for (let n = 0; n < count; n++) {
		const y = 1 - (2 * n + 1) / count;
		const ring = Math.sqrt(Math.max(0, 1 - y * y));
		out.push(
			new Vec3(
				Math.cos(n * golden) * ring,
				y,
				Math.sin(n * golden) * ring,
			).normalize(),
		);
	}
	return out;
}

/** The definition the shortcut must match: the field against its band. */
function plain(dir: Vec3, depth: number): boolean {
	if (depth < CEILING || depth > REACH) return false;
	const n = caveField(dir.x, dir.y, dir.z, RADIUS - depth, SEED, SCALE);
	return n > -THRESHOLD && n < THRESHOLD;
}

// `caveDensity` no longer calls `caveField`: it runs the same three octaves in
// the same order itself, holds the third back where the first two already
// settle the answer, and reads each octave through a corner memo when handed
// one. All of that is only allowed to be a way of arriving at the same
// boolean, so this walks real columns and random points and holds it to the
// definition -- memo and no memo, in order and out of it.
describe("the cave walk's shortcuts change no block", () => {
	it("matches the field's own band down whole columns, memo or not", () => {
		const corners = new NoiseCorners(3);
		let open = 0;
		for (const dir of everywhere(400)) {
			for (let depth = 0; depth <= REACH + 4; depth++) {
				const want = plain(dir, depth);
				const bare = caveDensity(
					dir.x,
					dir.y,
					dir.z,
					RADIUS - depth,
					depth,
					SEED,
					SCALE,
					THRESHOLD,
					CEILING,
					REACH,
				);
				const memoed = caveDensity(
					dir.x,
					dir.y,
					dir.z,
					RADIUS - depth,
					depth,
					SEED,
					SCALE,
					THRESHOLD,
					CEILING,
					REACH,
					corners,
				);
				expect(bare).toBe(want);
				expect(memoed).toBe(want);
				if (want) open++;
			}
		}
		// The walk found real passages, or the test proved nothing.
		expect(open).toBeGreaterThan(1000);
	});

	it("matches at points visited in no order at all", () => {
		const corners = new NoiseCorners(3);
		let state = 20260831;
		const next = (): number => {
			state = (state * 1103515245 + 12345) & 0x7fffffff;
			return state / 0x7fffffff;
		};
		for (let n = 0; n < 20000; n++) {
			const z = next() * 2 - 1;
			const phi = next() * Math.PI * 2;
			const ring = Math.sqrt(Math.max(0, 1 - z * z));
			const dir = new Vec3(Math.cos(phi) * ring, z, Math.sin(phi) * ring);
			const depth = CEILING + next() * (REACH - CEILING);
			const want = plain(dir, depth);
			expect(
				caveDensity(
					dir.x,
					dir.y,
					dir.z,
					RADIUS - depth,
					depth,
					SEED,
					SCALE,
					THRESHOLD,
					CEILING,
					REACH,
					corners,
				),
			).toBe(want);
		}
	});
});
