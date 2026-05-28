// ============================================================
// CSV Format Detection Service — TradingBook
// ============================================================
// Détecte automatiquement le format broker d'un fichier CSV
// en comparant ses colonnes aux signatures des profils connus.
//
// Algorithme :
//   1. Normaliser les headers du CSV (via normalizeHeader).
//   2. Pour chaque profil dans BROKER_PROFILES :
//      - Compter le nombre de signatureHeaders présents dans le CSV.
//      - Calculer un score = trouvés / total signature.
//   3. Retenir le profil avec le meilleur score (s'il dépasse 0.30).
//   4. Déterminer le niveau de confiance : high / medium / low / none.
//   5. Construire le mapping recommandé depuis fieldAliases du profil.
//   6. Si aucun profil ne correspond → retourner confidence "none".
//
// Ce service est purement fonctionnel (sans effets de bord).
// Utilisé par ImportsPage pour afficher la bannière de détection
// et initialiser CsvMappingSection avec le bon mapping.
// ============================================================

import { normalizeHeader, buildEmptyFieldMapping, validateMapping } from "./csvMappingService";
import { BROKER_PROFILES } from "./brokerCsvProfiles";
import type { BrokerProfile } from "./brokerCsvProfiles";
import type {
  BrokerDetectionResult,
  DetectionConfidence,
  CsvColumnMapping,
  TradeField,
} from "../../types/csvImport";

// ─── Seuil minimum ─────────────────────────────────────────

/**
 * Score minimum en dessous duquel aucun format n'est retenu.
 * Un score de 0.30 correspond à ~3 colonnes sur 10 trouvées.
 * En dessous, la détection est trop incertaine pour être utile.
 */
const MIN_SCORE_THRESHOLD = 0.30;

// ─── Scoring interne ───────────────────────────────────────

interface ProfileScore {
  profile: BrokerProfile;
  score: number;
  matchedHeaders: string[];
  missingHeaders: string[];
}

/**
 * Calcule le score de correspondance d'un profil avec un ensemble de headers CSV.
 *
 * Score = nombre de signatureHeaders du profil présents dans le CSV
 *         / nombre total de signatureHeaders du profil.
 *
 * @param profile         - Profil broker à tester.
 * @param headerSet       - Ensemble des headers CSV normalisés.
 * @returns               Score entre 0 et 1, avec les headers trouvés/manquants.
 */
function scoreProfile(
  profile: BrokerProfile,
  headerSet: Set<string>,
): ProfileScore {
  const matchedHeaders: string[] = [];
  const missingHeaders: string[] = [];

  for (const sig of profile.signatureHeaders) {
    if (headerSet.has(sig)) {
      matchedHeaders.push(sig);
    } else {
      missingHeaders.push(sig);
    }
  }

  const score =
    profile.signatureHeaders.length > 0
      ? matchedHeaders.length / profile.signatureHeaders.length
      : 0;

  return { profile, score, matchedHeaders, missingHeaders };
}

// ─── Construction du mapping recommandé ────────────────────

/**
 * Construit un CsvColumnMapping à partir du fieldAliases d'un profil.
 *
 * Seuls les champs dont la colonne normalisée existe dans le CSV sont mappés.
 * Les autres restent à null (non mappés).
 *
 * @param profile           - Profil broker retenu.
 * @param headers           - Headers CSV originaux (non normalisés).
 * @param normalizedHeaders - Headers CSV normalisés (même ordre que headers).
 * @returns                 - Mapping complet avec validation.
 */
function buildMappingFromProfile(
  profile: BrokerProfile,
  headers: string[],
  normalizedHeaders: string[],
): CsvColumnMapping {
  // Table : header normalisé → header original (tel qu'il apparaît dans le CSV)
  const normToOrig: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    // Si plusieurs colonnes ont le même nom normalisé, la première gagne
    if (normToOrig[normalizedHeaders[i]] === undefined) {
      normToOrig[normalizedHeaders[i]] = headers[i];
    }
  }

  const fieldToColumn = buildEmptyFieldMapping();

  // Appliquer les aliases du profil : pour chaque alias du profil,
  // si la colonne normalisée est présente dans le CSV, mapper le champ.
  for (const [normHeader, field] of Object.entries(profile.fieldAliases)) {
    const originalHeader = normToOrig[normHeader];
    if (originalHeader !== undefined) {
      fieldToColumn[field as TradeField] = originalHeader;
    }
  }

  const { isValid, missingRequired } = validateMapping(fieldToColumn);
  return { fieldToColumn, isValid, missingRequired };
}

// ─── Détection principale ──────────────────────────────────

/**
 * Détecte automatiquement le format broker d'un fichier CSV.
 *
 * Processus :
 *   1. Normaliser tous les headers.
 *   2. Scorer chaque profil dans BROKER_PROFILES.
 *   3. Retenir le profil avec le meilleur score si ≥ MIN_SCORE_THRESHOLD.
 *   4. Déterminer la confiance (high / medium / low) selon les seuils du profil.
 *   5. Construire le mapping recommandé depuis les fieldAliases du profil.
 *
 * Si aucun profil ne correspond (confidence "none"), le mapping recommandé
 * est null — dans ce cas, ImportsPage utilisera autoDetectMapping() générique.
 *
 * @param headers - Headers CSV tels qu'extraits par csvParserService (non normalisés).
 * @returns       - Résultat de la détection avec mapping et niveau de confiance.
 */
export function detectBrokerFormat(headers: string[]): BrokerDetectionResult {
  if (headers.length === 0) {
    return {
      format: null,
      formatName: null,
      confidence: "none",
      score: 0,
      recommendedMapping: null,
      matchedFields: [],
      missingFields: [],
    };
  }

  // Normaliser les headers une seule fois
  const normalizedHeaders = headers.map(normalizeHeader);
  const headerSet = new Set(normalizedHeaders);

  // Scorer tous les profils et trouver le meilleur
  let best: ProfileScore | null = null;

  for (const profile of BROKER_PROFILES) {
    const result = scoreProfile(profile, headerSet);

    // On ne considère que les profils dépassant le seuil minimum
    if (result.score < MIN_SCORE_THRESHOLD) continue;

    // Le premier profil avec un score strictement supérieur gagne
    // (BROKER_PROFILES est ordonné du plus spécifique au plus générique)
    if (best === null || result.score > best.score) {
      best = result;
    }
  }

  // Aucun profil ne correspond suffisamment
  if (best === null) {
    return {
      format: null,
      formatName: null,
      confidence: "none",
      score: 0,
      recommendedMapping: null,
      matchedFields: [],
      missingFields: [],
    };
  }

  // Déterminer le niveau de confiance selon les seuils du profil gagnant
  const confidence: DetectionConfidence =
    best.score >= best.profile.minScoreHigh
      ? "high"
      : best.score >= best.profile.minScoreMedium
        ? "medium"
        : "low";

  // Construire le mapping recommandé depuis les fieldAliases du profil
  const recommendedMapping = buildMappingFromProfile(
    best.profile,
    headers,
    normalizedHeaders,
  );

  return {
    format: best.profile.id,
    formatName: best.profile.name,
    confidence,
    score: best.score,
    recommendedMapping,
    matchedFields: best.matchedHeaders,
    missingFields: best.missingHeaders,
  };
}
