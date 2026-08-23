import { ChunkAddress } from "./ChunkAddress.js";
import { chunkCenter } from "./chunkCenter.js";
import { chunkWedge } from "./chunkWedge.js";
import { horizonAngle } from "./horizonAngle.js";
import type { ChunkCull } from "./ChunkCull.js";
import type { Box } from "../../math/Box.js";
import type { ChunkPeaks } from "./ChunkPeaks.js";

/** One chunk to draw, and how coarsely. */
export interface ChunkSelection {
	/** How many levels coarser than the finest the chunk is sampled. */
	readonly lod: number;

	/** Where the chunk's triangle sits in the hierarchy. */
	readonly chunkLevel: number;

	readonly key: number;

	/**
	 * Straight-line distance from the eye to the chunk's ground.
	 *
	 * To the nearest radius its ground can occupy along its centre direction,
	 * not to its centre at sea level -- the difference is the whole height of
	 * a mountain for the chunk a player is standing on.
	 */
	readonly distance: number;

	/**
	 * The box the view was tested against, in world space.
	 *
	 * What decided whether this chunk was asked for at all: the wedge of ground
	 * the triangle holds, from its own lowest point to its own highest.
	 * Reported so it can be drawn -- the camera that decides it cannot see it,
	 * and a selection that refuses too much looks from there exactly like one
	 * that does not.
	 *
	 * Optional because a selection can be written by hand, by a caller that
	 * wants one chunk built and has no walk behind it.
	 */
	readonly bound?: Box;
}

/**
 * How many times a chunk's own width it has to be away before it is drawn one
 * level coarser.
 *
 * Chosen by counting chunks in view at 60 m of altitude, which is the worst
 * case because near and far chunks are both on screen there: 321 chunks at 2,
 * 471 at 2.5 and 633 at 3.
 */
export const DETAIL = 2;

/**
 * Which chunks a viewer sees, each at the level to draw it.
 *
 * **Depth and chunk level drop together.** A chunk one level coarser covers
 * four times the area at half the resolution, so it holds the same 561 slots
 * and costs the same to build, and there are four times fewer of them. Holding
 * the chunk level fixed instead would put 81,920 chunks on a planet that is
 * 40,962 cells at its coarsest level -- more draw calls than cells.
 *
 * Selection walks the triangle hierarchy from the twenty faces downward, which
 * is what that hierarchy is for. A triangle far enough away for its own width
 * is drawn; one closer is split into its four children and each asked again.
 * Children tile their parent exactly, so the surface is covered once with no
 * gap and no overlap however the levels fall.
 *
 * The reach is two horizons added together: how far the viewer sees over the
 * reference sphere, and how far ground standing `peakHeight` above that
 * sphere pokes back over it. A peak is visible from
 * `R acos(R/(R+eye)) + R acos(R/(R+peak))` away -- a 60 m hill from 521 m on
 * the worked planet -- so leaving the second term out drops mountains that
 * are plainly on screen. `viewerRadius` is where the **eye** is, not the
 * feet: a viewer standing on ground at exactly `surfaceRadius` still sees to
 * the eye-height horizon, and passing the feet there collapses the first
 * term to nothing.
 *
 * `peaks` replaces that one planet-wide figure with each triangle's own tallest
 * ground, so a triangle holding nothing tall is reached from nearer and a ring
 * of chunks whose ground is below the horizon is never built. It is optional
 * because the reach is the only thing it changes: without it every triangle
 * uses `peakHeight`, which is what a caller checking geometry wants.
 */
