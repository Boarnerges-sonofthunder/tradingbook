// ============================================================
// CSV Parser Service — TradingBook
// ============================================================
// Fonctionnalités :
//   - Détection automatique du séparateur (, ou ;)
//   - Parsing RFC 4180 : champs entre guillemets, guillemets échappés
//   - Gestion des BOM UTF-8, CRLF et lignes vides
//   - Extraction des headers depuis la première ligne
//   - Construction des rows comme Record<header, value>
//   - Retour typé : succès avec résultat ou échec avec type d'erreur
//
// Ce service est purement fonctionnel (pas d'effets de bord).
// ============================================================

// ─── Types publics ─────────────────────────────────────────

export type CsvSeparator = "," | ";";

/** Résultat d'un parsing CSV réussi. */
export interface CsvParseResult {
  /** Noms de colonnes extraits de la première ligne. */
  headers: string[];
  /** Lignes de données (hors header). Chaque ligne est un Record<header, valeur>. */
  rows: Record<string, string>[];
  /** Nombre total de lignes de données valides (hors header et lignes ignorées). */
  totalRows: number;
  /** Séparateur détecté automatiquement. */
  separator: CsvSeparator;
  /** Avertissements non bloquants (ex : lignes avec nb de colonnes incorrect). */
  warnings: string[];
}

/** Erreur structurée retournée lorsque le parsing ne peut pas aboutir. */
export type CsvParseError =
  | { type: "empty_file"; message: string }
  | { type: "no_headers"; message: string }
  | { type: "parse_error"; message: string };

/** Résultat discriminé : succès ou échec. */
export type CsvParseOutcome =
  | { ok: true; result: CsvParseResult }
  | { ok: false; error: CsvParseError };

// ─── Détection du séparateur ───────────────────────────────

/**
 * Détecte le séparateur utilisé dans le CSV.
 * Compare le nombre de `,` et de `;` dans la première ligne non vide.
 * Le séparateur avec le plus d'occurrences est retenu.
 * En cas d'égalité, `,` est choisi par défaut.
 */
function detectSeparator(firstLine: string): CsvSeparator {
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

// ─── Parser de champs RFC 4180 ─────────────────────────────

/**
 * Parse une ligne CSV en tableau de champs, conformément à RFC 4180.
 *
 * Règles gérées :
 *   - Champ entouré de guillemets doubles : `"valeur"`
 *   - Guillemet double échappé : `""` → `"`
 *   - Séparateur à l'intérieur des guillemets : ignoré
 *   - Whitespace hors guillemets : trimé
 *
 * @param line  La ligne CSV brute (sans `\r` ni `\n` final)
 * @param sep   Le séparateur à utiliser
 * @returns     Tableau des valeurs de champ nettoyées
 */
function parseFields(line: string, sep: CsvSeparator): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Double guillemet dans un champ guillemets → guillemet échappé
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          // Fin du champ entre guillemets
          inQuotes = false;
          i++;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === sep) {
        fields.push(current.trim());
        current = "";
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }

  // Dernier champ (pas de séparateur final)
  fields.push(current.trim());

  return fields;
}

// ─── Parser principal ──────────────────────────────────────

/**
 * Parse un texte CSV complet décodé en UTF-8.
 *
 * Étapes :
 *   1. Normalise les fins de ligne (CRLF → LF, CR → LF)
 *   2. Supprime le BOM UTF-8 (`\uFEFF`) si présent
 *   3. Filtre les lignes vides
 *   4. Détecte le séparateur sur la première ligne
 *   5. Extrait les headers depuis la première ligne
 *   6. Parse chaque ligne de données
 *   7. Ajoute un avertissement pour les lignes avec mauvais nombre de colonnes
 *
 * @param text  Contenu du fichier CSV en string UTF-8
 * @returns     CsvParseOutcome — succès ou erreur typée
 */
export function parseCSVText(text: string): CsvParseOutcome {
  // 1. Normaliser les fins de ligne
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 2. Supprimer le BOM UTF-8
  const cleaned = normalized.startsWith("\uFEFF")
    ? normalized.slice(1)
    : normalized;

  // 3. Filtrer les lignes vides
  const lines = cleaned.split("\n").filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return {
      ok: false,
      error: { type: "empty_file", message: "Le fichier CSV est vide." },
    };
  }

  // 4. Détecter le séparateur
  const separator = detectSeparator(lines[0]);

  // 5. Extraire les headers
  const headers = parseFields(lines[0], separator);

  if (headers.length === 0 || headers.every((h) => h === "")) {
    return {
      ok: false,
      error: {
        type: "no_headers",
        message:
          "Impossible de détecter les colonnes (première ligne vide ou invalide).",
      },
    };
  }

  // 6. Parser les lignes de données
  const rows: Record<string, string>[] = [];
  const warnings: string[] = [];
  const MAX_WARNINGS = 10;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseFields(lines[i], separator);

    if (fields.length !== headers.length) {
      if (warnings.length < MAX_WARNINGS) {
        warnings.push(
          `Ligne ${i + 1} : ${fields.length} colonne(s) détectée(s), ` +
            `${headers.length} attendue(s) — ligne ignorée.`
        );
      }
      continue;
    }

    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = fields[idx] ?? "";
    });
    rows.push(row);
  }

  return {
    ok: true,
    result: {
      headers,
      rows,
      totalRows: rows.length,
      separator,
      warnings,
    },
  };
}
