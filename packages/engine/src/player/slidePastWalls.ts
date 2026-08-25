import type { BlockProbe } from "./BlockProbe.js";
import type { FaceCell } from "../addressing/neighbours/FaceCell.js";
import type { WorldShape } from "../world/WorldShape.js";
import { Vec3 } from "../math/Vec3.js";
import { cellCorners } from "../addressing/lattice/cellCorners.js";
import { BlockType, isSolid } from "../generation/terrain/BlockType.js";
import { latticePosition } from "../addressing/lattice/latticePosition.js";
import { neighbour } from "../addressing/neighbours/neighbour.js";
import { positionToCell } from "../addressing/lookup/positionToCell.js";

/**
 * Metres off a layer boundary the body is measured from.
 *
 * A layer's own radius is its **top**, so a player standing on the ground has
 * their feet exactly on one and `layerOfRadius` reads the solid layer beneath
 * rather than the air they are standing in.
 */
const EDGE = 1e-3;

/**
 * How many times the walls are applied before the answer is taken.
 *
 * Two walls meeting at a corner each undo a little of the other's push, so one
 * pass can leave the player slightly inside one of them. The region wanted is a
 * hexagon inset by a radius smaller than its own inradius -- convex, and never
 * empty -- so applying the walls in turn converges on it, and the loop stops on
 * the pass that moves nothing rather than running them all. Measured against a
 * player driven into each of the six walls of a boxed-in cell in turn, raising
 * this to 6, 10 or 20 moves where they end up not at all.
 */
const PASSES = 3;

/**
 * Move a player from one place to another without entering rock.
 *
 * **A cell wall is a plane through the planet's centre, exactly.** A cell
 * boundary is the radial projection of the flat Voronoi edge between two
 * lattice points, and radially projecting a straight segment leaves every
 * point of it in the plane through that segment and the origin. So the wall
 * toward one neighbour is a single plane, the distance to it is one dot
 * product, and none of that is an approximation of a curved surface.
 *
 * The walls come from the cell holding `from` rather than the one holding
 * `to`: the starting cell is one the player is already standing in, so its
 * solid neighbours are exactly the directions they may not leave in. Reading
 * them off the destination instead answers a question about a cell that may
 * already be the wrong side of the wall.
 *
 * Pushing along the wall's own normal is what makes this a slide rather than a
 * stop -- whatever part of the movement ran along the wall survives it.
 *
 * `radius` must be smaller than the narrowest cell's inradius, which is
 * `0.372` of a block on any world here, or two facing walls ask for a place
 * that does not exist.
 */
export function slidePastWalls(
	from: Vec3,
	to: Vec3,
	shape: WorldShape,
	probe: BlockProbe,
	radius: number,
	height: number,
): Vec3 {
	const n = shape.n;
	const cell = positionToCell(from, n);

	// The layers the body stands in, from the one holding the feet up to the
	// one holding the top of the head. A layer index counts downward, so the
	// head's is the smaller of the two.
	const feet = from.length();
	const lowest = shape.layerOfRadius(feet + EDGE);
	const highest = shape.layerOfRadius(feet + height - EDGE);

	const corners = cellCorners(cell.face, n, cell.i, cell.j);
	const degree = corners.length;
	const centre = latticePosition(cell.face, n, cell.i, cell.j);

	const walls: Vec3[] = [];
	for (let k = 0; k < degree; k++) {
		const nb = neighbour(cell.face, n, cell.i, cell.j, k);
		if (!nb) continue;
		if (!columnStops(nb, shape, probe, lowest, highest)) continue;
		// The wall toward neighbour `k` runs between corners `k - 1` and `k`.
		// A corner is the centroid of the triangle its cell shares with two
		// neighbours, so corner `k` is built from neighbours `k` and `k + 1`
		// and corner `k - 1` from `k - 1` and `k`: both mention `k`, and they
		// are the two ends of that edge.
		const a = corners[(k + degree - 1) % degree]!;
		const b = corners[k]!;
		let normal = a.cross(b).normalize();
		// Pointed out of the cell, so a player inside it reads negative and
		// the clamp below has one sign to test.
		if (centre.dot(normal) > 0) normal = normal.scale(-1);
		walls.push(normal);
	}
	if (walls.length === 0) return to;

	let out = to;
	for (let pass = 0; pass < PASSES; pass++) {
		let pushed = false;
		for (const normal of walls) {
			const past = out.dot(normal) + radius;
			if (past <= 0) continue;
			out = out.sub(normal.scale(past));
			pushed = true;
		}
		if (!pushed) break;
	}

	// A wall plane passes through the planet's centre, so its normal is very
	// nearly tangent here and a push along it barely changes the distance from
	// the centre. Barely is not never, and a wall that lifted or dropped a
	// player would be a wall they could climb: the altitude asked for is held.
	out = out.normalize().scale(to.length());

	// Whatever is left is a corner the walls did not cover, or ground that
	// arrived while the player was standing in it. Neither is somewhere to
	// finish a step, so the step does not happen.
	const landed = positionToCell(out, n);
	return columnStops(landed, shape, probe, lowest, highest) ? from : out;
}

/** Whether a cell's column holds anything solid over the layers a body spans. */
function columnStops(
	cell: FaceCell,
	shape: WorldShape,
	probe: BlockProbe,
	lowest: number,
	highest: number,
): boolean {
	const direction = latticePosition(cell.face, shape.n, cell.i, cell.j);
	for (let layer = Math.max(0, highest); layer <= lowest; layer++) {
		// The middle of the layer, so a body resting on a boundary is never
		// read as being in the layer under it.
		const radius = shape.radiusOfLayer(layer) - shape.blockSize * 0.5;
		const block = probe.blockAtPosition(direction.scale(radius));
		if (isSolid(block as BlockType)) return true;
	}
	return false;
}