export function selectChunks(
	depth: number,
	finestChunkLevel: number,
	viewer: { readonly x: number; readonly y: number; readonly z: number },
	viewerRadius: number,
	surfaceRadius: number,
	detail = DETAIL,
	peakHeight = 0,
	peaks?: ChunkPeaks,
	cull?: ChunkCull,
): ChunkSelection[] {
	const length = Math.sqrt(
		viewer.x * viewer.x + viewer.y * viewer.y + viewer.z * viewer.z,
	);
	const ux = viewer.x / length;
	const uy = viewer.y / length;
	const uz = viewer.z / length;
	const eyeX = ux * viewerRadius;
	const eyeY = uy * viewerRadius;
	const eyeZ = uz * viewerRadius;
	const eyeHorizon = horizonAngle(viewerRadius, surfaceRadius);
	const wholePlanet = horizonAngle(surfaceRadius + peakHeight, surfaceRadius);

	const out: ChunkSelection[] = [];
	const walk = (address: ChunkAddress, chunkLevel: number): void => {
		let wedge: Box | undefined;
		const extent = chunkCenter(address, depth, chunkLevel);
		const cos = ux * extent.x + uy * extent.y + uz * extent.z;
		const spread = Math.acos(Math.min(1, extent.cosRadius));
		const peak = peaks ? peaks.peakOf(address.key, chunkLevel) : peakHeight;
		const trough = peaks ? peaks.troughOf(address.key, chunkLevel) : 0;
		const horizon =
			eyeHorizon +
			(peaks
				? horizonAngle(surfaceRadius + peak, surfaceRadius)
				: wholePlanet);
		// Over the horizon by more than its own width: the whole triangle is on
		// the far side of the planet.
		if (cos < Math.cos(Math.min(Math.PI, horizon + spread))) return;

		// The distance is to the chunk's ground, never to the sphere. Its
		// ground fills the radii from the reference sphere up to its own
		// tallest point, so the nearest of those to the eye is the eye's own
		// radius, clamped into that span. Measuring the sphere instead put a
		// player standing on 1,500 m ground 1,527 m from the chunk under
		// their own feet, which was then drawn with 128 m cells -- ground
		// underfoot at the level of detail of a skyline.
		const ground = Math.max(
			surfaceRadius,
			Math.min(viewerRadius, surfaceRadius + peak),
		);
		const dx = extent.x * ground - eyeX;
		const dy = extent.y * ground - eyeY;
		const dz = extent.z * ground - eyeZ;
		const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
		const width = 2 * spread * surfaceRadius;

		// Out of view, and so is everything under it. A triangle's own box
		// contains all four of its children's, so refusing it here prunes the
		// whole subtree rather than testing every leaf of it -- which is where
		// the saving is, because a level down is four times the triangles.
		//
		// The box holds the wedge of world this triangle actually has, from its
		// own lowest point to its own highest -- both ends, or a chunk on a
		// tall world gets a volume reaching from sea level to the planet's
		// tallest mountain whatever it holds itself. The sea floor is inside it
		// because the water above is drawn through.
		//
		// **A box and not a ball, because a chunk is a wedge into the planet.**
		// Ground alone is a thin cap that either shape fits, and a chunk dug to
		// the bottom of the crust is a shaft hundreds of metres deep: a 16 m
		// chunk down a 1,232 m crust wants a 616 m ball, 77 times its own
		// half-width and some thousands of times the volume it holds. A box
		// grows downward without growing sideways.
		//
		// **And it is the world and nothing else.** Keeping a margin beyond the
		// edge of the screen is the frustum's job, and doing it here instead --
		// by adding metres per metre of distance -- made every volume 8.2 times
		// the half-width of its own chunk, which is 512 times the volume, all
		// of it voting to be kept. It also pushed the volume at the near and
		// far planes and behind the camera, where no margin was ever wanted.
		{
			const high = surfaceRadius + Math.max(0, peak);
			const low = surfaceRadius + Math.min(0, trough);
			wedge = chunkWedge(extent, low, high);
			if (cull && !cull.holdsBox(wedge)) return;
		}

		// Near enough to be worth four smaller triangles, and there is a
		// smaller one to be had. The whole point of the walk: a chunk is
		// chosen coarse in the distance and fine underfoot, and the test is
		// against the chunk's own width so one number works at every level.
		if (chunkLevel < finestChunkLevel && distance < detail * width) {
			for (let child = 0; child < 4; child++)
				walk(
					new ChunkAddress(address.face, [...address.path, child]),
					chunkLevel + 1,
				);
			return;
		}

		out.push({
			lod: finestChunkLevel - chunkLevel,
			chunkLevel,
			key: address.key,
			distance,
			bound: wedge,
		});
	};

	for (let face = 0; face < 20; face++) walk(new ChunkAddress(face, []), 0);
	out.sort((a, b) => a.distance - b.distance);
	return out;
}
