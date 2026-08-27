/**
 * How much of the light comes from the sun rather than from the sky.
 *
 * **The two sum to 1, so flat ground under a noon sun reads the same whatever
 * the balance** -- only what stands at an angle to the sun moves. That is what
 * makes this a look rather than a brightness: turning it up deepens the shadow
 * side of everything without changing what an open field comes to.
 *
 * Here rather than beside either renderer, because two of them light ground
 * with it -- the world and the landscape bench's patch -- and a preview lit by a
 * different balance from the world is a preview of a different world.
 */
export const SUN_SHARE = 0.58;
