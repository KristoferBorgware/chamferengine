import { normalize, vec3 } from "@chamfer/core";
import { supportsWebGPU } from "./supportsWebGPU.js";

const status = document.querySelector<HTMLDivElement>("#status");

const seed = new URLSearchParams(location.search).get("seed") ?? "chamfer";

// Project 3 replaces this with the device bring-up and the first drawn lattice.
void supportsWebGPU().then((ok) => {
	if (!status) return;
	if (!ok) {
		status.textContent = "WebGPU is unavailable in this browser.";
		return;
	}
	const up = normalize(vec3(0, 1700, 0));
	status.textContent = `seed "${seed}" — up is (${up.x}, ${up.y}, ${up.z})`;
});
