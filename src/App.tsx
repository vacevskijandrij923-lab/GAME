import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminPanelModal } from './components/AdminPanelModal';
import { FirstPersonCockpit } from './components/FirstPersonCockpit';
import { GameHud } from './components/GameHud';
import { ShopModal } from './components/ShopModal';
import { StatusModal } from './components/StatusModal';
import { TitleScreen } from './components/TitleScreen';
import { soundEngine } from './game/audio';
import { CAR_CATALOG, getCarSpec } from './game/catalog';
import { getNextMapId, normalizeMapId } from './game/cityGen';
import { GameEngine } from './game/engine';
import { GameEngine3D } from './game/engine3d';
import {
  clampAdminMoney,
  getShopCarCounts,
  normalizeCameraMode,
  normalizeViewMode,
  purchaseAllFromShop,
  purchaseCarFromShop,
  verifyOwnerPassphrase,
} from './game/physics';
import {
  CameraMode,
  GamePhase,
  HudSnapshot,
  MapId,
  RunSummary,
  ViewMode,
} from './game/types';

const SAVE_KEY = 'crunch_city_save_v1';
const VIEW_MODE_KEY = 'crunch_city_view_mode';
const CAMERA_MODE_KEY = 'crunch_city_camera_mode';
const MAP_ID_KEY = 'crunch_city_map_id';
const ADMIN_VERIFIED_KEY = 'crunch_city_owner_verified_v1';
const ADMIN_PIN_KEY = 'crunch_city_owner_pin_v1';

interface SavedProgress {
  money: number;
  ownedCarIds: string[];
  equippedCarId: string;
}

function loadSavedProgress(): SavedProgress {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedProgress>;
      const owned =
        Array.isArray(parsed.ownedCarIds) && parsed.ownedCarIds.length > 0
          ? parsed.ownedCarIds.filter((id) => CAR_CATALOG.some((c) => c.id === id))
          : ['rusty-hatch'];
      if (!owned.includes('rusty-hatch')) owned.unshift('rusty-hatch');
      const equipped =
        typeof parsed.equippedCarId === 'string' && owned.includes(parsed.equippedCarId)
          ? parsed.equippedCarId
          : owned[0];
      const money =
        typeof parsed.money === 'number' && Number.isFinite(parsed.money) && parsed.money >= 0
          ? Math.round(parsed.money)
          : 0;
      return { money, ownedCarIds: owned, equippedCarId: equipped };
    }
  } catch {
    // Ignore storage errors
  }
  return {
    money: 0,
    ownedCarIds: ['rusty-hatch'],
    equippedCarId: 'rusty-hatch',
  };
}

function loadInitialViewMode(): ViewMode {
  if (typeof window !== 'undefined') {
    const paramMode = new URLSearchParams(window.location.search).get('mode');
    if (paramMode === '2d' || paramMode === '3d') {
      return paramMode;
    }
    try {
      return normalizeViewMode(localStorage.getItem(VIEW_MODE_KEY));
    } catch {
      // Ignore storage errors
    }
  }
  return '2d';
}

function loadInitialMapId(): MapId {
  if (typeof window !== 'undefined') {
    const paramMap = new URLSearchParams(window.location.search).get('map');
    if (paramMap) {
      return normalizeMapId(paramMap);
    }
    try {
      return normalizeMapId(localStorage.getItem(MAP_ID_KEY));
    } catch {
      // Ignore storage errors
    }
  }
  return 'downtown';
}

function loadInitialCameraMode(): CameraMode {
  if (typeof window !== 'undefined') {
    const paramCam = new URLSearchParams(window.location.search).get('cam');
    if (paramCam === 'first' || paramCam === 'third') {
      return paramCam;
    }
    try {
      return normalizeCameraMode(localStorage.getItem(CAMERA_MODE_KEY));
    } catch {
      // Ignore storage errors
    }
  }
  return 'third';
}

