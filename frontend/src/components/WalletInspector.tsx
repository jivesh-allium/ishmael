import { motion } from "framer-motion";
import type { MapEntity, WhaleAlert } from "../types/whale";
import { ALERT_EMOJI } from "../types/whale";
import { formatUsd, formatAmount, shortenAddress } from "../lib/api";
import { getExplorerTxUrl, getExplorerName } from "../lib/explorer";

interface WhaleInspectorProps {
  whale: WhaleAlert;
  onClose: () => void;
}

interface IslandInspectorProps {
  entity: MapEntity;
  onClose: () => void;
}

export function WhaleInspector({ whale, onClose }: WhaleInspectorProps) {
  const emoji = ALERT_EMOJI[whale.alert_type] ?? "🐋";
  const time = new Date(whale.block_timestamp).toLocaleString();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[420px] bg-[#0d1a2e]/95 backdrop-blur-md border border-[#1a3a5c] rounded-lg shadow-2xl z-30 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#1a3a5c]">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{emoji}</span>
          <div>
            <h3
              className="text-lg text-amber-100 font-bold"
              style={{ fontFamily: "'Pirata One', cursive" }}
            >
              Whale Sighting
            </h3>
            <span className="text-xs text-slate-400 capitalize">
              {whale.alert_type.replace("_", " ")} on {whale.chain}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-xl leading-none px-2"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {/* Value */}
        <div className="text-center">
          <p className="text-3xl font-bold text-amber-200">
            {formatUsd(whale.usd_value)}
          </p>
          {whale.amount && whale.asset_symbol && (
            <p className="text-sm text-slate-400">
              {formatAmount(whale.amount)} {whale.asset_symbol}
            </p>
          )}
        </div>

        {/* From / To */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
          <div className="text-right">
            <p className="text-xs text-slate-500">From</p>
            <p className="text-sm text-slate-200 font-medium truncate">
              {whale.from_label || shortenAddress(whale.from_address)}
            </p>
            {whale.from_country && (
              <p className="text-xs text-slate-500">{whale.from_country}</p>
            )}
          </div>
          <span className="text-slate-500">→</span>
          <div>
            <p className="text-xs text-slate-500">To</p>
            <p className="text-sm text-slate-200 font-medium truncate">
              {whale.to_label || shortenAddress(whale.to_address)}
            </p>
            {whale.to_country && (
              <p className="text-xs text-slate-500">{whale.to_country}</p>
            )}
          </div>
        </div>

        {/* DEX trade details */}
        {whale.alert_type === "dex_trade" && (
          <div className="grid grid-cols-2 gap-3 bg-[#0a1420] rounded p-3">
            <div>
              <p className="text-xs text-slate-500">Sold</p>
              <p className="text-sm text-red-300">
                {formatAmount(whale.amount_sold)} {whale.asset_sold_symbol}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Bought</p>
              <p className="text-sm text-green-300">
                {formatAmount(whale.amount_bought)} {whale.asset_bought_symbol}
              </p>
            </div>
          </div>
        )}

        {/* Bridge details */}
        {whale.alert_type === "bridge" && whale.source_chain && (
          <div className="bg-[#0a1420] rounded p-3 text-center">
            <span className="text-sm text-purple-300">
              {whale.source_chain} → {whale.destination_chain}
            </span>
            {whale.protocol && (
              <p className="text-xs text-slate-500 mt-1">via {whale.protocol}</p>
            )}
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-[#1a3a5c]">
          <span>{time}</span>
          {(() => {
            const url = getExplorerTxUrl(whale.chain, whale.tx_hash);
            return url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono truncate ml-2 max-w-[200px] text-blue-300 hover:text-blue-200 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                {whale.tx_hash.slice(0, 10)}...{whale.tx_hash.slice(-4)} ↗
              </a>
            ) : (
              <span className="font-mono truncate ml-2 max-w-[200px]">
                {whale.tx_hash}
              </span>
            );
          })()}
        </div>
      </div>
    </motion.div>
  );
}

export function IslandInspector({ entity, onClose }: IslandInspectorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[360px] bg-[#0d1a2e]/95 backdrop-blur-md border border-[#1a3a5c] rounded-lg shadow-2xl z-30 overflow-hidden"
    >
      <div className="flex items-center justify-between p-4 border-b border-[#1a3a5c]">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏝️</span>
          <h3
            className="text-lg text-amber-100 font-bold"
            style={{ fontFamily: "'Pirata One', cursive" }}
          >
            {entity.label}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-xl leading-none px-2"
        >
          ×
        </button>
      </div>

      <div className="p-4 space-y-2">
        <p className="text-xs text-slate-500">
          {entity.addresses.length} tracked address{entity.addresses.length !== 1 ? "es" : ""}
        </p>
        <p className="text-xs text-slate-500">
          Location: {entity.country} ({entity.lat.toFixed(1)}°, {entity.lon.toFixed(1)}°)
        </p>

        <div className="max-h-40 overflow-y-auto space-y-1 mt-2">
          {entity.addresses.map((a) => (
            <div
              key={a.address}
              className="flex items-center justify-between text-xs bg-[#0a1420] rounded px-2 py-1.5"
            >
              <span className="font-mono text-slate-300 truncate mr-2">
                {shortenAddress(a.address)}
              </span>
              <span className="text-slate-500 flex-shrink-0">{a.chain}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
