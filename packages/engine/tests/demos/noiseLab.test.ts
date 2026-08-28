import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	CoarseGrid,
	erodeDroplets,
	erodeFreeDroplets,
	hash3,
	octaveNoise,
	seedFromString,
	valueNoise3,
} from "chamfer/generation";
import type { NoiseSettings } from "chamfer/generation";
import {
	barycentricOf,
	DIRECTIONS,
	faceOf,
	latticePosition,
	latticeWeights,
	neighbour,
} from "chamfer/addressing";
import { Vec3 } from "chamfer/math";

/**
 * The demo carries its own copy of the noise, and a copy that has drifted is
 * a lab that teaches the wrong lesson.
 *
 * `demos/noise-lab.html` is a single file with no imports and no build step,
 * which is what lets it be opened from a disk rather than served. The price is
 * that its noise is a hand port of the engine's. This reads that port back out
 * of the page and runs it against the real thing, so a change to either one
 * that is not made to the other fails here rather than being found by tuning a
 * world that does not exist.
 *
 * **The lab carries value noise and the octave stack, and nothing else.** The
 * other four bases are the engine's and are not ported; plain fBm was ported
 * and has been taken back out, because the lab's two layers are both octave
 * stacks and a function with no caller is a function that drifts unnoticed.
 * What is checked is everything the lab actually holds.
 *
 * **The lab carries a second block**, the coarse grid and the erosion pass,
 * because water walks from cell to cell and cannot be read off a point. That
 * block is a port of the addressing subsystem and of `erodeDroplets`, and it is
 * checked the same way: the grid is built at a small level and compared cell for
 * cell, and the pass is run over a field and compared value for value. Its
 * erosion takes two of its constants as arguments so the panel can move them,
 * and a five-argument call has to be the engine's pass exactly.
 */
const HTML = fileURLToPath(
	new URL("../../../../demos/noise-lab.html", import.meta.url),
);

const BEGIN = "// ===== BEGIN engine noise kernel =====";
const END = "// ===== END engine noise kernel =====";
const COARSE_BEGIN = "// ===== BEGIN engine coarse grid =====";
const COARSE_END = "// ===== END engine coarse grid =====";

/** One marked block of the page, as source. */
function block(page: string, begin: string, end: string): string {
	const from = page.indexOf(begin);
	const to = page.indexOf(end);
	expect(from, `the opening marker ${begin}`).toBeGreaterThan(-1);
	expect(to, `the closing marker ${end}`).toBeGreaterThan(from);
	return page.slice(from + begin.length, to);
}

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
	CoarseGrid: new (level: number) => CoarseGrid;
	erodeDroplets: (
		grid: CoarseGrid,
		height: Float64Array,
		seed: number,
		strength: number,
		cellMetres: number,
	) => number;
	faceOf: (x: number, y: number, z: number) => number;
	barycentricOf: (
		face: number,
		x: number,
		y: number,
		z: number,
	) => [number, number, number];
	acrossEdge: (
		face: number,
		weights: readonly number[],
		leaving: number,
	) => { face: number; i: number; j: number };
	erodeFreeDroplets: (
		grid: CoarseGrid,
		height: Float64Array,
		seed: number,
		strength: number,
		cellMetres: number,
	) => number;
} {
	const page = readFileSync(HTML, "utf8");
	// Both blocks together, because the erosion pass in the second one hashes
	// with the first. They are written to touch no document and no window, so
	// they run here exactly as they run in the page.
	const source =
		block(page, BEGIN, END) + block(page, COARSE_BEGIN, COARSE_END);
	const build = new Function(
		`${source}\nreturn { hash3, seedFromString, valueNoise3, octaveNoise, CoarseGrid, erodeDroplets, erodeFreeDroplets, faceOf, barycentricOf, acrossEdge };`,
	) as () => ReturnType<typeof demoKernel>;
	return build();
}

const demo = demoKernel();

/** A point spread over the sphere, the way the field is actually sampled. */
function direction(n: number): [number, number, number] {
	const golden = Math.PI * (3 - Math.sqrt(5));
	const z = 1 - (2 * n + 1) / 977;
	const ring = Math.sqrt(Math.max(0, 1 - z * z));
	return [Math.cos(n * golden) * ring, z, Math.sin(n * golden) * ring];
}

/** The panel's own settings. */
function settings(over: Partial<NoiseSettings> = {}): NoiseSettings {
	return {
		frequency: 4,
		octaves: 5,
		persistence: 0.5,
		lacunarity: 2,
		offsetX: 15,
		offsetY: 9,
		ridge: 0.85,
		...over,
	};
}

