import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CONFIG, nextOrder, parseConfig } from "./config.ts";

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
			{
				order: "oldest",
				hiddenModels: ["a/b"],
				hiddenProviders: [],
				hideOlderThanMonths: 6,
				keys: { hide: "alt+h", order: "alt+o", showHidden: "alt+a" },
			},
		);
	});

	it("reads custom keys and keeps defaults for the rest", () => {
		assert.deepEqual(parseConfig({ keys: { hide: " Ctrl+Y ", order: 5 } }).keys, {
			hide: "ctrl+y",
			order: "alt+o",
			showHidden: "alt+a",
		});
	});

	it("cycles the order", () => {
		assert.equal(nextOrder("newest"), "oldest");
		assert.equal(nextOrder("oldest"), "off");
		assert.equal(nextOrder("off"), "newest");
	});

	it("rejects unknown order and non-positive months", () => {
		const parsed = parseConfig({ order: "random", hideOlderThanMonths: -1 });
		assert.equal(parsed.order, "newest");
		assert.equal(parsed.hideOlderThanMonths, null);
	});
});
