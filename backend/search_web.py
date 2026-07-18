"""YouTube + Google Custom Search + Wikipedia helpers for Search / Learn tabs."""

from __future__ import annotations

import os
import re
from typing import Any
from urllib.parse import quote

import httpx

YOUTUBE_API_KEY = ""
GOOGLE_CSE_API_KEY = ""
GOOGLE_CSE_ID = ""

# Verified embeddable IDs (oembed 200). Old Epic/GrowVeg demos 404'd.
DEMO_VIDEOS: list[dict[str, str]] = [
    {
        "title": "New Vegetable Garden: How To Get Started",
        "video_id": "NlS_dTDsHHQ",
        "channel": "YouTube",
        "duration": "",
        "thumbnail": "https://img.youtube.com/vi/NlS_dTDsHHQ/hqdefault.jpg",
    },
    {
        "title": "EVERYTHING I Wish I Knew When I Started Growing Tomatoes",
        "video_id": "9seQurhbLPM",
        "channel": "Epic Gardening",
        "duration": "",
        "thumbnail": "https://img.youtube.com/vi/9seQurhbLPM/hqdefault.jpg",
    },
    {
        "title": "Beginner's Guide to Composting",
        "video_id": "egyNJ7xPyoQ",
        "channel": "Nelson City Council",
        "duration": "",
        "thumbnail": "https://img.youtube.com/vi/egyNJ7xPyoQ/hqdefault.jpg",
    },
    {
        "title": "Science-Based Companion Planting Combinations That WORK",
        "video_id": "mhr3REshTss",
        "channel": "Epic Gardening",
        "duration": "",
        "thumbnail": "https://img.youtube.com/vi/mhr3REshTss/hqdefault.jpg",
    },
]

# Real public guides when Google CSE isn't enabled / returns 403.
DEMO_WEB: list[dict[str, str]] = [
    {
        "title": "Vegetable Gardening for Beginners — Almanac",
        "url": "https://www.almanac.com/vegetable-gardening-for-beginners",
        "snippet": "How to start a vegetable garden: site, soil, crops, and first-season tips.",
        "displayUrl": "almanac.com",
    },
    {
        "title": "Growing Tomatoes — University of Minnesota Extension",
        "url": "https://extension.umn.edu/vegetables/growing-tomatoes",
        "snippet": "Planting, watering, support, and common tomato problems for home gardens.",
        "displayUrl": "extension.umn.edu",
    },
    {
        "title": "Home Composting — City of Toronto",
        "url": "https://www.toronto.ca/services-payments/recycling-organics-garbage/houses/what-goes-in-the-green-bin/",
        "snippet": "Toronto organics and composting context for backyard gardeners.",
        "displayUrl": "toronto.ca",
    },
    {
        "title": "Companion Planting — RHS",
        "url": "https://www.rhs.org.uk/prevention-protection/companion-planting",
        "snippet": "Which plants help each other in the bed — practical companion planting advice.",
        "displayUrl": "rhs.org.uk",
    },
    {
        "title": "Container Gardening — Royal Horticultural Society",
        "url": "https://www.rhs.org.uk/plants/types/container-gardening",
        "snippet": "Grow food and flowers in pots when yard space is tight.",
        "displayUrl": "rhs.org.uk",
    },
]

