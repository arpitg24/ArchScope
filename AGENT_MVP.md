# ArchScope Agentic Workflow — MVP Architecture

> **Status:** Planning  
> **Stack:** LangGraph (orchestration) + LangChain (tools) — TypeScript, runs in Next.js API routes  
> **LLM:** OpenAI (or any provider via LangChain)

---

## Vision

Users describe what they want to build in natural language. An AI agent asks clarifying questions if needed, then generates a complete system architecture using AQL commands — which execute against the existing ArchScope engine. The agent can iterate: run simulations, detect bottlenecks, and refine the design.

---

## Core Principles

1. **Clarify before building** — The agent enters a closed-loop conversation to gather requirements before generating a single AQL command. It adapts depth of questioning to user expertise.
2. **AQL is the action space** — The agent doesn't generate arbitrary code. It produces valid AQL commands that flow through the existing parser/handler pipeline.
3. **No new infrastructure** — Everything runs in Next.js API routes using LangChain.js and LangGraph.js. No separate Python service.
4. **Existing terminal is the interface** — An "AI mode" toggle in the terminal panel lets users switch between raw AQL and natural language.

---

## End-to-End Flow

```
User (NL input)
    │
    ▼
POST /api/agent  { sessionId, message, currentNodes, currentEdges }
    │
    ▼
LangGraph StateGraph
    │
    ├── CLASSIFY — Is this a new request or a reply to a follow-up?
    │
    ├── GATHER — Extract requirements from user message, assess confidence
    │
    ├── READY TO BUILD? (conditional edge)
    │       │
    │       ├── NO → ASK USER — Return 1-3 focused follow-up questions
    │       │         (conversation continues on next request)
    │       │
    │       └── YES → PLAN — Design the architecture
    │                   │
    │                   ▼
    │                EXECUTE — Generate AQL commands via LangChain tools
    │                   │
    │                   ▼
    │                EVALUATE — Check if goals are met, optionally loop
    │                   │
    │                   ▼
    │                RESPOND — Return commands + explanation
    │
    ▼
Frontend receives response
    │
    ├── If clarification → Display questions, wait for user reply
    │
    └── If execution → Execute AQL commands sequentially through
                        existing terminal handler pipeline
                        (parser.ts → handlers.ts → canvas updates)
```

---

## Requirements Gathering

The agent maintains a requirements object across conversation turns. Each user message fills in more slots.

### Requirements Model

- **Core:** use case, description
- **Scale:** expected users, expected RPS, read/write ratio
- **Constraints (if user is technical):** latency target (ms), monthly budget (USD), cloud provider preference
- **Patterns (inferred or stated):** needs caching, needs async processing, needs rate limiting, needs notifications
- **Meta:** user expertise level (beginner/intermediate/expert), confidence score (0-1)

### Adaptive Questioning

- **Vague input** (confidence < 0.7) → Agent asks 1-3 targeted questions about scale, patterns, constraints
- **Detailed input** (confidence > 0.85) → Agent skips questions, proceeds directly to building
- **Technical users** → Agent asks about latency SLAs, budget, specific service preferences
- **Non-technical users** → Agent infers sensible defaults, asks about use case and scale only

### Example: Vague User

```
User: "I want to build a food delivery app backend"
Agent: I'll design a food delivery backend. A few questions:
       1. Scale — How many concurrent users? (hundreds, thousands, millions)
       2. Real-time needs — Do you need live order tracking/notifications?
       3. Budget — Optimize for cost, or prioritize performance?

User: "10k users, yes notifications, keep it cheap"
Agent: [generates architecture with AQL commands]
```

### Example: Technical User

```
User: "Read-heavy API, p99 < 50ms, sliding window rate limiting, 5000 RPS, AWS, < $500/mo"
Agent: [skips questions, generates architecture immediately]
```

---

## LangGraph State

The state that flows through graph nodes across turns:

