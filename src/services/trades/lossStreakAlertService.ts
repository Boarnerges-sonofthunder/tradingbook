import { useUIStore } from "../../stores";
import type { Trade } from "../../types";
import { createLogger } from "../logging";
import { findRecentClosedTrades } from "../../repositories/tradesRepository";
import { getTypedSettings } from "../settings/settingsService";
import { notifyDesktop } from "../desktop/notificationService";

const logger = createLogger("loss-streak-alert");

const TWO_LOSSES_ALERT_MESSAGE =
  "Tu as fais deux pertes de suite. Assure toi que le marché ne rentre pas dans un range avant de prendre une autre position. Si le marché ne decide pas de dépasser les zones clées en haut et en bas qui sont proche alors il rentre probable dans un range. Il serait plus sage d'attendre qu'il sorte de là";
const TWO_LOSSES_ALERT_TITLE = "Alerte discipline TradingBook";

function isLoss(trade: Trade | undefined): boolean {
  if (!trade) return false;
  if (trade.status !== "closed") return false;
  return (trade.netPnl ?? 0) < 0;
}

/**
 * Déclenche un warning UI si les 2 derniers trades clôturés sont perdants.
 * Ne notifie que quand le trade déclencheur est le plus récent des clôtures.
 */
export async function notifyIfTwoConsecutiveLosses(
  triggerTrade: Trade,
): Promise<void> {
  if (!isLoss(triggerTrade)) return;

  try {
    const settings = await getTypedSettings();
    if (!settings.twoConsecutiveLossAlertEnabled) return;

    const recentClosedTrades = await findRecentClosedTrades(2);
    if (recentClosedTrades.length < 2) return;

    const [latest, previous] = recentClosedTrades;
    if (latest.id !== triggerTrade.id) return;
    if (!isLoss(latest) || !isLoss(previous)) return;

    useUIStore.getState().addNotification({
      type: "warning",
      message: TWO_LOSSES_ALERT_MESSAGE,
      duration: 12_000,
    });
    await notifyDesktop({
      title: TWO_LOSSES_ALERT_TITLE,
      body: TWO_LOSSES_ALERT_MESSAGE,
    });
  } catch (error) {
    logger.warn(
      `Alerte 2 pertes consecutives non declenchee: ${String(error)}`,
    );
  }
}
