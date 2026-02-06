import { useEffect, useRef } from "react";
import { Container, Sprite, Text, Assets } from "pixi.js";
import { WHITE_WHALE_SPRITE } from "../assets/sprites";
import { MAP_WIDTH, MAP_HEIGHT } from "../lib/geo";

interface Props {
  world: Container;
  hidden: boolean;
  onClick: () => void;
}

/**
 * Moby Dick — a white whale that roams the map forever.
 * Drifts slowly, bounces off edges. Clicking it hides it (controlled by parent).
 */
export function MobyDick({ world, hidden, onClick }: Props) {
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  const rootRef = useRef<Container | null>(null);

  useEffect(() => {
    let destroyed = false;
    let rafId: number;
    const root = new Container();
    rootRef.current = root;

    // Start near center of map
    const startX = MAP_WIDTH * 0.3 + Math.random() * MAP_WIDTH * 0.4;
    const startY = MAP_HEIGHT * 0.3 + Math.random() * MAP_HEIGHT * 0.4;
    root.position.set(startX, startY);
    root.alpha = 0;
    root.eventMode = "static";
    root.cursor = "pointer";
    root.on("pointerdown", (e) => {
      e.stopPropagation();
      onClickRef.current();
    });
    world.addChild(root);

    // Drift velocity — slow, mostly horizontal
    let vx = (Math.random() > 0.5 ? 1 : -1) * (0.15 + Math.random() * 0.25);
    let vy = (Math.random() - 0.5) * 0.1;

    const loadAndAnimate = async () => {
      const texture = await Assets.load(WHITE_WHALE_SPRITE);
      if (destroyed) return;

      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.scale.set(1.8);
      root.addChild(sprite);

      // "Moby Dick" label
      const label = new Text({
        text: "Moby Dick",
        style: {
          fontFamily: "'Pirata One', cursive",
          fontSize: 11,
          fill: 0xf5f0e6,
          fontWeight: "700",
          dropShadow: {
            alpha: 0.8,
            blur: 4,
            distance: 1,
            color: 0x000000,
          },
        },
      });
      label.anchor.set(0.5, 0);
      label.position.set(0, 30);
      root.addChild(label);

      const startTime = performance.now();

      const animate = (now: number) => {
        if (destroyed) return;
        const elapsed = now - startTime;

        // Fade in over first 2 seconds (only when visible)
        if (root.visible && root.alpha < 1) {
          root.alpha = Math.min(1, root.alpha + 0.02);
        }

        // Drift (even when hidden, so it's in a new spot on respawn)
        root.x += vx;
        root.y += vy;

        // Bounce off map edges with padding
        const pad = 100;
        if (root.x < pad || root.x > MAP_WIDTH - pad) {
          vx = -vx;
          root.x = Math.max(pad, Math.min(MAP_WIDTH - pad, root.x));
        }
        if (root.y < pad || root.y > MAP_HEIGHT - pad) {
          vy = -vy;
          root.y = Math.max(pad, Math.min(MAP_HEIGHT - pad, root.y));
        }

        // Gentle bobbing
        sprite.y = Math.sin(elapsed / 600) * 3;
        sprite.rotation = Math.sin(elapsed / 1200) * 0.05;

        // Flip sprite based on direction
        sprite.scale.x = vx < 0 ? -1.8 : 1.8;

        rafId = requestAnimationFrame(animate);
      };

      rafId = requestAnimationFrame(animate);
    };

    loadAndAnimate();

    return () => {
      destroyed = true;
      cancelAnimationFrame(rafId);
      if (root.parent) world.removeChild(root);
      root.destroy({ children: true });
      rootRef.current = null;
    };
  }, [world]);

  // React to hidden prop changes
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (hidden) {
      root.visible = false;
      root.eventMode = "none";
    } else {
      root.visible = true;
      root.alpha = 0; // fade back in via animation loop
      root.eventMode = "static";
    }
  }, [hidden]);

  return null;
}
