import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Search as SearchIcon, Loader2, Play, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import VideoModal from '@/components/VideoModal';

const SUGGESTIONS = ['Tomato growing tips', 'Beginner vegetable garden', 'Composting at home', 'Container gardening', 'Organic pest control'];

export default function Search() {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [videos, setVideos] = useState([]);
    const [active, setActive] = useState(null);
    const [searched, setSearched] = useState(false);

    const runSearch = async (e, q) => {
        const term = (typeof q === 'string' ? q : query).trim();
        if (!term) return;
        if (typeof q === 'string') setQuery(q);
        e.preventDefault();
        setLoading(true);
        setVideos([]);
        setSearched(true);
        try {
            const res = await base44.integrations.Core.InvokeLLM({
                prompt: `Search YouTube for real, relevant videos about: "${term}". Focus on gardening, plants, sustainability, and home growing. Return up to 6 results. For each provide the exact YouTube video ID (the 11-character ID from the URL), the title, the channel name, and the duration.`,
                add_context_from_internet: true,
                model: 'gemini_3_flash',
                response_json_schema: {
                    type: 'object',
                    properties: {
                        videos: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    title: { type: 'string' },
                                    video_id: { type: 'string' },
                                    channel: { type: 'string' },
                                    duration: { type: 'string' },
                                },
                            },
                        },
                    },
                },
            });
            setVideos(res.videos || []);
        } catch {
            setVideos([]);
        }
        setLoading(false);
    };

    return (
        <div className="py-6 space-y-5">
            <div className="flex items-center gap-3 animate-fade-in-up">
                <Link to="/" className="p-1 -ml-1 text-muted-foreground hover:text-foreground"><ArrowLeft className="w-5 h-5" /></Link>
                <h1 className="font-heading text-2xl font-semibold">Search</h1>
            </div>

            <form onSubmit={runSearch} className="flex gap-2 animate-fade-in-up" style={{ animationDelay: '0.04s' }}>
                <div className="relative flex-1">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Search videos, plants & guides…" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <Button type="submit" disabled={loading} className="rounded-sm">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                </Button>
            </form>

            {!searched && (
                <div className="animate-fade-in-up" style={{ animationDelay: '0.06s' }}>
                    <p className="text-xs text-muted-foreground mb-2">Try searching for</p>
                    <div className="flex flex-wrap gap-2">
                        {SUGGESTIONS.map((s) => (
                            <button key={s} onClick={(e) => runSearch(e, s)} className="text-xs bg-card border border-border px-3 py-1.5 hover:border-primary hover:text-primary transition-colors">
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {loading && (
                <div className="grid grid-cols-1 gap-3">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="border border-border bg-card overflow-hidden animate-pulse">
                            <div className="aspect-video bg-muted" />
                            <div className="p-3 space-y-2">
                                <div className="h-4 bg-muted w-3/4" />
                                <div className="h-3 bg-muted w-1/3" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!loading && videos.length > 0 && (
                <div className="space-y-3">
                    {videos.map((v, i) => (
                        <button
                            key={v.video_id || i}
                            onClick={() => setActive(v)}
                            className="w-full text-left border border-border bg-card overflow-hidden hover:border-primary transition-colors animate-fade-in-up"
                            style={{ animationDelay: `${i * 0.05}s` }}
                        >
                            <div className="relative aspect-video bg-muted">
                                <img src={`https://img.youtube.com/vi/${v.video_id}/hqdefault.jpg`} alt={v.title} className="w-full h-full object-cover" loading="lazy" />
                                <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center"><Play className="w-5 h-5 text-primary ml-0.5" fill="currentColor" /></div>
                                </div>
                                {v.duration && <span className="absolute bottom-1.5 right-1.5 text-[10px] bg-black/75 text-white px-1.5 py-0.5">{v.duration}</span>}
                            </div>
                            <div className="p-3">
                                <p className="text-sm font-medium line-clamp-2">{v.title}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{v.channel}</p>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {!loading && searched && videos.length === 0 && (
                <div className="text-center py-10 text-sm text-muted-foreground">No videos found. Try a different search.</div>
            )}

            {active && <VideoModal videoId={active.video_id} title={active.title} onClose={() => setActive(null)} />}
        </div>
    );
}