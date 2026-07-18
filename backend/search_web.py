"""YouTube + Google Custom Search helpers for the Search tab."""

from __future__ import annotations

import os
import re
from typing import Any

import httpx

YOUTUBE_API_KEY = ""
GOOGLE_CSE_API_KEY = ""
GOOGLE_CSE_ID = ""

# Offline / no-key demos so Search never feels empty on stage.
DEMO_VIDEOS: list[dict[str, str]] = [
    {
        "title": "How to Grow Tomatoes: Complete Guide for Beginners",
        "video_id": "ECibnV1_3jM",
        "channel": "Epic Gardening",
        "duration": "12:04",
        "thumbnail": "https://img.youtube.com/vi/ECibnV1_3jM/hqdefault.jpg",
    },
    {
        "title": "Vegetable Garden for Beginners",
        "video_id": "qNtEgeCDVZU",
        "channel": "GrowVeg",
        "duration": "10:18",
        "thumbnail": "https://img.youtube.com/vi/qNtEgeCDVZU/hqdefault.jpg",
    },
    {
        "title": "Composting for Beginners",
        "video_id": "FxYw0XPYoqg",
        "channel": "California Academy of Sciences",
        "duration": "5:32",
        "thumbnail": "https://img.youtube.com/vi/FxYw0XPYoqg/hqdefault.jpg",
    },
]


def _load_keys() -> None:
    global YOUTUBE_API_KEY, GOOGLE_CSE_API_KEY, GOOGLE_CSE_ID
    YOUTUBE_API_KEY = (
        os.getenv("YOUTUBE_API_KEY", "").strip()
        or os.getenv("GOOGLE_API_KEY", "").strip()
    )
    GOOGLE_CSE_API_KEY = (
        os.getenv("GOOGLE_CSE_API_KEY", "").strip()
        or os.getenv("GOOGLE_API_KEY", "").strip()
    )
    GOOGLE_CSE_ID = os.getenv("GOOGLE_CSE_ID", "").strip()


def youtube_configured() -> bool:
    _load_keys()
    return bool(YOUTUBE_API_KEY)


def google_cse_configured() -> bool:
    _load_keys()
    return bool(GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID)


def _iso8601_duration(iso: str | None) -> str | None:
    """Convert YouTube contentDetails.duration (PT#H#M#S) → m:ss / h:mm:ss."""
    if not iso:
        return None
    m = re.fullmatch(
        r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?",
        iso.strip(),
    )
    if not m:
        return None
    h = int(m.group(1) or 0)
    mins = int(m.group(2) or 0)
    secs = int(m.group(3) or 0)
    if h:
        return f"{h}:{mins:02d}:{secs:02d}"
    return f"{mins}:{secs:02d}"


def _garden_query(q: str) -> str:
    term = (q or "").strip()
    if not term:
        return "home gardening tips"
    lower = term.lower()
    if any(w in lower for w in ("garden", "plant", "grow", "compost", "soil", "harvest")):
        return term
    return f"{term} gardening"


async def search_youtube_videos(q: str, limit: int = 8) -> dict[str, Any]:
    """Live YouTube Data API v3 search, scoped toward gardening."""
    _load_keys()
    limit = max(1, min(limit, 12))
    query = _garden_query(q)

    if not YOUTUBE_API_KEY:
        return {
            "source": "demo",
            "configured": False,
            "query": query,
            "videos": DEMO_VIDEOS[:limit],
            "hint": "Set YOUTUBE_API_KEY (or GOOGLE_API_KEY) in repo-root .env",
        }

    search_url = "https://www.googleapis.com/youtube/v3/search"
    params = {
        "part": "snippet",
        "type": "video",
        "maxResults": limit,
        "q": query,
        "key": YOUTUBE_API_KEY,
        "relevanceLanguage": "en",
        "safeSearch": "moderate",
        "videoEmbeddable": "true",
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(search_url, params=params)
        if resp.status_code != 200:
            return {
                "source": "demo",
                "configured": True,
                "query": query,
                "videos": DEMO_VIDEOS[:limit],
                "error": f"YouTube search failed ({resp.status_code})",
            }

        items = (resp.json() or {}).get("items") or []
        video_ids = [
            it.get("id", {}).get("videoId")
            for it in items
            if it.get("id", {}).get("videoId")
        ]

        durations: dict[str, str | None] = {}
        if video_ids:
            detail = await client.get(
                "https://www.googleapis.com/youtube/v3/videos",
                params={
                    "part": "contentDetails",
                    "id": ",".join(video_ids),
                    "key": YOUTUBE_API_KEY,
                },
            )
            if detail.status_code == 200:
                for v in (detail.json() or {}).get("items") or []:
                    vid = v.get("id")
                    dur = (v.get("contentDetails") or {}).get("duration")
                    if vid:
                        durations[vid] = _iso8601_duration(dur)

    videos: list[dict[str, Any]] = []
    for it in items:
        vid = (it.get("id") or {}).get("videoId")
        snip = it.get("snippet") or {}
        if not vid:
            continue
        thumbs = snip.get("thumbnails") or {}
        thumb = (
            (thumbs.get("high") or {}).get("url")
            or (thumbs.get("medium") or {}).get("url")
            or f"https://img.youtube.com/vi/{vid}/hqdefault.jpg"
        )
        videos.append(
            {
                "title": snip.get("title") or "Untitled",
                "video_id": vid,
                "channel": snip.get("channelTitle") or "",
                "duration": durations.get(vid),
                "thumbnail": thumb,
                "publishedAt": snip.get("publishedAt"),
            }
        )

    if not videos:
        return {
            "source": "demo",
            "configured": True,
            "query": query,
            "videos": DEMO_VIDEOS[:limit],
            "hint": "No YouTube hits: showing curated demos",
        }

    return {
        "source": "youtube",
        "configured": True,
        "query": query,
        "videos": videos,
    }


async def search_google_web(q: str, limit: int = 5) -> dict[str, Any]:
    """Google Custom Search JSON API: web guides / articles."""
    _load_keys()
    limit = max(1, min(limit, 10))
    query = _garden_query(q)

    if not (GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID):
        return {
            "source": "none",
            "configured": False,
            "query": query,
            "results": [],
            "hint": "Set GOOGLE_API_KEY + GOOGLE_CSE_ID in repo-root .env for web guides",
        }

    url = "https://www.googleapis.com/customsearch/v1"
    params = {
        "key": GOOGLE_CSE_API_KEY,
        "cx": GOOGLE_CSE_ID,
        "q": query,
        "num": limit,
        "safe": "active",
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(url, params=params)

    if resp.status_code != 200:
        return {
            "source": "none",
            "configured": True,
            "query": query,
            "results": [],
            "error": f"Google CSE failed ({resp.status_code})",
        }

    items = (resp.json() or {}).get("items") or []
    results: list[dict[str, Any]] = []
    for it in items:
        pagemap = it.get("pagemap") or {}
        cse_img = (pagemap.get("cse_image") or [{}])[0]
        metatags = (pagemap.get("metatags") or [{}])[0]
        results.append(
            {
                "title": it.get("title") or "Untitled",
                "url": it.get("link") or "",
                "snippet": it.get("snippet") or "",
                "displayUrl": it.get("displayLink") or "",
                "image": cse_img.get("src") or metatags.get("og:image"),
            }
        )

    return {
        "source": "google",
        "configured": True,
        "query": query,
        "results": results,
    }
