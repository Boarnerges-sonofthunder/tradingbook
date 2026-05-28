// ============================================================
// Utils — Nombres
// ============================================================
// Fonctions utilitaires pour formater les valeurs numériques
// liées au trading : P&L, pourcentages, ratios R:R…
// ============================================================

/**
 * Formate un P&L avec signe et symbole monétaire.
 * Ex : 125.5 → "+$125.50" | -50 → "-$50.00"
 */
export function formatPnL(value: number | null, currency = "USD"): string {
  if (value === null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${formatCurrency(value, currency)}`;
}

/**
 * Formate une valeur monétaire.
 * Ex : 1234.5 → "$1,234.50"
 */
export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Formate un pourcentage avec signe optionnel.
 * Attend une valeur décimale (ex : 0.0512 = 5.12%).
 * Ex : 0.0512 → "+5.12%" | -0.02 → "-2.00%"
 */
export function formatPercent(
  value: number | null,
  showSign = true
): string {
  if (value === null) return "—";
  const sign = showSign && value >= 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(2)}%`;
}

/**
 * Formate un ratio risque/rendement.
 * Ex : 2.5 → "1:2.50" | 0 → "—"
 */
export function formatRR(value: number | null): string {
  if (value === null || value <= 0) return "—";
  return `1:${value.toFixed(2)}`;
}

/**
 * Formate une taille de lot.
 * Ex : 0.01 → "0.01" | 1 → "1.00"
 */
export function formatLot(value: number): string {
  return value.toFixed(2);
}

/**
 * Formate un prix avec 2 décimales par défaut.
 * Ex : 1.10 → "1.10"
 */
export function formatPrice(value: number | null, decimals = 2): string {
  if (value === null) return "—";
  return value.toFixed(decimals);
}

/**
 * Arrondit une valeur à N décimales.
 */
export function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Retourne true si la valeur est un nombre fini valide.
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && isFinite(value);
}
