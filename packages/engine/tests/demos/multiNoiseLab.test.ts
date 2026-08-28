import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	hash3,
	octaveNoise,
	seedFromString,
	valueNoise3,
} from "chamfer/generation";
import type { NoiseSettings } from "chamfer/generation";
import {
	barycentricOf,
	cellCorners,
	faceOf,
	hexRound,
	latticePosition,
	directionToCell,
	neighbour,
} from "chamfer/addressing";
import { Vec3 } from "chamfer/math";

/**
 * The demo carries its own copy of the engine, and a copy that has drifted is
 * a lab that teaches the wrong lesson.
 *
 * `demos/multi-noise-lab.html` is a single file with no imports and no build
 * step, which is what lets it be opened from a disk rather than served. The
 * price is that its noise and its lattice are hand ports. This reads those
 * ports back out of the page and runs them against the real thing, so a change
 * to either one that is not made to the other fails here rather than being
 * found by tuning a world that does not exist.
 *
 * **The second block is the whole reason this lab can be ported into the
 * engine.** Its patch is not a hex grid that looks like the engine's: the cells
 * come from `positionToCell`, the ring from `neighbour` and the polygons from
 * `cellCorners`, so a face edge is crossed the way the engine crosses it and a
 * patch that reaches one of the twelve pentagons gets a five-sided cell. What
 * is checked here is exactly that -- cell for cell, corner for corner.
 */
const HTML = fileURLToPath(
	new URL("../../../../demos/multi-noise-lab.html", import.meta.url),
);

const BEGIN = "// ===== BEGIN engine noise kernel =====";
const END = "// ===== END engine noise kernel =====";
const LATTICE_BEGIN = "// ===== BEGIN engine coarse grid =====";
const LATTICE_END = "// ===== END engine coarse grid =====";
const COORDS_BEGIN = "// ===== BEGIN engine coordinates =====";
const COORDS_END = "// ===== END engine coordinates =====";

/** One marked block of the page, as source. */
function block(page: string, begin: string, end: string): string {
	const from = page.indexOf(begin);
	const to = page.indexOf(end);
	expect(from, `the opening marker ${begin}`).toBeGreaterThan(-1);
	expect(to, `the closing marker ${end}`).toBeGreaterThan(from);
	return page.slice(from + begin.length, to);
}

type FaceCell = { face: number; i: number; j: number };

/** The demo's own functions, lifted out of the page and made callable. */
function demoKernel(): {
	hash3: typeof hash3;
	seedFromString: typeof seedFromString;
	valueNoise3: typeof valueNoise3;
	octaveNoise: (
		x: number,
		y: number,
		z: number,
		seed: number,
		s: NoiseSettings,
	) => number;
	faceOf: (x: number, y: number, z: number) => number;
	barycentricOf: (
		face: number,
		x: number,
		y: number,
		z: number,
	) => [number, number, number];
	hexRound: typeof hexRound;
	latticePosition: (
		face: number,
		n: number,
		i: number,
		j: number,
	) => [number, number, number];
	canonicalCell: (face: number, n: number, i: number, j: number) => FaceCell;
	neighbour: (
		face: number,
		n: number,
		i: number,
		j: number,
		k: number,
	) => FaceCell | null;
	cellCorners: (
		face: number,
		n: number,
		i: number,
		j: number,
	) => [number, number, number][];
	directionToCell: (x: number, y: number, z: number, n: number) => FaceCell;
	NORTH_AXIS: [number, number, number];
	MERIDIAN_X: [number, number, number];
	MERIDIAN_Y: [number, number, number];
	VERTICES: [number, number, number][];
	directionOf: (latitude: number, longitude: number) => [number, number, number];
	frameOf: (up: [number, number, number]) => {
		east: [number, number, number];
		up: [number, number, number];
		north: [number, number, number];
	};
} {
	const page = readFileSync(HTML, "utf8");
	// Both blocks together, because the page runs them together. They are
	// written to touch no document and no window, so they run here exactly as
	// they run in the page.
	const source =
		block(page, BEGIN, END) +
		block(page, LATTICE_BEGIN, LATTICE_END) +
		block(page, COORDS_BEGIN, COORDS_END);
	const build = new Function(
		`${source}\nreturn { hash3, seedFromString, valueNoise3, octaveNoise, faceOf, barycentricOf, hexRound, latticePosition, canonicalCell, neighbour, cellCorners, directionToCell, NORTH_AXIS, MERIDIAN_X, MERIDIAN_Y, VERTICES, directionOf, frameOf };`,
	) as () => ReturnType<typeof demoKernel>;
	return build();
}

