import { useEffect, useRef } from "react";
import { Container, Sprite, Text, Graphics, Assets } from "pixi.js";
import { geoToPixel } from "../lib/geo";
import { ISLAND_SPRITE } from "../assets/sprites";
import type { MapEntity } from "../types/whale";

interface Props {
  entity: MapEntity;
  world: Container;
  onClick: () => void;
  xOffset?: number;
  highlighted?: boolean;
}

export function IslandMarker({ entity, world, onClick, xOffset = 0, highlighted = false }: Props) {
  const containerRef = useRef<Container | null>(null);

  useEffect(() => {
    const container = new Container();
    containerRef.current = container;

    const pos = geoToPixel(entity.lat, entity.lon);
    // Add consistent offset per entity to spread out clusters
    const hash = entity.label.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const offsetX = ((hash % 30) - 15);
    const offsetY = (((hash * 7) % 30) - 15);
    container.position.set(pos.x + offsetX + xOffset, pos.y + offsetY);

    container.eventMode = "static";
    container.cursor = "pointer";
    container.on("pointerdown", (e) => {
      e.stopPropagation();
      onClick();
    });

    const isDiscovered = entity.discovered ?? false;

    let destroyed = false;
    let rafId: number;

    const loadSprite = async () => {
      const texture = await Assets.load(ISLAND_SPRITE);
      if (destroyed) return;

      if (isDiscovered && !highlighted) {
        // Discovered entities: render as a tiny dot instead of full island sprite
        const dot = new Graphics();
        dot.setFillStyle({ color: 0x88aacc, alpha: 0.25 });
        dot.circle(0, 0, 3);
        dot.fill();
        container.addChild(dot);

        // Minimal label — only the first word
        const shortLabel = entity.label.split(" ")[0];
        const label = new Text({
          text: shortLabel,
          style: {
            fontFamily: "Inter, sans-serif",
            fontSize: 5,
            fill: 0x88aacc,
            fontWeight: "400",
          },
        });
        label.anchor.set(0.5, 0);
        label.position.set(0, 5);
        label.alpha = 0.4;
        container.addChild(label);
      } else {
        // Undiscovered or highlighted: full island sprite
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5, 0.8);
        sprite.scale.set(highlighted ? 0.8 : 0.6);
        container.addChild(sprite);

        const label = new Text({
          text: entity.label,
          style: {
            fontFamily: "Inter, sans-serif",
            fontSize: highlighted ? 9 : 7,
            fill: highlighted ? 0xffd700 : 0xe2d9c0,
            fontWeight: highlighted ? "700" : "500",
            dropShadow: {
              alpha: 0.9,
              blur: 3,
              distance: 1,
              color: 0x000000,
            },
          },
        });
        label.anchor.set(0.5, 0);
        label.position.set(0, 6);
        container.addChild(label);
      }

      // Highlight ring when selected
      if (highlighted) {
        const ring = new Graphics();
        container.addChildAt(ring, 0);

        const startTime = performance.now();
        const pulse = (now: number) => {
          if (destroyed) return;
          const t = (now - startTime) / 1000;
          const pulseAlpha = 0.3 + 0.25 * Math.sin(t * 3);
          const pulseRadius = 20 + 4 * Math.sin(t * 3);
          ring.clear();
          ring.setStrokeStyle({ width: 2, color: 0xffd700, alpha: pulseAlpha });
          ring.circle(0, -5, pulseRadius);
          ring.stroke();
          ring.setFillStyle({ color: 0xffd700, alpha: pulseAlpha * 0.12 });
          ring.circle(0, -5, pulseRadius);
          ring.fill();
          rafId = requestAnimationFrame(pulse);
        };
        rafId = requestAnimationFrame(pulse);
      }
    };

    loadSprite();
    world.addChild(container);

    return () => {
      destroyed = true;
      cancelAnimationFrame(rafId);
      world.removeChild(container);
      container.destroy({ children: true });
    };
  }, [entity, world, onClick, xOffset, highlighted]);

  return null;
}
