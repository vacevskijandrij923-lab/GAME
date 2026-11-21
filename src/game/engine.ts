import { soundEngine } from './audio';
import {
  CAR_CATALOG,
  TRAFFIC_ARCHETYPES,
  getCarSpec,
} from './catalog';
import {
  createCityMap,
  generateCityBuildingsAndProps,
} from './cityGen';
import {
  calculateCrashReward,
  circleIntersectsRect,
  computeWantedStars,
  evaluateCrashOutcome,
  getComboMultiplier,
} from './physics';
import { renderGameWorld, renderMinimap } from './renderer';
import {
  BuildingEntity,
  CityMapData,
  FloatingPopup,
  GamePhase,
  HudSnapshot,
  MapId,
  NpcPedestrian,
  Particle,
  PickupItem,
  PlayerState,
  PoliceUnit,
  RunSummary,
  SkidMark,
  StreetProp,
  TrafficCar,
} from './types';

const PARTICLE_POOL_SIZE = 380;
const MAX_SKID_MARKS = 280;

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onMoneyEarned: (amount: number) => void;
  onGameOver: (summary: RunSummary) => void;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private minimapCanvas: HTMLCanvasElement | null = null;
  private callbacks: EngineCallbacks;

  private map: CityMapData;
  private buildings: BuildingEntity[] = [];
  private props: StreetProp[] = [];
  private traffic: TrafficCar[] = [];
  private police: PoliceUnit[] = [];
  private npcs: NpcPedestrian[] = [];
  private pickups: PickupItem[] = [];
  private skidMarks: SkidMark[] = [];
  private particles: Particle[] = [];
  private particleCursor = 0;
  private popups: FloatingPopup[] = [];

  private phase: GamePhase = 'title';
  private player: PlayerState;
  private totalBankMoney = 0;
  private runMoney = 0;
  private buildingsCrushed = 0;
  private carsCrushed = 0;
  private exoticsBounced = 0;
  private policeSmashed = 0;
  private comboCount = 0;
  private comboTimer = 0;
  private bestCombo = 0;
  private wantedHeat = 0;
  private bannerAlert: string | null = null;
  private bannerTimer = 0;

  private cameraX = 0;
  private cameraY = 0;
  private trauma = 0;
  private hitstopTimer = 0;
  private deathDelayTimer = 0;
  private simTime = 0;
  private hudEmitTimer = 0;
  private minimapTimer = 0;
  private lastHudKey = '';
  private pickupSpawnTimer = 4;

  private nextEntityId = 1;
  private rafId: number | null = null;
  private lastTimestamp = 0;
  private needsFrozenRender = true;

  private heldKeys = new Set<string>();
  private touchControls = {
    up: false,
    down: false,
    left: false,
    right: false,
    drift: false,
    boost: false,
  };

  private resizeObserver: ResizeObserver | null = null;
  private viewportW = 1280;
  private viewportH = 720;

  constructor(
    canvas: HTMLCanvasElement,
    callbacks: EngineCallbacks,
    initialMoney: number,
    initialCarId: string,
    initialMapId: MapId = 'downtown'
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not initialize 2D canvas context');
    }
    this.ctx = context;
    this.callbacks = callbacks;
    this.totalBankMoney = initialMoney;

    this.map = createCityMap(initialMapId);
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 4,
        rotation: 0,
        rotSpeed: 0,
        life: 0,
        maxLife: 1,
        color: '#fff',
        shape: 'square',
      });
    }

    const spec = getCarSpec(initialCarId);
    this.player = {
      x: this.map.spawnPoint.x,
      y: this.map.spawnPoint.y,
      vx: 0,
      vy: 0,
      angle: this.map.spawnPoint.angle,
      angularVel: 0,
      hp: spec.maxHp,
      maxHp: spec.maxHp,
      ghostHp: spec.maxHp,
      boostFuel: 100,
      isBoosting: false,
      isDrifting: false,
      hitFlashTimer: 0,
      invulnTimer: 0.8,
      carId: spec.id,
    };

    this.cameraX = this.player.x;
    this.cameraY = this.player.y;

    this.resetWorldEntities();
    this.attachListeners();
    this.handleResize();
    this.emitHud();
  }

  public setMinimapCanvas(canvas: HTMLCanvasElement | null) {
    this.minimapCanvas = canvas;
    this.minimapTimer = 0;
    if (canvas && this.phase === 'playing') {
      const mCtx = canvas.getContext('2d');
      if (mCtx) {
        renderMinimap(
          mCtx,
          canvas.width,
          this.map,
          this.player,
          this.police,
          this.pickups
        );
      }
    }
  }

  public setPhase(phase: GamePhase) {
    this.phase = phase;
    this.needsFrozenRender = true;
    if (phase !== 'playing') {
      this.heldKeys.clear();
      this.resetTouchControls();
    }
  }

  public setTotalBankMoney(money: number) {
    this.totalBankMoney = money;
    this.emitHud();
  }

  public repairArmor() {
    this.player.hp = this.player.maxHp;
    this.player.ghostHp = this.player.maxHp;
    this.emitHud();
  }

  public clearWantedStars() {
    this.wantedHeat = 0;
    this.emitHud();
  }

  public setCameraMode(_mode: 'third' | 'first') {
    // 2D mode renders top-down; first-person engages in 3D mode.
  }

  public setMap(mapId: MapId) {
    if (this.map.mapId === mapId) return;
    this.map = createCityMap(mapId);
    this.resetWorldEntities();
    this.player.x = this.map.spawnPoint.x;
    this.player.y = this.map.spawnPoint.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.angle = this.map.spawnPoint.angle;
    this.cameraX = this.player.x;
    this.cameraY = this.player.y;
    this.needsFrozenRender = true;
    this.emitHud();
  }

  public equipCar(carId: string) {
    const spec = getCarSpec(carId);
    const hpRatio = this.player.maxHp > 0 ? this.player.hp / this.player.maxHp : 1;
    this.player.carId = spec.id;
    this.player.maxHp = spec.maxHp;
    this.player.hp = Math.max(Math.round(spec.maxHp * Math.max(0.6, hpRatio)), spec.maxHp * 0.6);
    this.player.ghostHp = this.player.hp;
    this.emitHud();
  }

  public startNewRun(carId: string) {
    const spec = getCarSpec(carId);
    this.resetWorldEntities();

    this.player = {
      x: this.map.spawnPoint.x,
      y: this.map.spawnPoint.y,
      vx: 0,
      vy: 0,
      angle: this.map.spawnPoint.angle,
      angularVel: 0,
      hp: spec.maxHp,
      maxHp: spec.maxHp,
      ghostHp: spec.maxHp,
      boostFuel: 100,
      isBoosting: false,
      isDrifting: false,
      hitFlashTimer: 0,
      invulnTimer: 1.0,
      carId: spec.id,
    };

    this.runMoney = 0;
    this.buildingsCrushed = 0;
    this.carsCrushed = 0;
    this.exoticsBounced = 0;
    this.policeSmashed = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.bestCombo = 0;
    this.wantedHeat = 0;
    this.bannerAlert = null;
    this.bannerTimer = 0;
    this.deathDelayTimer = 0;
    this.hitstopTimer = 0;
    this.trauma = 0;

    this.cameraX = this.player.x;
    this.cameraY = this.player.y;
    this.heldKeys.clear();
    this.resetTouchControls();
    this.phase = 'playing';
    this.emitHud();
  }

  public setTouchControl(
    key: keyof typeof this.touchControls,
    active: boolean
  ) {
    this.touchControls[key] = active;
  }

  private resetTouchControls() {
    this.touchControls = {
      up: false,
      down: false,
      left: false,
      right: false,
      drift: false,
      boost: false,
    };
  }

  private resetWorldEntities() {
    const generated = generateCityBuildingsAndProps(this.map);
    this.buildings = generated.buildings;
    this.props = generated.props;
    this.traffic = [];
    this.police = [];
    this.npcs = [];
    this.pickups = [];
    this.skidMarks = [];
    this.popups = [];
    for (const p of this.particles) p.active = false;

    // Spawn 95 road traffic cars (mix of easy small cars, medium sedans, and uncrushable exotics)
    for (let i = 0; i < 95; i++) {
      this.spawnTrafficCar(true);
    }

    // Spawn initial patrol police units
    for (let i = 0; i < 6; i++) {
      this.spawnPoliceUnit('interceptor');
    }

    // Spawn 140 NPC pedestrians on sidewalks
    for (let i = 0; i < 140; i++) {
      this.spawnNpc();
    }

    // Spawn initial repair & cash pickups across the mega-city
    for (let i = 0; i < 16; i++) {
      this.spawnPickup('repair');
    }
    for (let i = 0; i < 22; i++) {
      this.spawnPickup('cash');
    }
  }

  private spawnTrafficCar(initial = false) {
    const roll = Math.random();
    let pool = TRAFFIC_ARCHETYPES.filter((t) => t.tier === 'small');
    if (roll > 0.8) {
      pool = TRAFFIC_ARCHETYPES.filter((t) => t.tier === 'exotic');
    } else if (roll > 0.56) {
      pool = TRAFFIC_ARCHETYPES.filter((t) => t.tier === 'medium');
    }
    const archetype = pool[Math.floor(Math.random() * pool.length)];

    const laneAxis: 'h' | 'v' = Math.random() < 0.5 ? 'h' : 'v';
    const laneDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const laneOffset = 30 * laneDir;

    let x = 0;
    let y = 0;
    let angle = 0;

    if (laneAxis === 'h') {
      const roadY =
        this.map.roadCentersY[
          Math.floor(Math.random() * this.map.roadCentersY.length)
        ];
      y = roadY + laneOffset;
      x = Math.random() * (this.map.worldWidth - 200) + 100;
      angle = laneDir === 1 ? 0 : Math.PI;
    } else {
      const roadX =
        this.map.roadCentersX[
          Math.floor(Math.random() * this.map.roadCentersX.length)
        ];
      x = roadX - laneOffset;
      y = Math.random() * (this.map.worldHeight - 200) + 100;
      angle = laneDir === 1 ? Math.PI / 2 : -Math.PI / 2;
    }

    // Keep immediate spawn area clear for player
    if (
      initial &&
      Math.hypot(x - this.map.spawnPoint.x, y - this.map.spawnPoint.y) < 220
    ) {
      x = 200;
      y = this.map.roadCentersY[0] + 30;
    }

    this.traffic.push({
      id: this.nextEntityId++,
      archetype,
      x,
      y,
      vx: Math.cos(angle) * archetype.speed,
      vy: Math.sin(angle) * archetype.speed,
      angle,
      targetSpeed: archetype.speed,
      laneAxis,
      laneDir,
      hp: 1,
      crushed: false,
      crushedTimer: 0,
      hitFlashTimer: 0,
      spinVel: 0,
      deflectCooldown: 0,
    });
  }

  private spawnPoliceUnit(role: 'interceptor' | 'enforcer') {
    // Pick a road intersection away from player
    let x = this.map.roadCentersX[0];
    let y = this.map.roadCentersY[0];
    for (let attempt = 0; attempt < 12; attempt++) {
      const rx =
        this.map.roadCentersX[
          Math.floor(Math.random() * this.map.roadCentersX.length)
        ];
      const ry =
        this.map.roadCentersY[
          Math.floor(Math.random() * this.map.roadCentersY.length)
        ];
      const dist = Math.hypot(rx - this.player.x, ry - this.player.y);
      if (dist > 450) {
        x = rx;
        y = ry;
        break;
      }
    }

    this.police.push({
      id: this.nextEntityId++,
      role,
      x,
      y,
      vx: 0,
      vy: 0,
      angle: Math.random() * Math.PI * 2,
      hp: role === 'enforcer' ? 2 : 1,
      maxHp: role === 'enforcer' ? 2 : 1,
      crushResistance: role === 'enforcer' ? 2.1 : 1.35,
      reward: role === 'enforcer' ? 650 : 450,
      crushed: false,
      crushedTimer: 0,
      hitFlashTimer: 0,
      sirenPhase: Math.random() * Math.PI * 2,
      chargeState: 'patrol',
      chargeTimer: 1.5,
      targetAngle: 0,
      spinVel: 0,
    });
  }

  private spawnNpc() {
    const step = this.map.blockSize + this.map.roadWidth;
    const col = Math.floor(Math.random() * this.map.cols);
    const row = Math.floor(Math.random() * this.map.rows);
    const bx = this.map.roadWidth + col * step;
    const by = this.map.roadWidth + row * step;

    const side = Math.floor(Math.random() * 4);
    let x = bx + 14;
    let y = by + 14;
    let dirAngle = 0;
    if (side === 0) {
      x = bx + 20 + Math.random() * (this.map.blockSize - 40);
      y = by + 13;
      dirAngle = Math.random() < 0.5 ? 0 : Math.PI;
    } else if (side === 1) {
      x = bx + 20 + Math.random() * (this.map.blockSize - 40);
      y = by + this.map.blockSize - 13;
      dirAngle = Math.random() < 0.5 ? 0 : Math.PI;
    } else if (side === 2) {
      x = bx + 13;
      y = by + 20 + Math.random() * (this.map.blockSize - 40);
      dirAngle = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = bx + this.map.blockSize - 13;
      y = by + 20 + Math.random() * (this.map.blockSize - 40);
      dirAngle = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    }

    const shirts = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#A855F7', '#F8FAFC'];
    const hairs = ['#1E293B', '#78350F', '#FDE047', '#9A3412', '#475569'];

    this.npcs.push({
      id: this.nextEntityId++,
      x,
      y,
      vx: 0,
      vy: 0,
      angle: dirAngle,
      walkPhase: Math.random() * Math.PI * 2,
      shirtColor: shirts[Math.floor(Math.random() * shirts.length)],
      hairColor: hairs[Math.floor(Math.random() * hairs.length)],
      state: 'stroll',
      panicTimer: 0,
      tumbleTimer: 0,
      dirAngle,
      droppedCash: false,
    });
  }

  private spawnPickup(kind: 'cash' | 'repair', customX?: number, customY?: number, value?: number) {
    const rx =
      customX ??
      this.map.roadCentersX[
        Math.floor(Math.random() * this.map.roadCentersX.length)
      ];
    const ry =
      customY ??
      this.map.roadCentersY[
        Math.floor(Math.random() * this.map.roadCentersY.length)
      ];
    this.pickups.push({
      id: this.nextEntityId++,
      kind,
      x: rx,
      y: ry,
      value: value ?? (kind === 'cash' ? 100 : 40),
      life: 35,
      bobPhase: Math.random() * Math.PI * 2,
    });
  }

  public startLoop() {
    if (this.rafId !== null) return;
    this.lastTimestamp = performance.now();
    const tick = (now: number) => {
      const rawDt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      if (this.phase === 'paused' || this.phase === 'gameover') {
        if (this.needsFrozenRender) {
          this.render();
          this.needsFrozenRender = false;
        }
      } else {
        this.update(dt);
        this.render();
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public destroy() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.detachListeners();
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    const code = e.code;
    if (
      [
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Space',
      ].includes(code) &&
      this.phase === 'playing'
    ) {
      e.preventDefault();
    }
    this.heldKeys.add(code);
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.heldKeys.delete(e.code);
  };

  private handleBlur = () => {
    this.heldKeys.clear();
    this.resetTouchControls();
  };

  private handleVisibility = () => {
    if (document.hidden) {
      this.heldKeys.clear();
      this.resetTouchControls();
    }
  };

  private handleResize = () => {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewportW = Math.max(320, rect.width);
    this.viewportH = Math.max(240, rect.height);
    this.canvas.width = Math.round(this.viewportW * dpr);
    this.canvas.height = Math.round(this.viewportH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  private attachListeners() {
    window.addEventListener('keydown', this.handleKeyDown, { passive: false });
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibility);

    if (typeof ResizeObserver !== 'undefined' && this.canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.canvas.parentElement);
    } else {
      window.addEventListener('resize', this.handleResize);
    }
  }

  private detachListeners() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    } else {
      window.removeEventListener('resize', this.handleResize);
    }
  }

  private update(dt: number) {
    if (this.phase === 'paused' || this.phase === 'gameover') {
      return;
    }

    this.simTime += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.9);

    // Ghost HP trailing bar & flash timers run in real dt
    this.player.ghostHp += (this.player.hp - this.player.ghostHp) * Math.min(1, dt * 4);
    if (this.player.hitFlashTimer > 0) this.player.hitFlashTimer -= dt;
    if (this.player.invulnTimer > 0) this.player.invulnTimer -= dt;
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerAlert = null;
    }

    // Update particles & popups even during hitstop for crisp feedback
    this.updateParticlesAndPopups(dt);

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }

    if (this.phase === 'title') {
      // Live world camera tour across Crunch City
      const cx = this.map.worldWidth / 2;
      const cy = this.map.worldHeight / 2;
      this.cameraX = cx + Math.cos(this.simTime * 0.18) * 480;
      this.cameraY = cy + Math.sin(this.simTime * 0.24) * 380;
      this.updateTraffic(dt);
      this.updateNpcs(dt, false);
      this.updatePolice(dt, 0);
      return;
    }

    // Death delay beat before showing Game Over modal
    if (this.deathDelayTimer > 0) {
      this.deathDelayTimer -= dt;
      if (this.deathDelayTimer <= 0) {
        this.phase = 'gameover';
        this.heldKeys.clear();
        soundEngine.playGameOver();
        this.callbacks.onGameOver({
          runMoney: this.runMoney,
          totalMoney: this.totalBankMoney,
          buildingsCrushed: this.buildingsCrushed,
          carsCrushed: this.carsCrushed,
          policeSmashed: this.policeSmashed,
          bestCombo: this.bestCombo,
          reason: this.wantedHeat >= 20 ? 'busted' : 'wrecked',
        });
      }
      return;
    }

    // Combo decay & wanted heat slow cool-down
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
      }
    }
    if (this.wantedHeat > 0) {
      this.wantedHeat = Math.max(0, this.wantedHeat - dt * 0.65);
    }

    // Periodic pickups
    this.pickupSpawnTimer -= dt;
    if (this.pickupSpawnTimer <= 0 && this.pickups.length < 36) {
      this.pickupSpawnTimer = 4.5;
      this.spawnPickup(Math.random() < 0.5 ? 'repair' : 'cash');
    }

    this.updatePlayer(dt);
    this.updateBuildingsAndProps(dt);
    this.updateTraffic(dt);
    this.updateNpcs(dt, true);
    const stars = computeWantedStars(this.wantedHeat);
    this.updatePolice(dt, stars);
    this.updatePickups(dt);

    // Smooth camera follow with slight velocity lead
    const targetCamX = this.player.x + this.player.vx * 0.22;
    const targetCamY = this.player.y + this.player.vy * 0.22;
    const lerp = 1 - Math.exp(-dt * 8.5);
    this.cameraX += (targetCamX - this.cameraX) * lerp;
    this.cameraY += (targetCamY - this.cameraY) * lerp;

    // Clamp camera softly inside world edges
    const halfViewW = this.viewportW / 2;
    const halfViewH = this.viewportH / 2;
    if (this.map.worldWidth > this.viewportW) {
      this.cameraX = Math.max(
        halfViewW - 60,
        Math.min(this.map.worldWidth - halfViewW + 60, this.cameraX)
      );
    }
    if (this.map.worldHeight > this.viewportH) {
      this.cameraY = Math.max(
        halfViewH - 60,
        Math.min(this.map.worldHeight - halfViewH + 60, this.cameraY)
      );
    }

    this.hudEmitTimer -= dt;
    if (this.hudEmitTimer <= 0) {
      this.hudEmitTimer = 0.08;
      this.emitHud();
    }
  }

  private updatePlayer(dt: number) {
    const spec = getCarSpec(this.player.carId);
    const up =
      this.heldKeys.has('KeyW') ||
      this.heldKeys.has('ArrowUp') ||
      this.touchControls.up;
    const down =
      this.heldKeys.has('KeyS') ||
      this.heldKeys.has('ArrowDown') ||
      this.touchControls.down;
    const left =
      this.heldKeys.has('KeyA') ||
      this.heldKeys.has('ArrowLeft') ||
      this.touchControls.left;
    const right =
      this.heldKeys.has('KeyD') ||
      this.heldKeys.has('ArrowRight') ||
      this.touchControls.right;
    const drift = this.heldKeys.has('Space') || this.touchControls.drift;
    const boostKey =
      this.heldKeys.has('ShiftLeft') ||
      this.heldKeys.has('ShiftRight') ||
      this.touchControls.boost;

    const fwdX = Math.cos(this.player.angle);
    const fwdY = Math.sin(this.player.angle);
    const rightX = -fwdY;
    const rightY = fwdX;

    const forwardSpeed = this.player.vx * fwdX + this.player.vy * fwdY;
    const lateralSpeed = this.player.vx * rightX + this.player.vy * rightY;

    this.player.isDrifting = drift && Math.abs(forwardSpeed) > 85;
    this.player.isBoosting = boostKey && this.player.boostFuel > 3 && up;

    if (this.player.isBoosting) {
      this.player.boostFuel = Math.max(0, this.player.boostFuel - dt * 36);
    } else {
      const driftRecharge = this.player.isDrifting ? 9 : 0;
      this.player.boostFuel = Math.min(100, this.player.boostFuel + dt * (13 + driftRecharge));
    }

    const boostMult = this.player.isBoosting ? 1.38 : 1.0;
    let accelForce = 0;
    if (up) accelForce += spec.accel * boostMult;
    if (down) accelForce -= spec.accel * 0.72;

    const speed = Math.hypot(this.player.vx, this.player.vy);
    const steerScale = Math.min(1, speed / 95);
    const reverseFlip = forwardSpeed < -25 ? -1 : 1;
    const driftTurnMult = this.player.isDrifting ? 1.32 : 1.0;

    if (left) {
      this.player.angle -= spec.handling * driftTurnMult * steerScale * reverseFlip * dt;
    }
    if (right) {
      this.player.angle += spec.handling * driftTurnMult * steerScale * reverseFlip * dt;
    }

    // Apply forward acceleration & lateral grip
    const newFwdX = Math.cos(this.player.angle);
    const newFwdY = Math.sin(this.player.angle);
    const newRightX = -newFwdY;
    const newRightY = newFwdX;

    const nextForward =
      (forwardSpeed + accelForce * dt) * (up || down ? 0.992 : 0.968);
    const gripDecay = this.player.isDrifting ? 0.93 : 0.76;
    const nextLateral = lateralSpeed * Math.pow(gripDecay, dt * 60);

    const maxAllowedSpeed = spec.maxSpeed * boostMult;
    const clampedForward = Math.max(
      -spec.maxSpeed * 0.45,
      Math.min(maxAllowedSpeed, nextForward)
    );

    const prevX = this.player.x;
    const prevY = this.player.y;

    this.player.vx = newFwdX * clampedForward + newRightX * nextLateral;
    this.player.vy = newFwdY * clampedForward + newRightY * nextLateral;

    this.player.x += this.player.vx * dt;
    this.player.y += this.player.vy * dt;

    // World border bounce
    const margin = 24;
    if (this.player.x < margin) {
      this.player.x = margin;
      this.player.vx = Math.abs(this.player.vx) * 0.6;
    } else if (this.player.x > this.map.worldWidth - margin) {
      this.player.x = this.map.worldWidth - margin;
      this.player.vx = -Math.abs(this.player.vx) * 0.6;
    }
    if (this.player.y < margin) {
      this.player.y = margin;
      this.player.vy = Math.abs(this.player.vy) * 0.6;
    } else if (this.player.y > this.map.worldHeight - margin) {
      this.player.y = this.map.worldHeight - margin;
      this.player.vy = -Math.abs(this.player.vy) * 0.6;
    }

    // Emit dual rear tire skid marks, billowing smoke clouds & sparks when drifting
    if (this.player.isDrifting || Math.abs(nextLateral) > 85) {
      const rearDist = spec.length * 0.34;
      const halfTrack = spec.width * 0.36;
      const sides = [-1, 1];
      for (const side of sides) {
        const offX = -newFwdX * rearDist + newRightX * halfTrack * side;
        const offY = -newFwdY * rearDist + newRightY * halfTrack * side;
        this.skidMarks.push({
          x1: prevX + offX,
          y1: prevY + offY,
          x2: this.player.x + offX,
          y2: this.player.y + offY,
          alpha: this.player.isDrifting ? 0.62 : 0.42,
        });
      }
      while (this.skidMarks.length > MAX_SKID_MARKS) {
        this.skidMarks.shift();
      }

      // Billowing tire smoke & hot drift sparks
      for (const side of sides) {
        const wheelX = this.player.x - newFwdX * rearDist + newRightX * halfTrack * side;
        const wheelY = this.player.y - newFwdY * rearDist + newRightY * halfTrack * side;
        this.spawnDriftParticle(
          wheelX + (Math.random() - 0.5) * 4,
          wheelY + (Math.random() - 0.5) * 4,
          -this.player.vx * 0.16 + (Math.random() - 0.5) * 32,
          -this.player.vy * 0.16 + (Math.random() - 0.5) * 32,
          Math.random() < 0.55 ? '#CBD5E1' : '#E2E8F0',
          'circle',
          6 + Math.random() * 6,
          0.35 + Math.random() * 0.25
        );
        if (this.player.isDrifting && speed > 175 && Math.random() < 0.65) {
          this.spawnDriftParticle(
            wheelX,
            wheelY,
            -newFwdX * (90 + Math.random() * 90) + (Math.random() - 0.5) * 70,
            -newFwdY * (90 + Math.random() * 90) + (Math.random() - 0.5) * 70,
            Math.random() < 0.5 ? '#FACC15' : '#F97316',
            'shard',
            3 + Math.random() * 3,
            0.22 + Math.random() * 0.16
          );
        }
      }
    }
  }

  private updateBuildingsAndProps(dt: number) {
    const spec = getCarSpec(this.player.carId);
    const playerRadius = spec.width * 0.62;
    const playerSpeed = Math.hypot(this.player.vx, this.player.vy);

    // Buildings: super easy to crush!
    for (const b of this.buildings) {
      if (b.hitFlashTimer > 0) b.hitFlashTimer -= dt;
      if (b.shakeTimer > 0) b.shakeTimer -= dt;

      if (b.crushed) {
        b.rebuildTimer -= dt;
        if (b.rebuildTimer <= 0) {
          // Only rebuild if player isn't sitting directly on the lot
          const overlap = circleIntersectsRect(
            this.player.x,
            this.player.y,
            playerRadius + 16,
            b.x,
            b.y,
            b.w,
            b.h
          );
          if (!overlap.hit) {
            b.crushed = false;
            b.hp = b.maxHp;
          }
        }
        continue;
      }

      const col = circleIntersectsRect(
        this.player.x,
        this.player.y,
        playerRadius,
        b.x,
        b.y,
        b.w,
        b.h
      );
      if (col.hit) {
        const outcome = evaluateCrashOutcome(
          playerSpeed,
          spec,
          b.template.crushResistance,
          false
        );

        if (outcome === 'crush' || b.hp <= 1) {
          b.hp -= 1;
          b.hitFlashTimer = 0.08;
          b.shakeTimer = 0.14;
          if (b.hp <= 0) {
            b.crushed = true;
            b.rebuildTimer = 22;
            this.buildingsCrushed++;
            this.awardCrashMoney(
              b.template.reward,
              b.x + b.w / 2,
              b.y + b.h / 2,
              `${b.template.label.toUpperCase()} CRUSHED!`,
              '#10B981'
            );
            this.wantedHeat = Math.min(100, this.wantedHeat + 8);
            this.hitstopTimer = 0.04;
            this.trauma = Math.min(1, this.trauma + 0.52);
            soundEngine.playCrash('building');
            this.spawnBurst(
              b.x + b.w / 2,
              b.y + b.h / 2,
              22,
              b.template.roofColor,
              'square',
              260
            );
            this.spawnBurst(
              b.x + b.w / 2,
              b.y + b.h / 2,
              8,
              '#10B981',
              'bill',
              170
            );
            // Plow right through with only a light momentum scrub
            this.player.vx *= 0.84;
            this.player.vy *= 0.84;
          } else {
            // 2-HP building cracked on first tap, bounce lightly & give chip bonus
            this.awardCrashMoney(85, b.x + b.w / 2, b.y + b.h / 2, 'CRACKED!', '#FACC15');
            this.player.x += col.nx * col.overlap;
            this.player.y += col.ny * col.overlap;
            this.player.vx = col.nx * 140;
            this.player.vy = col.ny * 140;
            soundEngine.playCrash('heavy');
            this.spawnBurst(this.player.x, this.player.y, 10, b.template.wallColor, 'shard', 180);
          }
        }
      }
    }

    // Street props
    for (const prop of this.props) {
      if (prop.crushed) {
        prop.rebuildTimer -= dt;
        if (prop.rebuildTimer <= 0) prop.crushed = false;
        continue;
      }
      const dist = Math.hypot(this.player.x - prop.x, this.player.y - prop.y);
      if (dist < playerRadius + prop.radius) {
        prop.crushed = true;
        prop.rebuildTimer = 18;
        this.awardCrashMoney(prop.reward, prop.x, prop.y, undefined, '#34D399');
        soundEngine.playCrash('light');
        const pColor =
          prop.kind === 'hydrant'
            ? '#38BDF8'
            : prop.kind === 'lamp'
            ? '#FDE047'
            : '#D97706';
        this.spawnBurst(prop.x, prop.y, 9, pColor, 'circle', 190);
      }
    }
  }

  private updateTraffic(dt: number) {
    const spec = getCarSpec(this.player.carId);
    const playerRadius = spec.width * 0.65;
    const playerSpeed = Math.hypot(this.player.vx, this.player.vy);

    for (const car of this.traffic) {
      if (car.hitFlashTimer > 0) car.hitFlashTimer -= dt;
      if (car.deflectCooldown > 0) car.deflectCooldown -= dt;

      if (car.crushed) {
        car.crushedTimer -= dt;
        car.x += car.vx * dt;
        car.y += car.vy * dt;
        car.vx *= Math.pow(0.92, dt * 60);
        car.vy *= Math.pow(0.92, dt * 60);
        car.angle += car.spinVel * dt;
        car.spinVel *= Math.pow(0.94, dt * 60);

        if (car.crushedTimer <= 0) {
          // Respawn fresh traffic car elsewhere
          this.respawnTrafficCar(car);
        }
        continue;
      }

      // Cruise along lanes
      car.x += car.vx * dt;
      car.y += car.vy * dt;

      // Wrap smoothly at world edges
      if (car.x < -50) car.x = this.map.worldWidth + 40;
      if (car.x > this.map.worldWidth + 50) car.x = -40;
      if (car.y < -50) car.y = this.map.worldHeight + 40;
      if (car.y > this.map.worldHeight + 50) car.y = -40;

      if (this.phase !== 'playing') continue;

      const carRadius = car.archetype.width * 0.68;
      const dx = this.player.x - car.x;
      const dy = this.player.y - car.y;
      const dist = Math.hypot(dx, dy);

      if (dist < playerRadius + carRadius && car.deflectCooldown <= 0) {
        const outcome = evaluateCrashOutcome(
          playerSpeed,
          spec,
          car.archetype.crushResistance,
          car.archetype.uncrushable
        );

        if (outcome === 'deflect') {
          // Super expensive exotic car CANNOT be crushed!
          car.deflectCooldown = 0.45;
          car.hitFlashTimer = 0.08;
          this.exoticsBounced++;

          const nx = dist > 0.01 ? dx / dist : 1;
          const ny = dist > 0.01 ? dy / dist : 0;
          const push = playerRadius + carRadius - dist + 6;
          this.player.x += nx * push;
          this.player.y += ny * push;
          const bounceSpeed = Math.max(185, playerSpeed * 0.65);
          this.player.vx = nx * bounceSpeed;
          this.player.vy = ny * bounceSpeed;

          this.trauma = Math.min(1, this.trauma + 0.35);
          this.hitstopTimer = 0.035;
          soundEngine.playDeflectClang();
          this.spawnBurst(
            (this.player.x + car.x) / 2,
            (this.player.y + car.y) / 2,
            14,
            '#FDE047',
            'shard',
            260
          );

          this.addPopup(
            car.x,
            car.y - 18,
            'UNCRUSHABLE!',
            `${car.archetype.name}`,
            '#FACC15',
            1.05
          );
          this.setBanner(`Can't crush ${car.archetype.name} — hit small cars & buildings!`);

          // Minor recoil scuff if player slammed super hard
          if (playerSpeed > 260) {
            this.damagePlayer(7);
          }
        } else if (outcome === 'crush') {
          car.crushed = true;
          car.crushedTimer = 4.5;
          car.hitFlashTimer = 0.09;
          car.vx = this.player.vx * 0.85 + (Math.random() - 0.5) * 140;
          car.vy = this.player.vy * 0.85 + (Math.random() - 0.5) * 140;
          car.spinVel = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 6);

          this.carsCrushed++;
          this.awardCrashMoney(
            car.archetype.reward,
            car.x,
            car.y,
            `${car.archetype.name.toUpperCase()} SMASHED!`,
            '#10B981'
          );
          this.wantedHeat = Math.min(100, this.wantedHeat + 6);
          this.hitstopTimer = 0.035;
          this.trauma = Math.min(1, this.trauma + 0.34);
          soundEngine.playCrash('heavy');
          this.spawnBurst(
            car.x,
            car.y,
            16,
            car.archetype.primaryColor,
            'shard',
            240
          );
          this.spawnBurst(car.x, car.y, 6, '#10B981', 'bill', 150);

          // Small cars barely slow you down
          const slowFactor = car.archetype.tier === 'small' ? 0.93 : 0.78;
          this.player.vx *= slowFactor;
          this.player.vy *= slowFactor;
        } else {
          // Chip bounce off medium car at very low speed
          car.deflectCooldown = 0.3;
          car.hitFlashTimer = 0.06;
          const nx = dist > 0.01 ? dx / dist : 1;
          const ny = dist > 0.01 ? dy / dist : 0;
          this.player.vx = nx * 130;
          this.player.vy = ny * 130;
          this.awardCrashMoney(45, car.x, car.y, 'SCRAPE!', '#FACC15');
          soundEngine.playCrash('light');
        }
      }
    }
  }

  private respawnTrafficCar(car: TrafficCar) {
    const roll = Math.random();
    let pool = TRAFFIC_ARCHETYPES.filter((t) => t.tier === 'small');
    if (roll > 0.8) {
      pool = TRAFFIC_ARCHETYPES.filter((t) => t.tier === 'exotic');
    } else if (roll > 0.56) {
      pool = TRAFFIC_ARCHETYPES.filter((t) => t.tier === 'medium');
    }
    car.archetype = pool[Math.floor(Math.random() * pool.length)];
    car.crushed = false;
    car.spinVel = 0;

    const laneAxis: 'h' | 'v' = Math.random() < 0.5 ? 'h' : 'v';
    const laneDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    car.laneAxis = laneAxis;
    car.laneDir = laneDir;

    if (laneAxis === 'h') {
      const roadY =
        this.map.roadCentersY[
          Math.floor(Math.random() * this.map.roadCentersY.length)
        ];
      car.y = roadY + 30 * laneDir;
      if (Math.random() < 0.7) {
        const offset = (Math.random() * 1400 + 700) * (laneDir === 1 ? -1 : 1);
        car.x = Math.max(40, Math.min(this.map.worldWidth - 40, this.player.x + offset));
      } else {
        car.x = laneDir === 1 ? -30 : this.map.worldWidth + 30;
      }
      car.angle = laneDir === 1 ? 0 : Math.PI;
    } else {
      const roadX =
        this.map.roadCentersX[
          Math.floor(Math.random() * this.map.roadCentersX.length)
        ];
      car.x = roadX - 30 * laneDir;
      if (Math.random() < 0.7) {
        const offset = (Math.random() * 1400 + 700) * (laneDir === 1 ? -1 : 1);
        car.y = Math.max(40, Math.min(this.map.worldHeight - 40, this.player.y + offset));
      } else {
        car.y = laneDir === 1 ? -30 : this.map.worldHeight + 30;
      }
      car.angle = laneDir === 1 ? Math.PI / 2 : -Math.PI / 2;
    }
    car.vx = Math.cos(car.angle) * car.archetype.speed;
    car.vy = Math.sin(car.angle) * car.archetype.speed;
  }

  private updateNpcs(dt: number, reactToPlayer: boolean) {
    const playerSpeed = Math.hypot(this.player.vx, this.player.vy);

    for (const npc of this.npcs) {
      if (npc.tumbleTimer > 0) {
        npc.tumbleTimer -= dt;
        npc.x += npc.vx * dt;
        npc.y += npc.vy * dt;
        npc.vx *= Math.pow(0.9, dt * 60);
        npc.vy *= Math.pow(0.9, dt * 60);
        npc.angle += dt * 11;
        if (npc.tumbleTimer <= 0) {
          npc.state = 'panic';
          npc.panicTimer = 3.0;
        }
        continue;
      }

      if (reactToPlayer) {
        const dx = npc.x - this.player.x;
        const dy = npc.y - this.player.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 22) {
          // Comical arcade tumble & cash drop
          npc.state = 'tumble';
          npc.tumbleTimer = 0.65;
          const nx = dist > 0.01 ? dx / dist : 1;
          const ny = dist > 0.01 ? dy / dist : 0;
          npc.vx = nx * Math.max(160, playerSpeed * 0.65);
          npc.vy = ny * Math.max(160, playerSpeed * 0.65);
          this.wantedHeat = Math.min(100, this.wantedHeat + 5);
          this.awardCrashMoney(65, npc.x, npc.y, 'SCATTER!', '#34D399');
          soundEngine.playCrash('light');
          this.spawnBurst(npc.x, npc.y, 6, '#10B981', 'bill', 130);
          continue;
        } else if (dist < 145 && playerSpeed > 80) {
          npc.state = 'panic';
          npc.panicTimer = 2.4;
          npc.dirAngle = Math.atan2(dy, dx);
          if (!npc.droppedCash && Math.random() < 0.25) {
            npc.droppedCash = true;
            this.spawnPickup('cash', npc.x, npc.y, 75);
          }
        }
      }

      let moveSpeed = 36;
      if (npc.state === 'panic') {
        npc.panicTimer -= dt;
        moveSpeed = 105;
        if (npc.panicTimer <= 0) {
          npc.state = 'stroll';
          npc.droppedCash = false;
        }
      }

      npc.angle = npc.dirAngle;
      npc.x += Math.cos(npc.dirAngle) * moveSpeed * dt;
      npc.y += Math.sin(npc.dirAngle) * moveSpeed * dt;
      npc.walkPhase += moveSpeed * dt * 0.25;

      // Turn cleanly at world edges
      if (
        npc.x < 30 ||
        npc.x > this.map.worldWidth - 30 ||
        npc.y < 30 ||
        npc.y > this.map.worldHeight - 30
      ) {
        npc.dirAngle += Math.PI;
        npc.x = Math.max(32, Math.min(this.map.worldWidth - 32, npc.x));
        npc.y = Math.max(32, Math.min(this.map.worldHeight - 32, npc.y));
      }
    }
  }

  private updatePolice(dt: number, stars: number) {
    // Dynamic police scaling based on Wanted Stars
    const desiredCops = stars === 0 ? 6 : Math.min(16, 4 + stars * 2.2);
    const activeCops = this.police.filter((c) => !c.crushed).length;
    if (activeCops < Math.floor(desiredCops) && this.police.length < 18) {
      const role = stars >= 2 && Math.random() < 0.45 ? 'enforcer' : 'interceptor';
      this.spawnPoliceUnit(role);
    }

    const spec = getCarSpec(this.player.carId);
    const playerRadius = spec.width * 0.65;
    const playerSpeed = Math.hypot(this.player.vx, this.player.vy);

    for (let i = this.police.length - 1; i >= 0; i--) {
      const cop = this.police[i];
      if (cop.hitFlashTimer > 0) cop.hitFlashTimer -= dt;
      cop.sirenPhase += dt * (stars > 0 ? 14 : 4);

      if (cop.crushed) {
        cop.crushedTimer -= dt;
        cop.x += cop.vx * dt;
        cop.y += cop.vy * dt;
        cop.vx *= Math.pow(0.92, dt * 60);
        cop.vy *= Math.pow(0.92, dt * 60);
        cop.angle += cop.spinVel * dt;
        cop.spinVel *= Math.pow(0.94, dt * 60);
        if (cop.crushedTimer <= 0) {
          this.police.splice(i, 1);
        }
        continue;
      }

      const dx = this.player.x - cop.x;
      const dy = this.player.y - cop.y;
      const dist = Math.hypot(dx, dy);

      if (stars === 0 || this.phase !== 'playing') {
        // Patrol peacefully
        cop.chargeState = 'patrol';
        const speed = 135;
        cop.vx = Math.cos(cop.angle) * speed;
        cop.vy = Math.sin(cop.angle) * speed;
        cop.x += cop.vx * dt;
        cop.y += cop.vy * dt;
        if (
          cop.x < 40 ||
          cop.x > this.map.worldWidth - 40 ||
          cop.y < 40 ||
          cop.y > this.map.worldHeight - 40
        ) {
          cop.angle += Math.PI * 0.5;
        }
        continue;
      }

      // Active pursuit audio cue if close
      if (dist < 420 && Math.random() < dt * 1.4) {
        soundEngine.playSirenBlip(Math.sin(cop.sirenPhase) > 0);
      }

      if (cop.role === 'interceptor') {
        // Interceptor Policy: predictive pursuit steering
        cop.chargeState = 'chase';
        const leadX = this.player.x + this.player.vx * 0.35;
        const leadY = this.player.y + this.player.vy * 0.35;
        const desiredAngle = Math.atan2(leadY - cop.y, leadX - cop.x);
        const diff = Math.atan2(
          Math.sin(desiredAngle - cop.angle),
          Math.cos(desiredAngle - cop.angle)
        );
        cop.angle += Math.sign(diff) * Math.min(Math.abs(diff), 3.1 * dt);
        const chaseSpeed = 240 + stars * 22;
        cop.vx = Math.cos(cop.angle) * chaseSpeed;
        cop.vy = Math.sin(cop.angle) * chaseSpeed;
      } else {
        // Enforcer Policy: windup telegraph -> high-speed line-of-sight ram
        cop.chargeTimer -= dt;
        if (cop.chargeState === 'patrol' || cop.chargeState === 'chase') {
          const desiredAngle = Math.atan2(dy, dx);
          const diff = Math.atan2(
            Math.sin(desiredAngle - cop.angle),
            Math.cos(desiredAngle - cop.angle)
          );
          cop.angle += Math.sign(diff) * Math.min(Math.abs(diff), 2.2 * dt);
          cop.vx = Math.cos(cop.angle) * 195;
          cop.vy = Math.sin(cop.angle) * 195;
          if (dist < 280 && cop.chargeTimer <= 0) {
            cop.chargeState = 'windup';
            cop.chargeTimer = 0.45;
            cop.targetAngle = Math.atan2(dy, dx);
            cop.vx *= 0.25;
            cop.vy *= 0.25;
          }
        } else if (cop.chargeState === 'windup') {
          cop.angle = cop.targetAngle;
          cop.vx = 0;
          cop.vy = 0;
          if (cop.chargeTimer <= 0) {
            cop.chargeState = 'ram';
            cop.chargeTimer = 0.85;
            cop.vx = Math.cos(cop.angle) * 440;
            cop.vy = Math.sin(cop.angle) * 440;
          }
        } else if (cop.chargeState === 'ram') {
          if (cop.chargeTimer <= 0) {
            cop.chargeState = 'chase';
            cop.chargeTimer = 2.0;
          }
        }
      }

      cop.x += cop.vx * dt;
      cop.y += cop.vy * dt;

      // Keep inside bounds
      cop.x = Math.max(30, Math.min(this.map.worldWidth - 30, cop.x));
      cop.y = Math.max(30, Math.min(this.map.worldHeight - 30, cop.y));

      // Check collision with player
      const copRadius = cop.role === 'enforcer' ? 22 : 18;
      const curDist = Math.hypot(this.player.x - cop.x, this.player.y - cop.y);
      if (curDist < playerRadius + copRadius) {
        const outcome = evaluateCrashOutcome(
          playerSpeed,
          spec,
          cop.crushResistance,
          false
        );

        if (outcome === 'crush' && playerSpeed > 180) {
          cop.hp -= 1;
          cop.hitFlashTimer = 0.08;
          if (cop.hp <= 0) {
            cop.crushed = true;
            cop.crushedTimer = 4.5;
            cop.vx = this.player.vx * 0.8;
            cop.vy = this.player.vy * 0.8;
            cop.spinVel = 8;
            this.policeSmashed++;
            this.player.boostFuel = Math.min(100, this.player.boostFuel + 30);
            this.awardCrashMoney(
              cop.reward,
              cop.x,
              cop.y,
              'COP SMASHED!',
              '#38BDF8'
            );
            this.hitstopTimer = 0.05;
            this.trauma = Math.min(1, this.trauma + 0.5);
            soundEngine.playCrash('building');
            this.spawnBurst(cop.x, cop.y, 18, '#3B82F6', 'shard', 250);
            this.spawnBurst(cop.x, cop.y, 8, '#EF4444', 'circle', 210);
          } else {
            // Enforcer took 1 hit; push apart
            const nx = curDist > 0.01 ? (this.player.x - cop.x) / curDist : 1;
            const ny = curDist > 0.01 ? (this.player.y - cop.y) / curDist : 0;
            this.player.x += nx * 16;
            this.player.y += ny * 16;
            cop.vx = -nx * 180;
            cop.vy = -ny * 180;
            soundEngine.playCrash('heavy');
          }
        } else {
          // Police rammed player!
          const nx = curDist > 0.01 ? (this.player.x - cop.x) / curDist : 1;
          const ny = curDist > 0.01 ? (this.player.y - cop.y) / curDist : 0;
          this.player.x += nx * 14;
          this.player.y += ny * 14;
          this.player.vx = nx * 210;
          this.player.vy = ny * 210;
          cop.vx = -nx * 140;
          cop.vy = -ny * 140;

          if (this.player.invulnTimer <= 0) {
            const dmg = cop.role === 'enforcer' ? 24 : 15;
            this.damagePlayer(dmg);
            this.player.invulnTimer = 0.45;
            this.wantedHeat = Math.min(100, this.wantedHeat + 4);
            soundEngine.playCrash('heavy');
            this.trauma = Math.min(1, this.trauma + 0.4);
            this.spawnBurst(this.player.x, this.player.y, 10, '#EF4444', 'shard', 200);
          }
        }
      }
    }
  }

  private updatePickups(dt: number) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pickups.splice(i, 1);
        continue;
      }
      const dist = Math.hypot(this.player.x - p.x, this.player.y - p.y);
      if (dist < 34) {
        if (p.kind === 'cash') {
          this.awardMoneyDirect(p.value);
          this.addPopup(p.x, p.y, `+$${p.value}`, 'CASH PICKUP', '#10B981', 1);
          soundEngine.playCashChime(this.comboCount);
        } else {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + p.value);
          this.addPopup(p.x, p.y, `+${p.value} ARMOR`, 'REPAIRED', '#38BDF8', 1);
          soundEngine.playPickup();
        }
        this.pickups.splice(i, 1);
      }
    }
  }

  private updateParticlesAndPopups(dt: number) {
    for (const pt of this.particles) {
      if (!pt.active) continue;
      pt.life -= dt;
      if (pt.life <= 0) {
        pt.active = false;
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= Math.pow(0.92, dt * 60);
      pt.vy *= Math.pow(0.92, dt * 60);
      pt.rotation += pt.rotSpeed * dt;
    }

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.life -= dt;
      pop.y += pop.vy * dt;
      if (pop.life <= 0) {
        this.popups.splice(i, 1);
      }
    }
  }

  private damagePlayer(amount: number) {
    if (this.deathDelayTimer > 0) return;
    this.player.hp = Math.max(0, this.player.hp - amount);
    this.player.hitFlashTimer = 0.1;
    if (this.player.hp <= 0) {
      this.deathDelayTimer = 0.5;
      this.hitstopTimer = 0.06;
      this.trauma = 1.0;
      this.spawnBurst(this.player.x, this.player.y, 28, '#F97316', 'circle', 280);
      this.spawnBurst(this.player.x, this.player.y, 18, '#EF4444', 'shard', 240);
      soundEngine.playCrash('building');
      this.emitHud();
    }
  }

  private awardCrashMoney(
    baseReward: number,
    x: number,
    y: number,
    subtext: string | undefined,
    color: string
  ) {
    const spec = getCarSpec(this.player.carId);
    this.comboCount++;
    this.comboTimer = 3.2;
    if (this.comboCount > this.bestCombo) {
      this.bestCombo = this.comboCount;
    }

    const earned = calculateCrashReward(baseReward, spec, this.comboCount);
    this.awardMoneyDirect(earned);
    const mult = getComboMultiplier(this.comboCount);
    const label = mult > 1 ? `+$${earned} (x${mult})` : `+$${earned}`;
    this.addPopup(x, y - 14, label, subtext, color, mult > 1.5 ? 1.15 : 1.0);
    soundEngine.playCashChime(this.comboCount);
    this.emitHud();
  }

  private awardMoneyDirect(amount: number) {
    this.runMoney += amount;
    this.totalBankMoney += amount;
    this.callbacks.onMoneyEarned(amount);
  }

  private addPopup(
    x: number,
    y: number,
    text: string,
    subtext: string | undefined,
    color: string,
    scale: number
  ) {
    this.popups.push({
      id: this.nextEntityId++,
      x,
      y,
      vy: -46,
      text,
      subtext,
      color,
      life: 1.05,
      maxLife: 1.05,
      scale,
    });
  }

  private setBanner(msg: string) {
    this.bannerAlert = msg;
    this.bannerTimer = 2.6;
  }

  private spawnBurst(
    x: number,
    y: number,
    count: number,
    color: string,
    shape: Particle['shape'],
    speedMax: number
  ) {
    for (let i = 0; i < count; i++) {
      const pt = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;

      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * speedMax;
      pt.active = true;
      pt.x = x;
      pt.y = y;
      pt.vx = Math.cos(ang) * spd;
      pt.vy = Math.sin(ang) * spd;
      pt.size = shape === 'bill' ? 6 : 4 + Math.random() * 5;
      pt.rotation = Math.random() * Math.PI * 2;
      pt.rotSpeed = (Math.random() - 0.5) * 12;
      pt.maxLife = 0.4 + Math.random() * 0.45;
      pt.life = pt.maxLife;
      pt.color = color;
      pt.shape = shape;
    }
  }

  private spawnDriftParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: string,
    shape: Particle['shape'],
    size: number,
    maxLife: number
  ) {
    const pt = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;
    pt.active = true;
    pt.x = x;
    pt.y = y;
    pt.vx = vx;
    pt.vy = vy;
    pt.size = size;
    pt.rotation = Math.random() * Math.PI * 2;
    pt.rotSpeed = (Math.random() - 0.5) * 8;
    pt.maxLife = maxLife;
    pt.life = maxLife;
    pt.color = color;
    pt.shape = shape;
  }

  private emitHud() {
    const spec = getCarSpec(this.player.carId);
    const speedMph = Math.round(
      (Math.hypot(this.player.vx, this.player.vy) / 6.2)
    );
    const money = Math.round(this.totalBankMoney);
    const hp = Math.round(this.player.hp);
    const maxHp = Math.round(this.player.maxHp);
    const ghostHp = Math.round(this.player.ghostHp);
    const boostFuel = Math.round(this.player.boostFuel);
    const wantedStars = computeWantedStars(this.wantedHeat);
    const key = `${money}|${hp}|${ghostHp}|${speedMph}|${boostFuel}|${wantedStars}|${this.comboCount}|${this.buildingsCrushed}|${this.carsCrushed}|${this.policeSmashed}|${spec.id}|${this.bannerAlert ?? ''}`;
    if (key === this.lastHudKey) return;
    this.lastHudKey = key;

    this.callbacks.onHudUpdate({
      money,
      runMoney: Math.round(this.runMoney),
      hp,
      maxHp,
      ghostHp,
      speedMph,
      boostFuel,
      wantedStars,
      comboCount: this.comboCount,
      comboMultiplier: getComboMultiplier(this.comboCount),
      comboTimerRatio: Math.max(0, Math.min(1, this.comboTimer / 3.2)),
      buildingsCrushed: this.buildingsCrushed,
      carsCrushed: this.carsCrushed,
      exoticsBounced: this.exoticsBounced,
      policeSmashed: this.policeSmashed,
      currentCarName: spec.name,
      bannerAlert: this.bannerAlert,
    });
  }

  private render() {
    const spec = getCarSpec(this.player.carId);
    const shakeMag = this.trauma * this.trauma * 14;
    const shakeX = (Math.random() * 2 - 1) * shakeMag;
    const shakeY = (Math.random() * 2 - 1) * shakeMag;

    renderGameWorld(this.ctx, this.viewportW, this.viewportH, {
      map: this.map,
      player: this.player,
      playerSpec: spec,
      buildings: this.buildings,
      props: this.props,
      traffic: this.traffic,
      police: this.police,
      npcs: this.npcs,
      pickups: this.pickups,
      skidMarks: this.skidMarks,
      particles: this.particles,
      popups: this.popups,
      cameraX: this.cameraX,
      cameraY: this.cameraY,
      shakeX,
      shakeY,
      time: this.simTime,
    });

    if (this.minimapCanvas && this.phase === 'playing') {
      this.minimapTimer -= 0.016;
      if (this.minimapTimer <= 0) {
        this.minimapTimer = 0.1;
        const mCtx = this.minimapCanvas.getContext('2d');
        if (mCtx) {
          renderMinimap(
            mCtx,
            this.minimapCanvas.width,
            this.map,
            this.player,
            this.police,
            this.pickups
          );
        }
      }
    }
  }
}

export { CAR_CATALOG };
