# Agent MVP — Implementation Plan

> Based on [AGENT_MVP.md](./AGENT_MVP.md) spec and current codebase analysis.

---

## Current State Summary

- **AQL system is fully built:** Parser (`src/lib/aql/parser.ts`), handlers (`handlers.ts`, `simulation-handlers.ts`, `preset-handlers.ts`) all working.
- **Terminal panel exists:** `src/components/features/simulator/terminal-panel.tsx` (870 lines) dispatches AQL commands via callbacks + `onAQLCommand`.
- **API routes exist:** `src/app/api/aql/route.ts` (echo stub), plus auth, designs, simulate endpoints.
- **Service catalog exists:** `src/lib/services/services-catalog.ts` with pricing/latency/capacity data.
- **No LangChain/LangGraph packages installed yet.**
- **No `src/lib/agent/` directory exists yet.**

---

## Phase 1: Foundation (Backend Agent Core)

> Goal: Get a working LangGraph agent that can accept natural language and return AQL commands, testable via API.

### Step 1.1 — Install Dependencies
```bash
npm install @langchain/core @langchain/langgraph @langchain/openai
```
- Add `OPENAI_API_KEY` to `.env.local`

### Step 1.2 — Create Agent State Types (`src/lib/agent/state.ts`)
- Define `Requirements` interface (useCase, description, expectedUsers, expectedRPS, readWriteRatio, latencyTarget, monthlyBudget, cloudProvider, patterns, userExpertise, confidenceScore)
- Define `AgentState` interface for LangGraph (userPrompt, conversationHistory, requirements, plan, aqlCommands, isComplete, iterationCount)
- Define `AgentResponse` type with discriminated union: `{ type: 'clarification', questions, summary, requirements }` | `{ type: 'execution', commands, explanation, requirements }`

### Step 1.3 — Create AQL Tools (`src/lib/agent/tools.ts`)
Wrap existing AQL commands as LangChain `tool()` definitions:
- `add_component(type, name, serviceId?)` → returns AQL string `add <type> as <name> [using <serviceId>]`
- `connect(source, target, animated?)` → returns `connect <source> to <target> [animated]`
- `configure(node, property, value)` → returns `set <node> <property> = <value>`
- `configure_batch(node, props)` → returns `config <node> { ... }`
- `run_simulation()` → returns `sim_run`
- `set_sim_params(props)` → returns `sim_config { ... }`
- `query_services(componentType?)` → reads from service catalog and returns data directly (not AQL)

These tools **accumulate AQL strings**, they don't execute anything. The frontend executes them.

### Step 1.4 — Create System Prompt (`src/lib/agent/prompts.ts`)
- Build system prompt from:
  - AQL command reference (derived from `AQL_IMPLEMENTATION_STATUS.md` — hardcoded summary of valid commands, component types, properties)
  - Service catalog summary (loaded from `services-catalog.ts` at build time)
  - Requirements gathering instructions (when to ask vs. build, adaptive questioning rules)
  - Constraints ("only produce valid AQL commands", "no invented component types")
- Include few-shot examples: vague user → clarification, technical user → direct build

### Step 1.5 — Create Session Memory (`src/lib/agent/memory.ts`)
- `Map<string, ConversationState>` for in-memory session storage
- `ConversationState` = `{ history: Message[], requirements: Requirements, createdAt: Date }`
- `getSession(id)`, `updateSession(id, state)`, `clearSession(id)`
- Optional: TTL cleanup for stale sessions (e.g., 1 hour)

### Step 1.6 — Create LangGraph StateGraph (`src/lib/agent/graph.ts`)
Define the graph with these nodes:

1. **classify** — Is this a new request or a reply to a follow-up? Updates state accordingly.
2. **gather** — Extract requirements from user message. Merge with existing requirements. Compute confidence score.
3. **shouldBuild** (conditional edge) — If confidence ≥ 0.85 → route to `plan`. Otherwise → route to `ask`.
4. **ask** — Generate 1–3 focused follow-up questions. Return `clarification` response.
5. **plan** — Design the architecture as a textual plan (component list, connections, config).
6. **execute** — Call AQL tools to produce command strings from the plan.
7. **respond** — Package AQL commands + explanation into `execution` response.

Graph edges:
```
START → classify → gather → shouldBuild?
  shouldBuild? → (NO) → ask → END
  shouldBuild? → (YES) → plan → execute → respond → END
```

### Step 1.7 — Create API Route (`src/app/api/agent/route.ts`)
- `POST /api/agent` accepting `{ sessionId, message, currentNodes, currentEdges }`
- Load/create session from memory
- Invoke the LangGraph graph with current state
- Return `AgentResponse` (clarification or execution)
- Update session memory with new state

---

## Phase 2: Frontend Integration (Terminal AI Mode)

> Goal: Users can toggle AI mode in the terminal and interact with the agent naturally.

### Step 2.1 — Add AI Mode Toggle to Terminal Header
- Add state: `const [aiMode, setAiMode] = useState(false)`
- Add toggle button in terminal header (next to clear/close buttons)
- Visual indicator: change prompt color/icon when in AI mode (e.g., `🤖 >` vs `> `)
- Change welcome message when toggling to AI mode

