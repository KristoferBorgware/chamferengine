import type { CloudField } from "./CloudField.js";
import { canonicalCell } from "../addressing/neighbours/canonicalCell.js";
import { cellCorners } from "../addressing/lattice/cellCorners.js";
import { neighbour } from "../addressing/neighbours/neighbour.js";

/** The vertices and indices a cloud field draws as. */
export interface CloudMesh {
	readonly vertices: Float32Array<ArrayBuffer>;
	readonly indices: Uint32Array<ArrayBuffer>;
	readonly puffs: number;
}

/**
 * Turn a stack of shells into triangles: a hexagon prism per solid cell, with
 * the faces it shares with a solid neighbour left out.
 *
 * The same corners a cell uses, at whatever radius a shell sits at: the
 * construction that puts cells on a sphere never mentions one, so the hexagons
 * are there at any height. A face is emitted wherever a solid shell borders
 * open air -- above, below, or across one of its six (five, on a pentagon)
 * sides -- the way the terrain mesher culls the faces buried inside a solid
 * run. Nothing here has an address, and the buffer is thrown away when the
 * wind turns.
 *
 * Every vertex carries the point's own horizontal cover for the fragment
 * shader's alpha, not a per-shell value: the shells give a cloud its shape,
 * cover still says how thick it reads.
 */
export function buildCloudMesh(
	field: CloudField,
	baseRadius: number,
	shellSpan: number,
): CloudMesh {
	const vertices: number[] = [];
	const indices: number[] = [];
	let puffs = 0;

	for (let point = 0; point < field.count; point++) {
		const base = point * field.shells;
		let any = false;
		for (let s = 0; s < field.shells; s++)
			if (field.solid[base + s]) {
				any = true;
				break;
			}
		if (!any) continue;
		puffs++;

		const cover = field.cover[point]!;
		const face = field.faces[point]!;
		const i = field.offsets[point * 2]!;
		const j = field.offsets[point * 2 + 1]!;
		const corners = cellCorners(face, field.n, i, j);
		const degree = corners.length;

		const put = (radius: number, corner: number): number => {
			const p = corners[corner]!;
			const at = vertices.length / 4;
			vertices.push(p.x * radius, p.y * radius, p.z * radius, cover);
			return at;
		};

		for (let s = 0; s < field.shells; s++) {
			if (!field.solid[base + s]) continue;
			const bottomRadius = baseRadius + s * shellSpan;
			const topRadius = baseRadius + (s + 1) * shellSpan;

			if (s === 0 || !field.solid[base + s - 1]) {
				const first: number[] = new Array<number>(degree);
				for (let c = 0; c < degree; c++)
					first[c] = put(bottomRadius, degree - 1 - c);
				for (let c = 1; c + 1 < degree; c++)
					indices.push(first[0]!, first[c]!, first[c + 1]!);
			}
			if (s === field.shells - 1 || !field.solid[base + s + 1]) {
				const first: number[] = new Array<number>(degree);
				for (let c = 0; c < degree; c++) first[c] = put(topRadius, c);
				for (let c = 1; c + 1 < degree; c++)
					indices.push(first[0]!, first[c]!, first[c + 1]!);
			}

			for (let k = 0; k < 6; k++) {
				const nb = neighbour(face, field.n, i, j, k);
				if (!nb) continue;
				// A crossing hands back whichever face's coordinates the
				// reflection lands on, and the field only registered each
				// shared point once, under its lowest face -- so the lookup
				// has to ask for the same name the field used.
				const canon = canonicalCell(nb.face, field.n, nb.i, nb.j);
				const nbPoint = field.indexOf(canon.face, canon.i, canon.j);
				const nbSolid =
					nbPoint >= 0 && field.solid[nbPoint * field.shells + s];
				if (nbSolid) continue;

				const left = (k + degree - 1) % degree;
				const right = k;
				const topLeft = put(topRadius, left);
				const topRight = put(topRadius, right);
				const bottomRight = put(bottomRadius, right);
				const bottomLeft = put(bottomRadius, left);
				indices.push(
					topLeft,
					bottomLeft,
					bottomRight,
					topLeft,
					bottomRight,
					topRight,
				);
			}
		}
	}

	return {
		vertices: Float32Array.from(vertices),
		indices: Uint32Array.from(indices),
		puffs,
	};
}
