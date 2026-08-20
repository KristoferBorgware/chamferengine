import { describe, expect, it } from "vitest";
import { ChunkAddress, selectChunks } from "chamfer/generation";
import { Vec3 } from "chamfer/math";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import { positionToCell, splitPath } from "chamfer/addressing";

const RADIUS = 1700;
const DEPTH = 9;
const FINEST = 4;
const VIEWER = new Vec3(0.3, 0.7, 0.5).normalize();

/** A repeatable spread of directions over the sphere. */
function* directions(count: number) {
	let s = 987654321;
	const rnd = () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
	for (let n = 0; n < count; n++) {
		const z = 2 * rnd() - 1;
		const phi = 2 * Math.PI * rnd();
		const r = Math.sqrt(1 - z * z);
		yield new Vec3(r * Math.cos(phi), r * Math.sin(phi), z).normalize();
	}
}

/** Whether a chunk's triangle holds a direction. */
function holds(
	selection: { chunkLevel: number; key: number },
	direction: Vec3,
): boolean {
	const address = ChunkAddress.fromKey(selection.key, selection.chunkLevel);
	const cell = positionToCell(direction, 1 << DEPTH);
	if (cell.face !== address.face) return false;
	const split = splitPath(cell.i, cell.j, DEPTH, selection.chunkLevel);
	for (let level = 0; level < selection.chunkLevel; level++)
		if (split.path[level] !== address.path[level]) return false;
	return true;
}

