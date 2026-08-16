import { Vec3 } from "../../math/Vec3.js";
import { DIRECTIONS } from "../../addressing/neighbours/DIRECTIONS.js";
import { canonicalCell } from "../../addressing/neighbours/canonicalCell.js";
import { chunkSlots } from "../../addressing/lattice/chunkSlots.js";
import { latticePosition } from "../../addressing/lattice/latticePosition.js";
import { latticeWeights } from "../../addressing/lattice/latticeWeights.js";
import { rank } from "../../addressing/lattice/rank.js";

/**
 * Every cell of the planet at one subdivision level, numbered `0` to
 * `count - 1`, with the ring of neighbours around each.
 *
 * Flow routing compares a cell against its neighbours and nothing else, so it
 * needs a dense index rather than the packed cell IDs the rest of the engine
 * uses. Numbering runs face by face and, inside a face, by `rank(i, j)`, taking
 * each shared cell the first time its own face claims it. That order depends on
 * nothing but the level, so two machines number the planet identically.
 *
 * Every array here is typed and flat. At level 8 there are 655,362 cells, and
 * one object apiece is the layout that measures 15x slower.
 */
export class CoarseGrid {
	readonly level: number;

	/** Lattice steps along a face edge, `2^level`. */
	readonly n: number;

	readonly count: number;

	/** Three components per cell: the unit direction from the planet's centre. */
	readonly directions: Float64Array;

	/**
	 * Six slots per cell, holding neighbour indices. The twelve pentagons fill
	 * five and leave the sixth at `-1`.
	 */
	readonly ring: Int32Array;

	/** `face * slots + rank(i, j)` to cell index, for all twenty faces. */
	private readonly faceIndex: Int32Array;

	private readonly slots: number;

	constructor(level: number) {
		const n = 1 << level;
		const slots = chunkSlots(n);
		this.level = level;
		this.n = n;
		this.slots = slots;
		this.faceIndex = new Int32Array(20 * slots).fill(-1);

		const cellCount = 10 * 4 ** level + 2;
		this.count = cellCount;
		this.directions = new Float64Array(cellCount * 3);

		// A cell strictly inside a face is named by that face alone. A cell on an
		// edge or at an icosahedron vertex has up to five other names, and goes to
		// the lowest face among them.
		let next = 0;
		for (let face = 0; face < 20; face++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++) {
					const w = latticeWeights(n, i, j);
					const shared = w[0] === 0 || w[1] === 0 || w[2] === 0;
					if (shared && canonicalCell(face, n, i, j).face !== face)
						continue;
					const cell = next++;
					this.faceIndex[face * slots + rank(i, j, n)] = cell;
					// One transient vector per cell, once, while the grid is
					// built. Nothing allocates after that.
					const p: Vec3 = latticePosition(face, n, i, j);
					this.directions[cell * 3] = p.x;
					this.directions[cell * 3 + 1] = p.y;
					this.directions[cell * 3 + 2] = p.z;
				}

		for (let face = 0; face < 20; face++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++) {
					const at = face * slots + rank(i, j, n);
					if (this.faceIndex[at]! >= 0) continue;
					const c = canonicalCell(face, n, i, j);
					this.faceIndex[at] =
						this.faceIndex[c.face * slots + rank(c.i, c.j, n)]!;
				}

		// A cell's six lattice steps stay inside its own face unless the cell
		// sits on an edge, and there the faces on both sides each contribute the
		// steps on their side. Every cell therefore ends up with a full ring
		// without any face crossing being computed here.
		this.ring = new Int32Array(cellCount * 6).fill(-1);
		for (let face = 0; face < 20; face++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++) {
					const from = this.faceIndex[face * slots + rank(i, j, n)]!;
					for (const [di, dj] of DIRECTIONS) {
						const ni = i + di;
						const nj = j + dj;
						if (ni < 0 || nj < 0 || ni + nj > n) continue;
						this.link(
							from,
							this.faceIndex[face * slots + rank(ni, nj, n)]!,
						);
					}
				}
	}

	/** Record `to` in `from`'s ring, unless it is already there. */
	private link(from: number, to: number): void {
		const base = from * 6;
		for (let k = 0; k < 6; k++) {
			const at = this.ring[base + k]!;
			if (at === to) return;
			if (at < 0) {
				this.ring[base + k] = to;
				return;
			}
		}
	}

	/** How many neighbours a cell has: 5 on the twelve pentagons, 6 elsewhere. */
	degreeOf(cell: number): number {
		return this.ring[cell * 6 + 5]! < 0 ? 5 : 6;
	}

	/** The cell a face-and-offset names. */
	indexOf(face: number, i: number, j: number): number {
		return this.faceIndex[face * this.slots + rank(i, j, this.n)]!;
	}
}
