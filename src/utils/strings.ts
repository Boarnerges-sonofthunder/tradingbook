// ============================================================
// Utils — Chaînes de caractères
// ============================================================

/**
 * Met en majuscule la première lettre d'une chaîne.
 * Ex : "eurusd" → "Eurusd"
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Tronque une chaîne avec ellipse si elle dépasse maxLength.
 * Ex : "Hello World", 8 → "Hello W…"
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 1)}…`;
}

/**
 * Normalise un symbole d'instrument de trading.
 * Supprime les espaces et met en majuscules.
 * Ex : " eurusd " → "EURUSD"
 */
export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/**
 * Génère un nom de fichier de backup horodaté.
 * Ex : "backup_2024-01-15T14-30-00.db"
 */
export function generateBackupFilename(): string {
  const ts = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
  return `backup_${ts}.db`;
}

/**
 * Retourne une chaîne vide si la valeur est null/undefined.
 * Utile pour les champs de formulaire.
 */
export function nullToEmpty(value: string | null | undefined): string {
  return value ?? "";
}

/**
 * Retourne null si la chaîne est vide après trim, sinon retourne la chaîne.
 * Utile pour normaliser les valeurs des champs optionnels avant sauvegarde.
 */
export function emptyToNull(value: string | null | undefined): string | null {
  if (!value || value.trim() === "") return null;
  return value.trim();
}