- **userPrompt** — Current user message
- **conversationHistory** — All previous turns in this session
- **requirements** — Partially or fully filled requirements object
- **plan** — LLM's architectural plan (text)
- **aqlCommands** — Generated AQL command strings
- **executionResults** — Results of command execution (for evaluate loop)
- **metrics** — Simulation results (if sim was run)
- **bottlenecks** — Detected bottlenecks (if sim was run)
- **iterationCount** — Capped at 3 to prevent infinite loops
- **isComplete** — Whether the agent considers the task done

---

## LangChain Tools (AQL Wrappers)

The agent calls these tools to produce AQL commands. Tools don't mutate state directly — they accumulate AQL strings that the frontend executes.

| Tool | AQL Mapping |
|------|-------------|
| `add_component(type, name, serviceId?)` | `add <type> as <name> [using <serviceId>]` |
| `connect(source, target, animated?)` | `connect <source> to <target> [animated]` |
| `configure(node, property, value)` | `set <node> <property> = <value>` |
| `configure_batch(node, props)` | `config <node> { ... }` |
| `run_simulation()` | `sim_run` |
| `set_sim_params(props)` | `sim_config { ... }` |
| `query_services(componentType?)` | Returns service catalog data directly to agent |

---

## API Contract (Multi-Turn)

### Request

```
POST /api/agent
{
  sessionId: string,
  message: string,
  currentNodes: Node[],
  currentEdges: Edge[]
}
```

### Response — Shape 1: Clarification

```json
{
  "type": "clarification",
  "questions": ["..."],
  "summary": "Here's what I understand so far...",
  "requirements": { "useCase": "food delivery", "expectedUsers": null, ... }
}
```

### Response — Shape 2: Execution

```json
{
  "type": "execution",
  "commands": ["add client as users", "add load_balancer as lb", "..."],
  "explanation": "Here's what I built and why...",
  "requirements": { "useCase": "food delivery", "expectedUsers": 10000, ... }
}
```

---

## System Prompt Composition

The agent's system prompt is assembled from:

1. **AQL command reference** — Derived from AQL_IMPLEMENTATION_STATUS.md (valid commands, syntax, component types)
2. **Service catalog summary** — Available services with pricing, latency, and capacity data
3. **Requirements gathering instructions** — When to ask, when to build, how to adapt to user expertise
4. **Constraints** — "Only produce valid AQL commands. Do not invent new commands or component types."

---

## Conversation Memory

- **Per-session** — Identified by `sessionId`
- **In-memory for MVP** — Simple Map<sessionId, ConversationState>
- **Future:** Persist to DB (new Prisma model) or Redis for multi-server deployments

---

## Terminal UI Changes

- **AI Mode toggle** — Switch between raw AQL input and natural language
- **Agent messages** — Rendered as formatted text (not raw AQL lines)
- **Follow-up questions** — Displayed clearly, user types naturally to respond
- **Command execution** — When agent returns commands, they auto-execute with visual progress
- **Mid-conversation adjustments** — User can say "make it cheaper" or "add a cache" after initial generation

---

## MVP Scope

### Included

- Single LangGraph agent with classify/gather/plan/execute/respond nodes
- Closed-loop clarification before building
- Adaptive questioning based on user expertise
- AQL command generation from natural language
- Service catalog awareness for selecting appropriate cloud services
- Conversation memory per session (in-memory)
- AI mode toggle in terminal

### Deferred

- Multi-agent system (separate architect/optimizer/cost agents)
- Simulation-aware optimization loop (run sim → detect bottleneck → fix → re-run)
- Streaming command execution
- Persistent conversation history in DB
- Custom service recommendations beyond catalog
- Voice input
- Architecture comparison ("which is better, A or B?")

---

## Dependencies

```
@langchain/core
@langchain/langgraph
@langchain/openai (or @langchain/anthropic)
```

All run natively in Next.js — no Python, no separate service.

---

## File Structure

```
src/lib/agent/
├── state.ts        — Agent state + Requirements types
├── tools.ts        — AQL commands wrapped as LangChain tools
├── prompts.ts      — System prompt + clarification prompt
├── graph.ts        — LangGraph StateGraph definition
└── memory.ts       — Session conversation memory (in-memory)

src/app/api/agent/
└── route.ts        — POST endpoint for agent invocation
```
