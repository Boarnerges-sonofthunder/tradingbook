// ============================================================
// src/services/desktop — Point d'entrée unique
// ============================================================
// Import all desktop services from this single entry point :
//   import { toggleMaximize, closeWindow } from "../services/desktop";
// ============================================================

export {
  minimizeWindow,
  maximizeWindow,
  unmaximizeWindow,
  toggleMaximize,
  isWindowMaximized,
  closeWindow,
  getWindowTitle,
  setWindowTitle,
} from "./windowService";

export { checkAndInstallAppUpdate } from "./updaterService";
export type { AppUpdateCallbacks, AppUpdateResult } from "./updaterService";

export { notifyDesktop } from "./notificationService";
export type { DesktopNotificationInput } from "./notificationService";
