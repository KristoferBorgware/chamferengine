import type { Chunk } from "../generation/chunk/Chunk.js";
import { opacityOf } from "../mesh/opacityOf.js";
import { rank } from "../addressing/lattice/rank.js";

/**
 * How much of the world reaches a point, and which way it comes from, on a
 * grid coarse enough to carry.
 *
 * `data` is `rgba8`: the first three are the direction light arrives from,
 * biased into `0..1`, and the fourth is how much arrives at all. Laid out
 * `((down * across) + r) * across + q`, which is the order a 3D texture
 * wants its rows in.
 *
 * The grid is a square over a triangle, so just under half of it is outside
 * the chunk and never read. That is the same waste the coarse map takes for
 * the same reason: a rectangle is what a texture is, and the alternative is
 * an index nobody can compute in a shader.
 */
export interface ProbeVolume {
	/** Cells between neighbouring probes, across and down alike. */
	readonly spacing: number;

	/** Probes along each of the triangle's two lattice axes. */
	readonly across: number;

	/** Probes down through the layers. */
	readonly down: number;

	/** The layer the topmost row of probes sits at. */
	readonly firstLayer: number;

	/** Four bytes a probe: a direction, then how much light. */
	readonly data: Uint8Array<ArrayBuffer>;

	/**
	 * What turns a direction into the three weights that name a lattice
	 * point: the inverse of the chunk's own three corner directions, in
	 * column-major order.
	 *
	 * **This is what lets a shader find a probe.** A vertex arrives knowing
	 * only where it is, and a probe is filed by `(q, r, layer)` -- the
	 * position it was built from. Going back the other way is what
	 * `latticePosition` does forward: a point is `normalize(A*a + B*b + C*c)`,
	 * so the weights are this matrix times the direction, divided by their own
	 * sum. Three multiplies and a divide, against the alternative of carrying
	 * three more floats on every vertex in the world.
	 */
	readonly basis: Float32Array<ArrayBuffer>;

	/** The chunk triangle's side in lattice steps, which the weights scale by. */
	readonly side: number;

	/**
	 * The three corner directions themselves, nine floats, a corner each.
	 *
	 * **The direction a probe stores is in the lattice's own axes**, because
	 * that is the grid the light was passed around on -- and a shader dotting
	 * that against a world-space sun is comparing two different spaces. These
	 * are what turn one into the other: a step across the triangle is the
	 * difference of two corners, and a step down is the column's own up.
	 */
	readonly corners: Float32Array<ArrayBuffer>;
}

/** How much light survives one step between probes. */
const CARRY = 0.72;

/**
 * How many times light is passed from probe to probe.
 *
 * Each round moves it one probe further, so the distance it travels is this
 * times the spacing. Four rounds at eight cells apart reaches thirty-two
 * cells, which is deeper than any hollow worth lighting.
 */
const ROUNDS = 4;

/**
 * Build a chunk's probe volume.
 *
 * **What is stored is sun-independent, and that is the whole point.** A
 * probe holds how much of the *environment* reaches it and which way that
 * light comes from -- neither of which moves when the sun does. The sun is
 * applied where the probe is read, in the shader, so a sunlit rim throws a
 * warm patch into a pit that follows the sun across the sky, from a volume
 * built once when the chunk was meshed. Storing irradiance instead would bake
 * the sun in and be wrong the moment it moved, which is exactly the ceiling
 * the sky-exposure bake runs into.
 *
 * **Light is passed between probes rather than traced.** Every probe in the
 * open starts full and every probe inside rock starts empty; then, a few
 * times over, each one takes the best its neighbours can pass it, less what a
 * step costs. That is a flood fill on a grid a fraction the size of the block
 * grid -- no rays, no acceleration structure, and it fills a hollow the way
 * light actually does, in from the opening.
 *
 * **Which way the light comes from is the gradient of how much of it there
 * is**, and it falls out of the field for nothing once the field exists.
 * Light is brighter toward the opening, so the direction it arrives from is
 * the way the field climbs.
 */
