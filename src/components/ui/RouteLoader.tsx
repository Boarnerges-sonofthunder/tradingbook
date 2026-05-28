import { LoaderCircle } from "lucide-react";

interface RouteLoaderProps {
  title?: string;
  message?: string;
  compact?: boolean;
}

export default function RouteLoader({
  title = "Chargement de la page",
  message = "Préparation du module…",
  compact = false,
}: RouteLoaderProps) {
  return (
    <div
      className={`route-loader${compact ? " route-loader--compact" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="route-loader__card">
        <LoaderCircle
          size={compact ? 18 : 22}
          className="route-loader__icon spin"
          aria-hidden
        />
        <div className="route-loader__content">
          <p className="route-loader__title">{title}</p>
          <p className="route-loader__message">{message}</p>
        </div>
      </div>
    </div>
  );
}
