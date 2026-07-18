import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useWeather } from '@/lib/weather-context';
import WeatherChip from '@/components/WeatherChip';
import WeatherScene from '@/components/WeatherScene';
import { Search, Sprout, Droplets, Leaf, CloudRain, AlertTriangle, ChevronRight, Recycle } from 'lucide-react';

const WEATHER_ALERTS = {
    rainy: { text: 'Rain expected today — skip watering, nature has it covered.', icon: CloudRain },
    snowy: { text: 'Frost risk tonight — cover tender plants and bring potted ones inside.', icon: AlertTriangle },
    sunny: { text: 'Sunny and warm — give your garden a deep watering this evening.', icon: Droplets },
    cloudy: { text: 'Overcast today — a perfect day to transplant seedlings.', icon: CloudRain },
    partly_cloudy: { text: 'Mixed skies — a great time to check soil moisture levels.', icon: CloudRain },
    clear_night: { text: 'Clear and cool tonight — protect sensitive seedlings from chill.', icon: AlertTriangle },
};

export default function Home() {
    const { user } = useAuth();
    const { condition } = useWeather();
    const [plants, setPlants] = useState([]);

    useEffect(() => {
        (async () => {
            try {
                const data = await base44.entities.Plant.list('-created_date', 20);
                setPlants(data || []);
            } catch {
                setPlants([]);
            }
        })();
    }, []);

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const alert = WEATHER_ALERTS[condition] || WEATHER_ALERTS.partly_cloudy;
    const AlertIcon = alert.icon;
    const tasks = plants.slice(0, 3);

    return (
        <div className="py-6 space-y-5">
            <header className="flex items-start justify-between animate-fade-in-up">
                <div>
                    <p className="text-sm text-muted-foreground">{greeting}</p>
                    <h1 className="font-heading text-2xl font-semibold">{user?.full_name?.split(' ')[0] || 'Gardener'} 🌱</h1>
                </div>
                <WeatherChip />
            </header>

            <Link
                to="/search"
                className="flex items-center gap-2 border border-border bg-card/85 backdrop-blur px-3 h-11 animate-fade-in-up"
                style={{ animationDelay: '0.02s' }}
            >
                <Search className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Search videos, plants & guides…</span>
            </Link>

            <div
                className="bg-gradient-to-br from-primary to-[hsl(137,33%,20%)] p-5 text-primary-foreground animate-fade-in-up"
                style={{ animationDelay: '0.03s' }}
            >
                <p className="font-heading text-lg font-medium leading-snug">Helping plants and people grow.</p>
                <p className="text-sm text-primary-foreground/80 mt-1">
                    Every home crop replaces greenhouse produce and cuts avoidable food waste.
                </p>
            </div>

            <WeatherScene />

            <div
                className="flex items-start gap-3 bg-card/85 backdrop-blur border border-border p-4 animate-fade-in-up"
                style={{ animationDelay: '0.06s' }}
            >
                <div className="bg-accent/15 p-2 shrink-0">
                    <AlertIcon className="w-5 h-5 text-accent" />
                </div>
                <p className="text-sm leading-relaxed">{alert.text}</p>
            </div>

            <section className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-heading text-lg font-semibold">Today's care</h2>
                    <Link to="/garden" className="text-xs text-primary flex items-center gap-0.5">
                        View all <ChevronRight className="w-3 h-3" />
                    </Link>
                </div>
                {tasks.length === 0 ? (
                    <div className="border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                        No plants yet. <Link to="/plan" className="text-primary font-medium">Plan your garden</Link> to get started.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {tasks.map((p) => (
                            <div key={p.id} className="flex items-center gap-3 bg-card/85 backdrop-blur border border-border p-3">
                                <div className="bg-primary/10 p-2">
                                    <Droplets className="w-4 h-4 text-primary" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium">Water {p.name}</p>
                                    <p className="text-xs text-muted-foreground">{p.variety || 'In your garden'}</p>
                                </div>
                                <span className="text-[11px] text-muted-foreground">due today</span>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
                <h2 className="font-heading text-lg font-semibold mb-3">Your impact</h2>
                <div className="grid grid-cols-3 gap-3">
                    <Stat icon={Recycle} label="Waste saved" value="4.2 kg" tint="bg-accent/15 text-accent" />
                    <Stat icon={Leaf} label="CO₂ reduced" value="9.1 kg" tint="bg-primary/10 text-primary" />
                    <Stat icon={Sprout} label="Plants grown" value={String(plants.length)} tint="bg-emerald-100 text-emerald-700" />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                    The average Canadian household wastes $1,300 of edible food yearly. Home-grown produce helps change that.
                </p>
            </section>
        </div>
    );
}

function Stat({ icon: Icon, label, value, tint }) {
    return (
        <div className="bg-card/85 backdrop-blur border border-border p-3 text-center">
            <div className={`mx-auto w-10 h-10 flex items-center justify-center mb-2 ${tint}`}>
                <Icon className="w-5 h-5" />
            </div>
            <p className="font-heading text-lg font-semibold leading-none">{value}</p>
            <p className="text-[11px] text-muted-foreground leading-tight mt-1">{label}</p>
        </div>
    );
}