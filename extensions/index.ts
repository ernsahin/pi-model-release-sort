import fs from "node:fs";
import path from "node:path";
import { type ExtensionAPI, getAgentDir, ModelSelectorComponent } from "@earendil-works/pi-coding-agent";

/**
 * Sorts pi's model selector (/model, Ctrl+L) by release date instead of provider name.
 * Release dates come from https://models.dev/api.json and are cached on disk for a day.
 */

type Order = "newest" | "oldest" | "off";
type DateCache = { fetchedAt: number; byKey: Record<string, string>; byId: Record<string, string> };
type State = { order: Order; cache: DateCache | undefined; refreshing: Promise<void> | undefined };

const CATALOG_URL = "https://models.dev/api.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const STATE_KEY = Symbol.for("pi-model-release-sort.state");
const PATCHED_KEY = Symbol.for("pi-model-release-sort.patched");

const cacheFile = () => path.join(getAgentDir(), "cache", "model-release-dates.json");
const settingsFile = () => path.join(getAgentDir(), "model-release-sort.json");

function readJson<T>(file: string): T | undefined {
	try {
		return JSON.parse(fs.readFileSync(file, "utf8")) as T;
	} catch {
		return undefined;
	}
}

function writeJson(file: string, value: unknown) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(value));
}

// State lives on globalThis so the prototype patch survives extension reloads.
function state(): State {
	const g = globalThis as Record<symbol, State | undefined>;
	if (!g[STATE_KEY]) {
		const saved = readJson<{ order?: Order }>(settingsFile());
		g[STATE_KEY] = {
			order: saved?.order ?? "newest",
			cache: readJson<DateCache>(cacheFile()),
			refreshing: undefined,
		};
	}
	return g[STATE_KEY]!;
}

function idVariants(id: string): string[] {
	const lower = id.toLowerCase();
	const last = lower.split("/").pop()!;
	const noTag = last.split(":")[0]!;
	const noLatest = noTag.replace(/-latest$/, "");
	return [...new Set([lower, last, noTag, noLatest])];
}

function releaseDate(provider: string, id: string): string | undefined {
	const cache = state().cache;
	if (!cache) return undefined;
	const exact = cache.byKey[`${provider}/${id}`.toLowerCase()];
	if (exact) return exact;
	for (const variant of idVariants(id)) {
		const date = cache.byId[variant];
		if (date) return date;
	}
	return undefined;
}

async function refreshDates(force = false): Promise<void> {
	const st = state();
	if (!force && st.cache && Date.now() - st.cache.fetchedAt < CACHE_TTL_MS) return;
	if (st.refreshing) return st.refreshing;
	st.refreshing = (async () => {
		const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(20_000) });
		if (!res.ok) throw new Error(`models.dev returned HTTP ${res.status}`);
		const catalog = (await res.json()) as Record<string, { models?: Record<string, { release_date?: string }> }>;
		const byKey: Record<string, string> = {};
		const byId: Record<string, string> = {};
		for (const [provider, entry] of Object.entries(catalog)) {
			for (const [id, model] of Object.entries(entry.models ?? {})) {
				const date = model.release_date;
				if (!date) continue;
				byKey[`${provider}/${id}`.toLowerCase()] = date;
				// The same model id under several providers: keep the earliest (original) release.
				for (const variant of idVariants(id)) {
					if (!byId[variant] || date < byId[variant]) byId[variant] = date;
				}
			}
		}
		st.cache = { fetchedAt: Date.now(), byKey, byId };
		writeJson(cacheFile(), st.cache);
	})().finally(() => {
		st.refreshing = undefined;
	});
	return st.refreshing;
}

function compareByDate(a: { provider: string; id: string }, b: { provider: string; id: string }): number {
	const order = state().order;
	const da = releaseDate(a.provider, a.id);
	const db = releaseDate(b.provider, b.id);
	if (da && db && da !== db) return order === "oldest" ? da.localeCompare(db) : db.localeCompare(da);
	if (da && !db) return -1; // models without a known date go last
	if (!da && db) return 1;
	return a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id);
}

function patchModelSelector() {
	const proto = ModelSelectorComponent.prototype as any;
	if (proto[PATCHED_KEY]) return;
	proto[PATCHED_KEY] = true;

	const originalSort = proto.sortModels;
	proto.sortModels = function (models: Array<{ provider: string; id: string; model: any }>) {
		if (state().order === "off" || !state().cache || typeof this.isDefaultModel !== "function") {
			return originalSort.call(this, models);
		}
		const isCurrent = (m: any) => this.currentModel?.provider === m.provider && this.currentModel?.id === m.id;
		return [...models].sort((a, b) => {
			const ca = isCurrent(a.model);
			const cb = isCurrent(b.model);
			if (ca !== cb) return ca ? -1 : 1;
			const fa = this.isDefaultModel(a.model);
			const fb = this.isDefaultModel(b.model);
			if (fa !== fb) return fa ? -1 : 1;
			return compareByDate(a, b);
		});
	};

	// The "scoped" tab uses its own list; sort it the same way.
	const originalLoad = proto.loadModelsFromSnapshot;
	if (typeof originalLoad === "function") {
		proto.loadModelsFromSnapshot = function (...args: unknown[]) {
			if (state().order !== "off" && state().cache && Array.isArray(this.scopedModels)) {
				this.scopedModels = [...this.scopedModels].sort((a: any, b: any) =>
					compareByDate({ provider: a.model.provider, id: a.model.id }, { provider: b.model.provider, id: b.model.id }),
				);
			}
			return originalLoad.apply(this, args);
		};
	}
}

const ORDERS: Order[] = ["newest", "oldest", "off"];

export default function (pi: ExtensionAPI) {
	patchModelSelector();

	pi.on("session_start", async () => {
		refreshDates().catch(() => {
			// Offline or models.dev unavailable: keep the cached dates (or pi's default order).
		});
	});

	pi.registerCommand("model-sort", {
		description: "Model list order: newest | oldest | off | refresh",
		getArgumentCompletions: (prefix) =>
			[...ORDERS, "refresh"].filter((o) => o.startsWith(prefix)).map((o) => ({ value: o, label: o })),
		handler: async (args, ctx) => {
			let choice = args.trim().toLowerCase();
			if (!choice && ctx.hasUI) {
				const labels = {
					newest: "newest — newest release first",
					oldest: "oldest — oldest release first",
					off: "off — pi's default order",
					refresh: "refresh — re-download release dates",
				};
				const picked = await ctx.ui.select(`Model sort (now: ${state().order})`, Object.values(labels));
				choice = (Object.keys(labels) as Array<keyof typeof labels>).find((k) => labels[k] === picked) ?? "";
			}
			if (!choice) return;

			if (choice === "refresh") {
				try {
					await refreshDates(true);
					const count = Object.keys(state().cache?.byKey ?? {}).length;
					ctx.ui.notify(`Release dates refreshed (${count} models).`, "info");
				} catch (error) {
					ctx.ui.notify(`Could not refresh release dates: ${(error as Error).message}`, "error");
				}
				return;
			}
			if (!ORDERS.includes(choice as Order)) {
				ctx.ui.notify(`Unknown option "${choice}". Use newest, oldest, off or refresh.`, "warning");
				return;
			}
			state().order = choice as Order;
			writeJson(settingsFile(), { order: choice });
			ctx.ui.notify(`Model list order: ${choice}`, "info");
		},
	});
}
