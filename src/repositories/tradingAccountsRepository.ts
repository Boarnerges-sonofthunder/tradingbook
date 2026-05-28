// ============================================================
// Repository — Trading Accounts (CRUD)
// ============================================================
// Toutes les requêtes SQL sur `trading_accounts` passent par ce module.
// ============================================================

import { getDb } from "../services/database";
import type {
  TradingAccount,
  TradingAccountFormData,
  ResolveTradingAccountInput,
  TradePlatform,
  TradingAccountType,
} from "../types";

// ------------------------------------------------------------
// Type interne — colonnes SQLite (snake_case)
// ------------------------------------------------------------

interface TradingAccountRow {
  id: number;
  name: string;
  broker: string;
  broker_id: number | null;
  platform: string;
  account_number: string;
  account_type: string;
  currency: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface BrokerIdentityRow {
  id: number;
  name: string;
}

const TRADING_ACCOUNT_SELECT_COLUMNS = `
  ta.id,
  ta.name,
  COALESCE(b.name, ta.broker) AS broker,
  ta.broker_id,
  ta.platform,
  ta.account_number,
  ta.account_type,
  ta.currency,
  ta.is_active,
  ta.created_at,
  ta.updated_at
`;

function normalizeBrokerName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

async function resolveBrokerIdentity(
  brokerName: string,
  brokerId?: number | null,
): Promise<BrokerIdentityRow> {
  const db = await getDb();
  const normalizedName = normalizeBrokerName(brokerName);

  if (brokerId && brokerId > 0) {
    const rows = await db.select<BrokerIdentityRow[]>(
      "SELECT id, name FROM brokers WHERE id = $1 LIMIT 1",
      [brokerId],
    );
    if (rows[0]) return rows[0];
  }

  const existing = await db.select<BrokerIdentityRow[]>(
    `SELECT id, name
     FROM brokers
     WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
     LIMIT 1`,
    [normalizedName],
  );

  if (existing[0]) return existing[0];

  const insertResult = await db.execute(
    `INSERT INTO brokers (name, broker_type, platform_supported, website, is_active)
     VALUES ($1, 'retail', '["mt5","mt4","csv","manual"]', NULL, 1)`,
    [normalizedName],
  );

  const created = await db.select<BrokerIdentityRow[]>(
    "SELECT id, name FROM brokers WHERE id = $1 LIMIT 1",
    [insertResult.lastInsertId!],
  );
  if (!created[0]) {
    throw new Error(`Broker cree introuvable: ${normalizedName}`);
  }
  return created[0];
}

function rowToAccount(row: TradingAccountRow): TradingAccount {
  return {
    id: row.id,
    name: row.name,
    broker: row.broker,
    brokerId: row.broker_id,
    platform: row.platform as TradePlatform,
    accountNumber: row.account_number,
    accountType: row.account_type as TradingAccountType,
    currency: row.currency,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ------------------------------------------------------------
// CREATE
// ------------------------------------------------------------

export async function insertTradingAccount(
  data: TradingAccountFormData,
): Promise<TradingAccount> {
  const broker = await resolveBrokerIdentity(data.broker, data.brokerId);
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO trading_accounts (name, broker, broker_id, platform, account_number, account_type, currency, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      data.name,
      broker.name,
      broker.id,
      data.platform,
      data.accountNumber,
      data.accountType ?? "other",
      data.currency ?? null,
      data.isActive !== false ? 1 : 0,
    ],
  );
  const account = await findTradingAccountById(result.lastInsertId!);
  if (!account) throw new Error("Compte créé introuvable");
  return account;
}

// ------------------------------------------------------------
// RESOLVE OR CREATE
// ------------------------------------------------------------

/**
 * Cherche un compte par (broker, platform, accountNumber).
 * S'il n'existe pas, le crée automatiquement.
 *
 * Utilisé par les pipelines MT5 sync et CSV import pour
 * normaliser automatiquement les comptes sans intervention utilisateur.
 */
export async function resolveOrCreateTradingAccount(
  input: ResolveTradingAccountInput,
): Promise<TradingAccount> {
  const broker = await resolveBrokerIdentity(input.broker, input.brokerId);
  const db = await getDb();

  const rows = await db.select<TradingAccountRow[]>(
    `SELECT ${TRADING_ACCOUNT_SELECT_COLUMNS}
     FROM trading_accounts ta
     LEFT JOIN brokers b ON b.id = ta.broker_id
     WHERE (
       ta.broker_id = $1
       OR (ta.broker_id IS NULL AND LOWER(TRIM(ta.broker)) = LOWER(TRIM($2)))
     )
       AND ta.platform = $3
       AND ta.account_number = $4
     LIMIT 1`,
    [broker.id, broker.name, input.platform, input.accountNumber],
  );

  if (rows[0]) {
    const existing = rowToAccount(rows[0]);

    // Amélioration progressive : si le compte était "other" mais que
    // l'appelant connaît maintenant demo/live/prop, on met à jour.
    if (
      input.accountType &&
      input.accountType !== "other" &&
      existing.accountType === "other"
    ) {
      const upgraded = await updateTradingAccountById(existing.id, {
        accountType: input.accountType,
      });
      return upgraded ?? existing;
    }

    return existing;
  }

  // Créer un nom de compte lisible si aucun hint fourni
  const name =
    input.nameHint?.trim() ||
    `${broker.name} ${input.platform.toUpperCase()} ${input.accountNumber}`;

  return insertTradingAccount({
    name,
    broker: broker.name,
    brokerId: broker.id,
    platform: input.platform,
    accountNumber: input.accountNumber,
    accountType: input.accountType ?? "other",
    currency: input.currency ?? null,
    isActive: true,
  });
}

// ------------------------------------------------------------
// READ
// ------------------------------------------------------------

export async function findTradingAccountById(
  id: number,
): Promise<TradingAccount | null> {
  const db = await getDb();
  const rows = await db.select<TradingAccountRow[]>(
    `SELECT ${TRADING_ACCOUNT_SELECT_COLUMNS}
     FROM trading_accounts ta
     LEFT JOIN brokers b ON b.id = ta.broker_id
     WHERE ta.id = $1`,
    [id],
  );
  return rows[0] ? rowToAccount(rows[0]) : null;
}

/** Retourne tous les comptes, actifs en premier, ordre alphabétique. */
export async function findTradingAccounts(
  onlyActive = false,
): Promise<TradingAccount[]> {
  const db = await getDb();
  const where = onlyActive ? "WHERE ta.is_active = 1" : "";
  const rows = await db.select<TradingAccountRow[]>(
    `SELECT ${TRADING_ACCOUNT_SELECT_COLUMNS}
     FROM trading_accounts ta
     LEFT JOIN brokers b ON b.id = ta.broker_id
     ${where}
     ORDER BY ta.is_active DESC, ta.name COLLATE NOCASE ASC`,
  );
  return rows.map(rowToAccount);
}

/**
 * Retourne seulement les comptes vus dans au moins une sync MT5 terminee.
 * Fallback sur broker/numero pour rester compatible avec anciens logs.
 */
export async function findSyncedTradingAccounts(
  onlyActive = false,
): Promise<TradingAccount[]> {
  const db = await getDb();
  const activeWhere = onlyActive ? "ta.is_active = 1 AND" : "";
  const rows = await db.select<TradingAccountRow[]>(
    `SELECT ${TRADING_ACCOUNT_SELECT_COLUMNS}
     FROM trading_accounts ta
     LEFT JOIN brokers b ON b.id = ta.broker_id
     WHERE ${activeWhere} EXISTS (
       SELECT 1
       FROM mt5_sync_logs logs
       WHERE logs.status IN ('success', 'partial_success')
         AND (
           logs.trading_account_id = ta.id
           OR (
             logs.account_id IS NOT NULL
             AND LOWER(TRIM(logs.account_id)) = LOWER(TRIM(ta.account_number))
             AND LOWER(TRIM(COALESCE(logs.broker, COALESCE(b.name, ta.broker)))) =
                 LOWER(TRIM(COALESCE(b.name, ta.broker)))
           )
         )
     )
     ORDER BY ta.is_active DESC, ta.name COLLATE NOCASE ASC`,
  );
  return rows.map(rowToAccount);
}

// ------------------------------------------------------------
// UPDATE
// ------------------------------------------------------------

export async function updateTradingAccountById(
  id: number,
  data: Partial<TradingAccountFormData>,
): Promise<TradingAccount | null> {
  const db = await getDb();
  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.broker !== undefined || data.brokerId !== undefined) {
    const current = await findTradingAccountById(id);
    const fallbackBrokerName = current?.broker ?? data.broker ?? "Broker inconnu";
    const resolved = await resolveBrokerIdentity(
      data.broker ?? fallbackBrokerName,
      data.brokerId ?? current?.brokerId ?? null,
    );
    fields.push(`broker = $${idx++}`);
    params.push(resolved.name);
    fields.push(`broker_id = $${idx++}`);
    params.push(resolved.id);
  }

  if (data.name !== undefined) { fields.push(`name = $${idx++}`); params.push(data.name); }
  if (data.platform !== undefined) { fields.push(`platform = $${idx++}`); params.push(data.platform); }
  if (data.accountNumber !== undefined) { fields.push(`account_number = $${idx++}`); params.push(data.accountNumber); }
  if (data.accountType !== undefined) { fields.push(`account_type = $${idx++}`); params.push(data.accountType); }
  if (data.currency !== undefined) { fields.push(`currency = $${idx++}`); params.push(data.currency ?? null); }
  if (data.isActive !== undefined) { fields.push(`is_active = $${idx++}`); params.push(data.isActive ? 1 : 0); }

  if (fields.length === 0) return findTradingAccountById(id);

  fields.push(`updated_at = datetime('now')`);
  params.push(id);
  await db.execute(
    `UPDATE trading_accounts SET ${fields.join(", ")} WHERE id = $${idx}`,
    params,
  );
  return findTradingAccountById(id);
}

// ------------------------------------------------------------
// DELETE (soft delete via is_active)
// ------------------------------------------------------------

/** Désactive un compte (ne supprime pas les trades associés). */
export async function deactivateTradingAccount(id: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    "UPDATE trading_accounts SET is_active = 0, updated_at = datetime('now') WHERE id = $1",
    [id],
  );
  return result.rowsAffected > 0;
}

/** Suppression physique — n'est possible que si aucun trade n'est lié. */
export async function deleteTradingAccountById(id: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    "DELETE FROM trading_accounts WHERE id = $1",
    [id],
  );
  return result.rowsAffected > 0;
}

/** Compte les trades liés à ce compte (pour avertir avant suppression). */
export async function countTradesForAccount(id: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ total: number }[]>(
    "SELECT COUNT(*) AS total FROM trades WHERE trading_account_id = $1",
    [id],
  );
  return rows[0]?.total ?? 0;
}
