import type { NoiseSettings } from "../noise/NoiseSettings.js";
import type { PlantFrame } from "./PlantFrame.js";
import type { PlantShape } from "./PlantShape.js";
import type { PlantSkeleton } from "./PlantSkeleton.js";
import { hash3 } from "../noise/hash3.js";
import { octaveNoise } from "../noise/octaveNoise.js";
import { plantFrame } from "./PlantFrame.js";

/** Seed offsets for the three axes the bend is pushed along. */
const BEND_X = 11;
const BEND_Y = 23;
const BEND_Z = 37;

/** The noise the bend is read off, shared by every plant in a stand. */
function bendSettings(shape: PlantShape): NoiseSettings {
	return {
		frequency: 1 / Math.max(0.5, shape.bendFeature),
		octaves: 2,
		persistence: 0.5,
		lacunarity: 2,
		offsetX: 0,
		offsetY: 0,
		ridge: 0,
	};
}

/**
 * One plant, as a list of tapered rods and a list of leaf clusters.
 *
 * **The walk is in the plant's own frame and everything it records is in the
 * world's.** Working in a frame is what makes a branch angle mean anything --
 * up is up and a spread is a spread; recording in the world is what lets two
 * chunks that both hold this plant put its cells in the same places. The bend
 * is read at world coordinates for the same reason: read in the plant's own
 * frame it would be a different field for every plant, and a stand would not
 * lean together.
 *
 * **A branch is a direction in three dimensions, never a walk along the
 * neighbour ring.** A heading carried along a path does not close -- a loop
 * round an odd number of pentagons comes back rotated one index at any radius
 * -- and 46% of chunks are turned half a turn, so a branch stepping by
 * direction index would grow one shape in one chunk and its mirror in the next.
 * It also never asks for neighbour `k = 5`, which is what keeps the twelve
 * pentagons from needing a case of their own.
 *
 * `blockMetres` sets the step along a limb and the floor under a trunk's
 * radius: a rod thinner than a cell rasterises to a dotted line, and a dotted
 * branch is connected to nothing.
 */
