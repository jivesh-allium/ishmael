import { useState, useEffect, useMemo } from "react";
import { fetchPriceHistory } from "../lib/api";
import type { PricePoint } from "../lib/api";
import type { WhaleAlert } from "../types/whale";
import { ALERT_COLORS } from "../types/whale";

interface Props {
  tokenFilter: string | null;
  whales: WhaleAlert[];
}

const KNOWN_PRICE_SYMBOLS = new Set([
  "ETH",
  "WETH",
  "BTC",
  "WBTC",
  "USDC",
  "USDT",
  "SOL",
  "WSOL",
]);

export function PriceChart({ tokenFilter, whales }: Props) {
  const [prices, setPrices] = useState<PricePoint[]>([]);
  const [symbol, setSymbol] = useState("ETH");
  const [loading, setLoading] = useState(false);

  // Determine which symbol to chart
  useEffect(() => {
    if (tokenFilter && KNOWN_PRICE_SYMBOLS.has(tokenFilter.toUpperCase())) {
      setSymbol(tokenFilter.toUpperCase());
    } else {
      setSymbol("ETH");
    }
  }, [tokenFilter]);

  // Fetch price data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchPriceHistory(symbol, 24)
      .then((data) => {
        if (!cancelled) setPrices(data.prices);
      })
      .catch((err) => console.error("Price fetch failed:", err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const interval = setInterval(() => {
      fetchPriceHistory(symbol, 24)
        .then((data) => {
          if (!cancelled) setPrices(data.prices);
        })
        .catch(() => {});
    }, 300_000); // 5 minutes

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [symbol]);

  // Build SVG path data
  const chart = useMemo(() => {
    if (prices.length < 2) return null;

    const W = 260;
    const H = 80;
    const PAD_T = 4;
    const PAD_B = 4;

    const vals = prices.map((p) => p.price);
    const minP = Math.min(...vals);
    const maxP = Math.max(...vals);
    const range = maxP - minP || 1;

    const points = prices.map((p, i) => ({
      x: (i / (prices.length - 1)) * W,
      y: PAD_T + (1 - (p.price - minP) / range) * (H - PAD_T - PAD_B),
      ts: new Date(p.timestamp).getTime(),
    }));

    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
    const fill = `${line} L${W},${H} L0,${H} Z`;

    const first = vals[0];
    const last = vals[vals.length - 1];
    const change = ((last - first) / first) * 100;

    return { W, H, line, fill, points, last, change, minP, maxP };
  }, [prices]);

  // Map whale timestamps to chart x positions
  const whaleMarkers = useMemo(() => {
    if (!chart || chart.points.length < 2) return [];

    const startTs = chart.points[0].ts;
    const endTs = chart.points[chart.points.length - 1].ts;
    const tsRange = endTs - startTs || 1;

    return whales
      .map((w) => {
        const tsStr =
          w.block_timestamp.endsWith("Z") || w.block_timestamp.includes("+")
            ? w.block_timestamp
            : w.block_timestamp + "Z";
        const ts = new Date(tsStr).getTime();
        if (ts < startTs || ts > endTs) return null;
        const x = ((ts - startTs) / tsRange) * chart.W;
        // Find nearest price point for y
        let nearest = chart.points[0];
        let minDist = Infinity;
        for (const pt of chart.points) {
          const d = Math.abs(pt.ts - ts);
          if (d < minDist) {
            minDist = d;
            nearest = pt;
          }
        }
        const color = ALERT_COLORS[w.alert_type] ?? 0x4488ff;
        const hex = `#${color.toString(16).padStart(6, "0")}`;
        return { x, y: nearest.y, hex, type: w.alert_type };
      })
      .filter(Boolean) as { x: number; y: number; hex: string; type: string }[];
  }, [chart, whales]);

  if (!chart && !loading) {
    return null;
  }

  const formatPrice = (p: number) => {
    if (p >= 10000) return `$${(p / 1000).toFixed(1)}K`;
    if (p >= 1) return `$${p.toFixed(2)}`;
    return `$${p.toFixed(4)}`;
  };

  return (
    <div className="px-3 py-2 h-full flex flex-col">
      {/* Price header */}
      <div className="flex items-center gap-2 mb-1 flex-shrink-0">
        <span className="text-[11px] text-amber-200 font-semibold">
          {symbol}
        </span>
        {chart && (
          <>
            <span className="text-[11px] text-amber-100 font-mono">
              {formatPrice(chart.last)}
            </span>
            <span
              className={`text-[10px] font-mono ${
                chart.change >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {chart.change >= 0 ? "▲" : "▼"}{" "}
              {Math.abs(chart.change).toFixed(1)}%
            </span>
            <span className="text-[9px] text-slate-500">24h</span>
          </>
        )}
      </div>

      {/* SVG Sparkline */}
      {chart ? (
        <svg
          viewBox={`0 0 ${chart.W} ${chart.H}`}
          className="w-full flex-1 min-h-0"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d97706" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#d97706" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Fill area */}
          <path d={chart.fill} fill="url(#priceGrad)" />
          {/* Line */}
          <path
            d={chart.line}
            fill="none"
            stroke="#d97706"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Whale markers */}
          {whaleMarkers.slice(0, 30).map((m, i) => (
            <circle
              key={i}
              cx={m.x}
              cy={m.y}
              r="2.5"
              fill={m.hex}
              opacity="0.8"
            />
          ))}
        </svg>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[10px] text-slate-500">
          {loading ? "Loading..." : "No price data"}
        </div>
      )}
    </div>
  );
}
