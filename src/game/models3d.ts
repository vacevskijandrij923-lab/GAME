import * as THREE from 'three';
import { CarBodyShape } from './types';
import {
  WorldTextures3D,
  getFacadeTexture,
  getSignTexture,
} from './textures3d';

export const WORLD_SCALE_3D = 1 / 12; // 12 2D pixels = 1 3D meter

export interface CarModelRefs {
  group: THREE.Group;
  wheels: THREE.Mesh[];
  sirenRed?: THREE.Mesh;
  sirenBlue?: THREE.Mesh;
  boostFlame?: THREE.Group;
  bodyMeshes: THREE.Mesh[];
  cabinMeshes: THREE.Object3D[];
  originalMaterials: Map<THREE.Mesh, THREE.Material>;
}

export interface CarMeshBuildOptions {
  bodyShape: CarBodyShape;
  width2d: number;
  length2d: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  isPolice?: boolean;
  policeRole?: 'interceptor' | 'enforcer';
  isExotic?: boolean;
  includeContactShadow?: boolean;
  contactShadowTex?: THREE.CanvasTexture;
}

const _tireGeo = new THREE.CylinderGeometry(1, 1, 1, 18);
const _rimGeo = new THREE.CylinderGeometry(0.62, 0.62, 1.03, 14);
const _hubGeo = new THREE.CylinderGeometry(0.24, 0.24, 1.06, 10);
const _spokeGeo = new THREE.BoxGeometry(0.95, 1.04, 0.14);

const _wheelMat = new THREE.MeshStandardMaterial({
  color: 0x11141a,
  roughness: 0.86,
  metalness: 0.1,
});
const _rimMat = new THREE.MeshStandardMaterial({
  color: 0xdbeafe,
  roughness: 0.22,
  metalness: 0.88,
});
const _hubMat = new THREE.MeshStandardMaterial({
  color: 0x334155,
  roughness: 0.3,
  metalness: 0.85,
});
const _glassMat = new THREE.MeshPhysicalMaterial({
  color: 0x0b1322,
  roughness: 0.05,
  metalness: 0.2,
  clearcoat: 1.0,
  clearcoatRoughness: 0.04,
});
const _chromeMat = new THREE.MeshStandardMaterial({
  color: 0xe2e8f0,
  roughness: 0.18,
  metalness: 0.92,
});
const _trimDarkMat = new THREE.MeshStandardMaterial({
  color: 0x181c24,
  roughness: 0.72,
  metalness: 0.25,
});
const _grilleMat = new THREE.MeshStandardMaterial({
  color: 0x090d14,
  roughness: 0.55,
  metalness: 0.65,
});
const _plateMat = new THREE.MeshStandardMaterial({
  color: 0xf8fafc,
  roughness: 0.45,
  metalness: 0.1,
});
const _headlightMat = new THREE.MeshStandardMaterial({
  color: 0xfef9c3,
  emissive: 0xfef08a,
  emissiveIntensity: 1.5,
  roughness: 0.15,
});
const _taillightMat = new THREE.MeshStandardMaterial({
  color: 0xef4444,
  emissive: 0xdc2626,
  emissiveIntensity: 1.45,
  roughness: 0.25,
});
const _amberMat = new THREE.MeshStandardMaterial({
  color: 0xf59e0b,
  emissive: 0xd97706,
  emissiveIntensity: 1.0,
  roughness: 0.25,
});
export const HIT_FLASH_MAT_3D = new THREE.MeshBasicMaterial({ color: 0xffffff });

const _lowerGeoCache = new Map<string, THREE.BufferGeometry>();
const _cabinGeoCache = new Map<string, THREE.BufferGeometry>();
const _glassGeoCache = new Map<string, THREE.BufferGeometry>();

