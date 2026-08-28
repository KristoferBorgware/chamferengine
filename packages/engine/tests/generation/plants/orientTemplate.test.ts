import { describe, expect, it } from "vitest";
import { orientTemplate } from "chamfer/generation";

const step: [number, number] = [0, 0];
const turned = (di: number, dj: number, turn: number): [number, number] => {
	orientTemplate(di, dj, turn, step);
	return [step[0], step[1]];
};

describe("orientTemplate", () => {
	it("leaves a shape alone at turn 0", () => {
		for (let di = -4; di <= 4; di++)
			for (let dj = -4; dj <= 4; dj++)
				expect(turned(di, dj, 0)).toEqual([di, dj]);
	});

	// Six sixth-turns is a whole turn, which is where it started.
	it("comes back round after six turns", () => {
		for (let di = -6; di <= 6; di++)
			for (let dj = -6; dj <= 6; dj++) {
				let [x, y] = [di, dj];
				for (let n = 0; n < 6; n++) [x, y] = turned(x, y, 1);
				expect([x, y]).toEqual([di, dj]);
			}
	});

	// **A rotation and a mirror both keep the lattice**, so they preserve how
	// far apart two cells are -- a template laid down any way round is the same
	// shape, never a stretched one.
	it("keeps the distance between any two cells", () => {
		// Hex distance on the cube coordinates the transform works in.
		const apart = (a: number[], b: number[]): number => {
			const x = a[0]! - b[0]!;
			const y = a[1]! - b[1]!;
			return (Math.abs(x) + Math.abs(y) + Math.abs(x + y)) / 2;
		};
		const one = [3, -5];
		const two = [-2, 4];
		const was = apart(one, two);
		for (let turn = 0; turn < 12; turn++)
			expect(
				apart(
					turned(one[0]!, one[1]!, turn),
					turned(two[0]!, two[1]!, turn),
				),
			).toBe(was);
	});

	// Twelve orientations, or the variety they are here to buy is not there.
	it("gives twelve different answers", () => {
		const seen = new Set<string>();
		for (let turn = 0; turn < 12; turn++)
			seen.add(turned(2, 1, turn).join(","));
		expect(seen.size).toBe(12);
	});
});
