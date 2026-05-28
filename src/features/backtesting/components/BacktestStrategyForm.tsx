import { useEffect, useMemo, useState } from "react";
import type {
  BacktestRuleSet,
  BacktestStrategy,
  BacktestStrategyInput,
  ChartTimeframe,
} from "../../../types";

interface BacktestStrategyFormProps {
  selectedStrategy: BacktestStrategy | null;
  availableSymbols: string[];
  onSave: (id: number | null, input: BacktestStrategyInput) => Promise<void>;
  loading: boolean;
}

interface FormState {
  name: string;
  symbol: string;
  timeframe: ChartTimeframe;
  entryRules: BacktestRuleSet;
  exitRules: BacktestRuleSet;
  stopLossPercent: number;
  takeProfitPercent: number;
  riskRewardRatio: number;
  session: string;
  testPeriodStart: string;
  testPeriodEnd: string;
  initialCapital: number;
  riskPerTradePercent: number;
  commissionPerTrade: number;
  spreadPoints: number;
  direction: "long" | "short" | "both";
  notes: string;
}

const TIMEFRAMES: ChartTimeframe[] = [
  "M1",
  "M5",
  "M15",
  "M30",
  "H1",
  "H4",
  "D1",
];

function toLocalDateInput(iso: string): string {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString().slice(0, 10);
}

function getDefaultRuleSet(): BacktestRuleSet {
  return {
    operator: "all",
    conditions: [{ type: "close_above_open" }],
  };
}

function normalizeRuleSet(
  value: BacktestRuleSet | undefined | null,
  fallback: BacktestRuleSet,
): BacktestRuleSet {
  if (
    !value ||
    !Array.isArray(value.conditions) ||
    value.conditions.length === 0
  ) {
    return fallback;
  }
  if (value.operator !== "all" && value.operator !== "any") {
    return fallback;
  }
  return value;
}

function makeState(
  strategy: BacktestStrategy | null,
  fallbackSymbol: string,
): FormState {
  if (!strategy) {
    return {
      name: "",
      symbol: fallbackSymbol,
      timeframe: "M15",
      entryRules: getDefaultRuleSet(),
      exitRules: {
        operator: "any",
        conditions: [{ type: "close_below_open" }],
      },
      stopLossPercent: 0.5,
      takeProfitPercent: 1,
      riskRewardRatio: 2,
      session: "all",
      testPeriodStart: "",
      testPeriodEnd: "",
      initialCapital: 10000,
      riskPerTradePercent: 1,
      commissionPerTrade: 0,
      spreadPoints: 10,
      direction: "both",
      notes: "",
    };
  }

  return {
    name: strategy.name,
    symbol: strategy.symbol,
    timeframe: strategy.timeframe,
    entryRules: normalizeRuleSet(strategy.entryRules, getDefaultRuleSet()),
    exitRules: normalizeRuleSet(strategy.exitRules, {
      operator: "any",
      conditions: [{ type: "close_below_open" }],
    }),
    stopLossPercent: strategy.stopLossPercent,
    takeProfitPercent: strategy.takeProfitPercent,
    riskRewardRatio: strategy.riskRewardRatio,
    session: strategy.session,
    testPeriodStart: toLocalDateInput(strategy.testPeriodStart),
    testPeriodEnd: toLocalDateInput(strategy.testPeriodEnd),
    initialCapital: strategy.initialCapital,
    riskPerTradePercent: strategy.riskPerTradePercent,
    commissionPerTrade: strategy.commissionPerTrade,
    spreadPoints: strategy.spreadPoints,
    direction: strategy.direction,
    notes: strategy.notes ?? "",
  };
}

