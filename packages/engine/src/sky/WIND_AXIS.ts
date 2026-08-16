import { Vec3 } from "../math/Vec3.js";

/**
 * The axis clouds turn about, and how fast.
 *
 * A wind that blows the same way everywhere cannot exist on a sphere: a
 * continuous field of directions on one has to stop somewhere, which is the
 * hairy ball theorem. Turning the whole sky rigidly about an axis is the field
 * that carries no source and no sink anywhere on it, so a cloud pattern is
 * carried without being stretched at one place and bunched at another.
 *
 * The cost is two calm points, where the axis comes out. They are half a
 * percent of the surface.
 */
export const WIND_AXIS = new Vec3(0.31, 0.87, 0.38).normalize();

/** Turns a day. */
export const WIND_RATE = 1 / 900;
