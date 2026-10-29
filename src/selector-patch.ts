import { ModelSelectorComponent } from "@earendil-works/pi-coding-agent";
import { arrangeModels } from "./arrange.ts";
import { getDate, state } from "./state.ts";

/*
 * pi runs its built-in /model command before extension commands, so it cannot be replaced.
 * Instead we wrap two methods of pi's own ModelSelectorComponent (used by /model and the
 * model-select shortcut). These are internal methods: if a pi release renames them, the
 * wrappers are skipped and pi's normal order is used.
 */

const PATCHED_KEY = Symbol.for("pi-model-release-sort.patched.v1");

interface SelectorItem {
	provider: string;
	id: string;
	model: { provider: string; id: string };
}

interface SelectorInternals {
	currentModel?: { provider: string; id: string };
	scopedModels?: Array<{ model: { provider: string; id: string } }>;
	isDefaultModel?: (model: { provider: string; id: string }) => boolean;
}

type Proto = Record<string | symbol, unknown>;

function pinRank(self: SelectorInternals, model: { provider: string; id: string }): number | undefined {
	if (self.currentModel?.provider === model.provider && self.currentModel.id === model.id) return 0;
	if (self.isDefaultModel?.(model)) return 1;
	return undefined;
}

export function patchModelSelector(): boolean {
	const proto = ModelSelectorComponent.prototype as unknown as Proto;
	if (proto[PATCHED_KEY]) return true;
	const originalSort = proto.sortModels;
	const originalLoad = proto.loadModelsFromSnapshot;
	if (typeof originalSort !== "function" || typeof originalLoad !== "function") return false;
	proto[PATCHED_KEY] = true;

	// "All" tab.
	proto.sortModels = function (this: SelectorInternals, models: SelectorItem[]) {
		const { config } = state();
		const arranged = arrangeModels(models, {
			config,
			getDate,
			pinRank: (item) => pinRank(this, item.model),
		});
		return config.order === "off" ? originalSort.call(this, arranged) : arranged;
	};

	// "Scoped" tab: pi builds it from this.scopedModels inside loadModelsFromSnapshot.
	proto.loadModelsFromSnapshot = function (this: SelectorInternals, ...args: unknown[]) {
		if (Array.isArray(this.scopedModels)) {
			const items = this.scopedModels.map((scoped) => ({ ...scoped.model, scoped }));
			this.scopedModels = arrangeModels(items, {
				config: state().config,
				getDate,
				pinRank: (item) => pinRank(this, item),
			}).map((item) => item.scoped);
		}
		return originalLoad.apply(this, args);
	};
	return true;
}
