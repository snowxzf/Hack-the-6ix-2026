import { ArrowLeft, BookOpen, ChevronRight, ExternalLink, FlaskConical, Sprout, TrendingUp } from "lucide-react";
import { useState } from "react";
import { postById, postsForTier, type BlogPost, type BlogTier } from "../data/blogPosts";

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
    <article className="space-y-4 py-2">
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

export function LearnPanel() {
  const [tier, setTier] = useState<BlogTier>("beginner");
  const [activeId, setActiveId] = useState<string | null>(null);
  const guides = postsForTier(tier);
  const active = activeId ? postById(activeId) ?? null : null;

  if (active) {
    return <PostDetail post={active} onBack={() => setActiveId(null)} />;
  }

  return (
    <div className="space-y-5 py-2">
      <div className="animate-fade-in-up">
        <h2 className="font-heading text-5xl font-semibold">Learn</h2>
        <p className="text-sm text-muted-foreground">Bite-sized guides for every gardener.</p>
      </div>

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
    </div>
  );
}
