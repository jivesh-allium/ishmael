import { useEffect, useRef } from "react";
import { Container, Sprite, Assets } from "pixi.js";
import { SHIP_SPRITE } from "../assets/sprites";

interface Props {
  world: Container;
  mouseWorld: React.MutableRefObject<{ x: number; y: number }>;
}

export function ShipCursor({ world, mouseWorld }: Props) {
  const spriteRef = useRef<Sprite | null>(null);

  useEffect(() => {
    const container = new Container();
    container.zIndex = 1000;

    const loadSprite = async () => {
      const texture = await Assets.load(SHIP_SPRITE);
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.scale.set(0.6);
      sprite.alpha = 0.7;
      spriteRef.current = sprite;
      container.addChild(sprite);

      // Smooth follow animation
      const tick = () => {
        if (sprite.destroyed) return;
        const target = mouseWorld.current;
        sprite.x += (target.x - sprite.x) * 0.08;
        sprite.y += (target.y - sprite.y) * 0.08;

        // Subtle bob animation
        sprite.y += Math.sin(Date.now() / 800) * 0.3;
        sprite.rotation = Math.sin(Date.now() / 1200) * 0.05;

        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    loadSprite();
    world.addChild(container);

    return () => {
      world.removeChild(container);
      container.destroy({ children: true });
    };
  }, [world, mouseWorld]);

  return null;
}
