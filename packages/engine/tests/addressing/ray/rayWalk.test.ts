import { describe, expect, it } from "vitest";
import type { RayWorld } from "chamfer/addressing";
import type { CellRef } from "chamfer/edit";
import { Vec3 } from "chamfer/math";
import { cellKey, directionToCell, faceOf, rayWalk } from "chamfer/addressing";

/**
 * A planet with a wobbled surface and scattered blocks under it, answered from
 * a cell's own position rather than from its lattice offset.
 *
 * A cell on a face edge has two names, so a world reading `i` and `j` answers
 * differently on the two sides of every edge and a walk crossing one meets a
 * wall that a march never saw.
 */
function world(depth: number, radius: number): RayWorld & { block: number } {
	const n = 1 << depth;
	const block = (1.2046 * radius) / n;
	const top = radius + 20;
	const relief = (p: Vec3) =>
		4 * block * Math.sin(p.x * 9) * Math.cos(p.y * 7);
	return {
		n,
		block,
		radiusOfLayer: (layer) => top - layer * block,
		layerOfRadius: (r) => Math.floor((top - r) / block),
		solidAt(cell: CellRef) {
			const [a, b, c] = [n - cell.i - cell.j, cell.i, cell.j];
			const p = positionOf(cell.face, n, a, b, c);
			return (
				cell.layer >= Math.floor((top - (radius + relief(p))) / block)
			);
		},
	};
}

function positionOf(
	face: number,
	n: number,
	a: number,
	b: number,
	c: number,
): Vec3 {
	const [x, y, z] = FACE_OF[face]!;
	return VERTS[x]!.scale(a / n)
		.add(VERTS[y]!.scale(b / n))
		.add(VERTS[z]!.scale(c / n))
		.normalize();
}

const PHI = (1 + Math.sqrt(5)) / 2;
const VERTS = [
	[-1, PHI, 0],
	[1, PHI, 0],
	[-1, -PHI, 0],
	[1, -PHI, 0],
	[0, -1, PHI],
	[0, 1, PHI],
	[0, -1, -PHI],
	[0, 1, -PHI],
	[PHI, 0, -1],
	[PHI, 0, 1],
	[-PHI, 0, -1],
	[-PHI, 0, 1],
].map(([x, y, z]) => new Vec3(x!, y!, z!).normalize());
const FACE_OF: readonly (readonly [number, number, number])[] = [
	[0, 11, 5],
	[0, 5, 1],
	[0, 1, 7],
	[0, 7, 10],
	[0, 10, 11],
	[1, 5, 9],
	[5, 11, 4],
	[11, 10, 2],
	[10, 7, 6],
	[7, 1, 8],
	[3, 9, 4],
	[3, 4, 2],
	[3, 2, 6],
	[3, 6, 8],
	[3, 8, 9],
	[4, 9, 5],
	[2, 4, 11],
	[6, 2, 10],
	[8, 6, 7],
	[9, 8, 1],
];

/** Sample the ray finely and collect the distinct cells, in order. */
function march(
	eye: Vec3,
	look: Vec3,
	w: RayWorld,
	reach: number,
	step: number,
): string[] {
	const out: string[] = [];
	let last = "";
	for (let t = 0; t <= reach; t += step) {
		const at = eye.add(look.scale(t));
		const c = directionToCell(at.normalize(), w.n);
		const layer = w.layerOfRadius(at.length());
		const id = `${cellKey(c.face, w.n, c.i, c.j)}@${layer}`;
		if (id === last) continue;
		last = id;
		out.push(id);
		if (w.solidAt({ face: c.face, i: c.i, j: c.j, layer })) break;
	}
	return out;
}

