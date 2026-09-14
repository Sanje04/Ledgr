"""
One-time seed script for mock bank account/transaction data (see backend/specs.md
Phase 4). Not imported by the running app -- deliberately excluded from
backend/Dockerfile, since it's a manual dev/demo step, not a runtime dependency.

Loads the checked-in CSV fixtures in backend/data/ (accounts.csv, transactions.csv)
-- human-editable/inspectable, version-controlled -- and loads them into MongoDB.
Idempotent (clears both collections before inserting), so it's safe to re-run.
Invoke manually from backend/:

    .\\.venv\\Scripts\\python.exe scripts\\seed_transactions.py

Requires MONGODB_URI/MONGODB_DB_NAME to point at a reachable MongoDB -- reuses
the same backend/.env config db.py already reads.

Transaction dates in the CSV are stored as `days_ago` (relative to "now" at
seed time), not absolute dates, specifically so re-running this script always
reproduces "the last ~6 months up to today" rather than the checked-in data
going stale as fixed calendar dates would -- relative spacing between
transactions (paychecks, rent, etc.) is preserved, only the anchor moves.
"""

import asyncio
import csv
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv

load_dotenv(BACKEND_DIR / ".env")

import db  # noqa: E402  (must follow the sys.path/env setup above)


def _load_accounts() -> list[dict[str, Any]]:
    with open(DATA_DIR / "accounts.csv", newline="", encoding="utf-8") as f:
        return [
            {
                "account_id": row["account_id"],
                "name": row["name"],
                "type": row["type"],
                "opening_balance": float(row["opening_balance"]),
            }
            for row in csv.DictReader(f)
        ]


def _load_transaction_templates(today: datetime) -> list[dict[str, Any]]:
    with open(DATA_DIR / "transactions.csv", newline="", encoding="utf-8") as f:
        return [
            {
                "account_id": row["account_id"],
                "date": today - timedelta(days=int(row["days_ago"])),
                "category": row["category"],
                "merchant": row["merchant"],
                "description": row["description"],
                "amount": float(row["amount"]),
            }
            for row in csv.DictReader(f)
        ]


def _finalize_account(
    account: dict[str, Any], events: list[dict[str, Any]]
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    balance, docs = db.compute_account_balances(
        account["account_id"], account["name"], account["type"], account["opening_balance"], events
    )
    account_doc = {
        "_id": account["account_id"],
        "name": account["name"],
        "type": account["type"],
        "current_balance": balance,
    }
    return account_doc, docs


async def main() -> None:
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    accounts = _load_accounts()
    templates = _load_transaction_templates(today)

    all_accounts = []
    all_txns = []
    for account in accounts:
        events = [t for t in templates if t["account_id"] == account["account_id"]]
        account_doc, docs = _finalize_account(account, events)
        all_accounts.append(account_doc)
        all_txns.extend(docs)

    await db.accounts.delete_many({})
    await db.transactions.delete_many({})
    await db.accounts.insert_many(all_accounts)
    await db.transactions.insert_many(all_txns)
    await db.ensure_indexes()

    print(f"Seeded {len(all_accounts)} accounts and {len(all_txns)} transactions from {DATA_DIR}.")
    for acc in all_accounts:
        print(f"  {acc['name']:12s} balance: {acc['current_balance']:>10.2f}")


if __name__ == "__main__":
    asyncio.run(main())
