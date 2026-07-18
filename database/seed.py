"""
Seed MongoDB Atlas `plantapp.plants` from plants_curated.json.

Put secrets in the repo-root `.env` (never commit it):

  MONGODB_URI=mongodb+srv://USER:PASSWORD@plants.hjmpuck.mongodb.net/?appName=Plants
  MONGODB_DB=plantapp

If your password contains @ # : / ? etc., URL-encode them
(e.g. @ → %40). Atlas's "Connect" dialog usually gives you a ready string.

Usage:
  cd database
  pip install -r requirements.txt
  python seed.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv
from pymongo import ASCENDING, MongoClient

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
JSON_PATH = HERE / "plants_curated.json"

# Prefer repo-root .env; also allow database/.env if you drop it here
load_dotenv(ROOT / ".env")
load_dotenv(HERE / ".env")


def build_uri() -> str | None:
    """Accept either a full MONGODB_URI or USER+PASSWORD pieces."""
    uri = os.getenv("MONGODB_URI", "").strip()
    if uri and "<" not in uri and "PASSWORD" not in uri:
        return uri

    user = (
        os.getenv("MONGODB_USER", "").strip()
        or os.getenv("MONGODB_USERNAME", "").strip()
    )
    password = os.getenv("MONGODB_PASSWORD", "").strip()
    host = os.getenv(
        "MONGODB_HOST",
        "plants.hjmpuck.mongodb.net",
    ).strip()
    app_name = os.getenv("MONGODB_APP_NAME", "Plants").strip()

    if user and password:
        # quote_plus handles @ : / etc. in the password
        return (
            f"mongodb+srv://{quote_plus(user)}:{quote_plus(password)}"
            f"@{host}/?appName={app_name}"
        )
    return uri or None


def main() -> int:
    uri = build_uri()
    if not uri:
        print(
            "Missing Mongo credentials.\n\n"
            "Create a file at the REPO ROOT named `.env` (same folder as README.md):\n"
            "  MONGODB_URI=mongodb+srv://USER:PASSWORD@plants.hjmpuck.mongodb.net/?appName=Plants\n\n"
            "Or split it:\n"
            "  MONGODB_USER=...\n"
            "  MONGODB_PASSWORD=...\n\n"
            "`.env` is gitignored — do not commit it. Use `.env.example` as the template.",
            file=sys.stderr,
        )
        return 1

    if not JSON_PATH.exists():
        print(f"JSON not found: {JSON_PATH}", file=sys.stderr)
        return 1

    with JSON_PATH.open(encoding="utf-8") as f:
        payload = json.load(f)

    plants = payload.get("plants")
    if not isinstance(plants, list) or not plants:
        print("plants_curated.json has no plants[] array", file=sys.stderr)
        return 1

    ids = {p["id"] for p in plants}
    for p in plants:
        bad = [c for c in p.get("companions", []) if c not in ids]
        if bad:
            print(f"Warning: {p['id']} has unknown companions: {bad}")

    db_name = os.getenv("MONGODB_DB", "plantapp")
    print(f"Connecting… (db={db_name})")
    client = MongoClient(uri, serverSelectionTimeoutMS=15000)
    client.admin.command("ping")

    db = client[db_name]
    coll = db["plants"]

    coll.delete_many({})
    result = coll.insert_many(plants)
    coll.create_index([("id", ASCENDING)], unique=True)
    coll.create_index([("scientificName", ASCENDING)])
    coll.create_index([("aliases", ASCENDING)])
    coll.create_index([("name", ASCENDING)])

    db["catalog_meta"].delete_many({})
    if "meta" in payload:
        db["catalog_meta"].insert_one({**payload["meta"], "_id": "plants_curated"})

    print(
        f"Seeded {len(result.inserted_ids)} plants into "
        f"{db_name}.plants "
        f"(meta version={payload.get('meta', {}).get('version')})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
