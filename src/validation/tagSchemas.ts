// ============================================================
// Validation — Tag
// ============================================================
// Correspond à CreateTagInput dans types/journal.ts
// ============================================================

import { z } from "zod";
import { hexColor } from "./common";

export const CreateTagInputSchema = z.object({
  name: z
    .string()
    .min(1, "Le nom du tag est requis")
    .max(50, "Nom de tag trop long (max 50 car.)"),
  // La couleur est optionnelle (valeur par défaut dans le service : "#6366f1")
  color: hexColor.optional(),
});

/**
 * Mise à jour partielle.
 */
export const UpdateTagSchema = CreateTagInputSchema.partial();
