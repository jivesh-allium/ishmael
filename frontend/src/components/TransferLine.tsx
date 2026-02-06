import { useEffect, useRef } from "react";
import { Container, Graphics, Sprite, Text, Assets } from "pixi.js";
import { geoToPixel } from "../lib/geo";
import { WHALE_MINI_SPRITE } from "../assets/sprites";
import type { WhaleAlert } from "../types/whale";
import { ALERT_COLORS } from "../types/whale";
import { formatUsd } from "../lib/api";

interface Props {
  whale: WhaleAlert;
  world: Container;
  onClick: () => void;
  xOffset?: number;
  age?: number;
  rank?: number; // 0-based index in the visible list (for label visibility)
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
  rankOffset = 0,
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
  const offset = Math.min(dist * 0.3, 120) + rankOffset * 3;
  return { x: midX + nx * offset, y: midY + ny * offset };
}

export function TransferLine({ whale, world, onClick, xOffset = 0, age, rank = 0 }: Props) {
  const containerRef = useRef<Container | null>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    // Resolve coordinates — treat missing geo as "same location" (self-transfer loop)
    const toHasGeo = whale.to_lat != null && whale.to_lon != null;
    const fromHasGeo = whale.from_lat != null && whale.from_lon != null;

    // Anchor to whichever end has geo; if neither, use map center
    const anchorLat = fromHasGeo ? whale.from_lat!
      : toHasGeo ? whale.to_lat!
      : 20;
    const anchorLon = fromHasGeo ? whale.from_lon!
      : toHasGeo ? whale.to_lon!
      : 0;

    // If both ends have geo, draw an arc; otherwise self-transfer loop at the anchor
    const bothHaveGeo = toHasGeo && fromHasGeo;

    const from = geoToPixel(
      fromHasGeo ? whale.from_lat! : anchorLat,
      fromHasGeo ? whale.from_lon! : anchorLon,
    );
    const to = bothHaveGeo
      ? geoToPixel(whale.to_lat!, whale.to_lon!)
      : { x: from.x, y: from.y };

    // Per-line endpoint jitter to prevent convergence at the same pixel
    const lineHash = (whale.tx_hash + whale.alert_type)
      .split("").reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    const absHash = Math.abs(lineHash);
    const jitterX = (absHash % 17) - 8;
    const jitterY = ((absHash * 7) % 17) - 8;
    from.x += jitterX; from.y += jitterY;
    to.x += jitterX * 0.7; to.y += jitterY * 0.7;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const isSelfTransfer = Math.sqrt(dx * dx + dy * dy) < 5 || !bothHaveGeo;
    const cp = controlPoint(from, to, rank);
    const selfTo = isSelfTransfer ? { x: from.x, y: from.y + 2 } : to;

    // Apply xOffset to all X coords
    from.x += xOffset;
    to.x += xOffset;
    cp.x += xOffset;
    selfTo.x += xOffset;

    const color = ALERT_COLORS[whale.alert_type] ?? 0x4488ff;
    const usd = whale.usd_value;

    // Line width: 1-4px based on USD value (log scale) — thinner than before
    const lineWidth = Math.max(1, Math.min(4, 1 + 3 * Math.log10(usd / 500_000)));
    // Single whale sprite per line (only 2 for very large transfers)
    const whaleCount = usd >= 50_000_000 ? 2 : 1;

    // Root container (interactive)
    const root = new Container();
    root.eventMode = "static";
    root.cursor = "pointer";
    root.on("pointerdown", (e) => {
      e.stopPropagation();
      onClickRef.current();
    });
    containerRef.current = root;

    // Age-based alpha decay: ~0.55 fresh, ~0.30 after 1h, ~0.20 after 4h, floor at 0.15
    const ageMinutes = (age ?? 0) / 60_000;
    const alpha = 0.15 + 0.40 * Math.exp(-ageMinutes / 60);
    root.alpha = alpha;

    world.addChild(root);

    // --- Glow — only for fresh/large transfers ---
    if (ageMinutes < 30 && usd >= 5_000_000) {
      const glow = new Graphics();
      glow.setStrokeStyle({ width: lineWidth * 2, color, alpha: 0.04 });
      glow.moveTo(from.x, from.y);
      for (let i = 1; i <= 20; i++) {
        const pt = bezierAt(i / 20, from, cp, selfTo);
        glow.lineTo(pt.x, pt.y);
      }
      glow.stroke();
      root.addChild(glow);
    }

    // --- Main line ---
    const line = new Graphics();
    line.setStrokeStyle({ width: Math.max(1.5, lineWidth), color });
    line.moveTo(from.x, from.y);
    for (let i = 1; i <= 24; i++) {
      const pt = bezierAt(i / 24, from, cp, selfTo);
      line.lineTo(pt.x, pt.y);
    }
    line.stroke();
    root.addChild(line);

    // --- USD label — only show on top 6 by rank and only at offset=0 ---
    if (rank < 6 && xOffset === 0) {
      const midPt = bezierAt(0.5, from, cp, selfTo);
      const label = new Text({
        text: formatUsd(usd),
        style: {
          fontFamily: "Inter, sans-serif",
          fontSize: 8,
          fill: 0xffffff,
          fontWeight: "600",
          dropShadow: {
            alpha: 0.8,
            blur: 2,
            distance: 1,
          },
        },
      });
      label.anchor.set(0.5, 1);
      label.position.set(midPt.x, midPt.y - 6);
      label.alpha = 0.7;
      root.addChild(label);
    }

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
  }, [whale, world, xOffset, age, rank]);

  return null;
}
