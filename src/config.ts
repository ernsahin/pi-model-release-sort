import fs from "node:fs";
import path from "node:path";

export type Order = "newest" | "oldest" | "off" | "custom";

export const ORDERS: readonly Order[] = ["newest", "oldest", "off", "custom"];

export interface Config {
	/** How the model selector is ordered. "off" keeps pi's built-in order, "custom" uses customOrder. */
	order: Order;
	/** Models hidden from the selector, as "provider/id". */
	hiddenModels: string[];
	/** Providers whose models are all hidden from the selector. */
	hiddenProviders: string[];
	/** Hide models released more than this many months ago. null = never. */
	hideOlderThanMonths: number | null;
	/** Your hand-made order ("provider/id", top to bottom), used when order is "custom". */
	customOrder: string[];
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
	/** Move the highlighted model one row up (switches to the custom order). */
	moveUp: string;
	/** Move the highlighted model one row down (switches to the custom order). */
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
	customOrder: [],
	keys: DEFAULT_KEYS,
});

/**
 * Moves `key` exactly one row past its neighbour in `visible` (the rows on screen, which may be
 * filtered by a search). `base` is the full list order to change. Returns undefined at the edge.
 */
export function moveInOrder(
	base: readonly string[],
	visible: readonly string[],
	key: string,
	dir: "up" | "down",
): string[] | undefined {
	const at = visible.indexOf(key);
	const neighbour = visible[dir === "up" ? at - 1 : at + 1];
	if (at < 0 || neighbour === undefined) return undefined;
	const list = base.filter((k) => k !== key);
	const n = list.indexOf(neighbour);
	if (n < 0) return undefined;
	list.splice(dir === "up" ? n : n + 1, 0, key);
	return list;
}

/** "alt+up" → "alt+↑", for hints. */
export function keyLabel(key: string): string {
	return key.replace(/\bup\b/, "↑").replace(/\bdown\b/, "↓");
}

/** Next order for the order key; "custom" is skipped until you have arranged models by hand. */
export function nextOrder(order: Order, hasCustom = false): Order {
	const cycle = hasCustom ? ORDERS : ORDERS.filter((o) => o !== "custom");
	return cycle[(cycle.indexOf(order) + 1) % cycle.length] ?? "newest";
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
	const customOrder = stringList(obj.customOrder);
	const order = ORDERS.includes(obj.order as Order) ? (obj.order as Order) : DEFAULT_CONFIG.order;
	return {
		keys,
		order: order === "custom" && customOrder.length === 0 ? DEFAULT_CONFIG.order : order,
		hiddenModels: stringList(obj.hiddenModels),
		hiddenProviders: stringList(obj.hiddenProviders),
		customOrder,
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
