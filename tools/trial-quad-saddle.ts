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

let quads = 0;
let creased = 0;
let over5 = 0;
let over10 = 0;
let worst = 0;
let sum = 0;
let flatWorst = 0;
let flatOver5 = 0;
let wrongWay = 0;
let wrongOver5 = 0;

/** Caps: how far the fan's own middle lands from the polygon's average. */
let fans = 0;
let fromRootZero = 0;
let fromBrightest = 0;
let fromNearest = 0;

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
		{ apron: true, surfaceGrid: shape.blockSize },
	);
	for (const part of [mesh.opaque, mesh.cutout]) {
		const v = part.vertices;
		const ix = part.indices;
		// What the fragment actually multiplies: the colour, which carries
		// the corner occlusion, times the sky the cell stands under.
		const f = (i: number) => lumAt(v, i) * skyAt(v, i);

		// **A wall is two triangles emitted back to back**, sharing the
		// diagonal. A cap is a fan of three or four sharing a root. Both are
		// pairs sharing exactly two vertices, so the uv layout tells them
		// apart.
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
			quads++;
			t += 3;
			const crease = Math.abs(
				f(shared[0]!) + f(shared[1]!) - f(other[0]!) - f(other[1]!),
			);
			const mean =
				(f(shared[0]!) + f(shared[1]!) + f(other[0]!) + f(other[1]!)) /
				4;
			const share = mean > 1e-6 ? crease / mean : 0;
			if (share > 0.01) creased++;
			if (share > 0.05) over5++;
			if (share > 0.1) over10++;
			if (share > worst) worst = share;
			sum += share;

			// The same quad under **Full light**, which replaces every
			// vertex's sky with 1: the product collapses to one interpolated
			// number and the crease with it.
			const g = (i: number) => lumAt(v, i);
			const flat = Math.abs(
				g(shared[0]!) + g(shared[1]!) - g(other[0]!) - g(other[1]!),
			);
			const flatMean =
				(g(shared[0]!) + g(shared[1]!) + g(other[0]!) + g(other[1]!)) /
				4;
			const flatShare = flatMean > 1e-6 ? flat / flatMean : 0;
			if (flatShare > 0.05) flatOver5++;
			if (flatShare > flatWorst) flatWorst = flatShare;

			// **Which way the diagonal runs is the whole of what can be
			// chosen.** The crease is the same size either way -- it is a
			// property of the four corners -- but the diagonal joining the
			// DARKER pair drags that corner's shadow the full width of the
			// quad, where the one joining the brighter pair leaves it in the
			// triangle it belongs to.
			if (f(shared[0]!) + f(shared[1]!) < f(other[0]!) + f(other[1]!)) {
				wrongWay++;
				if (share > 0.05) wrongOver5++;
			}
		}

		// **A fan has no crease -- two triangles sharing a root-to-rim edge
		// interpolate the same two endpoints along it -- so what an arbitrary
		// root costs is not a discontinuity but the value in the MIDDLE.**
		// A hexagon's centre lies on the root's own long diagonal, so the fan
		// paints it `(f(root) + f(opposite)) / 2` where the polygon's own
		// average is the mean of all six. Root at an occluded corner and the
		// whole cap darkens toward it.
		//
		// `emitCap` emits `degree - 2` triangles in a row, all carrying the
		// root and chaining the rim, so a fan is read straight off the index
		// buffer: root, then one new rim corner per triangle.
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
			// The middle under a candidate root: the midpoint of that
			// corner's own long diagonal, which for a hexagon is where the
			// centre falls exactly and for a pentagon is the nearest thing
			// to it.
			const middle = (r: number) =>
				(f(ring[r]!) + f(ring[(r + (degree >> 1)) % degree]!)) / 2;
			let brightest = 0;
			for (let c = 1; c < degree; c++)
				if (f(ring[c]!) > f(ring[brightest]!)) brightest = c;
			let nearest = 0;
			for (let c = 1; c < degree; c++)
				if (Math.abs(middle(c) - mean) < Math.abs(middle(nearest) - mean))
					nearest = c;
			const scale = mean > 1e-6 ? mean : 1;
			fans++;
			// Ring position 0 IS whatever root the mesher chose, so the
			// first of the three is what it draws today and the other two
			// are what the alternative rules would give.
			fromRootZero += Math.abs(middle(0) - mean) / scale;
			fromBrightest += Math.abs(middle(brightest) - mean) / scale;
			fromNearest += Math.abs(middle(nearest) - mean) / scale;
		}
	}
}

const pc = (a: number) => `${((100 * a) / Math.max(1, quads)).toFixed(1)}%`;
console.log(`\n${quads.toLocaleString("en-US")} wall quads`);
console.log(
	"as drawn        " +
		`${pc(creased)} creased at all, ${pc(over5)} over 5%, ` +
		`${pc(over10)} over 10%; worst ${(100 * worst).toFixed(0)}%, ` +
		`mean ${((100 * sum) / Math.max(1, quads)).toFixed(1)}%`,
);
console.log(
	"under full light" +
		`  ${pc(flatOver5)} over 5%; worst ${(100 * flatWorst).toFixed(0)}%`,
);
console.log(
	`\nthe diagonal joins the darker pair on ${pc(wrongWay)} of all quads, ` +
		`and on ${((100 * wrongOver5) / Math.max(1, over5)).toFixed(0)}% of the ` +
		`ones creased over 5% -- which is where a corner's shadow is dragged ` +
		`across the whole face instead of staying in its own triangle.`,
);

console.log(`\n${fans.toLocaleString("en-US")} cap fans`);
const fanPc = (a: number) =>
	`${((100 * a) / Math.max(1, fans)).toFixed(2)}%`;
console.log(
	`  the fan paints its own middle ${fanPc(fromRootZero)} of the cap's ` +
		`average away from that average as drawn, ${fanPc(fromBrightest)} ` +
		`rooted at the brightest corner, ${fanPc(fromNearest)} rooted at ` +
		`whichever diagonal reads closest to the average.`,
);