describe("selectChunks", () => {
	it("drops the chunk level as it drops the sampling level", () => {
		// A chunk one level coarser covers four times the area at half the
		// resolution, so it holds the same slots and there are four times fewer.
		for (const altitude of [2, 100, 4000]) {
			for (const selection of selectChunks(
				DEPTH,
				FINEST,
				VIEWER,
				RADIUS + altitude,
				RADIUS,
			)) {
				expect(selection.chunkLevel).toBe(FINEST - selection.lod);
				expect(selection.lod).toBeGreaterThanOrEqual(0);
				expect(selection.chunkLevel).toBeGreaterThanOrEqual(0);
			}
		}
	});

	it("never selects a chunk inside another", () => {
		// One triangle inside another would draw the same ground twice, and the
		// two copies would fight over the depth buffer.
		const chosen = selectChunks(
			DEPTH,
			FINEST,
			VIEWER,
			RADIUS + 200,
			RADIUS,
		);
		const paths = chosen.map((selection) => ({
			face: ChunkAddress.fromKey(selection.key, selection.chunkLevel)
				.face,
			path: ChunkAddress.fromKey(selection.key, selection.chunkLevel)
				.path,
		}));
		for (let a = 0; a < paths.length; a++)
			for (let b = a + 1; b < paths.length; b++) {
				if (paths[a]!.face !== paths[b]!.face) continue;
				const shorter =
					paths[a]!.path.length <= paths[b]!.path.length
						? paths[a]!
						: paths[b]!;
				const longer = shorter === paths[a]! ? paths[b]! : paths[a]!;
				let prefix = true;
				for (let level = 0; level < shorter.path.length; level++)
					if (shorter.path[level] !== longer.path[level])
						prefix = false;
				expect(prefix).toBe(false);
			}
	});

	it("covers what the viewer can see, exactly once", () => {
		// Children tile their parent, so however the levels fall the surface is
		// covered with no gap and no overlap.
		const chosen = selectChunks(
			DEPTH,
			FINEST,
			VIEWER,
			RADIUS + 400,
			RADIUS,
		);
		let checked = 0;
		for (const direction of directions(400)) {
			// Well inside the horizon, so a direction on the rim is not what is
			// under test.
			if (direction.dot(VIEWER) < 0.75) continue;
			checked++;
			let covering = 0;
			for (const selection of chosen)
				if (holds(selection, direction)) covering++;
			expect(covering).toBe(1);
		}
		expect(checked).toBeGreaterThan(10);
	});

	it("draws the ground underfoot finer than the skyline", () => {
		const chosen = selectChunks(
			DEPTH,
			FINEST,
			VIEWER,
			RADIUS + 300,
			RADIUS,
		);
		const nearest = chosen[0]!;
		const furthest = chosen[chosen.length - 1]!;
		expect(nearest.distance).toBeLessThan(furthest.distance);
		expect(nearest.lod).toBeLessThan(furthest.lod);
	});

	it("keeps the ground underfoot at full detail on top of a mountain", () => {
		// The regression that shipped as whole-chunk cells around the player:
		// distance went to the chunk's centre at sea level, so a player
		// standing on 1,500 m ground was 1,500-odd metres from the chunk
		// under their own feet, and it was drawn at the level of detail that
		// distance deserves. The distance is to the chunk's ground now, whose
		// height the peak term already names.
		const standingOn = 1500;
		const peak = 1640;
		for (const detail of [1, 2]) {
			const chosen = selectChunks(
				DEPTH,
				FINEST,
				VIEWER,
				RADIUS + standingOn + 1.86,
				RADIUS,
				detail,
				peak,
			);
			const under = chosen[0]!;
			expect(under.lod).toBe(0);
			// Metres from the eye to ground at its own height, not a figure
			// carrying the whole mountain.
			expect(under.distance).toBeLessThan(100);
		}
	});

	it("still reads sea-level ground at its sea-level distance", () => {
		// The clamp must not lift ground that is not there: on a smooth world
		// the peak term is zero and the distances are to the sphere, so a
		// flying viewer's underfoot chunk is exactly its altitude away.
		const chosen = selectChunks(
			DEPTH,
			FINEST,
			VIEWER,
			RADIUS + 300,
			RADIUS,
			2,
			0,
		);
		expect(chosen[0]!.distance).toBeGreaterThan(299);
		expect(chosen[0]!.distance).toBeLessThan(320);
	});

	it("takes the whole planet from far enough out", () => {
		const chosen = selectChunks(DEPTH, FINEST, VIEWER, RADIUS * 4, RADIUS);
		// Half the sphere and a little, at the coarsest levels, and few enough
		// to draw. Holding the chunk level fixed would give 20 * 4^FINEST.
		expect(chosen.length).toBeGreaterThan(10);
		expect(chosen.length).toBeLessThan(20 * 4 ** FINEST);
		for (const selection of chosen)
			expect(selection.chunkLevel).toBeLessThan(FINEST);
	});

	it("leaves the far side of the planet out", () => {
		const chosen = selectChunks(DEPTH, FINEST, VIEWER, RADIUS + 50, RADIUS);
		const away = VIEWER.scale(-1);
		for (const selection of chosen)
			expect(holds(selection, away)).toBe(false);
	});

	it("keeps the world in view for an eye at the surface radius itself", () => {
		// The regression that shipped as a four-chunk world: on a sphere with
		// no relief the surface sits at the reference radius exactly, the
		// eye-height term is zero there, and without the peak term the only
		// chunks kept were the ones directly underfoot. Ground standing above
		// the sphere is what there is to see, and its own horizon is what has
		// to reach it.
		const peak = 150;
		const peakHorizon = Math.acos(RADIUS / (RADIUS + peak));
		const east = VIEWER.cross(new Vec3(0, 1, 0)).normalize();
		// Half the peak's horizon out: far outside the chunks underfoot, and
		// well inside where a peak is visible from.
		const inside = VIEWER.scale(Math.cos(peakHorizon * 0.5))
			.add(east.scale(Math.sin(peakHorizon * 0.5)))
			.normalize();

		const smooth = selectChunks(DEPTH, FINEST, VIEWER, RADIUS, RADIUS);
		const peaked = selectChunks(
			DEPTH,
			FINEST,
			VIEWER,
			RADIUS,
			RADIUS,
			2,
			peak,
		);
		expect(smooth.some((selection) => holds(selection, inside))).toBe(
			false,
		);
		expect(peaked.some((selection) => holds(selection, inside))).toBe(true);
	});

	it("reaches ground standing above the sphere beyond the horizon", () => {
		// A peak of height p is visible from the eye-height horizon plus the
		// peak's own: R acos(R/(R+eye)) + R acos(R/(R+p)). A direction between
		// the two is ground only a peak can occupy -- selected when the peak
		// height says one can be there, and not when it says the world is
		// smooth.
		const eye = 1.6;
		const peak = 150;
		const eyeHorizon = Math.acos(RADIUS / (RADIUS + eye));
		const peakHorizon = Math.acos(RADIUS / (RADIUS + peak));
		const east = VIEWER.cross(new Vec3(0, 1, 0)).normalize();
		const between = VIEWER.scale(Math.cos(eyeHorizon + peakHorizon * 0.5))
			.add(east.scale(Math.sin(eyeHorizon + peakHorizon * 0.5)))
			.normalize();

		const smooth = selectChunks(
			DEPTH,
			FINEST,
			VIEWER,
			RADIUS + eye,
			RADIUS,
			2,
			0,
		);
		const peaked = selectChunks(
			DEPTH,
			FINEST,
			VIEWER,
			RADIUS + eye,
			RADIUS,
			2,
			peak,
		);
		expect(smooth.some((selection) => holds(selection, between))).toBe(
			false,
		);
		expect(peaked.some((selection) => holds(selection, between))).toBe(
			true,
		);
	});
});

