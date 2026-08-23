/**
 * How big the volume a chunk is culled by is, against the chunk it stands for,
 * and where the extra comes from.
 *
 * The selection tests a box built from the triangle's own tallest and lowest
 * ground. A volume much larger than the ground inside it refuses almost
 * nothing, and there are three places the extra can come from: the span from
 * the triangle's floor to its peak, the pyramid's own cap -- below which a
 * small triangle is credited with a much larger one's figures -- and the shape
 * itself, which is why this reports the ball the box replaced beside it.
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
	chunkWedge,
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
const aspect = 1280 / 800;
const projection = Mat4.perspective(FIELD_OF_VIEW, aspect, 0.2, RADIUS * 20);

/** The client's widened cull frustum: the margin as an angle on the view. */
const margin = (settings.knobs.cullMargin * Math.PI) / 180;
const halfUp = FIELD_OF_VIEW / 2;
const halfAcross = Math.atan(Math.tan(halfUp) * aspect);
const wideUp = Math.max(
	halfUp + margin,
	Math.atan(Math.tan(Math.min(1.5, halfAcross + margin)) / aspect),
);
const frustum = new Frustum(
	Mat4.perspective(
		Math.min(3.0, 2 * wideUp),
		aspect,
		0.2,
		RADIUS * 20,
	).multiply(view),
);
const tight = new Frustum(projection.multiply(view));

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
);

const onScreen = selectChunks(
	DEPTH,
	CHUNK_LEVEL,
	eye,
	eye.length(),
	RADIUS,
	settings.knobs.detail,
	shape.maxElevation,
	peaks,
	tight,
);
console.log(
	`\n${wanted.length} chunks selected from where a player stands ` +
		`(${onScreen.length} with no margin at all, so the margin keeps ` +
		`${wanted.length - onScreen.length} more).`,
);

// ---- 1. the box against the chunk it stands for ----------------------------
console.log("\n1. how big the volume is, against the chunk inside it");
{
	const rows = new Map<
		number,
		{
			n: number;
			ratio: number;
			ball: number;
			width: number;
			deep: number;
			across: number;
		}
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
			ball: 0,
			width: 0,
			deep: 0,
			across: 0,
		};
		// The box's own volume against the ball that would have to hold it,
		// which is the whole reason the shape changed.
		const halves = selection.bound.halves;
		const boxVolume = 8 * halves[0] * halves[1] * halves[2];
		const ballRadius = Math.hypot(...halves);
		row.n++;
		row.ratio += boxVolume / (width / 2) ** 3;
		row.ball += ((4 / 3) * Math.PI * ballRadius ** 3) / boxVolume;
		row.width += width;
		row.deep += 2 * halves[0];
		row.across += 2 * halves[1];
		rows.set(selection.lod, row);
	}
	console.log(
		"   lod   chunks   chunk across   box across   box deep   a ball round the box",
	);
	for (const lod of [...rows.keys()].sort((a, b) => a - b)) {
		const row = rows.get(lod)!;
		console.log(
			`   ${String(lod).padStart(3)}   ${String(row.n).padStart(6)}` +
				`   ${(row.width / row.n).toFixed(1).padStart(12)} m` +
				`   ${(row.across / row.n).toFixed(1).padStart(10)} m` +
				`   ${(row.deep / row.n).toFixed(1).padStart(8)} m` +
				`   ${(row.ball / row.n).toFixed(1).padStart(19)}x the volume`,
		);
	}
	console.log("");
	console.log("   The last column is what the shape is worth: how much bigger the");
	console.log("   ball this box replaced would have been. It is small while the");
	console.log("   ground is a thin cap and grows with every metre anybody digs.");
}

// ---- 2. what the volume is made of, and what the margin keeps --------------
console.log("\n2. what the volume is made of");
{
	let n = 0;
	let fromSpan = 0;
	let fromWidth = 0;
	let worstSpan = 0;
	for (const selection of wanted) {
		if (!selection.bound) continue;
		const address = ChunkAddress.fromKey(selection.key, selection.chunkLevel);
		const extent = chunkCenter(address, DEPTH, selection.chunkLevel);
		const spread = Math.acos(Math.min(1, extent.cosRadius));
		const peak = peaks.peakOf(selection.key, selection.chunkLevel);
		const trough = peaks.troughOf(selection.key, selection.chunkLevel);
		const span = Math.max(0, peak) - Math.min(0, trough);
		n++;
		fromSpan += span / 2;
		fromWidth += spread * (RADIUS + Math.max(0, peak));
		if (span > worstSpan) worstSpan = span;
	}
	const total = fromSpan + fromWidth;
	const share = (part: number) => `${((100 * part) / total).toFixed(1)}%`;
	console.log(`   averaged over ${n} chunks, and the box holds both at once:`);
	console.log(
		`   the triangle's own width ...... ${(fromWidth / n).toFixed(1).padStart(8)} m   ${share(fromWidth)}`,
	);
	console.log(
		`   half its floor-to-peak span ... ${(fromSpan / n).toFixed(1).padStart(8)} m   ${share(fromSpan)}`,
	);
	console.log(`   the widest floor-to-peak span found: ${worstSpan.toFixed(0)} m`);
	console.log("");
	console.log("   The margin is not in this list. It is an angle on the view, so it");
	console.log("   widens the four side planes and leaves every volume the size of");
	console.log("   the world inside it.");
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

// ---- 4. what a shaft costs each shape --------------------------------------
console.log("\n4. what one chunk dug to the bottom of the crust costs");
{
	const crust = shape.crustDepth * settings.knobs.blockSize;
	const finest = wanted.filter((selection) => selection.lod === 0);
	const one = finest[0] ?? wanted[0]!;
	const extent = chunkCenter(
		ChunkAddress.fromKey(one.key, one.chunkLevel),
		DEPTH,
		one.chunkLevel,
	);
	const spread = Math.acos(Math.min(1, extent.cosRadius));
	const width = 2 * spread * RADIUS;
	const peak = Math.max(0, peaks.peakOf(one.key, one.chunkLevel));
	const trough = Math.min(0, peaks.troughOf(one.key, one.chunkLevel));
	for (const [what, deep] of [
		["ground only", 0],
		["dug a quarter of the crust", crust / 4],
		["dug to the bottom", crust],
	] as [string, number][]) {
		const high = RADIUS + peak;
		const low = RADIUS + trough - deep;
		const box = chunkWedge(extent, low, high);
		const ball = Math.hypot(...box.halves);
		const boxVolume = 8 * box.halves[0] * box.halves[1] * box.halves[2];
		const ballVolume = (4 / 3) * Math.PI * ball ** 3;
		console.log(
			`   ${what.padEnd(27)} box ${(2 * box.halves[0]).toFixed(0).padStart(5)} m deep` +
				` x ${(2 * box.halves[1]).toFixed(0).padStart(4)} m across` +
				`   ball radius ${ball.toFixed(0).padStart(5)} m` +
				`   ${(ballVolume / boxVolume).toFixed(0).padStart(4)}x the volume`,
		);
	}
	console.log("");
	console.log(
		`   The chunk itself is ${width.toFixed(0)} m across and the crust is ` +
			`${crust.toFixed(0)} m deep.`,
	);
	console.log("   A ball cannot be grown downward alone, so digging one shaft makes");
	console.log("   the whole neighbourhood vote to be drawn. The box grows down only.");
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
