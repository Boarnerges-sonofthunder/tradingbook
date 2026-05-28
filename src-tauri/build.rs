fn main() {
    // Déclare les fichiers de migration comme dépendances de compilation.
    // Sans ces directives, Cargo ne recompile pas quand un fichier .sql change.
    println!("cargo:rerun-if-changed=migrations/001_init.sql");
    println!("cargo:rerun-if-changed=migrations/002_schema.sql");
    println!("cargo:rerun-if-changed=migrations/003_activity_logs.sql");
    println!("cargo:rerun-if-changed=migrations/004_imports_enhancements.sql");
    println!("cargo:rerun-if-changed=migrations/005_mt4_support.sql");
    println!("cargo:rerun-if-changed=migrations/006_mt5_sync_logs_enhancements.sql");
    println!("cargo:rerun-if-changed=resources/mt5_bridge.py");

    tauri_build::build()
}
