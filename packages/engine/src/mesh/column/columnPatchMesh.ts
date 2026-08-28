import type { ColumnPatch } from "./ColumnPatch.js";
import { PATCH_STRIDE } from "../PatchGeometry.js";
import { Vec3 } from "../../math/Vec3.js";
import { AMBIENT_OCCLUSION } from "../AMBIENT_OCCLUSION.js";
import { speckleShade } from "../../generation/terrain/blockColor.js";
import type { Stand } from "../../generation/plants/growStand.js";
import { PLANT_EMPTY, PLANT_LEAF } from "../../generation/plants/growStand.js";
import { hash3 } from "../../generation/noise/hash3.js";

/** The ground a patch stands on, one entry per column. */
export interface ColumnGround {
	/**
	 * Where each column's spans start in {@link spans}: `at[c]` to `at[c + 1]`.
	 *
	 * Kept flat rather than one array a column, because a patch holds hundreds
	 * of thousands of them and the mesh is what runs while a slider moves.
	 */
	readonly at: Int32Array;

	/** Pairs of heights, low to high, in metres above sea level. */
	readonly spans: Float64Array;

	/** Per column, the top of its topmost rock, which the colours read. */
	readonly height: Float64Array;

	/** Per column, what the four layer curves returned. */
	readonly raw: Float32Array;
	readonly continent: Float32Array;
	readonly erosion: Float32Array;
	readonly peaks: Float32Array;

	/**
	 * Per column, what the carve read at the top of its own rock.
	 *
	 * **A 3D field has no one value at a place**, so a picture of it has to be
	 * read somewhere; the top of the rock is where a reader can compare it
	 * against the shape it cut.
	 */
	readonly carve: Float32Array;
}

/**
 * A stand of plants standing on the same columns, drawn with the ground.
 *
 * **One buffer, because a plant is terrain.** The wood and the leaves are
 * blocks on the same lattice, lit by the same rig and recorded by the same
 * shadow pass, so they are triangles in the opaque run rather than a mesh of
 * their own.
 */
export interface ColumnPlants {
	readonly stand: Stand;

	/**
	 * Per column, the top of its own ground and which layer that top is.
	 *
	 * Handed in rather than read back off the spans, because a slot index is
	 * counted from these two and the stand was grown against them: worked out
	 * a second time here, a rounding either way would move every plant by a
	 * block.
	 */
	readonly top: Float64Array;
	readonly groundLayer: Int32Array;
}

/** What the mesh is drawn against, beyond the ground itself. */
export interface ColumnLook {
	/** The world's seed, which is what the speckle is hashed from. */
	readonly seed: number;

	/** How far a cell's colour may drift from its material's, `0` for none. */
	readonly speckle: number;

	/** One block, which is how far above a cap a neighbour has to stand to shade it. */
	readonly blockMetres: number;

	/**
	 * How much a corner darkens for the rock standing around it, `0` for none.
	 *
	 * **The one shading term a vertex has to carry.** Which way a face points
	 * is a fact the shader works out for itself; what stands *around* a corner
	 * is not on the face at all, so no light can find it. Without it a crevice
	 * has no bottom, a notch reads as flat ground, and two caps at the same
	 * height are the same colour whatever is beside them -- which is most of
	 * what makes a landscape of blocks look like a sheet of them.
	 */
	readonly occlusion: number;

	/** The planet's radius in metres, which turns a direction into a place. */
	readonly radius: number;

	/** Where the water stands, in metres above sea level. */
	readonly seaLevel: number;
}

/** A patch drawn as columns, and what it reached. */
export interface ColumnMesh {
	/** Position, normal, metres and the three layers: {@link PATCH_STRIDE}. */
	readonly vertices: Float32Array<ArrayBuffer>;

	/**
	 * How many vertices the opaque pass takes: the ground, then the plants.
	 *
	 * One run, because both are opaque and both cast. What the plants alone
	 * came to is {@link plantVertices}, which is a readout rather than a draw.
	 */
	readonly groundVertices: number;

	/** How many of those the plants drew. */
	readonly plantVertices: number;

	/** How many the water drew, blended after every opaque one. */
	readonly waterVertices: number;

	/**
	 * The rim of every cap, two indices an edge, for the wireframe.
	 *
	 * Caps only. A wall's edges are the rims of the two caps it runs between,
	 * so drawing them as well would put a second line on top of most of these
	 * and a vertical one down every corner -- which at a column a metre across
	 * is a solid sheet rather than a grid.
	 */
	readonly lines: Uint32Array<ArrayBuffer>;

