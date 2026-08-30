// The crease a quad's two triangles leave when its shading is not affine.
//
//   npx vite-node tools/trial-quad-saddle.ts
//
// A vertex carries the block's colour with the corner occlusion multiplied in,
// and how much sky its cell stands under, **as two numbers**; the fragment
// multiplies them. Each is interpolated affinely across a triangle, and the
// **product of two affine functions is not affine** -- it has a cross term the
// two triangles of a quad cannot both carry. So the pair disagrees along their
// shared diagonal, and a wall wears a crease running corner to corner: one
// bright wedge and one dark one where the shading should be smooth.
//
// The crease is `|(f(a) + f(c)) - (f(b) + f(d))|` over a quad's four corners,
// which is what the two triangulations differ by. This measures it over the
// real mesher's real walls, and again with the sky term taken out -- which is
// what **Full light** does, and is why it is the one switch that hides this.
//
// **Walls and caps are two questions and are counted apart.** A wall is a quad
// and has a crease; a cap is a fan and has none, because two fan triangles
// sharing a root-to-rim edge interpolate between the same two ends along it.
// What an arbitrary fan root costs is the value in the polygon's MIDDLE, which
// sits on the root's own long diagonal and so reads the mean of two corners
// where the cap's own average is over all of them. Both populations are pairs
// of triangles sharing exactly two vertices, so the uv layout is what tells
// them apart -- a wall's corners are exactly `(0,0) (1,0) (1,R) (0,R)`.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import { plantLayerOf } from "../packages/client/src/PlantDraft.js";
import { biomeFieldFor } from "../packages/client/src/biomeFieldFor.js";
import {
	ChunkAddress,
	ChunkColumnSampler,
	PlantTemplateStore,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	makeBiomeSample,
	plantChunk,
	seedFromString,
} from "chamfer/generation";
import {
	canonicalCell,
	directionToCell,
	splitPath,
} from "chamfer/addressing";
import { Vec3 } from "chamfer/math";
import { CHUNK_VERTEX_FLOATS, buildChunkMesh } from "chamfer/mesh";

const settings = new PlanetSettings({ plain: false });
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const shape = settings.shapeFor(map);
const field = biomeFieldFor(seed, shape, map, settings);
const layers = settings.plantLayers.map(plantLayerOf);
const terrain = new TerrainGenerator(
	seed,
	shape,
	map,
	settings.terrainOptions(),
);
const templates = new PlantTemplateStore(
	seed,
	shape.subdivisionDepth,
	shape.blockSize,
	shape.seaLevelRadius,
);

/** A handful of land chunks, planted the way the world plants them. */
const scratch = makeBiomeSample();
const n = shape.n;
const built: ReturnType<typeof generateChunk>[] = [];
let pick = 987654321;
for (let tries = 0; tries < 4000 && built.length < 6; tries++) {
	pick = (Math.imul(pick, 1664525) + 1013904223) >>> 0;
	const z = (pick / 2 ** 32) * 2 - 1;
	pick = (Math.imul(pick, 1664525) + 1013904223) >>> 0;
	const phi = (pick / 2 ** 32) * Math.PI * 2;
	const r = Math.sqrt(1 - z * z);
	const dir = new Vec3(r * Math.cos(phi), r * Math.sin(phi), z);
	if (field) field.readAt(dir.x, dir.y, dir.z, scratch);
	const cell = directionToCell(dir, n);
	const home = canonicalCell(cell.face, n, cell.i, cell.j);
	if (terrain.columnAt(home.face, home.i, home.j).elevation <= 5) continue;
	const split = splitPath(home.i, home.j, settings.depth, settings.chunkLevel);
	const chunk = generateChunk(
		terrain,
		new ChunkAddress(home.face, split.path),
		settings.chunkLevel,
		shape.crustDepth,
	);
	plantChunk(
		chunk,
		terrain,
		shape,
		layers,
		seed,
		settings.depth,
		templates,
		field,
	);
	built.push(chunk);
}

console.log(
	`depth ${settings.depth}, ${settings.knobs.blockSize} m blocks, ` +
		`${built.length} land chunks of the shipped world`,
);

/** The green channel, which is what the eye reads a grey wedge off. */
const lumAt = (v: Float32Array, at: number) => v[at * CHUNK_VERTEX_FLOATS + 4]!;
const skyAt = (v: Float32Array, at: number) => v[at * CHUNK_VERTEX_FLOATS + 6]!;

