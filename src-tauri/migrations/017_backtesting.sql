-- ============================================================
-- Migration 017 : module backtesting avance
-- ============================================================
-- Ajoute stockage dedie simulation historique.
-- Strictement separe des trades reels.
-- Aucun ordre reel, aucune execution live.
-- ============================================================

CREATE TABLE IF NOT EXISTS market_data (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_data_unique
    ON market_data(symbol, timeframe, timestamp, source);

CREATE INDEX IF NOT EXISTS idx_market_data_symbol_tf_time
    ON market_data(symbol, timeframe, timestamp);

CREATE TABLE IF NOT EXISTS backtest_strategies (
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
);

CREATE INDEX IF NOT EXISTS idx_backtest_strategies_symbol_tf
    ON backtest_strategies(symbol, timeframe, updated_at DESC);

CREATE TABLE IF NOT EXISTS backtest_runs (
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
);

CREATE INDEX IF NOT EXISTS idx_backtest_runs_started
    ON backtest_runs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_backtest_runs_strategy
    ON backtest_runs(strategy_id, started_at DESC);

CREATE TABLE IF NOT EXISTS backtest_trades (
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
);

CREATE INDEX IF NOT EXISTS idx_backtest_trades_run
    ON backtest_trades(run_id, opened_at ASC);

CREATE TABLE IF NOT EXISTS backtest_equity_points (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id       INTEGER NOT NULL,
    timestamp    TEXT NOT NULL,
    equity       REAL NOT NULL,
    drawdown     REAL NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (run_id) REFERENCES backtest_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_backtest_equity_run_time
    ON backtest_equity_points(run_id, timestamp ASC);

UPDATE app_metadata
SET value = '17', updated_at = datetime('now')
WHERE key = 'schema_version';
