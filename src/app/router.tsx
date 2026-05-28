// ============================================================
// Router — Configuration centralisée des routes (Hash Router)
// ============================================================
// Toutes les routes sont imbriquées sous AppLayout.
// AppLayout fournit la Sidebar fixe + <Outlet /> pour le contenu.
//
// Pour ajouter une route :
//   1. Ajouter la constante dans src/constants/routes.ts
//   2. Créer la page dans src/pages/
//   3. Ajouter un enfant dans le tableau children ci-dessous
//
// Route catch-all :
//   { path: "*" } est toujours en DERNIER — attrape toute URL inconnue.
//   NotFoundPage s'affiche toujours dans AppLayout (sidebar visible).
// ============================================================

import { lazy, Suspense } from "react";
import type { ComponentType, LazyExoticComponent, ReactElement } from "react";
import { createHashRouter } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import RouteLoader from "../components/ui/RouteLoader";
import StartupRedirectPage from "../pages/StartupRedirectPage";
import TradesPage from "../pages/TradesPage";
import NewTradePage from "../pages/NewTradePage";
import TradeDetailsPage from "../pages/TradeDetailsPage";
import CalendarPage from "../pages/CalendarPage";
import BacktestingPage from "../pages/BacktestingPage";
import StrategiesPage from "../pages/StrategiesPage";
import AccountsPage from "../pages/AccountsPage";
import ScreenshotsPage from "../pages/ScreenshotsPage";
import SettingsPage from "../pages/SettingsPage";
import NotFoundPage from "../pages/NotFoundPage";

const AnalyticsPage = lazy(() => import("../pages/AnalyticsPage"));
const ReplayPage = lazy(() => import("../pages/ReplayPage"));
const ImportsPage = lazy(() => import("../pages/ImportsPage"));
const MT5SyncPage = lazy(() => import("../pages/MT5SyncPage"));
const BackupsPage = lazy(() => import("../pages/BackupsPage"));
const LogsPage = lazy(() => import("../pages/LogsPage"));

function renderLazyPage(
  Page: LazyExoticComponent<ComponentType>,
  title: string,
  message: string,
): ReactElement {
  return (
    <Suspense fallback={<RouteLoader title={title} message={message} />}>
      <Page />
    </Suspense>
  );
}

export const router = createHashRouter([
  {
    // Route parente : le shell de l'application (sidebar + contenu)
    path: "/",
    element: <AppLayout />,
    children: [
      // index=true → correspond exactement à "/"
      { index: true, element: <StartupRedirectPage /> },
      { path: "trades", element: <TradesPage /> },
      {
        path: "replay",
        element: renderLazyPage(
          ReplayPage,
          "Chargement du replay des trades",
          "Préparation de la relecture historique…",
        ),
      },
      // "new" est déclaré avant ":id" (bonne pratique ; le routing v7 est rank-based)
      { path: "trades/new", element: <NewTradePage /> },
      { path: "trades/:id", element: <TradeDetailsPage /> },
      {
        path: "analytics",
        element: renderLazyPage(
          AnalyticsPage,
          "Chargement des analytics",
          "Les graphiques et les statistiques arrivent…",
        ),
      },
      { path: "backtesting", element: <BacktestingPage /> },
      { path: "calendar", element: <CalendarPage /> },
      {
        path: "imports",
        element: renderLazyPage(
          ImportsPage,
          "Chargement des imports CSV",
          "Préparation des outils de validation et d'import…",
        ),
      },
      {
        path: "mt5",
        element: renderLazyPage(
          MT5SyncPage,
          "Chargement de la synchronisation MT5",
          "Préparation de la connexion et des vues MT5…",
        ),
      },
      { path: "strategies", element: <StrategiesPage /> },
      { path: "accounts", element: <AccountsPage /> },
      { path: "screenshots", element: <ScreenshotsPage /> },
      {
        path: "backups",
        element: renderLazyPage(
          BackupsPage,
          "Chargement des backups",
          "Préparation de l'historique des sauvegardes…",
        ),
      },
      {
        path: "logs",
        element: renderLazyPage(
          LogsPage,
          "Chargement des logs",
          "Préparation de la consultation locale…",
        ),
      },
      { path: "settings", element: <SettingsPage /> },
      // Catch-all : toute URL non reconnue → page 404 (toujours en dernier)
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
