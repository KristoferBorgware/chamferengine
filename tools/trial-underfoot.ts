/**
 * The level of detail of the chunk under a standing player's own feet, as a
 * function of how high the ground they stand on is.
 *
 * The report this measures: with `chunkCells=8` and 1,640 m of relief, the
 * cells around the player were whole-chunk sized, as if level of detail had
 * stopped refining. The subdivision-explorer demo, running the same split
 * rule, refines correctly -- because the demo has no terrain, so its eye is
 * always eye-height from the sphere it measures distance against. The engine's
 * player stands on ground above that sphere, and `selectChunks` measured
 * distance to the chunk's centre *at sea level* -- so the ground underfoot on
 * a mountain read as ground a mountain's height away, and was drawn at the
 * level of detail that distance deserves.
 *
 * Run by hand: `npx vite-node tools/trial-underfoot.ts`.
 */
import { selectChunks } from "chamfer/generation";
import { Vec3 } from "chamfer/math";

const K = Math.sqrt((8 * Math.PI) / (10 * Math.sqrt(3)));
const DEPTH = 13;
const BLOCK = 1;
const RADIUS = (BLOCK * 2 ** DEPTH) / K;
const RELIEF = 1640;
const VIEWER = new Vec3(0.3, 0.7, 0.5).normalize();

function underfoot(
	chunkLevel: number,
	detail: number,
	standingOn: number,
): string {
	const chosen = selectChunks(
		DEPTH,
		chunkLevel,
		VIEWER,
		RADIUS + standingOn + 1.86,
		RADIUS,
		detail,
		RELIEF,
	);
	const under = chosen[0]!;
	const cell = BLOCK * 2 ** under.lod;
	return (
		`lod ${under.lod} -> ${cell} m cells, ` +
		`measured ${under.distance.toFixed(0)} m away, ` +
		`${chosen.length} chunks`
	);
}

console.log(`radius ${RADIUS.toFixed(0)} m, relief ${RELIEF} m\n`);
for (const [cells, chunkLevel] of [
	[8, 10],
	[32, 8],
] as const) {
	for (const detail of [1, 2]) {
		console.log(`chunkCells ${cells}, detail ${detail}`);
		for (const standingOn of [0, 244, 600, 1500])
			console.log(
				`  standing on ${String(standingOn).padStart(4)} m ground: ` +
					underfoot(chunkLevel, detail, standingOn),
			);
	}
}
