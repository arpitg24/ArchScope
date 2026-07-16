import { Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';

// ── Requirements model ─────────────────────────────────────
export interface Requirements {
  useCase?: string;
  description?: string;
  expectedUsers?: number;
  expectedRps?: number;
  readWriteRatio?: string;
  latencyTargetMs?: number;
  monthlyBudgetUsd?: number;
  cloudProvider?: string;
  needsCaching?: boolean;
  needsAsyncProcessing?: boolean;
  needsRateLimiting?: boolean;
  needsNotifications?: boolean;
  userExpertise?: 'beginner' | 'intermediate' | 'expert';
  confidenceScore?: number;
}

// ── Simulation results passed from the frontend ─────────────
export interface SimulationResultSummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgLatencyMs: number;
  p99LatencyMs: number;
  actualThroughputRps: number;
  totalCostPerHour: number;
  totalCostPerMonth: number;
  bottlenecks: { nodeLabel: string; reason: string; suggestion: string }[];
  latencyBreakdown: { nodeLabel: string; avgLatencyMs: number; percentOfTotal: number }[];
}

// ── Canvas context passed from the frontend ─────────────────
export interface CanvasNode {
  id: string;
  label: string;
  componentType: string;
  config: Record<string, unknown>;
}

export interface CanvasEdge {
  source: string;
  target: string;
  animated: boolean;
}

// ── LangGraph state annotation ──────────────────────────────
export const AgentState = Annotation.Root({
  // Current user message
  userPrompt: Annotation<string>,

  // Session identifier
  sessionId: Annotation<string>,

  // Full conversation history (managed by LangGraph messages reducer would be
  // overkill here — we store a simple BaseMessage[] and append manually)
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // Accumulated requirements across conversation turns
  requirements: Annotation<Requirements>({
    reducer: (_prev, next) => next,
    default: () => ({}),
  }),

  // Current canvas state for context
  currentNodes: Annotation<CanvasNode[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  currentEdges: Annotation<CanvasEdge[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),

  // Agent decision: 'clarify' | 'execute'
  decision: Annotation<'clarify' | 'execute'>({
    reducer: (_prev, next) => next,
    default: () => 'clarify' as const,
  }),

  // Output fields — populated by the graph nodes
  clarificationQuestions: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  clarificationSummary: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  aqlCommands: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  explanation: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),

  // Simulation results for evaluation
  simulationResults: Annotation<SimulationResultSummary | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  // Refinement tracking
  refinementCount: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),

  // Whether simulation results meet requirements
  meetsRequirements: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),

  // Evaluation summary for the user
  evaluationSummary: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
});

export type AgentStateType = typeof AgentState.State;
