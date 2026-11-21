import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDING_TEMPLATES,
  CAR_CATALOG,
  TRAFFIC_ARCHETYPES,
  getCarSpec,
} from './catalog';
import {
  MAP_IDS,
  MAP_THEMES,
  createCityMap,
  generateCityBuildingsAndProps,
  getNextMapId,
  isPointOnRoad,
  normalizeMapId,
} from './cityGen';
import {
  calculateCrashReward,
  circleIntersectsRect,
  clampAdminMoney,
  computeWantedStars,
  evaluateCrashOutcome,
  getFirstPersonEyeOffset,
  getRemainingShopCost,
  getShopCarCounts,
  normalizeCameraMode,
  normalizeViewMode,
  purchaseAllFromShop,
  purchaseCarFromShop,
  verifyOwnerPassphrase,
} from './physics';
import { CarBodyShape } from './types';

test('catalog contains 1,000 purchasable cars with unique IDs and shop counter tracks ownership', () => {
  assert.equal(CAR_CATALOG.length, 1000);
  const uniqueIds = new Set(CAR_CATALOG.map((c) => c.id));
  assert.equal(uniqueIds.size, 1000);
  for (let i = 1; i < CAR_CATALOG.length; i++) {
    assert.ok(
      CAR_CATALOG[i].price >= CAR_CATALOG[i - 1].price,
      `Expected ${CAR_CATALOG[i].id} price to be >= ${CAR_CATALOG[i - 1].id}`
    );
  }
  const initialCounts = getShopCarCounts(['rusty-hatch']);
  assert.deepEqual(initialCounts, { ownedCount: 1, totalCount: 1000 });
});

test('small traffic cars crush super easily even with starter car', () => {
  const starter = getCarSpec('rusty-hatch');
  const smallCars = TRAFFIC_ARCHETYPES.filter((t) => t.tier === 'small');
  assert.ok(smallCars.length >= 3);

  for (const small of smallCars) {
    assert.equal(small.uncrushable, false);
    const outcome = evaluateCrashOutcome(
      120,
      starter,
      small.crushResistance,
      small.uncrushable
    );
    assert.equal(outcome, 'crush');
  }
});

test('super expensive exotic cars CANNOT be crushed even by Titan Monster Truck', () => {
  const titan = getCarSpec('titan-monster');
  const exotics = TRAFFIC_ARCHETYPES.filter((t) => t.tier === 'exotic');
  assert.ok(exotics.length >= 3);

  for (const exotic of exotics) {
    assert.equal(exotic.uncrushable, true);
    const outcome = evaluateCrashOutcome(
      800,
      titan,
      exotic.crushResistance,
      exotic.uncrushable
    );
    assert.equal(outcome, 'deflect');
  }
});

test('buildings are super easy to crush with starter car', () => {
  const starter = getCarSpec('rusty-hatch');
  for (const b of BUILDING_TEMPLATES) {
    const outcome = evaluateCrashOutcome(
      140,
      starter,
      b.crushResistance,
      false
    );
    assert.equal(outcome, 'crush', `Expected ${b.label} to crush easily`);
  }
});

test('crash reward scales with car cashMultiplier and combo count', () => {
  const starter = getCarSpec('rusty-hatch'); // 1.0x
  const titan = getCarSpec('titan-monster'); // 3.5x

  assert.equal(calculateCrashReward(200, starter, 1), 200);
  assert.equal(calculateCrashReward(200, starter, 3), 300); // 1 + 2*0.25 = 1.5x
  assert.equal(calculateCrashReward(200, titan, 1), 700);
});

test('shop purchase deducts cash, unlocks car, equips it, and prevents broke buys', () => {
  const failBuy = purchaseCarFromShop(200, ['rusty-hatch'], 'rusty-hatch', 'pizza-coupe');
  assert.equal(failBuy.success, false);
  assert.equal(failBuy.reason, 'insufficient_funds');
  assert.equal(failBuy.newMoney, 200);

  const okBuy = purchaseCarFromShop(500, ['rusty-hatch'], 'rusty-hatch', 'pizza-coupe');
  assert.equal(okBuy.success, true);
  assert.equal(okBuy.newMoney, 50);
  assert.deepEqual(okBuy.newOwnedIds, ['rusty-hatch', 'pizza-coupe']);
  assert.equal(okBuy.equippedCarId, 'pizza-coupe');
  assert.deepEqual(getShopCarCounts(okBuy.newOwnedIds), {
    ownedCount: 2,
    totalCount: 1000,
  });
});

test('wanted stars escalate cleanly with heat', () => {
  assert.equal(computeWantedStars(0), 0);
  assert.equal(computeWantedStars(10), 1);
  assert.equal(computeWantedStars(35), 2);
  assert.equal(computeWantedStars(55), 3);
  assert.equal(computeWantedStars(75), 4);
  assert.equal(computeWantedStars(95), 5);
});

