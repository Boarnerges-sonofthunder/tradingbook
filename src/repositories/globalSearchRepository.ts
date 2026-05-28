// ============================================================
// Repository - Recherche globale
// ============================================================
// Couche dediee aux requetes SQLite de recherche.
// React ne doit pas appeler ce module directement : passer par
// services/search/globalSearchService.ts.
// ============================================================

import { getDb } from "../services/database";
import type { GlobalSearchCategory } from "../types";

export interface GlobalSearchRow {
  category: GlobalSearchCategory;
  entityId: number;
  tradeId: number | null;
  title: string;
  subtitle: string | null;
  detail: string | null;
  createdAt: string | null;
}

export interface GlobalSearchRepositoryResult {
  trades: GlobalSearchRow[];
  notes: GlobalSearchRow[];
  tags: GlobalSearchRow[];
  strategies: GlobalSearchRow[];
  mistakes: GlobalSearchRow[];
  emotions: GlobalSearchRow[];
  imports: GlobalSearchRow[];
}

function normalizeTerm(query: string): string {
  return `%${query.trim().toLowerCase()}%`;
}

export async function searchGlobalRows(
  query: string,
  perCategoryLimit = 6,
): Promise<GlobalSearchRepositoryResult> {
  const db = await getDb();
  const term = normalizeTerm(query);
  const params = [term, perCategoryLimit];

  const trades = await db.select<GlobalSearchRow[]>(
    `SELECT
       'trades' AS category,
       t.id AS entityId,
       t.id AS tradeId,
       t.symbol || ' ' || upper(t.side) AS title,
       COALESCE(t.broker, 'Broker non renseigne') || ' - ' || t.platform AS subtitle,
       COALESCE(s.name, 'Sans strategie') || ' - ' || t.status AS detail,
       t.opened_at AS createdAt
     FROM trades t
     LEFT JOIN strategies s ON s.id = t.strategy_id
     WHERE
       lower(t.symbol) LIKE $1 OR
       lower(COALESCE(t.broker, '')) LIKE $1 OR
       lower(t.platform) LIKE $1 OR
       lower(t.source) LIKE $1 OR
       lower(COALESCE(t.account_id, '')) LIKE $1 OR
       lower(COALESCE(t.external_id, '')) LIKE $1 OR
       lower(COALESCE(s.name, '')) LIKE $1
     ORDER BY t.opened_at DESC
     LIMIT $2`,
    params,
  );

  const notes = await db.select<GlobalSearchRow[]>(
    `SELECT
       'notes' AS category,
       n.id AS entityId,
       n.trade_id AS tradeId,
       'Note - ' || t.symbol AS title,
       COALESCE(t.broker, t.platform) AS subtitle,
       n.content AS detail,
       n.updated_at AS createdAt
     FROM trade_notes n
     INNER JOIN trades t ON t.id = n.trade_id
     WHERE lower(n.content) LIKE $1
     ORDER BY n.updated_at DESC
     LIMIT $2`,
    params,
  );

  const tags = await db.select<GlobalSearchRow[]>(
    `SELECT
       'tags' AS category,
       tg.id AS entityId,
       tt.trade_id AS tradeId,
       tg.name AS title,
       CASE
         WHEN t.id IS NULL THEN 'Tag sans trade associe'
         ELSE 'Trade ' || t.symbol
       END AS subtitle,
       tg.color AS detail,
       tg.created_at AS createdAt
     FROM tags tg
     LEFT JOIN trade_tags tt ON tt.tag_id = tg.id
     LEFT JOIN trades t ON t.id = tt.trade_id
     WHERE lower(tg.name) LIKE $1
     ORDER BY tg.name ASC, tt.created_at DESC
     LIMIT $2`,
    params,
  );

  const strategies = await db.select<GlobalSearchRow[]>(
    `SELECT
       'strategies' AS category,
       s.id AS entityId,
       NULL AS tradeId,
       s.name AS title,
       CASE WHEN s.is_active = 1 THEN 'Strategie active' ELSE 'Strategie inactive' END AS subtitle,
       COALESCE(s.description, s.rules) AS detail,
       s.updated_at AS createdAt
     FROM strategies s
     WHERE
       lower(s.name) LIKE $1 OR
       lower(COALESCE(s.description, '')) LIKE $1 OR
       lower(COALESCE(s.rules, '')) LIKE $1
     ORDER BY s.is_active DESC, s.name ASC
     LIMIT $2`,
    params,
  );

  const mistakes = await db.select<GlobalSearchRow[]>(
    `SELECT
       'mistakes' AS category,
       m.id AS entityId,
       tm.trade_id AS tradeId,
       m.name AS title,
       CASE
         WHEN t.id IS NULL THEN 'Erreur catalogue'
         ELSE 'Trade ' || t.symbol
       END AS subtitle,
       COALESCE(tm.notes, m.description) AS detail,
       COALESCE(tm.created_at, m.created_at) AS createdAt
     FROM mistakes m
     LEFT JOIN trade_mistakes tm ON tm.mistake_id = m.id
     LEFT JOIN trades t ON t.id = tm.trade_id
     WHERE
       lower(m.name) LIKE $1 OR
       lower(COALESCE(m.description, '')) LIKE $1 OR
       lower(COALESCE(tm.notes, '')) LIKE $1
     ORDER BY COALESCE(tm.created_at, m.created_at) DESC
     LIMIT $2`,
    params,
  );

  const emotions = await db.select<GlobalSearchRow[]>(
    `SELECT
       'emotions' AS category,
       e.id AS entityId,
       te.trade_id AS tradeId,
       e.name AS title,
       CASE
         WHEN t.id IS NULL THEN 'Emotion catalogue'
         ELSE 'Trade ' || t.symbol || ' - ' || te.phase
       END AS subtitle,
       COALESCE(e.description, 'Intensite ' || te.intensity) AS detail,
       COALESCE(te.created_at, e.created_at) AS createdAt
     FROM emotions e
     LEFT JOIN trade_emotions te ON te.emotion_id = e.id
     LEFT JOIN trades t ON t.id = te.trade_id
     WHERE
       lower(e.name) LIKE $1 OR
       lower(COALESCE(e.description, '')) LIKE $1
     ORDER BY COALESCE(te.created_at, e.created_at) DESC
     LIMIT $2`,
    params,
  );

  const imports = await db.select<GlobalSearchRow[]>(
    `SELECT
       'imports' AS category,
       i.id AS entityId,
       NULL AS tradeId,
       COALESCE(i.filename, upper(i.source) || ' import #' || i.id) AS title,
       i.source || ' - ' || i.status AS subtitle,
       COALESCE(i.broker, i.account_id, i.error_message) AS detail,
       i.created_at AS createdAt
     FROM imports i
     WHERE
       lower(i.source) LIKE $1 OR
       lower(COALESCE(i.filename, '')) LIKE $1 OR
       lower(COALESCE(i.broker, '')) LIKE $1 OR
       lower(COALESCE(i.account_id, '')) LIKE $1 OR
       lower(COALESCE(i.status, '')) LIKE $1 OR
       lower(COALESCE(i.error_message, '')) LIKE $1
     ORDER BY i.created_at DESC
     LIMIT $2`,
    params,
  );

  return {
    trades,
    notes,
    tags,
    strategies,
    mistakes,
    emotions,
    imports,
  };
}
