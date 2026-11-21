import React from 'react';

interface FirstPersonCockpitProps {
  steerInput?: number;
  speedMph: number;
}

export const FirstPersonCockpit: React.FC<FirstPersonCockpitProps> = ({
  steerInput = 0,
  speedMph,
}) => {
  const wheelAngle = steerInput * 32;

  return (
    <div
      className="fixed inset-0 z-[5] pointer-events-none select-none overflow-hidden"
      data-testid="first-person-cockpit"
      aria-hidden="true"
    >
      {/* Slim Left & Right Windshield A-Pillars along outer viewport edges */}
      <div
        className="hidden md:block absolute -top-6 -left-6 w-12 h-[115%] bg-[#0c1018]/90 border-r border-slate-700/60"
        style={{ transform: 'rotate(7deg)' }}
      />
      <div
        className="hidden md:block absolute -top-6 -right-6 w-12 h-[115%] bg-[#0c1018]/90 border-l border-slate-700/60"
        style={{ transform: 'rotate(-7deg)' }}
      />

      {/* Top Windshield Sun-Strip & Interior Rearview Mirror */}
      <div className="absolute top-0 left-0 right-0 h-2.5 bg-[#0c1018]/85" />
      <div className="hidden sm:flex flex-col items-center absolute top-2.5 left-1/2 -translate-x-1/2">
        <div className="w-2.5 h-3 bg-[#111622] border-x border-slate-700/70" />
        <div className="w-40 h-9 rounded-md bg-[#111722] border-2 border-slate-700/90 shadow-lg flex items-center justify-center overflow-hidden">
          <div className="w-full h-full bg-gradient-to-b from-slate-700/60 via-slate-800/70 to-slate-900/90 flex items-center justify-center">
            <span className="font-mono-tabular text-[10px] font-bold tracking-widest text-slate-400/80 uppercase">
              {speedMph} MPH
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Dashboard Cowling & Rotating Sport Steering Wheel */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
        <div
          className="transition-transform duration-100 ease-out origin-center translate-y-12"
          style={{ transform: `rotate(${wheelAngle}deg)` }}
        >
          <svg viewBox="0 0 220 220" className="w-48 h-48 sm:w-56 sm:h-56 drop-shadow-[0_8px_18px_rgba(0,0,0,0.75)]">
            {/* Outer Rim */}
            <circle
              cx="110"
              cy="110"
              r="88"
              fill="none"
              stroke="#141923"
              strokeWidth="22"
            />
            <circle
              cx="110"
              cy="110"
              r="88"
              fill="none"
              stroke="#334155"
              strokeWidth="2"
              strokeOpacity="0.65"
            />
            {/* Top-center Yellow Motorsport Alignment Stripe */}
            <path
              d="M 101 13 A 97 97 0 0 1 119 13 L 117 31 A 79 79 0 0 0 103 31 Z"
              fill="#FACC15"
            />
            {/* Three Alloy Spokes */}
            <path d="M 32 104 L 92 108 L 92 122 L 34 126 Z" fill="#1E293B" stroke="#475569" strokeWidth="1.5" />
            <path d="M 188 104 L 128 108 L 128 122 L 186 126 Z" fill="#1E293B" stroke="#475569" strokeWidth="1.5" />
            <path d="M 101 124 L 119 124 L 122 188 L 98 188 Z" fill="#1E293B" stroke="#475569" strokeWidth="1.5" />
            {/* Center Horn Pad */}
            <circle cx="110" cy="112" r="27" fill="#0F172A" stroke="#475569" strokeWidth="2.5" />
            <polygon points="110,97 118,110 112,110 116,125 103,111 109,111" fill="#FACC15" />
          </svg>
        </div>
      </div>
    </div>
  );
};
