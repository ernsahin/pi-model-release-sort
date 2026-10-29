import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CONFIG, DEFAULT_KEYS, keyLabel, moveFavorite, nextOrder, parseConfig } from "./config.ts";

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
				favorites: [],
				keys: DEFAULT_KEYS,
			},
		);
	});

	it("reads custom keys and keeps defaults for the rest", () => {
		assert.deepEqual(parseConfig({ keys: { hide: " Ctrl+Y ", order: 5 } }).keys, { ...DEFAULT_KEYS, hide: "ctrl+y" });
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

describe("moveFavorite", () => {
	it("pins an unpinned model at the end when moving up", () => {
		assert.deepEqual(moveFavorite(["a", "b"], "c", "up"), ["a", "b", "c"]);
	});
	it("ignores moving an unpinned model down", () => {
		assert.deepEqual(moveFavorite(["a"], "c", "down"), ["a"]);
	});
	it("swaps pinned models", () => {
		assert.deepEqual(moveFavorite(["a", "b", "c"], "c", "up"), ["a", "c", "b"]);
		assert.deepEqual(moveFavorite(["a", "b", "c"], "a", "down"), ["b", "a", "c"]);
	});
	it("keeps the first one in place and unpins the last one on down", () => {
		assert.deepEqual(moveFavorite(["a", "b"], "a", "up"), ["a", "b"]);
		assert.deepEqual(moveFavorite(["a", "b"], "b", "down"), ["a"]);
	});
	it("labels arrow keys", () => {
		assert.equal(keyLabel("alt+up"), "alt+↑");
		assert.equal(keyLabel("alt+down"), "alt+↓");
	});
});