export function probeVolume(
	chunk: Chunk,
	spacing: number,
	firstLayer: number,
	lastLayer: number,
	corners?: readonly (readonly [number, number, number])[],
): ProbeVolume {
	const step = Math.max(1, Math.floor(spacing));
	const across = Math.floor(chunk.m / step) + 2;
	const top = Math.max(0, Math.floor(firstLayer));
	const bottom = Math.min(chunk.layerCount - 1, Math.ceil(lastLayer));
	const down = Math.max(1, Math.floor((bottom - top) / step) + 2);
	const count = across * across * down;

	// How much light each probe has, and whether it can hold any: a probe
	// inside rock passes nothing on, which is what makes a wall a wall.
	const light = new Float32Array(count);
	const air = new Uint8Array(count);

	for (let d = 0; d < down; d++) {
		const layer = Math.min(bottom, top + d * step);
		for (let r = 0; r < across; r++)
			for (let q = 0; q < across; q++) {
				const at = (d * across + r) * across + q;
				const cellQ = q * step;
				const cellR = r * step;
				// Outside the triangle there is no block to ask about. Left
				// empty and unlit, so the edge of the volume never leaks
				// light a neighbouring chunk has not agreed to.
				if (cellQ + cellR > chunk.m) continue;
				const slot = rank(cellQ, cellR, chunk.m);
				const block = chunk.blocks[slot * chunk.layerCount + layer];
				if (block === undefined || opacityOf(block) >= 2) continue;
				air[at] = 1;
				// **A probe standing above the ground is the light source.**
				// The band's first entry is the topmost layer of a slot that
				// is not air, so anything over it is open to the sky and
				// starts full; anything under it is in a hollow and starts
				// dark, to be filled from above by the rounds below.
				const first = chunk.band[slot * 2];
				if (first !== undefined && (first < 0 || layer < first))
					light[at] = 1;
			}
	}

	// Pass it around. Each round moves light one probe further, and a probe
	// takes the best any neighbour can give rather than their average: an
	// average would dim a corridor along its length even where nothing is in
	// the way, because half of every probe's neighbours are the rock beside
	// it.
	let now = light;
	let next = new Float32Array(count);
	for (let round = 0; round < ROUNDS; round++) {
		next.set(now);
		for (let d = 0; d < down; d++)
			for (let r = 0; r < across; r++)
				for (let q = 0; q < across; q++) {
					const at = (d * across + r) * across + q;
					if (!air[at]) continue;
					let best = now[at]!;
					for (const by of steps(q, r, d, across, down)) {
						if (!air[by]) continue;
						const passed = now[by]! * CARRY;
						if (passed > best) best = passed;
					}
					next[at] = best;
				}
		const swap = now;
		now = next;
		next = swap;
	}

	// **Fill the rock in from the air beside it.** A surface sits where solid
	// meets air, so a lookup there lands between a lit probe and a probe
	// inside the ground -- and a probe inside the ground holding zero drags
	// every surface in the world halfway to black once the two are blended.
	// Giving each solid probe the best its air neighbours hold makes the
	// field defined everywhere and safe to interpolate across a surface,
	// which is the whole reason it can be sampled at all.
	const filled = new Float32Array(now);
	for (let d = 0; d < down; d++)
		for (let r = 0; r < across; r++)
			for (let q = 0; q < across; q++) {
				const at = (d * across + r) * across + q;
				if (air[at]) continue;
				let best = 0;
				for (const by of steps(q, r, d, across, down))
					if (air[by] && now[by]! > best) best = now[by]!;
				filled[at] = best;
			}
	now = filled;

	const data = new Uint8Array(count * 4);
	for (let d = 0; d < down; d++)
		for (let r = 0; r < across; r++)
			for (let q = 0; q < across; q++) {
				const at = (d * across + r) * across + q;
				// Which way the light climbs, in the lattice's own axes. The
				// caller turns that into a world direction, because only it
				// knows where the chunk sits on the sphere.
				const gq =
					reach(now, air, q + 1, r, d, across, down) -
					reach(now, air, q - 1, r, d, across, down);
				const gr =
					reach(now, air, q, r + 1, d, across, down) -
					reach(now, air, q, r - 1, d, across, down);
				// Layers count downward, so a smaller index is higher up: the
				// climb toward the sky is the negative of the index gradient.
				const gd =
					reach(now, air, q, r, d - 1, across, down) -
					reach(now, air, q, r, d + 1, across, down);
				const size = Math.sqrt(gq * gq + gr * gr + gd * gd);
				// Nothing to point at where the field is flat -- inside rock,
				// or out in the open where every direction is equally bright.
				// Straight up is the honest answer for both.
				const [ux, uy, uz] =
					size > 1e-6 ? [gq / size, gr / size, gd / size] : [0, 0, 1];
				const out = at * 4;
				data[out] = Math.round((ux * 0.5 + 0.5) * 255);
				data[out + 1] = Math.round((uy * 0.5 + 0.5) * 255);
				data[out + 2] = Math.round((uz * 0.5 + 0.5) * 255);
				data[out + 3] = Math.round(
					Math.max(0, Math.min(1, now[at]!)) * 255,
				);
			}

	return {
		spacing: step,
		across,
		down,
		firstLayer: top,
		data,
		basis: invert3(corners),
		corners: forward(corners),
		side: chunk.m,
	};
}

