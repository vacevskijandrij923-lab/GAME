import React, { useEffect, useRef } from 'react';
import { drawVehicleBody } from '../game/renderer';
import { CarSpec } from '../game/types';

interface CarPreviewProps {
  car: CarSpec;
}

export const CarPreview: React.FC<CarPreviewProps> = ({ car }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = 148;
    const h = 76;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);

    // Subtle asphalt pad
    ctx.fillStyle = '#1E2430';
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, 8);
    ctx.fill();

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(14, h / 2);
    ctx.lineTo(w - 14, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    const scale = Math.min(1.35, 96 / car.length);
    ctx.scale(scale, scale);
    drawVehicleBody(ctx, {
      bodyShape: car.bodyShape,
      width: car.width,
      length: car.length,
      primaryColor: car.primaryColor,
      secondaryColor: car.secondaryColor,
      accentColor: car.accentColor,
    });
    ctx.restore();
  }, [car]);

  return (
    <canvas
      ref={canvasRef}
      className="w-[148px] h-[76px] block shrink-0"
      aria-hidden="true"
    />
  );
};
