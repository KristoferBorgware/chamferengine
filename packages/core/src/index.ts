export type { Vec3 } from "./Vec3.js";
export { vec3, add, sub, scale, dot, cross } from "./Vec3.js";
export { length, normalize } from "./normalize.js";

export {
	PHI,
	VERTICES,
	FACES,
	FACE_CENTROIDS,
	EDGES,
	faceVertices,
} from "./icosahedron.js";
export {
	NORTH_VERTEX,
	SOUTH_VERTEX,
	MERIDIAN_VERTEX,
	NORTH,
	SOUTH,
	RING_LATITUDE,
} from "./polarAxis.js";

export { latticeWeights } from "./latticeWeights.js";
export { latticePosition } from "./latticePosition.js";
export { cellKey } from "./cellKey.js";
export { hexRound } from "./hexRound.js";
export { faceOf } from "./faceOf.js";
export { barycentricOf } from "./barycentricOf.js";
export { directionToCell, positionToCell, layerOf } from "./positionToCell.js";

export type { PathSplit } from "./splitPath.js";
export { splitPath } from "./splitPath.js";
export { joinPath } from "./joinPath.js";
export { rank, chunkSlots, chunkSide } from "./rank.js";

export type { EdgeLink } from "./faceAdjacency.js";
export { FACE_ADJACENCY } from "./faceAdjacency.js";
export { DIRECTIONS, opposite } from "./DIRECTIONS.js";
export type { FaceCell } from "./neighbour.js";
export {
	neighbour,
	degree,
	pentagonVertex,
	pentagonRing,
} from "./neighbour.js";
export { cellRepresentations, canonicalCell } from "./cellRepresentations.js";

export type { CellFields } from "./CellId.js";
export {
	PLANET_BITS,
	FACE_BITS,
	CORNER_BITS,
	LAYER_BITS,
	LAYER_COUNT,
	wordBits,
	encodeCell,
	decodeCell,
	chunkOf,
} from "./CellId.js";
