import type { Vec3 } from "../../math/Vec3.js";
import type { FaceCell } from "../neighbours/FaceCell.js";
import { directionToCell } from "./directionToCell.js";

/** Which lattice point a world position belongs to. */
export function positionToCell(pos: Vec3, n: number): FaceCell {
	return directionToCell(pos.normalize(), n);
}
