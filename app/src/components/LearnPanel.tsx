import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  ExternalLink,
  FlaskConical,
  Loader2,
  Play,
  Search as SearchIcon,
  Sprout,
  TrendingUp,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  searchVideos,
  searchWebGuides,
  searchWikipedia,
  type SearchVideo,
  type SearchWebResult,
  type WikipediaResult,
} from "../api";
import { postById, postsForTier, type BlogPost, type BlogTier } from "../data/blogPosts";
import { VideoModal } from "./VideoModal";

const TIERS = [
  {
    id: "beginner" as const,
    label: "Beginner",
    icon: Sprout,
    tint: "bg-[hsl(var(--palette-sage)/0.4)] text-[hsl(var(--palette-forest))]",
  },
  {
    id: "intermediate" as const,
    label: "Intermediate",
    icon: TrendingUp,
    tint: "bg-[hsl(var(--palette-apricot)/0.3)] text-[hsl(var(--palette-brown))]",
  },
  {
    id: "advanced" as const,
    label: "Advanced",
    icon: FlaskConical,
    tint: "bg-[hsl(var(--palette-leaf)/0.3)] text-[hsl(var(--palette-olive))]",
  },
];

const LEARN_CHIPS = [
  "Tomato growing tips",
  "Companion planting",
  "Composting at home",
  "Container herbs",
];

