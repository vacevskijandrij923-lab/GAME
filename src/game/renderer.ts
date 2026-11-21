import { getMapTheme } from './cityGen';
import {
  BuildingEntity,
  CarBodyShape,
  CityMapData,
  FloatingPopup,
  NpcPedestrian,
  Particle,
  PickupItem,
  PlayerState,
  PoliceUnit,
  SkidMark,
  StreetProp,
  TrafficCar,
} from './types';

export interface VehicleDrawOptions {
  bodyShape: CarBodyShape;
  width: number;
  length: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  hitFlash?: boolean;
  isPolice?: boolean;
  policeRole?: 'interceptor' | 'enforcer';
  sirenPhase?: number;
  isExotic?: boolean;
  isBoosting?: boolean;
  crushed?: boolean;
}

export function drawVehicleBody(
  ctx: CanvasRenderingContext2D,
  opts: VehicleDrawOptions
) {
  const {
    bodyShape,
    width,
    length,
    primaryColor,
    secondaryColor,
    accentColor,
    hitFlash,
    isPolice,
    policeRole,
    sirenPhase = 0,
    isExotic,
    isBoosting,
    crushed,
  } = opts;

  const halfL = length / 2;
  const halfW = width / 2;

  ctx.save();
  if (crushed) {
    ctx.globalAlpha = 0.72;
  }

  // Drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
  ctx.beginPath();
  ctx.roundRect(-halfL + 3, -halfW + 4, length, width, 6);
  ctx.fill();

  // Tires
  const tireW = bodyShape === 'monster' ? 14 : 9;
  const tireH = bodyShape === 'monster' ? 8 : 4.5;
  const tireOutset = bodyShape === 'monster' ? 4 : 1.5;
  ctx.fillStyle = '#0F172A';
  const wheelOffsetsX =
    bodyShape === 'bus'
      ? [-halfL + 12, 0, halfL - 12]
      : [-halfL + 9, halfL - 9];
  for (const wx of wheelOffsetsX) {
    ctx.fillRect(wx - tireW / 2, -halfW - tireOutset, tireW, tireH);
    ctx.fillRect(wx - tireW / 2, halfW - tireH + tireOutset, tireW, tireH);
  }

  // Boost flame exhaust
  if (isBoosting && !crushed) {
    const flicker = 0.8 + Math.random() * 0.45;
    ctx.fillStyle = '#F97316';
    ctx.beginPath();
    ctx.moveTo(-halfL, -halfW * 0.45);
    ctx.lineTo(-halfL - 18 * flicker, -halfW * 0.25);
    ctx.lineTo(-halfL, -halfW * 0.05);
    ctx.moveTo(-halfL, halfW * 0.05);
    ctx.lineTo(-halfL - 18 * flicker, halfW * 0.25);
    ctx.lineTo(-halfL, halfW * 0.45);
    ctx.fill();

    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.arc(-halfL - 5 * flicker, -halfW * 0.25, 3.5, 0, Math.PI * 2);
    ctx.arc(-halfL - 5 * flicker, halfW * 0.25, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bulldozer front steel blade
  if (bodyShape === 'bulldozer') {
    ctx.fillStyle = hitFlash ? '#FFFFFF' : '#94A3B8';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(halfL - 1, -halfW - 5);
    ctx.lineTo(halfL + 11, -halfW - 3);
    ctx.lineTo(halfL + 11, halfW + 3);
    ctx.lineTo(halfL - 1, halfW + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Main chassis
  ctx.fillStyle = hitFlash ? '#FFFFFF' : crushed ? '#475569' : primaryColor;
  ctx.strokeStyle = isExotic ? '#FDE047' : '#0F172A';
  ctx.lineWidth = isExotic ? 2.4 : 1.8;
  const cornerRadius =
    bodyShape === 'supercar'
      ? 8
      : bodyShape === 'hatch'
      ? 6
      : bodyShape === 'van' || bodyShape === 'bus'
      ? 4
      : 5;

  ctx.beginPath();
  ctx.roundRect(-halfL, -halfW, length, width, cornerRadius);
  ctx.fill();
  ctx.stroke();

  if (!hitFlash && !crushed) {
    // Racing stripe or two-tone detail
    if (bodyShape === 'muscle' || bodyShape === 'supercar' || isExotic) {
      ctx.fillStyle = secondaryColor;
      ctx.fillRect(-halfL + 3, -3.5, length - 6, 2.5);
      ctx.fillRect(-halfL + 3, 1, length - 6, 2.5);
    } else if (isPolice) {
      // Police white doors / roof band
      ctx.fillStyle = policeRole === 'enforcer' ? '#1E3A8A' : '#F8FAFC';
      ctx.fillRect(-halfL * 0.35, -halfW + 1.5, length * 0.45, width - 3);
    } else if (bodyShape === 'truck') {
      // Pickup bed
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(-halfL + 4, -halfW + 3, length * 0.34, width - 6);
    } else if (bodyShape === 'bus') {
      ctx.fillStyle = secondaryColor;
      ctx.fillRect(-halfL + 4, -halfW + 3, length - 8, 2.5);
      ctx.fillRect(-halfL + 4, halfW - 5.5, length - 8, 2.5);
    }

    // Windshield & rear glass
    ctx.fillStyle = '#0F172A';
    const windFront =
      bodyShape === 'van' || bodyShape === 'bus' ? halfL - 10 : halfL * 0.34;
    const windW = bodyShape === 'supercar' ? 10 : 8;
    ctx.beginPath();
    ctx.roundRect(windFront - windW / 2, -halfW + 3.5, windW, width - 7, 2);
    ctx.fill();

    if (bodyShape !== 'truck' && bodyShape !== 'bulldozer') {
      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.roundRect(-halfL * 0.52, -halfW + 4, 6, width - 8, 2);
      ctx.fill();
    }

    // Headlights
    ctx.fillStyle = accentColor;
    ctx.fillRect(halfL - 2.5, -halfW + 3, 2.5, 4);
    ctx.fillRect(halfL - 2.5, halfW - 7, 2.5, 4);

    // Police flashing roof lightbar
    if (isPolice) {
      const redActive = Math.sin(sirenPhase) >= 0;
      ctx.fillStyle = redActive ? '#EF4444' : '#3B82F6';
      ctx.fillRect(-3, -halfW + 3, 5, width / 2 - 3);
      ctx.fillStyle = redActive ? '#3B82F6' : '#EF4444';
      ctx.fillRect(-3, 0, 5, width / 2 - 3);
    }

    // Exotic diamond shimmer stripe
    if (isExotic) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(-halfL + 6, -halfW + 2, 6, width - 4);
    }
  }

  ctx.restore();
}

export interface RenderWorldState {
  map: CityMapData;
  player: PlayerState;
  playerSpec: {
    bodyShape: CarBodyShape;
    width: number;
    length: number;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
  };
  buildings: BuildingEntity[];
  props: StreetProp[];
  traffic: TrafficCar[];
  police: PoliceUnit[];
  npcs: NpcPedestrian[];
  pickups: PickupItem[];
  skidMarks: SkidMark[];
  particles: Particle[];
  popups: FloatingPopup[];
  cameraX: number;
  cameraY: number;
  shakeX: number;
  shakeY: number;
  time: number;
}

export function renderGameWorld(
  ctx: CanvasRenderingContext2D,
  viewportW: number,
  viewportH: number,
  state: RenderWorldState
) {
  const {
    map,
    player,
    playerSpec,
    buildings,
    props,
    traffic,
    police,
    npcs,
    pickups,
    skidMarks,
    particles,
    popups,
    cameraX,
    cameraY,
    shakeX,
    shakeY,
    time,
  } = state;

  const theme = getMapTheme(map.mapId);

  ctx.save();
  ctx.fillStyle = theme.groundApronColor;
  ctx.fillRect(0, 0, viewportW, viewportH);

  const camLeft = cameraX - viewportW / 2 + shakeX;
  const camTop = cameraY - viewportH / 2 + shakeY;
  ctx.translate(-camLeft, -camTop);

  // 1. Draw asphalt base
  ctx.fillStyle = theme.roadColor;
  ctx.fillRect(0, 0, map.worldWidth, map.worldHeight);

  const step = map.blockSize + map.roadWidth;

  // 2. Draw city blocks (sidewalks + inner plaza)
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const bx = map.roadWidth + col * step;
      const by = map.roadWidth + row * step;
      if (
        bx + map.blockSize < camLeft - 40 ||
        bx > camLeft + viewportW + 40 ||
        by + map.blockSize < camTop - 40 ||
        by > camTop + viewportH + 40
      ) {
        continue;
      }

      // Concrete sidewalk border
      ctx.fillStyle = theme.sidewalkColor;
      ctx.fillRect(bx, by, map.blockSize, map.blockSize);

      // Curb outline
      ctx.strokeStyle = theme.curbColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx + 1, by + 1, map.blockSize - 2, map.blockSize - 2);

      // Inner courtyard turf/paving
      const inset = 26;
      ctx.fillStyle = (row + col) % 2 === 0 ? theme.courtyardA : theme.courtyardB;
      ctx.fillRect(
        bx + inset,
        by + inset,
        map.blockSize - inset * 2,
        map.blockSize - inset * 2
      );
    }
  }

  // 3. Road markings: themed dashed centerlines & crosswalks
  ctx.strokeStyle = theme.lineColor;
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 18]);
  ctx.beginPath();

  for (const rx of map.roadCentersX) {
    if (rx < camLeft - 80 || rx > camLeft + viewportW + 80) continue;
    ctx.moveTo(rx, 0);
    ctx.lineTo(rx, map.worldHeight);
  }
  for (const ry of map.roadCentersY) {
    if (ry < camTop - 80 || ry > camTop + viewportH + 80) continue;
    ctx.moveTo(0, ry);
    ctx.lineTo(map.worldWidth, ry);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Intersections & crosswalk stripes
  const halfR = map.roadWidth / 2;
  for (const rx of map.roadCentersX) {
    if (rx + halfR < camLeft - 40 || rx - halfR > camLeft + viewportW + 40) continue;
    for (const ry of map.roadCentersY) {
      if (ry + halfR < camTop - 40 || ry - halfR > camTop + viewportH + 40) continue;
      // Clear intersection center of dashed lines
      ctx.fillStyle = theme.roadColor;
      ctx.fillRect(rx - halfR + 4, ry - halfR + 4, map.roadWidth - 8, map.roadWidth - 8);

      // Crosswalk bars
      ctx.fillStyle = theme.crosswalkColor;
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(rx + i * 20 - 5, ry - halfR + 3, 10, 14);
        ctx.fillRect(rx + i * 20 - 5, ry + halfR - 17, 10, 14);
        ctx.fillRect(rx - halfR + 3, ry + i * 20 - 5, 14, 10);
        ctx.fillRect(rx + halfR - 17, ry + i * 20 - 5, 14, 10);
      }
    }
  }

  // 4. Tire skid marks
  for (const s of skidMarks) {
    ctx.strokeStyle = `rgba(15, 23, 42, ${s.alpha.toFixed(2)})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }

  // 5. Crushed building rubble pads (render beneath cars)
  for (const b of buildings) {
    if (!b.crushed) continue;
    if (
      b.x + b.w < camLeft - 40 ||
      b.x > camLeft + viewportW + 40 ||
      b.y + b.h < camTop - 40 ||
      b.y > camTop + viewportH + 40
    ) {
      continue;
    }
    ctx.fillStyle = '#334155';
    ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.setLineDash([]);

    // Rubble bricks
    ctx.fillStyle = b.template.roofColor;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(b.x + 14, b.y + 16, 12, 8);
    ctx.fillRect(b.x + b.w - 30, b.y + b.h - 24, 14, 9);
    ctx.fillRect(b.x + b.w * 0.45, b.y + b.h * 0.4, 11, 11);
    ctx.globalAlpha = 1;
  }

  // 6. Pickups (cash & repair wrenches)
  for (const p of pickups) {
    const bob = Math.sin(time * 5 + p.bobPhase) * 3;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    if (p.kind === 'cash') {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#10B981';
      ctx.strokeStyle = '#064E3B';
      ctx.lineWidth = 2;
      ctx.fillRect(-10, -6, 20, 12);
      ctx.strokeRect(-10, -6, 20, 12);

      ctx.fillStyle = '#ECFDF5';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 0.5);
    } else {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0EA5E9';
      ctx.strokeStyle = '#F8FAFC';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Cross icon
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-2, -6, 4, 12);
      ctx.fillRect(-6, -2, 12, 4);
    }
    ctx.restore();
  }

  // 7. Street props
  for (const prop of props) {
    if (prop.crushed) continue;
    if (
      prop.x < camLeft - 30 ||
      prop.x > camLeft + viewportW + 30 ||
      prop.y < camTop - 30 ||
      prop.y > camTop + viewportH + 30
    ) {
      continue;
    }
    ctx.save();
    ctx.translate(prop.x, prop.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(2, 2, prop.radius, 0, Math.PI * 2);
    ctx.fill();

    if (prop.kind === 'hydrant') {
      ctx.fillStyle = '#EF4444';
      ctx.strokeStyle = '#7F1D1D';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (prop.kind === 'lamp') {
      ctx.fillStyle = '#CBD5E1';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FEF08A';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (prop.kind === 'mailbox') {
      ctx.fillStyle = '#2563EB';
      ctx.fillRect(-6, -5, 12, 10);
    } else if (prop.kind === 'bench') {
      ctx.fillStyle = '#B45309';
      ctx.fillRect(-10, -4, 20, 8);
    } else {
      ctx.fillStyle = '#D97706';
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 1.5;
      ctx.fillRect(-7, -7, 14, 14);
      ctx.strokeRect(-7, -7, 14, 14);
    }
    ctx.restore();
  }

  // 8. NPCs (pedestrians)
  for (const npc of npcs) {
    if (
      npc.x < camLeft - 30 ||
      npc.x > camLeft + viewportW + 30 ||
      npc.y < camTop - 30 ||
      npc.y > camTop + viewportH + 30
    ) {
      continue;
    }
    ctx.save();
    ctx.translate(npc.x, npc.y);

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.beginPath();
    ctx.ellipse(1, 3, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.rotate(npc.angle);
    const swing = Math.sin(npc.walkPhase) * 3.5;

    // Arms/shoulders
    ctx.fillStyle = npc.shirtColor;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-4, -7 + swing * 0.3, 8, 14, 3);
    ctx.fill();
    ctx.stroke();

    // Head
    ctx.fillStyle = '#FDBA74';
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hair
    ctx.fillStyle = npc.hairColor;
    ctx.beginPath();
    ctx.arc(-1, 0, 3.6, Math.PI * 0.5, Math.PI * 1.5);
    ctx.fill();
    ctx.restore();

    if (npc.state === 'panic') {
      ctx.fillStyle = '#FACC15';
      ctx.font = 'bold 12px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', 0, -11);
    }
    ctx.restore();
  }

  // 9. Traffic Cars
  for (const car of traffic) {
    if (
      car.x < camLeft - 80 ||
      car.x > camLeft + viewportW + 80 ||
      car.y < camTop - 80 ||
      car.y > camTop + viewportH + 80
    ) {
      continue;
    }
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    drawVehicleBody(ctx, {
      bodyShape: car.archetype.bodyShape,
      width: car.archetype.width,
      length: car.archetype.length,
      primaryColor: car.archetype.primaryColor,
      secondaryColor: car.archetype.secondaryColor,
      accentColor: car.archetype.accentColor,
      hitFlash: car.hitFlashTimer > 0,
      isExotic: car.archetype.uncrushable,
      crushed: car.crushed,
    });
    ctx.restore();

    // Uncrushable Exotic crown/shield indicator
    if (car.archetype.uncrushable && !car.crushed) {
      ctx.save();
      ctx.translate(car.x, car.y - 24);
      ctx.fillStyle = '#0F172A';
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(7, 0);
      ctx.lineTo(0, 7);
      ctx.lineTo(-7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // 10. Police Units (with windup telegraph for SWAT enforcers)
  for (const cop of police) {
    if (
      cop.x < camLeft - 120 ||
      cop.x > camLeft + viewportW + 120 ||
      cop.y < camTop - 120 ||
      cop.y > camTop + viewportH + 120
    ) {
      continue;
    }
    // Enforcer charge windup telegraph
    if (!cop.crushed && cop.role === 'enforcer' && cop.chargeState === 'windup') {
      ctx.save();
      ctx.translate(cop.x, cop.y);
      ctx.rotate(cop.angle);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.72)';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(26, 0);
      ctx.lineTo(220, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(cop.x, cop.y);
    ctx.rotate(cop.angle);
    drawVehicleBody(ctx, {
      bodyShape: cop.role === 'enforcer' ? 'van' : 'sedan',
      width: cop.role === 'enforcer' ? 29 : 25,
      length: cop.role === 'enforcer' ? 58 : 49,
      primaryColor: '#0F172A',
      secondaryColor: '#F8FAFC',
      accentColor: '#FEF08A',
      hitFlash: cop.hitFlashTimer > 0,
      isPolice: true,
      policeRole: cop.role,
      sirenPhase: cop.sirenPhase,
      crushed: cop.crushed,
    });
    ctx.restore();
  }

  // 11. Player Car
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  drawVehicleBody(ctx, {
    bodyShape: playerSpec.bodyShape,
    width: playerSpec.width,
    length: playerSpec.length,
    primaryColor: playerSpec.primaryColor,
    secondaryColor: playerSpec.secondaryColor,
    accentColor: playerSpec.accentColor,
    hitFlash: player.hitFlashTimer > 0,
    isBoosting: player.isBoosting,
  });
  ctx.restore();

  // 12. Intact Super-Easy-to-Crush Buildings (2.5D top-down)
  for (const b of buildings) {
    if (b.crushed) continue;
    if (
      b.x + b.w < camLeft - 40 ||
      b.x > camLeft + viewportW + 40 ||
      b.y + b.h < camTop - 40 ||
      b.y > camTop + viewportH + 40
    ) {
      continue;
    }

    const jitterX = b.shakeTimer > 0 ? (Math.random() - 0.5) * 6 : 0;
    const jitterY = b.shakeTimer > 0 ? (Math.random() - 0.5) * 6 : 0;
    const bx = b.x + jitterX;
    const by = b.y + jitterY;
    const hVis = b.template.heightVisual;

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.fillRect(bx + 8, by + 10, b.w, b.h);

    // Extruded lower facade
    ctx.fillStyle = b.hitFlashTimer > 0 ? '#FFFFFF' : b.template.wallColor;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2;
    ctx.fillRect(bx, by, b.w, b.h);
    ctx.strokeRect(bx, by, b.w, b.h);

    // Roof shifted up-left for 2.5D depth
    const rx = bx - 3;
    const ry = by - hVis * 0.45;
    ctx.fillStyle = b.hitFlashTimer > 0 ? '#FFFFFF' : b.template.roofColor;
    ctx.fillRect(rx, ry, b.w, b.h - hVis * 0.25);
    ctx.strokeRect(rx, ry, b.w, b.h - hVis * 0.25);

    // Roof trim border
    ctx.strokeStyle = b.template.trimColor;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(rx + 6, ry + 6, b.w - 12, b.h - hVis * 0.25 - 12);

    // Sign badge on roof
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(rx + b.w / 2 - 30, ry + (b.h - hVis * 0.25) / 2 - 11, 60, 22);
    ctx.fillStyle = b.template.signColor;
    ctx.font = '800 12px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      b.template.signText,
      rx + b.w / 2,
      ry + (b.h - hVis * 0.25) / 2 + 1
    );
  }

  // 13. Pooled Particles
  for (const pt of particles) {
    if (!pt.active) continue;
    const alpha = Math.max(0, pt.life / pt.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pt.x, pt.y);
    ctx.rotate(pt.rotation);
    ctx.fillStyle = pt.color;
    if (pt.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, pt.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (pt.shape === 'bill') {
      ctx.fillStyle = '#10B981';
      ctx.strokeStyle = '#064E3B';
      ctx.lineWidth = 1;
      ctx.fillRect(-pt.size, -pt.size * 0.55, pt.size * 2, pt.size * 1.1);
      ctx.strokeRect(-pt.size, -pt.size * 0.55, pt.size * 2, pt.size * 1.1);
    } else if (pt.shape === 'shard') {
      ctx.beginPath();
      ctx.moveTo(-pt.size, -pt.size * 0.4);
      ctx.lineTo(pt.size, 0);
      ctx.lineTo(-pt.size * 0.3, pt.size * 0.7);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(-pt.size / 2, -pt.size / 2, pt.size, pt.size);
    }
    ctx.restore();
  }

  // 14. Floating Cash & Status Popups
  for (const pop of popups) {
    const alpha = Math.min(1, (pop.life / pop.maxLife) * 1.6);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pop.x, pop.y);
    ctx.scale(pop.scale, pop.scale);
    ctx.font = '800 24px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#090B10';
    ctx.fillText(pop.text, 2, 2);
    ctx.fillStyle = pop.color;
    ctx.fillText(pop.text, 0, 0);

    if (pop.subtext) {
      ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#090B10';
      ctx.fillText(pop.subtext, 1.5, 21.5);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillText(pop.subtext, 0, 20);
    }
    ctx.restore();
  }

  ctx.restore();
}

export function renderMinimap(
  ctx: CanvasRenderingContext2D,
  size: number,
  map: CityMapData,
  player: PlayerState,
  police: PoliceUnit[],
  pickups: PickupItem[]
) {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(15, 20, 29, 0.86)';
  ctx.fillRect(0, 0, size, size);

  const scaleX = size / map.worldWidth;
  const scaleY = size / map.worldHeight;

  // Draw city blocks
  ctx.fillStyle = '#334155';
  const step = map.blockSize + map.roadWidth;
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const bx = (map.roadWidth + c * step) * scaleX;
      const by = (map.roadWidth + r * step) * scaleY;
      ctx.fillRect(bx, by, map.blockSize * scaleX, map.blockSize * scaleY);
    }
  }

  // Pickups
  for (const p of pickups) {
    ctx.fillStyle = p.kind === 'repair' ? '#38BDF8' : '#10B981';
    ctx.fillRect(p.x * scaleX - 1.5, p.y * scaleY - 1.5, 3, 3);
  }

  // Police blips
  for (const cop of police) {
    if (cop.crushed) continue;
    ctx.fillStyle = Math.sin(cop.sirenPhase) > 0 ? '#EF4444' : '#3B82F6';
    ctx.beginPath();
    ctx.arc(cop.x * scaleX, cop.y * scaleY, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Player arrow
  ctx.save();
  ctx.translate(player.x * scaleX, player.y * scaleY);
  ctx.rotate(player.angle);
  ctx.fillStyle = '#FACC15';
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.lineTo(-4, -3.5);
  ctx.lineTo(-4, 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
