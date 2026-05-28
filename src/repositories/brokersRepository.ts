// ============================================================
// Repository — Brokers (CRUD)
// ============================================================
// Toutes les requetes SQL sur `brokers` passent par ce module.
// ============================================================

import { getDb } from "../services/database";
import type {
  Broker,
  BrokerFormData,
  BrokerType,
  TradePlatform,
} from "../types";

interface BrokerRow {
  id: number;
  name: string;
  broker_type: string;
  platform_supported: string;
  website: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function normalizeBrokerName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function parsePlatforms(raw: string): TradePlatform[] {
  if (!raw) return ["mt5", "mt4", "csv", "manual"];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (platform): platform is TradePlatform =>
          platform === "mt5" ||
          platform === "mt4" ||
          platform === "csv" ||
          platform === "manual",
      );
    }
  } catch {
    // Fallback historique CSV "mt5,mt4,csv"
  }

  return raw
    .split(",")
    .map((platform) => platform.trim().toLowerCase())
    .filter(
      (platform): platform is TradePlatform =>
        platform === "mt5" ||
        platform === "mt4" ||
        platform === "csv" ||
        platform === "manual",
    );
}

function serializePlatforms(platforms?: TradePlatform[]): string {
  const normalized = Array.from(
    new Set(
      (platforms ?? ["mt5", "mt4", "csv", "manual"]).filter(
        (platform) =>
          platform === "mt5" ||
          platform === "mt4" ||
          platform === "csv" ||
          platform === "manual",
      ),
    ),
  );
  return JSON.stringify(normalized.length > 0 ? normalized : ["mt5", "mt4", "csv", "manual"]);
}

function rowToBroker(row: BrokerRow): Broker {
  return {
    id: row.id,
    name: row.name,
    brokerType: row.broker_type as BrokerType,
    platformSupported: parsePlatforms(row.platform_supported),
    website: row.website,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertBroker(data: BrokerFormData): Promise<Broker> {
  const db = await getDb();
  const normalizedName = normalizeBrokerName(data.name);
  const result = await db.execute(
    `INSERT INTO brokers (name, broker_type, platform_supported, website, is_active)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      normalizedName,
      data.brokerType ?? "retail",
      serializePlatforms(data.platformSupported),
      data.website?.trim() || null,
      data.isActive !== false ? 1 : 0,
    ],
  );

  const broker = await findBrokerById(result.lastInsertId!);
  if (!broker) throw new Error("Broker cree introuvable");
  return broker;
}

export async function findBrokerById(id: number): Promise<Broker | null> {
  const db = await getDb();
  const rows = await db.select<BrokerRow[]>(
    "SELECT * FROM brokers WHERE id = $1",
    [id],
  );
  return rows[0] ? rowToBroker(rows[0]) : null;
}

export async function findBrokerByName(name: string): Promise<Broker | null> {
  const db = await getDb();
  const normalizedName = normalizeBrokerName(name);
  const rows = await db.select<BrokerRow[]>(
    `SELECT * FROM brokers
     WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
     LIMIT 1`,
    [normalizedName],
  );
  return rows[0] ? rowToBroker(rows[0]) : null;
}

export async function findBrokers(onlyActive = false): Promise<Broker[]> {
  const db = await getDb();
  const where = onlyActive ? "WHERE is_active = 1" : "";
  const rows = await db.select<BrokerRow[]>(
    `SELECT * FROM brokers ${where} ORDER BY is_active DESC, name COLLATE NOCASE ASC`,
  );
  return rows.map(rowToBroker);
}

/**
 * Retourne seulement brokers apparus dans une sync MT5 terminee.
 * Fallback sur nom pour supporter historiques sans broker_id.
 */
export async function findSyncedBrokers(
  onlyActive = false,
): Promise<Broker[]> {
  const db = await getDb();
  const activeWhere = onlyActive ? "b.is_active = 1 AND" : "";
  const rows = await db.select<BrokerRow[]>(
    `SELECT b.*
     FROM brokers b
     WHERE ${activeWhere} EXISTS (
       SELECT 1
       FROM mt5_sync_logs logs
       WHERE logs.status IN ('success', 'partial_success')
         AND (
           logs.broker_id = b.id
           OR (
             logs.broker IS NOT NULL
             AND LOWER(TRIM(logs.broker)) = LOWER(TRIM(b.name))
           )
         )
     )
     ORDER BY b.is_active DESC, b.name COLLATE NOCASE ASC`,
  );
  return rows.map(rowToBroker);
}

export async function resolveOrCreateBrokerByName(
  name: string,
  defaults?: Pick<BrokerFormData, "brokerType" | "platformSupported" | "website" | "isActive">,
): Promise<Broker> {
  const normalizedName = normalizeBrokerName(name);
  const existing = await findBrokerByName(normalizedName);
  if (existing) return existing;

  return insertBroker({
    name: normalizedName,
    brokerType: defaults?.brokerType ?? "retail",
    platformSupported: defaults?.platformSupported,
    website: defaults?.website ?? null,
    isActive: defaults?.isActive ?? true,
  });
}

export async function updateBrokerById(
  id: number,
  data: Partial<BrokerFormData>,
): Promise<Broker | null> {
  const db = await getDb();
  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${idx++}`);
    params.push(normalizeBrokerName(data.name));
  }
  if (data.brokerType !== undefined) {
    fields.push(`broker_type = $${idx++}`);
    params.push(data.brokerType);
  }
  if (data.platformSupported !== undefined) {
    fields.push(`platform_supported = $${idx++}`);
    params.push(serializePlatforms(data.platformSupported));
  }
  if (data.website !== undefined) {
    fields.push(`website = $${idx++}`);
    params.push(data.website?.trim() || null);
  }
  if (data.isActive !== undefined) {
    fields.push(`is_active = $${idx++}`);
    params.push(data.isActive ? 1 : 0);
  }

  if (fields.length === 0) return findBrokerById(id);

  fields.push(`updated_at = datetime('now')`);
  params.push(id);

  await db.execute(
    `UPDATE brokers SET ${fields.join(", ")} WHERE id = $${idx}`,
    params,
  );

  return findBrokerById(id);
}

export async function deactivateBroker(id: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    "UPDATE brokers SET is_active = 0, updated_at = datetime('now') WHERE id = $1",
    [id],
  );
  return result.rowsAffected > 0;
}

export async function countTradingAccountsForBroker(id: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ total: number }[]>(
    "SELECT COUNT(*) AS total FROM trading_accounts WHERE broker_id = $1",
    [id],
  );
  return rows[0]?.total ?? 0;
}
