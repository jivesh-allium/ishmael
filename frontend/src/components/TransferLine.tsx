import { useEffect, useRef } from "react";
import { Container, Graphics, Sprite, Text, Assets } from "pixi.js";
import { geoToPixel } from "../lib/geo";
import { WHALE_MINI_SPRITE } from "../assets/sprites";
import type { WhaleAlert } from "../types/whale";
import { ALERT_COLORS } from "../types/whale";
import { formatUsd } from "../lib/api";

// Resting alpha for persistent display
const RESTING_ALPHA = 0.55;

interface Props {
  whale: WhaleAlert;
  world: Container;
  onClick: () => void;
}

/** Quadratic Bezier point at parameter t. */
function bezierAt(
  t: number,
  p0: { x: number; y: number },
  cp: { x: number; y: number },
  p1: { x: number; y: number },
) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * cp.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * cp.y + t * t * p1.y,
  };
}

/** Tangent direction of the quadratic Bezier at parameter t (unnormalized). */
function bezierTangent(
  t: number,
  p0: { x: number; y: number },
  cp: { x: number; y: number },
  p1: { x: number; y: number },
) {
  const u = 1 - t;
  return {
    x: 2 * u * (cp.x - p0.x) + 2 * t * (p1.x - cp.x),
    y: 2 * u * (cp.y - p0.y) + 2 * t * (p1.y - cp.y),
  };
}

/** Compute control point for the Bezier curve. */
function controlPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 5) {
    // Self-transfer: small loop
    return { x: from.x + 30, y: from.y - 40 };
  }

  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const nx = -dy / dist;
  const ny = dx / dist;
  const offset = Math.min(dist * 0.3, 120);
  return { x: midX + nx * offset, y: midY + ny * offset };
}

export function TransferLine({ whale, world, onClick }: Props) {
  const containerRef = useRef<Container | null>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    // Resolve coordinates with fallbacks
    const toLat = whale.to_lat ?? whale.from_lat ?? 0;
    const toLon = whale.to_lon ?? whale.from_lon ?? -160;
    const fromLat = whale.from_lat ?? whale.to_lat;
    const fromLon = whale.from_lon ?? whale.to_lon;
    const hasArc = fromLat != null && fromLon != null;

    const to = geoToPixel(toLat, toLon);
    const from = hasArc ? geoToPixel(fromLat, fromLon) : to;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const isSelfTransfer = Math.sqrt(dx * dx + dy * dy) < 5;
    const cp = controlPoint(from, to);
    const selfTo = isSelfTransfer ? { x: from.x, y: from.y + 2 } : to;

    const color = ALERT_COLORS[whale.alert_type] ?? 0x4488ff;
    const usd = whale.usd_value;

    // Line width: 1-6px based on USD value (log scale)
    const lineWidth = Math.max(1, Math.min(6, 1 + 5 * Math.log10(usd / 500_000)));
    // Whale count: 1-7 based on USD value (log scale)
    const whaleCount = Math.max(1, 3 + Math.round(4 * Math.min(1, Math.log10(usd / 500_000) / 3)));

    // Root container (interactive)
    const root = new Container();
    root.eventMode = "static";
    root.cursor = "pointer";
    root.on("pointerdown", (e) => {
      e.stopPropagation();
      onClickRef.current();
    });
    containerRef.current = root;
    root.alpha = RESTING_ALPHA;
    world.addChild(root);

    // --- Glow (wider, dimmer) — drawn synchronously ---
    const glow = new Graphics();
    glow.setStrokeStyle({ width: lineWidth * 3, color, alpha: 0.15 });
    glow.moveTo(from.x, from.y);
    for (let i = 1; i <= 24; i++) {
      const pt = bezierAt(i / 24, from, cp, selfTo);
      glow.lineTo(pt.x, pt.y);
    }
    glow.stroke();
    root.addChild(glow);

    // --- Main line — drawn synchronously ---
    const line = new Graphics();
    line.setStrokeStyle({ width: Math.max(2, lineWidth), color });
    line.moveTo(from.x, from.y);
    for (let i = 1; i <= 32; i++) {
      const pt = bezierAt(i / 32, from, cp, selfTo);
      line.lineTo(pt.x, pt.y);
    }
    line.stroke();
    root.addChild(line);

    // --- USD label at curve midpoint ---
    const midPt = bezierAt(0.5, from, cp, selfTo);
    const label = new Text({
      text: formatUsd(usd),
      style: {
        fontFamily: "Inter, sans-serif",
        fontSize: 11,
        fill: 0xffffff,
        fontWeight: "700",
        dropShadow: {
          alpha: 0.9,
          blur: 3,
          distance: 1,
        },
      },
    });
    label.anchor.set(0.5, 1);
    label.position.set(midPt.x, midPt.y - 8);
    root.addChild(label);

    // --- Whale sprites: load async, then animate swimming ---
    let destroyed = false;
    let rafId: number;
    const sprites: Sprite[] = [];

    const init = async () => {
      const texture = await Assets.load(WHALE_MINI_SPRITE);
      if (destroyed) return;

      for (let i = 0; i < whaleCount; i++) {
        const s = new Sprite(texture);
        s.anchor.set(0.5);
        s.tint = color;
        root.addChild(s);
        sprites.push(s);
      }

      // Position sprites initially
      placeWhales(0);

      // Animate swimming oscillation
      const startTime = performance.now();
      const swim = (now: number) => {
        if (destroyed) return;
        placeWhales(now - startTime);
        rafId = requestAnimationFrame(swim);
      };
      rafId = requestAnimationFrame(swim);
    };

    function placeWhales(elapsed: number) {
      for (let i = 0; i < sprites.length; i++) {
        const s = sprites[i];
        // Oscillate along curve for swimming effect
        const baseT = (i + 1) / (sprites.length + 1);
        const oscillation = Math.sin(elapsed / 800 + i * 1.2) * 0.03;
        const t = Math.min(1, Math.max(0, baseT + oscillation));

        const pos = bezierAt(t, from, cp, selfTo);
        const tang = bezierTangent(t, from, cp, selfTo);

        s.position.set(pos.x, pos.y);
        s.rotation = Math.atan2(tang.y, tang.x);
        s.scale.x = tang.x < 0 ? -1 : 1;
      }
    }

    init();

    return () => {
      destroyed = true;
      cancelAnimationFrame(rafId);
      if (root.parent) {
        world.removeChild(root);
      }
      root.destroy({ children: true });
    };
  }, [whale, world]);

  return null;
}
