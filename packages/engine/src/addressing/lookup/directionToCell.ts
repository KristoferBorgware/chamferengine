import type { Vec3 } from "../../math/Vec3.js";
import type { FaceCell } from "../neighbours/FaceCell.js";
import { hexRound } from "../lattice/hexRound.js";
import { barycentricOf } from "./barycentricOf.js";
import { faceOf } from "./faceOf.js";

/**
 * Which lattice point a direction belongs to, at subdivision `n`.
 *
 * Three steps, all arithmetic: nearest face centroid, then where inside that
 * face, then round to a lattice point. Nothing is looked up and nothing is
 * stored, so a planet of any size costs the same.
 *
 * A cell is by definition the set of directions this maps to it. That is the
 * radial projection of the lattice point's flat Voronoi hexagon, and taking it
 * as the definition makes this step exact rather than a 1% approximation of
 * some other partition.
 */
export function directionToCell(dir: Vec3, n: number): FaceCell {
	const face = faceOf(dir);
	const [a, b, c] = barycentricOf(face, dir);
	const [, ri, rj] = hexRound(a * n, b * n, c * n, n);
	return { face, i: ri, j: rj };
}