export default function App() {
  const initialSave = useRef<SavedProgress>(loadSavedProgress());
  const isAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [cameraMode, setCameraMode] = useState<CameraMode>(loadInitialCameraMode);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const initialView = loadInitialViewMode();
    if (loadInitialCameraMode() === 'first' && initialView !== '3d') {
      return '3d';
    }
    return initialView;
  });
  const [mapId, setMapId] = useState<MapId>(loadInitialMapId);
  const [phase, setPhase] = useState<GamePhase>(isAutostart ? 'playing' : 'title');
  const [shopOpen, setShopOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [isAdminVerified, setIsAdminVerified] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ADMIN_VERIFIED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [ownerCustomPin, setOwnerCustomPin] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ADMIN_PIN_KEY);
    } catch {
      return null;
    }
  });
  const [money, setMoney] = useState<number>(initialSave.current.money);
  const [ownedCarIds, setOwnedCarIds] = useState<string[]>(initialSave.current.ownedCarIds);
  const [equippedCarId, setEquippedCarId] = useState<string>(initialSave.current.equippedCarId);
  const [isMuted, setIsMuted] = useState(false);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);

  const starterSpec = getCarSpec(initialSave.current.equippedCarId);
  const [hud, setHud] = useState<HudSnapshot>({
    money: initialSave.current.money,
    runMoney: 0,
    hp: starterSpec.maxHp,
    maxHp: starterSpec.maxHp,
    ghostHp: starterSpec.maxHp,
    speedMph: 0,
    boostFuel: 100,
    wantedStars: 0,
    comboCount: 0,
    comboMultiplier: 1,
    comboTimerRatio: 0,
    buildingsCrushed: 0,
    carsCrushed: 0,
    exoticsBounced: 0,
    policeSmashed: 0,
    currentCarName: starterSpec.name,
    bannerAlert: null,
  });

  const canvas2dRef = useRef<HTMLCanvasElement | null>(null);
  const mount3dRef = useRef<HTMLDivElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | GameEngine3D | null>(null);
  const phaseBeforeShopRef = useRef<GamePhase>('title');
  const phaseBeforeAdminRef = useRef<GamePhase>('title');

  const latestStateRef = useRef({
    phase: isAutostart ? ('playing' as GamePhase) : ('title' as GamePhase),
    money: initialSave.current.money,
    equippedCarId: initialSave.current.equippedCarId,
    mapId,
    cameraMode,
  });

  useEffect(() => {
    latestStateRef.current = { phase, money, equippedCarId, mapId, cameraMode };
    document.body.dataset.state = phase;
  }, [phase, money, equippedCarId, mapId, cameraMode]);

  useEffect(() => {
    document.body.dataset.mode = viewMode;
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      // Ignore storage errors
    }
  }, [viewMode]);

  useEffect(() => {
    document.body.dataset.camera = cameraMode;
    try {
      localStorage.setItem(CAMERA_MODE_KEY, cameraMode);
    } catch {
      // Ignore storage errors
    }
    engineRef.current?.setCameraMode(cameraMode);
  }, [cameraMode]);

  useEffect(() => {
    document.body.dataset.map = mapId;
    try {
      localStorage.setItem(MAP_ID_KEY, mapId);
    } catch {
      // Ignore storage errors
    }
    engineRef.current?.setMap(mapId);
  }, [mapId]);

  // Persist bank money and unlocked cars
  useEffect(() => {
    try {
      const payload: SavedProgress = {
        money,
        ownedCarIds,
        equippedCarId,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage errors
    }
  }, [money, ownedCarIds, equippedCarId]);

  const handleMoneyEarned = useCallback((amount: number) => {
    setMoney((prev) => prev + amount);
  }, []);

  const handleGameOver = useCallback((summary: RunSummary) => {
    setRunSummary(summary);
    setPhase('gameover');
    document.body.dataset.state = 'gameover';
  }, []);

  const callbacksRef = useRef({
    onHudUpdate: (snap: HudSnapshot) => setHud(snap),
    onMoneyEarned: handleMoneyEarned,
    onGameOver: handleGameOver,
  });

  useEffect(() => {
    callbacksRef.current = {
      onHudUpdate: (snap: HudSnapshot) => setHud(snap),
      onMoneyEarned: handleMoneyEarned,
      onGameOver: handleGameOver,
    };
  }, [handleMoneyEarned, handleGameOver]);

  const focusCanvas = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (viewMode === '3d' && engineRef.current instanceof GameEngine3D) {
      engineRef.current.focusCanvas();
    } else {
      canvas2dRef.current?.focus();
    }
  }, [viewMode]);

  // Mount either the 2D Canvas Engine or the 3D Three.js Engine depending on viewMode
  useEffect(() => {
    const callbacks = {
      onHudUpdate: (snap: HudSnapshot) => callbacksRef.current.onHudUpdate(snap),
      onMoneyEarned: (amt: number) => callbacksRef.current.onMoneyEarned(amt),
      onGameOver: (sum: RunSummary) => callbacksRef.current.onGameOver(sum),
    };

    const current = latestStateRef.current;
    let engine: GameEngine | GameEngine3D | null = null;

    if (viewMode === '2d') {
      const canvas = canvas2dRef.current;
      if (!canvas) return;
      engine = new GameEngine(
        canvas,
        callbacks,
        current.money,
        current.equippedCarId,
        current.mapId
      );
    } else {
      const container = mount3dRef.current;
      if (!container) return;
      engine = new GameEngine3D(
        container,
        callbacks,
        current.money,
        current.equippedCarId,
        current.mapId,
        current.cameraMode
      );
    }

    engineRef.current = engine;
    if (minimapCanvasRef.current) {
      engine.setMinimapCanvas(minimapCanvasRef.current);
    }

    if (current.phase === 'playing') {
      document.body.dataset.state = 'playing';
      engine.startNewRun(current.equippedCarId);
      if (minimapCanvasRef.current) {
        engine.setMinimapCanvas(minimapCanvasRef.current);
      }
    } else if (current.phase === 'paused') {
      engine.startNewRun(current.equippedCarId);
      engine.setPhase('paused');
      if (minimapCanvasRef.current) {
        engine.setMinimapCanvas(minimapCanvasRef.current);
      }
    } else {
      engine.setPhase(current.phase);
    }
    engine.startLoop();

    if (current.phase === 'playing') {
      if (engine instanceof GameEngine3D) {
        engine.focusCanvas();
      } else {
        canvas2dRef.current?.focus();
      }
    }

    return () => {
      engine?.destroy();
      engineRef.current = null;
    };
  }, [viewMode]);

  const handleSelectViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (mode === '2d') {
      setCameraMode('third');
    }
  }, []);

  const handleToggleCameraMode = useCallback(() => {
    if (viewMode === '2d') {
      setViewMode('3d');
      setCameraMode('first');
      return;
    }
    setCameraMode((prev) => (prev === 'third' ? 'first' : 'third'));
  }, [viewMode]);

  const handleCycleMap = useCallback(() => {
    setMapId((prev) => getNextMapId(prev));
  }, []);

  const startGame = useCallback(() => {
    setShopOpen(false);
    setAdminOpen(false);
    setRunSummary(null);
    setPhase('playing');
    document.body.dataset.state = 'playing';
    engineRef.current?.startNewRun(equippedCarId);
    focusCanvas();
  }, [equippedCarId, focusCanvas]);

  const openShop = useCallback(() => {
    phaseBeforeShopRef.current = phase;
    if (phase === 'playing' || phase === 'title') {
      engineRef.current?.setPhase('paused');
    }
    setAdminOpen(false);
    setShopOpen(true);
  }, [phase]);

  const closeShop = useCallback(() => {
    setShopOpen(false);
    const prev = phaseBeforeShopRef.current;
    if (prev === 'playing') {
      setPhase('playing');
      document.body.dataset.state = 'playing';
      engineRef.current?.setPhase('playing');
      focusCanvas();
    } else if (prev === 'title') {
      engineRef.current?.setPhase('title');
    }
  }, [focusCanvas]);

  const openAdmin = useCallback(() => {
    phaseBeforeAdminRef.current = phase;
    if (phase === 'playing' || phase === 'title') {
      engineRef.current?.setPhase('paused');
    }
    setShopOpen(false);
    setAdminOpen(true);
  }, [phase]);

  const closeAdmin = useCallback(() => {
    setAdminOpen(false);
    const prev = phaseBeforeAdminRef.current;
    if (prev === 'playing') {
      setPhase('playing');
      document.body.dataset.state = 'playing';
      engineRef.current?.setPhase('playing');
      focusCanvas();
    } else if (prev === 'title') {
      engineRef.current?.setPhase('title');
    }
  }, [focusCanvas]);

  const pauseGame = useCallback(() => {
    if (phase !== 'playing') return;
    setPhase('paused');
    document.body.dataset.state = 'paused';
    engineRef.current?.setPhase('paused');
  }, [phase]);

  const resumeGame = useCallback(() => {
    if (phase !== 'paused') return;
    setPhase('playing');
    document.body.dataset.state = 'playing';
    engineRef.current?.setPhase('playing');
    focusCanvas();
  }, [phase, focusCanvas]);

  const backToTitle = useCallback(() => {
    setShopOpen(false);
    setRunSummary(null);
    setPhase('title');
    document.body.dataset.state = 'title';
    engineRef.current?.setPhase('title');
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  const handleBuyCar = useCallback(
    (carId: string) => {
      const result = purchaseCarFromShop(money, ownedCarIds, equippedCarId, carId);
      if (!result.success) return;
      setMoney(result.newMoney);
      setOwnedCarIds(result.newOwnedIds);
      setEquippedCarId(result.equippedCarId);
      engineRef.current?.setTotalBankMoney(result.newMoney);
      engineRef.current?.equipCar(result.equippedCarId);
      soundEngine.playPurchase();
    },
    [money, ownedCarIds, equippedCarId]
  );

  const handleEquipCar = useCallback(
    (carId: string) => {
      if (!ownedCarIds.includes(carId)) return;
      setEquippedCarId(carId);
      engineRef.current?.equipCar(carId);
      soundEngine.playPickup();
    },
    [ownedCarIds]
  );

  const handleBuyAllCars = useCallback(() => {
    const result = purchaseAllFromShop(money, ownedCarIds, equippedCarId);
    if (!result.success) return;
    setMoney(result.newMoney);
    setOwnedCarIds(result.newOwnedIds);
    setEquippedCarId(result.equippedCarId);
    engineRef.current?.setTotalBankMoney(result.newMoney);
    engineRef.current?.equipCar(result.equippedCarId);
    soundEngine.playPurchase();
  }, [money, ownedCarIds, equippedCarId]);

  const handleVerifyAdminPassphrase = useCallback(
    (passphrase: string): boolean => {
      const ok = verifyOwnerPassphrase(passphrase, ownerCustomPin);
      if (ok) {
        setIsAdminVerified(true);
        try {
          localStorage.setItem(ADMIN_VERIFIED_KEY, '1');
        } catch {
          // Ignore storage errors
        }
      }
      return ok;
    },
    [ownerCustomPin]
  );

  const handleLockAdmin = useCallback(() => {
    setIsAdminVerified(false);
    try {
      localStorage.removeItem(ADMIN_VERIFIED_KEY);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleUpdateCustomPin = useCallback((newPin: string) => {
    const trimmed = newPin.trim();
    setOwnerCustomPin(trimmed);
    try {
      localStorage.setItem(ADMIN_PIN_KEY, trimmed);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleAdminSetMoney = useCallback((amount: number) => {
    const clamped = clampAdminMoney(amount);
    setMoney(clamped);
    engineRef.current?.setTotalBankMoney(clamped);
  }, []);

  const handleAdminAddMoney = useCallback((delta: number) => {
    setMoney((prev) => {
      const clamped = clampAdminMoney(prev + delta);
      engineRef.current?.setTotalBankMoney(clamped);
      return clamped;
    });
  }, []);

  const handleAdminRepairArmor = useCallback(() => {
    engineRef.current?.repairArmor();
  }, []);

  const handleAdminClearWanted = useCallback(() => {
    engineRef.current?.clearWantedStars();
  }, []);

  const handleAdminUnlockAllCars = useCallback(() => {
    setOwnedCarIds(CAR_CATALOG.map((c) => c.id));
    soundEngine.playPurchase();
  }, []);

  const handleBindMinimap = useCallback((el: HTMLCanvasElement | null) => {
    minimapCanvasRef.current = el;
    engineRef.current?.setMinimapCanvas(el);
  }, []);

  const handleTouchControl = useCallback(
    (
      key: 'up' | 'down' | 'left' | 'right' | 'drift' | 'boost',
      active: boolean
    ) => {
      engineRef.current?.setTouchControl(key, active);
    },
    []
  );

  // Global keyboard shortcuts (Start, Shop, Admin, Pause, Mute)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isTyping =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;

      if (adminOpen) {
        if (e.code === 'Escape' || (e.code === 'F8' && !isTyping)) {
          e.preventDefault();
          closeAdmin();
        }
        return;
      }

      if (shopOpen) {
        if (e.code === 'Escape' || (e.code === 'KeyG' && !isTyping)) {
          e.preventDefault();
          closeShop();
        }
        return;
      }

      if (isTyping) return;

      if (e.code === 'F8') {
        e.preventDefault();
        openAdmin();
        return;
      }

      if (phase === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startGame();
        } else if (e.code === 'KeyG') {
          e.preventDefault();
          openShop();
        } else if (e.code === 'KeyC') {
          e.preventDefault();
          handleToggleCameraMode();
        }
        return;
      }

      if (phase === 'playing') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          pauseGame();
        } else if (e.code === 'KeyG') {
          e.preventDefault();
          openShop();
        } else if (e.code === 'KeyC') {
          e.preventDefault();
          handleToggleCameraMode();
        } else if (e.code === 'KeyM') {
          e.preventDefault();
          toggleMute();
        }
      } else if (phase === 'paused') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          resumeGame();
        } else if (e.code === 'KeyG') {
          e.preventDefault();
          openShop();
        } else if (e.code === 'KeyC') {
          e.preventDefault();
          handleToggleCameraMode();
        }
      } else if (phase === 'gameover') {
        if (e.code === 'Enter') {
          e.preventDefault();
          startGame();
        } else if (e.code === 'KeyG') {
          e.preventDefault();
          openShop();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    phase,
    shopOpen,
    adminOpen,
    startGame,
    openShop,
    closeShop,
    openAdmin,
    closeAdmin,
    pauseGame,
    resumeGame,
    toggleMute,
    handleToggleCameraMode,
  ]);

  const { ownedCount, totalCount } = getShopCarCounts(ownedCarIds);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#12151c]">
      {/* Isolated Viewport Mount: separate elements so 2D and WebGL2 contexts never collide */}
      <div className="fixed inset-0">
        {viewMode === '2d' ? (
          <canvas
            key="viewport-2d"
            ref={canvas2dRef}
            data-testid="game-canvas"
            tabIndex={0}
            className="w-full h-full block outline-none"
          />
        ) : (
          <div key="viewport-3d" ref={mount3dRef} className="w-full h-full" />
        )}
      </div>

      {/* First Person Cockpit Overlay in 3D First-Person Mode */}
      {phase === 'playing' &&
        viewMode === '3d' &&
        cameraMode === 'first' &&
        !shopOpen &&
        !adminOpen && (
          <FirstPersonCockpit
            steerInput={hud.steerInput}
            speedMph={hud.speedMph}
          />
        )}

      {/* Title Screen */}
      {phase === 'title' && !shopOpen && !adminOpen && (
        <TitleScreen
          money={money}
          ownedCount={ownedCount}
          totalCars={totalCount}
          viewMode={viewMode}
          cameraMode={cameraMode}
          mapId={mapId}
          onSelectViewMode={handleSelectViewMode}
          onToggleCameraMode={handleToggleCameraMode}
          onCycleMap={handleCycleMap}
          onStart={startGame}
          onOpenShop={openShop}
          onOpenAdmin={openAdmin}
        />
      )}

      {/* Playing HUD */}
      {phase === 'playing' && !shopOpen && !adminOpen && (
        <GameHud
          hud={hud}
          ownedCars={ownedCount}
          totalCars={totalCount}
          isMuted={isMuted}
          viewMode={viewMode}
          cameraMode={cameraMode}
          mapId={mapId}
          onSelectViewMode={handleSelectViewMode}
          onToggleCameraMode={handleToggleCameraMode}
          onCycleMap={handleCycleMap}
          onOpenShop={openShop}
          onOpenAdmin={openAdmin}
          onToggleMute={toggleMute}
          onPause={pauseGame}
          onTouchControl={handleTouchControl}
          onBindMinimap={handleBindMinimap}
        />
      )}

      {/* Pause or Game Over Modal */}
      {(phase === 'paused' || phase === 'gameover') && !shopOpen && !adminOpen && (
        <StatusModal
          mode={phase}
          summary={runSummary}
          ownedCars={ownedCount}
          totalCars={totalCount}
          viewMode={viewMode}
          cameraMode={cameraMode}
          mapId={mapId}
          onSelectViewMode={handleSelectViewMode}
          onToggleCameraMode={handleToggleCameraMode}
          onCycleMap={handleCycleMap}
          onResume={resumeGame}
          onRestart={startGame}
          onOpenShop={openShop}
          onBackToTitle={backToTitle}
        />
      )}

      {/* Car Shop Modal */}
      {shopOpen && (
        <ShopModal
          money={money}
          ownedCarIds={ownedCarIds}
          equippedCarId={equippedCarId}
          onBuyCar={handleBuyCar}
          onBuyAll={handleBuyAllCars}
          onEquipCar={handleEquipCar}
          onClose={closeShop}
        />
      )}

      {/* Owner-Only Admin Panel Modal */}
      {adminOpen && (
        <AdminPanelModal
          money={money}
          ownedCars={ownedCount}
          totalCars={totalCount}
          isVerified={isAdminVerified}
          hasCustomPin={Boolean(ownerCustomPin)}
          onVerifyPassphrase={handleVerifyAdminPassphrase}
          onLockAdmin={handleLockAdmin}
          onUpdateCustomPin={handleUpdateCustomPin}
          onSetMoney={handleAdminSetMoney}
          onAddMoney={handleAdminAddMoney}
          onRepairArmor={handleAdminRepairArmor}
          onClearWanted={handleAdminClearWanted}
          onUnlockAllCars={handleAdminUnlockAllCars}
          onClose={closeAdmin}
        />
      )}
    </main>
  );
}
