import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["packages/*/tests/**/*.test.ts"],
		environment: "node",
		/**
		 * Long enough that a slow runner is not a failing build.
		 *
		 * **The default five seconds is a measurement of the machine, not of
		 * the code.** Several tests here grow a stand of plants or walk every
		 * cell of every face, which takes a few hundred milliseconds on a
		 * developer's machine and several times that on a shared runner --
		 * and a test that has to be cut down until it fits a timer is a test
		 * that covers less every time the runner has a bad day. The way to
		 * keep one fast is to make the work smaller or the assertions cheaper,
		 * both of which show up in the reported duration; the timeout is only
		 * here to stop a genuine hang running forever.
		 */
		testTimeout: 30000,
	},
});
