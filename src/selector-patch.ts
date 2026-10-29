import { ModelSelectorComponent, type Theme } from "@earendil-works/pi-coding-agent";
import { type KeyId, matchesKey, Text } from "@earendil-works/pi-tui";
import { arrangeModels, isHidden } from "./arrange.ts";
import { modelKey, nextOrder } from "./config.ts";
import { getDate, state, updateConfig } from "./state.ts";

/*
 * pi runs its built-in /model command before extension commands, so it cannot be replaced.
 * Instead we wrap a few methods of pi's own ModelSelectorComponent (used by /model and the
 * model-select shortcut). They are internal: if a pi release changes them, the patch is
 * skipped and pi's normal selector is used.
 */

const PATCHED_KEY = Symbol.for("pi-model-release-sort.patched.v2");
const INSTANCE_KEY = Symbol.for("pi-model-release-sort.instance");
const MAX_VISIBLE = 10; // rows pi's selector shows at once

type Ref = { provider: string; id: string };
type Item = Ref & { model: Ref };

interface InstanceState {
	showHidden: boolean;
	hiddenCount: number;
	scopedSource?: Array<{ model: Ref }>;
}

interface Selector {
	[INSTANCE_KEY]?: InstanceState;
	currentModel?: Ref;
	scopedModels?: Array<{ model: Ref }>;
	filteredModels: Item[];
	selectedIndex: number;
	listContainer: { children: unknown[]; addChild(c: unknown): void };
	searchInput: { getValue(): string };
	tui?: { requestRender(): void };
	isDefaultModel?: (model: Ref) => boolean;
	loadModelsFromSnapshot(): void;
	filterModels(query: string): void;
	updateList(): void;
}

type Method = (this: Selector, ...args: any[]) => any;
type Color = Parameters<Theme["fg"]>[0];

// Set on every session start (also after /reload). Kept on globalThis because the patched
// methods outlive the module instance that installed them.
const THEME_KEY = Symbol.for("pi-model-release-sort.theme");
const themeHolder = globalThis as { [THEME_KEY]?: () => Theme | undefined };

function paint(color: Color, text: string): string {
	try {
		return themeHolder[THEME_KEY]?.()?.fg(color, text) ?? text;
	} catch {
		return text;
	}
}

const REQUIRED = ["sortModels", "loadModelsFromSnapshot", "updateList", "handleInput", "filterModels"] as const;

function inst(self: Selector): InstanceState {
	self[INSTANCE_KEY] ??= { showHidden: false, hiddenCount: 0 };
	return self[INSTANCE_KEY];
}

function pinRank(self: Selector, model: Ref): number | undefined {
	if (self.currentModel?.provider === model.provider && self.currentModel.id === model.id) return 0;
	if (self.isDefaultModel?.(model)) return 1;
	return undefined;
}

function keyMatches(data: string, key: string): boolean {
	try {
		return matchesKey(data, key as KeyId);
	} catch {
		return false;
	}
}

/** Rebuilds the list after a setting changed, keeping the highlighted model when possible. */
function rebuild(self: Selector) {
	const oldIndex = self.selectedIndex;
	const prev = self.filteredModels[oldIndex];
	self.loadModelsFromSnapshot();
	self.filterModels(self.searchInput.getValue());
	const idx = prev ? self.filteredModels.findIndex((m) => m.provider === prev.provider && m.id === prev.id) : -1;
	self.selectedIndex = idx >= 0 ? idx : Math.min(oldIndex, Math.max(0, self.filteredModels.length - 1));
	self.updateList();
	self.tui?.requestRender();
}

function hintLine(self: Selector): string {
	const { config } = state();
	const { keys } = config;
	const own = inst(self);
	const parts = [
		`${keys.hide} hide/unhide`,
		`${keys.order} order: ${config.order}`,
		own.showHidden ? `${keys.showHidden} hide hidden` : `${keys.showHidden} show hidden (${own.hiddenCount})`,
	];
	return paint("dim", `  ${parts.join(" · ")}`);
}

