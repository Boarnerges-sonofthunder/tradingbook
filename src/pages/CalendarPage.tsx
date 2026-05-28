// ============================================================
// Page - Calendrier
// ============================================================
// Vue dediee aux calendriers de performance.
// Les donnees viennent du service analytics; les composants affichent
// uniquement les statistiques quotidiennes deja preparees.
// ============================================================

import { useEffect, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { useUserSettings } from "../hooks";
import { getPerformanceCalendarStats } from "../services/analytics";
import { tr } from "../utils/i18n";
import DailyPnLCalendarHeatmap from "../features/analytics/components/DailyPnLCalendarHeatmap";
import type { PerformanceCalendarResult } from "../types";

function CalendarLoadingSkeleton() {
  return (
    <>
      <div className="performance-month-summary performance-month-summary--loading">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="stat-card stat-card--skeleton" />
        ))}
      </div>
      <div className="chart-card">
        <div className="chart-card__body">
          <div
            className="stat-card stat-card--skeleton"
            style={{ minHeight: 360 }}
          />
        </div>
      </div>
    </>
  );
}

function CalendarEmptyState({ language }: { language: "fr" | "en" }) {
  return (
    <div className="dashboard-empty">
      <div className="dashboard-empty__icon">
        <CalendarDays size={28} aria-hidden />
      </div>
      <h2 className="dashboard-empty__title">
        {tr(language, "Aucun trade clôturé", "No closed trades")}
      </h2>
      <p className="dashboard-empty__text">
        {tr(
          language,
          "Les calendriers se rempliront automatiquement avec les trades fermés.",
          "Calendars will fill automatically with closed trades.",
        )}
      </p>
    </div>
  );
}

export default function CalendarPage() {
  const settings = useUserSettings();
  const [result, setResult] = useState<PerformanceCalendarResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function loadCalendar() {
    setLoading(true);
    setError(false);

    try {
      const stats = await getPerformanceCalendarStats();
      setResult(stats);
    } catch (err) {
      console.error("[CalendarPage] Erreur chargement calendrier :", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCalendar();
  }, []);

  const hasData = result !== null && !result.isEmpty;

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <div className="analytics-header__text">
          <h1 className="analytics-header__title">Calendrier</h1>
          <p className="analytics-header__subtitle">
            {tr(
              settings.language,
              "Vue mensuelle des performances sur les trades clôturés",
              "Monthly performance view on closed trades",
            )}
          </p>
        </div>
        <button
          className="analytics-header__refresh"
          onClick={() => void loadCalendar()}
          disabled={loading}
          title={tr(
            settings.language,
            "Rafraîchir le calendrier",
            "Refresh calendar",
          )}
          aria-label={tr(
            settings.language,
            "Rafraîchir le calendrier",
            "Refresh calendar",
          )}
        >
          <RefreshCw size={15} className={loading ? "spin" : ""} />
        </button>
      </div>

      {loading && <CalendarLoadingSkeleton />}

      {!loading && error && (
        <div className="dashboard-error">
          <p>
            {tr(
              settings.language,
              "Impossible de charger le calendrier.",
              "Unable to load calendar.",
            )}
          </p>
          <button
            className="dashboard-error__retry"
            onClick={() => void loadCalendar()}
          >
            {tr(settings.language, "Réessayer", "Retry")}
          </button>
        </div>
      )}

      {!loading && !error && !hasData && (
        <CalendarEmptyState language={settings.language} />
      )}

      {!loading && !error && hasData && (
        <>
          <section className="analytics-section">
            <h2 className="analytics-section__title">
              {tr(
                settings.language,
                "Calendrier de performance quotidien",
                "Daily performance calendar",
              )}
            </h2>
            <DailyPnLCalendarHeatmap
              days={result.days}
              months={result.months}
              currency={settings.defaultCurrency}
              isEmpty={result.isEmpty}
            />
          </section>
        </>
      )}
    </div>
  );
}
