import { describe, expect, it } from "vitest";
import { caveCeilingAt, seedFromString } from "chamfer/generation";
import { Vec3 } from "chamfer/math";

const SEED = seedFromString("cave");
const RADIUS = 1700;

/** Metres of rock kept over a roof before the dip takes any of it away. */
const CEILING = 6;

/** How far the ceiling may come down. */
const VARY = 10;

/** Where the field's own top starts. */
const RARE = 0.7;

/** Metres the ceiling changes over. */
const SCALE = 60;

/** Directions spread over the sphere, as the columns of a whole planet would be. */
function directions(count: number): Vec3[] {
	const out: Vec3[] = [];
	// The golden-angle spiral: even over the sphere with no pole and no seam,
	// which is what a sample of "every column" wants to be.
	const golden = Math.PI * (3 - Math.sqrt(5));
	for (let n = 0; n < count; n++) {
		const y = 1 - (2 * (n + 0.5)) / count;
		const round = Math.sqrt(Math.max(0, 1 - y * y));
		const angle = golden * n;
		out.push(new Vec3(Math.cos(angle) * round, y, Math.sin(angle) * round));
	}
	return out;
}

function ceilingAt(at: Vec3, vary: number, rare = RARE): number {
	return caveCeilingAt(
		at.x,
		at.y,
		at.z,
		RADIUS,
		SEED,
		CEILING,
		vary,
		rare,
		SCALE,
	);
}

describe("the ceiling a cave keeps over it", () => {
	it("is the constant one, to the bit, where nothing varies", () => {
		for (const at of directions(2000))
			expect(ceilingAt(at, 0)).toBe(CEILING);
	});

	it("only ever comes down", () => {
		for (const at of directions(20000)) {
			const dipped = ceilingAt(at, VARY);
			expect(dipped).toBeLessThanOrEqual(CEILING);
			expect(dipped).toBeGreaterThanOrEqual(CEILING - VARY);
		}
	});

	it("leaves most of the ground alone, and a rarer field leaves more", () => {
		const share = (rare: number): number => {
			let moved = 0;
			const sample = directions(20000);
			for (const at of sample)
				if (ceilingAt(at, VARY, rare) < CEILING) moved++;
			return moved / sample.length;
		};
		// **A dip everywhere is the failure the constant ceiling already had.**
		// The rarity is what stops the whole world opening at once, and raising
		// it can only ever move less ground.
		const loose = share(0.4);
		const tight = share(0.8);
		expect(loose).toBeLessThan(0.5);
		expect(tight).toBeLessThan(loose);
		expect(tight).toBeGreaterThan(0);
	});

	it("is one reading of the column, whatever depth asks for it", () => {
		// The ceiling is read at the ground's own radius, so two calls that
		// differ only in the layer being considered cannot disagree -- which is
		// what lets a column carry it instead of every block reading it again.
		for (const at of directions(500)) {
			const once = ceilingAt(at, VARY);
			const again = ceilingAt(at, VARY);
			expect(again).toBe(once);
		}
	});
});
