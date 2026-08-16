import type { CloudField } from "./CloudField.js";
import { cellCorners } from "../addressing/lattice/cellCorners.js";

/** The vertices and indices a cloud field draws as. */
export interface CloudMesh {
	readonly vertices: Float32Array<ArrayBuffer>;
	readonly indices: Uint32Array<ArrayBuffer>;
	readonly puffs: number;
}

/**
 * Turn the cloud field into hexagons at a radius.
 *
 * The same corners a cell uses, at a larger radius: the construction that puts
 * cells on a sphere never mentions one, so the hexagons are there at any
 * height. What is drawn is a hexagon of the lattice, not a cell of the world --
 * nothing here has an address, and the buffer is thrown away when the wind
 * turns.
 *
 * The points come from the field, so the geometry is drawn for exactly the
 * points the cover was filled for. Only points carrying cloud are written,
 * which keeps the buffer to the part of the sky with anything in it.
 */
export function buildCloudMesh(
	field: CloudField,
	radius: number,
	floor = 0.02,
): CloudMesh {
	const vertices: number[] = [];
	const indices: number[] = [];
	let puffs = 0;

	for (let at = 0; at < field.count; at++) {
		const cover = field.cover[at]!;
		if (cover <= floor) continue;

		const corners = cellCorners(
			field.faces[at]!,
			field.n,
			field.offsets[at * 2]!,
			field.offsets[at * 2 + 1]!,
		);
		const base = vertices.length / 4;
		for (const corner of corners)
			vertices.push(
				corner.x * radius,
				corner.y * radius,
				corner.z * radius,
				cover,
			);
		for (let c = 1; c + 1 < corners.length; c++)
			indices.push(base, base + c, base + c + 1);
		puffs++;
	}

	return {
		vertices: Float32Array.from(vertices),
		indices: Uint32Array.from(indices),
		puffs,
	};
}
