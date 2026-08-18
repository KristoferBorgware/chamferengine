import type { CoarseField, CoarseMap } from "chamfer/generation";
import { coarseFieldOf } from "chamfer/generation";
import { geographicOf } from "chamfer/coordinates";
import { rampColor } from "./rampColor.js";
import { latticePosition, positionToCell } from "chamfer/addressing";
import { positionOf } from "chamfer/coordinates";

/**
 * Draw one field of a coarse map into an image, longitude across and latitude
 * down.
 *
 * **Every cell is drawn, and a pixel is the average of the cells that land on
 * it.** A map at level 8 holds 655,362 cells against a picture of 131,072
 * pixels, so asking each pixel which cell it sits on would show one cell in
 * five and drop the rest — which reads as speckle, because neighbouring cells
 * of a field with relief in it are not the same color. Walking the cells
 * instead makes the picture a mean rather than a sample, and costs one pass
 * over the map rather than one lookup per pixel.
 *
 * The rectangle is the picture and never the storage. It stretches at the top
 * and bottom, where a row of pixels covers a few metres of ground, and that is
 * a property of drawing a sphere flat. Latitude and longitude come from the
 * axis doc 20 fixes through two pentagons, so the same place lands in the same
 * pixel on every world.
 */
export function paintCoarseField(
	map: CoarseMap,
	field: CoarseField,
	width: number,
	height: number,
	into: Uint8ClampedArray,
): void {
	const values = coarseFieldOf(map, field);
	// A field drawn as a difference is averaged as a difference, not as two
	// averages subtracted afterwards -- those agree here, and only because
	// every pixel weights its cells equally.
	const base = field.against
		? coarseFieldOf(map, { key: field.against })
		: null;
	const n = 1 << map.level;
	const sum = new Float32Array(width * height);
	const count = new Uint32Array(width * height);
	// A cell on a face edge answers to several names and is one cell. Taking it
	// once per name would weight the thirty seams twice over and the twelve
	// icosahedron vertices five times.
	const taken = new Uint8Array(map.count);

	for (let face = 0; face < 20; face++)
		for (let i = 0; i <= n; i++)
			for (let j = 0; i + j <= n; j++) {
				const cell = map.index.indexOf(face, i, j);
				if (cell < 0 || taken[cell]) continue;
				taken[cell] = 1;

				const place = geographicOf(latticePosition(face, n, i, j), 1);
				const x = Math.min(
					width - 1,
					Math.max(
						0,
						Math.floor(((place.longitude + 180) / 360) * width),
					),
				);
				const y = Math.min(
					height - 1,
					Math.max(
						0,
						Math.floor(((90 - place.latitude) / 180) * height),
					),
				);
				const at = y * width + x;
				sum[at]! += (values[cell] ?? 0) - (base?.[cell] ?? 0);
				count[at]!++;
			}

	// Near the poles a row of pixels is wider than the ring of cells under it,
	// so some pixels catch nothing. Those few ask which cell they sit on, which
	// is the lookup this function avoids everywhere else.
	for (let at = 0; at < width * height; at++) {
		if (count[at]) continue;
		const y = Math.floor(at / width);
		const x = at - y * width;
		const place = {
			latitude: 90 - ((y + 0.5) / height) * 180,
			longitude: ((x + 0.5) / width) * 360 - 180,
			altitude: 0,
		};
		const cell = positionToCell(positionOf(place, 1), n);
		const found = map.index.indexOf(cell.face, cell.i, cell.j);
		sum[at] = (values[found] ?? 0) - (base?.[found] ?? 0);
		count[at] = 1;
	}

	// Averaging the values and then coloring, rather than averaging colors: a
	// mean of two heights is a height, while a mean of two colors off a ramp is
	// whatever the ramp does between them.
	for (let at = 0; at < width * height; at++) {
		const [r, g, b] = rampColor(
			count[at] ? sum[at]! / count[at]! : 0,
			field,
			map.seaLevel,
		);
		into[at * 4] = r;
		into[at * 4 + 1] = g;
		into[at * 4 + 2] = b;
		into[at * 4 + 3] = 255;
	}
}
