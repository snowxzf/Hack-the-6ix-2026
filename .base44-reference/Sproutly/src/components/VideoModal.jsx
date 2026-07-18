import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function VideoModal({ videoId, title, onClose }) {
    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-lg bg-card border border-border overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="aspect-video bg-black">
                    <iframe
                        src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
                        title={title}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                </div>
                <div className="flex items-center justify-between gap-3 p-3">
                    <p className="text-sm font-medium line-clamp-1">{title}</p>
                    <button onClick={onClose} className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1">
                        <X className="w-4 h-4" /> Close
                    </button>
                </div>
            </div>
        </div>
    );
}