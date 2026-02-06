import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { OceanMap } from "./components/OceanMap";
import { AlertFeed } from "./components/AlertFeed";
import { WhaleInspector, IslandInspector } from "./components/WalletInspector";
import { Compass } from "./components/Compass";
import { WhitenessModal } from "./components/WhitenessModal";
import { useWhaleUpdates } from "./hooks/useWhaleUpdates";
import { fetchMapData, fetchWhales } from "./lib/api";
import { randomQuote, jokeOfTheHour, CHAPTER_49 } from "./lib/quotes";
import type { MapEntity, WhaleAlert } from "./types/whale";

export default function App() {
  const [entities, setEntities] = useState<MapEntity[]>([]);
  const [whales, setWhales] = useState<WhaleAlert[]>([]);
  const [selectedWhale, setSelectedWhale] = useState<WhaleAlert | null>(null);
  const [selectedIsland, setSelectedIsland] = useState<MapEntity | null>(null);
  const [panTarget, setPanTarget] = useState<{ x: number; y: number } | null>(null);
  const [showFaq, setShowFaq] = useState(false);
  const [mobyQuote, setMobyQuote] = useState<string | null>(null);
  const [mobyHidden, setMobyHidden] = useState(false);
  const mobyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [toastQuote, setToastQuote] = useState<string | null>(null);

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
      <div className="absolute top-0 left-0 right-80 z-20 p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFaq(true)}
            className="text-amber-700 hover:text-amber-400 transition-colors text-lg leading-none"
            title="The Hyena"
          >
            📖
          </button>
          <div>
            <h1
              className="text-2xl text-amber-100 drop-shadow-lg cursor-pointer select-none"
              style={{ fontFamily: "'Pirata One', cursive" }}
              onClick={() => {
                setToastQuote(randomQuote());
                setTimeout(() => setToastQuote(null), 4000);
              }}
            >
              ⚓ Pequod — Whale Explorer
            </h1>
            <p className="text-xs text-slate-400 mt-1 italic">
              "{jokeOfTheHour()}"
            </p>
          </div>
        </div>

        {/* Quote toast */}
        <AnimatePresence>
          {toastQuote && (
            <motion.p
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              className="mt-2 text-xs italic text-amber-100/70 max-w-md"
            >
              "{toastQuote}"
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Main map canvas */}
      <OceanMap
        entities={entities}
        whales={whales}
        onSelectWhale={handleSelectWhale}
        onSelectIsland={handleSelectIsland}
        onMobyClick={() => {
          setMobyHidden(true);
          setMobyQuote(randomQuote());
        }}
        mobyHidden={mobyHidden}
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

      {/* Chapter 49 — "FAQ" from book button */}
      <WhitenessModal
        open={showFaq}
        onClose={() => setShowFaq(false)}
        chapter="Chapter 49"
        chapterTitle="The Hyena"
        content={CHAPTER_49}
      />

      {/* Moby Dick quote popup */}
      <AnimatePresence>
        {mobyQuote && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            onClick={() => {
              setMobyQuote(null);
              clearTimeout(mobyTimer.current);
              mobyTimer.current = setTimeout(() => setMobyHidden(false), 5000);
            }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-md w-full rounded-lg shadow-2xl overflow-hidden px-8 py-8"
              style={{ background: "linear-gradient(180deg, #2a1f0e 0%, #1a150a 100%)" }}
            >
              <h3
                className="text-xl text-amber-200 mb-4 text-center"
                style={{ fontFamily: "'Pirata One', cursive" }}
              >
                You found the White Whale!
              </h3>
              <p className="text-sm text-amber-100/80 italic leading-relaxed text-center mb-6">
                "{mobyQuote}"
              </p>
              <div className="text-center">
                <button
                  onClick={() => {
                    setMobyQuote(null);
                    clearTimeout(mobyTimer.current);
                    mobyTimer.current = setTimeout(() => setMobyHidden(false), 5000);
                  }}
                  className="text-xs text-amber-700 hover:text-amber-400 transition-colors italic"
                >
                  Dismiss — the whale dives deep...
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
