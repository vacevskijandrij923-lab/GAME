import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { soundEngine } from './audio';
import { TRAFFIC_ARCHETYPES, getCarSpec } from './catalog';
import { createCityMap, generateCityBuildingsAndProps, getMapTheme } from './cityGen';
import { EngineCallbacks } from './engine';
import {
  BuildingModelRefs,
  CarModelRefs,
  HIT_FLASH_MAT_3D,
  NpcModelRefs,
  WORLD_SCALE_3D,
  buildBuildingMesh3D,
  buildCarMesh3D,
  buildNpcMesh3D,
} from './models3d';
import {
  calculateCrashReward,
  circleIntersectsRect,
  computeWantedStars,
  evaluateCrashOutcome,
  getComboMultiplier,
  getFirstPersonEyeOffset,
} from './physics';
import { renderMinimap } from './renderer';
import {
  WorldTextures3D,
  createPopupSpriteTexture,
  createWorldTextures3D,
} from './textures3d';
import {
  BuildingEntity,
  CameraMode,
  CityMapData,
  GamePhase,
  HudSnapshot,
  MapId,
  NpcPedestrian,
  PickupItem,
  PlayerState,
  PoliceUnit,
  StreetProp,
  TrafficCar,
} from './types';

const PARTICLE_POOL_3D = 260;
const SKID_POOL_3D = 320;

const _vec3 = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _mat4 = new THREE.Matrix4();
const _color = new THREE.Color();

interface Particle3D {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
  life: number;
  maxLife: number;
  color: string;
}

interface PopupSprite3D {
  sprite: THREE.Sprite;
  texture: THREE.CanvasTexture;
  vy: number;
  life: number;
  maxLife: number;
}

