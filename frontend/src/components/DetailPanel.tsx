import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { MapEntity, WhaleAlert } from "../types/whale";
import { ALERT_EMOJI, ALERT_COLORS } from "../types/whale";
import { formatUsd, formatAmount, shortenAddress } from "../lib/api";
import { getExplorerTxUrl } from "../lib/explorer";
import { geoToPixel } from "../lib/geo";

interface Props {
  selectedWhale: WhaleAlert | null;
  selectedIsland: MapEntity | null;
  whales: WhaleAlert[];
  onClose: () => void;
  onClickWhale: (whale: WhaleAlert, pixel: { x: number; y: number }) => void;
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

function colorToHex(n: number): string {
  return "#" + n.toString(16).padStart(6, "0");
}

function TransferRow({ whale, onClick, isActive }: { whale: WhaleAlert; onClick: () => void; isActive?: boolean }) {
  const emoji = ALERT_EMOJI[whale.alert_type] ?? "🐋";
  const color = ALERT_COLORS[whale.alert_type] ?? 0x4488ff;

  let description: string;
  if (whale.alert_type === "dex_trade") {
    description = `${formatAmount(whale.amount_sold)} ${whale.asset_sold_symbol ?? "?"} → ${formatAmount(whale.amount_bought)} ${whale.asset_bought_symbol ?? "?"}`;
  } else if (whale.alert_type === "bridge") {
    description = `${formatAmount(whale.amount)} ${whale.asset_symbol ?? "?"} (${whale.source_chain ?? "?"} → ${whale.destination_chain ?? "?"})`;
  } else {
    description = `${formatAmount(whale.amount)} ${whale.asset_symbol ?? "?"}`;
  }

  return (
    <div
      className={`p-2.5 border-b border-[#1a2a40] cursor-pointer transition-colors ${isActive ? "bg-[#1a2a40]" : "hover:bg-[#0d1f35]"}`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm flex-shrink-0">{emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold" style={{ color: colorToHex(color) }}>
              {formatUsd(whale.usd_value)}
            </span>
            <span className="text-[10px] text-slate-500 flex-shrink-0">
              {timeAgo(whale.block_timestamp)}
            </span>
          </div>
          <p className="text-xs text-slate-300 truncate">{description}</p>
          <p className="text-[10px] text-slate-500 truncate">
            {whale.from_label || shortenAddress(whale.from_address)} → {whale.to_label || shortenAddress(whale.to_address)}
          </p>
        </div>
      </div>
    </div>
  );
}

function WhaleDetail({ whale, relatedWhales, onClose, onClickWhale }: {
  whale: WhaleAlert;
  relatedWhales: WhaleAlert[];
  onClose: () => void;
  onClickWhale: (whale: WhaleAlert, pixel: { x: number; y: number }) => void;
}) {
  const emoji = ALERT_EMOJI[whale.alert_type] ?? "🐋";
  const color = ALERT_COLORS[whale.alert_type] ?? 0x4488ff;
  const time = new Date(
    (whale.block_timestamp.endsWith("Z") || whale.block_timestamp.includes("+"))
      ? whale.block_timestamp
      : whale.block_timestamp + "Z"
  ).toLocaleString();

  return (
    <>
      {/* Colored accent bar */}
      <div className="h-1" style={{ background: colorToHex(color) }} />

      {/* Header */}
      <div className="p-3 border-b border-[#1a3a5c]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{emoji}</span>
            <div>
              <h3
                className="text-base text-amber-100 font-bold"
                style={{ fontFamily: "'Pirata One', cursive" }}
              >
                {whale.alert_type === "dex_trade" ? "DEX Trade" :
                 whale.alert_type === "bridge" ? "Bridge" :
                 whale.alert_type === "mint" ? "Mint" :
                 whale.alert_type === "burn" ? "Burn" : "Transfer"}
              </h3>
              <span className="text-[10px] text-slate-400">{whale.chain} · {time}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg leading-none px-1"
          >
            ×
          </button>
        </div>
      </div>

      {/* Value */}
      <div className="px-3 py-3 border-b border-[#1a2a40]">
        <p className="text-2xl font-bold text-center" style={{ color: colorToHex(color) }}>
          {formatUsd(whale.usd_value)}
        </p>
        {whale.amount && whale.asset_symbol && (
          <p className="text-xs text-slate-400 text-center mt-0.5">
            {formatAmount(whale.amount)} {whale.asset_symbol}
          </p>
        )}
      </div>

      {/* From / To */}
      <div className="px-3 py-2.5 border-b border-[#1a2a40] space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 w-8 flex-shrink-0">From</span>
          <span className="text-xs text-slate-200 font-medium truncate">
            {whale.from_label || shortenAddress(whale.from_address)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 w-8 flex-shrink-0">To</span>
          <span className="text-xs text-slate-200 font-medium truncate">
            {whale.to_label || shortenAddress(whale.to_address)}
          </span>
        </div>

        {/* DEX trade details */}
        {whale.alert_type === "dex_trade" && (
          <div className="grid grid-cols-2 gap-2 bg-[#0a1420] rounded p-2 mt-1">
            <div>
              <p className="text-[10px] text-slate-500">Sold</p>
              <p className="text-xs text-red-300">
                {formatAmount(whale.amount_sold)} {whale.asset_sold_symbol}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500">Bought</p>
              <p className="text-xs text-green-300">
                {formatAmount(whale.amount_bought)} {whale.asset_bought_symbol}
              </p>
            </div>
          </div>
        )}

        {/* Bridge details */}
        {whale.alert_type === "bridge" && whale.source_chain && (
          <div className="bg-[#0a1420] rounded p-2 mt-1 text-center">
            <span className="text-xs text-purple-300">
              {whale.source_chain} → {whale.destination_chain}
            </span>
            {whale.protocol && (
              <p className="text-[10px] text-slate-500 mt-0.5">via {whale.protocol}</p>
            )}
          </div>
        )}

        {/* Tx link */}
        {(() => {
          const url = getExplorerTxUrl(whale.chain, whale.tx_hash);
          return url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-[10px] text-blue-400 hover:text-blue-300 mt-1"
            >
              {whale.tx_hash.slice(0, 10)}...{whale.tx_hash.slice(-4)} ↗
            </a>
          ) : (
            <span className="text-[10px] text-slate-500 font-mono mt-1 block truncate">
              {whale.tx_hash}
            </span>
          );
        })()}
      </div>

      {/* Related transfers in same tx */}
      {relatedWhales.length > 0 && (
        <div>
          <div className="px-3 py-2 border-b border-[#1a2a40]">
            <h4 className="text-[10px] text-slate-500 uppercase tracking-wider">
              Same Transaction ({relatedWhales.length + 1} transfers)
            </h4>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {relatedWhales.map((w, i) => (
              <TransferRow
                key={`${w.tx_hash}-${w.alert_type}-${i}`}
                whale={w}
                onClick={() => {
                  const lat = w.to_lat ?? w.from_lat ?? 0;
                  const lon = w.to_lon ?? w.from_lon ?? -160;
                  onClickWhale(w, geoToPixel(lat, lon));
                }}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function IslandDetail({ entity, entityWhales, onClose, onClickWhale }: {
  entity: MapEntity;
  entityWhales: WhaleAlert[];
  onClose: () => void;
  onClickWhale: (whale: WhaleAlert, pixel: { x: number; y: number }) => void;
}) {
  const addressSet = new Set(entity.addresses.map(a => a.address.toLowerCase()));

  return (
    <>
      {/* Accent bar */}
      <div className="h-1 bg-amber-600" />

      {/* Header */}
      <div className="p-3 border-b border-[#1a3a5c]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏝️</span>
            <div>
              <h3
                className="text-base text-amber-100 font-bold"
                style={{ fontFamily: "'Pirata One', cursive" }}
              >
                {entity.label}
              </h3>
              <span className="text-[10px] text-slate-400">
                {entity.country} · {entity.addresses.length} address{entity.addresses.length !== 1 ? "es" : ""}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg leading-none px-1"
          >
            ×
          </button>
        </div>
      </div>

      {/* Addresses */}
      <div className="px-3 py-2 border-b border-[#1a2a40]">
        <div className="max-h-24 overflow-y-auto space-y-1">
          {entity.addresses.map((a) => (
            <div
              key={a.address}
              className="flex items-center justify-between text-[10px] bg-[#0a1420] rounded px-2 py-1"
            >
              <span className="font-mono text-slate-300 truncate mr-2">
                {shortenAddress(a.address)}
              </span>
              <span className="text-slate-500 flex-shrink-0">{a.chain}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction history */}
      <div>
        <div className="px-3 py-2 border-b border-[#1a2a40]">
          <h4 className="text-[10px] text-slate-500 uppercase tracking-wider">
            Transaction History ({entityWhales.length})
          </h4>
        </div>
        {entityWhales.length === 0 ? (
          <div className="p-4 text-center text-slate-500 text-xs">
            No recent transactions
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {entityWhales.map((w, i) => {
              const isSender = w.from_address && addressSet.has(w.from_address.toLowerCase());
              return (
                <div key={`${w.tx_hash}-${w.alert_type}-${i}`} className="relative">
                  <div className={`absolute left-1.5 top-2.5 text-[9px] font-semibold ${isSender ? "text-red-400" : "text-emerald-400"}`}>
                    {isSender ? "OUT" : "IN"}
                  </div>
                  <div className="pl-8">
                    <TransferRow
                      whale={w}
                      onClick={() => {
                        const lat = w.to_lat ?? w.from_lat ?? 0;
                        const lon = w.to_lon ?? w.from_lon ?? -160;
                        onClickWhale(w, geoToPixel(lat, lon));
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

export function DetailPanel({ selectedWhale, selectedIsland, whales, onClose, onClickWhale }: Props) {
  const isOpen = selectedWhale != null || selectedIsland != null;

  // Related whales for a selected transfer (same tx_hash, excluding selected)
  const relatedWhales = useMemo(() => {
    if (!selectedWhale) return [];
    return whales.filter(
      w => w.tx_hash === selectedWhale.tx_hash && w !== selectedWhale
    );
  }, [selectedWhale, whales]);

  // Whales involving a selected island's addresses
  const entityWhales = useMemo(() => {
    if (!selectedIsland) return [];
    const addressSet = new Set(selectedIsland.addresses.map(a => a.address.toLowerCase()));
    return whales.filter(w => {
      const from = w.from_address?.toLowerCase();
      const to = w.to_address?.toLowerCase();
      return (from && addressSet.has(from)) || (to && addressSet.has(to));
    });
  }, [selectedIsland, whales]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="absolute left-0 top-0 bottom-0 w-72 bg-[#0a1628]/95 backdrop-blur-sm border-r border-[#1a3a5c] flex flex-col z-20 overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto">
            {selectedWhale && (
              <WhaleDetail
                whale={selectedWhale}
                relatedWhales={relatedWhales}
                onClose={onClose}
                onClickWhale={onClickWhale}
              />
            )}
            {selectedIsland && !selectedWhale && (
              <IslandDetail
                entity={selectedIsland}
                entityWhales={entityWhales}
                onClose={onClose}
                onClickWhale={onClickWhale}
              />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
