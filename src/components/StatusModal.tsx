import React from 'react';
import { getMapTheme } from '../game/cityGen';
import { CameraMode, MapId, RunSummary, ViewMode } from '../game/types';

interface StatusModalProps {
  mode: 'paused' | 'gameover';
  summary: RunSummary | null;
  ownedCars: number;
  totalCars: number;
  viewMode: ViewMode;
  cameraMode: CameraMode;
  mapId: MapId;
  onSelectViewMode: (mode: ViewMode) => void;
  onToggleCameraMode: () => void;
  onCycleMap: () => void;
  onResume: () => void;
  onRestart: () => void;
  onOpenShop: () => void;
  onBackToTitle: () => void;
}

export const StatusModal: React.FC<StatusModalProps> = ({
  mode,
  summary,
  ownedCars,
  totalCars,
  viewMode,
  cameraMode,
  mapId,
  onSelectViewMode,
  onToggleCameraMode,
  onCycleMap,
  onResume,
  onRestart,
  onOpenShop,
  onBackToTitle,
}) => {
  const isGameOver = mode === 'gameover' && summary !== null;
  const mapTheme = getMapTheme(mapId);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#0B0E14]/84"
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-modal-title"
    >
      <div className="w-full max-w-md rounded-xl bg-[#151B26] border border-slate-700 p-6 sm:p-7 shadow-2xl">
        <h2
          id="status-modal-title"
          className="font-display text-4xl font-extrabold uppercase tracking-wide text-slate-50 mb-1"
        >
          {isGameOver
            ? summary.reason === 'busted'
              ? 'Busted & Wrecked'
              : 'Car Wrecked'
            : 'Game Paused'}
        </h2>
        <p className="text-sm text-slate-400 mb-6">
          {isGameOver
            ? 'All cash earned stays in your bank. Grab a tougher ride in the shop!'
            : 'Catch your breath or swap rides before hitting the streets.'}
        </p>

        {isGameOver && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="p-3 rounded-lg bg-[#10151E] border border-slate-700/80">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Run Cash
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-emerald-400 mt-0.5">
                +${summary.runMoney.toLocaleString()}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#10151E] border border-slate-700/80">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Buildings Crushed
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-amber-400 mt-0.5">
                {summary.buildingsCrushed}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#10151E] border border-slate-700/80">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Cars Smashed
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-sky-400 mt-0.5">
                {summary.carsCrushed}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#10151E] border border-slate-700/80">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Best Combo
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-slate-100 mt-0.5">
                {summary.bestCombo}x
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {!isGameOver ? (
            <button
              type="button"
              onClick={onResume}
              className="w-full py-3 rounded-lg bg-[#FACC15] hover:bg-[#FDE047] text-slate-950 font-display text-xl font-extrabold uppercase tracking-wide cursor-pointer"
            >
              Resume Driving
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onRestart}
              className="w-full py-3 rounded-lg bg-[#FACC15] hover:bg-[#FDE047] text-slate-950 font-display text-xl font-extrabold uppercase tracking-wide cursor-pointer"
            >
              Drive Again
            </button>
          )}

          <button
            type="button"
            onClick={onOpenShop}
            className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm cursor-pointer"
          >
            Open Car Shop ({ownedCars}/{totalCars})
          </button>

          <div
            className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-slate-900 border border-slate-700"
            role="group"
            aria-label="Graphics Mode"
          >
            <button
              type="button"
              aria-pressed={viewMode === '2d'}
              onClick={() => onSelectViewMode('2d')}
              className={`py-2 rounded-md text-xs font-extrabold uppercase tracking-wide cursor-pointer ${
                viewMode === '2d'
                  ? 'bg-[#FACC15] text-slate-950'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              2D Mode
            </button>
            <button
              type="button"
              aria-pressed={viewMode === '3d'}
              onClick={() => onSelectViewMode('3d')}
              className={`py-2 rounded-md text-xs font-extrabold uppercase tracking-wide cursor-pointer ${
                viewMode === '3d'
                  ? 'bg-sky-400 text-slate-950'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              3D Mode
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              data-testid="status-map-btn"
              onClick={onCycleMap}
              className="py-2.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-100 font-semibold text-xs border border-slate-600 cursor-pointer flex items-center justify-center gap-1.5"
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
              data-testid="status-camera-btn"
              aria-pressed={viewMode === '3d' && cameraMode === 'first'}
              onClick={onToggleCameraMode}
              className={`py-2.5 px-3 rounded-lg font-semibold text-xs border cursor-pointer ${
                viewMode === '3d' && cameraMode === 'first'
                  ? 'bg-sky-400 text-slate-950 border-sky-300 font-bold'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-100 border-slate-600'
              }`}
            >
              Cam: {viewMode === '3d' && cameraMode === 'first' ? '1st Person' : '3rd Person'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {!isGameOver && (
              <button
                type="button"
                onClick={onRestart}
                className="py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm border border-slate-600 cursor-pointer"
              >
                Restart Run
              </button>
            )}
            <button
              type="button"
              onClick={onBackToTitle}
              className={`py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm border border-slate-600 cursor-pointer ${
                isGameOver ? 'col-span-2' : ''
              }`}
            >
              Main Title
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
