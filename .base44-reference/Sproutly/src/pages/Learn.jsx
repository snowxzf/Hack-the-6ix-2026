import React, { useState } from 'react';
import { BookOpen, Sprout, TrendingUp, FlaskConical, ChevronRight } from 'lucide-react';

const TIERS = [
    { id: 'beginner', label: 'Beginner', icon: Sprout, tint: 'bg-green-100 text-green-700' },
    { id: 'intermediate', label: 'Intermediate', icon: TrendingUp, tint: 'bg-amber-100 text-amber-700' },
    { id: 'advanced', label: 'Advanced', icon: FlaskConical, tint: 'bg-emerald-100 text-emerald-700' },
];

const GUIDES = {
    beginner: [
        { title: 'Starting your first tomato', blurb: 'From seed to first fruit in a sunny spot.', mins: 4 },
        { title: 'How often should I water?', blurb: 'Read the soil, not the calendar.', mins: 3 },
        { title: '5 herbs for a windowsill', blurb: 'Basil, mint, chives and more — no garden needed.', mins: 5 },
        { title: 'Understanding sunlight', blurb: 'Full sun, partial shade, and what it means.', mins: 4 },
    ],
    intermediate: [
        { title: 'Companion planting basics', blurb: 'Pair crops that help each other thrive.', mins: 6 },
        { title: 'Composting to cut food waste', blurb: 'Turn kitchen scraps into garden gold.', mins: 7 },
        { title: 'Building healthy soil', blurb: 'Crop rotation and organic matter.', mins: 8 },
        { title: 'Pest control without chemicals', blurb: 'Natural defenses for a healthier garden.', mins: 6 },
    ],
    advanced: [
        { title: 'Year-round growing with season extension', blurb: 'Cold frames, row covers, and microclimates.', mins: 10 },
        { title: 'Saving your own seeds', blurb: 'Build a resilient, self-sustaining garden.', mins: 12 },
        { title: 'Designing a permaculture guild', blurb: 'Multi-layer planting for maximum yield.', mins: 14 },
        { title: 'Water-wise drip irrigation', blurb: 'Precision watering that saves resources.', mins: 9 },
    ],
};

export default function Learn() {
    const [tier, setTier] = useState('beginner');
    const guides = GUIDES[tier];

    return (
        <div className="py-6 space-y-5">
            <div className="animate-fade-in-up">
                <h1 className="font-heading text-2xl font-semibold">Learn</h1>
                <p className="text-sm text-muted-foreground">Bite-sized guides for every gardener.</p>
            </div>

            <div className="grid grid-cols-3 gap-2 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
                {TIERS.map(({ id, label, icon: Icon, tint }) => (
                    <button
                        key={id}
                        onClick={() => setTier(id)}
                        className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition-all ${tier === id ? 'border-primary bg-primary/5' : 'border-border bg-card/70'
                            }`}
                    >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tint}`}>
                            <Icon className="w-5 h-5" />
                        </div>
                        <span className={`text-xs font-medium ${tier === id ? 'text-primary' : 'text-muted-foreground'}`}>{label}</span>
                    </button>
                ))}
            </div>

            <div className="space-y-3">
                {guides.map((g, i) => (
                    <div
                        key={g.title}
                        className="flex items-center gap-3 rounded-2xl bg-card/85 backdrop-blur border border-border p-4 animate-fade-in-up"
                        style={{ animationDelay: `${i * 0.05}s` }}
                    >
                        <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                            <BookOpen className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm leading-tight">{g.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{g.blurb}</p>
                            <p className="text-[11px] text-muted-foreground/80 mt-1">{g.mins} min read</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                ))}
            </div>
        </div>
    );
}