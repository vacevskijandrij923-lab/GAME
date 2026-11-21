import * as THREE from 'three';

export interface WorldTextures3D {
  asphalt: THREE.CanvasTexture;
  sidewalk: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  facadeCache: Map<string, THREE.CanvasTexture>;
  signCache: Map<string, THREE.CanvasTexture>;
  dispose: () => void;
}

export function createWorldTextures3D(maxAnisotropy: number): WorldTextures3D {
  // 1. Procedural Asphalt Texture with micro-grain
  const aspCanvas = document.createElement('canvas');
  aspCanvas.width = 256;
  aspCanvas.height = 256;
  const aCtx = aspCanvas.getContext('2d')!;
  aCtx.fillStyle = '#242933';
  aCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const v = 28 + Math.floor(Math.random() * 24);
    aCtx.fillStyle = `rgb(${v},${v + 4},${v + 10})`;
    aCtx.fillRect(x, y, 2, 2);
  }
  const asphalt = new THREE.CanvasTexture(aspCanvas);
  asphalt.colorSpace = THREE.SRGBColorSpace;
  asphalt.wrapS = THREE.RepeatWrapping;
  asphalt.wrapT = THREE.RepeatWrapping;
  asphalt.repeat.set(36, 36);
  asphalt.anisotropy = maxAnisotropy;

  // 2. Concrete Sidewalk Paver Texture
  const swCanvas = document.createElement('canvas');
  swCanvas.width = 256;
  swCanvas.height = 256;
  const sCtx = swCanvas.getContext('2d')!;
  sCtx.fillStyle = '#9aa5b4';
  sCtx.fillRect(0, 0, 256, 256);
  sCtx.strokeStyle = '#7c8798';
  sCtx.lineWidth = 3;
  for (let x = 0; x <= 256; x += 64) {
    sCtx.beginPath();
    sCtx.moveTo(x, 0);
    sCtx.lineTo(x, 256);
    sCtx.stroke();
  }
  for (let y = 0; y <= 256; y += 64) {
    sCtx.beginPath();
    sCtx.moveTo(0, y);
    sCtx.lineTo(256, y);
    sCtx.stroke();
  }
  for (let i = 0; i < 1600; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    sCtx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    sCtx.fillRect(x, y, 2, 2);
  }
  const sidewalk = new THREE.CanvasTexture(swCanvas);
  sidewalk.colorSpace = THREE.SRGBColorSpace;
  sidewalk.wrapS = THREE.RepeatWrapping;
  sidewalk.wrapT = THREE.RepeatWrapping;
  sidewalk.repeat.set(3, 3);
  sidewalk.anisotropy = maxAnisotropy;

  // 3. Soft Radial Contact Shadow Disc
  const shCanvas = document.createElement('canvas');
  shCanvas.width = 128;
  shCanvas.height = 128;
  const shCtx = shCanvas.getContext('2d')!;
  const grad = shCtx.createRadialGradient(64, 64, 12, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  shCtx.fillStyle = grad;
  shCtx.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.CanvasTexture(shCanvas);

  const facadeCache = new Map<string, THREE.CanvasTexture>();
  const signCache = new Map<string, THREE.CanvasTexture>();

  return {
    asphalt,
    sidewalk,
    contactShadow,
    facadeCache,
    signCache,
    dispose: () => {
      asphalt.dispose();
      sidewalk.dispose();
      contactShadow.dispose();
      facadeCache.forEach((t) => t.dispose());
      signCache.forEach((t) => t.dispose());
    },
  };
}

export function getFacadeTexture(
  cache: Map<string, THREE.CanvasTexture>,
  wallColor: string,
  trimColor: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const key = `${wallColor}|${trimColor}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = wallColor;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle brick/panel courses
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let y = 0; y < 256; y += 16) {
    ctx.fillRect(0, y, 256, 2);
  }

  // Ground-floor awning trim band
  ctx.fillStyle = trimColor;
  ctx.fillRect(0, 178, 256, 14);

  // Windows grid (upper floors)
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const wx = 24 + col * 76;
      const wy = 24 + row * 72;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(wx - 3, wy - 3, 54, 48);
      const winGrad = ctx.createLinearGradient(wx, wy, wx + 48, wy + 42);
      winGrad.addColorStop(0, '#38bdf8');
      winGrad.addColorStop(0.5, '#0284c7');
      winGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = winGrad;
      ctx.fillRect(wx, wy, 48, 42);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(wx + 4, wy + 4, 14, 34);
    }
  }

  // Storefront glass window & door on ground level
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(20, 198, 216, 56);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(26, 204, 130, 44);
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(168, 204, 62, 46);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  cache.set(key, tex);
  return tex;
}

export function getSignTexture(
  cache: Map<string, THREE.CanvasTexture>,
  text: string,
  textColor: string,
  bgColor: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const key = `${text}|${textColor}|${bgColor}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = bgColor;
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 244, 84);

  ctx.fillStyle = textColor;
  ctx.font = '800 44px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 50);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  cache.set(key, tex);
  return tex;
}

export function createPopupSpriteTexture(
  text: string,
  subtext: string | undefined,
  color: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 56px "Barlow Condensed", sans-serif';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#090b10';
  ctx.strokeText(text, 256, subtext ? 58 : 80);
  ctx.fillStyle = color;
  ctx.fillText(text, 256, subtext ? 58 : 80);

  if (subtext) {
    ctx.font = '700 28px "Plus Jakarta Sans", sans-serif';
    ctx.lineWidth = 7;
    ctx.strokeText(subtext, 256, 118);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(subtext, 256, 118);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
