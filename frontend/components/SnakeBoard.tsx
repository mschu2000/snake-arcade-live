import { useEffect, useRef } from "react";
import type { GameState } from "@/game/engine";

interface Props {
  state: GameState;
  cellSize?: number;
}

export function SnakeBoard({ state, cellSize = 22 }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = state.width * cellSize;
    const h = state.height * cellSize;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // background
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#10122a");
    grad.addColorStop(1, "#1a0d2e");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // grid
    ctx.strokeStyle = "rgba(0, 255, 209, 0.07)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= state.width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cellSize + 0.5, 0);
      ctx.lineTo(x * cellSize + 0.5, h);
      ctx.stroke();
    }
    for (let y = 0; y <= state.height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellSize + 0.5);
      ctx.lineTo(w, y * cellSize + 0.5);
      ctx.stroke();
    }

    // walls indicator
    if (state.mode === "walls") {
      ctx.strokeStyle = "rgba(255, 43, 214, 0.6)";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);
    } else {
      ctx.strokeStyle = "rgba(0, 255, 209, 0.35)";
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.setLineDash([]);
    }

    // food
    const f = state.food;
    ctx.fillStyle = "#ffe600";
    ctx.shadowColor = "#ffe600";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(
      f.x * cellSize + cellSize / 2,
      f.y * cellSize + cellSize / 2,
      cellSize * 0.35,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.shadowBlur = 0;

    // snake
    state.snake.forEach((seg, i) => {
      const isHead = i === 0;
      ctx.fillStyle = isHead ? "#00ffd1" : "#ff2bd6";
      ctx.shadowColor = isHead ? "#00ffd1" : "#ff2bd6";
      ctx.shadowBlur = isHead ? 14 : 8;
      const pad = 2;
      ctx.fillRect(
        seg.x * cellSize + pad,
        seg.y * cellSize + pad,
        cellSize - pad * 2,
        cellSize - pad * 2,
      );
    });
    ctx.shadowBlur = 0;

    if (!state.alive) {
      ctx.fillStyle = "rgba(10, 10, 26, 0.7)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#ff2bd6";
      ctx.font = "bold 28px 'Space Grotesk', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", w / 2, h / 2);
    }
  }, [state, cellSize]);

  return <canvas ref={ref} className="rounded-lg" aria-label="Snake game board" />;
}