export default function BacktestStrategyForm({
  selectedStrategy,
  availableSymbols,
  onSave,
  loading,
}: BacktestStrategyFormProps) {
  const fallbackSymbol = useMemo(
    () => availableSymbols[0] ?? "EURUSD",
    [availableSymbols],
  );
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<FormState>(() =>
    makeState(selectedStrategy, fallbackSymbol),
  );

  useEffect(() => {
    setState(makeState(selectedStrategy, fallbackSymbol));
    setError(null);
  }, [selectedStrategy, fallbackSymbol]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    try {
      const safeEntryRules = normalizeRuleSet(
        state.entryRules,
        getDefaultRuleSet(),
      );
      const safeExitRules = normalizeRuleSet(state.exitRules, {
        operator: "any",
        conditions: [{ type: "close_below_open" }],
      });

      await onSave(selectedStrategy?.id ?? null, {
        name: state.name.trim(),
        symbol: state.symbol.trim().toUpperCase(),
        timeframe: state.timeframe,
        entryRules: safeEntryRules,
        exitRules: safeExitRules,
        stopLossPercent: state.stopLossPercent,
        takeProfitPercent: state.takeProfitPercent,
        riskRewardRatio: state.riskRewardRatio,
        session: state.session,
        testPeriodStart: new Date(state.testPeriodStart).toISOString(),
        testPeriodEnd: new Date(state.testPeriodEnd).toISOString(),
        initialCapital: state.initialCapital,
        riskPerTradePercent: state.riskPerTradePercent,
        commissionPerTrade: state.commissionPerTrade,
        spreadPoints: state.spreadPoints,
        direction: state.direction,
        notes: state.notes.trim() || null,
      });

      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Erreur formulaire strategie.",
      );
    }
  }

  return (
    <section className="card backtest-card">
      <h2 className="backtest-card__title">Createur de strategie</h2>
      {error && <p className="form-errors-banner">{error}</p>}

      <form className="backtest-form-grid" onSubmit={handleSubmit}>
        <label>
          Nom
          <input
            value={state.name}
            onChange={(event) =>
              setState((current) => ({ ...current, name: event.target.value }))
            }
            required
          />
        </label>

        <label>
          Symbole
          <input
            list="backtest-symbols"
            value={state.symbol}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                symbol: event.target.value,
              }))
            }
            required
          />
          <datalist id="backtest-symbols">
            {availableSymbols.map((symbol) => (
              <option key={symbol} value={symbol} />
            ))}
          </datalist>
        </label>

        <label>
          Timeframe
          <select
            value={state.timeframe}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                timeframe: event.target.value as ChartTimeframe,
              }))
            }
          >
            {TIMEFRAMES.map((timeframe) => (
              <option key={timeframe} value={timeframe}>
                {timeframe}
              </option>
            ))}
          </select>
        </label>

        <label>
          Session
          <select
            value={state.session}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                session: event.target.value,
              }))
            }
          >
            <option value="all">Toutes</option>
            <option value="asian">Asiatique</option>
            <option value="london">Londres</option>
            <option value="new_york">New York</option>
          </select>
        </label>

        <label>
          Debut test
          <input
            type="date"
            value={state.testPeriodStart}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                testPeriodStart: event.target.value,
              }))
            }
            required
          />
        </label>

        <label>
          Fin test
          <input
            type="date"
            value={state.testPeriodEnd}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                testPeriodEnd: event.target.value,
              }))
            }
            required
          />
        </label>

        <label>
          Capital initial
          <input
            type="number"
            min={100}
            step={100}
            value={state.initialCapital}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                initialCapital: Number(event.target.value),
              }))
            }
          />
        </label>

        <label>
          Risque / trade (%)
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={state.riskPerTradePercent}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                riskPerTradePercent: Number(event.target.value),
              }))
            }
          />
        </label>

        <label>
          Stop Loss (%)
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={state.stopLossPercent}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                stopLossPercent: Number(event.target.value),
              }))
            }
          />
        </label>

        <label>
          Take Profit (%)
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={state.takeProfitPercent}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                takeProfitPercent: Number(event.target.value),
              }))
            }
          />
        </label>

        <label>
          Risk/Reward
          <input
            type="number"
            min={0.2}
            step={0.1}
            value={state.riskRewardRatio}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                riskRewardRatio: Number(event.target.value),
              }))
            }
          />
        </label>

        <label>
          Direction
          <select
            value={state.direction}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                direction: event.target.value as FormState["direction"],
              }))
            }
          >
            <option value="both">Both</option>
            <option value="long">Long only</option>
            <option value="short">Short only</option>
          </select>
        </label>

        <label>
          Commission / trade
          <input
            type="number"
            min={0}
            step={0.01}
            value={state.commissionPerTrade}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                commissionPerTrade: Number(event.target.value),
              }))
            }
          />
        </label>

        <label>
          Spread (points)
          <input
            type="number"
            min={0}
            step={0.1}
            value={state.spreadPoints}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                spreadPoints: Number(event.target.value),
              }))
            }
          />
        </label>

        <label className="backtest-form-grid__wide">
          Notes
          <textarea
            rows={3}
            value={state.notes}
            onChange={(event) =>
              setState((current) => ({ ...current, notes: event.target.value }))
            }
          />
        </label>

        <div className="backtest-form-grid__wide backtest-form-grid__actions">
          <button type="submit" className="btn-primary" disabled={loading}>
            {selectedStrategy ? "Mettre a jour strategie" : "Creer strategie"}
          </button>
        </div>
      </form>
    </section>
  );
}
