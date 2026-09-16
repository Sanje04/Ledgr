"""
Agent that sends a user message to a local LLM served by Ollama and returns its reply.

Ollama may be running on a different machine on the network (see OLLAMA_BASE_URL).

The agent gives the model tool-calling access to two independent domains in MongoDB:
  - Conversation history (list_conversations, search_history, delete_conversation —
    see db.py and specs.md Phase 3).
  - Mock bank accounts/transactions (list_accounts, search_transactions,
    get_spending_summary — see db.py and specs.md Phase 4).

Both domains share one tool-calling loop, capped at one tool round-trip per turn:
  1. Call Ollama with the message + tool schemas. If it doesn't request a tool, return
     its content directly.
  2. Otherwise execute the first requested tool against MongoDB, send the result back
     as a "tool" message, and make a second call (no tools this time) so the model
     composes the final natural-language reply.
This cap is deliberate, not an oversight: a question needing two tool calls (e.g.
"what's my balance and how much did I spend on dining") only gets one half answered
per turn, same as today's behavior with the conversation-history tools. Don't make
this recursive without re-reading specs.md Phase 3/4.
"""

import json
import os
from datetime import datetime, timezone
from typing import Any

import httpx

import db

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1:8b")

SYSTEM_PROMPT = (
    "You are a helpful assistant with two sets of tools. First, tools to list, "
    "search, and delete the user's saved conversation history — use them when the "
    "user asks about past conversations or wants history deleted. Only call "
    "delete_conversation when the user has clearly confirmed they want their "
    "history deleted; otherwise ask them to confirm first. Second, tools over the "
    "user's imported bank account: list_accounts for the account name and "
    "balance, search_transactions for specific transaction lookups, and "
    "get_spending_summary for any total/sum question. Categories are: "
    f"{', '.join(db.CATEGORIES)}. Always use get_spending_summary for totals — "
    "never add up individual transaction amounts yourself. You can only call one "
    "tool per turn, so if a question needs two lookups, answer the first and ask "
    "the user to follow up for the second."
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
    {
        "type": "function",
        "function": {
            "name": "list_accounts",
            "description": (
                "List the user's financial account(s) with their current balances "
                "and names. Use this for balance questions, e.g. 'what's my "
                "balance?', or to find out what an account is called."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_transactions",
            "description": (
                "Look up individual transactions, optionally filtered by account, "
                "category, merchant, date range, or amount range. Use this for "
                "specific lookups, e.g. 'show me transactions from Amazon' or "
                "'what did I buy last week'. Do NOT use this to compute totals — "
                "use get_spending_summary for that."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "account": {
                        "type": "string",
                        "description": (
                            "Restrict results to this account (its id, from "
                            "list_accounts). Usually unnecessary — there's normally "
                            "just one account."
                        ),
                    },
                    "category": {
                        "type": "string",
                        "enum": db.CATEGORIES,
                        "description": "Restrict results to this category.",
                    },
                    "merchant": {
                        "type": "string",
                        "description": "Filter by merchant name (partial match), e.g. 'Amazon'.",
                    },
                    "start_date": {
                        "type": "string",
                        "description": "Only transactions on/after this date (YYYY-MM-DD).",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "Only transactions on/before this date (YYYY-MM-DD).",
                    },
                    "min_amount": {
                        "type": "number",
                        "description": "Only transactions with amount >= this value.",
                    },
                    "max_amount": {
                        "type": "number",
                        "description": "Only transactions with amount <= this value.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of transactions to return (default 20).",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_spending_summary",
            "description": (
                "Compute total spending and a category breakdown, optionally "
                "filtered by category, account, or date range. Always use this for "
                "questions asking for a total/sum — e.g. 'how much did I spend on "
                "groceries in August' — rather than adding up individual "
                "transactions yourself. Excludes transfers between the user's own "
                "accounts and income by default."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": db.CATEGORIES,
                        "description": "Restrict to this category.",
                    },
                    "account": {
                        "type": "string",
                        "description": (
                            "Restrict to this account (its id, from list_accounts). "
                            "Usually unnecessary — there's normally just one account."
                        ),
                    },
                    "start_date": {
                        "type": "string",
                        "description": "Only spending on/after this date (YYYY-MM-DD).",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "Only spending on/before this date (YYYY-MM-DD).",
                    },
                },
                "required": [],
            },
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
        if name == "list_accounts":
            return {"accounts": await db.list_accounts()}
        if name == "search_transactions":
            return {
                "transactions": await db.search_transactions(
                    account=arguments.get("account"),
                    category=arguments.get("category"),
                    merchant=arguments.get("merchant"),
                    start_date=arguments.get("start_date"),
                    end_date=arguments.get("end_date"),
                    min_amount=arguments.get("min_amount"),
                    max_amount=arguments.get("max_amount"),
                    limit=arguments.get("limit") or 20,
                )
            }
        if name == "get_spending_summary":
            return await db.get_spending_summary(
                category=arguments.get("category"),
                account=arguments.get("account"),
                start_date=arguments.get("start_date"),
                end_date=arguments.get("end_date"),
            )
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
        # A cold model load (multi-GB) plus real inference can take well over
        # 60s -- keep this at or above nginx's proxy_read_timeout (ui/nginx.conf)
        # so the backend, not the reverse proxy, is what decides "too slow."
        async with httpx.AsyncClient(timeout=170.0) as client:
            response = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload)
            response.raise_for_status()
    except httpx.RequestError as exc:
        raise AgentError(f"Could not reach Ollama at {OLLAMA_BASE_URL}: {exc}") from exc
    except httpx.HTTPStatusError as exc:
        raise AgentError(f"Ollama returned an error: {exc.response.status_code}") from exc

    return response.json()


async def run(message: str) -> str:
    # The agent is single-turn (see specs.md roadmap) and SYSTEM_PROMPT is a
    # static constant, so nothing else tells the model what day it is --
    # required for it to resolve relative dates ("this month", "last week")
    # in transaction questions. Interpolated per call, not baked into the
    # constant, so SYSTEM_PROMPT stays the stable, docs-referenced persona text.
    today = datetime.now(timezone.utc).date().isoformat()
    system_content = f"{SYSTEM_PROMPT}\n\nToday's date is {today}. Resolve relative dates (e.g. \"this month\", \"last week\") against this."

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_content},
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
