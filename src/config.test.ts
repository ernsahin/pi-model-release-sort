import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CONFIG, parseConfig } from "./config.ts";

describe("parseConfig", () => {
	it("returns defaults for missing or invalid input", () => {
		for (const raw of [undefined, null, "x", 3, []]) assert.deepEqual(parseConfig(raw), DEFAULT_CONFIG);
	});

	it("keeps valid fields and drops bad ones", () => {
		assert.deepEqual(
			parseConfig({
				order: "oldest",
				hiddenModels: ["a/b", "a/b", 5, ""],
				hiddenProviders: "nope",
				hideOlderThanMonths: 6.7,
			}),
			{ order: "oldest", hiddenModels: ["a/b"], hiddenProviders: [], hideOlderThanMonths: 6 },
		);
	});

	it("rejects unknown order and non-positive months", () => {
		const parsed = parseConfig({ order: "random", hideOlderThanMonths: -1 });
		assert.equal(parsed.order, "newest");
		assert.equal(parsed.hideOlderThanMonths, null);
	});
});
