import React, { useMemo } from 'react';
import { useWeather } from '@/lib/weather-context';

const SKY = {
    sunny: 'linear-gradient(to bottom, #5fb0ee 0%, #9bd2f3 60%, #cfeafb 100%)',
    partly_cloudy: 'linear-gradient(to bottom, #73c0e6 0%, #abd6ec 60%, #d2e8f2 100%)',
    rainy: 'linear-gradient(to bottom, #565e6a 0%, #737d8a 60%, #949da9 100%)',
    cloudy: 'linear-gradient(to bottom, #75818e 0%, #96a0ac 60%, #b5bdc7 100%)',
    snowy: 'linear-gradient(to bottom, #8a9fb5 0%, #b6c8d9 60%, #dde9f1 100%)',
    clear_night: 'linear-gradient(to bottom, #0c1430 0%, #1a2546 60%, #28365c 100%)',
};

const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

function SceneCloud({ left, top, scale = 1, delay = 0, opacity = 0.95 }) {
    return (
        <div className="absolute" style={{ left: `${left}%`, top: `${top}%`, animation: 'cloud-drift 60s linear infinite', animationDelay: `${delay}s` }}>
            <div style={{ transform: `scale(${scale})`, opacity }}>
                <div className="relative w-24 h-9">
                    <div className="absolute inset-0 bg-white rounded-full" />
                    <div className="absolute -top-4 left-4 w-12 h-12 bg-white rounded-full" />
                    <div className="absolute -top-2 left-12 w-10 h-10 bg-white rounded-full" />
                </div>
            </div>
        </div>
    );
}

export default function WeatherScene() {
    const { condition, label, temp } = useWeather();

    const drops = useMemo(
        () =>
            Array.from({ length: 50 }, () => ({
                left: Math.random() * 100,
                duration: 0.5 + Math.random() * 0.7,
                delay: Math.random() * 1.5,
                height: 40 + Math.random() * 60,
            })),
        []
    );

    const flakes = useMemo(
        () =>
            Array.from({ length: 40 }, () => ({
                left: Math.random() * 100,
                duration: 2.5 + Math.random() * 4,
                delay: Math.random() * 4,
                size: 3 + Math.random() * 5,
            })),
        []
    );

    const stars = useMemo(
        () =>
            Array.from({ length: 30 }, () => ({
                left: Math.random() * 100,
                top: Math.random() * 70,
                size: 1 + Math.random() * 2,
                delay: Math.random() * 3,
            })),
        []
    );

    return (
        <div className="relative h-36 overflow-hidden border border-border animate-fade-in-up" style={{ background: SKY[condition], animationDelay: '0.04s' }}>
            {condition === 'sunny' && (
                <div className="absolute -top-3 right-3">
                    <div className="relative w-28 h-28">
                        <div className="absolute inset-0 animate-spin-slow">
                            {RAYS.map((a) => (
                                <div key={a} className="absolute left-1/2 top-1/2 w-32 h-1.5 bg-yellow-200/80" style={{ transform: `translate(-50%, -50%) rotate(${a}deg)` }} />
                            ))}
                        </div>
                        <div className="absolute inset-4 rounded-full bg-yellow-300" style={{ boxShadow: '0 0 36px 8px rgba(255,210,80,0.85)' }} />
                    </div>
                </div>
            )}

            {condition === 'partly_cloudy' && (
                <>
                    <div className="absolute top-1 right-4 w-20 h-20 rounded-full bg-yellow-300" style={{ boxShadow: '0 0 28px 6px rgba(255,210,80,0.6)' }} />
                    <SceneCloud left={5} top={12} scale={1} delay={0} />
                    <SceneCloud left={45} top={28} scale={0.7} delay={6} />
                </>
            )}

            {(condition === 'rainy' || condition === 'cloudy') && (
                <>
                    <SceneCloud left={8} top={6} scale={1.1} delay={0} />
                    <SceneCloud left={48} top={14} scale={0.8} delay={5} />
                    {condition === 'rainy' &&
                        drops.map((d, i) => (
                            <div key={i} className="absolute top-0 w-0.5 bg-blue-100/80" style={{ left: `${d.left}%`, height: `${d.height}px`, animation: `rain-fall ${d.duration}s linear infinite`, animationDelay: `${d.delay}s` }} />
                        ))}
                </>
            )}

            {condition === 'snowy' && (
                <>
                    <SceneCloud left={10} top={8} scale={1} delay={0} />
                    {flakes.map((f, i) => (
                        <div key={i} className="absolute top-0 rounded-full bg-white" style={{ left: `${f.left}%`, width: `${f.size}px`, height: `${f.size}px`, animation: `snow-fall ${f.duration}s linear infinite`, animationDelay: `${f.delay}s` }} />
                    ))}
                </>
            )}

            {condition === 'clear_night' && (
                <>
                    {stars.map((s, i) => (
                        <div key={i} className="absolute rounded-full bg-white" style={{ left: `${s.left}%`, top: `${s.top}%`, width: `${s.size}px`, height: `${s.size}px`, animation: 'twinkle 3s ease-in-out infinite', animationDelay: `${s.delay}s` }} />
                    ))}
                    <div className="absolute top-3 right-5 w-16 h-16 rounded-full bg-yellow-50/90" style={{ boxShadow: '0 0 24px 6px rgba(255,250,220,0.5)' }} />
                </>
            )}

            <div className="absolute bottom-2 left-3 text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.45)' }}>
                <p className="font-heading text-2xl font-semibold leading-none">{temp}°</p>
                <p className="text-xs opacity-90 mt-0.5">{label}</p>
            </div>
        </div>
    );
}