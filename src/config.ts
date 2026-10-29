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
}

export const DEFAULT_KEYS: Readonly<Keys> = Object.freeze({ hide: "alt+h", order: "alt+o", showHidden: "alt+a" });

export const DEFAULT_CONFIG: Readonly<Config> = Object.freeze({
	order: "newest",
	hiddenModels: [],
	hiddenProviders: [],
	hideOlderThanMonths: null,
	keys: DEFAULT_KEYS,
});

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
