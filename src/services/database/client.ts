import Database from "@tauri-apps/plugin-sql";
import { appDataDir, join } from "@tauri-apps/api/path";
import { DB_NAME } from "../../constants/app";
import { createLogger } from "../logging";

// Chemin de la base SQLite.
// Tauri stocke le fichier dans le repertoire de donnees de l'application :
//   Windows : %APPDATA%\com.tradingbook.app\tradingbook.db
//   macOS   : ~/Library/Application Support/com.tradingbook.app/tradingbook.db
//   Linux   : ~/.local/share/com.tradingbook.app/tradingbook.db
const DB_PATH = `sqlite:${DB_NAME}`;
const logger = createLogger("database");

// Instance singleton : une seule connexion ouverte pendant toute la session.
let _instance: Database | null = null;

interface TableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface SqliteMasterRow {
  name: string;
}

async function tableExists(db: Database, tableName: string): Promise<boolean> {
  const rows = await db.select<SqliteMasterRow[]>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = $1 LIMIT 1",
    [tableName],
  );
  return rows.length > 0;
}

async function tableHasColumn(
  db: Database,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  if (!(await tableExists(db, tableName))) return false;
  const rows = await db.select<TableInfoRow[]>(`PRAGMA table_info(${tableName})`);
  return rows.some((row) => row.name === columnName);
}

/**
 * Compat runtime: certaines bases legacy n'ont pas recu correctement la
 * migration 014. On ajoute colonnes/index manquants de facon idempotente.
 */
async function ensureTradingAccountsCompatibility(db: Database): Promise<void> {
  try {
    await db.execute(
      `CREATE TABLE IF NOT EXISTS trading_accounts (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT    NOT NULL,
        broker          TEXT    NOT NULL,
        platform        TEXT    NOT NULL CHECK (platform IN ('mt5', 'mt4', 'csv', 'manual')),
        account_number  TEXT    NOT NULL,
        account_type    TEXT    NOT NULL DEFAULT 'other',
        currency        TEXT,
        is_active       INTEGER NOT NULL DEFAULT 1,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
      )`,
    );

    await db.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_trading_accounts_unique ON trading_accounts (broker, platform, account_number)",
    );
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_trading_accounts_active ON trading_accounts (is_active, name)",
    );

    if (!(await tableHasColumn(db, "trades", "trading_account_id"))) {
      await db.execute("ALTER TABLE trades ADD COLUMN trading_account_id INTEGER");
    }
    if (!(await tableHasColumn(db, "imports", "trading_account_id"))) {
      await db.execute("ALTER TABLE imports ADD COLUMN trading_account_id INTEGER");
    }
    if (!(await tableHasColumn(db, "mt5_sync_logs", "trading_account_id"))) {
      await db.execute("ALTER TABLE mt5_sync_logs ADD COLUMN trading_account_id INTEGER");
    }

    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_trades_trading_account ON trades (trading_account_id)",
    );
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_imports_trading_account ON imports (trading_account_id)",
    );
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_mt5_sync_logs_trading_account ON mt5_sync_logs (trading_account_id)",
    );
  } catch (err) {
    logger.warn("Compat schema multi-comptes non appliquee", err);
  }
}

/**
 * Compat runtime: certaines bases legacy n'ont pas encore migration 015/016.
 * On ajoute structure multi-broker minimale de facon idempotente.
 */
