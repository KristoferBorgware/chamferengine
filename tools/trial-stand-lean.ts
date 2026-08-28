// Does a stand of plants lean the same way? **This probe cannot tell you.**
//
//   npx vite-node tools/trial-stand-lean.ts
//
// Kept as a warning rather than as a measurement. It reads, for every column
// holding a trunk, the direction the canopy near it sits in, and correlates
// neighbours -- and two columns two metres apart see largely the **same canopy
// cells**, so what it measures is overlap. It reports `0.514` within `6 m`
// whether the plants are turned by a smooth field or by a hash of their own
// cell, which are the two opposite answers, and `0.034` within `20 m` for both.
// A probe that gives the same number for both cases discriminates nothing.
//
// **What would measure it.** A plant's lean is a property of its template, not
// of the cells around it: each template's crown sits a known distance from its
// own foot (`0.81 m` at the median for the shipped pine, `1.51 m` for the oak),
// and the turn the stamp chose says which way that points in the world. Correlate
// *those* over neighbouring roots and the answer is exact. It needs the stand to
// say which template and which turn each plant got, which it does not today.
//
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import {
	PlantTemplateStore,
	growStand,
	plantRoots,
} from "chamfer/generation";
import { columnPatchLayout } from "chamfer/mesh";
import { Vec3 } from "chamfer/math";
import { isPlantWood } from "chamfer/generation";
import { plantLayerOf } from "../packages/client/src/PlantDraft.js";

const settings = new PlanetSettings({ plain: false });
const level = settings.plantLevel;
const block = settings.plantCellMetres;
const up = new Vec3(0.3, 0.5, 0.81).normalize();
const RINGS = 40;
/** How close two crowns have to be to count as neighbours, in metres. */
const NEAR = 6;

const layout = columnPatchLayout({ at: up, level, rings: RINGS });
const roots = plantRoots(up, level, RINGS);
const layers = settings.plantLayers.map(plantLayerOf);
const store = new PlantTemplateStore(
	settings.seedNumber,
	level,
	block,
	settings.radius,
);
const stand = growStand(
	layout,
	{
		top: new Float64Array(layout.count),
		groundLayer: new Int32Array(layout.count),
	},
	roots,
	new Float64Array(roots.count).fill(50),
	layers,
	{
		seed: settings.seedNumber,
		radius: settings.radius,
		blockMetres: block,
		rootLevel: level,
		chunkCells: 48,
		chunkReach: 24,
		seaLevel: 0,
		templates: store,
	},
);

// **The crown against the foot, per column that holds a trunk.** A plant's own
// cells are not labelled, so this reads the stand the way a viewer does: for
// every column with wood in it, where the wood above the middle of the plant
// sits against the column it rises from.
const east = new Vec3(0, 0, 0);
const north = new Vec3(0, 0, 0);
{
	const seed = new Vec3(0, 1, 0);
	const side = Math.abs(up.y) > 0.9 ? new Vec3(1, 0, 0) : seed;
	const e = side.cross(up).normalize();
	east.x = e.x;
	east.y = e.y;
	east.z = e.z;
	const nn = up.cross(e).normalize();
	north.x = nn.x;
	north.y = nn.y;
	north.z = nn.z;
}

/** Per column, the direction its own canopy sits in, or nothing. */
function leans(): Map<number, [number, number]> {
	const out = new Map<number, [number, number]>();
	for (let c = 0; c < layout.count; c++) {
		// The tallest wood standing over this column, and the canopy above it.
		let top = -1;
		for (let s = stand.layers - 1; s >= 0; s--)
			if (isPlantWood(stand.blocks[c * stand.layers + s]!)) {
				top = s;
				break;
			}
		if (top < stand.sunk + 3) continue;
		const cut = stand.sunk + (top - stand.sunk) * 0.7;
		let n = 0;
		let x = 0;
		let y = 0;
		const here = new Vec3(
			layout.directions[c * 3]!,
			layout.directions[c * 3 + 1]!,
			layout.directions[c * 3 + 2]!,
		);
		for (let o = 0; o < layout.count; o++) {
			const there = new Vec3(
				layout.directions[o * 3]!,
				layout.directions[o * 3 + 1]!,
				layout.directions[o * 3 + 2]!,
			);
			const away = there.sub(here).scale(settings.radius);
			if (away.length() > 6) continue;
			for (let s = Math.ceil(cut); s < stand.layers; s++) {
				if (stand.blocks[o * stand.layers + s]! === 0) continue;
				x += away.dot(east);
				y += away.dot(north);
				n++;
			}
		}
		if (n === 0) continue;
		const len = Math.hypot(x, y);
		if (len < 1e-6) continue;
		out.set(c, [x / len, y / len]);
	}
	return out;
}

const held = leans();
let agree = 0;
let pairs = 0;
for (const [c, one] of held) {
	const here = new Vec3(
		layout.directions[c * 3]!,
		layout.directions[c * 3 + 1]!,
		layout.directions[c * 3 + 2]!,
	);
	for (const [o, two] of held) {
		if (o <= c) continue;
		const there = new Vec3(
			layout.directions[o * 3]!,
			layout.directions[o * 3 + 1]!,
			layout.directions[o * 3 + 2]!,
		);
		const away = there.sub(here).scale(settings.radius).length();
		if (away > NEAR) continue;
		agree += one[0] * two[0] + one[1] * two[1];
		pairs++;
	}
}

console.log(
	`bend feature ${Math.max(...layers.filter((l) => l.on).map((l) => l.shape.bendFeature))} m, ` +
		`${held.size} crowns, ${pairs} pairs within ${NEAR} m`,
);
console.log(
	`neighbours lean the same way: ${(agree / Math.max(1, pairs)).toFixed(3)} ` +
		`(1 is together, 0 is every tree its own way)`,
);