test('mega-city has 16x16 blocks and player spawn point is on an open road clear of all buildings', () => {
  const map = createCityMap();
  assert.equal(map.cols, 16);
  assert.equal(map.rows, 16);
  assert.ok(map.worldWidth > 7000);
  const { buildings } = generateCityBuildingsAndProps(map);
  assert.ok(buildings.length > 900);
  assert.equal(isPointOnRoad(map, map.spawnPoint.x, map.spawnPoint.y), true);

  for (const b of buildings) {
    const col = circleIntersectsRect(
      map.spawnPoint.x,
      map.spawnPoint.y,
      36,
      b.x,
      b.y,
      b.w,
      b.h
    );
    assert.equal(col.hit, false, 'Player spawn must not overlap any building');
  }
});

test('normalizeViewMode defaults safely to 2d and accepts 3d', () => {
  assert.equal(normalizeViewMode('2d'), '2d');
  assert.equal(normalizeViewMode('3d'), '3d');
  assert.equal(normalizeViewMode('invalid'), '2d');
  assert.equal(normalizeViewMode(null), '2d');
});

test('purchaseAllFromShop unlocks every car when cash is sufficient and blocks when broke', () => {
  const { totalCost, remainingCount } = getRemainingShopCost(['rusty-hatch']);
  assert.equal(remainingCount, 999);
  assert.ok(totalCost > 1000000);

  const brokeResult = purchaseAllFromShop(totalCost - 1, ['rusty-hatch'], 'rusty-hatch');
  assert.equal(brokeResult.success, false);
  assert.equal(brokeResult.reason, 'insufficient_funds');
  assert.equal(brokeResult.newOwnedIds.length, 1);

  const successResult = purchaseAllFromShop(totalCost + 500, ['rusty-hatch'], 'rusty-hatch');
  assert.equal(successResult.success, true);
  assert.equal(successResult.newMoney, 500);
  assert.equal(successResult.newOwnedIds.length, 1000);
  assert.equal(successResult.equippedCarId, CAR_CATALOG[CAR_CATALOG.length - 1].id);
  assert.deepEqual(getShopCarCounts(successResult.newOwnedIds), {
    ownedCount: 1000,
    totalCount: 1000,
  });

  const repeatResult = purchaseAllFromShop(500, successResult.newOwnedIds, successResult.equippedCarId);
  assert.equal(repeatResult.success, false);
  assert.equal(repeatResult.reason, 'already_all_owned');
});

test('map themes cycle through 4 distinct 16x16 maps with valid road spawns', () => {
  assert.equal(MAP_IDS.length, 4);
  assert.equal(normalizeMapId('unknown-city'), 'downtown');
  assert.equal(getNextMapId('downtown'), 'neon-night');
  assert.equal(getNextMapId('frost-harbor'), 'downtown');

  for (const id of MAP_IDS) {
    const theme = MAP_THEMES[id];
    const map = createCityMap(id);
    assert.equal(map.mapId, id);
    assert.equal(map.cols, 16);
    assert.equal(map.rows, 16);
    assert.equal(isPointOnRoad(map, map.spawnPoint.x, map.spawnPoint.y), true);
    assert.ok(theme.name.length > 0);
  }
});

test('owner admin verification accepts only owner credentials or custom PIN and clamps cash', () => {
  assert.equal(verifyOwnerPassphrase('Max Moore'), true);
  assert.equal(verifyOwnerPassphrase('  max moore '), true);
  assert.equal(verifyOwnerPassphrase('vacevskijandrij923@gmail.com'), true);
  assert.equal(verifyOwnerPassphrase('max'), true);
  assert.equal(verifyOwnerPassphrase('my-secret-pin', 'my-secret-pin'), true);

  assert.equal(verifyOwnerPassphrase(''), false);
  assert.equal(verifyOwnerPassphrase('stranger'), false);
  assert.equal(verifyOwnerPassphrase('1234', '9999'), false);

  assert.equal(clampAdminMoney(-500), 0);
  assert.equal(clampAdminMoney(1234.6), 1235);
  assert.equal(clampAdminMoney(5_000_000_000_000), 999_999_999_999);
});

test('first-person camera mode normalizes safely and places eye cleanly above every car hood', () => {
  assert.equal(normalizeCameraMode('first'), 'first');
  assert.equal(normalizeCameraMode('third'), 'third');
  assert.equal(normalizeCameraMode('invalid'), 'third');
  assert.equal(normalizeCameraMode(null), 'third');

  const shapes: CarBodyShape[] = [
    'hatch',
    'coupe',
    'sedan',
    'muscle',
    'van',
    'truck',
    'supercar',
    'bus',
    'bulldozer',
    'monster',
  ];
  for (const shape of shapes) {
    const eye = getFirstPersonEyeOffset(shape, 52);
    assert.ok(
      eye.height > eye.hoodHeight + 0.3,
      `Expected ${shape} eye height (${eye.height}) well above hood (${eye.hoodHeight})`
    );
  }
});