async function ensureBrokersCompatibility(db: Database): Promise<void> {
  try {
    await db.execute(
      `CREATE TABLE IF NOT EXISTS brokers (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        name               TEXT    NOT NULL,
        broker_type        TEXT    NOT NULL DEFAULT 'retail',
        platform_supported TEXT    NOT NULL DEFAULT '["mt5","mt4","csv","manual"]',
        website            TEXT,
        is_active          INTEGER NOT NULL DEFAULT 1,
        created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
      )`,
    );

    await db.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_brokers_name_unique ON brokers (name COLLATE NOCASE)",
    );
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_brokers_active_name ON brokers (is_active, name COLLATE NOCASE)",
    );

    if (!(await tableHasColumn(db, "trading_accounts", "broker_id"))) {
      await db.execute("ALTER TABLE trading_accounts ADD COLUMN broker_id INTEGER");
    }
    if (!(await tableHasColumn(db, "trades", "broker_id"))) {
      await db.execute("ALTER TABLE trades ADD COLUMN broker_id INTEGER");
    }
    if (!(await tableHasColumn(db, "imports", "broker_id"))) {
      await db.execute("ALTER TABLE imports ADD COLUMN broker_id INTEGER");
    }
    if (!(await tableHasColumn(db, "mt5_sync_logs", "broker_id"))) {
      await db.execute("ALTER TABLE mt5_sync_logs ADD COLUMN broker_id INTEGER");
    }

    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_trading_accounts_broker_id ON trading_accounts (broker_id, is_active)",
    );
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_trades_broker_id ON trades (broker_id, opened_at DESC)",
    );
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_imports_broker_id ON imports (broker_id, created_at DESC)",
    );
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_mt5_sync_logs_broker_id ON mt5_sync_logs (broker_id, started_at DESC)",
    );

    await db.execute(
      `INSERT OR IGNORE INTO brokers (name, broker_type, platform_supported, website, is_active)
       VALUES
        ('Fusion Markets', 'retail', '["mt5","mt4","csv"]', 'https://fusionmarkets.com', 1),
        ('IC Markets', 'retail', '["mt5","mt4","csv"]', 'https://icmarkets.com', 1),
        ('OANDA', 'retail', '["mt5","mt4","csv"]', 'https://www.oanda.com', 1),
        ('Pepperstone', 'retail', '["mt5","mt4","csv"]', 'https://pepperstone.com', 1),
        ('FTMO', 'prop', '["mt5","mt4","csv"]', 'https://ftmo.com', 1),
        ('CSV Import', 'csv', '["csv"]', NULL, 1)`,
    );

    await db.execute(
      `INSERT OR IGNORE INTO brokers (name, broker_type, platform_supported, website, is_active)
       SELECT DISTINCT TRIM(broker), 'retail', '["mt5","mt4","csv","manual"]', NULL, 1
       FROM trades
       WHERE broker IS NOT NULL AND TRIM(broker) <> ''`,
    );

    await db.execute(
      `INSERT OR IGNORE INTO brokers (name, broker_type, platform_supported, website, is_active)
       SELECT DISTINCT TRIM(broker), 'retail', '["mt5","mt4","csv","manual"]', NULL, 1
       FROM imports
       WHERE broker IS NOT NULL AND TRIM(broker) <> ''`,
    );

    await db.execute(
      `UPDATE trades
       SET broker_id = (
         SELECT b.id
         FROM brokers b
         WHERE LOWER(TRIM(b.name)) = LOWER(TRIM(trades.broker))
         LIMIT 1
       )
       WHERE broker_id IS NULL
         AND broker IS NOT NULL
         AND TRIM(broker) <> ''`,
    );

    await db.execute(
      `UPDATE imports
       SET broker_id = (
         SELECT b.id
         FROM brokers b
         WHERE LOWER(TRIM(b.name)) = LOWER(TRIM(imports.broker))
         LIMIT 1
       )
       WHERE broker_id IS NULL
         AND broker IS NOT NULL
         AND TRIM(broker) <> ''`,
    );

    await db.execute(
      `UPDATE mt5_sync_logs
       SET broker_id = (
         SELECT b.id
         FROM brokers b
         WHERE LOWER(TRIM(b.name)) = LOWER(TRIM(mt5_sync_logs.broker))
         LIMIT 1
       )
       WHERE broker_id IS NULL
         AND broker IS NOT NULL
         AND TRIM(broker) <> ''`,
    );

    await db.execute(
      `UPDATE trading_accounts
       SET broker_id = (
         SELECT b.id
         FROM brokers b
         WHERE LOWER(TRIM(b.name)) = LOWER(TRIM(trading_accounts.broker))
         LIMIT 1
       )
       WHERE broker_id IS NULL
         AND broker IS NOT NULL
         AND TRIM(broker) <> ''`,
    );
  } catch (err) {
    logger.warn("Compat schema multi-brokers non appliquee", err);
  }
}

