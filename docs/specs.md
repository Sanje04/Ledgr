# Spec — Phase 9: Pluggable LLM provider (Ollama ↔ Claude API)

**Status:** spec only. No code in this repo has been changed. This document
describes the change; `backend/specs.md` remains the authoritative phase log and
should gain a Phase 9 section when this is actually built.

**Goal.** Let a single `.env` key decide whether the agent talks to a local
Ollama server or to Anthropic's Claude API, with no change to the `/api/chat`
contract, the frontend, the MCP tool server, or the delete-confirmation gate.

---

## 1. Why this is not a URL swap

It is tempting to read this as "point `_call_ollama` at a different host". It is
not. Ollama's `/api/chat` deliberately mimics the OpenAI chat-completions shape;
the Anthropic Messages API has a different shape on five axes that
[`agent.run()`](../backend/agent.py) depends on today:

| Axis | Ollama (today) | Anthropic Messages API |
|---|---|---|
| System prompt | a `{"role": "system"}` entry inside `messages` | a **top-level `system` parameter**, not a message |
| Tool schemas | `{"type": "function", "function": {name, description, parameters}}` | `{name, description, input_schema}` — flat, and the schema key is `input_schema` |
| Tool call in the response | `message.tool_calls[0].function.{name, arguments}` | a **content block** in `response.content` with `type == "tool_use"`, carrying `.id`, `.name`, `.input` |
| Tool result going back | a `{"role": "tool", "content": "<json string>"}` message | a **`user`** message whose content is a list of `{"type": "tool_result", "tool_use_id": ..., "content": ...}` blocks |
| Reply text | `message.content` (a string) | the `text` block(s) in `response.content` |

Two further differences matter and have no Ollama equivalent:

- **`tool_use_id` correlation.** Anthropic requires every `tool_result` to carry
  the `id` of the `tool_use` block it answers. Ollama has no such id. The
  normalised shape below must therefore carry an optional id, even though the
  Ollama adapter never sets one.
- **`max_tokens` is mandatory** on every Anthropic request. Ollama has no
  equivalent required field.

So the work is a **normalisation layer**, and the switch is which adapter
implements it.

---

## 2. Design

### 2.1 A neutral internal shape

Define one internal representation that `agent.run()` speaks, and have each
provider adapter translate to and from it. `run()`'s control flow — the
one-round tool cap, the delete gate, the history window — then does not change
at all.

```python
# backend/llm/types.py  (proposed)
from dataclasses import dataclass
from typing import Any

@dataclass
class ToolCall:
    name: str
    arguments: dict[str, Any]
    id: str | None = None      # Anthropic's tool_use id; None for Ollama

@dataclass
class LLMReply:
    text: str | None                 # final assistant text, if any
    tool_call: ToolCall | None       # first requested tool call, if any
    raw_assistant: Any               # provider-native assistant turn, echoed back verbatim
```

