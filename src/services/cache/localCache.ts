interface CacheEntry<T> {
  expiresAt: number;
  value?: T;
  promise?: Promise<T>;
}

const entries = new Map<string, CacheEntry<unknown>>();

export interface CacheOptions {
  ttlMs: number;
}

/**
 * Petit cache mémoire local avec TTL.
 * SQLite reste la source de vérité : on ne garde que des lectures
 * récentes pour éviter de recalculer ou relire plusieurs fois.
 */
export async function getOrLoadCached<T>(
  key: string,
  loader: () => Promise<T>,
  options: CacheOptions,
): Promise<T> {
  const now = Date.now();
  const existing = entries.get(key) as CacheEntry<T> | undefined;

  if (existing?.value !== undefined && existing.expiresAt > now) {
    return existing.value;
  }

  if (existing?.promise) {
    return existing.promise;
  }

  const promise = loader()
    .then((value) => {
      entries.set(key, {
        value,
        expiresAt: Date.now() + options.ttlMs,
      });
      return value;
    })
    .catch((error) => {
      entries.delete(key);
      throw error;
    });

  entries.set(key, {
    expiresAt: now + options.ttlMs,
    promise,
  });

  return promise;
}

export function invalidateCacheByPrefix(prefix: string): void {
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) {
      entries.delete(key);
    }
  }
}

export function invalidateCacheKey(key: string): void {
  entries.delete(key);
}

export function invalidateCacheKeys(keys: string[]): void {
  for (const key of keys) {
    entries.delete(key);
  }
}

export function clearLocalCache(): void {
  entries.clear();
}
