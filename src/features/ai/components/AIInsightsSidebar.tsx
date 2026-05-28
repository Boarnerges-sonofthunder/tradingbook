import type { AIInsightCard } from "../../../types/ai";
import { useUserSettings } from "../../../hooks";
import { tr } from "../../../utils/i18n";

interface AIInsightsSidebarProps {
  cards: AIInsightCard[];
}

export default function AIInsightsSidebar({ cards }: AIInsightsSidebarProps) {
  const settings = useUserSettings();

  return (
    <aside
      className="ai-insights-sidebar"
      aria-label={tr(settings.language, "Insights IA", "AI insights")}
    >
      <div className="ai-insights-sidebar__list">
        {cards.length === 0 && (
          <p className="ai-insights-sidebar__empty">
            {tr(settings.language, "Aucun insight IA.", "No AI insight.")}
          </p>
        )}

        {cards.map((card) => (
          <section
            key={card.id}
            className={`ai-insight-card ai-insight-card--${card.severity}`}
          >
            <h3 className="ai-insight-card__title">{card.title}</h3>
            <p className="ai-insight-card__summary">{card.summary}</p>
            <ul className="ai-insight-card__evidence">
              {card.evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
}
