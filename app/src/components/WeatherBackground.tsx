import { useMemo } from "react";
import { useWeather } from "./WeatherProvider";

function Cloud({
  left,
  top,
  delay,
  duration,
  scale = 1,
  opacity = 0.5,
  dark = false,
}: {
  left: number;
  top: number;
  delay: number;
  duration: number;
  scale?: number;
  opacity?: number;
  dark?: boolean;
}) {
  const fill = dark ? "rgba(70,78,95,0.85)" : "#ffffff";
  return (
    <div
      className="absolute"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        animation: `cloud-drift ${duration}s linear infinite`,
        animationDelay: `${delay}s`,
      }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: "left center", opacity }}>
        <div className="relative h-12 w-32">
          <div className="absolute inset-0 rounded-full blur-md" style={{ background: fill }} />
          <div
            className="absolute -top-5 left-5 h-16 w-16 rounded-full blur-md"
            style={{ background: fill }}
          />
          <div
            className="absolute -top-3 left-16 h-14 w-14 rounded-full blur-md"
            style={{ background: fill }}
          />
        </div>
      </div>
    </div>
  );
}

const GRADIENTS: Record<string, string> = {
  sunny:
    "linear-gradient(to bottom, rgba(135,206,250,0.55) 0%, rgba(255,250,240,0.12) 45%, rgba(255,255,255,0) 72%)",
  partly_cloudy:
    "linear-gradient(to bottom, rgba(173,216,230,0.5) 0%, rgba(255,250,240,0.1) 45%, rgba(255,255,255,0) 72%)",
  rainy:
    "linear-gradient(to bottom, rgba(110,124,140,0.5) 0%, rgba(170,182,196,0.12) 45%, rgba(255,255,255,0) 72%)",
  cloudy:
    "linear-gradient(to bottom, rgba(176,190,205,0.55) 0%, rgba(200,210,220,0.12) 45%, rgba(255,255,255,0) 72%)",
  snowy:
    "linear-gradient(to bottom, rgba(200,215,235,0.6) 0%, rgba(220,230,245,0.15) 45%, rgba(255,255,255,0) 72%)",
  thunder:
    "linear-gradient(to bottom, rgba(35,42,58,0.7) 0%, rgba(55,62,80,0.2) 45%, rgba(255,255,255,0) 72%)",
  clear_night:
    "linear-gradient(to bottom, rgba(18,28,58,0.65) 0%, rgba(30,40,70,0.18) 45%, rgba(255,255,255,0) 72%)",
};

