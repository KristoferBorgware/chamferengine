import type { LandformGrid } from "chamfer/generation";
import {
	ANY_LANDFORM,
	BIOME_PRESETS,
	DEFAULT_LANDFORM_GRID,
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
	const set = BIOME_PRESETS[preset] ?? BIOME_PRESETS["plain"]!;
	return {
		preset: BIOME_PRESETS[preset] ? preset : "plain",
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
			biome.block === fresh.block
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
 * A biome reads `name~hex~t~h~landform~block`, biomes are separated by `;`,
 * and the first field names the preset with the grid beside it.
 */
export function biomeTableToText(draft: BiomeTableDraft): string {
	if (untouched(draft)) return draft.preset;
	const rows = draft.biomes.map(
		(biome) =>
			`${biome.name.replace(/[~;|]/g, " ")}~${biome.hex}~` +
			`${+biome.t.toFixed(3)}~${+biome.h.toFixed(3)}~` +
			`${biome.landform}~${biome.block}`,
	);
	return [`${draft.preset}|${draft.grid}`, ...rows].join(";");
}

/** The table a world's own string carries, tolerant of anything a link can say. */
export function biomeTableFromText(text: string): BiomeTableDraft {
	const trimmed = text.trim();
	if (trimmed === "" || BIOME_PRESETS[trimmed]) return biomeTableOf(trimmed);
	const parts = trimmed.split(";");
	const [preset = "plain", grid = ""] = (parts[0] ?? "").split("|");
	const out = biomeTableOf(preset);
	if (
		grid.length === DEFAULT_LANDFORM_GRID.length &&
		[...grid].every((digit) => {
			const form = Number(digit);
			return Number.isInteger(form) && form >= 0 && form < LANDFORMS.length;
		})
	)
		out.grid = grid;
	const biomes: BiomeDraftDef[] = [];
	for (const row of parts.slice(1)) {
		const [name, hex, t, h, landform, block] = row.split("~");
		if (!name || !hex || !/^[0-9a-f]{6}$/i.test(hex)) continue;
		const tAt = Number(t);
		const hAt = Number(h);
		const blockAt = Number(block);
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
		});
	}
	if (biomes.length > 0) out.biomes = biomes;
	return out;
}
