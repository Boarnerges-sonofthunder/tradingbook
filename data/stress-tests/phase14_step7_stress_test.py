import csv
import json
import os
import random
import shutil
import sqlite3
import string
import time
import tracemalloc
import zipfile
from datetime import datetime, timedelta, UTC
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = ROOT / "src-tauri" / "migrations"
OUT_DIR = ROOT / "data" / "stress-tests"
DB_DIR = OUT_DIR / "db"
CSV_DIR = OUT_DIR / "csv"
BACKUP_DIR = OUT_DIR / "backups"
LOG_DIR = OUT_DIR / "logs"
REPORT_PATH = OUT_DIR / "phase14_step7_report.json"

REAL_DB_PATH = Path(os.environ.get("LOCALAPPDATA", "")) / "com.tradingbook.app" / "tradingbook.db"

SIZES = [1000, 5000, 10000]
SYMBOLS = [
    "EURUSD",
    "GBPUSD",
    "USDJPY",
    "XAUUSD",
    "NAS100",
    "US30",
    "BTCUSD",
    "ETHUSD",
]
BROKERS = ["Fusion Markets", "IC Markets", "OANDA", "Pepperstone"]
PLATFORMS = ["mt5", "csv", "manual"]


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def time_call(fn):
    start = time.perf_counter()
    result = fn()
    elapsed_ms = (time.perf_counter() - start) * 1000
    return result, elapsed_ms


def ensure_dirs():
    for d in (OUT_DIR, DB_DIR, CSV_DIR, BACKUP_DIR, LOG_DIR):
        d.mkdir(parents=True, exist_ok=True)


def backup_real_db_if_present():
    entry = {
        "real_db_found": REAL_DB_PATH.exists(),
        "real_db_path": str(REAL_DB_PATH),
        "backup_path": None,
        "backup_size_bytes": None,
    }
    if REAL_DB_PATH.exists():
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_path = BACKUP_DIR / f"pre-stress-realdb-{ts}.db"
        shutil.copy2(REAL_DB_PATH, backup_path)
        entry["backup_path"] = str(backup_path)
        entry["backup_size_bytes"] = backup_path.stat().st_size
    return entry


def apply_migrations(conn: sqlite3.Connection):
    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    for migration in migration_files:
        sql = migration.read_text(encoding="utf-8")
        conn.executescript(sql)


def create_database(db_path: Path):
    if db_path.exists():
        db_path.unlink()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA busy_timeout = 10000")
    apply_migrations(conn)
    conn.commit()
    return conn


def random_external_id(i: int) -> str:
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
    return f"EXT-{i}-{suffix}"


def build_trade_rows(n: int):
    base_open = datetime(2024, 1, 1, tzinfo=UTC)
    rows = []
    for i in range(n):
        symbol = random.choice(SYMBOLS)
        side = "buy" if i % 2 == 0 else "sell"
        status = "closed" if i % 10 != 0 else "open"
        opened_at = (base_open + timedelta(minutes=i * 15)).isoformat().replace("+00:00", "Z")
        closed_at = None
        entry_price = round(random.uniform(1.0, 3000.0), 5)
        exit_price = None
        gross_pnl = None
        net_pnl = None
        if status == "closed":
            delta = random.uniform(-30.0, 40.0)
            exit_price = round(entry_price + (delta / 100.0), 5)
            gross_pnl = round(delta, 2)
            net_pnl = round(gross_pnl - random.uniform(0.2, 2.5), 2)
            closed_at = (base_open + timedelta(minutes=i * 15 + 45)).isoformat().replace("+00:00", "Z")

        commission = round(random.uniform(0.1, 2.0), 2)
        swap = round(random.uniform(-0.5, 0.5), 2)
        fees = round(random.uniform(0.0, 1.0), 2)
        risk = round(random.uniform(10, 150), 2)
        reward = round(risk * random.uniform(0.8, 3.2), 2)
        rr = round(reward / risk, 2) if risk else None

        rows.append(
            (
                random_external_id(i),
                random.choice(BROKERS),
                f"ACC-{100 + (i % 5)}",
                random.choice(PLATFORMS),
                random.choice(PLATFORMS),
                None,
                symbol,
                side,
                status,
                opened_at,
                closed_at,
                entry_price,
                exit_price,
                round(entry_price * 0.99, 5),
                round(entry_price * 1.01, 5),
                round(random.uniform(0.01, 3.0), 2),
                commission,
                swap,
                fees,
                gross_pnl,
                net_pnl,
                "USD",
                risk,
                reward,
                rr,
                None,
            )
        )
    return rows


