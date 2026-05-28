// ============================================================
// Composant — TradingHabitsPanel
// ============================================================
// Affiche les habitudes détectées par le service analytics.
// Le composant reste purement présentational : pas de calcul métier.
// ============================================================

import { memo } from "react";
import type {
  HabitDetectionResult,
  HabitObservation,
  HabitImportance,
  HabitObservationCategory,
} from "../../../types";

interface TradingHabitsPanelProps {
  result: HabitDetectionResult;
}

function importanceLabel(importance: HabitImportance): string {
  if (importance === "high") return "Élevée";
  if (importance === "medium") return "Moyenne";
  return "Faible";
}

function importanceClass(importance: HabitImportance): string {
  if (importance === "high") return "pnl-table__td--negative";
  if (importance === "medium") return "rr-table__td--warning";
  return "pnl-table__td--neutral";
}

function categoryLabel(category: HabitObservationCategory): string {
  switch (category) {
    case "instrument":
      return "Symbole";
    case "session":
      return "Session";
    case "strategy":
      return "Stratégie";
    case "emotion":
      return "Émotion";
    case "mistake":
      return "Erreur";
    case "risk_plan":
      return "Plan de risque";
    case "risk_reward":
      return "Risk/Reward";
    case "timing":
      return "Timing";
    case "data_quality":
      return "Qualité des données";
    default:
      return "Observation";
  }
}

const HabitRow = memo(function HabitRow({ row }: { row: HabitObservation }) {
  return (
    <tr className="pnl-table__row">
      <td className="pnl-table__td strategy-table__name">{row.title}</td>
      <td className="pnl-table__td">{categoryLabel(row.category)}</td>
      <td className={`pnl-table__td ${importanceClass(row.importance)}`}>
        {importanceLabel(row.importance)}
      </td>
      <td className="pnl-table__td pnl-table__td--right">{row.sampleSize}</td>
      <td className="pnl-table__td">{row.summary}</td>
      <td className="pnl-table__td">
        {row.evidence.map((item) => (
          <div key={`${row.id}-${item.label}`}>
            <strong>{item.label}:</strong> {item.value}
          </div>
        ))}
      </td>
    </tr>
  );
});

const TradingHabitsPanel = memo(function TradingHabitsPanel({
  result,
}: TradingHabitsPanelProps) {
  if (result.observations.length === 0) {
    return (
      <p className="pnl-table__empty">
        Aucune habitude n&apos;a pu être détectée sur les trades fermés.
      </p>
    );
  }

  return (
    <div className="pnl-table-wrapper">
      <div className="pnl-table-scroll">
        <table className="pnl-table">
          <thead>
            <tr>
              <th className="pnl-table__th">Observation</th>
              <th className="pnl-table__th">Catégorie</th>
              <th className="pnl-table__th">Importance</th>
              <th className="pnl-table__th pnl-table__th--right">
                Échantillon
              </th>
              <th className="pnl-table__th">Résumé</th>
              <th className="pnl-table__th">Indicateurs</th>
            </tr>
          </thead>
          <tbody>
            {result.observations.map((observation) => (
              <HabitRow key={observation.id} row={observation} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="pnl-table__note">
        Observations descriptives classées par importance. Elles ne constituent
        pas un conseil financier et ne génèrent aucun signal buy/sell.
      </p>
    </div>
  );
});

export default TradingHabitsPanel;
