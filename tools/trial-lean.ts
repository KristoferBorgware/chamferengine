// Does a stand lean together?
//
// `growPlant`'s own comment says the bend is read at world coordinates so that
// neighbouring plants share the field, and the panel's **Bend feature** row
// says the same in as many words. But the seed handed to `growPlant` is
// `seed + floor(roll * 100000)`, and `roll` is a hash of the plant's own cell
// -- so every plant reads its own field. This measures which is true: grow a
// line of plants a few metres apart, take the direction each trunk's top has
// leaned in, and see whether neighbours agree.
import { PLANT_SPECIES } from "../packages/engine/src/generation/plants/PLANT_SPECIES.js";
import { Vec3 } from "../packages/engine/src/math/Vec3.js";
import { emptySkeleton } from "../packages/engine/src/generation/plants/PlantSkeleton.js";
import { growPlant } from "../packages/engine/src/generation/plants/growPlant.js";
import { hash3 } from "../packages/engine/src/generation/noise/hash3.js";
import { plantFrame } from "../packages/engine/src/generation/plants/PlantFrame.js";

const RADIUS = 6800.7;
const BLOCK = 1;
const SEED = 12345;
const ROLL_SEED_OFFSET = 55;
const SPACING = Number(process.argv[2] ?? 2);
const shape = { ...PLANT_SPECIES.Pine!, bend: 0.6, bendFeature: 20 };

/** The horizontal direction the top of one trunk has leaned in. */
function lean(step: number, ownSeed: boolean): [number, number, number] {
	// A line of roots along one great circle, `step` metres apart.
	const angle = (step * SPACING) / RADIUS;
	const up = new Vec3(Math.cos(angle), Math.sin(angle), 0).normalize();
	const base: [number, number, number] = [
		up.x * RADIUS,
		up.y * RADIUS,
		up.z * RADIUS,
	];
	const stance = plantFrame(up.x, up.y, up.z);
	const skeleton = emptySkeleton();
	const roll = hash3(step, 7, step * 3, (SEED + ROLL_SEED_OFFSET) | 0);
	// The engine's own seed, against one shared by the whole stand.
	const seed = ownSeed ? (SEED + Math.floor(roll * 100000)) | 0 : SEED;
	growPlant(base, stance, shape, 1, seed, BLOCK, skeleton);
	// The highest point the walk reached, which is the top of the trunk: rods
	// are eight numbers each, and the second point of each is its far end.
	let best = 0;
	let at = 0;
	for (let r = 0; r + 8 <= skeleton.rods.length; r += 8) {
		const dx = skeleton.rods[r + 3]! - base[0];
		const dy = skeleton.rods[r + 4]! - base[1];
		const dz = skeleton.rods[r + 5]! - base[2];
		const along = dx * up.x + dy * up.y + dz * up.z;
		if (along > best) {
			best = along;
			at = r;
		}
	}
	const dx = skeleton.rods[at + 3]! - base[0];
	const dy = skeleton.rods[at + 4]! - base[1];
	const dz = skeleton.rods[at + 5]! - base[2];
	const along = dx * up.x + dy * up.y + dz * up.z;
	const ex = dx - up.x * along;
	const ey = dy - up.y * along;
	const ez = dz - up.z * along;
	const len = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1;
	return [ex / len, ey / len, ez / len];
}

for (const ownSeed of [true, false]) {
	let agree = 0;
	let n = 0;
	let last: [number, number, number] | null = null;
	for (let s = 0; s < 200; s++) {
		const now = lean(s, ownSeed);
		if (last) {
			agree += last[0] * now[0] + last[1] * now[1] + last[2] * now[2];
			n++;
		}
		last = now;
	}
	console.log(
		(ownSeed ? "a seed per plant (what ships)" : "one seed for the stand")
			.padEnd(32) +
			` neighbours agree ${(agree / n).toFixed(3)}`,
	);
}
