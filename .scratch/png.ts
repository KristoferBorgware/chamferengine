import { deflateSync } from "node:zlib";
export function encodePng(
	w: number,
	h: number,
	rgba: Uint8ClampedArray,
): Buffer {
	const raw = Buffer.alloc((w * 4 + 1) * h);
	for (let y = 0; y < h; y++) {
		raw[y * (w * 4 + 1)] = 0;
		Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(
			raw,
			y * (w * 4 + 1) + 1,
		);
	}
	const t: number[] = [];
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++)
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	const crc = (b: Buffer) => {
		let c = 0xffffffff;
		for (const x of b) c = t[(c ^ x) & 0xff]! ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	};
	const chunk = (ty: string, d: Buffer) => {
		const l = Buffer.alloc(4);
		l.writeUInt32BE(d.length);
		const b = Buffer.concat([Buffer.from(ty, "ascii"), d]);
		const c = Buffer.alloc(4);
		c.writeUInt32BE(crc(b));
		return Buffer.concat([l, b, c]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8;
	ihdr[9] = 6;
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(raw)),
		chunk("IEND", Buffer.alloc(0)),
	]);
}
