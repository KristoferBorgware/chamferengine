import { supportsWebGPU } from "./supportsWebGPU.js";

const form = document.querySelector<HTMLFormElement>("#seed-form");
const input = document.querySelector<HTMLInputElement>("#seed");
const support = document.querySelector<HTMLParagraphElement>("#support");

form?.addEventListener("submit", (event) => {
	event.preventDefault();
	const seed = input?.value.trim();
	if (!seed) return;
	location.href = `./planet.html?seed=${encodeURIComponent(seed)}`;
});

// The button stays usable either way. A browser without WebGPU reaches the
// planet page and is told there, rather than being blocked from a page that
// might work after a browser update.
void supportsWebGPU().then((ok) => {
	if (ok || !support) return;
	support.textContent =
		"This browser does not expose WebGPU. Chrome, Edge and Safari support it; on Firefox it may need enabling.";
	support.hidden = false;
});
