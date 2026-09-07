"""
MongoDB connection and conversation persistence for the chat backend.

Two separate paths (see specs.md Phase 3):
  - save_turn(): deterministic auto-save, called unconditionally on every /api/chat request.
  - list_conversations() / search_history() / delete_conversation(): LLM-tool-callable
    operations, invoked by agent.py only when the model decides to call them.
"""

import os
from datetime import datetime, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient

MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DB_NAME = os.environ.get("MONGODB_DB_NAME", "ag_ai")

client = AsyncIOMotorClient(MONGODB_URI)
db = client[MONGODB_DB_NAME]
conversations = db["conversations"]


async def ensure_indexes() -> None:
    """Create the text index used by search_history(). Safe to call repeatedly (no-op if it already exists)."""
    await conversations.create_index([("messages.content", "text")])


async def save_turn(user_message: str, assistant_message: str) -> None:
    """
    Append a user/assistant message pair to the conversation, creating one if
    none exists yet.

    The API contract has no conversation_id yet (see specs.md Phase 3 open
    questions - the frontend implies a single session), so every turn is
    appended to the most recently updated conversation document.
    """
    now = datetime.now(timezone.utc)
    turn = [
        {"role": "user", "content": user_message, "timestamp": now},
        {"role": "assistant", "content": assistant_message, "timestamp": now},
    ]

    existing = await conversations.find_one(sort=[("updated_at", -1)])
    if existing is not None:
        await conversations.update_one(
            {"_id": existing["_id"]},
            {"$push": {"messages": {"$each": turn}}, "$set": {"updated_at": now}},
        )
        return

    await conversations.insert_one(
        {
            "title": user_message[:60],
            "created_at": now,
            "updated_at": now,
            "messages": turn,
        }
    )


async def list_conversations(limit: int = 10) -> list[dict[str, Any]]:
    """
    Return summaries of the most recently updated conversations.

    Only one conversation document exists today (see specs.md Phase 3 —
    single-conversation model), so this returns 0 or 1 entries in practice.
    `limit` is accepted now so the shape doesn't need to change if/when
    multiple conversations are introduced.
    """
    cursor = conversations.find(sort=[("updated_at", -1)], limit=limit)
    results = []
    async for doc in cursor:
        results.append(
            {
                "id": str(doc["_id"]),
                "title": doc.get("title", ""),
                "created_at": doc["created_at"].isoformat(),
                "updated_at": doc["updated_at"].isoformat(),
                "message_count": len(doc.get("messages", [])),
            }
        )
    return results


async def search_history(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """
    Full-text search across message content using the text index from ensure_indexes().

    $text finds candidate conversation documents; since MongoDB's text search
    doesn't identify which array element(s) matched, matching messages within
    each candidate are located by a case-insensitive substring check in Python.
    """
    cursor = conversations.find(
        {"$text": {"$search": query}},
        sort=[("updated_at", -1)],
    )

    query_lower = query.lower()
    results: list[dict[str, Any]] = []
    async for doc in cursor:
        for msg in doc.get("messages", []):
            if query_lower in msg.get("content", "").lower():
                results.append(
                    {
                        "conversation_id": str(doc["_id"]),
                        "role": msg["role"],
                        "content": msg["content"],
                        "timestamp": msg["timestamp"].isoformat(),
                    }
                )
                if len(results) >= limit:
                    return results
    return results


async def delete_conversation() -> dict[str, Any]:
    """
    Delete the single conversation document, if one exists.

    Confirmation-gating happens in agent.py before this is ever called (see
    specs.md Phase 3 — "Tool contracts") — by the time this runs, the delete
    has already been authorized.
    """
    existing = await conversations.find_one(sort=[("updated_at", -1)])
    if existing is None:
        return {"deleted": False, "reason": "No conversation exists yet."}

    await conversations.delete_one({"_id": existing["_id"]})
    return {"deleted": True, "id": str(existing["_id"])}