/**
 * Compat runtime: certaines bases legacy restent en schema v13.
 * On applique structure backtesting (migration 017) de facon idempotente.
 */
async function ensureBacktestingCompatibility(db: Database): Promise<void> {
  try {
    await db.execute(
      `CREATE TABLE IF NOT EXISTS market_data (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol        TEXT NOT NULL,
        timeframe     TEXT NOT NULL CHECK (timeframe IN ('M1','M5','M15','M30','H1','H4','D1')),
        timestamp     TEXT NOT NULL,
        open          REAL NOT NULL,
        high          REAL NOT NULL,
        low           REAL NOT NULL,
        close         REAL NOT NULL,
        volume        REAL,
        source        TEXT NOT NULL,
        platform      TEXT NOT NULL DEFAULT 'csv' CHECK (platform IN ('mt5','mt4','csv','manual')),
        broker        TEXT,
        account_id    TEXT,
        external_id   TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (high >= low),
        CHECK (open >= low AND open <= high),
        CHECK (close >= low AND close <= high)
      )`,
    );

    await db.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_market_data_unique ON market_data(symbol, timeframe, timestamp, source)",
    );
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_market_data_symbol_tf_time ON market_data(symbol, timeframe, timestamp)",
    );

    await db.execute(
      `CREATE TABLE IF NOT EXISTS backtest_strategies (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        name                    TEXT NOT NULL,
        symbol                  TEXT NOT NULL,
        timeframe               TEXT NOT NULL CHECK (timeframe IN ('M1','M5','M15','M30','H1','H4','D1')),
        entry_rules_json        TEXT NOT NULL,
        exit_rules_json         TEXT NOT NULL,
        stop_loss_percent       REAL NOT NULL,
        take_profit_percent     REAL NOT NULL,
        risk_reward_ratio       REAL NOT NULL,
        session                 TEXT NOT NULL DEFAULT 'all',
        test_period_start       TEXT NOT NULL,
        test_period_end         TEXT NOT NULL,
        initial_capital         REAL NOT NULL,
        risk_per_trade_percent  REAL NOT NULL,
        commission_per_trade    REAL NOT NULL DEFAULT 0,
        spread_points           REAL NOT NULL DEFAULT 0,
        direction               TEXT NOT NULL DEFAULT 'both' CHECK (direction IN ('long','short','both')),
        notes                   TEXT,
        created_at              TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    );

    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_backtest_strategies_symbol_tf ON backtest_strategies(symbol, timeframe, updated_at DESC)",
    );

    await db.execute(
      `CREATE TABLE IF NOT EXISTS backtest_runs (
        id                        INTEGER PRIMARY KEY AUTOINCREMENT,
        strategy_id               INTEGER NOT NULL,
        strategy_name             TEXT NOT NULL,
        symbol                    TEXT NOT NULL,
        timeframe                 TEXT NOT NULL,
        started_at                TEXT NOT NULL,
        finished_at               TEXT NOT NULL,
        period_start              TEXT NOT NULL,
        period_end                TEXT NOT NULL,
        initial_capital           REAL NOT NULL,
        final_capital             REAL NOT NULL,
        total_trades              INTEGER NOT NULL,
        wins                      INTEGER NOT NULL,
        losses                    INTEGER NOT NULL,
        breakevens                INTEGER NOT NULL,
        win_rate                  REAL NOT NULL,
        profit_factor             REAL NOT NULL,
        average_win               REAL NOT NULL,
        average_loss              REAL NOT NULL,
        total_pnl                 REAL NOT NULL,
        max_drawdown              REAL NOT NULL,
        commission_total          REAL NOT NULL,
        spread_total              REAL NOT NULL,
        max_consecutive_wins      INTEGER NOT NULL,
        max_consecutive_losses    INTEGER NOT NULL,
        metadata_json             TEXT,
        created_at                TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (strategy_id) REFERENCES backtest_strategies(id) ON DELETE CASCADE
      )`,
    );

    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_backtest_runs_started ON backtest_runs(started_at DESC)",
    );
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_backtest_runs_strategy ON backtest_runs(strategy_id, started_at DESC)",
    );

    await db.execute(
      `CREATE TABLE IF NOT EXISTS backtest_trades (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id          INTEGER NOT NULL,
        strategy_id     INTEGER NOT NULL,
        symbol          TEXT NOT NULL,
        timeframe       TEXT NOT NULL,
        side            TEXT NOT NULL CHECK (side IN ('buy','sell')),
        opened_at       TEXT NOT NULL,
        closed_at       TEXT NOT NULL,
        entry_price     REAL NOT NULL,
        exit_price      REAL NOT NULL,
        stop_loss       REAL NOT NULL,
        take_profit     REAL NOT NULL,
        position_size   REAL NOT NULL,
        gross_pnl       REAL NOT NULL,
        net_pnl         REAL NOT NULL,
        commission      REAL NOT NULL,
        spread_cost     REAL NOT NULL,
        result          TEXT NOT NULL CHECK (result IN ('win','loss','breakeven')),
        exit_reason     TEXT NOT NULL CHECK (exit_reason IN ('stop_loss','take_profit','rule_exit','end_of_period')),
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (run_id) REFERENCES backtest_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (strategy_id) REFERENCES backtest_strategies(id) ON DELETE CASCADE
      )`,
    );

    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_backtest_trades_run ON backtest_trades(run_id, opened_at ASC)",
    );

    await db.execute(
      `CREATE TABLE IF NOT EXISTS backtest_equity_points (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id       INTEGER NOT NULL,
        timestamp    TEXT NOT NULL,
        equity       REAL NOT NULL,
        drawdown     REAL NOT NULL,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (run_id) REFERENCES backtest_runs(id) ON DELETE CASCADE
      )`,
    );

    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_backtest_equity_run_time ON backtest_equity_points(run_id, timestamp ASC)",
    );
  } catch (err) {
    logger.warn("Compat schema backtesting non appliquee", err);
  }
}

/**
 * Retourne la connexion SQLite.
 * Cree la base automatiquement si elle n'existe pas.
 * Les migrations sont appliquees par le plugin Rust lors du premier chargement.
 */
export async function getDb(): Promise<Database> {
  if (!_instance) {
    try {
      _instance = await Database.load(DB_PATH);
      // SQLite ne persiste pas ces PRAGMA entre les connexions.
      await _instance.execute("PRAGMA foreign_keys = ON");
      await _instance.execute("PRAGMA busy_timeout = 10000");
      await ensureTradingAccountsCompatibility(_instance);
      await ensureBrokersCompatibility(_instance);
      await ensureBacktestingCompatibility(_instance);
      logger.info("Connexion SQLite ouverte");
    } catch (err) {
      logger.error("Erreur ouverture connexion SQLite", err);
      throw err;
    }
  }
  return _instance;
}

/**
 * Ferme proprement la connexion et reinitialise l'instance.
 * Utilise avant restauration d'un backup et lors de la fermeture app.
 */
export async function closeDb(): Promise<void> {
  if (_instance) {
    try {
      await _instance.close();
      logger.info("Connexion SQLite fermee");
    } catch (err) {
      logger.error("Erreur fermeture connexion SQLite", err);
      throw err;
    } finally {
      _instance = null;
    }
  }
}

/**
 * Retourne le chemin absolu du fichier SQLite utilise par le plugin SQL.
 * Utile pour les operations fichier encadrees par les services backups.
 */
export async function getDatabaseFilePath(): Promise<string> {
  return join(await appDataDir(), DB_NAME);
}
