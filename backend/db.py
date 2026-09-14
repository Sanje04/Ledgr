"""
MongoDB connection and conversation persistence for the chat backend.

Two separate paths (see specs.md Phase 3):
  - save_turn(): deterministic auto-save, called unconditionally on every /api/chat request.
  - list_conversations() / search_history() / delete_conversation(): LLM-tool-callable
    operations, invoked by agent.py only when the model decides to call them.

Phase 4 adds a second, independent domain -- mock bank accounts/transactions --
in the same read-only, tool-callable style (list_accounts/search_transactions/
get_spending_summary). See specs.md Phase 4 and scripts/seed_transactions.py,
which populates the accounts/transactions collections these functions read.
"""

import csv
import io
import os
import re
from datetime import datetime, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient

MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DB_NAME = os.environ.get("MONGODB_DB_NAME", "ag_ai")

client = AsyncIOMotorClient(MONGODB_URI)
db = client[MONGODB_DB_NAME]
conversations = db["conversations"]
accounts = db["accounts"]
transactions = db["transactions"]

ACCOUNT_IDS: list[str] = ["checking", "savings", "credit_card"]
CATEGORIES: list[str] = [
    "Groceries",
    "Rent",
    "Dining",
    "Transport",
    "Entertainment",
    "Utilities",
    "Income",
    "Shopping",
    "Healthcare",
    "Transfer",
    "Other",
]
# Excluded from get_spending_summary() by default -- moving money between your
# own accounts (Transfer) or receiving it (Income) isn't "spending".
NON_SPENDING_CATEGORIES = ("Transfer", "Income")

# Canonical name/type per account -- accounts are structurally fixed (also
# referenced by agent.py's tool enums and the frontend's AccountType union),
# so import_transactions() never takes name/type from the uploaded file.
_ACCOUNT_METADATA: dict[str, dict[str, str]] = {
    "checking": {"name": "Checking", "type": "checking"},
    "savings": {"name": "Savings", "type": "savings"},
    "credit_card": {"name": "Credit Card", "type": "credit_card"},
}

REQUIRED_IMPORT_COLUMNS = {"account_id", "date", "category", "merchant", "description", "amount"}


async def ensure_indexes() -> None:
    """Create indexes used by search_history()/search_transactions(). Safe to call repeatedly (no-op if they already exist)."""
    await conversations.create_index([("messages.content", "text")])
    await transactions.create_index([("account_id", 1), ("date", -1)])
    await transactions.create_index([("category", 1)])


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


async def list_accounts() -> list[dict[str, Any]]:
    """Return all mock accounts with their current balances (used by the
    list_accounts agent tool and by GET /api/transactions)."""
    cursor = accounts.find(sort=[("name", 1)])
    return [
        {
            "id": doc["_id"],
            "name": doc["name"],
            "type": doc["type"],
            "current_balance": doc["current_balance"],
        }
        async for doc in cursor
    ]


def _build_transaction_filter(
    account: str | None = None,
    category: str | None = None,
    merchant: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    min_amount: float | None = None,
    max_amount: float | None = None,
) -> dict[str, Any]:
    """
    Build a MongoDB query dict from optional transaction filters.

    Pure function (no I/O) so it's directly unit-testable without mocking
    Mongo -- see tests/test_db_transactions.py.
    """
    query: dict[str, Any] = {}
    if account:
        query["account_id"] = account
    if category:
        query["category"] = category
    if merchant:
        query["merchant"] = {"$regex": re.escape(merchant), "$options": "i"}

    date_filter: dict[str, Any] = {}
    if start_date:
        date_filter["$gte"] = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    if end_date:
        date_filter["$lte"] = datetime.fromisoformat(end_date).replace(tzinfo=timezone.utc)
    if date_filter:
        query["date"] = date_filter

    amount_filter: dict[str, Any] = {}
    if min_amount is not None:
        amount_filter["$gte"] = min_amount
    if max_amount is not None:
        amount_filter["$lte"] = max_amount
    if amount_filter:
        query["amount"] = amount_filter

    return query


