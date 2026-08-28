export {
	PHI,
	VERTICES,
	FACES,
	FACE_CENTROIDS,
	EDGES,
} from "./solid/icosahedron.js";
export { faceVertices } from "./solid/faceVertices.js";
export {
	NORTH_VERTEX,
	SOUTH_VERTEX,
	MERIDIAN_VERTEX,
	NORTH,
	SOUTH,
	RING_LATITUDE,
} from "./solid/polarAxis.js";
export type { EdgeLink } from "./solid/faceAdjacency.js";
export { FACE_ADJACENCY } from "./solid/faceAdjacency.js";

export { cellOffset } from "./lattice/cellOffset.js";
export { latticeWeights } from "./lattice/latticeWeights.js";
export { latticePosition } from "./lattice/latticePosition.js";
export { cellKey } from "./lattice/cellKey.js";
export { cellCorners } from "./lattice/cellCorners.js";
export { hexRound } from "./lattice/hexRound.js";
export type { PathSplit } from "./lattice/splitPath.js";
export { splitPath } from "./lattice/splitPath.js";
export { joinPath } from "./lattice/joinPath.js";
export { rank } from "./lattice/rank.js";
export { chunkSlots } from "./lattice/chunkSlots.js";
export { chunkSide } from "./lattice/chunkSide.js";

export type { FaceCell } from "./neighbours/FaceCell.js";
export { DIRECTIONS } from "./neighbours/DIRECTIONS.js";
export { opposite } from "./neighbours/opposite.js";
export { neighbour } from "./neighbours/neighbour.js";
export { degree } from "./neighbours/degree.js";
export { pentagonVertex } from "./neighbours/pentagonVertex.js";
export { pentagonRing } from "./neighbours/pentagonRing.js";
export { cellRepresentations } from "./neighbours/cellRepresentations.js";
export { acrossEdge } from "./neighbours/acrossEdge.js";
export { canonicalCell } from "./neighbours/canonicalCell.js";

export type { CellFields } from "./id/CellFields.js";
export type { CellId } from "./id/CellId.js";
export {
	PLANET_BITS,
	FACE_BITS,
	CORNER_BITS,
	LAYER_BITS,
	LAYER_COUNT,
} from "./id/cellIdLayout.js";
export { wordBits } from "./id/wordBits.js";
export { encodeCell } from "./id/encodeCell.js";
export { decodeCell } from "./id/decodeCell.js";
export { chunkOf } from "./id/chunkOf.js";

export { faceOf } from "./lookup/faceOf.js";
export { barycentricOf } from "./lookup/barycentricOf.js";
export { directionToCell } from "./lookup/directionToCell.js";
export { positionToCell } from "./lookup/positionToCell.js";
export { layerOf } from "./lookup/layerOf.js";

export type { RayWorld } from "./ray/RayWorld.js";
export type { RayHit } from "./ray/RayHit.js";
export { faceWeights } from "./ray/faceWeights.js";
export { rayWalk } from "./ray/rayWalk.js";
