import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { isHidden } from "./arrange.ts";
import { type Config, DEFAULT_CONFIG, modelKey, ORDERS, type Order, parseConfig } from "./config.ts";
import { getDate, refreshDates, state, updateConfig } from "./state.ts";

type Ctx = ExtensionCommandContext;
type ModelRef = { provider: string; id: string };

const AGE_CHOICES = [3, 6, 12, 18, 24] as const;
const DONE = "← Done";

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

function sortedModels(models: ModelRef[]): ModelRef[] {
	return [...models].sort((a, b) => {
		const da = getDate(a.provider, a.id) ?? "";
		const db = getDate(b.provider, b.id) ?? "";
		return db.localeCompare(da) || modelKey(a.provider, a.id).localeCompare(modelKey(b.provider, b.id));
	});
}

async function pickOrder(ctx: Ctx) {
	const labels: Record<Order, string> = {
		newest: "Newest first",
		oldest: "Oldest first",
		off: "pi's built-in order",
	};
	const picked = await ctx.ui.select(
		"Order",
		ORDERS.map((o) => `${o === state().config.order ? "● " : "○ "}${labels[o]}`),
	);
	const order = ORDERS.find((o) => picked?.endsWith(labels[o]));
	if (order) updateConfig((c) => ({ ...c, order }));
}

async function pickHiddenModels(ctx: Ctx) {
	const models = sortedModels(ctx.modelRegistry.getAvailable());
	if (models.length === 0) {
		ctx.ui.notify("No models available. Use /login to add a provider.", "warning");
		return;
	}
	for (;;) {
		const hidden = new Set(state().config.hiddenModels);
		const rows = models.map((m) => {
			const key = modelKey(m.provider, m.id);
			const date = getDate(m.provider, m.id) ?? "no date";
			return { key, label: `${hidden.has(key) ? "[hidden]" : "[shown] "} ${key}  (${date})` };
		});
		const picked = await ctx.ui.select("Hide models — select to toggle", [DONE, ...rows.map((r) => r.label)]);
		const row = rows.find((r) => r.label === picked);
		if (!row) return;
		updateConfig((c) => ({ ...c, hiddenModels: toggle(c.hiddenModels, row.key, !hidden.has(row.key)) }));
	}
}

async function pickHiddenProviders(ctx: Ctx) {
	const providers = [...new Set(ctx.modelRegistry.getAvailable().map((m) => m.provider))].sort();
	for (;;) {
		const hidden = new Set(state().config.hiddenProviders);
		const rows = providers.map((p) => ({ p, label: `${hidden.has(p) ? "[hidden]" : "[shown] "} ${p}` }));
		const picked = await ctx.ui.select("Hide providers — select to toggle", [DONE, ...rows.map((r) => r.label)]);
		const row = rows.find((r) => r.label === picked);
		if (!row) return;
		updateConfig((c) => ({ ...c, hiddenProviders: toggle(c.hiddenProviders, row.p, !hidden.has(row.p)) }));
	}
}

async function pickAge(ctx: Ctx) {
	const current = state().config.hideOlderThanMonths;
	const options = ["off", ...AGE_CHOICES.map(String)];
	const picked = await ctx.ui.select(
		"Hide models released more than N months ago",
		options.map((o) => `${(o === "off" ? null : Number(o)) === current ? "● " : "○ "}${o === "off" ? "Off" : `${o} months`}`),
	);
	if (!picked) return;
	const months = picked.endsWith("Off") ? null : Number.parseInt(picked.slice(2), 10);
	updateConfig((c) => ({ ...c, hideOlderThanMonths: months }));
}

async function doRefresh(ctx: Ctx) {
	try {
		const index = await refreshDates(true);
		ctx.ui.notify(`Release dates updated (${Object.keys(index.byKey).length} models).`, "info");
	} catch (error) {
		ctx.ui.notify(`Could not download release dates: ${(error as Error).message}`, "error");
	}
}

async function mainMenu(ctx: Ctx) {
	for (;;) {
		const c = state().config;
		const hiddenNow = ctx.modelRegistry
			.getAvailable()
			.filter((m) => isHidden(m, c, getDate)).length;
		const items = {
			order: `Order: ${c.order}`,
			models: `Hide models… (${c.hiddenModels.length} selected)`,
			providers: `Hide providers… (${c.hiddenProviders.length} selected)`,
			age: `Hide older than: ${c.hideOlderThanMonths ? `${c.hideOlderThanMonths} months` : "off"}`,
			refresh: "Refresh release dates",
			reset: "Reset to defaults",
		};
		const picked = await ctx.ui.select(`Model list · ${hiddenNow} hidden`, [...Object.values(items), DONE]);
		const action = (Object.keys(items) as Array<keyof typeof items>).find((k) => items[k] === picked);
		if (!action) return;
		if (action === "order") await pickOrder(ctx);
		else if (action === "models") await pickHiddenModels(ctx);
		else if (action === "providers") await pickHiddenProviders(ctx);
		else if (action === "age") await pickAge(ctx);
		else if (action === "refresh") await doRefresh(ctx);
		else if (action === "reset" && (await ctx.ui.confirm("Reset", "Restore default settings?"))) {
			updateConfig(() => parseConfig(DEFAULT_CONFIG));
		}
	}
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
			if (ctx.hasUI) return mainMenu(ctx);
			ctx.ui.notify(describe(state().config), "info");
		},
	});
}