function getSculptedBodyGeometries(
  bodyShape: CarBodyShape,
  L: number,
  W: number,
  clearance: number
): {
  lowerGeo: THREE.BufferGeometry;
  cabinGeo: THREE.BufferGeometry;
  glassGeo: THREE.BufferGeometry | null;
} {
  const key = `${bodyShape}|${L.toFixed(2)}|${W.toFixed(2)}|${clearance.toFixed(2)}`;
  const cachedLower = _lowerGeoCache.get(key);
  const cachedCabin = _cabinGeoCache.get(key);
  if (cachedLower && cachedCabin) {
    return {
      lowerGeo: cachedLower,
      cabinGeo: cachedCabin,
      glassGeo: _glassGeoCache.get(key) ?? null,
    };
  }

  const hL = L / 2;
  const bevel = Math.min(0.075, W * 0.038);
  const bodyDepth = Math.max(0.4, W - bevel * 2);
  const isBoxyTransit = bodyShape === 'van' || bodyShape === 'bus';
  const cabinDepth = Math.max(0.32, (isBoxyTransit ? W * 0.9 : W * 0.76) - bevel * 2);
  const gDepth = cabinDepth + 0.045;

  const lowerShape = new THREE.Shape();
  const cabinShape = new THREE.Shape();
  const gShape = new THREE.Shape();
  const base = clearance;

  if (bodyShape === 'supercar') {
    const hoodY = base + 0.45;
    const roofY = base + 0.94;
    lowerShape.moveTo(-hL, base + 0.08);
    lowerShape.lineTo(hL - 0.12, base + 0.06);
    lowerShape.lineTo(hL, base + 0.24);
    lowerShape.lineTo(hL * 0.56, hoodY);
    lowerShape.lineTo(-hL * 0.76, hoodY + 0.1);
    lowerShape.lineTo(-hL, base + 0.36);
    lowerShape.closePath();

    cabinShape.moveTo(-hL * 0.52, hoodY - 0.06);
    cabinShape.lineTo(hL * 0.46, hoodY - 0.06);
    cabinShape.lineTo(hL * 0.16, roofY);
    cabinShape.lineTo(-hL * 0.24, roofY);
    cabinShape.closePath();

    gShape.moveTo(-hL * 0.54, hoodY + 0.03);
    gShape.lineTo(hL * 0.48, hoodY + 0.02);
    gShape.lineTo(hL * 0.18, roofY - 0.06);
    gShape.lineTo(-hL * 0.26, roofY - 0.06);
    gShape.closePath();
  } else if (bodyShape === 'hatch') {
    const beltY = base + 0.56;
    const roofY = base + 1.15;
    lowerShape.moveTo(-hL, base + 0.06);
    lowerShape.lineTo(hL, base + 0.06);
    lowerShape.lineTo(hL, base + 0.36);
    lowerShape.lineTo(hL * 0.56, beltY);
    lowerShape.lineTo(-hL * 0.96, beltY);
    lowerShape.lineTo(-hL, base + 0.22);
    lowerShape.closePath();

    cabinShape.moveTo(-hL * 0.91, beltY - 0.08);
    cabinShape.lineTo(hL * 0.48, beltY - 0.08);
    cabinShape.lineTo(hL * 0.17, roofY);
    cabinShape.lineTo(-hL * 0.68, roofY - 0.02);
    cabinShape.closePath();

    gShape.moveTo(-hL * 0.93, beltY + 0.02);
    gShape.lineTo(hL * 0.50, beltY + 0.02);
    gShape.lineTo(hL * 0.19, roofY - 0.07);
    gShape.lineTo(-hL * 0.66, roofY - 0.08);
    gShape.closePath();
  } else if (bodyShape === 'truck' || bodyShape === 'monster') {
    const hoodY = base + 0.72;
    const roofY = base + 1.36;
    lowerShape.moveTo(-hL, base + 0.1);
    lowerShape.lineTo(hL, base + 0.1);
    lowerShape.lineTo(hL, hoodY - 0.12);
    lowerShape.lineTo(hL * 0.44, hoodY);
    lowerShape.lineTo(-hL, hoodY + 0.04);
    lowerShape.closePath();

    cabinShape.moveTo(-hL * 0.26, hoodY - 0.08);
    cabinShape.lineTo(hL * 0.4, hoodY - 0.08);
    cabinShape.lineTo(hL * 0.15, roofY);
    cabinShape.lineTo(-hL * 0.21, roofY);
    cabinShape.closePath();

    gShape.moveTo(-hL * 0.28, hoodY + 0.04);
    gShape.lineTo(hL * 0.42, hoodY + 0.03);
    gShape.lineTo(hL * 0.17, roofY - 0.08);
    gShape.lineTo(-hL * 0.23, roofY - 0.08);
    gShape.closePath();
  } else if (bodyShape === 'van') {
    const hoodY = base + 0.7;
    const roofY = base + 1.54;
    lowerShape.moveTo(-hL, base + 0.06);
    lowerShape.lineTo(hL, base + 0.06);
    lowerShape.lineTo(hL, hoodY - 0.1);
    lowerShape.lineTo(hL * 0.74, hoodY + 0.06);
    lowerShape.lineTo(-hL, hoodY + 0.06);
    lowerShape.closePath();

    cabinShape.moveTo(-hL * 0.96, hoodY - 0.06);
    cabinShape.lineTo(hL * 0.72, hoodY - 0.06);
    cabinShape.lineTo(hL * 0.43, roofY);
    cabinShape.lineTo(-hL * 0.92, roofY);
    cabinShape.closePath();

    gShape.moveTo(-hL * 0.94, hoodY + 0.06);
    gShape.lineTo(hL * 0.74, hoodY + 0.05);
    gShape.lineTo(hL * 0.45, roofY - 0.1);
    gShape.lineTo(-hL * 0.9, roofY - 0.1);
    gShape.closePath();
  } else if (bodyShape === 'bus') {
    const beltY = base + 0.86;
    const roofY = base + 1.74;
    lowerShape.moveTo(-hL, base + 0.08);
    lowerShape.lineTo(hL, base + 0.08);
    lowerShape.lineTo(hL, beltY);
    lowerShape.lineTo(-hL, beltY);
    lowerShape.closePath();

    cabinShape.moveTo(-hL * 0.97, beltY - 0.06);
    cabinShape.lineTo(hL * 0.96, beltY - 0.06);
    cabinShape.lineTo(hL * 0.84, roofY);
    cabinShape.lineTo(-hL * 0.94, roofY);
    cabinShape.closePath();

    gShape.moveTo(-hL * 0.98, beltY + 0.03);
    gShape.lineTo(hL * 0.97, beltY + 0.03);
    gShape.lineTo(hL * 0.85, roofY - 0.18);
    gShape.lineTo(-hL * 0.95, roofY - 0.18);
    gShape.closePath();
  } else if (bodyShape === 'bulldozer') {
    const hoodY = base + 0.94;
    const roofY = base + 1.92;
    lowerShape.moveTo(-hL, base + 0.12);
    lowerShape.lineTo(hL * 0.88, base + 0.12);
    lowerShape.lineTo(hL * 0.88, hoodY - 0.15);
    lowerShape.lineTo(hL * 0.12, hoodY);
    lowerShape.lineTo(-hL * 0.92, hoodY);
    lowerShape.lineTo(-hL, base + 0.4);
    lowerShape.closePath();

    cabinShape.moveTo(-hL * 0.82, hoodY - 0.08);
    cabinShape.lineTo(hL * 0.08, hoodY - 0.08);
    cabinShape.lineTo(-hL * 0.06, roofY);
    cabinShape.lineTo(-hL * 0.72, roofY);
    cabinShape.closePath();

    gShape.moveTo(-hL * 0.84, hoodY + 0.04);
    gShape.lineTo(hL * 0.1, hoodY + 0.04);
    gShape.lineTo(-hL * 0.05, roofY - 0.12);
    gShape.lineTo(-hL * 0.74, roofY - 0.12);
    gShape.closePath();
  } else {
    // coupe / sedan / muscle
    const isMuscle = bodyShape === 'muscle';
    const isCoupe = bodyShape === 'coupe';
    const beltY = base + (isMuscle ? 0.6 : 0.58);
    const roofY = base + (isCoupe ? 1.1 : 1.16);
    const hoodEnd = isMuscle ? hL * 0.36 : hL * 0.44;
    lowerShape.moveTo(-hL, base + 0.06);
    lowerShape.lineTo(hL, base + 0.06);
    lowerShape.lineTo(hL, base + 0.36);
    lowerShape.lineTo(hoodEnd, beltY);
    lowerShape.lineTo(-hL * 0.72, beltY + 0.03);
    lowerShape.lineTo(-hL, beltY - 0.04);
    lowerShape.closePath();

    cabinShape.moveTo(-hL * 0.7, beltY - 0.08);
    cabinShape.lineTo(hoodEnd - 0.02, beltY - 0.08);
    cabinShape.lineTo(hoodEnd - L * 0.14, roofY);
    cabinShape.lineTo(-hL * 0.35, roofY);
    cabinShape.closePath();

    gShape.moveTo(-hL * 0.72, beltY + 0.03);
    gShape.lineTo(hoodEnd, beltY + 0.02);
    gShape.lineTo(hoodEnd - L * 0.12, roofY - 0.07);
    gShape.lineTo(-hL * 0.37, roofY - 0.07);
    gShape.closePath();
  }

  const lowerGeo = new THREE.ExtrudeGeometry(lowerShape, {
    depth: bodyDepth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.75,
    bevelSegments: 2,
    curveSegments: 6,
  });
  lowerGeo.translate(0, 0, -bodyDepth / 2);
  lowerGeo.computeVertexNormals();
  _lowerGeoCache.set(key, lowerGeo);

  const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
    depth: cabinDepth,
    bevelEnabled: true,
    bevelThickness: bevel * 0.85,
    bevelSize: bevel * 0.65,
    bevelSegments: 2,
    curveSegments: 6,
  });
  cabinGeo.translate(0, 0, -cabinDepth / 2);
  cabinGeo.computeVertexNormals();
  _cabinGeoCache.set(key, cabinGeo);

  const glassGeo = new THREE.ExtrudeGeometry(gShape, {
    depth: gDepth,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.018,
    bevelSegments: 1,
  });
  glassGeo.translate(0, 0, -gDepth / 2);
  glassGeo.computeVertexNormals();
  _glassGeoCache.set(key, glassGeo);

  return { lowerGeo, cabinGeo, glassGeo };
}

