import fs from "node:fs";
import path from "node:path";
import { type ExtensionAPI, type ExtensionCommandContext, getAgentDir } from "@earendil-works/pi-coding-agent";
import { type Config, DEFAULT_CONFIG, modelKey, ORDERS, type Order, parseConfig } from "./config.ts";
import { SettingsPanel } from "./settings-panel.ts";
import { refreshDates, state, updateConfig } from "./state.ts";

type Ctx = ExtensionCommandContext;
type ModelRef = { provider: string; id: string };

const AGE_CHOICES = [3, 6, 12, 18, 24] as const;

const SUBCOMMANDS: Record<string, string> = {
	newest: "Newest release first",
	oldest: "Oldest release first",
	off: "pi's built-in order",
	hide: "hide <provider/model> — hide one model",
	unhide: "unhide <provider/model> — show a hidden model again",
	"hide-provider": "hide-provider <provider> — hide all models of a provider",
	"unhide-provider": "unhide-provider <provider>",
	"older-than": "older-than <months|off> — hide models older than N months",
	status: "Show current settings",
	refresh: "Download release dates again",
	reset: "Restore default settings",
};

function toggle(list: string[], value: string, on: boolean): string[] {
	const rest = list.filter((v) => v !== value);
	return on ? [...rest, value] : rest;
}

function describe(config: Config): string {
	const parts = [`order: ${config.order}`];
	parts.push(`hidden models: ${config.hiddenModels.length}`);
	parts.push(`hidden providers: ${config.hiddenProviders.length ? config.hiddenProviders.join(", ") : "none"}`);
	parts.push(`older than: ${config.hideOlderThanMonths ? `${config.hideOlderThanMonths} months` : "off"}`);
	const dates = state().dates;
	parts.push(dates ? `dates from ${new Date(dates.fetchedAt).toLocaleDateString()}` : "no release dates yet");
	return parts.join(" · ");
}

async function doRefresh(ctx: Ctx) {
	try {
		const index = await refreshDates(true);
		ctx.ui.notify(`Release dates updated (${Object.keys(index.byKey).length} models).`, "info");
	} catch (error) {
		ctx.ui.notify(`Could not download release dates: ${(error as Error).message}`, "error");
	}
}

function readDefaultModel(): ModelRef | undefined {
	try {
		const s = JSON.parse(fs.readFileSync(path.join(getAgentDir(), "settings.json"), "utf8"));
		return typeof s.defaultProvider === "string" && typeof s.defaultModel === "string"
			? { provider: s.defaultProvider, id: s.defaultModel }
			: undefined;
	} catch {
		return undefined;
	}
}

async function openPanel(ctx: Ctx) {
	const models = ctx.modelRegistry.getAvailable();
	const current = ctx.model;
	const def = readDefaultModel();
	const same = (a: ModelRef | undefined, b: ModelRef) => a?.provider === b.provider && a.id === b.id;
	const pinned = (m: ModelRef) => (same(current, m) ? "current" : same(def, m) ? "default" : undefined);
	await ctx.ui.custom<void>((tui, theme, _keybindings, done) => new SettingsPanel(tui, theme, models, pinned, () => done()));
	ctx.ui.notify(describe(state().config), "info");
}

async function runArgs(args: string, ctx: Ctx) {
	const [sub = "", ...rest] = args.trim().split(/\s+/);
	const value = rest.join(" ");
	const action = sub.toLowerCase();
	const known = new Set(ctx.modelRegistry.getAvailable().map((m) => modelKey(m.provider, m.id)));

	if (ORDERS.includes(action as Order)) {
		updateConfig((c) => ({ ...c, order: action as Order }));
	} else if (action === "hide" || action === "unhide") {
		if (!value) return ctx.ui.notify(`Usage: /model-sort ${action} <provider/model>`, "warning");
		if (action === "hide" && !known.has(value)) ctx.ui.notify(`Note: "${value}" is not an available model.`, "warning");
		updateConfig((c) => ({ ...c, hiddenModels: toggle(c.hiddenModels, value, action === "hide") }));
	} else if (action === "hide-provider" || action === "unhide-provider") {
		if (!value) return ctx.ui.notify(`Usage: /model-sort ${action} <provider>`, "warning");
		updateConfig((c) => ({ ...c, hiddenProviders: toggle(c.hiddenProviders, value, action === "hide-provider") }));
	} else if (action === "older-than") {
		const months = Number.parseInt(value, 10);
		if (value !== "off" && !(months > 0)) return ctx.ui.notify("Usage: /model-sort older-than <months|off>", "warning");
		updateConfig((c) => ({ ...c, hideOlderThanMonths: value === "off" ? null : months }));
	} else if (action === "refresh") {
		return doRefresh(ctx);
	} else if (action === "reset") {
		updateConfig(() => parseConfig(DEFAULT_CONFIG));
	} else if (action !== "status") {
		return ctx.ui.notify(`Unknown option "${sub}". Options: ${Object.keys(SUBCOMMANDS).join(", ")}`, "warning");
	}
	ctx.ui.notify(describe(state().config), "info");
}

export function registerCommand(pi: ExtensionAPI, listModels: () => ModelRef[]) {
	pi.registerCommand("model-sort", {
		description: "Sort and hide models in the /model list",
		getArgumentCompletions: (prefix) => {
			const [sub = "", ...rest] = prefix.split(" ");
			if (rest.length === 0) {
				return Object.entries(SUBCOMMANDS)
					.filter(([name]) => name.startsWith(sub))
					.map(([name, description]) => ({ value: name, label: name, description }));
			}
			const query = rest.join(" ");
			const config = state().config;
			let values: string[] = [];
			if (sub === "hide") values = listModels().map((m) => modelKey(m.provider, m.id));
			else if (sub === "unhide") values = config.hiddenModels;
			else if (sub === "hide-provider") values = [...new Set(listModels().map((m) => m.provider))];
			else if (sub === "unhide-provider") values = config.hiddenProviders;
			else if (sub === "older-than") values = ["off", ...AGE_CHOICES.map(String)];
			return values
				.filter((v) => v.startsWith(query))
				.slice(0, 50)
				.map((v) => ({ value: `${sub} ${v}`, label: v }));
		},
		handler: async (args, ctx) => {
			if (args.trim()) return runArgs(args, ctx);
			if (ctx.mode === "tui") return openPanel(ctx);
			ctx.ui.notify(describe(state().config), "info");
		},
	});
}
