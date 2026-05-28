import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/theme.css";
import "./styles/globals.css";
import "./styles/layout.css";
import "./styles/backtesting.css";

const rootElement = document.getElementById("root") as HTMLElement | null;

if (rootElement) {
  rootElement.setAttribute("data-react-boot", "init");
  (
    window as Window & { __TRADINGBOOK_BOOT_STAGE__?: string }
  ).__TRADINGBOOK_BOOT_STAGE__ = "react-init";
}

try {
  if (!rootElement) {
    throw new Error("Element #root introuvable");
  }

  const bootstrap = async (): Promise<void> => {
    try {
      const appModule = await import("./app/App");
      const App = appModule.default;

      ReactDOM.createRoot(rootElement).render(
        <React.StrictMode>
          <App />
        </React.StrictMode>,
      );

      rootElement.setAttribute("data-react-mounted", "true");
      rootElement.setAttribute("data-react-boot", "mounted");
      (
        window as Window & { __TRADINGBOOK_BOOT_STAGE__?: string }
      ).__TRADINGBOOK_BOOT_STAGE__ = "react-mounted";
    } catch (error) {
      rootElement.setAttribute("data-react-boot", "failed");
      const technicalMessage =
        error instanceof Error ? error.message : String(error);
      rootElement.innerHTML =
        '<section style="padding:24px;font-family:Segoe UI,system-ui,sans-serif;color:#ffd4d4;background:#1a1010;min-height:100vh;box-sizing:border-box;">' +
        '<h1 style="margin:0 0 10px;font-size:20px;">Erreur de demarrage TradingBook</h1>' +
        '<p style="margin:0 0 8px;">Le chargement du module principal a echoue.</p>' +
        '<p style="margin:0 0 6px;font-size:13px;opacity:0.9;">Consultez les logs locaux puis relancez l\'application.</p>' +
        `<pre style=\"margin:0;padding:10px;background:#2a1414;border:1px solid #5a2a2a;border-radius:8px;white-space:pre-wrap;font-size:12px;\">${technicalMessage}</pre>` +
        "</section>";

      console.error("[boot] Echec import App", error);
      throw error;
    }
  };

  void bootstrap();
} catch (error) {
  if (rootElement) {
    rootElement.setAttribute("data-react-boot", "failed");
    rootElement.innerHTML =
      '<section style="padding:24px;font-family:Segoe UI,system-ui,sans-serif;color:#ffd4d4;background:#1a1010;min-height:100vh;box-sizing:border-box;">' +
      '<h1 style="margin:0 0 10px;font-size:20px;">Erreur de demarrage TradingBook</h1>' +
      "<p style=\"margin:0 0 8px;\">Le rendu React a echoue avant l'affichage de l'application.</p>" +
      '<p style="margin:0;font-size:13px;opacity:0.9;">Consultez les logs locaux puis relancez l\'application.</p>' +
      "</section>";
  }

  console.error("[boot] Echec bootstrap React", error);
  throw error;
}
