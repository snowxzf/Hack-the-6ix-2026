import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { LayoutGrid, Sparkles, Loader2, Search as SearchIcon, X, Sun, Cloud, TreeDeciduous, MapPin, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import GardenGrid from '@/components/GardenGrid';

const SUN_LABEL = { full_sun: 'Full sun', partial_shade: 'Partial shade', full_shade: 'Shade' };

export default function Plan() {
    const [space, setSpace] = useState({ name: 'Backyard plot', sunlight: 'full_sun', location: 'Toronto, ON' });
    const [areaCount, setAreaCount] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState([]);
    const [selected, setSelected] = useState([]);
    const [loading, setLoading] = useState(false);
    const [layout, setLayout] = useState(null);

    const searchPlants = async (e) => {
        e.preventDefault();
        if (!searchTerm.trim()) return;
        setSearching(true);
        setResults([]);
        try {
            const res = await base44.integrations.Core.InvokeLLM({
                prompt: `Search for garden plants, crops, or herbs matching "${searchTerm}". Return up to 6 results suitable for a home gardener in North America. For each give: name, sunlight (exactly one of: full_sun, partial_shade, full_shade), days_to_harvest (number), and a short growing note.`,
                add_context_from_internet: true,
                model: 'gemini_3_flash',
                response_json_schema: {
                    type: 'object',
                    properties: {
                        results: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    sunlight: { type: 'string' },
                                    days_to_harvest: { type: 'number' },
                                    note: { type: 'string' },
                                },
                            },
                        },
                    },
                },
            });
            setResults(res.results || []);
        } catch {
            setResults([]);
        }
        setSearching(false);
    };

    const addCrop = (crop) => {
        if (selected.find((s) => s.name === crop.name)) return;
        setSelected([...selected, crop]);
    };
    const removeCrop = (name) => setSelected(selected.filter((s) => s.name !== name));

    const generate = async () => {
        if (areaCount === 0 || selected.length === 0) return;
        setLoading(true);
        setLayout(null);
        const areaM2 = (areaCount * 0.25).toFixed(1);
        const cropList = selected.map((c) => `${c.name} (${SUN_LABEL[c.sunlight] || c.sunlight}, ${c.days_to_harvest} days to harvest)`).join('; ');
        try {
            const res = await base44.integrations.Core.InvokeLLM({
                prompt: `You are an expert urban gardener designing a sustainable home garden. The user drew their available area (~${areaM2} m²), sunlight "${SUN_LABEL[space.sunlight]}", located in ${space.location}. They want to grow: ${cropList}. Create an optimized layout considering companion planting, sunlight needs, and space efficiency. Return JSON: placements (array of {crop, count, location_note, sunlight_note}), tips (array of short practical strings), estimated_harvest_weeks (number).`,
                response_json_schema: {
                    type: 'object',
                    properties: {
                        placements: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    crop: { type: 'string' },
                                    count: { type: 'number' },
                                    location_note: { type: 'string' },
                                    sunlight_note: { type: 'string' },
                                },
                            },
                        },
                        tips: { type: 'array', items: { type: 'string' } },
                        estimated_harvest_weeks: { type: 'number' },
                    },
                },
            });
            setLayout(res);
        } catch (e) {
            setLayout({ error: e.message || 'Could not generate layout' });
        }
        setLoading(false);
    };

    const canGenerate = areaCount > 0 && selected.length > 0;

    return (
        <div className="py-6 space-y-5">
            <div className="animate-fade-in-up">
                <h1 className="font-heading text-2xl font-semibold">Plan your space</h1>
                <p className="text-sm text-muted-foreground">Draw your area, pick crops, and get an AI-optimized layout.</p>
            </div>

            <div className="bg-card/85 backdrop-blur border border-border p-4 space-y-3 animate-fade-in-up" style={{ animationDelay: '0.04s' }}>
                <div className="flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-primary" />
                    <h2 className="font-medium text-sm">Draw your available area</h2>
                </div>
                <GardenGrid cols={12} rows={8} onChange={setAreaCount} />
            </div>

            <div className="animate-fade-in-up" style={{ animationDelay: '0.06s' }}>
                <p className="text-sm font-medium mb-2">Sunlight</p>
                <div className="grid grid-cols-3 gap-2">
                    {[
                        { v: 'full_sun', label: 'Full sun', icon: Sun },
                        { v: 'partial_shade', label: 'Partial', icon: Cloud },
                        { v: 'full_shade', label: 'Shade', icon: TreeDeciduous },
                    ].map(({ v, label, icon: Icon }) => (
                        <button
                            key={v}
                            onClick={() => setSpace({ ...space, sunlight: v })}
                            className={`flex flex-col items-center gap-1 border p-2 text-xs transition-colors ${space.sunlight === v ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground'}`}
                        >
                            <Icon className="w-4 h-4" />
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="animate-fade-in-up" style={{ animationDelay: '0.08s' }}>
                <Label htmlFor="location">Location</Label>
                <div className="relative mt-1">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="location" className="pl-9" value={space.location} onChange={(e) => setSpace({ ...space, location: e.target.value })} />
                </div>
            </div>

            <div className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                <p className="text-sm font-medium mb-2">What do you want to grow?</p>
                <form onSubmit={searchPlants} className="flex gap-2">
                    <div className="relative flex-1">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input className="pl-9" placeholder="Search plants & crops…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <Button type="submit" size="sm" disabled={searching} className="rounded-sm">
                        {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                    </Button>
                </form>

                {results.length > 0 && (
                    <div className="mt-2 space-y-2">
                        {results.map((r) => {
                            const picked = selected.find((s) => s.name === r.name);
                            return (
                                <div key={r.name} className="flex items-center gap-3 border border-border bg-card p-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium">{r.name}</p>
                                        <p className="text-xs text-muted-foreground">{SUN_LABEL[r.sunlight] || r.sunlight} · {r.days_to_harvest} days</p>
                                        <p className="text-[11px] text-muted-foreground/80 mt-0.5 line-clamp-1">{r.note}</p>
                                    </div>
                                    <button
                                        onClick={() => (picked ? removeCrop(r.name) : addCrop(r))}
                                        className={`shrink-0 flex items-center gap-1 text-xs font-medium px-3 py-1.5 border ${picked ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}
                                    >
                                        {picked ? <><Check className="w-3 h-3" /> Added</> : <><Plus className="w-3 h-3" /> Add</>}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {selected.length > 0 && (
                    <div className="mt-3">
                        <p className="text-xs text-muted-foreground mb-1.5">Selected ({selected.length})</p>
                        <div className="flex flex-wrap gap-2">
                            {selected.map((c) => (
                                <span key={c.name} className="flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium px-2.5 py-1">
                                    {c.name}
                                    <button onClick={() => removeCrop(c.name)}><X className="w-3 h-3" /></button>
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <Button onClick={generate} disabled={loading || !canGenerate} className="w-full h-12 rounded-sm font-medium" style={{ animationDelay: '0.12s' }}>
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Designing your layout…</> : <><Sparkles className="w-4 h-4 mr-2" /> Generate optimized layout</>}
            </Button>

            {!canGenerate && !loading && (
                <p className="text-center text-xs text-muted-foreground">Draw your area and add at least one crop to continue.</p>
            )}

            {layout && !layout.error && (
                <div className="bg-card/90 border border-border p-4 space-y-4 animate-fade-in-up">
                    <div className="flex items-center gap-2">
                        <LayoutGrid className="w-5 h-5 text-primary" />
                        <h2 className="font-heading text-lg font-semibold">Your optimized layout</h2>
                    </div>
                    <div className="bg-secondary/60 p-3 text-center">
                        <p className="font-heading text-2xl font-semibold text-primary">{layout.estimated_harvest_weeks} weeks</p>
                        <p className="text-xs text-muted-foreground">estimated time to first harvest</p>
                    </div>
                    <div className="space-y-2">
                        {layout.placements?.map((p, i) => (
                            <div key={i} className="border border-border p-3">
                                <div className="flex items-center justify-between mb-1">
                                    <p className="font-medium text-sm">{p.crop}</p>
                                    <span className="text-xs text-muted-foreground">×{p.count}</span>
                                </div>
                                <p className="text-xs text-muted-foreground">{p.location_note}</p>
                                <p className="text-[11px] text-primary mt-1">{p.sunlight_note}</p>
                            </div>
                        ))}
                    </div>
                    {layout.tips?.length > 0 && (
                        <div className="bg-primary/5 border border-primary/15 p-3">
                            <p className="text-xs font-semibold text-primary mb-1.5">Gardener's tips</p>
                            <ul className="space-y-1">
                                {layout.tips.map((t, i) => (
                                    <li key={i} className="text-xs text-muted-foreground flex gap-1.5"><span className="text-primary">•</span> {t}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {layout?.error && (
                <div className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{layout.error}</div>
            )}
        </div>
    );
}