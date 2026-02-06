import { useMemo } from "react";
import { formatUsd } from "../lib/api";
import type { WhaleAlert, AlertType } from "../types/whale";
import { ALERT_EMOJI } from "../types/whale";

interface Props {
  whales: WhaleAlert[];
}

/** Compact live stats bar — the view from the crow's nest. */
export function CrowsNest({ whales }: Props) {
  const stats = useMemo(() => {
    if (whales.length === 0)
      return { totalVol: 0, count: 0, biggest: null as WhaleAlert | null, topChain: "—", topType: "transfer" as AlertType };

    let totalVol = 0;
    let biggest: WhaleAlert | null = null;
    const chainVol: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};

    for (const w of whales) {
      totalVol += w.usd_value;
      if (!biggest || w.usd_value > biggest.usd_value) biggest = w;
      chainVol[w.chain] = (chainVol[w.chain] ?? 0) + w.usd_value;
      typeCounts[w.alert_type] = (typeCounts[w.alert_type] ?? 0) + 1;
    }

    const topChain = Object.entries(chainVol).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    const topType = (Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "transfer") as AlertType;

    return { totalVol, count: whales.length, biggest, topChain, topType };
  }, [whales]);

  return (
    <div className="absolute bottom-4 left-4 z-20 flex items-center gap-4 bg-[#0a1628]/70 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-[#1a3a5c]/40 text-[11px]">
      <Stat label="Volume" value={formatUsd(stats.totalVol)} />
      <Sep />
      <Stat label="Alerts" value={String(stats.count)} />
      <Sep />
      <Stat
        label="Biggest"
        value={stats.biggest ? formatUsd(stats.biggest.usd_value) : "—"}
      />
      <Sep />
      <Stat label="Top Chain" value={capitalize(stats.topChain)} />
      <Sep />
      <Stat label="Top Type" value={`${ALERT_EMOJI[stats.topType]} ${stats.topType.replace("_", " ")}`} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center leading-tight">
      <span className="text-slate-500 text-[9px] uppercase tracking-wider">{label}</span>
      <span className="text-amber-200 font-semibold">{value}</span>
    </div>
  );
}

function Sep() {
  return <div className="w-px h-5 bg-[#1a3a5c]/60" />;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
