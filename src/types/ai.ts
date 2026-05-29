export type AIRole = "system" | "user" | "assistant";

export interface AIChatMessage {
  id: string;
  role: AIRole;
  content: string;
  createdAt: string;
  error?: boolean;
}

export interface AIAnalyticsSummary {
  winRate: number;
  profitFactor: number | null;
  drawdown: number;
  totalNetPnl: number;
  totalTrades: number;
  currency: string;
}

export interface AIAnalyticsExport {
  generatedAt: string;
  context?: {
    scopeLabel: string | null;
    filters: AIAnalyticsFilters;
  };
  analytics: AIAnalyticsSummary;
  pnl: {
    totalNetPnl: number;
    totalGrossPnl: number;
    totalFees: number;
    averagePnl: number;
    bestTrade: number;
    worstTrade: number;
  };
  drawdown: {
    maxDrawdown: number;
    maxDrawdownPct: number;
    currentDrawdown: number;
    currentDrawdownPct: number;
    recoveryTrades: number | null;
  };
  riskManagement: {
    avgRR: number | null;
    pctWithSL: number;
    pctWithTP: number;
    profitFactor: number | null;
  };
  habits: string[];
  emotions: string[];
  errors: string[];
  tradeNotes: Array<{
    tradeId: number;
    tradeSymbol: string;
    content: string;
    createdAt: string;
    updatedAt: string;
  }>;
  tradeMistakes: Array<{
    tradeId: number;
    tradeSymbol: string;
    mistakeName: string;
    notes: string | null;
    createdAt: string;
  }>;
  strategies: Array<{
    strategyName: string;
    totalTrades: number;
    winRate: number;
    netPnl: number;
  }>;
  sessions: Array<{
    sessionName: string;
    totalTrades: number;
    winRate: number;
    netPnl: number;
  }>;
  symbols: Array<{
    symbol: string;
    totalTrades: number;
    winRate: number;
    netPnl: number;
  }>;
  limitations: string[];
}

export interface AIConversationState {
  id: string;
  updatedAt: string;
  messages: AIChatMessage[];
}

export interface AIMemoryFact {
  id: string;
  content: string;
  source: "user_preference" | "user_goal" | "user_rule" | "user_context";
  scopeKey?: string | null;
  scopeLabel?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AIMemorySummary {
  id: string;
  content: string;
  scopeKey?: string | null;
  scopeLabel?: string | null;
  createdAt: string;
}

export interface AIMemoryState {
  facts: AIMemoryFact[];
  summaries: AIMemorySummary[];
  updatedAt: string;
}

export interface AIMemoryScope {
  key: string;
  label: string;
}

export interface AIAnalyticsFilters {
  symbol?: string;
  strategyId?: number | null;
  broker?: string;
  accountId?: string;
  tradingAccountId?: number | null;
}

export interface AIInsightCard {
  id: string;
  title: string;
  summary: string;
  severity: "positive" | "warning" | "neutral";
  evidence: string[];
}

export interface AIChatRequest {
  userMessage: string;
  conversation: AIConversationState;
  analyticsFilters?: AIAnalyticsFilters;
  memoryScope?: AIMemoryScope | null;
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  onToken?: (token: string) => void;
}

export interface AIChatResponse {
  message: AIChatMessage;
  exportPath: string;
  logsPath: string;
}