def bulk_insert_trades(conn: sqlite3.Connection, rows):
    sql = """
        INSERT INTO trades (
          external_id, broker, account_id, platform, source, import_id,
          symbol, side, status, opened_at, closed_at,
          entry_price, exit_price, stop_loss, take_profit, volume,
          commission, swap, fees, gross_pnl, net_pnl, currency,
          risk_amount, reward_amount, risk_reward_ratio, strategy_id
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?
        )
    """
    conn.executemany(sql, rows)


def write_fake_csv(path: Path, n: int):
    headers = [
        "external_id",
        "broker",
        "account_id",
        "symbol",
        "side",
        "status",
        "opened_at",
        "closed_at",
        "entry_price",
        "exit_price",
        "volume",
        "commission",
        "swap",
        "fees",
        "gross_pnl",
        "net_pnl",
    ]
    base_open = datetime(2024, 6, 1, tzinfo=UTC)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for i in range(n):
            opened_at = (base_open + timedelta(minutes=i * 10)).isoformat().replace("+00:00", "Z")
            closed_at = (base_open + timedelta(minutes=i * 10 + 25)).isoformat().replace("+00:00", "Z")
            gross = round(random.uniform(-25, 35), 2)
            net = round(gross - random.uniform(0.2, 2.1), 2)
            writer.writerow(
                [
                    f"CSV-{i}",
                    random.choice(BROKERS),
                    f"ACC-{100 + (i % 5)}",
                    random.choice(SYMBOLS),
                    "buy" if i % 2 == 0 else "sell",
                    "closed",
                    opened_at,
                    closed_at,
                    round(random.uniform(1.0, 3000.0), 5),
                    round(random.uniform(1.0, 3000.0), 5),
                    round(random.uniform(0.01, 3.0), 2),
                    round(random.uniform(0.1, 2.0), 2),
                    round(random.uniform(-0.5, 0.5), 2),
                    round(random.uniform(0.0, 1.0), 2),
                    gross,
                    net,
                ]
            )


def import_csv_to_db(conn: sqlite3.Connection, csv_path: Path):
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO imports (
          source, filename, broker, account_id, status,
          total_rows, imported_rows, skipped_rows, error_rows,
          imported_at, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("csv", csv_path.name, "Fusion Markets", "ACC-CSV", "in_progress", 0, 0, 0, 0, None, None),
    )
    import_id = cur.lastrowid

    imported_rows = 0
    with csv_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        to_insert = []
        for idx, row in enumerate(reader, start=1):
            cur.execute(
                "INSERT INTO import_rows (import_id, row_index, raw_data, status) VALUES (?, ?, ?, ?)",
                (import_id, idx, json.dumps(row), "pending"),
            )
            to_insert.append(
                (
                    row["external_id"],
                    row["broker"],
                    row["account_id"],
                    "csv",
                    "csv",
                    import_id,
                    row["symbol"],
                    row["side"],
                    row["status"],
                    row["opened_at"],
                    row["closed_at"],
                    float(row["entry_price"]),
                    float(row["exit_price"]),
                    None,
                    None,
                    float(row["volume"]),
                    float(row["commission"]),
                    float(row["swap"]),
                    float(row["fees"]),
                    float(row["gross_pnl"]),
                    float(row["net_pnl"]),
                    "USD",
                    None,
                    None,
                    None,
                    None,
                )
            )
            imported_rows += 1

    bulk_insert_trades(conn, to_insert)
    cur.execute(
        """
        UPDATE imports
        SET status = 'completed', total_rows = ?, imported_rows = ?, skipped_rows = 0,
            error_rows = 0, imported_at = ?, error_message = NULL
        WHERE id = ?
        """,
        (imported_rows, imported_rows, now_iso(), import_id),
    )


