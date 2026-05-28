// ============================================================
// Validation — Import
// ============================================================
// Correspond à CreateImportInput dans types/import.ts
// ============================================================

import { z } from "zod";

export const ImportSourceSchema = z.enum(["mt5", "csv", "manual"], {
  error: "La source doit être 'mt5', 'csv' ou 'manual'",
});

export const CreateImportInputSchema = z.object({
  source: ImportSourceSchema,
  filename: z.string().max(255, "Nom de fichier trop long (max 255 car.)").nullable().optional(),
  broker: z.string().max(100, "Nom de broker trop long (max 100 car.)").nullable().optional(),
  brokerId: z.number().int().positive().nullable().optional(),
  accountId: z.string().max(100, "Identifiant de compte trop long").nullable().optional(),
  tradingAccountId: z.number().int().positive().nullable().optional(),
});
