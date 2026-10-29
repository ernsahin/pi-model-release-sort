import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { arrangeModels, cutoffDate, isHidden } from "./arrange.ts";
import { type Config, parseConfig } from "./config.ts";

const dates: Record<string, string> = {
	"a/old": "2023-01-10",
	"a/mid": "2025-03-01",
	"b/new": "2026-09-04",
	"b/newer-same-day": "2026-09-04",
};
const getDate = (provider: string, id: string) => dates[`${provider}/${id}`];
const models = [
	{ provider: "a", id: "old" },
	{ provider: "x", id: "unknown" },
	{ provider: "a", id: "mid" },
	{ provider: "b", id: "new" },
	{ provider: "b", id: "newer-same-day" },
];
const ids = (list: Array<{ id: string }>) => list.map((m) => m.id);
const cfg = (patch: Partial<Config> = {}) => ({ ...parseConfig({}), ...patch });
const now = new Date("2026-10-29T00:00:00Z");

describe("arrangeModels", () => {
	it("sorts newest first, ties by id, unknown dates last", () => {
		assert.deepEqual(ids(arrangeModels(models, { config: cfg(), getDate })), [
			"new",
			"newer-same-day",
			"mid",
			"old",
			"unknown",
		]);
	});

	it("sorts oldest first, unknown dates still last", () => {
		assert.deepEqual(ids(arrangeModels(models, { config: cfg({ order: "oldest" }), getDate })), [
			"old",
			"mid",
			"new",
			"newer-same-day",
			"unknown",
		]);
	});

	it("keeps pinned models on top and never hides them", () => {
		const config = cfg({ hiddenModels: ["a/old"] });
		const pinRank = (m: { id: string }) => (m.id === "old" ? 0 : m.id === "mid" ? 1 : undefined);
		assert.deepEqual(ids(arrangeModels(models, { config, getDate, pinRank })).slice(0, 3), ["old", "mid", "new"]);
	});

	it("only hides with order off, keeping the input order", () => {
		const config = cfg({ order: "off", hiddenProviders: ["b"] });
		assert.deepEqual(ids(arrangeModels(models, { config, getDate })), ["old", "unknown", "mid"]);
	});

	it("keeps hidden models when showHidden is set", () => {
		const config = cfg({ hiddenProviders: ["b"] });
		assert.deepEqual(ids(arrangeModels(models, { config, getDate, showHidden: true })), [
			"new",
			"newer-same-day",
			"mid",
			"old",
			"unknown",
		]);
	});

	it("does not mutate its input", () => {
		const input = [...models];
		arrangeModels(input, { config: cfg(), getDate });
		assert.deepEqual(input, models);
	});
});

describe("isHidden", () => {
	it("hides by model, provider and age", () => {
		const config = cfg({ hiddenModels: ["a/mid"], hiddenProviders: ["x"], hideOlderThanMonths: 12 });
		const hidden = models.filter((m) => isHidden(m, config, getDate, now)).map((m) => m.id);
		assert.deepEqual(hidden, ["old", "unknown", "mid"]);
	});

	it("never hides models without a date by age", () => {
		assert.equal(isHidden({ provider: "y", id: "z" }, cfg({ hideOlderThanMonths: 1 }), getDate, now), false);
	});
});

describe("cutoffDate", () => {
	it("goes back the given number of months", () => {
		assert.equal(cutoffDate(12, now), "2025-10-29");
		assert.equal(cutoffDate(3, now), "2026-07-29");
	});
});
