// ============================================================
// Formatage des messages de log — TradingBook
// ============================================================
// Chaque message est préfixé par son contexte (module source)
// et peut inclure des données supplémentaires sérialisées.
//
// Format : [Context] Message | {données}
//
// ⚠️  Règles de sécurité des logs :
//   - Ne JAMAIS logger de mots de passe, clés API ou tokens
//   - Limiter les données personnelles aux identifiants techniques
//   - Les données de trade (P&L, taille) peuvent être loggées
//     car elles restent locales à la machine de l'utilisateur
// ============================================================

/**
 * Sérialise des données additionnelles pour l'affichage en log.
 * Gère les cas spéciaux : Error, objets non-sérialisables…
 */
function serializeData(data: unknown): string {
  if (data instanceof Error) {
    const stack = data.stack?.split("\n")[1]?.trim() ?? "";
    return stack
      ? `${data.name}: ${data.message} (${stack})`
      : `${data.name}: ${data.message}`;
  }
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

/**
 * Formate un message de log avec son contexte et ses données optionnelles.
 *
 * @param context  Nom du module ou service émetteur (ex : "database", "import")
 * @param message  Message descriptif de l'événement
 * @param data     Données optionnelles (objet, erreur, valeur primitive…)
 * @returns        Message formaté prêt à être passé au logger
 *
 * @example
 * formatMessage("database", "Connexion établie")
 * // → "[database] Connexion établie"
 *
 * formatMessage("import", "Fichier ignoré", { filename: "data.csv", reason: "format inconnu" })
 * // → "[import] Fichier ignoré | {"filename":"data.csv","reason":"format inconnu"}"
 */
export function formatMessage(
  context: string,
  message: string,
  data?: unknown,
): string {
  if (data === undefined) {
    return `[${context}] ${message}`;
  }
  return `[${context}] ${message} | ${serializeData(data)}`;
}
