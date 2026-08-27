// What a blocked direction sending light back is worth, by depth.
//
//   npx tsx tools/trial-skybounce.ts
//
// A direction blocked by rock points at a lit surface. Before, it was worth
// nothing and everything enclosed fell to one flat floor -- so a shaft read
// the same at its mouth and forty layers down. This is what the bounce puts
// back, against the sun's share already refused by the shadow.
import { skyExposure } from "chamfer/light";

const REACH = 6;
const FLOOR = 0.12;
// The sky's share of the light. A shut-in face gets no direct sun at all, so
// this is the whole of what it has.
const SKY_SHARE = 0.42;

const shutIn = (above: number) => Array.from({ length: 6 }, () => -above);

console.log(`a face with every direction blocked, reach ${REACH}, floor ${FLOOR}`);
console.log(
	`${"layers above".padEnd(13)}${"none".padStart(8)}${"0.35".padStart(8)}` +
		`${"0.60".padStart(8)}${"x".padStart(7)}${"of open".padStart(9)}`,
);
for (const above of [1, 2, 3, 4, 6, 8, 12, 20, 40, 80]) {
	const around = shutIn(above);
	const off = skyExposure(0, around, REACH, FLOOR, 0);
	const mid = skyExposure(0, around, REACH, FLOOR, 0.35);
	const high = skyExposure(0, around, REACH, FLOOR, 0.6);
	console.log(
		`${String(above).padEnd(13)}${off.toFixed(3).padStart(8)}` +
			`${mid.toFixed(3).padStart(8)}${high.toFixed(3).padStart(8)}` +
			`${(mid / off).toFixed(2).padStart(6)}x` +
			`${(mid * SKY_SHARE * 100).toFixed(1).padStart(8)}%`,
	);
}
console.log(
	`\nthe last column is what the face is worth against open ground at noon,` +
		`\nwhich takes the sun's ${((1 - SKY_SHARE) * 100).toFixed(0)}% as well.` +
		` A shut-in face never gets any of that.`,
);
