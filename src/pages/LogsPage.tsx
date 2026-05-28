import { useEffect, useState } from "react";
import { FileText, RefreshCw } from "lucide-react";
import {
  getTodayLogFilename,
  listLogFiles,
  readLogFile,
  type LogFileInfo,
} from "../services/logging";
import { useNotification, useUserSettings } from "../hooks";
import { tr } from "../utils/i18n";

export default function LogsPage() {
  const notify = useNotification();
  const settings = useUserSettings();
  const [files, setFiles] = useState<LogFileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadFiles() {
    setLoading(true);
    try {
      const [today, list] = await Promise.all([
        getTodayLogFilename(),
        listLogFiles(),
      ]);
      setFiles(list);
      setSelectedFile((current) =>
        current && list.some((file) => file.filename === current)
          ? current
          : (list[0]?.filename ?? today),
      );
    } catch {
      notify.error(
        tr(
          settings.language,
          "Impossible de charger les fichiers logs",
          "Unable to load log files",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFiles();
    // Chargement initial uniquement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedFile) {
      setContent("");
      return;
    }

    let cancelled = false;
    readLogFile(selectedFile)
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch(() => {
        if (!cancelled) {
          setContent("");
        }
      });

    return () => {
      cancelled = true;
    };
    // Recharger le contenu uniquement quand le fichier sélectionné change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile]);

  return (
    <div className="content-max logs-page">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Logs système</h1>
          <p className="page-subtitle">
            {tr(
              settings.language,
              "Consultation locale des événements techniques de TradingBook.",
              "Local view of TradingBook technical events.",
            )}
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn-secondary btn-icon-text"
            onClick={() => void loadFiles()}
            disabled={loading}
          >
            <RefreshCw size={15} aria-hidden />
            {tr(settings.language, "Actualiser", "Refresh")}
          </button>
        </div>
      </div>

      <section className="page-section logs-layout">
        <div className="logs-panel">
          <h2 className="logs-section-title">
            {tr(settings.language, "Fichiers", "Files")}
          </h2>
          {files.length === 0 ? (
            <p className="logs-empty">
              {tr(
                settings.language,
                "Aucun fichier log disponible.",
                "No log file available.",
              )}
            </p>
          ) : (
            <div className="logs-file-list">
              {files.map((file) => (
                <button
                  key={file.filename}
                  type="button"
                  className={`logs-file-item${
                    selectedFile === file.filename
                      ? " logs-file-item--active"
                      : ""
                  }`}
                  onClick={() => setSelectedFile(file.filename)}
                >
                  <FileText size={15} aria-hidden />
                  <span>{file.filename}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="logs-panel logs-panel--viewer">
          <div className="logs-viewer-header">
            <h2 className="logs-section-title">
              {selectedFile ??
                tr(
                  settings.language,
                  "Aucun fichier sélectionné",
                  "No file selected",
                )}
            </h2>
            <span className="badge badge-neutral">local</span>
          </div>
          <pre className="logs-viewer">
            {content ||
              tr(
                settings.language,
                "Aucune entrée à afficher pour le moment.",
                "No entry to display for now.",
              )}
          </pre>
        </div>
      </section>
    </div>
  );
}