def run_queries(conn: sqlite3.Connection):
    metrics = {}

    _, metrics["sqlite_integrity_check_ms"] = time_call(lambda: conn.execute("PRAGMA integrity_check").fetchall())

    _, metrics["trades_list_ms"] = time_call(
        lambda: conn.execute(
            "SELECT id, symbol, side, status, opened_at, net_pnl FROM trades ORDER BY opened_at DESC, id DESC LIMIT 200"
        ).fetchall()
    )

    _, metrics["trades_filter_ms"] = time_call(
        lambda: conn.execute(
            """
            SELECT id, symbol, side, status, opened_at, net_pnl
            FROM trades
            WHERE symbol = ? AND side = ? AND status = ?
              AND opened_at BETWEEN ? AND ?
            ORDER BY opened_at DESC
            LIMIT 200
            """,
            ("EURUSD", "buy", "closed", "2024-01-01T00:00:00Z", "2026-01-01T00:00:00Z"),
        ).fetchall()
    )

    _, metrics["trades_search_ms"] = time_call(
        lambda: conn.execute(
            """
            SELECT id, symbol, broker, account_id
            FROM trades
            WHERE symbol LIKE ? OR broker LIKE ? OR account_id LIKE ?
            ORDER BY opened_at DESC
            LIMIT 200
            """,
            ("%USD%", "%Fusion%", "%ACC-10%"),
        ).fetchall()
    )

    _, metrics["trades_sort_ms"] = time_call(
        lambda: conn.execute(
            "SELECT id, symbol, net_pnl FROM trades WHERE status='closed' ORDER BY net_pnl DESC LIMIT 200"
        ).fetchall()
    )

    _, metrics["analytics_summary_ms"] = time_call(
        lambda: conn.execute(
            """
            SELECT
              COUNT(*) AS closed_count,
              SUM(COALESCE(net_pnl, 0)) AS net_sum,
              AVG(COALESCE(net_pnl, 0)) AS net_avg,
              SUM(CASE WHEN COALESCE(net_pnl,0) > 0 THEN 1 ELSE 0 END) AS wins,
              SUM(CASE WHEN COALESCE(net_pnl,0) <= 0 THEN 1 ELSE 0 END) AS losses
            FROM trades
            WHERE status = 'closed'
            """
        ).fetchall()
    )

    _, metrics["analytics_by_symbol_ms"] = time_call(
        lambda: conn.execute(
            """
            SELECT symbol, COUNT(*) AS cnt, SUM(COALESCE(net_pnl,0)) AS pnl
            FROM trades
            WHERE status = 'closed'
            GROUP BY symbol
            ORDER BY pnl DESC
            """
        ).fetchall()
    )

    _, metrics["analytics_chart_series_ms"] = time_call(
        lambda: conn.execute(
            """
            SELECT substr(closed_at,1,10) AS day, SUM(COALESCE(net_pnl,0)) AS day_pnl
            FROM trades
            WHERE status = 'closed' AND closed_at IS NOT NULL
            GROUP BY day
            ORDER BY day ASC
            """
        ).fetchall()
    )

    plans = {
        "list": conn.execute(
            "EXPLAIN QUERY PLAN SELECT id FROM trades ORDER BY opened_at DESC, id DESC LIMIT 200"
        ).fetchall(),
        "filter": conn.execute(
            "EXPLAIN QUERY PLAN SELECT id FROM trades WHERE symbol='EURUSD' AND side='buy' AND status='closed' AND opened_at BETWEEN '2024-01-01T00:00:00Z' AND '2026-01-01T00:00:00Z' ORDER BY opened_at DESC LIMIT 200"
        ).fetchall(),
        "search": conn.execute(
            "EXPLAIN QUERY PLAN SELECT id FROM trades WHERE symbol LIKE '%USD%' OR broker LIKE '%Fusion%' OR account_id LIKE '%ACC-10%' ORDER BY opened_at DESC LIMIT 200"
        ).fetchall(),
    }
    metrics["query_plans"] = {
        key: [dict(row) for row in value] for key, value in plans.items()
    }

    return metrics


