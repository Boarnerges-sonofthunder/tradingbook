import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import DashboardPage from "./DashboardPage";
import { getTypedSettings } from "../services/settings/settingsService";
import type { StartupPagePreference } from "../types";

export default function StartupRedirectPage() {
  const [startupPage, setStartupPage] = useState<StartupPagePreference | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    getTypedSettings()
      .then((settings) => {
        if (!cancelled) setStartupPage(settings.defaultStartupPage);
      })
      .catch(() => {
        if (!cancelled) setStartupPage("/");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (startupPage === null) return null;
  if (startupPage === "/") return <DashboardPage />;

  return <Navigate to={startupPage} replace />;
}
