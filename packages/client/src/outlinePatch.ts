/**
 * Ring where the patch is standing, on the flat picture of the whole planet.
 *
 * The two pictures are one place, and nothing else on the planet says which
 * place. Longitude is across and latitude is down, so the rectangle is the
 * patch's own width in radians turned into pixels -- widened toward the poles,
 * where this projection stretches a degree of longitude into less ground.
 */
export function outlinePatch(
	pixels: Uint8ClampedArray,
	wide: number,
	tall: number,
	at: {
		readonly latitude: number;
		readonly longitude: number;
		readonly span: number;
		readonly radius: number;
	},
): void {
	const half = at.span / 2 / at.radius;
	const lat = (at.latitude * Math.PI) / 180;
	const across = half / Math.max(0.15, Math.cos(lat));
	const left = Math.round(
		((at.longitude + 180) / 360) * wide - (across / (2 * Math.PI)) * wide,
	);
	const top = Math.round(
		(0.5 - at.latitude / 180) * tall - (half / Math.PI) * tall,
	);
	const width = Math.max(
		2,
		Math.round(((across * 2) / (2 * Math.PI)) * wide),
	);
	const height = Math.max(2, Math.round(((half * 2) / Math.PI) * tall));
	const dot = (x: number, y: number): void => {
		if (x < 0 || y < 0 || x >= wide || y >= tall) return;
		const to = (y * wide + x) * 4;
		pixels[to] = 255;
		pixels[to + 1] = 180;
		pixels[to + 2] = 84;
		pixels[to + 3] = 255;
	};
	for (let x = left; x <= left + width; x++) {
		dot(x, top);
		dot(x, top + height);
	}
	for (let y = top; y <= top + height; y++) {
		dot(left, y);
		dot(left + width, y);
	}
}
