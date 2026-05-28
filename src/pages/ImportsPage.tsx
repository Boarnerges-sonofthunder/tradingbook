// ============================================================
// ImportsPage — Importation de trades depuis un fichier CSV
// ============================================================
// Phase 5 Étape 9 : déduplication des trades importés.
//
// Structure de la page :
//   - En-tête (titre + sous-titre)
//   - CsvUploadSection       : sélection + validation + copie + parsing
//   - CsvPreviewTable        : tableau de prévisualisation des données CSV
//   - BrokerDetectionBanner  : bannière de détection du format broker
//   - CsvMappingSection      : association colonnes CSV → champs trades
//   - CsvValidationSummary   : synthèse valides/invalides/avertissements
//   - CsvValidationTable     : tableau détaillé ligne par ligne
//   - CsvImportErrorsPanel   : rapport consolidé des erreurs / avertissements
//   - CsvImportPreview       : prévisualisation finale + bouton de confirmation
//   - ImportHistoryList      : historique SQLite avec détails dépliables
//
// Ce qui est fait ici :
//   ✓ Sélection, validation et copie du CSV
//   ✓ Création d'une session SQLite (status "analyzed")
//   ✓ Parsing et prévisualisation des données CSV
//   ✓ Détection automatique du format broker (MT5 / MT4 / Fusion Markets)
//   ✓ Mapping colonnes CSV → champs internes TradingBook
//   ✓ Validation de chaque ligne (valide / avertissement / invalide)
//   ✓ Prévisualisation des trades avec leurs valeurs parsées
//   ✓ Affichage des lignes invalides exclues de l'import
//   ✓ Rapport consolidé des erreurs / avertissements
//   ✓ Logging des issues dans le fichier de log local
//   ✓ Mise à jour SQLite après analyse (status, compteurs, broker)
//   ✓ Historique des imports (ImportHistoryList + ImportDetailsPanel)
//   ✓ Déduplication des trades (DuplicateTradesPanel)
//
// Ce qui N'est PAS encore fait :
//   ✗ Import définitif des trades dans SQLite

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Upload,
  History,
  Table2,
  AlertCircle,
  ArrowLeftRight,
  Cpu,
  HelpCircle,
  ShieldCheck,
  Eye,
  Copy,
} from "lucide-react";
import CsvUploadSection from "../features/imports/components/CsvUploadSection";
import CsvPreviewTable from "../features/imports/components/CsvPreviewTable";
import CsvMappingSection from "../features/imports/components/CsvMappingSection";
import CsvValidationSummaryPanel from "../features/imports/components/CsvValidationSummary";
import CsvValidationTable from "../features/imports/components/CsvValidationTable";
import CsvImportPreview from "../features/imports/components/CsvImportPreview";
import CsvImportErrorsPanel from "../features/imports/components/CsvImportErrorsPanel";
import ImportHistoryList from "../features/imports/components/ImportHistoryList";
import DuplicateTradesPanel from "../features/imports/components/DuplicateTradesPanel";
import { checkDuplicates } from "../services/imports/tradeDeduplicationService";
import {
  getImportSessions,
  deleteImportSession,
} from "../services/imports/importsService";
import { getTradingAccounts } from "../services/tradingAccounts/tradingAccountsService";
import { importCsvMarketData } from "../services/imports/csvMarketDataImportService";
import { detectBrokerFormat } from "../services/imports/csvFormatDetectionService";
import { validateRows } from "../services/imports/csvValidationService";
import {
  buildParseWarnings,
  buildDetectionIssue,
  buildMappingIssues,
  buildValidationIssues,
  buildImportReport,
  logImportReport,
} from "../services/imports/csvImportErrorService";
import { analyzeImportSession, updateImportSession } from "../services/imports";
import type { CsvParseOutcome } from "../services/imports/csvParserService";
import type {
  CsvColumnMapping,
  BrokerDetectionResult,
  CsvValidationResult,
  CsvImportIssue,
  CsvImportReport,
  CsvDeduplicationReport,
} from "../types/csvImport";
import { useNotification } from "../hooks";
import type { ImportSession, TradingAccount } from "../types";

// ─── Bannière de détection broker ───────────────────────────