### Step 2.2 — Create Agent Client Hook (`src/hooks/useAgent.ts`)
- `useAgent()` hook that manages:
  - `sessionId` (generate with `uuid` on mount, or per-workspace)
  - `sendMessage(message, nodes, edges)` → calls `POST /api/agent`
  - `isLoading` state
  - `lastResponse` state
  - Error handling

### Step 2.3 — Modify Terminal Command Handler for AI Mode
In `terminal-panel.tsx`, when AI mode is on:
- Skip all AQL parsing logic
- Send raw user text to the agent via `useAgent` hook
- Handle response based on type:
  - **Clarification:** Display summary + numbered questions as formatted `response` log entries
  - **Execution:** Execute returned AQL commands sequentially through existing `onAddComponent`, `onConnectNodes`, `onSetConfig`, `onAQLCommand` callbacks, showing each command + result

### Step 2.4 — Auto-Execute AQL Commands from Agent
- When agent returns `{ type: 'execution', commands: [...] }`:
  - Show "Building architecture..." status
  - Execute each command one-by-one through the existing terminal handler pipeline
  - Display each command being executed (like a replay)
  - Show final summary/explanation from agent
- Handle errors gracefully (if a command fails, show which one and why)

### Step 2.5 — Session Management in UI
- Generate `sessionId` per terminal session (or per workspace)
- "New conversation" button to reset agent session
- Persist `sessionId` in component state (not localStorage for MVP)

---

## Phase 3: Polish & Edge Cases

> Goal: Make the experience production-quality.

### Step 3.1 — Error Handling & Validation
- Handle OpenAI API errors gracefully (rate limits, network issues, invalid API key)
- Validate agent-generated AQL commands before sending to frontend (pre-parse with `parseAQLCommand`)
- Handle case where agent generates invalid component types or node names
- Timeout handling for long LLM calls

### Step 3.2 — Streaming Responses (Optional Enhancement)
- Use `ReadableStream` in the API route for streaming agent thinking/responses
- Show "Agent is thinking..." with live updates
- Progressive display of commands as they're generated

### Step 3.3 — Context Awareness
- Pass `currentNodes` and `currentEdges` to the agent so it knows what's already on the canvas
- Agent can modify existing architectures ("add a cache between api and db")
- Agent avoids duplicate node names

### Step 3.4 — Mid-Conversation Adjustments
- After initial build, user can say "make it cheaper" or "add rate limiting"
- Agent reads current architecture (from passed nodes/edges) and generates incremental AQL commands
- Works because session memory retains requirements + conversation history

### Step 3.5 — Help & Discoverability
- Update `help` command to mention AI mode
- Add example prompts when AI mode is first activated
- Show quick suggestions like "Try: 'build a URL shortener backend'"

---

## File Creation Summary

| File | Phase | Purpose |
|------|-------|---------|
| `src/lib/agent/state.ts` | 1.2 | Agent state & Requirements types |
| `src/lib/agent/tools.ts` | 1.3 | AQL commands as LangChain tools |
| `src/lib/agent/prompts.ts` | 1.4 | System prompt composition |
| `src/lib/agent/memory.ts` | 1.5 | Session conversation memory |
| `src/lib/agent/graph.ts` | 1.6 | LangGraph StateGraph definition |
| `src/app/api/agent/route.ts` | 1.7 | POST endpoint |
| `src/hooks/useAgent.ts` | 2.2 | Client-side agent hook |
| Modify: `terminal-panel.tsx` | 2.1–2.4 | AI mode toggle + agent integration |

---

## Dependency on Existing Code

The agent design is **additive** — it doesn't modify any existing AQL infrastructure:

- **Parser** (`parser.ts`) — Unchanged. Agent generates AQL strings that flow through the same parser.
- **Handlers** (`handlers.ts`) — Unchanged. Commands execute through the same handler pipeline.
- **Terminal** (`terminal-panel.tsx`) — Modified to add AI mode toggle and agent response rendering.
- **Service catalog** (`services-catalog.ts`) — Read-only. Agent uses it for service selection context.

---

## Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| LLM generates invalid AQL | Pre-validate all commands through `parseAQLCommand` before returning to frontend |
| LLM hallucinates component types | System prompt explicitly lists the 9 valid types; tool schemas enforce them |
| Conversation loops (keeps asking) | Confidence threshold (0.85) + max 3 clarification rounds |
| Slow LLM responses | Loading states in UI; consider streaming in Phase 3 |
| API key exposure | `.env.local` only; never sent to client; server-side route only |
| Session memory leak | TTL-based cleanup; `Map` size cap |

---

## Estimated Effort

| Phase | Effort | Deliverable |
|-------|--------|-------------|
| Phase 1 | ~4-6 hours | Working API endpoint that converts NL → AQL commands |
| Phase 2 | ~3-4 hours | Terminal AI mode with auto-execution |
| Phase 3 | ~2-3 hours | Error handling, context awareness, polish |
| **Total** | **~9-13 hours** | Full agent MVP |

---

## Recommended Build Order

1. **Start with Phase 1.2–1.4** (types, tools, prompts) — these are pure functions, easy to validate
2. **Then 1.5–1.6** (memory, graph) — the orchestration layer
3. **Then 1.7** (API route) — test end-to-end via `curl` or Postman
4. **Then Phase 2** — frontend integration, the visual payoff
5. **Phase 3** — hardening, only after the happy path works