const demo = demoKernel();

/** A point spread over the sphere, the way the three fields are sampled. */
function direction(n: number): [number, number, number] {
	const golden = Math.PI * (3 - Math.sqrt(5));
	const z = 1 - (2 * n + 1) / 977;
	const ring = Math.sqrt(Math.max(0, 1 - z * z));
	return [Math.cos(n * golden) * ring, z, Math.sin(n * golden) * ring];
}

/** A layer's own settings, in the shape `layerSettings` builds. */
function settings(over: Partial<NoiseSettings> = {}): NoiseSettings {
	return {
		frequency: 4,
		octaves: 5,
		persistence: 0.5,
		lacunarity: 2,
		offsetX: 0,
		offsetY: 0,
		ridge: 0,
		...over,
	};
}

/** A latitude and a longitude in degrees, read back off a direction. */
function placeOf(p: readonly number[]): { lat: number; lon: number } {
	const dot = (a: readonly number[], b: readonly number[]) =>
		a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	return {
		lat:
			(Math.asin(Math.max(-1, Math.min(1, dot(p, demo.NORTH_AXIS)))) * 180) /
			Math.PI,
		lon:
			(Math.atan2(dot(p, demo.MERIDIAN_Y), dot(p, demo.MERIDIAN_X)) * 180) /
			Math.PI,
	};
}

describe("the lab's latitude and longitude", () => {
	it("measures from the engine's own polar axis", () => {
		// **Icosahedron vertices 0 and 3.** All six antipodal pentagon pairs
		// give one distinct latitude signature, so the choice is made on the
		// face table instead: this is the only pair whose polar caps are
		// contiguous runs of face indices.
		expect(placeOf(demo.VERTICES[0]).lat).toBeCloseTo(90, 9);
		expect(placeOf(demo.VERTICES[3]).lat).toBeCloseTo(-90, 9);
	});

	it("puts the prime meridian through vertex 11", () => {
		const at = placeOf(demo.VERTICES[11]);
		expect(at.lon).toBeCloseTo(0, 9);
		// The northern pentagon ring sits at atan(1/2).
		expect(at.lat).toBeCloseTo((Math.atan(0.5) * 180) / Math.PI, 9);
	});

	it("puts all twelve pentagons on exact multiples of 36 degrees", () => {
		for (const v of demo.VERTICES) {
			const at = placeOf(v);
			// Longitude means nothing at a pole, so those two are exempt.
			if (Math.abs(Math.abs(at.lat) - 90) < 1e-9) continue;
			expect(Math.abs(at.lon / 36 - Math.round(at.lon / 36))).toBeLessThan(1e-9);
		}
	});

	it("gives a frame whose east and north are the map's own", () => {
		// **This is the pair that used to disagree.** A frame built one way and
		// a map drawn another are mirror images, and the patch then reads
		// backwards against the picture of where it is.
		const step = 1e-5;
		for (const [lat, lon] of [
			[0, 0],
			[23, 57],
			[-41, -122],
			[67, 179],
		]) {
			const p = demo.directionOf(lat, lon);
			const frame = demo.frameOf(p);
			const along = (q: readonly number[]) => {
				const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
				const len = Math.sqrt(d[0] ** 2 + d[1] ** 2 + d[2] ** 2);
				return [d[0] / len, d[1] / len, d[2] / len];
			};
			const east = along(demo.directionOf(lat, lon + step));
			const north = along(demo.directionOf(lat + step, lon));
			const dot = (a: readonly number[], b: readonly number[]) =>
				a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
			expect(dot(frame.east, east)).toBeCloseTo(1, 6);
			expect(dot(frame.north, north)).toBeCloseTo(1, 6);
		}
	});
});

