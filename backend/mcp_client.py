"""
MCP client: the backend's half of the two-process split introduced in
specs.md Phase 8.

Replaces `agent.TOOLS`. The tool list is *discovered* from mcp_server.py over
streamable HTTP at startup and cached for the process lifetime, so adding or
changing a tool is a one-file change on the server side -- the backend learns
about it on the next boot without a code edit.

Two shapes are in play and the translation between them lives here so nothing
else has to know about it:
  - **MCP**: `{name, description, inputSchema}` (JSON Schema), what the server speaks.
  - **Ollama**: `{"type": "function", "function": {name, description, parameters}}`,
    what `agent._call_ollama` puts in its payload.
`_to_ollama_schema` is the only place that mapping exists.

Failure posture, deliberately soft everywhere:
  - Discovery failure is not fatal. Startup completes with an empty cache, the
    API serves, and the next `/api/chat` retries discovery once. If that also
    fails, the model is simply called with no tools and answers directly.
  - An invocation failure (server down, timeout, unparseable reply) becomes an
    `{"error": ...}` tool result, which agent.py hands back to the model as a
    normal `tool` message. So a dead MCP server degrades chat to "the model
    explains it couldn't look that up", never a 502 -- HTTP 502 stays reserved
    for Ollama being unreachable (see CLAUDE.md's two-error-path rule).

A fresh connection is opened per operation rather than holding one long-lived
`ClientSession`. That costs a round-trip, but the server runs stateless (see
mcp_server.build_app) and concurrent `/api/chat` requests sharing one session
would need locking around a single duplex stream -- not worth it at this scale.
"""

import asyncio
import json
import logging
import os
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

logger = logging.getLogger(__name__)

# The one variable the backend reads for the MCP endpoint (specs.md Phase 8).
# The default addresses docker-compose.yml's `mcp` service by name so the
# compose path works with nothing set; local dev overrides it in backend/.env.
DEFAULT_MCP_SERVER_URL = "http://mcp:9000/mcp"
MCP_SERVER_URL = os.environ.get("MCP_SERVER_URL") or DEFAULT_MCP_SERVER_URL

DISCOVERY_TIMEOUT_SECONDS = 10.0
# Bounded well under agent._call_ollama's 170s budget so a hung MCP server
# can't push a turn past it -- a slow tool must not cost us the whole request.
INVOCATION_TIMEOUT_SECONDS = 15.0

_cached_tools: list[dict[str, Any]] = []


def _to_ollama_schema(tool: Any) -> dict[str, Any] | None:
    """
    Translate one discovered MCP tool into Ollama's function-schema shape.

    Returns None for a tool we can't represent (no name, or an `inputSchema`
    that isn't a JSON Schema object) so discovery keeps the tools it *can* use
    instead of failing wholesale on one malformed entry.
    """
    name = getattr(tool, "name", None)
    if not isinstance(name, str) or not name:
        return None

    parameters = getattr(tool, "inputSchema", None)
    if not isinstance(parameters, dict) or parameters.get("type") != "object":
        return None

    return {
        "type": "function",
        "function": {
            "name": name,
            "description": getattr(tool, "description", None) or "",
            "parameters": parameters,
        },
    }


async def _list_tools_over_mcp() -> list[dict[str, Any]]:
    async with streamablehttp_client(MCP_SERVER_URL, timeout=DISCOVERY_TIMEOUT_SECONDS) as (
        read_stream,
        write_stream,
        _,
    ):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            listing = await session.list_tools()

    translated: list[dict[str, Any]] = []
    for tool in listing.tools:
        schema = _to_ollama_schema(tool)
        if schema is None:
            logger.warning(
                "Excluding MCP tool %r from the cache: missing name or unusable inputSchema",
                getattr(tool, "name", "<unnamed>"),
            )
            continue
        translated.append(schema)
    return translated


async def discover_tools() -> list[dict[str, Any]]:
    """
    Fetch the tool list from the MCP server and replace the cache with it.

    Never raises. On any failure the cache is left as-is (empty, on the startup
    path) and `[]` is returned, so callers can't be broken by the tool server
    being down.
    """
    global _cached_tools
    try:
        tools = await asyncio.wait_for(_list_tools_over_mcp(), timeout=DISCOVERY_TIMEOUT_SECONDS)
    except Exception:
        logger.exception("MCP tool discovery failed against %s; continuing with no tools", MCP_SERVER_URL)
        return list(_cached_tools)

    _cached_tools = tools
    logger.info(
        "Discovered %d MCP tool(s) from %s: %s",
        len(tools),
        MCP_SERVER_URL,
        ", ".join(t["function"]["name"] for t in tools) or "(none)",
    )
    return list(_cached_tools)


def cached_tools() -> list[dict[str, Any]]:
    """The cached Ollama-shaped tool schemas. Empty until discovery succeeds once."""
    return list(_cached_tools)


def cached_tool_names() -> set[str]:
    return {t["function"]["name"] for t in _cached_tools}


async def ensure_tools() -> list[dict[str, Any]]:
    """
    Return the cached tools, attempting discovery once if the cache is empty.

    This is the per-request retry that makes a failed *startup* discovery
    recoverable without restarting the backend -- the first chat request after
    the MCP server comes up picks the tools up.
    """
    if _cached_tools:
        return list(_cached_tools)
    return await discover_tools()


def reset_cache() -> None:
    """Clear the cache. Exists for tests; not used on any request path."""
    global _cached_tools
    _cached_tools = []


def _result_to_dict(result: Any, name: str) -> dict[str, Any]:
    """
    Unwrap an MCP `CallToolResult` back into the plain dict agent.py feeds the model.

    Prefers `structuredContent` (what the server's dict return becomes) and
    falls back to JSON-parsing the first text block, since a JSON text block is
    the shape every compliant server emits even when it sets no structured
    content.
    """
    if getattr(result, "isError", False):
        text = _first_text(result) or "unknown error"
        return {"error": f"Tool {name} failed: {text}"}

    structured = getattr(result, "structuredContent", None)
    if isinstance(structured, dict):
        return structured

    text = _first_text(result)
    if text is None:
        return {"error": f"Tool {name} returned no readable content."}
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return {"error": f"Tool {name} returned unparseable content: {text[:200]}"}
    return parsed if isinstance(parsed, dict) else {"result": parsed}


def _first_text(result: Any) -> str | None:
    for block in getattr(result, "content", None) or []:
        text = getattr(block, "text", None)
        if isinstance(text, str):
            return text
    return None


async def _call_tool_over_mcp(name: str, arguments: dict[str, Any]) -> Any:
    async with streamablehttp_client(MCP_SERVER_URL, timeout=INVOCATION_TIMEOUT_SECONDS) as (
        read_stream,
        write_stream,
        _,
    ):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            return await session.call_tool(name, arguments)


async def call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """
    Invoke `name` on the MCP server and return its result as a plain dict.

    Never raises -- every failure mode (unreachable server, timeout, error
    result, unparseable payload) comes back as `{"error": ...}` so the caller
    can hand it to the model as an ordinary tool result.
    """
    try:
        result = await asyncio.wait_for(
            _call_tool_over_mcp(name, arguments), timeout=INVOCATION_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        logger.warning("MCP invocation of %s timed out after %ss", name, INVOCATION_TIMEOUT_SECONDS)
        return {"error": f"Tool {name} timed out after {INVOCATION_TIMEOUT_SECONDS:.0f}s."}
    except Exception as exc:
        logger.exception("MCP invocation of %s failed", name)
        return {"error": f"Could not reach the tool server to run {name}: {exc}"}

    return _result_to_dict(result, name)
