import type { Theme } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter, getKeybindings, Input, Key, type KeyId, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { arrangeModels, hiddenReason as reasonFor } from "./arrange.ts";
import {
	type Config,
	DEFAULT_CONFIG,
	keyLabel,
	modelKey,
	moveFavorite,
	nextOrder,
	type Order,
	parseConfig,
} from "./config.ts";
import { getDate, refreshDates, state, updateConfig } from "./state.ts";

/*
 * Full-screen settings panel for /model-sort. Three tabs:
 *   Models    – searchable checklist, bulk hide/show
 *   Providers – hide whole providers
 *   Options   – order, age filter, refresh dates, reset
 * Every change is saved at once, so closing never loses work.
 */

export interface PanelModel {
	provider: string;
	id: string;
	name?: string;
}

export interface PanelTui {
	requestRender(): void;
	terminal?: { rows: number };
}

type Tab = "models" | "providers" | "options";
const TABS: Tab[] = ["models", "providers", "options"];
const TAB_LABEL: Record<Tab, string> = { models: "Models", providers: "Providers", options: "Options" };
const AGE_STEPS: Array<number | null> = [null, 3, 6, 12, 18, 24];
const OPTION_ROWS = ["order", "age", "favorites", "refresh", "reset"] as const;
type OptionRow = (typeof OPTION_ROWS)[number];
const ORDER_LABEL: Record<Order, string> = { newest: "newest first", oldest: "oldest first", off: "pi's order" };

function hiddenReason(m: PanelModel, config: Config) {
	return reasonFor(m, config, getDate);
}

function setHidden(list: string[], keys: string[], hidden: boolean): string[] {
	const set = new Set(list);
	for (const k of keys) hidden ? set.add(k) : set.delete(k);
	return [...set];
}

export class SettingsPanel {
	private tab: Tab = "models";
	private readonly search = new Input();
	private readonly cursor: Record<Tab, number> = { models: 0, providers: 0, options: 0 };
	private flash = "";
	/** Option row waiting for a second Enter (clear pinned / reset). */
	private armed: OptionRow | undefined;
	private armedBefore: OptionRow | undefined;
	private busy = false;
	private _focused = false;

	private readonly tui: PanelTui;
	private readonly theme: Theme;
	private readonly models: PanelModel[];
	private readonly pinned: (m: PanelModel) => string | undefined;
	private readonly done: () => void;

	constructor(
		tui: PanelTui,
		theme: Theme,
		models: PanelModel[],
		pinned: (m: PanelModel) => string | undefined,
		done: () => void,
	) {
		this.tui = tui;
		this.theme = theme;
		this.models = models;
		this.pinned = pinned;
		this.done = done;
	}

	get focused() {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		this.search.focused = value;
	}

	invalidate() {
		this.search.invalidate();
	}

	// ---------- data ----------

	private get config() {
		return state().config;
	}

	private modelRows(): PanelModel[] {
		const config = this.config;
		const order = config.order === "off" ? "newest" : config.order;
		const sorted = arrangeModels(this.models, { config: { ...config, order }, getDate, showHidden: true });
		const query = this.search.getValue().trim();
		if (!query) return sorted;
		return fuzzyFilter(sorted, query, (m) => `${m.provider} ${m.id} ${m.name ?? ""}`);
	}

	private providerRows(): Array<{ provider: string; total: number; hidden: number }> {
		const config = this.config;
		const counts = new Map<string, { total: number; hidden: number }>();
		for (const m of this.models) {
			const c = counts.get(m.provider) ?? { total: 0, hidden: 0 };
			c.total++;
			if (hiddenReason(m, config)) c.hidden++;
			counts.set(m.provider, c);
		}
		const rows = [...counts.entries()].map(([provider, c]) => ({ provider, ...c }));
		rows.sort((a, b) => a.provider.localeCompare(b.provider));
		const query = this.search.getValue().trim();
		return query ? fuzzyFilter(rows, query, (r) => r.provider) : rows;
	}

	private rowCount(): number {
		if (this.tab === "models") return this.modelRows().length;
		if (this.tab === "providers") return this.providerRows().length;
		return OPTION_ROWS.length;
	}

	private listHeight(): number {
		const rows = this.tui.terminal?.rows ?? 30;
		return Math.max(5, rows - 15);
	}

	// ---------- actions ----------

	private say(message: string) {
		this.flash = message;
	}

	private hideModels(keys: string[], hidden: boolean) {
		updateConfig((c) => ({ ...c, hiddenModels: setHidden(c.hiddenModels, keys, hidden) }));
	}

