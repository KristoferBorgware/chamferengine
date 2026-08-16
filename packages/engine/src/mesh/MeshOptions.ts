/** What a mesher draws beyond the visible surface. */
export interface MeshOptions {
	/**
	 * Whether to close the bottom of the crust.
	 *
	 * The floor sits at the last layer, 435 of them down on the worked planet,
	 * with solid ground the whole way above it. It is 34.6% of a chunk's
	 * triangles and no camera can be under it while the world has no digging in
	 * it, so it is left out and the cost model stays comparable to the surface
	 * one: 4 triangles a cell for a fully exposed cap.
	 */
	readonly crustFloor?: boolean;
}

export const MESH_DEFAULTS = {
	crustFloor: false,
} as const satisfies Required<MeshOptions>;
