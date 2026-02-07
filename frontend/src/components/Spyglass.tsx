import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { formatUsd, formatAmount, shortenAddress } from "../lib/api";
import { geoToPixel } from "../lib/geo";
import { getExplorerTxUrl } from "../lib/explorer";
import type { WhaleAlert, AlertType } from "../types/whale";
import { ALERT_EMOJI } from "../types/whale";

const CHAIN_OPTIONS = [
  "all", "ethereum", "solana", "bitcoin", "polygon", "arbitrum",
  "base", "optimism", "avalanche", "bsc", "linea", "scroll", "zksync", "blast",
] as const;
const TYPE_OPTIONS: { value: AlertType | "all"; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "transfer", label: "Transfers" },
  { value: "dex_trade", label: "DEX trades" },
  { value: "bridge", label: "Bridges" },
  { value: "mint", label: "Mints" },
  { value: "burn", label: "Burns" },
];

interface Props {
  whales: WhaleAlert[];
  open: boolean;
  onClose: () => void;
  onSelect: (whale: WhaleAlert, pixel: { x: number; y: number }) => void;
}

function timeAgo(timestamp: string): string {
  const ts = timestamp.endsWith("Z") || timestamp.includes("+") ? timestamp : timestamp + "Z";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Spyglass — search & filter whale alerts. */
export function Spyglass({ whales, open, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [chainFilter, setChainFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<AlertType | "all">("all");

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    return whales.filter((w) => {
      // Chain filter
      if (chainFilter !== "all" && w.chain !== chainFilter) return false;
      // Type filter
      if (typeFilter !== "all" && w.alert_type !== typeFilter) return false;
      // Text search
      if (q) {
        const haystack = [
          w.tx_hash,
          w.from_address,
          w.to_address,
          w.from_label,
          w.to_label,
          w.asset_symbol,
          w.asset_bought_symbol,
          w.asset_sold_symbol,
          w.chain,
          w.protocol,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [whales, query, chainFilter, typeFilter]);

  const handleSelect = useCallback(
    (w: WhaleAlert) => {
      const lat = w.to_lat ?? w.from_lat ?? 0;
      const lon = w.to_lon ?? w.from_lon ?? -160;
      onSelect(w, geoToPixel(lat, lon));
      onClose();
    },
    [onSelect, onClose]
  );

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center p-3 pt-4 md:p-6 md:pt-12"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden flex flex-col"
        style={{ background: "linear-gradient(180deg, #1a2a40 0%, #0d1928 100%)", maxHeight: "80vh" }}
      >
        {/* Header */}
        <div className="px-3 pt-4 md:px-5 md:py-4 border-b border-[#1a3a5c]/60">
          <div className="flex items-center justify-between mb-3">
            <h2
              className="text-xl text-amber-100"
              style={{ fontFamily: "'Pirata One', cursive" }}
            >
              Spyglass
            </h2>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-300 transition-colors text-lg"
            >
              &times;
            </button>
          </div>

          {/* Search input */}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search address, token, tx hash, label..."
            autoFocus
            className="w-full bg-[#0a1628] border border-[#1a3a5c]/60 rounded-md px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-600/50"
          />

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mt-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Chain</span>
              <select
                value={chainFilter}
                onChange={(e) => setChainFilter(e.target.value)}
                className="bg-[#0a1628] border border-[#1a3a5c]/60 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none"
              >
                {CHAIN_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c === "all" ? "All chains" : c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Type</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as AlertType | "all")}
                className="bg-[#0a1628] border border-[#1a3a5c]/60 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none"
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-[10px] text-slate-500 ml-auto self-center">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {results.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              <p className="text-2xl mb-2">🔭</p>
              <p>No whales sighted matching your search.</p>
            </div>
          ) : (
            results.slice(0, 100).map((w, i) => (
              <ResultRow key={`${w.tx_hash}-${i}`} whale={w} onClick={() => handleSelect(w)} />
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function ResultRow({ whale, onClick }: { whale: WhaleAlert; onClick: () => void }) {
  const emoji = ALERT_EMOJI[whale.alert_type] ?? "🐋";

  let description: string;
  if (whale.alert_type === "dex_trade") {
    description = `Swapped ${formatAmount(whale.amount_sold)} ${whale.asset_sold_symbol ?? "?"} → ${formatAmount(whale.amount_bought)} ${whale.asset_bought_symbol ?? "?"}`;
  } else if (whale.alert_type === "bridge") {
    description = `Bridged ${formatAmount(whale.amount)} ${whale.asset_symbol ?? "?"} ${whale.source_chain ?? "?"} → ${whale.destination_chain ?? "?"}`;
  } else {
    const action = whale.alert_type === "mint" ? "Minted" : whale.alert_type === "burn" ? "Burned" : "Transferred";
    description = `${action} ${formatAmount(whale.amount)} ${whale.asset_symbol ?? "?"}`;
  }

  const from = whale.from_label || shortenAddress(whale.from_address);
  const to = whale.to_label || shortenAddress(whale.to_address);
  const explorerUrl = getExplorerTxUrl(whale.chain, whale.tx_hash);

  return (
    <div
      className="px-5 py-3 border-b border-[#1a3a5c]/20 hover:bg-[#0d1f35] cursor-pointer transition-colors flex items-start gap-3"
      onClick={onClick}
    >
      <span className="text-lg flex-shrink-0 mt-0.5">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-amber-200">{formatUsd(whale.usd_value)}</span>
          <span className="text-[10px] text-slate-500 flex-shrink-0">{timeAgo(whale.block_timestamp)}</span>
        </div>
        <p className="text-xs text-slate-300 truncate">{description}</p>
        <p className="text-xs text-slate-500 truncate">{from} → {to}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#1a2a40] text-slate-400">{whale.chain}</span>
          <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#1a2a40] text-slate-400 capitalize">{whale.alert_type.replace("_", " ")}</span>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors ml-auto"
              onClick={(e) => e.stopPropagation()}
            >
              View tx ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
