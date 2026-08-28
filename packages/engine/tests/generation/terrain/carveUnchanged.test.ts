import { beforeAll, describe, expect, it } from "vitest";
import type { CoarseMap } from "chamfer/generation";
import {
	CARVE_LAYER_DEFAULT,
	TerrainGenerator,
	buildCoarseMap,
	maxElevationFor,
	seedFromString,
} from "chamfer/generation";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import { positionToCell } from "chamfer/addressing";
import { Vec3 } from "chamfer/math";

const DEPTH = 11;
const RADIUS = 1700;
const OPTIONS = { level: 6, cellMetres: 100, relief: 300 };

let map: CoarseMap;
let shape: WorldShape;
let terrain: TerrainGenerator;

beforeAll(() => {
	map = buildCoarseMap(seedFromString("chamfer"), OPTIONS);
	shape = new WorldShape(
		RADIUS,
		DEPTH,
		maxElevationFor(OPTIONS),
		maxCrustDepth(DEPTH),
	);
	terrain = new TerrainGenerator(map.seed, shape, map, {
		carveLayer: true,
		carve: CARVE_LAYER_DEFAULT,
	});
});

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

describe("the cliffs layer, sped up", () => {
	/**
	 * **The waterline shortcut is exact because of what the sum can reach.**
	 * At and below sea level the hold is a whole `1`, and the density is then
	 * `said + (1 - said) * 1` for a reading `said` in `[-1, 1]` -- which is
	 * `1` however the field came out. The test the layer then makes is
	 * `density + depthBelow / deep > 0`, and the second term is never
	 * negative. So the answer is rock before the field is read, and this is
	 * that arithmetic over the whole range a reading can take.
	 */
	it("cannot be air under the water, whatever the field says", () => {
		let wrong = "";
		for (let n = 0; n <= 20000 && !wrong; n++) {
			const said = -1 + (2 * n) / 20000;
			const density = said + (1 - said) * 1;
			for (const share of [0, 0.25, 0.5, 0.999]) {
				if (density + share > 0) continue;
				wrong = `said ${said}: ${density} + ${share}`;
				break;
			}
		}
		expect(wrong).toBe("");
	});

	// **A cache that answers from the cell it happens to hold is a cache that
	// is wrong.** The generator keeps the cliffs layer's last lattice cell
	// while `fillColumn` walks a column downward, which is the order that hits
	// it -- so the check is that walking a column upward, or in a scramble,
	// gives the same blocks.
	it("gives one column the same blocks whichever way it is walked", () => {
		let wrong = "";
		let checked = 0;
		for (const at of everywhere(300)) {
			const cell = positionToCell(at, shape.n);
			const column = terrain.columnAt(cell.face, cell.i, cell.j);
			// **Land, because that is where the layer works**: at and below
			// the waterline it returns rock without reading its field, so an
			// ocean column exercises the shortcut and not the cache.
			if (column.groundRadius <= shape.seaLevelRadius) continue;
			const from = Math.max(0, column.groundLayer);
			const to = Math.min(shape.crustDepth, from + 200);
			if (to <= from + 2) continue;
			const down: number[] = [];
			for (let layer = from; layer < to; layer++)
				down.push(terrain.blockAt(column, layer));
			// Up, which crosses the same lattice cells in the other order.
			for (
				let layer = to - 1, k = down.length - 1;
				layer >= from;
				layer--, k--
			)
				if (terrain.blockAt(column, layer) !== down[k]!) {
					wrong = `upward at ${layer}`;
					break;
				}
			if (wrong) break;
			// And scrambled, which misses the cache almost every time.
			let state = 12345;
			for (let n = 0; n < to - from; n++) {
				state = (state * 1103515245 + 12345) & 0x7fffffff;
				const layer = from + (state % (to - from));
				if (terrain.blockAt(column, layer) !== down[layer - from]!) {
					wrong = `scrambled at ${layer}`;
					break;
				}
			}
			if (wrong) break;
			checked += down.length;
		}
		expect(wrong).toBe("");
		expect(checked).toBeGreaterThan(2000);
	});

	// Two generators of one world, read in different orders, are one world.
	it("gives two generators of one world the same blocks", () => {
		const other = new TerrainGenerator(map.seed, shape, map, {
			carveLayer: true,
			carve: CARVE_LAYER_DEFAULT,
		});
		let wrong = "";
		let checked = 0;
		for (const at of everywhere(300)) {
			const cell = positionToCell(at, shape.n);
			const mine = terrain.columnAt(cell.face, cell.i, cell.j);
			if (mine.groundRadius <= shape.seaLevelRadius) continue;
			const theirs = other.columnAt(cell.face, cell.i, cell.j);
			const from = Math.max(0, mine.groundLayer);
			const to = Math.min(shape.crustDepth, from + 150);
			// One walks down and the other jumps in from the bottom, so the
			// two caches never hold the same cell at the same moment.
			for (let layer = from; layer < to; layer++) {
				const a = terrain.blockAt(mine, layer);
				const b = other.blockAt(theirs, to - 1 - (layer - from));
				void b;
				const c = other.blockAt(theirs, layer);
				if (a !== c) {
					wrong = `${layer}: ${a} against ${c}`;
					break;
				}
				checked++;
			}
			if (wrong) break;
		}
		expect(wrong).toBe("");
		expect(checked).toBeGreaterThan(2000);
	});
});
