import React, { useEffect, useRef } from "react";

const DENSITY = 0.00009;
const MIN_PARTICLES = 40;
const MAX_PARTICLES = 110;
const LINK_DISTANCE = 140;
const SPEED = 0.75;
const POINTER_LINK_DISTANCE = 200;
const POINTER_REPEL_RADIUS = 160;

const ParticlesBackground = ({ color = "#e535ab" }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext("2d");
    const prefersReducedMotion = window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

    let particles = [];
    let animationId = null;
    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pointer = { x: null, y: null, pulse: 0 };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const target = Math.max(
        MIN_PARTICLES,
        Math.min(MAX_PARTICLES, Math.floor(width * height * DENSITY))
      );

      if (particles.length === 0 || particles.length !== target) {
        particles = Array.from({ length: target }, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * SPEED,
          vy: (Math.random() - 0.5) * SPEED,
          r: 1.2 + Math.random() * 1.4
        }));
      }
    };

    const step = () => {
      ctx.clearRect(0, 0, width, height);

      pointer.pulse = (pointer.pulse + 0.02) % (Math.PI * 2);

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];

        if (!prefersReducedMotion) {
          p.x += p.vx;
          p.y += p.vy;

          if (p.x < 0) { p.x = 0; p.vx *= -1; }
          if (p.x > width) { p.x = width; p.vx *= -1; }
          if (p.y < 0) { p.y = 0; p.vy *= -1; }
          if (p.y > height) { p.y = height; p.vy *= -1; }

          if (pointer.x !== null) {
            const dx = p.x - pointer.x;
            const dy = p.y - pointer.y;
            const dist = Math.hypot(dx, dy);
            if (dist < POINTER_REPEL_RADIUS && dist > 0) {
              const force = (POINTER_REPEL_RADIUS - dist) / POINTER_REPEL_RADIUS;
              p.x += (dx / dist) * force * 1.2;
              p.y += (dy / dist) * force * 1.2;
            }
          }
        }

        let glow = 0;
        if (pointer.x !== null) {
          const dxp = p.x - pointer.x;
          const dyp = p.y - pointer.y;
          const distP = Math.hypot(dxp, dyp);
          if (distP < POINTER_LINK_DISTANCE) {
            glow = 1 - distP / POINTER_LINK_DISTANCE;
          }
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + glow * 1.8, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.6 + glow * 0.4;
        ctx.fill();
      }

      for (let i = 0; i < particles.length; i += 1) {
        for (let j = i + 1; j < particles.length; j += 1) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);

          if (dist < LINK_DISTANCE) {
            const alpha = (1 - dist / LINK_DISTANCE) * 0.35;
            ctx.strokeStyle = color;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      if (pointer.x !== null) {
        for (let i = 0; i < particles.length; i += 1) {
          const p = particles[i];
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const dist = Math.hypot(dx, dy);

          if (dist < POINTER_LINK_DISTANCE) {
            const alpha = (1 - dist / POINTER_LINK_DISTANCE) * 0.7;
            ctx.strokeStyle = color;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(pointer.x, pointer.y);
            ctx.stroke();
          }
        }

        const pulseRadius = 18 + Math.sin(pointer.pulse) * 4;
        const gradient = ctx.createRadialGradient(
          pointer.x, pointer.y, 0,
          pointer.x, pointer.y, pulseRadius * 3
        );
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.4, color);
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, pulseRadius * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.9;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      animationId = window.requestAnimationFrame(step);
    };

    const handlePointerMove = (event) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
    };

    const handlePointerLeave = () => {
      pointer.x = null;
      pointer.y = null;
    };

    resize();
    step();

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      if (animationId !== null) window.cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [color]);

  return <canvas ref={canvasRef} className="pg-particles" aria-hidden="true" />;
};

export default ParticlesBackground;