export function patchModelSelector(themeSource: () => Theme | undefined): boolean {
	themeHolder[THEME_KEY] = themeSource;
	const proto = ModelSelectorComponent.prototype as unknown as Record<string | symbol, unknown>;
	if (proto[PATCHED_KEY]) return true;
	if (REQUIRED.some((name) => typeof proto[name] !== "function")) return false;
	const original = Object.fromEntries(REQUIRED.map((name) => [name, proto[name] as Method])) as Record<
		(typeof REQUIRED)[number],
		Method
	>;
	proto[PATCHED_KEY] = true;

	// "All" tab: hide and sort.
	proto.sortModels = function (this: Selector, models: Item[]) {
		const { config } = state();
		const own = inst(this);
		const pin = (item: Item) => pinRank(this, item.model);
		own.hiddenCount = models.filter((m) => pin(m) === undefined && isHidden(m, config, getDate)).length;
		const arranged = arrangeModels(models, { config, getDate, pinRank: pin, showHidden: own.showHidden });
		return config.order === "off" ? original.sortModels.call(this, arranged) : arranged;
	};

	// "Scoped" tab: pi builds it from this.scopedModels, so arrange a copy of the original list.
	proto.loadModelsFromSnapshot = function (this: Selector, ...args: unknown[]) {
		const own = inst(this);
		if (Array.isArray(this.scopedModels)) {
			own.scopedSource ??= this.scopedModels;
			const items = own.scopedSource.map((scoped) => ({ ...scoped.model, scoped }));
			this.scopedModels = arrangeModels(items, {
				config: state().config,
				getDate,
				pinRank: (item) => pinRank(this, item),
				showHidden: own.showHidden,
			}).map((item) => item.scoped);
		}
		return original.loadModelsFromSnapshot.apply(this, args);
	};

	// Release date and "hidden" badge on each row, plus a key hint under the list.
	proto.updateList = function (this: Selector, ...args: unknown[]) {
		const result = original.updateList.apply(this, args);
		try {
			const { config } = state();
			const total = this.filteredModels.length;
			const start = Math.max(0, Math.min(this.selectedIndex - Math.floor(MAX_VISIBLE / 2), total - MAX_VISIBLE));
			const end = Math.min(start + MAX_VISIBLE, total);
			for (let i = start; i < end; i++) {
				const item = this.filteredModels[i];
				const row = this.listContainer.children[i - start] as { text?: unknown; setText?(t: string): void };
				if (!item || typeof row?.text !== "string" || !row.setText || !row.text.includes(item.id)) continue;
				const date = getDate(item.provider, item.id);
				let badge = date ? paint("dim", ` · ${date}`) : "";
				if (isHidden(item, config, getDate)) badge += paint("warning", " · hidden");
				row.setText(row.text + badge);
			}
			this.listContainer.addChild(new Text(hintLine(this), 0, 0));
		} catch {
			// Cosmetic only; never break pi's selector.
		}
		return result;
	};

	// Keys inside the selector.
	proto.handleInput = function (this: Selector, data: string) {
		const { keys } = state().config;
		if (keyMatches(data, keys.hide)) {
			const item = this.filteredModels[this.selectedIndex];
			if (item) {
				const key = modelKey(item.provider, item.id);
				updateConfig((c) => ({
					...c,
					hiddenModels: c.hiddenModels.includes(key)
						? c.hiddenModels.filter((k) => k !== key)
						: [...c.hiddenModels, key],
				}));
				rebuild(this);
			}
			return;
		}
		if (keyMatches(data, keys.order)) {
			updateConfig((c) => ({ ...c, order: nextOrder(c.order) }));
			rebuild(this);
			return;
		}
		if (keyMatches(data, keys.showHidden)) {
			inst(this).showHidden = !inst(this).showHidden;
			rebuild(this);
			return;
		}
		return original.handleInput.call(this, data);
	};
	return true;
}
