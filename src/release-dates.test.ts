import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIndex, idVariants, isFresh, lookupDate } from "./release-dates.ts";

const catalog = {
	openai: { models: { "gpt-5.5": { release_date: "2026-04-23" } } },
	openrouter: {
		models: {
			"openai/gpt-5.5": { release_date: "2026-05-01" },
			"anthropic/claude-x:free": { release_date: "2026-01-02" },
		},
	},
	broken: { models: { nodate: {}, bad: { release_date: 42 } } },
};

describe("release dates", () => {
	const index = buildIndex(catalog, 1000);

	it("prefers the exact provider/id match", () => {
		assert.equal(lookupDate(index, "openrouter", "openai/gpt-5.5"), "2026-05-01");
	});

	it("falls back to the earliest date for the same id", () => {
		assert.equal(lookupDate(index, "openai-codex", "gpt-5.5"), "2026-04-23");
	});

	it("matches ids with prefixes and tags", () => {
		assert.equal(lookupDate(index, "other", "claude-x"), "2026-01-02");
		assert.equal(lookupDate(index, "other", "vendor/claude-x:beta"), "2026-01-02");
	});

	it("is case-insensitive and ignores entries without a date", () => {
		assert.equal(lookupDate(index, "OpenAI", "GPT-5.5"), "2026-04-23");
		assert.equal(lookupDate(index, "broken", "nodate"), undefined);
		assert.equal(lookupDate(index, "broken", "bad"), undefined);
		assert.equal(lookupDate(undefined, "openai", "gpt-5.5"), undefined);
	});

	it("builds id variants", () => {
		assert.deepEqual(idVariants("A/B-latest:free"), ["a/b-latest:free", "b-latest:free", "b-latest", "b"]);
	});

	it("knows when the cache is stale", () => {
		assert.equal(isFresh(index, 1000 + 60_000), true);
		assert.equal(isFresh(index, 1000 + 25 * 60 * 60 * 1000), false);
		assert.equal(isFresh(undefined), false);
	});
});
