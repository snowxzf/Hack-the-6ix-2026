import { NavLink } from 'react-router-dom';
import { Home, Sprout, LayoutGrid, BookOpen, User } from 'lucide-react';

const items = [
    { to: '/', icon: Home, label: 'Home' },
    { to: '/garden', icon: Sprout, label: 'Garden' },
    { to: '/plan', icon: LayoutGrid, label: 'Plan' },
    { to: '/learn', icon: BookOpen, label: 'Learn' },
    { to: '/profile', icon: User, label: 'Profile' },
];

export default function BottomNav() {
    return (
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-20 px-3 pb-3 pointer-events-none">
            <div className="pointer-events-auto flex items-center justify-around rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-lg shadow-black/5 px-2 py-2">
                {items.map(({ to, icon: Icon, label }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={to === '/'}
                        className={({ isActive }) =>
                            `flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 transition-all ${isActive ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'
                            }`
                        }
                    >
                        <Icon className="w-5 h-5" strokeWidth={2} />
                        <span className="text-[10px] font-medium">{label}</span>
                    </NavLink>
                ))}
            </div>
        </nav>
    );
}