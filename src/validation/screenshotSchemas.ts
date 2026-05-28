// ============================================================
// Validation - Screenshots
// ============================================================
// SQLite stocke uniquement les metadonnees. Les fichiers physiques
// sont geres par services/screenshots/screenshotStorageService.ts.
// ============================================================

import { z } from "zod";
import { positiveId } from "./common";

const RelativeScreenshotPathSchema = z
  .string()
  .min(1, "Le chemin relatif est requis")
  .max(500, "Chemin relatif trop long")
  .refine(
    (value) =>
      !/^[a-zA-Z]:|^[/\\]/.test(value) &&
      !value.split(/[\\/]/).includes(".."),
    "Chemin relatif invalide",
  );

export const CreateScreenshotInputSchema = z.object({
  tradeId: positiveId,
  filename: z
    .string()
    .min(1, "Le nom de fichier est requis")
    .max(255, "Nom de fichier trop long")
    .refine(
      (value) => !/[<>:"/\\|?*\x00-\x1f]/.test(value),
      "Nom de fichier invalide",
    ),
  filePath: RelativeScreenshotPathSchema.nullable().optional(),
  fileName: z.string().max(255, "Nom de fichier trop long").nullable().optional(),
  mimeType: z.string().max(100, "Type MIME trop long").nullable().optional(),
  fileSize: z.number().int().nonnegative().nullable().optional(),
  timeframe: z.string().max(20, "Timeframe trop long").nullable().optional(),
  label: z.string().max(100, "Label trop long").nullable().optional(),
  notes: z.string().max(1000, "Notes trop longues").nullable().optional(),
});

export const UpdateScreenshotSchema = CreateScreenshotInputSchema.pick({
  timeframe: true,
  label: true,
  notes: true,
}).partial();