/** One bucket of readings, so the two buffers can be counted apart. */
function bucket() {
	return {
		quads: 0,
		creased: 0,
		over5: 0,
		over10: 0,
		worst: 0,
		sum: 0,
		flatWorst: 0,
		flatOver5: 0,
		flatSum: 0,
		wrongWay: 0,
		wrongOver5: 0,
		fans: 0,
		fanOff: 0,
		creases: [] as number[],
		fanOffs: [] as number[],
		spreads: [] as number[],
	};
}
type Bucket = ReturnType<typeof bucket>;
const solid = bucket();
const leaves = bucket();

const uAt = (v: Float32Array, at: number) => v[at * CHUNK_VERTEX_FLOATS + 7]!;
const vAt = (v: Float32Array, at: number) => v[at * CHUNK_VERTEX_FLOATS + 8]!;

/**
 * Whether four vertices are a wall's own quad rather than two of a cap's fan.
 *
 * A wall lays its picture out `u` across and `v` down the run, so its corners
 * are exactly `(0,0) (1,0) (1,R) (0,R)` for a whole number of runs; a cap's
 * corners come off a circle and are neither. Consecutive triangles of a fan
 * also share exactly two vertices -- the root and one rim corner -- so without
 * this the two populations are counted as one.
 */
function isWall(v: Float32Array, four: readonly number[]): boolean {
	let atZero = 0;
	let atOne = 0;
	let top = 0;
	let runs = -1;
	for (const i of four) {
		const u = uAt(v, i);
		const w = vAt(v, i);
		if (u === 0) atZero++;
		else if (u === 1) atOne++;
		else return false;
		if (w === 0) top++;
		else if (Number.isInteger(w) && w >= 1) {
			if (runs >= 0 && runs !== w) return false;
			runs = w;
		} else return false;
	}
	return atZero === 2 && atOne === 2 && top === 2;
}

for (const chunk of built) {
	const mesh = buildChunkMesh(
		chunk,
		new ChunkColumnSampler(chunk, terrain),
		shape,
		seed,
		{ apron: true, surfaceGrid: shape.blockSize, cutoutLeaves: true },
	);
	for (const [part, into] of [
		[mesh.opaque, solid],
		[mesh.cutout, leaves],
	] as [typeof mesh.opaque, Bucket][]) {
		const v = part.vertices;
		const ix = part.indices;
		// What the fragment actually multiplies: the colour, which carries
		// the corner occlusion, times the sky the cell stands under.
		const f = (i: number) => lumAt(v, i) * skyAt(v, i);
		// The same corners under **Full light**, which replaces every sky
		// with 1. What is left is the corner occlusion ALONE -- and four
		// corner values crease whenever they break the parallelogram rule,
		// whether or not they are a product. This is the half of the crease
		// no lighting switch can reach.
		const g = (i: number) => lumAt(v, i);

		for (let t = 0; t + 5 < ix.length; t += 3) {
			const one = [ix[t]!, ix[t + 1]!, ix[t + 2]!];
			const two = [ix[t + 3]!, ix[t + 4]!, ix[t + 5]!];
			const shared = one.filter((i) => two.includes(i));
			if (shared.length !== 2) continue;
			const other = [
				...one.filter((i) => !shared.includes(i)),
				...two.filter((i) => !shared.includes(i)),
			];
			if (other.length !== 2) continue;
			if (!isWall(v, [...shared, ...other])) continue;
			into.quads++;
			t += 3;
			const crease = Math.abs(
				f(shared[0]!) + f(shared[1]!) - f(other[0]!) - f(other[1]!),
			);
			const mean =
				(f(shared[0]!) + f(shared[1]!) + f(other[0]!) + f(other[1]!)) /
				4;
			const share = mean > 1e-6 ? crease / mean : 0;
			if (share > 0.01) into.creased++;
			if (share > 0.05) into.over5++;
			if (share > 0.1) into.over10++;
			if (share > into.worst) into.worst = share;
			into.sum += share;
			into.creases.push(share);

			const flat = Math.abs(
				g(shared[0]!) + g(shared[1]!) - g(other[0]!) - g(other[1]!),
			);
			const flatMean =
				(g(shared[0]!) + g(shared[1]!) + g(other[0]!) + g(other[1]!)) /
				4;
			const flatShare = flatMean > 1e-6 ? flat / flatMean : 0;
			if (flatShare > 0.05) into.flatOver5++;
			if (flatShare > into.flatWorst) into.flatWorst = flatShare;
			into.flatSum += flatShare;

			if (f(shared[0]!) + f(shared[1]!) < f(other[0]!) + f(other[1]!)) {
				into.wrongWay++;
				if (share > 0.05) into.wrongOver5++;
			}
		}

		// Caps: a fan has no crease, and what an arbitrary root costs it is
		// the value in the middle.
		for (let t = 0; t + 2 < ix.length; ) {
			const root = ix[t]!;
			const ring = [root, ix[t + 1]!, ix[t + 2]!];
			let next = t + 3;
			while (
				next + 2 < ix.length &&
				ix[next] === root &&
				ix[next + 1] === ring[ring.length - 1]
			) {
				ring.push(ix[next + 2]!);
				next += 3;
			}
			const degree = ring.length;
			if (degree < 5 || degree > 6) {
				t += 3;
				continue;
			}
			t = next;
			const mean = ring.reduce((s, i) => s + f(i), 0) / degree;
			const middle =
				(f(ring[0]!) + f(ring[(degree >> 1) % degree]!)) / 2;
			into.fans++;
			const scale = mean > 1e-6 ? mean : 1;
			const off = Math.abs(middle - mean) / scale;
			into.fanOff += off;
			into.fanOffs.push(off);
			// **How far apart the cap's own corners are** is what decides
			// whether a fan is visible at all: six equal corners draw the
			// same picture however they are cut up.
			let lo = Infinity;
			let hi = -Infinity;
			for (const i of ring) {
				const val = f(i);
				if (val < lo) lo = val;
				if (val > hi) hi = val;
			}
			into.spreads.push((hi - lo) / scale);
		}
	}
}

