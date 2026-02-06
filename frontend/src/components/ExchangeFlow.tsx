import { useMemo } from "react";
import { formatUsd } from "../lib/api";
import type { WhaleAlert, AlertType } from "../types/whale";
import { ALERT_EMOJI } from "../types/whale";

interface Props {
  whales: WhaleAlert[];
}

/** Strip common exchange wallet suffixes to consolidate labels. */
function normalizeLabel(label: string): string {
  return label
    .replace(/\s+(Hot|Cold|Deposit|Withdrawal|Warm)\s*(Wallet)?\s*\d*$/i, "")
    .replace(/\s+\d+$/, "")
    .trim();
}

interface FlowEntry {
  label: string;
  inflow: number;
  outflow: number;
  net: number;
}

export function ExchangeFlow({ whales }: Props) {
  const stats = useMemo(() => {
    if (whales.length === 0)
      return {
        totalVol: 0,
        count: 0,
        topChain: "—",
        topType: "transfer" as AlertType,
      };

    let totalVol = 0;
    const chainVol: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};

    for (const w of whales) {
      totalVol += w.usd_value;
      chainVol[w.chain] = (chainVol[w.chain] ?? 0) + w.usd_value;
      typeCounts[w.alert_type] = (typeCounts[w.alert_type] ?? 0) + 1;
    }

    const topChain =
      Object.entries(chainVol).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    const topType = (Object.entries(typeCounts).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0] ?? "transfer") as AlertType;

    return { totalVol, count: whales.length, topChain, topType };
  }, [whales]);

  const flows = useMemo(() => {
    const map: Record<string, { inflow: number; outflow: number }> = {};

    for (const w of whales) {
      if (w.to_label) {
        const label = normalizeLabel(w.to_label);
        if (!map[label]) map[label] = { inflow: 0, outflow: 0 };
        map[label].inflow += w.usd_value;
      }
      if (w.from_label) {
        const label = normalizeLabel(w.from_label);
        if (!map[label]) map[label] = { inflow: 0, outflow: 0 };
        map[label].outflow += w.usd_value;
      }
    }

    const entries: FlowEntry[] = Object.entries(map).map(
      ([label, { inflow, outflow }]) => ({
        label,
        inflow,
        outflow,
        net: inflow - outflow,
      })
    );

    return entries
      .filter((e) => e.net !== 0)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
      .slice(0, 6);
  }, [whales]);

  const maxAbs = useMemo(
    () => Math.max(...flows.map((f) => Math.abs(f.net)), 1),
    [flows]
  );

  const totalNet = useMemo(
    () => flows.reduce((sum, f) => sum + f.net, 0),
    [flows]
  );

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className="flex flex-col gap-0">
      {/* Stats summary row (from CrowsNest) */}
      <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] border-b border-[#1a3a5c]/40">
        <span className="text-slate-500">Vol</span>
        <span className="text-amber-200 font-semibold">
          {formatUsd(stats.totalVol)}
        </span>
        <span className="w-px h-3 bg-[#1a3a5c]/60" />
        <span className="text-slate-500">Alerts</span>
        <span className="text-amber-200 font-semibold">{stats.count}</span>
        <span className="w-px h-3 bg-[#1a3a5c]/60" />
        <span className="text-slate-500">Top</span>
        <span className="text-amber-200 font-semibold">
          {capitalize(stats.topChain)}
        </span>
        <span className="w-px h-3 bg-[#1a3a5c]/60" />
        <span className="text-amber-200 font-semibold">
          {ALERT_EMOJI[stats.topType]}{" "}
          {stats.topType.replace("_", " ")}
        </span>
      </div>

      {/* Tidal Flow */}
      {flows.length > 0 && (
        <div className="px-3 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <h3
              className="text-xs text-amber-100"
              style={{ fontFamily: "'Pirata One', cursive" }}
            >
              Tidal Flow
            </h3>
            <span className="text-[9px] text-slate-500">
              ← Out (Bull) | In (Bear) →
            </span>
          </div>

          <div className="flex flex-col gap-1">
            {flows.map((f) => {
              const pct = Math.abs(f.net) / maxAbs;
              const isInflow = f.net > 0;
              return (
                <div
                  key={f.label}
                  className="flex items-center gap-1.5 text-[10px]"
                >
                  <span className="w-16 truncate text-right text-slate-400">
                    {f.label}
                  </span>
                  <div className="flex-1 h-3 relative bg-[#0d1926] rounded-sm overflow-hidden">
                    {/* Center line */}
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#1a3a5c]/60" />
                    {/* Bar */}
                    <div
                      className={`absolute top-0 bottom-0 rounded-sm ${
                        isInflow
                          ? "bg-red-500/70"
                          : "bg-emerald-500/70"
                      }`}
                      style={
                        isInflow
                          ? {
                              left: "50%",
                              width: `${pct * 50}%`,
                            }
                          : {
                              right: "50%",
                              width: `${pct * 50}%`,
                            }
                      }
                    />
                  </div>
                  <span
                    className={`w-14 text-right font-mono ${
                      isInflow ? "text-red-400" : "text-emerald-400"
                    }`}
                  >
                    {isInflow ? "+" : ""}
                    {formatUsd(f.net)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Total net */}
          <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-[#1a3a5c]/30 text-[10px]">
            <span className="text-slate-500">Net Flow</span>
            <span
              className={`font-mono font-semibold ${
                totalNet > 0 ? "text-red-400" : "text-emerald-400"
              }`}
            >
              {totalNet > 0 ? "+" : ""}
              {formatUsd(totalNet)}
              {totalNet > 0 ? " ▼ Bearish" : " ▲ Bullish"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
