import { useMemo } from "react";
import { motion } from "framer-motion";
import { formatUsd, shortenAddress } from "../lib/api";
import type { WhaleAlert, AlertType } from "../types/whale";
import { ALERT_EMOJI } from "../types/whale";

interface Props {
  whales: WhaleAlert[];
  open: boolean;
  onClose: () => void;
}

interface WalletRow {
  address: string;
  label: string | null;
  volume: number;
  count: number;
}

interface TokenRow {
  symbol: string;
  volume: number;
  count: number;
}

interface ChainRow {
  chain: string;
  volume: number;
  count: number;
  pct: number;
}

interface TypeRow {
  type: AlertType;
  count: number;
  volume: number;
  pct: number;
}

/** Captain's Ledger — leaderboard overlay with ranked tables. */
export function Leaderboard({ whales, open, onClose }: Props) {
  const data = useMemo(() => {
    const walletMap = new Map<string, WalletRow>();
    const tokenMap = new Map<string, TokenRow>();
    const chainMap = new Map<string, ChainRow>();
    const typeMap = new Map<string, TypeRow>();
    let totalVol = 0;

    for (const w of whales) {
      totalVol += w.usd_value;

      // Wallets — count both sides
      for (const addr of [w.from_address, w.to_address]) {
        if (!addr) continue;
        const key = addr.toLowerCase();
        const existing = walletMap.get(key);
        const label = addr === w.from_address ? w.from_label : w.to_label;
        if (existing) {
          existing.volume += w.usd_value;
          existing.count += 1;
          if (!existing.label && label) existing.label = label;
        } else {
          walletMap.set(key, { address: addr, label: label ?? null, volume: w.usd_value, count: 1 });
        }
      }

      // Tokens
      const symbols = getSymbols(w);
      for (const sym of symbols) {
        const existing = tokenMap.get(sym);
        if (existing) {
          existing.volume += w.usd_value / symbols.length;
          existing.count += 1;
        } else {
          tokenMap.set(sym, { symbol: sym, volume: w.usd_value / symbols.length, count: 1 });
        }
      }

      // Chains
      const ch = w.chain;
      const existingChain = chainMap.get(ch);
      if (existingChain) {
        existingChain.volume += w.usd_value;
        existingChain.count += 1;
      } else {
        chainMap.set(ch, { chain: ch, volume: w.usd_value, count: 1, pct: 0 });
      }

      // Types
      const t = w.alert_type;
      const existingType = typeMap.get(t);
      if (existingType) {
        existingType.volume += w.usd_value;
        existingType.count += 1;
      } else {
        typeMap.set(t, { type: t as AlertType, volume: w.usd_value, count: 1, pct: 0 });
      }
    }

    // Compute percentages
    for (const row of chainMap.values()) row.pct = totalVol > 0 ? (row.volume / totalVol) * 100 : 0;
    for (const row of typeMap.values()) row.pct = totalVol > 0 ? (row.volume / totalVol) * 100 : 0;

    const wallets = [...walletMap.values()].sort((a, b) => b.volume - a.volume).slice(0, 10);
    const tokens = [...tokenMap.values()].sort((a, b) => b.volume - a.volume).slice(0, 10);
    const chains = [...chainMap.values()].sort((a, b) => b.volume - a.volume);
    const types = [...typeMap.values()].sort((a, b) => b.volume - a.volume);

    return { wallets, tokens, chains, types, totalVol };
  }, [whales]);

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-6 md:p-6 md:pt-12 overflow-y-auto"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl rounded-lg shadow-2xl overflow-hidden"
        style={{ background: "linear-gradient(180deg, #1a2a40 0%, #0d1928 100%)" }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#1a3a5c]/60 flex items-center justify-between">
          <div>
            <h2
              className="text-xl text-amber-100"
              style={{ fontFamily: "'Pirata One', cursive" }}
            >
              Captain's Ledger
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {whales.length} whale sightings &middot; {formatUsd(data.totalVol)} total volume
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors text-lg"
          >
            &times;
          </button>
        </div>

        {/* Content grid */}
        <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top Wallets */}
          <div className="col-span-1 md:col-span-2">
            <SectionTitle>Top Wallets</SectionTitle>
            <div className="rounded-md border border-[#1a3a5c]/40 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#0a1628]/60 text-slate-500 text-[10px] uppercase tracking-wider">
                    <th className="text-left px-3 py-2">#</th>
                    <th className="text-left px-3 py-2">Address</th>
                    <th className="text-right px-3 py-2">Volume</th>
                    <th className="text-right px-3 py-2">Txns</th>
                  </tr>
                </thead>
                <tbody>
                  {data.wallets.map((w, i) => (
                    <tr key={w.address} className="border-t border-[#1a3a5c]/20 hover:bg-[#1a2a40]/40">
                      <td className="px-3 py-1.5 text-slate-500">{i + 1}</td>
                      <td className="px-3 py-1.5">
                        <span className="text-amber-200">{w.label ?? shortenAddress(w.address)}</span>
                        {w.label && (
                          <span className="text-slate-500 ml-1.5">{shortenAddress(w.address)}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-300 font-medium">{formatUsd(w.volume)}</td>
                      <td className="px-3 py-1.5 text-right text-slate-400">{w.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Tokens */}
          <div>
            <SectionTitle>Top Tokens</SectionTitle>
            <div className="space-y-1.5">
              {data.tokens.map((t) => (
                <div key={t.symbol} className="flex items-center justify-between px-3 py-1.5 rounded bg-[#0a1628]/40 border border-[#1a3a5c]/20">
                  <span className="text-xs text-amber-200 font-medium">{t.symbol}</span>
                  <div className="text-right">
                    <span className="text-xs text-slate-300">{formatUsd(t.volume)}</span>
                    <span className="text-[10px] text-slate-500 ml-2">{t.count} txns</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chains + Types stacked */}
          <div className="space-y-5">
            {/* Chain Breakdown */}
            <div>
              <SectionTitle>Chain Breakdown</SectionTitle>
              <div className="space-y-2">
                {data.chains.map((c) => (
                  <div key={c.chain}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="text-slate-300 capitalize">{c.chain}</span>
                      <span className="text-slate-400">{formatUsd(c.volume)} ({c.pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#0a1628] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-600/70"
                        style={{ width: `${Math.max(2, c.pct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Alert Types */}
            <div>
              <SectionTitle>Alert Types</SectionTitle>
              <div className="space-y-1.5">
                {data.types.map((t) => (
                  <div key={t.type} className="flex items-center justify-between px-3 py-1.5 rounded bg-[#0a1628]/40 border border-[#1a3a5c]/20">
                    <span className="text-xs">
                      <span className="mr-1.5">{ALERT_EMOJI[t.type]}</span>
                      <span className="text-slate-300 capitalize">{t.type.replace("_", " ")}</span>
                    </span>
                    <div className="text-right">
                      <span className="text-xs text-slate-400">{t.count}</span>
                      <span className="text-[10px] text-slate-500 ml-2">({t.pct.toFixed(0)}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="text-sm text-amber-100/80 mb-2"
      style={{ fontFamily: "'Pirata One', cursive" }}
    >
      {children}
    </h3>
  );
}

function getSymbols(w: WhaleAlert): string[] {
  const syms: string[] = [];
  if (w.asset_symbol) syms.push(w.asset_symbol);
  if (w.asset_bought_symbol) syms.push(w.asset_bought_symbol);
  if (w.asset_sold_symbol) syms.push(w.asset_sold_symbol);
  return syms.length > 0 ? syms : ["Unknown"];
}
