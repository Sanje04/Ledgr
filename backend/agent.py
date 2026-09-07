"""
Agent that sends a user message to a local LLM served by Ollama and returns its reply.

Ollama may be running on a different machine on the network (see OLLAMA_BASE_URL).

The agent also gives the model tool-calling access to conversation history in MongoDB
(list_conversations, search_history, delete_conversation — see db.py and specs.md
Phase 3). This is a two-call loop capped at one tool round-trip per turn:
  1. Call Ollama with the message + tool schemas. If it doesn't request a tool, return
     its content directly.
  2. Otherwise execute the first requested tool against MongoDB, send the result back
     as a "tool" message, and make a second call (no tools this time) so the model
     composes the final natural-language reply.
"""

import json
import os
from typing import Any

import httpx

import db

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1:8b")

SYSTEM_PROMPT = (
    "You are a helpful assistant. You have tools to list, search, and delete the "
    "user's saved conversation history — use them when the user asks about past "
    "conversations or wants history deleted. Only call delete_conversation when the "
    "user has clearly confirmed they want their history deleted; otherwise ask them "
    "to confirm first."
)

DELETE_INTENT_WORDS = ("delete", "remove", "clear", "wipe")
CONFIRM_TOKENS = ("confirm", "yes", "sure", "please")

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "list_conversations",
            "description": (
                "List recent saved conversations, most recently updated first. "
                "Use this when the user asks what conversations or chat history exist."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of conversations to return.",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_history",
            "description": (
                "Search past conversation messages for a keyword or phrase. Use this "
                "when the user asks what was discussed previously, e.g. "
                "'what did we talk about yesterday?'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The keyword or phrase to search for in past messages.",
                    }
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_conversation",
            "description": (
                "Permanently delete the user's saved conversation history. Only call "
                "this when the user has explicitly asked to delete/clear/remove their "
                "history AND clearly confirmed they want to proceed in the same message."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]


class AgentError(Exception):
    """Raised when the Ollama backend can't be reached or returns an error."""


def _is_delete_confirmed(user_message: str) -> bool:
    lowered = user_message.lower()
    if "confirm" in lowered:
        return True
    has_intent = any(word in lowered for word in DELETE_INTENT_WORDS)
    has_confirm_token = any(word in lowered for word in CONFIRM_TOKENS)
    return has_intent and has_confirm_token


async def _execute_tool(name: str, arguments: dict[str, Any], user_message: str) -> dict[str, Any]:
    try:
        if name == "list_conversations":
            limit = arguments.get("limit") or 10
            return {"conversations": await db.list_conversations(limit=limit)}
        if name == "search_history":
            query = arguments.get("query", "")
            return {"results": await db.search_history(query)}
        if name == "delete_conversation":
            if not _is_delete_confirmed(user_message):
                return {
                    "deleted": False,
                    "reason": (
                        "Not confirmed yet. Ask the user to explicitly confirm "
                        "deletion (e.g. 'yes, please delete it') before calling "
                        "this tool again."
                    ),
                }
            return await db.delete_conversation()
        return {"error": f"Unknown tool: {name}"}
    except Exception as exc:
        return {"error": f"Database error while executing {name}: {exc}"}


async def _call_ollama(messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
    }
    if tools:
        payload["tools"] = tools

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload)
            response.raise_for_status()
    except httpx.RequestError as exc:
        raise AgentError(f"Could not reach Ollama at {OLLAMA_BASE_URL}: {exc}") from exc
    except httpx.HTTPStatusError as exc:
        raise AgentError(f"Ollama returned an error: {exc.response.status_code}") from exc

    return response.json()


async def run(message: str) -> str:
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": message},
    ]

    first = await _call_ollama(messages, tools=TOOLS)
    assistant_message = first["message"]
    tool_calls = assistant_message.get("tool_calls")

    if not tool_calls:
        return assistant_message["content"]

    call = tool_calls[0]["function"]
    name = call["name"]
    raw_arguments = call.get("arguments") or {}
    arguments = raw_arguments if isinstance(raw_arguments, dict) else json.loads(raw_arguments)

    result = await _execute_tool(name, arguments, message)

    messages.append(assistant_message)
    messages.append({"role": "tool", "content": json.dumps(result, default=str)})

    second = await _call_ollama(messages, tools=None)
    return second["message"]["content"]
