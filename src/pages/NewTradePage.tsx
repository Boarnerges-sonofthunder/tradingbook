import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import TradeForm from "../components/forms/TradeForm";
import { ROUTES } from "../constants";
import { useUserSettings } from "../hooks";
import type { Trade } from "../types";
import { tr } from "../utils/i18n";

export default function NewTradePage() {
  const navigate = useNavigate();
  const settings = useUserSettings();

  function handleSuccess(trade: Trade) {
    navigate(ROUTES.TRADE_DETAILS.replace(":id", String(trade.id)));
  }

  function handleCancel() {
    navigate(ROUTES.TRADES);
  }

  return (
    <div className="content-max">
      <div className="page-header">
        <Link to={ROUTES.TRADES} className="page-back-link">
          <ArrowLeft size={14} aria-hidden />
          {tr(settings.language, "Retour aux trades", "Back to trades")}
        </Link>
        <div className="page-header-text">
          <h1 className="page-title">
            {tr(settings.language, "Nouveau trade", "New trade")}
          </h1>
          <p className="page-subtitle">
            {tr(
              settings.language,
              "Enregistrer un trade manuellement dans le journal.",
              "Record a trade manually in the journal.",
            )}
          </p>
        </div>
      </div>

      <TradeForm onSuccess={handleSuccess} onCancel={handleCancel} />
    </div>
  );
}
