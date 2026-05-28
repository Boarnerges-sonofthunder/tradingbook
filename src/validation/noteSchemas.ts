// ============================================================
// Validation — Notes de trade
// ============================================================
// Table `trade_notes` : le seul champ saisi est le contenu.
// ============================================================

import { z } from "zod";

/**
 * Contenu d'une note (création et mise à jour partagent la même règle).
 * Max 10 000 caractères — suffisant pour un journal de trade détaillé.
 */
export const NoteContentSchema = z
  .string()
  .min(1, "La note ne peut pas être vide")
  .max(10_000, "Note trop longue (max 10 000 car.)");