function PostCard({
  post,
  delay,
  onOpen,
}: {
  post: BlogPost;
  delay: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full animate-fade-in-up overflow-hidden rounded-2xl border border-border bg-card/85 text-left backdrop-blur transition-colors hover:border-primary/40"
      style={{ animationDelay: `${delay}s` }}
    >
      <img
        src={post.image.replace("w=900", "w=240")}
        alt=""
        className="h-24 w-24 shrink-0 object-cover"
        loading="lazy"
      />
      <div className="flex min-w-0 flex-1 items-center gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight">{post.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{post.blurb}</p>
          <p className="mt-1 text-[11px] text-muted-foreground/80">{post.mins} min read</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    </button>
  );
}

function PostDetail({ post, onBack }: { post: BlogPost; onBack: () => void }) {
  return (
    <article className="space-y-4 pt-0 pb-2">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Learn
      </button>

      <div className="animate-fade-in-up overflow-hidden rounded-2xl border border-border">
        <img
          src={post.image}
          alt={post.imageAlt}
          className="aspect-[16/10] w-full object-cover"
        />
      </div>

      <header className="animate-fade-in-up space-y-1" style={{ animationDelay: "0.04s" }}>
        <p className="text-[11px] font-medium uppercase tracking-wide text-primary">
          {post.mins} min read · Photo {post.credit}
        </p>
        <h2 className="font-heading text-4xl font-semibold leading-tight">{post.title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{post.lead}</p>
      </header>

      {post.sections.map((section, i) => (
        <section
          key={section.heading}
          className="animate-fade-in-up space-y-1.5"
          style={{ animationDelay: `${0.06 + i * 0.03}s` }}
        >
          <h3 className="font-heading text-2xl font-semibold">{section.heading}</h3>
          <p className="text-sm leading-relaxed text-foreground/85">{section.body}</p>
        </section>
      ))}

      <aside
        className="animate-fade-in-up space-y-2 border border-border bg-secondary/40 p-4"
        style={{ animationDelay: "0.18s" }}
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="font-heading text-xl font-semibold">Quick tips</h3>
        </div>
        <ul className="space-y-2">
          {post.tips.map((tip) => (
            <li key={tip} className="flex gap-2 text-sm leading-relaxed text-foreground/85">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              {tip}
            </li>
          ))}
        </ul>
      </aside>

      <footer
        className="animate-fade-in-up space-y-2 border-t border-border pt-4"
        style={{ animationDelay: "0.22s" }}
      >
        <h3 className="font-heading text-xl font-semibold">Sources & further reading</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Original PlotTwist demo summary: drawn from these public references (not verbatim quotes).
        </p>
        <ul className="space-y-1.5">
          {post.sources.map((s) => (
            <li key={s.url}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-start gap-1.5 text-sm text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{s.label}</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="pt-1 text-[11px] text-muted-foreground/70">
          Photo: {post.credit}
        </p>
      </footer>
    </article>
  );
}

function LinkResultCard({
  title,
  snippet,
  href,
  image,
  sourceLabel,
  delay,
}: {
  title: string;
  snippet: string;
  href: string;
  image?: string;
  sourceLabel: string;
  delay: number;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-full animate-fade-in-up overflow-hidden rounded-2xl border border-border bg-card/85 text-left backdrop-blur transition-colors hover:border-primary/40"
      style={{ animationDelay: `${delay}s` }}
    >
      {image ? (
        <img
          src={image}
          alt=""
          className="h-24 w-24 shrink-0 object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-24 w-24 shrink-0 items-center justify-center bg-secondary text-primary">
          <ExternalLink className="h-5 w-5" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-primary">
            {sourceLabel}
          </p>
          <p className="mt-0.5 text-sm font-medium leading-tight">{title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{snippet}</p>
        </div>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </div>
    </a>
  );
}

function VideoResultCard({
  video,
  delay,
  onOpen,
}: {
  video: SearchVideo;
  delay: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full animate-fade-in-up overflow-hidden rounded-2xl border border-border bg-card/85 text-left backdrop-blur transition-colors hover:border-primary/40"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="relative h-24 w-32 shrink-0 bg-muted">
        <img
          src={
            video.thumbnail ||
            `https://img.youtube.com/vi/${video.video_id}/hqdefault.jpg`
          }
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
          <div className="flex h-8 w-8 items-center justify-center bg-white/90">
            <Play className="ml-0.5 h-3.5 w-3.5 text-primary" fill="currentColor" />
          </div>
        </div>
        {video.duration && (
          <span className="absolute bottom-1 right-1 bg-black/75 px-1 py-0.5 text-[9px] text-white">
            {video.duration}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-primary">
            YouTube
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm font-medium leading-tight">
            {video.title}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{video.channel}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    </button>
  );
}

export function LearnPanel() {
  const [tier, setTier] = useState<BlogTier>("beginner");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [videos, setVideos] = useState<SearchVideo[]>([]);
  const [web, setWeb] = useState<SearchWebResult[]>([]);
  const [wiki, setWiki] = useState<WikipediaResult[]>([]);
  const [activeVideo, setActiveVideo] = useState<SearchVideo | null>(null);

  const guides = postsForTier(tier);
  const active = activeId ? postById(activeId) ?? null : null;

  async function runSearch(e: FormEvent | null, q?: string) {
    e?.preventDefault();
    const term = (typeof q === "string" ? q : query).trim();
    if (!term) return;
    if (typeof q === "string") setQuery(q);
    setActiveId(null);
    setLoading(true);
    setVideos([]);
    setWeb([]);
    setWiki([]);
    setSearched(true);

    const [videoRes, webRes, wikiRes] = await Promise.all([
      searchVideos(term),
      searchWebGuides(term),
      searchWikipedia(term),
    ]);

    setVideos(videoRes?.videos ?? []);
    setWeb(webRes?.results ?? []);
    setWiki(wikiRes?.results ?? []);
    setLoading(false);
  }

  function clearSearch() {
    setQuery("");
    setSearched(false);
    setVideos([]);
    setWeb([]);
    setWiki([]);
  }

  const empty =
    !loading &&
    searched &&
    videos.length === 0 &&
    web.length === 0 &&
    wiki.length === 0;

  if (active) {
    return <PostDetail post={active} onBack={() => setActiveId(null)} />;
  }

  return (
    <div className="space-y-4 pt-0 pb-2">
      <div className="animate-fade-in-up">
        <h2 className="font-heading text-5xl font-semibold">Learn</h2>
        <p className="text-sm text-muted-foreground">
          Guides, videos, and references for every gardener.
        </p>
      </div>

      <form
        onSubmit={(e) => void runSearch(e)}
        className="flex animate-fade-in-up gap-2"
        style={{ animationDelay: "0.03s" }}
      >
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-11 w-full rounded-2xl border border-input bg-card/85 pl-9 pr-3 text-sm outline-none ring-ring backdrop-blur focus:ring-2"
            placeholder="Search YouTube, Google & Wikipedia…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search Learn"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="h-11 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </button>
      </form>

      {!searched && (
        <div className="animate-fade-in-up" style={{ animationDelay: "0.04s" }}>
          <p className="mb-2 text-xs text-muted-foreground">Try searching for</p>
          <div className="flex flex-wrap gap-2">
            {LEARN_CHIPS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={(e) => void runSearch(e, s)}
                className="border border-border bg-card/85 px-3 py-1.5 text-xs transition-colors hover:border-primary hover:text-primary"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {searched && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Results for <span className="font-medium text-foreground">“{query}”</span>
          </p>
          <button
            type="button"
            onClick={clearSearch}
            className="text-xs font-medium text-primary hover:underline"
          >
            Back to guides
          </button>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex animate-pulse overflow-hidden rounded-2xl border border-border bg-card/85"
            >
              <div className="h-24 w-24 shrink-0 bg-muted" />
              <div className="flex flex-1 flex-col justify-center gap-2 p-3">
                <div className="h-3 w-16 bg-muted" />
                <div className="h-4 w-3/4 bg-muted" />
                <div className="h-3 w-1/2 bg-muted" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && searched && (
        <div className="space-y-5">
          {videos.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-heading text-2xl font-semibold">YouTube</h3>
              {videos.map((v, i) => (
                <VideoResultCard
                  key={v.video_id || i}
                  video={v}
                  delay={i * 0.04}
                  onOpen={() => setActiveVideo(v)}
                />
              ))}
            </section>
          )}

          {web.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-heading text-2xl font-semibold">Google</h3>
              {web.map((r, i) => (
                <LinkResultCard
                  key={`${r.url}-${i}`}
                  title={r.title}
                  snippet={r.snippet}
                  href={r.url}
                  image={r.image}
                  sourceLabel={r.displayUrl || "Web"}
                  delay={i * 0.04}
                />
              ))}
            </section>
          )}

          {wiki.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-heading text-2xl font-semibold">Wikipedia</h3>
              {wiki.map((r, i) => (
                <LinkResultCard
                  key={`${r.url}-${i}`}
                  title={r.title}
                  snippet={r.snippet || r.description || ""}
                  href={r.url}
                  image={r.thumbnail || r.image}
                  sourceLabel="Wikipedia"
                  delay={i * 0.04}
                />
              ))}
            </section>
          )}

          {empty && (
            <div className="rounded-2xl border border-dashed border-border bg-card/60 px-4 py-10 text-center text-sm text-muted-foreground">
              No results found. Try another term, or check that the backend is running.
            </div>
          )}
        </div>
      )}

      {!searched && (
        <>
          <div
            className="grid animate-fade-in-up grid-cols-3 gap-2"
            style={{ animationDelay: "0.05s" }}
          >
            {TIERS.map(({ id, label, icon: Icon, tint }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTier(id)}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition-all ${
                  tier === id ? "border-primary bg-primary/5" : "border-border bg-card/70"
                }`}
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tint}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <span
                  className={`text-xs font-medium ${
                    tier === id ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {guides.map((g, i) => (
              <PostCard
                key={g.id}
                post={g}
                delay={i * 0.05}
                onOpen={() => setActiveId(g.id)}
              />
            ))}
          </div>
        </>
      )}

      {activeVideo && (
        <VideoModal
          videoId={activeVideo.video_id}
          title={activeVideo.title}
          onClose={() => setActiveVideo(null)}
        />
      )}
    </div>
  );
}
