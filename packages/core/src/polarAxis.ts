import { VERTICES } from "./icosahedron.js";
import type { Vec3 } from "./Vec3.js";

/**
 * The coordinate axis, and the vertex the prime meridian runs through.
 *
 * All six antipodal pentagon pairs give the same world seen from a different
 * angle, so the choice cannot be made on merit. It is settled on the face
 * table instead: `0`-`3` is the only pair whose polar caps are contiguous runs
 * of face indices.
 *
 * Every latitude and longitude in every world depends on these three numbers.
 * Changing one moves every coordinate ever shared.
 */
export const NORTH_VERTEX = 0;
export const SOUTH_VERTEX = 3;
export const MERIDIAN_VERTEX = 11;

/** The north pole as a unit direction. */
export const NORTH: Vec3 = VERTICES[NORTH_VERTEX]!;

/** The south pole as a unit direction. */
export const SOUTH: Vec3 = VERTICES[SOUTH_VERTEX]!;

/**
 * The latitude of the two pentagon rings, in degrees.
 *
 * Ten of the twelve pentagons sit on two rings at `±atan(1/2)`, and all twelve
 * land on exact multiples of 36 degrees of longitude.
 */
export const RING_LATITUDE = (Math.atan(1 / 2) * 180) / Math.PI;
