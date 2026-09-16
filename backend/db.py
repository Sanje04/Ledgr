"""
MongoDB connection and conversation persistence for the chat backend.

Three paths now (see specs.md Phase 3 and Phase 7):
  - save_turn(): deterministic auto-save, called unconditionally on every /api/chat request.
  - get_recent_history(): deterministic, non-model-controlled fetch of a bounded window of
    recent turns, called unconditionally before agent.run() to seed multi-turn context --
    like save_turn(), not tool-callable, not model-controlled.
  - list_conversations() / search_history() / delete_conversation(): LLM-tool-callable
    operations, invoked by agent.py only when the model decides to call them.

Phase 4 adds a second, independent domain -- mock bank accounts/transactions --
in the same read-only, tool-callable style (list_accounts/search_transactions/
get_spending_summary). See specs.md Phase 4 and scripts/seed_transactions.py,
which populates the accounts/transactions collections these functions read.
"""

import csv
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)

MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DB_NAME = os.environ.get("MONGODB_DB_NAME", "ag_ai")

DEFAULT_MAX_HISTORY_TURNS = 5


def _load_max_history_turns() -> int:
    raw = os.environ.get("MAX_HISTORY_TURNS", str(DEFAULT_MAX_HISTORY_TURNS))
    try:
        return int(raw)
    except ValueError:
        logger.warning(
            "Invalid MAX_HISTORY_TURNS=%r (must be an integer); falling back to default %d",
            raw,
            DEFAULT_MAX_HISTORY_TURNS,
        )
        return DEFAULT_MAX_HISTORY_TURNS


MAX_HISTORY_TURNS = _load_max_history_turns()

client = AsyncIOMotorClient(MONGODB_URI)
db = client[MONGODB_DB_NAME]
conversations = db["conversations"]
accounts = db["accounts"]
transactions = db["transactions"]

ACCOUNT_TYPES: list[str] = ["checking", "savings", "credit_card"]
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

# Imported statement rows carry no category column (see _parse_import_csv) --
# everything lands here except the transfer-description heuristic below.
DEFAULT_IMPORT_CATEGORY = "Other"

# Outgoing legs matching these substrings (checked against the raw,
# uppercased description) are categorized as Transfer instead of Other, so
# they're excluded from get_spending_summary() by NON_SPENDING_CATEGORIES --
# without this, an e-transfer-out or internal "TF" transfer would otherwise
# inflate "spending" by its full amount. Deliberately narrow (just enough to
# keep the demo statement's totals sane), not a general categorizer -- see
# specs.md Phase 5.
_TRANSFER_DESCRIPTION_MARKERS = ("ETRNSFR SENT", "] TF ")

# Header cell names (case-insensitive, substring-matched) expected in an
# imported bank statement export -- see _find_statement_header.
_STATEMENT_TYPE_COLUMN = ("transaction", "type")
_STATEMENT_DATE_COLUMN = ("date",)
_STATEMENT_AMOUNT_COLUMN = ("amount",)
_STATEMENT_DESCRIPTION_COLUMN = ("description",)


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


async def get_recent_history(max_turns: int = MAX_HISTORY_TURNS) -> list[dict[str, str]]:
    """
    Return the most recent `max_turns` user/assistant message pairs from the
    single conversation document, oldest-first, as {role, content} dicts
    ready for Ollama's messages array (timestamp stripped -- /api/chat has no
    use for it).

    Deterministic and non-model-controlled, like save_turn() -- called
    unconditionally by main.py before agent.run(), not a tool call. Bounded
    by design (see CLAUDE.md hard constraints / specs.md Phase 7): a
    non-positive max_turns returns [] rather than being used as a slice
    limit, since both Python's list[-0:] and Mongo's $slice: 0 mean "the
    whole array", not "nothing" -- silently reintroducing the exact
    unbounded-history behavior this function exists to prevent.

    Returns [] if no conversation document exists yet (fresh install, or
    right after delete_conversation()) -- not an error.

    Uses a $slice projection so only the last `max_turns * 2` messages are
    ever pulled over the wire, since save_turn() lets `messages` grow
    unboundedly and this runs on every /api/chat request.
    """
    if max_turns <= 0:
        return []

    limit = max_turns * 2
    doc = await conversations.find_one(
        sort=[("updated_at", -1)], projection={"messages": {"$slice": -limit}}
    )
    if doc is None:
        return []

    return [{"role": m["role"], "content": m["content"]} for m in doc.get("messages", [])]


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


_BRACKET_TAG_RE = re.compile(r"^\[[A-Z]{2,4}\]\s*")
_MULTI_SPACE_RE = re.compile(r"\s{2,}")


def _derive_merchant(description: str) -> str:
    """
    Bank statement descriptions carry a leading transaction-type tag (e.g.
    "[PR]") and pad the merchant name out to a fixed-width location column
    with runs of 2+ spaces, e.g. "[PR]CAMPUS PIZZA        WATERLOO   ON" --
    strip the tag and take the text before that padding as the merchant.
    Falls back to the whole trimmed string when there's no padding to split
    on (e.g. "[SC]PLUS PLAN").
    """
    without_tag = _BRACKET_TAG_RE.sub("", description).strip()
    return _MULTI_SPACE_RE.split(without_tag, maxsplit=1)[0].strip() or without_tag


def _classify_import_category(description: str) -> str:
    upper = description.upper()
    if any(marker in upper for marker in _TRANSFER_DESCRIPTION_MARKERS):
        return "Transfer"
    return DEFAULT_IMPORT_CATEGORY


