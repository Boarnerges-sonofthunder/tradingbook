// ============================================================
// Validation — Backup
// ============================================================
// Correspond à CreateBackupInput dans types/backup.ts
// ============================================================

import { z } from "zod";

export const BackupTriggerSchema = z.enum(["manual", "auto", "pre_import", "pre_migration"], {
  error: "Le déclencheur doit être 'manual', 'auto', 'pre_import' ou 'pre_migration'",
});

export const CreateBackupInputSchema = z.object({
  filename: z
    .string()
    .min(1, "Le nom de fichier est requis")
    .max(255, "Nom de fichier trop long (max 255 car.)")
    // Le nom ne doit pas contenir de séparateurs de chemin
    .refine(
      (v) => !v.includes("/") && !v.includes("\\"),
      "Le filename ne doit pas contenir de chemin (utiliser le nom seul)"
    ),
  sizeBytes: z.number().int().min(0, "La taille ne peut pas être négative").nullable().optional(),
  trigger: BackupTriggerSchema.optional(),
});
