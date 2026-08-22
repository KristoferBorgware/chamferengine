/**
 * Anything that draws itself into a shadow map.
 *
 * A caster is asked once per cascade and draws its own geometry with its own
 * pipeline. It is handed the pass and which cascade it is filling, and it
 * decides what of itself is worth drawing at that size -- the nearest cascade
 * is a few tens of metres across and the furthest is hundreds, so a thing too
 * small to leave a texel in the far one may skip it.
 *
 * **This is the whole reason a shadow map exists here alongside the walk over
 * the coarse map.** The map knows where the ground is and nothing else, so it
 * can never show a mob, a player or a placed block. A caster can.
 */
export interface ShadowCaster {
	/**
	 * Draw into one cascade.
	 *
	 * Group 0 is already bound to that cascade's own light matrix, and stays
	 * bound unless the caster sets a pipeline with a shorter layout. Nothing
	 * else is set: a caster binds its own vertex buffers and whatever groups
	 * its own pipeline declares from 1 onward.
	 */
	castShadow(pass: GPURenderPassEncoder, cascade: number): void;
}
