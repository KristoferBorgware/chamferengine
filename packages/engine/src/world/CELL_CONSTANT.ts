/**
 * The constant relating block size, radius and subdivision depth.
 *
 * A sphere of radius `R` has area `4*pi*R^2` shared between `10*4^depth + 2`
 * cells, and a regular hexagon of centre-to-centre spacing `d` covers
 * `(sqrt(3)/2) * d^2`. Solving for `d` gives `blockSize = K * R / 2^depth` with
 * `K = sqrt(8*pi / (10*sqrt(3)))`.
 *
 * At radius 1,700 m and depth 11 that is 1.0000 m.
 */
export const CELL_CONSTANT = Math.sqrt((8 * Math.PI) / (10 * Math.sqrt(3)));
