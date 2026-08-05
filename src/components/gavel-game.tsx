"use client";

import { useEffect, useRef } from "react";

// A small law-school-themed endless runner to pass the time while feedback is
// generated: a graduation cap hops crimson gavels. Fully self-contained — all
// game state lives in the effect and the score is drawn on the canvas, so the
// loop never triggers a React re-render.
export function GavelGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const H = 200;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = canvas.clientWidth || 640;
    function resize() {
      W = canvas!.clientWidth || 640;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    const groundY = H - 36;
    const player = { x: 48, w: 30, h: 30, y: groundY - 30, vy: 0 };
    const gravity = 0.78;
    const jumpV = -13;
    let gavels: { x: number; w: number; h: number }[] = [];
    let speed = 5.4;
    let tick = 0;
    let best = 0;
    let dead = false;
    let gap = 60;
    let raf = 0;

    function reset() {
      player.y = groundY - player.h;
      player.vy = 0;
      gavels = [];
      speed = 5.4;
      tick = 0;
      dead = false;
      gap = 60;
    }
    function jump() {
      if (dead) { reset(); return; }
      if (player.y >= groundY - player.h - 1) player.vy = jumpV;
    }
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); jump(); }
    }
    window.addEventListener("keydown", onKey);
    canvas.addEventListener("pointerdown", jump);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function drawGavel(x: number, w: number, h: number) {
      const headH = 12;
      const headY = groundY - h;
      const handleW = 6;
      // handle
      ctx!.fillStyle = "#7f1523";
      ctx!.fillRect(x + w / 2 - handleW / 2, headY + headH, handleW, h - headH);
      // head (mallet), tilted flat across the top
      ctx!.fillStyle = "#a51c30";
      ctx!.fillRect(x, headY, w, headH);
      // a little sound block on the ground beside it
      ctx!.fillStyle = "#c98b93";
      ctx!.fillRect(x - 6, groundY - 5, w + 12, 5);
    }

    function loop() {
      player.vy += gravity;
      player.y += player.vy;
      if (player.y > groundY - player.h) { player.y = groundY - player.h; player.vy = 0; }

      if (!dead) {
        tick += 1;
        gap -= 1;
        const last = gavels[gavels.length - 1];
        if (gap <= 0 && (!last || last.x < W - 210)) {
          const h = 30 + Math.floor((tick * 7) % 24);
          gavels.push({ x: W + 12, w: 30, h });
          gap = 66 + Math.floor((tick * 13) % 80);
        }
        for (const g of gavels) g.x -= speed;
        gavels = gavels.filter((g) => g.x + g.w > -20);
        speed += 0.0016;

        const pad = 7; // a little forgiveness on the hitbox
        for (const g of gavels) {
          const hitX = player.x + pad < g.x + g.w && player.x + player.w - pad > g.x;
          const hitY = player.y + player.h - pad > groundY - g.h;
          if (hitX && hitY) { dead = true; best = Math.max(best, Math.floor(tick / 5)); }
        }
      }

      const score = Math.floor(tick / 5);
      ctx!.clearRect(0, 0, W, H);
      ctx!.strokeStyle = "#d8d0c1";
      ctx!.lineWidth = 2;
      ctx!.beginPath();
      ctx!.moveTo(0, groundY + 3);
      ctx!.lineTo(W, groundY + 3);
      ctx!.stroke();

      for (const g of gavels) drawGavel(g.x, g.w, g.h);

      ctx!.textBaseline = "alphabetic";
      ctx!.font = "30px serif";
      ctx!.fillText("🎓", player.x - 3, player.y + player.h + 2);

      ctx!.fillStyle = "#66716c";
      ctx!.font = "600 13px ui-sans-serif, system-ui, sans-serif";
      ctx!.textAlign = "right";
      ctx!.fillText(`score ${score}`, W - 14, 24);
      if (best) ctx!.fillText(`best ${best}`, W - 14, 42);
      ctx!.textAlign = "left";

      if (dead) {
        ctx!.fillStyle = "rgba(245, 241, 232, 0.84)";
        ctx!.fillRect(0, 0, W, H);
        ctx!.textAlign = "center";
        ctx!.fillStyle = "#a51c30";
        ctx!.font = "600 19px ui-sans-serif, system-ui, sans-serif";
        ctx!.fillText("Objection sustained!", W / 2, H / 2 - 4);
        ctx!.fillStyle = "#66716c";
        ctx!.font = "13px ui-sans-serif, system-ui, sans-serif";
        ctx!.fillText("Press Space or tap to try again", W / 2, H / 2 + 18);
        ctx!.textAlign = "left";
      }

      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", jump);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="dino">
      <canvas ref={canvasRef} className="dino__canvas" aria-label="Graduation cap dodging gavels game" />
      <p className="dino__hint">Press <kbd>Space</kbd> or tap the box to hop the gavels while you wait.</p>
    </div>
  );
}
