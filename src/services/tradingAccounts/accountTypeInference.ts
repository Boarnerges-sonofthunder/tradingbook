import type { TradingAccountType } from "../../types";

// Déduit type de compte depuis indices broker/serveur/nom compte.
// Règles pragmatiques : demo/live détectés, sinon fallback other.
export function inferTradingAccountTypeFromText(
  ...parts: Array<string | null | undefined>
): TradingAccountType {
  const haystack = parts
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" ")
    .toLowerCase();

  if (!haystack) return "other";

  if (
    /(\bdemo\b|\bpractice\b|\bpaper\b|\btest\b|\btrial\b|\bd\d*\b)/i.test(
      haystack,
    )
  ) {
    return "demo";
  }

  if (/(\blive\b|\breal\b|\bstandard\b|\becn\b|\braw\b)/i.test(haystack)) {
    return "live";
  }

  return "other";
}
