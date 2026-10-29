import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { type Config, loadConfig, saveConfig } from "./config.ts";
import { type DateIndex, fetchIndex, isFresh, lookupDate, readIndex, writeIndex } from "./release-dates.ts";

interface State {
	config: Config;
	dates: DateIndex | undefined;
	refreshing: Promise<DateIndex> | undefined;
}

// Kept on globalThis so it survives /reload, which re-runs the extension in a new module scope.
const STATE_KEY = Symbol.for("pi-model-release-sort.state.v1");

export const configFile = () => path.join(getAgentDir(), "model-release-sort.json");
export const cacheFile = () => path.join(getAgentDir(), "cache", "model-release-dates.json");

export function state(): State {
	const g = globalThis as Record<symbol, State | undefined>;
	g[STATE_KEY] ??= { config: loadConfig(configFile()), dates: readIndex(cacheFile()), refreshing: undefined };
	return g[STATE_KEY];
}

export function getDate(provider: string, id: string): string | undefined {
	return lookupDate(state().dates, provider, id);
}

export function updateConfig(change: (config: Config) => Config): Config {
	const s = state();
	s.config = change(s.config);
	saveConfig(configFile(), s.config);
	return s.config;
}

/** Downloads release dates unless the cache is still fresh. Concurrent calls share one request. */
export function refreshDates(force = false): Promise<DateIndex> {
	const s = state();
	if (!force && s.dates && isFresh(s.dates)) return Promise.resolve(s.dates);
	s.refreshing ??= fetchIndex()
		.then((index) => {
			s.dates = index;
			writeIndex(cacheFile(), index);
			return index;
		})
		.finally(() => {
			s.refreshing = undefined;
		});
	return s.refreshing;
}
