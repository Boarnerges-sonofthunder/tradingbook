// ============================================================
// CsvMappingSection — Configuration du mapping colonnes CSV
// ============================================================
// Permet à l'utilisateur d'associer les colonnes de son CSV
// aux champs internes de TradingBook.
//
// Fonctionnalités :
//   - Pré-remplissage automatique via autoDetectMapping()
//   - Modification manuelle via des <select> par champ
//   - Aperçu des 3 premières valeurs par colonne sélectionnée
//   - Validation en temps réel des champs obligatoires
//   - Groupe "champs optionnels" rétractable
//
// Props :
//   headers     — En-têtes CSV extraits du parser
//   previewRows — Premières lignes du CSV (pour l'aperçu)
//   onChange    — Appelé à chaque modification (y compris init)
//
// Ne crée aucune donnée. Composant purement interactif.
// ============================================================

import { useState, useEffect } from "react";
import { Check, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import {
  autoDetectMapping,
  validateMapping,
  TRADE_FIELDS_META,
} from "../../../services/imports/csvMappingService";
import type {
  TradeField,
  TradeFieldMeta,
  CsvColumnMapping,
  BrokerDetectionResult,
} from "../../../types/csvImport";

// ─── Groupes de champs ─────────────────────────────────────

/** Champs obligatoires pour tout trade — groupe 1. */
const REQUIRED_FIELDS: TradeField[] = [
  "symbol",
  "side",
  "opened_at",
  "entry_price",
  "volume",
];

/** Champs recommandés pour les trades fermés — groupe 2. */
const CLOSED_FIELDS: TradeField[] = ["closed_at", "exit_price", "net_pnl"];

/** Champs optionnels restants — groupe 3 (rétractable). */
const OPTIONAL_FIELDS: TradeField[] = [
  "external_id",
  "status",
  "stop_loss",
  "take_profit",
  "commission",
  "swap",
  "fees",
  "gross_pnl",
  "currency",
];

/** Nombre maximum de valeurs affichées en aperçu par colonne. */
const MAX_PREVIEW_VALUES = 3;

// ─── Props ─────────────────────────────────────────────────

interface CsvMappingSectionProps {
  /** En-têtes CSV extraits du fichier (première ligne). */
  headers: string[];
  /**
   * Premières lignes du CSV pour l'aperçu des valeurs.
   * Seules les MAX_PREVIEW_VALUES premières sont utilisées.
   */
  previewRows: Record<string, string>[];
  /**
   * Appelé à chaque modification du mapping, y compris l'initialisation.
   * Le parent peut stocker ce résultat pour l'étape d'import.
   */
  onChange: (mapping: CsvColumnMapping) => void;
  /**
   * Résultat de la détection automatique du format broker.
   * Si la confiance est "high" ou "medium", le mapping recommandé du profil
   * est utilisé comme état initial au lieu de l'auto-détection générique.
   * Optionnel : si absent ou null, l'auto-détection générique s'applique.
   */
  detectionResult?: BrokerDetectionResult | null;
}

// ─── Helpers ───────────────────────────────────────────────

/**
 * Retourne les N premières valeurs non vides d'une colonne CSV.
 * Utilisé pour l'aperçu sous chaque select.
 */
function getColumnPreview(
  column: string,
  rows: Record<string, string>[],
  limit: number,
): string[] {
  const values: string[] = [];
  for (const row of rows) {
    if (values.length >= limit) break;
    const val = row[column]?.trim();
    if (val) values.push(val);
  }
  return values;
}

/** Récupère les métas d'un champ par sa clé. */
function getFieldMeta(key: TradeField): TradeFieldMeta {
  return TRADE_FIELDS_META.find((f) => f.key === key)!;
}

// ─── Sous-composant : ligne de mapping ─────────────────────

interface MappingRowProps {
  meta: TradeFieldMeta;
  headers: string[];
  previewRows: Record<string, string>[];
  selectedColumn: string | null;
  onSelect: (column: string | null) => void;
}

function MappingRow({
  meta,
  headers,
  previewRows,
  selectedColumn,
  onSelect,
}: MappingRowProps) {
  const isMapped = selectedColumn !== null;
  const preview = selectedColumn
    ? getColumnPreview(selectedColumn, previewRows, MAX_PREVIEW_VALUES)
    : [];

  const rowClass = [
    "csv-mapping__row",
    meta.required ? "csv-mapping__row--required" : "",
    isMapped ? "csv-mapping__row--mapped" : "",
    meta.required && !isMapped ? "csv-mapping__row--missing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rowClass}>
      {/* ── Colonne gauche : label + clé + description ─── */}
      <div className="csv-mapping__label-col">
        <span className="csv-mapping__field-label">
          {meta.label}
          {meta.required && (
            <span
              className="csv-mapping__required-star"
              title="Champ obligatoire"
              aria-label="obligatoire"
            >
              *
            </span>
          )}
          {meta.closedRequired && !meta.required && (
            <span
              className="csv-mapping__closed-star"
              title="Recommandé pour les trades fermés"
            >
              †
            </span>
          )}
        </span>
        <code className="csv-mapping__field-key">{meta.key}</code>
        <span className="csv-mapping__field-desc">{meta.description}</span>
      </div>

      {/* ── Colonne centrale : select + aperçu des valeurs ── */}
      <div className="csv-mapping__select-col">
        <select
          className={`csv-mapping__select${isMapped ? " csv-mapping__select--mapped" : ""}`}
          value={selectedColumn ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            onSelect(val === "" ? null : val);
          }}
          aria-label={`Colonne CSV pour le champ ${meta.label}`}
        >
          <option value="">— Non mappé —</option>
          {headers.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>

        {/* Aperçu des premières valeurs de la colonne sélectionnée */}
        {preview.length > 0 && (
          <div
            className="csv-mapping__preview"
            aria-label="Exemples de valeurs"
          >
            {preview.map((v, i) => (
              <span key={i} className="csv-mapping__preview-val">
                {v}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Colonne droite : icône de statut ──────────────── */}
      <div className="csv-mapping__status-col" aria-hidden>
        {isMapped ? (
          <Check size={14} className="csv-mapping__icon-ok" />
        ) : meta.required ? (
          <AlertTriangle size={14} className="csv-mapping__icon-warn" />
        ) : (
          <span className="csv-mapping__icon-empty" />
        )}
      </div>
    </div>
  );
}

// ─── Composant principal ─────────────────────────────────

export default function CsvMappingSection({
  headers,
  previewRows,
  onChange,
  detectionResult,
}: CsvMappingSectionProps) {
  // État interne : chaque champ → colonne CSV sélectionnée.
  //
  // Priorité d'initialisation :
  //   1. Mapping recommandé du profil broker (si confiance high ou medium)
  //   2. Auto-détection générique (ALIAS_MAP) en fallback
  //
  // Le composant est toujours re-monté (key) quand le fichier change,
  // donc ce lazy initializer s'exécute à chaque nouveau fichier.
  const [fieldToColumn, setFieldToColumn] = useState<
    Record<TradeField, string | null>
  >(() => {
    const useProfileMapping =
      detectionResult !== null &&
      detectionResult !== undefined &&
      (detectionResult.confidence === "high" ||
        detectionResult.confidence === "medium") &&
      detectionResult.recommendedMapping !== null;

    if (useProfileMapping) {
      // Mapping spécifique au broker — plus précis que l'ALIAS_MAP générique
      return detectionResult!.recommendedMapping!.fieldToColumn;
    }

    // Fallback : auto-détection générique via ALIAS_MAP
    return autoDetectMapping(headers).fieldToColumn;
  });

  // Les champs optionnels (groupe 3) sont rétractés par défaut
  const [showOptional, setShowOptional] = useState(false);

  // Notifier le parent du mapping initial dès le premier rendu
  useEffect(() => {
    const { isValid, missingRequired } = validateMapping(fieldToColumn);
    onChange({ fieldToColumn, isValid, missingRequired });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Gestionnaire de changement d'un champ ───────────────

  function handleFieldSelect(field: TradeField, column: string | null) {
    const updated = { ...fieldToColumn, [field]: column };
    setFieldToColumn(updated);
    const { isValid, missingRequired } = validateMapping(updated);
    onChange({ fieldToColumn: updated, isValid, missingRequired });
  }

  // ── État de validation actuel ────────────────────────────

  const { isValid, missingRequired } = validateMapping(fieldToColumn);
  const mappedCount = Object.values(fieldToColumn).filter(Boolean).length;

  // ── Métas des 3 groupes ──────────────────────────────────

  const requiredMetas = REQUIRED_FIELDS.map(getFieldMeta);
  const closedMetas = CLOSED_FIELDS.map(getFieldMeta);
  const optionalMetas = OPTIONAL_FIELDS.map(getFieldMeta);

  // ── Rendu ────────────────────────────────────────────────

  return (
    <div className="csv-mapping">
      {/* ── Groupe 1 : Champs obligatoires ──────────────── */}
      <div className="csv-mapping__group">
        <div className="csv-mapping__group-header">
          <span className="csv-mapping__group-title">Champs obligatoires</span>
          <span className="csv-mapping__group-hint">
            Requis pour tout type de trade
            <span
              className="csv-mapping__required-star"
              title="Champ obligatoire"
              aria-hidden
            >
              *
            </span>
          </span>
        </div>
        <div className="csv-mapping__rows">
          {requiredMetas.map((meta) => (
            <MappingRow
              key={meta.key}
              meta={meta}
              headers={headers}
              previewRows={previewRows}
              selectedColumn={fieldToColumn[meta.key]}
              onSelect={(col) => handleFieldSelect(meta.key, col)}
            />
          ))}
        </div>
      </div>

      {/* ── Groupe 2 : Champs pour trades fermés ────────── */}
      <div className="csv-mapping__group">
        <div className="csv-mapping__group-header">
          <span className="csv-mapping__group-title">Trades fermés</span>
          <span className="csv-mapping__group-hint">
            Recommandés pour importer le résultat du trade
            <span
              className="csv-mapping__dagger"
              title="Recommandé pour trades fermés"
              aria-hidden
            >
              †
            </span>
          </span>
        </div>
        <div className="csv-mapping__rows">
          {closedMetas.map((meta) => (
            <MappingRow
              key={meta.key}
              meta={meta}
              headers={headers}
              previewRows={previewRows}
              selectedColumn={fieldToColumn[meta.key]}
              onSelect={(col) => handleFieldSelect(meta.key, col)}
            />
          ))}
        </div>
      </div>

      {/* ── Groupe 3 : Champs optionnels (rétractable) ──── */}
      <div className="csv-mapping__group csv-mapping__group--collapsible">
        <button
          className="csv-mapping__toggle"
          onClick={() => setShowOptional((v) => !v)}
          aria-expanded={showOptional}
          type="button"
        >
          {showOptional ? (
            <ChevronUp size={13} aria-hidden />
          ) : (
            <ChevronDown size={13} aria-hidden />
          )}
          Champs optionnels
          <span className="csv-mapping__toggle-count">
            ({optionalMetas.length} champs)
          </span>
        </button>

        {showOptional && (
          <div className="csv-mapping__rows csv-mapping__rows--optional">
            {optionalMetas.map((meta) => (
              <MappingRow
                key={meta.key}
                meta={meta}
                headers={headers}
                previewRows={previewRows}
                selectedColumn={fieldToColumn[meta.key]}
                onSelect={(col) => handleFieldSelect(meta.key, col)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Bannière de validation ──────────────────────── */}
      <div
        className={`csv-mapping__validation ${
          isValid
            ? "csv-mapping__validation--ok"
            : "csv-mapping__validation--error"
        }`}
        role={isValid ? undefined : "alert"}
      >
        {isValid ? (
          <>
            <Check size={14} aria-hidden />
            <span>
              Mapping valide — <strong>{mappedCount}</strong>{" "}
              {mappedCount === 1 ? "champ mappé" : "champs mappés"}
            </span>
          </>
        ) : (
          <>
            <AlertTriangle size={14} aria-hidden />
            <span>
              Champs obligatoires non mappés :{" "}
              <strong>
                {missingRequired.map((f) => getFieldMeta(f).label).join(", ")}
              </strong>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
