// v0.2.0 I-4. The selection reaches for `horizonAngle(eye) + horizonAngle(peak)`
// with one planet-wide peak, so every chunk that could hold visible ground if
// the tallest mountain on the planet stood in it is built. This measures how
// many of those chunks hold nothing near that tall, by giving each triangle its
// own peak from the coarse map -- which is candidate A -- and counting what
// falls out. It also checks that nothing holding visible ground is dropped.
//
// Wall-clock figures here are timings and move run to run. The counts do not.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import { buildCoarseMap, selectChunks, seedFromString } from "chamfer/generation";
import { ChunkAddress, chunkCenter } from "chamfer/generation";
import { joinPath } from "chamfer/addressing";
import type { CoarseMap } from "chamfer/generation";

const WORLDS = [
	{ label: "shipped, 200 m relief", knobs: { plain: false } },
	{ label: "tall, 600 m relief   ", knobs: { plain: false, heightScale: 600, crustMetres: 1024 } },
	{ label: "islands, 10% land    ", knobs: { plain: false, landFraction: 0.1 } },
	{ label: "tall islands         ", knobs: { plain: false, heightScale: 600, landFraction: 0.1, crustMetres: 1024 } },
];
for (const world of WORLDS) run(world.label, world.knobs);

function run(label: string, knobs: Record<string, unknown>): void {
const settings = new PlanetSettings(knobs);
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const shape = settings.shapeFor(map);
const R = settings.radius;
const scale = settings.knobs.heightScale;

/** How far over the reference sphere a viewer at `r` sees. */
const horizonAngle = (r: number) => Math.acos(Math.min(1, R / r));

/**
 * The tallest ground inside one chunk's triangle, in metres above sea level.
 *
 * Read off the coarse map's own lattice rather than the world's: the triangle
 * covers `(m+1)(m+2)/2` coarse cells where `m = 2^(mapLevel - chunkLevel)`, so
 * a face-sized triangle is 33,153 reads and a finest chunk is one.
 */
function peakOf(address: ChunkAddress, chunkLevel: number): number {
	const mapLevel = map.level;
	if (chunkLevel > mapLevel) {
		const [i, j] = joinPath(address.path.slice(0, mapLevel), 0, 0, mapLevel);
		return (map.heightAt(address.face, i, j, mapLevel) - map.seaLevel) * scale;
	}
	const m = 1 << (mapLevel - chunkLevel);
	let highest = -Infinity;
	for (let q = 0; q <= m; q++)
		for (let r = 0; q + r <= m; r++) {
			const [i, j] = joinPath(address.path, q, r, mapLevel);
			const h = map.heightAt(address.face, i, j, mapLevel);
			if (h > highest) highest = h;
		}
	return (highest - map.seaLevel) * scale;
}

/**
 * The selection's own walk, with the horizon computed from each triangle's own
 * tallest ground rather than the planet's. Every other line is the shipped
 * one, so the two counts differ by the peak term and nothing else.
 */
function selectWithOwnPeak(viewerRadius: number): number {
	const eyeZ = viewerRadius;
	const eyeHorizon = horizonAngle(viewerRadius);
	let count = 0;
	let missed = 0;
	const walk = (address: ChunkAddress, chunkLevel: number): void => {
		const extent = chunkCenter(address, settings.depth, chunkLevel);
		const cos = extent.z;
		const spread = Math.acos(Math.min(1, extent.cosRadius));
		const peak = Math.max(0, peakOf(address, chunkLevel));
		const horizon = eyeHorizon + horizonAngle(R + peak);
		if (cos < Math.cos(Math.min(Math.PI, horizon + spread))) {
			// Nothing under this triangle stands tall enough to clear the
			// horizon. Confirm that by asking the shipped bound as well.
			const wide = eyeHorizon + horizonAngle(R + shape.maxElevation);
			if (cos >= Math.cos(Math.min(Math.PI, wide + spread))) missed++;
			return;
		}
		const dx = extent.x * R;
		const dy = extent.y * R;
		const dz = extent.z * R - eyeZ;
		const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
		const width = 2 * spread * R;
		if (chunkLevel < settings.chunkLevel && distance < settings.knobs.detail * width) {
			for (let child = 0; child < 4; child++)
				walk(new ChunkAddress(address.face, [...address.path, child]), chunkLevel + 1);
			return;
		}
		count++;
	};
	for (let face = 0; face < 20; face++) walk(new ChunkAddress(face, []), 0);
	prunedSubtrees = missed;
	return count;
}
let prunedSubtrees = 0;

console.log(`\n${label}  --  tallest ground ${shape.maxElevation} m, ${(100*settings.knobs.landFraction).toFixed(0)}% land`);
console.log("   eye        today   own peak   fewer");

for (const eye of [1.7, 60, 300]) {
	const r = R + eye;
	const today = selectChunks(
		settings.depth, settings.chunkLevel, { x: 0, y: 0, z: r },
		r, R, settings.knobs.detail, shape.maxElevation,
	).length;
	const own = selectWithOwnPeak(r);
	console.log(
		`   ${String(eye).padStart(5)} m   ${String(today).padStart(5)}   ` +
			`${String(own).padStart(6)}   ` +
			`${String(100 - Math.round((100 * own) / today)).padStart(4)}%`,
	);
}
}