describe("WorldShape.atLod", () => {
	const base = new WorldShape(RADIUS, DEPTH, 150, maxCrustDepth(DEPTH));

	it("doubles the cell and halves the layers each level, plus a floor", () => {
		// The extra layer is the floor's margin: a surface fills only layers
		// whose top face is at or below it, so ground inside the bottom
		// layer's span needs the layer under it to exist, and rounding the
		// count up supplies at most a block minus a metre of that room.
		for (let lod = 1; lod <= 4; lod++) {
			const at = base.atLod(lod);
			expect(at.subdivisionDepth).toBe(DEPTH - lod);
			expect(at.blockSize).toBeCloseTo(base.blockSize * 2 ** lod, 9);
			expect(at.crustDepth).toBe(
				Math.ceil(base.crustDepth / 2 ** lod) + 1,
			);
		}
	});

	it("holds every surface the base level holds, at every coarser one", () => {
		// The regression that shipped as face-sized holes in the far field:
		// the reported world's crust reached 4 m past its deepest sea floor,
		// which is under one coarse block at every level past the second, so
		// deep-ocean ground filled no layer at all and whole coarse chunks
		// were empty. Every surface the base crust holds must land on a layer
		// that exists at every level of detail.
		const reported = new WorldShape(6801, 13, 1640, 1744);
		for (let lod = 1; lod <= 10; lod++) {
			const at = reported.atLod(lod);
			for (const elevation of [-100, -46, 0, 240, 1610]) {
				const surface = at.seaLevelRadius + elevation;
				expect(
					at.layerOfSurface(surface),
					`lod ${lod}, elevation ${elevation}`,
				).toBeLessThanOrEqual(at.crustDepth - 1);
			}
		}
	});

	it("keeps every layer boundary a boundary at the finest level", () => {
		// A seam between two levels can only open horizontally, because both
		// agree about where every layer boundary is.
		for (let lod = 1; lod <= 4; lod++) {
			const at = base.atLod(lod);
			for (const layer of [0, 1, 5, 20]) {
				expect(at.radiusOfLayer(layer)).toBeCloseTo(
					base.radiusOfLayer(layer * 2 ** lod),
					9,
				);
			}
		}
	});

	it("returns itself at level 0", () => {
		expect(base.atLod(0)).toBe(base);
	});
});

describe("selecting against a view", () => {
	/** A cull keeping a cone about one direction, refusing what misses it. */
	function cone(look: Vec3, halfAngle: number) {
		return {
			holds(x: number, y: number, z: number, radius: number): boolean {
				const at = new Vec3(x, y, z);
				const away = at.length();
				if (away < 1e-9) return true;
				// What the sphere itself subtends, so one straddling the edge
				// of the cone is kept the way a frustum keeps it.
				const spread = Math.asin(Math.min(1, radius / away));
				const between = Math.acos(
					Math.min(1, Math.max(-1, at.scale(1 / away).dot(look))),
				);
				return between - spread <= halfAngle;
			},
		};
	}

	const HIGH = RADIUS + 400;
	const EYE = VIEWER.scale(HIGH);
	const ahead = (halfAngle: number, slack = 0) =>
		selectChunks(
			DEPTH,
			FINEST,
			EYE,
			HIGH,
			RADIUS,
			undefined,
			0,
			undefined,
			cone(VIEWER, halfAngle),
			slack,
		);
	const all = () => selectChunks(DEPTH, FINEST, EYE, HIGH, RADIUS);

	it("selects fewer chunks than the whole ring, and only ones it would have", () => {
		const kept = ahead(0.25);
		expect(kept.length).toBeGreaterThan(0);
		expect(kept.length).toBeLessThan(all().length);

		// Culling only removes. It never invents a chunk, and never moves one
		// to a level the uncalled selection would not have drawn it at.
		const before = new Set(
			all().map((s) => `${s.chunkLevel}:${s.key}:${s.lod}`),
		);
		for (const selection of kept)
			expect(
				before.has(
					`${selection.chunkLevel}:${selection.key}:${selection.lod}`,
				),
			).toBe(true);
	});

	it("keeps the ground under the viewer, which is what they stand on", () => {
		expect(ahead(0.25).some((s) => holds(s, VIEWER))).toBe(true);
	});

	it("widens with the slack", () => {
		expect(ahead(0.25, 1.5).length).toBeGreaterThan(ahead(0.25, 0).length);
	});

	it("is exactly the unculled selection when nothing is refused", () => {
		expect(
			selectChunks(
				DEPTH,
				FINEST,
				EYE,
				HIGH,
				RADIUS,
				undefined,
				0,
				undefined,
				{ holds: () => true },
				0,
			),
		).toEqual(all());
	});
});
