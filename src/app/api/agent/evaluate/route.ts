import { NextResponse } from 'next/server';
import { buildEvaluateGraph } from '@/lib/agent/graph';
import { CanvasNode, CanvasEdge, SimulationResultSummary } from '@/lib/agent/state';
import { getSession } from '@/lib/agent/memory';

/**
 * POST /api/agent/evaluate
 *
 * Evaluates simulation results against the user's requirements.
 * Returns either a "pass" (requirements met) or "refine" (with AQL commands to fix issues).
 */
export async function POST(req: Request) {
  try {
    const { sessionId, simulationResults, currentNodes, currentEdges } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured. Add it to .env.local' },
        { status: 500 }
      );
    }

    if (!simulationResults) {
      return NextResponse.json({ error: 'No simulation results provided' }, { status: 400 });
    }

    // Get session to retrieve requirements
    const session = getSession(sessionId || 'default');
    if (!session.requirements || Object.keys(session.requirements).length === 0) {
      return NextResponse.json({
        type: 'pass',
        evaluationSummary: 'No requirements to evaluate against. Simulation completed successfully.',
        meetsRequirements: true,
      });
    }

    // Map frontend data
    const nodes: CanvasNode[] = (currentNodes || []).map((n: any) => ({
      id: n.id,
      label: n.label || n.id,
      componentType: n.componentType,
      config: n.config || {},
    }));

    const edges: CanvasEdge[] = (currentEdges || []).map((e: any) => ({
      source: e.source,
      target: e.target,
      animated: e.animated || false,
    }));

    const simResults: SimulationResultSummary = {
      totalRequests: simulationResults.totalRequests,
      successfulRequests: simulationResults.successfulRequests,
      failedRequests: simulationResults.failedRequests,
      avgLatencyMs: simulationResults.avgEndToEndLatencyMs ?? simulationResults.avgLatencyMs,
      p99LatencyMs: simulationResults.p99EndToEndLatencyMs ?? simulationResults.p99LatencyMs,
      actualThroughputRps: simulationResults.actualThroughputRps,
      totalCostPerHour: simulationResults.totalCostPerHour,
      totalCostPerMonth: simulationResults.totalCostPerMonth,
      bottlenecks: (simulationResults.bottlenecks || []).map((b: any) => ({
        nodeLabel: b.nodeLabel,
        reason: b.reason,
        suggestion: b.suggestion || '',
      })),
      latencyBreakdown: (simulationResults.latencyBreakdown || []).map((l: any) => ({
        nodeLabel: l.nodeLabel,
        avgLatencyMs: l.avgLatencyMs,
        percentOfTotal: l.percentOfTotal,
      })),
    };

    // Build and invoke the evaluate graph
    const graph = buildEvaluateGraph();

    const result = await graph.invoke({
      sessionId: sessionId || 'default',
      userPrompt: '',
      requirements: session.requirements,
      currentNodes: nodes,
      currentEdges: edges,
      simulationResults: simResults,
      refinementCount: 0,
    });

    if (result.meetsRequirements || result.aqlCommands.length === 0) {
      return NextResponse.json({
        type: 'pass',
        evaluationSummary: result.evaluationSummary,
        meetsRequirements: true,
      });
    }

    // Needs refinement
    return NextResponse.json({
      type: 'refine',
      evaluationSummary: result.evaluationSummary,
      commands: result.aqlCommands,
      explanation: result.explanation,
      meetsRequirements: false,
      refinementCount: result.refinementCount,
    });
  } catch (error: any) {
    console.error('Agent Evaluate API Error:', error);

    const message =
      error?.message?.includes('API key')
        ? 'Invalid or missing OpenAI API key'
        : error?.message?.includes('Rate limit')
          ? 'OpenAI rate limit reached. Please wait a moment.'
          : 'An error occurred while evaluating simulation results';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
