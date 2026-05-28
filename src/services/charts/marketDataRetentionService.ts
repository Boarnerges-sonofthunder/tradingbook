// ============================================================
// Service — Market Data Retention (local)
// ============================================================
// Applique politique de retention des chandelles OHLC locales.
// Objectif: garder base legere sans cloud.
// ============================================================

import { purgeMarketOhlcOlderThanIso } from "../../repositories";

const DEFAULT_RETENTION_DAYS = 120;

function toIsoDaysAgo(days: number): string {
  const now = new Date();
  const date = new Date(now.getTime() - Math.max(1, days) * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

/**
 * Supprime chandelles plus anciennes que politique retention.
 */
export async function runMarketDataRetention(
  retentionDays = DEFAULT_RETENTION_DAYS,
): Promise<{ deletedRows: number; thresholdIso: string }> {
  const thresholdIso = toIsoDaysAgo(retentionDays);
  const deletedRows = await purgeMarketOhlcOlderThanIso(thresholdIso);
  return { deletedRows, thresholdIso };
}
