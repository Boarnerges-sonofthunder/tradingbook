// ============================================================
// Service — Historique d'activité des trades
// ============================================================
// Ce service est la SEULE façade pour écrire/lire l'historique.
// Aucun composant React ne doit accéder à activityRepository
// directement.
//
// Utilisation depuis les autres services (fire-and-forget) :
//
//   import { logActivity } from "../activity/activityService";
//
//   void logActivity({
//     tradeId,
//     action: "tag_added",
//     description: `Tag ajouté : "${name}"`,
//   }).catch(() => {}); // ← jamais bloquant, jamais visible
//
// Règles importantes :
//   - logActivity() est fire-and-forget : une erreur de logging
//     ne doit jamais interrompre l'opération principale.
//   - Toujours appeler avec `.catch(() => {})` ou `void`.
//   - getActivityForTrade() peut être appelé normalement (await).
//   - Ne pas stocker de gros JSON — description courte uniquement.
// ============================================================

import * as repo from "../../repositories/activityRepository";
import type { TradeActivityLog, LogActivityInput } from "../../types";

// ------------------------------------------------------------
// WRITE — enregistrer une action
// ------------------------------------------------------------

/**
 * Enregistre une action dans l'historique du trade.
 *
 * ⚠️  Toujours appeler en fire-and-forget depuis les autres services :
 *   `void logActivity({ ... }).catch(() => {});`
 *
 * Une failure de logging ne doit JAMAIS empêcher l'opération principale.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  await repo.insertActivityLog(input);
}

// ------------------------------------------------------------
// READ — consulter l'historique
// ------------------------------------------------------------

/**
 * Retourne l'historique d'un trade, du plus récent au plus ancien.
 * @param tradeId  Identifiant du trade.
 * @param limit    Nombre maximum d'entrées retournées (défaut : 200).
 */
export async function getActivityForTrade(
  tradeId: number,
  limit = 200
): Promise<TradeActivityLog[]> {
  return repo.findActivityByTradeId(tradeId, limit);
}
