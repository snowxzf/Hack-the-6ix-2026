import { useMemo } from "react";
import { useWeather } from "./WeatherProvider";

const SKY: Record<string, string> = {
  sunny: "linear-gradient(to bottom, #5fb0ee 0%, #9bd2f3 60%, #cfeafb 100%)",
  partly_cloudy: "linear-gradient(to bottom, #73c0e6 0%, #abd6ec 60%, #d2e8f2 100%)",
  rainy: "linear-gradient(to bottom, #565e6a 0%, #737d8a 60%, #949da9 100%)",
  cloudy: "linear-gradient(to bottom, #75818e 0%, #96a0ac 60%, #b5bdc7 100%)",
  snowy: "linear-gradient(to bottom, #8a9fb5 0%, #b6c8d9 60%, #dde9f1 100%)",
  thunder: "linear-gradient(to bottom, #2a3140 0%, #3d4658 55%, #5a6578 100%)",
  clear_night: "linear-gradient(to bottom, #0c1430 0%, #1a2546 60%, #28365c 100%)",
};

const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

function SceneCloud({
  left,
  top,
  scale = 1,
  delay = 0,
  opacity = 0.95,
  dark = false,
}: {
  left: number;
  top: number;
  scale?: number;
  delay?: number;
  opacity?: number;
  dark?: boolean;
}) {
  const fill = dark ? "#6b7385" : "#ffffff";
  return (
    <div
      className="absolute"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        animation: "cloud-drift 60s linear infinite",
        animationDelay: `${delay}s`,
      }}
    >
      <div style={{ transform: `scale(${scale})`, opacity }}>
        <div className="relative h-9 w-24">
          <div className="absolute inset-0 rounded-full" style={{ background: fill }} />
          <div
            className="absolute -top-4 left-4 h-12 w-12 rounded-full"
            style={{ background: fill }}
          />
          <div
            className="absolute -top-2 left-12 h-10 w-10 rounded-full"
            style={{ background: fill }}
          />
        </div>
      </div>
    </div>
  );
}

function LightningBolt({
  left,
  top,
  delay,
  scale = 1,
}: {
  left: number;
  top: number;
  delay: number;
  scale?: number;
}) {
  return (
    <svg
      className="absolute"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: 28 * scale,
        height: 56 * scale,
        animation: `lightning-bolt ${3.5 + delay}s ease-in-out infinite`,
        animationDelay: `${delay}s`,
        filter: "drop-shadow(0 0 6px rgba(255,240,160,0.9))",
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
  );
}

function Moon() {
  // Crescent via offset box-shadow — no sky-color matching needed.
  return (
    <div
      className="absolute right-8 top-4"
      style={{
        width: 52,
        height: 52,
        borderRadius: "50%",
        boxShadow: "14px -2px 0 0 #fefce8",
        filter: "drop-shadow(0 0 14px rgba(255,250,220,0.55))",
      }}
      aria-hidden
    />
  );
}

