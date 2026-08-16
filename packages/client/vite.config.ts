import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// GitHub Pages serves the site from a subdirectory, so every asset URL needs
// that prefix. A local dev server serves from the root.
const base = process.env.CHAMFER_BASE ?? "/";

const entry = (name: string) =>
	fileURLToPath(new URL(`./${name}.html`, import.meta.url));

export default defineConfig({
	base,
	build: {
		target: "es2022",
		outDir: "dist",
		emptyOutDir: true,
		rollupOptions: {
			input: {
				landing: entry("index"),
				planet: entry("planet"),
			},
		},
	},
});
