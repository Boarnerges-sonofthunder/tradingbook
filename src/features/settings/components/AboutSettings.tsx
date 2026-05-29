import { useMemo, useState } from "react";
import { useNotification } from "../../../hooks";
import { createLocalDatabaseBackup } from "../../../services/backups";
import { APP_NAME, APP_VERSION, APP_IDENTIFIER } from "../../../constants/app";

interface LocalReleaseNote {
  version: string;
  date: string;
  notes: string[];
}

// Notes de version locales: source simple, sans serveur ni dépendance cloud.
const LOCAL_RELEASE_NOTES: LocalReleaseNote[] = [
  {
    version: "0.1.2",
    date: "2026-05-28",
    notes: [
      "Auto-update GitHub Releases activé",
      "Brouillons de notes conservés lors du changement de page",
      "Version application et installateurs synchronisées",
    ],
  },
];

/**
 * Compare deux versions de type x.y.z et retourne:
 * - 1 si candidate > current
 * - 0 si candidate = current
 * - -1 si candidate < current
 */
function compareSimpleVersions(candidate: string, current: string): number {
  const candidateParts = candidate.split(".").map((part) => Number(part));
  const currentParts = current.split(".").map((part) => Number(part));

  for (let i = 0; i < 3; i += 1) {
    const left = Number.isFinite(candidateParts[i]) ? candidateParts[i] : 0;
    const right = Number.isFinite(currentParts[i]) ? currentParts[i] : 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }

  return 0;
}

function isVersionFormatValid(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version.trim());
}

export default function AboutSettings() {
  const notify = useNotification();
  const [candidateVersion, setCandidateVersion] = useState("");
  const [versionCheckMessage, setVersionCheckMessage] = useState<string | null>(
    null,
  );
  const [preparingUpdate, setPreparingUpdate] = useState(false);
  const [preparedBackupFilename, setPreparedBackupFilename] = useState<
    string | null
  >(null);

  const latestRelease = useMemo(() => LOCAL_RELEASE_NOTES[0] ?? null, []);

  function handleManualVersionCheck() {
    const normalized = candidateVersion.trim();
    if (!isVersionFormatValid(normalized)) {
      setVersionCheckMessage("Format invalide. Utilisez x.y.z (ex: 0.2.0).");
      return;
    }

    const comparison = compareSimpleVersions(normalized, APP_VERSION);
    if (comparison > 0) {
      setVersionCheckMessage(
        `Version ${normalized} est plus récente que version installée (${APP_VERSION}).`,
      );
      return;
    }

    if (comparison === 0) {
      setVersionCheckMessage(`Vous utilisez déjà version ${APP_VERSION}.`);
      return;
    }

    setVersionCheckMessage(
      `Version saisie (${normalized}) est plus ancienne que version installée (${APP_VERSION}).`,
    );
  }

  async function handlePrepareManualUpdate() {
    setPreparingUpdate(true);
    try {
      // Backup local automatique avant update manuel pour protéger SQLite.
      const backup = await createLocalDatabaseBackup("pre_migration", {
        compressed: true,
      });
      setPreparedBackupFilename(backup.filename);
      notify.success(`Backup pré-update créé: ${backup.filename}`);
    } catch {
      notify.error("Impossible de créer le backup pré-update.");
    } finally {
      setPreparingUpdate(false);
    }
  }

  return (
    <div className="settings-list">
      <div className="settings-list-item">
        <span>Application</span>
        <strong>{APP_NAME}</strong>
      </div>
      <div className="settings-list-item">
        <span>Version</span>
        <strong>{APP_VERSION}</strong>
      </div>
      <div className="settings-list-item">
        <span>Identifiant</span>
        <strong>{APP_IDENTIFIER}</strong>
      </div>
      <div className="settings-list-item">
        <span>Auto-update cloud</span>
        <span className="badge badge-neutral">GitHub Releases (activé)</span>
      </div>
      <p className="settings-note">
        TradingBook fonctionne en local : SQLite, fichiers, backups et logs
        restent sur cet ordinateur.
      </p>

      <div className="settings-list-item">
        <span>Dernières notes locales</span>
        <strong>
          {latestRelease
            ? `${latestRelease.version} (${latestRelease.date})`
            : "Aucune"}
        </strong>
      </div>
      {latestRelease ? (
        <ul className="settings-note" style={{ marginLeft: "1rem" }}>
          {latestRelease.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      <div className="settings-list-item" style={{ alignItems: "stretch" }}>
        <span>Vérification manuelle version</span>
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <input
            type="text"
            value={candidateVersion}
            onChange={(event) => setCandidateVersion(event.target.value)}
            placeholder="Ex: 0.2.0"
            aria-label="Version à vérifier"
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={handleManualVersionCheck}
          >
            Vérifier
          </button>
        </div>
      </div>
      {versionCheckMessage ? (
        <p className="settings-note">{versionCheckMessage}</p>
      ) : null}

      <div className="settings-list-item" style={{ alignItems: "stretch" }}>
        <span>Sauvegarde avant update</span>
        <button
          type="button"
          className="btn-primary"
          onClick={() => void handlePrepareManualUpdate()}
          disabled={preparingUpdate}
        >
          {preparingUpdate ? "Préparation..." : "Préparer update manuel"}
        </button>
      </div>

      <p className="settings-note">
        Procédure manuelle: 1) télécharger nouvelle version, 2) cliquer
        "Préparer update manuel", 3) fermer TradingBook, 4) lancer nouvel
        installateur .exe, 5) rouvrir application.
      </p>
      <p className="settings-note">
        {preparedBackupFilename
          ? `Dernier backup pré-update: ${preparedBackupFilename}. Données SQLite protégées localement.`
          : "Aucun backup pré-update généré pour cette session."}
      </p>
    </div>
  );
}