describe("the multi-noise lab's patch", () => {
	it("is handed a right-handed frame, so it is not a mirror of its own map", () => {
		// **East, up and north in that order is left-handed** -- measured,
		// `cross(east, up) . north` is exactly -1 -- and a left-handed basis
		// given to a right-handed renderer draws the mirror image. From
		// overhead the frame's east then lands on the right of the screen where
		// the map puts it and its north lands at the bottom, so the view is the
		// map flipped top to bottom. The renderer's third axis is south
		// instead: measured after, east lands at +0.249 and north at +0.439,
		// against +0.250 and -0.314 before.
		const page = readFileSync(HTML, "utf8");
		expect(page).toContain("localX[2] = -(");
		expect(page).not.toMatch(/localX\[2\] =\s*\n?\s*rx \* frame\.north\[0\]/);
	});
});

describe("the multi-noise lab's copy of the engine's noise", () => {
	it("hashes the same integers to the same values", () => {
		for (let n = -50; n < 50; n++)
			expect(demo.hash3(n, n * 7, n * 13, 12345)).toBe(
				hash3(n, n * 7, n * 13, 12345),
			);
	});

	it("reduces a typed seed the same way", () => {
		for (const text of ["chamfer", "world1", "", "a longer seed"])
			expect(demo.seedFromString(text)).toBe(seedFromString(text));
	});

	it("draws value noise exactly as the engine does", () => {
		const seed = seedFromString("chamfer");
		for (let n = 0; n < 400; n++) {
			const [x, y, z] = direction(n);
			expect(demo.valueNoise3(x * 9, y * 9, z * 9, seed)).toBe(
				valueNoise3(x * 9, y * 9, z * 9, seed),
			);
		}
	});

	// The three layers differ in every one of these, and the fold is the one
	// the lab turns up on peaks and valleys alone, so it is checked at both
	// ends and in between.
	it.each([0, 0.4, 0.85, 1])("stacks octaves at fold %d exactly", (ridge) => {
		const seed = seedFromString("chamfer");
		for (const s of [
			settings({ ridge }),
			settings({ ridge, octaves: 3, persistence: 0.35, lacunarity: 2.7 }),
		])
			for (let n = 0; n < 200; n++) {
				const [x, y, z] = direction(n);
				expect(demo.octaveNoise(x, y, z, seed, s)).toBe(
					octaveNoise(x, y, z, seed, s),
				);
			}
	});
});

