import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Sprout, Plus, Trash2, Calendar, Droplets, Sun, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const STATUS_STYLES = {
    planning: 'bg-sky-100 text-sky-700',
    seedling: 'bg-amber-100 text-amber-700',
    growing: 'bg-green-100 text-green-700',
    ready: 'bg-emerald-100 text-emerald-700',
};
const STATUS_LABEL = {
    planning: 'Planning',
    seedling: 'Seedling',
    growing: 'Growing',
    ready: 'Ready to harvest',
};

export default function MyGarden() {
    const [plants, setPlants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState({ name: '', variety: '', status: 'seedling' });

    const load = async () => {
        setLoading(true);
        try {
            const data = await base44.entities.Plant.list('-created_date', 50);
            setPlants(data || []);
        } catch {
            setPlants([]);
        }
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, []);

    const add = async (e) => {
        e.preventDefault();
        if (!form.name) return;
        const today = new Date().toISOString().slice(0, 10);
        await base44.entities.Plant.create({
            ...form,
            days_to_harvest: 60,
            planted_date: today,
            next_watering: today,
        });
        setForm({ name: '', variety: '', status: 'seedling' });
        setAdding(false);
        load();
    };

    const remove = async (id) => {
        await base44.entities.Plant.delete(id);
        load();
    };

    return (
        <div className="py-6 space-y-5">
            <div className="flex items-center justify-between animate-fade-in-up">
                <div>
                    <h1 className="font-heading text-2xl font-semibold">My garden</h1>
                    <p className="text-sm text-muted-foreground">{plants.length} plant{plants.length !== 1 ? 's' : ''} in your care</p>
                </div>
                <Button size="sm" className="rounded-xl" onClick={() => setAdding((v) => !v)}>
                    <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
            </div>

            {adding && (
                <form onSubmit={add} className="rounded-2xl bg-card border border-border p-4 space-y-3 animate-fade-in-up">
                    <div className="space-y-2">
                        <Label htmlFor="name">Plant name</Label>
                        <Input id="name" placeholder="e.g. Cherry tomato" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="variety">Variety</Label>
                            <Input id="variety" placeholder="e.g. Roma" value={form.variety} onChange={(e) => setForm({ ...form, variety: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="status">Stage</Label>
                            <select
                                id="status"
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                value={form.status}
                                onChange={(e) => setForm({ ...form, status: e.target.value })}
                            >
                                <option value="seedling">Seedling</option>
                                <option value="growing">Growing</option>
                                <option value="ready">Ready</option>
                                <option value="planning">Planning</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                        <Button type="submit" size="sm" className="rounded-xl">Save plant</Button>
                        <Button type="button" size="sm" variant="ghost" className="rounded-xl" onClick={() => setAdding(false)}>Cancel</Button>
                    </div>
                </form>
            )}

            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : plants.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-10 text-center">
                    <Sprout className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-sm text-muted-foreground">Your garden is empty. Tap "Add" to plant your first seed.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {plants.map((p, i) => (
                        <div
                            key={p.id}
                            className="rounded-2xl bg-card/85 backdrop-blur border border-border p-4 animate-fade-in-up"
                            style={{ animationDelay: `${i * 0.04}s` }}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <Sprout className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-medium leading-tight">{p.name}</p>
                                        <p className="text-xs text-muted-foreground">{p.variety || 'General crop'}</p>
                                    </div>
                                </div>
                                <button onClick={() => remove(p.id)} className="text-muted-foreground hover:text-destructive p-1">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="flex items-center gap-2 mt-3 flex-wrap">
                                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[p.status] || STATUS_STYLES.seedling}`}>
                                    {STATUS_LABEL[p.status] || 'Growing'}
                                </span>
                                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <Calendar className="w-3 h-3" /> {p.days_to_harvest || 60} days to harvest
                                </span>
                                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <Droplets className="w-3 h-3" /> {p.next_watering ? 'Water due' : '—'}
                                </span>
                                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <Sun className="w-3 h-3" /> {p.location || 'Garden'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}