	/** The lowest and highest rock in it, in metres above sea level. */
	readonly lowest: number;
	readonly highest: number;

	/** What the field itself reached here, which the Raw picture is drawn against. */
	readonly rawLow: number;
	readonly rawHigh: number;

	/** How much of the patch stands above the water. */
	readonly landShare: number;

	/** Metres from one side of the drawn shape to the other. */
	readonly span: number;

	/**
	 * The box the mesh actually fills, in the patch's own frame.
	 *
	 * **What a shadow map has to cover is the shape, and only the shape knows
	 * what that is.** A patch's width says nothing about how far its crust runs
	 * down, and a box guessed from the ground's own range misses the lip and
	 * every wall hanging off the rim -- which is geometry that casts.
	 */
	readonly bounds: {
		readonly low: readonly [number, number, number];
		readonly high: readonly [number, number, number];
	};
}

/**
 * How far under the lowest rim column the patch's cut edge hangs.
 *
 * **The rim is a lip, not a plinth.** Run it down to one floor under the lowest
 * ground and a patch with a kilometre of relief becomes a slab whose cut face
 * is taller than the terrain on top of it, which is what the eye then sees from
 * any low angle. Hung a fixed depth under each rim column instead, the patch
 * reads as ground with an edge.
 */
const LIP_SHARE = 0.06;

/**
 * How much darker a leaf is drawn than the color it is written in.
 *
 * A leaf green sits within a few hundredths of the ground's grass, so side by
 * side the two read as one surface. A cluster is a shell of one-block-thick
 * surface anyway, and almost every cell of it has other leaves over it.
 */
const LEAF_SHADE = 0.66;

/** How far a plant cell's color drifts from its layer's, either way. */
const PLANT_GRAIN = 0.14;

/** The three axes of the patch: out of the ground, east, and north. */
function frameAt(at: Vec3): { up: Vec3; east: Vec3; north: Vec3 } {
	const up = at.normalize();
	const pole = new Vec3(0, 1, 0);
	const along = Math.abs(up.dot(pole)) > 0.999 ? new Vec3(1, 0, 0) : pole;
	const east = along.cross(up).normalize();
	return { up, east, north: up.cross(east).normalize() };
}

/**
 * A patch of the world drawn as columns of blocks.
 *
 * **Down to the bottom of the crust, so a column is a column.** Hung a lip
 * under the rock instead, the patch is a shell: from underneath there is
 * nothing but the back of the ground, and a carve whose whole point is that it
 * takes blocks out from under other blocks has nowhere to show that it did.
 *
 * **What is exposed on a side is this span less the neighbour's spans.** A
 * height field only ever had to compare two numbers; with overhangs on both
 * sides the answer is an interval difference, and the parts left over are the
 * cliff faces.
 *
 * Triangles are written straight out rather than indexed, because every face
 * here is flat and its own plane is the normal exactly -- nothing is averaged
 * between cells, so no vertex is shared and an index would name each one once.
 *
 * The water is last, in one run, so the caller can blend it after every opaque
 * triangle has been drawn.
 */
