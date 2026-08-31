import type { GridPaint } from "./GridPaint.js";
import { SPECKLE } from "../generation/terrain/blockColor.js";

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

	/**
	 * Whether a chunk also draws the ring of cells just beyond its rim.
	 *
	 * Two chunks drawn at different levels tile their shared boundary with
	 * hexagons of two sizes, and those do not interlock: strips of ground have
	 * their containing cell centred across the line, at a lattice the chunk
	 * over there does not use, so neither side's own cells cover them. Each
	 * chunk closes its own side by drawing one cell further out, a centimetre
	 * low so a real cell wins wherever one exists.
	 *
	 * This replaced the skirt -- a wall hung from every rim in case a level
	 * disagreed. A skirt hangs from the cap plane, so wherever no level
	 * actually disagreed it was coplanar with the neighbouring chunk's cap and
	 * speckled through it as a dashed dark line along every chunk boundary.
	 * Measured against the apron: over 3,899 rays outward and 1,446 grazing
	 * rays into the terrain across a mixed-level scene, removing skirts opened
	 * **no hole**, because the apron overlaps the join and the neighbouring
	 * chunk's own surface carries on underneath it.
	 *
	 * **No hole is not no crack.** The ring is a lid, and at its outer edge the
	 * ground over there is the neighbour's, drawn at the neighbour's own level
	 * -- so the two surfaces stand apart and the strip between them is open.
	 * A ray from inside the crust still cannot get out, which is why the rays
	 * above found nothing; what a viewer sees is the lid ending in mid-air with
	 * ground several metres lower behind it. The apron closes that itself now,
	 * with a curtain hung from its own edge down to what a coarser level puts
	 * over there -- and it can hang one where a rim cell could not, because it
	 * is already a centimetre low and so starts under the neighbour's cap
	 * rather than in the plane of it.
	 */
	readonly apron?: boolean;

	/**
	 * The layer grid every level's surface caps snap to, in metres.
	 *
	 * A chunk drawn coarser rounds its surfaces to its own coarser layers, so
	 * two levels disagree about a surface the terrain placed identically and
	 * the join reads as a step. Snapping every level's top caps to the finest
	 * grid instead — the world's real block grid — makes the levels agree
	 * exactly wherever the terrain does, and the step shrinks to what the
	 * sampling genuinely changed. Zero snaps to the chunk's own grid, which
	 * is what the finest level does anyway.
	 */
	readonly surfaceGrid?: number;

	/**
	 * Whether to paint the seams instead of hiding them.
	 *
	 * Face-edge cells turn yellow, cells on a chunk boundary blue, and apron
	 * cells orange, so where the joins run — and which kind each one is — can
	 * be read off the ground itself. A debugging aid, off everywhere by
	 * default.
	 */
	readonly debugSeams?: boolean;

	/**
	 * Paint the world as its own grid instead of as terrain.
	 *
	 * Cells take the chunk's level-of-detail color rather than a block's, and
	 * the seam tints mark chunk boundaries and face edges under their own
	 * switches. The blocks still decide the geometry -- grid mode feeds the
	 * mesher a flat shell, and this is how that shell is painted.
	 */
	readonly grid?: GridPaint | undefined;

	/**
	 * How far a cell's color may drift from its type's base, per channel.
	 *
	 * The speckle is what stops a hillside of one block type reading as one
	 * flat sheet of colour, and it costs nothing: the drift comes from the
	 * cell's own address through the integer hash, so it is the same on every
	 * machine and needs no texture and no second pass. **Zero turns it off**,
	 * and then a cell is exactly the colour the block registry names -- which
	 * is the state to compare a picture of the world against a picture of the
	 * map in.
	 */
	readonly speckle?: number;

	/**
	 * Whether a corner darkens by how many of its neighbours are solid.
	 *
	 * Baked into the vertex color at mesh time -- the shader has no way to see
	 * which cells stand around a corner, so this is the one shading term a
	 * vertex has to carry rather than compute. Off gives every vertex full
	 * light regardless of what is around it. The geometry is identical either
	 * way; only the corner's own light multiplier changes.
	 */
	readonly ambientOcclusion?: boolean;

	/**
	 * Whether a face darkens by how much sky the ground around it leaves it.
	 *
	 * Baked into the vertex colour at mesh time, like the corner shading, and
	 * read at each face's own layer rather than once at its column's top --
	 * which is what makes a shaft's wall, a cave's ceiling and a tunnel go
	 * dark rather than carrying the daylight of the surface above them.
	 *
	 * Off gives every face the open-sky reading, which is how the ground is
	 * looked at with nothing carried down to it.
	 */
	readonly skyExposure?: boolean;

	/**
	 * Which picture each block wears, `block * 4 + slot`, where the slots are
	 * its cap, its side, its underside and the band over the side.
	 *
	 * Absent while nothing has loaded a bake, and then every vertex is written
	 * with a layer of `-1` and the shader draws the colour alone. So a mesh
	 * built before the pictures arrive is the mesh this engine always drew,
	 * rather than a mesh of whatever layer zero happens to be.
	 */
	readonly textureLayers?: Int32Array | undefined;

	/**
	 * Whether a leaf is drawn with the holes its own picture has in it.
	 *
	 * A face is drawn between two cells where the first hides more than the
	 * second, which is one comparison and is right for everything that is
	 * either solid or not. A leaf is neither: it hides most of what is behind
	 * it and lets a fifth of it through, so a look through a hole in the near
	 * leaf has to find geometry on the far one. Off, a leaf is exactly as
	 * opaque as stone -- a canopy is a hollow shell with nothing inside it and
	 * no face where it meets the trunk, which is right while the picture has
	 * no holes in it and shows the sky through the tree the moment it does.
	 *
	 * **It is a switch because it is not free.** A canopy that stops occluding
	 * draws **3.51x** the leaf faces a solid one does, and **5,938 of 19,835**
	 * leaf cells gain a face they did not have -- **1.20x** the triangles over
	 * a whole view (`tools/trial-texture-cost.ts`). Each of those faces is
	 * emitted **once** and drawn from both sides; a pair, one per cell, would
	 * cost twice the vertices to rasterise exactly as many fragments.
	 *
	 * **This says nothing about which level of detail is asking.** A mesher
	 * takes a face and a lattice offset and is never told; the caller that
	 * knows is the one that decides, and it does -- `MeshWorkerCore` gates
	 * this on `CUTOUT_REACH`, so a chunk drawn coarse gets `false` here.
	 */
	readonly cutoutLeaves?: boolean;

	/**
	 * Whether the faces of sealed pockets are left out of the mesh.
	 *
	 * **A face is only worth drawing if somebody can be on the other side of
	 * it**, and a cave with no way through to the sky or to the chunk's edge
	 * has nobody there until a player digs in -- which rebuilds the chunk, so
	 * the walls appear with the hole. See `sealedRuns` for the flood that
	 * decides it and the conservatism at the rim that makes it safe. Off is
	 * for measuring what the cull buys; nothing a viewer can see changes
	 * either way, which is the whole claim and is what the frame diff checks.
	 */
	readonly cullSealed?: boolean;

	/**
	 * Per cell, a block whose colour its ground cap takes instead of its own.
	 *
	 * **Under half a block a plant stops being a shape and becomes the colour
	 * of the ground it stands on.** A 30 m pine at a 64 m block has nothing to
	 * be made of, and what can be seen of a forest from the distance that
	 * block is drawn at is that the ground under it is green. So the plant
	 * pass hands over the columns it could not build on, and their up-facing
	 * ground cap is painted the canopy's colour. Only that cap: a cliff face
	 * under a forest is still rock, and nothing about the geometry moves.
	 *
	 * Keyed the way {@link meshChunk} names a cell, and covering the ring past
	 * the rim as well as the chunk's own cells, because the apron draws those.
	 */
	readonly cover?: ReadonlyMap<number, number> | null;
}

export const MESH_DEFAULTS = {
	crustFloor: false,
	apron: false,
	surfaceGrid: 0,
	debugSeams: false,
	cover: null,
	speckle: SPECKLE,
	ambientOcclusion: true,
	skyExposure: true,
	cutoutLeaves: true,
	cullSealed: true,
} as const satisfies MeshOptions;
