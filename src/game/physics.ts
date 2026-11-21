import { CAR_CATALOG } from './catalog';
import { CameraMode, CarBodyShape, CarSpec, ViewMode } from './types';

export type CrashOutcome = 'crush' | 'chip' | 'deflect';

export function normalizeViewMode(value: unknown): ViewMode {
  return value === '3d' ? '3d' : '2d';
}

export function normalizeCameraMode(value: unknown): CameraMode {
  return value === 'first' ? 'first' : 'third';
}

export function getFirstPersonEyeOffset(
  bodyShape: CarBodyShape,
  length2d: number
): { forward: number; height: number; hoodHeight: number } {
  const L = length2d / 12; // WORLD_SCALE_3D = 1/12
  const clearance = bodyShape === 'monster' ? 0.66 : 0.24;
  switch (bodyShape) {
    case 'supercar':
      return { forward: L * 0.04, height: clearance + 0.88, hoodHeight: clearance + 0.45 };
    case 'hatch':
      return { forward: L * 0.04, height: clearance + 0.98, hoodHeight: clearance + 0.56 };
    case 'truck':
    case 'monster':
      return { forward: L * 0.05, height: clearance + 1.18, hoodHeight: clearance + 0.72 };
    case 'van':
      return { forward: L * 0.16, height: clearance + 1.2, hoodHeight: clearance + 0.7 };
    case 'bus':
      return { forward: L * 0.34, height: clearance + 1.34, hoodHeight: clearance + 0.86 };
    case 'bulldozer':
      return { forward: -L * 0.12, height: clearance + 1.5, hoodHeight: clearance + 0.94 };
    default:
      // coupe / sedan / muscle
      return { forward: L * 0.03, height: clearance + 1.02, hoodHeight: clearance + 0.6 };
  }
}

/**
 * Determines whether the player's car crushes an object, chips it, or deflects off it.
 * - Uncrushable objects (super expensive exotic cars) ALWAYS deflect.
 * - Small cars & buildings have low resistance and crush easily at almost any driving speed.
 */
export function evaluateCrashOutcome(
  playerSpeed: number,
  carSpec: CarSpec,
  targetResistance: number,
  uncrushable: boolean
): CrashOutcome {
  if (uncrushable) {
    return 'deflect';
  }

  // Minimum impact momentum includes car's inherent smashPower so heavy/starter cars crush low-resistance buildings & mini cars effortlessly
  const speedFactor = Math.max(0.55, Math.abs(playerSpeed) / 170);
  const impactScore = speedFactor * carSpec.smashPower;

  if (impactScore >= targetResistance) {
    return 'crush';
  }
  return 'chip';
}

export function getComboMultiplier(comboCount: number): number {
  if (comboCount <= 1) return 1;
  return Number((1 + Math.min(comboCount - 1, 12) * 0.25).toFixed(2));
}

export function calculateCrashReward(
  baseReward: number,
  carSpec: CarSpec,
  comboCount: number
): number {
  if (baseReward <= 0) return 0;
  const comboMult = getComboMultiplier(comboCount);
  return Math.round(baseReward * carSpec.cashMultiplier * comboMult);
}

export function computeWantedStars(heat: number): number {
  if (heat <= 0) return 0;
  if (heat < 20) return 1;
  if (heat < 42) return 2;
  if (heat < 66) return 3;
  if (heat < 86) return 4;
  return 5;
}

export interface ShopPurchaseResult {
  success: boolean;
  reason?: 'already_owned' | 'not_found' | 'insufficient_funds';
  newMoney: number;
  newOwnedIds: string[];
  equippedCarId: string;
}

export function purchaseCarFromShop(
  currentMoney: number,
  ownedCarIds: string[],
  currentEquippedId: string,
  targetCarId: string
): ShopPurchaseResult {
  const car = CAR_CATALOG.find((c) => c.id === targetCarId);
  if (!car) {
    return {
      success: false,
      reason: 'not_found',
      newMoney: currentMoney,
      newOwnedIds: ownedCarIds,
      equippedCarId: currentEquippedId,
    };
  }

  if (ownedCarIds.includes(targetCarId)) {
    return {
      success: false,
      reason: 'already_owned',
      newMoney: currentMoney,
      newOwnedIds: ownedCarIds,
      equippedCarId: currentEquippedId,
    };
  }

  if (currentMoney < car.price) {
    return {
      success: false,
      reason: 'insufficient_funds',
      newMoney: currentMoney,
      newOwnedIds: ownedCarIds,
      equippedCarId: currentEquippedId,
    };
  }

  return {
    success: true,
    newMoney: currentMoney - car.price,
    newOwnedIds: [...ownedCarIds, targetCarId],
    equippedCarId: targetCarId,
  };
}