def _serialize_transaction(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(doc["_id"]),
        "account_id": doc["account_id"],
        "account_name": doc["account_name"],
        "account_type": doc["account_type"],
        "date": doc["date"].isoformat(),
        "amount": doc["amount"],
        "merchant": doc["merchant"],
        "description": doc["description"],
        "category": doc["category"],
        "running_balance": doc["running_balance"],
    }


async def search_transactions(
    account: str | None = None,
    category: str | None = None,
    merchant: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    min_amount: float | None = None,
    max_amount: float | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Return matching transactions, most recent first, capped at `limit`."""
    query = _build_transaction_filter(
        account, category, merchant, start_date, end_date, min_amount, max_amount
    )
    cursor = transactions.find(query, sort=[("date", -1)], limit=limit)
    return [_serialize_transaction(doc) async for doc in cursor]


async def get_spending_summary(
    category: str | None = None,
    account: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    """
    Compute total spending and a per-category breakdown over matching outflow
    transactions (amount < 0).

    Excludes Transfer/Income by default (unless a specific category is
    requested) so moving money between your own accounts, or receiving it,
    isn't counted as spending -- see specs.md Phase 4.

    Computed here in Python rather than via a Mongo aggregation pipeline: at
    this data volume there's no performance case for $group, it mirrors
    search_history()'s existing "Mongo narrows, Python finishes" style, and
    it's the whole point of this tool -- the model must never be handed raw
    rows and asked to add them up itself.
    """
    query = _build_transaction_filter(
        account=account, category=category, start_date=start_date, end_date=end_date
    )
    query["amount"] = {"$lt": 0}
    if category is None:
        query["category"] = {"$nin": list(NON_SPENDING_CATEGORIES)}

    by_category: dict[str, dict[str, Any]] = {}
    total = 0.0
    count = 0
    async for doc in transactions.find(query):
        total += doc["amount"]
        count += 1
        bucket = by_category.setdefault(
            doc["category"], {"category": doc["category"], "total": 0.0, "count": 0}
        )
        bucket["total"] += doc["amount"]
        bucket["count"] += 1

    return {
        "total_spent": round(abs(total), 2),
        "transaction_count": count,
        "by_category": [
            {
                "category": c["category"],
                "total_spent": round(abs(c["total"]), 2),
                "count": c["count"],
            }
            for c in sorted(by_category.values(), key=lambda c: c["total"])
        ],
    }


def compute_account_balances(
    account_id: str,
    account_name: str,
    account_type: str,
    opening_balance: float,
    events: list[dict[str, Any]],
) -> tuple[float, list[dict[str, Any]]]:
    """
    Walk events (each with date/amount/merchant/description/category)
    chronologically from opening_balance, producing a running_balance per
    event and the final balance.

    Shared by scripts/seed_transactions.py and import_transactions() so the
    demo-data path and the user-CSV-import path compute balances identically
    -- see specs.md Phase 5.
    """
    balance = opening_balance
    docs = []
    for e in sorted(events, key=lambda e: e["date"]):
        balance = round(balance + e["amount"], 2)
        docs.append(
            {
                "account_id": account_id,
                "account_name": account_name,
                "account_type": account_type,
                "date": e["date"],
                "amount": e["amount"],
                "merchant": e["merchant"],
                "description": e["description"],
                "category": e["category"],
                "running_balance": balance,
            }
        )
    return balance, docs


def _parse_import_csv(csv_text: str) -> dict[str, Any]:
    """
    Parse and validate an uploaded transactions CSV into events grouped by
    account_id, plus a resolved opening_balance per account.

    Pure function (no I/O) so the validation logic is directly unit-testable
    -- mirrors _build_transaction_filter's split for the same reason. Expected
    columns: account_id, date, category, merchant, description, amount, plus
    an optional opening_balance column (blank on most rows -- the first
    non-blank value seen for each account_id wins, defaulting to 0.0 if never
    given, so a running_balance/current_balance means the same thing here as
    it does for the seeded demo data). Raises ValueError with a 1-indexed row
    number on the first invalid row -- the whole import is rejected rather
    than skipping or coercing bad rows, so partial or silently-miscategorized
    data never reaches Mongo.
    """
    reader = csv.DictReader(io.StringIO(csv_text))
    if reader.fieldnames is None or not REQUIRED_IMPORT_COLUMNS.issubset(reader.fieldnames):
        missing = REQUIRED_IMPORT_COLUMNS - set(reader.fieldnames or [])
        raise ValueError(f"CSV is missing required column(s): {', '.join(sorted(missing))}.")

    events_by_account: dict[str, list[dict[str, Any]]] = {aid: [] for aid in ACCOUNT_IDS}
    opening_balances: dict[str, float] = {}

    for row_num, row in enumerate(reader, start=2):  # header is line 1
        account_id = (row.get("account_id") or "").strip()
        if account_id not in ACCOUNT_IDS:
            raise ValueError(
                f"Row {row_num}: unknown account_id '{account_id}'. Expected one of: {', '.join(ACCOUNT_IDS)}."
            )

        category = (row.get("category") or "").strip()
        if category not in CATEGORIES:
            raise ValueError(
                f"Row {row_num}: unknown category '{category}'. Expected one of: {', '.join(CATEGORIES)}."
            )

        date_raw = (row.get("date") or "").strip()
        try:
            date = datetime.fromisoformat(date_raw).replace(tzinfo=timezone.utc)
        except ValueError:
            raise ValueError(f"Row {row_num}: invalid date '{date_raw}'. Expected YYYY-MM-DD.")

        amount_raw = (row.get("amount") or "").strip()
        try:
            amount = float(amount_raw)
        except ValueError:
            raise ValueError(f"Row {row_num}: invalid amount '{amount_raw}'.")

        opening_balance_raw = (row.get("opening_balance") or "").strip()
        if opening_balance_raw and account_id not in opening_balances:
            try:
                opening_balances[account_id] = float(opening_balance_raw)
            except ValueError:
                raise ValueError(f"Row {row_num}: invalid opening_balance '{opening_balance_raw}'.")

        events_by_account[account_id].append(
            {
                "date": date,
                "amount": amount,
                "merchant": (row.get("merchant") or "").strip(),
                "description": (row.get("description") or "").strip(),
                "category": category,
            }
        )

    if not any(events_by_account.values()):
        raise ValueError("CSV contains no transaction rows.")

    for account_id in ACCOUNT_IDS:
        opening_balances.setdefault(account_id, 0.0)

    return {"events_by_account": events_by_account, "opening_balances": opening_balances}


async def import_transactions(csv_text: str) -> dict[str, Any]:
    """
    Replace all transactions with the contents of an uploaded CSV, recomputing
    every account's balance to match (see specs.md Phase 5).

    Validation happens entirely in _parse_import_csv before any write -- it
    raises ValueError and nothing touches Mongo if any row is invalid, so an
    import either fully succeeds or leaves existing data untouched. An
    account with no rows in the uploaded file resets to a zero balance rather
    than keeping its old one -- "replace everything" was the chosen semantic,
    not "replace only the account(s) present in the file".
    """
    parsed = _parse_import_csv(csv_text)
    events_by_account = parsed["events_by_account"]
    opening_balances = parsed["opening_balances"]

    all_txns: list[dict[str, Any]] = []
    for account_id in ACCOUNT_IDS:
        meta = _ACCOUNT_METADATA[account_id]
        balance, docs = compute_account_balances(
            account_id, meta["name"], meta["type"], opening_balances[account_id], events_by_account[account_id]
        )
        all_txns.extend(docs)
        await accounts.update_one(
            {"_id": account_id},
            {"$set": {"name": meta["name"], "type": meta["type"], "current_balance": balance}},
            upsert=True,
        )

    await transactions.delete_many({})
    await transactions.insert_many(all_txns)

    return {"imported_count": len(all_txns), "accounts": await list_accounts()}
