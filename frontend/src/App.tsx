import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { OceanMap } from "./components/OceanMap";
import { AlertFeed } from "./components/AlertFeed";
import { DetailPanel } from "./components/DetailPanel";
import { ShipsClock } from "./components/ShipsClock";
import { ExchangeFlow } from "./components/ExchangeFlow";
import { PriceChart } from "./components/PriceChart";
import { Leaderboard } from "./components/Leaderboard";
import { Spyglass } from "./components/Spyglass";
import { WhitenessModal } from "./components/WhitenessModal";
import { useWhaleUpdates } from "./hooks/useWhaleUpdates";
import { useIsMobile } from "./hooks/useIsMobile";
import { fetchMapData, fetchWhales, fetchWhaleHistory } from "./lib/api";
import { randomQuote, jokeOfTheHour, CHAPTER_49 } from "./lib/quotes";
import type { MapEntity, WhaleAlert } from "./types/whale";

export default function App() {
  const [entities, setEntities] = useState<MapEntity[]>([]);
  const [whales, setWhales] = useState<WhaleAlert[]>([]);
  const [selectedWhale, setSelectedWhale] = useState<WhaleAlert | null>(null);
  const [selectedIsland, setSelectedIsland] = useState<MapEntity | null>(null);
  const [panTarget, setPanTarget] = useState<{ x: number; y: number } | null>(null);
  const [showFaq, setShowFaq] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showSpyglass, setShowSpyglass] = useState(false);
  const [mobyQuote, setMobyQuote] = useState<string | null>(null);
  const [mobyHidden, setMobyHidden] = useState(false);
  const mobyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [toastQuote, setToastQuote] = useState<string | null>(null);
  const [timeWindow, setTimeWindow] = useState<number | null>(null);
  const [tokenFilter, setTokenFilter] = useState<string | null>(null);
  const [bottomPanelH, setBottomPanelH] = useState(160);
  const [mobileShowFeed, setMobileShowFeed] = useState(false);
  const isMobile = useIsMobile();
  const resizing = useRef(false);
  const resizeStartY = useRef(0);
  const resizeStartH = useRef(0);

  // Bottom panel resize handlers
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const delta = resizeStartY.current - e.clientY;
      setBottomPanelH(Math.max(60, Math.min(400, resizeStartH.current + delta)));
    };
    const onUp = () => { resizing.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Load initial data + periodically refresh map (picks up discovered entities)
  useEffect(() => {
    const loadMap = () =>
      fetchMapData()
        .then((data) => setEntities(data.entities))
        .catch((err) => console.error("Failed to load map:", err));

    loadMap();
    const mapInterval = setInterval(loadMap, 30_000);

    fetchWhales(500)
      .then((data) => {
        setWhales(data.alerts);
        // Eagerly prefetch 24h history in the background so it's ready
        fetchWhaleHistory(1440)
          .then((hist) => {
            if (!hist.alerts.length) return;
            setWhales((prev) => {
              const existing = new Set(prev.map((w) => `${w.tx_hash}:${w.alert_type}`));
              const fresh = hist.alerts.filter(
                (w) => !existing.has(`${w.tx_hash}:${w.alert_type}`)
              );
              if (!fresh.length) return prev;
              return [...prev, ...fresh]
                .sort((a, b) => (b.block_timestamp > a.block_timestamp ? 1 : -1))
                .slice(0, 2000);
            });
          })
          .catch((err) => console.error("Failed to prefetch history:", err));
      })
      .catch((err) => console.error("Failed to load whales:", err));

    return () => clearInterval(mapInterval);
  }, []);

  // WebSocket for live alerts
  const onNewAlert = useCallback((alert: WhaleAlert) => {
    setWhales((prev) => [alert, ...prev].slice(0, 500));
  }, []);

  const { connected } = useWhaleUpdates(onNewAlert);

  // Fetch historical data when time window changes (backfills beyond the live buffer)
  useEffect(() => {
    if (timeWindow === null) return;
    let cancelled = false;
    fetchWhaleHistory(timeWindow)
      .then((data) => {
        if (cancelled) return;
        // Log debug info from the backend so we can see what happened
        if (data.debug) {
          const d = data.debug as Record<string, unknown>;
          const errs = Array.isArray(d.errors) ? d.errors : [];
          console.log(
            `[History] lookback=${timeWindow}m | txs=${d.tx_count} raw_alerts=${d.raw_alerts} below_threshold=${d.below_threshold} final=${d.final} errors=${errs.length}`,
            errs.length ? errs : ""
          );
        }
        setWhales((prev) => {
          // Merge: keep existing (live) alerts + add any historical ones not already present
          const existing = new Set(prev.map((w) => `${w.tx_hash}:${w.alert_type}`));
          const newAlerts = data.alerts.filter(
            (w) => !existing.has(`${w.tx_hash}:${w.alert_type}`)
          );
          if (newAlerts.length === 0) return prev;
          // Merge and sort by timestamp descending, cap at 2000
          const merged = [...prev, ...newAlerts]
            .sort((a, b) => (b.block_timestamp > a.block_timestamp ? 1 : -1))
            .slice(0, 2000);
          return merged;
        });
      })
      .catch((err) => console.error("Failed to fetch history:", err));
    return () => { cancelled = true; };
  }, [timeWindow]);

  const filteredWhales = useMemo(() => {
    if (timeWindow === null) return whales;
    const cutoff = Date.now() - timeWindow * 60_000;
    return whales.filter((w) => {
      const ts =
        w.block_timestamp.endsWith("Z") || w.block_timestamp.includes("+")
          ? w.block_timestamp
          : w.block_timestamp + "Z";
      return new Date(ts).getTime() >= cutoff;
    });
  }, [whales, timeWindow]);

  const availableTokens = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const w of filteredWhales) {
      const sym =
        w.asset_symbol ?? w.asset_bought_symbol ?? w.asset_sold_symbol;
      if (sym) counts[sym] = (counts[sym] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([sym]) => sym);
  }, [filteredWhales]);

  const displayWhales = useMemo(() => {
    if (!tokenFilter) return filteredWhales;
    return filteredWhales.filter(
      (w) =>
        w.asset_symbol === tokenFilter ||
        w.asset_bought_symbol === tokenFilter ||
        w.asset_sold_symbol === tokenFilter
    );
  }, [filteredWhales, tokenFilter]);

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
      <div className="absolute top-0 left-0 right-0 md:right-72 z-20 p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFaq(true)}
            className="text-amber-700 hover:text-amber-400 transition-colors text-lg leading-none"
            title="The Hyena"
          >
            📖
          </button>
          <button
            onClick={() => setShowLeaderboard(true)}
            className="text-amber-700 hover:text-amber-400 transition-colors text-lg leading-none"
            title="Captain's Ledger"
          >
            📊
          </button>
          <button
            onClick={() => setShowSpyglass(true)}
            className="text-amber-700 hover:text-amber-400 transition-colors text-lg leading-none"
            title="Spyglass"
          >
            🔭
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

      {/* Ship's Clock — time window selector */}
      <ShipsClock value={timeWindow} onChange={setTimeWindow} compact={isMobile} />

      {/* Main map canvas */}
      <OceanMap
        entities={entities}
        whales={displayWhales}
        selectedWhale={selectedWhale}
        selectedIsland={selectedIsland}
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
      {isMobile ? (
        <>
          <AnimatePresence>
            {mobileShowFeed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <AlertFeed
                  alerts={displayWhales}
                  onClickAlert={(whale, pixel) => {
                    handleClickAlert(whale, pixel);
                    setMobileShowFeed(false);
                  }}
                  connected={connected}
                  tokenFilter={tokenFilter}
                  availableTokens={availableTokens}
                  onTokenFilter={setTokenFilter}
                  isMobile
                  onClose={() => setMobileShowFeed(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>
          {!mobileShowFeed && (
            <button
              onClick={() => setMobileShowFeed(true)}
              className="fixed bottom-4 right-4 z-30 bg-amber-700/80 hover:bg-amber-600/90 text-amber-100 rounded-full px-4 py-2.5 shadow-lg backdrop-blur-sm border border-amber-600/40 text-sm font-medium transition-colors"
              style={{ fontFamily: "'Pirata One', cursive" }}
            >
              Ship's Log
            </button>
          )}
        </>
      ) : (
        <AlertFeed
          alerts={displayWhales}
          onClickAlert={handleClickAlert}
          connected={connected}
          tokenFilter={tokenFilter}
          availableTokens={availableTokens}
          onTokenFilter={setTokenFilter}
        />
      )}

      {/* Bottom panel: price chart + exchange flow (resizable) — hidden on mobile */}
      <div
        className="absolute bottom-0 left-0 right-72 z-20 bg-[#0a1628]/90 backdrop-blur-sm border-t border-[#1a3a5c]/40 hidden md:flex flex-col"
        style={{ height: bottomPanelH }}
      >
        {/* Drag handle */}
        <div
          className="h-2 cursor-ns-resize flex items-center justify-center flex-shrink-0 hover:bg-[#1a3a5c]/30 transition-colors"
          onMouseDown={(e) => {
            resizing.current = true;
            resizeStartY.current = e.clientY;
            resizeStartH.current = bottomPanelH;
            e.preventDefault();
          }}
        >
          <div className="w-8 h-0.5 rounded bg-[#1a3a5c]/80" />
        </div>
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Price Chart — left side */}
          <div className="w-[45%] border-r border-[#1a3a5c]/30 overflow-hidden">
            <PriceChart tokenFilter={tokenFilter} whales={displayWhales} />
          </div>
          {/* Exchange Flow — right side */}
          <div className="flex-1 overflow-y-auto">
            <ExchangeFlow whales={displayWhales} />
          </div>
        </div>
      </div>

      {/* Detail panel (left side on desktop, bottom sheet on mobile) */}
      <DetailPanel
        selectedWhale={selectedWhale}
        selectedIsland={selectedIsland}
        whales={whales}
        onClose={() => { setSelectedWhale(null); setSelectedIsland(null); }}
        onClickWhale={handleClickAlert}
        isMobile={isMobile}
      />

      {/* Chapter 49 — "FAQ" from book button */}
      <WhitenessModal
        open={showFaq}
        onClose={() => setShowFaq(false)}
        chapter="Chapter 49"
        chapterTitle="The Hyena"
        content={CHAPTER_49}
      />

      {/* Captain's Ledger — leaderboard overlay */}
      <Leaderboard
        whales={filteredWhales}
        open={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
      />

      {/* Spyglass — search overlay */}
      <Spyglass
        whales={whales}
        open={showSpyglass}
        onClose={() => setShowSpyglass(false)}
        onSelect={handleClickAlert}
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
