// ============================================================
// CsvUploadSection — Sélection et enregistrement d'un fichier CSV
// ============================================================
// Fonctionnalités :
//   1. Sélectionner un fichier CSV via <input type="file">
//   2. Valider l'extension (.csv) et la taille (max 10 Mo)
//   3. Lire les octets avec FileReader (Web API)
//   4. Copier le fichier dans le dossier local imports/ (Tauri fs)
//   5. Créer une session d'import en SQLite (status: "pending")
//   6. Afficher les infos du fichier (nom, chemin, taille, date)
//   7. Notifier succès ou erreur
//
// IMPORTANT — Scope de cette étape :
//   - Le fichier est copié et enregistré, mais PAS encore parsé.
//   - Aucune ligne de trade n'est créée à ce stade.
//   - Le parsing CSV et la création des trades seront implémentés
//     dans une étape ultérieure (Phase 5 Étape 2+).
//
// Stockage :
//   Fichier physique : %LOCALAPPDATA%\com.tradingbook.app\imports\
//   SQLite           : table `imports` (session avec status "pending")
// ============================================================

import { useState, useRef } from "react";
import {
  Upload,
  FileText,
  CheckCircle,
  X,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { createImportSession } from "../../../services/imports/importsService";
import {
  parseCSVText,
  type CsvParseOutcome,
} from "../../../services/imports/csvParserService";
import {
  MAX_IMPORT_FILE_SIZE,
  storeImportFile,
} from "../../../services/imports/importFileStorageService";
import { useNotification } from "../../../hooks";
import type { ImportSession } from "../../../types";

// ─── Constantes ────────────────────────────────────────────

/** Taille maximale acceptée pour un fichier CSV (10 Mo). */

// ─── Types internes ─────────────────────────────────────────

/** Informations affichées après sélection d'un fichier valide. */
interface SelectedFileInfo {
  /** Nom d'origine du fichier tel que sélectionné par l'utilisateur. */
  originalName: string;
  /** Nom généré pour le fichier stocké localement (évite les collisions). */
  storedFilename: string;
  /** Chemin absolu du fichier copié dans le dossier imports/. */
  storedPath: string;
  /** Taille en octets du fichier. */
  sizeBytes: number;
  /** Horodatage ISO de la sélection. */
  selectedAt: string;
  /** Session d'import créée en SQLite. */
  session: ImportSession;
}

// ─── Props ─────────────────────────────────────────────────

interface CsvUploadSectionProps {
  /**
   * Appelé dès qu'une session d'import est créée avec succès.
   * Permet à la page parente de rafraîchir l'historique.
   */
  onSessionCreated?: (session: ImportSession) => void;
  /**
   * Appelé après le parsing du CSV (succès ou échec).
   * Permet à la page parente d'afficher le tableau de prévisualisation.
   */
  onParsed?: (outcome: CsvParseOutcome) => void;
  /**
   * Appelé quand l'utilisateur clique sur "sélectionner un autre fichier".
   * Permet à la page parente de réinitialiser l'état de prévisualisation.
   */
  onReset?: () => void;
}

// ─── Helpers ───────────────────────────────────────────────

/** Formate une taille en octets en Ko/Mo lisibles. */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/**
 * Génère un nom de fichier unique pour éviter les collisions dans le dossier imports/.
 * Format : {timestamp}_{nom_nettoyé}.csv
 * Les caractères non alphanumériques (hors . - _) sont remplacés par _.
 */

/**
 * Lit un objet File et retourne ses données sous forme de Uint8Array.
 * Utilise l'API FileReader standard du navigateur (disponible dans WebView Tauri).
 */
function readFileAsBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buf = e.target?.result;
      if (buf instanceof ArrayBuffer) {
        resolve(new Uint8Array(buf));
      } else {
        reject(new Error("Lecture du fichier échouée : résultat inattendu"));
      }
    };
    reader.onerror = () => reject(new Error("Erreur de lecture (FileReader)"));
    reader.readAsArrayBuffer(file);
  });
}

void readFileAsBytes;

// ─── Composant ─────────────────────────────────────────────

