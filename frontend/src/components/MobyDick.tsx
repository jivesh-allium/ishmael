import { useEffect, useRef } from "react";
import { Container, Sprite, Assets } from "pixi.js";
import { WHITE_WHALE_SPRITE } from "../assets/sprites";
import { MAP_WIDTH, MAP_HEIGHT } from "../lib/geo";

interface Props {
  world: Container;
  hidden: boolean;
  onClick: () => void;
}

type Phase = "fading_in" | "visible" | "fading_out" | "hidden";

/**
 * Moby Dick — a tiny white whale that roams the map.
 * Drifts slowly, fades in/out on a cycle. Clicking it triggers parent handler.
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
      sprite.scale.set(0.35);
      root.addChild(sprite);

      // Phase state machine for disappear/reappear cycle
      let phase: Phase = "fading_in";
      let phaseStart = performance.now();

      function phaseDuration(p: Phase): number {
        switch (p) {
          case "fading_in": return 2000;
          case "visible": return 30000 + Math.random() * 30000;
          case "fading_out": return 2000;
          case "hidden": return 10000 + Math.random() * 10000;
        }
      }

      let currentPhaseDuration = phaseDuration(phase);

      function nextPhase() {
        switch (phase) {
          case "fading_in":
            phase = "visible";
            break;
          case "visible":
            phase = "fading_out";
            break;
          case "fading_out":
            phase = "hidden";
            root.eventMode = "none";
            break;
          case "hidden":
            // Teleport to new random position
            root.x = MAP_WIDTH * 0.1 + Math.random() * MAP_WIDTH * 0.8;
            root.y = MAP_HEIGHT * 0.2 + Math.random() * MAP_HEIGHT * 0.6;
            vx = (Math.random() > 0.5 ? 1 : -1) * (0.15 + Math.random() * 0.25);
            vy = (Math.random() - 0.5) * 0.1;
            phase = "fading_in";
            root.eventMode = "static";
            break;
        }
        phaseStart = performance.now();
        currentPhaseDuration = phaseDuration(phase);
      }

      const animate = (now: number) => {
        if (destroyed) return;
        const elapsed = now - phaseStart;

        // Phase transitions
        if (elapsed >= currentPhaseDuration) {
          nextPhase();
        }

        // Alpha based on phase
        const phaseT = Math.min(1, elapsed / currentPhaseDuration);
        switch (phase) {
          case "fading_in":
            root.alpha = phaseT;
            break;
          case "visible":
            root.alpha = 1;
            break;
          case "fading_out":
            root.alpha = 1 - phaseT;
            break;
          case "hidden":
            root.alpha = 0;
            break;
        }

        // Drift (even when hidden, so it's in a new spot on respawn)
        root.x += vx;
        root.y += vy;

        // Wrap horizontally
        if (root.x < 0) root.x += MAP_WIDTH;
        else if (root.x > MAP_WIDTH) root.x -= MAP_WIDTH;
        // Bounce off vertical edges with padding
        const pad = 100;
        if (root.y < pad || root.y > MAP_HEIGHT - pad) {
          vy = -vy;
          root.y = Math.max(pad, Math.min(MAP_HEIGHT - pad, root.y));
        }

        // Gentle bobbing (reduced)
        sprite.y = Math.sin(now / 600) * 1;
        sprite.rotation = Math.sin(now / 1200) * 0.02;

        // Flip sprite based on direction
        sprite.scale.x = vx < 0 ? -0.35 : 0.35;

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

  // React to hidden prop changes (from parent click handler)
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (hidden) {
      root.visible = false;
      root.eventMode = "none";
    } else {
      root.visible = true;
      root.alpha = 0;
      root.eventMode = "static";
    }
  }, [hidden]);

  return null;
}
