/**
 * How big the ball a chunk is culled by is, against the chunk it stands for,
 * and where the extra comes from.
 *
 * The selection tests a ball built from the triangle's own tallest and lowest
 * ground, widened by a margin that grows with distance. A ball much larger than
 * the ground inside it refuses almost nothing, and there are three places the
 * extra can come from: the span from the triangle's floor to its peak, the
 * margin, and the pyramid's own cap, below which a small triangle is credited
 * with a much larger one's figures.
 *
 *   npx vite-node tools/trial-bounds.ts -- "<query string>"
 */
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import { FLAT_COARSE_LEVEL } from "../packages/client/src/PlanetSettings.js";
import {
	CAPPED_LEVEL,
	ChunkPeaks,
	buildCoarseMap,
	chunkCenter,
	flatCoarseMap,
	seedFromString,
	selectChunks,
} from "chamfer/generation";
import { ChunkAddress } from "chamfer/generation";
import { Frustum, Mat4, Vec3 } from "chamfer/math";

const QUERY = process.argv[2] ?? "";
const settings = PlanetSettings.fromParams(new URLSearchParams(QUERY));
const RADIUS = settings.radius;
const DEPTH = settings.depth;
const CHUNK_LEVEL = settings.chunkLevel;
const FIELD_OF_VIEW = (65 * Math.PI) / 180;

const seed = seedFromString(settings.knobs.seed);
const map = settings.coarseMapRuns
	? buildCoarseMap(seed, settings.coarseOptions())
	: flatCoarseMap(seed, FLAT_COARSE_LEVEL);
const shape = settings.shapeFor(map);
const peaks = new ChunkPeaks(map, settings.knobs.blockSize, CHUNK_LEVEL);
const slack = Math.tan((settings.knobs.cullMargin * Math.PI) / 180);

console.log(
	`radius ${RADIUS.toFixed(0)} m, depth ${DEPTH}, chunk level ${CHUNK_LEVEL}, ` +
		`chunk ${settings.knobs.chunkCells} cells, relief ${settings.knobs.relief} m, ` +
		`cull margin ${settings.knobs.cullMargin}° (slack ${slack.toFixed(3)} m per m)`,
);
console.log(
	`the peaks pyramid stops at level ${CAPPED_LEVEL}; a chunk at level ${CHUNK_LEVEL} ` +
		(CHUNK_LEVEL > CAPPED_LEVEL
			? `reads its level-${CAPPED_LEVEL} ancestor, ${4 ** (CHUNK_LEVEL - CAPPED_LEVEL)} triangles wide`
			: "has its own entry"),
);

/** A camera standing on the ground, looking along it. */
const ground = new Vec3(0.31, 0.58, 0.75).normalize();
const eye = ground.scale(RADIUS + 2);
const east = ground.cross(new Vec3(0, 1, 0)).normalize();
const target = eye.add(east.scale(200));
const view = Mat4.lookAt(
	[eye.x, eye.y, eye.z],
	[target.x, target.y, target.z],
	[ground.x, ground.y, ground.z],
);
const projection = Mat4.perspective(FIELD_OF_VIEW, 1280 / 800, 0.2, RADIUS * 20);
const frustum = new Frustum(projection.multiply(view));

const wanted = selectChunks(
	DEPTH,
	CHUNK_LEVEL,
	eye,
	eye.length(),
	RADIUS,
	settings.knobs.detail,
	shape.maxElevation,
	peaks,
	frustum,
	slack,
);

console.log(`\n${wanted.length} chunks selected from where a player stands.`);

// ---- 1. the ball against the chunk it stands for ---------------------------
console.log("\n1. how big the ball is, against the chunk inside it");
{
	const rows = new Map<
		number,
		{ n: number; ratio: number; width: number; radius: number }
	>();
	for (const selection of wanted) {
		if (!selection.bound) continue;
		const extent = chunkCenter(
			ChunkAddress.fromKey(selection.key, selection.chunkLevel),
			DEPTH,
			selection.chunkLevel,
		);
		// The triangle's own width on the ground, the same figure the walk uses
		// to decide detail.
		const spread = Math.acos(Math.min(1, extent.cosRadius));
		const width = 2 * spread * RADIUS;
		const row = rows.get(selection.lod) ?? {
			n: 0,
			ratio: 0,
			width: 0,
			radius: 0,
		};
		row.n++;
		row.ratio += selection.bound.radius / (width / 2);
		row.width += width;
		row.radius += selection.bound.radius;
		rows.set(selection.lod, row);
	}
	console.log("   lod   chunks   chunk across   ball radius   ball ÷ half the chunk");
	for (const lod of [...rows.keys()].sort((a, b) => a - b)) {
		const row = rows.get(lod)!;
		console.log(
			`   ${String(lod).padStart(3)}   ${String(row.n).padStart(6)}` +
				`   ${(row.width / row.n).toFixed(1).padStart(12)} m` +
				`   ${(row.radius / row.n).toFixed(1).padStart(11)} m` +
				`   ${(row.ratio / row.n).toFixed(2).padStart(21)}x`,
		);
	}
	console.log("");
	console.log("   A ball that fits the ground would be about 1x. Higher is volume");
	console.log("   the chunk does not occupy, and every metre of it is ground the");
	console.log("   cull cannot refuse.");
}

