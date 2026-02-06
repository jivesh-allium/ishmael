import { useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { OceanMap } from "./components/OceanMap";
import { AlertFeed } from "./components/AlertFeed";
import { WhaleInspector, IslandInspector } from "./components/WalletInspector";
import { Compass } from "./components/Compass";
import { useWhaleUpdates } from "./hooks/useWhaleUpdates";
import { fetchMapData, fetchWhales } from "./lib/api";
import type { MapEntity, WhaleAlert } from "./types/whale";

export default function App() {
  const [entities, setEntities] = useState<MapEntity[]>([]);
  const [whales, setWhales] = useState<WhaleAlert[]>([]);
  const [selectedWhale, setSelectedWhale] = useState<WhaleAlert | null>(null);
  const [selectedIsland, setSelectedIsland] = useState<MapEntity | null>(null);
  const [panTarget, setPanTarget] = useState<{ x: number; y: number } | null>(null);

  // Load initial data + periodically refresh map (picks up discovered entities)
  useEffect(() => {
    const loadMap = () =>
      fetchMapData()
        .then((data) => setEntities(data.entities))
        .catch((err) => console.error("Failed to load map:", err));

    loadMap();
    const mapInterval = setInterval(loadMap, 30_000);

    fetchWhales(200)
      .then((data) => setWhales(data.alerts))
      .catch((err) => console.error("Failed to load whales:", err));

    return () => clearInterval(mapInterval);
  }, []);

  // WebSocket for live alerts
  const onNewAlert = useCallback((alert: WhaleAlert) => {
    setWhales((prev) => [alert, ...prev].slice(0, 500));
  }, []);

  const { connected } = useWhaleUpdates(onNewAlert);

  const handleClickAlert = useCallback(
    (whale: WhaleAlert, pixel: { x: number; y: number }) => {
      setSelectedWhale(whale);
      setSelectedIsland(null);
      setPanTarget(pixel);
    },
    []
  );

  const handleSelectWhale = useCallback((whale: WhaleAlert) => {
    setSelectedWhale(whale);
    setSelectedIsland(null);
  }, []);

  const handleSelectIsland = useCallback((entity: MapEntity) => {
    setSelectedIsland(entity);
    setSelectedWhale(null);
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0a1628] relative">
      {/* Title bar */}
      <div className="absolute top-0 left-0 right-80 z-20 p-4 pointer-events-none">
        <h1
          className="text-2xl text-amber-100 drop-shadow-lg"
          style={{ fontFamily: "'Pirata One', cursive" }}
        >
          ⚓ Pequod — Whale Explorer
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Navigate the ocean of crypto whale transactions
        </p>
      </div>

      {/* Main map canvas */}
      <OceanMap
        entities={entities}
        whales={whales}
        onSelectWhale={handleSelectWhale}
        onSelectIsland={handleSelectIsland}
        panTarget={panTarget}
      />

      {/* Right panel: alert feed */}
      <AlertFeed
        alerts={whales}
        onClickAlert={handleClickAlert}
        connected={connected}
      />

      {/* Bottom minimap compass */}
      <Compass entities={entities} whales={whales} />

      {/* Inspector popup */}
      <AnimatePresence>
        {selectedWhale && (
          <WhaleInspector
            whale={selectedWhale}
            onClose={() => setSelectedWhale(null)}
          />
        )}
        {selectedIsland && (
          <IslandInspector
            entity={selectedIsland}
            onClose={() => setSelectedIsland(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