# Wikipedia REST summaries we can fetch (or hardcode extracts) when search is rate-limited.
DEMO_WIKI: list[dict[str, str]] = [
    {
        "title": "Tomato",
        "description": "Edible berry of Solanum lycopersicum",
        "snippet": "The tomato is the edible berry of the plant Solanum lycopersicum, commonly known as the tomato plant. Widely grown in home gardens for fruit.",
        "url": "https://en.wikipedia.org/wiki/Tomato",
        "displayUrl": "en.wikipedia.org",
        "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Bright_red_tomato_and_cross_section02.jpg/320px-Bright_red_tomato_and_cross_section02.jpg",
    },
    {
        "title": "Compost",
        "description": "Organic matter mixture",
        "snippet": "Compost is a mixture of ingredients used as plant fertilizer and to improve soil physical, chemical, and biological properties.",
        "url": "https://en.wikipedia.org/wiki/Compost",
        "displayUrl": "en.wikipedia.org",
        "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Compost_bin.jpg/320px-Compost_bin.jpg",
    },
    {
        "title": "Companion planting",
        "description": "Agricultural technique",
        "snippet": "Companion planting is planting different crops in proximity for pest control, pollination, habitat for beneficial insects, and maximizing space.",
        "url": "https://en.wikipedia.org/wiki/Companion_planting",
        "displayUrl": "en.wikipedia.org",
        "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Three_Sisters_Garden.jpg/320px-Three_Sisters_Garden.jpg",
    },
    {
        "title": "Vegetable",
        "description": "Edible plant part",
        "snippet": "Vegetables are parts of plants that are consumed by humans as food as part of a savory meal.",
        "url": "https://en.wikipedia.org/wiki/Vegetable",
        "displayUrl": "en.wikipedia.org",
    },
    {
        "title": "Herb",
        "description": "Plant used for flavor or medicine",
        "snippet": "In general use, herbs are plants with savory or aromatic properties used for flavoring food, medicine, or fragrance.",
        "url": "https://en.wikipedia.org/wiki/Herb",
        "displayUrl": "en.wikipedia.org",
    },
]

WIKI_UA = (
    "PlotTwist/1.0 (Hack the 6ix garden learning app; "
    "https://github.com/snowxzf/Hack-the-6ix-2026; educational demo)"
)


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


def _http_client(**kwargs: Any) -> httpx.AsyncClient:
    """Outbound clients must ignore inherited HTTP_PROXY (Cursor/dev proxies
    often 403 Wikipedia/YouTube/Google and leave Search looking broken)."""
    kwargs.setdefault("trust_env", False)
    kwargs.setdefault("follow_redirects", True)
    return httpx.AsyncClient(**kwargs)


def _filter_demos(items: list[dict[str, Any]], q: str, limit: int) -> list[dict[str, Any]]:
    term = (q or "").lower()
    if not term:
        return items[:limit]
    scored: list[tuple[int, dict[str, Any]]] = []
    for it in items:
        blob = " ".join(
            str(it.get(k) or "") for k in ("title", "snippet", "description", "channel")
        ).lower()
        score = sum(1 for w in term.split() if w and w in blob)
        scored.append((score, it))
    scored.sort(key=lambda x: (-x[0], x[1].get("title") or ""))
    picked = [it for s, it in scored if s > 0]
    for it in items:
        if len(picked) >= limit:
            break
        if it not in picked:
            picked.append(it)
    return picked[:limit]