export function growPlant(
	base: readonly [number, number, number],
	stance: PlantFrame,
	shape: PlantShape,
	scale: number,
	seed: number,
	blockMetres: number,
	out: PlantSkeleton,
): void {
	// **Off the trunk, leaves have nothing to hang from.** A cluster sits at a
	// branch tip or the top of a bare trunk, so turning branches off takes the
	// leaves with it.
	const leavesOn = shape.leaves && shape.branches;
	const noise = bendSettings(shape);
	const world: [number, number, number] = [0, 0, 0];
	const out3 = (
		x: number,
		y: number,
		z: number,
	): [number, number, number] => {
		world[0] =
			base[0] +
			stance.east[0] * x +
			stance.up[0] * y +
			stance.north[0] * z;
		world[1] =
			base[1] +
			stance.east[1] * x +
			stance.up[1] * y +
			stance.north[1] * z;
		world[2] =
			base[2] +
			stance.east[2] * x +
			stance.up[2] * y +
			stance.north[2] * z;
		return world;
	};
	const step = Math.max(0.35, blockMetres * 0.6);

	const grow = (
		px: number,
		py: number,
		pz: number,
		dx: number,
		dy: number,
		dz: number,
		len: number,
		rad: number,
		level: number,
		trunk: boolean,
		tag: number,
	): void => {
		const steps = Math.max(2, Math.round(len / step));
		const run = len / steps;
		// **The bend is a displacement from the heading this limb set out on,
		// never a nudge added to the last step.** Accumulated it is a random
		// walk in direction: an 86 m trunk at a 0.4 m step is 215 steps, and a
		// nudge of 0.075 each time wanders about a radian -- which draws as a
		// canopy reaching 40.8 m sideways from a tree 20 m wide. Read as a
		// displacement it is bounded by the knob, and a stand still leans
		// together because the field is the same.
		const sx = dx;
		const sy = dy;
		const sz = dz;
		// Where children leave this limb: spread along the bare fraction of a
		// trunk, gathered at the tip of anything else.
		const from = trunk ? shape.first : 0.82;
		const kids = Math.max(1, Math.round(shape.children));
		const joints: number[][] = [];
		// **Whorls are spread up the trunk, not taken as they come.** Pushing a
		// joint at every step past the bare fraction fills the quota in the
		// first few steps, so every branch leaves within a metre or two of the
		// same height and the tree comes out as a low disc of branches with a
		// bare pole standing out of the top. The heights are worked out first
		// and the walk pushes a joint as it passes each one.
		const whorls: number[] = [];
		if (trunk)
			for (let w = 0; w < kids; w++)
				whorls.push(from + ((0.97 - from) * (w + 0.4)) / kids);
		let nextWhorl = 0;
		// Half way along, for the leaves a limb carries rather than the ones at
		// its end -- pushing those at the tip as well puts two clusters on one
		// point.
		let middle: [number, number, number] | null = null;
		for (let s = 0; s < steps; s++) {
			const ax = px;
			const ay = py;
			const az = pz;
			const at = (s + 1) / steps;
			dx = sx;
			dy = sy;
			dz = sz;
			if (shape.bend > 0) {
				const push = shape.bend * 0.8;
				const w = out3(px, py, pz);
				const wx = w[0];
				const wy = w[1];
				const wz = w[2];
				dx += push * octaveNoise(wx, wy, wz, seed + BEND_X, noise);
				dy +=
					push * 0.4 * octaveNoise(wx, wy, wz, seed + BEND_Y, noise);
				dz += push * octaveNoise(wx, wy, wz, seed + BEND_Z, noise);
			}
			// **The lean is a share of the way along, not a per-step
			// addition**, for the same reason: a limb rises or droops by a
			// fixed amount over its own length whatever that length is. A trunk
			// does neither -- it is what up and droop are measured against.
			if (!trunk) dy += shape.up * at * 0.9 - shape.droop * at * 1.2;
			const m = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
			dx /= m;
			dy /= m;
			dz /= m;
			px += dx * run;
			py += dy * run;
			pz += dz * run;
			const r0 = rad * (1 - (1 - shape.taper) * (s / steps));
			const r1 = rad * (1 - (1 - shape.taper) * at);
			const a3 = out3(ax, ay, az);
			const awx = a3[0];
			const awy = a3[1];
			const awz = a3[2];
			const b3 = out3(px, py, pz);
			out.rods.push(awx, awy, awz, b3[0], b3[1], b3[2], r0, r1);
			if (s === steps >> 1) middle = [b3[0], b3[1], b3[2]];
			// **A trunk carries whorls and a limb forks.** Spreading the
			// children of every limb along its own length reads as one child
			// each, because a 1.6 m twig at a 0.6 m step has one point past the
			// four fifths mark -- the tree then halves its branch count at every
			// level and comes out as a stick. A limb splits at its tip instead,
			// into as many as the row asks for.
			if (level > 0) {
				if (trunk) {
					if (nextWhorl < whorls.length && at >= whorls[nextWhorl]!) {
						nextWhorl++;
						joints.push([px, py, pz, dx, dy, dz, at]);
					}
				} else if (s === steps - 1 && joints.length < 1)
					joints.push([px, py, pz, dx, dy, dz, at]);
			}
		}

		const perJoint = trunk ? 2 : kids;
		if (level > 0)
			for (let j = 0; j < joints.length; j++)
				for (let c = 0; c < perJoint; c++) {
					const [jx, jy, jz, jdx, jdy, jdz, at] = joints[j]! as [
						number,
						number,
						number,
						number,
						number,
						number,
						number,
					];
					// **Round the limb by a hashed angle, not a stored one.**
					// Every plant on the planet is a hash of its own cell, so
					// variety is a multiply rather than a table of authored
					// shapes.
					const turn =
						2 *
						Math.PI *
						(c / perJoint + hash3(c, level * 31 + j, tag, seed));
					const side = plantFrame(jdx, jdy, jdz);
					const lean =
						shape.spread *
						(0.6 + 0.8 * hash3(c + j * 17, tag, level, seed + 5));
					const nx =
						jdx +
						(Math.cos(turn) * side.east[0] +
							Math.sin(turn) * side.north[0]) *
							lean;
					const ny =
						jdy +
						(Math.cos(turn) * side.east[1] +
							Math.sin(turn) * side.north[1]) *
							lean +
						shape.up * 0.3;
					const nz =
						jdz +
						(Math.cos(turn) * side.east[2] +
							Math.sin(turn) * side.north[2]) *
							lean;
					const m = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
					// **A trunk's branches are as long as the trunk left above
					// them, not as long as the trunk.** A fixed share of the
					// whole makes the lowest branch half the tree's height,
					// which is a candelabra; a share of what is left gives a
					// crown that closes at the top.
					const childLen = trunk
						? shape.height *
							scale *
							shape.lengthRatio *
							(1 - at) *
							0.6
						: len * shape.lengthRatio;
					grow(
						jx,
						jy,
						jz,
						nx / m,
						ny / m,
						nz / m,
						childLen,
						rad * shape.radiusRatio,
						level - 1,
						false,
						tag * 7 + c + j * 13 + 1,
					);
				}
		else if (leavesOn) {
			const w = out3(px, py, pz);
			out.clusters.push(w[0], w[1], w[2], shape.leafRadius * scale);
		}
		// Leaves along the limb as well as at its end, in the share **Only at
		// the tips** leaves to the limb.
		if (level <= 1 && leavesOn && shape.leafTip < 1 && middle)
			out.clusters.push(
				middle[0],
				middle[1],
				middle[2],
				shape.leafRadius * scale * (1 - shape.leafTip) * 0.9,
			);
	};

	grow(
		0,
		0,
		0,
		0,
		1,
		0,
		shape.height * scale,
		Math.max(blockMetres * 0.45, shape.trunk * scale),
		shape.branches ? Math.round(shape.levels) : 0,
		true,
		1,
	);
}
