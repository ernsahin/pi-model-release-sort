import { type Config, modelKey } from "./config.ts";

export interface ModelRef {
	provider: string;
	id: string;
}

export type DateLookup = (provider: string, id: string) => string | undefined;

/** ISO date (YYYY-MM-DD) `months` months before `now`. */
export function cutoffDate(months: number, now = new Date()): string {
	const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, now.getUTCDate()));
	return d.toISOString().slice(0, 10);
}

export type HiddenReason = "model" | "provider" | "age";

/** Why a model is hidden, or undefined when it is shown. */
export function hiddenReason(
	model: ModelRef,
	config: Config,
	getDate: DateLookup,
	now = new Date(),
): HiddenReason | undefined {
	if (config.hiddenModels.includes(modelKey(model.provider, model.id))) return "model";
	if (config.hiddenProviders.includes(model.provider)) return "provider";
	if (config.hideOlderThanMonths) {
		const date = getDate(model.provider, model.id);
		// Models without a known date are never hidden by age.
		if (date && date < cutoffDate(config.hideOlderThanMonths, now)) return "age";
	}
	return undefined;
}

export function isHidden(model: ModelRef, config: Config, getDate: DateLookup, now = new Date()): boolean {
	return hiddenReason(model, config, getDate, now) !== undefined;
}

/** Newest (or oldest) first; models without a known date go last; ties by provider, then id. */
export function compareByDate(a: ModelRef, b: ModelRef, order: "newest" | "oldest", getDate: DateLookup): number {
	const da = getDate(a.provider, a.id);
	const db = getDate(b.provider, b.id);
	if (da && db && da !== db) return order === "oldest" ? da.localeCompare(db) : db.localeCompare(da);
	if (da && !db) return -1;
	if (!da && db) return 1;
	return a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id);
}

export interface ArrangeOptions<T> {
	config: Config;
	getDate: DateLookup;
	/** Lower rank sorts first and is never hidden (pi uses 0 = current model, 1 = default model). */
	pinRank?: (item: T) => number | undefined;
	/** Keep hidden models in the result (they are still sorted). */
	showHidden?: boolean;
	now?: Date;
}

/** Puts pinned favorites first, in the user's order. Everything else keeps its relative order. */
export function favoritesFirst<T extends ModelRef>(items: readonly T[], favorites: readonly string[]): T[] {
	if (favorites.length === 0) return [...items];
	const rank = new Map(favorites.map((key, i) => [key, i]));
	const pinned = items.filter((m) => rank.has(modelKey(m.provider, m.id)));
	pinned.sort((a, b) => (rank.get(modelKey(a.provider, a.id)) ?? 0) - (rank.get(modelKey(b.provider, b.id)) ?? 0));
	return [...pinned, ...items.filter((m) => !rank.has(modelKey(m.provider, m.id)))];
}

/**
 * Removes hidden models and sorts the rest: favorites first (in the user's order), then pinned
 * current/default models, then by release date. With order "off", only hiding is applied and the
 * caller sorts (favorites are moved first afterwards).
 */
export function arrangeModels<T extends ModelRef>(items: readonly T[], opts: ArrangeOptions<T>): T[] {
	const { config, getDate, pinRank = () => undefined, now, showHidden = false } = opts;
	const visible = items.filter(
		(item) => showHidden || pinRank(item) !== undefined || !isHidden(item, config, getDate, now),
	);
	if (config.order === "off") return visible;
	const order = config.order;
	const sorted = visible.sort((a, b) => {
		const ra = pinRank(a) ?? Number.POSITIVE_INFINITY;
		const rb = pinRank(b) ?? Number.POSITIVE_INFINITY;
		if (ra !== rb) return ra - rb;
		return compareByDate(a, b, order, getDate);
	});
	return favoritesFirst(sorted, config.favorites);
}