function detectSoftwareGl(): boolean {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export class GameEngine3D {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private minimapCanvas: HTMLCanvasElement | null = null;

  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private hemiLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private envRT: THREE.WebGLRenderTarget;
  private textures: WorldTextures3D;
  private staticCityGroup = new THREE.Group();

  private map: CityMapData;
  private buildings: BuildingEntity[] = [];
  private props: StreetProp[] = [];
  private traffic: TrafficCar[] = [];
  private police: PoliceUnit[] = [];
  private npcs: NpcPedestrian[] = [];
  private pickups: PickupItem[] = [];

  private playerModel!: CarModelRefs;
  private buildingModels = new Map<number, BuildingModelRefs>();
  private propMeshes = new Map<number, THREE.Mesh>();
  private trafficModels = new Map<number, CarModelRefs>();
  private policeModels = new Map<number, CarModelRefs>();
  private npcModels = new Map<number, NpcModelRefs>();
  private pickupMeshes = new Map<number, THREE.Group>();

  private particleInstanced: THREE.InstancedMesh;
  private particles3d: Particle3D[] = [];
  private particleCursor = 0;
  private skidInstanced: THREE.InstancedMesh;
  private skidCursor = 0;
  private driftEffectTimer = 0;
  private playerDriftRoll = 0;
  private popups3d: PopupSprite3D[] = [];

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

  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private cameraMode: CameraMode = 'third';
  private steerInput = 0;
  private trauma = 0;
  private hitstopTimer = 0;
  private deathDelayTimer = 0;
  private simTime = 0;
  private hudEmitTimer = 0;
  private minimapTimer = 0;
  private lastHudKey = '';
  private pickupSpawnTimer = 4;

  private nextEntityId = 1;
  private frameId = 0;
  private isRaf = false;
  private destroyed = false;
  private needsFrozenRender = true;
  private lastTimestamp = 0;

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

  constructor(
    container: HTMLElement,
    callbacks: EngineCallbacks,
    initialMoney: number,
    initialCarId: string,
    initialMapId: MapId = 'downtown',
    initialCameraMode: CameraMode = 'third'
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.totalBankMoney = initialMoney;
    this.cameraMode = initialCameraMode;

    this.isSoftwareGl = detectSoftwareGl();
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.dataset.testid = 'game-canvas';
    this.container.appendChild(this.renderer.domElement);

    const rect = this.container.getBoundingClientRect();
    const w = Math.max(320, rect.width || window.innerWidth);
    const h = Math.max(240, rect.height || window.innerHeight);
    this.renderer.setSize(w, h, false);

    this.map = createCityMap(initialMapId);
    const theme = getMapTheme(this.map.mapId);

    this.scene = new THREE.Scene();
    const skyHorizon = new THREE.Color(theme.skyColor);
    this.scene.background = skyHorizon;
    this.scene.fog = new THREE.FogExp2(theme.skyColor, theme.fogDensity);

    this.camera = new THREE.PerspectiveCamera(
      this.cameraMode === 'first' ? 68 : 58,
      w / h,
      this.cameraMode === 'first' ? 0.14 : 0.4,
      420
    );

    // Studio environment reflection for metallic clearcoat paint & glass
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmrem.dispose();

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createWorldTextures3D(maxAniso);

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

    // Lighting rig: Sunlit directional key + sky/ground HemisphereLight matched to map theme
    this.hemiLight = new THREE.HemisphereLight(
      theme.hemiSky,
      theme.hemiGround,
      theme.hemiIntensity
    );
    this.scene.add(this.hemiLight);

    const sun = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
    this.sunLight = sun;
    const worldMid = (this.map.worldWidth * WORLD_SCALE_3D) / 2;
    sun.position.set(worldMid + 60, 95, worldMid + 45);
    sun.target.position.set(worldMid, 0, worldMid);
    this.scene.add(sun.target);
    if (!this.isSoftwareGl) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 10;
      sun.shadow.camera.far = 260;
      const d = 120;
      sun.shadow.camera.left = -d;
      sun.shadow.camera.right = d;
      sun.shadow.camera.top = d;
      sun.shadow.camera.bottom = -d;
      sun.shadow.bias = -0.0005;
      sun.shadow.normalBias = 0.02;
    }
    this.scene.add(sun);

    this.scene.add(this.staticCityGroup);
    this.buildStaticCityGeometry();

    // Instanced pooled 3D tire drift skid marks
    const skidGeo = new THREE.PlaneGeometry(1.15, 0.34);
    skidGeo.rotateX(-Math.PI / 2);
    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x090b10,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    });
    this.skidInstanced = new THREE.InstancedMesh(skidGeo, skidMat, SKID_POOL_3D);
    this.skidInstanced.frustumCulled = false;
    this.skidInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    _mat4.makeScale(0, 0, 0);
    for (let i = 0; i < SKID_POOL_3D; i++) {
      this.skidInstanced.setMatrixAt(i, _mat4);
    }
    this.scene.add(this.skidInstanced);

    // Instanced pooled 3D debris, smoke & spark particles
    const partGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    const partMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.65,
      metalness: 0.1,
    });
    this.particleInstanced = new THREE.InstancedMesh(
      partGeo,
      partMat,
      PARTICLE_POOL_3D
    );
    this.particleInstanced.frustumCulled = false;
    this.particleInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < PARTICLE_POOL_3D; i++) {
      this.particles3d.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        gravity: 26,
        rx: 0,
        ry: 0,
        rz: 0,
        scale: 0,
        life: 0,
        maxLife: 1,
        color: '#ffffff',
      });
      _mat4.makeScale(0, 0, 0);
      this.particleInstanced.setMatrixAt(i, _mat4);
      this.particleInstanced.setColorAt(i, _color.set(0xffffff));
    }
    this.scene.add(this.particleInstanced);

    this.rebuildPlayerMesh();
    this.resetWorldEntities();
    this.snapCameraToPlayer();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.attachListeners();
    this.emitHud();
  }

  private clearStaticCityGeometry() {
    this.staticCityGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
    this.staticCityGroup.clear();
  }

  private applyMapLighting() {
    const theme = getMapTheme(this.map.mapId);
    this.scene.background = new THREE.Color(theme.skyColor);
    this.scene.fog = new THREE.FogExp2(theme.skyColor, theme.fogDensity);
    if (this.hemiLight) {
      this.hemiLight.color.set(theme.hemiSky);
      this.hemiLight.groundColor.set(theme.hemiGround);
      this.hemiLight.intensity = theme.hemiIntensity;
    }
    if (this.sunLight) {
      this.sunLight.color.set(theme.sunColor);
      this.sunLight.intensity = theme.sunIntensity;
    }
  }

  private buildStaticCityGeometry() {
    this.clearStaticCityGeometry();
    const theme = getMapTheme(this.map.mapId);
    const worldW = this.map.worldWidth * WORLD_SCALE_3D;
    const worldD = this.map.worldHeight * WORLD_SCALE_3D;

    // Extended ground apron beyond playable city so nothing floats in void
    const outerGround = new THREE.Mesh(
      new THREE.PlaneGeometry(worldW + 260, worldD + 260),
      new THREE.MeshStandardMaterial({
        color: theme.groundApronColor,
        roughness: 0.95,
        metalness: 0.0,
      })
    );
    outerGround.rotation.x = -Math.PI / 2;
    outerGround.position.set(worldW / 2, -0.05, worldD / 2);
    outerGround.receiveShadow = true;
    this.staticCityGroup.add(outerGround);

    // Main city asphalt ground plane tinted subtly toward the map theme
    const roadTint =
      theme.id === 'downtown'
        ? 0xffffff
        : theme.id === 'neon-night'
        ? 0x7c8aa6
        : theme.id === 'sunset-canyon'
        ? 0xe7cfc2
        : 0xd0e2f2;
    const roadPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(worldW, worldD),
      new THREE.MeshStandardMaterial({
        color: roadTint,
        map: this.textures.asphalt,
        roughness: 0.88,
        metalness: 0.05,
      })
    );
    roadPlane.rotation.x = -Math.PI / 2;
    roadPlane.position.set(worldW / 2, 0, worldD / 2);
    roadPlane.receiveShadow = true;
    this.staticCityGroup.add(roadPlane);

    // Sidewalks & City Block Pads (offset +0.04m on Y to prevent Z-fighting)
    const step = this.map.blockSize + this.map.roadWidth;
    const blockSize3d = this.map.blockSize * WORLD_SCALE_3D;
    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: theme.id === 'downtown' ? 0xffffff : theme.sidewalkColor,
      map: this.textures.sidewalk,
      roughness: 0.85,
      metalness: 0.04,
    });
    const courtyardMat = new THREE.MeshStandardMaterial({
      color: theme.courtyardA,
      roughness: 0.9,
      metalness: 0.02,
    });

    const swGeo = new THREE.BoxGeometry(blockSize3d, 0.14, blockSize3d);
    const inset = 26 * WORLD_SCALE_3D;
    const cyGeo = new THREE.PlaneGeometry(
      blockSize3d - inset * 2,
      blockSize3d - inset * 2
    );

    const blockCount = this.map.rows * this.map.cols;
    const swInst = new THREE.InstancedMesh(swGeo, sidewalkMat, blockCount);
    swInst.receiveShadow = true;
    const cyInst = new THREE.InstancedMesh(cyGeo, courtyardMat, blockCount);
    cyInst.receiveShadow = true;

    let blockIdx = 0;
    for (let r = 0; r < this.map.rows; r++) {
      for (let c = 0; c < this.map.cols; c++) {
        const cx = (this.map.roadWidth + c * step + this.map.blockSize / 2) * WORLD_SCALE_3D;
        const cz = (this.map.roadWidth + r * step + this.map.blockSize / 2) * WORLD_SCALE_3D;

        _quat.identity();
        _vec3.set(cx, 0.07, cz);
        _scale.set(1, 1, 1);
        _mat4.compose(_vec3, _quat, _scale);
        swInst.setMatrixAt(blockIdx, _mat4);

        _euler.set(-Math.PI / 2, 0, 0);
        _quat.setFromEuler(_euler);
        _vec3.set(cx, 0.155, cz);
        _mat4.compose(_vec3, _quat, _scale);
        cyInst.setMatrixAt(blockIdx, _mat4);

        blockIdx++;
      }
    }
    swInst.computeBoundingSphere();
    cyInst.computeBoundingSphere();
    this.staticCityGroup.add(swInst);
    this.staticCityGroup.add(cyInst);

    // Road Centerline Dashes (InstancedMesh)
    const dashGeo = new THREE.BoxGeometry(1.5, 0.02, 0.22);
    const dashMat = new THREE.MeshStandardMaterial({
      color: theme.lineColor,
      emissive: theme.id === 'neon-night' ? theme.lineColor : '#000000',
      emissiveIntensity: theme.id === 'neon-night' ? 0.6 : 0,
      roughness: 0.6,
    });
    const dashPositions: Array<{ x: number; z: number; rotY: number }> = [];
    for (const rx of this.map.roadCentersX) {
      for (let z = 3; z < worldD - 3; z += 3.6) {
        dashPositions.push({ x: rx * WORLD_SCALE_3D, z, rotY: Math.PI / 2 });
      }
    }
    for (const ry of this.map.roadCentersY) {
      for (let x = 3; x < worldW - 3; x += 3.6) {
        dashPositions.push({ x, z: ry * WORLD_SCALE_3D, rotY: 0 });
      }
    }
    const dashInst = new THREE.InstancedMesh(dashGeo, dashMat, dashPositions.length);
    dashInst.receiveShadow = true;
    dashPositions.forEach((d, idx) => {
      _euler.set(0, d.rotY, 0);
      _quat.setFromEuler(_euler);
      _vec3.set(d.x, 0.02, d.z);
      _scale.set(1, 1, 1);
      _mat4.compose(_vec3, _quat, _scale);
      dashInst.setMatrixAt(idx, _mat4);
    });
    dashInst.computeBoundingSphere();
    this.staticCityGroup.add(dashInst);

    // Distant Perimeter Skyline Towers outside the playable grid for realistic horizon depth
    const towerGeo = new THREE.BoxGeometry(14, 1, 14);
    const towerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0.35,
    });
    const towerCoords: Array<{ x: number; z: number; h: number }> = [];
    for (let i = -30; i <= worldW + 30; i += 24) {
      towerCoords.push({ x: i, z: -26, h: 16 + ((Math.abs(i) * 7) % 28) });
      towerCoords.push({ x: i, z: worldD + 26, h: 18 + ((Math.abs(i) * 11) % 30) });
    }
    for (let j = 0; j <= worldD; j += 24) {
      towerCoords.push({ x: -26, z: j, h: 15 + ((j * 5) % 26) });
      towerCoords.push({ x: worldW + 26, z: j, h: 17 + ((j * 9) % 28) });
    }
    const towerInst = new THREE.InstancedMesh(
      towerGeo,
      towerMat,
      towerCoords.length
    );
    const baseHue =
      theme.id === 'sunset-canyon'
        ? 0.06
        : theme.id === 'neon-night'
        ? 0.68
        : theme.id === 'frost-harbor'
        ? 0.56
        : 0.58;
    towerCoords.forEach((t, idx) => {
      _quat.identity();
      _vec3.set(t.x, t.h / 2 - 0.1, t.z);
      _scale.set(1, t.h, 1);
      _mat4.compose(_vec3, _quat, _scale);
      towerInst.setMatrixAt(idx, _mat4);
      _color.setHSL(baseHue, 0.22, 0.32 + (idx % 4) * 0.06);
      towerInst.setColorAt(idx, _color);
    });
    towerInst.computeBoundingSphere();
    this.staticCityGroup.add(towerInst);
  }

  private rebuildPlayerMesh() {
    if (this.playerModel) {
      this.scene.remove(this.playerModel.group);
    }
    const spec = getCarSpec(this.player.carId);
    this.playerModel = buildCarMesh3D({
      bodyShape: spec.bodyShape,
      width2d: spec.width,
      length2d: spec.length,
      primaryColor: spec.primaryColor,
      secondaryColor: spec.secondaryColor,
      accentColor: spec.accentColor,
      includeContactShadow: true,
      contactShadowTex: this.textures.contactShadow,
    });
    this.scene.add(this.playerModel.group);
    for (const m of this.playerModel.cabinMeshes) {
      m.visible = this.cameraMode !== 'first';
    }
    this.syncPlayerMeshTransform();
  }

  private syncPlayerMeshTransform() {
    if (!this.playerModel) return;
    this.playerModel.group.position.set(
      this.player.x * WORLD_SCALE_3D,
      0,
      this.player.y * WORLD_SCALE_3D
    );
    this.playerModel.group.rotation.y = -this.player.angle;
    this.playerModel.group.rotation.x = this.playerDriftRoll;
  }

  private snapCameraToPlayer() {
    const px = this.player.x * WORLD_SCALE_3D;
    const pz = this.player.y * WORLD_SCALE_3D;
    const fx = Math.cos(this.player.angle);
    const fz = Math.sin(this.player.angle);
    if (this.cameraMode === 'first') {
      const spec = getCarSpec(this.player.carId);
      const eye = getFirstPersonEyeOffset(spec.bodyShape, spec.length);
      this.camPos.set(px + fx * eye.forward, eye.height, pz + fz * eye.forward);
      this.camLook.set(
        this.camPos.x + fx * 28,
        eye.height - 0.52,
        this.camPos.z + fz * 28
      );
    } else {
      this.camPos.set(px - fx * 11.5, 5.4, pz - fz * 11.5);
      this.camLook.set(px + fx * 6, 1.2, pz + fz * 6);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.updateVisibilityCulling();
  }

  public setCameraMode(mode: CameraMode) {
    if (this.cameraMode === mode) return;
    this.cameraMode = mode;
    if (this.playerModel) {
      for (const m of this.playerModel.cabinMeshes) {
        m.visible = mode !== 'first';
      }
    }
    this.camera.near = mode === 'first' ? 0.14 : 0.4;
    this.camera.fov = mode === 'first' ? 68 : 58;
    this.camera.updateProjectionMatrix();
    this.snapCameraToPlayer();
    this.needsFrozenRender = true;
  }

  public focusCanvas() {
    this.renderer.domElement.focus();
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

  public setMap(mapId: MapId) {
    if (this.map.mapId === mapId) return;
    this.map = createCityMap(mapId);
    this.applyMapLighting();
    this.buildStaticCityGeometry();
    this.resetWorldEntities();
    this.player.x = this.map.spawnPoint.x;
    this.player.y = this.map.spawnPoint.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.angle = this.map.spawnPoint.angle;
    this.playerDriftRoll = 0;
    this.syncPlayerMeshTransform();
    this.snapCameraToPlayer();
    this.needsFrozenRender = true;
    this.emitHud();
  }

  public equipCar(carId: string) {
    const spec = getCarSpec(carId);
    const hpRatio = this.player.maxHp > 0 ? this.player.hp / this.player.maxHp : 1;
    this.player.carId = spec.id;
    this.player.maxHp = spec.maxHp;
    this.player.hp = Math.max(
      Math.round(spec.maxHp * Math.max(0.6, hpRatio)),
      spec.maxHp * 0.6
    );
    this.player.ghostHp = this.player.hp;
    this.rebuildPlayerMesh();
    this.needsFrozenRender = true;
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

    this.rebuildPlayerMesh();
    this.snapCameraToPlayer();

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

    this.heldKeys.clear();
    this.resetTouchControls();
    this.phase = 'playing';
    this.needsFrozenRender = true;
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

  private clearDynamicMeshes() {
    this.buildingModels.forEach((m) => this.scene.remove(m.group));
    this.buildingModels.clear();
    this.propMeshes.forEach((m) => this.scene.remove(m));
    this.propMeshes.clear();
    this.trafficModels.forEach((m) => this.scene.remove(m.group));
    this.trafficModels.clear();
    this.policeModels.forEach((m) => this.scene.remove(m.group));
    this.policeModels.clear();
    this.npcModels.forEach((m) => this.scene.remove(m.group));
    this.npcModels.clear();
    this.pickupMeshes.forEach((m) => this.scene.remove(m));
    this.pickupMeshes.clear();
    for (const pop of this.popups3d) {
      this.scene.remove(pop.sprite);
      pop.texture.dispose();
      (pop.sprite.material as THREE.SpriteMaterial).dispose();
    }
    this.popups3d = [];
  }

  private resetWorldEntities() {
    this.clearDynamicMeshes();
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const generated = generateCityBuildingsAndProps(this.map);
    this.buildings = generated.buildings;
    this.props = generated.props;
    this.traffic = [];
    this.police = [];
    this.npcs = [];
    this.pickups = [];

    for (const p of this.particles3d) {
      p.active = false;
    }
    this.skidCursor = 0;
    _mat4.makeScale(0, 0, 0);
    for (let i = 0; i < SKID_POOL_3D; i++) {
      this.skidInstanced.setMatrixAt(i, _mat4);
    }
    this.skidInstanced.instanceMatrix.needsUpdate = true;

    // Build 3D buildings
    for (const b of this.buildings) {
      const refs = buildBuildingMesh3D(
        b.w,
        b.h,
        b.template.wallColor,
        b.template.roofColor,
        b.template.trimColor,
        b.template.signText,
        b.template.signColor,
        b.template.heightVisual,
        this.textures,
        maxAniso
      );
      refs.group.position.set(
        (b.x + b.w / 2) * WORLD_SCALE_3D,
        0,
        (b.y + b.h / 2) * WORLD_SCALE_3D
      );
      this.scene.add(refs.group);
      this.buildingModels.set(b.id, refs);
    }

    // Build 3D street props using shared geometry & materials per kind
    const propLampGeo = new THREE.CylinderGeometry(0.1, 0.14, 2.6, 8);
    const propBoxGeo = new THREE.BoxGeometry(0.65, 0.75, 0.65);
    const propMats: Record<StreetProp['kind'], THREE.MeshStandardMaterial> = {
      hydrant: new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5 }),
      lamp: new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.45 }),
      mailbox: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.5 }),
      bench: new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.65 }),
      crate: new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.65 }),
    };

    for (const prop of this.props) {
      const h = prop.kind === 'lamp' ? 2.6 : 0.75;
      const geo = prop.kind === 'lamp' ? propLampGeo : propBoxGeo;
      const mat = propMats[prop.kind];
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        prop.x * WORLD_SCALE_3D,
        h / 2 + 0.14,
        prop.y * WORLD_SCALE_3D
      );
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.propMeshes.set(prop.id, mesh);
    }

    // Spawn 95 road traffic cars across the 16x16 mega-city
    for (let i = 0; i < 95; i++) {
      this.spawnTrafficCar(true);
    }
    // Spawn initial patrol police
    for (let i = 0; i < 6; i++) {
      this.spawnPoliceUnit('interceptor');
    }
    // Spawn 140 sidewalk NPCs
    for (let i = 0; i < 140; i++) {
      this.spawnNpc();
    }
    // Initial pickups
    for (let i = 0; i < 16; i++) this.spawnPickup('repair');
    for (let i = 0; i < 22; i++) this.spawnPickup('cash');

    this.updateVisibilityCulling();
  }

  private updateVisibilityCulling() {
    const cx = this.camera.position.x;
    const cz = this.camera.position.z;

    const bldgMaxSq = 175 * 175;
    for (const refs of this.buildingModels.values()) {
      const dx = refs.group.position.x - cx;
      const dz = refs.group.position.z - cz;
      refs.group.visible = dx * dx + dz * dz <= bldgMaxSq;
    }

    const propMaxSq = 105 * 105;
    for (const prop of this.props) {
      const mesh = this.propMeshes.get(prop.id);
      if (!mesh) continue;
      if (prop.crushed) {
        mesh.visible = false;
        continue;
      }
      const dx = mesh.position.x - cx;
      const dz = mesh.position.z - cz;
      mesh.visible = dx * dx + dz * dz <= propMaxSq;
    }

    const carMaxSq = 165 * 165;
    for (const m of this.trafficModels.values()) {
      const dx = m.group.position.x - cx;
      const dz = m.group.position.z - cz;
      m.group.visible = dx * dx + dz * dz <= carMaxSq;
    }

    const copMaxSq = 180 * 180;
    for (const m of this.policeModels.values()) {
      const dx = m.group.position.x - cx;
      const dz = m.group.position.z - cz;
      m.group.visible = dx * dx + dz * dz <= copMaxSq;
    }

    const npcMaxSq = 115 * 115;
    for (const m of this.npcModels.values()) {
      const dx = m.group.position.x - cx;
      const dz = m.group.position.z - cz;
      m.group.visible = dx * dx + dz * dz <= npcMaxSq;
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

    if (
      initial &&
      Math.hypot(x - this.map.spawnPoint.x, y - this.map.spawnPoint.y) < 220
    ) {
      x = 200;
      y = this.map.roadCentersY[0] + 30;
    }

    const car: TrafficCar = {
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
    };
    this.traffic.push(car);

    const model = buildCarMesh3D({
      bodyShape: archetype.bodyShape,
      width2d: archetype.width,
      length2d: archetype.length,
      primaryColor: archetype.primaryColor,
      secondaryColor: archetype.secondaryColor,
      accentColor: archetype.accentColor,
      isExotic: archetype.uncrushable,
      includeContactShadow: true,
      contactShadowTex: this.textures.contactShadow,
    });
    model.group.position.set(x * WORLD_SCALE_3D, 0, y * WORLD_SCALE_3D);
    model.group.rotation.y = -angle;
    this.scene.add(model.group);
    this.trafficModels.set(car.id, model);
  }

  private spawnPoliceUnit(role: 'interceptor' | 'enforcer') {
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
      if (Math.hypot(rx - this.player.x, ry - this.player.y) > 450) {
        x = rx;
        y = ry;
        break;
      }
    }

    const cop: PoliceUnit = {
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
    };
    this.police.push(cop);

    const model = buildCarMesh3D({
      bodyShape: role === 'enforcer' ? 'van' : 'sedan',
      width2d: role === 'enforcer' ? 29 : 25,
      length2d: role === 'enforcer' ? 58 : 49,
      primaryColor: '#0F172A',
      secondaryColor: '#F8FAFC',
      accentColor: '#FEF08A',
      isPolice: true,
      policeRole: role,
      includeContactShadow: true,
      contactShadowTex: this.textures.contactShadow,
    });
    model.group.position.set(x * WORLD_SCALE_3D, 0, y * WORLD_SCALE_3D);
    model.group.rotation.y = -cop.angle;
    this.scene.add(model.group);
    this.policeModels.set(cop.id, model);
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
    const shirtColor = shirts[Math.floor(Math.random() * shirts.length)];
    const hairColor = hairs[Math.floor(Math.random() * hairs.length)];

    const npc: NpcPedestrian = {
      id: this.nextEntityId++,
      x,
      y,
      vx: 0,
      vy: 0,
      angle: dirAngle,
      walkPhase: Math.random() * Math.PI * 2,
      shirtColor,
      hairColor,
      state: 'stroll',
      panicTimer: 0,
      tumbleTimer: 0,
      dirAngle,
      droppedCash: false,
    };
    this.npcs.push(npc);

    const model = buildNpcMesh3D(shirtColor, hairColor);
    model.group.position.set(x * WORLD_SCALE_3D, 0.14, y * WORLD_SCALE_3D);
    model.group.rotation.y = -dirAngle;
    this.scene.add(model.group);
    this.npcModels.set(npc.id, model);
  }

  private spawnPickup(
    kind: 'cash' | 'repair',
    customX?: number,
    customY?: number,
    value?: number
  ) {
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

    const p: PickupItem = {
      id: this.nextEntityId++,
      kind,
      x: rx,
      y: ry,
      value: value ?? (kind === 'cash' ? 100 : 40),
      life: 35,
      bobPhase: Math.random() * Math.PI * 2,
    };
    this.pickups.push(p);

    const grp = new THREE.Group();
    if (kind === 'cash') {
      const bill = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.45, 0.65),
        new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x059669,
          emissiveIntensity: 0.75,
        })
      );
      grp.add(bill);
    } else {
      const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.65, 0),
        new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.9,
        })
      );
      grp.add(orb);
    }
    grp.position.set(rx * WORLD_SCALE_3D, 0.75, ry * WORLD_SCALE_3D);
    this.scene.add(grp);
    this.pickupMeshes.set(p.id, grp);
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.destroyed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.isRaf = false;
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.isRaf = false;
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.isRaf = false;
    this.frameId = window.setTimeout(poll, 5);
  }

  public startLoop() {
    if (this.frameId !== 0) return;
    this.lastTimestamp = performance.now();

    const tick = () => {
      if (this.destroyed) return;
      const now = performance.now();
      const rawDt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      let didRender = false;
      if (this.phase === 'paused' || this.phase === 'gameover') {
        if (this.needsFrozenRender) {
          this.renderer.render(this.scene, this.camera);
          this.needsFrozenRender = false;
          didRender = true;
        }
      } else {
        this.update(dt);
        this.renderer.render(this.scene, this.camera);
        didRender = true;
        if (this.minimapCanvas && this.phase === 'playing') {
          this.minimapTimer -= dt;
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

      if (this.isSoftwareGl && didRender) {
        this.afterDraw(tick);
      } else if (this.isSoftwareGl) {
        this.isRaf = false;
        this.frameId = window.setTimeout(tick, 80);
      } else {
        this.isRaf = true;
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.isRaf = false;
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.isRaf = true;
      this.frameId = requestAnimationFrame(tick);
    }
  }

  public destroy() {
    this.destroyed = true;
    if (this.frameId !== 0) {
      if (this.isRaf) cancelAnimationFrame(this.frameId);
      else clearTimeout(this.frameId);
      this.frameId = 0;
    }
    this.detachListeners();
    this.clearDynamicMeshes();
    this.textures.dispose();
    this.envRT.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    const code = e.code;
    if (
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code) &&
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
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(320, rect.width || window.innerWidth);
    const h = Math.max(240, rect.height || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.needsFrozenRender = true;
  };

  private attachListeners() {
    window.addEventListener('keydown', this.handleKeyDown, { passive: false });
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibility);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.container);
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
    this.simTime += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.9);

    this.player.ghostHp += (this.player.hp - this.player.ghostHp) * Math.min(1, dt * 4);
    if (this.player.hitFlashTimer > 0) this.player.hitFlashTimer -= dt;
    if (this.player.invulnTimer > 0) this.player.invulnTimer -= dt;
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerAlert = null;
    }

    this.updateParticlesAndPopups(dt);

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }

    if (this.phase === 'title') {
      // Live 3D camera tour sweeping low over central Crunch City streets & sculpted vehicles
      const midIdx = Math.floor(this.map.cols / 2);
      const midX = this.map.roadCentersX[midIdx] * WORLD_SCALE_3D;
      const midZ = this.map.roadCentersY[midIdx] * WORLD_SCALE_3D;
      const orbitR = 26;
      this.camera.position.set(
        midX + Math.cos(this.simTime * 0.18) * orbitR,
        11.5 + Math.sin(this.simTime * 0.24) * 2.2,
        midZ + Math.sin(this.simTime * 0.18) * orbitR
      );
      this.camera.lookAt(midX, 1.8, midZ);
      this.updateTraffic(dt);
      this.updateNpcs(dt, false);
      this.updatePolice(dt, 0);
      this.updateVisibilityCulling();
      return;
    }

    if (this.deathDelayTimer > 0) {
      this.deathDelayTimer -= dt;
      if (this.deathDelayTimer <= 0) {
        this.phase = 'gameover';
        this.needsFrozenRender = true;
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

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }
    if (this.wantedHeat > 0) {
      this.wantedHeat = Math.max(0, this.wantedHeat - dt * 0.65);
    }

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

    // Smooth 3D Chase Camera OR Snappy First-Person Driver Cockpit Camera
    const px = this.player.x * WORLD_SCALE_3D;
    const pz = this.player.y * WORLD_SCALE_3D;
    const fx = Math.cos(this.player.angle);
    const fz = Math.sin(this.player.angle);
    const speedRatio = Math.min(1, Math.hypot(this.player.vx, this.player.vy) / 550);

    if (this.cameraMode === 'first') {
      const spec = getCarSpec(this.player.carId);
      const eye = getFirstPersonEyeOffset(spec.bodyShape, spec.length);
      const bounceY = Math.sin(this.simTime * 22) * speedRatio * 0.014;
      this.camPos.set(
        px + fx * eye.forward,
        eye.height + bounceY,
        pz + fz * eye.forward
      );
      this.camLook.set(
        this.camPos.x + fx * 28,
        eye.height - 0.52 + bounceY * 0.5,
        this.camPos.z + fz * 28
      );

      const targetFov = this.player.isBoosting ? 78 : 68 + speedRatio * 5;
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 8);
      this.camera.updateProjectionMatrix();

      const shakeMag = this.trauma * this.trauma * 0.25;
      this.camera.position.set(
        this.camPos.x + (Math.random() * 2 - 1) * shakeMag,
        this.camPos.y + (Math.random() * 2 - 1) * shakeMag * 0.6,
        this.camPos.z + (Math.random() * 2 - 1) * shakeMag
      );
      this.camera.lookAt(this.camLook);
      this.camera.rotation.z +=
        -this.playerDriftRoll * 0.35 + (Math.random() * 2 - 1) * this.trauma * 0.03;
    } else {
      const camDist = 11.2 + speedRatio * 2.2;
      const camHeight = 5.0 + speedRatio * 0.9;

      _vec3.set(px - fx * camDist, camHeight, pz - fz * camDist);
      _vec3B.set(px + fx * 6.5, 1.35, pz + fz * 6.5);

      const posAlpha = 1 - Math.exp(-8.5 * dt);
      const lookAlpha = 1 - Math.exp(-12 * dt);
      this.camPos.lerp(_vec3, posAlpha);
      this.camLook.lerp(_vec3B, lookAlpha);

      const targetFov = this.player.isBoosting ? 67 : 58 + speedRatio * 4;
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 7);
      this.camera.updateProjectionMatrix();

      const shakeMag = this.trauma * this.trauma * 0.65;
      this.camera.position.set(
        this.camPos.x + (Math.random() * 2 - 1) * shakeMag,
        this.camPos.y + (Math.random() * 2 - 1) * shakeMag * 0.6,
        this.camPos.z + (Math.random() * 2 - 1) * shakeMag
      );
      this.camera.lookAt(this.camLook);
    }

    if (!this.isSoftwareGl && this.sunLight) {
      this.sunLight.position.set(px + 60, 95, pz + 45);
      this.sunLight.target.position.set(px, 0, pz);
      this.sunLight.target.updateMatrixWorld();
    }

    this.updateVisibilityCulling();

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
    this.steerInput = (right ? 1 : 0) - (left ? 1 : 0);
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

    this.player.vx = newFwdX * clampedForward + newRightX * nextLateral;
    this.player.vy = newFwdY * clampedForward + newRightY * nextLateral;

    this.player.x += this.player.vx * dt;
    this.player.y += this.player.vy * dt;

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

    const targetRoll = Math.max(
      -0.14,
      Math.min(
        0.14,
        (nextLateral / 360) * 0.14 + (left ? -0.035 : right ? 0.035 : 0)
      )
    );
    this.playerDriftRoll += (targetRoll - this.playerDriftRoll) * Math.min(1, dt * 10);

    // Emit 3D dual rear-wheel skid marks, billowing smoke & drift sparks
    if (this.player.isDrifting || Math.abs(nextLateral) > 85) {
      this.driftEffectTimer -= dt;
      if (this.driftEffectTimer <= 0) {
        this.driftEffectTimer = 0.024;
        const rearDist = spec.length * 0.34;
        const halfTrack = spec.width * 0.36;
        const sides = [-1, 1];
        for (const side of sides) {
          const wx = (this.player.x - newFwdX * rearDist + newRightX * halfTrack * side) * WORLD_SCALE_3D;
          const wz = (this.player.y - newFwdY * rearDist + newRightY * halfTrack * side) * WORLD_SCALE_3D;

          const skidIdx = this.skidCursor;
          this.skidCursor = (this.skidCursor + 1) % SKID_POOL_3D;
          _euler.set(0, -this.player.angle, 0);
          _quat.setFromEuler(_euler);
          _vec3.set(wx, 0.032, wz);
          _scale.set(1, 1, 1);
          _mat4.compose(_vec3, _quat, _scale);
          this.skidInstanced.setMatrixAt(skidIdx, _mat4);
          this.skidInstanced.instanceMatrix.needsUpdate = true;

          // Billowing rear tire smoke
          this.spawnDriftParticle3D(
            wx,
            0.22,
            wz,
            -this.player.vx * WORLD_SCALE_3D * 0.14 + (Math.random() - 0.5) * 1.4,
            1.6 + Math.random() * 1.8,
            -this.player.vy * WORLD_SCALE_3D * 0.14 + (Math.random() - 0.5) * 1.4,
            -1.8,
            Math.random() < 0.55 ? '#CBD5E1' : '#E2E8F0',
            0.75 + Math.random() * 0.55,
            0.35 + Math.random() * 0.25
          );

          // Hot amber/orange sparks when fast drifting
          if (this.player.isDrifting && speed > 175 && Math.random() < 0.7) {
            this.spawnDriftParticle3D(
              wx,
              0.2,
              wz,
              -newFwdX * (4.5 + Math.random() * 4.5) + (Math.random() - 0.5) * 3.5,
              3.5 + Math.random() * 4.5,
              -newFwdY * (4.5 + Math.random() * 4.5) + (Math.random() - 0.5) * 3.5,
              22,
              Math.random() < 0.5 ? '#FACC15' : '#F97316',
              0.38 + Math.random() * 0.24,
              0.24 + Math.random() * 0.16
            );
          }
        }
      }
    }

    this.syncPlayerMeshTransform();
    if (this.playerModel) {
      // Spin 3D wheels proportionally to distance traveled
      const wheelRot = (forwardSpeed * WORLD_SCALE_3D * dt) / 0.36;
      for (const w of this.playerModel.wheels) {
        w.rotation.y -= wheelRot;
      }
      if (this.playerModel.boostFlame) {
        this.playerModel.boostFlame.visible = this.player.isBoosting;
      }
      const flash = this.player.hitFlashTimer > 0;
      for (const m of this.playerModel.bodyMeshes) {
        m.material = flash
          ? HIT_FLASH_MAT_3D
          : this.playerModel.originalMaterials.get(m)!;
      }
    }
  }

  private updateBuildingsAndProps(dt: number) {
    const spec = getCarSpec(this.player.carId);
    const playerRadius = spec.width * 0.62;
    const playerSpeed = Math.hypot(this.player.vx, this.player.vy);

    for (const b of this.buildings) {
      const refs = this.buildingModels.get(b.id);
      if (b.hitFlashTimer > 0) b.hitFlashTimer -= dt;
      if (b.shakeTimer > 0) b.shakeTimer -= dt;

      if (b.crushed) {
        b.rebuildTimer -= dt;
        if (b.rebuildTimer <= 0) {
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
            if (refs) {
              refs.intactGroup.visible = true;
              refs.rubbleGroup.visible = false;
            }
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
            if (refs) {
              refs.intactGroup.visible = false;
              refs.rubbleGroup.visible = true;
            }
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
            this.spawnBurst3D(
              b.x + b.w / 2,
              b.y + b.h / 2,
              24,
              b.template.roofColor,
              20
            );
            this.spawnBurst3D(b.x + b.w / 2, b.y + b.h / 2, 8, '#10B981', 15);
            this.player.vx *= 0.84;
            this.player.vy *= 0.84;
          } else {
            this.awardCrashMoney(
              85,
              b.x + b.w / 2,
              b.y + b.h / 2,
              'CRACKED!',
              '#FACC15'
            );
            this.player.x += col.nx * col.overlap;
            this.player.y += col.ny * col.overlap;
            this.player.vx = col.nx * 140;
            this.player.vy = col.ny * 140;
            soundEngine.playCrash('heavy');
            this.spawnBurst3D(
              this.player.x,
              this.player.y,
              10,
              b.template.wallColor,
              15
            );
          }
        }
      }
    }

    for (const prop of this.props) {
      const mesh = this.propMeshes.get(prop.id);
      if (prop.crushed) {
        prop.rebuildTimer -= dt;
        if (prop.rebuildTimer <= 0) {
          prop.crushed = false;
          if (mesh) mesh.visible = true;
        }
        continue;
      }
      const dist = Math.hypot(this.player.x - prop.x, this.player.y - prop.y);
      if (dist < playerRadius + prop.radius) {
        prop.crushed = true;
        prop.rebuildTimer = 18;
        if (mesh) mesh.visible = false;
        this.awardCrashMoney(prop.reward, prop.x, prop.y, undefined, '#34D399');
        soundEngine.playCrash('light');
        const pColor =
          prop.kind === 'hydrant'
            ? '#38BDF8'
            : prop.kind === 'lamp'
            ? '#FDE047'
            : '#D97706';
        this.spawnBurst3D(prop.x, prop.y, 10, pColor, 14);
      }
    }
  }

  private updateTraffic(dt: number) {
    const spec = getCarSpec(this.player.carId);
    const playerRadius = spec.width * 0.65;
    const playerSpeed = Math.hypot(this.player.vx, this.player.vy);

    for (const car of this.traffic) {
      const model = this.trafficModels.get(car.id);
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
        if (model) {
          model.group.position.set(car.x * WORLD_SCALE_3D, 0, car.y * WORLD_SCALE_3D);
          model.group.rotation.y = -car.angle;
          model.group.rotation.z = 0.16;
          model.group.scale.y = 0.72;
        }
        if (car.crushedTimer <= 0) {
          this.respawnTrafficCar(car);
          if (model) {
            model.group.rotation.z = 0;
            model.group.scale.y = 1;
          }
        }
        continue;
      }

      car.x += car.vx * dt;
      car.y += car.vy * dt;

      if (car.x < -50) car.x = this.map.worldWidth + 40;
      if (car.x > this.map.worldWidth + 50) car.x = -40;
      if (car.y < -50) car.y = this.map.worldHeight + 40;
      if (car.y > this.map.worldHeight + 50) car.y = -40;

      if (model) {
        model.group.position.set(car.x * WORLD_SCALE_3D, 0, car.y * WORLD_SCALE_3D);
        model.group.rotation.y = -car.angle;
        const flash = car.hitFlashTimer > 0;
        for (const m of model.bodyMeshes) {
          m.material = flash ? HIT_FLASH_MAT_3D : model.originalMaterials.get(m)!;
        }
      }

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
          this.spawnBurst3D(
            (this.player.x + car.x) / 2,
            (this.player.y + car.y) / 2,
            14,
            '#FDE047',
            18
          );
          this.addPopup3D(
            car.x,
            car.y,
            'UNCRUSHABLE!',
            car.archetype.name,
            '#FACC15'
          );
          this.setBanner(
            `Can't crush ${car.archetype.name} — hit small cars & buildings!`
          );
          if (playerSpeed > 260) this.damagePlayer(7);
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
          this.spawnBurst3D(car.x, car.y, 16, car.archetype.primaryColor, 18);
          this.spawnBurst3D(car.x, car.y, 6, '#10B981', 12);

          const slowFactor = car.archetype.tier === 'small' ? 0.93 : 0.78;
          this.player.vx *= slowFactor;
          this.player.vy *= slowFactor;
        } else {
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
    const oldModel = this.trafficModels.get(car.id);
    if (oldModel) {
      this.scene.remove(oldModel.group);
      this.trafficModels.delete(car.id);
    }

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

    const newModel = buildCarMesh3D({
      bodyShape: car.archetype.bodyShape,
      width2d: car.archetype.width,
      length2d: car.archetype.length,
      primaryColor: car.archetype.primaryColor,
      secondaryColor: car.archetype.secondaryColor,
      accentColor: car.archetype.accentColor,
      isExotic: car.archetype.uncrushable,
      includeContactShadow: true,
      contactShadowTex: this.textures.contactShadow,
    });
    newModel.group.position.set(car.x * WORLD_SCALE_3D, 0, car.y * WORLD_SCALE_3D);
    newModel.group.rotation.y = -car.angle;
    this.scene.add(newModel.group);
    this.trafficModels.set(car.id, newModel);
  }

  private updateNpcs(dt: number, reactToPlayer: boolean) {
    const playerSpeed = Math.hypot(this.player.vx, this.player.vy);

    for (const npc of this.npcs) {
      const model = this.npcModels.get(npc.id);

      if (npc.tumbleTimer > 0) {
        npc.tumbleTimer -= dt;
        npc.x += npc.vx * dt;
        npc.y += npc.vy * dt;
        npc.vx *= Math.pow(0.9, dt * 60);
        npc.vy *= Math.pow(0.9, dt * 60);
        npc.angle += dt * 11;
        if (model) {
          model.group.position.set(
            npc.x * WORLD_SCALE_3D,
            0.35 + Math.sin(npc.tumbleTimer * 10) * 0.35,
            npc.y * WORLD_SCALE_3D
          );
          model.group.rotation.set(npc.angle, 0, npc.angle * 0.7);
        }
        if (npc.tumbleTimer <= 0) {
          npc.state = 'panic';
          npc.panicTimer = 3.0;
          if (model) model.group.rotation.set(0, -npc.dirAngle, 0);
        }
        continue;
      }

      if (reactToPlayer) {
        const dx = npc.x - this.player.x;
        const dy = npc.y - this.player.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 22) {
          npc.state = 'tumble';
          npc.tumbleTimer = 0.65;
          const nx = dist > 0.01 ? dx / dist : 1;
          const ny = dist > 0.01 ? dy / dist : 0;
          npc.vx = nx * Math.max(160, playerSpeed * 0.65);
          npc.vy = ny * Math.max(160, playerSpeed * 0.65);
          this.wantedHeat = Math.min(100, this.wantedHeat + 5);
          this.awardCrashMoney(65, npc.x, npc.y, 'SCATTER!', '#34D399');
          soundEngine.playCrash('light');
          this.spawnBurst3D(npc.x, npc.y, 6, '#10B981', 12);
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

      if (model) {
        model.group.position.set(npc.x * WORLD_SCALE_3D, 0.14, npc.y * WORLD_SCALE_3D);
        model.group.rotation.set(0, -npc.angle, 0);
        const legSwing = Math.sin(npc.walkPhase) * 0.55;
        model.leftLeg.rotation.z = legSwing;
        model.rightLeg.rotation.z = -legSwing;
        model.alertMark.visible = npc.state === 'panic';
      }
    }
  }

  private updatePolice(dt: number, stars: number) {
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
      const model = this.policeModels.get(cop.id);
      if (cop.hitFlashTimer > 0) cop.hitFlashTimer -= dt;
      cop.sirenPhase += dt * (stars > 0 ? 14 : 4);

      if (model && model.sirenRed && model.sirenBlue) {
        const redOn = Math.sin(cop.sirenPhase) >= 0;
        (model.sirenRed.material as THREE.MeshStandardMaterial).emissiveIntensity =
          redOn ? 2.8 : 0.2;
        (model.sirenBlue.material as THREE.MeshStandardMaterial).emissiveIntensity =
          redOn ? 0.2 : 2.8;
      }

      if (cop.crushed) {
        cop.crushedTimer -= dt;
        cop.x += cop.vx * dt;
        cop.y += cop.vy * dt;
        cop.vx *= Math.pow(0.92, dt * 60);
        cop.vy *= Math.pow(0.92, dt * 60);
        cop.angle += cop.spinVel * dt;
        cop.spinVel *= Math.pow(0.94, dt * 60);
        if (model) {
          model.group.position.set(cop.x * WORLD_SCALE_3D, 0, cop.y * WORLD_SCALE_3D);
          model.group.rotation.y = -cop.angle;
          model.group.rotation.z = 0.2;
          model.group.scale.y = 0.72;
        }
        if (cop.crushedTimer <= 0) {
          if (model) {
            this.scene.remove(model.group);
            this.policeModels.delete(cop.id);
          }
          this.police.splice(i, 1);
        }
        continue;
      }

      const dx = this.player.x - cop.x;
      const dy = this.player.y - cop.y;
      const dist = Math.hypot(dx, dy);

      if (stars === 0 || this.phase !== 'playing') {
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
        if (model) {
          model.group.position.set(cop.x * WORLD_SCALE_3D, 0, cop.y * WORLD_SCALE_3D);
          model.group.rotation.y = -cop.angle;
        }
        continue;
      }

      if (dist < 420 && Math.random() < dt * 1.4) {
        soundEngine.playSirenBlip(Math.sin(cop.sirenPhase) > 0);
      }

      if (cop.role === 'interceptor') {
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

      cop.x = Math.max(30, Math.min(this.map.worldWidth - 30, cop.x + cop.vx * dt));
      cop.y = Math.max(30, Math.min(this.map.worldHeight - 30, cop.y + cop.vy * dt));

      if (model) {
        model.group.position.set(cop.x * WORLD_SCALE_3D, 0, cop.y * WORLD_SCALE_3D);
        model.group.rotation.y = -cop.angle;
        const flash = cop.hitFlashTimer > 0;
        for (const m of model.bodyMeshes) {
          m.material = flash ? HIT_FLASH_MAT_3D : model.originalMaterials.get(m)!;
        }
      }

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
            this.spawnBurst3D(cop.x, cop.y, 18, '#3B82F6', 18);
          } else {
            const nx = curDist > 0.01 ? (this.player.x - cop.x) / curDist : 1;
            const ny = curDist > 0.01 ? (this.player.y - cop.y) / curDist : 0;
            this.player.x += nx * 16;
            this.player.y += ny * 16;
            cop.vx = -nx * 180;
            cop.vy = -ny * 180;
            soundEngine.playCrash('heavy');
          }
        } else {
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
            this.spawnBurst3D(this.player.x, this.player.y, 10, '#EF4444', 14);
          }
        }
      }
    }
  }

  private updatePickups(dt: number) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      const mesh = this.pickupMeshes.get(p.id);
      p.life -= dt;
      if (p.life <= 0) {
        if (mesh) {
          this.scene.remove(mesh);
          this.pickupMeshes.delete(p.id);
        }
        this.pickups.splice(i, 1);
        continue;
      }
      if (mesh) {
        mesh.rotation.y += dt * 2.5;
        mesh.position.y = 0.75 + Math.sin(this.simTime * 4 + p.bobPhase) * 0.22;
      }
      const dist = Math.hypot(this.player.x - p.x, this.player.y - p.y);
      if (dist < 34) {
        if (p.kind === 'cash') {
          this.awardMoneyDirect(p.value);
          this.addPopup3D(p.x, p.y, `+$${p.value}`, 'CASH PICKUP', '#10B981');
          soundEngine.playCashChime(this.comboCount);
        } else {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + p.value);
          this.addPopup3D(p.x, p.y, `+${p.value} ARMOR`, 'REPAIRED', '#38BDF8');
          soundEngine.playPickup();
        }
        if (mesh) {
          this.scene.remove(mesh);
          this.pickupMeshes.delete(p.id);
        }
        this.pickups.splice(i, 1);
      }
    }
  }

  private updateParticlesAndPopups(dt: number) {
    let anyActive = false;
    for (let i = 0; i < PARTICLE_POOL_3D; i++) {
      const pt = this.particles3d[i];
      if (!pt.active) {
        _mat4.makeScale(0, 0, 0);
        this.particleInstanced.setMatrixAt(i, _mat4);
        continue;
      }
      anyActive = true;
      pt.life -= dt;
      if (pt.life <= 0) {
        pt.active = false;
        _mat4.makeScale(0, 0, 0);
        this.particleInstanced.setMatrixAt(i, _mat4);
        continue;
      }
      pt.vy -= pt.gravity * dt;
      pt.x += pt.vx * dt;
      pt.y = Math.max(0.15, pt.y + pt.vy * dt);
      pt.z += pt.vz * dt;
      if (pt.gravity > 0 && pt.y <= 0.16 && pt.vy < 0) pt.vy = -pt.vy * 0.45;
      pt.rx += dt * 7;
      pt.ry += dt * 9;

      const s = pt.scale * Math.max(0.1, pt.life / pt.maxLife);
      _euler.set(pt.rx, pt.ry, pt.rz);
      _quat.setFromEuler(_euler);
      _vec3.set(pt.x, pt.y, pt.z);
      _scale.set(s, s, s);
      _mat4.compose(_vec3, _quat, _scale);
      this.particleInstanced.setMatrixAt(i, _mat4);
    }
    if (anyActive || this.particleInstanced.instanceMatrix.needsUpdate) {
      this.particleInstanced.instanceMatrix.needsUpdate = true;
    }

    for (let i = this.popups3d.length - 1; i >= 0; i--) {
      const pop = this.popups3d[i];
      pop.life -= dt;
      pop.sprite.position.y += pop.vy * dt;
      (pop.sprite.material as THREE.SpriteMaterial).opacity = Math.min(
        1,
        (pop.life / pop.maxLife) * 1.6
      );
      if (pop.life <= 0) {
        this.scene.remove(pop.sprite);
        pop.texture.dispose();
        (pop.sprite.material as THREE.SpriteMaterial).dispose();
        this.popups3d.splice(i, 1);
      }
    }
  }

  private spawnBurst3D(
    x2d: number,
    y2d: number,
    count: number,
    colorHex: string,
    speedMax: number
  ) {
    const cx = x2d * WORLD_SCALE_3D;
    const cz = y2d * WORLD_SCALE_3D;
    for (let i = 0; i < count; i++) {
      const idx = this.particleCursor;
      this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_3D;
      const pt = this.particles3d[idx];

      const ang = Math.random() * Math.PI * 2;
      const spd = 2.5 + Math.random() * speedMax;
      pt.active = true;
      pt.x = cx + (Math.random() - 0.5) * 1.4;
      pt.y = 0.8 + Math.random() * 1.8;
      pt.z = cz + (Math.random() - 0.5) * 1.4;
      pt.vx = Math.cos(ang) * spd;
      pt.vy = 5 + Math.random() * 10;
      pt.vz = Math.sin(ang) * spd;
      pt.gravity = 26;
      pt.rx = Math.random() * 3;
      pt.ry = Math.random() * 3;
      pt.rz = Math.random() * 3;
      pt.scale = 0.65 + Math.random() * 0.9;
      pt.maxLife = 0.55 + Math.random() * 0.45;
      pt.life = pt.maxLife;
      pt.color = colorHex;
      this.particleInstanced.setColorAt(idx, _color.set(colorHex));
    }
    if (this.particleInstanced.instanceColor) {
      this.particleInstanced.instanceColor.needsUpdate = true;
    }
    this.particleInstanced.instanceMatrix.needsUpdate = true;
  }

  private spawnDriftParticle3D(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    gravity: number,
    colorHex: string,
    scale: number,
    maxLife: number
  ) {
    const idx = this.particleCursor;
    this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_3D;
    const pt = this.particles3d[idx];
    pt.active = true;
    pt.x = x;
    pt.y = y;
    pt.z = z;
    pt.vx = vx;
    pt.vy = vy;
    pt.vz = vz;
    pt.gravity = gravity;
    pt.rx = Math.random() * 3;
    pt.ry = Math.random() * 3;
    pt.rz = Math.random() * 3;
    pt.scale = scale;
    pt.maxLife = maxLife;
    pt.life = maxLife;
    pt.color = colorHex;
    this.particleInstanced.setColorAt(idx, _color.set(colorHex));
    if (this.particleInstanced.instanceColor) {
      this.particleInstanced.instanceColor.needsUpdate = true;
    }
    this.particleInstanced.instanceMatrix.needsUpdate = true;
  }

  private addPopup3D(
    x2d: number,
    y2d: number,
    text: string,
    subtext: string | undefined,
    color: string
  ) {
    const tex = createPopupSpriteTexture(text, subtext, color);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x2d * WORLD_SCALE_3D, 3.6, y2d * WORLD_SCALE_3D);
    sprite.scale.set(7.5, 2.35, 1);
    sprite.renderOrder = 20;
    this.scene.add(sprite);
    this.popups3d.push({
      sprite,
      texture: tex,
      vy: 3.4,
      life: 1.15,
      maxLife: 1.15,
    });
  }

  private damagePlayer(amount: number) {
    if (this.deathDelayTimer > 0) return;
    this.player.hp = Math.max(0, this.player.hp - amount);
    this.player.hitFlashTimer = 0.1;
    if (this.player.hp <= 0) {
      this.deathDelayTimer = 0.5;
      this.hitstopTimer = 0.06;
      this.trauma = 1.0;
      this.spawnBurst3D(this.player.x, this.player.y, 26, '#F97316', 22);
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
    if (this.comboCount > this.bestCombo) this.bestCombo = this.comboCount;

    const earned = calculateCrashReward(baseReward, spec, this.comboCount);
    this.awardMoneyDirect(earned);
    const mult = getComboMultiplier(this.comboCount);
    const label = mult > 1 ? `+$${earned} (x${mult})` : `+$${earned}`;
    this.addPopup3D(x, y, label, subtext, color);
    soundEngine.playCashChime(this.comboCount);
    this.emitHud();
  }

  private awardMoneyDirect(amount: number) {
    this.runMoney += amount;
    this.totalBankMoney += amount;
    this.callbacks.onMoneyEarned(amount);
  }

  private setBanner(msg: string) {
    this.bannerAlert = msg;
    this.bannerTimer = 2.6;
  }

  private emitHud() {
    const spec = getCarSpec(this.player.carId);
    const speedMph = Math.round(Math.hypot(this.player.vx, this.player.vy) / 6.2);
    const money = Math.round(this.totalBankMoney);
    const hp = Math.round(this.player.hp);
    const maxHp = Math.round(this.player.maxHp);
    const ghostHp = Math.round(this.player.ghostHp);
    const boostFuel = Math.round(this.player.boostFuel);
    const wantedStars = computeWantedStars(this.wantedHeat);
    const key = `${money}|${hp}|${ghostHp}|${speedMph}|${boostFuel}|${wantedStars}|${this.comboCount}|${this.buildingsCrushed}|${this.carsCrushed}|${this.policeSmashed}|${spec.id}|${this.bannerAlert ?? ''}|${this.steerInput}`;
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
      steerInput: this.steerInput,
    });
  }
}
