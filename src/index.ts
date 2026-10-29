import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCommand } from "./command.ts";
import { patchModelSelector } from "./selector-patch.ts";
import { refreshDates } from "./state.ts";

/**
 * pi-model-release-sort: orders pi's model selector by release date and lets you hide models.
 * Release dates come from https://models.dev and are cached for a day.
 */
export default function (pi: ExtensionAPI) {
	let listModels: () => Array<{ provider: string; id: string }> = () => [];

	pi.on("session_start", (_event, ctx) => {
		if (!patchModelSelector()) {
			ctx.ui.notify("pi-model-release-sort: this pi version is not supported; using pi's default order.", "warning");
		}
		listModels = () => ctx.modelRegistry.getAvailable();
		// Background refresh. On failure the cached dates (or pi's own order) are used.
		refreshDates().catch(() => {});
	});

	registerCommand(pi, () => listModels());
}