describe("the multi-noise lab's copy of the engine's lattice", () => {
	it("puts a direction in the same face", () => {
		for (let n = 0; n < 977; n++) {
			const [x, y, z] = direction(n);
			expect(demo.faceOf(x, y, z)).toBe(faceOf(new Vec3(x, y, z)));
		}
	});

	it("gives a direction the same weights inside its face", () => {
		for (let n = 0; n < 400; n++) {
			const [x, y, z] = direction(n);
			const dir = new Vec3(x, y, z);
			expect(demo.barycentricOf(faceOf(dir), x, y, z)).toEqual(
				barycentricOf(faceOf(dir), dir),
			);
		}
	});

	it("repairs a rounded triple the same way", () => {
		for (let n = 0; n < 300; n++) {
			const a = (n * 0.37) % 9;
			const b = (n * 0.71) % 9;
			expect(demo.hexRound(a, b, 16 - a - b, 16)).toEqual(
				hexRound(a, b, 16 - a - b, 16),
			);
		}
	});

	it.each([16, 64, 256])("names the same cell at n = %d", (n) => {
		for (let s = 0; s < 977; s++) {
			const [x, y, z] = direction(s);
			const here = demo.directionToCell(x, y, z, n);
			const there = directionToCell(new Vec3(x, y, z), n);
			expect(here.face).toBe(there.face);
			expect(here.i).toBe(there.i);
			expect(here.j).toBe(there.j);
		}
	});

	/**
	 * The patch the lab walks: out from one cell by `neighbour`, canonicalised,
	 * which is what its `generate` does.
	 */
	function walk(
		start: FaceCell,
		n: number,
		rings: number,
	): Map<number, FaceCell> {
		const key = (c: FaceCell) => (c.face * (n + 1) + c.i) * (n + 1) + c.j;
		const seen = new Map<number, FaceCell>([[key(start), start]]);
		let frontier = [start];
		for (let ring = 0; ring < rings; ring++) {
			const next: FaceCell[] = [];
			for (const c of frontier)
				for (let d = 0; d < 6; d++) {
					const nb = demo.neighbour(c.face, n, c.i, c.j, d);
					if (!nb) continue;
					const cell = demo.canonicalCell(nb.face, n, nb.i, nb.j);
					if (seen.has(key(cell))) continue;
					seen.set(key(cell), cell);
					next.push(cell);
				}
			frontier = next;
		}
		return seen;
	}

	it("steps to the same neighbour in every direction", () => {
		const n = 128;
		for (const [x, y, z] of [direction(3), direction(400), direction(900)]) {
			const start = demo.directionToCell(x, y, z, n);
			for (const cell of walk(start, n, 8).values())
				for (let k = 0; k < 6; k++) {
					const here = demo.neighbour(cell.face, n, cell.i, cell.j, k);
					const there = neighbour(cell.face, n, cell.i, cell.j, k);
					if (there === null) {
						expect(here).toBeNull();
						continue;
					}
					expect(here).not.toBeNull();
					expect(here?.face).toBe(there.face);
					expect(here?.i).toBe(there.i);
					expect(here?.j).toBe(there.j);
				}
		}
	});

	it("draws the same polygon around every cell of a patch", () => {
		const n = 128;
		const start = demo.directionToCell(...direction(400), n);
		for (const cell of walk(start, n, 10).values()) {
			const here = demo.cellCorners(cell.face, n, cell.i, cell.j);
			const there = cellCorners(cell.face, n, cell.i, cell.j);
			expect(here.length).toBe(there.length);
			for (let k = 0; k < there.length; k++) {
				expect(here[k]![0]).toBe(there[k]!.x);
				expect(here[k]![1]).toBe(there[k]!.y);
				expect(here[k]![2]).toBe(there[k]!.z);
			}
		}
	});

	it("puts a cell where the engine puts it", () => {
		const n = 128;
		const start = demo.directionToCell(...direction(600), n);
		for (const cell of walk(start, n, 6).values()) {
			const here = demo.latticePosition(cell.face, n, cell.i, cell.j);
			const there = latticePosition(cell.face, n, cell.i, cell.j);
			expect(here[0]).toBe(there.x);
			expect(here[1]).toBe(there.y);
			expect(here[2]).toBe(there.z);
		}
	});

	/**
	 * A patch that reaches a pentagon is the case the walk has to get right, and
	 * the count is the engine's own disc formula rather than a number read off a
	 * run: a pentagon's ring is five long, so a disc of radius `r` around one
	 * holds `1 + 5r(r+1)/2` cells against `3r^2 + 3r + 1` anywhere else.
	 */
	it("walks a pentagon disc and a hexagon disc to their own sizes", () => {
		const n = 128;
		// Icosahedron vertex 0 is corner A of face 0, so `(0, 0)` is a pentagon.
		expect(walk({ face: 0, i: 0, j: 0 }, n, 10).size).toBe(
			1 + (5 * 10 * 11) / 2,
		);
		const inside = demo.directionToCell(...direction(400), n);
		expect(walk(inside, n, 12).size).toBe(3 * 144 + 3 * 12 + 1);
	});

	it("gives exactly one cell of a pentagon disc five sides", () => {
		const n = 128;
		let five = 0;
		for (const cell of walk({ face: 0, i: 0, j: 0 }, n, 10).values()) {
			const corners = demo.cellCorners(cell.face, n, cell.i, cell.j);
			expect(corners.length === 5 || corners.length === 6).toBe(true);
			if (corners.length === 5) five++;
		}
		expect(five).toBe(1);
	});
});