def _find_column(header_index: dict[str, int], keywords: tuple[str, ...]) -> int:
    for name, idx in header_index.items():
        if all(kw in name for kw in keywords):
            return idx
    raise ValueError(f"CSV header is missing a column matching {' '.join(keywords)!r}.")


def _find_statement_header(lines: list[str]) -> tuple[int, dict[str, int]]:
    """
    Bank exports carry a free-text preamble line (e.g. "Following data is
    valid as of ...") before the real header, and the header's exact column
    set/order/naming isn't guaranteed across exports -- scan for the row that
    contains the columns actually needed (by content, not fixed line number)
    rather than assuming line 1.
    """
    for i, line in enumerate(lines):
        cells = [c.strip().lower() for c in next(csv.reader([line]))]
        if "transaction type" in cells and "date posted" in cells:
            return i, {name: idx for idx, name in enumerate(cells)}
    raise ValueError(
        "CSV is missing the expected header row (must include 'Transaction Type' and 'Date Posted' columns)."
    )


def _parse_import_csv(csv_text: str) -> list[dict[str, Any]]:
    """
    Parse a raw bank-statement export into transaction events for the single
    account being imported (see specs.md Phase 5) -- account name/type/
    opening balance come from the import dialog, not the file. These exports
    carry a free-text preamble and a header whose exact columns aren't
    guaranteed, so the header is located by content and columns by name
    (case-insensitive substring match) rather than by position. An
    identifying column (e.g. card number) is allowed and ignored. There's no
    category column, so every row is categorized DEFAULT_IMPORT_CATEGORY
    ("Other") except outgoing-transfer-shaped descriptions (see
    _classify_import_category) -- a deliberate, narrow heuristic, not a
    general categorizer. Raises ValueError with a 1-indexed (original file)
    line number on the first invalid row -- fail-fast, same all-or-nothing
    contract as before.
    """
    numbered_lines = [(i, line) for i, line in enumerate(csv_text.splitlines(), start=1) if line.strip()]
    if not numbered_lines:
        raise ValueError("CSV is empty.")

    header_pos, header_index = _find_statement_header([line for _, line in numbered_lines])
    type_idx = _find_column(header_index, _STATEMENT_TYPE_COLUMN)
    date_idx = _find_column(header_index, _STATEMENT_DATE_COLUMN)
    amount_idx = _find_column(header_index, _STATEMENT_AMOUNT_COLUMN)
    description_idx = _find_column(header_index, _STATEMENT_DESCRIPTION_COLUMN)

    data_lines = numbered_lines[header_pos + 1 :]
    events: list[dict[str, Any]] = []
    for line_no, row in zip(
        (ln for ln, _ in data_lines), csv.reader(line for _, line in data_lines)
    ):
        if not any(cell.strip() for cell in row):
            continue

        txn_type = row[type_idx].strip().upper() if type_idx < len(row) else ""
        if txn_type not in ("DEBIT", "CREDIT"):
            raise ValueError(f"Row {line_no}: unknown transaction type '{txn_type}'. Expected DEBIT or CREDIT.")

        date_raw = row[date_idx].strip() if date_idx < len(row) else ""
        try:
            date = datetime.strptime(date_raw, "%Y%m%d").replace(tzinfo=timezone.utc)
        except ValueError:
            raise ValueError(f"Row {line_no}: invalid date '{date_raw}'. Expected YYYYMMDD.")

        amount_raw = row[amount_idx].strip() if amount_idx < len(row) else ""
        try:
            # The type column, not the amount's own sign, decides direction --
            # some exports emit all-positive amounts and carry direction only
            # in the type column, so trusting the sign as-given would silently
            # turn every DEBIT into income for those files.
            magnitude = abs(float(amount_raw))
        except ValueError:
            raise ValueError(f"Row {line_no}: invalid amount '{amount_raw}'.")
        amount = -magnitude if txn_type == "DEBIT" else magnitude

        description = row[description_idx].strip() if description_idx < len(row) else ""
        events.append(
            {
                "date": date,
                "amount": amount,
                "merchant": _derive_merchant(description),
                "description": description,
                "category": _classify_import_category(description),
            }
        )

    if not events:
        raise ValueError("CSV contains no transaction rows.")

    return events


def _slugify_account_name(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")
    return slug or "account"


async def import_transactions(
    csv_text: str, account_name: str, account_type: str, opening_balance: float = 0.0
) -> dict[str, Any]:
    """
    Replace all account/transaction data with a single account built from an
    uploaded bank-statement CSV plus the name/type/opening balance supplied
    in the import dialog -- accounts are no longer a fixed set of 3 (see
    specs.md Phase 5). Validation (name non-empty, type known, every CSV row)
    happens entirely before any write, so an import either fully succeeds or
    leaves existing data untouched. Like scripts/seed_transactions.py, this
    replaces the accounts collection outright (delete_many + insert_one)
    rather than upserting into a fixed id, since the imported account may
    have a different name/id than whatever was there before.
    """
    name = account_name.strip()
    if not name:
        raise ValueError("Account name is required.")
    if account_type not in ACCOUNT_TYPES:
        raise ValueError(f"Unknown account type '{account_type}'. Expected one of: {', '.join(ACCOUNT_TYPES)}.")

    events = _parse_import_csv(csv_text)
    account_id = _slugify_account_name(name)
    balance, docs = compute_account_balances(account_id, name, account_type, opening_balance, events)

    await accounts.delete_many({})
    await accounts.insert_one({"_id": account_id, "name": name, "type": account_type, "current_balance": balance})

    await transactions.delete_many({})
    await transactions.insert_many(docs)

    return {"imported_count": len(docs), "accounts": await list_accounts()}
