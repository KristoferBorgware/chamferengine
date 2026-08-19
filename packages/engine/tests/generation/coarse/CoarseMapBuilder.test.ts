import { describe, expect, it } from "vitest";
import type { CoarseStage } from "chamfer/generation";
import {
	COARSE_STAGES,
	CoarseMapBuilder,
	buildCoarseMap,
	coarseStageOf,
} from "chamfer/generation";

const SEED = 909;
const LEVEL = 5;
const OPTIONS = { level: LEVEL, cellMetres: 200 };

/** Every field of two maps, cell by cell. */
function same(a: ReturnType<typeof buildCoarseMap>, b: typeof a): void {
	expect(b.count).toBe(a.count);
	for (const key of ["height"] as const)
		for (let cell = 0; cell < a.count; cell++)
			expect(b[key][cell], `${key} at ${cell}`).toBe(a[key][cell]);
}

describe("CoarseMapBuilder", () => {
	const wanted = buildCoarseMap(SEED, OPTIONS);

	it("builds the same map a single call does", () => {
		same(wanted, new CoarseMapBuilder(LEVEL).run(SEED, OPTIONS));
	});

	it("hands back every step, in order, ending with the finished map", () => {
		const builder = new CoarseMapBuilder(LEVEL);
		const seen: CoarseStage[] = [];
		let last;
		for (const step of builder.build(SEED, OPTIONS)) {
			seen.push(step.stage);
			expect(step.map.count).toBe(wanted.count);
			last = step;
		}
		expect(seen).toEqual([...COARSE_STAGES]);
		expect(last!.done).toBe(true);
		same(wanted, last!.map);
	});

	/**
	 * The whole point of holding a step. Starting again part way down has to
	 * give the map a full run gives, or the editor draws one thing and Apply
	 * builds another.
	 */
	it("gives the same map when it starts again from any step", () => {
		for (const from of COARSE_STAGES) {
			const builder = new CoarseMapBuilder(LEVEL);
			builder.run(SEED, OPTIONS);
			same(wanted, builder.run(SEED, OPTIONS, from));
		}
	});

	it("starts at the top on a first run, whatever step it is asked for", () => {
		const builder = new CoarseMapBuilder(LEVEL);
		same(wanted, builder.run(SEED, OPTIONS, "erosion"));
	});

	/** A knob that only reaches erosion must still answer to a changed value. */
	it("picks up a changed option at the step that option reaches", () => {
		const builder = new CoarseMapBuilder(LEVEL);
		builder.run(SEED, OPTIONS);
		const cut = { ...OPTIONS, erosion: 0.8 };
		const partial = builder.run(SEED, cut, coarseStageOf("erosion"));
		same(buildCoarseMap(SEED, cut), partial);

		const land = { ...OPTIONS, landFraction: 0.6 };
		const fromSea = builder.run(SEED, land, coarseStageOf("landFraction"));
		same(buildCoarseMap(SEED, land), fromSea);
	});

	it("reuses one grid across runs", () => {
		const builder = new CoarseMapBuilder(LEVEL);
		const first = builder.run(SEED, OPTIONS);
		const second = builder.run(SEED, OPTIONS, "erosion");
		expect(second.index).toBe(first.index);
		expect(second.index).toBe(builder.grid);
	});

	it("names a step for every option a map takes", () => {
		for (const option of [
			"level",
			"cellMetres",
			"frequency",
			"octaves",
			"persistence",
			"lacunarity",
			"offsetX",
			"offsetY",
			"relief",
			"landFraction",
			"erosion",
			"landform",
		] as const)
			expect(COARSE_STAGES).toContain(coarseStageOf(option));
	});
});