export function columnPatchMesh(
	patch: ColumnPatch,
	ground: ColumnGround,
	look: ColumnLook,
	plants: ColumnPlants | null = null,
): ColumnMesh {
	const {
		count,
		degree,
		corner,
		ring,
		centre,
		directions,
		face,
		i: iOf,
		j: jOf,
	} = patch;
	const { at, spans, height, raw, continent, erosion, peaks, carve } = ground;
	const { radius, seaLevel, seed, speckle, blockMetres, occlusion } = look;
	const frame = frameAt(centre);

	// **The buffer starts at what a patch actually uses and grows if it needs
	// more.** A column's ceiling is two caps plus a wall an edge -- 30
	// triangles -- and real terrain runs nearer twelve, so at the largest patch
	// the ceiling would ask for a quarter of a gigabyte to hold a tenth of
	// that. Growing costs one copy at each doubling and the estimate is right
	// for almost every patch.
	let room = Math.max(count * 12 * 3, 3);
	let vertices = new Float32Array(room * PATCH_STRIDE);
	let written = 0;
	let loX = Infinity;
	let hiX = -Infinity;
	let loY = Infinity;
	let hiY = -Infinity;
	let loZ = Infinity;
	let hiZ = -Infinity;
	const roomFor = (): void => {
		if (written + 3 <= room) return;
		room = Math.max(room * 2, written + 3);
		const wider = new Float32Array(room * PATCH_STRIDE);
		wider.set(vertices);
		vertices = wider;
	};

	// One column's numbers, set before its triangles are written.
	let cRaw = 0;
	/** The ground under the water while the sea is drawn, `NaN` otherwise. */
	let waterFloor = Number.NaN;
	let cCont = 0;
	let cEro = 0;
	let cPeaks = 0;
	let cCarve = 0;
	let cShade = 1;
	/** Which palette entry the face is drawn from, `0` for the ground itself. */
	let cMaterial = 0;
	/**
	 * Whether faces take the ground's corner shading and go into the wireframe.
	 *
	 * The plants take neither: their shade is a grain of their own, and a rim
	 * line round every leaf is a solid sheet rather than a lattice.
	 */
	let grounded = true;
	/** The three corners' own shading, refilled per triangle. */
	let sA = 1;
	let sB = 1;
	let sC = 1;

	/** A direction and a height, in the frame the patch is drawn in. */
	const local = (
		dx: number,
		dy: number,
		dz: number,
		metres: number,
		out: [number, number, number],
	): void => {
		const s = radius + metres;
		const rx = dx * s - centre.x * radius;
		const ry = dy * s - centre.y * radius;
		const rz = dz * s - centre.z * radius;
		out[0] = rx * frame.east.x + ry * frame.east.y + rz * frame.east.z;
		out[1] = rx * frame.up.x + ry * frame.up.y + rz * frame.up.z;
		out[2] = rx * frame.north.x + ry * frame.north.y + rz * frame.north.z;
	};

	/**
	 * One triangle, with the plane's own normal and a height per corner.
	 *
	 * **The height is per corner because a wall has two ends.** Given the
	 * height of the column it stands on, the cut face of a snow-capped mountain
	 * is snow all the way down to the sea floor; its top corners take the top
	 * and its bottom corners take the bottom, so one wall carries the gradient
	 * the ground beside it has.
	 */
	const triangle = (
		ax: number,
		ay: number,
		az: number,
		bx: number,
		by: number,
		bz: number,
		cx: number,
		cy: number,
		cz: number,
		ma: number,
		mb: number,
		mc: number,
	): void => {
		const ux = bx - ax;
		const uy = by - ay;
		const uz = bz - az;
		const vx = cx - ax;
		const vy = cy - ay;
		const vz = cz - az;
		// **One winding for the whole mesh**: every face is wound so that
		// `cross(b - a, c - a)` points out of the solid it belongs to. `cap`
		// is the one that had it backwards.
		const nx = uy * vz - uz * vy;
		const ny = uz * vx - ux * vz;
		const nz = ux * vy - uy * vx;
		// `sqrt(x*x + y*y + z*z)`, never `Math.hypot`: a library routine rather
		// than an IEEE operation, and this runs once a triangle.
		const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
		const ex = nx / len;
		const ey = ny / len;
		const ez = nz / len;
		roomFor();
		let to = written * PATCH_STRIDE;
		// Three vertices written out one after another rather than through a
		// loop over three little arrays: this is the innermost thing in the
		// build, and an array a call is an allocation a triangle.
		vertices[to] = ax;
		vertices[to + 1] = ay;
		vertices[to + 2] = az;
		vertices[to + 3] = ex;
		vertices[to + 4] = ey;
		vertices[to + 5] = ez;
		vertices[to + 6] = waterFloor === waterFloor ? waterFloor : ma;
		vertices[to + 7] = cRaw;
		vertices[to + 8] = cCont;
		vertices[to + 9] = cEro;
		vertices[to + 10] = cPeaks;
		vertices[to + 11] = cCarve;
		vertices[to + 12] = cShade * sA;
		vertices[to + 13] = cMaterial;
		to += PATCH_STRIDE;
		vertices[to] = bx;
		vertices[to + 1] = by;
		vertices[to + 2] = bz;
		vertices[to + 3] = ex;
		vertices[to + 4] = ey;
		vertices[to + 5] = ez;
		vertices[to + 6] = waterFloor === waterFloor ? waterFloor : mb;
		vertices[to + 7] = cRaw;
		vertices[to + 8] = cCont;
		vertices[to + 9] = cEro;
		vertices[to + 10] = cPeaks;
		vertices[to + 11] = cCarve;
		vertices[to + 12] = cShade * sB;
		vertices[to + 13] = cMaterial;
		to += PATCH_STRIDE;
		vertices[to] = cx;
		vertices[to + 1] = cy;
		vertices[to + 2] = cz;
		vertices[to + 3] = ex;
		vertices[to + 4] = ey;
		vertices[to + 5] = ez;
		vertices[to + 6] = waterFloor === waterFloor ? waterFloor : mc;
		vertices[to + 7] = cRaw;
		vertices[to + 8] = cCont;
		vertices[to + 9] = cEro;
		vertices[to + 10] = cPeaks;
		vertices[to + 11] = cCarve;
		vertices[to + 12] = cShade * sC;
		vertices[to + 13] = cMaterial;
		written += 3;
		// **What the camera has to frame is the shape, and only the shape knows
		// what that is.** A patch's width says nothing once it is a fair share
		// of the planet: the ground curves away, and past the antipode it comes
		// back. The box around what was actually written covers a flat patch, a
		// curved cap and a whole globe with no case of its own.
		if (ax < loX) loX = ax;
		if (bx < loX) loX = bx;
		if (cx < loX) loX = cx;
		if (ax > hiX) hiX = ax;
		if (bx > hiX) hiX = bx;
		if (cx > hiX) hiX = cx;
		if (ay < loY) loY = ay;
		if (by < loY) loY = by;
		if (cy < loY) loY = cy;
		if (ay > hiY) hiY = ay;
		if (by > hiY) hiY = by;
		if (cy > hiY) hiY = cy;
		if (az < loZ) loZ = az;
		if (bz < loZ) loZ = bz;
		if (cz < loZ) loZ = cz;
		if (az > hiZ) hiZ = az;
		if (bz > hiZ) hiZ = bz;
		if (cz > hiZ) hiZ = cz;
	};

	/** Whether a column holds rock at one height. */
	const solidAt = (c: number, y: number): boolean => {
		if (c < 0) return false;
		for (let pair = at[c]!; pair < at[c + 1]!; pair += 2)
			if (y >= spans[pair]! && y < spans[pair + 1]!) return true;
		return false;
	};

	/**
	 * How much a cap is darkened by the rock standing around it.
	 *
	 * **One value for the whole cap, not one per corner.** Per corner is what
	 * the world's own mesher does, and it is right there: a cell is a metre
	 * across and a long way off. Here a cell fills a good part of the screen,
	 * and a value at each corner interpolated across the middle draws a smeared
	 * wedge over every hexagon -- which reads as banding rather than as
	 * anything standing beside it. Flat, a cap is either in a hollow or it is
	 * not, and the lattice stays crisp.
	 *
	 * The steps are the world's own {@link AMBIENT_OCCLUSION}, reached by how
	 * much of the ring stands over the cap rather than by a count of two.
	 * Measured a block above it, because a neighbour level with a cap is
	 * standing beside the cell rather than over it.
	 */
	const capShade = (c: number, top: number): number => {
		if (occlusion <= 0) return 1;
		const over = top + blockMetres * 0.5;
		const deg = degree[c]!;
		let shut = 0;
		for (let k = 0; k < deg; k++)
			if (solidAt(ring[c * 6 + k]!, over)) shut++;
		const steps = AMBIENT_OCCLUSION.length - 1;
		const dark =
			AMBIENT_OCCLUSION[
				Math.min(steps, Math.round((shut / deg) * steps * 2))
			] ?? 1;
		// The knob fades the whole term toward no shading at all rather than
		// changing its steps, so off is the flat colour to the bit.
		return 1 + (dark - 1) * occlusion;
	};

	/**
	 * How much of the sky a point on a wall can see, from its own six
	 * neighbours.
	 *
	 * **A wall takes its two ends**, so one face carries the gradient a shaft
	 * has: the top vertices are read at the top of the run and the bottom ones
	 * at the bottom, and a merged run of any length costs nothing more. This is
	 * what gives a hole a floor rather than a flat sheet of the block it is cut
	 * into.
	 */
	const wallShade = (c: number, y: number): number => {
		if (occlusion <= 0) return 1;
		const deg = degree[c]!;
		let shut = 0;
		for (let k = 0; k < deg; k++) if (solidAt(ring[c * 6 + k]!, y)) shut++;
		const open = 1 - shut / deg;
		// The same floor a fully enclosed corner takes, so the two terms agree
		// about how dark shut-in is.
		const dark = AMBIENT_OCCLUSION[AMBIENT_OCCLUSION.length - 1]!;
		return 1 + (dark - 1) * (1 - open) * occlusion;
	};

	const p0: [number, number, number] = [0, 0, 0];
	const p1: [number, number, number] = [0, 0, 0];
	const p2: [number, number, number] = [0, 0, 0];
	const p3: [number, number, number] = [0, 0, 0];
	const ringX = new Float64Array(6);
	const ringY = new Float64Array(6);
	const ringZ = new Float64Array(6);

	/**
	 * A column's polygon, drawn at one height.
	 *
	 * **Drawn at the column's own radius**, so it is the slice of sphere the
	 * cell covers rather than a flat lid -- which is what makes two neighbouring
	 * caps meet along their shared edge with nothing between them.
	 */
	const rims: number[] = [];
	const cap = (c: number, metres: number, upward: boolean): void => {
		const deg = degree[c]!;
		let mx = 0;
		let my = 0;
		let mz = 0;
		// The sea is one sheet at one radius and nothing stands around it, so it
		// takes none of this -- shading it would draw the hillside's own
		// occlusion onto the water beside it.
		const water = waterFloor === waterFloor;
		const flat = upward && !water && grounded ? capShade(c, metres) : 1;
		for (let m = 0; m < deg; m++) {
			local(
				corner[c * 18 + m * 3]!,
				corner[c * 18 + m * 3 + 1]!,
				corner[c * 18 + m * 3 + 2]!,
				metres,
				p0,
			);
			ringX[m] = p0[0];
			ringY[m] = p0[1];
			ringZ[m] = p0[2];
			mx += p0[0] / deg;
			my += p0[1] / deg;
			mz += p0[2] / deg;
		}
		for (let m = 0; m < deg; m++) {
			const b = (m + 1) % deg;
			// The two rim corners of this triangle, whichever way it is wound:
			// the middle is always first, so the edge is the two after it.
			// Ground only: the sea's own rim sits at one radius everywhere and
			// would draw a second grid across the water at sea level.
			if (grounded && waterFloor !== waterFloor)
				rims.push(written + 1, written + 2);
			sA = flat;
			sB = flat;
			sC = flat;
			// **Wound against the ring's own order.** A cell's rim runs
			// counter-clockwise seen from outside the sphere, and a patch
			// vertex is laid out as `(east, up, north)` -- which swaps two
			// axes and flips the handedness, so following the ring in its own
			// order gives a cap whose normal points into the ground. Measured
			// on flat ground before this, of 174 triangles **0** faced up and
			// **114** faced down: every cap was lit as though the sun were
			// under the floor, which no arrangement of lights and no exposure
			// can reach -- and turned round, the picture's mean goes from
			// **43.6** to **52.6** of 255 with a 95th percentile ratio of
			// **2.15**, so the faces that gain are the ones facing the sky and
			// they more than double.
			//
			// **The walls were right the whole time**, so this is what turns
			// and not the cross product: flipping that fixes the caps and
			// breaks the walls, and a mesh half inside out looks much like a
			// mesh wholly inside out.
			//
			// **The underside of an overhang is a face too**, and it faces the
			// other way again: wound like the top it would be culled and the
			// inside of the planet would show through.
			if (upward)
				triangle(
					mx,
					my,
					mz,
					ringX[b]!,
					ringY[b]!,
					ringZ[b]!,
					ringX[m]!,
					ringY[m]!,
					ringZ[m]!,
					metres,
					metres,
					metres,
				);
			else
				triangle(
					mx,
					my,
					mz,
					ringX[m]!,
					ringY[m]!,
					ringZ[m]!,
					ringX[b]!,
					ringY[b]!,
					ringZ[b]!,
					metres,
					metres,
					metres,
				);
		}
	};

	/** One side of a column, between two heights. */
	const wall = (
		c: number,
		m: number,
		deg: number,
		top: number,
		below: number,
	): void => {
		if (below >= top) return;
		const a = ((m - 1 + deg) % deg) * 3 + c * 18;
		const b = m * 3 + c * 18;
		local(corner[a]!, corner[a + 1]!, corner[a + 2]!, top, p0);
		local(corner[b]!, corner[b + 1]!, corner[b + 2]!, top, p1);
		local(corner[b]!, corner[b + 1]!, corner[b + 2]!, below, p2);
		local(corner[a]!, corner[a + 1]!, corner[a + 2]!, below, p3);
		// One face carries the gradient of the whole run: its top vertices are
		// read at the top and its bottom ones at the bottom.
		const overhead = grounded ? wallShade(c, top - blockMetres * 0.5) : 1;
		const underfoot = grounded
			? wallShade(c, below + blockMetres * 0.5)
			: 1;
		sA = overhead;
		sB = overhead;
		sC = underfoot;
		triangle(
			p0[0],
			p0[1],
			p0[2],
			p1[0],
			p1[1],
			p1[2],
			p2[0],
			p2[1],
			p2[2],
			top,
			top,
			below,
		);
		sA = overhead;
		sB = underfoot;
		sC = underfoot;
		triangle(
			p0[0],
			p0[1],
			p0[2],
			p2[0],
			p2[1],
			p2[2],
			p3[0],
			p3[1],
			p3[2],
			top,
			below,
			below,
		);
	};

	// The lip is a share of the patch's own width, so it reads the same on a
	// patch of any size.
	let across = 0;
	for (let c = 0; c < count; c++) {
		const dx = directions[c * 3]! - centre.x;
		const dy = directions[c * 3 + 1]! - centre.y;
		const dz = directions[c * 3 + 2]! - centre.z;
		const out = Math.sqrt(dx * dx + dy * dy + dz * dz) * radius;
		if (out > across) across = out;
	}
	const lip = Math.max(1, across * 2 * LIP_SHARE);

	/**
	 * Where a column stops being drawn.
	 *
	 * **The bottom of the lowest span is the crust bottom already**: the walk
	 * starts there and everything under it is rock, so no wall is ever drawn
	 * between two columns down there and the cost is the rim alone.
	 */
	const floorOf = (c: number): number => spans[at[c]!]! - lip;

	for (let c = 0; c < count; c++) {
		cRaw = raw[c]!;
		cCont = continent[c]!;
		cEro = erosion[c]!;
		cPeaks = peaks[c]!;
		cCarve = carve[c]!;
		// **A fact about the cell, not about the ground under it**, so it is
		// read from the address the same way the world's own mesher reads it --
		// which is what makes a preview of a hillside the hillside the world
		// builds rather than a near miss of it.
		cShade = speckleShade(face[c]!, iOf[c]!, jOf[c]!, seed, speckle);
		const deg = degree[c]!;
		const from = at[c]!;
		const to = at[c + 1]!;
		const floor = floorOf(c);
		for (let pair = from; pair < to; pair += 2) {
			const bottom = pair === from ? floor : spans[pair]!;
			const top = spans[pair + 1]!;
			cap(c, top, true);
			if (pair > from) cap(c, spans[pair]!, false);
			for (let m = 0; m < deg; m++) {
				const found = ring[c * 6 + m]!;
				if (found < 0) {
					// **Off the rim the cut face runs up to the waterline**, and
					// that is what closes the sheet of water rather than a
					// curtain of water hung there. The two would be the same
					// plane -- the sheet's edge is the column's edge -- and a
					// blended face coplanar with an opaque one wins the depth
					// test on some pixels and loses on others, which draws as a
					// dotted stripe down every rim column rather than a coast.
					const lift =
						pair + 2 >= to && top < seaLevel ? seaLevel : top;
					wall(c, m, deg, lift, bottom);
					continue;
				}
				let open =
					pair === from ? Math.min(bottom, floorOf(found)) : bottom;
				const nFrom = at[found]!;
				const nTo = at[found + 1]!;
				for (let q = nFrom; q < nTo; q += 2) {
					const lo = q === nFrom ? -Infinity : spans[q]!;
					const hi = spans[q + 1]!;
					if (hi <= open) continue;
					if (lo >= top) break;
					wall(c, m, deg, Math.min(top, lo), open);
					open = Math.max(open, hi);
					if (open >= top) break;
				}
				wall(c, m, deg, top, open);
			}
		}
	}
	const soilVertices = written;

	// **Everything standing on the ground, in the same run.** A plant is
	// blocks, so it is drawn the way the ground is: a cap wherever nothing
	// stands over a slot, a floor wherever nothing stands under one, and a
	// side wherever the neighbour's own slot at the same height is empty.
	//
	// **A slot index is counted from each column's own ground**, so a side
	// looks the neighbour up at a converted index rather than at the same
	// number -- and anything under the neighbour's own surface is rock the
	// ground pass has already drawn.
	if (plants) {
		grounded = false;
		const { stand, top: standTop, groundLayer } = plants;
		const { blocks, owner, layers: slots, sunk } = stand;
		for (let c = 0; c < count; c++) {
			const deg = degree[c]!;
			const base = c * slots;
			for (let slot = 0; slot < slots; slot++) {
				const what = blocks[base + slot]!;
				if (what === PLANT_EMPTY) continue;
				const from = standTop[c]! + (slot - sunk) * blockMetres;
				const to = from + blockMetres;
				// **The palette runs wood then leaf per layer**, so a face
				// carries which plant put it there as well as which half of
				// that plant it is.
				const kind = owner[base + slot]!;
				cMaterial =
					kind > 0 ? kind * 2 - (what === PLANT_LEAF ? 0 : 1) : 0;
				// **A canopy is darker than the grass under it, and it has to
				// be.** A leaf green sits within a few hundredths of the
				// ground's grass, so side by side the two read as one surface
				// and a tree disappears into the hillside. A cluster is a
				// shell anyway: almost every cell of it has other leaves over
				// it.
				const shade = what === PLANT_LEAF ? LEAF_SHADE : 1;
				// A grain off the cell's own address, so a canopy is not one
				// flat color and nothing has to be stored.
				cShade =
					shade *
					(1 -
						PLANT_GRAIN +
						2 * PLANT_GRAIN * hash3(c, slot, what, seed));
				if (
					slot + 1 >= slots ||
					blocks[base + slot + 1] === PLANT_EMPTY
				)
					cap(c, to, true);
				if (slot > sunk && blocks[base + slot - 1] === PLANT_EMPTY)
					cap(c, from, false);
				for (let m = 0; m < deg; m++) {
					const found = ring[c * 6 + m]!;
					if (found < 0) {
						wall(c, m, deg, to, from);
						continue;
					}
					const across = slot + groundLayer[c]! - groundLayer[found]!;
					if (across < sunk) continue;
					if (
						across < slots &&
						blocks[found * slots + across] !== PLANT_EMPTY
					)
						continue;
					wall(c, m, deg, to, from);
				}
			}
		}
		grounded = true;
		cMaterial = 0;
		cShade = 1;
	}
	const plantVertices = written - soilVertices;
	const groundVertices = written;

	// The sea, last, so it is one run of triangles the caller can blend after
	// every opaque one has been drawn.
	for (let c = 0; c < count; c++) {
		const h = height[c]!;
		if (h >= seaLevel) continue;
		cRaw = raw[c]!;
		cCont = continent[c]!;
		cEro = erosion[c]!;
		cPeaks = peaks[c]!;
		cCarve = carve[c]!;
		// The sea is one surface at one radius rather than a cell of anything,
		// so nothing about it is per hexagon.
		cShade = 1;
		// **The water carries the ground under it, not the surface it is
		// drawn at.** How much water a look passes through is what decides the
		// colour and how much of it can be seen through, and the sheet itself
		// is one radius everywhere -- so the depth has to ride on the vertex.
		waterFloor = h;
		cap(c, seaLevel, true);
	}

	let lowest = Infinity;
	let highest = -Infinity;
	let rawLow = Infinity;
	let rawHigh = -Infinity;
	let land = 0;
	for (let c = 0; c < count; c++) {
		const metres = height[c]!;
		if (metres < lowest) lowest = metres;
		if (metres > highest) highest = metres;
		if (raw[c]! < rawLow) rawLow = raw[c]!;
		if (raw[c]! > rawHigh) rawHigh = raw[c]!;
		if (metres > seaLevel) land++;
	}

	return {
		// **Only the part that was written**, and copied rather than viewed:
		// the buffer carries whatever headroom the estimate left, and a view
		// handed across a worker boundary would move the whole of it.
		vertices: vertices.slice(0, written * PATCH_STRIDE),
		groundVertices,
		plantVertices,
		waterVertices: written - groundVertices,
		lowest: count ? lowest : 0,
		highest: count ? highest : 0,
		rawLow: count ? rawLow : 0,
		rawHigh: count ? rawHigh : 0,
		lines: Uint32Array.from(rims),
		bounds: { low: [loX, loY, loZ], high: [hiX, hiY, hiZ] },
		landShare: count ? land / count : 0,
		span: Math.max(hiX - loX, hiZ - loZ, 1),
	};
}
