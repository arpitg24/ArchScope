import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Node, Edge } from '@xyflow/react';
import { SimulationNodeData } from '@/types';

export interface AgentClarificationResponse {
  type: 'clarification';
  questions: string[];
  summary: string;
  requirements: Record<string, unknown>;
}

export interface AgentExecutionResponse {
  type: 'execution';
  commands: string[];
  explanation: string;
  requirements: Record<string, unknown>;
}

export interface AgentEvaluationPassResponse {
  type: 'pass';
  evaluationSummary: string;
  meetsRequirements: true;
}

export interface AgentEvaluationRefineResponse {
  type: 'refine';
  evaluationSummary: string;
  commands: string[];
  explanation: string;
  meetsRequirements: false;
  refinementCount: number;
}

export type AgentEvaluationResponse = AgentEvaluationPassResponse | AgentEvaluationRefineResponse;

export type AgentResponse = AgentClarificationResponse | AgentExecutionResponse;

interface UseAgentReturn {
  sessionId: string;
  isLoading: boolean;
  error: string | null;
  sendMessage: (
    message: string,
    currentNodes: Node<SimulationNodeData>[],
    currentEdges: Edge[]
  ) => Promise<AgentResponse | null>;
  evaluateResults: (
    simulationResults: any,
    currentNodes: Node<SimulationNodeData>[],
    currentEdges: Edge[]
  ) => Promise<AgentEvaluationResponse | null>;
  resetSession: () => void;
}

export function useAgent(): UseAgentReturn {
  const [sessionId] = useState(() => uuidv4());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef(sessionId);

  const resetSession = useCallback(() => {
    sessionIdRef.current = uuidv4();
    setError(null);
  }, []);

  const sendMessage = useCallback(
    async (
      message: string,
      currentNodes: Node<SimulationNodeData>[],
      currentEdges: Edge[]
    ): Promise<AgentResponse | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            message,
            currentNodes: currentNodes.map((n) => ({
              id: n.id,
              label: n.data.label,
              componentType: n.data.componentType,
              config: n.data.config,
            })),
            currentEdges: currentEdges.map((e) => ({
              source: e.source,
              target: e.target,
              animated: e.animated || false,
            })),
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const errMsg = data.error || `Agent request failed (${res.status})`;
          setError(errMsg);
          return null;
        }

        const data: AgentResponse = await res.json();
        return data;
      } catch (err: any) {
        const errMsg = err.message || 'Failed to reach agent';
        setError(errMsg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const evaluateResults = useCallback(
    async (
      simulationResults: any,
      currentNodes: Node<SimulationNodeData>[],
      currentEdges: Edge[]
    ): Promise<AgentEvaluationResponse | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/agent/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            simulationResults,
            currentNodes: currentNodes.map((n) => ({
              id: n.id,
              label: n.data.label,
              componentType: n.data.componentType,
              config: n.data.config,
            })),
            currentEdges: currentEdges.map((e) => ({
              source: e.source,
              target: e.target,
              animated: e.animated || false,
            })),
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const errMsg = data.error || `Evaluation request failed (${res.status})`;
          setError(errMsg);
          return null;
        }

        const data: AgentEvaluationResponse = await res.json();
        return data;
      } catch (err: any) {
        const errMsg = err.message || 'Failed to reach agent';
        setError(errMsg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return {
    sessionId: sessionIdRef.current,
    isLoading,
    error,
    sendMessage,
    evaluateResults,
    resetSession,
  };
}
