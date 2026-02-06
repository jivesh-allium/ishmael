import { useEffect, useRef } from "react";
import { Container, Sprite, Text, Assets } from "pixi.js";
import { geoToPixel } from "../lib/geo";
import { ISLAND_SPRITE } from "../assets/sprites";
import type { MapEntity } from "../types/whale";

interface Props {
  entity: MapEntity;
  world: Container;
  onClick: () => void;
}

export function IslandMarker({ entity, world, onClick }: Props) {
  const containerRef = useRef<Container | null>(null);

  useEffect(() => {
    const container = new Container();
    containerRef.current = container;

    const pos = geoToPixel(entity.lat, entity.lon);
    // Add consistent offset per entity to spread out clusters
    const hash = entity.label.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const offsetX = ((hash % 30) - 15);
    const offsetY = (((hash * 7) % 30) - 15);
    container.position.set(pos.x + offsetX, pos.y + offsetY);

    container.eventMode = "static";
    container.cursor = "pointer";
    container.on("pointerdown", (e) => {
      e.stopPropagation();
      onClick();
    });

    const isDiscovered = entity.discovered ?? false;

    const loadSprite = async () => {
      const texture = await Assets.load(ISLAND_SPRITE);
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.8);
      sprite.scale.set(isDiscovered ? 0.45 : 0.8);
      if (isDiscovered) sprite.alpha = 0.6;
      container.addChild(sprite);

      // Label
      const label = new Text({
        text: entity.label,
        style: {
          fontFamily: "Inter, sans-serif",
          fontSize: isDiscovered ? 7 : 9,
          fill: isDiscovered ? 0x88aacc : 0xe2d9c0,
          fontWeight: "500",
          dropShadow: {
            alpha: 0.9,
            blur: 3,
            distance: 1,
            color: 0x000000,
          },
        },
      });
      label.anchor.set(0.5, 0);
      label.position.set(0, isDiscovered ? 4 : 8);
      container.addChild(label);

      // Chain badge (skip for discovered — too much clutter)
      if (!isDiscovered) {
        const chains = [...new Set(entity.addresses.map((a) => a.chain))].join(", ");
        const badge = new Text({
          text: chains,
          style: {
            fontFamily: "Inter, sans-serif",
            fontSize: 7,
            fill: 0x88aacc,
            fontWeight: "400",
          },
        });
        badge.anchor.set(0.5, 0);
        badge.position.set(0, 20);
        container.addChild(badge);
      }
    };

    loadSprite();
    world.addChild(container);

    return () => {
      world.removeChild(container);
      container.destroy({ children: true });
    };
  }, [entity, world, onClick]);

  return null;
}
