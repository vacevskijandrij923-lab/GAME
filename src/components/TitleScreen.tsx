import React from 'react';
import { getMapTheme } from '../game/cityGen';
import { CameraMode, MapId, ViewMode } from '../game/types';

interface TitleScreenProps {
  money: number;
  ownedCount: number;
  totalCars: number;
  viewMode: ViewMode;
  cameraMode: CameraMode;
  mapId: MapId;
  onSelectViewMode: (mode: ViewMode) => void;
  onToggleCameraMode: () => void;
  onCycleMap: () => void;
  onStart: () => void;
  onOpenShop: () => void;
  onOpenAdmin: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  money,
  ownedCount,
  totalCars,
  viewMode,
  cameraMode,
  mapId,
  onSelectViewMode,
  onToggleCameraMode,
  onCycleMap,
  onStart,
  onOpenShop,
  onOpenAdmin,
}) => {
  const mapTheme = getMapTheme(mapId);

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none">
      {/* Calm negative-space scrim on the left without backdrop-blur */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(95deg, rgba(14,18,26,0.92) 0%, rgba(14,18,26,0.78) 44%, rgba(14,18,26,0.22) 100%)',
        }}
      />

      {/* Top row: Owner Admin trigger (left) & bank readout (right) */}
      <div className="relative z-10 flex items-center justify-between p-6 sm:p-8">
        <button
          type="button"
          data-testid="admin-open-btn"
          onClick={onOpenAdmin}
          className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#141923]/95 hover:bg-slate-800 border border-slate-700/80 text-xs font-bold uppercase tracking-wider text-amber-300 shadow-lg cursor-pointer"
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Admin
        </button>

        <div className="flex items-center gap-4 px-4 py-2.5 rounded-lg bg-[#141923]/95 border border-slate-700/80 shadow-lg">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
              <circle cx="12" cy="12" r="10" fill="#10B981" stroke="#064E3B" strokeWidth="2" />
              <path
                d="M12 6.5v11M14.8 9.2c0-1.2-1.2-2-2.8-2s-2.7.8-2.7 1.9c0 1.2 1.1 1.6 2.7 2 1.6.4 2.9.9 2.9 2.2 0 1.2-1.2 2.1-2.9 2.1s-2.9-.8-2.9-2.1"
                fill="none"
                stroke="#ECFDF5"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
            </svg>
            <span className="font-mono-tabular text-xl font-bold text-emerald-400">
              ${money.toLocaleString()}
            </span>
          </div>
          <span className="text-slate-600" aria-hidden="true">|</span>
          <span className="text-xs font-semibold tracking-wide text-slate-300 font-mono-tabular">
            Garage {ownedCount}/{totalCars}
          </span>
        </div>
      </div>

      {/* Main Title & Primary Actions over calm left negative space */}
      <div className="relative z-10 flex-1 flex items-center px-6 sm:px-12 lg:px-20">
        <div className="max-w-lg w-full">
          {/* Bespoke inline SVG Title Lockup */}
          <svg
            viewBox="0 0 460 156"
            className="w-full max-w-[440px] h-auto mb-5 drop-shadow-[0_6px_18px_rgba(0,0,0,0.65)]"
            role="img"
            aria-label="Crunch City"
          >
            {/* Diagonal road-stripe emblem */}
            <polygon points="10,16 446,10 434,142 4,148" fill="#181F2C" stroke="#FACC15" strokeWidth="4" />
            <polygon points="18,128 438,122 436,134 16,140" fill="#FACC15" />
            <rect x="26" y="28" width="12" height="82" fill="#EF4444" />
            <text
              x="54"
              y="74"
              fill="#F8FAFC"
              fontFamily="'Barlow Condensed', sans-serif"
              fontWeight="800"
              fontStyle="italic"
              fontSize="62"
              letterSpacing="2"
            >
              CRUNCH
            </text>
            <text
              x="56"
              y="116"
              fill="#FACC15"
              fontFamily="'Barlow Condensed', sans-serif"
              fontWeight="800"
              fontStyle="italic"
              fontSize="44"
              letterSpacing="5"
            >
              CITY
            </text>
            {/* Impact chevron accent */}
            <polygon points="366,34 402,34 388,68 416,68 358,116 374,78 348,78" fill="#10B981" stroke="#064E3B" strokeWidth="2.5" />
          </svg>

          <p className="text-base sm:text-lg text-slate-200/95 leading-relaxed max-w-md mb-5 font-medium">
            Tear through city blocks, flatten storefronts and small traffic for cash, outrun police interceptors, and avoid armored billionaire exotics.
          </p>

          {/* 2D / 3D Mode Selector & Change Map Menu */}
          <div className="flex flex-wrap items-center gap-2.5 mb-5 pointer-events-auto">
            <div
              className="inline-flex items-center gap-1.5 p-1.5 rounded-lg bg-slate-900 border border-slate-700 shadow-md"
              role="group"
              aria-label="Select Graphics Mode"
            >
              <span className="px-2.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                Mode
              </span>
              <button
                type="button"
                data-testid="mode-2d-btn"
                aria-pressed={viewMode === '2d'}
                onClick={() => onSelectViewMode('2d')}
                className={`px-4 py-2 rounded-md text-sm font-extrabold uppercase tracking-wide transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 ${
                  viewMode === '2d'
                    ? 'bg-[#FACC15] text-slate-950 shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                2D
              </button>
              <button
                type="button"
                data-testid="mode-3d-btn"
                aria-pressed={viewMode === '3d'}
                onClick={() => onSelectViewMode('3d')}
                className={`px-4 py-2 rounded-md text-sm font-extrabold uppercase tracking-wide transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${
                  viewMode === '3d'
                    ? 'bg-sky-400 text-slate-950 shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                3D
              </button>
            </div>

            <button
              type="button"
              data-testid="map-cycle-btn"
              onClick={onCycleMap}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-sm font-bold text-slate-100 shadow-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <span
                className="w-2.5 h-2.5 rounded-sm border border-white/40 shrink-0"
                style={{ backgroundColor: mapTheme.lineColor }}
                aria-hidden="true"
              />
              <span>Map: {mapTheme.name}</span>
            </button>

            <button
              type="button"
              data-testid="title-camera-btn"
              aria-pressed={viewMode === '3d' && cameraMode === 'first'}
              onClick={onToggleCameraMode}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-bold shadow-md transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === '3d' && cameraMode === 'first'
                  ? 'bg-sky-400 text-slate-950 border-sky-300'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-100'
              }`}
            >
              <span>
                Cam: {viewMode === '3d' && cameraMode === 'first' ? '1st Person' : '3rd Person'}
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3.5 pointer-events-auto">
            <button
              type="button"
              data-start="true"
              onClick={onStart}
              className="px-7 py-3.5 rounded-lg bg-[#FACC15] hover:bg-[#FDE047] active:translate-y-0.5 text-slate-950 font-display text-2xl font-extrabold tracking-wide uppercase shadow-[0_4px_0_#A16207] transition-transform cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
            >
              Start Driving
            </button>

            <button
              type="button"
              onClick={onOpenShop}
              className="px-5 py-3.5 rounded-lg bg-[#1C2331] hover:bg-[#263043] active:translate-y-0.5 text-slate-100 border border-slate-600 font-semibold text-base transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300"
            >
              Car Shop ({ownedCount}/{totalCars})
            </button>
          </div>
        </div>
      </div>

      {/* Single flat control-hint line in bottom safe margin */}
      <div className="relative z-10 px-6 sm:px-12 lg:px-20 pb-6">
        <p className="text-xs sm:text-sm text-slate-400 tracking-wide font-medium">
          WASD / Arrows Drive · Space Drift · Shift Boost · C Camera · G Shop · Esc Pause
        </p>
      </div>
    </div>
  );
};
