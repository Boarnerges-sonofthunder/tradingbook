// ============================================================
// Validation — Strategy
// ============================================================
// Correspond à StrategyFormData dans types/strategy.ts
// ============================================================

import { z } from "zod";

export const StrategyFormDataSchema = z.object({
  name: z
    .string()
    .min(1, "Le nom de la stratégie est requis")
    .max(100, "Nom trop long (max 100 car.)"),
  description: z
    .string()
    .max(500, "Description trop longue (max 500 car.)")
    .nullable()
    .optional(),
  rules: z
    .string()
    .max(5000, "Règles trop longues (max 5000 car.)")
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
});

/**
 * Mise à jour partielle — tous les champs sont optionnels.
 */
export const UpdateStrategySchema = StrategyFormDataSchema.partial();
