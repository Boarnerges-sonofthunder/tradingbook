import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { createLogger } from "../logging";

const logger = createLogger("desktop-notification");

export interface DesktopNotificationInput {
  title: string;
  body: string;
}

export async function notifyDesktop(
  input: DesktopNotificationInput,
): Promise<boolean> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }

    if (!granted) {
      logger.info("Permission notifications desktop refusee");
      return false;
    }

    await sendNotification({
      title: input.title,
      body: input.body,
    });
    return true;
  } catch (error) {
    logger.warn(`Notification desktop impossible: ${String(error)}`);
    return false;
  }
}
