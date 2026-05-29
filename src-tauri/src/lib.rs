use tauri_plugin_sql::{Migration, MigrationKind};

// ============================================================
// Système de logs — TradingBook
// ============================================================
// tauri-plugin-log gère :
//   - l'écriture dans le fichier local (LogDir)
//   - le transfert vers la webview en développement (Webview)
// Niveau DEBUG en dev, INFO en production.
// Rotation automatique à 5 Mo (ancien fichier renommé .old).
// ============================================================

fn get_log_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    let mut targets = vec![
        // Fichier : %LOCALAPPDATA%\com.tradingbook.app\logs\tradingbook.log
        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
            file_name: Some("tradingbook".into()),
        }),
    ];

    // Cible Webview utile en dev; en release on evite surcharge IPC inutile.
    if cfg!(debug_assertions) {
        targets.push(tauri_plugin_log::Target::new(
            tauri_plugin_log::TargetKind::Webview,
        ));
    }

    tauri_plugin_log::Builder::new()
        .targets(targets)
        .level(if cfg!(debug_assertions) {
            log::LevelFilter::Debug
        } else {
            log::LevelFilter::Info
        })
        .max_file_size(5_242_880) // 5 Mo — rotation automatique au-delà
        .build()
}

// ============================================================
// Système de migrations SQLite — TradingBook
// ============================================================
// Les migrations sont exécutées automatiquement au démarrage
// par tauri-plugin-sql (via sqlx), dans l'ordre croissant de version.
//
// Pour ajouter une nouvelle migration :
//   1. Créer le fichier SQL dans src-tauri/migrations/
//      (ex: 002_add_trades.sql)
//   2. Incrémenter le numéro de version
//   3. Ajouter une entrée Migration dans get_migrations() ci-dessous
//   4. Ne JAMAIS modifier une migration déjà appliquée en production
// ============================================================

/// Retourne la liste ordonnée de toutes les migrations SQLite.
/// Chaque migration est identifiée par un numéro de version unique.
fn get_migrations() -> Vec<Migration> {
    vec![
        // ---- Migration 001 : socle initial (app_metadata, settings) ----
        Migration {
            version: 1,
            description: "initial_setup",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        // ---- Migration 002 : schéma complet (trades, strategies, tags…) ----
        Migration {
            version: 2,
            description: "full_schema",
            sql: include_str!("../migrations/002_schema.sql"),
            kind: MigrationKind::Up,
        },
        // ---- Migration 003 : historique des modifications des trades ----
        Migration {
            version: 3,
            description: "activity_logs",
            sql: include_str!("../migrations/003_activity_logs.sql"),
            kind: MigrationKind::Up,
        },
        // ---- Migration 004 : amélioration table imports (Phase 5) ----
        Migration {
            version: 4,
            description: "imports_enhancements",
            sql: include_str!("../migrations/004_imports_enhancements.sql"),
            kind: MigrationKind::Up,
        },
        // ---- Migration 005 : support plateforme MetaTrader 4 ----
        Migration {
            version: 5,
            description: "mt4_support",
            sql: include_str!("../migrations/005_mt4_support.sql"),
            kind: MigrationKind::Up,
        },
        // ---- Migration 006 : logs de synchronisation MT5 détaillés ----
        Migration {
            version: 6,
            description: "mt5_sync_logs_enhancements",
            sql: include_str!("../migrations/006_mt5_sync_logs_enhancements.sql"),
            kind: MigrationKind::Up,
        },
        // ---- Migration 007 : filtres sauvegardes du journal des trades ----
        Migration {
            version: 7,
            description: "saved_filters",
            sql: include_str!("../migrations/007_saved_filters.sql"),
            kind: MigrationKind::Up,
        },
        // ---- Migration 008 : metadonnees fichiers des screenshots ----
        Migration {
            version: 8,
            description: "screenshot_file_metadata",
            sql: include_str!("../migrations/008_screenshot_file_metadata.sql"),
            kind: MigrationKind::Up,
        },
        // ---- Migration 009 : suppression des filtres sauvegardes ----
        Migration {
            version: 9,
            description: "drop_saved_filters",
            sql: include_str!("../migrations/009_drop_saved_filters.sql"),
            kind: MigrationKind::Up,
        },
        // ---- Migration 010 : index SQLite de performance ciblés ----
        Migration {
            version: 10,
            description: "sqlite_performance_indexes",
            sql: include_str!("../migrations/010_sqlite_performance_indexes.sql"),
            kind: MigrationKind::Up,
        },
        // ---- Migration 011 : index composite filtre+tri trades ----
        Migration {
            version: 11,
            description: "trades_filter_sort_index",
            sql: include_str!("../migrations/011_trades_filter_sort_index.sql"),
            kind: MigrationKind::Up,
        },
        // ---- Migration 012 : stockage OHLC local pour TradeReplay ----
        Migration {
            version: 12,
            description: "market_ohlc",
            sql: include_str!("../migrations/012_market_ohlc.sql"),
            kind: MigrationKind::Up,
        },
        // ---- Migration 013 : unicite NULL-safe des chandelles OHLC ----
        Migration {
            version: 13,
            description: "market_ohlc_unique_fix",
            sql: include_str!("../migrations/013_market_ohlc_unique_fix.sql"),
            kind: MigrationKind::Up,
        },
        // ---- Migration 014 : support multi-comptes de trading ----
        Migration {
            version: 14,
            description: "trading_accounts",
            sql: include_str!("../migrations/014_trading_accounts.sql"),
            kind: MigrationKind::Up,
        },
        // ---- Migration 015 : support multi-brokers normalises ----
        Migration {
            version: 15,
            description: "brokers",
            sql: include_str!("../migrations/015_brokers.sql"),
            kind: MigrationKind::Up,
        },
        // ---- Migration 016 : liaison broker_id sur tables existantes ----
        Migration {
            version: 16,
            description: "broker_ids",
            sql: include_str!("../migrations/016_broker_ids.sql"),
            kind: MigrationKind::Up,
        },
        // ---- Migration 017 : module backtesting avance ----
        Migration {
            version: 17,
            description: "backtesting",
            sql: include_str!("../migrations/017_backtesting.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(get_log_plugin()) // En premier pour capturer les logs des autres plugins
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:tradingbook.db", get_migrations())
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
