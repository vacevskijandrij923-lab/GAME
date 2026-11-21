import { BUILDING_TEMPLATES } from './catalog';
import {
  BuildingEntity,
  CityMapData,
  MapId,
  MapThemeConfig,
  PropKind,
  StreetProp,
} from './types';

export const MAP_IDS: MapId[] = [
  'downtown',
  'neon-night',
  'sunset-canyon',
  'frost-harbor',
];

export const MAP_THEMES: Record<MapId, MapThemeConfig> = {
  downtown: {
    id: 'downtown',
    name: 'Downtown',
    seed: 4207,
    blockSize: 320,
    roadWidth: 136,
    roadColor: '#252B36',
    sidewalkColor: '#94A3B8',
    curbColor: '#64748B',
    courtyardA: '#4B5563',
    courtyardB: '#3F4A59',
    lineColor: '#FACC15',
    crosswalkColor: 'rgba(241, 245, 249, 0.68)',
    skyColor: '#BCD4EA',
    groundApronColor: '#3B4859',
    sunColor: '#FFF1D6',
    sunIntensity: 1.95,
    hemiSky: '#A5D8FF',
    hemiGround: '#334155',
    hemiIntensity: 0.88,
    fogDensity: 0.0044,
  },
  'neon-night': {
    id: 'neon-night',
    name: 'Neon Night',
    seed: 9137,
    blockSize: 300,
    roadWidth: 146,
    roadColor: '#131722',
    sidewalkColor: '#475569',
    curbColor: '#38BDF8',
    courtyardA: '#1E293B',
    courtyardB: '#0F172A',
    lineColor: '#22D3EE',
    crosswalkColor: 'rgba(232, 121, 249, 0.62)',
    skyColor: '#131B2E',
    groundApronColor: '#0B101D',
    sunColor: '#93C5FD',
    sunIntensity: 1.45,
    hemiSky: '#6366F1',
    hemiGround: '#1E1B4B',
    hemiIntensity: 0.95,
    fogDensity: 0.0049,
  },
  'sunset-canyon': {
    id: 'sunset-canyon',
    name: 'Sunset Canyon',
    seed: 7741,
    blockSize: 340,
    roadWidth: 152,
    roadColor: '#372E2C',
    sidewalkColor: '#D6B68C',
    curbColor: '#A87948',
    courtyardA: '#92643D',
    courtyardB: '#7C5130',
    lineColor: '#FB923C',
    crosswalkColor: 'rgba(254, 243, 199, 0.72)',
    skyColor: '#F3B88C',
    groundApronColor: '#7C4D2F',
    sunColor: '#FFD6A5',
    sunIntensity: 2.05,
    hemiSky: '#FDBA74',
    hemiGround: '#5C3A21',
    hemiIntensity: 0.85,
    fogDensity: 0.0041,
  },
  'frost-harbor': {
    id: 'frost-harbor',
    name: 'Frost Harbor',
    seed: 5521,
    blockSize: 310,
    roadWidth: 140,
    roadColor: '#263344',
    sidewalkColor: '#DCE8F5',
    curbColor: '#94B8D8',
    courtyardA: '#8CA7C4',
    courtyardB: '#7290B0',
    lineColor: '#F8FAFC',
    crosswalkColor: 'rgba(125, 211, 252, 0.72)',
    skyColor: '#CFE8F9',
    groundApronColor: '#6B88A8',
    sunColor: '#F0F9FF',
    sunIntensity: 1.85,
    hemiSky: '#BAE6FD',
    hemiGround: '#475569',
    hemiIntensity: 0.95,
    fogDensity: 0.0043,
  },
};

export function normalizeMapId(value: unknown): MapId {
  if (
    value === 'downtown' ||
    value === 'neon-night' ||
    value === 'sunset-canyon' ||
    value === 'frost-harbor'
  ) {
    return value;
  }
  return 'downtown';
}

export function getMapTheme(mapId: MapId | unknown): MapThemeConfig {
  return MAP_THEMES[normalizeMapId(mapId)];
}

