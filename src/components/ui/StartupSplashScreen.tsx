export type StartupStepStatus = "pending" | "running" | "success" | "error";

export interface StartupStep {
  key: string;
  label: string;
  status: StartupStepStatus;
}

interface StartupSplashScreenProps {
  appName: string;
  loadingText: string;
  steps: StartupStep[];
}

export function StartupSplashScreen({
  appName,
  loadingText,
  steps,
}: StartupSplashScreenProps) {
  return (
    <section
      className="startup-splash"
      aria-live="polite"
      role="status"
      aria-label="Demarrage TradingBook en cours"
    >
      <div className="startup-splash__card">
        <div className="startup-splash__brand" aria-hidden>
          <img
            className="startup-splash__brand-icon"
            src="/tradingbook-icon.png"
            alt=""
          />
        </div>

        <div className="startup-splash__loader-row">
          <span className="startup-splash__spinner" aria-hidden />
        </div>

        {/* Conserver props utilisees pour compatibilite App, sans texte visible. */}
        <div style={{ display: "none" }} aria-hidden>
          {appName}
          {loadingText}
          {steps.length}
        </div>
      </div>
    </section>
  );
}
