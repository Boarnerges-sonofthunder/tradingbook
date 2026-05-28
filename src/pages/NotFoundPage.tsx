// ============================================================
// NotFoundPage — Page 404
// ============================================================
// Affichée pour toute URL inconnue grâce à la route catch-all
// { path: "*" } dans router.tsx.
// La sidebar et la topbar restent visibles (AppLayout est parent),
// ce qui permet à l'utilisateur de naviguer facilement vers
// une page valide sans utiliser le bouton retour du navigateur.
// ============================================================

import { Link } from "react-router-dom";
import { AlertTriangle, Home } from "lucide-react";
import { ROUTES } from "../constants/routes";
import { useUserSettings } from "../hooks";
import { tr } from "../utils/i18n";

export default function NotFoundPage() {
  const settings = useUserSettings();

  return (
    <div className="not-found-page">
      <AlertTriangle
        className="not-found-icon"
        size={44}
        strokeWidth={1.5}
        aria-hidden
      />

      <p className="not-found-code">404</p>
      <h1 className="not-found-title">
        {tr(settings.language, "Page introuvable", "Page not found")}
      </h1>
      <p className="not-found-message">
        {tr(
          settings.language,
          "Cette page n'existe pas ou l'URL est incorrecte.",
          "This page does not exist or URL is invalid.",
        )}
      </p>

      {/* Lien retour : utilise la navigation interne (pas de rechargement) */}
      <Link to={ROUTES.DASHBOARD} className="not-found-btn">
        <Home size={14} aria-hidden />
        {tr(settings.language, "Retour au Dashboard", "Back to dashboard")}
      </Link>
    </div>
  );
}