def backup_db_file(conn: sqlite3.Connection, db_path: Path):
    # Avec WAL actif, une copie fichier sans checkpoint peut ignorer le contenu du .wal.
    # On force un checkpoint pour mesurer une sauvegarde brute cohérente.
    conn.execute("PRAGMA wal_checkpoint(FULL)")
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    raw_backup = BACKUP_DIR / f"stress-db-{db_path.stem}-{ts}.db"
    zip_backup = BACKUP_DIR / f"stress-db-{db_path.stem}-{ts}.zip"

    def do_copy():
        shutil.copy2(db_path, raw_backup)

    def do_zip():
        with zipfile.ZipFile(zip_backup, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.write(db_path, arcname=db_path.name)

    _, raw_ms = time_call(do_copy)
    _, zip_ms = time_call(do_zip)
    return {
        "raw_backup_path": str(raw_backup),
        "zip_backup_path": str(zip_backup),
        "raw_backup_ms": raw_ms,
        "zip_backup_ms": zip_ms,
        "raw_size_bytes": raw_backup.stat().st_size,
        "zip_size_bytes": zip_backup.stat().st_size,
    }


def write_logs(size_label: str, n_lines: int = 500):
    log_file = LOG_DIR / f"stress-{size_label}-{datetime.now().strftime('%Y%m%d')}.log"

    def do_write():
        with log_file.open("a", encoding="utf-8") as f:
            for i in range(n_lines):
                f.write(f"[{now_iso()}] [INFO] [STRESS] line={i} size={size_label}\\n")

    _, write_ms = time_call(do_write)
    return {
        "log_file": str(log_file),
        "log_write_ms": write_ms,
        "lines_written": n_lines,
        "log_size_bytes": log_file.stat().st_size,
    }


def run_size_case(size: int):
    case = {
        "size": size,
        "errors": [],
    }
    db_path = DB_DIR / f"tradingbook-stress-{size}.db"

    try:
        tracemalloc.start()

        _, startup_ms = time_call(lambda: create_database(db_path))
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row

        # sanity startup simulation
        _, startup_check_ms = time_call(
            lambda: conn.execute("SELECT value FROM app_metadata WHERE key='schema_version'").fetchall()
        )

        trade_rows = build_trade_rows(size)

        def insert_block():
            with conn:
                bulk_insert_trades(conn, trade_rows)

        _, insert_ms = time_call(insert_block)

        query_metrics = run_queries(conn)

        csv_path = CSV_DIR / f"fake-import-{size}.csv"
        _, csv_write_ms = time_call(lambda: write_fake_csv(csv_path, size))

        def csv_import_block():
            with conn:
                import_csv_to_db(conn, csv_path)

        _, csv_import_ms = time_call(csv_import_block)

        backup_metrics = backup_db_file(conn, db_path)
        log_metrics = write_logs(str(size))

        counts = {
            "trades_total": conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0],
            "trades_closed": conn.execute("SELECT COUNT(*) FROM trades WHERE status='closed'").fetchone()[0],
            "imports_total": conn.execute("SELECT COUNT(*) FROM imports").fetchone()[0],
            "import_rows_total": conn.execute("SELECT COUNT(*) FROM import_rows").fetchone()[0],
        }

        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        conn.close()

        case.update(
            {
                "db_path": str(db_path),
                "db_size_bytes": db_path.stat().st_size,
                "startup_db_init_ms": startup_ms,
                "startup_schema_check_ms": startup_check_ms,
                "insert_trades_ms": insert_ms,
                "csv_write_ms": csv_write_ms,
                "csv_import_ms": csv_import_ms,
                "query_metrics": query_metrics,
                "backup_metrics": backup_metrics,
                "log_metrics": log_metrics,
                "counts": counts,
                "memory_current_bytes": current,
                "memory_peak_bytes": peak,
            }
        )
    except Exception as exc:
        case["errors"].append(str(exc))

    return case


def summarize(cases):
    summary = {
        "slow_operations": [],
        "errors": [],
    }

    for case in cases:
        size = case["size"]
        if case.get("errors"):
            summary["errors"].append({"size": size, "errors": case["errors"]})
            continue

        q = case["query_metrics"]
        checks = {
            "startup_db_init_ms": case["startup_db_init_ms"],
            "insert_trades_ms": case["insert_trades_ms"],
            "trades_list_ms": q["trades_list_ms"],
            "trades_filter_ms": q["trades_filter_ms"],
            "trades_search_ms": q["trades_search_ms"],
            "trades_sort_ms": q["trades_sort_ms"],
            "analytics_summary_ms": q["analytics_summary_ms"],
            "analytics_by_symbol_ms": q["analytics_by_symbol_ms"],
            "analytics_chart_series_ms": q["analytics_chart_series_ms"],
            "csv_import_ms": case["csv_import_ms"],
            "backup_zip_ms": case["backup_metrics"]["zip_backup_ms"],
            "log_write_ms": case["log_metrics"]["log_write_ms"],
        }

        for key, value in checks.items():
            threshold = 300.0
            if key in ("insert_trades_ms", "csv_import_ms"):
                threshold = 1200.0
            if key == "backup_zip_ms":
                threshold = 800.0
            if value > threshold:
                summary["slow_operations"].append(
                    {
                        "size": size,
                        "operation": key,
                        "ms": round(value, 2),
                        "threshold_ms": threshold,
                    }
                )

    return summary


def main():
    random.seed(42)
    ensure_dirs()

    real_backup = backup_real_db_if_present()

    started_at = now_iso()
    cases = [run_size_case(size) for size in SIZES]
    ended_at = now_iso()
    summary = summarize(cases)

    report = {
        "phase": "14",
        "step": "7",
        "name": "stress-tests",
        "started_at": started_at,
        "ended_at": ended_at,
        "real_db_backup": real_backup,
        "cases": cases,
        "summary": summary,
    }

    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({
        "report_path": str(REPORT_PATH),
        "slow_operations": len(summary["slow_operations"]),
        "errors": len(summary["errors"]),
    }, indent=2))


if __name__ == "__main__":
    main()
