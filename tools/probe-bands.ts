import { GROUND_LINES, buildCoarseMap, seedFromString } from "chamfer/generation";

for (const [label, over] of [
	["shipped", {}],
	["peak 3x", { peakScale: 3 }],
	["drained 60 m", { seaLevel: -60 }],
	["roughen", { merge: "roughen" as const }],
	["no mountains", { mountainLayer: false }],
]) {
	const map = buildCoarseMap(seedFromString("chamfer"), { level: 6, ...over });
	const bands = [0, 0, 0, 0];
	let top = -Infinity;
	for (const h of map.height) {
		if (h > top) top = h;
		bands[h <= 0 ? 0 : h < GROUND_LINES.rock ? 1 : h < GROUND_LINES.snow ? 2 : 3]!++;
	}
	console.log(
		`${label.padEnd(14)} ${bands.map((b) => ((b / map.count) * 100).toFixed(0).padStart(3) + "%").join(" ")}  tallest ${top.toFixed(0)} m`,
	);
}