export default function CsvUploadSection({
  onSessionCreated,
  onParsed,
  onReset,
}: CsvUploadSectionProps) {
  const notify = useNotification();

  // Référence vers l'<input type="file"> caché
  const inputRef = useRef<HTMLInputElement>(null);

  // Opération en cours (lecture + écriture + SQLite)
  const [loading, setLoading] = useState(false);

  // Infos du fichier après traitement réussi (null = aucun fichier chargé)
  const [fileInfo, setFileInfo] = useState<SelectedFileInfo | null>(null);

  // Message d'erreur de validation ou de traitement
  const [error, setError] = useState<string | null>(null);

  // ── Gestionnaire de sélection de fichier ───────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    // Réinitialiser la valeur afin de pouvoir re-sélectionner le même fichier
    e.target.value = "";

    if (!file) return;

    setError(null);

    // 1. Valider l'extension
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv") {
      const msg = "Fichier invalide : seuls les fichiers .csv sont acceptés.";
      setError(msg);
      notify.error(msg);
      return;
    }

    // 2. Valider la taille
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      const msg = `Fichier trop volumineux (${formatFileSize(file.size)}). Limite : ${formatFileSize(MAX_IMPORT_FILE_SIZE)}.`;
      setError(msg);
      notify.error(msg);
      return;
    }

    setLoading(true);
    try {
      // 3. Lire les octets du fichier (Web API)
      const storedFile = await storeImportFile(file);

      // 4. Générer un nom de fichier unique

      // 5. Résoudre le chemin absolu dans le dossier local imports/

      // 6. Copier le fichier vers %LOCALAPPDATA%\com.tradingbook.app\imports\

      // 7. Créer la session d'import dans SQLite (status: "analyzed")
      //    Le fichier est prêt, le parsing + validation sont effectués après.
      const session = await createImportSession({
        source: "csv",
        filename: storedFile.storedFilename,
        fileSizeBytes: storedFile.sizeBytes,
      });

      // 8. Décoder les octets en texte et parser le CSV
      const parseOutcome = parseCSVText(storedFile.text);

      // 9. Mettre à jour l'état local
      const info: SelectedFileInfo = {
        originalName: storedFile.originalName,
        storedFilename: storedFile.storedFilename,
        storedPath: storedFile.storedPath,
        sizeBytes: storedFile.sizeBytes,
        selectedAt: storedFile.selectedAt,
        session,
      };
      setFileInfo(info);

      notify.success("Import CSV terminé");

      // 10. Notifier la page parente pour rafraîchir l'historique
      onSessionCreated?.(session);

      // 11. Transmettre le résultat du parsing à la page parente
      onParsed?.(parseOutcome);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const displayMsg = `Erreur lors du chargement : ${msg}`;
      setError(displayMsg);
      notify.error(`Échec du chargement CSV`);
    } finally {
      setLoading(false);
    }
  }

  /** Remet à zéro le composant pour permettre de sélectionner un nouveau fichier. */
  function handleReset() {
    setFileInfo(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
    // Notifier la page parente pour réinitialiser la prévisualisation
    onReset?.();
  }

  // ── Rendu ──────────────────────────────────────────────

  return (
    <div className="csv-upload-section">
      {/* ── Zone de sélection (masquée dès qu'un fichier est chargé) ── */}
      {!fileInfo && (
        <div className="csv-dropzone">
          {/* Input natif caché — déclenché par le label ci-dessous */}
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            id="csv-file-input"
            className="csv-dropzone__input"
            onChange={handleFileChange}
            disabled={loading}
            aria-label="Sélectionner un fichier CSV"
          />

          {/* Label stylisé — clic déclenche l'ouverture du sélecteur de fichier */}
          <label
            htmlFor="csv-file-input"
            className={`csv-dropzone__label${loading ? " csv-dropzone__label--loading" : ""}`}
          >
            <Upload size={32} className="csv-dropzone__icon" aria-hidden />
            <span className="csv-dropzone__title">
              {loading ? "Chargement en cours…" : "Sélectionner un fichier CSV"}
            </span>
            <span className="csv-dropzone__hint">
              Cliquez pour parcourir · Uniquement les fichiers .csv · Max{" "}
              {formatFileSize(MAX_IMPORT_FILE_SIZE)}
            </span>
          </label>
        </div>
      )}

      {/* ── Message d'erreur de validation ──────────────────── */}
      {error && !fileInfo && (
        <div className="csv-upload-error" role="alert">
          <AlertCircle size={15} aria-hidden />
          <span className="csv-upload-error__text">{error}</span>
          <button
            className="btn-ghost csv-upload-error__dismiss"
            onClick={() => setError(null)}
            aria-label="Fermer le message d'erreur"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      )}

      {/* ── Carte d'informations du fichier chargé ──────────── */}
      {fileInfo && (
        <div className="csv-file-card">
          {/* En-tête de la carte */}
          <div className="csv-file-card__header">
            {/* Icône fichier */}
            <div className="csv-file-card__icon-wrap" aria-hidden>
              <FileText size={20} />
            </div>

            {/* Informations principales */}
            <div className="csv-file-card__info">
              <span className="csv-file-card__name">
                {fileInfo.originalName}
              </span>
              <span className="csv-file-card__meta">
                {formatFileSize(fileInfo.sizeBytes)} · Sélectionné le{" "}
                {new Date(fileInfo.selectedAt).toLocaleString("fr-FR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {/* Chemin local complet */}
              <span className="csv-file-card__path" title={fileInfo.storedPath}>
                {fileInfo.storedPath}
              </span>
            </div>

            {/* Badge succès + session ID */}
            <div className="csv-file-card__status">
              <CheckCircle
                size={16}
                className="csv-file-card__status-icon"
                aria-hidden
              />
              <span className="badge badge-neutral">
                Session #{fileInfo.session.id}
              </span>
            </div>

            {/* Bouton : sélectionner un autre fichier */}
            <button
              className="btn-ghost csv-file-card__reset"
              onClick={handleReset}
              title="Sélectionner un autre fichier CSV"
              aria-label="Sélectionner un autre fichier CSV"
            >
              <RefreshCw size={15} aria-hidden />
            </button>
          </div>

          {/* Pied de carte : statut actuel */}
          <div className="csv-file-card__footer">
            <span className="csv-file-card__status-text">
              Fichier copié localement · Parsing effectué — prévisualisation
              disponible ci-dessous
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
