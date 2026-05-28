// ============================================================
// TradeScreenshotsSection - Captures d'ecran d'un trade
// ============================================================
// Le composant delegue toute la logique fichier au service screenshots.
// Les fichiers sont stockes localement et SQLite ne garde que les chemins
// relatifs et metadonnees.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2, X } from "lucide-react";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import { useNotification, useUserSettings } from "../../../hooks";
import { formatDateTimeForSettings } from "../../../services/settings/settingsFormatService";
import {
  addScreenshotFileToTrade,
  deleteScreenshotWithFile,
  findMissingScreenshotsForTrade,
  getScreenshotsForTrade,
  readScreenshotImage,
} from "../../../services/screenshots/screenshotsService";
import type { TradeScreenshot } from "../../../services/screenshots/screenshotsService";

interface TradeScreenshotsSectionProps {
  tradeId: number;
}

function ScreenshotImage({
  screenshot,
  alt,
  onOpen,
}: {
  screenshot: TradeScreenshot;
  alt: string;
  onOpen: (src: string) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let blobUrl: string | null = null;
    let cancelled = false;

    readScreenshotImage(screenshot)
      .then((bytes) => {
        if (cancelled) return;
        const blob = new Blob([bytes], {
          type: screenshot.mimeType ?? "image/png",
        });
        blobUrl = URL.createObjectURL(blob);
        setSrc(blobUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [screenshot]);

  if (error) {
    return (
      <div className="screenshot-img-placeholder screenshot-img-placeholder--error">
        Image introuvable
      </div>
    );
  }

  if (!src) return <div className="screenshot-img-placeholder" />;

  return (
    <button
      type="button"
      className="screenshot-card__zoom-btn"
      onClick={() => onOpen(src)}
      aria-label={`Agrandir la capture ${alt}`}
    >
      <img
        src={src}
        className="screenshot-img"
        alt={alt}
        loading="lazy"
        draggable={false}
      />
    </button>
  );
}

export default function TradeScreenshotsSection({
  tradeId,
}: TradeScreenshotsSectionProps) {
  const notify = useNotification();
  const settings = useUserSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [screenshots, setScreenshots] = useState<TradeScreenshot[]>([]);
  const [missingCount, setMissingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [label, setLabel] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TradeScreenshot | null>(null);
  const [zoomTarget, setZoomTarget] = useState<{
    src: string;
    title: string;
    meta: string;
  } | null>(null);

  async function refreshScreenshots() {
    const data = await getScreenshotsForTrade(tradeId);
    setScreenshots(data);
    const missing = await findMissingScreenshotsForTrade(tradeId);
    setMissingCount(missing.length);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    refreshScreenshots()
      .catch(() => {
        if (!cancelled) notify.error("Impossible de charger les captures");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeId]);

  useEffect(() => {
    if (!zoomTarget) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setZoomTarget(null);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [zoomTarget]);

  function resetInput() {
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const screenshot = await addScreenshotFileToTrade({
        tradeId,
        file,
        label: label.trim() || null,
        timeframe: timeframe.trim() || null,
      });

      setScreenshots((prev) => [...prev, screenshot]);
      setMissingCount((count) => Math.max(0, count - 1));
      setLabel("");
      setTimeframe("");
      resetInput();
      notify.success("Capture d'écran ajoutée");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notify.error(`Impossible d'ajouter la capture : ${msg}`);
      resetInput();
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await deleteScreenshotWithFile(deleteTarget.id);
      setScreenshots((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      await refreshScreenshots();
      notify.success("Capture d'écran supprimée");
      setDeleteTarget(null);
    } catch {
      notify.error("Impossible de supprimer la capture d'écran");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="card screenshots-section" aria-labelledby="screenshots-title">
      <h2 className="trade-detail-section-title" id="screenshots-title">
        Captures d&apos;écran
      </h2>

      {missingCount > 0 && (
        <div className="form-errors-banner">
          <span className="form-errors-banner__title">
            {missingCount} fichier{missingCount > 1 ? "s" : ""} introuvable{missingCount > 1 ? "s" : ""}
          </span>
          <span className="form-hint">
            Les métadonnées existent encore dans SQLite, mais le fichier local est absent.
          </span>
        </div>
      )}

      <div className="screenshots-add">
        <div className="screenshots-add__fields">
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label" htmlFor="sc-label">
              Label <span className="form-label-optional">(optionnel)</span>
            </label>
            <input
              id="sc-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex. : Entrée, Sortie, Setup, Contexte"
              maxLength={100}
              disabled={uploading}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label" htmlFor="sc-timeframe">
              Timeframe <span className="form-label-optional">(optionnel)</span>
            </label>
            <input
              id="sc-timeframe"
              type="text"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              placeholder="Ex : H1, M15"
              maxLength={20}
              disabled={uploading}
            />
          </div>
        </div>

        <div className="screenshots-add__row">
          <input
            ref={fileInputRef}
            id="sc-file-input"
            type="file"
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            style={{ display: "none" }}
            onChange={handleFileChange}
            disabled={uploading}
            aria-label="Sélectionner une capture d'écran"
          />
          <label
            htmlFor="sc-file-input"
            className={`btn-secondary btn-icon-text screenshots-add__btn ${uploading ? "screenshots-add__btn--disabled" : ""}`}
            aria-disabled={uploading}
          >
            <ImagePlus size={14} aria-hidden />
            {uploading ? "Ajout en cours…" : "Choisir une image"}
          </label>
          <span className="screenshots-add__hint">
            PNG, JPG, JPEG, WEBP - max 20 Mo
          </span>
        </div>
      </div>

      {loading ? (
        <p className="screenshots-empty">Chargement des captures…</p>
      ) : screenshots.length === 0 ? (
        <p className="screenshots-empty">
          Aucune capture d&apos;écran pour ce trade.
          <br />
          <span className="screenshots-empty__hint">
            Ajoutez des captures pour documenter le setup, l&apos;entrée ou la sortie.
          </span>
        </p>
      ) : (
        <ul className="screenshots-grid" role="list">
          {screenshots.map((screenshot) => (
            <li key={screenshot.id} className="screenshot-card">
              <div className="screenshot-card__img-wrapper">
                <ScreenshotImage
                  screenshot={screenshot}
                  alt={screenshot.label ?? screenshot.fileName}
                  onOpen={(src) =>
                    setZoomTarget({
                      src,
                      title: screenshot.label ?? screenshot.fileName,
                      meta: [
                        screenshot.timeframe,
                        formatDateTimeForSettings(screenshot.createdAt, settings),
                      ]
                        .filter(Boolean)
                        .join(" - "),
                    })
                  }
                />
                <button
                  type="button"
                  className="screenshot-card__delete-btn"
                  onClick={() => setDeleteTarget(screenshot)}
                  aria-label={`Supprimer la capture ${screenshot.label ?? screenshot.fileName}`}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>

              <div className="screenshot-card__footer">
                {screenshot.label && (
                  <span className="screenshot-card__label">{screenshot.label}</span>
                )}
                {screenshot.timeframe && (
                  <span className="screenshot-card__timeframe">
                    {screenshot.timeframe}
                  </span>
                )}
                <span className="screenshot-card__date">
                  {formatDateTimeForSettings(screenshot.createdAt, settings)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Supprimer la capture"
        message={`Voulez-vous vraiment supprimer "${deleteTarget?.label ?? deleteTarget?.fileName}" ? Le fichier image sera definitivement supprime.`}
        confirmLabel="Supprimer"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {zoomTarget && (
        <div
          className="screenshot-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Apercu de la capture ${zoomTarget.title}`}
          onClick={() => setZoomTarget(null)}
        >
          <button
            type="button"
            className="screenshot-lightbox__close"
            onClick={() => setZoomTarget(null)}
            aria-label="Fermer l'apercu"
          >
            <X size={18} aria-hidden />
          </button>

          <figure
            className="screenshot-lightbox__content"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={zoomTarget.src}
              className="screenshot-lightbox__img"
              alt={zoomTarget.title}
              draggable={false}
            />
            <figcaption className="screenshot-lightbox__caption">
              <span className="screenshot-lightbox__title">{zoomTarget.title}</span>
              {zoomTarget.meta && (
                <span className="screenshot-lightbox__meta">{zoomTarget.meta}</span>
              )}
            </figcaption>
          </figure>
        </div>
      )}
    </section>
  );
}
