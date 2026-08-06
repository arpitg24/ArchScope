import { NextResponse } from 'next/server';
import { buildAgentGraph } from '@/lib/agent/graph';
import { CanvasNode, CanvasEdge } from '@/lib/agent/state';

/**
 * POST /api/agent
 *
 * Invokes the LangGraph agent to analyze the user's message and either
 * return clarifying questions or generate AQL commands for building
 * an architecture on the canvas.
 */
export async function POST(req: Request) {
  try {
    const { sessionId, message, currentNodes, currentEdges } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'No message provided' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured. Add it to .env.local' },
        { status: 500 }
      );
    }

    // Map frontend node/edge shapes to agent state types
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

    // Build and invoke the LangGraph agent
    const graph = buildAgentGraph();

    const result = await graph.invoke({
      userPrompt: message,
      sessionId: sessionId || 'default',
      currentNodes: nodes,
      currentEdges: edges,
    });

    // Route response based on the agent's decision
    if (result.decision === 'clarify') {
      return NextResponse.json({
        type: 'clarification',
        questions: result.clarificationQuestions,
        summary: result.clarificationSummary,
        requirements: result.requirements,
      });
    }

    // decision === 'execute'
    return NextResponse.json({
      type: 'execution',
      commands: result.aqlCommands,
      explanation: result.explanation,
      requirements: result.requirements,
    });
  } catch (error: any) {
    console.error('Agent API Error:', error);

    // Surface useful error messages
    const message =
      error?.message?.includes('API key')
        ? 'Invalid or missing OpenAI API key'
        : error?.message?.includes('Rate limit')
          ? 'OpenAI rate limit reached. Please wait a moment.'
          : 'An error occurred while processing the agent request';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
