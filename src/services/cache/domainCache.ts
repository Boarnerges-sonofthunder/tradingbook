import {
  getOrLoadCached,
  invalidateCacheByPrefix,
  invalidateCacheKey,
} from "./localCache";

const TTL = {
  dashboardMs: 10_000,
  analyticsMs: 10_000,
  settingsMs: 5 * 60_000,
  catalogMs: 60_000,
  relationMs: 20_000,
} as const;

const PREFIX = {
  dashboard: "dashboard:",
  analytics: "analytics:",
  settings: "settings:",
  strategies: "strategies:",
  tags: "tags:",
  emotions: "emotions:",
  mistakes: "mistakes:",
} as const;

function serialize(parts: unknown[]): string {
  return JSON.stringify(parts);
}

export function withDashboardCache<T>(
  name: string,
  args: unknown[],
  loader: () => Promise<T>,
): Promise<T> {
  return getOrLoadCached(
    `${PREFIX.dashboard}${name}:${serialize(args)}`,
    loader,
    { ttlMs: TTL.dashboardMs },
  );
}

export function withAnalyticsCache<T>(
  name: string,
  args: unknown[],
  loader: () => Promise<T>,
): Promise<T> {
  return getOrLoadCached(
    `${PREFIX.analytics}${name}:${serialize(args)}`,
    loader,
    { ttlMs: TTL.analyticsMs },
  );
}

export function withSettingsCache<T>(
  name: string,
  args: unknown[],
  loader: () => Promise<T>,
): Promise<T> {
  return getOrLoadCached(
    `${PREFIX.settings}${name}:${serialize(args)}`,
    loader,
    { ttlMs: TTL.settingsMs },
  );
}

export function withCatalogCache<T>(
  domain: "strategies" | "tags" | "emotions" | "mistakes",
  name: string,
  args: unknown[],
  loader: () => Promise<T>,
): Promise<T> {
  return getOrLoadCached(
    `${PREFIX[domain]}${name}:${serialize(args)}`,
    loader,
    { ttlMs: TTL.catalogMs },
  );
}

export function withRelationCache<T>(
  domain: "tags" | "emotions" | "mistakes",
  name: string,
  args: unknown[],
  loader: () => Promise<T>,
): Promise<T> {
  return getOrLoadCached(
    `${PREFIX[domain]}${name}:${serialize(args)}`,
    loader,
    { ttlMs: TTL.relationMs },
  );
}

export function invalidateSettingsCache(): void {
  invalidateCacheByPrefix(PREFIX.settings);
}

export function invalidateDashboardCache(): void {
  invalidateCacheByPrefix(PREFIX.dashboard);
}

export function invalidateAnalyticsCache(): void {
  invalidateCacheByPrefix(PREFIX.analytics);
}

export function invalidateStrategiesCache(): void {
  invalidateCacheByPrefix(PREFIX.strategies);
}

export function invalidateTagsCache(): void {
  invalidateCacheByPrefix(PREFIX.tags);
}

export function invalidateEmotionsCache(): void {
  invalidateCacheByPrefix(PREFIX.emotions);
}

export function invalidateMistakesCache(): void {
  invalidateCacheByPrefix(PREFIX.mistakes);
}

export function invalidateTradeRelatedCaches(): void {
  invalidateDashboardCache();
  invalidateAnalyticsCache();
  invalidateTagsCache();
  invalidateEmotionsCache();
  invalidateMistakesCache();
}

export function invalidateEmotionAnalyticsCaches(): void {
  invalidateEmotionsCache();
  invalidateAnalyticsCache();
}

export function invalidateStrategyAnalyticsCaches(): void {
  invalidateStrategiesCache();
  invalidateAnalyticsCache();
}

export function invalidateSettingsEntry(name: string, args: unknown[]): void {
  invalidateCacheKey(`${PREFIX.settings}${name}:${serialize(args)}`);
}