export function getShopCarCounts(ownedCarIds: string[]): {
  ownedCount: number;
  totalCount: number;
} {
  const ownedSet = new Set(ownedCarIds);
  let ownedCount = 0;
  for (const car of CAR_CATALOG) {
    if (ownedSet.has(car.id)) ownedCount++;
  }
  return {
    ownedCount,
    totalCount: CAR_CATALOG.length,
  };
}

export function getRemainingShopCost(ownedCarIds: string[]): {
  totalCost: number;
  remainingCount: number;
} {
  const ownedSet = new Set(ownedCarIds);
  let totalCost = 0;
  let remainingCount = 0;
  for (const car of CAR_CATALOG) {
    if (!ownedSet.has(car.id)) {
      totalCost += car.price;
      remainingCount++;
    }
  }
  return { totalCost, remainingCount };
}

export interface BuyAllShopResult {
  success: boolean;
  reason?: 'already_all_owned' | 'insufficient_funds';
  totalCost: number;
  remainingCount: number;
  newMoney: number;
  newOwnedIds: string[];
  equippedCarId: string;
}

export function purchaseAllFromShop(
  currentMoney: number,
  ownedCarIds: string[],
  currentEquippedId: string
): BuyAllShopResult {
  const { totalCost, remainingCount } = getRemainingShopCost(ownedCarIds);
  if (remainingCount === 0) {
    return {
      success: false,
      reason: 'already_all_owned',
      totalCost: 0,
      remainingCount: 0,
      newMoney: currentMoney,
      newOwnedIds: ownedCarIds,
      equippedCarId: currentEquippedId,
    };
  }

  if (currentMoney < totalCost) {
    return {
      success: false,
      reason: 'insufficient_funds',
      totalCost,
      remainingCount,
      newMoney: currentMoney,
      newOwnedIds: ownedCarIds,
      equippedCarId: currentEquippedId,
    };
  }

  const allIds = CAR_CATALOG.map((c) => c.id);
  const topCarId = CAR_CATALOG[CAR_CATALOG.length - 1]?.id ?? currentEquippedId;
  return {
    success: true,
    totalCost,
    remainingCount,
    newMoney: currentMoney - totalCost,
    newOwnedIds: allIds,
    equippedCarId: topCarId,
  };
}

export function circleIntersectsRect(
  cx: number,
  cy: number,
  radius: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): { hit: boolean; nx: number; ny: number; overlap: number } {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= radius * radius) {
    return { hit: false, nx: 0, ny: 0, overlap: 0 };
  }

  const dist = Math.sqrt(distSq);
  if (dist > 0.0001) {
    return {
      hit: true,
      nx: dx / dist,
      ny: dy / dist,
      overlap: radius - dist,
    };
  }

  // Center is inside rect: push out along shortest axis
  const leftDist = cx - rx;
  const rightDist = rx + rw - cx;
  const topDist = cy - ry;
  const bottomDist = ry + rh - cy;
  const minDist = Math.min(leftDist, rightDist, topDist, bottomDist);
  if (minDist === leftDist) return { hit: true, nx: -1, ny: 0, overlap: radius + leftDist };
  if (minDist === rightDist) return { hit: true, nx: 1, ny: 0, overlap: radius + rightDist };
  if (minDist === topDist) return { hit: true, nx: 0, ny: -1, overlap: radius + topDist };
  return { hit: true, nx: 0, ny: 1, overlap: radius + bottomDist };
}

const DEFAULT_OWNER_KEYS = ['max moore', 'max', 'vacevskijandrij923@gmail.com'];

export function verifyOwnerPassphrase(
  input: string,
  customPin?: string | null
): boolean {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return false;
  if (customPin && customPin.trim().length > 0) {
    return normalized === customPin.trim().toLowerCase();
  }
  return DEFAULT_OWNER_KEYS.includes(normalized);
}

export function clampAdminMoney(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.min(999_999_999_999, Math.round(amount)));
}
