fn main() {
    // Déclare les fichiers de migration comme dépendances de compilation.
    // Sans ces directives, Cargo ne recompile pas quand un fichier .sql change.
    println!("cargo:rerun-if-changed=migrations/001_init.sql");
    println!("cargo:rerun-if-changed=migrations/002_schema.sql");
    println!("cargo:rerun-if-changed=migrations/003_activity_logs.sql");
    println!("cargo:rerun-if-changed=migrations/004_imports_enhancements.sql");
    println!("cargo:rerun-if-changed=migrations/005_mt4_support.sql");
    println!("cargo:rerun-if-changed=migrations/006_mt5_sync_logs_enhancements.sql");
    println!("cargo:rerun-if-changed=migrations/007_saved_filters.sql");
    println!("cargo:rerun-if-changed=migrations/008_screenshot_file_metadata.sql");
    println!("cargo:rerun-if-changed=migrations/009_drop_saved_filters.sql");
    println!("cargo:rerun-if-changed=migrations/010_sqlite_performance_indexes.sql");
    println!("cargo:rerun-if-changed=migrations/011_trades_filter_sort_index.sql");
    println!("cargo:rerun-if-changed=migrations/012_market_ohlc.sql");
    println!("cargo:rerun-if-changed=migrations/013_market_ohlc_unique_fix.sql");
    println!("cargo:rerun-if-changed=migrations/014_trading_accounts.sql");
    println!("cargo:rerun-if-changed=migrations/015_brokers.sql");
    println!("cargo:rerun-if-changed=migrations/016_broker_ids.sql");
    println!("cargo:rerun-if-changed=migrations/017_backtesting.sql");
    println!("cargo:rerun-if-changed=migrations/018_trading_account_initial_capital.sql");
    println!("cargo:rerun-if-changed=resources/mt5_bridge.py");

    tauri_build::build()
}