`raw_assistant` exists because both providers require the assistant turn to be
replayed **unmodified** in the follow-up request. Reconstructing it from
`text`/`tool_call` loses information (Anthropic's block ids, in particular), so
the adapter keeps the native object and hands it back on the second call.

### 2.2 The provider interface

```python
# backend/llm/base.py  (proposed)
class LLMProvider(Protocol):
    async def chat(
        self,
        system: str,
        messages: list[dict[str, Any]],   # neutral {role, content} history + current turn
        tools: list[dict[str, Any]] | None,
        assistant_turn: Any | None = None,     # replay for the second call
        tool_result: dict[str, Any] | None = None,
        tool_call: ToolCall | None = None,
    ) -> LLMReply: ...
```

Two implementations: `backend/llm/ollama.py` (the current `_call_ollama`, moved
verbatim plus a translation of its response into `LLMReply`) and
`backend/llm/claude.py` (new).

### 2.3 Selection

```python
# backend/llm/__init__.py  (proposed)
def get_provider() -> LLMProvider:
    name = os.environ.get("LLM_PROVIDER", "ollama").strip().lower()
    if name == "ollama":
        return OllamaProvider()
    if name == "claude":
        return ClaudeProvider()
    raise AgentError(f"Unknown LLM_PROVIDER: {name!r}. Expected 'ollama' or 'claude'.")
```

Resolved **per call**, not at import time, so a `.env` edit plus a `--reload`
restart is the whole switching procedure and no module-level state goes stale.
`ollama` is the default, so an existing `.env` with no `LLM_PROVIDER` key keeps
working untouched.

---

## 3. Files that change

Five, not one. This is the part most easily under-scoped.

| File | Change |
|---|---|
| `backend/agent.py` | `_call_ollama` moves out to `llm/ollama.py`. `run()` calls `provider.chat(...)` and reads `LLMReply` instead of indexing `first["message"]`. `_execute_tool`, the delete gate, `SYSTEM_PROMPT`, and the date suffix are **untouched** |
| `backend/mcp_client.py` | `_to_ollama_schema` becomes provider-aware — see §4 |
| `backend/requirements.txt` | add `anthropic` (see §6) |
| `backend/.env.example` | add `LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_MAX_TOKENS` |
| `backend/.env.production.example` | the same four keys, with production-appropriate comments |

Unchanged on purpose: `main.py`, `db.py`, `mcp_server.py`, every frontend file,
and the `POST /api/chat` contract.

---

## 4. The `mcp_client` cache is currently Ollama-shaped

This is the non-obvious half of the change.

`mcp_client._to_ollama_schema()` converts each MCP tool into Ollama's nested
`{"type": "function", "function": {...}}` form, and `_cached_tools` stores that
shape. `cached_tool_names()` then reads `t["function"]["name"]` — so the cache
format itself is a provider detail that has leaked into the module's public API,
and `agent._execute_tool`'s membership check depends on it.

**Proposed fix:** cache the MCP-native shape and translate at call time.

```python
# _cached_tools entries become provider-neutral:
#   {"name": str, "description": str, "schema": dict}

def cached_tool_names() -> set[str]:
    return {t["name"] for t in _cached_tools}

def tools_for(provider: str) -> list[dict[str, Any]]:
    if provider == "claude":
        return [
            {"name": t["name"], "description": t["description"], "input_schema": t["schema"]}
            for t in _cached_tools
        ]
    return [
        {"type": "function",
         "function": {"name": t["name"], "description": t["description"],
                      "parameters": t["schema"]}}
        for t in _cached_tools
    ]
```

The MCP schemas in `mcp_server.TOOL_DEFINITIONS` are plain JSON Schema and need
no rewriting for either provider — including `enum: db.CATEGORIES`, which both
accept. That is a direct payoff of the CLAUDE.md constraint that
`mcp_server.py` uses the low-level `Server` rather than `FastMCP`: hand-written
schemas port across providers, inferred ones would not.

**`ensure_tools()` keeps its fail-soft contract unchanged.** Discovery failing
still yields an empty list, and the provider is then called with no tools.

---

## 5. The Claude adapter

Shapes below are from the current Anthropic Python SDK reference, not recalled.

### 5.1 First call

```python
import anthropic
from anthropic import AsyncAnthropic

_client = AsyncAnthropic()   # reads ANTHROPIC_API_KEY from the environment

resp = await _client.messages.create(
    model=ANTHROPIC_MODEL,            # default: claude-opus-5
    max_tokens=ANTHROPIC_MAX_TOKENS,  # required; default 16000 — see §7
    system=system_content,            # top-level, NOT a message
    messages=messages,                # only user/assistant turns
    tools=tools or anthropic.NOT_GIVEN,
)
```

`history` from `db.get_recent_history()` is already a list of
`{"role": "user"|"assistant", "content": str}` — accepted as-is. The system
message that `agent.run()` currently prepends to `messages` must instead be
lifted into `system=`; leaving it in `messages` is an API error, not a silent
degradation.

### 5.2 Reading the response

```python
tool_use = next((b for b in resp.content if b.type == "tool_use"), None)
text = next((b.text for b in resp.content if b.type == "text"), None)

if tool_use is None:
    return LLMReply(text=text, tool_call=None, raw_assistant=resp.content)

return LLMReply(
    text=text,
    tool_call=ToolCall(name=tool_use.name, arguments=dict(tool_use.input), id=tool_use.id),
    raw_assistant=resp.content,
)
```

Take the **first** `tool_use` block only. Claude may emit several in one turn
(parallel tool use); honouring only the first preserves this repo's documented
one-tool-per-turn cap, and `SYSTEM_PROMPT` already tells the model so. Do not
"fix" this by looping — that is the recursion bound CLAUDE.md protects.

`tool_use.input` is already a parsed dict. Do not string-match or re-parse it:
JSON escaping in tool inputs varies by model.

### 5.3 Second call (feeding the tool result back)

```python
resp2 = await _client.messages.create(
    model=ANTHROPIC_MODEL,
    max_tokens=ANTHROPIC_MAX_TOKENS,
    system=system_content,
    messages=[
        *messages,
        {"role": "assistant", "content": raw_assistant},   # replayed verbatim
        {"role": "user", "content": [{
            "type": "tool_result",
            "tool_use_id": tool_call.id,
            "content": json.dumps(result, default=str),
        }]},
    ],
    # no `tools=` — mirrors the Ollama path's second call
)
return LLMReply(text=_first_text(resp2), tool_call=None, raw_assistant=resp2.content)
```

The tool result goes back as a **`user`** message containing a `tool_result`
block — there is no `"role": "tool"` in this API. `tool_use_id` must match the
`tool_use` block's `id` exactly.

Tool-execution failures keep travelling as ordinary results: `mcp_client` already
returns `{"error": ...}` and that is serialised into `content` like any other
result. Optionally set `"is_error": True` on the block; either way the request
still returns **200**, per the two-error-paths constraint.

### 5.4 Errors → `AgentError` → HTTP 502

The hard constraint that Ollama failures become 502 must hold identically for
Claude. `test_chat.py` asserts this path.

```python
try:
    resp = await _client.messages.create(...)
except anthropic.AuthenticationError as exc:
    raise AgentError("Anthropic API key is missing or invalid") from exc
except anthropic.RateLimitError as exc:
    raise AgentError("Anthropic rate limit exceeded") from exc
except anthropic.APIStatusError as exc:
    raise AgentError(f"Anthropic returned an error: {exc.status_code}") from exc
except anthropic.APIConnectionError as exc:
    raise AgentError(f"Could not reach the Anthropic API: {exc}") from exc
```

Catch the specific classes in this order (most specific first) rather than one
broad `except Exception`, so the message tells you which failure it was. Every
branch raises `AgentError` — no Anthropic status code may leak out as the HTTP
status. Note that an invalid API key becomes a **502**, not a 401: 502 means "the
upstream model provider failed", which is exactly what happened.

### 5.5 Thinking: left at the model default, on purpose

`claude-opus-5` runs **adaptive thinking by default** when the `thinking`
parameter is omitted. This spec omits it, so thinking is on. That is the
intended state — it costs some tokens and improves tool-argument quality, which
is the part of this loop most worth getting right.

Two things not to do:

- **Do not set `thinking: {"type": "disabled"}`.** With thinking off, the model
  occasionally writes a tool call into its *visible text* instead of emitting a
  `tool_use` block. The turn succeeds, the tool never runs, nothing raises — the
  agent just silently stops using its tools. That failure is indistinguishable
  from a missing MCP server, which this repo already has one of.
- **Do not reach for `budget_tokens`.** It is rejected with a 400 on this model.

If cost matters more than depth, the correct lever is
`output_config={"effort": "low"}` — a bounded two-call loop over small JSON tool
results does not need the default effort level. Add it as a follow-up with a
measurement, not speculatively.

### 5.6 Deliberately not used

`client.beta.messages.tool_runner` would drive the tool loop automatically, and
is the SDK's recommended path for new agents. It is wrong here: it loops until
the model stops calling tools, which is precisely the unbounded recursion this
repo caps at one round, and it would run tools itself — bypassing
`agent._execute_tool`, and with it the delete-confirmation gate. The manual
two-call shape above is what keeps both constraints intact.

Also unused: streaming and prompt caching. Both are reasonable later
optimisations; neither is needed for parity with the Ollama path, and streaming
in particular would change the `/api/chat` contract.

---

## 6. Dependency

Add the official SDK rather than hand-rolling requests through `httpx`:

```
anthropic==<pin>            # pin exactly, matching this file's existing style
```

Two notes specific to this repo's pin discipline:

- `anthropic` 1.x uses `httpx2`, a separate distribution from `httpx`. It
  therefore does **not** conflict with the existing `httpx==0.27.2` pin — the two
  coexist, and `agent.py`'s own `httpx` usage for Ollama is unaffected.
- The binding constraint to check before pinning is **`pydantic`**. This repo is
  held at `pydantic==2.9.2` because `mcp` 1.12.4 and `fastapi` 0.115 require it
  (see the comment block in `requirements.txt`). Run
  `pip install anthropic --dry-run` and confirm it does not demand a newer
  pydantic before choosing the pin. If it does, pin an older `anthropic` that
  does not — do not bump pydantic, which would cascade into fastapi, starlette,
  and sse-starlette.

---

## 7. Configuration

Four new keys. They must be added to **both** env example files — and note that
`docker-compose.yml` passes the same `.env.production` to the `backend` *and*
`mcp` services.

```bash
# --- LLM provider (docs/specs.md Phase 9) -----------------------------------
# Which backend the agent talks to: "ollama" (default) or "claude".
# Everything else about the app is identical either way.
LLM_PROVIDER=ollama

# Only read when LLM_PROVIDER=claude. Never commit a real key.
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-opus-5
# Required by the Anthropic API on every request; no Ollama equivalent.
# Do not lower this casually: the ceiling is enforced, and hitting it truncates
# the reply mid-sentence. 16000 is the recommended non-streaming default.
ANTHROPIC_MAX_TOKENS=16000
```

Three consequences worth stating rather than discovering:

1. **The `mcp` service does not need these keys.** It never talks to an LLM. It
   receives them anyway because compose gives both services one `env_file`.
   Harmless, but if you want the key confined to the backend, that means
   splitting the env files — a separate change, and the reason it is called out
   here rather than done silently.
2. **`LLM_PROVIDER` is a shared-constant hazard** of the kind CLAUDE.md already
   warns about for `MAX_MESSAGE_LENGTH` and `VITE_API_URL`. It appears in
   `.env.example`, `.env.production.example`, and (per `docs/design.md`) the
   Kubernetes ConfigMap. Nothing enforces agreement between them. Change one,
   check the others by hand.
3. **Cost changes character.** Ollama is free per token; Claude is not. A public
   deployment with `LLM_PROVIDER=claude` and no auth in front of `/api/chat` is
   billable by anyone who finds it. The existing rate limiter in `main.py`
   becomes a cost control, not just an abuse control — worth a comment there
   when this ships, per the security-rationale-comment standard.

---

## 8. Running on Kubernetes with this switch

The cluster design is [design.md](design.md); only the deltas are here.

**ConfigMap** — add the non-secret keys:

```yaml
  LLM_PROVIDER: "ollama"
  ANTHROPIC_MODEL: "claude-opus-5"
  ANTHROPIC_MAX_TOKENS: "16000"
```

**Secret** — add the key:

```bash
kubectl create secret generic tender-secrets -n tender \
  --from-literal=MONGODB_URI='mongodb+srv://...' \
  --from-literal=ANTHROPIC_API_KEY='sk-ant-...'
```

**Switching a running cluster** — a ConfigMap edit does not restart pods, so the
change needs an explicit rollout:

```bash
kubectl patch configmap tender-config -n tender \
  --type merge -p '{"data":{"LLM_PROVIDER":"claude"}}'
kubectl rollout restart deploy/backend -n tender
kubectl rollout status  deploy/backend -n tender
```

One genuine simplification: with `LLM_PROVIDER=claude` the cluster no longer
needs to reach Ollama at all. `host.minikube.internal` connectivity — the most
fragile part of the local setup, and the one most likely to be blocked by the
Windows firewall — stops mattering. That makes `claude` the easier mode to get
running first if the Minikube networking step fights you; switch back to
`ollama` once it works.

---

## 9. Tests

Per this repo's lean-coverage rule — one happy path, plus a failure path only
where it is correctness-critical. Extend `backend/tests/test_agent_run.py`,
which already mocks at the right seam:

| Test | Asserts |
|---|---|
| `test_claude_provider_no_tools` | `LLM_PROVIDER=claude`, no tool call → the reply text is returned, and `SYSTEM_PROMPT` went out as the **top-level `system`** argument rather than as a message |
| `test_claude_provider_tool_round_trip` | a `tool_use` block → `mcp_client.call_tool` invoked with the model's arguments, second call carries a `tool_result` block whose `tool_use_id` matches, and carries **no** `tools=` |
| `test_claude_api_error_raises_agent_error` | an `anthropic.APIStatusError` surfaces as `AgentError` (and therefore a 502), not as a leaked status code |
| `test_unconfirmed_delete_under_claude` | the existing delete gate still sends zero MCP invocations — proves the gate is provider-independent |

Mock the `AsyncAnthropic` client the same way `test_agent_run.py` mocks
`agent._call_ollama`: at the provider-function seam, not the HTTP transport. No
network-mocking dependency exists in this repo and this change should not add
one.

The existing Ollama tests must pass **unmodified**. That is the signal that the
refactor preserved behaviour — the same role `spending.test.ts` played in the
dashboard redesign.

---

## 10. Build order

1. Extract `_call_ollama` into `llm/ollama.py` behind `LLMProvider`; `run()`
   speaks `LLMReply`. No behaviour change, existing tests green. **Commit.**
2. Make `mcp_client`'s cache provider-neutral; add `tools_for()`. Existing tests
   green. **Commit.**
3. Add `llm/claude.py`, the dependency, and the env keys. **Commit.**
4. Add the four tests from §9. **Commit.**
5. Update `backend/specs.md` (Phase 9), `README.md`, and CLAUDE.md in the same
   change — not as a follow-up, per CLAUDE.md's doc-synchronisation rule.

Steps 1 and 2 are pure refactors and are independently revertable, which is why
they are separate commits from the feature.

---

## Related

- [design.md](design.md) — the local Minikube + Jenkins deployment this runs on.
- [../backend/specs.md](../backend/specs.md) — Phases 1–8; this is Phase 9.
- [../CLAUDE.md](../CLAUDE.md) — the hard constraints referenced throughout.
