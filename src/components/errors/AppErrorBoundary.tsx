import { Component, type ErrorInfo, type ReactNode } from "react";
import { logger } from "../../services/logging";
import CriticalErrorDialog from "../ui/CriticalErrorDialog";
import { useUIStore } from "../../stores";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

// Boundary global de l'interface.
// Capture erreurs de rendu, lifecycle et lazy-loading React.
export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error("Erreur UI inattendue", {
      error,
      componentStack: errorInfo.componentStack,
    });

    useUIStore.getState().addNotification({
      type: "error",
      message: "Erreur critique de l'interface. Rechargez TradingBook.",
      duration: null,
    });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <CriticalErrorDialog
          isOpen
          title="TradingBook a rencontré un problème"
          message="L'interface a rencontré une erreur inattendue. Vos données restent locales. Rechargez l'application pour reprendre."
          onReload={this.handleReload}
        />
      );
    }

    return this.props.children;
  }
}
