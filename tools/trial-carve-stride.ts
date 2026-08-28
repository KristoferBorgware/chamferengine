// What sampling the cliffs layer every second layer would cost, and buy.
//
//   npx vite-node tools/trial-carve-stride.ts [chunks]
//
// The layer is read once a block down a column -- `120` readings over its
// reach -- and its field crosses only `4` lattice cells of its widest octave
// and `16` of its finest doing it. So it is asked the same question several
// times over, and reading every second layer and filling in between is the
// obvious saving.
//
// **It is not exact and this measures how far off it is.** Two layers that
// agree do not prove the one between them agrees: a metre of air between two
// metres of rock is a thing the field can say, and skipping it would fill it
// in. Where the two disagree the layer between is read for real, so the error
// only ever lives inside a run the two ends agree about.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import {
	ChunkAddress,
	TerrainGenerator,
	buildCoarseMap,
	carveDepth,
	carveIsRock,
	carveMargin,
	carveSeed,
	carveStep,
	generateChunk,
	layerNoiseSettings,
	seedFromString,
} from "chamfer/generation";
import { canonicalCell, directionToCell, joinPath, splitPath } from "chamfer/addressing";
import { latticePosition } from "chamfer/addressing";
import { Vec3 } from "chamfer/math";

const WANT = Number(process.argv[2] ?? 4);
const STRIDES = [1, 2, 3, 4];

const settings = new PlanetSettings({ plain: false });
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const shape = settings.shapeFor(map);
const terrain = new TerrainGenerator(
	seed,
	shape,
	map,
	settings.terrainOptions(),
);
const chunkLevel = settings.chunkLevel;
const n = shape.n;
const block = shape.blockSize;
const layer = settings.layerFor("carve");
const noise = layerNoiseSettings(layer, shape.seaLevelRadius);
const carve = carveSeed(seed);
const deep = carveDepth(layer);
const steps = Math.ceil(deep / block);

let state = 20260828;
const next = (): number => {
	state = (state * 1103515245 + 12345) & 0x7fffffff;
	return state / 0x7fffffff;
};

/** Land chunks, because the layer stops at the waterline. */
const columns: { at: Vec3; elevation: number }[] = [];
for (let tries = 0; tries < 4000 && columns.length < WANT * 2145; tries++) {
	const y = 2 * next() - 1;
	const ring = Math.sqrt(Math.max(0, 1 - y * y));
	const turn = 2 * Math.PI * next();
	const dir = new Vec3(
		Math.cos(turn) * ring,
		y,
		Math.sin(turn) * ring,
	).normalize();
	const found = directionToCell(dir, n);
	const cell = canonicalCell(found.face, n, found.i, found.j);
	const split = splitPath(cell.i, cell.j, settings.depth, chunkLevel);
	const address = new ChunkAddress(cell.face, split.path);
	const chunk = generateChunk(terrain, address, chunkLevel, shape.crustDepth);
	let above = 0;
	for (let slot = 0; slot < chunk.slots; slot++)
		if (chunk.surface[slot * 2]! > shape.seaLevelRadius) above++;
	if (above < chunk.slots * 0.95) continue;
	const m = chunk.m;
	for (let q = 0; q <= m; q++)
		for (let r = 0; q + r <= m; r++) {
			const [i, j] = joinPath(address.path, q, r, settings.depth);
			const column = terrain.columnAt(address.face, i, j);
			if (column.groundRadius <= shape.seaLevelRadius) continue;
			const p = latticePosition(address.face, n, i, j);
			columns.push({
				at: new Vec3(p.x, p.y, p.z),
				elevation: column.groundRadius - shape.seaLevelRadius,
			});
		}
}

const rock = (one: (typeof columns)[number], step: number): boolean =>
	carveIsRock(
		one.at.x,
		one.at.y,
		one.at.z,
		shape.seaLevelRadius,
		one.elevation,
		step * block,
		carve,
		layer,
		noise,
	);

/** The truth, one reading a layer, kept to measure everything else against. */
const truth: Uint8Array[] = columns.map((one) => {
	const out = new Uint8Array(steps);
	for (let s = 0; s < steps; s++) out[s] = rock(one, s) ? 1 : 0;
	return out;
});

// **How short a run gets is the bound, not how many readings happened to
// agree.** Two samples `s` apart that agree can only hide a run of the
// opposite value shorter than `s`, so a stride under the shortest run in the
// field cannot miss anything -- that is a property of the ground rather than
// of this sample's luck.
{
	const runs = new Map<number, number>();
	let shortest = Infinity;
	let air = Infinity;
	for (const said of truth) {
		let run = 1;
		for (let s = 1; s <= steps; s++) {
			if (s < steps && said[s] === said[s - 1]) {
				run++;
				continue;
			}
			// A run touching either end of the walk is not bounded by it.
			if (s < steps && run < steps) {
				runs.set(run, (runs.get(run) ?? 0) + 1);
				if (run < shortest) shortest = run;
				if (said[s - 1] === 0 && run < air) air = run;
			}
			run = 1;
		}
	}
	const sorted = [...runs.keys()].sort((a, b) => a - b);
	console.log(
		`shortest run of one answer: ${shortest} layers ` +
			`(air alone: ${air === Infinity ? "none" : air}), ` +
			`over ${[...runs.values()].reduce((a, b) => a + b, 0).toLocaleString("en-US")} runs`,
	);
	console.log(
		`the five shortest: ${sorted
			.slice(0, 5)
			.map((k) => `${k} layers x${runs.get(k)}`)
			.join(", ")}\n`,
	);
}