/** A percentile of a list, which is where the visible cases live. */
function at(list: number[], q: number): number {
	if (list.length === 0) return 0;
	const sorted = [...list].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

function report(name: string, b: Bucket): void {
	const pc = (a: number) =>
		`${((100 * a) / Math.max(1, b.quads)).toFixed(1)}%`;
	console.log("");
	console.log(`${name}: ${b.quads.toLocaleString("en-US")} wall quads`);
	console.log(
		`  as drawn         ${pc(b.creased)} creased at all, ${pc(b.over5)} ` +
			`over 5%, ${pc(b.over10)} over 10%; worst ` +
			`${(100 * b.worst).toFixed(0)}%, mean ` +
			`${((100 * b.sum) / Math.max(1, b.quads)).toFixed(1)}%`,
	);
	console.log(
		`  under full light ${pc(b.flatOver5)} over 5%; worst ` +
			`${(100 * b.flatWorst).toFixed(0)}%, mean ` +
			`${((100 * b.flatSum) / Math.max(1, b.quads)).toFixed(1)}%`,
	);
	console.log(
		`  diagonal on the darker pair: ${pc(b.wrongWay)} of all quads, ` +
			`${((100 * b.wrongOver5) / Math.max(1, b.over5)).toFixed(0)}% of ` +
			`those creased over 5%`,
	);
	const pct = (l: number[], q: number) => `${(100 * at(l, q)).toFixed(0)}%`;
	console.log(
		`  wall crease, worst cases: 90th ${pct(b.creases, 0.9)}, 99th ` +
			`${pct(b.creases, 0.99)}, 99.9th ${pct(b.creases, 0.999)}`,
	);
	console.log(
		`  ${b.fans.toLocaleString("en-US")} cap fans, middle ` +
			`${((100 * b.fanOff) / Math.max(1, b.fans)).toFixed(2)}% off the ` +
			`cap's own average`,
	);
	console.log(
		`    middle off by: 90th ${pct(b.fanOffs, 0.9)}, 99th ` +
			`${pct(b.fanOffs, 0.99)}, worst ${pct(b.fanOffs, 1)}`,
	);
	console.log(
		`    corner spread: 50th ${pct(b.spreads, 0.5)}, 90th ` +
			`${pct(b.spreads, 0.9)}, 99th ${pct(b.spreads, 0.99)}, worst ` +
			`${pct(b.spreads, 1)}`,
	);
}

report("solid blocks (opaque buffer)", solid);
report("leaves (cutout buffer)", leaves);
