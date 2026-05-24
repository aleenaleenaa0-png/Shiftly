import React from 'react';

const PARTICLES = Array.from({ length: 16 }, (_, i) => ({
  width: 4 + (i % 5) * 1.4,
  left: ((i * 37) % 96) + 2,
  top: ((i * 53) % 92) + 3,
  color: ['rgba(251, 113, 133, 0.35)', 'rgba(168, 85, 247, 0.35)', 'rgba(34, 211, 238, 0.35)'][
    i % 3
  ],
  delay: `${(i % 6) * 0.35}s`,
  duration: `${8 + (i % 7)}s`,
}));

/** רקע דקורטיבי — ערכים קבועים (ללא Math.random בכל רינדור) */
const BackgroundParticles: React.FC = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden>
    {PARTICLES.map((p, i) => (
      <div
        key={i}
        className="absolute rounded-full animate-pulse"
        style={{
          width: `${p.width}px`,
          height: `${p.width}px`,
          left: `${p.left}%`,
          top: `${p.top}%`,
          backgroundColor: p.color,
          animationDuration: p.duration,
          animationDelay: p.delay,
          filter: 'blur(1px)',
        }}
      />
    ))}
  </div>
);

export default BackgroundParticles;