export function getNextMapId(current: MapId): MapId {
  const idx = MAP_IDS.indexOf(current);
  return MAP_IDS[(idx + 1) % MAP_IDS.length];
}

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function createCityMap(mapId: MapId = 'downtown'): CityMapData {
  const theme = getMapTheme(mapId);
  const cols = 16;
  const rows = 16;
  const blockSize = theme.blockSize;
  const roadWidth = theme.roadWidth;
  const step = blockSize + roadWidth;

  const worldWidth = roadWidth + cols * step;
  const worldHeight = roadWidth + rows * step;

  const roadCentersX: number[] = [];
  const roadCentersY: number[] = [];

  for (let c = 0; c <= cols; c++) {
    roadCentersX.push(roadWidth / 2 + c * step);
  }
  for (let r = 0; r <= rows; r++) {
    roadCentersY.push(roadWidth / 2 + r * step);
  }

  // Spawn player right on the central avenue facing straight along the open road
  const midIdx = Math.floor(cols / 2);
  const spawnPoint = {
    x: roadCentersX[midIdx] - 40,
    y: roadCentersY[midIdx] + 28,
    angle: 0,
  };

  return {
    mapId: theme.id,
    worldWidth,
    worldHeight,
    blockSize,
    roadWidth,
    cols,
    rows,
    roadCentersX,
    roadCentersY,
    spawnPoint,
  };
}

export function generateCityBuildingsAndProps(
  map: CityMapData,
  seed = getMapTheme(map.mapId).seed
): { buildings: BuildingEntity[]; props: StreetProp[] } {
  const rng = seededRandom(seed);
  const buildings: BuildingEntity[] = [];
  const props: StreetProp[] = [];
  const step = map.blockSize + map.roadWidth;

  let bId = 1;
  let pId = 1;
  const sidewalkInset = 32;
  const propKinds: PropKind[] = ['hydrant', 'lamp', 'mailbox', 'bench', 'crate'];

  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const bx = map.roadWidth + col * step;
      const by = map.roadWidth + row * step;

      // Subdivide each city block into a 2x2 grid of super-easy-to-crush shops/buildings
      const innerW = map.blockSize - sidewalkInset * 2;
      const innerH = map.blockSize - sidewalkInset * 2;
      const gap = 22;
      const cellW = (innerW - gap) / 2;
      const cellH = (innerH - gap) / 2;

      for (let subY = 0; subY < 2; subY++) {
        for (let subX = 0; subX < 2; subX++) {
          // Leave occasional open plaza corner for driving shortcuts
          if (
            (row === 7 || row === 8) &&
            (col === 7 || col === 8) &&
            subX === 1 &&
            subY === 1
          ) {
            continue;
          }
          const tpl =
            BUILDING_TEMPLATES[Math.floor(rng() * BUILDING_TEMPLATES.length)];
          const padW = 4 + Math.floor(rng() * 14);
          const padH = 4 + Math.floor(rng() * 14);
          const x = bx + sidewalkInset + subX * (cellW + gap) + padW / 2;
          const y = by + sidewalkInset + subY * (cellH + gap) + padH / 2;
          const w = cellW - padW;
          const h = cellH - padH;

          buildings.push({
            id: bId++,
            template: tpl,
            x,
            y,
            w,
            h,
            hp: tpl.maxHp,
            maxHp: tpl.maxHp,
            crushed: false,
            rebuildTimer: 0,
            hitFlashTimer: 0,
            shakeTimer: 0,
          });
        }
      }

      // Place destructible sidewalk props around block perimeter
      const corners = [
        { x: bx + 16, y: by + 16 },
        { x: bx + map.blockSize - 16, y: by + 16 },
        { x: bx + 16, y: by + map.blockSize - 16 },
        { x: bx + map.blockSize - 16, y: by + map.blockSize - 16 },
        { x: bx + map.blockSize / 2, y: by + 14 },
        { x: bx + map.blockSize / 2, y: by + map.blockSize - 14 },
        { x: bx + 14, y: by + map.blockSize / 2 },
        { x: bx + map.blockSize - 14, y: by + map.blockSize / 2 },
      ];

      for (const pt of corners) {
        if (rng() < 0.72) {
          const kind = propKinds[Math.floor(rng() * propKinds.length)];
          const reward = kind === 'hydrant' ? 55 : kind === 'lamp' ? 45 : 35;
          props.push({
            id: pId++,
            kind,
            x: pt.x,
            y: pt.y,
            radius: kind === 'bench' ? 11 : 8,
            reward,
            crushed: false,
            rebuildTimer: 0,
          });
        }
      }
    }
  }

  return { buildings, props };
}

export function isPointOnRoad(map: CityMapData, x: number, y: number): boolean {
  const halfRoad = map.roadWidth / 2;
  for (const rx of map.roadCentersX) {
    if (Math.abs(x - rx) <= halfRoad) return true;
  }
  for (const ry of map.roadCentersY) {
    if (Math.abs(y - ry) <= halfRoad) return true;
  }
  return false;
}
