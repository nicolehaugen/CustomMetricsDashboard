---
description: "Trace the agent loop for a session, showing system prompt, context, subagents, and LLM responses per turn"
argument-hint: "Session ID to trace"
---
Trace the agent loop for session {id} at a high level.

First, state session-level constants (values that don't change across turns):
- **Model**: which model is used

Then, report any **subagents** — child sessions spawned by the orchestrator (not by model tool calls). For each, state when they fire, their model, their purpose, and whether results feed back into the main context.

Then, for each LLM turn, produce a table with one row per dimension:

| Dimension | Value |
|-----------|-------|
| **Turn** | Turn number |
| **Purpose** | One sentence explaining what this turn accomplishes |
| **System prompt** | What categories of instruction are present |
| **Tools** | Total count of tool definitions passed to the model. This is typically a session-level constant — state it in Turn 0, then note "unchanged" or the delta if it changes |
| **Explicit context** | What was injected by the harness (attachments, tool results, workspace info) |
| **Implicit context** | What carries forward from prior turns (conversation history, prior reasoning) |
| **User prompt** | The actual user message, or "None (agentic continuation)" for turns triggered only by tool results |
| **LLM response** | What the model emitted (reasoning, tool call requests, text, or combination) |

Important framing: The model never executes tools directly. When the model "calls a tool," it emits a tool call *request* back to the harness. The harness then executes the tool, collects the result, and injects it into the next turn's context. Make this delegation explicit in the trace — distinguish between "model requests tool X" and "harness executes tool X and returns result."

Skip token counts, durations, and cache stats. Focus on explaining what each turn accomplishes in the agent loop.
