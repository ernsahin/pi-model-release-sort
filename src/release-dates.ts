import fs from "node:fs";
import path from "node:path";

export const CATALOG_URL = "https://models.dev/api.json";
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Release dates (ISO "YYYY-MM-DD") looked up by "provider/id" or by model id alone. */
export interface DateIndex {
	fetchedAt: number;
	byKey: Record<string, string>;
	byId: Record<string, string>;
}

type Catalog = Record<string, { models?: Record<string, { release_date?: unknown }> }>;

/** Spellings of one model id that should match: "openrouter/anthropic/x:free" → "x". */
export function idVariants(id: string): string[] {
	const lower = id.toLowerCase();
	const last = lower.split("/").pop() ?? lower;
	const noTag = last.split(":")[0] ?? last;
	const noLatest = noTag.replace(/-latest$/, "");
	return [...new Set([lower, last, noTag, noLatest])];
}

export function buildIndex(catalog: Catalog, fetchedAt = Date.now()): DateIndex {
	const byKey: Record<string, string> = {};
	const byId: Record<string, string> = {};
	for (const [provider, entry] of Object.entries(catalog ?? {})) {
		for (const [id, model] of Object.entries(entry?.models ?? {})) {
			const date = model?.release_date;
			if (typeof date !== "string" || !date) continue;
			byKey[`${provider}/${id}`.toLowerCase()] = date;
			// Same id under several providers (resellers, proxies): keep the original, earliest release.
			for (const variant of idVariants(id)) {
				const known = byId[variant];
				if (!known || date < known) byId[variant] = date;
			}
		}
	}
	return { fetchedAt, byKey, byId };
}

export function lookupDate(index: DateIndex | undefined, provider: string, id: string): string | undefined {
	if (!index) return undefined;
	const exact = index.byKey[`${provider}/${id}`.toLowerCase()];
	if (exact) return exact;
	for (const variant of idVariants(id)) {
		const date = index.byId[variant];
		if (date) return date;
	}
	return undefined;
}

export function isFresh(index: DateIndex | undefined, now = Date.now()): boolean {
	return !!index && now - index.fetchedAt < CACHE_TTL_MS;
}

export function readIndex(file: string): DateIndex | undefined {
	try {
		const data = JSON.parse(fs.readFileSync(file, "utf8")) as DateIndex;
		if (typeof data?.fetchedAt === "number" && data.byKey && data.byId) return data;
	} catch {
		// Missing or corrupt cache: fetch again.
	}
	return undefined;
}

export async function fetchIndex(signal?: AbortSignal): Promise<DateIndex> {
	const res = await fetch(CATALOG_URL, { signal: signal ?? AbortSignal.timeout(20_000) });
	if (!res.ok) throw new Error(`models.dev returned HTTP ${res.status}`);
	return buildIndex((await res.json()) as Catalog);
}

export function writeIndex(file: string, index: DateIndex): void {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(index));
}
