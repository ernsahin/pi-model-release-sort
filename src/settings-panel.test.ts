import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, it } from "node:test";

// Keep the test away from the real ~/.pi/agent settings.
process.env.PI_CODING_AGENT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pi-mrs-"));

const { SettingsPanel } = await import("./settings-panel.ts");
const { state, updateConfig } = await import("./state.ts");
const { parseConfig } = await import("./config.ts");

const K = { altUp: "\x1b[1;3A", altDown: "\x1b[1;3B", down: "\x1b[B", enter: "\r", tab: "\t", esc: "\x1b", ctrlX: "\x18", ctrlA: "\x01", ctrlO: "\x0f", ctrlC: "\x03" };
const models = Array.from({ length: 30 }, (_, i) => ({ provider: i % 2 ? "b" : "a", id: `m${String(i).padStart(2, "0")}` }));
const theme = { fg: (_c: string, t: string) => t, bold: (t: string) => t } as never;

function setup() {
	let closed = false;
	const panel = new SettingsPanel(
		{ requestRender() {}, terminal: { rows: 24 } },
		theme,
		models,
		(m) => (m.id === "m29" ? "current" : undefined),
		() => {
			closed = true;
		},
	);
	const press = (...keys: string[]) => {
		for (const k of keys) panel.handleInput(k);
	};
	const selected = () => panel.render(120).find((l) => l.startsWith("→")) ?? "";
	return { panel, press, selected, isClosed: () => closed };
}

describe("SettingsPanel", () => {
	beforeEach(() => {
		updateConfig(() => parseConfig({}));
	});

	it("keeps the cursor on the row after toggling", () => {
		const { press, selected } = setup();
		// No release dates here, so rows sort by provider, then id: a/m00, a/m02, a/m04, …
		press(K.down, K.down, K.enter);
		assert.match(selected(), /hidden\s+a\/m04/);
		assert.deepEqual(state().config.hiddenModels, ["a/m04"]);
		press(K.enter);
		assert.deepEqual(state().config.hiddenModels, []);
	});

	it("only renders rows that fit the terminal", () => {
		const { panel } = setup();
		const lines = panel.render(120);
		assert.ok(lines.length <= 24, `rendered ${lines.length} lines`);
		assert.ok(lines.some((l) => l.includes("(1/30)")));
	});

	it("hides everything below the cursor, except the current model", () => {
		const { press } = setup();
		press(K.down, K.ctrlO);
		const hidden = state().config.hiddenModels;
		assert.equal(hidden.length, 27);
		assert.ok(!hidden.includes("b/m29"));
		assert.ok(!hidden.includes("a/m00") && !hidden.includes("a/m02"));
	});

	it("bulk hides and shows only the search matches", () => {
		const { press } = setup();
		for (const c of "m1") press(c);
		press(K.ctrlX);
		const hidden = state().config.hiddenModels;
		assert.ok(hidden.length > 0 && hidden.length < models.length);
		assert.ok(hidden.every((k) => k.includes("1")));
		press(K.ctrlA);
		assert.equal(state().config.hiddenModels.length, 0);
	});

	it("pins with alt+up and the cursor follows the model", () => {
		const { press, selected } = setup();
		press(K.down, K.down, K.down, K.altUp); // a/m06
		assert.deepEqual(state().config.favorites, ["a/m06"]);
		assert.match(selected(), /a\/m06 ★/);
		press(K.down, K.altUp, K.altUp); // a/m00 is now row 2: pin it, then move above a/m06
		assert.deepEqual(state().config.favorites, ["a/m00", "a/m06"]);
		assert.match(selected(), /a\/m00 ★/);
		press(K.altDown, K.altDown); // back below a/m06, then unpinned
		assert.deepEqual(state().config.favorites, ["a/m06"]);
	});

	it("hides providers from the Providers tab", () => {
		const { press } = setup();
		press(K.tab, K.enter);
		assert.deepEqual(state().config.hiddenProviders, ["a"]);
	});

	it("asks twice before resetting", () => {
		updateConfig((c) => ({ ...c, hiddenModels: ["a/m00"] }));
		const { press } = setup();
		press(K.tab, K.tab, K.down, K.down, K.down, K.down, K.enter);
		assert.deepEqual(state().config.hiddenModels, ["a/m00"]);
		press(K.enter);
		assert.deepEqual(state().config.hiddenModels, []);
	});

	it("ctrl+c clears the search first, then closes", () => {
		const { press, isClosed, panel } = setup();
		press("x", K.ctrlC);
		assert.equal(isClosed(), false);
		assert.ok(panel.render(120).some((l) => l.includes("a/m00")));
		press(K.ctrlC);
		assert.equal(isClosed(), true);
	});
});