export function buildCarMesh3D(opts: CarMeshBuildOptions): CarModelRefs {
  const group = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  const bodyMeshes: THREE.Mesh[] = [];
  const cabinMeshes: THREE.Object3D[] = [];
  const originalMaterials = new Map<THREE.Mesh, THREE.Material>();

  const W = opts.width2d * WORLD_SCALE_3D;
  const L = opts.length2d * WORLD_SCALE_3D;
  const isMonster = opts.bodyShape === 'monster';
  const isDozer = opts.bodyShape === 'bulldozer';
  const isBus = opts.bodyShape === 'bus';
  const isVan = opts.bodyShape === 'van';
  const isTruck = opts.bodyShape === 'truck';
  const isSupercar = opts.bodyShape === 'supercar';
  const isMuscle = opts.bodyShape === 'muscle';

  const wheelRadius = isMonster ? 0.68 : isBus || isDozer ? 0.46 : 0.35;
  const wheelWidth = isMonster ? 0.54 : 0.28;
  const chassisClearance = isMonster ? 0.66 : 0.24;
  const topHeight = isBus
    ? 1.76
    : isVan
    ? 1.56
    : isDozer
    ? 1.95
    : isTruck || isMonster
    ? 1.38
    : isSupercar
    ? 0.96
    : 1.18;

  // Glossy automotive clearcoat lacquer
  const paintMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(opts.primaryColor),
    metalness: opts.isExotic ? 0.85 : 0.48,
    roughness: opts.isExotic ? 0.14 : 0.24,
    clearcoat: 1.0,
    clearcoatRoughness: 0.07,
  });

  const accentPaintMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(opts.secondaryColor),
    metalness: opts.isExotic ? 0.9 : 0.4,
    roughness: 0.22,
    clearcoat: 0.9,
    clearcoatRoughness: 0.08,
  });

  // Soft contact shadow disc
  if (opts.includeContactShadow && opts.contactShadowTex) {
    const shadowGeo = new THREE.PlaneGeometry(L * 1.3, W * 1.42);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: opts.contactShadowTex,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
    });
    const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = 0.025;
    group.add(shadowDisc);
  }

  // 1. Two-Part Sculpted Beveled Body (Wide Lower Haunches + Tapered Cabin) + Wraparound Glass
  const { lowerGeo, cabinGeo, glassGeo } = getSculptedBodyGeometries(
    opts.bodyShape,
    L,
    W,
    chassisClearance
  );
  const lowerHull = new THREE.Mesh(lowerGeo, paintMat);
  lowerHull.castShadow = true;
  lowerHull.receiveShadow = true;
  group.add(lowerHull);
  bodyMeshes.push(lowerHull);
  originalMaterials.set(lowerHull, paintMat);

  const cabinHull = new THREE.Mesh(cabinGeo, paintMat);
  cabinHull.castShadow = true;
  cabinHull.receiveShadow = true;
  group.add(cabinHull);
  bodyMeshes.push(cabinHull);
  cabinMeshes.push(cabinHull);
  originalMaterials.set(cabinHull, paintMat);

  if (glassGeo) {
    const glassMesh = new THREE.Mesh(glassGeo, _glassMat);
    group.add(glassMesh);
    cabinMeshes.push(glassMesh);
  }

  // 2. Dark Underbody Chassis Pan & Side Skirts
  const skirtGeo = new THREE.BoxGeometry(L * 0.96, 0.12, W * 0.98);
  const skirt = new THREE.Mesh(skirtGeo, _trimDarkMat);
  skirt.position.set(0, chassisClearance + 0.04, 0);
  group.add(skirt);

  // 3. Police Two-Tone Doors / Racing Stripes / Muscle Supercharger / Spoilers
  if (opts.isPolice) {
    const doorBand = new THREE.Mesh(
      new THREE.BoxGeometry(L * 0.42, 0.56, W * 1.015),
      accentPaintMat
    );
    doorBand.position.set(0, chassisClearance + 0.36, 0);
    group.add(doorBand);
  } else if (isMuscle || isSupercar || opts.isExotic || opts.bodyShape === 'coupe') {
    for (const side of [-1, 1]) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(L * 0.92, 0.03, W * 0.11),
        accentPaintMat
      );
      stripe.position.set(0, chassisClearance + (isSupercar ? 0.47 : 0.61), side * W * 0.14);
      group.add(stripe);
    }
  } else if (opts.bodyShape === 'hatch') {
    // Rally twin roof & hatch stripes + sporty roof spoiler lip
    for (const side of [-1, 1]) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(L * 0.48, 0.03, W * 0.1),
        accentPaintMat
      );
      stripe.position.set(L * 0.24, chassisClearance + 0.58, side * W * 0.14);
      group.add(stripe);
    }
    const hatchSpoiler = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.07, W * 0.74),
      _trimDarkMat
    );
    hatchSpoiler.position.set(-L * 0.36, chassisClearance + 1.15, 0);
    group.add(hatchSpoiler);
    cabinMeshes.push(hatchSpoiler);
  }

  if (isMuscle) {
    // Raised hood blower & twin chrome scoop
    const blower = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.2, 0.42), _trimDarkMat);
    blower.position.set(L * 0.25, chassisClearance + 0.68, 0);
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.36), _chromeMat);
    intake.position.set(L * 0.32, chassisClearance + 0.74, 0);
    group.add(blower, intake);
  }

  if (isSupercar || opts.isExotic || isMuscle) {
    // Aerodynamic rear GT wing with twin uprights
    const wingY = chassisClearance + (isSupercar ? 0.72 : 0.78);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, W * 0.98), accentPaintMat);
    wing.position.set(-L * 0.45, wingY, 0);
    group.add(wing);
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.06), _trimDarkMat);
      strut.position.set(-L * 0.45, wingY - 0.12, side * W * 0.28);
      group.add(strut);
    }
  }

  // 4. Truck Bed & Rollbar / Monster Suspension / Bulldozer Blade
  if (isTruck || isMonster) {
    // Dark recessed cargo bed liner
    const bed = new THREE.Mesh(
      new THREE.BoxGeometry(L * 0.34, 0.08, W * 0.8),
      _trimDarkMat
    );
    bed.position.set(-L * 0.3, chassisClearance + 0.76, 0);
    group.add(bed);

    // Chrome bull-bar bumper + sport rollbar
    const bullBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.34, W * 0.86),
      _chromeMat
    );
    bullBar.position.set(L * 0.52, chassisClearance + 0.28, 0);
    const rollBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.52, W * 0.78),
      _chromeMat
    );
    rollBar.position.set(-L * 0.16, chassisClearance + 1.0, 0);
    group.add(bullBar, rollBar);
    cabinMeshes.push(rollBar);

    if (isMonster) {
      // Heavy lifted axles & shock struts
      for (const wx of [-L * 0.33, L * 0.33]) {
        const axle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.12, W * 1.15, 8),
          _chromeMat
        );
        axle.rotation.x = Math.PI / 2;
        axle.position.set(wx, wheelRadius, 0);
        group.add(axle);
      }
    }
  }

  if (isDozer) {
    // Curved heavy steel V-blade + hydraulic push arms
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.98, W * 1.3),
      _chromeMat
    );
    blade.position.set(L * 0.56, 0.56, 0);
    blade.castShadow = true;
    const bladeEdge = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.18, W * 1.32),
      accentPaintMat
    );
    bladeEdge.position.set(L * 0.56, 0.16, 0);
    group.add(blade, bladeEdge);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.16, 0.16), _trimDarkMat);
      arm.position.set(L * 0.34, 0.44, side * W * 0.42);
      group.add(arm);
    }
  }

  // 5. Front Grille, Splitter Lip, Side Mirrors, License Plates, Taillights & Exhausts
  const frontLip = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.14, W * 1.02),
    _trimDarkMat
  );
  frontLip.position.set(L * 0.5 + 0.04, chassisClearance + 0.08, 0);
  group.add(frontLip);

  const grille = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.24, W * 0.52),
    _grilleMat
  );
  grille.position.set(L * 0.5 + 0.03, chassisClearance + 0.25, 0);
  group.add(grille);

  const rearDiffuser = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.18, W * 0.98),
    _trimDarkMat
  );
  rearDiffuser.position.set(-L * 0.5 - 0.03, chassisClearance + 0.1, 0);
  group.add(rearDiffuser);

  const rearPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.14, 0.36),
    _plateMat
  );
  rearPlate.position.set(-L * 0.5 - 0.05, chassisClearance + 0.28, 0);
  group.add(rearPlate);

  for (const side of [-1, 1]) {
    // Twin projector headlights
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.34), _headlightMat);
    hl.position.set(L * 0.5 + 0.02, chassisClearance + 0.3, side * W * 0.35);
    group.add(hl);

    // Wide sculpted LED taillight bars + amber corner blinkers
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.38), _taillightMat);
    tl.position.set(-L * 0.5 - 0.02, chassisClearance + 0.36, side * W * 0.34);
    group.add(tl);

    const blinker = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.14), _amberMat);
    blinker.position.set(-L * 0.5 - 0.02, chassisClearance + 0.26, side * W * 0.42);
    group.add(blinker);

    // Dual chrome exhaust tips
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 0.24, 8),
      _chromeMat
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(-L * 0.5 - 0.06, chassisClearance + 0.08, side * W * 0.26);
    group.add(pipe);

    // Aerodynamic side mirrors
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.2), paintMat);
    mirror.position.set(L * 0.14, chassisClearance + 0.64, side * (W * 0.53));
    group.add(mirror);
  }

  // 6. Sculpted Wheel Arch Flares + Multi-Part Deep-Dish Alloy Wheels
  const wheelXs = isBus ? [-L * 0.34, 0, L * 0.34] : [-L * 0.33, L * 0.33];
  for (const wx of wheelXs) {
    for (const side of [-1, 1]) {
      // Wheel arch fender flare
      const flare = new THREE.Mesh(
        new THREE.BoxGeometry(wheelRadius * 2.15, wheelRadius * 0.45, wheelWidth * 0.65),
        _trimDarkMat
      );
      flare.position.set(
        wx,
        wheelRadius * 1.68,
        side * (W * 0.5 + wheelWidth * 0.08)
      );
      group.add(flare);

      const wheelGroup = new THREE.Group();
      const tire = new THREE.Mesh(_tireGeo, _wheelMat);
      tire.rotation.x = Math.PI / 2;
      tire.scale.set(wheelRadius, wheelWidth, wheelRadius);
      tire.castShadow = true;
      wheelGroup.add(tire);

      const rim = new THREE.Mesh(_rimGeo, _rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.scale.set(wheelRadius, wheelWidth, wheelRadius);
      wheelGroup.add(rim);

      const spoke = new THREE.Mesh(_spokeGeo, _hubMat);
      spoke.rotation.x = Math.PI / 2;
      spoke.scale.set(wheelRadius, wheelWidth, wheelRadius);
      wheelGroup.add(spoke);

      const hub = new THREE.Mesh(_hubGeo, _hubMat);
      hub.rotation.x = Math.PI / 2;
      hub.scale.set(wheelRadius, wheelWidth, wheelRadius);
      wheelGroup.add(hub);

      wheelGroup.position.set(wx, wheelRadius, side * (W * 0.5 + wheelWidth * 0.14));
      group.add(wheelGroup);
      wheels.push(tire);
    }
  }

  // 7. Police roof lightbar
  let sirenRed: THREE.Mesh | undefined;
  let sirenBlue: THREE.Mesh | undefined;
  if (opts.isPolice) {
    const roofY = chassisClearance + topHeight + 0.08;
    const redMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 2.2,
    });
    const blueMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x3b82f6,
      emissiveIntensity: 2.2,
    });
    const barBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.08, W * 0.78),
      _trimDarkMat
    );
    barBase.position.set(0, roofY - 0.06, 0);
    sirenRed = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, W * 0.36), redMat);
    sirenRed.position.set(0, roofY + 0.02, -W * 0.19);
    sirenBlue = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, W * 0.36), blueMat);
    sirenBlue.position.set(0, roofY + 0.02, W * 0.19);
    group.add(barBase, sirenRed, sirenBlue);
  }

  // 8. Exotic floating gold diamond emblem above roof
  if (opts.isExotic) {
    const diamondGeo = new THREE.OctahedronGeometry(0.35, 0);
    const diamondMat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.2,
      metalness: 0.95,
      roughness: 0.12,
    });
    const diamond = new THREE.Mesh(diamondGeo, diamondMat);
    diamond.position.set(0, chassisClearance + topHeight + 0.62, 0);
    group.add(diamond);
  }

  // 9. Boost Flame Exhaust cones
  const boostFlame = new THREE.Group();
  const flameGeo = new THREE.ConeGeometry(0.2, 1.35, 8);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
  for (const side of [-1, 1]) {
    const cone = new THREE.Mesh(flameGeo, flameMat);
    cone.rotation.z = Math.PI / 2;
    cone.position.set(-L * 0.5 - 0.68, chassisClearance + 0.16, side * W * 0.26);
    boostFlame.add(cone);
  }
  boostFlame.visible = false;
  group.add(boostFlame);

  return {
    group,
    wheels,
    sirenRed,
    sirenBlue,
    boostFlame,
    bodyMeshes,
    cabinMeshes,
    originalMaterials,
  };
}

