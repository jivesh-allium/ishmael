import { motion, AnimatePresence } from "framer-motion";
import type { WhaleAlert } from "../types/whale";
import { ALERT_EMOJI } from "../types/whale";
import { formatUsd, formatAmount, shortenAddress } from "../lib/api";
import { geoToPixel } from "../lib/geo";
import { getExplorerTxUrl } from "../lib/explorer";
import { quoteOfTheHour } from "../lib/quotes";

interface Props {
  alerts: WhaleAlert[];
  onClickAlert: (whale: WhaleAlert, pixel: { x: number; y: number }) => void;
  connected: boolean;
  tokenFilter: string | null;
  availableTokens: string[];
  onTokenFilter: (t: string | null) => void;
}

function timeAgo(timestamp: string): string {
  // Backend sends UTC timestamps without 'Z' suffix — ensure UTC parsing
  const ts = timestamp.endsWith("Z") || timestamp.includes("+") ? timestamp : timestamp + "Z";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function AlertEntry({
  alert,
  onClick,
}: {
  alert: WhaleAlert;
  onClick: () => void;
}) {
  const emoji = ALERT_EMOJI[alert.alert_type] ?? "🐋";

  let description: string;
  if (alert.alert_type === "dex_trade") {
    description = `Swapped ${formatAmount(alert.amount_sold)} ${alert.asset_sold_symbol ?? "?"} → ${formatAmount(alert.amount_bought)} ${alert.asset_bought_symbol ?? "?"}`;
  } else if (alert.alert_type === "bridge") {
    description = `Bridged ${formatAmount(alert.amount)} ${alert.asset_symbol ?? "?"} ${alert.source_chain ?? "?"} → ${alert.destination_chain ?? "?"}`;
  } else {
    const action =
      alert.alert_type === "mint"
        ? "Minted"
        : alert.alert_type === "burn"
          ? "Burned"
          : "Transferred";
    description = `${action} ${formatAmount(alert.amount)} ${alert.asset_symbol ?? "?"}`;
  }

  const from = alert.from_label || shortenAddress(alert.from_address);
  const to = alert.to_label || shortenAddress(alert.to_address);

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      className="p-3 border-b border-[#1a2a40] hover:bg-[#0d1f35] cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <span className="text-lg flex-shrink-0">{emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-amber-200 truncate">
              {formatUsd(alert.usd_value)}
            </span>
            <span className="text-xs text-slate-500 flex-shrink-0">
              {timeAgo(alert.block_timestamp)}
            </span>
          </div>
          <p className="text-xs text-slate-300 truncate">{description}</p>
          <p className="text-xs text-slate-500 truncate">
            {from} → {to}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#1a2a40] text-slate-400">
              {alert.chain}
            </span>
            {(() => {
              const url = getExplorerTxUrl(alert.chain, alert.tx_hash);
              return url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  View tx ↗
                </a>
              ) : null;
            })()}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function AlertFeed({
  alerts,
  onClickAlert,
  connected,
  tokenFilter,
  availableTokens,
  onTokenFilter,
}: Props) {
  return (
    <div className="absolute right-0 top-0 bottom-0 w-72 bg-[#0a1628]/95 backdrop-blur-sm border-l border-[#1a3a5c] flex flex-col z-20">
      {/* Header */}
      <div className="p-4 pb-2 border-b border-[#1a3a5c]">
        <div className="flex items-center justify-between">
          <h2
            className="text-lg font-bold text-amber-100"
            style={{ fontFamily: "'Pirata One', cursive" }}
          >
            Ship's Log
          </h2>
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-emerald-400" : "bg-red-400"
              }`}
            />
            <span className="text-xs text-slate-400">
              {connected ? "Live" : "Reconnecting..."}
            </span>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {alerts.length} whale sightings
        </p>

        {/* Token filter pills */}
        {availableTokens.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto mt-2 pb-1 scrollbar-hide">
            <button
              onClick={() => onTokenFilter(null)}
              className={`flex-shrink-0 px-2.5 py-1 rounded text-xs font-medium transition-colors border ${
                tokenFilter === null
                  ? "bg-amber-700/50 text-amber-100 border-amber-600/60"
                  : "text-slate-400 border-[#1a3a5c]/60 hover:text-amber-200 hover:border-amber-700/40"
              }`}
            >
              All
            </button>
            {availableTokens.map((sym) => (
              <button
                key={sym}
                onClick={() =>
                  onTokenFilter(tokenFilter === sym ? null : sym)
                }
                className={`flex-shrink-0 px-2.5 py-1 rounded text-xs font-medium transition-colors border ${
                  tokenFilter === sym
                    ? "bg-amber-700/50 text-amber-100 border-amber-600/60"
                    : "text-slate-400 border-[#1a3a5c]/60 hover:text-amber-200 hover:border-amber-700/40"
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            <p className="text-3xl mb-3">🌊</p>
            <p>Calm seas...</p>
            <p className="text-xs mt-2 italic text-slate-600 px-2">
              "{quoteOfTheHour()}"
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {alerts.map((alert, i) => (
              <AlertEntry
                key={`${alert.tx_hash}-${i}`}
                alert={alert}
                onClick={() => {
                  const lat = alert.to_lat ?? alert.from_lat ?? 0;
                  const lon = alert.to_lon ?? alert.from_lon ?? -160;
                  onClickAlert(alert, geoToPixel(lat, lon));
                }}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
