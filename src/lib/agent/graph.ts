import { StateGraph, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { AgentState, AgentStateType, Requirements, SimulationResultSummary } from './state';
import { buildAnalyzePrompt, buildGeneratePrompt, buildEvaluatePrompt, buildCanvasContext } from './prompts';
import { getSession, updateSession } from './memory';

// ── LLM instance ────────────────────────────────────────────
function getLLM() {
  return new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0.3,
    maxTokens: 2048,
  });
}

// ── Node: Analyze ───────────────────────────────────────────
// Classifies the user's message and extracts/updates requirements.
// Decides whether to clarify or execute.
async function analyzeNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const llm = getLLM();

  const session = getSession(state.sessionId);
  const canvasContext = buildCanvasContext(state.currentNodes, state.currentEdges);

  // Build conversation context from session history
  const historyMessages = session.messages.map(m => {
    if (m._getType() === 'human') return `User: ${m.content}`;
    if (m._getType() === 'ai') return `Agent: ${m.content}`;
    return '';
  }).filter(Boolean);

  const conversationContext = historyMessages.length > 0
    ? `\nCONVERSATION HISTORY:\n${historyMessages.join('\n')}\n`
    : '';

  const currentRequirements = Object.keys(session.requirements).length > 0
    ? `\nCURRENT REQUIREMENTS (from previous turns):\n${JSON.stringify(session.requirements, null, 2)}\n`
    : '';

  const prompt = `${conversationContext}${currentRequirements}\n${canvasContext}\n\nUser's latest message: "${state.userPrompt}"`;

  const response = await llm.invoke([
    new SystemMessage(buildAnalyzePrompt()),
    new HumanMessage(prompt),
  ]);

  // Parse the LLM's JSON response
  const content = typeof response.content === 'string' ? response.content : '';
  let parsed: {
    decision: 'clarify' | 'execute';
    requirements: Requirements;
    clarificationSummary?: string;
    clarificationQuestions?: string[];
  };

  try {
    // Strip markdown code fences if present
    const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    // If parsing fails, default to clarification
    console.error('Failed to parse analyze response:', content);
    parsed = {
      decision: 'clarify',
      requirements: session.requirements,
      clarificationSummary: "I'd like to help you design a system. Could you tell me more about what you're building?",
      clarificationQuestions: [
        'What type of application are you building?',
        'What scale are you targeting? (hundreds, thousands, or millions of users)',
        'Any specific requirements like low latency, cost optimization, or real-time features?',
      ],
    };
  }

  // Merge requirements with session state
  const mergedRequirements: Requirements = {
    ...session.requirements,
    ...parsed.requirements,
  };

  // Store the new messages in session
  const newMessages = [
    new HumanMessage(state.userPrompt),
  ];

  return {
    decision: parsed.decision,
    requirements: mergedRequirements,
    clarificationQuestions: parsed.clarificationQuestions || [],
    clarificationSummary: parsed.clarificationSummary || '',
    messages: newMessages,
  };
}

// ── Node: Respond with clarification ────────────────────────
async function clarifyNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  // Build a summary message to store in session
  const summaryContent = [
    state.clarificationSummary,
    ...state.clarificationQuestions.map((q, i) => `${i + 1}. ${q}`),
  ].join('\n');

  const aiMessage = new AIMessage(summaryContent);

  // Update session with conversation + requirements
  const session = getSession(state.sessionId);
  const allMessages = [...session.messages, ...state.messages, aiMessage];
  updateSession(state.sessionId, allMessages, state.requirements);

  return {
    messages: [aiMessage],
  };
}

