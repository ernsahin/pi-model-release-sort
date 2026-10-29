import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CONFIG, DEFAULT_KEYS, keyLabel, moveInOrder, nextOrder, parseConfig } from "./config.ts";

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
				customOrder: [],
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
		assert.equal(nextOrder("off", true), "custom");
		assert.equal(nextOrder("custom", true), "newest");
	});

	it("rejects unknown order and non-positive months", () => {
		const parsed = parseConfig({ order: "random", hideOlderThanMonths: -1 });
		assert.equal(parsed.order, "newest");
		assert.equal(parsed.hideOlderThanMonths, null);
		assert.equal(parseConfig({ order: "custom", customOrder: [] }).order, "newest");
		assert.equal(parseConfig({ order: "custom", customOrder: ["a/b"] }).order, "custom");
	});
});

describe("moveInOrder", () => {
	const base = ["a", "b", "c", "d"];
	it("moves exactly one row", () => {
		assert.deepEqual(moveInOrder(base, base, "c", "up"), ["a", "c", "b", "d"]);
		assert.deepEqual(moveInOrder(base, base, "b", "down"), ["a", "c", "b", "d"]);
	});
	it("stops at the edges", () => {
		assert.equal(moveInOrder(base, base, "a", "up"), undefined);
		assert.equal(moveInOrder(base, base, "d", "down"), undefined);
	});
	it("steps past the visible neighbour when the list is filtered", () => {
		assert.deepEqual(moveInOrder(base, ["a", "d"], "d", "up"), ["d", "a", "b", "c"]);
		assert.deepEqual(moveInOrder(base, ["a", "d"], "a", "down"), ["b", "c", "d", "a"]);
	});
	it("labels arrow keys", () => {
		assert.equal(keyLabel("alt+up"), "alt+↑");
		assert.equal(keyLabel("alt+down"), "alt+↓");
	});
});