async def search_youtube_videos(q: str, limit: int = 8) -> dict[str, Any]:
    """Live YouTube Data API v3 search, scoped toward gardening."""
    _load_keys()
    limit = max(1, min(limit, 12))
    query = _garden_query(q)
    demos = _filter_demos(DEMO_VIDEOS, q, limit)

    if not YOUTUBE_API_KEY:
        return {
            "source": "demo",
            "configured": False,
            "query": query,
            "videos": demos,
            "hint": "Set YOUTUBE_API_KEY (YouTube Data API enabled) for live results",
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

    async with _http_client(timeout=20.0) as client:
        resp = await client.get(search_url, params=params)
        if resp.status_code != 200:
            return {
                "source": "demo",
                "configured": True,
                "query": query,
                "videos": demos,
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
            "videos": demos,
            "hint": "No YouTube hits: showing curated demos",
        }

    return {
        "source": "youtube",
        "configured": True,
        "query": query,
        "videos": videos,
    }


async def search_youtube_scrape(q: str, limit: int = 6) -> dict[str, Any]:
    """Keyless YouTube HTML scrape — used when Data API isn't enabled."""
    limit = max(1, min(limit, 12))
    query = _garden_query(q)
    demos = _filter_demos(DEMO_VIDEOS, q, limit)
    url = "https://www.youtube.com/results"
    params = {"search_query": query, "hl": "en", "gl": "US"}
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml",
    }
    try:
        async with _http_client(timeout=15.0) as client:
            resp = await client.get(url, params=params, headers=headers)
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        return {
            "query": q,
            "source": "demo",
            "videos": demos,
            "error": str(exc),
        }

    ids: list[str] = []
    seen: set[str] = set()
    for vid in re.findall(r'"videoId":"([a-zA-Z0-9_-]{11})"', resp.text):
        if vid not in seen:
            seen.add(vid)
            ids.append(vid)
        if len(ids) >= limit * 3:
            break

    # Titles from nearby JSON when present
    title_map: dict[str, str] = {}
    for m in re.finditer(
        r'"videoId":"([a-zA-Z0-9_-]{11})".{0,400}?"title":\{"runs":\[\{"text":"(.*?)"\}',
        resp.text,
    ):
        title_map.setdefault(m.group(1), m.group(2))

    videos: list[dict[str, Any]] = []
    async with _http_client(timeout=10.0) as client:
        for vid in ids:
            if len(videos) >= limit:
                break
            title = title_map.get(vid)
            channel = ""
            # Prefer oembed so we only keep embeddable videos
            try:
                oe = await client.get(
                    "https://www.youtube.com/oembed",
                    params={
                        "url": f"https://www.youtube.com/watch?v={vid}",
                        "format": "json",
                    },
                )
                if oe.status_code != 200:
                    continue
                data = oe.json()
                title = data.get("title") or title or "YouTube video"
                channel = data.get("author_name") or ""
            except httpx.HTTPError:
                if not title:
                    continue
            videos.append(
                {
                    "title": title,
                    "video_id": vid,
                    "channel": channel,
                    "duration": None,
                    "thumbnail": f"https://img.youtube.com/vi/{vid}/hqdefault.jpg",
                }
            )

    if not videos:
        return {"query": q, "source": "demo", "videos": demos}
    return {"query": q, "source": "youtube", "videos": videos}


