import { useEffect, useState } from "react";
import { RefreshCw, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import BackupsList from "../features/backups/components/BackupsList";
import RestoreBackupDialog, {
  REQUIRED_CONFIRMATION,
} from "../features/backups/components/RestoreBackupDialog";
import DeleteDialog from "../components/ui/DeleteDialog";
import { useNotification, useUserSettings } from "../hooks";
import {
  createLocalDatabaseBackup,
  deleteBackupWithFile,
  getBackups,
  getBackupRestoreDetails,
  restoreBackupById,
  type BackupRestoreDetails,
} from "../services/backups";
import type { Backup } from "../types";
import { tr } from "../utils/i18n";

export default function BackupsPage() {
  const notify = useNotification();
  const settings = useUserSettings();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);
  const [restoreDetails, setRestoreDetails] =
    useState<BackupRestoreDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function loadBackups() {
    setLoading(true);
    try {
      const list = await getBackups();
      setBackups(list);
      setSelectedBackup((current) => {
        if (!current) return list[0] ?? null;
        return (
          list.find((backup) => backup.id === current.id) ?? list[0] ?? null
        );
      });
    } catch {
      notify.error(
        tr(
          settings.language,
          "Impossible de charger les backups locaux",
          "Unable to load local backups",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBackups();
    // Chargement initial uniquement : les actions de la page rafraichissent ensuite explicitement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedBackup) {
      setRestoreDetails(null);
      return;
    }

    let cancelled = false;
    getBackupRestoreDetails(selectedBackup.id)
      .then((details) => {
        if (!cancelled) setRestoreDetails(details);
      })
      .catch(() => {
        if (!cancelled) {
          setRestoreDetails(null);
          notify.error(
            tr(
              settings.language,
              "Impossible de lire les détails du backup",
              "Unable to read backup details",
            ),
          );
        }
      });

    return () => {
      cancelled = true;
    };
    // Les details ne doivent etre recharges que lorsque le backup selectionne change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBackup]);

  async function handleCreateManualBackup(compressed = true) {
    setCreating(true);
    try {
      const backup = await createLocalDatabaseBackup("manual", { compressed });
      notify.success(
        tr(
          settings.language,
          `Backup créé : ${backup.filename}`,
          `Backup created: ${backup.filename}`,
        ),
      );
      await loadBackups();
    } catch {
      notify.error(
        tr(
          settings.language,
          "Impossible de créer le backup local",
          "Unable to create local backup",
        ),
      );
    } finally {
      setCreating(false);
    }
  }

  function openRestoreDialog() {
    setConfirmationText("");
    setDialogOpen(true);
  }

  function openDeleteDialog() {
    setDeleteOpen(true);
  }

  async function handleRestore() {
    if (!selectedBackup) return;

    setRestoring(true);
    try {
      const result = await restoreBackupById(selectedBackup.id, {
        confirmed:
          confirmationText.trim().toUpperCase() === REQUIRED_CONFIRMATION,
      });
      notify.persist(
        "success",
        tr(
          settings.language,
          `Backup restauré. Backup de sécurité : ${result.safetyBackup.filename}`,
          `Backup restored. Safety backup: ${result.safetyBackup.filename}`,
        ),
      );

      window.setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch {
      notify.error(
        tr(
          settings.language,
          "La restauration du backup a échoué",
          "Backup restore failed",
        ),
      );
      setRestoring(false);
    }
  }

  async function handleDeleteBackup() {
    if (!selectedBackup) return;

    setDeleting(true);
    try {
      const deleted = await deleteBackupWithFile(selectedBackup.id);
      if (deleted) {
        notify.success(
          tr(settings.language, "Backup supprimé", "Backup deleted"),
        );
        await loadBackups();
        setDeleteOpen(false);
      } else {
        notify.error(
          tr(
            settings.language,
            "Impossible de supprimer le backup",
            "Unable to delete backup",
          ),
        );
      }
    } catch {
      notify.error(
        tr(
          settings.language,
          "Impossible de supprimer le backup",
          "Unable to delete backup",
        ),
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="content-max backups-page">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">
            {tr(settings.language, "Sauvegardes", "Backups")}
          </h1>
          <p className="page-subtitle">
            {tr(
              settings.language,
              "Backups locaux de la base SQLite TradingBook.",
              "Local backups of the TradingBook SQLite database.",
            )}
          </p>
        </div>
        <div className="page-actions backups-page__actions">
          <button
            type="button"
            className="btn-secondary btn-icon-text"
            onClick={() => void loadBackups()}
            disabled={loading || restoring}
          >
            <RefreshCw size={15} aria-hidden />
            {tr(settings.language, "Actualiser", "Refresh")}
          </button>
          <button
            type="button"
            className="btn-primary btn-icon-text"
            onClick={() => void handleCreateManualBackup(true)}
            disabled={creating || restoring}
          >
            <ShieldCheck size={15} aria-hidden />
            {creating
              ? tr(settings.language, "Création…", "Creating...")
              : tr(
                  settings.language,
                  "Créer un backup ZIP",
                  "Create ZIP backup",
                )}
          </button>
          <button
            type="button"
            className="btn-secondary btn-icon-text"
            onClick={() => void handleCreateManualBackup(false)}
            disabled={creating || restoring}
          >
            <ShieldCheck size={15} aria-hidden />
            {tr(settings.language, "Backup .db", ".db backup")}
          </button>
        </div>
      </div>

      <section className="page-section backups-layout">
        <div className="backups-panel">
          <h2 className="backups-section-title">
            {tr(settings.language, "Backups disponibles", "Available backups")}
          </h2>
          <BackupsList
            backups={backups}
            selectedId={selectedBackup?.id ?? null}
            loading={loading}
            onSelect={setSelectedBackup}
          />
        </div>

        <div className="backups-panel backups-panel--details">
          <h2 className="backups-section-title">
            {tr(settings.language, "Détails du backup", "Backup details")}
          </h2>
          {restoreDetails ? (
            <>
              <dl className="backup-details backup-details--panel">
                <div>
                  <dt>
                    {tr(settings.language, "Nom du fichier", "File name")}
                  </dt>
                  <dd>{restoreDetails.filename}</dd>
                </div>
                <div>
                  <dt>{tr(settings.language, "Format", "Format")}</dt>
                  <dd>
                    {restoreDetails.format === "zip" ? "ZIP" : "SQLite .db"}
                  </dd>
                </div>
                <div>
                  <dt>{tr(settings.language, "Taille", "Size")}</dt>
                  <dd>
                    {restoreDetails.sizeBytes === null
                      ? tr(settings.language, "Non disponible", "Not available")
                      : `${restoreDetails.sizeBytes.toLocaleString(
                          settings.language === "fr" ? "fr-CA" : "en-CA",
                        )} ${tr(settings.language, "octets", "bytes")}`}
                  </dd>
                </div>
                <div>
                  <dt>{tr(settings.language, "Date", "Date")}</dt>
                  <dd>
                    {new Date(restoreDetails.createdAt).toLocaleString(
                      settings.language === "fr" ? "fr-CA" : "en-CA",
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{tr(settings.language, "Version", "Version")}</dt>
                  <dd>
                    {restoreDetails.version ??
                      tr(settings.language, "Non disponible", "Not available")}
                  </dd>
                </div>
                <div>
                  <dt>
                    {tr(
                      settings.language,
                      "Fichier sur disque",
                      "File on disk",
                    )}
                  </dt>
                  <dd>
                    {restoreDetails.exists
                      ? tr(settings.language, "Présent", "Present")
                      : tr(settings.language, "Introuvable", "Missing")}
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                className="btn-danger btn-icon-text backups-restore-btn"
                onClick={openRestoreDialog}
                disabled={!restoreDetails.exists || restoring}
              >
                <RotateCcw size={15} aria-hidden />
                {tr(
                  settings.language,
                  "Restaurer ce backup",
                  "Restore this backup",
                )}
              </button>

              <button
                type="button"
                className="btn-secondary btn-icon-text backups-restore-btn"
                onClick={openDeleteDialog}
                disabled={restoring || deleting}
              >
                <Trash2 size={15} aria-hidden />
                {tr(
                  settings.language,
                  "Supprimer ce backup",
                  "Delete this backup",
                )}
              </button>
            </>
          ) : (
            <p className="backups-empty">
              {tr(
                settings.language,
                "Sélectionnez un backup pour afficher ses informations.",
                "Select a backup to display its details.",
              )}
            </p>
          )}
        </div>
      </section>

      {dialogOpen && (
        <RestoreBackupDialog
          details={restoreDetails}
          confirmationText={confirmationText}
          restoring={restoring}
          onConfirmationChange={setConfirmationText}
          onCancel={() => {
            if (!restoring) setDialogOpen(false);
          }}
          onConfirm={() => void handleRestore()}
        />
      )}

      <DeleteDialog
        isOpen={deleteOpen}
        title={tr(settings.language, "Supprimer le backup", "Delete backup")}
        message={tr(
          settings.language,
          `Voulez-vous vraiment supprimer le backup ${selectedBackup?.filename ?? "sélectionné"} ? Cette action supprimera le fichier local et ses métadonnées.`,
          `Do you really want to delete backup ${selectedBackup?.filename ?? "selected"}? This will remove local file and metadata.`,
        )}
        confirmLabel={
          deleting
            ? tr(settings.language, "Suppression…", "Deleting...")
            : tr(settings.language, "Supprimer", "Delete")
        }
        loading={deleting}
        onConfirm={() => void handleDeleteBackup()}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
