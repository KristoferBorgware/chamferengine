/**
 * How much of the ground stands under a cloud, and where.
 *
 * The renderer answers this with a coverage map drawn from the sun, which is
 * hard to argue with because the only way to look at it is to take a frame and
 * hope a cloud happens to be over the part of the ground in view. This is the
 * same question asked on the CPU against the real puffs: how much of the sky
 * is cloud, how much of a patch of ground is shaded, and how far each shadow
 * lands from the cloud that throws it.
 *
 *   npx vite-node tools/trial-cloud-shadow.ts -- "<query string>"
 */
import {
	FLAT_COARSE_LEVEL,
	PlanetSettings,
} from "../packages/client/src/PlanetSettings.js";
import {
	buildCoarseMap,
	flatCoarseMap,
	seedFromString,
} from "chamfer/generation";
import { generateCloudPuffs } from "chamfer/sky";
import { Vec3 } from "chamfer/math";
import { positionOf } from "chamfer/coordinates";

const settings = PlanetSettings.fromParams(
	new URLSearchParams(process.argv[2] ?? "seed=chamfer"),
);
const knobs = settings.knobs;

const seed = seedFromString(knobs.seed);
const map = settings.coarseMapRuns
	? buildCoarseMap(seed, settings.coarseOptions())
	: flatCoarseMap(seed, FLAT_COARSE_LEVEL);
const shape = settings.shapeFor(map);
const SEA = shape.seaLevelRadius;

// The two decks, exactly as the client builds them.
const further = Math.max(1, knobs.highDeck / Math.max(1, knobs.lowDeck));
const puffs = generateCloudPuffs(seed, knobs.cloudClusters, knobs.cloudDensity, [
	{
		radius: shape.crustTopRadius + knobs.lowDeck,
		windRate: (2 * Math.PI) / 900,
		size: knobs.cloudPuff,
		spread: knobs.cloudSpread,
		thickness: knobs.cloudPuff * 1.1,
	},
	{
		radius: shape.crustTopRadius + knobs.highDeck,
		windRate: (2 * Math.PI) / 1500,
		size: knobs.cloudPuff * further * 0.9,
		spread: knobs.cloudSpread * further * 0.75,
		thickness: knobs.cloudPuff * further * 0.55,
	},
]);

const places = puffs.map((puff) => puff.direction.scale(puff.radius));

console.log(
	`radius ${SEA.toFixed(0)} m, decks ${(shape.crustTopRadius + knobs.lowDeck).toFixed(0)} ` +
		`and ${(shape.crustTopRadius + knobs.highDeck).toFixed(0)} m, ` +
		`${knobs.cloudClusters} clusters, ${puffs.length} puffs`,
);

// **How much of the sky is cloud**, which is the ceiling on how much of the
// ground a cloud shadow can ever cover: a beam is blocked exactly when it
// meets a puff, so the two fractions are the same number seen from two ends.
// Measured by looking straight out from a great many directions rather than by
// adding up puff areas, because the puffs overlap heavily inside a formation.
{
	let hit = 0;
	const LOOKS = 40_000;
	for (let n = 0; n < LOOKS; n++) {
		// Evenly over the sphere: the golden-angle spiral.
		const y = 1 - (2 * (n + 0.5)) / LOOKS;
		const r = Math.sqrt(Math.max(0, 1 - y * y));
		const a = n * 2.399963229728653;
		const dir = new Vec3(r * Math.cos(a), y, r * Math.sin(a));
		if (blocked(dir.scale(SEA), dir)) hit++;
	}
	console.log(`sky covered ${((100 * hit) / LOOKS).toFixed(2)}%, straight up`);
}

/** Whether a ray from `from` along `along` meets any puff. */
function blocked(from: Vec3, along: Vec3): boolean {
	for (let n = 0; n < places.length; n++) {
		const c = places[n]!;
		const dx = c.x - from.x;
		const dy = c.y - from.y;
		const dz = c.z - from.z;
		const t = dx * along.x + dy * along.y + dz * along.z;
		if (t <= 0) continue;
		const size = puffs[n]!.size;
		const across = dx * dx + dy * dy + dz * dz - t * t;
		if (across < size * size) return true;
	}
	return false;
}

/** East and north at a place, for laying a patch out over the ground. */
function frameAt(up: Vec3): { east: Vec3; north: Vec3 } {
	const pole = Math.abs(up.y) > 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
	const east = up.cross(pole).normalize();
	return { east, north: east.cross(up).normalize() };
}

// **How much of a patch of ground is shaded**, at several sun heights. The
// answer is the sky figure above wherever the sun is high, and drifts off it
// as the sun drops, because the beam then crosses the deck at a slant and
// travels much further through the height the clouds are spread over.
const centre = positionOf(
	{
		latitude: Number(process.argv[3] ?? 12),
		longitude: Number(process.argv[4] ?? 40),
		altitude: 0,
	},
	1,
);
const { east, north } = frameAt(centre);
const SIZE = 96;
const SPAN = 4000;
for (const degrees of [10, 20, 30, 40, 50, 60, 70, 80, 88]) {
	const angle = (degrees * Math.PI) / 180;
	const sun = centre
		.scale(Math.sin(angle))
		.add(east.scale(Math.cos(angle)))
		.normalize();
	let shaded = 0;
	for (let row = 0; row < SIZE; row++)
		for (let col = 0; col < SIZE; col++) {
			const x = ((col - SIZE / 2) * SPAN) / SIZE / SEA;
			const y = ((row - SIZE / 2) * SPAN) / SIZE / SEA;
			const up = centre
				.add(east.scale(x))
				.add(north.scale(y))
				.normalize();
			if (blocked(up.scale(SEA + 2), sun)) shaded++;
		}
	// How far a shadow lands from the cloud that throws it, over the low deck.
	const throwOff = knobs.lowDeck / Math.tan(angle);
	console.log(
		`sun ${String(degrees).padStart(2)} deg: ` +
			`${((100 * shaded) / (SIZE * SIZE)).toFixed(2)}% of a ` +
			`${SPAN} m patch shaded, low deck throws ${throwOff.toFixed(0)} m`,
	);
}
