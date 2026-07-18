import { ArrowLeft, ExternalLink, Loader2, Play, Search as SearchIcon } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { Species } from "../../../optimizer/src/index";
import {
  fetchSearchSuggestions,
  searchPlantsByName,
  searchVideos,
  searchWebGuides,
  type SearchVideo,
  type SearchWebResult,
} from "../api";
import { VideoModal } from "./VideoModal";

export function SearchPanel(props: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [videos, setVideos] = useState<SearchVideo[]>([]);
  const [plants, setPlants] = useState<Species[]>([]);
  const [web, setWeb] = useState<SearchWebResult[]>([]);
  const [active, setActive] = useState<SearchVideo | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    let alive = true;
    setSuggestionsLoading(true);
    (async () => {
      let lat = 43.6532;
      let lon = -79.3832;
      try {
        const raw = localStorage.getItem("plottwist:manualPlace");
        if (raw) {
          const p = JSON.parse(raw) as { lat?: number; lon?: number };
          if (typeof p.lat === "number" && typeof p.lon === "number") {
            lat = p.lat;
            lon = p.lon;
          }
        }
      } catch {
        /* keep Toronto default */
      }
      const s = await fetchSearchSuggestions(lat, lon);
      if (!alive) return;
      setSuggestions(s);
      setSuggestionsLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function runSearch(e: FormEvent | null, q?: string) {
    e?.preventDefault();
    const term = (typeof q === "string" ? q : query).trim();
    if (!term) return;
    if (typeof q === "string") setQuery(q);
    setLoading(true);
    setVideos([]);
    setPlants([]);
    setWeb([]);
    setSearched(true);

    const [videoRes, plantRes, webRes] = await Promise.all([
      searchVideos(term),
      searchPlantsByName(term),
      searchWebGuides(term),
    ]);

    setVideos(videoRes?.videos ?? []);
    setPlants(plantRes?.plants ?? []);
    setWeb(webRes?.results ?? []);
    setLoading(false);
  }

  const empty =
    !loading && searched && videos.length === 0 && plants.length === 0 && web.length === 0;

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-white/95">
      <div className="mx-auto w-full max-w-[430px] flex-1 overflow-y-auto px-4 pb-8 pt-4">
        <div className="space-y-5 py-2">
          <div className="flex animate-fade-in-up items-center gap-3">
            <button
              type="button"
              className="-ml-1 p-1 text-muted-foreground hover:text-foreground"
              onClick={props.onClose}
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h2 className="font-heading text-5xl font-semibold">Search</h2>
          </div>

          <form
            onSubmit={(e) => void runSearch(e)}
            className="flex animate-fade-in-up gap-2"
            style={{ animationDelay: "0.04s" }}
          >
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="h-11 w-full border border-input bg-card pl-9 pr-3 text-sm outline-none ring-ring focus:ring-2"
                placeholder="Search videos, plants & guides…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="h-11 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </button>
          </form>

          {!searched && (
            <div className="animate-fade-in-up" style={{ animationDelay: "0.06s" }}>
              <p className="mb-2 text-xs text-muted-foreground">
                {suggestionsLoading ? "Loading suggestions for your area…" : "Try searching for"}
              </p>
              <div className="flex flex-wrap gap-2">
                {(suggestionsLoading ? ["…", "…", "…"] : suggestions).map((s, i) => (
                  <button
                    key={`${s}-${i}`}
                    type="button"
                    disabled={suggestionsLoading}
                    onClick={(e) => void runSearch(e, s)}
                    className="border border-border bg-card px-3 py-1.5 text-xs transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="grid grid-cols-1 gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse overflow-hidden border border-border bg-card">
                  <div className="aspect-video bg-muted" />
                  <div className="space-y-2 p-3">
                    <div className="h-4 w-3/4 bg-muted" />
                    <div className="h-3 w-1/3 bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && plants.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-heading text-lg font-semibold">Plants in catalog</h3>
              {plants.map((p) => (
                <div key={p.id} className="border border-border bg-card/85 p-3 backdrop-blur">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.category}
                    {p.tier ? ` · ${p.tier}` : ""}
                    {p.sun ? ` · ${p.sun}` : ""}
                  </p>
                </div>
              ))}
            </section>
          )}

          {!loading && videos.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-heading text-lg font-semibold">YouTube</h3>
              {videos.map((v, i) => (
                <button
                  key={v.video_id || i}
                  type="button"
                  onClick={() => setActive(v)}
                  className="w-full animate-fade-in-up overflow-hidden border border-border bg-card text-left transition-colors hover:border-primary"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <div className="relative aspect-video bg-muted">
                    <img
                      src={
                        v.thumbnail ||
                        `https://img.youtube.com/vi/${v.video_id}/hqdefault.jpg`
                      }
                      alt={v.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <div className="flex h-12 w-12 items-center justify-center bg-white/90">
                        <Play className="ml-0.5 h-5 w-5 text-primary" fill="currentColor" />
                      </div>
                    </div>
                    {v.duration && (
                      <span className="absolute bottom-1.5 right-1.5 bg-black/75 px-1.5 py-0.5 text-[10px] text-white">
                        {v.duration}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm font-medium">{v.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{v.channel}</p>
                  </div>
                </button>
              ))}
            </section>
          )}

          {!loading && web.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-heading text-lg font-semibold">Guides from the web</h3>
              {web.map((r, i) => (
                <a
                  key={`${r.url}-${i}`}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex animate-fade-in-up gap-3 border border-border bg-card/85 p-3 backdrop-blur transition-colors hover:border-primary"
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  {r.image ? (
                    <img
                      src={r.image}
                      alt=""
                      className="h-14 w-14 shrink-0 object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center bg-secondary text-primary">
                      <ExternalLink className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium leading-snug">{r.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.snippet}</p>
                    <p className="mt-1 truncate text-[10px] text-primary">
                      {r.displayUrl || r.url}
                    </p>
                  </div>
                </a>
              ))}
            </section>
          )}

          {empty && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No results found. Try a different search or check that the backend is running.
            </div>
          )}
        </div>
      </div>

      {active && (
        <VideoModal
          videoId={active.video_id}
          title={active.title}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}
