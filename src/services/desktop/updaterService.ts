import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { createLogger } from "../logging";

const updateLogger = createLogger("updater");
const UPDATE_CHECK_TIMEOUT_MS = 15_000;

export type AppUpdateResult = "updated" | "none" | "failed";

export type AppUpdateCallbacks = {
  onUpdateFound?: (version: string) => void;
  onDownloadProgress?: (percent: number) => void;
  onUpdateInstalled?: (version: string) => void;
  onError?: (error: unknown) => void;
};

function safeProgressPercent(downloaded: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((downloaded / total) * 100)));
}

export async function checkAndInstallAppUpdate(
  callbacks: AppUpdateCallbacks = {},
): Promise<AppUpdateResult> {
  if (import.meta.env.DEV) {
    updateLogger.debug("Verification update ignoree en mode developpement");
    return "none";
  }

  let update: Awaited<ReturnType<typeof check>> | null = null;

  try {
    update = await check({ timeout: UPDATE_CHECK_TIMEOUT_MS });

    if (!update) {
      updateLogger.info("Aucune mise a jour disponible");
      return "none";
    }

    updateLogger.info("Mise a jour detectee", {
      currentVersion: update.currentVersion,
      nextVersion: update.version,
      date: update.date,
    });
    callbacks.onUpdateFound?.(update.version);

    let downloaded = 0;
    let contentLength = 0;

    await update.downloadAndInstall((event: DownloadEvent) => {
      if (event.event === "Started") {
        contentLength = event.data.contentLength ?? 0;
        callbacks.onDownloadProgress?.(0);
        return;
      }

      if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        callbacks.onDownloadProgress?.(
          safeProgressPercent(downloaded, contentLength),
        );
      }
    });

    updateLogger.info("Mise a jour installee", { version: update.version });
    callbacks.onUpdateInstalled?.(update.version);
    return "updated";
  } catch (error) {
    updateLogger.warn("Echec workflow auto-update", error);
    callbacks.onError?.(error);
    return "failed";
  } finally {
    if (update) {
      await update.close().catch(() => {});
    }
  }
}