const line = (
	stride: number,
	reads: number,
	wrong: number,
	runs: number,
	ms: number,
): void =>
	console.log(
		`${stride === 0 ? "bounded" : stride}`.padEnd(9) +
			`${(reads / columns.length).toFixed(1)}`.padStart(10) +
			`${((100 * reads) / (columns.length * steps)).toFixed(0)}%`.padStart(8) +
			`${ms.toFixed(0)} ms`.padStart(10) +
			`${wrong.toLocaleString("en-US")}`.padStart(11) +
			`${((100 * wrong) / (columns.length * steps)).toFixed(4)}%`.padStart(10) +
			`${runs.toLocaleString("en-US")}`.padStart(11),
	);

console.log(
	`depth ${settings.depth}, block ${block} m, reach ${deep.toFixed(0)} m ` +
		`= ${steps} layers, ${columns.length.toLocaleString("en-US")} land columns\n`,
);
console.log(
	"stride".padEnd(9) +
		"reads".padStart(10) +
		"of all".padStart(8) +
		"time".padStart(10) +
		"wrong".padStart(11) +
		"of all".padStart(10) +
		"runs lost".padStart(11),
);

/**
 * Fill a column by sampling every `stride`th layer and reading between two
 * samples that disagree.
 *
 * Returns how many readings it took. **Counted apart from the timing**, or the
 * count is whatever the last timing pass left behind -- which is how this trial
 * first reported no error at all.
 */
function strided(
	one: (typeof columns)[number],
	stride: number,
	got: Uint8Array,
): number {
	let reads = 0;
	let last = -1;
	let lastSaid = false;
	for (let s = 0; s < steps; s += stride) {
		const here = rock(one, s);
		reads++;
		got[s] = here ? 1 : 0;
		if (last >= 0) {
			if (lastSaid === here) {
				for (let f = last + 1; f < s; f++) got[f] = here ? 1 : 0;
			} else {
				// **They disagree, so the layers between are read.** The
				// crossing is in here somewhere and skipping it would move a
				// surface rather than fill a pocket.
				for (let f = last + 1; f < s; f++) {
					got[f] = rock(one, f) ? 1 : 0;
					reads++;
				}
			}
		}
		last = s;
		lastSaid = here;
	}
	for (let f = last + 1; f < steps; f++) {
		got[f] = rock(one, f) ? 1 : 0;
		reads++;
	}
	return reads;
}

/**
 * The walk the engine runs: read a margin, skip what its own bound allows.
 *
 * **Exact, and that is the difference.** A margin further from nought than the
 * most it can move in a block is the same answer for that many blocks, so
 * nothing is assumed about the layers in between -- they are proved.
 */
const bound = carveStep(shape.seaLevelRadius, block, layer, noise);
{
	const got = new Uint8Array(steps);
	let reads = 0;
	let wrong = 0;
	const walk = (one: (typeof columns)[number]): number => {
		const step = bound;
		let count = 0;
		let s = 0;
		while (s < steps) {
			const margin = carveMargin(
				one.at.x,
				one.at.y,
				one.at.z,
				shape.seaLevelRadius,
				one.elevation,
				s * block,
				carve,
				layer,
				noise,
			);
			count++;
			const span = Math.max(1, 1 + Math.floor(Math.abs(margin) / step));
			const to = Math.min(steps, s + span);
			got.fill(margin > 0 ? 1 : 0, s, to);
			s = to;
		}
		return count;
	};
	for (let c = 0; c < columns.length; c++) {
		reads += walk(columns[c]!);
		const said = truth[c]!;
		for (let t = 0; t < steps; t++) if (got[t] !== said[t]) wrong++;
	}
	let least = Infinity;
	for (let pass = 0; pass < 3; pass++) {
		const at = performance.now();
		for (let c = 0; c < columns.length; c++) walk(columns[c]!);
		least = Math.min(least, performance.now() - at);
	}
	console.log(
		`the bound the engine runs: a margin moves at most ${bound.toFixed(4)} a block\n`,
	);
	line(0, reads, wrong, 0, least);
}

for (const stride of STRIDES) {
	// What it gets wrong, once, with nothing else going on.
	const got = new Uint8Array(steps);
	let reads = 0;
	let wrong = 0;
	let runs = 0;
	// **Where the losses land decides whether they matter.** A one-block
	// pocket of air buried in rock is a thing nobody sees until they dig to
	// it; a one-block shelf of rock standing in air, up at the surface, is a
	// block hanging in the sky.
	let filled = 0;
	let removed = 0;
	let deepest = 0;
	let nearest = steps;
	for (let c = 0; c < columns.length; c++) {
		reads += strided(columns[c]!, stride, got);
		const said = truth[c]!;
		for (let s = 0; s < steps; s++) {
			if (got[s] === said[s]) continue;
			wrong++;
			if (s === 0 || got[s - 1] === said[s - 1]) runs++;
			if (said[s] === 0) filled++;
			else removed++;
			if (s > deepest) deepest = s;
			if (s < nearest) nearest = s;
		}
	}
	if (wrong > 0)
		console.log(
			`   stride ${stride}: ${filled} pockets of air filled in, ` +
				`${removed} blocks of rock taken away; ` +
				`the shallowest is ${nearest} layers under the ground, ` +
				`the deepest ${deepest}`,
		);
	// And what it costs, separately, so neither measurement is the other's.
	let least = Infinity;
	for (let pass = 0; pass < 3; pass++) {
		const at = performance.now();
		for (let c = 0; c < columns.length; c++) strided(columns[c]!, stride, got);
		least = Math.min(least, performance.now() - at);
	}
	line(stride, reads, wrong, runs, least);
}