export interface BuildingModelRefs {
  group: THREE.Group;
  intactGroup: THREE.Group;
  rubbleGroup: THREE.Group;
}

export function buildBuildingMesh3D(
  w2d: number,
  h2d: number,
  wallColor: string,
  roofColor: string,
  trimColor: string,
  signText: string,
  signColor: string,
  heightVisual: number,
  textures: WorldTextures3D,
  maxAnisotropy: number
): BuildingModelRefs {
  const group = new THREE.Group();
  const intactGroup = new THREE.Group();
  const rubbleGroup = new THREE.Group();

  const W = w2d * WORLD_SCALE_3D;
  const D = h2d * WORLD_SCALE_3D;
  const H = 3.8 + heightVisual * 0.34;

  // 1. Concrete Foundation Plinth
  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.9,
    metalness: 0.05,
  });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.35, D + 0.3), plinthMat);
  plinth.position.y = 0.175;
  plinth.receiveShadow = true;
  intactGroup.add(plinth);

  // 2. Main Textured Storefront Body
  const facadeTex = getFacadeTexture(
    textures.facadeCache,
    wallColor,
    trimColor,
    maxAnisotropy
  );
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: facadeTex,
    roughness: 0.72,
    metalness: 0.08,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallMat);
  body.position.y = 0.35 + H / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  intactGroup.add(body);

  // 3. Colored Architectural Roof & Parapet Trim
  const roofMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(roofColor),
    roughness: 0.65,
    metalness: 0.15,
  });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.35, 0.45, D + 0.35), roofMat);
  roof.position.y = 0.35 + H + 0.22;
  roof.castShadow = true;
  roof.receiveShadow = true;
  intactGroup.add(roof);

  // 4. Rooftop HVAC unit
  const hvacMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.5,
    metalness: 0.6,
  });
  const hvac = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.28, 0.65, D * 0.28),
    hvacMat
  );
  hvac.position.set(W * 0.18, 0.35 + H + 0.75, D * 0.12);
  intactGroup.add(hvac);

  // 5. Storefront Signboard on roof edge (facing +Z and -Z)
  const signTex = getSignTexture(
    textures.signCache,
    signText,
    signColor,
    roofColor,
    maxAnisotropy
  );
  const signMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: signTex,
    roughness: 0.4,
    emissive: new THREE.Color(signColor),
    emissiveIntensity: 0.25,
  });
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(W * 0.58, 1.1, 0.22), signMat);
  signBoard.position.set(0, 0.35 + H + 0.95, D * 0.42);
  intactGroup.add(signBoard);

  // Rubble state (shown when crushed)
  const rubbleSlab = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.92, 0.14, D * 0.92),
    plinthMat
  );
  rubbleSlab.position.y = 0.07;
  rubbleSlab.receiveShadow = true;
  rubbleGroup.add(rubbleSlab);

  for (let i = 0; i < 6; i++) {
    const chunk = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.45, 0.8),
      i % 2 === 0 ? roofMat : plinthMat
    );
    const angle = (i / 6) * Math.PI * 2;
    chunk.position.set(
      Math.cos(angle) * W * 0.26,
      0.26,
      Math.sin(angle) * D * 0.26
    );
    chunk.rotation.y = angle;
    rubbleGroup.add(chunk);
  }
  rubbleGroup.visible = false;

  group.add(intactGroup, rubbleGroup);
  return { group, intactGroup, rubbleGroup };
}

