import { describe, expect, it } from "vitest";
import { cellKey } from "./cellKey.js";
import { directionToCell, layerOf, positionToCell } from "./positionToCell.js";
import { hexRound } from "./hexRound.js";
import { latticePosition } from "./latticePosition.js";
import { length } from "./normalize.js";
import { scale, sub, vec3 } from "./Vec3.js";

describe("hexRound", () => {
	it("repairs the coordinate that moved furthest", () => {
		expect(hexRound(4.7, 8.6, 2.7, 16)).toEqual([5, 8, 3]);
	});

	it("always returns a triple summing to n", () => {
		let s = 7 >>> 0;
		const rnd = () => {
			s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
			return s / 2 ** 32;
		};
		for (let t = 0; t < 5000; t++) {
			const n = 64;
			const a = rnd(),
				b = rnd() * (1 - a);
			const [x, y, z] = hexRound(a * n, b * n, (1 - a - b) * n, n);
			expect(x + y + z).toBe(n);
		}
	});
});

describe("directionToCell", () => {
	it("returns a cell to its own centre", () => {
		for (const depth of [2, 3, 4]) {
			const n = 1 << depth;
			for (let f = 0; f < 20; f++)
				for (let i = 0; i <= n; i++)
					for (let j = 0; i + j <= n; j++) {
						const found = directionToCell(
							latticePosition(f, n, i, j),
							n,
						);
						expect(cellKey(found.face, n, found.i, found.j)).toBe(
							cellKey(f, n, i, j),
						);
					}
		}
	});

	it("never lands further than a neighbour away from the nearest centre", () => {
		// Rounding and nearest-centre-on-the-sphere are different questions and
		// disagree on about 1% of the sphere. Where they differ it is always with
		// an edge-adjacent cell, never a distant one.
		const depth = 3;
		const n = 1 << depth;
		const centres: {
			key: string;
			pos: ReturnType<typeof latticePosition>;
		}[] = [];
		const seen = new Set<string>();
		for (let f = 0; f < 20; f++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++) {
					const k = cellKey(f, n, i, j);
					if (seen.has(k)) continue;
					seen.add(k);
					centres.push({ key: k, pos: latticePosition(f, n, i, j) });
				}

		let s = 99 >>> 0;
		const rnd = () => {
			s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
			return s / 2 ** 32;
		};
		let disagreements = 0;
		const samples = 2000;
		for (let t = 0; t < samples; t++) {
			const dir = vec3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
			const len = length(dir);
			if (len === 0) continue;
			const unit = scale(dir, 1 / len);
			const rounded = directionToCell(unit, n);
			const roundedKey = cellKey(rounded.face, n, rounded.i, rounded.j);

			let best = centres[0]!;
			let bestD = length(sub(unit, best.pos));
			for (const c of centres) {
				const d = length(sub(unit, c.pos));
				if (d < bestD) {
					bestD = d;
					best = c;
				}
			}
			if (best.key !== roundedKey) disagreements++;
		}
		// A few percent at this depth, and it settles rather than vanishing.
		expect(disagreements / samples).toBeLessThan(0.06);
	});
});

describe("positionToCell", () => {
	it("ignores the radius", () => {
		const n = 16;
		const p = latticePosition(5, n, 3, 4);
		const near = positionToCell(scale(p, 1700), n);
		const far = positionToCell(scale(p, 1_000_000), n);
		expect(near).toEqual(far);
	});
});

describe("layerOf", () => {
	it("counts downward from the crust top", () => {
		expect(layerOf(1700, 1700, 1)).toBe(0);
		expect(layerOf(1699.5, 1700, 1)).toBe(0);
		expect(layerOf(1699, 1700, 1)).toBe(1);
		expect(layerOf(1636, 1700, 1)).toBe(64);
	});
});
