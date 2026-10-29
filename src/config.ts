import fs from "node:fs";
import path from "node:path";

export type Order = "newest" | "oldest" | "off";

export const ORDERS: readonly Order[] = ["newest", "oldest", "off"];

export interface Config {
	/** How the model selector is ordered. "off" keeps pi's built-in order. */
	order: Order;
	/** Models hidden from the selector, as "provider/id". */
	hiddenModels: string[];
	/** Providers whose models are all hidden from the selector. */
	hiddenProviders: string[];
	/** Hide models released more than this many months ago. null = never. */
	hideOlderThanMonths: number | null;
	/** Pinned models ("provider/id"), listed first in this exact order. */
	favorites: string[];
	/** Keys used inside the /model selector. */
	keys: Keys;
}

export interface Keys {
	/** Hide or unhide the highlighted model. */
	hide: string;
	/** Switch between newest / oldest / pi's order. */
	order: string;
	/** Show or hide the hidden models in the list. */
	showHidden: string;
	/** Pin the highlighted model, or move it up among the pinned ones. */
	moveUp: string;
	/** Move the highlighted pinned model down; on the last one, unpin it. */
	moveDown: string;
}

export const DEFAULT_KEYS: Readonly<Keys> = Object.freeze({
	hide: "alt+h",
	order: "alt+o",
	showHidden: "alt+a",
	moveUp: "alt+up",
	moveDown: "alt+down",
});

export const DEFAULT_CONFIG: Readonly<Config> = Object.freeze({
	order: "newest",
	hiddenModels: [],
	hiddenProviders: [],
	hideOlderThanMonths: null,
	favorites: [],
	keys: DEFAULT_KEYS,
});

/**
 * Moves a model one step in the pinned list.
 * Up: a model that is not pinned gets pinned at the end; a pinned one swaps with the one above.
 * Down: a pinned one swaps with the one below; the last pinned one is unpinned.
 */
export function moveFavorite(favorites: readonly string[], key: string, dir: "up" | "down"): string[] {
	const list = [...favorites];
	const i = list.indexOf(key);
	if (i < 0) return dir === "up" ? [...list, key] : list;
	const j = dir === "up" ? i - 1 : i + 1;
	if (j < 0) return list;
	if (j >= list.length) return list.filter((k) => k !== key);
	[list[i], list[j]] = [list[j] as string, list[i] as string];
	return list;
}

/** "alt+up" → "alt+↑", for hints. */
export function keyLabel(key: string): string {
	return key.replace(/\bup\b/, "↑").replace(/\bdown\b/, "↓");
}

export function nextOrder(order: Order): Order {
	return ORDERS[(ORDERS.indexOf(order) + 1) % ORDERS.length] ?? "newest";
}

export function modelKey(provider: string, id: string): string {
	return `${provider}/${id}`;
}

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.filter((v): v is string => typeof v === "string" && v.length > 0))];
}

/** Turns any JSON value into a valid Config, falling back to defaults for bad fields. */
export function parseConfig(raw: unknown): Config {
	const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	const months = obj.hideOlderThanMonths;
	const rawKeys = obj.keys && typeof obj.keys === "object" ? (obj.keys as Record<string, unknown>) : {};
	const keys = { ...DEFAULT_KEYS };
	for (const name of Object.keys(DEFAULT_KEYS) as Array<keyof Keys>) {
		const value = rawKeys[name];
		if (typeof value === "string" && value.trim()) keys[name] = value.trim().toLowerCase();
	}
	return {
		keys,
		order: ORDERS.includes(obj.order as Order) ? (obj.order as Order) : DEFAULT_CONFIG.order,
		hiddenModels: stringList(obj.hiddenModels),
		hiddenProviders: stringList(obj.hiddenProviders),
		favorites: stringList(obj.favorites),
		hideOlderThanMonths:
			typeof months === "number" && Number.isFinite(months) && months > 0 ? Math.floor(months) : null,
	};
}

export function loadConfig(file: string): Config {
	try {
		return parseConfig(JSON.parse(fs.readFileSync(file, "utf8")));
	} catch {
		return parseConfig(undefined);
	}
}

export function saveConfig(file: string, config: Config): void {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}
