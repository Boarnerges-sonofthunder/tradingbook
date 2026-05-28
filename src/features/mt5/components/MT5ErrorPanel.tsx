// ============================================================
// MT5ErrorPanel - user-facing MT5 error display
// ============================================================
// Shows simple recovery guidance only. Technical details are written by
// mt5ErrorService to local logs and are intentionally not rendered here.
// ============================================================

import { AlertCircle, ChevronRight } from "lucide-react";
import { buildMT5UserFacingError } from "../../../services/mt5";

interface MT5ErrorPanelProps {
  errorCode?: string | null;
  message?: string | null;
  title?: string;
  compact?: boolean;
  showActions?: boolean;
  className?: string;
}

export function MT5ErrorPanel({
  errorCode,
  message,
  title,
  compact = false,
  showActions = true,
  className,
}: MT5ErrorPanelProps) {
  const error = buildMT5UserFacingError({
    code: errorCode,
    message,
    context: "ui",
  });

  const classes = [
    "mt5-error-panel",
    `mt5-error-panel--${error.severity}`,
    compact ? "mt5-error-panel--compact" : null,
    className ?? null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <div className="mt5-error-panel__header">
        <AlertCircle size={compact ? 14 : 16} aria-hidden />
        <div className="mt5-error-panel__heading">
          <span className="mt5-error-panel__title">
            {title ?? error.title}
          </span>
          <span className="mt5-error-panel__code">{error.code}</span>
        </div>
      </div>

      <p className="mt5-error-panel__message">{error.message}</p>

      {showActions && error.actions.length > 0 && (
        <ol className="mt5-error-panel__actions">
          {error.actions.map((action) => (
            <li key={`${error.code}-${action.title}`} className="mt5-error-panel__action">
              <ChevronRight size={12} aria-hidden />
              <span>{action.title}</span>
              {action.command && <code>{action.command}</code>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
