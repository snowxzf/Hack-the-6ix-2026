import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import WeatherBackground from './WeatherBackground';
import { WeatherProvider } from '@/lib/weather-context';

export default function AppLayout() {
    return (
        <WeatherProvider>
            <WeatherBackground />
            <main className="relative z-10 mx-auto max-w-md min-h-screen px-4 pb-28">
                <Outlet />
            </main>
            <BottomNav />
        </WeatherProvider>
    );
}