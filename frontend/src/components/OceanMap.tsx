import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Application, Container, TilingSprite, Texture, Assets, Graphics } from "pixi.js";
import { geoToPixel, MAP_WIDTH, MAP_HEIGHT } from "../lib/geo";
import { OCEAN_TILE } from "../assets/sprites";
import type { MapEntity, WhaleAlert } from "../types/whale";
import { IslandMarker } from "./IslandMarker";
import { ShipCursor } from "./ShipCursor";
import { TransferLine } from "./TransferLine";
import { MobyDick } from "./MobyDick";

// No horizontal wrapping — single map copy only
const ISLAND_OFFSETS = [0];

interface Props {
  entities: MapEntity[];
  whales: WhaleAlert[];
  selectedWhale: WhaleAlert | null;
  selectedIsland: MapEntity | null;
  onSelectWhale: (whale: WhaleAlert) => void;
  onSelectIsland: (entity: MapEntity) => void;
  onMobyClick: () => void;
  mobyHidden: boolean;
  panTarget: { x: number; y: number } | null;
}

export function OceanMap({
  entities,
  whales,
  selectedWhale,
  selectedIsland,
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

      // Ocean tiling background — single map extent plus small margin
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
      const initialScale = Math.max(app.screen.height / MAP_HEIGHT, 0.8);
      camera.current = {
        x: -MAP_WIDTH / 2 * initialScale + app.screen.width / 2,
        y: -MAP_HEIGHT / 2 * initialScale + app.screen.height / 2,
        scale: initialScale,
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

  // Camera normalization: X + Y both clamped (no infinite scroll)
  const clampCamera = useCallback(() => {
    const app = appRef.current;
    if (!app) return;
    const s = camera.current.scale;
    const screenW = app.screen.width;
    const screenH = app.screen.height;

    // X: clamp so map doesn't scroll beyond edges
    const mapW = MAP_WIDTH * s;
    if (mapW <= screenW) {
      camera.current.x = (screenW - mapW) / 2;
    } else {
      camera.current.x = Math.min(0, Math.max(-(mapW - screenW), camera.current.x));
    }

    // Y: clamp so map always fills viewport vertically
    const mapH = MAP_HEIGHT * s;
    if (mapH <= screenH) {
      camera.current.y = (screenH - mapH) / 2;
    } else {
      camera.current.y = Math.min(0, Math.max(-(mapH - screenH), camera.current.y));
    }
  }, []);

  // Update camera from pan/zoom
  const updateCamera = useCallback(() => {
    if (!worldRef.current) return;
    clampCamera();
    worldRef.current.position.set(camera.current.x, camera.current.y);
    worldRef.current.scale.set(camera.current.scale);
  }, [clampCamera]);

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

    let lastWheelTime = 0;
    const WHEEL_THROTTLE_MS = 16; // ~60fps cap

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const now = performance.now();
      if (now - lastWheelTime < WHEEL_THROTTLE_MS) return;
      lastWheelTime = now;

      // Horizontal scroll → pan (trackpad two-finger)
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 2) {
        camera.current.x -= e.deltaX;
        updateCamera();
        return;
      }

      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const minScale = appRef.current ? appRef.current.screen.height / MAP_HEIGHT : 0.5;
      const newScale = Math.min(5, Math.max(minScale, camera.current.scale * factor));
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

  // Compute highlighted address set from selected whale or island
  const highlightedAddresses = useMemo(() => {
    const addrs = new Set<string>();
    if (selectedWhale) {
      if (selectedWhale.from_address) addrs.add(selectedWhale.from_address.toLowerCase());
      if (selectedWhale.to_address) addrs.add(selectedWhale.to_address.toLowerCase());
    }
    if (selectedIsland) {
      for (const a of selectedIsland.addresses) addrs.add(a.address.toLowerCase());
    }
    return addrs;
  }, [selectedWhale, selectedIsland]);

  // Compute age for each whale (ms since block_timestamp)
  const now = Date.now();

  return (
    <div ref={canvasRef} className="absolute inset-0 cursor-grab active:cursor-grabbing">
      {ready && worldRef.current && (
        <>
          {/* Island markers */}
          {ISLAND_OFFSETS.flatMap(offset =>
            entities.map(entity => {
              const isHighlighted = highlightedAddresses.size > 0 &&
                entity.addresses.some(a => highlightedAddresses.has(a.address.toLowerCase()));
              return (
                <IslandMarker
                  key={`${entity.label}:${offset}`}
                  entity={entity}
                  world={worldRef.current!}
                  onClick={() => onSelectIsland(entity)}
                  xOffset={offset}
                  highlighted={isHighlighted}
                />
              );
            })
          )}

          {/* Transfer lines (no wrap offsets — single map copy) */}
          {whales.slice(0, 150).map((whale, rank) => {
            const ts = whale.block_timestamp.endsWith("Z") || whale.block_timestamp.includes("+")
              ? whale.block_timestamp
              : whale.block_timestamp + "Z";
            const age = now - new Date(ts).getTime();
            return (
              <TransferLine
                key={`tl-${whale.tx_hash}-${whale.alert_type}`}
                whale={whale}
                world={transferLayerRef.current!}
                onClick={() => onSelectWhaleRef.current(whale)}
                age={age}
                rank={rank}
              />
            );
          })}

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