export function WeatherBackground() {
  const { condition } = useWeather();

  const drops = useMemo(
    () =>
      Array.from({ length: 70 }, () => ({
        left: Math.random() * 100,
        duration: 0.5 + Math.random() * 0.8,
        delay: Math.random() * 2,
        height: 45 + Math.random() * 80,
        opacity: 0.2 + Math.random() * 0.35,
      })),
    [],
  );

  const flakes = useMemo(
    () =>
      Array.from({ length: 50 }, () => ({
        left: Math.random() * 100,
        duration: 3 + Math.random() * 5,
        delay: Math.random() * 5,
        size: 3 + Math.random() * 5,
        opacity: 0.4 + Math.random() * 0.5,
      })),
    [],
  );

  const stars = useMemo(
    () =>
      Array.from({ length: 60 }, () => ({
        left: Math.random() * 100,
        top: Math.random() * 55,
        size: 1 + Math.random() * 2,
        delay: Math.random() * 3,
      })),
    [],
  );

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 transition-all duration-1000"
        style={{ background: GRADIENTS[condition] ?? GRADIENTS.partly_cloudy }}
      />

      {/* Sunny — sun glow only */}
      {condition === "sunny" && (
        <div
          className="absolute -right-10 -top-16 h-72 w-72 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,224,130,0.7) 0%, rgba(255,200,80,0.25) 42%, rgba(255,200,80,0) 70%)",
            animation: "sun-glow 4s ease-in-out infinite",
          }}
        />
      )}

      {/* Partly cloudy — sun + clouds */}
      {condition === "partly_cloudy" && (
        <>
          <div
            className="absolute right-6 top-4 h-56 w-56 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(255,224,130,0.55) 0%, rgba(255,200,80,0.2) 45%, rgba(255,200,80,0) 70%)",
              animation: "sun-glow 5s ease-in-out infinite",
            }}
          />
          <Cloud left={8} top={18} delay={0} duration={75} scale={1} opacity={0.55} />
          <Cloud left={55} top={32} delay={8} duration={90} scale={0.7} opacity={0.45} />
        </>
      )}

      {/* Rain */}
      {condition === "rainy" && (
        <>
          <Cloud left={5} top={10} delay={0} duration={85} scale={1.2} opacity={0.5} />
          <Cloud left={50} top={22} delay={6} duration={95} scale={0.9} opacity={0.45} />
          {drops.map((d, i) => (
            <div
              key={i}
              className="absolute top-0 w-px bg-blue-500/60"
              style={{
                left: `${d.left}%`,
                height: `${d.height}px`,
                opacity: d.opacity,
                animation: `rain-fall ${d.duration}s linear infinite`,
                animationDelay: `${d.delay}s`,
              }}
            />
          ))}
        </>
      )}

      {/* Cloudy — clouds only */}
      {condition === "cloudy" && (
        <>
          <Cloud left={2} top={12} delay={0} duration={90} scale={1.3} opacity={0.55} />
          <Cloud left={40} top={20} delay={5} duration={100} scale={1} opacity={0.5} />
          <Cloud left={72} top={14} delay={12} duration={110} scale={0.8} opacity={0.45} />
        </>
      )}

      {/* Snow */}
      {condition === "snowy" && (
        <>
          <Cloud left={10} top={12} delay={0} duration={95} scale={1} opacity={0.6} />
          {flakes.map((f, i) => (
            <div
              key={i}
              className="absolute top-0 rounded-full bg-white"
              style={{
                left: `${f.left}%`,
                width: `${f.size}px`,
                height: `${f.size}px`,
                opacity: f.opacity,
                animation: `snow-fall ${f.duration}s linear infinite`,
                animationDelay: `${f.delay}s`,
              }}
            />
          ))}
        </>
      )}

      {/* Thunder — lightning flashes */}
      {condition === "thunder" && (
        <>
          <div
            className="absolute inset-0 bg-white"
            style={{ animation: "lightning-flash 4.5s ease-in-out infinite" }}
          />
          <Cloud left={0} top={8} delay={0} duration={80} scale={1.4} opacity={0.55} dark />
          <Cloud left={45} top={18} delay={4} duration={95} scale={1.1} opacity={0.5} dark />
          <svg
            className="absolute"
            style={{
              left: "32%",
              top: "8%",
              width: 48,
              height: 96,
              animation: "lightning-bolt 4.5s ease-in-out infinite",
              filter: "drop-shadow(0 0 10px rgba(255,240,160,0.95))",
            }}
            viewBox="0 0 32 64"
            fill="none"
            aria-hidden
          >
            <path
              d="M18 2 L8 30 H16 L10 62 L28 26 H18 L24 2 Z"
              fill="#fff8c8"
              stroke="#ffe566"
              strokeWidth="1"
            />
          </svg>
          <svg
            className="absolute"
            style={{
              left: "58%",
              top: "14%",
              width: 36,
              height: 72,
              animation: "lightning-bolt 5.2s ease-in-out infinite",
              animationDelay: "1.6s",
              filter: "drop-shadow(0 0 8px rgba(255,240,160,0.9))",
            }}
            viewBox="0 0 32 64"
            fill="none"
            aria-hidden
          >
            <path
              d="M18 2 L8 30 H16 L10 62 L28 26 H18 L24 2 Z"
              fill="#fff8c8"
              stroke="#ffe566"
              strokeWidth="1"
            />
          </svg>
        </>
      )}

      {/* Night — moon + stars */}
      {condition === "clear_night" && (
        <>
          {stars.map((s, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-white"
              style={{
                left: `${s.left}%`,
                top: `${s.top}%`,
                width: `${s.size}px`,
                height: `${s.size}px`,
                animation: "twinkle 3s ease-in-out infinite",
                animationDelay: `${s.delay}s`,
              }}
            />
          ))}
          <div
            className="absolute right-10 top-8"
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              boxShadow: "20px -4px 0 0 rgba(254,252,232,0.92)",
              filter: "drop-shadow(0 0 20px rgba(255,250,220,0.45))",
            }}
            aria-hidden
          />
        </>
      )}
    </div>
  );
}
