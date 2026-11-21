import React, { useEffect, useRef } from 'react';
import { getMapTheme } from '../game/cityGen';
import { CameraMode, HudSnapshot, MapId, ViewMode } from '../game/types';

interface GameHudProps {
  hud: HudSnapshot;
  ownedCars: number;
  totalCars: number;
  isMuted: boolean;
  viewMode: ViewMode;
  cameraMode: CameraMode;
  mapId: MapId;
  onSelectViewMode: (mode: ViewMode) => void;
  onToggleCameraMode: () => void;
  onCycleMap: () => void;
  onOpenShop: () => void;
  onOpenAdmin: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onTouchControl: (
    key: 'up' | 'down' | 'left' | 'right' | 'drift' | 'boost',
    active: boolean
  ) => void;
  onBindMinimap: (canvas: HTMLCanvasElement | null) => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  ownedCars,
  totalCars,
  isMuted,
  viewMode,
  cameraMode,
  mapId,
  onSelectViewMode,
  onToggleCameraMode,
  onCycleMap,
  onOpenShop,
  onOpenAdmin,
  onToggleMute,
  onPause,
  onTouchControl,
  onBindMinimap,
}) => {
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const mapTheme = getMapTheme(mapId);

  useEffect(() => {
    onBindMinimap(minimapRef.current);
    return () => onBindMinimap(null);
  }, [onBindMinimap]);

  const hpPct = hud.maxHp > 0 ? Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100)) : 0;
  const ghostPct =
    hud.maxHp > 0 ? Math.max(hpPct, Math.min(100, (hud.ghostHp / hud.maxHp) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 sm:p-5">
      {/* Top Row: Left Armor/Heat/Speed + Right Money Counter & Controls */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left Cluster */}
        <div className="flex flex-col gap-2.5">
          <div className="w-64 px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700/80 shadow-md">
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Armor
              </span>
              <span className="font-mono-tabular text-xs font-bold text-slate-200">
                {hud.hp} / {hud.maxHp}
              </span>
            </div>

            {/* Armor Bar with delayed ghost damage indicator */}
            <div className="relative h-2.5 w-full bg-slate-800 rounded-sm overflow-hidden border border-slate-900">
              <div
                className="absolute inset-0 origin-left bg-amber-400/70"
                style={{ transform: `scaleX(${ghostPct / 100})` }}
              />
              <div
                className={`absolute inset-0 origin-left ${
                  hpPct > 40 ? 'bg-emerald-500' : hpPct > 20 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ transform: `scaleX(${hpPct / 100})` }}
              />
            </div>

            {/* Boost bar */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                Boost
              </span>
              <div className="flex-1 h-1.5 bg-slate-800 rounded-sm overflow-hidden">
                <div
                  className="h-full w-full origin-left bg-sky-400"
                  style={{ transform: `scaleX(${hud.boostFuel / 100})` }}
                />
              </div>
              <span className="font-mono-tabular text-xs font-bold text-slate-100">
                {hud.speedMph} MPH
              </span>
            </div>
          </div>

          {/* Wanted Stars + Current Car */}
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 w-fit">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Police
            </span>
            <div className="flex items-center gap-1" aria-label={`Wanted level ${hud.wantedStars} of 5`}>
              {[1, 2, 3, 4, 5].map((star) => {
                const active = star <= hud.wantedStars;
                return (
                  <svg
                    key={star}
                    viewBox="0 0 20 20"
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    <polygon
                      points="10,1.5 12.6,6.8 18.5,7.6 14.2,11.7 15.2,17.5 10,14.8 4.8,17.5 5.8,11.7 1.5,7.6 7.4,6.8"
                      fill={
                        active
                          ? star % 2 === 1
                            ? '#EF4444'
                            : '#3B82F6'
                          : '#334155'
                      }
                      stroke="#0F172A"
                      strokeWidth="1.2"
                    />
                  </svg>
                );
              })}
            </div>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="text-xs font-semibold text-slate-200 whitespace-nowrap">
              {hud.currentCarName}
            </span>
          </div>
        </div>

        {/* Center Transient Alert */}
        {hud.bannerAlert && (
          <div className="hidden md:flex items-center px-4 py-2 rounded-lg bg-[#1E1B14]/95 border border-amber-500/70 text-amber-300 text-sm font-semibold shadow-md">
            {hud.bannerAlert}
          </div>
        )}

        {/* Top-Right Cluster: Prominent Money Counter + Shop + Utility Icons */}
        <div className="flex flex-col items-end gap-2">
          <div
            data-testid="money-counter"
            className="flex items-center gap-3 px-4 py-2 rounded-lg bg-slate-900 border-2 border-emerald-500/80 shadow-lg"
          >
            <svg viewBox="0 0 24 24" className="w-7 h-7 shrink-0" aria-hidden="true">
              <circle cx="12" cy="12" r="10.5" fill="#10B981" stroke="#064E3B" strokeWidth="2" />
              <path
                d="M12 6v12M15 9c0-1.3-1.3-2.1-3-2.1s-2.9.9-2.9 2c0 1.2 1.1 1.7 2.9 2.1 1.7.4 3.1.9 3.1 2.3 0 1.3-1.3 2.2-3.1 2.2s-3.1-.9-3.1-2.2"
                fill="none"
                stroke="#ECFDF5"
                strokeWidth="2.1"
                strokeLinecap="round"
              />
            </svg>
            <div className="flex flex-col items-end leading-none">
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/90 mb-0.5">
                Cash
              </span>
              <span className="font-mono-tabular text-2xl sm:text-3xl font-bold text-emerald-400">
                ${hud.money.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Combo badge when chaining crashes */}
          {hud.comboCount > 1 && (
            <div className="px-3 py-1 rounded bg-amber-400 text-slate-950 font-display font-extrabold text-base tracking-wide shadow">
              {hud.comboCount}x CRASH COMBO · x{hud.comboMultiplier}
            </div>
          )}

          {/* Shop & Utility Row */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <div
              className="inline-flex items-center p-0.5 rounded-lg bg-slate-900 border border-slate-600"
              role="group"
              aria-label="Switch 2D or 3D"
            >
              <button
                type="button"
                tabIndex={-1}
                data-testid="hud-mode-2d-btn"
                aria-pressed={viewMode === '2d'}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onSelectViewMode('2d');
                }}
                className={`px-2.5 py-1.5 rounded-md text-xs font-extrabold uppercase tracking-wide cursor-pointer ${
                  viewMode === '2d'
                    ? 'bg-[#FACC15] text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                2D
              </button>
              <button
                type="button"
                tabIndex={-1}
                data-testid="hud-mode-3d-btn"
                aria-pressed={viewMode === '3d'}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onSelectViewMode('3d');
                }}
                className={`px-2.5 py-1.5 rounded-md text-xs font-extrabold uppercase tracking-wide cursor-pointer ${
                  viewMode === '3d'
                    ? 'bg-sky-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                3D
              </button>
            </div>

            <button
              type="button"
              tabIndex={-1}
              data-testid="hud-camera-btn"
              aria-pressed={viewMode === '3d' && cameraMode === 'first'}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleCameraMode();
              }}
              className={`px-3 py-2 rounded-lg border font-bold text-xs tracking-wide cursor-pointer whitespace-nowrap ${
                viewMode === '3d' && cameraMode === 'first'
                  ? 'bg-sky-400 text-slate-950 border-sky-300'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-600 text-slate-100'
              }`}
            >
              {viewMode === '3d' && cameraMode === 'first' ? '1st Person [C]' : '3rd Person [C]'}
            </button>

            <button
              type="button"
              tabIndex={-1}
              data-testid="hud-map-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                onCycleMap();
              }}
              className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-600 text-slate-100 font-bold text-xs tracking-wide cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5"
            >
              <span
                className="w-2 h-2 rounded-sm shrink-0"
                style={{ backgroundColor: mapTheme.lineColor }}
                aria-hidden="true"
              />
              Map: {mapTheme.name}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenShop();
              }}
              className="px-3.5 py-2 rounded-lg bg-[#FACC15] hover:bg-[#FDE047] text-slate-950 font-bold text-xs sm:text-sm tracking-wide shadow-[0_2px_0_#A16207] cursor-pointer whitespace-nowrap transition-colors"
            >
              Shop ({ownedCars}/{totalCars}) [G]
            </button>

            <button
              type="button"
              tabIndex={-1}
              data-testid="hud-admin-btn"
              aria-label="Open owner admin panel"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenAdmin();
              }}
              className="px-2.5 h-9 rounded-lg bg-slate-900 hover:bg-slate-800 border border-amber-500/50 flex items-center gap-1 text-amber-300 font-bold text-xs cursor-pointer whitespace-nowrap"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              Admin
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className="w-9 h-9 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-600 flex items-center justify-center text-slate-200 cursor-pointer"
            >
              {isMuted ? (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path d="M23 9l-6 6M17 9l6 6" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
                </svg>
              )}
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Pause game"
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              className="w-9 h-9 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-600 flex items-center justify-center text-slate-200 cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Row: Minimap Radar + Destruction Tally + Mobile Touch Controls */}
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-end gap-3">
          <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-700/80 shadow-md">
            <canvas
              ref={minimapRef}
              width={124}
              height={124}
              className="block rounded"
              aria-label="City radar minimap"
            />
          </div>

          <div className="hidden sm:flex items-center gap-3 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700/80 text-xs font-semibold text-slate-300 font-mono-tabular">
            <span>Buildings {hud.buildingsCrushed}</span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span>Cars {hud.carsCrushed}</span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span>Cops {hud.policeSmashed}</span>
          </div>
        </div>

        {/* Touch controls for mobile viewports */}
        <div className="flex md:hidden items-center gap-2 pointer-events-auto">
          <div className="flex gap-1.5">
            <button
              type="button"
              aria-label="Steer left"
              onPointerDown={() => onTouchControl('left', true)}
              onPointerUp={() => onTouchControl('left', false)}
              onPointerLeave={() => onTouchControl('left', false)}
              className="w-12 h-12 rounded-lg bg-slate-800/90 border border-slate-600 text-white font-bold"
            >
              ◀
            </button>
            <button
              type="button"
              aria-label="Steer right"
              onPointerDown={() => onTouchControl('right', true)}
              onPointerUp={() => onTouchControl('right', false)}
              onPointerLeave={() => onTouchControl('right', false)}
              className="w-12 h-12 rounded-lg bg-slate-800/90 border border-slate-600 text-white font-bold"
            >
              ▶
            </button>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              aria-label="Brake or reverse"
              onPointerDown={() => onTouchControl('down', true)}
              onPointerUp={() => onTouchControl('down', false)}
              onPointerLeave={() => onTouchControl('down', false)}
              className="w-12 h-12 rounded-lg bg-red-900/90 border border-red-600 text-white font-bold text-xs"
            >
              REV
            </button>
            <button
              type="button"
              aria-label="Accelerate"
              onPointerDown={() => onTouchControl('up', true)}
              onPointerUp={() => onTouchControl('up', false)}
              onPointerLeave={() => onTouchControl('up', false)}
              className="w-14 h-12 rounded-lg bg-emerald-600 border border-emerald-400 text-white font-bold text-xs"
            >
              GAS
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
