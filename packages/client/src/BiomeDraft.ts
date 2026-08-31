import type { LandformGrid } from "chamfer/generation";
import {
	ANY_LANDFORM,
	BIOME_PRESETS,
	DEFAULT_LANDFORM_GRID,
	DEFAULT_PRESET,
	riseGrid,
	LANDFORMS,
} from "chamfer/generation";

/** One biome as the panel edits it: the definition, with every field loose. */
export interface BiomeDraftDef {
	name: string;
	hex: string;
	t: number;
	h: number;
	landform: string;
	block: number;

	/** What this biome cuts into below its surface, or absent for plain dirt. */
	underlay?: number | undefined;
}

/** The biome table a world carries: which preset it started from, and where it is now. */
export interface BiomeTableDraft {
	/** The preset the table was last set from, for the panel's select. */
	preset: string;

	/** The biomes themselves, edited or not. */
	biomes: BiomeDraftDef[];

	/** The landform grid, one digit per band combination. */
	grid: LandformGrid;
}

/** A fresh copy of one preset's table. */
export function biomeTableOf(preset: string): BiomeTableDraft {
	// **One preset, and a link may still name one that is gone.** A world
	// written under a set this build no longer carries opens on the set it
	// does carry rather than refusing: the grid and the dots that follow in
	// the link are read over it, so as much of that world survives as still
	// means anything.
	const named = BIOME_PRESETS[preset] ? preset : DEFAULT_PRESET;
	const set = BIOME_PRESETS[named]!;
	return {
		preset: named,
		biomes: set.map((biome) => ({ ...biome })),
		grid: DEFAULT_LANDFORM_GRID,
	};
}

/** Whether a table still is its preset, dot for dot and digit for digit. */
function untouched(draft: BiomeTableDraft): boolean {
	const set = BIOME_PRESETS[draft.preset];
	if (!set || draft.grid !== DEFAULT_LANDFORM_GRID) return false;
	if (draft.biomes.length !== set.length) return false;
	return draft.biomes.every((biome, at) => {
		const fresh = set[at]!;
		return (
			biome.name === fresh.name &&
			biome.hex === fresh.hex &&
			biome.t === fresh.t &&
			biome.h === fresh.h &&
			biome.landform === fresh.landform &&
			biome.block === fresh.block &&
			biome.underlay === fresh.underlay
		);
	});
}

/**
 * The whole table as one string, which is how a world carries its biomes.
 *
 * **The query string is the only place a world is written down**, so what its
 * ground is named is part of the same definition its shape is: a link from any
 * bench lands on any other with the same planet and the same biomes. A table
 * still equal to its preset travels as the preset's name alone.
 *
 * A biome reads `name~hex~t~h~landform~block~underlay`, biomes are separated
 * by `;`, and the first field names the preset with the grid
 * beside it. The underlay field is empty for plain dirt, not the string
 * `undefined` -- empty is what an older link before this field existed also
 * reads as.
 */
export function biomeTableToText(draft: BiomeTableDraft): string {
	if (untouched(draft)) return draft.preset;
	const rows = draft.biomes.map(
		(biome) =>
			`${biome.name.replace(/[~;|]/g, " ")}~${biome.hex}~` +
			`${+biome.t.toFixed(3)}~${+biome.h.toFixed(3)}~` +
			`${biome.landform}~${biome.block}~` +
			`${biome.underlay ?? ""}`,
	);
	return [`${draft.preset}|${draft.grid}`, ...rows].join(";");
}

/** The table a world's own string carries, tolerant of anything a link can say. */
export function biomeTableFromText(text: string): BiomeTableDraft {
	const trimmed = text.trim();
	if (trimmed === "" || BIOME_PRESETS[trimmed]) return biomeTableOf(trimmed);
	const parts = trimmed.split(";");
	// **A third field is a link written while the elevation lapse was a term
	// of the table.** It is a world knob now, read off the query string like
	// every other one, so the field is stepped over rather than refused.
	const [preset = DEFAULT_PRESET, grid = ""] = (parts[0] ?? "").split("|");
	const out = biomeTableOf(preset);
	// **A grid written before the height axis is still a grid**, and
	// `riseGrid` spreads it across the new one so the world it named is
	// unchanged. Anything of neither length is not a grid at all.
	const spread = riseGrid(grid);
	if (
		spread !== null &&
		[...spread].every((digit) => {
			const form = Number(digit);
			return (
				Number.isInteger(form) && form >= 0 && form < LANDFORMS.length
			);
		})
	)
		out.grid = spread;
	const biomes: BiomeDraftDef[] = [];
	for (const row of parts.slice(1)) {
		const [name, hex, t, h, landform, block, underlay] = row.split("~");
		if (!name || !hex || !/^[0-9a-f]{6}$/i.test(hex)) continue;
		const tAt = Number(t);
		const hAt = Number(h);
		const blockAt = Number(block);
		const underlayAt = Number(underlay);
		if (!Number.isFinite(tAt) || !Number.isFinite(hAt)) continue;
		const filed =
			landform === ANY_LANDFORM ||
			LANDFORMS.some((form) => form.key === landform)
				? landform!
				: ANY_LANDFORM;
		biomes.push({
			name,
			hex: hex.toLowerCase(),
			t: Math.max(0, Math.min(1, tAt)),
			h: Math.max(0, Math.min(1, hAt)),
			landform: filed,
			block: Number.isInteger(blockAt) && blockAt > 0 ? blockAt : 3,
			underlay:
				underlay && Number.isInteger(underlayAt) && underlayAt > 0
					? underlayAt
					: undefined,
		});
	}
	if (biomes.length > 0) out.biomes = biomes;
	return out;
}
