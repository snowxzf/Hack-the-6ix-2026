export function VideoModal(props: {
  videoId: string;
  title: string;
  onClose: () => void;
}) {
  const watchUrl = `https://www.youtube.com/watch?v=${props.videoId}`;
  const embedUrl = `https://www.youtube-nocookie.com/embed/${props.videoId}?autoplay=1&rel=0`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={props.onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg overflow-hidden border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={props.title}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="line-clamp-1 min-w-0 flex-1 text-sm font-medium">{props.title}</p>
          <div className="flex shrink-0 items-center gap-3">
            <a
              href={watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-primary hover:underline"
            >
              Open on YouTube
            </a>
            <button
              type="button"
              className="text-sm text-muted-foreground"
              onClick={props.onClose}
            >
              Close
            </button>
          </div>
        </div>
        <div className="aspect-video bg-black">
          <iframe
            title={props.title}
            className="h-full w-full"
            src={embedUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </div>
    </div>
  );
}
