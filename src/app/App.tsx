import { useEffect, useMemo, useState } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { initDatabase } from "../services/database";
import { initAppFolders } from "../services/filesystem";
import { createAutomaticBackupIfNeeded } from "../services/backups";
import { logger } from "../services/logging";
import { checkAndInstallAppUpdate } from "../services/desktop";
import { getTypedSettings } from "../services/settings/settingsService";
import { applyTheme } from "../constants/theme";
import { useNotification } from "../hooks";
import {
  StartupSplashScreen,
  type StartupStep,
} from "../components/ui/StartupSplashScreen";
import AppErrorBoundary from "../components/errors/AppErrorBoundary";

type StartupStepKey = "sqlite" | "folders" | "settings";
type StartupStepStatus = "pending" | "running" | "success" | "error";

const STARTUP_STEP_ORDER: StartupStepKey[] = ["sqlite", "folders", "settings"];

const STARTUP_STEP_LABELS: Record<StartupStepKey, string> = {
  sqlite: "SQLite et migrations",
  folders: "Dossiers locaux",
  settings: "Chargement des parametres",
};

const STARTUP_TIMEOUTS_MS = {
  sqlite: 15_000,
  folders: 8_000,
  settings: 8_000,
  emergencyFallback: 25_000,
} as const;

function withTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`Timeout startup etape ${label} (${timeoutMs}ms)`));
    }, timeoutMs);

    task
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export default function App() {
  const notify = useNotification();
  const [isAppReady, setIsAppReady] = useState(true);
  const [startupStatusText, setStartupStatusText] = useState<string>(
    "Initialisation de TradingBook...",
  );
  const [stepStatuses, setStepStatuses] = useState<
    Record<StartupStepKey, StartupStepStatus>
  >({
    sqlite: "pending",
    folders: "pending",
    settings: "pending",
  });

  const startupSteps = useMemo<StartupStep[]>(
    () =>
      STARTUP_STEP_ORDER.map((key) => ({
        key,
        label: STARTUP_STEP_LABELS[key],
        status: stepStatuses[key],
      })),
    [stepStatuses],
  );

  useEffect(() => {
    let isMounted = true;

    const emergencyReadyTimerId = window.setTimeout(() => {
      if (!isMounted) return;
      logger.error(
        "Timeout global startup: ouverture UI forcee pour eviter splash bloque",
      );
      setStartupStatusText(
        "Demarrage degrade: verification logs systeme recommandee.",
      );
      setStepStatuses((prev) => ({
        sqlite: prev.sqlite === "success" ? "success" : "error",
        folders: prev.folders === "success" ? "success" : "error",
        settings: prev.settings === "success" ? "success" : "error",
      }));
      setIsAppReady(true);
    }, STARTUP_TIMEOUTS_MS.emergencyFallback);

    // IMPORTANT: startup non-bloquant.
    // UI doit rester utilisable meme si plugin SQLite/fs/settings tarde ou bloque.
    setIsAppReady(true);

    const setStepStatus = (
      step: StartupStepKey,
      status: StartupStepStatus,
    ): void => {
      if (!isMounted) return;
      setStepStatuses((prev) => ({ ...prev, [step]: status }));
    };

    const handleUnexpectedError = (event: ErrorEvent) => {
      logger.error(
        "Erreur inattendue window.error",
        event.error ?? event.message,
      );
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      logger.error("Promesse rejetee non capturee", event.reason);
    };
    const handleBeforeUnload = () => {
      logger.info("Application TradingBook fermee");
    };

    window.addEventListener("error", handleUnexpectedError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("beforeunload", handleBeforeUnload);

    const runStartup = async (): Promise<void> => {
      try {
        setStartupStatusText(
          "Initialisation SQLite et execution des migrations...",
        );
        setStepStatus("sqlite", "running");
        setStepStatus("folders", "running");

        // SQLite (avec migrations automatiques) et dossiers locaux sont lances
        // en parallele pour ne pas ralentir le demarrage.
        const [sqliteResult, foldersResult] = await Promise.allSettled([
          withTimeout(initDatabase(), STARTUP_TIMEOUTS_MS.sqlite, "sqlite"),
          withTimeout(initAppFolders(), STARTUP_TIMEOUTS_MS.folders, "folders"),
        ]);

        if (sqliteResult.status === "fulfilled") {
          setStepStatus("sqlite", "success");
        } else {
          setStepStatus("sqlite", "error");
          logger.error(
            "Echec initialisation SQLite/migrations",
            sqliteResult.reason,
          );
        }

        if (foldersResult.status === "fulfilled") {
          setStepStatus("folders", "success");
        } else {
          setStepStatus("folders", "error");
          logger.error(
            "Echec preparation dossiers locaux",
            foldersResult.reason,
          );
        }

        setStartupStatusText("Chargement des preferences utilisateur...");
        setStepStatus("settings", "running");

        try {
          const settings = await withTimeout(
            getTypedSettings(),
            STARTUP_TIMEOUTS_MS.settings,
            "settings",
          );
          applyTheme(settings.theme);
          setStepStatus("settings", "success");
          logger.info("Preferences utilisateur appliquees", {
            theme: settings.theme,
            language: settings.language,
            timezone: settings.timezone,
          });
        } catch (err) {
          setStepStatus("settings", "error");
          logger.error("Echec chargement des preferences utilisateur", err);
        }

        setStartupStatusText("Finalisation du demarrage...");

        // Les sauvegardes automatiques ne doivent pas bloquer l'ouverture de l'UI.
        void createAutomaticBackupIfNeeded().catch((err) => {
          logger.error("Echec creation sauvegarde automatique", err);
        });
      } catch (err) {
        logger.error("Echec startup inattendu", err);
        setStartupStatusText(
          "Demarrage degrade: verification logs systeme recommandee.",
        );
      } finally {
        if (isMounted) {
          window.clearTimeout(emergencyReadyTimerId);
          setIsAppReady(true);
        }
      }
    };

    void runStartup();

    logger.info("Application TradingBook demarree");

    return () => {
      isMounted = false;
      window.clearTimeout(emergencyReadyTimerId);
      window.removeEventListener("error", handleUnexpectedError);
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );
      window.removeEventListener("beforeunload", handleBeforeUnload);
      logger.info("Application TradingBook fermee");
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const runAutoUpdater = async (): Promise<void> => {
      const result = await checkAndInstallAppUpdate({
        onUpdateFound: (version) => {
          if (!isMounted) return;
          notify.info(
            `Mise a jour ${version} detectee. Telechargement et installation en cours...`,
            7_000,
          );
        },
        onUpdateInstalled: (version) => {
          if (!isMounted) return;
          notify.success(
            `Mise a jour ${version} installee. Redemarrez TradingBook pour appliquer version.`,
            9_000,
          );
        },
      });

      if (result === "failed") {
        logger.warn("Auto-update indisponible pour cette session");
      }
    };

    void runAutoUpdater();

    return () => {
      isMounted = false;
    };
  }, [notify]);

  if (!isAppReady) {
    return (
      <StartupSplashScreen
        appName="TradingBook"
        loadingText={startupStatusText}
        steps={startupSteps}
      />
    );
  }

  return (
    <AppErrorBoundary>
      <RouterProvider router={router} />
    </AppErrorBoundary>
  );
}
