# PlotTwist plant catalog

`plants_curated.json` is the version-controlled source of truth (40+ plants).
MongoDB is what the live API reads after seeding.

## Seed Atlas

1. Confirm a DB user exists in Atlas → Database Access.
2. Network Access → allow `0.0.0.0/0` (hackathon).
3. Copy repo `.env.example` → `.env` and set `MONGODB_URI`
   (URL-encode special password characters, e.g. `@` → `%40`).
4. Run:

```bash
pip install -r requirements.txt
python seed.py
```

Collections written: `plantapp.plants`, `plantapp.catalog_meta`.
Gardens are created at runtime by `POST /gardens` on the backend.
