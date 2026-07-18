import { Cloud, CloudRain, CloudSnow, Sun, CloudSun, Moon, RefreshCw } from 'lucide-react';
import { useWeather } from '@/lib/weather-context';

const ICONS = {
    sunny: Sun,
    partly_cloudy: CloudSun,
    rainy: CloudRain,
    cloudy: Cloud,
    snowy: CloudSnow,
    clear_night: Moon,
};

const TINTS = {
    sunny: 'text-amber-500 bg-amber-100',
    partly_cloudy: 'text-sky-500 bg-sky-100',
    rainy: 'text-blue-500 bg-blue-100',
    cloudy: 'text-slate-500 bg-slate-100',
    snowy: 'text-sky-400 bg-sky-100',
    clear_night: 'text-indigo-300 bg-indigo-100',
};

export default function WeatherChip() {
    const { condition, temp, label, location, cycle } = useWeather();
    const Icon = ICONS[condition] || Sun;
    const tint = TINTS[condition] || TINTS.sunny;

    return (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/85 backdrop-blur pl-2 pr-1 py-1">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tint}`}>
                <Icon className="w-5 h-5" />
            </div>
            <div className="leading-tight pr-1">
                <p className="text-sm font-semibold">{temp}°C</p>
                <p className="text-[10px] text-muted-foreground">{location}</p>
            </div>
            <button
                onClick={cycle}
                title="Preview weather effects"
                className="w-8 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
            >
                <RefreshCw className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}