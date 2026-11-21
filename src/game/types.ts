export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';
export type ViewMode = '2d' | '3d';
export type CameraMode = 'third' | 'first';
export type MapId = 'downtown' | 'neon-night' | 'sunset-canyon' | 'frost-harbor';

export interface MapThemeConfig {
  id: MapId;
  name: string;
  seed: number;
  blockSize: number;
  roadWidth: number;
  roadColor: string;
  sidewalkColor: string;
  curbColor: string;
  courtyardA: string;
  courtyardB: string;
  lineColor: string;
  crosswalkColor: string;
  skyColor: string;
  groundApronColor: string;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fogDensity: number;
}

export type CarBodyShape =
  | 'hatch'
  | 'coupe'
  | 'sedan'
  | 'muscle'
  | 'van'
  | 'truck'
  | 'supercar'
  | 'bus'
  | 'bulldozer'
  | 'monster';

export interface CarSpec {
  id: string;
  name: string;
  tagline: string;
  tier: 'Starter' | 'Street' | 'Heavy' | 'Apex' | 'Titan';
  price: number;
  maxSpeed: number;
  accel: number;
  handling: number;
  mass: number;
  smashPower: number;
  maxHp: number;
  cashMultiplier: number;
  width: number;
  length: number;
  bodyShape: CarBodyShape;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

export type TrafficTier = 'small' | 'medium' | 'exotic';

export interface TrafficArchetype {
  id: string;
  name: string;
  tier: TrafficTier;
  uncrushable: boolean;
  crushResistance: number;
  reward: number;
  speed: number;
  width: number;
  length: number;
  bodyShape: CarBodyShape;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

export interface BuildingTemplate {
  id: string;
  label: string;
  roofColor: string;
  wallColor: string;
  trimColor: string;
  signText: string;
  signColor: string;
  crushResistance: number;
  maxHp: number;
  reward: number;
  heightVisual: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVel: number;
  hp: number;
  maxHp: number;
  ghostHp: number;
  boostFuel: number;
  isBoosting: boolean;
  isDrifting: boolean;
  hitFlashTimer: number;
  invulnTimer: number;
  carId: string;
}

export interface TrafficCar {
  id: number;
  archetype: TrafficArchetype;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  targetSpeed: number;
  laneAxis: 'h' | 'v';
  laneDir: 1 | -1;
  hp: number;
  crushed: boolean;
  crushedTimer: number;
  hitFlashTimer: number;
  spinVel: number;
  deflectCooldown: number;
}

export type PoliceRole = 'interceptor' | 'enforcer';

export interface PoliceUnit {
  id: number;
  role: PoliceRole;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  crushResistance: number;
  reward: number;
  crushed: boolean;
  crushedTimer: number;
  hitFlashTimer: number;
  sirenPhase: number;
  chargeState: 'patrol' | 'chase' | 'windup' | 'ram';
  chargeTimer: number;
  targetAngle: number;
  spinVel: number;
}

export interface BuildingEntity {
  id: number;
  template: BuildingTemplate;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  crushed: boolean;
  rebuildTimer: number;
  hitFlashTimer: number;
  shakeTimer: number;
}

export type PropKind = 'hydrant' | 'lamp' | 'mailbox' | 'bench' | 'crate';

export interface StreetProp {
  id: number;
  kind: PropKind;
  x: number;
  y: number;
  radius: number;
  reward: number;
  crushed: boolean;
  rebuildTimer: number;
}

export interface NpcPedestrian {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  walkPhase: number;
  shirtColor: string;
  hairColor: string;
  state: 'stroll' | 'panic' | 'tumble';
  panicTimer: number;
  tumbleTimer: number;
  dirAngle: number;
  droppedCash: boolean;
}

export interface PickupItem {
  id: number;
  kind: 'cash' | 'repair';
  x: number;
  y: number;
  value: number;
  life: number;
  bobPhase: number;
}

export interface SkidMark {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  alpha: number;
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotSpeed: number;
  life: number;
  maxLife: number;
  color: string;
  shape: 'square' | 'circle' | 'shard' | 'bill';
}

export interface FloatingPopup {
  id: number;
  x: number;
  y: number;
  vy: number;
  text: string;
  subtext?: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

export interface CityMapData {
  mapId: MapId;
  worldWidth: number;
  worldHeight: number;
  blockSize: number;
  roadWidth: number;
  cols: number;
  rows: number;
  roadCentersX: number[];
  roadCentersY: number[];
  spawnPoint: { x: number; y: number; angle: number };
}

export interface HudSnapshot {
  money: number;
  runMoney: number;
  hp: number;
  maxHp: number;
  ghostHp: number;
  speedMph: number;
  boostFuel: number;
  wantedStars: number;
  comboCount: number;
  comboMultiplier: number;
  comboTimerRatio: number;
  buildingsCrushed: number;
  carsCrushed: number;
  exoticsBounced: number;
  policeSmashed: number;
  currentCarName: string;
  bannerAlert: string | null;
  steerInput?: number;
}

export interface RunSummary {
  runMoney: number;
  totalMoney: number;
  buildingsCrushed: number;
  carsCrushed: number;
  policeSmashed: number;
  bestCombo: number;
  reason: 'wrecked' | 'busted';
}
