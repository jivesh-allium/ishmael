import { useRef, useEffect, useState, useCallback } from "react";
import { Application, Container, TilingSprite, Texture, Assets, Graphics } from "pixi.js";
import { geoToPixel, MAP_WIDTH, MAP_HEIGHT } from "../lib/geo";
import { OCEAN_TILE } from "../assets/sprites";
import type { MapEntity, WhaleAlert } from "../types/whale";
import { IslandMarker } from "./IslandMarker";
import { ShipCursor } from "./ShipCursor";
import { TransferLine } from "./TransferLine";
import { MobyDick } from "./MobyDick";

interface Props {
  entities: MapEntity[];
  whales: WhaleAlert[];
  onSelectWhale: (whale: WhaleAlert) => void;
  onSelectIsland: (entity: MapEntity) => void;
  onMobyClick: () => void;
  mobyHidden: boolean;
  panTarget: { x: number; y: number } | null;
}

export function OceanMap({
  entities,
  whales,
  onSelectWhale,
  onSelectIsland,
  onMobyClick,
  mobyHidden,
  panTarget,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const transferLayerRef = useRef<Container | null>(null);
  // Stable callbacks to prevent TransferLine re-mounts
  const onSelectWhaleRef = useRef(onSelectWhale);
  onSelectWhaleRef.current = onSelectWhale;
  const [ready, setReady] = useState(false);

  // Camera state
  const camera = useRef({ x: 0, y: 0, scale: 0.8 });
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const mouseWorld = useRef({ x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 });

  useEffect(() => {
    if (!canvasRef.current) return;

    let destroyed = false;
    const app = new Application();
    const initApp = async () => {
      await app.init({
        background: 0x0a1628,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        width: canvasRef.current?.clientWidth ?? 800,
        height: canvasRef.current?.clientHeight ?? 600,
      });

      // Guard: component unmounted during async init
      if (destroyed || !canvasRef.current) {
        app.destroy(true, { children: true });
        return;
      }

      canvasRef.current.appendChild(app.canvas);
      appRef.current = app;

      // World container (everything moves together)
      const world = new Container();
      app.stage.addChild(world);
      worldRef.current = world;

      // Ocean tiling background
      const oceanTexture = await Assets.load(OCEAN_TILE);
      if (destroyed) return;
      const ocean = new TilingSprite({
        texture: oceanTexture,
        width: MAP_WIDTH + 400,
        height: MAP_HEIGHT + 400,
      });
      ocean.position.set(-200, -200);
      world.addChild(ocean);

      // Draw subtle grid lines for lat/lon reference
      const gridGraphics = new Graphics();
      gridGraphics.setStrokeStyle({ width: 0.5, color: 0x1a3a5c, alpha: 0.3 });
      // Longitude lines every 30 degrees
      for (let lon = -180; lon <= 180; lon += 30) {
        const x = geoToPixel(0, lon).x;
        gridGraphics.moveTo(x, 0);
        gridGraphics.lineTo(x, MAP_HEIGHT);
        gridGraphics.stroke();
      }
      // Latitude lines every 30 degrees
      for (let lat = -60; lat <= 60; lat += 30) {
        const y = geoToPixel(lat, 0).y;
        gridGraphics.moveTo(0, y);
        gridGraphics.lineTo(MAP_WIDTH, y);
        gridGraphics.stroke();
      }
      world.addChild(gridGraphics);

      // Transfer layer (above grid, below islands)
      const transferLayer = new Container();
      world.addChild(transferLayer);
      transferLayerRef.current = transferLayer;

      // Center camera
      camera.current = {
        x: -MAP_WIDTH / 2 * 0.8 + app.screen.width / 2,
        y: -MAP_HEIGHT / 2 * 0.8 + app.screen.height / 2,
        scale: 0.8,
      };
      world.position.set(camera.current.x, camera.current.y);
      world.scale.set(camera.current.scale);

      setReady(true);
    };

    initApp();

    return () => {
      destroyed = true;
      setReady(false);
      worldRef.current = null;
      transferLayerRef.current = null;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, []);

  // Update camera from pan/zoom
  const updateCamera = useCallback(() => {
    if (!worldRef.current) return;
    worldRef.current.position.set(camera.current.x, camera.current.y);
    worldRef.current.scale.set(camera.current.scale);
  }, []);

  // Mouse handlers for pan/zoom
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const handleMouseDown = (e: MouseEvent) => {
      dragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      // Track mouse in world coordinates for ship cursor
      if (worldRef.current) {
        const c = camera.current;
        mouseWorld.current = {
          x: (e.clientX - c.x) / c.scale,
          y: (e.clientY - c.y) / c.scale,
        };
      }

      if (!dragging.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      camera.current.x += dx;
      camera.current.y += dy;
      updateCamera();
    };

    const handleMouseUp = () => {
      dragging.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const newScale = Math.min(5, Math.max(0.2, camera.current.scale * factor));
      const ratio = newScale / camera.current.scale;

      // Zoom toward mouse cursor
      camera.current.x = e.clientX - (e.clientX - camera.current.x) * ratio;
      camera.current.y = e.clientY - (e.clientY - camera.current.y) * ratio;
      camera.current.scale = newScale;
      updateCamera();
    };

    el.addEventListener("mousedown", handleMouseDown);
    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("mouseup", handleMouseUp);
    el.addEventListener("mouseleave", handleMouseUp);
    el.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      el.removeEventListener("mousedown", handleMouseDown);
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("mouseup", handleMouseUp);
      el.removeEventListener("mouseleave", handleMouseUp);
      el.removeEventListener("wheel", handleWheel);
    };
  }, [updateCamera]);

  // Handle panTarget changes (from clicking alerts in feed)
  useEffect(() => {
    if (!panTarget || !appRef.current) return;
    const app = appRef.current;
    camera.current.x = -panTarget.x * camera.current.scale + app.screen.width / 2;
    camera.current.y = -panTarget.y * camera.current.scale + app.screen.height / 2;
    updateCamera();
  }, [panTarget, updateCamera]);

  return (
    <div ref={canvasRef} className="absolute inset-0 cursor-grab active:cursor-grabbing">
      {ready && worldRef.current && (
        <>
          {/* Island markers for known entities */}
          {entities.map((entity) => (
            <IslandMarker
              key={entity.label}
              entity={entity}
              world={worldRef.current!}
              onClick={() => onSelectIsland(entity)}
            />
          ))}

          {/* Transfer lines with whale convoys */}
          {whales.slice(0, 100).map((whale) => (
            <TransferLine
              key={`tl-${whale.tx_hash}-${whale.alert_type}`}
              whale={whale}
              world={worldRef.current!}
              onClick={() => onSelectWhaleRef.current(whale)}
            />
          ))}

          {/* Ship cursor */}
          <ShipCursor
            world={worldRef.current}
            mouseWorld={mouseWorld}
          />

          {/* Moby Dick easter egg */}
          <MobyDick
            world={worldRef.current!}
            hidden={mobyHidden}
            onClick={onMobyClick}
          />
        </>
      )}
    </div>
  );
}
