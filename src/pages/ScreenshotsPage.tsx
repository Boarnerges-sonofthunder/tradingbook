import { useUserSettings } from "../hooks";
import { tr } from "../utils/i18n";

export default function ScreenshotsPage() {
  const settings = useUserSettings();

  return (
    <div>
      <h1>{tr(settings.language, "Captures d'écran", "Screenshots")}</h1>
      <p>
        {tr(
          settings.language,
          "Galerie des captures d'écran associées à vos trades.",
          "Gallery of screenshots linked to your trades.",
        )}
      </p>
    </div>
  );
}