/** The six probes a step away, as flat indices, skipping the volume's edge. */
function* steps(
	q: number,
	r: number,
	d: number,
	across: number,
	down: number,
): Generator<number> {
	for (const [dq, dr, dd] of NEIGHBOURS) {
		const nq = q + dq;
		const nr = r + dr;
		const nd = d + dd;
		if (nq < 0 || nr < 0 || nd < 0) continue;
		if (nq >= across || nr >= across || nd >= down) continue;
		yield (nd * across + nr) * across + nq;
	}
}

/**
 * The six ways out of a probe: four across the lattice and two through it.
 *
 * Four across rather than six, and that is a simplification worth naming. A
 * hexagon has six neighbours and this grid steps by eight cells at a time, so
 * what is being walked is not the hex ring -- it is a coarse box over it, and
 * light spreading through a box reaches the same places one step later.
 */
const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
	[1, 0, 0],
	[-1, 0, 0],
	[0, 1, 0],
	[0, -1, 0],
	[0, 0, 1],
	[0, 0, -1],
];

/** How much light a probe has, or its neighbour's where it is off the grid. */
function reach(
	light: Float32Array,
	air: Uint8Array,
	q: number,
	r: number,
	d: number,
	across: number,
	down: number,
): number {
	const cq = Math.max(0, Math.min(across - 1, q));
	const cr = Math.max(0, Math.min(across - 1, r));
	const cd = Math.max(0, Math.min(down - 1, d));
	const at = (cd * across + cr) * across + cq;
	return air[at] ? light[at]! : 0;
}

/**
 * The inverse of three corner directions, as nine floats a shader can read.
 *
 * Identity where the caller had no corners to give -- a volume nobody can
 * index is still a volume, and the tests that only ask what light reaches
 * where have no use for the mapping.
 */
function invert3(
	corners?: readonly (readonly [number, number, number])[],
): Float32Array<ArrayBuffer> {
	const out = new Float32Array(9);
	if (!corners || corners.length < 3) {
		out[0] = 1;
		out[4] = 1;
		out[8] = 1;
		return out;
	}
	const [a, b, c] = corners as readonly [
		readonly [number, number, number],
		readonly [number, number, number],
		readonly [number, number, number],
	];
	// Columns are the three corner directions, so the determinant is their
	// scalar triple product. Three directions to the corners of a triangle on
	// a sphere are never coplanar, so it is never zero.
	const det =
		a[0] * (b[1] * c[2] - b[2] * c[1]) -
		b[0] * (a[1] * c[2] - a[2] * c[1]) +
		c[0] * (a[1] * b[2] - a[2] * b[1]);
	const scale = det === 0 ? 0 : 1 / det;
	out[0] = (b[1] * c[2] - b[2] * c[1]) * scale;
	out[1] = (c[1] * a[2] - c[2] * a[1]) * scale;
	out[2] = (a[1] * b[2] - a[2] * b[1]) * scale;
	out[3] = (b[2] * c[0] - b[0] * c[2]) * scale;
	out[4] = (c[2] * a[0] - c[0] * a[2]) * scale;
	out[5] = (a[2] * b[0] - a[0] * b[2]) * scale;
	out[6] = (b[0] * c[1] - b[1] * c[0]) * scale;
	out[7] = (c[0] * a[1] - c[1] * a[0]) * scale;
	out[8] = (a[0] * b[1] - a[1] * b[0]) * scale;
	return out;
}

/** The three corner directions as nine floats, or zeros where none were given. */
function forward(
	corners?: readonly (readonly [number, number, number])[],
): Float32Array<ArrayBuffer> {
	const out = new Float32Array(9);
	if (!corners || corners.length < 3) return out;
	for (let n = 0; n < 3; n++) {
		const corner = corners[n]!;
		out[n * 3] = corner[0];
		out[n * 3 + 1] = corner[1];
		out[n * 3 + 2] = corner[2];
	}
	return out;
}