/**
 * Affiche le résultat de la détection automatique du format broker.
 *
 * - Confiance "high"   → bandeau vert  "Format détecté : …"
 * - Confiance "medium" → bandeau jaune "Format probable : … — vérifiez le mapping"
 * - Confiance "low"    → bandeau neutre "Format possible : … — mapping non appliqué"
 * - Confiance "none"   → bandeau neutre "Format non reconnu — mapping manuel"
 */
function BrokerDetectionBanner({ result }: { result: BrokerDetectionResult }) {
  const { confidence, formatName, score, matchedFields, missingFields } =
    result;

  // Classe CSS selon le niveau de confiance
  const modifierClass =
    confidence === "high"
      ? "broker-detection--high"
      : confidence === "medium"
        ? "broker-detection--medium"
        : "broker-detection--low";

  // Icône selon le niveau de confiance
  const Icon = confidence === "none" ? HelpCircle : Cpu;

  // Texte principal
  const headline =
    confidence === "high"
      ? `Format détecté : ${formatName}`
      : confidence === "medium"
        ? `Format probable : ${formatName}`
        : confidence === "low"
          ? `Format possible : ${formatName}`
          : "Format non reconnu";

  // Sous-texte explicatif
  const hint =
    confidence === "high"
      ? `Mapping appliqué automatiquement — ${matchedFields.length} colonne(s) correspondantes.`
      : confidence === "medium"
        ? `Mapping pré-rempli — vérifiez et corrigez si nécessaire.`
        : confidence === "low"
          ? `Confiance insuffisante (${Math.round(score * 100)} %) — mapping générique appliqué.`
          : "Aucun profil broker reconnu — mapping manuel requis.";

  return (
    <div className={`broker-detection ${modifierClass}`} role="status">
      <Icon size={15} className="broker-detection__icon" aria-hidden />
      <div className="broker-detection__content">
        <span className="broker-detection__headline">{headline}</span>
        <span className="broker-detection__hint">{hint}</span>
      </div>

      {/* Détails des colonnes trouvées / manquantes (mode medium/low) */}
      {confidence !== "none" && missingFields.length > 0 && (
        <div className="broker-detection__detail">
          <span className="broker-detection__detail-label">
            Colonnes absentes :
          </span>
          {missingFields.map((f) => (
            <code key={f} className="broker-detection__detail-code">
              {f}
            </code>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────

export default function ImportsPage() {
  const notify = useNotification();

  // Liste des sessions d'import déjà enregistrées
  const [sessions, setSessions] = useState<ImportSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [tradingAccounts, setTradingAccounts] = useState<TradingAccount[]>([]);
  const [selectedTradingAccountId, setSelectedTradingAccountId] = useState<
    number | ""
  >("");

  // ID de la session créée pour le fichier en cours d'analyse
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);

  // Résultat du parsing CSV (null = pas encore parsé)
  const [parseOutcome, setParseOutcome] = useState<CsvParseOutcome | null>(
    null,
  );

  // Résultat de la détection automatique du format broker
  const [detectionResult, setDetectionResult] =
    useState<BrokerDetectionResult | null>(null);

  // Résultat du mapping (mis à jour à chaque modification dans CsvMappingSection)
  const [columnMapping, setColumnMapping] = useState<CsvColumnMapping | null>(
    null,
  );

  // Résultat de la validation (recalculé à chaque changement de mapping)
  const [validationResult, setValidationResult] =
    useState<CsvValidationResult | null>(null);

  // Rapport de déduplication (calculé après chaque validation)
  const [deduplicationReport, setDeduplicationReport] =
    useState<CsvDeduplicationReport | null>(null);
  const [loadingDedup, setLoadingDedup] = useState(false);

  // ── Rapport consolidé des erreurs ────────────────────────

  /**
   * Rapport d'erreurs calculé depuis l'état courant du pipeline d'import.
   * Mis à jour automatiquement à chaque changement de parseOutcome,
   * detectionResult, columnMapping ou validationResult.
   *
   * null = fichier non parsé OU import entièrement propre (aucune issue).
   * Non null = au moins une issue (erreur ou avertissement) à afficher.
   */
  const importReport = useMemo<CsvImportReport | null>(() => {
    // Pas de rapport si le fichier n'est pas encore parsé ou si parse KO
    // (les erreurs de fichier sont affichées inline dans la section prévisualisation)
    if (!parseOutcome?.ok) return null;

    const issues: CsvImportIssue[] = [];

    // Avertissements du parser (lignes ignorées, colonnes tronquées, etc.)
    issues.push(...buildParseWarnings(parseOutcome.result.warnings));

    // Confiance du broker (low / none → warning)
    if (detectionResult) {
      const di = buildDetectionIssue(detectionResult.confidence);
      if (di) issues.push(di);
    }

    // Champs obligatoires non mappés → erreurs bloquantes
    if (columnMapping && !columnMapping.isValid) {
      issues.push(...buildMappingIssues(columnMapping.missingRequired));
    }

    // Lignes invalides et top erreurs de validation
    if (validationResult) {
      issues.push(...buildValidationIssues(validationResult.summary));
    }

    if (issues.length === 0) return null;
    return buildImportReport(issues);
  }, [parseOutcome, detectionResult, columnMapping, validationResult]);

  // ── Logging du rapport ───────────────────────────────────

  // Log chaque nouveau rapport dans le fichier de log local.
  // useEffect garantit que le logging se fait après le rendu.
  useEffect(() => {
    if (importReport) {
      logImportReport(importReport);
    }
  }, [importReport]);

  // ── Chargement de l'historique ───────────────────────────

  const loadSessions = useCallback(async () => {
    try {
      const list = await getImportSessions();
      setSessions(list);
    } catch {
      // L'historique n'est pas critique — échec silencieux
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    let cancelled = false;

    async function loadTradingAccounts() {
      try {
        const rows = await getTradingAccounts(true);
        if (!cancelled) setTradingAccounts(rows);
      } catch {
        if (!cancelled) setTradingAccounts([]);
      }
    }

    void loadTradingAccounts();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedTradingAccount = useMemo(() => {
    if (selectedTradingAccountId === "") return null;
    return (
      tradingAccounts.find(
        (account) => account.id === selectedTradingAccountId,
      ) ?? null
    );
  }, [selectedTradingAccountId, tradingAccounts]);

  // ── Callbacks ────────────────────────────────────────────

  /**
   * Appelé par CsvUploadSection dès qu'une session est créée.
   * Ajoute la nouvelle session en tête de liste sans rechargement.
   */
  function handleSessionCreated(session: ImportSession) {
    setSessions((prev) => [session, ...prev]);
    setCurrentSessionId(session.id);
  }

  /**
   * Appelé après le parsing du CSV.
   * Lance la détection du format broker et met à jour les états.
   */
  function handleParsed(outcome: CsvParseOutcome) {
    setParseOutcome(outcome);
    if (outcome.ok) {
      // La détection est synchrone et rapide (aucun I/O)
      const detection = detectBrokerFormat(outcome.result.headers);
      setDetectionResult(detection);

      // Import OHLC opportuniste : activé seulement si colonnes OHLC présentes.
      void importCsvMarketData({
        parseResult: outcome.result,
        broker: detection.formatName ?? detection.format ?? null,
        accountId: null,
      })
        .then((result) => {
          if (!result.detected || result.importedRows === 0) {
            return;
          }
          notify.info(
            `${result.importedRows} bougie(s) OHLC CSV importée(s) pour replay.` +
              (result.skippedRows > 0
                ? ` ${result.skippedRows} ligne(s) ignorée(s).`
                : ""),
          );
        })
        .catch(() => {
          // Non bloquant pour workflow import trades.
        });
    } else {
      setDetectionResult(null);
    }
  }

  /**
   * Appelé quand l'utilisateur réinitialise le composant d'upload.
   * Réinitialise la prévisualisation, la détection, le mapping et la validation.
   */
  function handlePreviewReset() {
    setParseOutcome(null);
    setDetectionResult(null);
    setColumnMapping(null);
    setValidationResult(null);
    setDeduplicationReport(null);
    setLoadingDedup(false);
    setCurrentSessionId(null);
  }

  /**
   * Appelé quand l'utilisateur clique sur « Confirmer l'import ».
   * Place la session en statut pending_confirmation.
   * La création réelle des trades sera faite en Étape 9.
   */
  function handleConfirmImport() {
    if (currentSessionId !== null) {
      void updateImportSession(currentSessionId, {
        status: "pending_confirmation",
      });
      void loadSessions();
    }
    const exactCount = deduplicationReport?.exactDuplicateCount ?? 0;
    const baseMsg =
      "Import à venir — la création des trades dans SQLite sera disponible prochainement.";
    const dedupMsg =
      exactCount > 0
        ? ` ${exactCount} doublon(s) exact(s) automatiquement exclu(s).`
        : "";
    notify.info(baseMsg + dedupMsg);
  }

  /** Supprime une session d'import et toutes ses lignes (CASCADE). */
  async function handleDeleteSession(id: number) {
    try {
      await deleteImportSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      notify.success("Session d'import supprimée");
    } catch {
      notify.error("Impossible de supprimer la session");
    }
  }

  // ── Rendu ────────────────────────────────────────────────

  return (
    <div className="content-max">
      {/* ── En-tête de page ─────────────────────────────── */}
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Import CSV</h1>
          <p className="page-subtitle">
            Importez vos trades depuis un fichier CSV MetaTrader 5 ou tout autre
            format compatible.
          </p>
        </div>
      </div>

      {/* ── Section upload ──────────────────────────────── */}
      <section className="page-section">
        <h2 className="import-section-title">
          <Upload size={15} aria-hidden />
          Sélectionner un fichier
        </h2>

        <div
          className="form-group"
          style={{ maxWidth: 460, marginBottom: "var(--spacing-md)" }}
        >
          <span className="form-label">Compte cible</span>
          <select
            value={String(selectedTradingAccountId)}
            onChange={(event) => {
              const value = event.target.value;
              setSelectedTradingAccountId(value ? Number(value) : "");
            }}
          >
            <option value="">Détection auto (sans compte explicite)</option>
            {tradingAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.broker} ·{" "}
                {account.platform.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Composant de sélection + validation + enregistrement + parsing du CSV */}
        <CsvUploadSection
          onSessionCreated={handleSessionCreated}
          onParsed={handleParsed}
          onReset={handlePreviewReset}
        />
      </section>

      {/* ── Section prévisualisation ────────────────────── */}
      {parseOutcome && (
        <section className="page-section">
          <h2 className="import-section-title">
            <Table2 size={15} aria-hidden />
            Prévisualisation des données
          </h2>

          {parseOutcome.ok ? (
            <CsvPreviewTable result={parseOutcome.result} />
          ) : (
            <div className="csv-preview-parse-error" role="alert">
              <AlertCircle size={15} aria-hidden />
              <span>{parseOutcome.error.message}</span>
            </div>
          )}
        </section>
      )}

      {/* ── Bannière de détection broker ────────────────── */}
      {parseOutcome?.ok && detectionResult && (
        <BrokerDetectionBanner result={detectionResult} />
      )}

      {/* ── Section mapping des colonnes ───────────────── */}
      {parseOutcome?.ok && (
        <section className="page-section">
          <h2 className="import-section-title">
            <ArrowLeftRight size={15} aria-hidden />
            Mapping des colonnes
          </h2>

          {/*
            La key force un remontage du composant quand le fichier change.
            Cela réinitialise l'auto-détection avec les nouveaux headers.
            Le detectionResult est passé en prop pour initialiser le mapping
            avec le profil du broker si la confiance est suffisante.
          */}
          <CsvMappingSection
            key={parseOutcome.result.headers.join("\x00")}
            headers={parseOutcome.result.headers}
            previewRows={parseOutcome.result.rows.slice(0, 5)}
            onChange={(mapping) => {
              setColumnMapping(mapping);
              // Relancer la validation à chaque modification du mapping.
              // validateRows() est synchrone et rapide (pas d'I/O).
              if (mapping.isValid) {
                const result = validateRows(parseOutcome.result.rows, mapping);
                setValidationResult(result);
                // Lancer la déduplication de manière asynchrone
                setDeduplicationReport(null);
                setLoadingDedup(true);
                checkDuplicates(result.rows, {
                  broker:
                    selectedTradingAccount?.broker ??
                    detectionResult?.formatName ??
                    detectionResult?.format ??
                    null,
                  accountId: selectedTradingAccount?.accountNumber ?? null,
                  tradingAccountId: selectedTradingAccount?.id ?? null,
                  platform: "csv",
                })
                  .then((report) => {
                    setDeduplicationReport(report);
                    setLoadingDedup(false);
                  })
                  .catch(() => {
                    setLoadingDedup(false);
                  });
                // Mettre à jour la session SQLite avec les compteurs et le broker détecté.
                if (currentSessionId !== null) {
                  void analyzeImportSession(currentSessionId, {
                    totalRows: result.summary.totalRows,
                    importableRows: result.summary.importableCount,
                    errorRows: result.summary.invalidCount,
                    warningRows: result.summary.warningCount,
                    broker:
                      selectedTradingAccount?.broker ??
                      detectionResult?.formatName ??
                      detectionResult?.format ??
                      null,
                    brokerId: selectedTradingAccount?.brokerId ?? null,
                    accountId: selectedTradingAccount?.accountNumber ?? null,
                    tradingAccountId: selectedTradingAccount?.id ?? null,
                  });
                  // Rafraîchir la session dans la liste locale
                  void loadSessions();
                }
              } else {
                // Ne pas valider si le mapping est incomplet
                setValidationResult(null);
                setDeduplicationReport(null);
                setLoadingDedup(false);
              }
            }}
            detectionResult={detectionResult}
          />

          {/* Statut de validation */}
          {columnMapping && (
            <p className="csv-mapping__status-hint">
              {columnMapping.isValid
                ? "✓ Prêt pour l'import — toutes les colonnes obligatoires sont mappées."
                : `⚠ ${columnMapping.missingRequired.length} champ(s) obligatoire(s) manquant(s).`}
            </p>
          )}
        </section>
      )}

      {/* ── Section validation des lignes ───────────────── */}
      {validationResult && (
        <section className="page-section">
          <h2 className="import-section-title">
            <ShieldCheck size={15} aria-hidden />
            Validation des données
          </h2>

          {/* Résumé synthétique des compteurs (diagnostic) */}
          <CsvValidationSummaryPanel summary={validationResult.summary} />

          {/* Tableau détaillé ligne par ligne avec filtre par statut */}
          <CsvValidationTable rows={validationResult.rows} />
        </section>
      )}

      {/* ── Rapport consolidé des erreurs ─────────────────── */}
      {/*
        Affiché dès que le fichier est parsé avec succès.
        Consolide toutes les issues du pipeline (broker, mapping, validation)
        en un seul panneau orienté utilisateur — distinct de la
        CsvValidationTable qui détaille chaque ligne individuellement.

        - canProceed = false : bandeau rouge, import entièrement bloqué
        - canProceed = true  : bandeau orange, lignes valides importables
      */}
      {importReport && parseOutcome?.ok && (
        <CsvImportErrorsPanel report={importReport} />
      )}

      {/* ── Section doublons ─────────────────────────────── */}
      {validationResult &&
        (loadingDedup || (deduplicationReport?.hasDuplicates ?? false)) && (
          <section className="page-section">
            <h2 className="import-section-title">
              <Copy size={15} aria-hidden />
              Vérification des doublons
            </h2>
            {loadingDedup ? (
              <p className="import-history__empty">
                Analyse des doublons en cours…
              </p>
            ) : (
              deduplicationReport && (
                <DuplicateTradesPanel
                  report={deduplicationReport}
                  validatedRows={validationResult.rows}
                />
              )
            )}
          </section>
        )}

      {/* ── Section aperçu avant import ─────────────────── */}
      {/*
        Affichée dès que validationResult est disponible.
        Montre les valeurs PARSÉES (transformées) — contrairement à
        CsvValidationTable qui montre les valeurs brutes du CSV.

        Contient :
          - CsvImportSummary      : résumé décisionnel
          - Tableau importables   : trades avec valeurs transformées
          - CsvInvalidRowsTable   : lignes exclues avec leurs erreurs
          - Barre d'actions       : retour mapping + confirmer (stub)

        onBack    : réinitialise validationResult → cache le preview
                    (le mapping reste actif pour modification)
        onConfirm : passe la session en pending_confirmation (Étape 8)
      */}
      {validationResult && (
        <section className="page-section">
          <h2 className="import-section-title">
            <Eye size={15} aria-hidden />
            Aperçu avant import
          </h2>

          <CsvImportPreview
            validationResult={validationResult}
            onBack={() => setValidationResult(null)}
            onConfirm={handleConfirmImport}
          />
        </section>
      )}

      {/* ── Historique des imports ───────────────────────── */}
      <section className="page-section">
        <h2 className="import-section-title">
          <History size={15} aria-hidden />
          Historique des imports
          {sessions.length > 0 && (
            <span className="history-count">{sessions.length}</span>
          )}
        </h2>

        <ImportHistoryList
          sessions={sessions}
          onDelete={(id) => void handleDeleteSession(id)}
          loading={loadingSessions}
        />
      </section>
    </div>
  );
}