describe("rayWalk", () => {
	const depth = 8;
	const radius = 100;
	const w = world(depth, radius);
	const reach = 12 * w.block;

	/** Deterministic rays: an eye on its own ground, looking across it. */
	function rays(count: number) {
		let seed = 12345;
		const next = () => {
			seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
			return seed / 4294967296;
		};
		const out: { eye: Vec3; look: Vec3 }[] = [];
		for (let r = 0; r < count; r++) {
			const up = new Vec3(
				next() * 2 - 1,
				next() * 2 - 1,
				next() * 2 - 1,
			).normalize();
			const eye = up.scale(
				radius +
					4 * w.block * Math.sin(up.x * 9) * Math.cos(up.y * 7) +
					w.block * (1.6 + next() * 2),
			);
			const east = (
				Math.abs(up.y) < 0.9 ? new Vec3(0, 1, 0) : new Vec3(1, 0, 0)
			)
				.cross(up)
				.normalize();
			const north = up.cross(east);
			const az = next() * Math.PI * 2;
			const el = -0.9 + next() * 0.6;
			const look = east
				.scale(Math.cos(az) * Math.cos(el))
				.add(north.scale(Math.sin(az) * Math.cos(el)))
				.add(up.scale(Math.sin(el)))
				.normalize();
			out.push({ eye, look });
		}
		return out;
	}

	/**
	 * A march fine enough to miss nothing is hundreds of thousands of cell
	 * lookups, so these two run a sample rather than a survey. The statistics
	 * are `verification/ray.js`, over 3,000 rays; these guard the walk against
	 * a change that breaks it.
	 */
	const SAMPLE = 60;
	const SLOW = 30_000;

	it(
		"reports the cell a fine march converges to",
		() => {
			let checked = 0;
			let same = 0;
			for (const { eye, look } of rays(SAMPLE)) {
				const hit = rayWalk(eye, look, w, reach);
				const seen = march(eye, look, w, reach, w.block / 2000);
				if (!hit) continue;
				checked++;
				const id = `${cellKey(hit.cell.face, w.n, hit.cell.i, hit.cell.j)}@${hit.cell.layer}`;
				if (id === seen[seen.length - 1]) same++;
			}
			expect(checked).toBeGreaterThan(SAMPLE / 2);
			expect(same).toBe(checked);
		},
		SLOW,
	);

	it(
		"steps through every cell the march finds, in order",
		() => {
			for (const { eye, look } of rays(SAMPLE)) {
				const walked: string[] = [];
				const trace: RayWorld = {
					...w,
					solidAt(cell) {
						walked.push(
							`${cellKey(cell.face, w.n, cell.i, cell.j)}@${cell.layer}`,
						);
						return w.solidAt(cell);
					},
				};
				rayWalk(eye, look, trace, reach);
				const seen = march(eye, look, w, reach, w.block / 2000);
				let at = 0;
				for (const id of seen) {
					const found = walked.indexOf(id, at);
					expect(
						found,
						`${id} missing from the walk`,
					).toBeGreaterThan(-1);
					at = found + 1;
				}
			}
		},
		SLOW,
	);

	it("costs the same on planets three orders of magnitude apart", () => {
		const counts = [6, 8, 10, 12].map((d) => {
			const wd = world(d, radius);
			let stepped = 0;
			let n = 0;
			for (const { eye, look } of rays(SAMPLE)) {
				const scaled = {
					eye: eye
						.normalize()
						.scale(
							radius +
								4 *
									wd.block *
									Math.sin(eye.normalize().x * 9) *
									Math.cos(eye.normalize().y * 7) +
								wd.block * 2,
						),
					look,
				};
				const hit = rayWalk(scaled.eye, scaled.look, wd, 12 * wd.block);
				if (!hit) continue;
				stepped += hit.stepped;
				n++;
			}
			return stepped / n;
		});
		for (const c of counts) {
			expect(c).toBeGreaterThan(3);
			expect(c).toBeLessThan(14);
		}
	});

	it("names the face the eye stands over", () => {
		const { eye, look } = rays(1)[0]!;
		const hit = rayWalk(eye, look, w, reach);
		expect(hit).not.toBeNull();
		expect(hit!.cell.face).toBe(faceOf(eye.normalize()));
	});
});
