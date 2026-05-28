// ============================================================
// Validation — Utilitaire commun
// ============================================================
// Fournit :
//   - ValidationError : classe d'erreur typée pour la validation
//   - validate()      : exécute un schéma Zod et lance une ValidationError lisible
//   - isoDateString   : validateur partagé pour les dates ISO 8601
//   - hexColor        : validateur partagé pour les couleurs hexadécimales
// ============================================================

import { z } from "zod";

// ------------------------------------------------------------
// Classe d'erreur dédiée
// ------------------------------------------------------------

/**
 * Erreur levée lorsque la validation Zod échoue.
 * Permet aux appelants de distinguer les erreurs de validation
 * des erreurs de base de données ou réseau.
 */
export class ValidationError extends Error {
  /** Liste des problèmes individuels (chemin + message). */
  readonly issues: string[];

  constructor(issues: string[]) {
    const message = `Données invalides — ${issues.join("; ")}`;
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

// ------------------------------------------------------------
// Helper validate()
// ------------------------------------------------------------

/**
 * Parse `data` avec `schema`. Si la validation réussit, retourne
 * les données parsées (après coercions éventuelles). Sinon lance
 * une `ValidationError` avec des messages lisibles.
 *
 * Usage dans un service :
 * ```typescript
 * const safe = validate(CreateTradeInputSchema, input);
 * ```
 */
export function validate<T>(
  schema: z.ZodType<T>,
  data: unknown
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    });
    throw new ValidationError(issues);
  }
  return result.data;
}

// ------------------------------------------------------------
// Validateurs atomiques réutilisables
// ------------------------------------------------------------

/**
 * Chaîne ISO 8601 valide (ex : "2024-01-15T14:30:00.000Z").
 * Utilisé pour les colonnes `opened_at`, `closed_at`, `created_at`, etc.
 */
export const isoDateString = z
  .string()
  .refine((val) => !isNaN(Date.parse(val)), {
    message: "Format de date invalide (ISO 8601 attendu, ex : 2024-01-15T14:30:00Z)",
  });

/**
 * Couleur hexadécimale à 6 chiffres (ex : "#6366f1").
 */
export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Couleur hexadécimale invalide (ex : #6366f1)");

/**
 * Entier positif (ID de base de données).
 */
export const positiveId = z.number().int().positive("L'identifiant doit être un entier positif");