export function WeatherScene() {
  const { condition, label, temp } = useWeather();

  const drops = useMemo(
    () =>
      Array.from({ length: 50 }, () => ({
        left: Math.random() * 100,
        duration: 0.5 + Math.random() * 0.7,
        delay: Math.random() * 1.5,
        height: 40 + Math.random() * 60,
      })),
    [],
  );

  const flakes = useMemo(
    () =>
      Array.from({ length: 40 }, () => ({
        left: Math.random() * 100,
        duration: 2.5 + Math.random() * 4,
        delay: Math.random() * 4,
        size: 3 + Math.random() * 5,
      })),
    [],
  );

  const stars = useMemo(
    () =>
      Array.from({ length: 30 }, () => ({
        left: Math.random() * 100,
        top: Math.random() * 70,
        size: 1 + Math.random() * 2,
        delay: Math.random() * 3,
      })),
    [],
  );

  return (
    <div
      className="relative h-36 animate-fade-in-up overflow-hidden border border-border"
      style={{ background: SKY[condition] ?? SKY.partly_cloudy, animationDelay: "0.04s" }}
    >
      {/* Sunny — sun only */}
      {condition === "sunny" && (
        <div className="absolute -top-3 right-3">
          <div className="relative h-28 w-28">
            <div className="absolute inset-0 animate-spin-slow">
              {RAYS.map((a) => (
                <div
                  key={a}
                  className="absolute left-1/2 top-1/2 h-1.5 w-32 bg-yellow-200/80"
                  style={{ transform: `translate(-50%, -50%) rotate(${a}deg)` }}
                />
              ))}
            </div>
            <div
              className="absolute inset-4 rounded-full bg-yellow-300"
              style={{ boxShadow: "0 0 36px 8px rgba(255,210,80,0.85)" }}
            />
          </div>
        </div>
      )}

      {/* Partly cloudy — sun + clouds (keep current) */}
      {condition === "partly_cloudy" && (
        <>
          <div
            className="absolute right-4 top-1 h-20 w-20 rounded-full bg-yellow-300"
            style={{ boxShadow: "0 0 28px 6px rgba(255,210,80,0.6)" }}
          />
          <SceneCloud left={5} top={12} scale={1} delay={0} />
          <SceneCloud left={45} top={28} scale={0.7} delay={6} />
        </>
      )}

      {/* Rain — clouds + rain */}
      {condition === "rainy" && (
        <>
          <SceneCloud left={8} top={6} scale={1.1} delay={0} />
          <SceneCloud left={48} top={14} scale={0.8} delay={5} />
          {drops.map((d, i) => (
            <div
              key={i}
              className="absolute top-0 w-0.5 bg-blue-100/80"
              style={{
                left: `${d.left}%`,
                height: `${d.height}px`,
                animation: `rain-fall ${d.duration}s linear infinite`,
                animationDelay: `${d.delay}s`,
              }}
            />
          ))}
        </>
      )}

      {/* Cloudy — clouds only, no rain */}
      {condition === "cloudy" && (
        <>
          <SceneCloud left={4} top={8} scale={1.15} delay={0} opacity={0.92} />
          <SceneCloud left={38} top={18} scale={0.95} delay={4} opacity={0.88} />
          <SceneCloud left={68} top={6} scale={0.75} delay={9} opacity={0.85} />
        </>
      )}

      {/* Snow */}
      {condition === "snowy" && (
        <>
          <SceneCloud left={10} top={8} scale={1} delay={0} />
          {flakes.map((f, i) => (
            <div
              key={i}
              className="absolute top-0 rounded-full bg-white"
              style={{
                left: `${f.left}%`,
                width: `${f.size}px`,
                height: `${f.size}px`,
                animation: `snow-fall ${f.duration}s linear infinite`,
                animationDelay: `${f.delay}s`,
              }}
            />
          ))}
        </>
      )}

      {/* Thunder — dark clouds + lightning */}
      {condition === "thunder" && (
        <>
          <div
            className="pointer-events-none absolute inset-0 bg-white"
            style={{ animation: "lightning-flash 4.2s ease-in-out infinite" }}
          />
          <SceneCloud left={2} top={4} scale={1.25} delay={0} dark opacity={0.95} />
          <SceneCloud left={40} top={10} scale={1.05} delay={3} dark opacity={0.9} />
          <SceneCloud left={70} top={2} scale={0.85} delay={7} dark opacity={0.88} />
          <LightningBolt left={28} top={22} delay={0} scale={1.1} />
          <LightningBolt left={62} top={30} delay={1.4} scale={0.85} />
          {drops.slice(0, 18).map((d, i) => (
            <div
              key={i}
              className="absolute top-0 w-0.5 bg-blue-100/50"
              style={{
                left: `${d.left}%`,
                height: `${d.height * 0.7}px`,
                animation: `rain-fall ${d.duration * 1.1}s linear infinite`,
                animationDelay: `${d.delay}s`,
              }}
            />
          ))}
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
          <Moon />
        </>
      )}

      <div
        className="absolute bottom-2 left-3 text-white"
        style={{ textShadow: "0 1px 3px rgba(0,0,0,0.45)" }}
      >
        <p className="font-heading text-2xl font-semibold leading-none">{temp}°</p>
        <p className="mt-0.5 text-xs opacity-90">{label}</p>
      </div>
    </div>
  );
}