async def search_google_web(q: str, limit: int = 5) -> dict[str, Any]:
    """Google Custom Search JSON API: web guides / articles."""
    _load_keys()
    limit = max(1, min(limit, 10))
    query = _garden_query(q)
    demos = _filter_demos(DEMO_WEB, q, limit)

    if not (GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID):
        return {
            "source": "demo",
            "configured": False,
            "query": query,
            "results": demos,
            "hint": "Enable Custom Search JSON API + GOOGLE_CSE_ID for live Google results",
        }

    url = "https://www.googleapis.com/customsearch/v1"
    params = {
        "key": GOOGLE_CSE_API_KEY,
        "cx": GOOGLE_CSE_ID,
        "q": query,
        "num": limit,
        "safe": "active",
    }

    async with _http_client(timeout=20.0) as client:
        resp = await client.get(url, params=params)

    if resp.status_code != 200:
        return {
            "source": "demo",
            "configured": True,
            "query": query,
            "results": demos,
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

    if not results:
        return {
            "source": "demo",
            "configured": True,
            "query": query,
            "results": demos,
            "hint": "No Google hits: showing curated guides",
        }

    return {
        "source": "google",
        "configured": True,
        "query": query,
        "results": results,
    }


def _wiki_title_candidates(q: str) -> list[str]:
    raw = (q or "").strip()
    lower = raw.lower()
    # Strip our gardening suffix if present
    for noise in (" gardening", " garden", " growing", " tips", " for beginners"):
        if lower.endswith(noise):
            raw = raw[: -len(noise)].strip()
            lower = raw.lower()
            break

    aliases = {
        "tomato": "Tomato",
        "tomatoes": "Tomato",
        "compost": "Compost",
        "composting": "Compost",
        "companion": "Companion planting",
        "companion planting": "Companion planting",
        "herb": "Herb",
        "herbs": "Herb",
        "vegetable": "Vegetable",
        "vegetables": "Vegetable",
        "lettuce": "Lettuce",
        "carrot": "Carrot",
        "basil": "Basil",
        "mint": "Mentha",
        "soil": "Soil",
        "mulch": "Mulch",
        "pollinator": "Pollinator",
    }
    out: list[str] = []
    if lower in aliases:
        out.append(aliases[lower])
    # Title-case the phrase
    if raw:
        out.append(raw[:1].upper() + raw[1:])
        out.append(raw.title())
    # First meaningful word
    word = re.split(r"\s+", lower)[0] if lower else ""
    if word in aliases:
        out.append(aliases[word])
    # Dedupe
    seen: set[str] = set()
    uniq: list[str] = []
    for t in out:
        key = t.lower()
        if key and key not in seen:
            seen.add(key)
            uniq.append(t)
    return uniq[:6]


async def _wiki_summary(client: httpx.AsyncClient, title: str) -> dict[str, Any] | None:
    slug = quote(title.replace(" ", "_"), safe="_()'")
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{slug}"
    try:
        resp = await client.get(url)
    except httpx.HTTPError:
        return None
    if resp.status_code != 200:
        return None
    data = resp.json() or {}
    if data.get("type") == "disambiguation":
        return None
    extract = (data.get("extract") or "").strip()
    if not extract:
        return None
    thumb = (data.get("thumbnail") or {}).get("source")
    original = (data.get("originalimage") or {}).get("source")
    page = ((data.get("content_urls") or {}).get("desktop") or {}).get("page")
    return {
        "title": data.get("title") or title,
        "description": data.get("description") or "",
        "snippet": extract[:280] + ("…" if len(extract) > 280 else ""),
        "extract": extract,
        "image": original or thumb,
        "thumbnail": thumb,
        "url": page or f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}",
        "displayUrl": "en.wikipedia.org",
    }


async def search_wikipedia(q: str, limit: int = 5) -> dict[str, Any]:
    """Wikipedia results via REST summaries (avoids flaky/rate-limited search API)."""
    limit = max(1, min(limit, 8))
    query = _garden_query(q)
    demos = _filter_demos(DEMO_WIKI, q, limit)
    headers = {"User-Agent": WIKI_UA, "Accept": "application/json"}

    results: list[dict[str, Any]] = []
    async with _http_client(timeout=15.0, headers=headers) as client:
        # 1) Direct summaries for likely page titles (reliable, keyless)
        for title in _wiki_title_candidates(q):
            if len(results) >= limit:
                break
            hit = await _wiki_summary(client, title)
            if hit and not any(r["url"] == hit["url"] for r in results):
                results.append(hit)

        # 2) Try MediaWiki search when not rate-limited
        if len(results) < limit:
            try:
                resp = await client.get(
                    "https://en.wikipedia.org/w/api.php",
                    params={
                        "action": "query",
                        "list": "search",
                        "srsearch": query,
                        "srlimit": limit,
                        "srnamespace": 0,
                        "format": "json",
                        "utf8": 1,
                    },
                )
                if resp.status_code == 200:
                    hits = ((resp.json() or {}).get("query") or {}).get("search") or []
                    for h in hits:
                        if len(results) >= limit:
                            break
                        title = h.get("title")
                        if not title:
                            continue
                        hit = await _wiki_summary(client, title)
                        if hit and not any(r["url"] == hit["url"] for r in results):
                            results.append(hit)
            except httpx.HTTPError:
                pass

    if not results:
        return {
            "source": "demo",
            "configured": True,
            "query": query,
            "results": demos,
            "hint": "Wikipedia busy / blocked: showing curated pages",
        }

    return {
        "source": "wikipedia",
        "configured": True,
        "query": query,
        "results": results[:limit],
    }