describe("the noise lab's copy of the engine's noise", () => {
	it("hashes the same integers to the same values", () => {
		for (let n = -50; n < 50; n++)
			expect(demo.hash3(n, n * 7, n * 13, 12345)).toBe(
				hash3(n, n * 7, n * 13, 12345),
			);
	});

	it("reduces a typed seed the same way", () => {
		for (const text of ["chamfer", "world1", "world2", "", "a longer seed"])
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

	it("normalises the octave sum unless told not to", () => {
		// The lab can return the sum un-normalised, which is what Musgrave and
		// libnoise do. An ABSENT flag has to mean the engine's behaviour, or
		// every call the engine makes would quietly take the other branch.
		const seed = seedFromString("chamfer");
		const [x, y, z] = direction(11);
		const plain = settings();
		expect(demo.octaveNoise(x, y, z, seed, plain)).toBe(
			octaveNoise(x, y, z, seed, plain),
		);
		const raw = { ...plain, normalise: false } as NoiseSettings & {
			normalise: boolean;
		};
		expect(demo.octaveNoise(x, y, z, seed, raw)).not.toBe(
			octaveNoise(x, y, z, seed, plain),
		);
	});

	it.each([0, 0.4, 0.85])("stacks octaves at ridge %d exactly", (ridge) => {
		const seed = seedFromString("chamfer");
		const s = settings({ ridge });
		for (let n = 0; n < 300; n++) {
			const [x, y, z] = direction(n);
			expect(demo.octaveNoise(x, y, z, seed, s)).toBe(
				octaveNoise(x, y, z, seed, s),
			);
		}
	});

	it("agrees on a whole field, digest for digest", () => {
		const seed = seedFromString("chamfer");
		const s = settings();
		let theirs = 0;
		let mine = 0;
		for (let n = 0; n < 977; n++) {
			const [x, y, z] = direction(n);
			theirs =
				(theirs * 31 + Math.round(octaveNoise(x, y, z, seed, s) * 1e9)) | 0;
			mine =
				(mine * 31 + Math.round(demo.octaveNoise(x, y, z, seed, s) * 1e9)) | 0;
		}
		expect(mine).toBe(theirs);
	});
});

describe("the noise lab's copy of the engine's coarse grid", () => {
	// Level 4 is 2,562 cells with every face edge and all twelve pentagons in
	// it, which is what the numbering and the ring have to get right. Building
	// the shipped level 8 twice would be 31 MB and half a second for the same
	// answer.
	const LEVEL = 4;
	const mine = new demo.CoarseGrid(LEVEL);
	const theirs = new CoarseGrid(LEVEL);

	it("numbers the same cells in the same order", () => {
		expect(mine.count).toBe(theirs.count);
		expect(Array.from(mine.faceIndex)).toEqual(Array.from(theirs.faceIndex));
	});

	it("gives every cell the same ring, in the same order", () => {
		expect(Array.from(mine.ring)).toEqual(Array.from(theirs.ring));
	});

	it("puts every cell at the same direction, to the bit", () => {
		expect(Array.from(mine.directions)).toEqual(
			Array.from(theirs.directions),
		);
	});

	it("finds the same face and the same weights for a direction", () => {
		for (let n = 0; n < 400; n++) {
			const [x, y, z] = direction(n);
			const face = demo.faceOf(x, y, z);
			expect(face).toBe(faceOf(new Vec3(x, y, z)));
			expect(demo.barycentricOf(face, x, y, z)).toEqual(
				barycentricOf(face, new Vec3(x, y, z)),
			);
		}
	});

	/** Ground in metres, so the pass is run on the shape it is written for. */
	function ground(grid: CoarseGrid, seed: number): Float64Array {
		const s = settings();
		const out = new Float64Array(grid.count);
		for (let cell = 0; cell < grid.count; cell++)
			out[cell] =
				400 *
				octaveNoise(
					grid.directions[cell * 3]!,
					grid.directions[cell * 3 + 1]!,
					grid.directions[cell * 3 + 2]!,
					seed,
					s,
				);
		return out;
	}

	it("cuts the same valleys into the same ground, cell to cell", () => {
		const seed = seedFromString("chamfer");
		const start = ground(theirs, seed);
		const a = Float64Array.from(start);
		const b = Float64Array.from(start);
		erodeDroplets(theirs, a, seed, 1, 32);
		demo.erodeDroplets(mine, b, seed, 1, 32);
		// Bit for bit. A droplet is a chain of comparisons against ground it has
		// already moved, so one differing value would fan out over the map
		// rather than staying where it started.
		expect(Array.from(b)).toEqual(Array.from(a));
	});

	it("cuts the same valleys into the same ground, free position", () => {
		const seed = seedFromString("chamfer");
		const start = ground(theirs, seed);
		const a = Float64Array.from(start);
		const b = Float64Array.from(start);
		erodeFreeDroplets(theirs, a, seed, 1, 32);
		demo.erodeFreeDroplets(mine, b, seed, 1, 32);
		expect(Array.from(b)).toEqual(Array.from(a));
	});

	it("moves the ground either walk is asked to move", () => {
		const seed = seedFromString("chamfer");
		const start = ground(mine, seed);
		for (const cut of [demo.erodeDroplets, demo.erodeFreeDroplets]) {
			const height = Float64Array.from(start);
			cut(mine, height, seed, 1, 32);
			let moved = 0;
			for (let cell = 0; cell < height.length; cell++)
				moved += Math.abs(height[cell]! - start[cell]!);
			expect(moved).toBeGreaterThan(0);
		}
	});
});

describe("the noise lab's face crossing", () => {
	// Level 3 is 642 cells, which is every face edge and every icosahedron
	// vertex with room to spare, and small enough to check every cell against
	// the engine one direction at a time.
	const LEVEL = 3;
	const grid = new demo.CoarseGrid(LEVEL);
	const n = grid.n;

	it("names the same cell the engine's neighbour does, one step off a face", () => {
		let crossings = 0;
		for (let face = 0; face < 20; face++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++) {
					// The twelve pentagons sit at the icosahedron vertices, and
					// a step off a face from one of those lands past the vertex
					// rather than over an edge: one reflection leaves a weight
					// still negative, and the engine reads the pentagon's own
					// ring instead. A blend's three corners are the triangle the
					// position stands in, so they never reach that case.
					const w = latticeWeights(n, i, j);
					if (w.filter((x) => x === 0).length >= 2) continue;
					for (let k = 0; k < 6; k++) {
						const [di, dj] = DIRECTIONS[k]!;
						const ni = i + di;
						const nj = j + dj;
						if (ni >= 0 && nj >= 0 && ni + nj <= n) continue;
						crossings++;
						const over = neighbour(face, n, i, j, k)!;
						expect(grid.indexNear(face, ni, nj)).toBe(
							grid.indexOf(over.face, over.i, over.j),
						);
					}
				}
		expect(crossings).toBeGreaterThan(400);
	});

	it("leaves a point on the edge exactly where it stood", () => {
		// The reflection is written for whole lattice points and it is linear,
		// so it has to hold for a position between them too. On the edge the
		// weight being left is zero, which is where the two faces agree.
		for (let face = 0; face < 20; face++)
			for (let leaving = 0; leaving < 3; leaving++)
				for (let step = 1; step < 8; step++) {
					const along = (step * n) / 8;
					const weights = [0, 0, 0];
					weights[leaving] = 0;
					weights[(leaving + 1) % 3] = n - along;
					weights[(leaving + 2) % 3] = along;
					const over = demo.acrossEdge(face, weights, leaving);
					const before = latticePosition(
						face,
						n,
						weights[1]!,
						weights[2]!,
					);
					const after = latticePosition(over.face, n, over.i, over.j);
					expect(after.x).toBeCloseTo(before.x, 12);
					expect(after.y).toBeCloseTo(before.y, 12);
					expect(after.z).toBeCloseTo(before.z, 12);
				}
	});

	it("keeps a direction pointing the way it was going", () => {
		// A step straight off an edge has to arrive pointing into the face on
		// the other side, which is a weight growing on that face's own third
		// vertex.
		for (let face = 0; face < 20; face++)
			for (let leaving = 0; leaving < 3; leaving++) {
				const walk = [0, 0, 0];
				walk[leaving] = -1;
				walk[(leaving + 1) % 3] = 0.5;
				walk[(leaving + 2) % 3] = 0.5;
				const over = demo.acrossEdge(face, walk, leaving);
				const carried = [-over.i - over.j, over.i, over.j];
				expect(carried[0]! + carried[1]! + carried[2]!).toBeCloseTo(0, 12);
				// One of the three grows by exactly what the old one lost.
				expect(Math.max(...carried)).toBeCloseTo(1, 12);
			}
	});
});