	private toggleModel(m: PanelModel) {
		const config = this.config;
		const key = modelKey(m.provider, m.id);
		const reason = hiddenReason(m, config);
		if (reason === "provider") {
			return this.say(`Hidden because provider "${m.provider}" is hidden. Change it in the Providers tab.`);
		}
		if (reason === "age") {
			return this.say(`Hidden by the age filter (${config.hideOlderThanMonths} months). Change it in Options.`);
		}
		this.hideModels([key], reason !== "model");
		const pin = this.pinned(m);
		if (reason !== "model" && pin) this.say(`${key} is your ${pin} model, so /model still shows it.`);
	}

	private bulk(rows: PanelModel[], hidden: boolean, what: string) {
		const keys = rows.map((m) => modelKey(m.provider, m.id));
		if (keys.length === 0) return this.say("Nothing to change.");
		this.hideModels(keys, hidden);
		this.say(`${hidden ? "Hid" : "Showed"} ${keys.length} model${keys.length === 1 ? "" : "s"} ${what}.`);
	}

	private toggleProvider(provider: string) {
		const hidden = !this.config.hiddenProviders.includes(provider);
		updateConfig((c) => ({ ...c, hiddenProviders: setHidden(c.hiddenProviders, [provider], hidden) }));
		this.say(`${hidden ? "Hid" : "Showed"} all ${provider} models.`);
	}

	private changeOption(row: OptionRow, step: 1 | -1) {
		if (row === "order") {
			let order = this.config.order;
			for (let i = 0; i < (step === 1 ? 1 : 2); i++) order = nextOrder(order);
			updateConfig((c) => ({ ...c, order }));
		} else if (row === "age") {
			const i = AGE_STEPS.indexOf(this.config.hideOlderThanMonths);
			const next = AGE_STEPS[(i + step + AGE_STEPS.length) % AGE_STEPS.length] ?? null;
			updateConfig((c) => ({ ...c, hideOlderThanMonths: next }));
		}
	}

	private activateOption(row: OptionRow) {
		if (row === "order" || row === "age") return this.changeOption(row, 1);
		if (row === "refresh") {
			if (this.busy) return;
			this.busy = true;
			this.say("Downloading release dates…");
			refreshDates(true)
				.then((index) => this.say(`Release dates updated (${Object.keys(index.byKey).length} models).`))
				.catch((error: Error) => this.say(`Could not download release dates: ${error.message}`))
				.finally(() => {
					this.busy = false;
					this.tui.requestRender();
				});
			return;
		}
		if (row === "favorites" && this.config.favorites.length === 0) {
			return this.say(`Nothing pinned yet. Press ${keyLabel(this.config.keys.moveUp)} on a model to pin it.`);
		}
		if (this.armedBefore !== row) {
			this.armed = row;
			return this.say(row === "reset" ? "Press Enter again to reset all settings." : "Press Enter again to unpin all models.");
		}
		if (row === "favorites") {
			updateConfig((c) => ({ ...c, favorites: [] }));
			return this.say("All models unpinned.");
		}
		updateConfig(() => parseConfig(DEFAULT_CONFIG));
		this.say("All settings reset.");
	}