// ── Node: Generate architecture ─────────────────────────────
async function generateNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const llm = getLLM();

  const canvasContext = buildCanvasContext(state.currentNodes, state.currentEdges);
  const requirementsStr = JSON.stringify(state.requirements, null, 2);

  const prompt = `REQUIREMENTS:\n${requirementsStr}\n\n${canvasContext}\n\nGenerate the AQL commands to build this architecture. Choose appropriate services from the catalog based on the requirements. If modifying an existing architecture, only add what's missing.`;

  const response = await llm.invoke([
    new SystemMessage(buildGeneratePrompt()),
    new HumanMessage(prompt),
  ]);

  const content = typeof response.content === 'string' ? response.content : '';
  let parsed: {
    commands: string[];
    explanation: string;
  };

  try {
    const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    console.error('Failed to parse generate response:', content);
    parsed = {
      commands: [],
      explanation: 'I encountered an error generating the architecture. Please try again.',
    };
  }

  // Validate commands are non-empty strings
  const validCommands = (parsed.commands || []).filter(
    (cmd: unknown) => typeof cmd === 'string' && cmd.trim().length > 0
  );

  // Store in session
  const aiMessage = new AIMessage(
    `${parsed.explanation}\n\nCommands: ${validCommands.join('; ')}`
  );
  const session = getSession(state.sessionId);
  const allMessages = [...session.messages, ...state.messages, aiMessage];
  updateSession(state.sessionId, allMessages, state.requirements);

  return {
    aqlCommands: validCommands,
    explanation: parsed.explanation || '',
    messages: [aiMessage],
  };
}

// ── Conditional edge: should we build or clarify? ───────────
function shouldBuild(state: AgentStateType): 'generate' | 'clarify' {
  return state.decision === 'execute' ? 'generate' : 'clarify';
}

// ── Node: Evaluate simulation results ───────────────────────
async function evaluateNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const llm = getLLM();

  const canvasContext = buildCanvasContext(state.currentNodes, state.currentEdges);
  const requirementsStr = JSON.stringify(state.requirements, null, 2);
  const resultsStr = JSON.stringify(state.simulationResults, null, 2);

  const prompt = `REQUIREMENTS:\n${requirementsStr}\n\n${canvasContext}\n\nSIMULATION RESULTS:\n${resultsStr}\n\nREFINEMENT ATTEMPT: ${state.refinementCount + 1} of 3\n\nEvaluate whether the simulation results meet the requirements. If not, generate refinement commands.`;

  const response = await llm.invoke([
    new SystemMessage(buildEvaluatePrompt()),
    new HumanMessage(prompt),
  ]);

  const content = typeof response.content === 'string' ? response.content : '';
  let parsed: {
    meetsRequirements: boolean;
    evaluationSummary: string;
    refinementCommands?: string[];
    refinementExplanation?: string;
  };

  try {
    const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    console.error('Failed to parse evaluate response:', content);
    parsed = {
      meetsRequirements: true,
      evaluationSummary: 'Evaluation complete. Check the simulation results panel for details.',
    };
  }

  // If refinement needed, validate commands
  const refinementCommands = (parsed.refinementCommands || []).filter(
    (cmd: unknown) => typeof cmd === 'string' && cmd.trim().length > 0
  );

  // Store in session
  const session = getSession(state.sessionId);
  const aiMessage = new AIMessage(
    `Evaluation: ${parsed.evaluationSummary}${refinementCommands.length > 0 ? `\nRefinement: ${parsed.refinementExplanation}` : ''}`
  );
  const allMessages = [...session.messages, aiMessage];
  updateSession(state.sessionId, allMessages, state.requirements);

  return {
    meetsRequirements: parsed.meetsRequirements,
    evaluationSummary: parsed.evaluationSummary,
    aqlCommands: refinementCommands,
    explanation: parsed.refinementExplanation || '',
    refinementCount: state.refinementCount + 1,
    messages: [aiMessage],
  };
}

// ── Build the main agent graph ──────────────────────────────
export function buildAgentGraph() {
  const graph = new StateGraph(AgentState)
    .addNode('analyze', analyzeNode)
    .addNode('clarify', clarifyNode)
    .addNode('generate', generateNode)
    .addEdge('__start__', 'analyze')
    .addConditionalEdges('analyze', shouldBuild, {
      generate: 'generate',
      clarify: 'clarify',
    })
    .addEdge('clarify', '__end__')
    .addEdge('generate', '__end__');

  return graph.compile();
}

// ── Build the evaluate graph (separate invocation) ──────────
export function buildEvaluateGraph() {
  const graph = new StateGraph(AgentState)
    .addNode('evaluate', evaluateNode)
    .addEdge('__start__', 'evaluate')
    .addEdge('evaluate', '__end__');

  return graph.compile();
}
