export function VideoModal(props: {
  videoId: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={props.onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg overflow-hidden border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={props.title}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="line-clamp-1 pr-4 text-sm font-medium">{props.title}</p>
          <button type="button" className="text-sm text-muted-foreground" onClick={props.onClose}>
            Close
          </button>
        </div>
        <div className="aspect-video bg-black">
          <iframe
            title={props.title}
            className="h-full w-full"
            src={`https://www.youtube.com/embed/${props.videoId}?autoplay=1`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
