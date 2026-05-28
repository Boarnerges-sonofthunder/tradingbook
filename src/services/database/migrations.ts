// ============================================================
// Registre des migrations - cote frontend (TypeScript)
// ============================================================
// Les migrations sont executees cote Rust par tauri-plugin-sql.
// Ce fichier sert uniquement au diagnostic dans l'interface.
// ============================================================

import { getDb } from "./client";

export interface MigrationEntry {
  version: number;
  description: string;
  filename: string;
}

interface AppliedMigrationRow {
  version: number;
  description: string;
  applied_at: string | null;
}

export const MIGRATIONS_REGISTRY: MigrationEntry[] = [
  {
    version: 1,
    description: "Creation des tables initiales (app_metadata, settings)",
    filename: "001_init.sql",
  },
  {
    version: 2,
    description: "Schema complet (trades, strategies, tags, emotions, mistakes, imports, backups)",
    filename: "002_schema.sql",
  },
  {
    version: 3,
    description: "Historique des modifications des trades (trade_activity_logs)",
    filename: "003_activity_logs.sql",
  },
  {
    version: 4,
    description: "Amelioration table imports : statuts et metadonnees",
    filename: "004_imports_enhancements.sql",
  },
  {
    version: 5,
    description: "Support plateforme MetaTrader 4",
    filename: "005_mt4_support.sql",
  },
  {
    version: 6,
    description: "Logs MT5 detailles : statut, compte, compteurs et erreurs",
    filename: "006_mt5_sync_logs_enhancements.sql",
  },
  {
    version: 7,
    description: "Filtres sauvegardes du journal des trades",
    filename: "007_saved_filters.sql",
  },
  {
    version: 8,
    description: "Metadonnees fichiers des screenshots",
    filename: "008_screenshot_file_metadata.sql",
  },
  {
    version: 9,
    description: "Suppression des filtres sauvegardes",
    filename: "009_drop_saved_filters.sql",
  },
  {
    version: 10,
    description: "Optimisations SQLite : index ciblés pour trades et imports",
    filename: "010_sqlite_performance_indexes.sql",
  },
  {
    version: 11,
    description: "Optimisation filtre+tri du journal des trades",
    filename: "011_trades_filter_sort_index.sql",
  },
  {
    version: 12,
    description: "Stockage local OHLC pour replay graphique",
    filename: "012_market_ohlc.sql",
  },
  {
    version: 13,
    description: "Unicite NULL-safe des chandelles OHLC",
    filename: "013_market_ohlc_unique_fix.sql",
  },
  {
    version: 14,
    description: "Support multi-comptes de trading",
    filename: "014_trading_accounts.sql",
  },
  {
    version: 15,
    description: "Support multi-brokers normalises",
    filename: "015_brokers.sql",
  },
  {
    version: 16,
    description: "Liaison broker_id sur trades/imports/logs MT5",
    filename: "016_broker_ids.sql",
  },
  {
    version: 17,
    description: "Module backtesting avance (market_data, strategies, runs, trades, equity)",
    filename: "017_backtesting.sql",
  },
];

export async function getAppliedMigrations(): Promise<AppliedMigrationRow[]> {
  try {
    const db = await getDb();
    return await db.select<AppliedMigrationRow[]>(
      `SELECT
         version,
         description,
         installed_on AS applied_at
       FROM _sqlx_migrations
       ORDER BY version ASC`,
    );
  } catch {
    return [];
  }
}

export async function getCurrentMigrationVersion(): Promise<number> {
  const applied = await getAppliedMigrations();
  if (applied.length === 0) return 0;
  return Math.max(...applied.map((migration) => Number(migration.version)));
}
