import React from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useWeather } from '@/lib/weather-context';
import { Leaf, Recycle, Sprout, LogOut, Bell, Droplets, CloudRain, Sun, Moon } from 'lucide-react';

export default function Profile() {
    const { user, logout } = useAuth();
    const { condition } = useWeather();

    const stats = [
        { icon: Recycle, label: 'Food waste avoided', value: '4.2 kg', sub: 'this season', tint: 'bg-accent/15 text-accent' },
        { icon: Leaf, label: 'CO₂ reduced', value: '9.1 kg', sub: 'vs. store-bought', tint: 'bg-primary/10 text-primary' },
        { icon: Sprout, label: 'Harvests to date', value: '7', sub: 'crops grown', tint: 'bg-emerald-100 text-emerald-700' },
    ];

    return (
        <div className="py-6 space-y-5">
            <div className="flex items-center gap-4 animate-fade-in-up">
                <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-heading text-2xl font-semibold">
                    {(user?.full_name || 'G')[0].toUpperCase()}
                </div>
                <div>
                    <h1 className="font-heading text-xl font-semibold">{user?.full_name || 'Gardener'}</h1>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                </div>
            </div>

            <section className="animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
                <h2 className="font-heading text-lg font-semibold mb-3">Sustainability impact</h2>
                <div className="space-y-2">
                    {stats.map((s) => (
                        <div key={s.label} className="flex items-center gap-3 rounded-2xl bg-card/85 backdrop-blur border border-border p-3">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${s.tint}`}>
                                <s.icon className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium">{s.label}</p>
                                <p className="text-xs text-muted-foreground">{s.sub}</p>
                            </div>
                            <p className="font-heading text-lg font-semibold">{s.value}</p>
                        </div>
                    ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                    Canada wastes 2.3 million tonnes of edible food yearly — about 6.9 million tonnes of CO₂. Every home crop helps.
                </p>
            </section>

            <section className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                <h2 className="font-heading text-lg font-semibold mb-3">Notifications</h2>
                <div className="rounded-2xl bg-card/85 backdrop-blur border border-border divide-y divide-border">
                    <Toggle icon={Droplets} label="Watering reminders" desc="Based on plant type & weather" defaultOn />
                    <Toggle icon={CloudRain} label="Weather alerts" desc="Rain, frost & heat warnings" defaultOn />
                    <Toggle icon={Sun} label="Harvest timing" desc="When crops are ready" defaultOn />
                    <Toggle icon={Moon} label="Seasonal tips" desc="Monthly growing advice" />
                </div>
            </section>

            <button
                onClick={() => logout()}
                className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl border border-border bg-card/85 backdrop-blur text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors animate-fade-in-up"
                style={{ animationDelay: '0.15s' }}
            >
                <LogOut className="w-4 h-4" /> Log out
            </button>

            <p className="text-center text-[11px] text-muted-foreground/70 pt-2">
                Sprout & Co. — helping plants and people grow 🌿
            </p>
        </div>
    );
}

function Toggle({ icon: Icon, label, desc, defaultOn }) {
    const [on, setOn] = React.useState(!!defaultOn);
    return (
        <div className="flex items-center gap-3 p-3.5">
            <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
                <Icon className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <button
                onClick={() => setOn(!on)}
                className={`relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
            </button>
        </div>
    );
}