	handleInput(data: string): void {
		const kb = getKeybindings();
		// Reset needs two Enter presses in a row; any other key disarms it.
		this.armedBefore = this.armed;
		this.armed = undefined;
		this.flash = "";
		const count = this.rowCount();
		const move = (to: number) => {
			this.cursor[this.tab] = count === 0 ? 0 : Math.max(0, Math.min(count - 1, to));
		};
		const at = this.cursor[this.tab];

		if (matchesKey(data, Key.escape)) return this.done();
		if (matchesKey(data, Key.ctrl("c"))) {
			if (this.search.getValue()) this.search.setValue("");
			else return this.done();
		} else if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift("tab"))) {
			const dir = matchesKey(data, Key.tab) ? 1 : -1;
			this.tab = TABS[(TABS.indexOf(this.tab) + dir + TABS.length) % TABS.length] ?? "models";
			this.search.setValue("");
		} else if (kb.matches(data, "tui.select.up")) move(at === 0 ? count - 1 : at - 1);
		else if (kb.matches(data, "tui.select.down")) move(at >= count - 1 ? 0 : at + 1);
		else if (kb.matches(data, "tui.select.pageUp")) move(at - this.listHeight());
		else if (kb.matches(data, "tui.select.pageDown")) move(at + this.listHeight());
		else if (this.tab === "options") this.handleOptionKey(data, at);
		else if (this.tab === "providers") this.handleProviderKey(data, at);
		else this.handleModelKey(data, at);

		move(this.cursor[this.tab]); // clamp after the list changed
		this.tui.requestRender();
	}

	private handleModelKey(data: string, at: number) {
		const kb = getKeybindings();
		const rows = this.modelRows();
		const row = rows[at];
		const query = this.search.getValue().trim();
		const listed = query ? `matching "${query}"` : "in the list";
		// Bulk hide skips the current/default model: /model would list them anyway.
		const hideable = (list: PanelModel[]) =>
			list.filter((m) => hiddenReason(m, this.config) === undefined && !this.pinned(m));
		const explicit = (list: PanelModel[]) => list.filter((m) => hiddenReason(m, this.config) === "model");

		if (kb.matches(data, "tui.select.confirm")) {
			if (row) this.toggleModel(row);
		} else if (matchesKey(data, Key.ctrl("x"))) this.bulk(hideable(rows), true, listed);
		else if (matchesKey(data, Key.ctrl("a"))) this.bulk(explicit(rows), false, listed);
		else if (matchesKey(data, Key.ctrl("o"))) {
			if (row) this.bulk(hideable(rows.slice(at + 1)), true, "below the cursor");
		} else if (matchesKey(data, Key.ctrl("p"))) {
			if (row) this.toggleProvider(row.provider);
		} else if (matchesKey(data, this.config.keys.moveUp as KeyId) || matchesKey(data, this.config.keys.moveDown as KeyId)) {
			if (row) this.move(row, matchesKey(data, this.config.keys.moveUp as KeyId) ? "up" : "down");
		} else {
			this.search.handleInput(data);
			this.cursor.models = 0;
		}
	}

	private move(m: PanelModel, dir: "up" | "down") {
		const key = modelKey(m.provider, m.id);
		const before = this.config.favorites;
		if (dir === "down" && !before.includes(key)) {
			return this.say(`Only pinned models can be moved. Press ${keyLabel(this.config.keys.moveUp)} to pin this one.`);
		}
		const after = moveFavorite(before, key, dir);
		updateConfig((c) => ({ ...c, favorites: after }));
		if (!before.includes(key)) this.say(`Pinned ${key}. Keep pressing ${keyLabel(this.config.keys.moveUp)} to move it higher.`);
		else if (!after.includes(key)) this.say(`Unpinned ${key}; it is back in date order.`);
		// Follow the model to its new row.
		const i = this.modelRows().findIndex((r) => r.provider === m.provider && r.id === m.id);
		if (i >= 0) this.cursor.models = i;
	}

	private handleProviderKey(data: string, at: number) {
		const kb = getKeybindings();
		const row = this.providerRows()[at];
		if (kb.matches(data, "tui.select.confirm")) {
			if (row) this.toggleProvider(row.provider);
		} else {
			this.search.handleInput(data);
			this.cursor.providers = 0;
		}
	}

	private handleOptionKey(data: string, at: number) {
		const kb = getKeybindings();
		const row = OPTION_ROWS[at];
		if (!row) return;
		if (kb.matches(data, "tui.select.confirm") || matchesKey(data, Key.space)) this.activateOption(row);
		else if (matchesKey(data, Key.right)) this.changeOption(row, 1);
		else if (matchesKey(data, Key.left)) this.changeOption(row, -1);
	}

	// ---------- rendering ----------

	render(width: number): string[] {
		const t = this.theme;
		const fit = (line: string) => truncateToWidth(line, width);
		const config = this.config;
		const hiddenTotal = this.models.filter((m) => hiddenReason(m, config)).length;
		const lines: string[] = [];

		lines.push(t.fg("border", "─".repeat(Math.max(1, width))));
		const tabs = TABS.map((tab) =>
			tab === this.tab ? t.fg("accent", t.bold(`[${TAB_LABEL[tab]}]`)) : t.fg("muted", ` ${TAB_LABEL[tab]} `),
		).join(" ");
		lines.push(fit(` ${t.bold("Model list")}  ${tabs}   ${t.fg("muted", `${hiddenTotal} of ${this.models.length} hidden`)}`));
		lines.push("");

		if (this.tab !== "options") {
			for (const l of this.search.render(width)) lines.push(l);
			lines.push("");
		}

		const body = this.tab === "models" ? this.renderModels() : this.tab === "providers" ? this.renderProviders() : this.renderOptions();
		for (const l of body) lines.push(fit(l));

		lines.push("");
		lines.push(fit(this.flash ? `  ${t.fg("warning", this.flash)}` : ""));
		for (const hint of this.footer()) lines.push(fit(`  ${t.fg("dim", hint)}`));
		lines.push(t.fg("border", "─".repeat(Math.max(1, width))));
		return lines;
	}

	private window<T>(rows: T[], render: (row: T, selected: boolean) => string): string[] {
		const height = this.listHeight();
		const at = this.cursor[this.tab];
		const start = Math.max(0, Math.min(at - Math.floor(height / 2), rows.length - height));
		const end = Math.min(rows.length, start + height);
		const out: string[] = [];
		for (let i = start; i < end; i++) out.push(render(rows[i] as T, i === at));
		if (rows.length > height) {
			out.push(this.theme.fg("muted", `  (${at + 1}/${rows.length})${end < rows.length ? " ↓ more" : ""}`));
		}
		return out;
	}

	private status(reason: ReturnType<typeof hiddenReason>): string {
		const t = this.theme;
		if (!reason) return t.fg("success", "shown ");
		return t.fg(reason === "model" ? "warning" : "muted", "hidden");
	}

	private renderModels(): string[] {
		const t = this.theme;
		const rows = this.modelRows();
		if (rows.length === 0) return [t.fg("muted", this.models.length ? "  No matching models" : "  No models. Use /login to add a provider.")];
		const config = this.config;
		return this.window(rows, (m, selected) => {
			const reason = hiddenReason(m, config);
			const key = modelKey(m.provider, m.id);
			const date = getDate(m.provider, m.id);
			const notes: string[] = [];
			if (reason === "provider") notes.push("by provider");
			if (reason === "age") notes.push(`older than ${config.hideOlderThanMonths} months`);
			const pin = this.pinned(m);
			if (pin) notes.push(`${pin}, always shown`);
			const star = config.favorites.includes(key) ? t.fg("accent", " ★") : "";
			const cursor = selected ? t.fg("accent", "→ ") : "  ";
			const name = selected ? t.fg("accent", key) : reason ? t.fg("muted", key) : key;
			return `${cursor}${this.status(reason)}  ${name}${star}  ${t.fg("dim", date ?? "no date")}${notes.length ? t.fg("muted", ` · ${notes.join(" · ")}`) : ""}`;
		});
	}

	private renderProviders(): string[] {
		const t = this.theme;
		const rows = this.providerRows();
		if (rows.length === 0) return [t.fg("muted", "  No matching providers")];
		const hidden = new Set(this.config.hiddenProviders);
		return this.window(rows, (r, selected) => {
			const cursor = selected ? t.fg("accent", "→ ") : "  ";
			const status = hidden.has(r.provider) ? t.fg("warning", "hidden") : t.fg("success", "shown ");
			const name = selected ? t.fg("accent", r.provider) : r.provider;
			return `${cursor}${status}  ${name}  ${t.fg("dim", `${r.total} models · ${r.hidden} hidden`)}`;
		});
	}

	private renderOptions(): string[] {
		const t = this.theme;
		const config = this.config;
		const dates = state().dates;
		const values: Record<OptionRow, [string, string]> = {
			order: ["Order", `‹ ${ORDER_LABEL[config.order]} ›`],
			age: ["Hide models older than", `‹ ${config.hideOlderThanMonths ? `${config.hideOlderThanMonths} months` : "off"} ›`],
			refresh: [
				"Refresh release dates",
				dates ? `last update ${new Date(dates.fetchedAt).toLocaleString()}` : "never downloaded",
			],
			favorites: [
				"Pinned models",
				this.armed === "favorites"
					? "press Enter again to unpin all"
					: `${config.favorites.length} pinned${config.favorites.length ? " · Enter to unpin all" : ""}`,
			],
			reset: ["Reset all settings", this.armed === "reset" ? "press Enter again" : ""],
		};
		const at = this.cursor.options;
		const lines = OPTION_ROWS.map((row, i) => {
			const [label, value] = values[row];
			const selected = i === at;
			const cursor = selected ? t.fg("accent", "→ ") : "  ";
			return `${cursor}${selected ? t.fg("accent", label) : label}${" ".repeat(Math.max(1, 26 - label.length))}${t.fg("muted", value)}`;
		});
		const { keys } = config;
		lines.push("");
		lines.push(
			t.fg(
				"dim",
				`  In /model: ${keys.hide} hide/unhide · ${keyLabel(keys.moveUp)}/${keyLabel(keys.moveDown)} move · ${keys.order} order · ${keys.showHidden} show hidden`,
			),
		);
		lines.push(t.fg("dim", "  Keys can be changed in ~/.pi/agent/model-release-sort.json"));
		return lines;
	}

	private footer(): string[] {
		if (this.tab === "models") {
			return [
				`type to search · enter hide/show · ${keyLabel(this.config.keys.moveUp)}/${keyLabel(this.config.keys.moveDown)} pin & move · ctrl+p hide/show provider`,
				"ctrl+x hide all listed · ctrl+a show all listed · ctrl+o hide all below · tab next tab · esc close",
			];
		}
		if (this.tab === "providers") return ["type to search · enter hide/show provider", "tab next tab · esc close"];
		return ["←/→ change · enter select", "tab next tab · esc close"];
	}
}
