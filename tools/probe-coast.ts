import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import { FLAT_COARSE_LEVEL } from "../packages/client/src/PlanetSettings.js";
import { buildCoarseMap, flatCoarseMap, seedFromString } from "chamfer/generation";
import { positionToCell } from "chamfer/addressing";
import { geographicOf } from "chamfer/coordinates";
import { Vec3 } from "chamfer/math";

const settings = PlanetSettings.fromParams(
	new URLSearchParams(process.argv[2] ?? ""),
);
const seed = seedFromString(settings.knobs.seed);
const map = settings.coarseMapRuns
	? buildCoarseMap(seed, settings.coarseOptions())
	: flatCoarseMap(seed, FLAT_COARSE_LEVEL);
const shape = settings.shapeFor(map);

/** A direction's height above sea level, in metres. */
function heightAt(dir: Vec3): number {
	const cell = positionToCell(dir, shape.n);
	return map.heightAt(cell.face, cell.i, cell.j, settings.depth);
}

// A coast: deep water with land within a few degrees, so a frame from there
// has both the sea and something to see it against.
let best: { dir: Vec3; land: number; sea: number } | null = null;
for (let n = 0; n < 6000; n++) {
	const around = (n * 2.399963229728653) % (2 * Math.PI);
	const z = 1 - (2 * (n % 1499)) / 1499;
	const ring = Math.sqrt(Math.max(0, 1 - z * z));
	const dir = new Vec3(
		Math.cos(around) * ring,
		z,
		Math.sin(around) * ring,
	).normalize();
	if (heightAt(dir) > -5) continue;
	// Look around for land nearby.
	let land = -1e9;
	for (let k = 0; k < 12; k++) {
		const a = (k / 12) * Math.PI * 2;
		const east = new Vec3(0, 1, 0).cross(dir).normalize();
		const north = dir.cross(east).normalize();
		const step = 0.06;
		const probe = dir
			.add(east.scale(Math.cos(a) * step))
			.add(north.scale(Math.sin(a) * step))
			.normalize();
		land = Math.max(land, heightAt(probe));
	}
	if (land < 5) continue;
	const sea = heightAt(dir);
	if (!best || land > best.land) best = { dir, land, sea };
}

if (!best) {
	{
	let deep = 0, high = -1e9, n2 = 0;
	for (let n = 0; n < 3000; n++) {
		const around = (n * 2.399963229728653) % (2 * Math.PI);
		const z = 1 - (2 * (n % 997)) / 997;
		const ring = Math.sqrt(Math.max(0, 1 - z * z));
		const dir = new Vec3(Math.cos(around) * ring, z, Math.sin(around) * ring).normalize();
		const h = heightAt(dir);
		if (h < 0) deep++;
		high = Math.max(high, h);
		n2++;
	}
	console.log(`no coast found; of ${n2} samples ${deep} are under sea level, tallest ${high.toFixed(0)} m`);
}
} else {
	const at = geographicOf(best.dir, settings.radius);
	console.log(
		`coast at ${at.latitude.toFixed(2)},${at.longitude.toFixed(2)} — sea floor ${best.sea.toFixed(0)} m, land within 0.02 rad reaches ${best.land.toFixed(0)} m`,
	);
	console.log(`  &at=${at.latitude.toFixed(2)},${at.longitude.toFixed(2)}`);
}
