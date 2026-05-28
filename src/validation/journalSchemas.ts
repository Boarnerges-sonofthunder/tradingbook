// ============================================================
// Validation — Emotions & Mistakes
// ============================================================
// Correspond aux types dans types/journal.ts :
//   - CreateEmotionInput / AddEmotionToTradeInput
//   - CreateMistakeInput / AddMistakeToTradeInput
// ============================================================

import { z } from "zod";
import { positiveId } from "./common";

// ------------------------------------------------------------
// Emotions
// ------------------------------------------------------------

export const CreateEmotionInputSchema = z.object({
  name: z
    .string()
    .min(1, "Le nom de l'émotion est requis")
    .max(50, "Nom trop long (max 50 car.)"),
  description: z.string().max(200, "Description trop longue (max 200 car.)").nullable().optional(),
});

export const UpdateEmotionSchema = CreateEmotionInputSchema.partial();

/** Phase du trade à laquelle l'émotion a été ressentie. */
export const EmotionPhaseSchema = z.enum(["before", "during", "after"], {
  error: "La phase doit être 'before', 'during' ou 'after'",
});

export const AddEmotionToTradeInputSchema = z.object({
  tradeId: positiveId,
  emotionId: positiveId,
  /** Intensité de 1 (faible) à 5 (très forte). */
  intensity: z
    .number()
    .int("L'intensité doit être un entier")
    .min(1, "Intensité minimale : 1")
    .max(5, "Intensité maximale : 5")
    .optional(),
  phase: EmotionPhaseSchema.optional(),
});

// ------------------------------------------------------------
// Mistakes
// ------------------------------------------------------------

export const CreateMistakeInputSchema = z.object({
  name: z
    .string()
    .min(1, "Le nom de l'erreur est requis")
    .max(100, "Nom trop long (max 100 car.)"),
  description: z.string().max(500, "Description trop longue (max 500 car.)").nullable().optional(),
});

export const UpdateMistakeSchema = CreateMistakeInputSchema.partial();

export const AddMistakeToTradeInputSchema = z.object({
  tradeId: positiveId,
  mistakeId: positiveId,
  notes: z.string().max(500, "Notes trop longues (max 500 car.)").nullable().optional(),
});
