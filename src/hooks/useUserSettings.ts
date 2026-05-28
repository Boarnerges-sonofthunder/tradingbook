import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS } from "../types";
import type { UserSettings } from "../types";
import {
  getTypedSettings,
  USER_SETTINGS_CHANGED_EVENT,
} from "../services/settings/settingsService";

export function useUserSettings(): UserSettings {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const nextSettings = await getTypedSettings();
        if (!cancelled) setSettings(nextSettings);
      } catch {
        if (!cancelled) setSettings(DEFAULT_SETTINGS);
      }
    }

    void load();
    window.addEventListener(USER_SETTINGS_CHANGED_EVENT, load);

    return () => {
      cancelled = true;
      window.removeEventListener(USER_SETTINGS_CHANGED_EVENT, load);
    };
  }, []);

  return settings;
}