export interface NpcModelRefs {
  group: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  alertMark: THREE.Mesh;
}

const _skinMat = new THREE.MeshStandardMaterial({ color: 0xfdba74, roughness: 0.7 });
const _pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });
const _alertMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

export function buildNpcMesh3D(shirtColor: string, hairColor: string): NpcModelRefs {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(shirtColor),
    roughness: 0.75,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(hairColor),
    roughness: 0.85,
  });

  // Legs
  const legGeo = new THREE.BoxGeometry(0.22, 0.7, 0.22);
  const leftLeg = new THREE.Mesh(legGeo, _pantsMat);
  leftLeg.position.set(0, 0.35, -0.14);
  const rightLeg = new THREE.Mesh(legGeo, _pantsMat);
  rightLeg.position.set(0, 0.35, 0.14);
  group.add(leftLeg, rightLeg);

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.68, 0.52), shirtMat);
  torso.position.y = 1.04;
  torso.castShadow = true;
  group.add(torso);

  // Head + Hair
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), _skinMat);
  head.position.y = 1.58;
  group.add(head);

  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.42), hairMat);
  hair.position.set(-0.04, 1.72, 0);
  group.add(hair);

  // Panic indicator
  const alertMark = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), _alertMat);
  alertMark.position.y = 2.25;
  alertMark.visible = false;
  group.add(alertMark);

  return { group, leftLeg, rightLeg, alertMark };
}