// ---- 2. where the extra comes from -----------------------------------------
console.log("\n2. what each part contributes to the radius");
{
	let n = 0;
	let fromSpan = 0;
	let fromWidth = 0;
	let fromSlack = 0;
	let worstSpan = 0;
	for (const selection of wanted) {
		if (!selection.bound) continue;
		const address = ChunkAddress.fromKey(selection.key, selection.chunkLevel);
		const extent = chunkCenter(address, DEPTH, selection.chunkLevel);
		const spread = Math.acos(Math.min(1, extent.cosRadius));
		const peak = peaks.peakOf(selection.key, selection.chunkLevel);
		const trough = peaks.troughOf(selection.key, selection.chunkLevel);
		const span = Math.max(0, peak) - Math.min(0, trough);
		// The ball has to hold a cap: half its vertical span, and half its width.
		const half = span / 2;
		const across = spread * (RADIUS + Math.max(0, peak));
		n++;
		fromSpan += half;
		fromWidth += across;
		fromSlack += selection.distance * slack;
		if (span > worstSpan) worstSpan = span;
	}
	const total = fromSpan + fromWidth + fromSlack;
	const share = (part: number) => `${((100 * part) / total).toFixed(1)}%`;
	console.log(`   averaged over ${n} chunks, the radius is made of:`);
	console.log(
		`   the triangle's own width ...... ${(fromWidth / n).toFixed(1).padStart(8)} m   ${share(fromWidth)}`,
	);
	console.log(
		`   half its floor-to-peak span ... ${(fromSpan / n).toFixed(1).padStart(8)} m   ${share(fromSpan)}`,
	);
	console.log(
		`   the margin, at its distance ... ${(fromSlack / n).toFixed(1).padStart(8)} m   ${share(fromSlack)}`,
	);
	console.log(`   the widest floor-to-peak span found: ${worstSpan.toFixed(0)} m`);
}

// ---- 3. what the cap on the pyramid costs ----------------------------------
console.log("\n3. what the pyramid's cap costs a chunk below it");
{
	if (CHUNK_LEVEL <= CAPPED_LEVEL) {
		console.log("   Nothing: every chunk at this cut has an entry of its own.");
	} else {
		// The real span of each chunk's own ground, against the ancestor's.
		let n = 0;
		let credited = 0;
		let own = 0;
		const m = 1 << (DEPTH - CHUNK_LEVEL);
		for (const selection of wanted.slice(0, 400)) {
			const address = ChunkAddress.fromKey(selection.key, selection.chunkLevel);
			let high = -Infinity;
			let low = Infinity;
			for (let q = 0; q <= m; q += 4)
				for (let r = 0; q + r <= m; r += 4) {
					const h = map.heightAt(
						address.face,
						...(joinAt(address, q, r) as [number, number]),
						DEPTH,
					);
					if (h > high) high = h;
					if (h < low) low = h;
				}
			if (!isFinite(high)) continue;
			n++;
			own += Math.max(0, high) - Math.min(0, low);
			credited +=
				Math.max(0, peaks.peakOf(selection.key, selection.chunkLevel)) -
				Math.min(0, peaks.troughOf(selection.key, selection.chunkLevel));
		}
		console.log(
			`   over ${n} chunks: the ground each one actually spans is ${(own / n).toFixed(1)} m,`,
		);
		console.log(
			`   and the pyramid credits it with ${(credited / n).toFixed(1)} m -- ${(credited / own).toFixed(2)}x.`,
		);
	}
}

/** A chunk-local offset as lattice coordinates at full depth. */
function joinAt(address: ChunkAddress, q: number, r: number): number[] {
	let n = 1 << (DEPTH - address.path.length);
	let i = q;
	let j = r;
	for (let l = address.path.length - 1; l >= 0; l--) {
		const d = address.path[l]!;
		if (d === 1) i += n;
		else if (d === 2) j += n;
		else if (d === 3) {
			i = n - i;
			j = n - j;
		}
		n <<= 1;
	}
	return [i, j];
}
